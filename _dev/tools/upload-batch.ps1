# 紹介動画をまとめて YouTube に上げる（ユーザーの GO のあとだけ）。1本ずつ youtube-upload.ps1 で上げ、出た ID を upload.json の videoId に書く。
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/upload-batch.ps1 -Apps air-flow,ga-creatures   # 各アプリの説明動画とショート
#   … -Kinds guide で説明動画だけ。videoId がもうあるものは飛ばす
# - publishAt（schedule-videos.ps1 で書いたもの）があれば、予約つきで上がる。
# - 「接続が切れた」などで ID が出なくても、実は上がっていることがある（2026-10-11）。そのときは -List から同じタイトルの動画を探し、
#   見つかれば ID を書いて -Update -Full で字幕・サムネイル・予約を付ける。
# - 失敗はすべて _dev/promo/upload-log.md に1行ずつ残す（日時・動画・エラー・その日に上げた本数）。上限らしいエラー（exceeded・quota）が出たら止める。
param(
  [Parameter(Mandatory = $true)][string]$Apps,
  [string]$Kinds = 'guide,short'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$yt = Join-Path $PSScriptRoot 'youtube-upload.ps1'
$logMd = Join-Path $root '_dev/promo/upload-log.md'
function YT { & powershell -NoProfile -ExecutionPolicy Bypass -File $yt @args 2>&1 | ForEach-Object { "$_" } }
function Note([string]$name, [string]$err) {
  if (-not (Test-Path $logMd)) {
    [IO.File]::WriteAllText($logMd, "# YouTube へのアップロードの記録（エラー）`n`nupload-batch.ps1 が書く。1日の区切りは太平洋時間の0時（日本時間16時、冬は17時）。`n`n| 日時（日本） | 動画 | その日に上げた本数（API） | エラー |`n|---|---|---|---|`n", (New-Object Text.UTF8Encoding $false))
  }
  $q = (YT -Quota | Select-Object -Last 1)
  $n = if ($q -match '動画 (\d+) 本') { $Matches[1] } else { '?' }
  $e = ($err -replace '[\r\n|]', ' ').Trim(); if ($e.Length -gt 200) { $e = $e.Substring(0, 200) }
  [IO.File]::AppendAllText($logMd, "| $(Get-Date -Format 'yyyy-MM-dd HH:mm') | $name | $n | $e |`n", (New-Object Text.UTF8Encoding $false))
}
function Set-VideoId([string]$meta, [string]$id) {
  $f = (Resolve-Path $meta).Path
  $b = [IO.File]::ReadAllBytes($f); $bom = $b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB
  $s = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
  if ($s -match '"videoId"') { $s = [regex]::Replace($s, '"videoId"\s*:\s*"[^"]*"', "`"videoId`": `"$id`"") }
  else { $s = [regex]::Replace($s, '^(﻿?\{\r?\n)', "`$1  `"videoId`": `"$id`",`n") }
  $null = $s | ConvertFrom-Json
  [IO.File]::WriteAllText($f, $s, (New-Object Text.UTF8Encoding $bom))
}

$done = 0; $failed = 0
foreach ($a in ($Apps -split ',' | Where-Object { $_ })) {
  foreach ($k in ($Kinds -split ',' | Where-Object { $_ })) {
    $name = "$a-$k"; $meta = "_dev/promo/$name.upload.json"
    if (-not (Test-Path $meta)) { Write-Host "△ ない: $meta"; continue }
    $m = [IO.File]::ReadAllText((Resolve-Path $meta).Path, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($m.videoId) { Write-Host "飛ばす（もう上がっている）: $name $($m.videoId)"; continue }
    Write-Host "===== $name $(Get-Date -Format HH:mm)"
    $out = YT -Meta $meta
    $out | ForEach-Object { Write-Host $_ }
    $id = [regex]::Match(($out -join "`n"), 'youtu\.be/([\w-]{11})').Groups[1].Value
    if ($id) {
      Set-VideoId $meta $id; Write-Host "videoId を書いた: $name = $id"; $done++
      # 動画は上がったが、字幕・サムネイルが付かなかった（使用量の上限など）。あとで -Update で付ける
      $sub = ($out | Where-Object { $_ -match '字幕.*(取れません|付けられません|できません)|サムネイルは付けられません' }) -join ' '
      if ($sub) { Note $name "動画は上がった（$id）が、$sub → 上限が戻ってから youtube-upload.ps1 -Update -Meta $meta" }
      continue
    }

    # ID が出なかった: エラーを残す。上がっていないか一覧で確かめる
    $err = (($out | Where-Object { $_ -match '失敗|error|Error|exceeded|quota' }) -join ' ')
    if (-not $err) { $err = ($out | Select-Object -Last 1) }
    Note $name $err
    $failed++
    if ($err -match 'exceeded|quota|uploadLimitExceeded|rateLimit') { Write-Host "STOP: 上限らしいエラー。今日はここまで（$name）"; break }
    Start-Sleep -Seconds 20
    $hit = YT -List | Where-Object { $_ -like "*$($m.title)*" } | Select-Object -First 1
    if ($hit -and $hit -match '^([\w-]{11})\s') {
      $id = $Matches[1]
      Set-VideoId $meta $id
      Write-Host "接続は切れたが上がっていた: $name = $id。字幕・サムネイル・予約を付ける"
      YT -Update -Full -Meta $meta | ForEach-Object { Write-Host $_ }
      Note $name "（上の続き）実は上がっていた → $id。-Update -Full で仕上げた"
      $done++; $failed--
    } else { Write-Host "STOP: $name は上がっていない"; break }
  }
  if ($err -match 'exceeded|quota|uploadLimitExceeded|rateLimit') { break }
}
Write-Host ''
Write-Host "上げた: $done 本、失敗: $failed 本"
YT -Quota | ForEach-Object { Write-Host $_ }
Write-Host "ALL DONE $(Get-Date -Format HH:mm)"
