# 手元だけ: Wikimedia Commons で、場面の写真の候補を探す（CC0・パブリックドメイン・CC BY だけ。SA・NC は外す）
# 使い方: python tilt-shift/tools/find-photos.py <出力フォルダ> "検索語1" "検索語2" ...
# 出力: <出力>/cand.json（題名・ライセンス・作者・大きさ・URL）と、小さな絵 <出力>/thumbs/NN.jpg
import json, os, re, sys, urllib.parse, urllib.request

out = sys.argv[1]; queries = sys.argv[2:]
os.makedirs(os.path.join(out, 'thumbs'), exist_ok=True)
UA = {'User-Agent': 'manabi-lab-photo-finder/1.0 (local research script)'}
OK = re.compile(r'^(CC0|Public domain|PD.*|CC BY [0-9.]+)$', re.I)

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        return r.read()

cands, seen = [], set()
for q in queries:
    params = {'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrsearch': q + ' filetype:bitmap', 'gsrlimit': 40,
              'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 320}
    data = json.loads(get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)))
    for p in (data.get('query', {}).get('pages', {}) or {}).values():
        ii = p.get('imageinfo', [{}])[0]; md = ii.get('extmetadata', {})
        lic = md.get('LicenseShortName', {}).get('value', '')
        if not OK.match(lic.strip()) or p['title'] in seen: continue
        if ii.get('width', 0) < 2000: continue
        seen.add(p['title'])
        artist = re.sub('<[^>]+>', '', md.get('Artist', {}).get('value', '')).strip()
        cands.append({'q': q, 'title': p['title'], 'license': lic, 'artist': artist, 'w': ii['width'], 'h': ii['height'],
                      'url': ii['url'], 'page': ii.get('descriptionurl'), 'thumb': ii.get('thumburl')})
for i, c in enumerate(cands):
    try:
        open(os.path.join(out, 'thumbs', '%02d.jpg' % i), 'wb').write(get(c['thumb']))
    except Exception as e:
        print('thumb NG', i, e)
json.dump(cands, open(os.path.join(out, 'cand.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for i, c in enumerate(cands): print('%02d' % i, c['license'], c['w'], 'x', c['h'], c['title'][:70])
