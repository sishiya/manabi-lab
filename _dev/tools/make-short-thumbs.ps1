# Make the YouTube Shorts thumbnails (1080x1920 jpg) from the recorded short videos.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-short-thumbs.ps1 [-Apps a,b]
# Reads _dev/promo/short-thumbs.json ({ app: { name, t, lines[2], color } }), takes the frame at t seconds of
# _dev/promo/out/<app>-short.mp4, covers the burned-in caption area with a dark band and writes two big lines,
# the app name and the shishiya mark. Output: _dev/promo/thumbs/<app>-short.jpg (under 2MB, the YouTube limit).
# Needs ffmpeg on PATH. Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
param([string[]]$Apps = @())
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $root '_dev/promo/short-thumbs.json') | ConvertFrom-Json
$outDir = Join-Path $root '_dev/promo/thumbs'; New-Item -ItemType Directory -Force $outDir | Out-Null
$icon = Join-Path $root '_dev/sns-icon/a-lion-glasses.png'
$tmp = Join-Path $env:TEMP 'manabi-short-thumbs'; New-Item -ItemType Directory -Force $tmp | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$font = "'C\:/Windows/Fonts/YuGothB.ttc'"
$brand = -join ([char[]](0x3057,0x3057,0x5C4B,0x0020,0x307E,0x306A,0x3073,0x30E9,0x30DC))   # shishiya manabi lab

# width of a line in "full-width characters" (ASCII counts as about half)
function Get-Em([string]$s) { $n = 0.0; foreach ($c in $s.ToCharArray()) { if ([int]$c -lt 128) { $n += 0.55 } else { $n += 1 } }; $n }

$names = $cfg.PSObject.Properties | Where-Object { $_.Name -notlike '_*' } | ForEach-Object { $_.Name }
$Apps = @($Apps | ForEach-Object { $_ -split ',' } | Where-Object { $_ })   # -File passes "a,b" as one string
if ($Apps.Count) { $names = $names | Where-Object { $Apps -contains $_ } }
foreach ($app in $names) {
  $c = $cfg.$app
  $mp4 = Join-Path $root "_dev/promo/out/$app-short.mp4"
  if (-not (Test-Path $mp4)) { Write-Host "skip $app (no $mp4)"; continue }
  [IO.File]::WriteAllText("$tmp\l1.txt", $c.lines[0], $utf8)
  [IO.File]::WriteAllText("$tmp\l2.txt", $c.lines[1], $utf8)
  [IO.File]::WriteAllText("$tmp\nm.txt", $c.name, $utf8)
  [IO.File]::WriteAllText("$tmp\br.txt", $brand, $utf8)
  $em = [Math]::Max((Get-Em $c.lines[0]), (Get-Em $c.lines[1]))
  $fs = [int][Math]::Min(128, 960 / $em)
  $by = if ($c.band) { [int]$c.band } else { 1040 }   # top of the dark band (it must cover the burned-in captions)
  $y1 = $by + 70; $y2 = $y1 + [int]($fs * 1.3); $yn = $by + 460
  $col = $c.color -replace '#', '0x'
  $fg = @"
[0:v]scale=1080:1920,drawbox=x=0:y=${by}:w=iw:h=560:color=black@0.96:t=fill,drawbox=x=24:y=24:w=430:h=120:color=black@0.85:t=fill,
drawtext=fontfile=${font}:textfile=l1.txt:fontsize=${fs}:fontcolor=white:borderw=7:bordercolor=black@0.85:x=(w-tw)/2:y=${y1},
drawtext=fontfile=${font}:textfile=l2.txt:fontsize=${fs}:fontcolor=${col}:borderw=7:bordercolor=black@0.85:x=(w-tw)/2:y=${y2},
drawtext=fontfile=${font}:textfile=nm.txt:fontsize=50:fontcolor=white@0.9:x=(w-tw)/2:y=${yn}[bg];
[1:v]scale=96:-1[ic];
[bg][ic]overlay=36:36,drawtext=fontfile=${font}:textfile=br.txt:fontsize=40:fontcolor=white:borderw=4:bordercolor=black@0.7:x=146:y=64[out]
"@
  [IO.File]::WriteAllText("$tmp\fg.txt", ($fg -replace "`r?`n", ''), $utf8)
  $dst = Join-Path $outDir "$app-short.jpg"
  Push-Location $tmp
  try {
    & ffmpeg -v error -y -ss $c.t -i $mp4 -i $icon '-/filter_complex' fg.txt -map '[out]' -frames:v 1 -q:v 3 $dst
  } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED $app"; continue }
  Write-Host ("{0}  {1:N0} KB" -f $dst, ((Get-Item $dst).Length / 1KB))
}
