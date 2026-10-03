import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseBbox } from '../dto/crop-bbox.dto';

const execFileAsync = promisify(execFile);

export interface GeotiffInfo {
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  bands: number;
}

export interface BboxLike {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface BboxStats {
  min: number | null;
  max: number | null;
  mean: number | null;
  stdDev: number | null;
  validPercent: number;
}

@Injectable()
export class GdalService {
  private readonly logger = new Logger(GdalService.name);

  private active = 0;

  constructor(private readonly config: ConfigService) {}

  private limit(name: string, fallback: number): number {
    const value = Number(this.config.get(name, fallback));
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`Invalid ${name}`);
    return value;
  }

  private async run(bin: string, args: string[], conversion = false) {
    if (this.active >= this.limit('GDAL_MAX_CONCURRENT', 2)) {
      throw new ServiceUnavailableException(
        'Raster processing is busy. Retry later.',
      );
    }
    this.active++;
    try {
      return await execFileAsync(bin, args, {
        timeout: this.limit(
          conversion ? 'GDAL_CONVERT_TIMEOUT_MS' : 'GDAL_TIMEOUT_MS',
          conversion ? 600000 : 120000,
        ),
        killSignal: 'SIGKILL',
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          GDAL_NUM_THREADS: '1',
          GDAL_CACHEMAX: '64',
          GDAL_PAM_ENABLED: 'NO',
        },
      });
    } finally {
      this.active--;
    }
  }

  private async checkCrop(inputPath: string, bbox: BboxLike): Promise<void> {
    try {
      parseBbox([bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].join(','));
    } catch {
      throw new BadRequestException('Invalid geographic bounding box');
    }
    // A VRT describes the exact projected output dimensions without writing raster pixels.
    const { stdout } = await this.run(
      this.config.get<string>('GDAL_BIN', 'gdal_translate'),
      [
        '-of',
        'VRT',
        '-eco',
        '-projwin',
        String(bbox.minLng),
        String(bbox.maxLat),
        String(bbox.maxLng),
        String(bbox.minLat),
        '-projwin_srs',
        'EPSG:4326',
        inputPath,
        '/vsistdout/',
      ],
    );
    const header = stdout.match(/<VRTDataset\s[^>]*>/)?.[0] ?? '';
    const width = Number(header.match(/rasterXSize="(\d+)"/)?.[1]);
    const height = Number(header.match(/rasterYSize="(\d+)"/)?.[1]);
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new BadRequestException('Could not determine crop dimensions');
    }
    if (width * height > this.limit('GDAL_MAX_CROP_PIXELS', 50000000)) {
      throw new PayloadTooLargeException(
        'Selected region is too large. Choose a smaller region.',
      );
    }
  }

  /**
   * Convert input GeoTIFF to Cloud Optimized GeoTIFF (COG)
   */
  async toCog(inputPath: string, outputPath: string): Promise<void> {
    const bin = this.config.get<string>('GDAL_BIN', 'gdal_translate');
    const args = [
      '-if',
      'GTiff',
      '-of',
      'COG',
      '-co',
      'COMPRESS=DEFLATE',
      '-co',
      'OVERVIEW_RESAMPLING=AVERAGE',
      '-co',
      'BLOCKSIZE=512',
      inputPath,
      outputPath,
    ];

    this.logger.log(`Converting ${inputPath} to COG...`);
    try {
      await this.run(bin, args, true);
      this.logger.log(`COG created: ${outputPath}`);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`COG conversion failed: ${err.message}`);
      throw new BadRequestException('GeoTIFF conversion failed');
    }
  }

  /**
   * Read basic info about a GeoTIFF using gdalinfo
   */
  async getInfo(path: string): Promise<GeotiffInfo> {
    try {
      const { stdout } = await this.run('gdalinfo', ['-json', path]);
      const info = JSON.parse(stdout);

      const corners = info.cornerCoordinates ?? {};
      const ul = corners.upperLeft ?? [0, 0];
      const lr = corners.lowerRight ?? [0, 0];

      return {
        width: info.size?.[0] ?? 0,
        height: info.size?.[1] ?? 0,
        bounds: {
          minX: Math.min(ul[0], lr[0]),
          minY: Math.min(ul[1], lr[1]),
          maxX: Math.max(ul[0], lr[0]),
          maxY: Math.max(ul[1], lr[1]),
        },
        bands: info.bands?.length ?? 1,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`gdalinfo failed: ${err.message}`);
      throw new Error(`Failed to read GeoTIFF info: ${err.message}`);
    }
  }

  /**
   * Crop GeoTIFF to a lon/lat bbox via gdal_translate -projwin.
   * Output is a plain compressed GeoTIFF (not COG) — cropped region is small.
   */
  async cropBbox(
    inputPath: string,
    outputPath: string,
    bbox: BboxLike,
  ): Promise<void> {
    const bin = this.config.get<string>('GDAL_BIN', 'gdal_translate');
    const args = [
      '-projwin',
      String(bbox.minLng),
      String(bbox.maxLat),
      String(bbox.maxLng),
      String(bbox.minLat),
      '-projwin_srs',
      'EPSG:4326',
      '-co',
      'COMPRESS=DEFLATE',
      inputPath,
      outputPath,
    ];
    this.logger.log(`Cropping ${inputPath} bbox=${JSON.stringify(bbox)}`);
    try {
      await this.checkCrop(inputPath, bbox);
      await this.run(bin, args);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Crop failed: ${err.message}`);
      throw new BadRequestException('Raster crop failed');
    }
  }

  /**
   * Compute per-bbox stats.
   *
   * GDAL 3.9+ supports `gdalinfo -projwin` directly. Earlier versions
   * (3.8.x on Debian 12) don't — so we first crop the bbox into a tmp
   * GTiff via `gdal_translate -projwin` and run `gdalinfo -stats -json`
   * against that. Tmp file is unlinked at the end.
   */
  async statsForBbox(inputPath: string, bbox: BboxLike): Promise<BboxStats> {
    const tmpPath = path.join(
      os.tmpdir(),
      `stats_${Date.now()}_${Math.random().toString(36).slice(2)}.tif`,
    );
    try {
      // 1. Crop to tmp file.
      await this.checkCrop(inputPath, bbox);
      await this.run(this.config.get<string>('GDAL_BIN', 'gdal_translate'), [
        '-q',
        '-co',
        'COMPRESS=DEFLATE',
        '-projwin',
        String(bbox.minLng),
        String(bbox.maxLat),
        String(bbox.maxLng),
        String(bbox.minLat),
        '-projwin_srs',
        'EPSG:4326',
        inputPath,
        tmpPath,
      ]);

      // 2. Read stats from the cropped file.
      const { stdout } = await this.run('gdalinfo', [
        '-stats',
        '-json',
        tmpPath,
      ]);
      const info = JSON.parse(stdout);
      const band = info.bands?.[0] ?? {};
      // GDAL 3.9+ nests these under band.statistics, 3.8 puts them
      // directly on the band, and STATISTICS_* metadata is a fallback.
      const s = band.statistics ?? {};
      const m = band.metadata?.[''] ?? {};
      const pick = (a: unknown, b: unknown, c: unknown): number | null => {
        for (const v of [a, b, c]) {
          if (typeof v === 'number' && Number.isFinite(v)) return v;
          if (typeof v === 'string') {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
          }
        }
        return null;
      };
      const validPercentRaw = Number(m.STATISTICS_VALID_PERCENT ?? 0);
      return {
        min: pick(s.minimum, band.minimum, m.STATISTICS_MINIMUM),
        max: pick(s.maximum, band.maximum, m.STATISTICS_MAXIMUM),
        mean: pick(s.mean, band.mean, m.STATISTICS_MEAN),
        stdDev: pick(s.stdDev, band.stdDev, m.STATISTICS_STDDEV),
        validPercent: Number.isFinite(validPercentRaw) ? validPercentRaw : 0,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`statsForBbox failed: ${err.message}`);
      throw new BadRequestException('Raster statistics failed');
    } finally {
      // Cleanup tmp file (and the gdalinfo-generated .aux.xml sidecar).
      await fs.promises.unlink(tmpPath).catch(() => {});
      await fs.promises.unlink(`${tmpPath}.aux.xml`).catch(() => {});
    }
  }
}
