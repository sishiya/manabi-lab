# 新しいアプリの雛形を作り、保管庫まわりの一覧にまとめて足す（RULES 1・3・4・8.1）。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/new-app.ps1 -Id my-app -Title 'アプリの名前' -Desc '保管庫のカードの説明（1〜3文）' [-Kind 単独アプリ] [-Color '#1d2b3a'] [-Accent '#ffc95a'] [-Glyph '<circle cx=''32'' cy=''32'' r=''14'' fill=''%23ffc95a''/>'] [-DryRun]
# 作るもの:
#   <id>/PLAN.md・DEVNOTES.md（決まった見出し）、index.html（viewport・ファビコン・アクセス解析の1行・フォント・css/js）、
#   css/style.css、js/main.js（デバッグ用の窓口 window.__<略>・__<略>Err）、launcher.html、versions/v001-start/（丸ごと）
# 足すもの（どれも1行・1枚。あとで中身を書きかえる）:
#   archive.html のいちばん上のカード（新着順）、_dev/tools/thumb.html の SETUP、make-thumbs.ps1・make-motion-thumbs.ps1 の一覧、
#   CLAUDE.md の一覧、README.md の保管庫の表
# 入口（index.html の APPS）には足さない（ユーザーが指示したときだけ。RULES 8.1）。
# サムネイル assets/thumbs/<id>.jpg と動く <id>.mp4 は、画面ができてから make-thumbs.ps1・make-motion-thumbs.ps1 -Apps <id> で撮る
# （止めて撮るアプリは、thumb.html の MOTION で動きはじめさせる）。
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z][a-z0-9-]+$')][string]$Id,
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Desc,
  [string]$Kind = '単独アプリ',
  [string]$Color = '#14202c',
  [string]$Accent = '#ffc95a',
  [string]$Glyph,
  [string]$State = '試作（段階Aの途中）',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
$utf8 = New-Object Text.UTF8Encoding $false
function Read-Text($p) { [IO.File]::ReadAllText((Join-Path $root $p), [Text.Encoding]::UTF8) }
function Write-Text($p, [string]$s) {
  $full = Join-Path $root $p
  if ($DryRun) { Write-Host "（DryRun）書く: $p"; return }
  [IO.Directory]::CreateDirectory((Split-Path -Parent $full)) | Out-Null
  [IO.File]::WriteAllText($full, $s, $utf8)
  Write-Host "書いた: $p"
}
$dir = Join-Path $root $Id
if (Test-Path $dir) { throw "$Id はもうあります" }
$today = Get-Date -Format 'yyyy-MM-dd'
$short = (($Id -split '-') | ForEach-Object { $_.Substring(0, [Math]::Min(2, $_.Length)) }) -join ''   # 例 mood-world → mowo
$enc = { param($c) $c -replace '#', '%23' }
if (-not $Glyph) { $Glyph = "<circle cx='32' cy='32' r='15' fill='none' stroke='$(& $enc $Accent)' stroke-width='6'/>" }
$favicon = "<link rel=`"icon`" href=`"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='$(& $enc $Color)'/>$Glyph</svg>`">"

# アクセス解析の1行は入口からそのままコピーする（RULES 8.1「いちばん確かなのは入口の index.html からコピー」）
$ga = (Read-Text 'index.html') -split "`r?`n" | Where-Object { $_ -like '<script>/* アクセス解析*' } | Select-Object -First 1
if (-not $ga) { throw '入口の index.html にアクセス解析の1行が見つかりません' }
$fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=IBM+Plex+Mono:wght@400;500&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">'

# ---------- アプリのファイル ----------
$index = @"
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$Title</title>
$favicon
$ga
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
$fonts
<link rel="stylesheet" href="css/style.css">

<div id="app">
  <header id="top"><h1>$Title</h1></header>
  <main id="stage"><canvas id="cv"></canvas></main>
  <details id="about">
    <summary>このアプリについて</summary>
    <p>学習用に簡単にしています。</p>
    <h3>おもな出どころ</h3>
    <ul><li>（確かめた研究・資料をここへ。外へのリンクは target="_blank" rel="noopener"）</li></ul>
    <h3>使っているもの</h3>
    <p>フォント: Google Fonts（SIL Open Font License）</p>
  </details>
</div>

<script src="js/main.js"></script>
"@

$css = @"
/* $Title */
:root{--bg:$Color;--ink:#e8f0f4;--muted:#a3b4bf;--acc:$Accent;
  --f-display:'Dela Gothic One','Yu Gothic',sans-serif;--f-body:'Zen Kaku Gothic New','Yu Gothic',system-ui,sans-serif;--f-mono:'IBM Plex Mono',Consolas,monospace;color-scheme:dark}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font-family:var(--f-body)}
[hidden]{display:none!important}
#app{display:flex;flex-direction:column;min-height:100%}
#top h1{font-family:var(--f-display);font-weight:400;font-size:22px;margin:0;padding:12px 16px}
#stage{flex:1;position:relative;min-height:60vh}
#cv{position:absolute;inset:0;width:100%;height:100%;display:block}
#about{padding:8px 16px 24px;color:var(--muted);font-size:14px;line-height:1.8}
#about summary{cursor:pointer;color:var(--ink)}
#about a{color:var(--acc)}
"@

$js = @"
// $Title — メイン（描画ループと、デバッグ用の窓口）
'use strict';
window.__${short}Err = [];
window.addEventListener('error', e => window.__${short}Err.push(String(e.message)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const S = { t: 0 };

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function step(dt) { S.t += dt; }
function draw() {
  const w = cv.clientWidth, h = cv.clientHeight;
  g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--acc');
  g.beginPath(); g.arc(w / 2, h / 2, 30 + 6 * Math.sin(S.t * 2), 0, Math.PI * 2); g.fill();
}
let last = performance.now();
function loop(now) { step(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now; /* 最初のコマは now が last より前のことがある */ draw(); requestAnimationFrame(loop); }
window.addEventListener('resize', resize);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__$short = { S, simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); draw(); } };
"@

$plan = @"
# $Title 企画書

作成 $today

## ユーザーの依頼

## ねらい

## 形

## 段階A（この版）

## 段階B以降（案）

## やらないこと

## 簡単にするところ（画面にも書く）

## 出どころ（確かめたもの）
"@

$devnotes = @"
# $Title 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: v001-start（雛形）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。
- 次にやること: PLAN.md の段階A。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps（.claude/launch.json）で http://localhost:8765/$Id/ 。デバッグ用の窓口 ``window.__$short``（``simRun(秒)``）、エラーは ``window.__${short}Err``。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へコピーしてカードに。RULES 3章）。
- ユーザーの好み:

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 画面の骨組み（doctype なし。Artifact でも Pages でも開ける） | |
| css/style.css | 見た目 | |
| js/main.js | 描画ループ・デバッグ用の窓口 | ``S``・``step``・``draw``・``window.__$short`` |

## しくみ

## ハマったところ

## 確認のしかた（変更のたびに）
1. ``powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps $Id``（例外・読み込みの失敗・外への通信）
2.

## 状態
- $today v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
"@

$launcher = @"
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$Title ランチャー</title>
$favicon
$fonts
<style>
:root{--bg:#0c141c;--ink:#e8f0f4;--muted:#a3b4bf;--dim:#6f8494;--line:rgba(170,210,235,.14);--panel:#0f1a24;--acc:$Accent;
  --f-display:'Dela Gothic One','Yu Gothic',sans-serif;--f-body:'Zen Kaku Gothic New','Yu Gothic',system-ui,sans-serif;--f-mono:'IBM Plex Mono',Consolas,monospace;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body)}
main{max-width:760px;margin:0 auto;padding:48px 16px 64px;display:flex;flex-direction:column;gap:28px}
.eyebrow{font-family:var(--f-mono);font-size:11px;letter-spacing:.2em;color:var(--muted)}
h1{font-family:var(--f-display);font-weight:400;font-size:40px;margin:6px 0 0;letter-spacing:.04em}
h2{font-size:12px;letter-spacing:.18em;color:var(--dim);font-weight:500;margin:0 0 10px}
.cards{display:flex;flex-direction:column;gap:12px}
.card{display:grid;grid-template-columns:auto 1fr auto;gap:6px 18px;align-items:start;padding:16px 18px;background:var(--panel);border:1px solid var(--line);border-radius:6px;text-decoration:none;color:inherit}
.card:hover,.latest{border-color:var(--acc)}
.card:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.ver{font-family:var(--f-mono);font-size:13px;color:var(--acc);padding-top:3px}
.card b{font-size:17px}
.card p{margin:4px 0 0;font-size:13px;line-height:1.75;color:var(--muted)}
.date{font-family:var(--f-mono);font-size:11px;color:var(--dim);white-space:nowrap;padding-top:4px}
.tag{display:inline-block;font-size:10px;letter-spacing:.12em;border:1px solid var(--acc);color:var(--acc);padding:1px 6px;margin-left:8px;vertical-align:2px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:8px 6px;border-top:1px solid var(--line);vertical-align:top}
td:first-child{font-family:var(--f-mono);color:var(--muted);white-space:nowrap}
td a{color:var(--ink)}
@media (max-width:520px){.card{grid-template-columns:1fr}.date{padding:0}h1{font-size:30px}}
</style>
</head>
<body>
<main>
  <header><div class="eyebrow">$($Id.ToUpper()) · VERSIONS</div><h1>$Title</h1></header>
  <section>
    <h2>ターニングポイント</h2>
    <div class="cards">
      <a class="card latest" href="index.html"><span class="ver">最新</span><div><b>作業中の最新版<span class="tag">LATEST</span></b><p>いま作業フォルダにある index.html。</p></div><span class="date">—</span></a>
    </div>
  </section>
  <section>
    <h2>すべてのバックアップ</h2>
    <table><tr><td>v001-start</td><td><a href="versions/v001-start/index.html">雛形（new-app.ps1）</a></td><td>$today</td></tr></table>
  </section>
</main>
</body>
</html>
"@

$files = [ordered]@{ 'index.html' = $index; 'css/style.css' = $css; 'js/main.js' = $js }
foreach ($k in $files.Keys) { Write-Text "$Id/$k" $files[$k]; Write-Text "$Id/versions/v001-start/$k" $files[$k] }
Write-Text "$Id/PLAN.md" $plan
Write-Text "$Id/DEVNOTES.md" $devnotes
Write-Text "$Id/launcher.html" $launcher

# ---------- 一覧に足す ----------
function Edit-Text($p, [scriptblock]$fn, [string]$what) {
  $s = Read-Text $p
  $t = & $fn $s
  if ($t -eq $s) { Write-Host "△ $p に $what を足せなかった（手で足す）" -ForegroundColor Yellow; return }
  if ($DryRun) { Write-Host "（DryRun）$p に $what"; return }
  # BOM は元のままに（.ps1 は BOM がないと PowerShell 5.1 で日本語が化ける）
  $b = [IO.File]::ReadAllBytes((Join-Path $root $p))
  $bom = $b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF
  [IO.File]::WriteAllText((Join-Path $root $p), $t, (New-Object Text.UTF8Encoding $bom))
  Write-Host "足した: $p（$what）"
}
$h = [Security.SecurityElement]::Escape($Desc)
$card = "    <div class=`"card`"><div class=`"pic`"><span class=`"proto`">試作</span><img class=`"thumb`" src=`"assets/thumbs/$Id.jpg`" alt=`"`" width=`"640`" height=`"360`" loading=`"lazy`"></div><div class=`"body`"><a class=`"open`" href=`"$Id/`">$Title</a><p>$h</p><p class=`"state`">$State</p><div class=`"foot`"><span class=`"dates`">作成 $today ・ 更新 $today</span><a class=`"ver`" href=`"$Id/launcher.html`">過去の版</a></div></div></div>"
Edit-Text 'archive.html' { param($s) $i = $s.IndexOf('    <div class="card">'); if ($i -lt 0) { $s } else { $s.Insert($i, $card + "`n") } } '保管庫のカード（いちばん上）'
Edit-Text '_dev/tools/thumb.html' { param($s) $s.Replace("const SETUP = {`n", "const SETUP = {`n  // $Title（画面ができたら、いちばん映える場面にする）`n  '$Id': async w => { await wait(1500); },`n") } 'SETUP'
Edit-Text '_dev/tools/make-thumbs.ps1' { param($s) $s -replace "('quantum'\),)", "'$Id',`$1" } '撮影の一覧'
Edit-Text '_dev/tools/make-motion-thumbs.ps1' { param($s) $s -replace "('quantum'\),)", "'$Id',`$1" } '動くサムネイルの一覧'
Edit-Text 'CLAUDE.md' { param($s) $i = $s.IndexOf("`n`n新しいアプリを足したら"); if ($i -lt 0) { $s } else { $s.Insert($i, "`n| ``$Id/`` | $Title | 保管庫 | $Desc |") } } '一覧の表の1行'
Edit-Text 'README.md' { param($s) $m = [regex]::Match($s, '### 保管庫[^\n]*\n\n\| フォルダ \| アプリ \|\r?\n\|---\|---\|\r?\n'); if (-not $m.Success) { $s } else { $s.Insert($m.Index + $m.Length, "| ``$Id/`` | $Title |`n") } } '保管庫の表'

Write-Host ''
Write-Host "できた: $Id（http://localhost:8765/$Id/）。次: PLAN.md を書く → 画面ができたら thumb.html の SETUP（と MOTION）を直して make-thumbs.ps1・make-motion-thumbs.ps1 -Apps $Id → smoke.ps1 -Apps $Id"
