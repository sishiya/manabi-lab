# 予約ずみの紹介動画を、作りなおした mp4 に差しかえる（ユーザーの GO のあとだけ。RULES-video.md 8.4 の「差しかえ」）。
# YouTube は動画のファイルだけを差しかえられないので: 新しく上げて同じ日時で予約 → 古い方の予約を外す（非公開のまま。消すのはユーザーが Studio で）。
# 差しかえる upload.json は、"videoId" を "oldVideoIds": ["古いID"] に書きかえておく（-Prepare がする）。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/replace-videos.ps1 -Prepare -Apps metamorphosis,air-flow   # JSON の videoId → oldVideoIds（YouTube には何もしない）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/replace-videos.ps1 -Apps metamorphosis,air-flow            # 上げる（upload-batch）→ 古い方の予約を外す
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/replace-videos.ps1                                        # oldVideoIds のある JSON をぜんぶ
# - 上げる前に check-loudness.ps1（RULES 8.6）。上限（quota・exceeded）で止まったら、日本時間16時（太平洋時間の0時）すぎに同じコマンドをもう一度。
# - 新しい方が上がるまで、古い方の予約はそのまま（上げられなかった動画は、古い方がその日時に公開される）。
param(
  [string]$Apps = '',
  [switch]$Prepare
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$promo = Join-Path $root '_dev/promo'
$want = @($Apps -split '[,\s]+' | Where-Object { $_ })
$metas = Get-ChildItem $promo -Filter '*.upload.json' | Where-Object {
  $app = $_.Name -replace '-(guide|short)\.upload\.json$', ''
  (-not $want.Count) -or ($want -contains $app)
} | Sort-Object Name

if ($Prepare) {
  foreach ($f in $metas) {
    $s = [IO.File]::ReadAllText($f.FullName)
    if ($s -match '"oldVideoIds"') { Write-Host "もう準備ずみ: $($f.Name)"; continue }
    if ($s -notmatch '"videoId"\s*:\s*"([^"]+)"') { Write-Host "videoId がない: $($f.Name)"; continue }
    $s = [regex]::Replace($s, '"videoId"\s*:\s*"([^"]+)"', '"oldVideoIds": ["$1"]')
    [IO.File]::WriteAllText($f.FullName, $s, (New-Object Text.UTF8Encoding $false))
    Write-Host "準備した: $($f.Name)（古い ID $($Matches[1])）"
  }
  return
}

$targets = @($metas | Where-Object { [IO.File]::ReadAllText($_.FullName) -match '"oldVideoIds"' })
if (-not $targets.Count) { Write-Host '差しかえるもの（oldVideoIds のある upload.json）がない'; return }
# 1. 新しい方を上げる（videoId がもうあるものは upload-batch が飛ばす）
$apps2 = @($targets | ForEach-Object { $_.Name -replace '-(guide|short)\.upload\.json$', '' } | Sort-Object -Unique) -join ','
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'upload-batch.ps1') -Apps $apps2
# 2. 新しい方が上がったものだけ、古い方の予約を外す
$tmp = Join-Path $promo 'out'
$left = @()
foreach ($f in $targets) {
  $m = Get-Content -Raw -Encoding UTF8 $f.FullName | ConvertFrom-Json
  $name = $f.Name -replace '\.upload\.json$', ''
  if (-not $m.videoId) { $left += $name; continue }
  foreach ($old in @($m.oldVideoIds)) {
    if ($m.oldDone -and (@($m.oldDone) -contains $old)) { continue }
    $t = Join-Path $tmp "unschedule-$name.json"
    [IO.File]::WriteAllText($t, "{ `"videoId`": `"$old`" }", (New-Object Text.UTF8Encoding $false))
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'youtube-upload.ps1') -Schedule -Meta "_dev/promo/out/unschedule-$name.json"
    if ($LASTEXITCODE -ne 0) { Write-Host "古い方の予約を外せなかった: $name $old"; $left += "$name（古い $old の予約が残っている）"; continue }
    Remove-Item $t
    # 外したしるし（もう一度走らせても外しなおさない）
    $s = [IO.File]::ReadAllText($f.FullName)
    $s = [regex]::Replace($s, '"oldVideoIds"\s*:\s*\[([^\]]*)\]', { param($mm) $mm.Value + ",`n  `"oldDone`": [$($mm.Groups[1].Value)]" }, 1)
    [IO.File]::WriteAllText($f.FullName, $s, (New-Object Text.UTF8Encoding $false))
    Write-Host "古い方の予約を外した: $name $old（Studio で消すのはユーザー）"
  }
}
Write-Host ''
if ($left.Count) { Write-Host "まだ: $($left -join '、')。上限なら日本時間16時すぎに同じコマンドを" } else { Write-Host "差しかえ: すべて終わり（$($targets.Count) 本）" }
