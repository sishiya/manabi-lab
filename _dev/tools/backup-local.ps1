# Git に入っていないもの（PC にしかないもの）を、リポジトリの外へ写す。PC が壊れたときの予防線（_dev/RECOVERY.md）。
# 写すもの:
#   - Claude のメモリ（~/.claude/projects/<このフォルダ>/memory）
#   - 自分用の設定: .private-words.txt・*.local.txt・*.local.md・.claude/settings.local.json
#   - 道具の記録: _dev/tools/out/（YouTube の数の履歴・quota・健康診断。小さい）
#   - Git の全部の記録（git bundle。まだ push していないコミットも入る）
#   - -IncludeSecrets のときだけ: YouTube の秘密のフォルダ（youtube-upload.local.txt が指す場所）。中身は読まず・表示せず、そのまま写す
# 写さないもの: mp4 など _dev/promo/out/（Git に入っている台本から record-promo.ps1 で作りなおせる。上げたものは YouTube にある）
# 写し先は Git のフォルダの中には置けない（秘密や個人の語が Git に入らないように。中なら止まる）。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/backup-local.ps1 -Dest "<写し先のフォルダ>"   # 写し先を覚えて写す
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/backup-local.ps1                         # 覚えた写し先へ（backup.local.txt）
#   ... -IncludeSecrets   # 秘密も（写し先が暗号化された・自分だけのところのときだけ）
# 写し先を覚えていれば、週1回の健康診断（health.ps1）のあとにも自動で写す（秘密はふくめない）。
param(
  [string]$Dest,
  [switch]$IncludeSecrets,
  [switch]$Quiet
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$destFile = Join-Path $PSScriptRoot 'backup.local.txt'
function Say($s) { if (-not $Quiet) { Write-Host $s } }

if (-not $Dest) {
  if (-not (Test-Path $destFile)) { if ($Quiet) { exit 0 }; throw "写し先がまだ決まっていない。-Dest `"<フォルダ>`" をつけて1回実行する" }
  $Dest = (Get-Content $destFile -Encoding UTF8 | Select-Object -First 1).Trim()
}
$Dest = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Dest)).TrimEnd('\')

# 写し先が Git の作業フォルダ（このリポジトリも、ほかのも）なら止める
$rootFull = (Resolve-Path $root).Path
if (($Dest + '\').StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "写し先がこのリポジトリの中: $Dest" }
[IO.Directory]::CreateDirectory($Dest) | Out-Null
$inGit = $false
try { $null = & git -C $Dest rev-parse --is-inside-work-tree 2>$null; if ($LASTEXITCODE -eq 0) { $inGit = $true } } catch {}
if ($inGit) { throw "写し先が Git の作業フォルダの中（秘密が Git に入るおそれ）: $Dest" }
Set-Content -Path $destFile -Value $Dest -Encoding UTF8

$stamp = Get-Date -Format 'yyyy-MM-dd'
$base = Join-Path $Dest 'manabi-lab-backup'
$cur = Join-Path $base 'latest'
[IO.Directory]::CreateDirectory($cur) | Out-Null

function CopyIn($src, $rel) {
  if (-not (Test-Path $src)) { return }
  $to = Join-Path $cur $rel
  [IO.Directory]::CreateDirectory((Split-Path -Parent $to)) | Out-Null
  if ((Get-Item $src).PSIsContainer) {
    & robocopy $src $to /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy が失敗: $src" }
  } else { Copy-Item $src $to -Force }
  Say "  写した: $rel"
}

Say "写し先: $cur"
# Claude のメモリ（このフォルダの分）
$projKey = ($rootFull -replace '[^A-Za-z0-9]', '-')
CopyIn (Join-Path $env:USERPROFILE ".claude/projects/$projKey/memory") 'claude-memory'
# 自分用の設定・メモ
CopyIn (Join-Path $root '.private-words.txt') 'repo/.private-words.txt'
CopyIn (Join-Path $root '.claude/settings.local.json') 'repo/.claude/settings.local.json'
Get-ChildItem $root -Recurse -File -Include '*.local.txt', '*.local.md' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\(versions|node_modules|\.git)\\' } |
  ForEach-Object { CopyIn $_.FullName ('repo/' + $_.FullName.Substring($rootFull.Length + 1)) }
# 道具の記録
CopyIn (Join-Path $root '_dev/tools/out') 'repo/_dev/tools/out'
# Git の全部の記録（push していないコミットも）
$bundle = Join-Path $cur 'manabi-lab.bundle'
& git -C $root bundle create $bundle --all 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'git bundle が失敗' }
Say "  写した: manabi-lab.bundle（戻すとき: git clone manabi-lab.bundle manabi-lab）"

if ($IncludeSecrets) {
  $lf = Join-Path $PSScriptRoot 'youtube-upload.local.txt'
  if (Test-Path $lf) {
    $sd = [Environment]::ExpandEnvironmentVariables((Get-Content $lf -Encoding UTF8 | Select-Object -First 1).Trim())
    if (Test-Path $sd) {
      # 中身は読まない・表示しない。フォルダごとそのまま写す
      & robocopy $sd (Join-Path $cur 'secrets/youtube') /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
      if ($LASTEXITCODE -ge 8) { throw 'robocopy が失敗（秘密のフォルダ）' }
      Say '  写した: secrets/youtube（YouTube の秘密。中身は表示していない）'
    }
  }
} elseif (Test-Path (Join-Path $cur 'secrets')) {
  Say '  （前に写した secrets/ が残っている。要らなければ消す）'
}

Set-Content -Path (Join-Path $base 'README.txt') -Encoding UTF8 -Value @(
  "しし屋 まなびラボのバックアップ（Git に入っていないもの）。最終: $stamp",
  '戻し方はリポジトリの _dev/RECOVERY.md。',
  'latest/manabi-lab.bundle = Git の全部の記録（git clone manabi-lab.bundle manabi-lab で戻る）。',
  'latest/claude-memory = Claude のメモリ（~/.claude/projects/<フォルダ>/memory に戻す）。',
  'latest/repo = リポジトリの同じ場所に戻すファイル。secrets/ があれば YouTube の秘密（人に渡さない）。'
)
Say "バックアップ: すみ（$stamp）"
