[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$applicationUrl = "http://127.0.0.1:5173"

function Test-PmoAppRunning {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $applicationUrl -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match "PMO Workspace"
    }
    catch {
        return $false
    }
}

function Find-NpmCommand {
    $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $wingetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
    if (Test-Path -LiteralPath $wingetRoot) {
        $candidate = Get-ChildItem -Path $wingetRoot -Filter npm.cmd -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -like "*OpenJS.NodeJS*" } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($candidate) {
            return $candidate.FullName
        }
    }

    throw "Node.js was not found. Install the Node.js LTS release, then run PMOApp.cmd again."
}

function Start-OllamaIfNeeded {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 | Out-Null
        return
    }
    catch {
        # Continue and try to start the local service.
    }

    $ollamaCommand = Get-Command ollama.exe -ErrorAction SilentlyContinue
    $ollamaPath = if ($ollamaCommand) {
        $ollamaCommand.Source
    }
    else {
        Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    }

    if (Test-Path -LiteralPath $ollamaPath) {
        Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
    }
    else {
        Write-Warning "Ollama is not installed. PMOApp will open, but AI functions will remain unavailable."
    }
}

Start-OllamaIfNeeded

if (Test-PmoAppRunning) {
    Start-Process $applicationUrl
    exit 0
}

$npmCommand = Find-NpmCommand
$nodeModules = Join-Path $projectRoot "node_modules"

if (-not (Test-Path -LiteralPath $nodeModules)) {
    Write-Host "Installing PMOApp dependencies for the first launch..." -ForegroundColor Cyan
    Push-Location $projectRoot
    try {
        & $npmCommand install
        if ($LASTEXITCODE -ne 0) {
            throw "Dependency installation failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

$serverScript = Join-Path $PSScriptRoot "run-pmoapp-server.ps1"
Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $serverScript,
    "-NpmCommand", $npmCommand,
    "-ProjectRoot", $projectRoot
)

Write-Host "Starting PMOApp..." -ForegroundColor Cyan
for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    if (Test-PmoAppRunning) {
        Start-Process $applicationUrl
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

throw "PMOApp did not become available at $applicationUrl. Check the PMOApp server window for details."
