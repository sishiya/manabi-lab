# Make the trivia short thumbnails (RULES 8.7): _dev/promo/thumbs/<page>.jpg (1080x1920).
# Usage (start the local server "apps" first): powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-trivia-thumbs.ps1 [-Pages a,b] [-Look a|b|c] (default b)
# The content (art time, crop, title, line) is in _dev/promo/trivia-thumbs.js; the design is _dev/promo/trivia-thumb.html.
# Steps: headless Chrome opens <page>.html?short&thumbart=<t> (art only, no text) -> out/thumbsrc/<page>.png,
# then screenshots trivia-thumb.html?page=<page>&look=<Look>, ffmpeg makes the jpg (under 2MB).
# Not a raw video frame any more (2026-11-07: it looked like an auto-cropped screenshot).
# Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
param([string[]]$Pages = @(), [string]$Look = 'b', [int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$promo = Join-Path $root '_dev/promo'
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $promo 'trivia-thumbs.js')
$outDir = Join-Path $promo 'thumbs'; New-Item -ItemType Directory -Force $outDir | Out-Null
$srcDir = Join-Path $promo 'out/thumbsrc'; New-Item -ItemType Directory -Force $srcDir | Out-Null
$tmp = Join-Path $env:TEMP 'manabi-trivia-thumbs'; New-Item -ItemType Directory -Force $tmp | Out-Null
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome or Edge not found' }
$base = "http://localhost:$Port/_dev/promo"
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "$base/trivia-thumb.html" | Out-Null } catch { throw "local server not running on port $Port (start 'apps' in .claude/launch.json)" }
function Shot([string]$url, [string]$png) {
  if (Test-Path $png) { Remove-Item $png }
  Start-Process -FilePath $chrome -Wait -WindowStyle Hidden -ArgumentList @('--headless=new', '--hide-scrollbars', '--no-first-run',
    "--user-data-dir=$tmp\profile", '--force-device-scale-factor=1', '--window-size=1080,1920',
    '--virtual-time-budget=8000', "--screenshot=$png", $url)
  return (Test-Path $png)
}
$list = [regex]::Matches($cfg, "'([a-z0-9-]+)':\s*\{\s*t:\s*([0-9.]+)") | ForEach-Object { [pscustomobject]@{ Page = $_.Groups[1].Value; T = $_.Groups[2].Value } }
$Pages = @($Pages | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
if ($Pages.Count) { $list = $list | Where-Object { $Pages -contains $_.Page } }
foreach ($e in $list) {
  $p = $e.Page
  if (-not (Shot "$base/$p.html?short&thumbart=$($e.T)" (Join-Path $srcDir "$p.png"))) { Write-Host "FAILED art $p"; continue }
  $png = Join-Path $tmp "$p.png"
  if (-not (Shot "$base/trivia-thumb.html?page=$p&look=$Look" $png)) { Write-Host "FAILED screenshot $p"; continue }
  $dst = Join-Path $outDir "$p.jpg"
  & ffmpeg -v error -y -i $png -q:v 2 $dst
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED jpg $p"; continue }
  Write-Host ("{0}.jpg  {1:N0} KB" -f $p, ((Get-Item $dst).Length / 1KB))
}
