# Content check before publishing (RULES 7.1): things check-public.ps1 cannot judge.
# It never blocks. It lists what a person must look at, then one last line.
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-content.ps1                 # all entrance apps + root pages + ../zenn articles
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-content.ps1 -Apps quantum   # some apps only
#   powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-content.ps1 -NoArticles     # skip Zenn / DEV
# Checks:
#  1. required on-screen parts per app: sources section, "uses" (libraries/fonts), disclaimer for body/health apps, analytics line count
#  2. every external host referenced by the app (html/js/css) against the allow list below; unpinned CDN scripts
#  3. words from content-words.txt (medical claims, exaggeration, brands, licenses, danger, people, AI), with file:line
#  4. Zenn / DEV articles: same words, AI line, cover/app link, front matter (draft with published_at breaks Zenn)
# Script text is ASCII only (PowerShell 5.1 reads BOM-less .ps1 as ANSI); Japanese lives in content-words.txt.
param([string[]]$Apps, [switch]$NoArticles)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$utf8 = New-Object Text.UTF8Encoding $false
$notes = New-Object System.Collections.Generic.List[string]
$warn = 0
function Note([string]$kind, [string]$msg) { $script:notes.Add("  [$kind] $msg"); if ($kind -ne 'info') { $script:warn++ } }

# ---- word list ----
$words = @()
foreach ($line in [IO.File]::ReadAllLines((Join-Path $PSScriptRoot 'content-words.txt'), $utf8)) {
  if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
  $p = $line -split "`t"
  if ($p.Count -ge 3) { $words += [pscustomobject]@{ Kind = $p[0]; Re = $p[1]; Why = $p[2] } }
}

# ---- allow list of external hosts (add here when a new source is checked) ----
$allow = @(
  'cdnjs.cloudflare.com','cdn.jsdelivr.net','unpkg.com','fonts.googleapis.com','fonts.gstatic.com','www.googletagmanager.com',
  'sishiya.github.io','github.com','www.youtube.com','youtube.com','x.com','twitter.com','zenn.dev','dev.to',
  'cyberjapandata.gsi.go.jp','cyberjapandata2.gsi.go.jp','maps.gsi.go.jp','www.gsi.go.jp','s3.amazonaws.com','gibs.earthdata.nasa.gov',
  'tile.openstreetmap.org','www.openstreetmap.org','openstreetmap.org','nominatim.openstreetmap.org','tiles.openfreemap.org','openfreemap.org',
  'api.plateau.reearth.io','assets.cms.plateau.reearth.io','www.mlit.go.jp','earthquake.usgs.gov','celestrak.org','www.ngdc.noaa.gov',
  'arxiv.org','doi.org','www.ncbi.nlm.nih.gov','pubmed.ncbi.nlm.nih.gov','openstax.org','www.w3.org','creativecommons.org','opensource.org',
  'api-public.odpt.org','ckan.odpt.org','lpdaac.usgs.gov','osmfoundation.org','registry.opendata.aws','www.openmaptiles.org','pmc.ncbi.nlm.nih.gov','onlinelibrary.wiley.com','www.frontiersin.org','bmcneurosci.biomedcentral.com','clinicaltrials.gov','omlc.org','imslp.org','www.mutopiaproject.org','www.musicxml.org','baseball.physics.illinois.edu','baseballsavant.mlb.com','www.espn.com','vault.si.com','www.airc.aist.go.jp','www.openlab.psu.edu','iwk.mdw.ac.at','scielo.conicyt.cl','paskpiano.org','www.imcas.com','aaqr.org','cameo.mfa.org','hero.epa.gov','heronetnext.epa.gov','orbit.dtu.dk','researchportal.ip-paris.fr','vp.hbcse.tifr.res.in','www.pref.ishikawa.lg.jp','www.pref.nagano.lg.jp','www.sciencenews.org',
  'extension.usu.edu','www2.mst.dk','agresearch.figshare.com','msutoday.msu.edu','www.rinya.maff.go.jp','www.pref.kagawa.lg.jp','weedguide.cfaes.osu.edu','ipm.ucanr.edu','ask.ifas.ufl.edu',
  'api.checklistbank.org','www.catalogueoflife.org','tree.opentreeoflife.org','query.wikidata.org','www.wikidata.org','ja.wikipedia.org','en.wikipedia.org','commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org','api.phylopic.org','images.phylopic.org','www.phylopic.org',
  'cesium.com','www.cesium.com','threejs.org','nasa.gov','www.nasa.gov','earthobservatory.nasa.gov','www.itu.int','www.ipcc.ch'
)

# ---- which apps ----
$idx = [IO.File]::ReadAllText((Join-Path $root 'index.html'), $utf8)
$entrance = [regex]::Matches($idx, "\{\s*id:\s*'([a-z0-9-]+)'") | ForEach-Object { $_.Groups[1].Value } | Where-Object { Test-Path (Join-Path $root "$_/index.html") }
if ($Apps) { $Apps = @($Apps | ForEach-Object { $_ -split ',' } | Where-Object { $_ }) }   # -File passes "a,b" as one string
if (-not $Apps) { $Apps = $entrance }
$health = @('body-dive','immune-battle','eye-optics','hair-removal','animal-senses','brain-response','muscle-growth','urinary-dive','blood-dive','vocal-folds','house-dust','mold-growth','air-flow','wifi-wave','extreme')

function Scan-Words([string]$label, [string]$path) {
  $lines = [IO.File]::ReadAllLines($path, $utf8)
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $l = $lines[$i]
    if ($l.Length -gt 4000) { $l = $l.Substring(0, 4000) }
    if ($l -match 'googletagmanager|gtag\(|Google Analytics|Google Fonts|fonts\.googleapis') { continue }   # the analytics line and font credits
    foreach ($w in $words) {
      $m = [regex]::Match($l, $w.Re)
      if ($m.Success) {
        $ctx = $l.Trim(); $at = [Math]::Max(0, $ctx.IndexOf($m.Value) - 30); $ctx = $ctx.Substring($at, [Math]::Min(90, $ctx.Length - $at))
        Note $w.Kind ("{0}:{1} '{2}' - {3} | {4}" -f $label, ($i + 1), $m.Value, $w.Why, $ctx)
      }
    }
  }
}

foreach ($a in $Apps) {
  $dir = Join-Path $root $a
  if (-not (Test-Path "$dir/index.html")) { Note 'app' "$a : index.html not found"; continue }
  $files = @(Get-Item "$dir/index.html") + @(Get-ChildItem $dir -Recurse -File -Include *.js,*.css,*.html | Where-Object { $_.FullName -notmatch '\\(versions|lab)\\' -and $_.Name -ne 'launcher.html' -and $_.FullName -ne (Resolve-Path "$dir/index.html").Path })
  $all = ($files | ForEach-Object { [IO.File]::ReadAllText($_.FullName, $utf8) }) -join "`n"
  $html = [IO.File]::ReadAllText("$dir/index.html", $utf8)
  # 1. required parts
  $jaSrc = [regex]::IsMatch($all, [regex]::Unescape('\u51fa\u3069\u3053\u308d|\u51fa\u5178'))   # dedokoro / shutten
  if (-not $jaSrc) { Note 'screen' "$a : no sources section found (RULES 9)" }
  if ($entrance -contains $a -and $all -notmatch '(?i)sources') { Note 'screen' "$a : no English 'Sources' found" }
  if ($all -notmatch '(?i)MIT|SIL|OFL|Apache|license|' + [regex]::Unescape('\u4f7f\u3063\u3066\u3044\u308b\u3082\u306e')) { Note 'screen' "$a : no 'uses' (libraries/fonts license) found" }
  if ($health -contains $a -and -not [regex]::IsMatch($all, [regex]::Unescape('\u8a3a\u65ad|\u533b\u7642|\u6cbb\u7642|\u5065\u5eb7|\u5224\u65ad|\u773c\u79d1|\u75c5\u6c17|\u4f53\u3078\u306e\u5f71\u97ff'))) { Note 'screen' "$a : body/health app without a medical disclaimer (RULES 9)" }
  $ga = ([regex]::Matches($html, 'googletagmanager\.com/gtag/js')).Count
  if ($ga -ne 1) { Note 'analytics' "$a : analytics snippet count = $ga (expected 1)" }
  # 2. external hosts
  $hosts = [regex]::Matches($all, 'https?://([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})') | ForEach-Object { $_.Groups[1].Value.ToLower() } | Sort-Object -Unique
  foreach ($h in $hosts) {
    $ok = $allow | Where-Object { $h -eq $_ -or $h.EndsWith('.' + $_) }
    if (-not $ok) { Note 'host' "$a : external host not in allow list: $h (check terms/CORS/keys, then add to check-content.ps1)" }
  }
  foreach ($m in [regex]::Matches($all, '<script[^>]+src="(https?://[^"]+)"')) {
    $u = $m.Groups[1].Value
    if ($u -match 'googletagmanager') { continue }
    if ($u -notmatch '@\d|/\d+\.\d+(\.\d+)?/|/r\d{2,3}/|[?&]v=\d') { Note 'cdn' "$a : CDN script without a pinned version: $u" }
  }
  # 3. words
  foreach ($f in $files) { Scan-Words ("$a/" + $f.FullName.Substring($dir.Length + 1).Replace('\','/')) $f.FullName }
}

# root pages
if (-not $PSBoundParameters.ContainsKey('Apps')) {
  foreach ($p in 'index.html','archive.html','README.md') { if (Test-Path $p) { Scan-Words $p (Join-Path $root $p) } }
}

# 4. articles
$zenn = Join-Path (Split-Path -Parent $root) 'zenn'
if (-not $NoArticles -and (Test-Path $zenn)) {
  foreach ($f in (Get-ChildItem "$zenn/articles/*.md") + (Get-ChildItem "$zenn/dev/*.md" -ErrorAction SilentlyContinue)) {
    $label = $f.Directory.Name + '/' + $f.Name
    $t = [IO.File]::ReadAllText($f.FullName, $utf8)
    if ($t -match '(?m)^published:\s*false' -and $t -match '(?m)^published_at:') { Note 'article' "$label : draft with published_at (Zenn aborts the whole deploy)" }
    if ($t -notmatch 'Claude') { Note 'article' "$label : no AI (Claude) line at the end" }
    if ($t -notmatch 'sishiya\.github\.io/manabi-lab/[a-z0-9-]+/') { Note 'article' "$label : no link to the app" }
    if ($f.Directory.Name -eq 'dev' -and $t -notmatch '\?lang=en') { Note 'article' "$label : DEV article links to the Japanese app (add ?lang=en)" }
    $body = $t -replace '(?s)^---.*?---', ''
    foreach ($m in [regex]::Matches($body, 'https?://([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})')) {
      $h = $m.Groups[1].Value.ToLower(); $ok = $allow | Where-Object { $h -eq $_ -or $h.EndsWith('.' + $_) }
      if (-not $ok) { Note 'host' "$label : link to $h" }
    }
    Scan-Words $label $f.FullName
  }
}

# 5. promo videos: titles, descriptions, tags (upload.json) and subtitles (srt), always checked
foreach ($f in @(Get-ChildItem "$root/_dev/promo/*.upload.json" -ErrorAction SilentlyContinue) + @(Get-ChildItem "$root/_dev/promo/out/*.srt" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '\.before-' })) {
  $label = 'promo/' + $f.Name
  $t = [IO.File]::ReadAllText($f.FullName, $utf8)
  if ($f.Extension -eq '.json' -and $t -notmatch 'sishiya\.github\.io/manabi-lab') { Note 'promo' "$label : description has no link to the app" }
  if ($f.Extension -eq '.json') {
    foreach ($m in [regex]::Matches($t, 'https?://([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})')) {
      $h = $m.Groups[1].Value.ToLower(); $ok = $allow | Where-Object { $h -eq $_ -or $h.EndsWith('.' + $_) }
      if (-not $ok) { Note 'host' "$label : link to $h" }
    }
  }
  Scan-Words $label $f.FullName
}

$notes | ForEach-Object { $_ }
Write-Output ("content check: {0} item(s) to look at ({1} apps{2})" -f $warn, @($Apps).Count, $(if ($NoArticles) { '' } else { ' + articles' }))
