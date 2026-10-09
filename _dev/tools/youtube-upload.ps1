# 紹介動画を YouTube に上げる（既定は非公開）。YouTube Data API v3、許可は youtube.force-ssl（上げる・翻訳を足す・一覧）。
# 使い方:
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Auth
#       … 最初の1回。ブラウザで Google にログインして許可する（チャンネル「しし屋」を選ぶ）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Meta _dev/promo/black-hole.upload.json
#       … 動画を上げる。Meta の JSON: { file, title, description, tags[], privacy, thumbnail, publishAt, localizations }（file・thumbnail はルートからの道すじ。publishAt は予約投稿の日時）
#         localizations: { "en": { "title": "...", "description": "..." } } … 翻訳したタイトルと説明（英語で見ている人には英語が出る）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -List
#       … 上げた動画の ID・公開の状態・翻訳・タイトルを出す（ID は Meta の JSON の videoId に書いておく）
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Update -Meta _dev/promo/black-hole.upload.json
#       … 上げたあとの動画（videoId）に、字幕（captions）と、翻訳したタイトルと説明（localizations）・tags を足す。日本語のタイトル・説明・予約はそのまま
#         -Full を付けると、日本語のタイトル・説明・分類（教育）・言語・サムネイルも JSON から入れる（Studio で手動で上げた動画を、ここで仕上げるとき）
#         captions: { "en": "_dev/promo/out/<名前>.en.srt" } … 字幕（CC）。台本ページ（_dev/promo/*.html）を開くと out に保存される。日本語は動画に焼きこんであるので、ふつうは英語だけ
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
  [string]$Meta,
  [string]$SecretDir
)
$ErrorActionPreference = 'Stop'
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
$scope = 'https://www.googleapis.com/auth/youtube.force-ssl'

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
  Write-Host 'ブラウザで Google の許可の画面を開きます。ログインして、チャンネル「しし屋」を選び、許可してください（5分待ちます）。'
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
  try { $v = Invoke-RestMethod -Method Put -Uri $loc -Headers @{ Authorization = "Bearer $at" } -ContentType 'video/mp4' -InFile $file -TimeoutSec 3600 }
  catch { throw "動画を送れませんでした: $(Get-ErrText $_)" }
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

# ---- 上げたあとの動画に、翻訳したタイトルと説明・tags を足す ----
function Invoke-Update {
  if (-not $Meta) { throw '-Meta で動画の情報の JSON を指定してください' }
  $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $Meta) | ConvertFrom-Json
  if (-not $m.videoId) { throw "$Meta に videoId がありません（-List で調べて書いてください）" }
  $at = Get-AccessToken; $h = @{ Authorization = "Bearer $at" }
  Set-Captions $m.videoId $m $at
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

try { if ($Auth) { Invoke-Auth } elseif ($List) { Invoke-List } elseif ($Update) { Invoke-Update } else { Invoke-Upload } }
catch { Write-Host "失敗: $($_.Exception.Message)"; exit 1 }
