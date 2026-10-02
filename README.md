# Sam-Landshaft Backend

NestJS + Prisma + PostgreSQL backend for the Sam-Landshaft geoportal (Samarqand viloyati landshaft xaritalari).

## Features

- Admin authentication (JWT)
- Categories CRUD
- GeoTIFF upload with automatic COG (Cloud Optimized GeoTIFF) conversion via GDAL
- COG streaming with HTTP Range Requests (for Leaflet + georaster)
- GeoTIFF and COG download endpoints; downloads fall back to the COG when the original uploaded GeoTIFF is no longer stored
- Bounding-box crop and per-year statistics endpoints

## Requirements

- Node.js 22+
- PostgreSQL 16+ (with PostGIS)
- GDAL 3.4+ (for `gdal_translate`, `gdalinfo`)
- FFmpeg (for video generation later)

Install GDAL on macOS: `brew install gdal`
Install GDAL on Ubuntu: `sudo apt install gdal-bin`

## Setup

Prepare PostgreSQL with a database and user matching `DATABASE_URL` in `.env`. Database provisioning instructions are in [`DEPLOY.md`](DEPLOY.md). This repository does not include the parent project's Docker Compose file, so `docker compose up -d postgres` cannot be run from this checkout alone.

```bash
# 1. Clone and install the locked dependencies
git clone https://github.com/boymurodovrifat-lang/sam-landshaft-backend.git
cd sam-landshaft-backend
npm ci

# 2. Configure the database, storage, CORS and local seed account
cp .env.example .env

# 3. Generate the client, create the schema in your local database and seed
npm run prisma:generate
npx prisma db push
npm run prisma:seed

# 4. Run dev
npm run start:dev
```

API will be available at http://localhost:3000/api

## Default admin

- Email: `admin@sam-landshaft.uz`
- Password: `ChangeMe123!`

## Endpoints

### Auth
- `POST /api/auth/login` — { email, password } → { accessToken, admin }
- `GET /api/auth/me` — (Bearer token) → current admin

### Categories
- `GET /api/categories` — list
- `GET /api/categories/:id`
- `POST /api/categories` (auth)
- `PATCH /api/categories/:id` (auth)
- `DELETE /api/categories/:id` (auth)

### Files
- `GET /api/files?categoryId=&year=` — list
- `GET /api/files/:id`
- `POST /api/files/upload` (auth, multipart: file, categoryId, year)
- `DELETE /api/files/:id` (auth)
- `GET /api/files/:id/download?format=tiff|cog`
- `GET /api/files/:id/cog` — streams COG with Range support for Leaflet
- `GET /api/files/:id/crop?bbox=minLng,minLat,maxLng,maxLat` — crops a COG to a GeoTIFF
- `GET /api/files/stats?categoryId=&bbox=minLng,minLat,maxLng,maxLat` — returns statistics across available years
- `PATCH /api/files/:id` (auth) — changes a file's category or year

## Storage layout

```
storage/
├── uploads/   # Incoming GeoTIFF files; originals are removed after successful COG conversion
├── cog/       # Cloud Optimized GeoTIFF (for serving)
└── videos/    # Generated animation videos
```

The COG is the retained raster after a successful upload. The download endpoint can return this file using a `.tif` filename; it is not a byte-for-byte copy of the original upload.

## Verification

```bash
npm run prisma:generate
npm run build
npm test -- --runInBand
```

The unit tests cover bounding-box validation and GDAL command construction/statistics parsing. They mock GDAL execution and do not validate real raster processing, a running database, or the experiments reported in the paper.

## Research and reproducibility

Pair this backend with the [frontend](https://github.com/boymurodovrifat-lang/sam-landshaft-frontend). Record the full commit SHA of each repository (`git rev-parse HEAD`) and the Node.js, PostgreSQL and GDAL versions used. For a publication, identify a matching tagged release of both repositories.

This repository contains application code and a database schema. It does not include the study rasters or a complete workflow to reproduce the paper's experiments. Supply the input-data sources and access instructions, preprocessing and evaluation scripts, experiment settings, and expected results separately. Category seed values are configuration examples and do not establish the provenance or validity of study data.

## License and attribution

Original implementation: Diyorbek Olimov (`diyorbek0309`). Source baseline: [original backend](https://github.com/diyorbek0309/sam-landshaft-backend), commit `407316df1377f95aad9d75239c9555ec130a94e3`. Repository hosting, paper authorship and software authorship are distinct.

An open-source license has not yet been adopted by the rights holders. Public source access does not itself grant reuse rights. The original UNLICENSED status is retained pending agreement. Dataset and third-party asset reuse terms remain separate.

## Paper reproduction

See [`reproducibility/README.md`](reproducibility/README.md) for evaluation scripts, observed inputs and results, and [`reproducibility/MANUSCRIPT_ALIGNMENT.md`](reproducibility/MANUSCRIPT_ALIGNMENT.md) for unresolved differences from the supplied manuscript. The matched `v1.0.0-rc.1` review releases and evaluation package are archived in Zenodo: [DOI 10.5281/zenodo.23101499](https://doi.org/10.5281/zenodo.23101499). Source licensing remains pending rights-holder agreement; public access and DOI registration do not establish a complete reproducibility claim.
