# Make the YouTube Shorts thumbnails (1080x1920 jpg) from the recorded short videos (RULES 8.7).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-short-thumbs.ps1 [-Apps a,b]
# The content (frame time, crop, words, colors) is in _dev/promo/short-thumbs.js; the design is _dev/promo/short-thumb.html.
# Steps: ffmpeg takes the frame at t seconds of _dev/promo/out/<app>-short.mp4 -> _dev/promo/out/thumbsrc/<app>.jpg,
# headless Chrome screenshots short-thumb.html?app=<app> (file://, no server needed), ffmpeg turns it into
# _dev/promo/thumbs/<app>-short.jpg (under 2MB, the YouTube limit). Then set it with youtube-upload.ps1 -Thumb.
# Needs ffmpeg on PATH and Chrome or Edge. Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
param([string[]]$Apps = @())
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$promo = Join-Path $root '_dev/promo'
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $promo 'short-thumbs.js')
$outDir = Join-Path $promo 'thumbs'; New-Item -ItemType Directory -Force $outDir | Out-Null
$srcDir = Join-Path $promo 'out/thumbsrc'; New-Item -ItemType Directory -Force $srcDir | Out-Null
$tmp = Join-Path $env:TEMP 'manabi-short-thumbs'; New-Item -ItemType Directory -Force $tmp | Out-Null
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome or Edge not found' }

# app names and frame times from the JS table: lines like  'app': { name: ..., t: 33, ...
$list = [regex]::Matches($cfg, "'([a-z0-9-]+)':\s*\{[^\n]*?\bt:\s*([0-9.]+)") | ForEach-Object { [pscustomobject]@{ App = $_.Groups[1].Value; T = $_.Groups[2].Value } }
$Apps = @($Apps | ForEach-Object { $_ -split ',' } | Where-Object { $_ })   # -File passes "a,b" as one string
if ($Apps.Count) { $list = $list | Where-Object { $Apps -contains $_.App } }
$page = [Uri](Join-Path $promo 'short-thumb.html')
foreach ($e in $list) {
  $app = $e.App
  $mp4 = Join-Path $promo "out/$app-short.mp4"
  if (-not (Test-Path $mp4)) { Write-Host "skip $app (no $mp4)"; continue }
  & ffmpeg -v error -y -ss $e.T -i $mp4 -frames:v 1 -q:v 2 (Join-Path $srcDir "$app.jpg")
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED frame $app"; continue }
  $png = Join-Path $tmp "$app.png"; if (Test-Path $png) { Remove-Item $png }
  Start-Process -FilePath $chrome -Wait -WindowStyle Hidden -ArgumentList @('--headless=new', '--hide-scrollbars', '--no-first-run',
    "--user-data-dir=$tmp\profile", '--allow-file-access-from-files', '--force-device-scale-factor=1', '--window-size=1080,1920',
    '--virtual-time-budget=3000', "--screenshot=$png", "$($page.AbsoluteUri)?app=$app")
  if (-not (Test-Path $png)) { Write-Host "FAILED screenshot $app"; continue }
  $dst = Join-Path $outDir "$app-short.jpg"
  & ffmpeg -v error -y -i $png -q:v 2 $dst
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED jpg $app"; continue }
  Write-Host ("{0}-short.jpg  {1:N0} KB" -f $app, ((Get-Item $dst).Length / 1KB))
}
