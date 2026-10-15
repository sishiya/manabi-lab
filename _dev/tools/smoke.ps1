# 全アプリの動作確認（スモークテスト）。ヘッドレスの Chrome で _dev/tools/thumb.html?app=<app> を開き、
# サムネイルと同じ準備（開始ボタン・カメラ移動など。thumb.html の SETUP）まで動かして、次を調べる:
#   - 例外（JS のエラー）・console.error・読み込みの失敗（404 など）
#   - 許可していない外への通信（RULES 7章: 許可した CDN とフォントだけ。god-view は地図・データ源も）
#   - ローカルで Google アナリティクスが動いていないか（gtag が undefined か）
#   - 英語（?lang=en）で画面に日本語が残っていないか（入口の APPS で en:true のアプリ。見えている文字だけ）
# 各アプリの DEVNOTES の「確認のしかた」の代わりではない（共通の壊れ方を早く見つけるためのもの）。
#
# 使い方（ローカルのサーバー apps を起動しておく。リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1                    # 全部（日本語＋英語対応ずみは英語も。数分）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps black-hole,quantum -Lang en
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Base https://sishiya.github.io/manabi-lab   # push のあと、公開版で
# _root は入口（ルートの index.html）。結果は _dev/tools/out/smoke-last.json（Git に入れない）。
# 終了コード 0 = 問題なし（注意だけのときも 0）、1 = 見てほしいものがある。
param(
  [string[]]$Apps,
  [ValidateSet('ja', 'en', 'both')][string]$Lang = 'both',
  [int]$Port = 8765,
  [string]$Base,
  [int]$DebugPort = 9334,
  [int]$TimeoutSec = 120,
  [int]$AfterSec = 3
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'cdp.ps1')
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
if (-not $Base) { $Base = "http://localhost:$Port" }
$Base = $Base.TrimEnd('/')
$isPages = $Base -notmatch '^http://(localhost|127\.0\.0\.1)'

# --- 対象のアプリ ---
$indexHtml = [IO.File]::ReadAllText((Join-Path $root 'index.html'), [Text.Encoding]::UTF8)
$enApps = [regex]::Matches($indexHtml, "\{id:'([\w-]+)'[^\r\n]*?en:true") | ForEach-Object { $_.Groups[1].Value }
if (-not $Apps) {
  $Apps = @('_root') + (Get-ChildItem $root -Directory | Where-Object {
      $_.Name -notmatch '^[_.]|^assets$' -and (Test-Path (Join-Path $_.FullName 'index.html'))
    } | ForEach-Object { $_.Name })
}
$Apps = $Apps | ForEach-Object { $_ -split ',' } | Where-Object { $_ }

# --- 外への通信で許すもの（ホスト名の正規表現） ---
$allowCommon = @('^localhost$', '^127\.0\.0\.1$', '^cdnjs\.cloudflare\.com$', '^cdn\.jsdelivr\.net$', '^unpkg\.com$',
  '^fonts\.googleapis\.com$', '^fonts\.gstatic\.com$')
if ($isPages) { $allowCommon += @('^sishiya\.github\.io$', '^www\.googletagmanager\.com$', '(^|\.)google-analytics\.com$', '^(www\.)?google\.com$') }
$allowApp = @{
  # 地図・地形・写真・建物・データ源（god-view/DEVNOTES.md の「データ源」。キー不要のものだけ）
  'god-view' = @('\.gsi\.go\.jp$', '^gibs\.earthdata\.nasa\.gov$', '(^|\.)openstreetmap\.org$', '(^|\.)openfreemap\.org$',
    '^earthquake\.usgs\.gov$', '\.odpt\.org$', '^celestrak\.org$', '\.amazonaws\.com$', '\.plateau\.reearth\.io$')
  # 分類（Catalogue of Life, CC BY）と和名（Wikidata, CC0）と図（Wikimedia Commons。条件の合う写真だけ）。枝を開く・検索するときに読む（tree-of-life/PLAN.md の「使ってよいか」）
  'tree-of-life' = @('^api\.checklistbank\.org$', '^query\.wikidata\.org$', '^www\.wikidata\.org$', '^commons\.wikimedia\.org$', '^upload\.wikimedia\.org$', '^thumb\.wikimedia\.org$', '^en\.wikipedia\.org$')
}
# 失敗してもよい読み込み（URL の正規表現）
$ignoreFail = @('/favicon\.ico$')
$ignoreApp = @{
  # 地理院の標高タイルは、データのない所（海など）で 404 を返す（ふつうのこと）
  'god-view' = @('cyberjapandata\.gsi\.go\.jp/xyz/dem')
}

function Short([string]$s, [int]$n = 160) { $s = ($s -replace '\s+', ' ').Trim(); if ($s.Length -gt $n) { $s.Substring(0, $n) + '…' } else { $s } }
function Ignored([string]$u, [string]$a) { foreach ($rx in $ignoreFail + @($ignoreApp[$a])) { if ($rx -and $u -match $rx) { return $true } }; return $false }

# iframe（アプリ）の中を調べる式
$probe = @'
(() => {
  const f = document.getElementById('f'); let w, d;
  try { w = f.contentWindow; d = w.document; } catch (e) { return JSON.stringify({ err: 'iframe を読めない: ' + e }); }
  const txt = (d.body && d.body.innerText) || '';
  const jp = /[぀-ヿ㐀-鿿]/;
  const lines = txt.split(/\n/).map(s => s.trim()).filter(s => s && jp.test(s) && !/^(日本語|JP)$/.test(s));
  return JSON.stringify({
    title: d.title, lang: d.documentElement.lang, gtag: typeof w.gtag,
    textLen: txt.length, canvases: d.querySelectorAll('canvas').length,
    jpCount: lines.length, jpLines: lines.slice(0, 6)
  });
})()
'@

try { Invoke-WebRequest -UseBasicParsing "$Base/_dev/tools/thumb.html" -TimeoutSec 10 | Out-Null }
catch { throw "$Base を開けません。ローカルならサーバー apps（.claude/launch.json）を起動してから。ポートが違えば -Port で" }
$cdp = Start-CdpChrome -Name 'manabi-smoke' -Port $DebugPort
$ng = 0; $warn = 0; $report = New-Object Collections.ArrayList
try {
  foreach ($a in $Apps) {
    $langs = switch ($Lang) { 'ja' { @('ja') } 'en' { @('en') } default { if ($enApps -contains $a -or $a -eq '_root') { @('ja', 'en') } else { @('ja') } } }
    foreach ($lg in $langs) {
      $label = "$a [$lg]"
      $ws = Open-CdpTab $cdp
      foreach ($d in 'Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable') { [void](Send-Cdp $ws $d) }
      $t0 = Get-Date
      [void](Send-Cdp $ws 'Page.navigate' @{ url = "$Base/_dev/tools/thumb.html?app=$a&lang=$lg" })
      $ready = $false
      while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSec) {
        Wait-CdpEvents $ws 1
        if ((Invoke-CdpEval $ws 'document.title') -eq 'ready') { $ready = $true; break }
      }
      Wait-CdpEvents $ws $AfterSec
      $info = $null
      try { $info = (Invoke-CdpEval $ws $probe) | ConvertFrom-Json } catch {}
      $sec = [int]((Get-Date) - $t0).TotalSeconds

      # --- 集める ---
      $errs = New-Object Collections.ArrayList; $warns = New-Object Collections.ArrayList
      $urls = @{}; $hosts = @{}
      foreach ($e in $script:CdpEvents) {
        $p = $e.params
        switch ($e.method) {
          'Runtime.exceptionThrown' {
            $x = $p.exceptionDetails
            $msg = if ($x.exception -and $x.exception.description) { $x.exception.description } else { $x.text }
            [void]$errs.Add("例外: $(Short $msg) ($([IO.Path]::GetFileName([string]$x.url)):$($x.lineNumber + 1))")
          }
          'Runtime.consoleAPICalled' {
            if ($p.type -in 'error', 'assert') {
              $msg = ($p.args | ForEach-Object { if ($null -ne $_.value) { $_.value } else { $_.description } }) -join ' '
              [void]$errs.Add("console.error: $(Short $msg)")
            }
          }
          'Log.entryAdded' {
            if ($p.entry.level -eq 'error' -and -not (Ignored ([string]$p.entry.url) $a)) { [void]$errs.Add("ログ: $(Short ($p.entry.text + ' ' + $p.entry.url))") }
          }
          'Network.requestWillBeSent' {
            $u = [string]$p.request.url
            $urls[$p.requestId] = $u
            if ($u -match '^(https?|wss?)://([^/:]+)') {
              $h = $Matches[2].ToLower()
              $ok = $false
              foreach ($rx in $allowCommon + @($allowApp[$a])) { if ($rx -and $h -match $rx) { $ok = $true; break } }
              if (-not $ok) { $hosts[$h] = $u }
            }
          }
          'Network.responseReceived' {
            if ($p.response.status -ge 400 -and -not (Ignored ([string]$p.response.url) $a)) { [void]$errs.Add("HTTP $($p.response.status): $(Short $p.response.url)") }
          }
          'Network.loadingFailed' {
            if (-not $p.canceled -and -not (Ignored ([string]$urls[$p.requestId]) $a)) { [void]$errs.Add("読み込み失敗 $($p.errorText): $(Short $urls[$p.requestId])") }
          }
        }
      }
      foreach ($h in $hosts.Keys) { [void]$errs.Add("許可していない外への通信: $h ($(Short $hosts[$h] 100))") }
      if (-not $ready) { [void]$warns.Add("準備が $TimeoutSec 秒で終わらなかった（thumb.html の SETUP を見る）") }
      if (-not $info) { [void]$errs.Add('アプリの中を調べられなかった') }
      elseif ($info.err) { [void]$errs.Add($info.err) }
      else {
        if (-not $isPages -and $info.gtag -ne 'undefined') { [void]$errs.Add("ローカルで gtag が動いている（$($info.gtag)）") }
        if ($info.textLen -eq 0 -and $info.canvases -eq 0) { [void]$errs.Add('画面がからっぽ（文字も canvas もない）') }
        if ($lg -eq 'en' -and $info.jpCount -gt 0) {
          [void]$warns.Add("英語で日本語が $($info.jpCount) 行: " + (($info.jpLines | ForEach-Object { Short $_ 40 }) -join ' / '))
        }
      }
      $errs = @($errs | Select-Object -Unique)

      if ($errs.Count) { $ng++; Write-Host "NG   $label（$sec 秒）" -ForegroundColor Red }
      elseif ($warns.Count) { $warn++; Write-Host "注意 $label（$sec 秒）" -ForegroundColor Yellow }
      else { Write-Host "OK   $label（$sec 秒）" -ForegroundColor Green }
      foreach ($m in $errs) { Write-Host "       ✕ $m" }
      foreach ($m in $warns) { Write-Host "       △ $m" }
      [void]$report.Add([pscustomobject]@{ app = $a; lang = $lg; ok = ($errs.Count -eq 0); errors = $errs; warnings = @($warns); sec = $sec })
      Close-CdpTab $cdp $ws
    }
  }
} finally {
  Stop-CdpChrome $cdp   # 確認用に起動した Chrome（専用のプロフィール）だけ
}

$outDir = Join-Path $root '_dev/tools/out'
[IO.Directory]::CreateDirectory($outDir) | Out-Null
$report | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $outDir 'smoke-last.json')
Write-Host ''
Write-Host "スモークテスト: $($report.Count) 件、NG $ng、注意 $warn（$Base）。結果は _dev/tools/out/smoke-last.json"
if ($ng) { exit 1 } else { exit 0 }
