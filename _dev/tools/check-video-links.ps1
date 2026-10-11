# 入口のカードの「▶ 使い方の動画」のつけ忘れを調べる（YouTube には問い合わせない。使用量を使わない）。
# 決まり（2026-10-11 ユーザー）: 入口のリンク（index.html の APPS の video:{id, at}）は、説明動画が**公開されてから**足す。
#   公開ずみ = _dev/promo/<app>-guide.upload.json の videoId があり、publishAt を過ぎたもの。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-video-links.ps1          # 調べるだけ
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-video-links.ps1 -Fix     # 公開ずみでリンクのないものを足す（→ 公開前チェック → commit → push）
#   -Hook: セッションのはじめのフック用（.claude/settings.json の SessionStart）。問題がないときは何も出さない
# 終了コード 0 = 問題なし、1 = つけ忘れ・まちがいがある。
param([switch]$Fix, [switch]$Hook, [string]$Now)   # -Now は試し用（その日時のつもりで調べる）
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$idxPath = Join-Path $root 'index.html'
$idx = [IO.File]::ReadAllText($idxPath, [Text.Encoding]::UTF8)
$now = if ($Now) { [DateTimeOffset]::Parse($Now) } else { [DateTimeOffset]::Now }
$miss = @(); $wrong = @(); $early = @(); $ok = 0; $waiting = @()

foreach ($f in Get-ChildItem (Join-Path $root '_dev/promo') -Filter '*-guide.upload.json') {
  $app = $f.Name -replace '-guide\.upload\.json$', ''
  $m = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $line = [regex]::Match($idx, "\{id:'$([regex]::Escape($app))',[^\r\n]*").Value
  if (-not $line) { continue }   # 入口にないアプリ（保管庫など）
  $has = [regex]::Match($line, "video:\{id:'([\w-]+)', at:'([^']+)'\}")
  $pub = $m.videoId -and $m.publishAt -and ([DateTimeOffset]::Parse([string]$m.publishAt) -le $now)
  if ($pub) {
    if (-not $has.Success) { $miss += [pscustomobject]@{ app = $app; id = $m.videoId; at = [string]$m.publishAt; line = $line } }
    elseif ($has.Groups[1].Value -ne $m.videoId) { $wrong += [pscustomobject]@{ app = $app; id = $m.videoId; at = [string]$m.publishAt; line = $line; cur = $has.Groups[1].Value } }
    else { $ok++ }
  } else {
    if ($has.Success) { $early += "$app（リンク $($has.Groups[1].Value)、公開 $($m.publishAt)）" }
    elseif ($m.videoId -and $m.publishAt) { $waiting += "$app $(([DateTimeOffset]::Parse([string]$m.publishAt)).ToOffset([TimeSpan]::FromHours(9)).ToString('M/d HH:mm'))" }
  }
}

$problems = $miss.Count + $wrong.Count + $early.Count
if ($Hook) {
  if ($miss.Count + $wrong.Count) {
    $msg = "入口のカードの「使い方の動画」のつけ忘れ: " + ((@($miss) + @($wrong) | ForEach-Object { "$($_.app)（$($_.id)）" }) -join '、') +
      "。説明動画が公開ずみ。ユーザーに伝えて、よければ _dev/tools/check-video-links.ps1 -Fix → 公開前チェック → commit（push はユーザー）。"
    @{ hookSpecificOutput = @{ hookEventName = 'SessionStart'; additionalContext = $msg } } | ConvertTo-Json -Compress -Depth 4
  }
  exit 0
}

Write-Host "入口の使い方の動画: リンクずみ $ok 本、つけ忘れ $($miss.Count) 本、ID ちがい $($wrong.Count) 本、公開前なのにリンク $($early.Count) 本"
foreach ($x in $miss) { Write-Host "  ✕ つけ忘れ: $($x.app)（$($x.id)、公開 $($x.at)）" }
foreach ($x in $wrong) { Write-Host "  ✕ ID ちがい: $($x.app)（入口 $($x.cur) → 正しくは $($x.id)）" }
foreach ($x in $early) { Write-Host "  △ 公開前なのにリンク: $x（決まりでは公開されてから）" }
if ($waiting) { Write-Host "  公開待ち: $($waiting -join '、')" }

if ($Fix -and ($miss.Count + $wrong.Count)) {
  foreach ($x in @($miss) + @($wrong)) {
    $v = "video:{id:'$($x.id)', at:'$($x.at)'}"
    $new = if ($x.line -match 'video:\{[^}]*\}') { $x.line -replace 'video:\{[^}]*\}', $v } else { ($x.line -replace ',\s*$', '') + ", $v," }
    $idx = $idx.Replace($x.line, $new)
  }
  $b = [IO.File]::ReadAllBytes($idxPath); $bom = $b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB
  [IO.File]::WriteAllText($idxPath, $idx, (New-Object Text.UTF8Encoding $bom))
  Write-Host "足した: $(@($miss).Count + @($wrong).Count) 本（index.html の APPS）。公開前チェック → commit → ユーザーが push"
  exit 0
}
if ($problems) { exit 1 } else { exit 0 }
