import io
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
import rasterio
from rasterio.transform import from_origin
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from cog_transfer import inspect
from range_reader import RangeReader
from verify_pixel import verify


class TransferTests(unittest.TestCase):
    def test_classic_and_bigtiff_in_both_byte_orders(self):
        with tempfile.TemporaryDirectory() as tmp:
            for big in [False, True]:
                for order in ['<', '>']:
                    path = Path(tmp) / f'{big}{order}.tif'
                    tifffile.imwrite(path, np.arange(4096, dtype=np.float32).reshape(64, 64),
                                     tile=(16, 16), compression='deflate', bigtiff=big, byteorder=order)
                    full = inspect(path)
                    partial = inspect(path, [0, 0, 16, 16])
                    self.assertEqual(full['levels'][0]['tiles_in_level'], 16)
                    self.assertEqual(partial['levels'][0]['selected_tiles'], 1)
                    with tifffile.TiffFile(path) as tif:
                        self.assertEqual(partial['levels'][0]['selected_payload_bytes'], tif.pages[0].databytecounts[0])
                    self.assertLess(partial['levels'][0]['selected_payload_bytes'], full['levels'][0]['selected_payload_bytes'])

    def test_subifd_overviews_selection_and_mask_exclusion(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'pyramid.tif'
            with tifffile.TiffWriter(path) as tif:
                tif.write(np.ones((64, 64), dtype=np.uint8), tile=(16, 16), subifds=2)
                tif.write(np.ones((32, 32), dtype=np.uint8), tile=(16, 16), subfiletype=1)
                tif.write(np.ones((16, 16), dtype=np.uint8), tile=(16, 16), subfiletype=1)
                tif.write(np.ones((64, 64), dtype=bool), tile=(16, 16), subfiletype=4)
            r = inspect(path, native_resolution_m=10, display_resolution_m=25)
            self.assertEqual(len(r['levels']), 3)
            self.assertEqual(r['selected_level_for_display'], 1)
            self.assertEqual(r['levels'][0]['selected_payload_bytes'], 4096)

    def test_invalid_window_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'test.tif'
            tifffile.imwrite(path, np.zeros((32, 32), dtype=np.uint8), tile=(16, 16))
            with self.assertRaises(ValueError):
                inspect(path, [0, 0, 33, 32])


class PixelTests(unittest.TestCase):
    def test_value_rounding_nodata_and_outside(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'point.tif'
            data = np.array([[-0.0882198, -9999], [1, 2]], dtype=np.float32)
            with rasterio.open(path, 'w', driver='GTiff', width=2, height=2, count=1,
                               dtype='float32', crs='EPSG:4326', transform=from_origin(66, 40, .1, .1), nodata=-9999) as ds:
                ds.write(data, 1)
            self.assertTrue(verify(path, 66.05, 39.95, '-0.0882')['matches_at_display_precision'])
            self.assertFalse(verify(path, 66.05, 39.95, '-0.0883')['matches_at_display_precision'])
            with self.assertRaises(ValueError):
                verify(path, 66.15, 39.95, 0)
            with self.assertRaises(ValueError):
                verify(path, 70, 40, 0)


class RangeTests(unittest.TestCase):
    def setUp(self):
        payload = bytes(range(256)) * 600
        fixture = io.BytesIO()
        values = np.zeros((16, 16), dtype=np.float32)
        values[0, 0] = -0.0882198
        tifffile.imwrite(fixture, values, tile=(16, 16), compression='deflate', extratags=[
            (33550, 'd', 3, (.1, .1, 0), False),
            (33922, 'd', 6, (0, 0, 0, 66, 40, 0), False),
            (34735, 'H', 16, (1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326), False),
        ])
        tiff_payload = fixture.getvalue()
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == '/ignore':
                    self.send_response(200)
                    self.end_headers()
                    return
                body = tiff_payload if self.path == '/tiff' else payload
                first, last = map(int, self.headers['Range'][6:].split('-'))
                last = min(last, len(body)-1)
                self.send_response(206)
                self.send_header('Content-Range', f'bytes {first}-{last}/{len(body)}')
                self.send_header('ETag', 'fixture-v1')
                self.end_headers()
                self.wfile.write(body[first:last+1])
            def log_message(self, *_):
                pass
        self.payload = payload
        self.server = HTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_cross_block_seek_cache_and_eof(self):
        with RangeReader(self.url + '/data') as f:
            self.assertEqual(f.size, len(self.payload))
            f.seek(65530)
            self.assertEqual(f.read(20), self.payload[65530:65550])
            self.assertEqual(f.requests, 2)
            f.seek(0)
            f.read(10)
            self.assertEqual(f.requests, 2)
            f.seek(-10, io.SEEK_END)
            self.assertEqual(f.read(20), self.payload[-10:])

    def test_ignored_range_refused(self):
        with self.assertRaises(ValueError):
            RangeReader(self.url + '/ignore')

    def test_remote_pixel_decodes_the_native_tile(self):
        r = verify(self.url + '/tiff', 66.05, 39.95, '-0.0882')
        self.assertTrue(r['matches_at_display_precision'])
        self.assertEqual((r['row'], r['column']), (0, 0))


if __name__ == '__main__':
    unittest.main()
