# 健康診断（週1回、Windows のタスクスケジューラが Claude なしで回す。トークンを使わない）。
#   1. smoke.ps1 で全アプリ（このフォルダのいまの中身を、一時的に立てたローカルのサーバーで。公開版で回すと GA に数えられるため）
#   2. check-links.mjs で外へのリンク（出どころなど）の切れ
# 結果は _dev/tools/out/health-last.json・health-last.md（Git に入れない）。問題があったときだけ、セッションのはじめのフック（-Hook）が数行で知らせる。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/health.ps1              # いま回す（10分ほど）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/health.ps1 -Register    # 毎週日曜 10:00 に回す登録（PC が切れていたら次に入れたとき）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/health.ps1 -Unregister  # 登録をやめる
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/health.ps1 -Hook        # 結果の要約（問題があるか、古いときだけ表示）
param(
  [switch]$Hook,
  [switch]$Register,
  [switch]$Unregister,
  [int]$DebugPort = 9335
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outDir = Join-Path $root '_dev/tools/out'
$lastJson = Join-Path $outDir 'health-last.json'
$taskName = 'manabi-lab health'

if ($Hook) {
  if (-not (Test-Path $lastJson)) { exit 0 }
  $h = Get-Content $lastJson -Raw -Encoding UTF8 | ConvertFrom-Json
  $age = ((Get-Date) - [datetime]$h.date).TotalDays
  if ($age -gt 10) { Write-Output "健康診断: 最後に回ったのが $([int]$age) 日前（毎週のはず。_dev/tools/health.ps1 を手で回すか、タスクスケジューラの「$taskName」を見る）" }
  if ($h.smokeNg -gt 0 -or $h.linkNg -gt 0) {
    Write-Output "健康診断（$($h.date.Substring(0,10))）: smoke の NG $($h.smokeNg)、リンク切れ $($h.linkNg)。くわしくは _dev/tools/out/health-last.md"
    $h.lines | Select-Object -First 4 | ForEach-Object { Write-Output "  $_" }
  }
  exit 0
}

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "登録をやめた: $taskName"; exit 0
}

if ($Register) {
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $action = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $root `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
  $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 10:00
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
  # いまのユーザーで、ログオンしているときだけ（パスワードを保存しない）
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'しし屋 まなびラボの健康診断（smoke とリンク切れ）。_dev/tools/health.ps1' -Force | Out-Null
  Write-Host "登録した: $taskName（毎週日曜 10:00。逃したら次に PC を入れたとき）"; exit 0
}

[IO.Directory]::CreateDirectory($outDir) | Out-Null
$lines = New-Object Collections.Generic.List[string]

# 1. 一時的なサーバー（ほかの会話の 8765〜8770 とぶつからないよう 8771〜）
$server = $null; $port = 0
foreach ($p in 8771..8779) {
  $server = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root '.claude/serve.ps1'),'-Port',$p)
  $ok = $false
  foreach ($i in 1..20) {
    Start-Sleep -Milliseconds 500
    if ($server.HasExited) { break }
    try { Invoke-WebRequest "http://localhost:$p/index.html" -UseBasicParsing -TimeoutSec 3 | Out-Null; $ok = $true; break } catch {}
  }
  if ($ok) { $port = $p; break }
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
$smokeNg = 0; $smokeWarn = 0
$smokeAll = New-Object Collections.Generic.List[object]
try {
  if ($port) {
    # 1本ずつ別に回す（1本で Chrome との接続が切れても、ほかは調べられるように）。並びは smoke.ps1 と同じ
    $apps = @('_root') + (Get-ChildItem $root -Directory | Where-Object {
        $_.Name -notmatch '^[_.]|^assets$' -and (Test-Path (Join-Path $_.FullName 'index.html')) } | ForEach-Object { $_.Name })
    $smokeLast = Join-Path $outDir 'smoke-last.json'
    foreach ($a in $apps) {
      if (Test-Path $smokeLast) { Remove-Item $smokeLast -Force }
      $err = $null
      foreach ($try in 1..2) {   # Chrome の立ち上がりが間に合わないことがあるので1回だけやりなおす
        try {
          & (Join-Path $PSScriptRoot 'smoke.ps1') -Apps $a -Port $port -DebugPort $DebugPort *> $null
          $parsed = Get-Content $smokeLast -Raw -Encoding UTF8 | ConvertFrom-Json   # 5.1 は配列を1つで返すので変数に受けてから
          foreach ($r in $parsed) { $smokeAll.Add($r) }
          $err = $null; break
        } catch { $err = $_.Exception.Message; Start-Sleep -Seconds 3 }
      }
      if ($err) { $smokeAll.Add([pscustomobject]@{ app = $a; lang = '-'; ok = $false; errors = @("smoke が途中で止まった: $err"); warnings = @() }) }
    }
    $smokeAll | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $outDir 'health-smoke.json')
    $smokeNg = @($smokeAll | Where-Object { -not $_.ok }).Count
    $smokeWarn = @($smokeAll | Where-Object { $_.ok -and @($_.warnings).Count }).Count
    foreach ($r in @($smokeAll | Where-Object { -not $_.ok })) { $lines.Add("smoke NG $($r.app) [$($r.lang)]: $(@($r.errors)[0])") }
  } else { $smokeNg = 1; $lines.Add('smoke: サーバーを立てられなかった（8771〜8779）') }
} catch {
  $smokeNg = [Math]::Max($smokeNg, 1); $lines.Add("smoke が動かなかった: $($_.Exception.Message)")
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}

# 2. リンク切れ
$linkNg = -1; $linkWarn = 0
try {
  & node (Join-Path $PSScriptRoot 'check-links.mjs') | Out-Null
  $links = (Get-Content (Join-Path $outDir 'links-last.json') -Raw -Encoding UTF8 | ConvertFrom-Json).results
  $linkNg = @($links | Where-Object { $_.level -eq 'NG' }).Count
  $linkWarn = @($links | Where-Object { $_.level -eq '注意' }).Count
  foreach ($r in @($links | Where-Object { $_.level -eq 'NG' })) { $lines.Add("リンク切れ $($r.url)（$($r.apps -join '・')）") }
} catch { $lines.Add("リンクの確認が動かなかった: $($_.Exception.Message)") }

if ($linkNg -lt 0) { $linkNg = 1 }
$date = Get-Date -Format 's'
[ordered]@{ date = $date; smokeNg = $smokeNg; smokeWarn = $smokeWarn; linkNg = $linkNg; linkWarn = $linkWarn; lines = @($lines) } |
  ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $lastJson
$md = @("# 健康診断 $date", '', "- smoke: NG $smokeNg・注意 $smokeWarn（くわしくは health-smoke.json）", "- リンク: NG $linkNg・注意 $linkWarn（くわしくは links-last.json。注意は 403 などサイト側の都合が多い）", '') + @($lines | ForEach-Object { "- $_" })
$md -join "`n" | Set-Content -Encoding UTF8 (Join-Path $outDir 'health-last.md')
Write-Host "健康診断: smoke NG $smokeNg・注意 $smokeWarn、リンク NG $linkNg・注意 $linkWarn（_dev/tools/out/health-last.md）"

# 3. 写し先が決まっていれば、Git に入っていないものをバックアップ（秘密はふくめない。backup-local.ps1）
try { & (Join-Path $PSScriptRoot 'backup-local.ps1') -Quiet } catch { Write-Host "バックアップが失敗: $($_.Exception.Message)" }
