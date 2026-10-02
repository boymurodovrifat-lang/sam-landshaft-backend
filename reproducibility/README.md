# Sam-Landshaft research reproduction package

Prepared candidate: `v1.0.0-rc.1`. This package adds evaluation tools to the public application source. It is not a published GitHub release or an archived DOI record.

## Scope and inputs

The manuscript evaluates delivery of fixed environmental rasters; it does not validate satellite retrievals against field data. These scripts reproduce the tile-index calculation in Section 6.2, capture the catalogue, and check a full-resolution pixel against a displayed value. The input rasters are accessed separately from the public API, rather than embedded in Git.

The observed inputs on 2026-10-01 were NDSI 2025 (`/files/67/cog`) and LST 2025 (`/files/31/cog`) at `https://api.sam-landshaft.uz/api`. `reproduce.py` resolves the files by category slug and year so it does not assume IDs remain stable. Results include the observed ETag, Last-Modified, file byte length and a hash of the tile index. These identify an inspected revision but do not replace a full-file checksum or permanent data archive. URLs can change.

The sanitized catalogue snapshot has 144 layers, 24 data-bearing categories and years 2020–2025. The catalogue's `fileSize` field describes original upload size, not necessarily the retained COG's size. Use HTTP Content-Range for COG byte length.

## Install and reproduce

Use Python 3.12. The checked environment used Python 3.12.14, rasterio 1.5.2 with bundled GDAL 3.12.2, and tifffile 2026.9.20. Bundled GDAL here is separate from the application server's GDAL executable.

From the backend repository root:

```bash
python3 -m venv .venv-repro
. .venv-repro/bin/activate
python -m pip install -r reproducibility/requirements.txt
python -m unittest discover -s reproducibility/tests -v
python reproducibility/scripts/reproduce.py --output-dir reproducibility/results/new-run
python reproducibility/scripts/plot_transfer.py \
  reproducibility/results/new-run/ndsi-2025-transfer.json \
  reproducibility/results/new-run/lst-2025-transfer.json \
  --output reproducibility/results/new-run/transfer-cost.png
```

On Windows, activate with `.venv-repro\Scripts\activate` and put multiline commands on one line. The scripts inspect TIFF metadata using bounded HTTP Range requests and do not download the entire large rasters. A server that ignores Range is refused.

To inspect a local archived input or a pixel-edge window in its full-resolution grid:

```bash
python reproducibility/scripts/cog_transfer.py /path/to/NDSI_2025.tif \
  --native-resolution-m 10 --display-resolution-m 134 \
  --window 10000 9000 11000 10000 \
  --output reproducibility/results/local-window.json
```

If a URL is unavailable, run against a deposited local COG. Keep the existing report as historical evidence; do not claim a failed rerun produced it.

## What the transfer calculation measures

For each image IFD, the script sums compressed `TileByteCounts` for the selected tiles. Whole-region reports sum all imagery tiles at one level. It supports classic TIFF and BigTIFF, both endian orders, next-IFD and SubIFD pyramids and separate-band tiles; mask IFDs are excluded explicitly. It is an imagery-payload measure, not a COG conformance validator.

The script uses the coarsest available level whose approximate spacing does not exceed 134 m/pixel, using the manuscript's native 10 m and 30 m families. This assumption is recorded; a browser can choose a different level. Odd overview dimensions mean spacing ratios are approximate. Window costs conservatively include every intersecting tile.

Payload excludes mask data, headers, HTTP/TLS overhead, GDAL tile leaders/trailers, browser overfetch, retries and cache effects. Metadata HTTP bytes are measured separately. Consequently, summing TileByteCounts is deterministic for fixed inputs, but does not prove the exact browser network traffic or latency. GDAL documents the layout and additional bytes at https://gdal.org/en/stable/drivers/raster/cog.html.

## Pixel check (Section 6.1)

Figure 12(a) displays longitude 66.13495 and latitude 39.77712 and value -0.0882. These coordinates are rounded screenshot text, not a saved full-precision click record:

```bash
python reproducibility/scripts/verify_pixel.py \
  https://api.sam-landshaft.uz/api/files/67/cog \
  --lon 66.13495 --lat 39.77712 --portal-value=-0.0882 \
  --output reproducibility/results/new-run/pixel-check.json
```

For public EPSG:4326 PixelIsArea rasters, the script fetches and decodes only the native-resolution tile through verified HTTP Range requests; for local files it uses rasterio (including projected grids). Rotated/unsupported remote grids must be checked using a local input. The script reads band 1 at full resolution, records row/column and CRS, checks nodata, and compares the value at four decimal places. Exit code 1 means a mismatch. A screenshot rounding match is only a spot check. Figure 12(b) shows different rounded coordinates and pixel indices; do not treat the two screenshots as proof of the same grid cell without reconciling their locations. See `MANUSCRIPT_ALIGNMENT.md`.

## Application verification

The application source was checked with Node.js 24.19.0 and npm 11.9.0. The backend Prisma client was generated without changing a database. Commands:

```bash
# Backend
npm ci
npm run prisma:generate
npm run build
npm test -- --runInBand

# Frontend (in the companion repository)
npm ci
npm run build
npm test
```

Backend GDAL unit tests mock execution. These checks do not establish a full deployment, database migration, real-GDAL processing, browser usability or load performance. An operator must provision PostgreSQL and raster storage and follow the main README and DEPLOY.md for deployment. Do not seed or migrate a production database as part of research reproduction.

## Archiving data and code

Use `RELEASE_PREPARATION.md` to publish the candidate changes and a matched pair of source releases. Deposit fixed input COGs separately with permitted reuse terms and SHA-256 checksums; retain the outputs next to their input manifest. A code DOI does not archive the rasters. No DOI has been generated by this package.
