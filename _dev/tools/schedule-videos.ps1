# 紹介動画の予約日時（publishAt）を、公開順の案 _dev/promo/SCHEDULE.md の順に1日1アプリずつ割りふる。
# 説明動画 20:00・ショート 20:05（SCHEDULE.md の決まり）。日本時間 +09:00。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/schedule-videos.ps1 -Start 2026-10-12            # 案を表で見るだけ（何も書かない）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/schedule-videos.ps1 -Start 2026-10-12 -Apply     # upload.json の publishAt と SCHEDULE.md の日付を書く
#   … -Entrance を足すと、入口の APPS に video:{id, at}（説明動画。videoId があるものだけ）も書く（at を過ぎるとカードに「▶ 使い方の動画」）
#   … -Upload を足すと、書いたあと youtube-upload.ps1 -Schedule で YouTube の予約も入れる（ユーザーの GO のあとだけ。README「上げる・予約投稿はユーザーの GO のあとで」）
#   -From 4 で4日目から（それより前は今の publishAt のまま）、-Skip 2026-10-15 でその日を飛ばす、-Every 2 で1日おき。
param(
  [Parameter(Mandatory = $true)][datetime]$Start,
  [string]$Guide = '20:00',
  [string]$Short = '20:05',
  [int]$Every = 1,
  [int]$From = 1,
  [datetime[]]$Skip = @(),
  [switch]$Apply,
  [switch]$Entrance,
  [switch]$Upload
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
function Read-Text($p) { [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) }
function Write-Same($p, [string]$s) {
  # BOM は元のままに
  $b = [IO.File]::ReadAllBytes($p)
  $bom = $b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF
  [IO.File]::WriteAllText($p, $s, (New-Object Text.UTF8Encoding $bom))
}
foreach ($t in $Guide, $Short) {
  if ($t -notmatch '^(\d\d):(\d\d)$' -or [int]$Matches[1] -lt 19 -or [int]$Matches[1] -gt 22) { throw "時刻は 19:00〜22:59（いま $t。README「予約は 19〜22時ごろ」）" }
}

# --- 順番（SCHEDULE.md の「公開順」の表）と、入口の APPS（名前 → id・分野） ---
$schedPath = Join-Path $root '_dev/promo/SCHEDULE.md'
$sched = Read-Text $schedPath
$idx = Read-Text (Join-Path $root 'index.html')
$apps = @{}
foreach ($m in [regex]::Matches($idx, "\{id:'([\w-]+)', title:'([^']+)', cat:'(\w+)'")) { $apps[$m.Groups[2].Value] = @{ id = $m.Groups[1].Value; cat = $m.Groups[3].Value } }
$rows = [regex]::Matches($sched, '(?m)^\| (\d+) \| ([^|]+?) \|[^\r\n]*$')
if (-not $rows.Count) { throw 'SCHEDULE.md に公開順の表（| 日 | アプリ | …）が見つからない' }

$plan = @()
$day = $Start.Date
foreach ($r in $rows) {
  $n = [int]$r.Groups[1].Value; $title = $r.Groups[2].Value.Trim()
  if (-not $apps.ContainsKey($title)) { throw "SCHEDULE.md の「$title」が入口の APPS にない" }
  while ($Skip | Where-Object { $_.Date -eq $day }) { $day = $day.AddDays(1) }
  $plan += [pscustomobject]@{ n = $n; title = $title; id = $apps[$title].id; cat = $apps[$title].cat; date = $day; line = $r.Value }
  $day = $day.AddDays($Every)
}

# --- 確かめ: 隣どうしで同じ分野にしない（SCHEDULE.md の決まり1） ---
$warn = 0
for ($i = 1; $i -lt $plan.Count; $i++) {
  if ($plan[$i].cat -eq $plan[$i - 1].cat -and ($plan[$i].date - $plan[$i - 1].date).TotalDays -le 1) {
    Write-Host "△ $($plan[$i-1].n)日目と$($plan[$i].n)日目が同じ分野（$($plan[$i].cat)）が連日" -ForegroundColor Yellow; $warn++
  }
}

$wd = '日', '月', '火', '水', '木', '金', '土'
function Stamp([datetime]$d, [string]$hm) { '{0}T{1}:00+09:00' -f $d.ToString('yyyy-MM-dd'), $hm }
Write-Host ''
Write-Host ('{0,-3} {1,-12} {2,-16} {3}' -f '日', '日付', 'アプリ', '説明動画 / ショート')
foreach ($p in $plan) {
  $mark = if ($p.n -lt $From) { '（そのまま）' } else { '' }
  Write-Host ('{0,-3} {1,-12} {2,-16} {3} / {4} {5}' -f $p.n, ($p.date.ToString('MM-dd') + "($($wd[[int]$p.date.DayOfWeek]))"), $p.id, $Guide, $Short, $mark)
}
if (-not $Apply) { Write-Host ''; Write-Host '（案を見ただけ。書くなら -Apply）'; exit 0 }

# --- 書く ---
$sent = @()
foreach ($p in $plan) {
  if ($p.n -lt $From) { continue }
  foreach ($k in @(@('guide', $Guide), @('short', $Short))) {
    $f = Join-Path $root "_dev/promo/$($p.id)-$($k[0]).upload.json"
    if (-not (Test-Path $f)) { Write-Host "△ ない: _dev/promo/$($p.id)-$($k[0]).upload.json" -ForegroundColor Yellow; $warn++; continue }
    $at = Stamp $p.date $k[1]
    $s = Read-Text $f
    if ($s -match '"publishAt"\s*:\s*"[^"]*"') { $s2 = [regex]::Replace($s, '"publishAt"\s*:\s*"[^"]*"', "`"publishAt`": `"$at`"") }
    else { $s2 = [regex]::Replace($s, '(\r?\n)(\s*)("privacy"\s*:\s*"[^"]*",)', "`$1`$2`$3`$1`$2`"publishAt`": `"$at`",", 1) }
    if ($s2 -eq $s -and $s -notmatch [regex]::Escape($at)) { Write-Host "△ publishAt を書けなかった: $f" -ForegroundColor Yellow; $warn++; continue }
    $null = $s2 | ConvertFrom-Json   # 壊していないか
    Write-Same $f $s2
    $sent += "_dev/promo/$($p.id)-$($k[0]).upload.json"
  }
  # SCHEDULE.md の日付の列（いちばん右）
  $dateCell = $p.date.ToString('yyyy-MM-dd') + "（$($wd[[int]$p.date.DayOfWeek])）"
  $newLine = [regex]::Replace($p.line, '\|[^|]*\|\s*$', "| $dateCell |")
  $sched = $sched.Replace($p.line, $newLine)
  # 入口の APPS の video（説明動画の videoId があるものだけ）
  if ($Entrance) {
    $gm = Read-Text (Join-Path $root "_dev/promo/$($p.id)-guide.upload.json") | ConvertFrom-Json
    if ($gm.videoId) {
      $v = "video:{id:'$($gm.videoId)', at:'$(Stamp $p.date $Guide)'}"
      $em = [regex]::Match($idx, "\{id:'$([regex]::Escape($p.id))',[^\r\n]*")
      if ($em.Value -match 'video:\{[^}]*\}') { $idx = $idx.Replace($em.Value, ($em.Value -replace 'video:\{[^}]*\}', $v)) }
      else { $idx = $idx.Replace($em.Value, ($em.Value -replace ',\s*$', '') + ", $v,") }
    } else { Write-Host "△ 入口: $($p.id) の説明動画に videoId がない（上げてから -Entrance）" -ForegroundColor Yellow }
  }
}
Write-Same $schedPath $sched
Write-Host "書いた: SCHEDULE.md の日付、upload.json $($sent.Count) 件"
if ($Entrance) { Write-Same (Join-Path $root 'index.html') $idx; Write-Host '書いた: 入口の APPS の video（入口の中身が変わるので、公開前チェック → commit → ユーザーが push）' }

if ($Upload) {
  foreach ($f in $sent) {
    $m = Read-Text (Join-Path $root $f) | ConvertFrom-Json
    if (-not $m.videoId) { Write-Host "△ videoId がないので予約できない（先に上げる）: $f" -ForegroundColor Yellow; continue }
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'youtube-upload.ps1') -Schedule -Meta $f
  }
} else {
  Write-Host ''
  Write-Host 'YouTube の予約はまだ。GO のあと -Upload を付けてもう一度（または1本ずつ youtube-upload.ps1 -Schedule -Meta …）'
}
if ($warn) { exit 1 }
