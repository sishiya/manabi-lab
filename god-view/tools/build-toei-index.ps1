# 都営バスのバス停・都営地下鉄などの駅の座標の一覧を作る → god-view/data/toei.js
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File god-view/tools/build-toei-index.ps1
# データ: 公共交通オープンデータセンターの公開 API（キー不要）。東京都交通局のデータは CC BY 4.0。
# バスの位置（リアルタイム）は「どのバス停からどのバス停へ」しかないので、バス停の座標をアプリに持たせる。
param([string]$Out = "$PSScriptRoot/../data/toei.js")
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$B = 'https://api-public.odpt.org/api/v4'
$wc = New-Object Net.WebClient
$wc.Encoding = [Text.Encoding]::UTF8
$inv = [Globalization.CultureInfo]::InvariantCulture
function J($s) { ($s -replace '\\', '\\' -replace "'", "\'") }

Write-Host 'バス停を読んでいます（約 6MB）…'
$poles = $wc.DownloadString("$B/odpt:BusstopPole?odpt:operator=odpt.Operator:Toei") | ConvertFrom-Json
$stops = New-Object Collections.ArrayList
foreach ($p in $poles) {
  if ($null -eq $p.'geo:lat') { continue }
  $id = $p.'owl:sameAs'.Replace('odpt.BusstopPole:Toei.', '')
  [void]$stops.Add("'$(J $id)':[$($p.'geo:long'.ToString('F6', $inv)),$($p.'geo:lat'.ToString('F6', $inv)),'$(J $p.'dc:title')']")
}
Write-Host "バス停: $($stops.Count)"

Write-Host '駅と路線を読んでいます…'
$sts = $wc.DownloadString("$B/odpt:Station?odpt:operator=odpt.Operator:Toei") | ConvertFrom-Json
$stations = New-Object Collections.ArrayList
foreach ($s in $sts) {
  if ($null -eq $s.'geo:lat') { continue }
  $id = $s.'owl:sameAs'.Replace('odpt.Station:Toei.', '')
  [void]$stations.Add("'$(J $id)':[$($s.'geo:long'.ToString('F6', $inv)),$($s.'geo:lat'.ToString('F6', $inv)),'$(J $s.'dc:title')']")
}
$rws = $wc.DownloadString("$B/odpt:Railway?odpt:operator=odpt.Operator:Toei") | ConvertFrom-Json
$railways = New-Object Collections.ArrayList
foreach ($r in $rws) {
  $id = $r.'owl:sameAs'.Replace('odpt.Railway:Toei.', '')
  $order = ($r.'odpt:stationOrder' | Sort-Object { [int]$_.'odpt:index' } | ForEach-Object { "'" + $_.'odpt:station'.Replace('odpt.Station:Toei.', '') + "'" }) -join ','
  $color = if ($r.'odpt:color') { $r.'odpt:color' } else { '#888888' }
  [void]$railways.Add("'$(J $id)':{title:'$(J $r.'dc:title')',color:'$color',order:[$order]}")
}
Write-Host "駅: $($stations.Count)  路線: $($railways.Count)"

$txt = @"
// toei.js — 都営バスのバス停・都営の駅と路線の座標。tools/build-toei-index.ps1 で自動生成（手で直さない）
// 作成: $(Get-Date -Format 'yyyy-MM-dd')  出典: 東京都交通局・公共交通オープンデータセンター（CC BY 4.0）
// バス停: id（'odpt.BusstopPole:Toei.' を省いたもの）-> [経度, 緯度, 名前]
'use strict';
window.GV = window.GV || {};
GV.TOEI = {
stops: {
$($stops -join ",`n")
},
stations: {
$($stations -join ",`n")
},
railways: {
$($railways -join ",`n")
},
};
"@
[IO.File]::WriteAllText($Out, $txt, (New-Object Text.UTF8Encoding($false)))
Write-Host "書き出しました: $Out （$([int]((Get-Item $Out).Length / 1024)) KB）"
