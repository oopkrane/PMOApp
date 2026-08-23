[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$NpmCommand,

    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $ProjectRoot
$host.UI.RawUI.WindowTitle = "PMOApp Server - close this window to stop"

Write-Host "PMOApp is starting at http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "Keep this window open. Press Ctrl+C or close it to stop PMOApp." -ForegroundColor DarkGray
Write-Host ""

& $NpmCommand run dev -- --host 127.0.0.1 --port 5173 --strictPort
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "PMOApp stopped with exit code $LASTEXITCODE." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit $LASTEXITCODE
}

