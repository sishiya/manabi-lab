# PLATEAU の建物（3D Tiles）の索引を作る → god-view/data/plateau-bldg.js
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File god-view/tools/build-plateau-index.ps1
# PLATEAU のデータカタログ API（キー不要）から建物モデルを集め、区・市ごとに LOD1／LOD2 の URL と、
# tileset.json の先頭だけを読んで（Range 要求）範囲（緯度経度）を取る。数分かかる。
param([string]$Out = "$PSScriptRoot/../data/plateau-bldg.js")

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$PREFIX = 'https://assets.cms.plateau.reearth.io/assets/'

Write-Host 'カタログを読んでいます…'
$wc = New-Object Net.WebClient
$wc.Encoding = [Text.Encoding]::UTF8
$cat = ($wc.DownloadString('https://api.plateau.reearth.io/datacatalog/plateau-datasets') | ConvertFrom-Json).datasets
$bldg = $cat | Where-Object { $_.type_en -eq 'bldg' -and $_.format -eq '3D Tiles' }
Write-Host "建物モデル: $($bldg.Count) 件"

function Get-Region([string]$url) {
  $req = [Net.HttpWebRequest]::Create($url)
  $req.AddRange(0, 40000)
  $req.Timeout = 30000
  $res = $req.GetResponse()
  $sr = New-Object IO.StreamReader($res.GetResponseStream(), [Text.Encoding]::UTF8)
  $txt = $sr.ReadToEnd(); $sr.Close(); $res.Close()
  $flat = $txt -replace '\s', ''
  $m = [regex]::Match($flat, '"root":\{"boundingVolume":\{"region":\[([^\]]+)\]')
  if (-not $m.Success) { return $null }
  $r = $m.Groups[1].Value.Split(',') | ForEach-Object { [double]$_ * 180 / [Math]::PI }
  return $r[0..3]
}

$areas = $bldg | Group-Object { if ($_.ward_code) { $_.ward_code } else { $_.city_code } }
$rows = New-Object Collections.ArrayList
$i = 0
foreach ($g in $areas) {
  $i++
  # 同じ区・市に年度が複数あれば新しい年度だけ
  $year = ($g.Group | Measure-Object year -Maximum).Maximum
  $ds = $g.Group | Where-Object { $_.year -eq $year }
  $pick = {
    param($lod, $tex)
    $x = $ds | Where-Object { $_.lod -eq "$lod" -and $_.texture -eq $tex } | Select-Object -First 1
    if ($x) { $x.url.Replace($PREFIX, '') } else { '' }
  }
  $l1 = & $pick 1 $true; if (-not $l1) { $l1 = & $pick 1 $false }
  $l2 = & $pick 2 $true
  $l2n = & $pick 2 $false
  $first = $ds | Select-Object -First 1
  $name = $first.pref + $first.city + $(if ($first.ward) { $first.ward } else { '' })
  $probe = @($l1, $l2, $l2n) | Where-Object { $_ } | Select-Object -First 1
  if (-not $probe) { continue }
  try { $reg = Get-Region ($PREFIX + $probe) } catch { Write-Host "  失敗: $name $($_.Exception.Message)"; continue }
  if (-not $reg) { Write-Host "  範囲なし: $name"; continue }
  $bb = ($reg | ForEach-Object { [Math]::Round($_, 4).ToString([Globalization.CultureInfo]::InvariantCulture) }) -join ','
  # 範囲の中心のジオイド高（m）。PLATEAU の高さは楕円体高、地形は標高なので、表示のときこの分だけ建物を下げる
  $geoid = 'null'
  try {
    $lat = ($reg[1] + $reg[3]) / 2; $lon = ($reg[0] + $reg[2]) / 2
    $gq = 'https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/cgi/geoidcalc.pl?outputType=json&latitude={0:F6}&longitude={1:F6}' -f $lat, $lon
    # 日本の陸のジオイド高はおよそ 20〜45m。0 付近が返ったら（サーバーが混んでいるとき）間をあけて取り直す
    for ($try = 0; $try -lt 4; $try++) {
      Start-Sleep -Milliseconds (500 + 1500 * $try)
      $gh = [double](($wc.DownloadString($gq) | ConvertFrom-Json).OutputData.geoidHeight)
      if ($gh -gt 5) { $geoid = $gh.ToString('F2', [Globalization.CultureInfo]::InvariantCulture); break }
    }
    if ($geoid -eq 'null') { Write-Host "  ジオイド高が取れない: $name" }
  } catch { Write-Host "  ジオイド高なし: $name" }
  [void]$rows.Add("['$($g.Name)','$name',$year,[$bb],$geoid,'$l1','$l2','$l2n']")
  if ($i % 25 -eq 0) { Write-Host "  $i / $($areas.Count)" }
}

$head = @"
// plateau-bldg.js — PLATEAU 建物モデル（3D Tiles）の索引。tools/build-plateau-index.ps1 で自動生成（手で直さない）
// 作成: $(Get-Date -Format 'yyyy-MM-dd')  出典: 国土交通省 PLATEAU（データカタログ API）
// 1行 = [区・市のコード, 名前, 年度, [西,南,東,北（度）], 中心のジオイド高（m、国土地理院のジオイド高計算）, LOD1 の URL, LOD2（テクスチャあり）, LOD2（テクスチャなし)]
// URL は '$PREFIX' を省いたもの
'use strict';
window.GV = window.GV || {};
GV.PLATEAU_PREFIX = '$PREFIX';
GV.PLATEAU_BLDG = [
"@
$body = ($rows -join ",`n") + "`n];`n"
[IO.Directory]::CreateDirectory((Split-Path $Out)) | Out-Null
[IO.File]::WriteAllText($Out, $head + $body, (New-Object Text.UTF8Encoding($false)))
Write-Host "書き出しました: $Out （$($rows.Count) 区・市）"
