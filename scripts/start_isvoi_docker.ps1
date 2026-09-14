[CmdletBinding()]
param(
  [switch]$SkipCompose,
  [ValidateRange(30, 300)]
  [int]$DockerTimeoutSeconds = 120,
  [ValidateRange(0, 120)]
  [int]$ExistingStartGraceSeconds = 30,
  [ValidateRange(30, 600)]
  [int]$ComposeTimeoutSeconds = 240
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$composeFile = Join-Path $repoRoot 'infra\communications\docker-compose.test.yml'
$dockerDesktopCandidates = @(
  'C:\Program Files\Docker\Docker\Docker Desktop.exe',
  (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe')
)
$dockerDesktop = $dockerDesktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $dockerDesktop) {
  throw 'Docker Desktop is not installed in a supported location.'
}

$dockerExe = Join-Path ([System.IO.Path]::GetDirectoryName($dockerDesktop)) 'resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $dockerExe)) {
  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $dockerCommand) {
    throw 'Docker CLI was not found.'
  }
  $dockerExe = $dockerCommand.Source
}

function Test-DockerReady {
  $previousErrorAction = $ErrorActionPreference
  try {
    # Windows PowerShell 5 promotes native stderr to an ErrorRecord. A stopped
    # Docker Engine is an expected probe result, so this command must continue.
    $ErrorActionPreference = 'Continue'
    & $dockerExe info --format '{{.ServerVersion}}' 2>$null | Out-Null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }

  return $exitCode -eq 0
}

function Wait-DockerReady {
  param([int]$TimeoutSeconds)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (Test-DockerReady) {
      return $true
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Get-ContainerState {
  param(
    [Parameter(Mandatory)]
    [string]$Container,
    [Parameter(Mandatory)]
    [string]$Format
  )

  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $value = & $dockerExe inspect --format $Format $Container 2>$null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }

  if ($exitCode -ne 0) {
    return $null
  }
  return [string]$value
}

function Wait-ComposeReady {
  param([int]$TimeoutSeconds)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $database = Get-ContainerState -Container 'isvoi-communications-local-database-1' -Format '{{.State.Health.Status}}'
    $sanitizer = Get-ContainerState -Container 'isvoi-communications-local-media-sanitizer-1' -Format '{{.State.Health.Status}}'
    $directus = Get-ContainerState -Container 'isvoi-communications-local-directus-1' -Format '{{.State.Status}}'
    $directusHealthy = $false

    if ($directus -eq 'running') {
      try {
        $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8056/server/health' -TimeoutSec 5
        $directusHealthy = $response.status -eq 'ok'
      } catch {
        $directusHealthy = $false
      }
    }

    if ($database -eq 'healthy' -and $sanitizer -eq 'healthy' -and $directusHealthy) {
      Write-Host 'ISVOI services are ready: PostgreSQL=healthy, Directus=ok, Media sanitizer=healthy.'
      return
    }

    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)

  throw "ISVOI services did not become ready within $TimeoutSeconds seconds (PostgreSQL=$database, Directus=$directus, Media sanitizer=$sanitizer)."
}

function Move-SocketDirectory {
  param(
    [Parameter(Mandatory)]
    [string]$Path,
    [Parameter(Mandatory)]
    [string]$Stamp
  )

  $localRoot = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith(
      $localRoot + [System.IO.Path]::DirectorySeparatorChar,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Refusing to move a path outside LOCALAPPDATA: $fullPath"
  }

  if (-not (Test-Path -LiteralPath $fullPath)) {
    return
  }

  $parent = [System.IO.Path]::GetDirectoryName($fullPath)
  $leaf = [System.IO.Path]::GetFileName($fullPath)
  $destination = [System.IO.Path]::GetFullPath((Join-Path $parent "$leaf.socket-stale.$Stamp"))
  if ([System.IO.Path]::GetDirectoryName($destination) -ne $parent) {
    throw "Unexpected recovery destination: $destination"
  }

  Move-Item -LiteralPath $fullPath -Destination $destination -ErrorAction Stop
  Write-Host "Moved stale socket directory: $fullPath"
}

function Disable-DockerAI {
  $settingsPath = Join-Path $env:APPDATA 'Docker\settings-store.json'
  if (-not (Test-Path -LiteralPath $settingsPath)) {
    return
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupPath = "$settingsPath.pre-isvoi-repair.$stamp"
  Copy-Item -LiteralPath $settingsPath -Destination $backupPath -Force

  $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
  if ($settings.PSObject.Properties.Name -contains 'EnableDockerAI') {
    $settings.EnableDockerAI = $false
  } else {
    $settings | Add-Member -NotePropertyName EnableDockerAI -NotePropertyValue $false
  }
  $settingsJson = $settings | ConvertTo-Json -Depth 100
  $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($settingsPath, $settingsJson, $utf8WithoutBom)
  Write-Host 'Docker AI disabled for startup stability.'
}

function Repair-DockerStartup {
  Write-Host 'Docker Engine is unavailable. Running the safe socket recovery.'

  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -match '^(Docker Desktop|com\.docker\.|Docker Desktop Installer)' } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3

  Stop-Service -Name 'com.docker.service' -Force -ErrorAction SilentlyContinue
  & "$env:SystemRoot\System32\wsl.exe" --shutdown
  Start-Sleep -Seconds 2

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Move-SocketDirectory -Path (Join-Path $env:LOCALAPPDATA 'Docker\run') -Stamp $stamp
  Move-SocketDirectory -Path (Join-Path $env:LOCALAPPDATA 'docker-secrets-engine') -Stamp $stamp
  Disable-DockerAI

  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  if (-not (Wait-DockerReady -TimeoutSeconds $DockerTimeoutSeconds)) {
    throw "Docker Engine did not become ready within $DockerTimeoutSeconds seconds."
  }
}

$mutex = [System.Threading.Mutex]::new($false, 'Local\ISVOI.DockerDesktop.SafeStart')
$mutexAcquired = $false

try {
  $mutexAcquired = $mutex.WaitOne(0)
  if (-not $mutexAcquired) {
    throw 'Another ISVOI Docker startup is already running.'
  }

  if (-not (Test-DockerReady)) {
    $dockerProcesses = Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -match '^(Docker Desktop|com\.docker\.)' }

    if ($dockerProcesses -and $ExistingStartGraceSeconds -gt 0) {
      Write-Host "Docker Desktop is already starting; waiting $ExistingStartGraceSeconds seconds."
      [void](Wait-DockerReady -TimeoutSeconds $ExistingStartGraceSeconds)
    }

    if (-not (Test-DockerReady)) {
      Repair-DockerStartup
    }
  }

  $serverVersion = & $dockerExe info --format '{{.ServerVersion}}'
  Write-Host "Docker Engine $serverVersion is ready."

  if (-not $SkipCompose) {
    if (-not (Test-Path -LiteralPath $composeFile)) {
      throw "Compose file not found: $composeFile"
    }

    & $dockerExe compose -f $composeFile up -d
    if ($LASTEXITCODE -ne 0) {
      throw "Docker Compose failed with exit code $LASTEXITCODE."
    }

    & $dockerExe compose -f $composeFile ps
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to read Compose status; exit code $LASTEXITCODE."
    }

    Wait-ComposeReady -TimeoutSeconds $ComposeTimeoutSeconds
  }
} finally {
  if ($mutexAcquired) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
