"""Check public Directus JPEG variants in memory; no CMS writes or API tokens."""

import io
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def run(products):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    results = []
    for product in products:
        images = sorted(product.get('images') or [], key=lambda image: (
            image.get('role') != 'card', image.get('sort') or 0))
        ids = list(dict.fromkeys([product.get('listing_file')] + [image.get('id') for image in images]))
        if not ids or any(not isinstance(value, str) or not re.fullmatch(
                r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', value, re.I) for value in ids):
            raise ValueError('Invalid public image IDs')
        files = []
        for image_id in ids[:10]:
            query = urllib.parse.urlencode({'width': 1600, 'height': 1600, 'fit': 'inside',
                                           'format': 'jpg', 'quality': 90})
            url = 'https://api.isvoi.ru/assets/' + image_id + '?' + query
            info = {'asset_id': image_id, 'ok': False}
            try:
                with opener.open(url, timeout=30) as response:
                    if response.status != 200:
                        raise ValueError('Unexpected HTTP status')
                    info['mime'] = response.headers.get_content_type()
                    body = response.read(25 * 1024 * 1024 + 1)
                if len(body) > 25 * 1024 * 1024 or info['mime'] != 'image/jpeg' or not body.startswith(b'\xff\xd8\xff'):
                    raise ValueError('JPEG MIME/bytes/size failed')
                with Image.open(io.BytesIO(body)) as image:
                    if image.format != 'JPEG':
                        raise ValueError('Decoded format is not JPEG')
                    image.load()
                    width, height = image.size
                if min(width, height) <= 0 or max(width, height) > 1600:
                    raise ValueError('Invalid transformed dimensions')
                info.update(ok=True, bytes=len(body), width=width, height=height)
            except urllib.error.HTTPError as error:
                info['code'] = 'http_' + str(error.code)
            except (urllib.error.URLError, TimeoutError, OSError, ValueError):
                info['code'] = 'jpeg_preflight_failed'
            files.append(info)
        results.append({'product_id': product.get('product_id'), 'images': files,
                        'ok': bool(files) and all(file['ok'] for file in files)})
    return {'ok': bool(results) and all(row['ok'] for row in results), 'products': results}


if __name__ == '__main__':
    try:
        result = run(json.load(sys.stdin))
        print(json.dumps(result, indent=2))
        sys.exit(0 if result['ok'] else 1)
    except Exception:
        print(json.dumps({'ok': False, 'code': 'image_preflight_failed'}))
        sys.exit(1)
