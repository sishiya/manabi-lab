# 週ごとのふり返り。この1週間に何を作ったか（Git）と、紹介動画の数（YouTube）を1枚にまとめる。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/weekly-report.ps1            # → _dev/tools/out/weekly-<日付>.md
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/weekly-report.ps1 -NoYouTube # Git だけ
# YouTube の数は youtube-upload.ps1 -Stats（いまの許可のまま、読むだけ）。毎回 _dev/tools/out/yt-stats-<日付>.json に残し、
# いちばん近い前の回とくらべて「この期間に増えた数」を出す（初回は合計だけ）。
# まだ入っていないもの（新しい許可が要る。入れる前にユーザーに相談）:
#   - サイトのアクセス（Google アナリティクス 4 の Data API。analytics.readonly とプロパティ ID）
#   - 動画の視聴時間・どこから来たか（YouTube Analytics API。yt-analytics.readonly、-Auth のやり直し）
# out/ は Git に入れない（数は公開しない）。
param(
  [int]$Days = 7,
  [switch]$NoYouTube
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outDir = Join-Path $root '_dev/tools/out'
[IO.Directory]::CreateDirectory($outDir) | Out-Null
$today = Get-Date -Format 'yyyy-MM-dd'
$since = (Get-Date).AddDays(-$Days).ToString('yyyy-MM-dd')
$Report = New-Object Collections.Generic.List[string]
function W([string]$s = '') { $Report.Add($s) }
function Read-Text($p) { [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) }

W "# 週のふり返り（$since 〜 $today）"
W ''

# ---------- 作ったもの（Git） ----------
Push-Location $root
try {
  $log = @(git -c core.quotepath=false log --since="$since 00:00" --pretty=format:'%ad%x09%s' --date=format:'%m-%d' 2>$null)
  $files = @(git -c core.quotepath=false log --since="$since 00:00" --name-only --pretty=format: 2>$null | Where-Object { $_ })
  $dirty = @(git -c core.quotepath=false status --porcelain 2>$null)
  $ahead = (git rev-list --count '@{u}..HEAD' 2>$null)
} finally { Pop-Location }
$byApp = $files | ForEach-Object { ($_ -split '/')[0] } | Where-Object { $_ -and $_ -notmatch '\.' -and $_ -ne '_dev' } | Group-Object | Sort-Object Count -Descending
W '## 作ったもの（Git）'
W "- コミット $($log.Count) 件。手を入れたアプリ（変えたファイルの数）: $(if ($byApp) { ($byApp | ForEach-Object { "$($_.Name)（$($_.Count)）" }) -join '、' } else { 'なし' })"
if ($ahead -and [int]$ahead -gt 0) { W "- **まだ push していないコミットが $ahead 件**（GitHub Desktop の Push origin で公開）" }
if ($dirty.Count) { W "- コミットしていない変更が $($dirty.Count) ファイル" }
# 入口・保管庫に増えたアプリ（APPS の created、archive.html の作成日）
$idx = Read-Text (Join-Path $root 'index.html')
$newEntrance = [regex]::Matches($idx, "\{id:'([\w-]+)', title:'([^']+)'[^\r\n]*created:'(\d{4}-\d\d-\d\d)'") | Where-Object { $_.Groups[3].Value -ge $since } | ForEach-Object { $_.Groups[2].Value }
$upd = [regex]::Matches($idx, "\{id:'([\w-]+)', title:'([^']+)'[^\r\n]*updated:'(\d{4}-\d\d-\d\d)'") | Where-Object { $_.Groups[3].Value -ge $since } | ForEach-Object { $_.Groups[2].Value }
$arc = Read-Text (Join-Path $root 'archive.html')
$newArchive = [regex]::Matches($arc, 'class="open" href="[^"]+">([^<]+)</a>[\s\S]*?作成 (\d{4}-\d\d-\d\d)') | Where-Object { $_.Groups[2].Value -ge $since } | ForEach-Object { $_.Groups[1].Value }
if ($newEntrance) { W "- 入口に新しく: $($newEntrance -join '、')" }
if ($newArchive) { W "- 保管庫に新しく: $($newArchive -join '、')" }
if ($upd) { W "- 入口で「更新」になったアプリ: $(@($upd).Count) 本" }
W ''
W '<details><summary>コミットの一覧</summary>'
W ''
foreach ($c in $log) { W "- $($c -replace "`t", ' ')" }
W ''
W '</details>'
W ''

# ---------- 動作確認 ----------
$smoke = Join-Path $outDir 'smoke-last.json'
if (Test-Path $smoke) {
  $s = @(Read-Text $smoke | ConvertFrom-Json)
  $when = (Get-Item $smoke).LastWriteTime.ToString('MM-dd HH:mm')
  $bad = @($s | Where-Object { -not $_.ok })
  W '## 動作確認（smoke.ps1 の最後の回）'
  W "- $when に $($s.Count) 件、NG $($bad.Count)$(if ($bad) { '（' + (($bad | ForEach-Object { "$($_.app) [$($_.lang)]" }) -join '、') + '）' })"
  W ''
}

# ---------- 紹介動画（YouTube） ----------
if (-not $NoYouTube) {
  $snap = Join-Path $outDir "yt-stats-$today.json"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'youtube-upload.ps1') -Stats -Out $snap | Out-Null
  W '## 紹介動画（YouTube）'
  if (-not (Test-Path $snap)) { W '- 数を取れなかった（youtube-upload.ps1 -Stats を手で動かして理由を見る）'; W '' }
  else {
    $cur = Read-Text $snap | ConvertFrom-Json
    $prevFile = Get-ChildItem $outDir -Filter 'yt-stats-*.json' | Where-Object { $_.Name -lt "yt-stats-$today.json" } | Sort-Object Name | Select-Object -Last 1
    $prev = if ($prevFile) { Read-Text $prevFile.FullName | ConvertFrom-Json } else { $null }
    $pv = @{}; if ($prev) { foreach ($v in $prev.videos) { $pv[$v.id] = $v } }
    # 動画 ID → アプリ（upload.json の videoId）
    $appOf = @{}
    foreach ($f in Get-ChildItem (Join-Path $root '_dev/promo') -Filter '*.upload.json') {
      $m = Read-Text $f.FullName | ConvertFrom-Json
      if ($m.videoId) { $appOf[$m.videoId] = $f.Name -replace '\.upload\.json$', '' }
    }
    $d = if ($prev) { "（前の回 $(([string]$prev.at).Substring(0, 10)) から +$($cur.channel.subscribers - $prev.channel.subscribers) 人、+$($cur.channel.views - $prev.channel.views) 回）" } else { '（初回。次から増えた数が出る）' }
    W "- チャンネル: 登録者 $($cur.channel.subscribers) 人、再生 合計 $($cur.channel.views) 回 $d"
    $pub = @($cur.videos | Where-Object { $_.status -eq 'public' })
    $res = @($cur.videos | Where-Object { $_.publishAt })
    W "- 公開中 $($pub.Count) 本、予約 $($res.Count) 本、非公開（予約なし）$(@($cur.videos).Count - $pub.Count - $res.Count) 本"
    W ''
    if ($pub) {
      W '| 動画 | 再生 | 増えた | 高評価 | コメント |'
      W '|---|---:|---:|---:|---:|'
      foreach ($v in ($pub | Sort-Object { [long]$_.views } -Descending)) {
        $inc = if ($pv.ContainsKey($v.id)) { '+' + ([long]$v.views - [long]$pv[$v.id].views) } else { '—' }
        $name = if ($appOf[$v.id]) { $appOf[$v.id] } else { $v.title }
        W "| [$name](https://youtu.be/$($v.id)) | $($v.views) | $inc | $($v.likes) | $($v.comments) |"
      }
      W ''
    }
    if ($res) {
      W ('予約: ' + (($res | Sort-Object publishAt | ForEach-Object { "$(if ($appOf[$_.id]) { $appOf[$_.id] } else { $_.id }) $(([DateTimeOffset]::Parse([string]$_.publishAt)).ToOffset([TimeSpan]::FromHours(9)).ToString('M/d HH:mm'))" }) -join '、'))
      W ''
    }
  }
}

W '## まだ入っていないもの'
W '- サイトのアクセス（Google アナリティクス 4）と、動画の視聴時間・どこから来たか（YouTube Analytics）は、新しい許可が要るのでまだ（weekly-report.ps1 の頭に説明）。'

$md = Join-Path $outDir "weekly-$today.md"
[IO.File]::WriteAllText($md, ($Report -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "書いた: _dev/tools/out/weekly-$today.md"
