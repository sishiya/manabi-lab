# 紹介動画の録画と、確かめ用のコマを一度に（_dev/promo/README.md「作り方」の 4〜6）。
# Chrome で台本ページ _dev/promo/<台本>.html を開き、準備ができたら:
#   1. 確かめ用のコマを1枚に並べて保存（-Peek の秒。__peekSheet → _dev/promo/out/peek-<out>.jpg）
#   2. 録画（__promoRecord）。終わるまで待つ（説明動画 150 秒の 4K で数分、god-view は数十分）
#   3. できた mp4 から -Check の秒のコマを抜いて1枚に並べる（_dev/promo/out/check-<out>.jpg）。前のコマが写らないよう、シークのあと少し待つ
#   4. 台本ページのログ（アプリのエラーなど）を出す
# 使い方（ローカルのサーバー apps を起動しておく。リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/record-promo.ps1 -Script black-hole-guide
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/record-promo.ps1 -Script black-hole -Short           # ショート（<app>.html?short）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/record-promo.ps1 -Script quantum-guide -NoRecord -Peek 3,30,60,90   # コマだけ見る
#   ふだんはヘッドレスで GPU を使って描く。GPU で絵がおかしいときは -Soft（ソフトウェアで描く。とても遅い）
#   -AudioOnly: 録画しなおさずに音だけ作りなおす（__promoAudio → out/<out>.wav → ffmpeg で mp4 の音を差しかえ。映像はそのまま）。
#     古い mp4 は out/<out>.before-<Reason>.mp4 に残す（-Reason の既定は loud）。音量の確かめは check-loudness.ps1
#   -Visible: 見える窓で開く（ヘッドレスで H.264 に書き出せないときや、god-view のように地図の読みこみを見たいとき）
# 見終わった peek-・check- の jpg は消す（README: 見終わったら消す）。out/ は Git に入れない。
param(
  [Parameter(Mandatory = $true)][string]$Script,
  [switch]$Short,
  [string]$Peek,
  [string]$Check,
  [switch]$NoRecord,
  [switch]$AudioOnly,
  [string]$Reason = 'loud',
  [switch]$Visible,
  [switch]$Soft,
  [int]$Port = 8765,
  [int]$DebugPort = 9336,
  [int]$TimeoutMin = 90
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'cdp.ps1')
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Script = $Script -replace '\.html$', ''
if (-not (Test-Path (Join-Path $root "_dev/promo/$Script.html"))) { throw "_dev/promo/$Script.html がない" }
# -File で呼ぶと 1,2,3 は1つの文字列で来るので、ここで分ける
$peekTs = @(if ($Peek) { $Peek -split '[,\s]+' | Where-Object { $_ } | ForEach-Object { [double]$_ } })
$checkTs = @(if ($Check) { $Check -split '[,\s]+' | Where-Object { $_ } | ForEach-Object { [double]$_ } })
$out = $Script + $(if ($Short) { '-short' } else { '' })
$url = "http://localhost:$Port/_dev/promo/$Script.html" + $(if ($Short) { '?short' } else { '' })
try { Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 10 | Out-Null } catch { throw "$url を開けません。サーバー apps を起動してから（ポートが違えば -Port）" }

$cdp = Start-CdpChrome -Name 'manabi-record' -Port $DebugPort -Visible:$Visible -Gpu:(-not $Soft) -Size '1400,900'
$t0 = Get-Date
function Elapsed { $d = (Get-Date) - $t0; '{0}:{1:mm\:ss}' -f [int][Math]::Floor($d.TotalHours), $d }   # 1時間をこえても時の桁を出す
function Show-Log($ws) { $l = Invoke-CdpEval $ws "document.getElementById('log') ? document.getElementById('log').textContent : ''"; if ($l) { Write-Host ($l.TrimEnd()) } }
try {
  $ws = Open-CdpTab $cdp
  [void](Send-Cdp $ws 'Runtime.enable')
  [void](Send-Cdp $ws 'Page.navigate' @{ url = $url })
  Write-Host "開いた: $url"

  # --- 準備（録画ボタンが押せるようになるまで） ---
  $state = ''
  while (((Get-Date) - $t0).TotalMinutes -lt 10) {
    Start-Sleep -Seconds 2
    $state = Invoke-CdpEval $ws "(() => { const g = document.getElementById('go'), l = document.getElementById('log'); if (!g) return 'wait'; if (l && /失敗/.test(l.textContent)) return 'fail'; return g.disabled ? 'wait' : 'ready'; })()"
    if ($state -ne 'wait') { break }
  }
  if ($state -ne 'ready') { Show-Log $ws; throw "準備できなかった（$state）" }
  Write-Host "準備できた（$(Elapsed)）。字幕データ out/$out.ja.srt・.en.srt も保存ずみ"

  # --- 1. 確かめ用のコマ（録画の前） ---
  if ($peekTs.Count) {
    $ts = ($peekTs | ForEach-Object { [string]$_ }) -join ','
    $st = Invoke-CdpEval $ws "window.__peekSheet([$ts], 'peek-$out')" -TimeoutSec 900
    Write-Host "確かめ用のコマ: _dev/promo/out/peek-$out.jpg（$ts 秒、保存 $st）"
  }
  if ($NoRecord) { Show-Log $ws; return }

  # --- 音だけ作りなおす ---
  if ($AudioOnly) {
    $mp4 = Join-Path $root "_dev/promo/out/$out.mp4"; $wav = Join-Path $root "_dev/promo/out/$out.wav"
    if (-not (Test-Path $mp4)) { throw "$mp4 がない（音だけの差しかえは録画ずみの mp4 に）" }
    $st = Invoke-CdpEval $ws 'window.__promoAudio()' -TimeoutSec 900
    if ($st -ne 200 -and $st -ne 201 -and $st -ne 204) { Show-Log $ws; throw "wav を保存できなかった（$st）" }
    Show-Log $ws
    $old = Join-Path $root "_dev/promo/out/$out.before-$Reason.mp4"
    if (Test-Path $old) { throw "$old がもうある（-Reason を変える）" }
    Move-Item $mp4 $old
    & ffmpeg -v error -i $old -i $wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest -y $mp4
    if ($LASTEXITCODE -ne 0) { Move-Item $old $mp4; throw 'ffmpeg で差しかえられなかった（元に戻した）' }
    Remove-Item $wav
    Write-Host "音を差しかえた: _dev/promo/out/$out.mp4（古いのは $out.before-$Reason.mp4、$(Elapsed)）"
    return
  }

  # --- 2. 録画 ---
  [void](Invoke-CdpEval $ws 'window.__promoRecord(), 1')
  Write-Host '録画を始めた'
  $last = ''
  while ($true) {
    Start-Sleep -Seconds 5
    if (((Get-Date) - $t0).TotalMinutes -gt $TimeoutMin) { throw "$TimeoutMin 分で終わらなかった" }
    # 仕上げ（mp4 にまとめる）のあいだはページが数十秒ふさがって返事がないことがある。そのときは待ちつづける
    try { $s = Invoke-CdpEval $ws "JSON.stringify({ p: window.__promo || null, b: (document.getElementById('go') || {}).textContent })" -TimeoutSec 20 | ConvertFrom-Json }
    catch { if ("$_" -match '返事がない') { continue } else { throw } }
    if ($s.p -and $s.p.error) { Show-Log $ws; throw "録画に失敗: $($s.p.error)" }
    if ($s.p -and $s.p.done) { Write-Host "録画できた: _dev/promo/out/$out.mp4（$([Math]::Round($s.p.mb, 1)) MB、$(Elapsed)）"; break }
    if ($s.b -ne $last) { Write-Host "  $($s.b)（$(Elapsed)）"; $last = $s.b }
  }

  # --- 3. できた mp4 からコマを抜く ---
  $dur = Invoke-CdpEval $ws "new Promise(r => { const v = document.getElementById('vid'); if (v.readyState >= 1) r(v.duration); else v.onloadedmetadata = () => r(v.duration); })" -TimeoutSec 60
  if (-not $checkTs.Count) { $checkTs = @(1, ($dur * 0.25), ($dur * 0.5), ($dur * 0.75), ($dur - 6), ($dur - 1)) | Where-Object { $_ -ge 0 } | ForEach-Object { [Math]::Round($_, 1) } | Sort-Object -Unique }
  $ts = ($checkTs | ForEach-Object { [string]$_ }) -join ','
  $js = @"
(async () => {
  const v = document.getElementById('vid'), ts = [$ts], vert = v.videoHeight > v.videoWidth;
  const cols = vert ? Math.min(ts.length, 6) : 3, rows = Math.ceil(ts.length / cols);
  const sw = vert ? 320 : 640, sh = Math.round(sw * v.videoHeight / v.videoWidth);
  const c = document.createElement('canvas'); c.width = sw * cols; c.height = (sh + 22) * rows;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < ts.length; i++) {
    await new Promise(r => { v.onseeked = r; v.currentTime = Math.min(ts[i], v.duration - 0.05); });
    await new Promise(r => setTimeout(r, 400));   // シークのすぐあとは前のコマが写ることがある
    const x = (i % cols) * sw, y = Math.floor(i / cols) * (sh + 22);
    g.drawImage(v, x, y, sw, sh);
    g.fillStyle = '#fff'; g.font = '14px sans-serif'; g.fillText(ts[i].toFixed(1) + ' 秒', x + 6, y + sh + 16);
  }
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  return (await fetch('out/check-$out.jpg', { method: 'PUT', body: b })).status;
})()
"@
  $st = Invoke-CdpEval $ws $js -TimeoutSec 300
  Write-Host "できた mp4 のコマ: _dev/promo/out/check-$out.jpg（$ts 秒、長さ $([Math]::Round($dur, 1)) 秒、保存 $st）"

  # --- 4. ログ ---
  Write-Host ''
  Write-Host '--- 台本ページのログ ---'
  Show-Log $ws
} finally {
  Stop-CdpChrome $cdp
}
