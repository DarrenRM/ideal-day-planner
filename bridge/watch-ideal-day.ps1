$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $projectRoot "bridge\start-ideal-day.ps1"
$powershellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$bridgeRunning = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -match "ideal-day-bridge\.mjs"
}

if ($bridgeRunning) { exit 0 }

Start-Process `
  -FilePath $powershellExe `
  -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", "`"$startScript`"") `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden

exit 0
