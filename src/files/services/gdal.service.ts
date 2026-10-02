import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

  constructor(private readonly config: ConfigService) {}

  /**
   * Convert input GeoTIFF to Cloud Optimized GeoTIFF (COG)
   */
  async toCog(inputPath: string, outputPath: string): Promise<void> {
    const bin = this.config.get<string>('GDAL_BIN', 'gdal_translate');
    const args = [
      '-of', 'COG',
      '-co', 'COMPRESS=DEFLATE',
      '-co', 'OVERVIEW_RESAMPLING=AVERAGE',
      '-co', 'BLOCKSIZE=512',
      inputPath,
      outputPath,
    ];

    this.logger.log(`Converting ${inputPath} to COG...`);
    try {
      await execFileAsync(bin, args);
      this.logger.log(`COG created: ${outputPath}`);
    } catch (err: any) {
      this.logger.error(`COG conversion failed: ${err.message}`);
      throw new Error(`COG conversion failed: ${err.message}`);
    }
  }

  /**
   * Read basic info about a GeoTIFF using gdalinfo
   */
  async getInfo(path: string): Promise<GeotiffInfo> {
    try {
      const { stdout } = await execFileAsync('gdalinfo', ['-json', path]);
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
      await execFileAsync(bin, args);
    } catch (err: any) {
      this.logger.error(`Crop failed: ${err.message}`);
      throw new Error(`Crop failed: ${err.message}`);
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
      await execFileAsync('gdal_translate', [
        '-q',
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
      const { stdout } = await execFileAsync('gdalinfo', [
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
      const pick = (
        a: unknown,
        b: unknown,
        c: unknown,
      ): number | null => {
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
      this.logger.error(`statsForBbox failed: ${err.message}`);
      throw new Error(`statsForBbox failed: ${err.message}`);
    } finally {
      // Cleanup tmp file (and the gdalinfo-generated .aux.xml sidecar).
      await fs.promises.unlink(tmpPath).catch(() => {});
      await fs.promises.unlink(`${tmpPath}.aux.xml`).catch(() => {});
    }
  }
}
