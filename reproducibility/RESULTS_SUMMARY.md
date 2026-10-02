# Checked results — 2026-10-01

These are measurements of the currently served files, not reconstructed historical browser traces.

| Layer | COG bytes | COG MiB | Whole-region payload bytes | Payload MiB | Fraction | Metadata bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| NDSI 2025 | 911,893,956 | 869.64985 | 11,776,888 | 11.23132 | 1.29148% | 65,536 |
| LST 2025 | 71,688,720 | 68.36769 | 4,880,057 | 4.65399 | 6.80729% | 65,536 |

NDSI has 7 imagery levels and 2,093 tiles in total. At native resolution it has 1,560 tiles. The 80 m-family overview needs 11.23132 MiB (1.29148%); the next coarser level needs 2.81382 MiB (0.32356%). This reproduces the manuscript's rounded NDSI payload/fraction when its size units are interpreted as MiB, not decimal MB.

LST has 6 imagery levels. The current input does not reproduce the historical 70.1 / 4.68 / 6.68% figures. The current retained COG size must not be replaced with the catalogue's original upload-size field. Preserve the exact old input if retaining the historical result, or revise the manuscript using a frozen current input.

Each transfer script fetched one 65,536-byte (64 KiB) metadata block for these current files. Actual browser initialization requests are a separate measurement.

Application checks: frontend 9 tests passed; backend 9 tests passed; research scripts 7 tests passed. Both application builds passed. Real database deployment, full GDAL ingestion, browser usability, field validity and concurrency were not verified.

The generated figure depicts whole-level compressed payloads, not a measured browser session. Dashed horizontal lines show full file sizes; the dotted vertical line marks the manuscript's 134 m/pixel display target.

## Pixel spot check

At the rounded portal screenshot coordinate (66.13495 E, 39.77712 N), the current NDSI raster gives row 9407, column 10892 and value -0.08815359324216843, which rounds to -0.0882. This passes the portal display-precision check. The QGIS screenshot shows row 9419, column 10858 and -0.0882198, so its point is a different cell. The screenshots must be aligned before claiming the same pixel was checked.
