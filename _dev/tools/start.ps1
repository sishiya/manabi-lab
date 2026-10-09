# Start the local file server if it is not running yet, then open the entrance page (or one app) in the browser.
# Called from start.bat in the project root. Usage: start.ps1 [app-folder]
# Ports 8765/8766 can be reserved by Windows (excluded port ranges), so try a list and use the first that works.
# Keep this file ASCII only: Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page.
param([string]$App = '')
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
$ports = 8765, 8766, 8767, 8780, 8790, 18765, 28765

# a server of this project answers /index.html with the entrance page (it links to the manabi-lab repository)
function Test-Ours([int]$p) {
  try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:$p/index.html").Content -match 'manabi-lab' } catch { $false }
}
function Test-Free([int]$p) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $l.Stop(); $true } catch { $false } finally { $l.Close() }
}

$port = $ports | Where-Object { Test-Ours $_ } | Select-Object -First 1
if ($port) {
  Write-Host "server already running on port $port"
} else {
  $port = $ports | Where-Object { Test-Free $_ } | Select-Object -First 1
  if (-not $port) { Write-Host "no usable port in: $($ports -join ', ')"; exit 1 }
  Write-Host "starting server on port $port (minimized window; close it to stop the server)"
  Start-Process powershell -WindowStyle Minimized -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$root\.claude\serve.ps1`"", '-Port', $port)
  for ($i = 0; $i -lt 40 -and -not (Test-Ours $port); $i++) { Start-Sleep -Milliseconds 250 }
  if (-not (Test-Ours $port)) { Write-Host "server did not answer on port $port"; exit 1 }
}

$path = if ($App) { $App.Trim('\', '/') + '/' } else { '' }
Start-Process "http://localhost:$port/$path"
