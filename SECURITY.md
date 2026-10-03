# Security hardening and operational requirements

Changes after the archived `v1.0.0-rc.2` version:

- Fail startup on missing, short or known-placeholder JWT signing secrets; accept HS256 only.
- Require explicit seed credentials. Existing passwords are never silently replaced;
  an explicit password-reset script is provided. Rotate the signing key to invalidate old sessions.
- Require the database-backed SUPER_ADMIN role for destructive file/category actions.
- Limit login to 5 requests/minute and public crop/statistics to 10/minute per endpoint/IP.
  COG range and regular download endpoints retain public access.
- Bind the native API to loopback by default and trust only a loopback reverse proxy.
- Bound GDAL subprocess concurrency (2), execution time (120 seconds; conversion 600 seconds),
  output buffer (8 MiB), threads (1), and cache (64 MiB) per process. Reject crops above
  50 million pixels by inspecting a VRT before materializing raster data.
- Reject empty, infinite and out-of-range bounding boxes. Restrict category slugs and use
  numeric category IDs/random bytes for storage filenames. Only GTiff input is decoded
  for COG conversion. Public JSON omits internal storage paths.
- Clean failed crops/conversions and interrupted crop downloads.
- Stop deployment on migration failure, preserve errors, use locked dependencies,
  validate signing configuration before migrations, and supply an initial migration.

These protections do not replace OS/DB hardening, TLS, backups, access monitoring,
GDAL security updates or disk quotas. Rate limits and GDAL concurrency are **per API
process**; multiple instances need a shared rate-limit store and a shared processing
queue or edge limits. GDAL timeout limits apply per subprocess, not to an entire
multi-year statistics request. Public download bandwidth needs hosting/edge controls.
The frontend still uses localStorage for its bearer token; protect against XSS and
apply a suitable frontend CSP. No production configuration or credentials were inspected.
See DEPLOY.md for safe migration baselining and existing password rotation.

The previous tagged version and DOI archive are historical artifacts and are not
rewritten by these source changes. Do not describe those archives as containing
this hardening. Historical measurements have not been rerun for the changed implementation.

## Verification

The security regression suite covers missing/default credentials, invalid bounding
boxes, crop pixel limits, process capacity release, HTTP login throttling, deletion
permissions, path traversal rejection and omission of storage paths. The HTTP tests
use a mock database and GDAL tests mock subprocess execution; they do not establish
that the production server is correctly configured. A real GDAL/database deployment
smoke test is still required by the operator before installation.
