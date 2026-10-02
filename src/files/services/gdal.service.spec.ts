import { ConfigService } from '@nestjs/config';
import * as childProcess from 'child_process';
import { GdalService } from './gdal.service';

jest.mock('child_process', () => ({
  execFile: jest.fn((_bin, _args, cb: any) =>
    cb(null, { stdout: '', stderr: '' }),
  ),
}));

describe('GdalService.cropBbox', () => {
  let svc: GdalService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new GdalService({
      get: jest.fn(() => 'gdal_translate'),
    } as unknown as ConfigService);
  });

  it('invokes gdal_translate with -projwin ulx uly lrx lry', async () => {
    await svc.cropBbox('/in.tif', '/out.tif', {
      minLng: 66.5,
      minLat: 39.2,
      maxLng: 67.5,
      maxLat: 40.0,
    });
    const call = (childProcess.execFile as unknown as jest.Mock).mock.calls[0];
    expect(call[0]).toBe('gdal_translate');
    const args: string[] = call[1];
    expect(args).toContain('-projwin');
    const projwinIdx = args.indexOf('-projwin');
    expect(args.slice(projwinIdx + 1, projwinIdx + 5)).toEqual([
      '66.5',
      '40',
      '67.5',
      '39.2',
    ]);
    expect(args[args.length - 2]).toBe('/in.tif');
    expect(args[args.length - 1]).toBe('/out.tif');
  });
});

describe('GdalService.statsForBbox', () => {
  let svc: GdalService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new GdalService({
      get: jest.fn(() => 'gdal_translate'),
    } as unknown as ConfigService);
  });

  it('parses computedMin/Max/Mean from gdalinfo -stats -json', async () => {
    const fakeJson = JSON.stringify({
      size: [1000, 1000],
      bands: [
        {
          statistics: {
            minimum: 0.1,
            maximum: 0.9,
            mean: 0.5,
            stdDev: 0.2,
          },
          metadata: { '': { STATISTICS_VALID_PERCENT: '75' } },
        },
      ],
    });
    const mock = childProcess.execFile as unknown as jest.Mock;
    // First call: gdal_translate (crop). Second call: gdalinfo -stats.
    mock
      .mockImplementationOnce((_b: string, _a: string[], cb: any) =>
        cb(null, { stdout: '', stderr: '' }),
      )
      .mockImplementationOnce((_b: string, _a: string[], cb: any) =>
        cb(null, { stdout: fakeJson, stderr: '' }),
      );
    const out = await svc.statsForBbox('/in.tif', {
      minLng: 66,
      minLat: 39,
      maxLng: 67,
      maxLat: 40,
    });
    expect(out).toEqual({
      min: 0.1,
      max: 0.9,
      mean: 0.5,
      stdDev: 0.2,
      validPercent: 75,
    });
    expect(mock.mock.calls[0][0]).toBe('gdal_translate');
    expect(mock.mock.calls[1][0]).toBe('gdalinfo');
  });

  it('returns null fields when gdalinfo reports no stats', async () => {
    const mock = childProcess.execFile as unknown as jest.Mock;
    mock
      .mockImplementationOnce((_b: string, _a: string[], cb: any) =>
        cb(null, { stdout: '', stderr: '' }),
      )
      .mockImplementationOnce((_b: string, _a: string[], cb: any) =>
        cb(null, { stdout: JSON.stringify({ bands: [{}] }), stderr: '' }),
      );
    const out = await svc.statsForBbox('/in.tif', {
      minLng: 66,
      minLat: 39,
      maxLng: 67,
      maxLat: 40,
    });
    expect(out).toEqual({
      min: null,
      max: null,
      mean: null,
      stdDev: null,
      validPercent: 0,
    });
  });
});
