param(
    [string]$SshTarget = 'deploy@217.114.14.32',
    [string]$SshKey = "$env:USERPROFILE\.ssh\isvoi_beget_ed25519"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $SshKey -PathType Leaf)) {
    throw 'SSH key was not found.'
}
if ($SshTarget -notmatch '^deploy@[a-zA-Z0-9.-]+$') {
    throw 'Use the deploy account and a hostname or IPv4 address.'
}

function New-AvitoRemoteCommand {
    param([string]$Code)
    $encodedCode = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Code))
    # Base64 is a shell-safe argument; no nested double quotes cross PowerShell/SSH.
    return "python3 -c 'import base64,sys; exec(base64.b64decode(sys.argv[1]))' $encodedCode"
}

# Secret values are transmitted through SSH stdin, never command arguments.
$installer = @'
import json, os, pathlib, re, stat, sys, tempfile
import urllib.error, urllib.parse, urllib.request

keys = ('AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET', 'AVITO_USER_ID')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def request_json(request, label):
    # Do not forward credentials to redirects or environment-provided proxies.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=20) as response:
            if response.status != 200:
                raise SystemExit(label + ': unexpected HTTP status')
            body = response.read(65537)
    except urllib.error.HTTPError as error:
        raise SystemExit(label + ': HTTP ' + str(error.code)) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise SystemExit(label + ': network or TLS failure') from None
    if len(body) > 65536:
        raise SystemExit(label + ': response exceeds safe size limit')
    try:
        result = json.loads(body)
    except (ValueError, UnicodeError):
        raise SystemExit(label + ': invalid JSON response') from None
    if not isinstance(result, dict):
        raise SystemExit(label + ': unexpected response format')
    return result

def resolve_user_id(data, requester=request_json):
    if not isinstance(data, dict) or set(data) != set(keys[:2]):
        raise SystemExit('Unexpected credential fields')
    if not isinstance(data[keys[0]], str) or not re.fullmatch(r'[A-Za-z0-9_.-]{4,200}', data[keys[0]]):
        raise SystemExit('Invalid client ID format')
    if not isinstance(data[keys[1]], str) or not re.fullmatch(r'[A-Za-z0-9_+/=.-]{8,512}', data[keys[1]]):
        raise SystemExit('Invalid client secret format')
    payload = urllib.parse.urlencode({
        'grant_type': 'client_credentials',
        'client_id': data[keys[0]],
        'client_secret': data[keys[1]],
    }).encode('ascii')
    token = requester(urllib.request.Request('https://api.avito.ru/token', data=payload,
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'},
        method='POST'), 'Avito authorization')
    access_token = token.get('access_token')
    expires_in = token.get('expires_in')
    if (not isinstance(access_token, str) or not re.fullmatch(r'[!-~]{1,8192}', access_token)
            or not isinstance(token.get('token_type'), str)
            or token['token_type'].lower() != 'bearer'
            or type(expires_in) is not int or expires_in <= 0):
        raise SystemExit('Avito authorization: invalid token response')
    account = requester(urllib.request.Request('https://api.avito.ru/core/v1/accounts/self',
        headers={'Authorization': 'Bearer ' + access_token, 'Accept': 'application/json'},
        method='GET'), 'Avito account verification')
    user_id = account.get('id')
    if type(user_id) is not int or not 1 <= user_id <= 9223372036854775807:
        raise SystemExit('Avito account verification: invalid numeric user ID')
    # Only the verified ID survives; email, phones and access token are not saved.
    return str(user_id)

def save_credentials(data, directory):
    target = directory / 'avito.env'
    if target.exists() or target.is_symlink():
        raise SystemExit('Credential file already exists; no values were changed')
    fd, temporary = tempfile.mkstemp(prefix='.avito-', dir=directory)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            for key in keys:
                output.write(key + '=' + data[key] + '\n')
            output.flush()
            os.fsync(output.fileno())
        # Hard-link creation is atomic and refuses a concurrent overwrite.
        os.link(temporary, target)
        mode = stat.S_IMODE(target.stat().st_mode)
        if mode != 0o600 or target.stat().st_uid != os.getuid():
            raise SystemExit('Credential file permission verification failed')
    finally:
        os.unlink(temporary)

def main():
    home = pathlib.Path.home()
    if home != pathlib.Path('/home/deploy'):
        raise SystemExit('Unexpected account home')
    os.umask(0o077)
    directory = home / '.config' / 'isvoi'
    for part in (home / '.config', directory):
        if part.is_symlink():
            raise SystemExit('Refusing symlink directory')
        if part.exists() and (not part.is_dir() or part.stat().st_uid != os.getuid()):
            raise SystemExit('Unexpected directory owner or type')
    target = directory / 'avito.env'
    if target.exists() or target.is_symlink():
        raise SystemExit('Credential file already exists; no values were changed')
    try:
        data = json.load(sys.stdin)
    except (ValueError, UnicodeError):
        raise SystemExit('Invalid credential input') from None
    user_id = resolve_user_id(data)
    data[keys[2]] = user_id
    for part in (home / '.config', directory):
        part.mkdir(mode=0o700, exist_ok=True)
        if part.is_symlink() or part.stat().st_uid != os.getuid():
            raise SystemExit('Unexpected directory owner or symlink')
    os.chmod(directory, 0o700)
    save_credentials(data, directory)
    print('Verified AVITO_USER_ID=' + user_id)
    print('Saved /home/deploy/.config/isvoi/avito.env; owner deploy; mode 600; three keys present.')

if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never expose response bodies, Request objects or raw exceptions.
        raise SystemExit('Credential setup failed; secret values were not printed') from None
'@
$remoteCommand = New-AvitoRemoteCommand -Code $installer
$probeCommand = New-AvitoRemoteCommand -Code @'
import json, sys
if json.load(sys.stdin) != {'probe': 'isvoi-ssh-transport'}:
    raise SystemExit('SSH input verification failed')
print('ISVOI_AVITO_TRANSFER_OK')
'@
$probeOutput = '{"probe":"isvoi-ssh-transport"}' | & ssh -o BatchMode=yes -o ConnectTimeout=15 -i $SshKey $SshTarget $probeCommand
if ($LASTEXITCODE -ne 0 -or "$probeOutput" -cne 'ISVOI_AVITO_TRANSFER_OK') {
    throw 'SSH transport verification failed before credential input; no secret values were requested.'
}
$values = @{}
$payload = $null
try {
    Write-Host 'Avito keys: hidden input, SSH transfer, no local credential file.'
    Write-Host 'SSH command and stdin transfer verified before credential input.'
    Write-Host 'User ID is fetched using Avito authorization and a read-only account request.'
    Write-Host 'No listings, autoload settings or paid services are changed.'
    Write-Host 'Existing server credentials will NOT be overwritten.'
    foreach ($name in 'AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET') {
        $secret = Read-Host "$name (hidden input)" -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try {
            $values[$name] = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            $secret.Dispose()
        }
    }
    $payload = $values | ConvertTo-Json -Compress
    $payload | & ssh -o BatchMode=yes -o ConnectTimeout=15 -i $SshKey $SshTarget $remoteCommand
    if ($LASTEXITCODE -ne 0) { throw 'Credential setup failed; secret values were not printed.' }
} finally {
    $payload = $null
    $values.Clear()
}
