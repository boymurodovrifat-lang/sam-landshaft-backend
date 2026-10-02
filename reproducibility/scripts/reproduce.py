"""Re-run paper Section 6.2 against the currently served NDSI/LST 2025 COGs."""
import argparse
import json
from pathlib import Path

from capture_catalogue import capture
from cog_transfer import inspect


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--api-url', default='https://api.sam-landshaft.uz/api')
    p.add_argument('--output-dir', default='reproducibility/results/new-run')
    a = p.parse_args()
    out = Path(a.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    catalogue = capture(a.api_url)
    (out / 'catalogue.json').write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + '\n')
    reports = {}
    for slug, spacing in [('ndsi', 10), ('lst', 30)]:
        matches = [r for r in catalogue['records'] if r['category']['slug'] == slug and r['year'] == 2025]
        if len(matches) != 1:
            raise ValueError(f'Expected one {slug.upper()} 2025 layer; found {len(matches)}')
        r = inspect(matches[0]['cog_url'], native_resolution_m=spacing, display_resolution_m=134)
        r['catalogue_file_id'] = matches[0]['id']
        r['catalogue_original_upload_size_bytes'] = matches[0]['fileSize']
        reports[slug] = r
        (out / f'{slug}-2025-transfer.json').write_text(json.dumps(r, indent=2) + '\n')
    print('Reproduced tile-payload calculation. Outputs:', out)
    for slug, r in reports.items():
        level = r['levels'][r['selected_level_for_display']]
        print(f'{slug.upper()}: file {r["file_MiB"]:.2f} MiB; '
              f'view {level["payload_MiB"]:.2f} MiB; '
              f'{level["payload_percent_of_file"]:.2f}%; metadata {r["metadata_http_bytes"]} bytes')


if __name__ == '__main__':
    main()
