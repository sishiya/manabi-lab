# 紹介動画の音量を確かめる（RULES 8.6。2026-10-12〜）。読むだけ。
# ffmpeg の ebur128 で、mp4 の積分ラウドネス（LUFS、YouTube などと同じものさし）とトゥルーピークを測り、
# 決めた範囲（promo-audio.js の LOUD: 全体 -21.5〜-18.5 LUFS、ピーク -1 dBTP 以下）から外れたものを NG にする。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-loudness.ps1                 # out/ の mp4 ぜんぶ（before- は除く）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-loudness.ps1 -Name black-hole # 名前に black-hole を含むものだけ
# 直し方: _dev/tools/record-promo.ps1 -Script <台本> [-Short] -AudioOnly（映像はそのまま、音だけ作りなおす）
param(
  [string]$Name = '',
  [double]$Min = -21.5,
  [double]$Max = -18.5,
  [double]$PeakMax = -1.0
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$files = Get-ChildItem (Join-Path $root '_dev/promo/out') -Filter '*.mp4' | Where-Object { $_.Name -notmatch '\.before-' -and $_.Name -like "*$Name*" } | Sort-Object Name
$ng = 0
foreach ($f in $files) {
  $ErrorActionPreference = 'Continue'
  $txt = (& ffmpeg -hide_banner -nostats -i $f.FullName -vn -af 'ebur128=peak=true:framelog=quiet' -f null - 2>&1) -join "`n"
  $ErrorActionPreference = 'Stop'
  $i = if ($txt -match '(?s)Integrated loudness:\s*I:\s*(-?[\d.]+|-inf)') { $Matches[1] } else { 'NaN' }
  $p = if ($txt -match '(?s)True peak:\s*Peak:\s*(-?[\d.]+|-inf)') { $Matches[1] } else { 'NaN' }
  $iv = if ($i -eq '-inf' -or $i -eq 'NaN') { -999 } else { [double]$i }
  $pv = if ($p -eq '-inf' -or $p -eq 'NaN') { -999 } else { [double]$p }
  $ok = $iv -ge $Min -and $iv -le $Max -and $pv -le $PeakMax
  if (-not $ok) { $ng++ }
  '{0,-34} {1,7} LUFS  ピーク {2,6} dBTP  {3}' -f $f.BaseName, $i, $p, $(if ($ok) { 'OK' } else { 'NG' })
}
Write-Host ''
if ($ng) { Write-Host "音量 NG: $ng 本（範囲 $Min〜$Max LUFS、ピーク $PeakMax dBTP 以下）"; exit 1 } else { Write-Host "音量: すべて OK（$($files.Count) 本）" }
