# 紹介動画の upload.json（youtube-upload.ps1・x-post.ps1 が読む）の下書きを作る・決まりに合っているか調べる。
# 決まりは _dev/promo/README.md の「YouTube に上げる」。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-upload.ps1 -App quantum            # 説明動画とショートの下書き（あるものは作らない）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-upload.ps1 -App quantum -Kind short
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-upload.ps1 -Check                  # 全部の upload.json を調べる
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-upload.ps1 -Check -Meta _dev/promo/quantum-guide.upload.json
# 下書きは入口の APPS（名前・説明・英語）とアプリの「おもな出どころ」（<ul class="src">）から作る。
# 決まった行（アプリの URL・まなびラボ・音楽・CC の案内）は入る。チャプター・ハッシュタグ・英語の出どころなどは「TODO」と書くので、
# Claude が台本を見て書きかえる。TODO が残っていると -Check で止まる。
param(
  [string]$App,
  [ValidateSet('guide', 'short', 'both')][string]$Kind = 'both',
  [switch]$Force,
  [switch]$Check,
  [string[]]$Meta
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
$promo = Join-Path $root '_dev/promo'
$site = 'https://sishiya.github.io/manabi-lab/'
$utf8 = New-Object Text.UTF8Encoding $false
function Read-Text($p) { [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) }

# ---------------- 調べる ----------------
function Test-Upload([string]$path) {
  $name = [IO.Path]::GetFileName($path)
  $errs = New-Object Collections.ArrayList; $warns = New-Object Collections.ArrayList
  try { $m = Read-Text $path | ConvertFrom-Json } catch { Write-Host "NG   ${name}: JSON として読めない（$($_.Exception.Message)）" -ForegroundColor Red; return $false }
  $isShort = $name -match '-short\.upload\.json$'
  $app = $name -replace '-(guide|short)\.upload\.json$', '' -replace '\.upload\.json$', ''
  $raw = Read-Text $path
  if ($raw -match 'TODO') { [void]$errs.Add('TODO が残っている') }
  foreach ($k in 'file', 'title', 'description', 'tags', 'privacy') { if (-not $m.$k) { [void]$errs.Add("$k がない") } }
  if ($m.privacy -and $m.privacy -ne 'private') { [void]$errs.Add("privacy は private で上げる（いま $($m.privacy)）。公開は予約 publishAt で") }
  # YouTube の制限: タイトル 100 字、説明 5000 字、< > は使えない、タグは合わせて 500 字ほど
  foreach ($pair in @(@('title', $m.title), @('英語の title', $m.localizations.en.title))) {
    $t = [string]$pair[1]
    if ($t.Length -gt 100) { [void]$errs.Add("$($pair[0]) が $($t.Length) 字（100 まで）") }
    if ($t -match '[<>]') { [void]$errs.Add("$($pair[0]) に < > がある（YouTube で使えない）") }
  }
  foreach ($pair in @(@('description', $m.description), @('英語の description', $m.localizations.en.description))) {
    $d = [string]$pair[1]
    if ($d.Length -gt 5000) { [void]$errs.Add("$($pair[0]) が $($d.Length) 字（5000 まで）") }
    if ($d -match '[<>]') { [void]$errs.Add("$($pair[0]) に < > がある（YouTube で使えない）") }
  }
  $tagLen = ($m.tags | ForEach-Object { $s = [string]$_; if ($s -match ' ') { $s.Length + 2 } else { $s.Length } } | Measure-Object -Sum).Sum + [Math]::Max(0, @($m.tags).Count - 1)
  if ($tagLen -gt 500) { [void]$errs.Add("tags が合わせて $tagLen 字（500 まで）") }
  if ($isShort -and $m.title -notmatch '#Shorts') { [void]$warns.Add('ショートのタイトルに #Shorts がない') }
  if (-not $m.localizations.en) { [void]$errs.Add('英語のタイトル・説明（localizations.en）がない') }
  # 説明欄の決まり: アプリの URL の行と、まなびラボの行の間を1行あける（日本語・英語とも）
  $appUrl = "$site$app/"
  if (-not (Test-Path (Join-Path $root $app))) { [void]$errs.Add("アプリのフォルダ $app がない（ファイル名は <app>-guide / <app>-short）") }
  $d = [string]$m.description
  if ($d -notmatch [regex]::Escape($appUrl) + '\n\nしし屋 まなびラボ（ほかのアプリ）[:：]\s?\n?' + [regex]::Escape($site) + '(\n|$)') { [void]$errs.Add("説明: 「アプリ: $appUrl」→ 1行あけて →「しし屋 まなびラボ（ほかのアプリ）: $site」の形になっていない") }
  $de = [string]$m.localizations.en.description
  if ($de -and $de -notmatch [regex]::Escape($appUrl) + '\n\nShishiya Manabi Lab \(more apps\):\s?\n?' + [regex]::Escape($site) + '(\n|$)') { [void]$errs.Add('英語の説明: アプリの URL → 1行あけて → Shishiya Manabi Lab (more apps) の形になっていない') }
  if ($d -notmatch '出どころ|出典|参考') { [void]$errs.Add('説明に出どころがない（README「毎回まもること」）') }
  if ($d -notmatch '音楽') { [void]$warns.Add('説明に音楽（合成した音）の一言がない') }
  # 説明動画: チャプター（0:00 から、3つ以上、10 秒以上ずつ）
  if (-not $isShort) {
    foreach ($pair in @(@('', $d), @('英語の', $de))) {
      $times = [regex]::Matches([string]$pair[1], '(?m)^(\d+):(\d\d) ') | ForEach-Object { [int]$_.Groups[1].Value * 60 + [int]$_.Groups[2].Value }
      if (@($times).Count -lt 3 -or $times[0] -ne 0) { [void]$errs.Add("$($pair[0])チャプターが 0:00 から3つ以上になっていない") }
      else { for ($i = 1; $i -lt @($times).Count; $i++) { if ($times[$i] - $times[$i - 1] -lt 10) { [void]$errs.Add("$($pair[0])チャプターの間が 10 秒より短い（$($times[$i - 1])→$($times[$i]) 秒）"); break } } }
    }
    if ($de -and $de -notmatch '\(CC\)') { [void]$warns.Add('英語の説明に「英語の字幕（CC）」の案内がない') }
  }
  # 予約: 日本時間 +09:00、夜 19〜22 時
  if ($m.publishAt) {
    try {
      $dt = [DateTimeOffset]::Parse([string]$m.publishAt)
      if ($dt.Offset.TotalHours -ne 9) { [void]$warns.Add("publishAt が日本時間（+09:00）で書かれていない: $($m.publishAt)") }
      $jst = $dt.ToOffset([TimeSpan]::FromHours(9))
      if ($jst.Hour -lt 19 -or $jst.Hour -gt 22) { [void]$warns.Add("publishAt が夜 19〜22 時でない: $($jst.ToString('MM-dd HH:mm'))") }
      if ($jst -lt [DateTimeOffset]::Now) { [void]$warns.Add("publishAt が過去: $($jst.ToString('yyyy-MM-dd HH:mm'))") }
    } catch { [void]$errs.Add("publishAt が日時として読めない: $($m.publishAt)") }
  }
  # ファイル（out/ は PC ごと。ない PC では注意だけ）
  foreach ($pair in @(@('file', $m.file), @('thumbnail', $m.thumbnail), @('英語の字幕', $m.captions.en))) {
    if ($pair[1] -and -not (Test-Path (Join-Path $root ([string]$pair[1])))) { [void]$warns.Add("$($pair[0]) のファイルがこの PC にない: $($pair[1])") }
  }
  if (-not $m.captions.en) { [void]$warns.Add('英語の字幕（captions.en）がない') }

  if ($errs.Count) { Write-Host "NG   $name" -ForegroundColor Red } elseif ($warns.Count) { Write-Host "注意 $name" -ForegroundColor Yellow } else { Write-Host "OK   $name" -ForegroundColor Green }
  foreach ($x in $errs) { Write-Host "       ✕ $x" }
  foreach ($x in $warns) { Write-Host "       △ $x" }
  return ($errs.Count -eq 0)
}

if ($Check) {
  $list = if ($Meta) { $Meta | ForEach-Object { if ([IO.Path]::IsPathRooted($_)) { $_ } else { Join-Path $root $_ } } } else { Get-ChildItem $promo -Filter '*.upload.json' | ForEach-Object { $_.FullName } }
  $bad = 0
  foreach ($p in $list) { if (-not (Test-Upload $p)) { $bad++ } }
  Write-Host ''
  Write-Host "upload.json: $(@($list).Count) 件、NG $bad"
  if ($bad) { exit 1 } else { exit 0 }
}

# ---------------- 下書きを作る ----------------
if (-not $App) { throw '-App か -Check を付ける' }
$idx = Read-Text (Join-Path $root 'index.html')
$m = [regex]::Match($idx, "\{id:'$([regex]::Escape($App))'[\s\S]*?\}(?=,\s*\n\s*(\{id:|\]))")
if (-not $m.Success) { throw "入口の APPS に $App がない（保管庫のアプリは、入口に載せてから動画を作る）" }
function Field($n) { $x = [regex]::Match($m.Value, "\b$n\s*:\s*'((?:[^'\\]|\\.)*)'"); if ($x.Success) { $x.Groups[1].Value -replace "\\'", "'" } else { '' } }
$title = Field 'title'; $desc = Field 'desc'; $titleEn = Field 'title_en'; $descEn = Field 'desc_en'
$appEn = [regex]::IsMatch($m.Value, '\ben\s*:\s*true')

# 出どころ（アプリの <ul class="src"> の li の文字）
$srcs = @()
$appHtml = Join-Path $root "$App/index.html"
if (Test-Path $appHtml) {
  $h = Read-Text $appHtml
  $ul = [regex]::Match($h, '<ul class="src">([\s\S]*?)</ul>')
  if ($ul.Success) {
    $srcs = [regex]::Matches($ul.Groups[1].Value, '<li[^>]*>([\s\S]*?)</li>') | ForEach-Object {
      $t = $_.Groups[1].Value
      $t = [regex]::Replace($t, '<a [^>]*href="([^"]+)"[^>]*>[\s\S]*?</a>', ' $1 ')
      $t = [regex]::Replace($t, '<[^>]+>', '')
      $t = [Net.WebUtility]::HtmlDecode($t) -replace '\s+', ' '
      $url = [regex]::Match($t, 'https?://\S+?(?=[）)\s]|$)').Value
      $t = $t -replace '（\s*https?://[^）]*）', '' -replace '\s*https?://\S+', ''
      # 「: 何に使ったか」の説明は落とす（論文・資料の名前まで。「」『』の中の : では切らない）
      $cut = [regex]::Match($t, '^((?:[^「『]|「[^」]*」|『[^』]*』)*?)[:：] ')
      if ($cut.Success) { $t = $cut.Groups[1].Value }
      (($t.Trim() + ' ' + $url).Trim())
    } | Select-Object -First 5
  }
}
if (-not $srcs) { $srcs = @('TODO 出どころ（アプリの「おもな出どころ」から）') }
$appUrl = "$site$App/"
$musicJa = '音楽: プログラムで合成したオリジナルの音です。'
$musicEn = 'Music: original sounds synthesized by code.'
$appNoteEn = if ($appEn) { 'switch the app to English with the EN button' } else { 'the on-screen text is in Japanese for now' }

function Save($kind, $obj) {
  $p = Join-Path $promo "$App-$kind.upload.json"
  if ((Test-Path $p) -and -not $Force) { Write-Host "△ もうある（作らない。作り直すなら -Force）: _dev/promo/$App-$kind.upload.json" -ForegroundColor Yellow; return }
  $json = $obj | ConvertTo-Json -Depth 6
  # PowerShell 5.1 の ConvertTo-Json は あ のように書くので、読める文字に戻す（< > & ' も）
  $json = [regex]::Replace($json, '\\u([0-9a-fA-F]{4})', { param($x) [string][char][Convert]::ToInt32($x.Groups[1].Value, 16) })
  [IO.File]::WriteAllText($p, $json, $utf8)
  Write-Host "書いた: _dev/promo/$App-$kind.upload.json（TODO を埋めてから -Check）"
}

if ($Kind -in 'guide', 'both') {
  $ja = @(
    "${desc}ブラウザのアプリ「$title」の、使い方と見どころです。", '',
    '0:00 はじめに', 'TODO チャプター（台本の CAPS の場面の切れ目。10 秒以上ずつ）', '',
    'アプリ（ブラウザで動きます。パソコン・スマホ）:', $appUrl, '',
    'しし屋 まなびラボ（ほかのアプリ）:', $site, '',
    'おもな出どころ:') + $srcs + @('', $musicJa, '', "TODO ハッシュタグ（3つほど） #まなびラボ") -join "`n"
  $en = @(
    "A guide to `"$titleEn`", a browser app. $descEn Turn on English subtitles (CC).", '',
    '0:00 Intro', 'TODO chapters (same times as Japanese)', '',
    "Try the app (runs in your browser, PC or phone; $appNoteEn):", $appUrl, '',
    'Shishiya Manabi Lab (more apps):', $site, '',
    'Main sources:') + @($srcs | ForEach-Object { if ($_ -match '[぀-ヿ一-鿿]') { "TODO in English: $_" } else { $_ } }) + @('', $musicEn, '', 'TODO hashtags') -join "`n"
  Save 'guide' ([ordered]@{
      file = "_dev/promo/out/$App-guide.mp4"; thumbnail = "assets/thumbs/$App.jpg"; privacy = 'private'
      captions = [ordered]@{ en = "_dev/promo/out/$App-guide.en.srt" }
      title = "$title ― 使い方と見どころ（TODO 見どころを3つほど）"
      description = $ja
      tags = @($title, '使い方', 'シミュレーション', 'まなびラボ', 'しし屋', $titleEn, 'TODO tags')
      localizations = [ordered]@{ en = [ordered]@{ title = "$titleEn ― App Guide: TODO"; description = $en } }
    })
}
if ($Kind -in 'short', 'both') {
  $ja = @("${desc}ブラウザのアプリ「$title」から。", '', "アプリ: $appUrl", '', "しし屋 まなびラボ（ほかのアプリ）: $site", '',
    "おもな出どころ: $($srcs[0])", '', $musicJa, '', 'TODO ハッシュタグ #まなびラボ') -join "`n"
  $en = @("From `"$titleEn`", a browser app. $descEn", '', "App ($appNoteEn): $appUrl", '', "Shishiya Manabi Lab (more apps): $site", '',
    "Main source: $(if ($srcs[0] -match '[぀-ヿ一-鿿]') { 'TODO in English' } else { $srcs[0] })", '', $musicEn, '', 'TODO hashtags') -join "`n"
  Save 'short' ([ordered]@{
      file = "_dev/promo/out/$App-short.mp4"; privacy = 'private'
      captions = [ordered]@{ en = "_dev/promo/out/$App-short.en.srt" }
      title = "TODO いちばん映える一言 #Shorts"
      description = $ja
      tags = @($title, 'Shorts', 'まなびラボ', 'しし屋', $titleEn, 'TODO tags')
      localizations = [ordered]@{ en = [ordered]@{ title = 'TODO #Shorts'; description = $en } }
    })
}
