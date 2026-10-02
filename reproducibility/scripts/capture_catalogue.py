"""Capture a public catalogue without server filesystem paths or credentials."""
import argparse
import datetime
import json
from pathlib import Path
import urllib.request


def capture(api_url):
    endpoint = api_url.rstrip('/') + '/files'
    with urllib.request.urlopen(endpoint, timeout=30) as response:
        data = json.load(response)
    if not isinstance(data, list):
        raise ValueError('Expected a list of files')
    records = []
    for item in data:
        category = item.get('category') or {}
        records.append({
            **{k: item.get(k) for k in ['id', 'categoryId', 'year', 'filename', 'fileSize', 'width', 'height', 'minX', 'minY', 'maxX', 'maxY']},
            'category': {k: category.get(k) for k in ['id', 'slug', 'name', 'unit', 'colorScheme', 'minValue', 'maxValue']},
            'cog_url': api_url.rstrip('/') + f'/files/{int(item["id"])}/cog',
        })
    records.sort(key=lambda x: (x['categoryId'], x['year']))
    return {'captured_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'api_url': api_url, 'layer_count': len(records),
            'data_bearing_category_count': len({x['categoryId'] for x in records}),
            'years': sorted({x['year'] for x in records}),
            'catalogue_fileSize_sum_bytes': sum(int(x['fileSize'] or 0) for x in records),
            'size_field_note': 'fileSize is the original upload size recorded at ingestion; it is not the HTTP Content-Range size of the retained COG.',
            'records': records}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--api-url', default='https://api.sam-landshaft.uz/api')
    p.add_argument('--output', required=True)
    a = p.parse_args()
    dest = Path(a.output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = capture(a.api_url)
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'{result["layer_count"]} layers; {result["data_bearing_category_count"]} categories')
