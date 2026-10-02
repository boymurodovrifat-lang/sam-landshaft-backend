"""Sum TIFF TileByteCounts per level/window; report payload, not browser traffic."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import platform

import tifffile
from range_reader import RangeReader


def inspect(source, window=None, native_resolution_m=None, display_resolution_m=None):
    remote = str(source).startswith(('https://', 'http://'))
    stream = RangeReader(str(source)) if remote else open(source, 'rb')
    size = stream.size if remote else Path(source).stat().st_size
    try:
        with tifffile.TiffFile(stream) as tif:
            pages = []
            seen = set()
            def visit(page):
                if page.offset in seen:
                    return
                seen.add(page.offset)
                if not page.is_mask:
                    pages.append(page)
                if page.pages is not None:
                    for child in page.pages:
                        visit(child)
            for page in tif.pages:
                visit(page)
            pages.sort(key=lambda p: p.imagewidth * p.imagelength, reverse=True)
            if not pages:
                raise ValueError('No image IFDs found')
            base_w, base_h = pages[0].imagewidth, pages[0].imagelength
            if window is not None:
                x0, y0, x1, y1 = window
                if not (0 <= x0 < x1 <= base_w and 0 <= y0 < y1 <= base_h):
                    raise ValueError('Window must lie inside the full-resolution image')
            levels = []
            signature = []
            for level, page in enumerate(pages):
                if not page.is_tiled:
                    raise ValueError('Expected tiled TIFF; strip-based TIFF is unsupported')
                w, h, tw, th = page.imagewidth, page.imagelength, page.tilewidth, page.tilelength
                nx, ny = math.ceil(w / tw), math.ceil(h / th)
                counts, offsets = list(map(int, page.databytecounts)), list(map(int, page.dataoffsets))
                planes = page.samplesperpixel if int(page.planarconfig) == 2 else 1
                if len(counts) != nx * ny * planes or len(offsets) != len(counts):
                    raise ValueError('Unexpected tile index layout')
                if any(n < 0 or off < 0 or off + n > size for off, n in zip(offsets, counts)):
                    raise ValueError('Tile index extends outside file')
                x0, y0, x1, y1 = window or (0, 0, base_w, base_h)
                # Scale the full-resolution pixel-edge window conservatively.
                lx0, ly0 = math.floor(x0 * w / base_w), math.floor(y0 * h / base_h)
                lx1, ly1 = math.ceil(x1 * w / base_w), math.ceil(y1 * h / base_h)
                chosen = [plane * nx * ny + row * nx + col
                          for plane in range(planes)
                          for row in range(ly0 // th, math.ceil(ly1 / th))
                          for col in range(lx0 // tw, math.ceil(lx1 / tw))]
                payload = sum(counts[i] for i in chosen)
                factor = max(base_w / w, base_h / h)
                levels.append({
                    'level': level, 'width': w, 'height': h, 'tile_width': tw, 'tile_height': th,
                    'compression': page.compression.name, 'tiles_in_level': len(counts),
                    'selected_tiles': len(chosen), 'whole_level_payload_bytes': sum(counts),
                    'selected_payload_bytes': payload, 'payload_MB_decimal': payload / 1e6,
                    'payload_MiB': payload / 2**20, 'payload_percent_of_file': payload / size * 100,
                    'downsample_factor': factor,
                    'approx_resolution_m': factor * native_resolution_m if native_resolution_m else None,
                })
                signature.append({'width': w, 'height': h, 'offsets': offsets, 'counts': counts})
        selected = None
        if display_resolution_m is not None:
            if not native_resolution_m or display_resolution_m <= 0:
                raise ValueError('Positive native resolution is required for display selection')
            eligible = [r for r in levels if r['approx_resolution_m'] <= display_resolution_m]
            if not eligible:
                raise ValueError('Display resolution is finer than the native level')
            selected = max(eligible, key=lambda r: r['approx_resolution_m'])['level']
        return {
            'source': str(source), 'file_bytes': size, 'file_MB_decimal': size / 1e6,
            'file_MiB': size / 2**20, 'full_resolution_window': window,
            'selected_level_for_display': selected, 'levels': levels,
            'tile_index_sha256': hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest(),
            'metadata_http_requests': stream.requests if remote else None,
            'metadata_http_bytes': stream.metadata_bytes if remote else None,
            'etag': stream.etag if remote else None,
            'last_modified': stream.last_modified if remote else None,
            'python_version': platform.python_version(), 'tifffile_version': tifffile.__version__,
            'scope': 'Compressed imagery tile payload only; masks, headers, HTTP overhead, overfetch, caches and rendering time excluded.',
        }
    finally:
        stream.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', help='Local tiled TIFF/BigTIFF or public HTTP Range URL')
    p.add_argument('--window', nargs=4, type=int, metavar=('X0', 'Y0', 'X1', 'Y1'))
    p.add_argument('--native-resolution-m', type=float)
    p.add_argument('--display-resolution-m', type=float)
    p.add_argument('--output', required=True)
    p.add_argument('--csv')
    a = p.parse_args()
    report = inspect(a.source, a.window, a.native_resolution_m, a.display_resolution_m)
    target = Path(a.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + '\n')
    if a.csv:
        dest = Path(a.csv)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open('w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=report['levels'][0].keys(), lineterminator='\n')
            writer.writeheader()
            writer.writerows(report['levels'])
    print(f'Wrote {target}; {len(report["levels"])} image levels')


if __name__ == '__main__':
    main()
