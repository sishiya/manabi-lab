# 恒星の一覧を作る → god-view/data/stars.js
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File god-view/tools/build-stars.ps1
# 元: HYG Database v4.1（David Nash / astronexus、CC BY-SA 4.0）。約12万個から、
#   肉眼で見える明るさ（6.0 等級まで）か、太陽から 20 パーセク（約65光年）以内の星だけを選ぶ。
# 位置は HYG の x,y,z（太陽を原点、赤道座標、パーセク）。
param([string]$Out = "$PSScriptRoot/../data/stars.js", [double]$MaxMag = 6.0, [double]$MaxDist = 20)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$csv = Join-Path $env:TEMP 'hygdata_v41.csv'
if (-not (Test-Path $csv)) {
  Write-Host 'HYG を読んでいます（約 34MB）…'
  (New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv', $csv)
}
$inv = [Globalization.CultureInfo]::InvariantCulture
$rows = New-Object Collections.ArrayList
$n = 0
Import-Csv $csv | ForEach-Object {
  $n++
  if ($_.id -eq '0') { return }                       # 太陽は別に描く
  $mag = [double]::Parse($_.mag, $inv); $dist = [double]::Parse($_.dist, $inv)
  if ($dist -le 0 -or $dist -ge 100000) { return }    # 距離が不明なもの
  if ($mag -gt $MaxMag -and $dist -gt $MaxDist) { return }
  $ci = 0.65; if ($_.ci) { $ci = [double]::Parse($_.ci, $inv) }
  $name = ($_.proper -replace "'", '')
  $f = { param($v) [Math]::Round([double]::Parse($v, $inv), 3).ToString($inv) }
  [void]$rows.Add("[$(& $f $_.x),$(& $f $_.y),$(& $f $_.z),$([Math]::Round($mag,2).ToString($inv)),$([Math]::Round($ci,2).ToString($inv)),'$name']")
}
$txt = @"
// stars.js — 恒星の一覧。tools/build-stars.ps1 で自動生成（手で直さない）
// 作成: $(Get-Date -Format 'yyyy-MM-dd')
// 出典: HYG Database v4.1（David Nash / astronexus、https://github.com/astronexus/HYG-Database）。CC BY-SA 4.0。
//       このファイルも CC BY-SA 4.0（元データから明るさ・距離で選び、桁を丸めたもの）。
// 1行 = [x, y, z（パーセク、太陽が原点・赤道座標）, 見かけの等級, 色指数 B-V, 名前（英語。あるものだけ）]
// 選んだ星: $MaxMag 等級より明るいか、$MaxDist パーセク以内（元の $n 個から $($rows.Count) 個）
'use strict';
window.GV = window.GV || {};
GV.STARS = [
$($rows -join ",`n")
];
"@
[IO.File]::WriteAllText($Out, $txt, (New-Object Text.UTF8Encoding($false)))
Write-Host "書き出しました: $Out （$($rows.Count) 個、$([int]((Get-Item $Out).Length / 1024)) KB）"
