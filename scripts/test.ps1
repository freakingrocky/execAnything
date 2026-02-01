$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Push-Location orchestrator
npm install
npm test
Pop-Location

Push-Location desktop-runner

$venvPy = Join-Path (Get-Location) ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPy)) {
  py -3.11 -m venv .venv
}

& $venvPy -m pip install -U pip
& $venvPy -m pip install -e .
& $venvPy -m pip install pytest
& $venvPy -m pytest -q

Pop-Location
