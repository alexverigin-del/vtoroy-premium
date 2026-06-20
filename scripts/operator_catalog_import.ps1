param(
  [string]$BatchFolder = "",
  [string]$BatchName = "",
  [switch]$Apply,
  [switch]$SkipUpload,
  [switch]$ReplaceMedia,
  [ValidateSet("draft", "published", "archived")]
  [string]$DefaultStatus = "draft",
  [string]$Server = "deploy@217.114.14.32",
  [string]$SshKey = "C:\Users\1\.ssh\isvoi_beget_ed25519",
  [string]$RemoteRoot = "/opt/isvoi/imports"
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
  Write-Host ""
  Write-Host "Error: $Message" -ForegroundColor Red
  exit 1
}

function Step($Message) {
  Write-Host ""
  Write-Host "== $Message ==" -ForegroundColor Cyan
}

function RunCommand($Command, $Arguments) {
  Write-Host "> $Command $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "Command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

function BashQuote($Value) {
  $text = [string]$Value
  $text = $text.Replace('\', '\\')
  $text = $text.Replace('"', '\"')
  $text = $text.Replace('$', '\$')
  $text = $text.Replace('`', '\`')
  return '"' + $text + '"'
}

function SafeBatchName($Value) {
  $clean = ($Value -replace "[^A-Za-z0-9_.-]", "-").Trim("-")
  if ([string]::IsNullOrWhiteSpace($clean)) {
    return "catalog-batch"
  }
  return $clean
}

Write-Host "ISVOI catalog batch import" -ForegroundColor Green
Write-Host "Without -Apply this script validates the batch and does not import anything."

if ([string]::IsNullOrWhiteSpace($BatchFolder)) {
  $BatchFolder = Read-Host "Local batch folder path"
}

if ([string]::IsNullOrWhiteSpace($BatchFolder)) {
  Fail "Batch folder is required."
}

$ResolvedBatchFolder = Resolve-Path -LiteralPath $BatchFolder -ErrorAction Stop
$BatchPath = $ResolvedBatchFolder.Path

$StockWorkbook = Join-Path $BatchPath "stock.xlsx"
if (Test-Path -LiteralPath $StockWorkbook) {
  $WorkbookPath = $StockWorkbook
} else {
  $Workbooks = @(Get-ChildItem -LiteralPath $BatchPath -Filter "*.xlsx" -File)
  if ($Workbooks.Count -eq 1) {
    $WorkbookPath = $Workbooks[0].FullName
  } elseif ($Workbooks.Count -eq 0) {
    Fail "No XLSX workbook found in batch folder. Add stock.xlsx."
  } else {
    Fail "Several XLSX workbooks found. Keep one file or name the main file stock.xlsx."
  }
}

$IncomingPath = Join-Path $BatchPath "incoming"
$OptimizedPath = Join-Path $BatchPath "optimized"
if (-not (Test-Path -LiteralPath $IncomingPath) -and -not (Test-Path -LiteralPath $OptimizedPath)) {
  Fail "Batch folder must contain incoming or optimized photos folder."
}

try {
  $KeyExists = Test-Path -LiteralPath $SshKey
} catch {
  Fail "SSH key cannot be checked: $SshKey"
}
if (-not $KeyExists) {
  Fail "SSH key not found: $SshKey"
}

if ([string]::IsNullOrWhiteSpace($BatchName)) {
  $BatchName = SafeBatchName((Split-Path -Leaf $BatchPath))
} else {
  $BatchName = SafeBatchName($BatchName)
}

$WorkbookName = Split-Path -Leaf $WorkbookPath
$RemoteBatch = "$RemoteRoot/$BatchName"
$RemoteWorkbook = "$RemoteBatch/$WorkbookName"
$RemoteIncoming = "$RemoteBatch/incoming"
$RemoteOptimized = "$RemoteBatch/optimized"
$Mode = if ($Apply) { "APPLY" } else { "DRY-RUN" }

Write-Host ""
Write-Host "Batch:        $BatchName"
Write-Host "Folder:       $BatchPath"
Write-Host "Excel:        $WorkbookName"
Write-Host "Server:       $Server"
Write-Host "Mode:         $Mode"
Write-Host "New status:   $DefaultStatus"

if ($Apply) {
  Write-Host ""
  Write-Host "Warning: -Apply will write changes to Directus." -ForegroundColor Yellow
  $Confirm = Read-Host "Type IMPORT to continue"
  if ($Confirm -ne "IMPORT") {
    Fail "Import cancelled."
  }
}

if (-not $SkipUpload) {
  Step "Uploading batch folder to server"
  RunCommand "ssh" @(
    "-i", $SshKey,
    $Server,
    "mkdir -p $(BashQuote $RemoteBatch)"
  )
  $BatchItems = @(Get-ChildItem -LiteralPath $BatchPath -Force)
  if ($BatchItems.Count -eq 0) {
    Fail "Batch folder is empty."
  }
  foreach ($Item in $BatchItems) {
    RunCommand "scp" @(
      "-i", $SshKey,
      "-r",
      $Item.FullName,
      "${Server}:$RemoteBatch/"
    )
  }
} else {
  Step "Upload skipped"
}

Step "Running Beget processing"
$RunnerArgs = @(
  "bash scripts/run_catalog_import_batch.sh",
  "--file $(BashQuote $RemoteWorkbook)",
  "--assets-root $(BashQuote $RemoteOptimized)",
  "--batch $(BashQuote $BatchName)",
  "--default-status $(BashQuote $DefaultStatus)"
)
if ($Apply) {
  $RunnerArgs += "--apply"
}
if ($ReplaceMedia) {
  $RunnerArgs += "--replace-media"
}

$RemoteCommandParts = @(
  "cd /opt/isvoi",
  "git pull --ff-only",
  "if [ -d $(BashQuote $RemoteIncoming) ]; then . .venv/bin/activate && python scripts/optimize_images.py --src $(BashQuote $RemoteIncoming) --out $(BashQuote $RemoteOptimized) --max 2400 --quality 88; fi",
  ($RunnerArgs -join " ")
)
$RemoteCommand = $RemoteCommandParts -join " && "

RunCommand "ssh" @(
  "-i", $SshKey,
  $Server,
  $RemoteCommand
)

Write-Host ""
if ($Apply) {
  Write-Host "Import complete. Check devices in Directus Studio and on the site." -ForegroundColor Green
} else {
  Write-Host "Dry-run complete. If there are no errors, run again with -Apply." -ForegroundColor Green
}
