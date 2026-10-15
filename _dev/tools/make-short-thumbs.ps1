# Make the promo video thumbnails from the recorded short videos (RULES 8.7): <app>-short.jpg (1080x1920, Shorts)
# and <app>-guide.jpg (1280x720, the long guide video), same design and words.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-short-thumbs.ps1 [-Apps a,b]
# The content (frame time, crop, words, colors) is in _dev/promo/short-thumbs.js; the design is _dev/promo/short-thumb.html.
# Steps: ffmpeg takes the frame at t seconds of _dev/promo/out/<app>-short.mp4 -> _dev/promo/out/thumbsrc/<app>.jpg,
# headless Chrome screenshots short-thumb.html?app=<app> (file://, no server needed), ffmpeg turns it into
# _dev/promo/thumbs/<app>-short.jpg (under 2MB, the YouTube limit). Then set it with youtube-upload.ps1 -Thumb.
# still: 'stills/x.jpg' in the table uses that picture (2160x3840, kept in Git) instead of a frame of the mp4.
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
$list = [regex]::Matches($cfg, "'([a-z0-9-]+)':\s*\{([^\n]*?)\bt:\s*([0-9.]+)([^\n]*)") | ForEach-Object {
  $still = [regex]::Match($_.Groups[2].Value + $_.Groups[4].Value, "\bstill:\s*'([^']+)'")
  [pscustomobject]@{ App = $_.Groups[1].Value; T = $_.Groups[3].Value; Still = $(if ($still.Success) { $still.Groups[1].Value } else { '' }) } }
$Apps = @($Apps | ForEach-Object { $_ -split ',' } | Where-Object { $_ })   # -File passes "a,b" as one string
if ($Apps.Count) { $list = $list | Where-Object { $Apps -contains $_.App } }
$page = [Uri](Join-Path $promo 'short-thumb.html')
foreach ($e in $list) {
  $app = $e.App
  $mp4 = Join-Path $promo "out/$app-short.mp4"
  if (-not (Test-Path $mp4)) { Write-Host "skip $app (no $mp4)"; continue }
  if ($e.Still) { Copy-Item -Force (Join-Path $promo $e.Still) (Join-Path $srcDir "$app.jpg"); $global:LASTEXITCODE = 0 }
  else { & ffmpeg -v error -y -ss $e.T -i $mp4 -frames:v 1 -q:v 2 (Join-Path $srcDir "$app.jpg") }
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED frame $app"; continue }
  # two sizes from the same frame: the short (1080x1920) and the long guide video (1280x720, ?wide)
  foreach ($k in @(@{ Kind = 'short'; Size = '1080,1920'; Q = '' }, @{ Kind = 'guide'; Size = '1280,720'; Q = '&wide' })) {
    $png = Join-Path $tmp "$app-$($k.Kind).png"; if (Test-Path $png) { Remove-Item $png }
    Start-Process -FilePath $chrome -Wait -WindowStyle Hidden -ArgumentList @('--headless=new', '--hide-scrollbars', '--no-first-run',
      "--user-data-dir=$tmp\profile", '--allow-file-access-from-files', '--force-device-scale-factor=1', "--window-size=$($k.Size)",
      '--virtual-time-budget=3000', "--screenshot=$png", "$($page.AbsoluteUri)?app=$app$($k.Q)")
    if (-not (Test-Path $png)) { Write-Host "FAILED screenshot $app $($k.Kind)"; continue }
    $dst = Join-Path $outDir "$app-$($k.Kind).jpg"
    & ffmpeg -v error -y -i $png -q:v 2 $dst
    if ($LASTEXITCODE -ne 0) { Write-Host "FAILED jpg $app $($k.Kind)"; continue }
    Write-Host ("{0}-{1}.jpg  {2:N0} KB" -f $app, $k.Kind, ((Get-Item $dst).Length / 1KB))
  }
}
