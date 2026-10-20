# ビッグバンから惑星まで — 場面④ の記録を、この PC の GPU で作る（tools/record.html をヘッドレスの Chrome で開く）
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File big-bang/tools/record.ps1 [-N 4096] [-F 100] [-Years 100000] [-Frames 600] [-Full 120] [-Seed 1] [-Out big-bang/data/disk]
# 書くもの: <Out>.json（コマの表）・<Out>-frames.bin（再生のコマ）・<Out>-full.bin（分かれる用の完全な記録）
param([int]$N = 4096, [double]$F = 100, [double]$Years = 100000, [int]$Frames = 600, [int]$Full = 120, [int]$Seed = 1, [string]$Out = 'big-bang/data/disk', [int]$Port = 8772)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $root '_dev/tools/cdp.ps1')
$srv = Start-Process powershell -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root '.claude/serve.ps1'), '-Port', $Port
Start-Sleep 2
$cdp = Start-CdpChrome -Name 'bb-record' -Port 9362 -Gpu -Size '400,300'
try {
  $ws = Open-CdpTab $cdp
  $url = "http://localhost:$Port/big-bang/tools/record.html?n=$N&F=$F&years=$Years&frames=$Frames&full=$Full&seed=$Seed"
  Send-Cdp $ws 'Page.navigate' @{ url = $url } | Out-Null
  $t0 = Get-Date
  while ($true) {
    Wait-CdpEvents $ws 20
    $s = Invoke-CdpEval $ws 'JSON.stringify({d:__rec.done,e:__rec.err,t:__rec.t,k:__rec.frames.length,ms:__rec.ms,steps:__rec.steps,a:__rec.alive,s:__rec.seats})'
    $o = $s | ConvertFrom-Json
    if ($o.e) { throw "記録のエラー: $($o.e)" }
    Write-Output ("{0:N0} 秒: {1}/{2} コマ  {3:N1} 年  {4:N0} 歩  岩 {5}（席 {6}）" -f ((Get-Date) - $t0).TotalSeconds, $o.k, $Frames, $o.t, $o.steps, $o.a, $o.s)
    if ($o.d) { break }
  }
  $dir = Split-Path -Parent (Join-Path $root $Out); [IO.Directory]::CreateDirectory($dir) | Out-Null
  $idx = Invoke-CdpEval $ws 'JSON.stringify(__rec.index)' -TimeoutSec 120
  [IO.File]::WriteAllText((Join-Path $root "$Out.json"), $idx, (New-Object Text.UTF8Encoding $false))
  foreach ($k in 'frames', 'full') {
    $len = [int](Invoke-CdpEval $ws "__rec.bins.$k.length")
    $sb = New-Object Text.StringBuilder
    for ($i = 0; $i -lt $len; $i += 2000000) { [void]$sb.Append((Invoke-CdpEval $ws "__rec.bins.$k.slice($i, $($i + 2000000))" -TimeoutSec 120)) }
    $bytes = [Convert]::FromBase64String($sb.ToString())
    [IO.File]::WriteAllBytes((Join-Path $root "$Out-$k.bin"), $bytes)
    Write-Output ("書いた: $Out-$k.bin（{0:N0} バイト）" -f $bytes.Length)
  }
  Write-Output "書いた: $Out.json"
  Close-CdpTab $cdp $ws
} finally { Stop-CdpChrome $cdp; Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
