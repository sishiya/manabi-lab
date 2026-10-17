# 入口の「よく遊ばれている」の順位を作る → assets/popular.json（順位だけ。数は書かない）。企画は _dev/PLAN-popular.md
# 使い方（リポジトリのルートで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/popular.ps1
#       … GA4 から昨日までの28日を読み（youtube-upload.ps1 -Ga -Popular。読むだけ）、順位を assets/popular.json に書く
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/popular.ps1 -From _dev/tools/out/ga-popular-2026-10-17.json [-DryRun]
#       … GA を読まずに、前に取った数（または手で作ったテスト用の数）から計算する。-DryRun は書かずに表だけ出す
# 決まり:
#   - 数えるのは入口の APPS のアプリのページ（/manabi-lab/<id>/）の、エンゲージメントのあったセッション数（開いてすぐ閉じた分は入らない）
#   - 期間より新しいアプリは、公開してから（APPS の created）の日数で割った「1日あたり」で比べ、その前の日の分は数えない
#     （少なくとも 7日で割る。公開した日の数だけで1位にならないように）
#   - いちばん多いアプリでも -Min（30）に届かなければ rank を空にする（入口は印もボタンも出さない）
#   - GA から読んだ数は _dev/tools/out/ga-popular-<日付>.json（Git に入れない）。ここの表も画面に出すだけ
param(
  [string]$From,
  [int]$Days = 28,
  [int]$Min = 30,
  [string]$Out,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Out) { $Out = Join-Path $root 'assets/popular.json' }

# ---- 数（GA から、または -From のファイル）----
if (-not $From) {
  $outDir = Join-Path $root '_dev/tools/out'
  [IO.Directory]::CreateDirectory($outDir) | Out-Null
  $From = Join-Path $outDir "ga-popular-$(Get-Date -Format 'yyyy-MM-dd').json"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'youtube-upload.ps1') -Ga -Popular -Days $Days -Out $From
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $From)) { Write-Host '失敗: GA4 を読めませんでした（初めてなら youtube-upload.ps1 -Ga -Auth。プロパティ ID は _dev/tools/analytics.local.txt）'; exit 1 }
}
$ga = [IO.File]::ReadAllText((Resolve-Path $From), [Text.Encoding]::UTF8) | ConvertFrom-Json
$d0 = [datetime]::ParseExact($ga.from, 'yyyy-MM-dd', $null); $d1 = [datetime]::ParseExact($ga.to, 'yyyy-MM-dd', $null)
$window = ($d1 - $d0).Days + 1

# ---- 入口のアプリ（index.html の APPS の id と公開日）----
$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'), [Text.Encoding]::UTF8)
$apps = @([regex]::Matches($html, "\{id:'([\w-]+)'[^\n]*?created:'(\d{4}-\d\d-\d\d)'") | ForEach-Object { [pscustomobject]@{ id = $_.Groups[1].Value; created = $_.Groups[2].Value } })
if (-not $apps.Count) { Write-Host '失敗: index.html の APPS を読めませんでした'; exit 1 }

# ---- アプリごとに足して、1日あたりにする ----
$rows = foreach ($a in $apps) {
  $re = '^/manabi-lab/' + [regex]::Escape($a.id) + '/(index\.html)?$'
  $start = [datetime]::ParseExact($a.created, 'yyyy-MM-dd', $null); if ($start -lt $d0) { $start = $d0 }
  $s0 = $start.ToString('yyyyMMdd')   # 入口に出る前（保管庫のころ）の日の分は数えない。割る日数と合わせるため
  $n = 0; foreach ($r in @($ga.rows)) { if ($r.pagePath -match $re -and (-not $r.date -or $r.date -ge $s0)) { $n += [double]$r.engagedSessions } }
  $d = [math]::Min($window, [math]::Max(7, ($d1 - $start).Days + 1))
  [pscustomobject]@{ id = $a.id; created = $a.created; n = $n; days = $d; perDay = $n / $d }
}
$rows = @($rows | Sort-Object @{ e = 'perDay'; Descending = $true }, @{ e = 'created'; Descending = $true })
$top = ($rows | Measure-Object n -Maximum).Maximum
$rank = if ($top -ge $Min) { @($rows | Where-Object { $_.n -gt 0 } | ForEach-Object { $_.id }) } else { @() }

Write-Host "期間 $($ga.from) 〜 $($ga.to)（$window 日）。いちばん多いアプリ $top セッション（出す目安 $Min）"
$rows | Format-Table @{ n = 'アプリ'; e = 'id' }, @{ n = 'セッション'; e = 'n' }, @{ n = '割った日数'; e = 'days' }, @{ n = '1日あたり'; e = { '{0:N2}' -f $_.perDay } } -AutoSize | Out-String | Write-Host
if (-not $rank.Count) { Write-Host "まだ少ないので rank は空（入口には出ない）" }

# ---- 書く（順位だけ）----
$ids = ($rank | ForEach-Object { '"' + $_ + '"' }) -join ','
$json = "{""from"":""$($ga.from)"",""to"":""$($ga.to)"",""rank"":[$ids]}`n"
if ($DryRun) { Write-Host "（-DryRun なので書かない）$json"; exit 0 }
[IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding $false))
Write-Host "書いた: $Out"
