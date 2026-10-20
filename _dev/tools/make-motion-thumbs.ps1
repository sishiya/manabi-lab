# まなびラボの動くサムネイルを作る → assets/thumbs/<app>.mp4（640×360、数秒、音なし、くり返し再生用）
# 静止画の <app>.jpg（make-thumbs.ps1）はそのまま残す（動画の最初の絵・動きを減らす設定の人・OGP 用）。
# 使い方（ローカルのサーバー apps を起動しておく。リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/make-motion-thumbs.ps1 -Apps metronome-sync,phage
# しくみ: make-thumbs.ps1 と同じく _dev/tools/thumb.html?app=<app>&motion=1 を開き、ready になったら
# アプリの時計を止めて 1 コマずつ進めては撮り、ffmpeg で mp4 にする（重いアプリでも動画の中の速さは本物どおり）。
# 開いたとき止まっているアプリは、thumb.html の MOTION で動きはじめさせる。
param(
  [string[]]$Apps = @('god-view','evolution','body-dive','urinary-dive','blood-dive','immune-battle','animal-senses','metamorphosis','ga-creatures','wifi-wave','air-flow','extreme','illusions','muscle-growth','mold-growth','ferrofluid','black-hole','brain-response','passkey','piano-hand','phage','eye-optics','pitch-physics','hair-removal','tiny-earth','house-dust','weed-growth','tree-of-life','metronome-sync','typing-hand','phonograph','railgun','snake-move','sound-feel','big-bang','quantum'),
  [string]$Sheet = '',
  [string]$Probe = '',   # 確かめ用: 撮りはじめと撮り終わりに、この式をアプリの窓（w）で評価して表示（例: 'w.__ph.UI.state.u'）   # 指定すると、確かめ用に4コマを並べた png をこのフォルダに作る
  [double]$Sec = 4,
  [int]$Fps = 15,
  [int]$Crf = 30,
  [int]$Port = 8765,
  [int]$DebugPort = 9334,
  [int]$TimeoutSec = 150
)
$ErrorActionPreference = 'Stop'
$Apps = $Apps | ForEach-Object { $_ -split ',' } | Where-Object { $_ }
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
$out = Join-Path $root 'assets/thumbs'
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) { throw 'ffmpeg が見つかりません（winget install Gyan.FFmpeg）' }
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome か Edge が見つかりません' }
$tmp = Join-Path $env:TEMP 'manabi-motion-thumbs'
[IO.Directory]::CreateDirectory($tmp) | Out-Null

# --- DevTools プロトコル（WebSocket）の小さな道具（make-thumbs.ps1 と同じ） ---
$script:msgId = 0
function Send-Cdp($ws, [string]$method, $params) {
  $script:msgId++
  $id = $script:msgId
  $p = if ($params) { $params } else { @{} }
  $json = @{ id = $id; method = $method; params = $p } | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $ws.SendAsync((New-Object ArraySegment[byte] -ArgumentList @(, $bytes)), 'Text', $true, [Threading.CancellationToken]::None).Wait()
  $buf = New-Object byte[] 1048576
  while ($true) {
    $ms = New-Object IO.MemoryStream
    do {
      $r = $ws.ReceiveAsync((New-Object ArraySegment[byte] -ArgumentList @(, $buf)), [Threading.CancellationToken]::None).Result
      $ms.Write($buf, 0, $r.Count)
    } while (-not $r.EndOfMessage)
    $msg = [Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json
    if ($msg.id -eq $id) { return $msg }   # それ以外（イベント）は読み捨てる
  }
}

$proc = Start-Process -FilePath $chrome -PassThru -WindowStyle Hidden -ArgumentList @(
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--window-size=1280,720', "--remote-debugging-port=$DebugPort", "--user-data-dir=$tmp\profile", 'about:blank')
try {
  for ($i = 0; $i -lt 50; $i++) { try { Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/version" | Out-Null; break } catch { Start-Sleep -Milliseconds 200 } }

  foreach ($a in $Apps) {
    $url = "http://localhost:$Port/_dev/tools/thumb.html?app=$a&motion=1"
    $tab = Invoke-RestMethod -Method Put "http://127.0.0.1:$DebugPort/json/new?about:blank"
    $ws = New-Object Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
    # 描ける部分をちょうど 1280×720 に（--window-size だけだと窓のふちの分だけ低く 1280×約624 になり、
    # 静止画は縦にのび・動画は下に黒い帯が出ていた。2026-10-17）
    Send-Cdp $ws 'Emulation.setDeviceMetricsOverride' @{ width = 1280; height = 720; deviceScaleFactor = 1; mobile = $false } | Out-Null
    Send-Cdp $ws 'Page.navigate' @{ url = $url } | Out-Null
    $ok = $false
    $t0 = Get-Date
    while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSec) {
      Start-Sleep -Seconds 1
      $r = Send-Cdp $ws 'Runtime.evaluate' @{ expression = 'document.title' }
      if ($r.result.result.value -eq 'ready') { $ok = $true; break }
    }
    if (-not $ok) { Write-Host "時間切れ（そのまま撮る）: $a" }

    # アプリの時計を 1/$Fps 秒ずつ進めては撮る（thumb.html の __motionStep。1280×720 を半分の大きさで）
    $dir = Join-Path $tmp $a
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    [IO.Directory]::CreateDirectory($dir) | Out-Null
    $clip = @{ x = 0; y = 0; width = 1280; height = 720; scale = 0.5 }
    $n = [int]($Sec * $Fps)
    $probeJs = "(() => { const w = document.getElementById('f').contentWindow; try { return JSON.stringify($Probe); } catch (e) { return String(e); } })()"
    if ($Probe) { Write-Host "  はじめ: $((Send-Cdp $ws 'Runtime.evaluate' @{ expression = $probeJs }).result.result.value)" }
    for ($i = 0; $i -lt $n; $i++) {
      Send-Cdp $ws 'Runtime.evaluate' @{ expression = "window.__motionStep($(1000 / $Fps))"; awaitPromise = $true } | Out-Null
      $shot = Send-Cdp $ws 'Page.captureScreenshot' @{ format = 'jpeg'; quality = 92; clip = $clip }
      [IO.File]::WriteAllBytes((Join-Path $dir ('f{0:D4}.jpg' -f $i)), [Convert]::FromBase64String($shot.result.data))
    }
    if ($Probe) { Write-Host "  おわり: $((Send-Cdp $ws 'Runtime.evaluate' @{ expression = $probeJs }).result.result.value)" }
    $ws.Dispose()
    Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/close/$($tab.id)" | Out-Null

    $mp4 = Join-Path $out "$a.mp4"
    & $ffmpeg -y -loglevel error -framerate $Fps -i (Join-Path $dir 'f%04d.jpg') -vf 'scale=640:360,format=yuv420p' `
      -c:v libx264 -preset slow -crf $Crf -profile:v main -movflags +faststart -an $mp4
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg に失敗: $a" }
    if ($Sheet) {
      [IO.Directory]::CreateDirectory($Sheet) | Out-Null
      & $ffmpeg -y -loglevel error -i $mp4 -vf "select='not(mod(n\,$([int]($n / 4))))',scale=480:270,tile=4x1" -frames:v 1 (Join-Path $Sheet "$a.png")
    }
    $kb = [int]((Get-Item $mp4).Length / 1024)
    Write-Host "作成: assets/thumbs/$a.mp4（$n コマ・$kb KB・$([int]((Get-Date) - $t0).TotalSeconds) 秒）"
  }
} finally {
  # 撮影用に起動した Chrome（専用のプロフィール）だけを終了する
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*manabi-motion-thumbs*" } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
}
