$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Push-Location orchestrator
npm install
npm test
Pop-Location

Push-Location desktop-runner
python -m pip install --upgrade pip
python -m pip install -e .
python -m pip install pytest
python -m pytest
Pop-Location
