import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import { PrismaService } from '../prisma/prisma.service';
import { GdalService, type BboxLike } from './services/gdal.service';

export interface YearStatPoint {
  year: number;
  fileId: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  stdDev: number | null;
  validPixels: number;
}

export interface YearStatsResponse {
  categoryId: number;
  bbox: BboxLike;
  years: YearStatPoint[];
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadDir: string;
  private readonly cogDir: string;
  private readonly statsCache = new LRUCache<string, YearStatsResponse>({
    max: 100,
    ttl: 1000 * 60 * 30,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdal: GdalService,
    private readonly config: ConfigService,
  ) {
    this.uploadDir = path.resolve(
      this.config.get<string>('UPLOAD_DIR', './storage/uploads'),
    );
    this.cogDir = path.resolve(
      this.config.get<string>('COG_DIR', './storage/cog'),
    );
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.mkdir(this.cogDir, { recursive: true });
  }

  findAll(params?: { categoryId?: number; year?: number }) {
    const where: Record<string, unknown> = {};
    if (params?.categoryId) where.categoryId = params.categoryId;
    if (params?.year) where.year = params.year;

    return this.prisma.geotiffFile.findMany({
      where,
      include: { category: true },
      orderBy: [{ categoryId: 'asc' }, { year: 'asc' }],
    });
  }

  async findOne(id: number) {
    const file = await this.prisma.geotiffFile.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!file) throw new NotFoundException('Fayl topilmadi');
    return file;
  }

  /**
   * Multer disk storage'dan kelgan fayl bilan ishlash.
   * file.path — disk'dagi vaqtinchalik joy.
   */
  async uploadFromDisk(
    file: Express.Multer.File,
    categoryId: number,
    year: number,
  ) {
    await this.ensureDirs();

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      await fs.unlink(file.path).catch(() => {});
      throw new BadRequestException('Kategoriya topilmadi');
    }

    const existing = await this.prisma.geotiffFile.findUnique({
      where: { categoryId_year: { categoryId, year } },
    });
    if (existing) {
      await fs.unlink(file.path).catch(() => {});
      throw new BadRequestException(
        `Bu kategoriya va yil uchun fayl allaqachon mavjud (ID: ${existing.id}). Avval mavjudini o'chiring.`,
      );
    }

    const baseName = `${category.slug}_${year}_${Date.now()}`;
    const originalPath = path.join(this.uploadDir, `${baseName}.tif`);
    const cogPath = path.join(this.cogDir, `${baseName}_cog.tif`);

    // Multer yozgan faylni to'g'ri joyga ko'chirish
    if (file.path !== originalPath) {
      await fs.rename(file.path, originalPath).catch(async () => {
        // rename xatolik bersa (boshqa disk bo'lishi mumkin) — copy + delete
        await fs.copyFile(file.path, originalPath);
        await fs.unlink(file.path).catch(() => {});
      });
    }

    const fileSize = (await fs.stat(originalPath)).size;

    // COG konvertatsiya
    try {
      this.logger.log(`COG konvertatsiya boshlanmoqda: ${originalPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
      await this.gdal.toCog(originalPath, cogPath);
    } catch (err) {
      this.logger.error(`COG konvertatsiya xatolik: ${(err as Error).message}`);
      await fs.unlink(originalPath).catch(() => {});
      throw new BadRequestException(
        `GeoTIFF faylni COG formatiga o'girib bo'lmadi: ${(err as Error).message}`,
      );
    }

    // GeoTIFF ma'lumotlarini o'qish
    let info;
    try {
      info = await this.gdal.getInfo(cogPath);
    } catch (err) {
      this.logger.warn(`GeoTIFF info o'qib bo'lmadi: ${(err as Error).message}`);
    }

    const record = await this.prisma.geotiffFile.create({
      data: {
        categoryId,
        year,
        filename: file.originalname,
        cogPath,
        originalPath,
        fileSize: BigInt(fileSize),
        width: info?.width,
        height: info?.height,
        minX: info?.bounds.minX,
        minY: info?.bounds.minY,
        maxX: info?.bounds.maxX,
        maxY: info?.bounds.maxY,
      },
      include: { category: true },
    });

    // COG bir xil piksel ma'lumotni (lossless) saqlaydi — asl faylni o'chiramiz,
    // diskni ~2 barobar tejaymiz. Download COG'dan beriladi (getOriginalPath fallback).
    await fs.unlink(originalPath).catch(() => {});

    this.logger.log(`Fayl muvaffaqiyatli yuklandi: ${file.originalname} → COG (ID: ${record.id})`);
    return this.serializeFile(record);
  }

  async update(
    id: number,
    dto: { categoryId?: number; year?: number },
  ) {
    const existing = await this.findOne(id);
    const nextCategoryId = dto.categoryId ?? existing.categoryId;
    const nextYear = dto.year ?? existing.year;

    if (nextCategoryId !== existing.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: nextCategoryId },
      });
      if (!category) throw new BadRequestException('Kategoriya topilmadi');
      if (category.parentId == null) {
        throw new BadRequestException(
          "Fayl faqat subkategoriyaga bog'lanishi mumkin",
        );
      }
    }

    if (nextCategoryId !== existing.categoryId || nextYear !== existing.year) {
      const clash = await this.prisma.geotiffFile.findUnique({
        where: { categoryId_year: { categoryId: nextCategoryId, year: nextYear } },
      });
      if (clash && clash.id !== id) {
        throw new BadRequestException(
          `Bu kategoriya va yil uchun fayl allaqachon mavjud (ID: ${clash.id})`,
        );
      }
    }

    const updated = await this.prisma.geotiffFile.update({
      where: { id },
      data: {
        categoryId: nextCategoryId,
        year: nextYear,
      },
      include: { category: true },
    });
    return this.serializeFile(updated);
  }

  async remove(id: number) {
    const file = await this.findOne(id);
    try {
      await fs.unlink(file.cogPath).catch(() => {});
      await fs.unlink(file.originalPath).catch(() => {});
    } catch (err) {
      this.logger.warn(`Fayllarni o'chirishda xatolik: ${(err as Error).message}`);
    }
    await this.prisma.geotiffFile.delete({ where: { id } });
    return { success: true };
  }

  async getOriginalPath(id: number): Promise<{ path: string; filename: string }> {
    const file = await this.findOne(id);
    // Asl fayllar diskni tejash uchun o'chirilgan. COG bir xil piksel
    // ma'lumotni saqlaydi (lossless), shuning uchun asl yo'q bo'lsa COG beriladi.
    if (fsSync.existsSync(file.originalPath)) {
      return { path: file.originalPath, filename: file.filename };
    }
    return {
      path: file.cogPath,
      filename: `${file.category!.slug}_${file.year}.tif`,
    };
  }

  async getCogPath(id: number): Promise<{ path: string; filename: string }> {
    const file = await this.findOne(id);
    return {
      path: file.cogPath,
      filename: `${file.category!.slug}_${file.year}_cog.tif`,
    };
  }

  /**
   * BigInt → number konvertatsiya (JSON serialization uchun)
   */
  private serializeFile(record: any) {
    return {
      ...record,
      fileSize: Number(record.fileSize),
    };
  }

  /**
   * Crop a file's COG to a lon/lat bbox and write to a tmp .tif.
   * Caller is responsible for unlinking the returned path after streaming it.
   */
  async cropToTiff(
    id: number,
    bbox: BboxLike,
  ): Promise<{ path: string; filename: string }> {
    const file = await this.findOne(id);
    const tmpName = `crop_${id}_${crypto.randomBytes(6).toString('hex')}.tif`;
    const tmpPath = path.join(os.tmpdir(), tmpName);
    await this.gdal.cropBbox(file.cogPath, tmpPath, bbox);
    const base = file.filename.replace(/\.tiff?$/i, '');
    return { path: tmpPath, filename: `${base}_crop.tif` };
  }

  /**
   * Get per-year stats (min/max/mean/stdDev/validPixels) for the bbox
   * across every file in the category. Cached by (categoryId, bbox-quantised).
   */
  async getYearStats(
    categoryId: number,
    bbox: BboxLike,
  ): Promise<YearStatsResponse> {
    const q = (n: number) => Math.round(n * 10000) / 10000;
    const key = JSON.stringify({
      categoryId,
      b: [q(bbox.minLng), q(bbox.minLat), q(bbox.maxLng), q(bbox.maxLat)],
    });
    const cached = this.statsCache.get(key);
    if (cached) return cached;

    const files = await this.prisma.geotiffFile.findMany({
      where: { categoryId },
      orderBy: { year: 'asc' },
    });

    const points: YearStatPoint[] = [];
    for (const f of files) {
      try {
        const s = await this.gdal.statsForBbox(f.cogPath, bbox);
        const totalPixels = (f.width ?? 0) * (f.height ?? 0);
        const validPixels = Math.round(totalPixels * (s.validPercent / 100));
        points.push({
          year: f.year,
          fileId: f.id,
          min: s.min,
          max: s.max,
          mean: s.mean,
          stdDev: s.stdDev,
          validPixels,
        });
      } catch (err) {
        this.logger.warn(
          `Year stats failed for fileId=${f.id}: ${(err as Error).message}`,
        );
        points.push({
          year: f.year,
          fileId: f.id,
          min: null,
          max: null,
          mean: null,
          stdDev: null,
          validPixels: 0,
        });
      }
    }

    const out: YearStatsResponse = { categoryId, bbox, years: points };
    this.statsCache.set(key, out);
    return out;
  }
}
