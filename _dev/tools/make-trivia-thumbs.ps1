# Make the trivia short thumbnails (RULES 8.7): _dev/promo/thumbs/<page>.jpg (1080x1920).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-trivia-thumbs.ps1 [-Pages a,b]
# The content (frame time, words) is in _dev/promo/trivia-thumbs.js; the design is _dev/promo/trivia-thumb.html.
# Steps: ffmpeg takes the frame at t seconds of out/<page>-short.mp4 -> out/thumbsrc/<page>.jpg,
# headless Chrome screenshots trivia-thumb.html?page=<page> (file://), ffmpeg makes the jpg (under 2MB).
# Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
param([string[]]$Pages = @())
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
$list = [regex]::Matches($cfg, "'([a-z0-9-]+)':\s*\{\s*t:\s*([0-9.]+)") | ForEach-Object { [pscustomobject]@{ Page = $_.Groups[1].Value; T = $_.Groups[2].Value } }
$Pages = @($Pages | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
if ($Pages.Count) { $list = $list | Where-Object { $Pages -contains $_.Page } }
$html = [Uri](Join-Path $promo 'trivia-thumb.html')
foreach ($e in $list) {
  $p = $e.Page
  $mp4 = Join-Path $promo "out/$p-short.mp4"
  if (-not (Test-Path $mp4)) { Write-Host "skip $p (no $mp4)"; continue }
  & ffmpeg -v error -y -ss $e.T -i $mp4 -frames:v 1 -q:v 2 (Join-Path $srcDir "$p.jpg")
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED frame $p"; continue }
  $png = Join-Path $tmp "$p.png"; if (Test-Path $png) { Remove-Item $png }
  Start-Process -FilePath $chrome -Wait -WindowStyle Hidden -ArgumentList @('--headless=new', '--hide-scrollbars', '--no-first-run',
    "--user-data-dir=$tmp\profile", '--allow-file-access-from-files', '--force-device-scale-factor=1', '--window-size=1080,1920',
    '--virtual-time-budget=5000', "--screenshot=$png", "$($html.AbsoluteUri)?page=$p")
  if (-not (Test-Path $png)) { Write-Host "FAILED screenshot $p"; continue }
  $dst = Join-Path $outDir "$p.jpg"
  & ffmpeg -v error -y -i $png -q:v 2 $dst
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED jpg $p"; continue }
  Write-Host ("{0}.jpg  {1:N0} KB" -f $p, ((Get-Item $dst).Length / 1KB))
}
