# 紹介動画を YouTube に上げる（既定は非公開）。YouTube Data API v3、許可は youtube.force-ssl（上げる・翻訳を足す・一覧）。
# 使い方:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Auth
#       … 最初の1回。ブラウザで Google にログインして許可する（チャンネル「しし屋」を選ぶ）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Meta _dev/promo/black-hole-guide.upload.json
#       … 動画を上げる。Meta の JSON: { file, title, description, tags[], privacy, thumbnail, publishAt, localizations }（file・thumbnail はルートからの道すじ。publishAt は予約投稿の日時）
#         localizations: { "en": { "title": "...", "description": "..." } } … 翻訳したタイトルと説明（英語で見ている人には英語が出る）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -List
#       … 上げた動画の ID・公開の状態・翻訳・タイトルを出す（ID は Meta の JSON の videoId に書いておく）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Update -Meta _dev/promo/black-hole-guide.upload.json
#       … 上げたあとの動画（videoId）に、字幕（captions）と、翻訳したタイトルと説明（localizations）・tags を足す。日本語のタイトル・説明はそのまま
#         publishAt があれば予約投稿の日時も入れる（Studio で上げた動画を予約するとき。例 "2026-10-11T20:00:00+09:00"）
#         -Full を付けると、日本語のタイトル・説明・分類（教育）・言語・サムネイルも JSON から入れる（Studio で手動で上げた動画を、ここで仕上げるとき）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Verify [-Date 2026-10-12 | -Meta …]
#       … 公開前の最終確認（読むだけ、RULES 8.4）。その日に予約した動画（_dev/promo/*.upload.json の publishAt。-Date を省くと今日）の
#         YouTube 側の状態（処理ずみ・非公開の予約・日時・子ども向けでない）・タイトル・説明・タグ・英語・字幕・サムネイルを JSON と突き合わせ、
#         説明欄の URL が開けるかも見る。NG があれば終了コード 1
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Stats [-Out _dev/tools/out/yt-stats.json]
#       … 上げた動画の再生数・高評価・コメント数とチャンネルの登録者数（読むだけ。weekly-report.ps1 が使う）
#         分析を読む許可（yt-analytics.readonly）があれば、-Days 日の視聴時間・どこから来たかも
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Ga -Auth
#       … サイトのアクセス（GA4）を読む許可。GA を持っている Google アカウントで。トークンは $SecretDir\ga-token.dat（暗号化）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Ga -Stats [-Days 7] [-Out …]
#       … GA4 のページごとの表示・人数・どこから来たか・国・言語、前の期間との比べ（プロパティ ID は analytics.local.txt）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Ga -Popular -Days 28 -Out …
#       … 昨日までの -Days 日の、ページごとのエンゲージメントのあったセッション数（入口の「人気」のもと。popular.ps1 が使う）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Schedule -Meta _dev/promo/black-hole-guide.upload.json
#       … 予約投稿の日時（publishAt）だけを入れる。JSON に publishAt がなければ予約を外して非公開のままにする（字幕を送らないので API の使用量が少ない）
#         captions: { "en": "_dev/promo/out/<名前>.en.srt" } … 字幕（CC）。台本ページ（_dev/promo/*.html）を開くと out に保存される。日本語は動画に焼きこんであるので、ふつうは英語だけ
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Thumb -Meta a.upload.json,b.upload.json
#       … サムネイル（thumbnail）だけを付ける。公開ずみの動画にも。ショートは _dev/promo/thumbs/<app>-short.jpg（make-short-thumbs.ps1）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Captions -Meta a.upload.json,b.upload.json -Lang es,pt,zh-TW,ko
#       … 字幕だけを足す。-Lang の言語のうち、YouTube にまだないものだけ送る（あるものは置きかえない。1本 400 ポイントなので、
#         上限で止まっても、もう一度同じコマンドで続きから）。翻訳の字幕は _dev/promo/subs/（_dev/tools/build-subs.mjs で英語の字幕の時刻から作る）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Playlist [-DryRun]
#       … 再生リスト（_dev/promo/playlist*.json。1ファイル1リスト: playlist.json＝説明動画、playlist-shorts.json＝ショート）を作る／名前・説明・英語を合わせ、match に当たる upload.json の動画のうち
#         **公開ずみ**のものを publishAt の順に足す（予約中・非公開は足さない。もう入っているものは足さない）。何度走らせてもよい。
#         作ったら playlist.json の playlistId に書く。-DryRun は読むだけ（足すものを出す）
#
# 秘密の扱い（必ず守る）:
#   - クライアントの秘密は $SecretDir\client_secret.json（プロジェクトの外）。このスクリプトだけが読み、中身は画面に出さない。
#   - 許可のしるし（リフレッシュトークン）は $SecretDir\youtube-token.dat に、Windows の DPAPI で暗号化して保存する（このユーザーにしか戻せない）。
#   - 認可の URL・コード・トークンは画面にもログにも出さない。エラーは Google が返した理由の文だけ出す。
#   - $SecretDir（秘密を置いたフォルダ）の場所は、このリポジトリに書かない。同じフォルダの youtube-upload.local.txt
#     （Git に入れない）に1行で書く。-SecretDir で直接わたしてもよい。
param(
  [switch]$Auth,
  [switch]$List,
  [switch]$Update,
  [switch]$Full,
  [switch]$Schedule,
  [switch]$Thumb,
  [switch]$Stats,
  [switch]$Ga,
  [switch]$Popular,
  [switch]$Quota,
  [switch]$Verify,
  [switch]$Playlist,
  [switch]$Captions,
  [string[]]$Lang,
  [switch]$DryRun,
  [string]$Date,
  [int]$Days = 7,
  [string]$Out,
  [string]$Meta,
  [string]$SecretDir
)
$ErrorActionPreference = 'Stop'
if ($Lang) { $Lang = @($Lang | ForEach-Object { $_ -split ',' } | Where-Object { $_ }) }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # _dev/tools の2つ上
if (-not $SecretDir) {
  $local = Join-Path $PSScriptRoot 'youtube-upload.local.txt'
  if (-not (Test-Path $local)) { Write-Host "失敗: 秘密を置いたフォルダの場所を $local に1行で書いてください（このファイルは Git に入れません）"; exit 1 }
  $SecretDir = [Environment]::ExpandEnvironmentVariables((Get-Content -Encoding UTF8 $local | Where-Object { $_.Trim() -and -not $_.StartsWith('#') } | Select-Object -First 1).Trim())
}
$secretFile = Join-Path $SecretDir 'client_secret.json'
$tokenFile = Join-Path $SecretDir 'youtube-token.dat'
# youtube.force-ssl: 上げる・あとから翻訳を足す・一覧を見る（2026-10-10 に youtube.upload から広げた。前の許可のままなら -Auth をやり直す）
# yt-analytics.readonly: 視聴時間・どこから来たかを読む（2026-10-10 に足した。読むだけ。前の許可のままなら -Stats の分析だけ出ない）
$scope = 'https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly'
# -Ga: サイトのアクセス（Google アナリティクス 4）を読む。YouTube とは別の許可（GA を持っている Google アカウントで -Ga -Auth）
#   プロパティ ID（数字）は _dev/tools/analytics.local.txt に1行（Git に入れない）。許可は読むだけ（analytics.readonly）
if ($Ga) {
  $tokenFile = Join-Path $SecretDir 'ga-token.dat'
  $scope = 'https://www.googleapis.com/auth/analytics.readonly'
}

# ---- API の使用量の記録（_dev/tools/out/yt-quota.csv。-Quota で今日の合計）----
# YouTube Data API は1日 10,000 ポイント（太平洋時間の0時＝日本時間 16時・冬は17時に戻る）。下の点数は Google の表の値（videos.insert は
# 表では 1600 だが、2026-10-11（太平洋時間 10/10 の日）に API で 8本＋字幕・サムネイル・仕上げ3本・予約6本、表の値で合わせて約 19,000 ポイント
# になっても止まらなかったので、実際は videos.insert がずっと少ない。同じ日に Studio でも3本、チャンネルとして 11本上げて本数の上限にも当たらなかった）。
# アップロードの本数には、ポイントとは別にチャンネルの1日の上限がある（「exceeded the number of videos」。Studio で上げた分も数に入る）。
$quotaLog = Join-Path $root '_dev/tools/out/yt-quota.csv'
function Get-QuotaCost([string]$method, [string]$uri) {
  if ($uri -match 'upload_id=') { return $null }   # 動画の中身を送る部分（videos.insert に含まれる）
  if ($uri -notmatch 'googleapis\.com/(upload/)?youtube/v3/(\w+)') { return $null }   # トークン・分析（別の上限）は数えない
  $res = $Matches[2]; $m = if ($method) { $method.ToUpper() } else { 'GET' }
  switch ($res) {
    'videos' { if ($m -eq 'POST') { return @(1600, 'videos.insert') } elseif ($m -eq 'PUT') { return @(50, 'videos.update') } else { return @(1, 'videos.list') } }
    'captions' { if ($m -eq 'POST') { return @(400, 'captions.insert') } elseif ($m -eq 'PUT') { return @(450, 'captions.update') } else { return @(50, 'captions.list') } }
    'thumbnails' { return @(50, 'thumbnails.set') }
    'playlists' { if ($m -eq 'GET') { return @(1, 'playlists.list') } else { return @(50, "playlists.$($m.ToLower())") } }
    'playlistItems' { if ($m -eq 'GET') { return @(1, 'playlistItems.list') } else { return @(50, "playlistItems.$($m.ToLower())") } }
    default { return @(1, "$res.list") }
  }
}
function Write-QuotaLog($method, $uri, [bool]$ok, [string]$err) {
  $c = Get-QuotaCost $method $uri; if (-not $c) { return }
  $pt = [TimeZoneInfo]::ConvertTime([DateTimeOffset]::Now, [TimeZoneInfo]::FindSystemTimeZoneById('Pacific Standard Time')).ToString('yyyy-MM-dd')
  try {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $quotaLog)) | Out-Null
    if (-not (Test-Path $quotaLog)) { 'time_jst,pt_day,units,api,ok,error' | Set-Content -Encoding UTF8 $quotaLog }
    $e = ($err -replace '[\r\n,]', ' '); if ($e.Length -gt 80) { $e = $e.Substring(0, 80) }
    "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')),$pt,$($c[0]),$($c[1]),$([int]$ok),$e" | Add-Content -Encoding UTF8 $quotaLog
  } catch {}
}
function Get-ArgValue($a, [string]$name) { for ($i = 0; $i -lt $a.Count - 1; $i++) { if ("$($a[$i])" -ieq "-$name") { return [string]$a[$i + 1] } }; return $null }
# YouTube に問い合わせる2つの命令を横取りして、点数を記録してから本物を呼ぶ
function Invoke-RestMethod {
  $u = Get-ArgValue $args 'Uri'; $mt = Get-ArgValue $args 'Method'
  try { $r = Microsoft.PowerShell.Utility\Invoke-RestMethod @args; Write-QuotaLog $mt $u $true ''; return $r }
  catch { Write-QuotaLog $mt $u $false "$($_.Exception.Message)"; throw }
}
function Invoke-WebRequest {
  $u = Get-ArgValue $args 'Uri'; $mt = Get-ArgValue $args 'Method'
  try { $r = Microsoft.PowerShell.Utility\Invoke-WebRequest @args; Write-QuotaLog $mt $u $true ''; return $r }
  catch { Write-QuotaLog $mt $u $false "$($_.Exception.Message)"; throw }
}
function Show-Quota {
  if (-not (Test-Path $quotaLog)) { Write-Host 'まだ記録がない'; return }
  $rows = Import-Csv -Encoding UTF8 $quotaLog
  $days = $rows | Group-Object pt_day | Sort-Object Name | Select-Object -Last 7
  foreach ($d in $days) {
    $u = ($d.Group | Measure-Object -Property units -Sum).Sum
    $up = @($d.Group | Where-Object { $_.api -eq 'videos.insert' -and $_.ok -eq '1' }).Count
    $fail = @($d.Group | Where-Object { $_.ok -eq '0' }).Count
    Write-Host ("{0}（太平洋時間の日）: {1} ポイント（表の値で）、API で上げた動画 {2} 本、失敗 {3} 回" -f $d.Name, $u, $up, $fail)
  }
  $last = $rows | Where-Object { $_.ok -eq '0' } | Select-Object -Last 3
  foreach ($r in $last) { Write-Host "  失敗: $($r.time_jst) $($r.api) $($r.error)" }
}

function Get-Client {
  if (-not (Test-Path $secretFile)) { throw "client_secret.json が見つかりません（$SecretDir）" }
  $j = Get-Content -Raw -Encoding UTF8 $secretFile | ConvertFrom-Json
  $c = if ($j.installed) { $j.installed } else { $j.web }
  if (-not $c -or -not $c.client_id -or -not $c.client_secret) { throw 'client_secret.json の形がちがいます（デスクトップ アプリの OAuth クライアントの JSON を置いてください）' }
  return $c
}
# Google のエラーから理由の文だけ取り出す（リクエストの中身は出さない）
function Get-ErrText($e) {
  try {
    $r = $e.Exception.Response; if (-not $r) { return $e.Exception.Message }
    # 中身は ErrorDetails に入っていることが多い（そのときはもう読めない）
    $t = if ($e.ErrorDetails -and $e.ErrorDetails.Message) { $e.ErrorDetails.Message } else { (New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd() }
    $o = $t | ConvertFrom-Json
    if ($o.error.message) { return "$([int]$r.StatusCode) $($o.error.message)" }
    if ($o.error_description) { return "$([int]$r.StatusCode) $($o.error) $($o.error_description)" }
    return "$([int]$r.StatusCode) $($o.error)"
  } catch { return $e.Exception.Message }
}
function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
function UrlEnc([string]$s) { [Uri]::EscapeDataString($s) }
function Post-Form($url, $fields) {
  $body = ($fields.GetEnumerator() | ForEach-Object { "$($_.Key)=$(UrlEnc $_.Value)" }) -join '&'
  Invoke-RestMethod -Method Post -Uri $url -Body $body -ContentType 'application/x-www-form-urlencoded'
}

# ---- 最初の1回: ブラウザで許可して、リフレッシュトークンを暗号化して保存 ----
function Invoke-Auth {
  $c = Get-Client
  # PKCE と state（なりすまし防止）
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $vb = New-Object byte[] 48; $rng.GetBytes($vb); $verifier = B64Url $vb
  $challenge = B64Url ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($verifier)))
  $sb = New-Object byte[] 16; $rng.GetBytes($sb); $state = B64Url $sb
  # 空いているポートで、このPCの中だけで受け取る
  $tl = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $tl.Start(); $port = $tl.LocalEndpoint.Port; $tl.Stop()
  $redirect = "http://127.0.0.1:$port/"
  $hl = New-Object Net.HttpListener; $hl.Prefixes.Add($redirect); $hl.Start()
  $q = @{ client_id = $c.client_id; redirect_uri = $redirect; response_type = 'code'; scope = $scope; access_type = 'offline';
    prompt = 'consent select_account'; code_challenge = $challenge; code_challenge_method = 'S256'; state = $state }
  $url = 'https://accounts.google.com/o/oauth2/v2/auth?' + (($q.GetEnumerator() | ForEach-Object { "$($_.Key)=$(UrlEnc $_.Value)" }) -join '&')
  if ($Ga) { Write-Host 'ブラウザで Google の許可の画面を開きます。Google アナリティクスを持っている Google アカウントを選び、「アナリティクスのデータの表示」を許可してください（5分待ちます）。' }
  else { Write-Host 'ブラウザで Google の許可の画面を開きます。ログインして、チャンネル「しし屋」を選び、許可してください（5分待ちます）。' }
  Start-Process $url
  $task = $hl.GetContextAsync()
  if (-not $task.Wait(300000)) { $hl.Stop(); throw '5分たっても許可されませんでした' }
  $ctx = $task.Result
  $params = @{}; foreach ($kv in $ctx.Request.Url.Query.TrimStart('?').Split('&')) { $p = $kv.Split('=', 2); if ($p.Length -eq 2) { $params[$p[0]] = [Uri]::UnescapeDataString($p[1]) } }
  $ok = $params['code'] -and $params['state'] -eq $state
  $msg = if ($ok) { '許可を受け取りました。このタブは閉じてかまいません。' } else { '許可できませんでした。PowerShell の表示を見てください。' }
  $html = [Text.Encoding]::UTF8.GetBytes("<!doctype html><meta charset=utf-8><title>しし屋</title><p style='font:18px sans-serif'>$msg</p>")
  $ctx.Response.ContentType = 'text/html; charset=utf-8'; $ctx.Response.OutputStream.Write($html, 0, $html.Length); $ctx.Response.Close(); $hl.Stop()
  if (-not $ok) { throw "許可されませんでした（$($params['error'])）" }
  try {
    $t = Post-Form 'https://oauth2.googleapis.com/token' @{ client_id = $c.client_id; client_secret = $c.client_secret; code = $params['code'];
      code_verifier = $verifier; redirect_uri = $redirect; grant_type = 'authorization_code' }
  } catch { throw "トークンを受け取れませんでした: $(Get-ErrText $_)" }
  if (-not $t.refresh_token) { throw 'リフレッシュトークンが返ってきませんでした。もう一度 -Auth してください' }
  ConvertTo-SecureString $t.refresh_token -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Encoding ASCII $tokenFile
  Write-Host "保存しました（暗号化）: $tokenFile"
}

function Get-AccessToken {
  if (-not (Test-Path $tokenFile)) { throw 'まだ許可されていません。先に -Auth を付けて実行してください' }
  $c = Get-Client
  $ss = Get-Content $tokenFile | ConvertTo-SecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
  try { $rt = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  try { $t = Post-Form 'https://oauth2.googleapis.com/token' @{ client_id = $c.client_id; client_secret = $c.client_secret; refresh_token = $rt; grant_type = 'refresh_token' } }
  catch { throw "アクセス用のトークンを受け取れませんでした（許可が切れたかもしれません。-Auth をやり直してください）: $(Get-ErrText $_)" }
  return $t.access_token
}

# ---- 動画を上げる（再開できるアップロード） ----
# 32MB ずつ送る（Content-Range）。途中で接続が切れたら、YouTube に「どこまで届いたか」を聞いて続きから送る（2026-10-12〜。
# 1回で送ると、600MB ほどの動画で「接続が切れた」が出て、送り切れていない動画が「処理中」のまま止まったことがある）
function Send-Resumable($loc, $file, $size, $at) {
  $chunk = 32MB; $pos = [long]0; $tries = 0
  $fs = [IO.File]::OpenRead($file)
  try {
    while ($true) {
      $n = [long][Math]::Min($chunk, $size - $pos)
      $req = [Net.HttpWebRequest]::Create($loc); $req.Method = 'PUT'; $req.Timeout = 600000; $req.ReadWriteTimeout = 600000
      $req.Headers.Add('Authorization', "Bearer $at"); $req.ContentType = 'video/mp4'; $req.AllowWriteStreamBuffering = $false; $req.AllowAutoRedirect = $false
      $req.ContentLength = $n
      $req.Headers.Add('Content-Range', "bytes $pos-$($pos + $n - 1)/$size")
      try {
        $fs.Position = $pos; $rs = $req.GetRequestStream(); $buf = New-Object byte[] (1MB); $left = $n
        while ($left -gt 0) { $k = $fs.Read($buf, 0, [int][Math]::Min($buf.Length, $left)); $rs.Write($buf, 0, $k); $left -= $k }
        $rs.Close()
        $res = $req.GetResponse()
        if ([int]$res.StatusCode -eq 308) {   # 続きを待っている（.NET は 308 を例外にしないことがある）
          $rg = $res.Headers['Range']; $res.Close()
          $pos = if ($rg -match '-(\d+)$') { [long]$Matches[1] + 1 } else { 0 }
          Write-Host ("  送りました: {0}%" -f [int](100 * $pos / $size)); $tries = 0; continue
        }
        $txt = (New-Object IO.StreamReader($res.GetResponseStream())).ReadToEnd(); $res.Close()
        Write-Host "  送りました: 100%"
        return ($txt | ConvertFrom-Json)   # 200/201: 最後まで届いた
      } catch [Net.WebException] {
        $r = $_.Exception.Response
        if ($r -and [int]$r.StatusCode -eq 308) {   # 続きを待っている
          $rg = $r.Headers['Range']; $r.Close()
          $pos = if ($rg -match '-(\d+)$') { [long]$Matches[1] + 1 } else { 0 }
          Write-Host ("  送りました: {0}%" -f [int](100 * $pos / $size)); $tries = 0; continue
        }
        if ($r -and [int]$r.StatusCode -ge 400 -and [int]$r.StatusCode -lt 500 -and [int]$r.StatusCode -ne 408) { $m = (New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd(); throw "動画を送れませんでした: $([int]$r.StatusCode) $m" }
        if (++$tries -gt 6) { throw "動画を送れませんでした（6回やりなおしても続かない）: $($_.Exception.Message)" }
        Write-Host "  接続が切れた（$($_.Exception.Message)）。どこまで届いたか聞いて続きから送る（$tries 回目）"
        Start-Sleep -Seconds (5 * $tries)
        # どこまで届いたか（Content-Range: bytes */size の空の PUT）
        $q = [Net.HttpWebRequest]::Create($loc); $q.Method = 'PUT'; $q.ContentLength = 0; $q.Headers.Add('Authorization', "Bearer $at"); $q.Headers.Add('Content-Range', "bytes */$size"); $q.AllowAutoRedirect = $false
        try {
          $res = $q.GetResponse()
          if ([int]$res.StatusCode -eq 308) { $rg = $res.Headers['Range']; $res.Close(); $pos = if ($rg -match '-(\d+)$') { [long]$Matches[1] + 1 } else { 0 }; continue }
          $txt = (New-Object IO.StreamReader($res.GetResponseStream())).ReadToEnd(); $res.Close(); Write-Host '  もう最後まで届いていた'; return ($txt | ConvertFrom-Json) }
        catch [Net.WebException] {
          $r2 = $_.Exception.Response
          if ($r2 -and [int]$r2.StatusCode -eq 308) { $rg = $r2.Headers['Range']; $r2.Close(); $pos = if ($rg -match '-(\d+)$') { [long]$Matches[1] + 1 } else { 0 } }
          # 聞けなかったら同じところからもう一度
        }
      }
    }
  } finally { $fs.Close() }
}
function Invoke-Upload {
  if (-not $Meta) { throw '-Meta で動画の情報の JSON を指定してください' }
  $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $Meta) | ConvertFrom-Json
  $file = Join-Path $root $m.file
  if (-not (Test-Path $file)) { throw "動画がありません: $($m.file)" }
  $privacy = if ($m.privacy) { $m.privacy } else { 'private' }
  if ($privacy -notin 'private', 'unlisted', 'public') { throw "privacy は private / unlisted / public のどれか: $privacy" }
  $size = (Get-Item $file).Length
  $status = @{ privacyStatus = $privacy; selfDeclaredMadeForKids = $false }   # 子ども向けではない（2026-10-10 にユーザーが決めた）
  # 予約投稿: "publishAt": "2026-10-10T20:00:00+09:00"（日本時間なら +09:00 を付ける）。非公開で上がり、その時刻に公開される
  $when = ''
  if ($m.publishAt) {
    $pa = [DateTimeOffset]::Parse($m.publishAt, [Globalization.CultureInfo]::InvariantCulture)
    if ($pa -le [DateTimeOffset]::Now.AddMinutes(15)) { throw "publishAt は15分以上先にしてください: $($m.publishAt)" }
    if ($privacy -ne 'private') { throw '予約投稿（publishAt）は privacy を private にしてください' }
    $status.publishAt = $pa.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $when = "、$($pa.ToOffset([TimeSpan]::FromHours(9)).ToString('M月d日 HH:mm')) に公開（日本時間）"
  }
  $meta = @{ snippet = @{ title = $m.title; description = $m.description; tags = @($m.tags); categoryId = '27'; defaultLanguage = 'ja'; defaultAudioLanguage = 'ja' };
    status = $status }
  $parts = 'snippet,status'
  if ($m.localizations) { $meta.localizations = $m.localizations; $parts += ',localizations' }
  $json = [Text.Encoding]::UTF8.GetBytes(($meta | ConvertTo-Json -Depth 5))
  $at = Get-AccessToken
  $h = @{ Authorization = "Bearer $at"; 'X-Upload-Content-Type' = 'video/mp4'; 'X-Upload-Content-Length' = "$size" }
  Write-Host "上げます: $($m.title)（$([math]::Round($size / 1MB, 1)) MB、$privacy$when）"
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Headers $h -ContentType 'application/json; charset=UTF-8' -Body $json `
      -Uri "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=$parts"
  } catch { throw "アップロードを始められませんでした: $(Get-ErrText $_)" }
  $loc = $r.Headers['Location']
  $v = Send-Resumable $loc $file $size $at
  Write-Host "上がりました: https://youtu.be/$($v.id)（$($v.status.privacyStatus)）  ← Meta の JSON の videoId に書いておく"
  if ($m.thumbnail) {
    $tf = Join-Path $root $m.thumbnail
    $ct = if ($tf -match '\.png$') { 'image/png' } else { 'image/jpeg' }
    try { Invoke-RestMethod -Method Post -Uri "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=$($v.id)" -Headers @{ Authorization = "Bearer $at" } -ContentType $ct -InFile $tf | Out-Null; Write-Host "サムネイルを付けました: $($m.thumbnail)" }
    catch { Write-Host "サムネイルは付けられませんでした（動画は上がっています）: $(Get-ErrText $_)" }
  }
  Set-Captions $v.id $m $at
}

# ---- 字幕（CC）: Meta の captions = { "en": "_dev/promo/out/<名前>.en.srt" }。同じ言語の字幕があれば置きかえる ----
function Set-Captions($id, $m, $at) {
  if (-not $m.captions) { return }
  $h = @{ Authorization = "Bearer $at" }
  try { $have = @((Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=$id").items) }
  catch { Write-Host "字幕の一覧を取れませんでした: $(Get-ErrText $_)"; return }
  foreach ($p in $m.captions.PSObject.Properties) {
    $lang = $p.Name; $file = Join-Path $root $p.Value
    if ($Lang -and $Lang -notcontains $lang) { continue }
    if ($Captions -and ($have | Where-Object { $_.snippet.language -eq $lang -and $_.snippet.trackKind -ne 'asr' })) { Write-Host "字幕（$lang）はもうあります（とばす）"; continue }
    if (-not (Test-Path $file)) { Write-Host "字幕データがありません（先に _dev/promo の台本ページを開くと out に保存されます）: $($p.Value)"; continue }
    $old = $have | Where-Object { $_.snippet.language -eq $lang -and $_.snippet.trackKind -ne 'asr' } | Select-Object -First 1
    $info = if ($old) { @{ id = $old.id; snippet = @{ isDraft = $false } } } else { @{ snippet = @{ videoId = $id; language = $lang; name = ''; isDraft = $false } } }
    $b = 'cap' + [guid]::NewGuid().ToString('N'); $enc = [Text.Encoding]::UTF8; $ms = New-Object IO.MemoryStream
    $head = $enc.GetBytes("--$b`r`nContent-Type: application/json; charset=UTF-8`r`n`r`n" + ($info | ConvertTo-Json -Depth 4) + "`r`n--$b`r`nContent-Type: application/octet-stream`r`n`r`n")
    $tail = $enc.GetBytes("`r`n--$b--`r`n"); $data = [IO.File]::ReadAllBytes($file)
    $ms.Write($head, 0, $head.Length); $ms.Write($data, 0, $data.Length); $ms.Write($tail, 0, $tail.Length)
    $method = if ($old) { 'Put' } else { 'Post' }
    try {
      Invoke-RestMethod -Method $method -Headers $h -ContentType "multipart/related; boundary=$b" -Body $ms.ToArray() `
        -Uri 'https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet' | Out-Null
      Write-Host "字幕（$lang）を$(if ($old) { '置きかえました' } else { '付けました' }): $($p.Value)"
    } catch { Write-Host "字幕（$lang）を付けられませんでした: $(Get-ErrText $_)" }
  }
}

# ---- 上げた動画の一覧（ID を調べる） ----
function Invoke-List {
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  try {
    $ch = Invoke-RestMethod -Headers $h -Uri 'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true'
    $pl = $ch.items[0].contentDetails.relatedPlaylists.uploads
    $items = (Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=$pl").items
    if (-not $items) { Write-Host 'まだ動画がありません'; return }
    $ids = ($items | ForEach-Object { $_.contentDetails.videoId }) -join ','
    $vs = (Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/videos?part=snippet,status,localizations&id=$ids").items
  } catch { throw "一覧を取れませんでした（403 なら -Auth をやり直してください）: $(Get-ErrText $_)" }
  foreach ($v in $vs) {
    $st = $v.status.privacyStatus
    if ($v.status.publishAt) { $st += ' 予約 ' + [DateTimeOffset]::Parse($v.status.publishAt, [Globalization.CultureInfo]::InvariantCulture).ToOffset([TimeSpan]::FromHours(9)).ToString('M/d HH:mm') }
    $loc = if ($v.localizations) { ($v.localizations.PSObject.Properties.Name) -join ',' } else { '-' }
    Write-Host "$($v.id)  [$st]  翻訳:$loc  $($v.snippet.title)"
  }
}

# ---- -Stats: 上げた動画の再生数・高評価・コメント数（読むだけ。いまの許可のまま。weekly-report.ps1 が使う）----
# -Out <path> に JSON で書く（なければ画面に出す）。数は YouTube が数えたその時点の合計
function Invoke-Stats {
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  try {
    $ch = Invoke-RestMethod -Headers $h -Uri 'https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&mine=true'
    $pl = $ch.items[0].contentDetails.relatedPlaylists.uploads
    $items = (Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=$pl").items
    $vs = @()
    if ($items) {
      $ids = ($items | ForEach-Object { $_.contentDetails.videoId }) -join ','
      $vs = (Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics,contentDetails&id=$ids").items
    }
  } catch { throw "数を取れませんでした: $(Get-ErrText $_)" }
  $res = [ordered]@{
    at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
    channel = [ordered]@{ subscribers = [int]$ch.items[0].statistics.subscriberCount; views = [long]$ch.items[0].statistics.viewCount; videos = [int]$ch.items[0].statistics.videoCount }
    videos = @($vs | ForEach-Object { [ordered]@{
          id = $_.id; title = $_.snippet.title; status = $_.status.privacyStatus; publishAt = $_.status.publishAt; publishedAt = $_.snippet.publishedAt
          duration = $_.contentDetails.duration
          views = [long]$_.statistics.viewCount; likes = [long]$_.statistics.likeCount; comments = [long]$_.statistics.commentCount } })
  }
  # 視聴時間・どこから来たか（YouTube Analytics。yt-analytics.readonly の許可があるときだけ。数は2〜3日おくれて入る）
  $end = (Get-Date).ToString('yyyy-MM-dd'); $start = (Get-Date).AddDays(-$Days).ToString('yyyy-MM-dd')
  $base = "https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=$start&endDate=$end"
  try {
    $byVideo = Invoke-RestMethod -Headers $h -Uri "$base&metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained&dimensions=video&sort=-views&maxResults=50"
    $bySource = Invoke-RestMethod -Headers $h -Uri "$base&metrics=views,estimatedMinutesWatched&dimensions=insightTrafficSourceType&sort=-views"
    $rows = { param($r) @($r.rows | ForEach-Object { $row = $_; $o = [ordered]@{}; for ($i = 0; $i -lt $r.columnHeaders.Count; $i++) { $o[$r.columnHeaders[$i].name] = $row[$i] }; $o }) }
    $res.analytics = [ordered]@{ start = $start; end = $end; videos = (& $rows $byVideo); sources = (& $rows $bySource) }
  } catch { $res.analytics = [ordered]@{ error = "$(Get-ErrText $_)（403 なら -Auth をやり直して、分析を読む許可を足す）" } }
  $json = $res | ConvertTo-Json -Depth 6
  if ($Out) { [IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding $false)); Write-Host "書いた: $Out（動画 $(@($vs).Count) 本）" } else { $json }
}

# ---- -Ga -Stats: サイトのアクセス（GA4 Data API。読むだけ）。ページごとの表示・人数、どこから来たか、前の期間との比べ ----
function Invoke-GaStats {
  $lf = Join-Path $PSScriptRoot 'analytics.local.txt'
  if (-not (Test-Path $lf)) { throw "GA4 のプロパティ ID（数字）を $lf に1行で書いてください（Git に入れません）" }
  $pid_ = (Get-Content -Encoding UTF8 $lf | Where-Object { $_.Trim() -and -not $_.StartsWith('#') } | Select-Object -First 1).Trim() -replace '^properties/', ''
  if ($pid_ -notmatch '^\d+$') { throw 'プロパティ ID は数字だけ（G- で始まる測定 ID ではない。GA の 管理 → プロパティの詳細）' }
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  $url = "https://analyticsdata.googleapis.com/v1beta/properties/${pid_}:runReport"
  $cur = @{ startDate = "$($Days)daysAgo"; endDate = 'today'; name = 'cur' }
  $prev = @{ startDate = "$(2 * $Days)daysAgo"; endDate = "$($Days + 1)daysAgo"; name = 'prev' }
  function Run($body) {
    $b = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 8))
    try { $r = Invoke-RestMethod -Method Post -Headers $h -ContentType 'application/json; charset=UTF-8' -Body $b -Uri $url }
    catch { throw "GA4 を読めませんでした（403 なら、GA のプロパティにこのアカウントの閲覧の権限があるか、Google Analytics Data API を有効にしたか）: $(Get-ErrText $_)" }
    $dn = @($r.dimensionHeaders | ForEach-Object { $_.name }); $mn = @($r.metricHeaders | ForEach-Object { $_.name })
    @($r.rows | ForEach-Object { $row = $_; $o = [ordered]@{}
        for ($i = 0; $i -lt $dn.Count; $i++) { $o[$dn[$i]] = $row.dimensionValues[$i].value }
        for ($i = 0; $i -lt $mn.Count; $i++) { $o[$mn[$i]] = [double]$row.metricValues[$i].value }; $o })
  }
  $res = [ordered]@{
    at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'); days = $Days
    # 合計（今の期間と前の期間。dateRange の列で分かれる）
    totals = Run @{ dateRanges = @($cur, $prev); metrics = @(@{ name = 'activeUsers' }, @{ name = 'sessions' }, @{ name = 'screenPageViews' }) }
    pages = Run @{ dateRanges = @($cur); dimensions = @(@{ name = 'pagePath' }); metrics = @(@{ name = 'screenPageViews' }, @{ name = 'activeUsers' }); orderBys = @(@{ metric = @{ metricName = 'screenPageViews' }; desc = $true }); limit = 40 }
    sources = Run @{ dateRanges = @($cur); dimensions = @(@{ name = 'sessionSource' }); metrics = @(@{ name = 'sessions' }); orderBys = @(@{ metric = @{ metricName = 'sessions' }; desc = $true }); limit = 10 }
    countries = Run @{ dateRanges = @($cur); dimensions = @(@{ name = 'country' }); metrics = @(@{ name = 'activeUsers' }); orderBys = @(@{ metric = @{ metricName = 'activeUsers' }; desc = $true }); limit = 8 }
    languages = Run @{ dateRanges = @($cur); dimensions = @(@{ name = 'language' }); metrics = @(@{ name = 'activeUsers' }); orderBys = @(@{ metric = @{ metricName = 'activeUsers' }; desc = $true }); limit = 8 }
  }
  $json = $res | ConvertTo-Json -Depth 6
  if ($Out) { [IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding $false)); Write-Host "書いた: $Out" } else { $json }
}

# ---- -Ga -Popular: 入口の「人気」のもと（popular.ps1 が使う。読むだけ）。昨日までの -Days 日の、ページごとのエンゲージメントのあったセッション数 ----
# 今日の分は途中なので入れない。数は out/ だけに置き、Git には順位だけ（_dev/PLAN-popular.md）
function Invoke-GaPopular {
  $lf = Join-Path $PSScriptRoot 'analytics.local.txt'
  if (-not (Test-Path $lf)) { throw "GA4 のプロパティ ID（数字）を $lf に1行で書いてください（Git に入れません）" }
  $pid_ = (Get-Content -Encoding UTF8 $lf | Where-Object { $_.Trim() -and -not $_.StartsWith('#') } | Select-Object -First 1).Trim() -replace '^properties/', ''
  if ($pid_ -notmatch '^\d+$') { throw 'プロパティ ID は数字だけ（G- で始まる測定 ID ではない。GA の 管理 → プロパティの詳細）' }
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  $from = (Get-Date).AddDays(-$Days).ToString('yyyy-MM-dd'); $to = (Get-Date).AddDays(-1).ToString('yyyy-MM-dd')
  $body = @{ dateRanges = @(@{ startDate = $from; endDate = $to }); dimensions = @(@{ name = 'pagePath' }, @{ name = 'date' }); metrics = @(@{ name = 'engagedSessions' }); limit = 20000 }
  $b = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 8))
  try { $r = Invoke-RestMethod -Method Post -Headers $h -ContentType 'application/json; charset=UTF-8' -Body $b -Uri "https://analyticsdata.googleapis.com/v1beta/properties/${pid_}:runReport" }
  catch { throw "GA4 を読めませんでした（403 なら、GA のプロパティにこのアカウントの閲覧の権限があるか、Google Analytics Data API を有効にしたか）: $(Get-ErrText $_)" }
  # 日ごとに分けて取る（入口へ移す前の日の分を popular.ps1 が外せるように）。date は yyyyMMdd
  $rows = @($r.rows | ForEach-Object { [ordered]@{ pagePath = $_.dimensionValues[0].value; date = $_.dimensionValues[1].value; engagedSessions = [double]$_.metricValues[0].value } })
  $json = [ordered]@{ at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'); from = $from; to = $to; rows = $rows } | ConvertTo-Json -Depth 5
  if ($Out) { [IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding $false)); Write-Host "書いた: $Out（ページ $($rows.Count) 件）" } else { $json }
}

# ---- 予約投稿の日時を入れる／外す（status だけを書きかえる。字幕は送らないので API の使用量が少ない）----
# $publishAt が空なら予約を外して非公開のままにする
function Set-Schedule($id, $publishAt, $h) {
  try {
    $cur = (Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/videos?part=status&id=$id").items | Select-Object -First 1
    if (-not $cur) { Write-Host "動画が見つかりません: $id"; return }
    $st = @{ privacyStatus = 'private'; selfDeclaredMadeForKids = $false;
             embeddable = $cur.status.embeddable; license = $cur.status.license; publicStatsViewable = $cur.status.publicStatsViewable }
    $st.publishAt = if ($publishAt) { $publishAt } else { $null }   # 予約を外すときは null を送る（省くだけだと YouTube は予約を残す。2026-10-11）
    $body = [Text.Encoding]::UTF8.GetBytes((@{ id = $id; status = $st } | ConvertTo-Json -Depth 4))
    $r = Invoke-RestMethod -Method Put -Headers $h -ContentType 'application/json; charset=UTF-8' -Body $body -Uri 'https://www.googleapis.com/youtube/v3/videos?part=status'
    if ($publishAt) { Write-Host "予約しました: https://youtu.be/$id  $($r.status.publishAt)（$publishAt）" }
    elseif ($r.status.publishAt) { Write-Host "予約が外れていません: https://youtu.be/$id  $($r.status.publishAt)" }
    else { Write-Host "予約を外しました（$($r.status.privacyStatus)）: https://youtu.be/$id" }
  } catch { Write-Host "予約を$(if ($publishAt) { '入れられ' } else { '外せ' })ませんでした: $(Get-ErrText $_)" }
}
# -Schedule: Meta の publishAt だけを入れる（publishAt がなければ予約を外す）
function Invoke-Schedule {
  if (-not $Meta) { throw '-Meta で動画の情報の JSON を指定してください' }
  $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $Meta) | ConvertFrom-Json
  if (-not $m.videoId) { throw "$Meta に videoId がありません" }
  $at = Get-AccessToken
  Set-Schedule $m.videoId $m.publishAt @{ Authorization = "Bearer $at" }
}
# -Thumb: Meta の thumbnail だけを付ける（公開ずみの動画にも。1本 50 ポイント。-Meta は「,」で区切って何本でも）
# ---- -Captions: 字幕だけ（-Lang の言語の、まだないものだけ）----
function Invoke-Captions {
  if (-not $Meta) { throw '-Meta で動画の情報の JSON を指定してください' }
  $at = Get-AccessToken
  foreach ($mp in ($Meta -split ',' | Where-Object { $_ })) {
    $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $mp) | ConvertFrom-Json
    if (-not $m.videoId) { Write-Host "videoId がありません: $mp"; continue }
    Write-Host "== $mp（https://youtu.be/$($m.videoId)）"
    Set-Captions $m.videoId $m $at
  }
}

function Invoke-Thumb {
  if (-not $Meta) { throw '-Meta で動画の情報の JSON を指定してください' }
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  foreach ($mp in ($Meta -split ',' | Where-Object { $_ })) {
    $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $mp) | ConvertFrom-Json
    if (-not $m.videoId -or -not $m.thumbnail) { Write-Host "videoId か thumbnail がありません: $mp"; continue }
    $tf = Join-Path $root $m.thumbnail; $ct = if ($tf -match '\.png$') { 'image/png' } else { 'image/jpeg' }
    try { Invoke-RestMethod -Method Post -Uri "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=$($m.videoId)" -Headers $h -ContentType $ct -InFile $tf | Out-Null; Write-Host "サムネイルを付けました: https://youtu.be/$($m.videoId)  $($m.thumbnail)" }
    catch { Write-Host "サムネイルは付けられませんでした: $mp  $(Get-ErrText $_)" }
  }
}

# ---- 上げたあとの動画に、翻訳したタイトルと説明・tags を足す ----
function Invoke-Update {
  if (-not $Meta) { throw '-Meta で動画の情報の JSON を指定してください' }
  $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $Meta) | ConvertFrom-Json
  if (-not $m.videoId) { throw "$Meta に videoId がありません（-List で調べて書いてください）" }
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  Set-Captions $m.videoId $m $at
  # 予約投稿: publishAt があれば、上げたあとの動画にも入れる（非公開のままで、その時刻に公開される。一度も公開していない動画だけ）
  if ($m.publishAt) { Set-Schedule $m.videoId $m.publishAt $h }
  if (-not $m.localizations) { return }
  try { $v = (Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/videos?part=snippet,localizations&id=$($m.videoId)").items | Select-Object -First 1 }
  catch { throw "動画を読めませんでした（403 なら -Auth をやり直してください）: $(Get-ErrText $_)" }
  if (-not $v) { throw "動画が見つかりません: $($m.videoId)" }
  $sn = $v.snippet
  # snippet は丸ごと置きかわるので、いまの値を引きつぐ（日本語のタイトル・説明は YouTube 側のまま）。tags は足し合わせる
  $tags = New-Object 'Collections.Generic.List[string]'
  foreach ($t in @($sn.tags) + @($m.tags)) { if ($t -and -not $tags.Contains($t)) { $tags.Add($t) } }
  $snippet = @{ title = $sn.title; description = $sn.description; categoryId = $sn.categoryId; tags = $tags.ToArray(); defaultLanguage = 'ja' }
  if ($sn.defaultAudioLanguage) { $snippet.defaultAudioLanguage = $sn.defaultAudioLanguage }
  # -Full: 手動で上げた動画に、日本語のタイトル・説明・分類（教育）・言語・サムネイルも JSON から入れる
  if ($Full) {
    $snippet.title = $m.title; $snippet.description = $m.description; $snippet.categoryId = '27'; $snippet.defaultAudioLanguage = 'ja'
    if ($m.thumbnail) {
      $tf = Join-Path $root $m.thumbnail; $ct = if ($tf -match '\.png$') { 'image/png' } else { 'image/jpeg' }
      try { Invoke-RestMethod -Method Post -Uri "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=$($m.videoId)" -Headers $h -ContentType $ct -InFile $tf | Out-Null; Write-Host "サムネイルを付けました: $($m.thumbnail)" }
      catch { Write-Host "サムネイルは付けられませんでした: $(Get-ErrText $_)" }
    }
  }
  $locs = @{}
  if ($v.localizations) { foreach ($p in $v.localizations.PSObject.Properties) { $locs[$p.Name] = $p.Value } }
  foreach ($p in $m.localizations.PSObject.Properties) { $locs[$p.Name] = $p.Value }
  $body = [Text.Encoding]::UTF8.GetBytes((@{ id = $m.videoId; snippet = $snippet; localizations = $locs } | ConvertTo-Json -Depth 6))
  try { $r = Invoke-RestMethod -Method Put -Headers $h -ContentType 'application/json; charset=UTF-8' -Body $body -Uri 'https://www.googleapis.com/youtube/v3/videos?part=snippet,localizations' }
  catch { throw "更新できませんでした（403 なら -Auth をやり直してください）: $(Get-ErrText $_)" }
  Write-Host "更新しました: https://youtu.be/$($r.id)  翻訳: $(($r.localizations.PSObject.Properties.Name) -join ',')  tags: $(@($r.snippet.tags).Count)個"
}

# ---- -Verify: 公開前の最終確認（読むだけ。videos.list 1 ＋ captions.list 50 ポイント／本）----
function Invoke-Verify {
  $metas = @()
  if ($Meta) { $metas = @($Meta) }
  else {
    $day = if ($Date) { [DateTime]::Parse($Date).ToString('yyyy-MM-dd') } else { (Get-Date).ToString('yyyy-MM-dd') }
    foreach ($f in Get-ChildItem (Join-Path $root '_dev/promo') -Filter '*.upload.json') {
      $j = Get-Content -Raw -Encoding UTF8 $f.FullName | ConvertFrom-Json
      if ($j.publishAt -and $j.publishAt.StartsWith($day)) { $metas += "_dev/promo/$($f.Name)" }
    }
    if (-not $metas) { Write-Host "$day に予約した動画は upload.json にありません"; return }
    Write-Host "$day に公開する動画: $($metas.Count)本"
  }
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  $nl = { param($s) ("$s" -replace "`r`n", "`n").Trim() }
  $ng = 0
  foreach ($mp in $metas) {
    $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $mp) | ConvertFrom-Json
    Write-Host ""; Write-Host "== $mp（https://youtu.be/$($m.videoId)）"
    $bad = New-Object 'Collections.Generic.List[string]'; $note = New-Object 'Collections.Generic.List[string]'
    if (-not $m.videoId) { Write-Host "  NG: videoId がありません"; $ng++; continue }
    try { $v = (Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/videos?part=snippet,status,localizations,contentDetails,processingDetails&id=$($m.videoId)").items | Select-Object -First 1 }
    catch { Write-Host "  NG: 動画を読めませんでした: $(Get-ErrText $_)"; $ng++; continue }
    if (-not $v) { Write-Host "  NG: YouTube に動画が見つかりません"; $ng++; continue }
    $st = $v.status; $sn = $v.snippet
    if ($st.uploadStatus -ne 'processed') {
      $pd = $v.processingDetails   # 処理の進み具合（送り切れていない・失敗したときの理由も）
      $why = if ($pd) { "、処理: $($pd.processingStatus)$(if ($pd.processingFailureReason) { ' ' + $pd.processingFailureReason })$(if ($pd.processingProgress) { " $($pd.processingProgress.partsProcessed)/$($pd.processingProgress.partsTotal)" })" } else { '' }
      $bad.Add("処理が終わっていない（$($st.uploadStatus)$(if ($st.failureReason) { ' ' + $st.failureReason })$why）")
    }
    if ($st.privacyStatus -ne 'private') { $bad.Add("公開の状態が $($st.privacyStatus)（予約は private のはず）") }
    if ($m.publishAt) {
      $want = [DateTimeOffset]::Parse($m.publishAt, [Globalization.CultureInfo]::InvariantCulture)
      if (-not $st.publishAt) { $bad.Add('予約が入っていない') }
      elseif ([DateTimeOffset]::Parse($st.publishAt, [Globalization.CultureInfo]::InvariantCulture) -ne $want) { $bad.Add("予約の日時がちがう（YouTube $($st.publishAt)、JSON $($m.publishAt)）") }
      else { $note.Add("予約 $($want.ToOffset([TimeSpan]::FromHours(9)).ToString('M/d HH:mm'))") }
    }
    if ($st.madeForKids) { $bad.Add('子ども向けになっている') }
    if ($st.embeddable -eq $false) { $bad.Add('埋めこみ不可') }
    if ((& $nl $sn.title) -ne (& $nl $m.title)) { $bad.Add("タイトルが JSON とちがう: $($sn.title)") }
    if ((& $nl $sn.description) -ne (& $nl $m.description)) { $bad.Add('説明（日本語）が JSON とちがう') }
    $miss = @($m.tags | Where-Object { $_ -notin @($sn.tags) })
    if ($miss) { $bad.Add("タグがない: $($miss -join ', ')") }
    if ($sn.categoryId -ne '27') { $bad.Add("分類が教育（27）でない: $($sn.categoryId)") }
    if ($sn.defaultLanguage -ne 'ja') { $bad.Add("言語が ja でない: $($sn.defaultLanguage)") }
    if ($m.localizations) {
      foreach ($p in $m.localizations.PSObject.Properties) {
        $r = $v.localizations.($p.Name)
        if (-not $r) { $bad.Add("翻訳（$($p.Name)）がない"); continue }
        if ((& $nl $r.title) -ne (& $nl $p.Value.title)) { $bad.Add("翻訳（$($p.Name)）のタイトルが JSON とちがう") }
        if ((& $nl $r.description) -ne (& $nl $p.Value.description)) { $bad.Add("翻訳（$($p.Name)）の説明が JSON とちがう") }
      }
    }
    if ($m.captions) {
      try {
        $caps = @((Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=$($m.videoId)").items | Where-Object { $_.snippet.trackKind -ne 'asr' })
        foreach ($p in $m.captions.PSObject.Properties) {
          $c = $caps | Where-Object { $_.snippet.language -eq $p.Name } | Select-Object -First 1
          if (-not $c) { $bad.Add("字幕（$($p.Name)）がない") }
          elseif ($c.snippet.isDraft) { $bad.Add("字幕（$($p.Name)）が下書きのまま") }
          elseif ($c.snippet.status -and $c.snippet.status -ne 'serving') { $bad.Add("字幕（$($p.Name)）の状態が $($c.snippet.status)") }
          else { $note.Add("字幕 $($p.Name)") }
        }
      } catch { $bad.Add("字幕の一覧を取れなかった: $(Get-ErrText $_)") }
    }
    # 4K の動画の自動のサムネイルには maxres（1280）ができる。自分で付けた 640×360 のサムネイルだと standard（640）まで（2026-10-11 に確かめた）
    if ($m.thumbnail -and $sn.thumbnails.maxres) {
      Add-Type -AssemblyName System.Drawing; $img = [Drawing.Image]::FromFile((Join-Path $root $m.thumbnail)); $tw = $img.Width; $th = $img.Height; $img.Dispose()
      # ショートの縦長（1080×1920）は付けても maxres が残るので、この見分け方は使えない（2026-10-12）
      if ($tw -lt 1280 -and $tw -gt $th) { $bad.Add("サムネイルが自動のままかも（maxres があるが、付けた画像は幅 $tw）") }
    }
    $note.Add("サムネイル $(($sn.thumbnails.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value.width)" }) -join ',')")
    $note.Add("長さ $($v.contentDetails.duration -replace '^PT', '')")
    foreach ($u in @([regex]::Matches("$($m.description)", 'https?://[^\s）)]+') | ForEach-Object { $_.Value } | Select-Object -Unique)) {
      try { $code = [int](Microsoft.PowerShell.Utility\Invoke-WebRequest -UseBasicParsing -Method Head -Uri $u -TimeoutSec 20).StatusCode; if ($code -ne 200) { $bad.Add("リンク $u → $code") } }
      catch { $bad.Add("リンク $u が開けない: $($_.Exception.Message)") }
    }
    Write-Host "  $($note -join ' / ')"
    if ($bad.Count) { $ng++; foreach ($b in $bad) { Write-Host "  NG: $b" } } else { Write-Host '  OK' }
  }
  Write-Host ""
  if ($ng) { Write-Host "NG のある動画: $ng 本"; exit 1 } else { Write-Host "すべて OK（動画そのもの・アプリの動作は別に見る。RULES 8.4）" }
}

# ---- -Playlist: 再生リストを作る／合わせ、公開ずみの動画を公開の順に足す（playlists 50・playlistItems.insert 50 ポイント／本）----
# 再生リストは _dev/promo/playlist*.json に1つずつ（playlist.json＝説明動画、playlist-shorts.json＝ショート）。全部を順に合わせる
function Invoke-Playlist {
  $fail = 0
  foreach ($f in Get-ChildItem (Join-Path $root '_dev/promo') -Filter 'playlist*.json' | Sort-Object Name) {
    Write-Host "== $($f.Name)"
    try { Sync-Playlist $f.FullName } catch { Write-Host "失敗: $($_.Exception.Message)"; $fail++ }
  }
  if ($fail) { exit 1 }
}
function Sync-Playlist([string]$pf) {
  $p = Get-Content -Raw -Encoding UTF8 $pf | ConvertFrom-Json
  # 足したい順: match に当たる upload.json を publishAt の順に（videoId のあるものだけ）
  $want = @(Get-ChildItem (Join-Path $root '_dev/promo') -Filter $p.match | ForEach-Object {
      $j = Get-Content -Raw -Encoding UTF8 $_.FullName | ConvertFrom-Json
      if ($j.videoId) { [pscustomobject]@{ name = $_.Name -replace '\.upload\.json$', ''; id = $j.videoId; at = "$($j.publishAt)" } } } | Sort-Object at, name)
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  $snippet = @{ title = $p.title; description = $p.description; defaultLanguage = 'ja' }
  $body = @{ snippet = $snippet; status = @{ privacyStatus = $p.privacy } }
  if ($p.localizations) { $body.localizations = $p.localizations }
  $parts = 'snippet,status' + $(if ($p.localizations) { ',localizations' } else { '' })
  $plId = $p.playlistId
  if (-not $plId) {
    if ($DryRun) { Write-Host "（-DryRun）再生リストをまだ作っていない: $($p.title)" }
    else {
      try { $r = Invoke-RestMethod -Method Post -Headers $h -ContentType 'application/json; charset=UTF-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 6))) -Uri "https://www.googleapis.com/youtube/v3/playlists?part=$parts" }
      catch { throw "再生リストを作れませんでした: $(Get-ErrText $_)" }
      $plId = $r.id
      $txt = (Get-Content -Raw -Encoding UTF8 $pf) -replace '"playlistId":\s*"[^"]*"', "`"playlistId`": `"$plId`""
      [IO.File]::WriteAllText($pf, $txt, (New-Object Text.UTF8Encoding $false))
      Write-Host "再生リストを作りました（$($p.privacy)）: https://www.youtube.com/playlist?list=$plId  ← playlist.json に書いた"
    }
  } else {
    try { $cur = (Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status,localizations&id=$plId").items | Select-Object -First 1 }
    catch { throw "再生リストを読めませんでした: $(Get-ErrText $_)" }
    if (-not $cur) { throw "再生リストが見つかりません（消した？ playlist.json の playlistId を空にすると作りなおす）: $plId" }
    $same = $cur.snippet.title -eq $p.title -and ("$($cur.snippet.description)" -replace "`r`n", "`n") -eq ("$($p.description)" -replace "`r`n", "`n") -and $cur.status.privacyStatus -eq $p.privacy
    if ($p.localizations) { foreach ($l in $p.localizations.PSObject.Properties) { $c = $cur.localizations.($l.Name); if (-not $c -or $c.title -ne $l.Value.title -or $c.description -ne $l.Value.description) { $same = $false } } }
    if (-not $same) {
      if ($DryRun) { Write-Host '（-DryRun）再生リストの名前・説明・公開・英語が playlist.json とちがう' }
      else {
        $body.id = $plId
        try { Invoke-RestMethod -Method Put -Headers $h -ContentType 'application/json; charset=UTF-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 6))) -Uri "https://www.googleapis.com/youtube/v3/playlists?part=$parts" | Out-Null; Write-Host '再生リストの名前・説明・英語を playlist.json に合わせました' }
        catch { Write-Host "再生リストを直せませんでした: $(Get-ErrText $_)" }
      }
    }
  }
  # 入っている動画と、YouTube 側の公開の状態
  $have = @()
  # 作った直後は playlistItems.list が 404 を返す（2026-10-12）。作ったばかりなら中は空なので読まない
  if ($plId -and $p.playlistId) {
    try { $have = @((Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=$plId").items | ForEach-Object { $_.contentDetails.videoId }) }
    catch { throw "再生リストの中を読めませんでした: $(Get-ErrText $_)" }
  }
  try { $vs = @((Invoke-RestMethod -Headers $h -Uri "https://www.googleapis.com/youtube/v3/videos?part=status&id=$(($want | ForEach-Object { $_.id }) -join ',')").items) }
  catch { throw "動画の状態を読めませんでした: $(Get-ErrText $_)" }
  $pub = @{}; foreach ($v in $vs) { $pub[$v.id] = $v.status.privacyStatus }
  $added = 0; $wait = @()
  foreach ($w in $want) {
    if ($have -contains $w.id) { continue }
    if ($pub[$w.id] -ne 'public') { $wait += "$($w.name)（$($pub[$w.id])）"; continue }
    # 公開の順の位置に入れる（前の動画のうち、もう入っている本数）
    $pos = @($want | Where-Object { $_.at -lt $w.at -and $have -contains $_.id }).Count
    if ($DryRun) { Write-Host "（-DryRun）足す: $($w.name)  https://youtu.be/$($w.id)  位置 $pos"; continue }
    $b = @{ snippet = @{ playlistId = $plId; position = $pos; resourceId = @{ kind = 'youtube#video'; videoId = $w.id } } }
    try {
      Invoke-RestMethod -Method Post -Headers $h -ContentType 'application/json; charset=UTF-8' -Body ([Text.Encoding]::UTF8.GetBytes(($b | ConvertTo-Json -Depth 5))) -Uri 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet' | Out-Null
      $have += $w.id; $added++; Write-Host "足しました: $($w.name)  https://youtu.be/$($w.id)"
    } catch { Write-Host "足せませんでした: $($w.name): $(Get-ErrText $_)" }
  }
  Write-Host "再生リスト: $(@($have).Count) 本（今回 $added 本）。まだ公開されていないので待つ: $(if ($wait) { $wait -join '、' } else { 'なし' })"
  if ($plId) { Write-Host "通しで見る: https://www.youtube.com/playlist?list=$plId" }
}

try { if ($Quota) { Show-Quota } elseif ($Playlist) { Invoke-Playlist } elseif ($Verify) { Invoke-Verify } elseif ($Auth) { Invoke-Auth } elseif ($List) { Invoke-List } elseif ($Popular -and $Ga) { Invoke-GaPopular } elseif ($Stats -and $Ga) { Invoke-GaStats } elseif ($Stats) { Invoke-Stats } elseif ($Schedule) { Invoke-Schedule } elseif ($Thumb) { Invoke-Thumb } elseif ($Captions) { Invoke-Captions } elseif ($Update) { Invoke-Update } else { Invoke-Upload } }
catch { Write-Host "失敗: $($_.Exception.Message)"; exit 1 }
