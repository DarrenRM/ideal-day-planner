$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeHome = Join-Path $env:LOCALAPPDATA "IdealDay"
$bridgeTokenPath = Join-Path $runtimeHome "bridge-token.clixml"
$sitesTokenPath = Join-Path $runtimeHome "sites-bypass-token.clixml"
$hermesExe = Join-Path $env:LOCALAPPDATA "hermes\hermes-agent\bin\hermes.exe"
$nodeExe = "C:\Program Files\nodejs\node.exe"

function Read-ProtectedToken([string] $path) {
  $credential = Import-Clixml -LiteralPath $path
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$env:IDEAL_DAY_APP_URL = "https://ideal-day-sites.example"
$env:IDEAL_DAY_HERMES_URL = "http://127.0.0.1:8643"
$env:IDEAL_DAY_HERMES_HOME = Join-Path $env:LOCALAPPDATA "hermes\profiles\ideal-day"
$env:IDEAL_DAY_BRIDGE_TOKEN = Read-ProtectedToken $bridgeTokenPath
$env:IDEAL_DAY_SITES_BYPASS_TOKEN = Read-ProtectedToken $sitesTokenPath

$hermesRunning = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "hermes.exe" -and $_.CommandLine -match "-p ideal-day gateway run"
}
if (-not $hermesRunning) {
  Start-Process -FilePath $hermesExe -ArgumentList @("-p", "ideal-day", "gateway", "run") -WindowStyle Hidden
  Start-Sleep -Seconds 4
}

Set-Location -LiteralPath $projectRoot
& $nodeExe (Join-Path $projectRoot "bridge\ideal-day-bridge.mjs")
exit $LASTEXITCODE
