$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = "$root\.venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    throw "Project Python was not found at $python. Create or select the .venv environment first."
}

$occupiedPorts = Get-NetTCPConnection -State Listen -LocalPort 8020, 8091 -ErrorAction SilentlyContinue
if ($occupiedPorts) {
    $ports = ($occupiedPorts | Select-Object -ExpandProperty LocalPort -Unique) -join ", "
    throw "Port(s) $ports are already in use. Run .\stop-dev.ps1, then try again."
}

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$root\backend'; & '$python' run.py"
)

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "npm --prefix '$root\frontend' run dev"
)

Write-Host "Starting CircUIt backend at http://127.0.0.1:8020 with Uvicorn reload."
Write-Host "Starting CircUIt frontend at http://127.0.0.1:8091 with Vite hot reload."
Write-Host "Make sure the workflow_builder backend is also running (see WORKFLOW_BUILDER_API_URL in .env)."
