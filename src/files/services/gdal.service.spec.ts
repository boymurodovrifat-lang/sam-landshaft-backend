import { ConfigService } from '@nestjs/config';
import * as childProcess from 'child_process';
import { GdalService } from './gdal.service';

jest.mock('child_process', () => ({
  execFile: jest.fn((_bin, args, _options, cb: any) =>
    cb(null, {
      stdout: args.includes('VRT')
        ? '<VRTDataset rasterXSize="100" rasterYSize="100"></VRTDataset>'
        : '',
      stderr: '',
    }),
  ),
}));

describe('GdalService.cropBbox', () => {
  let svc: GdalService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new GdalService({
      get: jest.fn((_key, fallback) => fallback),
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
    expect(args[args.length - 1]).toBe('/vsistdout/');
    expect(
      (childProcess.execFile as unknown as jest.Mock).mock.calls[1][1].slice(
        -2,
      ),
    ).toEqual(['/in.tif', '/out.tif']);
  });
});

describe('GdalService.statsForBbox', () => {
  let svc: GdalService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new GdalService({
      get: jest.fn((_key, fallback) => fallback),
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
    // VRT dimension check, raster crop, then gdalinfo statistics.
    mock
      .mockImplementationOnce((_b: string, _a: string[], _o: any, cb: any) =>
        cb(null, {
          stdout:
            '<VRTDataset rasterXSize="100" rasterYSize="100"></VRTDataset>',
          stderr: '',
        }),
      )
      .mockImplementationOnce((_b: string, _a: string[], _o: any, cb: any) =>
        cb(null, { stdout: '', stderr: '' }),
      )
      .mockImplementationOnce((_b: string, _a: string[], _o: any, cb: any) =>
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
    expect(mock.mock.calls[2][0]).toBe('gdalinfo');
  });

  it('returns null fields when gdalinfo reports no stats', async () => {
    const mock = childProcess.execFile as unknown as jest.Mock;
    mock
      .mockImplementationOnce((_b: string, _a: string[], _o: any, cb: any) =>
        cb(null, {
          stdout:
            '<VRTDataset rasterXSize="100" rasterYSize="100"></VRTDataset>',
          stderr: '',
        }),
      )
      .mockImplementationOnce((_b: string, _a: string[], _o: any, cb: any) =>
        cb(null, { stdout: '', stderr: '' }),
      )
      .mockImplementationOnce((_b: string, _a: string[], _o: any, cb: any) =>
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

describe('GDAL resource limits', () => {
  const bbox = { minLng: 66, minLat: 39, maxLng: 67, maxLat: 40 };
  const config = new ConfigService({
    GDAL_MAX_CONCURRENT: 1,
    GDAL_TIMEOUT_MS: 1000,
    GDAL_MAX_CROP_PIXELS: 10000,
  });
  beforeEach(() => jest.clearAllMocks());
  it('rejects oversized crops before any raster output is written', async () => {
    const mock = childProcess.execFile as unknown as jest.Mock;
    mock.mockImplementationOnce((_b, _a, _o, cb) =>
      cb(null, {
        stdout:
          '<VRTDataset rasterXSize="100000" rasterYSize="100000"></VRTDataset>',
        stderr: '',
      }),
    );
    await expect(
      new GdalService(config).cropBbox('/in', '/out', bbox),
    ).rejects.toMatchObject({ status: 413 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('bounds concurrent processes and releases capacity after failure', async () => {
    const mock = childProcess.execFile as unknown as jest.Mock;
    let finish: any;
    mock.mockImplementationOnce((_b, _a, _o, cb) => {
      finish = cb;
    });
    const svc = new GdalService(config);
    const first = svc.getInfo('/in');
    await expect(svc.getInfo('/other')).rejects.toMatchObject({ status: 503 });
    finish(new Error('timeout'));
    await expect(first).rejects.toThrow();
    mock.mockImplementationOnce((_b, _a, _o, cb) =>
      cb(null, { stdout: '{"size":[1,1]}', stderr: '' }),
    );
    await expect(svc.getInfo('/in')).resolves.toMatchObject({ width: 1 });
    expect(mock.mock.calls[0][2]).toMatchObject({
      timeout: 1000,
      killSignal: 'SIGKILL',
    });
  });
});
