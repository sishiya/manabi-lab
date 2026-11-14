# Pre-publish check: finds personal info and secrets before a git commit/push or an Artifact publish.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-public.ps1              # whole folder
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-public.ps1 -Path evolution
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-public.ps1 -Staged      # files staged for commit (pre-commit hook)
# Exit code 0 = nothing found, 1 = something to look at (the commit is stopped).
# Your own words to block (name, e-mail, address...) go in .private-words.txt at the repo root,
# one regex per line. That file is in .gitignore and is never committed.
param([string[]]$Path = @('.'), [switch]$Staged)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
Set-Location $root

$textExt = '.html','.htm','.js','.mjs','.css','.md','.txt','.json','.ps1','.pl','.sh','.bat','.cmd','.yml','.yaml','.xml','.musicxml','.svg','.csv','.ini','.cfg','.toml','.srt','.py',''
$imageExt = '.jpg','.jpeg','.png','.gif','.webp'
$midiExt = '.mid','.midi'   # 楽譜の MIDI: 中に入っている文字（曲名・トラック名・歌詞など）を取り出して、テキストと同じように調べる
$badNames ='^\.env', '\.pem$', '\.key$', '\.pfx$', '\.p12$', '^id_(rsa|ed25519|ecdsa)', '^credentials', '\.kdbx$'
$skipDirs = '\\\.git\\', '\\node_modules\\', '\\_dev\\promo\\out\\'   # 最後は紹介動画（Git に入れない）

$rules = @(
  @{ n = 'メールアドレス';           r = '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}' },
  @{ n = 'PCのユーザーフォルダ';     r = '[A-Za-z]:[\\/]+Users[\\/]+\w[^\\/\s"'']*|/Users/\w[^/\s"'']*|/home/\w[^/\s"'']*' },
  @{ n = '秘密鍵';                   r = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
  @{ n = 'APIキー・トークン';        r = 'sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}' },
  @{ n = 'パスワード等の書き込み';   r = '(?i)(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*["''][^"'']{4,}["'']' },
  @{ n = '電話番号';                 r = '(?<![\d.-])0\d{1,4}-\d{1,4}-\d{4}(?![\d-])' },
  @{ n = '郵便番号・住所';           r = '〒\s*\d{3}-?\d{4}' },
  @{ n = 'Artifact の URL（PUBLISH.local.md に書く）'; r = 'claude\.ai/(code/)?artifacts?/[A-Za-z0-9-]{8,}' }
)
# GitHub's no-reply commit address is meant to be public (it is on every commit anyway)
$allow = @('(?i)@example\.(com|org|net)$', '(?i)^noreply@', '(?i)@users\.noreply\.github\.com$', '^sishiya-support@googlegroups.com$', '^jhlywa@gmail\.com$')   # jhlywa = lib/chess.js@1.4.0 の作者（BSD の著作権表示。消せない）
# 数値だけの .bin で、たまたま 12 字以上の文字に見える並びがあり、目で確かめて付加情報ではなかったもの（ファイル = 見えた並び）
$allowBin = @{ 'sail-wind\data\yd41-push.bin' = 'YDT&U"UK8#nY' }   # int16 の力の表（2026-10-29）

$private = @()
$pw = Join-Path $root '.private-words.txt'
if (Test-Path $pw) {
  $private = Get-Content $pw -Encoding UTF8 | Where-Object { $_ -and $_ -notmatch '^\s*#' }
}

# collect files
$files = @()
if ($Staged) {
  $names = & git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR
  foreach ($n in $names) { if ($n -and (Test-Path -LiteralPath $n -PathType Leaf)) { $files += (Resolve-Path -LiteralPath $n).Path } }
} else {
  foreach ($p in $Path) {
    $full = (Resolve-Path -LiteralPath $p).Path
    if (Test-Path -LiteralPath $full -PathType Leaf) { $files += $full }
    else { $files += Get-ChildItem -LiteralPath $full -Recurse -File -Force | ForEach-Object FullName }
  }
}
$files = $files | Where-Object { $f = $_; -not ($skipDirs | Where-Object { $f -match $_ }) } | Sort-Object -Unique

$hits = New-Object System.Collections.ArrayList
foreach ($f in $files) {
  $rel = $f.Substring($root.Length).TrimStart('\')
  $name = [IO.Path]::GetFileName($f)
  if ($name -eq '.private-words.txt' -or $name -like '*.local.md') {
    if ($Staged) { [void]$hits.Add("$rel : このファイルはコミットしてはいけません（.gitignore を確認）") }
    continue
  }
  foreach ($b in $badNames) { if ($name -match $b) { [void]$hits.Add("$rel : 秘密情報の可能性があるファイル名") } }
  $len = (Get-Item -LiteralPath $f).Length
  if ($len -gt 10MB) { [void]$hits.Add("$rel : 10MB を超える大きなファイル") }
  $ext = [IO.Path]::GetExtension($f).ToLower()
  if ($ext -eq $name.ToLower()) { $ext = '' }   # dotfiles such as .gitignore
  if ($imageExt -contains $ext) {
    # 画像: 撮影情報（Exif・GPS）や文字の埋め込み（PNG の tEXt など）がないか。写っている中身は目で確かめる（RULES 7章）
    $bytes = [IO.File]::ReadAllBytes($f)
    $ascii = [Text.Encoding]::ASCII.GetString($bytes)
    if ($ascii -match 'Exif\x00|GPSInfo|<x:xmpmeta|tEXt|iTXt|zTXt|eXIf') { [void]$hits.Add("$rel : 画像に撮影情報・メタデータがある（消してから公開）") }
    continue
  }
  if ($ext -eq '.wav') {
    # 音（WAV）: 作者名・録音機器などの付加情報の塊（LIST/INFO・id3・bext・iXML）がないか。声の中身（実在の人の声か）は目と耳で確かめる（RULES 7章）
    $bytes = [IO.File]::ReadAllBytes($f)
    $ascii = [Text.Encoding]::ASCII.GetString($bytes, 0, [Math]::Min($bytes.Length, 65536)) + [Text.Encoding]::ASCII.GetString($bytes, [Math]::Max(0, $bytes.Length - 65536), [Math]::Min($bytes.Length, 65536))
    if ($ascii -notmatch '^RIFF') { [void]$hits.Add("$rel : WAV の形ではない（中身を確認）") }
    elseif ($ascii -match 'LIST|INFO|id3 |ID3|bext|iXML|_PMX') { [void]$hits.Add("$rel : WAV に付加情報（作者・機器など）がある（消してから公開）") }
    continue
  }
  if (($ext -eq '.mp4' -and $rel -like 'assets\thumbs\*') -or $ext -eq '.m4a') {
    # 動くサムネイル（make-motion-thumbs.ps1）と、アプリの音（m4a。例: jungle-sound/audio。2026-11-14〜）: 作者・場所・題などの付加情報がないか（ffprobe）。写っている・録れている中身は目と耳で確かめる
    $probe = Get-Command ffprobe -ErrorAction SilentlyContinue
    if (-not $probe) { [void]$hits.Add("$rel : ffprobe がなく付加情報を調べられない（目で確認）"); continue }
    $tags = & $probe.Source -v error -show_entries 'format_tags:stream_tags' -of 'default=nw=1' $f
    $extra = @($tags | Where-Object { $_ -and $_ -notmatch '^TAG:(major_brand|minor_version|compatible_brands|encoder|handler_name|vendor_id|language)=' })
    if ($extra.Count) { [void]$hits.Add("$rel : mp4 に付加情報がある（$($extra -join ', ')）") }
    continue
  }
  if ($ext -eq '.wasm' -and $rel -like 'lib\*') {
    # 外のライブラリの wasm（例: lib/three@0.185.1/examples/jsm/libs/draco/gltf/draco_decoder.wasm。CDN から取ったまま。2026-10-31〜）: 中身はプログラムなので文字は調べない
    continue
  }
  if ($ext -eq '.bin') {
    # 数値だけのデータ（例: tiny-earth/data/etopo1deg.bin の高さの表）: 長い文字列（作者名・場所などの付加情報）がまざっていないか
    $bytes = [IO.File]::ReadAllBytes($f)
    $ascii = [Text.Encoding]::GetEncoding(28591).GetString($bytes)   # Latin-1（ASCII だと 128 以上が「?」になって文字に見える)
    $runs = @([regex]::Matches($ascii, '[\x20-\x7e]{12,}') | ForEach-Object { $_.Value } | Where-Object { $_ -ne $allowBin[$rel] })
    if ($runs.Count) { [void]$hits.Add("$rel : bin に文字列がまざっている（中身を確認）: $($runs[0])") }
    continue
  }
  if ($ext -eq '.glb') {
    # 3D のモデル（例: chess-battle/assets/ の兵士。Blender で書き出し）: 先頭の JSON の部分（名前・作った道具・extras）を文字として調べる。
    # 中の画像は Blender が書きなおした JPEG（撮影情報なし）。2026-10-31〜
    $bytes = [IO.File]::ReadAllBytes($f)
    $len = [BitConverter]::ToUInt32($bytes, 12)
    $lines = @([Text.Encoding]::UTF8.GetString($bytes, 20, $len) -split '[,{}]')
    if ($lines -match '"extras"') { [void]$hits.Add("$rel : glb に extras（付加情報）がある（中身を確認）") }
  } elseif ($midiExt -contains $ext) {
    $txt = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($f))
    $lines = @([regex]::Matches($txt, '[\x20-\x7e　-鿿＀-￯]{3,}') | ForEach-Object { $_.Value })
  } elseif ($textExt -notcontains $ext) { [void]$hits.Add("$rel : テキスト以外のファイル（画像なら撮影情報・写り込みを目で確認）"); continue }
  else { $lines = [IO.File]::ReadAllLines($f, [Text.Encoding]::UTF8) }
  # 起動の .bat と、cmd・PowerShell 5.1 が ANSI で読むスクリプトは英語（ASCII）だけ（日本語がまざると次の行がこわれる。2026-10-15 start.bat が動かなかった）
  if ($rel -match '(^|[\\/])(start\.bat|start\.ps1|serve\.ps1)$' -and ($lines -join "`n") -match '[^\x00-\x7F]') { [void]$hits.Add("$rel : 起動スクリプトに日本語などがまざっている（ASCII だけにする）") }
  for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    foreach ($ru in $rules) {
      foreach ($m in [regex]::Matches($line, $ru.r)) {
        $v = $m.Value
        if ($allow | Where-Object { $v -match $_ }) { continue }
        [void]$hits.Add("${rel}:$($i+1) : $($ru.n) → $v")
      }
    }
    foreach ($w in $private) {
      if ($line -match "(?i)$w") { [void]$hits.Add("${rel}:$($i+1) : .private-words.txt の語 → $($Matches[0])") }
    }
  }
}

# 電池（基本ルール。RULES 9章）: 画面を離れても止まらないもの（マイク・カメラ・音・Worker）を使うアプリに、止める処理があるか
# 共通の部品 assets/power.js を使わず自分で止めている、裏でも動かないなど、目で確かめたアプリは _dev/tools/power-reviewed.txt に「アプリ名 理由」で書く
$powerOk = @{}
$powerList = Join-Path $root '_dev/tools/power-reviewed.txt'
if (Test-Path -LiteralPath $powerList) { Get-Content -LiteralPath $powerList -Encoding UTF8 | Where-Object { $_ -and $_ -notmatch '^\s*#' } | ForEach-Object { $powerOk[($_ -split '\s+')[0]] = $true } }
$powerApps = @($files | ForEach-Object { $_.Substring($root.Length).TrimStart('\') } | Where-Object { $_ -match '\\' } | ForEach-Object { ($_ -split '\\')[0] } | Sort-Object -Unique)
foreach ($a in $powerApps) {
  $dir = Join-Path $root $a
  if ($a -match '^[_.]' -or $a -in 'tools','assets','thumbs','server','node_modules','lib' -or -not (Test-Path -LiteralPath (Join-Path $dir 'index.html'))) { continue }
  $code = (Get-ChildItem -LiteralPath $dir -Recurse -File | Where-Object { $_.Extension -in '.js','.mjs','.html' -and $_.FullName -notmatch '\\(versions|vendor|tools|look|node_modules)\\' } | ForEach-Object { [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8) }) -join "`n"
  if ($code -match '\bPower\.(on|audio|away)' -and $code -notmatch 'assets/power\.js') { [void]$hits.Add("$a : 電池 → Power を使っているのに assets/power.js を読みこんでいない") }
  if ($powerOk[$a]) { continue }
  if ($code -match 'getUserMedia' -and ($code -notmatch '\bPower\.on\(' -or $code -notmatch 'getTracks\(\)')) { [void]$hits.Add("$a : 電池 → マイク・カメラを、画面を離れたときに閉じていない（Power.on と track.stop。RULES 9章）") }
  if ($code -match 'AudioContext' -and $code -notmatch '\bPower\.(audio|on)\(|\.suspend\(') { [void]$hits.Add("$a : 電池 → AudioContext を、画面を離れたときに止めていない（Power.audio。RULES 9章）") }
  if ($code -match 'new\s+Worker\(' -and $code -notmatch '\bPower\.on\(') { [void]$hits.Add("$a : 電池 → Worker を、画面を離れたときに止めていない（Power.on。RULES 9章）") }
}

if ($hits.Count) {
  Write-Host "公開前チェック: 要確認 $($hits.Count) 件（$($files.Count) ファイルを調べました）" -ForegroundColor Yellow
  $hits | ForEach-Object { Write-Host "  $_" }
  Write-Host "問題がなければ内容を直すか、_dev/tools/check-public.ps1 の allow に加えてから、もう一度実行してください。"
  exit 1
}
Write-Host "公開前チェック: 問題なし（$($files.Count) ファイル）" -ForegroundColor Green
exit 0
