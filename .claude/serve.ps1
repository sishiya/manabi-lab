# Minimal static file server for previewing the apps (multi-file pages need http://, not file://).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .claude/serve.ps1 [-Port 8765]
param([int]$Port = 8765)
$root = Split-Path -Parent $PSScriptRoot
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.md'='text/plain; charset=utf-8';
  '.mp4'='video/mp4'; '.webm'='video/webm'; '.wav'='audio/wav'; '.mp3'='audio/mpeg'; '.webp'='image/webp'; '.wasm'='application/wasm' }
# This server answers one request at a time. A video sent whole would hold the loop until the browser
# had read all of it (it reads slowly, as it plays), so every other request waited - the second video
# never started. Range requests get at most $chunk bytes; the browser simply asks again for the rest.
$chunk = 4MB
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "serving $root on http://localhost:$Port/"
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
    # _dev/promo/*.html saves the finished video here (only this folder, only video files)
    if ($c.Request.HttpMethod -eq 'PUT') {
      if ($rel -match '^_dev/promo/out/[A-Za-z0-9_.-]+\.(mp4|webm|srt|jpg|wav)$') {
        $dir = Join-Path $root '_dev/promo/out'
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
        $fs = [IO.File]::Create((Join-Path $root $rel)); $c.Request.InputStream.CopyTo($fs); $fs.Close()
      } else { $c.Response.StatusCode = 403 }
      $c.Response.Close(); continue
    }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (Test-Path $path -PathType Container) { $path = Join-Path $path 'index.html' }
    # serve only files inside the project folder, and never the private word list
    $inside = $path.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
    if ($inside -and ([IO.Path]::GetFileName($path) -ne '.private-words.txt') -and (Test-Path $path -PathType Leaf)) {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $c.Response.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
      $c.Response.Headers.Add('Cache-Control','no-store')
      $c.Response.Headers.Add('Accept-Ranges','bytes')
      $fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
      try {
        $len = $fs.Length; $start = 0; $end = $len - 1
        if ($c.Request.Headers['Range'] -match '^bytes=(\d*)-(\d*)$') {
          if ($matches[1]) { $start = [long]$matches[1]; if ($matches[2]) { $end = [Math]::Min([long]$matches[2], $end) } }
          elseif ($matches[2]) { $start = [Math]::Max(0, $len - [long]$matches[2]) }
          if ($start -ge $len) {
            $c.Response.StatusCode = 416; $c.Response.Headers.Add('Content-Range', "bytes */$len"); $end = $start - 1
          } else {
            $end = [Math]::Min($end, $start + $chunk - 1)
            $c.Response.StatusCode = 206; $c.Response.Headers.Add('Content-Range', "bytes $start-$end/$len")
          }
        }
        $n = $end - $start + 1
        $c.Response.ContentLength64 = [Math]::Max(0, $n)
        if ($n -gt 0 -and $c.Request.HttpMethod -ne 'HEAD') {
          [void]$fs.Seek($start, 'Begin')
          $buf = New-Object byte[] 65536
          while ($n -gt 0) {
            $r = $fs.Read($buf, 0, [int][Math]::Min($buf.Length, $n)); if ($r -le 0) { break }
            $c.Response.OutputStream.Write($buf, 0, $r); $n -= $r
          }
        }
      } finally { $fs.Close() }
    } else { $c.Response.StatusCode = 404 }
  } catch { try { $c.Response.StatusCode = 500 } catch { } }   # the browser may have gone away mid-video
  try { $c.Response.Close() } catch { }
}
