import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { diskStorage } from 'multer';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { parseBbox, BadBboxError } from './dto/crop-bbox.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Disk storage — katta fayllar (1 GB+) uchun buffer'dan emas, disk'dan o'qiladi
const upload = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = process.env.UPLOAD_DIR || './storage/uploads';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

@Controller('files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('year') year?: string,
  ) {
    return this.service.findAll({
      categoryId: categoryId ? Number(categoryId) : undefined,
      year: year ? Number(year) : undefined,
    });
  }

  // NOTE: `stats` must be declared BEFORE `:id` — otherwise Nest matches
  // `/files/stats` against `findOne` and parses `stats` as the id (NaN → 400).
  @Get('stats')
  async stats(
    @Query('categoryId') categoryIdRaw: string,
    @Query('bbox') bboxRaw: string,
  ) {
    const categoryId = Number(categoryIdRaw);
    if (!Number.isFinite(categoryId)) {
      throw new BadRequestException("categoryId raqam bo'lishi kerak");
    }
    try {
      const bbox = parseBbox(bboxRaw);
      return await this.service.getYearStats(categoryId, bbox);
    } catch (err: any) {
      if (err instanceof BadBboxError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: upload,
      limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ) {
    if (!file) throw new BadRequestException('Fayl berilmadi');
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.tif') && !name.endsWith('.tiff')) {
      // Disk'dagi faylni o'chirish
      fs.unlinkSync(file.path);
      throw new BadRequestException('Faqat .tif/.tiff fayllarni yuklash mumkin');
    }
    return this.service.uploadFromDisk(file, dto.categoryId, dto.year);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { categoryId?: number; year?: number },
  ) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Get(':id/download')
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: 'tiff' | 'cog' = 'tiff',
    @Res() res: Response,
  ) {
    const info =
      format === 'cog'
        ? await this.service.getCogPath(id)
        : await this.service.getOriginalPath(id);

    if (!fs.existsSync(info.path)) {
      throw new BadRequestException('Fayl server-da topilmadi');
    }

    const stat = fs.statSync(info.path);
    res.setHeader('Content-Type', 'image/tiff');
    res.setHeader('Content-Length', stat.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${info.filename}"`,
    );
    fs.createReadStream(info.path).pipe(res);
  }

  @Get(':id/cog')
  async streamCog(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const info = await this.service.getCogPath(id);
    if (!fs.existsSync(info.path)) {
      throw new BadRequestException('COG fayl topilmadi');
    }

    // COG files are immutable: id + mtime uniquely identifies content.
    // Aggressive caching lets browsers and Cloudflare serve repeat
    // requests from cache — animation scrubbing becomes instant on
    // the 2nd pass, and new visitors benefit from CDN edge hits.
    const stat = fs.statSync(info.path);
    const etag = `"${id}-${stat.size}-${stat.mtimeMs.toFixed(0)}"`;
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader('Content-Type', 'image/tiff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range, Accept-Ranges, Content-Length, ETag',
    );
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(info.path);
  }

  // Georaster probes for a `.ovr` sidecar overview file before every fetch.
  // We don't generate one (COG already has internal overviews), so return an
  // empty 204 instead of a 404 — keeps the browser console clean.
  @Get(':id/cog.ovr')
  cogOvrSidecar(@Res() res: Response) {
    res.status(204).end();
  }

  /**
   * Crop the file's COG to the given lon/lat bbox and stream a fresh GeoTIFF.
   * Tmp file is unlinked once the stream closes.
   */
  @Get(':id/crop')
  async crop(
    @Param('id', ParseIntPipe) id: number,
    @Query('bbox') bboxRaw: string,
    @Res() res: Response,
  ) {
    let bbox;
    try {
      bbox = parseBbox(bboxRaw);
    } catch (err: any) {
      throw new BadRequestException(err.message ?? 'bbox xato');
    }

    const out = await this.service.cropToTiff(id, bbox);
    if (!fs.existsSync(out.path)) {
      throw new BadRequestException(
        'Qirqilgan fayl yaratilmadi (hudud rasterdan tashqarida?)',
      );
    }

    res.setHeader('Content-Type', 'image/tiff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.filename}"`,
    );
    const stream = fs.createReadStream(out.path);
    const cleanup = () => fs.unlink(out.path, () => {});
    stream.on('close', cleanup);
    stream.on('error', cleanup);
    stream.pipe(res);
  }
}
