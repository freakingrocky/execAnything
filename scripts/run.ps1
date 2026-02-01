$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Ensure-NodeModules {
  param(
    [string]$Path,
    [string]$RequiredBinary
  )
  if (-not (Test-Path (Join-Path $Path "package.json"))) {
    throw "package.json not found in $Path"
  }
  $needsInstall = -not (Test-Path (Join-Path $Path "node_modules"))
  if ($RequiredBinary) {
    $binaryPath = Join-Path $Path $RequiredBinary
    if (-not (Test-Path $binaryPath)) {
      $needsInstall = $true
    }
  }
  if ($needsInstall) {
    Push-Location $Path
    npm install
    Pop-Location
  }
}

function Ensure-Playwright {
  param([string]$WebRunnerPath)
  $cachePath = Join-Path $WebRunnerPath "node_modules\.cache\ms-playwright"
  Push-Location $WebRunnerPath
  if (-not (Test-Path $cachePath)) {
    npx playwright install --with-deps chromium
  } else {
    npx playwright install chromium
  }
  Pop-Location
}

function Ensure-PythonEnv {
  param([string]$RootPath)
  $venvDir = Join-Path $RootPath ".venv"
  $venvPy = Join-Path $venvDir "Scripts\python.exe"
  if (-not (Test-Path $venvPy)) {
    py -3.11 -m venv $venvDir
  }
  & $venvPy -m pip install -U pip
  & $venvPy -m pip install -e (Join-Path $RootPath "desktop-runner")
  & $venvPy -m pip install -e (Join-Path $RootPath "recorder-desktop")
  return $venvPy
}

function Write-OrchestratorConfig {
  param(
    [string]$ConfigPath,
    [string]$PythonExecutable,
    [string]$RootPath
  )
  $config = @{
    desktopRunner = @{
      pythonExecutable = $PythonExecutable
      module = "desktop_runner.server"
      requestTimeoutMs = 10000
      spawnTimeoutMs = 5000
      pythonPath = @((Join-Path $RootPath "desktop-runner\src"))
    }
    webRunner = @{
      browser = "chromium"
      headless = $true
    }
    runtime = @{
      defaultTimeoutMs = 30000
    }
  }
  $config | ConvertTo-Json -Depth 4 | Set-Content -Path $ConfigPath
}

$webRunnerPath = Join-Path $repoRoot "web-runner"
$orchestratorPath = Join-Path $repoRoot "orchestrator"
$uiServerPath = Join-Path $repoRoot "apps\ui-server"
$uiPath = Join-Path $repoRoot "apps\ui"

Ensure-NodeModules $webRunnerPath
Ensure-NodeModules $orchestratorPath "node_modules\.bin\ts-node.cmd"
Ensure-NodeModules $uiServerPath
Ensure-NodeModules $uiPath
Ensure-Playwright $webRunnerPath

$pythonExe = Ensure-PythonEnv $repoRoot
$configPath = Join-Path $repoRoot "ui.config.json"
Write-OrchestratorConfig -ConfigPath $configPath -PythonExecutable $pythonExe -RootPath $repoRoot

Push-Location $uiServerPath
npm run build
Pop-Location

$env:AI_RPA_PYTHON = $pythonExe
$env:AI_RPA_ORCHESTRATOR_CONFIG = $configPath

$serverProcess = Start-Process -FilePath "npm" -ArgumentList "run", "start" -WorkingDirectory $uiServerPath -PassThru
$uiProcess = Start-Process -FilePath "npm" -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173" -WorkingDirectory $uiPath -PassThru

Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"

try {
  Wait-Process -Id $uiProcess.Id
} finally {
  if (!$serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id
  }
  if (!$uiProcess.HasExited) {
    Stop-Process -Id $uiProcess.Id
  }
}
