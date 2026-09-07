<#
.SYNOPSIS
  Mammo QA Workbench launcher (Windows).
.DESCRIPTION
  Detects Node.js/npm (PATH or common install locations), installs
  dependencies when stale/missing, regenerates demo sample exams if absent
  (requires Python + numpy/pillow/pydicom), then runs the requested mode.

  Modes:
    dev   (default) start the webpack dev server and open the browser
    build           create an optimized production build
    start           serve the production build (.next) and open the browser

  Examples:
    .\run.ps1                      # dev on http://localhost:3000
    .\run.ps1 -Mode build
    .\run.ps1 -Mode start -Port 8080
    .\run.ps1 -NoOpen              # dev, but do not auto-open the browser
    .\run.ps1 -NoInstall           # skip the dependency check entirely
#>
[CmdletBinding()]
param(
    [ValidateSet('dev', 'build', 'start')]
    [string]$Mode = 'dev',

    [string]$Port = '3000',

    [switch]$NoInstall,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# 1. Locate Node.js + npm
# ---------------------------------------------------------------------------
function Find-NodeExecutable {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) { return $node.Source }

    $candidates = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
        (Join-Path $env:APPDATA 'npm\node.exe'),
        (Join-Path $env:USERPROFILE 'scoop\apps\nodejs\current\node.exe')
    )
    # .nvm-windows style layout: <profile>\.nvm-node\<version>\node.exe
    $nvmHome = Join-Path $env:USERPROFILE '.nvm-node'
    if (Test-Path $nvmHome) {
        Get-ChildItem $nvmHome -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { $candidates += Join-Path $_.FullName 'node.exe' }
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

$nodeExe = Find-NodeExecutable
if (-not $nodeExe) {
    throw "Node.js was not found. Install Node >= 20.9 from https://nodejs.org and re-run."
}
$nodeDir = Split-Path -Parent $nodeExe
$env:PATH = "$nodeDir;$env:PATH"

$nodeVersion = & node --version
if ($LASTEXITCODE -ne 0 -or -not $nodeVersion) {
    throw "Failed to run Node.js from $nodeDir"
}
$required = [version]'20.9.0'
$actual = [version]$nodeVersion.TrimStart('v')
$npmVersion = & npm --version
Write-Step "Using Node $nodeVersion (npm $npmVersion)"
if ($actual -lt $required) {
    throw "Node $nodeVersion is too old - Mammo QA requires Node >= 20.9 (LTS recommended)."
}

# ---------------------------------------------------------------------------
# 2. Dependency check
# ---------------------------------------------------------------------------
$packageFile = Join-Path $Root 'package.json'
$modulesDir = Join-Path $Root 'node_modules'

if (-not $NoInstall) {
    $needInstall = -not (Test-Path $modulesDir)
    if (-not $needInstall -and (Test-Path $packageFile)) {
        $pkgStamp = (Get-Item $packageFile).LastWriteTime
        $modStamp = (Get-Item $modulesDir).LastWriteTime
        $needInstall = $pkgStamp -gt $modStamp
    }
    if ($needInstall) {
        Write-Step 'Installing dependencies (npm install)...'
        & npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    }
}

# ---------------------------------------------------------------------------
# 3. Sample data check (regenerate synthetic exams when assets are missing)
# ---------------------------------------------------------------------------
$pngCount = @(Get-ChildItem (Join-Path $Root 'public\samples\png\*.png') -ErrorAction SilentlyContinue).Count
$dcmCount = @(Get-ChildItem (Join-Path $Root 'public\samples\dicom\*.dcm') -ErrorAction SilentlyContinue).Count
if ($pngCount -lt 6 -or $dcmCount -lt 2) {
    $python = Get-Command python, python3, py -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($python) {
        Write-Step 'Demo images are missing - regenerating synthetic mammograms...'
        & $python.Source (Join-Path $Root 'scripts\generate_sample_data.py') (Join-Path $Root 'public\samples')
        if ($LASTEXITCODE -ne 0) {
            Write-Host '  Sample generation failed - the app can still run but images will 404.' -ForegroundColor Yellow
        }
    } else {
        Write-Host '  public/samples is incomplete and Python was not found.' -ForegroundColor Yellow
        Write-Host '  Install python + numpy pillow pydicom and run:' -ForegroundColor Yellow
        Write-Host '    python scripts\generate_sample_data.py' -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# 4. Run the requested mode
# ---------------------------------------------------------------------------
$mode = $Mode.ToLowerInvariant()
$targetUrl = "http://localhost:$Port"
$opener = $null

if ($mode -ne 'build' -and -not $NoOpen) {
    # Background watcher: open the browser as soon as the server answers.
    $opener = Start-Job -ArgumentList $targetUrl -ScriptBlock {
        param($target)
        $deadline = (Get-Date).AddSeconds(180)
        $ready = $false
        while ((Get-Date) -lt $deadline) {
            try {
                $response = Invoke-WebRequest -Uri $target -UseBasicParsing -TimeoutSec 2
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready = $true; break }
            } catch {
                Start-Sleep -Milliseconds 700
            }
        }
        if ($ready) { Start-Process $target } else {
            Write-Host "Auto-open skipped: no server detected at $target" -ForegroundColor Yellow
        }
    }
}

try {
    switch ($mode) {
        'build' {
            Write-Step 'Building production bundle...'
            & npm run build
            if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
            Write-Host ''
            Write-Host "Build complete. Run '$($MyInvocation.MyCommand.Path) -Mode start' to serve it." -ForegroundColor Green
        }
        'start' {
            Write-Step "Serving production build at $targetUrl (Ctrl+C to stop)..."
            & npm run start -- -p $Port
        }
        default {
            Write-Step "Starting dev server at $targetUrl (Ctrl+C to stop)..."
            & npm run dev -- -p $Port
        }
    }
    exit $LASTEXITCODE
}
finally {
    if ($opener) {
        Stop-Job $opener -ErrorAction SilentlyContinue
        Remove-Job $opener -Force -ErrorAction SilentlyContinue
    }
}
