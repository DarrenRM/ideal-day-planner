$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeHome = Join-Path $env:LOCALAPPDATA "IdealDay"
$logHome = Join-Path $runtimeHome "logs"
$logPath = Join-Path $logHome "bridge.log"
$workerOutPath = Join-Path $logHome "bridge-worker.out.log"
$workerErrPath = Join-Path $logHome "bridge-worker.err.log"
$bridgeTokenPath = Join-Path $runtimeHome "bridge-token.clixml"
$sitesTokenPath = Join-Path $runtimeHome "sites-bypass-token.clixml"
$hermesExe = Join-Path $env:LOCALAPPDATA "hermes\hermes-agent\bin\hermes.exe"
$nodeExe = "C:\Program Files\nodejs\node.exe"

New-Item -ItemType Directory -Path $logHome -Force | Out-Null
if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 5MB) {
  Move-Item -LiteralPath $logPath -Destination "$logPath.1" -Force
}

function Write-BridgeLog([string] $message) {
  "$(Get-Date -Format o) $message" | Out-File -LiteralPath $logPath -Append -Encoding utf8
}

function Test-HermesPort {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $connect = $client.BeginConnect("127.0.0.1", 8643, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(1000)) { return $false }
    $client.EndConnect($connect)
    return $true
  } catch { return $false }
  finally { $client.Dispose() }
}

function Read-ProtectedToken([string] $path) {
  $credential = Import-Clixml -LiteralPath $path
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

try {
  if (-not $env:IDEAL_DAY_APP_URL) { throw "Set the IDEAL_DAY_APP_URL environment variable to the app's URL." }
  $env:IDEAL_DAY_HERMES_URL = "http://127.0.0.1:8643"
  $env:IDEAL_DAY_HERMES_HOME = Join-Path $env:LOCALAPPDATA "hermes\profiles\ideal-day"
  $env:IDEAL_DAY_BRIDGE_TOKEN = Read-ProtectedToken $bridgeTokenPath
  $env:IDEAL_DAY_SITES_BYPASS_TOKEN = Read-ProtectedToken $sitesTokenPath

  $hermesRunning = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "hermes.exe" -and $_.CommandLine -match "-p ideal-day gateway run"
  }
  if (-not $hermesRunning) {
    Write-BridgeLog "Starting the ideal-day Hermes gateway."
    Start-Process -FilePath $hermesExe -ArgumentList @("-p", "ideal-day", "gateway", "run") -WindowStyle Hidden
  }

  $readyDeadline = (Get-Date).AddSeconds(30)
  while (-not (Test-HermesPort)) {
    if ((Get-Date) -ge $readyDeadline) { throw "Hermes did not open port 8643 within 30 seconds." }
    Start-Sleep -Milliseconds 750
  }

  Set-Location -LiteralPath $projectRoot
  $bridgePath = Join-Path $projectRoot "bridge\ideal-day-bridge.mjs"
  do {
    Write-BridgeLog "Starting the Ideal Day bridge worker."
    $bridgeProcess = Start-Process `
      -FilePath $nodeExe `
      -ArgumentList @("`"$bridgePath`"") `
      -WindowStyle Hidden `
      -PassThru `
      -Wait `
      -RedirectStandardOutput $workerOutPath `
      -RedirectStandardError $workerErrPath
    $bridgeExitCode = $bridgeProcess.ExitCode
    if ((Test-Path -LiteralPath $workerErrPath) -and (Get-Item -LiteralPath $workerErrPath).Length -gt 0) {
      Get-Content -LiteralPath $workerErrPath -Tail 40 | ForEach-Object { Write-BridgeLog "Worker stderr: $_" }
    }
    Write-BridgeLog "Bridge worker exited with code $bridgeExitCode."
    # The worker drains its active lease, then requests a fresh process when any
    # bridge source changes. Unexpected failures stay with the bounded watchdog.
    if ($bridgeExitCode -eq 75) { Start-Sleep -Seconds 2 }
  } while ($bridgeExitCode -eq 75)
  exit $bridgeExitCode
} catch {
  Write-BridgeLog "Bridge startup failed: $($_.Exception.Message)"
  exit 1
}
