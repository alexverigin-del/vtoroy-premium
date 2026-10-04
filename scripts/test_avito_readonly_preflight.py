import importlib.util
import io
import pathlib
import unittest
import urllib.error
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location('preflight', pathlib.Path(__file__).with_name('avito_readonly_preflight.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PreflightTests(unittest.TestCase):
    def reader(self):
        reader = MODULE.AvitoReader({'AVITO_CLIENT_ID': 'fixture-client',
            'AVITO_CLIENT_SECRET': 'fixture-secret', 'AVITO_USER_ID': '123'})
        reader.token = 'fixture-token'
        reader.token_deadline = float('inf')
        return reader

    def test_all_marketplace_writes_and_unknown_endpoints_refused(self):
        reader = self.reader()
        for path in ('/autoload/v1/upload', '/autoload/v2/profile', '/core/v1/items/321/update_price'):
            with self.subTest(path=path), self.assertRaisesRegex(MODULE.PreflightError, 'marketplace_write_forbidden'):
                reader.request(path, b'{}')
        for path in ('/autoload/v1/upload', 'https://other.invalid', '/messenger/v2/accounts/123/chats',
                     '/core/v1/accounts/999/items/321/'):
            with self.subTest(path=path), self.assertRaisesRegex(MODULE.PreflightError, 'endpoint_not_allowlisted'):
                reader.request(path)

    def test_empty_or_expired_token_rejected(self):
        reader = self.reader()
        reader.token_deadline = 0
        with self.assertRaisesRegex(MODULE.PreflightError, 'token_missing_or_expired'):
            reader.request('/core/v1/accounts/self')

    def test_authentication_matches_stored_account_and_uses_real_ttl(self):
        reader = self.reader()
        replies = [{'access_token': 'fixture-token', 'token_type': 'Bearer', 'expires_in': 1234},
                   {'id': 123, 'email': 'private', 'phones': ['private']}]
        calls = []

        def request(path, data=None):
            calls.append((path, data))
            return replies.pop(0)

        reader.request = request
        result = reader.authenticate()
        self.assertEqual(result, {'ok': True, 'stored_user_id_matches': True, 'token_expires_in_seconds': 1234})
        self.assertEqual([call[0] for call in calls], ['/token', '/core/v1/accounts/self'])
        self.assertIn(b'grant_type=client_credentials', calls[0][1])
        self.assertNotIn('private', str(result))

    def test_other_account_or_boolean_id_rejected(self):
        for account in ({'id': 999}, {'id': True}, {'id': '123'}):
            reader = self.reader()
            replies = iter([{'access_token': 'fixture-token', 'token_type': 'Bearer', 'expires_in': 3600}, account])
            reader.request = lambda *args: next(replies)
            with self.subTest(account=account), self.assertRaisesRegex(MODULE.PreflightError, 'verified_account_mismatch'):
                reader.authenticate()

    def test_profile_report_never_reveals_feed_url_or_contacts(self):
        result = MODULE.profile_summary({'autoload_enabled': False,
            'feeds_data': [{'feed_url': 'https://user:password@isvoi.ru/private-feed?secret=value',
                            'feed_name': 'private-feed-name'}],
            'schedule': [{'rate': 3}], 'report_email': 'private@example.invalid'})
        self.assertEqual(result['feeds_count'], 1)
        self.assertTrue(result['feeds'][0]['contains_query_or_credentials'])
        for private in ('password', 'secret', 'private', 'example.invalid'):
            self.assertNotIn(private, str(result))

    def test_listing_query_includes_all_five_statuses(self):
        reader = self.reader()
        calls = []

        def request(path):
            calls.append(path)
            return {'resources': [{'id': 321, 'status': 'old', 'title': 'PRIVATE SERIAL',
                'address': 'PRIVATE ADDRESS', 'url': 'PRIVATE URL', 'price': 1000, 'category': {'id': 84}}]}

        reader.request = request
        result = MODULE.listing_summary(reader)
        self.assertTrue(result['complete'])
        self.assertEqual(result['status_counts']['old'], 1)
        self.assertIn('status=active%2Cremoved%2Cold%2Cblocked%2Crejected', calls[0])
        self.assertNotIn('PRIVATE', str(result))

    def test_listing_duplicates_and_invalid_status_rejected(self):
        for rows in ([{'id': 123, 'status': 'active'}] * 2, [{'id': 123, 'status': 'unknown'}]):
            reader = self.reader()
            reader.request = lambda path: {'resources': rows}
            with self.assertRaisesRegex(MODULE.PreflightError, 'invalid_or_repeated_listing'):
                MODULE.listing_summary(reader)

    def test_pagination_limit_is_explicit_not_silently_complete(self):
        reader = self.reader()
        reader.request = lambda path: {'resources': [{'id': i + 1, 'status': 'active'} for i in range(50)]}
        with patch.object(MODULE.time, 'sleep'):
            result = MODULE.listing_summary(reader, max_pages=1)
        self.assertFalse(result['complete'])
        self.assertEqual(result['count'], 50)

    def test_nested_phone_nodes(self):
        result = MODULE.phone_nodes({'categories': [{'name': 'Electronics', 'nested': [
            {'name': 'Mobile Телефоны', 'slug': 'mobilnye_telefony'}]}]})
        self.assertEqual(result['phone_nodes'][0]['slug'], 'mobilnye_telefony')

    def test_fields_catalog_and_nested_rules(self):
        result = MODULE.field_summary({'node': {'name': 'Phones', 'slug': 'phones', 'unknown': 'PRIVATE'},
            'fields': [{'tag': 'Category', 'content': [{'required': True, 'values': [{'value': 'Phones'}]}],
                'children': [{'tag': 'Model', 'content': [{'required': True, 'is_catalog': True,
                    'values_link_json': 'https://other.invalid/secret'}]}]}]})
        self.assertEqual(result['field_count'], 2)
        self.assertEqual(result['selected_fields'][1]['rules'][0]['is_catalog'], True)
        self.assertNotIn('PRIVATE', str(result))
        self.assertNotIn('other.invalid', str(result))

    def test_http_error_body_and_message_are_not_reported(self):
        class Opener:
            def open(self, request, timeout):
                raise urllib.error.HTTPError('https://api.avito.ru/private', 403, 'PRIVATE', {},
                                             io.BytesIO(b'PRIVATE TOKEN'))

        reader = self.reader()
        reader.opener = Opener()
        with self.assertRaises(MODULE.PreflightError) as error:
            reader.request('/autoload/v2/profile')
        self.assertEqual(str(error.exception), 'http_403')

    def test_id_links_never_export_unknown_old_autoload_identifier(self):
        reader = self.reader()
        external = 'isvoi-00000000-0000-4000-8000-000000000001'
        replies = iter([{'items': [{'avito_id': 321, 'ad_id': 'PRIVATE-IMEI-123456789012345'}]},
                        {'items': [{'ad_id': external, 'avito_id': None}]}])
        calls = []
        def request(path):
            calls.append(path)
            return next(replies)
        reader.request = request
        result = MODULE.id_links_summary(reader, [321], [external])
        self.assertTrue(result['historical_ids']['complete'])
        self.assertTrue(result['historical_ids']['items'][0]['autoload_id_present'])
        self.assertNotIn('PRIVATE', str(result))
        self.assertNotIn('123456789012345', str(result))
        self.assertFalse(result['historical_reconciliation_complete'])
        self.assertEqual(calls[0], '/autoload/v2/items/ad_ids?query=321')

    def test_id_link_http_failure_and_missing_rows_remain_open(self):
        reader = self.reader()
        external = 'isvoi-00000000-0000-4000-8000-000000000001'
        def request(path):
            if '/ad_ids?' in path:
                raise MODULE.PreflightError('http_403')
            return {'items': []}
        reader.request = request
        result = MODULE.id_links_summary(reader, [321], [external])
        self.assertEqual(result['historical_ids']['code'], 'http_403')
        self.assertFalse(result['pilot_ids']['complete'])
        self.assertFalse(result['historical_reconciliation_complete'])

    def test_id_link_selection_invalid_values_and_unknown_responses_rejected(self):
        reader = self.reader()
        external = 'isvoi-00000000-0000-4000-8000-000000000001'
        for ids, externals in (([True], [external]), ([321, 321], [external]), ([321], ['PRIVATE']),
                               ([321], [external] * 4)):
            with self.subTest(ids=ids), self.assertRaises(MODULE.PreflightError):
                MODULE.id_links_summary(reader, ids, externals)
        reader.request = lambda path: {'items': [{'avito_id': 999, 'ad_id': 'other'}]}
        result = MODULE.id_links_summary(reader, [321], [external])
        self.assertFalse(result['historical_ids']['ok'])
        self.assertFalse(result['pilot_ids']['ok'])

    def test_id_link_endpoint_allowlist_is_get_only_and_exact(self):
        reader = self.reader()
        for path in ('/autoload/v2/items/ad_ids?query=321&secret=x',
                     '/autoload/v2/items/avito_ids?query=private-imei', '/autoload/v2/items/ad_ids?query=0'):
            with self.subTest(path=path), self.assertRaisesRegex(MODULE.PreflightError, 'endpoint_not_allowlisted'):
                reader.request(path)
        with self.assertRaisesRegex(MODULE.PreflightError, 'marketplace_write_forbidden'):
            reader.request('/autoload/v2/items/ad_ids?query=321', b'{}')

    def test_details_do_not_export_private_historical_id_url_or_content(self):
        reader = self.reader()
        external = 'isvoi-00000000-0000-4000-8000-000000000001'
        calls = []
        def request(path):
            calls.append(path)
            return {'status': 'old', 'autoload_item_id': '123456789012345',
                    'url': 'https://avito.invalid/PRIVATE-SERIAL?secret=private',
                    'description': 'PRIVATE CONTENT', 'vas': [{'private': 'value'}]}
        reader.request = request
        result = MODULE.listing_details_summary(reader, [321], [external])
        self.assertEqual(calls, ['/core/v1/accounts/123/items/321/'])
        self.assertTrue(result['items'][0]['autoload_id_present'])
        self.assertIsNone(result['items'][0]['matching_pilot_external_id'])
        for value in ('123456789012345', 'PRIVATE', 'secret', 'description', 'vas'):
            self.assertNotIn(value, str(result))
        self.assertFalse(result['historical_reconciliation_complete'])

    def test_details_report_exact_link_or_absence_without_publication_permission(self):
        reader = self.reader()
        external = 'isvoi-00000000-0000-4000-8000-000000000001'
        for ad_id in (None, '', external):
            reader.request = lambda path: {'status': 'old', 'autoload_item_id': ad_id, 'url': None}
            result = MODULE.listing_details_summary(reader, [321], [external])
            self.assertEqual(result['items'][0]['matching_pilot_external_id'], external if ad_id else None)
            self.assertEqual(result['items'][0]['autoload_id_present'], bool(ad_id))
            self.assertFalse(result['historical_reconciliation_complete'])
        for status in ('not_found', 'another_user'):
            reader.request = lambda path: {'status': status, 'autoload_item_id': external}
            self.assertIsNone(MODULE.listing_details_summary(reader, [321], [external])['items'][0]['matching_pilot_external_id'])

    def test_detail_errors_are_explicit_and_sanitized(self):
        reader = self.reader()
        external = 'isvoi-00000000-0000-4000-8000-000000000001'
        for reply in ({'status': 'unknown'}, {'status': 'old', 'autoload_item_id': True},
                      {'status': 'old', 'url': {'secret': 'PRIVATE'}}):
            reader.request = lambda path: reply
            result = MODULE.listing_details_summary(reader, [321], [external])
            self.assertEqual(result['items'][0]['code'], 'unexpected_listing_detail_shape')
            self.assertNotIn('PRIVATE', str(result))
        def request(path):
            raise MODULE.PreflightError('http_403')
        reader.request = request
        self.assertEqual(MODULE.listing_details_summary(reader, [321], [external])['items'][0]['code'], 'http_403')

    def test_detail_invalid_selection_is_rejected_before_request(self):
        reader = self.reader()
        reader.request = lambda path: self.fail('Invalid selection made a request')
        external = 'isvoi-00000000-0000-4000-8000-000000000001'
        for ids, externals in (([True], [external]), ([], [external]), ([321, 321], [external]),
                               ([321], ['PRIVATE']), ([321], [external, external])):
            with self.subTest(ids=ids), self.assertRaisesRegex(MODULE.PreflightError, 'invalid_detail_selection'):
                MODULE.listing_details_summary(reader, ids, externals)


if __name__ == '__main__':
    unittest.main()
