$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Push-Location orchestrator
npm install
npm test
Pop-Location

Push-Location desktop-runner
python -m pytest
Pop-Location
