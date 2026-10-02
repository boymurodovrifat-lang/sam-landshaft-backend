"""Read a full-resolution pixel and compare its rounded value to the portal."""
import argparse
import json
import math
from pathlib import Path
import platform

import rasterio
import tifffile
from rasterio.warp import transform
from rasterio.windows import Window
from range_reader import RangeReader


def remote_pixel(source, lon, lat):
    # Inspect and decode just one base-resolution tile, using the same verified
    # urllib transport as the transfer script. No GDAL HTTPS CA workaround.
    with RangeReader(str(source)) as stream, tifffile.TiffFile(stream) as tif:
        page = tif.pages[0]
        if any(p.is_mask for p in tif.pages):
            raise ValueError('Remote files with internal masks require a local rasterio check')
        keys = list(page.tags[34735].value)
        geo = {keys[i]: keys[i + 3] for i in range(4, len(keys), 4)
               if keys[i + 1] == 0 and keys[i + 2] == 1}
        if geo.get(2048) != 4326 or geo.get(1025, 1) != 1:
            raise ValueError('Remote pixel check requires EPSG:4326 PixelIsArea; use a local file for other grids')
        if 34264 in page.tags or not page.is_tiled:
            raise ValueError('Remote pixel check requires a north-up tiled raster')
        sx, sy, _ = page.tags[33550].value
        i, j, _, x, y, _ = page.tags[33922].value[:6]
        if sx <= 0 or sy <= 0:
            raise ValueError('Invalid pixel scale')
        left, top = x - i * sx, y + j * sy
        col, row = math.floor((lon - left) / sx), math.floor((top - lat) / sy)
        if not (0 <= row < page.imagelength and 0 <= col < page.imagewidth):
            raise ValueError('Coordinate is outside the raster')
        index = (row // page.tilelength) * math.ceil(page.imagewidth / page.tilewidth) + col // page.tilewidth
        stream.seek(page.dataoffsets[index])
        decoded, _, _ = page.decode(stream.read(page.databytecounts[index]), index)
        if decoded is None:
            raise ValueError('Sparse/nodata tile')
        value = float(decoded[0, row % page.tilelength, col % page.tilewidth, 0])
        nodata_tag = page.tags.get(42113)
        if nodata_tag and value == float(nodata_tag.value):
            raise ValueError('Coordinate maps to nodata')
        return value, row, col, 'EPSG:4326'


def verify(source, lon, lat, portal_value, decimals=4):
    if str(source).startswith(('http://', 'https://')):
        native, row, col, crs = remote_pixel(source, lon, lat)
    else:
        with rasterio.open(source) as ds:
            if ds.crs is None:
                raise ValueError('Raster CRS is missing')
            xs, ys = transform('EPSG:4326', ds.crs, [lon], [lat])
            row, col = ds.index(xs[0], ys[0])
            if not (0 <= row < ds.height and 0 <= col < ds.width):
                raise ValueError('Coordinate is outside the raster')
            value = ds.read(1, window=Window(col, row, 1, 1), masked=True)
            if bool(value.mask.any()):
                raise ValueError('Coordinate maps to nodata')
            native, crs = float(value[0, 0]), str(ds.crs)
    if not math.isfinite(native):
        raise ValueError('Pixel is not finite')
    formatted = f'{native:.{decimals}f}'
    expected = f'{float(portal_value):.{decimals}f}'
    return {'source': str(source), 'longitude': lon, 'latitude': lat,
                'row': row, 'column': col, 'crs': crs,
                'native_value': native, 'formatted_value': formatted,
                'portal_value': str(portal_value), 'decimals': decimals,
                'matches_at_display_precision': formatted == expected,
                'python_version': platform.python_version(), 'rasterio_version': rasterio.__version__,
                'gdal_version': rasterio.__gdal_version__, 'tifffile_version': tifffile.__version__,
                'scope': 'One full-resolution band-1 pixel. Not field validation or proof of all pixel values.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source')
    p.add_argument('--lon', type=float, required=True)
    p.add_argument('--lat', type=float, required=True)
    p.add_argument('--portal-value', required=True)
    p.add_argument('--decimals', type=int, default=4)
    p.add_argument('--output', required=True)
    a = p.parse_args()
    if not 0 <= a.decimals <= 15:
        p.error('decimals must be between 0 and 15')
    r = verify(a.source, a.lon, a.lat, a.portal_value, a.decimals)
    dest = Path(a.output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(r, indent=2) + '\n')
    print('PASS' if r['matches_at_display_precision'] else 'FAIL')
    return 0 if r['matches_at_display_precision'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
