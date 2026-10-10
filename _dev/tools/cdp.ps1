# ヘッドレスの Chrome を DevTools プロトコル（CDP）で動かす小さな道具。smoke.ps1・record-promo.ps1 が読みこむ（. "$PSScriptRoot/cdp.ps1"）。
# 使い方:
#   $cdp = Start-CdpChrome -Name 'manabi-smoke' -Port 9334           # 専用のプロフィールで起動
#   $ws = Open-CdpTab $cdp                                            # 新しいタブにつなぐ（イベントは $script:CdpEvents にたまる）
#   Send-Cdp $ws 'Page.navigate' @{ url = '...' }; Wait-CdpEvents $ws 2; Invoke-CdpEval $ws 'document.title'
#   Close-CdpTab $cdp $ws; Stop-CdpChrome $cdp                       # その名前のプロフィールの Chrome だけを終了する

$script:CdpId = 0
$script:CdpRecv = $null
$script:CdpBuf = New-Object byte[] 1048576
$script:CdpAcc = New-Object IO.MemoryStream
$script:CdpEvents = New-Object Collections.ArrayList

# -Gpu: ヘッドレスでも GPU（D3D11）で描く。録画のように重いとき（ソフトウェア描画 swiftshader だと 12 秒の 4K に 10 分以上）
function Start-CdpChrome([string]$Name, [int]$Port, [switch]$Visible, [switch]$Gpu, [string]$Size = '1280,720') {
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $chrome) { throw 'Chrome か Edge が見つかりません' }
  $dir = Join-Path $env:TEMP $Name
  [IO.Directory]::CreateDirectory($dir) | Out-Null
  $cargs = @('--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', "--window-size=$Size",
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    "--remote-debugging-port=$Port", "--user-data-dir=$dir\profile", '--no-first-run', '--no-default-browser-check', 'about:blank')
  if (-not $Visible) {
    $cargs = @('--headless=new') + $(if ($Gpu) { @('--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist') } else { @('--use-angle=swiftshader', '--enable-unsafe-swiftshader') }) + $cargs
  }
  $p = Start-Process -FilePath $chrome -PassThru -WindowStyle $(if ($Visible) { 'Normal' } else { 'Hidden' }) -ArgumentList $cargs
  for ($i = 0; $i -lt 50; $i++) { try { Invoke-RestMethod "http://127.0.0.1:$Port/json/version" | Out-Null; break } catch { Start-Sleep -Milliseconds 200 } }
  return [pscustomobject]@{ Name = $Name; Port = $Port; Proc = $p }
}
function Stop-CdpChrome($cdp) {
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$($cdp.Name)*" } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
}
function Open-CdpTab($cdp) {
  $script:CdpEvents.Clear(); $script:CdpRecv = $null; $script:CdpAcc.SetLength(0)
  $tab = Invoke-RestMethod -Method Put "http://127.0.0.1:$($cdp.Port)/json/new?about:blank"
  $ws = New-Object Net.WebSockets.ClientWebSocket
  $ws.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(30)
  $ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  Add-Member -InputObject $ws -NotePropertyName TabId -NotePropertyValue $tab.id
  return $ws
}
function Close-CdpTab($cdp, $ws) {
  $id = $ws.TabId
  try { $ws.Dispose() } catch {}
  try { Invoke-RestMethod "http://127.0.0.1:$($cdp.Port)/json/close/$id" | Out-Null } catch {}
}
# 1つのメッセージを受け取る（$ms ミリ秒で来なければ $null。受信の途中は次の呼び出しへ持ち越す）
function Receive-Cdp($ws, [int]$ms) {
  while ($true) {
    if (-not $script:CdpRecv) { $script:CdpRecv = $ws.ReceiveAsync((New-Object ArraySegment[byte] -ArgumentList @(, $script:CdpBuf)), [Threading.CancellationToken]::None) }
    if (-not $script:CdpRecv.Wait($ms)) { return $null }
    $r = $script:CdpRecv.Result; $script:CdpRecv = $null
    $script:CdpAcc.Write($script:CdpBuf, 0, $r.Count)
    if ($r.EndOfMessage) {
      $text = [Text.Encoding]::UTF8.GetString($script:CdpAcc.ToArray())
      $script:CdpAcc.SetLength(0)
      return ($text | ConvertFrom-Json)
    }
  }
}
function Send-Cdp($ws, [string]$method, $params, [int]$TimeoutSec = 30) {
  $script:CdpId++
  $id = $script:CdpId
  $p = if ($params) { $params } else { @{} }
  $json = @{ id = $id; method = $method; params = $p } | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $ws.SendAsync((New-Object ArraySegment[byte] -ArgumentList @(, $bytes)), 'Text', $true, [Threading.CancellationToken]::None).Wait()
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSec) {
    $m = Receive-Cdp $ws 1000
    if (-not $m) { continue }
    if ($m.id -eq $id) { return $m }
    if ($m.method) { [void]$script:CdpEvents.Add($m) }
  }
  throw "DevTools の返事がない（$TimeoutSec 秒）: $method"
}
function Wait-CdpEvents($ws, [double]$sec) {
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt $sec) {
    $m = Receive-Cdp $ws 200
    if ($m -and $m.method) { [void]$script:CdpEvents.Add($m) }
  }
}
# 式を評価して値を返す（Promise は待つ）。例外はそのまま投げる
function Invoke-CdpEval($ws, [string]$expr, [int]$TimeoutSec = 30) {
  $r = Send-Cdp $ws 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true; awaitPromise = $true } -TimeoutSec $TimeoutSec
  if ($r.result.exceptionDetails) {
    $x = $r.result.exceptionDetails
    throw "ページの JS のエラー: $(if ($x.exception.description) { $x.exception.description } else { $x.text })"
  }
  return $r.result.result.value
}
