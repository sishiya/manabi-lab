# X（@sishiya22）への投稿を手で出すための下ごしらえ。API は使わない（有料で、URL 入りは高い）。投稿ボタンはユーザーが押す。
# 使い方:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/x-post.ps1 -Meta _dev/promo/black-hole-short.upload.json
#       … 本文を作って字数を確かめ、_dev/promo/out/<名前>.x.txt に本文と返信を書く。本文をクリップボードに入れ、
#         動画ファイルを選んだエクスプローラーと X の投稿画面を開く。→ 本文を貼る・動画をドラッグ → 投稿
#   … -Reply を付けると、返信（アプリの URL）をクリップボードに入れる。→ 出した投稿に返信として貼る
#   … -NoOpen を付けると、エクスプローラーと X は開かない（文字の確認だけ）
#
# Meta の JSON は YouTube と同じ upload.json（ふつうはショート）。X 用は "x" に書く（なければタイトル・説明から作る）:
#   "x": { "text": "本文", "en": "英語の1行", "reply": "返信" }
#   - 本文には URL を入れない（外へのリンクがあると表示が減るとされるので、URL は返信に）
#   - 本文の既定: タイトル（#Shorts を除く）＋説明の最後の行のハッシュタグ。英語の既定: localizations.en.title
#   - 返信の既定: 説明の「アプリ:」の URL と「しし屋 まなびラボ」の URL
# X の字数: 280（日本語などは1字を2、URL は23と数える）。無料のアカウントの動画は 2分20秒・512MB まで。
param(
  [Parameter(Mandatory = $true)][string]$Meta,
  [switch]$Reply,
  [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
$metaPath = if ([IO.Path]::IsPathRooted($Meta)) { $Meta } else { Join-Path $root $Meta }
$m = Get-Content -Raw -Encoding UTF8 $metaPath | ConvertFrom-Json
$name = [IO.Path]::GetFileNameWithoutExtension($metaPath) -replace '\.upload$', ''

# X の数え方（twitter-text の重み）: 下の範囲は1、それ以外（日本語・絵文字など）は2、URL は23
function Get-XLength([string]$s) {
  $n = 0
  $rest = $s -replace 'https?://\S+', ''
  $n += 23 * ([regex]::Matches($s, 'https?://\S+')).Count
  $i = 0
  while ($i -lt $rest.Length) {
    $cp = [char]::ConvertToUtf32($rest, $i)
    $i += if ($cp -gt 0xFFFF) { 2 } else { 1 }
    if (($cp -le 4351) -or ($cp -ge 8192 -and $cp -le 8205) -or ($cp -ge 8208 -and $cp -le 8223) -or ($cp -ge 8242 -and $cp -le 8247)) { $n += 1 } else { $n += 2 }
  }
  return $n
}

$desc = [string]$m.description
$x = $m.x
# 本文
$text = if ($x -and $x.text) { [string]$x.text } else {
  $t = ([string]$m.title -replace '\s*#Shorts\s*', '').Trim()
  $tags = ($desc -split "`n" | Where-Object { $_.Trim().StartsWith('#') } | Select-Object -Last 1)
  if ($tags) { "$t`n`n$($tags.Trim())" } else { $t }
}
$en = if ($x -and $x.en) { [string]$x.en } elseif ($m.localizations -and $m.localizations.en) { ([string]$m.localizations.en.title -replace '\s*#Shorts\s*', '').Trim() } else { '' }
if ($en) { $text = "$text`n`n$en" }
# 返信
$replyText = if ($x -and $x.reply) { [string]$x.reply } else {
  $site = [regex]::Match($desc, 'しし屋 まなびラボ[^:]*:\s*(https?://\S+)').Groups[1].Value
  $app = [regex]::Match($desc, 'アプリ:\s*(https?://\S+)').Groups[1].Value
  if (-not $app) { $app = [regex]::Matches($desc, 'https?://\S+') | ForEach-Object { $_.Value } | Where-Object { $_ -ne $site } | Select-Object -First 1 }
  $lines = @()
  if ($app) { $lines += "ブラウザで動かせます（インストールなし）`n$app" }
  if ($site) { $lines += "ほかのアプリ（しし屋 まなびラボ）`n$site" }
  $lines -join "`n`n"
}

$problems = @()
if ($text -match 'https?://') { $problems += '本文に URL があります（表示が減るとされるので、返信へ）' }
$lt = Get-XLength $text; $lr = Get-XLength $replyText
if ($lt -gt 280) { $problems += "本文が長すぎます（$lt / 280）" }
if ($lr -gt 280) { $problems += "返信が長すぎます（$lr / 280）" }
if (-not $replyText) { $problems += '返信が空です（説明に「アプリ: URL」がない。"x.reply" に書く）' }

# 動画: 長さと大きさ
$file = if ($m.file) { Join-Path $root ([string]$m.file) } else { $null }
$videoInfo = '（動画なし）'
if ($file -and (Test-Path $file)) {
  $fi = Get-Item $file
  $mb = [math]::Round($fi.Length / 1MB)
  $sh = New-Object -ComObject Shell.Application
  $item = $sh.Namespace($fi.DirectoryName).ParseName($fi.Name)
  $len = $item.ExtendedProperty('System.Media.Duration')   # 100ns 単位
  $sec = if ($len) { [math]::Round([double]$len / 1e7) } else { $null }
  $videoInfo = "$($fi.Name)  $mb MB" + $(if ($sec) { "  $([math]::Floor($sec / 60))分$($sec % 60)秒" } else { '' })
  if ($sec -and $sec -gt 140) { $problems += "動画が 2分20秒より長い（$sec 秒）。無料のアカウントでは上げられないので、ショートを使う" }
  if ($mb -gt 512) { $problems += "動画が 512MB より大きい（$mb MB）" }
} elseif ($file) { $problems += "動画が見つかりません: $($m.file)（台本ページで書き出す）" }

# 書き出し（out/ は Git に入れない）
$outDir = Join-Path $root '_dev/promo/out'
$txtPath = Join-Path $outDir "$name.x.txt"
$body = "---- 本文（$lt / 280） ----`r`n$text`r`n`r`n---- 返信（$lr / 280） ----`r`n$replyText`r`n"
[IO.File]::WriteAllText($txtPath, ($body -replace "(?<!`r)`n", "`r`n"), (New-Object Text.UTF8Encoding($true)))

Write-Host $body
Write-Host "動画: $videoInfo"
Write-Host "保存: _dev/promo/out/$name.x.txt"
if ($problems) { Write-Host ''; $problems | ForEach-Object { Write-Host "注意: $_" } }

if ($Reply) {
  Set-Clipboard -Value $replyText
  Write-Host "`n返信をクリップボードに入れました。出した投稿の「返信」に貼ってください。"
  exit 0
}
Set-Clipboard -Value $text
Write-Host "`n本文をクリップボードに入れました。"
if (-not $NoOpen) {
  if ($file -and (Test-Path $file)) { Start-Process explorer.exe "/select,`"$((Resolve-Path $file).Path)`"" }
  Start-Process 'https://x.com/compose/post'
  Write-Host 'X の投稿画面に本文を貼り、動画をドラッグして投稿 → そのあと -Reply で返信の文をコピー。'
}
