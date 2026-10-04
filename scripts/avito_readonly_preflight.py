"""Run on Beget via SSH stdin; never publishes or changes marketplace settings."""

import argparse
import datetime
import json
import os
import pathlib
import re
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


STATUSES = ('active', 'removed', 'old', 'blocked', 'rejected')
KEYS = ('AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET', 'AVITO_USER_ID')


class PreflightError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_credentials():
    path = pathlib.Path('/home/deploy/.config/isvoi/avito.env')
    for directory in (path.parent.parent, path.parent):
        if directory.is_symlink() or not directory.is_dir() or directory.stat().st_uid != os.getuid():
            raise PreflightError('credential_directory_invalid')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise PreflightError('credential_file_permissions_invalid')
    if stat.S_IMODE(path.parent.stat().st_mode) != 0o700:
        raise PreflightError('credential_directory_permissions_invalid')
    data = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        key, separator, value = line.partition('=')
        if not separator or key not in KEYS or key in data:
            raise PreflightError('credential_file_fields_invalid')
        data[key] = value
    if set(data) != set(KEYS):
        raise PreflightError('credential_file_fields_invalid')
    if not re.fullmatch(r'[A-Za-z0-9_.-]{4,200}', data[KEYS[0]]):
        raise PreflightError('client_id_format_invalid')
    if not re.fullmatch(r'[A-Za-z0-9_+/=.-]{8,512}', data[KEYS[1]]):
        raise PreflightError('client_secret_format_invalid')
    if not re.fullmatch(r'[1-9][0-9]{0,18}', data[KEYS[2]]):
        raise PreflightError('user_id_format_invalid')
    return data


class AvitoReader:
    def __init__(self, credentials):
        self.credentials = credentials
        self.token = None
        self.token_deadline = 0
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, path, data=None):
        if data is not None and path != '/token':
            raise PreflightError('marketplace_write_forbidden')
        allowed = (path in ('/token', '/core/v1/accounts/self', '/autoload/v2/profile',
                            '/autoload/v1/user-docs/tree')
                   or re.fullmatch(r'/core/v1/items\?status=active%2Cremoved%2Cold%2Cblocked%2Crejected&per_page=50&page=[1-9][0-9]*', path)
                   or re.fullmatch(r'/core/v1/accounts/' + self.credentials[KEYS[2]] + r'/items/[1-9][0-9]*/', path)
                   or re.fullmatch(r'/autoload/v1/user-docs/node/[A-Za-z0-9_-]+/fields', path))
        allowed = allowed or bool(
            re.fullmatch(r'/autoload/v2/items/ad_ids\?query=[1-9][0-9]{0,18}(?:%2C[1-9][0-9]{0,18}){0,49}', path)
            or re.fullmatch(r'/autoload/v2/items/avito_ids\?query=isvoi-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
                            r'(?:%2Cisvoi-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}){0,2}', path))
        if not allowed:
            raise PreflightError('endpoint_not_allowlisted')
        headers = {'Accept': 'application/json'}
        if data is not None:
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        else:
            if not self.token or time.monotonic() >= self.token_deadline:
                raise PreflightError('token_missing_or_expired')
            headers['Authorization'] = 'Bearer ' + self.token
        request = urllib.request.Request('https://api.avito.ru' + path, data=data, headers=headers,
                                         method='POST' if data is not None else 'GET')
        limit = 65536 if path == '/token' else 8 * 1024 * 1024
        try:
            with self.opener.open(request, timeout=25) as response:
                if response.status != 200:
                    raise PreflightError('unexpected_http_status')
                body = response.read(limit + 1)
        except urllib.error.HTTPError as error:
            raise PreflightError('http_' + str(error.code)) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise PreflightError('network_or_tls_failure') from None
        if len(body) > limit:
            raise PreflightError('response_size_limit')
        try:
            result = json.loads(body)
        except (ValueError, UnicodeError):
            raise PreflightError('invalid_json') from None
        if not isinstance(result, dict):
            raise PreflightError('unexpected_json_shape')
        return result

    def authenticate(self):
        payload = urllib.parse.urlencode({'grant_type': 'client_credentials',
            'client_id': self.credentials[KEYS[0]], 'client_secret': self.credentials[KEYS[1]]}).encode('ascii')
        started = time.monotonic()
        response = self.request('/token', payload)
        token, ttl, kind = response.get('access_token'), response.get('expires_in'), response.get('token_type')
        if (not isinstance(token, str) or not re.fullmatch(r'[!-~]{1,8192}', token)
                or type(ttl) is not int or ttl <= 0 or not isinstance(kind, str) or kind.lower() != 'bearer'):
            raise PreflightError('invalid_token_response')
        self.token = token
        self.token_deadline = started + ttl - min(30, ttl / 10)
        account = self.request('/core/v1/accounts/self')
        if type(account.get('id')) is not int or str(account['id']) != self.credentials[KEYS[2]]:
            raise PreflightError('verified_account_mismatch')
        return {'ok': True, 'stored_user_id_matches': True, 'token_expires_in_seconds': ttl}


def profile_summary(profile):
    feeds = profile.get('feeds_data')
    if not isinstance(feeds, list) or type(profile.get('autoload_enabled')) is not bool:
        raise PreflightError('unexpected_profile_shape')
    summary = []
    for feed in feeds:
        url = feed.get('feed_url') if isinstance(feed, dict) else None
        try:
            parts = urllib.parse.urlsplit(url) if isinstance(url, str) else None
        except ValueError:
            raise PreflightError('invalid_feed_url') from None
        summary.append({'https': bool(parts and parts.scheme == 'https'),
                        'is_isvoi_host': bool(parts and parts.hostname in ('isvoi.ru', 'www.isvoi.ru')),
                        'contains_query_or_credentials': bool(parts and (parts.query or parts.username or parts.password))})
    schedule = profile.get('schedule')
    return {'ok': True, 'autoload_enabled': profile['autoload_enabled'], 'feeds_count': len(feeds),
            'feeds': summary, 'schedule_periods': len(schedule) if isinstance(schedule, list) else None,
            'report_email_configured': bool(profile.get('report_email'))}


def listing_summary(reader, max_pages=20):
    items, seen = [], set()
    for page in range(1, max_pages + 1):
        query = urllib.parse.urlencode({'status': ','.join(STATUSES), 'per_page': 50, 'page': page})
        reply = reader.request('/core/v1/items?' + query)
        rows = reply.get('resources')
        if not isinstance(rows, list):
            raise PreflightError('unexpected_listing_shape')
        for row in rows:
            if (not isinstance(row, dict) or type(row.get('id')) is not int
                    or row['id'] <= 0 or row['id'] in seen or row.get('status') not in STATUSES):
                raise PreflightError('invalid_or_repeated_listing')
            seen.add(row['id'])
            category = row.get('category') or {}
            items.append({'id': row['id'], 'status': row['status'],
                          'price': row.get('price') if type(row.get('price')) is int else None,
                          'category_id': category.get('id') if isinstance(category, dict) and type(category.get('id')) is int else None})
        if len(rows) < 50:
            return {'ok': True, 'complete': True, 'pages': page, 'count': len(items),
                    'status_counts': {status: sum(row['status'] == status for row in items) for status in STATUSES},
                    'items': items}
        time.sleep(2.5)
    return {'ok': True, 'complete': False, 'pages': max_pages, 'count': len(items), 'items': items}


def phone_nodes(tree):
    found = []

    def visit(value, trail=(), depth=0):
        if depth > 30:
            raise PreflightError('category_tree_depth_limit')
        if isinstance(value, list):
            for child in value:
                visit(child, trail, depth + 1)
        elif isinstance(value, dict):
            name, slug = value.get('name'), value.get('slug')
            path = trail + (name,) if isinstance(name, str) else trail
            if isinstance(slug, str) and re.fullmatch(r'[A-Za-z0-9_-]+', slug):
                if isinstance(name, str) and ('телефон' in name.lower() or 'apple' in name.lower()):
                    found.append({'name': name[:160], 'slug': slug, 'path': list(path)})
            for key, child in value.items():
                if key not in ('name', 'slug') and isinstance(child, (dict, list)):
                    visit(child, path, depth + 1)

    if not isinstance(tree.get('categories'), list):
        raise PreflightError('unexpected_category_tree_shape')
    visit(tree['categories'])
    return {'ok': True, 'phone_nodes': found}


def field_summary(reply):
    if not isinstance(reply.get('fields'), list) or not isinstance(reply.get('node'), dict):
        raise PreflightError('unexpected_category_fields_shape')
    fields = []

    def flatten(rows):
        for row in rows:
            if not isinstance(row, dict):
                raise PreflightError('invalid_category_field')
            fields.append(row)
            if isinstance(row.get('children'), list):
                flatten(row['children'])

    flatten(reply['fields'])
    selected = ('Id', 'Address', 'Title', 'Description', 'Images', 'Price',
                'Category', 'GoodsType', 'PhoneType', 'AdType', 'Condition', 'Vendor', 'Model',
                'MemorySize', 'Color', 'RamSize', 'Akb', 'DeviceFlaws', 'ScreenCondition',
                'CaseCondition', 'BoxSealed', 'Set', 'SimConfig', 'DeviceHistory',
                'BatteryFlaws', 'FunctionsFlaws')
    summaries = []
    for row in fields:
        if row.get('tag') not in selected:
            continue
        rules = []
        for rule in row.get('content') or []:
            values = [v.get('value') for v in rule.get('values') or [] if isinstance(v, dict)]
            links = {}
            for key in ('values_link_json', 'values_link_xml'):
                url = rule.get(key)
                if isinstance(url, str):
                    parts = urllib.parse.urlsplit(url)
                    if (parts.scheme == 'https' and parts.hostname == 'api.avito.ru'
                            and not parts.username and not parts.password and not parts.query
                            and not parts.fragment and parts.path.startswith('/autoload/v1/user-docs/')):
                        links[key] = parts.path
            rules.append({key: rule.get(key) for key in ('field_type', 'data_type', 'required',
                'required_by_dependency', 'dependencies', 'values_range', 'is_catalog', 'name_in_catalog')} | {
                'values_count': len(values), 'values_sample': values[:20],
                'contains_apple': 'Apple' in values, **links})
        summaries.append({'tag': row.get('tag'), 'label': row.get('label'),
                          'feed_format': row.get('feed_format'), 'rules': rules})
    return {'ok': True, 'node': {key: reply['node'].get(key) for key in ('name', 'slug')}, 'field_count': len(fields),
            'tags': [row.get('tag') for row in fields], 'selected_fields': summaries}


def id_links_summary(reader, avito_ids, external_ids):
    if (not 1 <= len(avito_ids) <= 50 or len(set(avito_ids)) != len(avito_ids)
            or any(type(i) is not int or not 1 <= i <= 10**19 - 1 for i in avito_ids)
            or not 1 <= len(external_ids) <= 3 or len(set(external_ids)) != len(external_ids)
            or any(not isinstance(i, str) or not re.fullmatch(
                r'isvoi-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', i) for i in external_ids)):
        raise PreflightError('invalid_id_link_selection')
    result = {'mode': 'read_only', 'historical_reconciliation_complete': False}
    for name, path, requested, required_key in (
            ('historical_ids', '/autoload/v2/items/ad_ids', avito_ids, 'avito_id'),
            ('pilot_ids', '/autoload/v2/items/avito_ids', external_ids, 'ad_id')):
        try:
            reply = reader.request(path + '?' + urllib.parse.urlencode({'query': ','.join(map(str, requested))}))
            rows = reply.get('items')
            if not isinstance(rows, list):
                raise PreflightError('unexpected_id_link_shape')
            seen, safe_rows = set(), []
            for row in rows:
                if not isinstance(row, dict):
                    raise PreflightError('invalid_id_link_row')
                key = row.get(required_key)
                if ((required_key == 'avito_id' and type(key) is not int)
                        or (required_key == 'ad_id' and not isinstance(key, str))
                        or key not in requested or key in seen):
                    raise PreflightError('unexpected_or_duplicate_id_link')
                seen.add(key)
                ad_id, avito_id = row.get('ad_id'), row.get('avito_id')
                if (ad_id is not None and (not isinstance(ad_id, str) or len(ad_id) > 1000)
                        or avito_id is not None and (type(avito_id) is not int or avito_id <= 0)):
                    raise PreflightError('invalid_id_link_value')
                if required_key == 'avito_id':
                    # An old feed Id could be a private identifier. Only report
                    # presence and comparison with our explicit public pilot IDs.
                    safe_rows.append({'avito_id': avito_id, 'autoload_id_present': bool(ad_id),
                                      'matching_pilot_external_id': ad_id if ad_id in external_ids else None})
                else:
                    safe_rows.append({'external_id': ad_id, 'avito_id': avito_id})
            result[name] = {'ok': True, 'complete': seen == set(requested), 'items': safe_rows}
        except PreflightError as error:
            result[name] = {'ok': False, 'code': str(error)}
    return result


def listing_details_summary(reader, avito_ids, external_ids):
    if (not 1 <= len(avito_ids) <= 50 or len(set(avito_ids)) != len(avito_ids)
            or any(type(i) is not int or not 1 <= i <= 10**19 - 1 for i in avito_ids)
            or not 1 <= len(external_ids) <= 3 or len(set(external_ids)) != len(external_ids)
            or any(not isinstance(i, str) or not re.fullmatch(
                r'isvoi-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', i) for i in external_ids)):
        raise PreflightError('invalid_detail_selection')
    items = []
    for item_id in avito_ids:
        item = {'avito_id': item_id}
        try:
            reply = reader.request('/core/v1/accounts/' + reader.credentials[KEYS[2]]
                                   + '/items/' + str(item_id) + '/')
            status = reply.get('status')
            ad_id, url = reply.get('autoload_item_id'), reply.get('url')
            if (status not in STATUSES + ('not_found', 'another_user')
                    or (ad_id is not None and (not isinstance(ad_id, str) or len(ad_id) > 1000))
                    or (url is not None and not isinstance(url, str))):
                raise PreflightError('unexpected_listing_detail_shape')
            item.update(ok=True, status=status, url_present=bool(url),
                        autoload_id_present=bool(ad_id),
                        matching_pilot_external_id=ad_id if status in STATUSES and ad_id in external_ids else None)
        except PreflightError as error:
            item.update(ok=False, code=str(error))
        items.append(item)
    # Neither URLs nor unknown historical IDs are exported; they can contain
    # private identifiers. A successful detail GET is not a duplicate clearance.
    return {'mode': 'read_only', 'historical_reconciliation_complete': False, 'items': items}


def run(include_phone_fields=False, avito_ids=None, external_ids=None):
    credentials = read_credentials()
    reader = AvitoReader(credentials)
    result = {'checked_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'mode': 'read_only', 'credentials': {'owner_matches': True, 'file_mode': '600', 'directory_mode': '700'}}
    result['authentication'] = reader.authenticate()
    for name, operation in (
            ('autoload_profile', lambda: profile_summary(reader.request('/autoload/v2/profile'))),
            ('listings', lambda: listing_summary(reader)),
            ('category_tree', lambda: phone_nodes(reader.request('/autoload/v1/user-docs/tree')))):
        try:
            result[name] = operation()
        except PreflightError as error:
            result[name] = {'ok': False, 'code': str(error)}
    if include_phone_fields:
        try:
            result['phone_fields'] = field_summary(reader.request('/autoload/v1/user-docs/node/mobilnye_telefony/fields'))
        except PreflightError as error:
            result['phone_fields'] = {'ok': False, 'code': str(error)}
    if avito_ids or external_ids:
        result['id_links'] = id_links_summary(reader, avito_ids or [], external_ids or [])
        result['listing_details'] = listing_details_summary(reader, avito_ids or [], external_ids or [])
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument('--phone-fields', action='store_true')
        parser.add_argument('--avito-id', action='append', type=int)
        parser.add_argument('--pilot-external-id', action='append')
        args = parser.parse_args()
        run(args.phone_fields, args.avito_id, args.pilot_external_id)
    except PreflightError as error:
        print(json.dumps({'ok': False, 'code': str(error)}))
        sys.exit(1)
    except Exception:
        print(json.dumps({'ok': False, 'code': 'unexpected_preflight_failure'}))
        sys.exit(1)
