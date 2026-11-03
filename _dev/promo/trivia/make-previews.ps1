# 見くらべ（gallery.html）用の軽い版を作る: out/preview/<名前>.mp4（540x960）と out/poster/<ページ名>.jpg
# 元の動画は 4K・約 30Mbps（1本 100MB 前後）で、ブラウザで何本も開くと重い。見くらべには軽い版を使う。
# 新しいもの・録りなおしたもの（元のほうが新しい）だけ作りなおす。
# 使い方: powershell -NoProfile -ExecutionPolicy Bypass -File _dev/promo/trivia/make-previews.ps1 [-Force]
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$promo = Split-Path -Parent $PSScriptRoot
$out = Join-Path $promo 'out'
New-Item -ItemType Directory -Force (Join-Path $out 'preview'), (Join-Path $out 'poster') | Out-Null
$made = 0; $skip = 0; $miss = 0
foreach ($j in Get-ChildItem (Join-Path $PSScriptRoot 'proto') -Filter *.json) {
  foreach ($x in (Get-Content $j.FullName -Raw -Encoding UTF8 | ConvertFrom-Json)) {
    foreach ($m in @($x.mp4, $x.mp4_subs)) {
      if (-not $m) { continue }
      $src = Join-Path $promo $m
      if (-not (Test-Path $src)) { $miss++; continue }
      $dst = Join-Path $out ('preview/' + [IO.Path]::GetFileName($m))
      if (-not $Force -and (Test-Path $dst) -and (Get-Item $dst).LastWriteTime -ge (Get-Item $src).LastWriteTime) { $skip++; continue }
      Write-Host "preview: $m"
      & ffmpeg -v error -y -i $src -vf 'scale=540:-2' -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart $dst
      if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed: $m" }
      $made++
    }
    $poster = Join-Path $out "poster/$($x.page).jpg"
    $src = Join-Path $promo $x.mp4
    if ((Test-Path $src) -and ($Force -or -not (Test-Path $poster) -or (Get-Item $poster).LastWriteTime -lt (Get-Item $src).LastWriteTime)) {
      & ffmpeg -v error -y -ss 1.5 -i $src -frames:v 1 -vf 'scale=360:-2' -q:v 5 $poster
    }
  }
}
Write-Host "made $made, up to date $skip, no source $miss"
