param(
    [string]$SshTarget = 'deploy@217.114.14.32',
    [string]$SshKey = "$env:USERPROFILE\.ssh\isvoi_beget_ed25519"
)

$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$path = Join-Path $PSScriptRoot 'configure_avito_credentials.ps1'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Credential helper syntax failed.' }
$function = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'New-AvitoRemoteCommand'
}, $true)
if (-not $function) { throw 'Transport function was not found.' }
Invoke-Expression $function.Extent.Text

# This test transfers only a fixed fixture, never API keys or account data.
$command = New-AvitoRemoteCommand -Code @'
import json, sys
assert json.load(sys.stdin) == {'probe': 'fixture+value/=', 'number': 123}
print('ISVOI_AVITO_TRANSFER_OK')
'@
if ($command.Contains('"')) { throw 'Nested double quotes returned to the SSH transport.' }
$output = '{"probe":"fixture+value/=","number":123}' | & ssh -o BatchMode=yes -o ConnectTimeout=15 -i $SshKey $SshTarget $command
if ($LASTEXITCODE -ne 0 -or "$output" -cne 'ISVOI_AVITO_TRANSFER_OK') {
    throw 'PowerShell -> SSH -> remote shell -> Python -> JSON stdin test failed.'
}
Write-Output "Transport test passed on PowerShell $($PSVersionTable.PSVersion). No credentials or files were changed."
