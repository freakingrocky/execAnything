$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Push-Location orchestrator
npm install
npm test
Pop-Location

Push-Location web-runner
npm install
npm test
Pop-Location

Push-Location synthesizer
npm install
npm test
Pop-Location

Push-Location packages/shared
npm install
npm test
Pop-Location

$repoRoot = Get-Location
$venvDir = Join-Path $repoRoot ".venv"
$venvPy = Join-Path $venvDir "Scripts\python.exe"

if (-not (Test-Path $venvPy)) {
  py -3.11 -m venv $venvDir
}

& $venvPy -m pip install -U pip
& $venvPy -m pip install -e "${repoRoot}\desktop-runner"
& $venvPy -m pip install -e "${repoRoot}\recorder-desktop"
& $venvPy -m pip install pytest
& $venvPy -m pytest -q "${repoRoot}\desktop-runner\tests" "${repoRoot}\recorder-desktop\tests"
