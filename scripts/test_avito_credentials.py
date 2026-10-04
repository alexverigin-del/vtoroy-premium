import io
import json
import os
import pathlib
import re
import stat
import tempfile
import unittest
import urllib.error
import urllib.parse
from unittest.mock import patch


SOURCE = pathlib.Path(__file__).with_name('configure_avito_credentials.ps1').read_text(encoding='utf-8')
INSTALLER = re.search(r"\$installer = @'\r?\n(.*?)\r?\n'@", SOURCE, re.S).group(1)
RUNTIME = {'__name__': 'avito_credentials_test'}
exec(compile(INSTALLER, 'avito-credential-installer', 'exec'), RUNTIME)


class CredentialTests(unittest.TestCase):
    def setUp(self):
        self.credentials = {'AVITO_CLIENT_ID': 'fixture-client', 'AVITO_CLIENT_SECRET': 'fixture+secret/='}
        self.token = {'access_token': 'fixture-access-token', 'token_type': 'Bearer', 'expires_in': 3600}

    def resolve(self, account=None, token=None):
        calls = []

        def requester(request, label):
            calls.append(request)
            return (self.token if token is None else token) if len(calls) == 1 else account

        result = RUNTIME['resolve_user_id'](self.credentials, requester)
        return result, calls

    def test_exact_read_only_contract_and_no_personal_data(self):
        result, calls = self.resolve({'id': 123456, 'email': 'private@example.invalid', 'phones': ['private']})
        self.assertEqual(result, '123456')
        self.assertEqual([r.full_url for r in calls], [
            'https://api.avito.ru/token', 'https://api.avito.ru/core/v1/accounts/self'])
        self.assertEqual([r.get_method() for r in calls], ['POST', 'GET'])
        self.assertEqual(urllib.parse.parse_qs(calls[0].data.decode('ascii')), {
            'grant_type': ['client_credentials'], 'client_id': ['fixture-client'],
            'client_secret': ['fixture+secret/=']})
        self.assertEqual(calls[0].get_header('Content-type'), 'application/x-www-form-urlencoded')
        self.assertEqual(calls[1].get_header('Authorization'), 'Bearer fixture-access-token')
        self.assertIsNone(calls[1].data)
        self.assertEqual(set(self.credentials), {'AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET'})

    def test_user_id_must_be_positive_integer_not_email_or_boolean(self):
        for value in (None, True, False, 0, -1, '123', 12.5, 'email@example.invalid', 2 ** 63):
            with self.subTest(value=value), self.assertRaisesRegex(SystemExit, 'invalid numeric user ID'):
                self.resolve({'id': value})

    def test_invalid_token_response(self):
        for field, value in [('access_token', ''), ('access_token', 'token\nsecret'),
                             ('access_token', 123), ('token_type', 'Basic'), ('token_type', None),
                             ('expires_in', True), ('expires_in', 0), ('expires_in', '3600')]:
            token = dict(self.token, **{field: value})
            with self.subTest(field=field, value=value), self.assertRaisesRegex(SystemExit, 'invalid token response'):
                self.resolve({'id': 123}, token)

    def test_rejects_invalid_credentials_before_network(self):
        bad_inputs = [None, [], {}, dict(self.credentials, AVITO_USER_ID='123'),
                      dict(self.credentials, AVITO_CLIENT_ID='mail@example.invalid'),
                      dict(self.credentials, AVITO_CLIENT_SECRET='secret\nvalue'),
                      dict(self.credentials, AVITO_CLIENT_SECRET=123)]
        for data in bad_inputs:
            with self.subTest(data=data), self.assertRaises(SystemExit):
                RUNTIME['resolve_user_id'](data, lambda *args: self.fail('Network must not be called'))

    def test_redirect_handler_refuses_forwarding(self):
        self.assertIsNone(RUNTIME['NoRedirect']().redirect_request(None, None, 307, '', {},
                                                                   'https://other.example.invalid'))

    def test_http_errors_never_expose_body_or_url(self):
        class Opener:
            def open(self, request, timeout):
                raise urllib.error.HTTPError('https://private.invalid/secret', 403, 'private detail', {},
                                             io.BytesIO(b'private secret response'))

        with patch.object(RUNTIME['urllib'].request, 'build_opener', return_value=Opener()):
            with self.assertRaises(SystemExit) as error:
                RUNTIME['request_json'](None, 'Avito account verification')
        self.assertEqual(str(error.exception), 'Avito account verification: HTTP 403')

    def test_network_errors_are_sanitized(self):
        class Opener:
            def open(self, request, timeout):
                raise urllib.error.URLError('private secret detail')

        with patch.object(RUNTIME['urllib'].request, 'build_opener', return_value=Opener()):
            with self.assertRaisesRegex(SystemExit, '^Avito authorization: network or TLS failure$'):
                RUNTIME['request_json'](None, 'Avito authorization')

    def test_response_limits_and_json_shape(self):
        for body in (b'x' * 65537, b'not-json', b'[]', b'null', b'\xff'):
            class Response(io.BytesIO):
                status = 200

            class Opener:
                def open(self, request, timeout):
                    self_timeout = timeout
                    assert self_timeout == 20
                    return Response(body)

            with self.subTest(body_size=len(body)), patch.object(RUNTIME['urllib'].request, 'build_opener',
                                                               return_value=Opener()):
                with self.assertRaises(SystemExit):
                    RUNTIME['request_json'](None, 'Avito account verification')

    def test_save_only_three_fields_and_refuse_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = pathlib.Path(temporary)
            data = dict(self.credentials, AVITO_USER_ID='123456', access_token='must-not-persist',
                        email='must-not-persist')
            # Windows does not expose POSIX mode bits; production verifies them on Linux.
            mode_patch = patch.object(RUNTIME['stat'], 'S_IMODE', return_value=0o600) if os.name == 'nt' else None
            with patch.object(RUNTIME['os'], 'getuid', return_value=directory.stat().st_uid, create=True):
                if mode_patch:
                    mode_patch.start()
                try:
                    RUNTIME['save_credentials'](data, directory)
                finally:
                    if mode_patch:
                        mode_patch.stop()
            target = directory / 'avito.env'
            expected = ''.join(key + '=' + data[key] + '\n' for key in RUNTIME['keys'])
            self.assertEqual(target.read_text(encoding='utf-8'), expected)
            self.assertEqual(list(directory.iterdir()), [target])
            if os.name != 'nt':
                self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            with self.assertRaisesRegex(SystemExit, 'already exists'):
                RUNTIME['save_credentials'](dict(data, AVITO_USER_ID='654321'), directory)
            self.assertEqual(target.read_text(encoding='utf-8'), expected)

    def test_powershell_asks_only_two_keys_and_uses_stdin(self):
        self.assertIn("foreach ($name in 'AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET')", SOURCE)
        self.assertIn('-AsSecureString', SOURCE)
        self.assertIn('$payload | & ssh', SOURCE)
        self.assertIn('ZeroFreeBSTR', SOURCE)
        self.assertNotIn('AVITO_CLIENT_SECRET=', SOURCE)

    def test_transport_avoids_nested_double_quotes_and_preflights_before_input(self):
        self.assertIn('exec(base64.b64decode(sys.argv[1]))', SOURCE)
        self.assertNotIn('b64decode(`"', SOURCE)
        self.assertLess(SOURCE.index('$probeOutput ='), SOURCE.index('$secret = Read-Host'))
        self.assertIn('ISVOI_AVITO_TRANSFER_OK', SOURCE)


if __name__ == '__main__':
    unittest.main()
