# まなびラボ（ルートの index.html）のサムネイルを作る → thumbs/<app>.jpg（640×360）
# 使い方（ローカルのサーバー apps を起動しておく。リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-thumbs.ps1                 # 全部
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-thumbs.ps1 -Apps god-view  # 一部（カンマ区切り）
# しくみ: ヘッドレスの Chrome を DevTools プロトコルで操作し、tools/thumb.html?app=<app> を開く。
# thumb.html が各アプリの準備（開始ボタン・カメラ移動など）を終えて document.title を 'ready' にしたら撮る。
# （--screenshot だけだと読み込み直後に撮ってしまい、地図などの読み込みを待てないため）
param(
  [string[]]$Apps = @('god-view','evolution','body-dive','urinary-dive','blood-dive','immune-battle','animal-senses','metamorphosis','wifi-wave','quantum'),
  [int]$Port = 8765,
  [int]$DebugPort = 9333,
  [int]$TimeoutSec = 150
)
$ErrorActionPreference = 'Stop'
$Apps = $Apps | ForEach-Object { $_ -split ',' } | Where-Object { $_ }
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'thumbs'
[IO.Directory]::CreateDirectory($out) | Out-Null
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome か Edge が見つかりません' }
$tmp = Join-Path $env:TEMP 'manabi-thumbs'
[IO.Directory]::CreateDirectory($tmp) | Out-Null

# --- DevTools プロトコル（WebSocket）の小さな道具 ---
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

  $jpeg = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object Drawing.Imaging.EncoderParameters(1)
  $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]82)

  foreach ($a in $Apps) {
    $url = "http://localhost:$Port/tools/thumb.html?app=$a"
    $tab = Invoke-RestMethod -Method Put "http://127.0.0.1:$DebugPort/json/new?$url"
    $ws = New-Object Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
    $ok = $false
    $t0 = Get-Date
    while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSec) {
      Start-Sleep -Seconds 1
      $r = Send-Cdp $ws 'Runtime.evaluate' @{ expression = 'document.title' }
      if ($r.result.result.value -eq 'ready') { $ok = $true; break }
    }
    if (-not $ok) { Write-Host "時間切れ（そのまま撮る）: $a" }
    $shot = Send-Cdp $ws 'Page.captureScreenshot' @{ format = 'png' }
    $png = [Convert]::FromBase64String($shot.result.data)
    $ws.Dispose()
    Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/close/$($tab.id)" | Out-Null

    $src = [Drawing.Image]::FromStream((New-Object IO.MemoryStream(, $png)))
    $dst = New-Object Drawing.Bitmap 640, 360
    $g = [Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, 640, 360)
    $g.Dispose(); $src.Dispose()
    $dst.Save((Join-Path $out "$a.jpg"), $jpeg, $ep); $dst.Dispose()
    Write-Host "作成: thumbs/$a.jpg（$([int]((Get-Date) - $t0).TotalSeconds) 秒）"
  }
} finally {
  # 撮影用に起動した Chrome（専用のプロフィール）だけを終了する
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*manabi-thumbs*" } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
}
