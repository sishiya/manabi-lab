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

$textExt = '.html','.htm','.js','.mjs','.css','.md','.txt','.json','.ps1','.pl','.sh','.bat','.cmd','.yml','.yaml','.xml','.musicxml','.svg','.csv','.ini','.cfg','.toml','.srt',''
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
$allow = @('(?i)@example\.(com|org|net)$', '(?i)^noreply@', '(?i)@users\.noreply\.github\.com$')

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
  if ($ext -eq '.bin') {
    # 数値だけのデータ（例: tiny-earth/data/etopo1deg.bin の高さの表）: 長い文字列（作者名・場所などの付加情報）がまざっていないか
    $bytes = [IO.File]::ReadAllBytes($f)
    $ascii = [Text.Encoding]::GetEncoding(28591).GetString($bytes)   # Latin-1（ASCII だと 128 以上が「?」になって文字に見える)
    if ($ascii -match '[\x20-\x7e]{12,}') { [void]$hits.Add("$rel : bin に文字列がまざっている（中身を確認）") }
    continue
  }
  if ($midiExt -contains $ext) {
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

if ($hits.Count) {
  Write-Host "公開前チェック: 要確認 $($hits.Count) 件（$($files.Count) ファイルを調べました）" -ForegroundColor Yellow
  $hits | ForEach-Object { Write-Host "  $_" }
  Write-Host "問題がなければ内容を直すか、_dev/tools/check-public.ps1 の allow に加えてから、もう一度実行してください。"
  exit 1
}
Write-Host "公開前チェック: 問題なし（$($files.Count) ファイル）" -ForegroundColor Green
exit 0
