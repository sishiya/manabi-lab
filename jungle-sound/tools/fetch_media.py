# 第二弾: 鳥の名前（和名）と写真を集める。Wikidata（CC0）で学名（P225）から項目を探し、和名のラベルと写真（P18）を読む。
# 写真は Wikimedia Commons でファイルごとにライセンスを確かめ、CC0・パブリックドメイン・CC BY・CC BY-SA だけを使う（NC・ND は使わない）。
# 320px にして撮影情報を消し（ffmpeg）、img/<種のコード>.jpg に置く。作者・ライセンス・元のページは data/species.json に。
# 動かし方: python fetch_media.py <jungle-sound フォルダ>（data/forest.json を先に作っておく）
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
APP = sys.argv[1]
UA = {'User-Agent': 'manabi-lab jungle-sound (https://sishiya.github.io/manabi-lab/)'}
OK = re.compile(r'^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)', re.I)
def get(url, p=None):
    if p: url += '?' + urllib.parse.urlencode(p)
    for k in range(5):
        try:
            time.sleep(1.2); return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(10 * (k + 1)); continue
            raise
    raise RuntimeError('429 が続いた: ' + url)
def strip(html): return re.sub(r'<[^>]+>', '', html or '').strip()

forest = json.load(open(os.path.join(APP, 'data', 'forest.json'), encoding='utf-8'))
os.makedirs(os.path.join(APP, 'img'), exist_ok=True); out = []
for s in forest['species']:
    rec = dict(code=s['code'], sci=s['sci'], en=s['en'], ja=None, wikidata=None, photo=None)
    if s['code'] != '????':
        r = get('https://www.wikidata.org/w/api.php', dict(action='query', list='search', srsearch=f'haswbstatement:"P225={s["sci"]}"', format='json'))
        hits = r['query']['search']
        if hits:
            qid = hits[0]['title']; rec['wikidata'] = qid
            e = get('https://www.wikidata.org/wiki/Special:EntityData/' + qid + '.json')['entities'][qid]
            rec['ja'] = (e.get('labels', {}).get('ja') or {}).get('value')
            for c in e.get('claims', {}).get('P18', [])[:3]:
                f = c['mainsnak'].get('datavalue', {}).get('value')
                if not f: continue
                q = get('https://commons.wikimedia.org/w/api.php', dict(action='query', titles='File:' + f, prop='imageinfo', iiprop='extmetadata|url', iiurlwidth=320, format='json'))
                ii = next(iter(q['query']['pages'].values())).get('imageinfo', [{}])[0]; m = ii.get('extmetadata', {})
                lic = strip(m.get('LicenseShortName', {}).get('value'))
                if not OK.match(lic) or re.search(r'NC|ND', lic): print('  使えない', s['sci'], f, lic); continue
                dst = os.path.join(APP, 'img', s['code'] + '.jpg'); tmp = dst + '.src'
                open(tmp, 'wb').write(urllib.request.urlopen(urllib.request.Request(ii['thumburl'], headers=UA), timeout=60).read())
                # 一度生の画素にしてから入れなおす（撮影情報だけでなく、色の情報 ICC の中の文字も消える。公開前チェックの 'text' に当たるため）
                rgb = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', tmp, '-vf', 'scale=320:-2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], check=True, capture_output=True).stdout
                w = 320; h = len(rgb) // (w * 3)
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-i', '-', '-q:v', '5', '-map_metadata', '-1', dst], input=rgb, check=True)
                os.remove(tmp)
                rec['photo'] = dict(file='img/' + s['code'] + '.jpg', artist=strip(m.get('Artist', {}).get('value')), attribution=strip(m.get('Attribution', {}).get('value')), license=lic,
                                    license_url=strip(m.get('LicenseUrl', {}).get('value')), page='https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(f.replace(' ', '_')))
                break
    print(s['code'], s['sci'], '|', rec['ja'], '|', rec['photo'] and rec['photo']['license'], '|', rec['photo'] and rec['photo']['artist'])
    out.append(rec)
json.dump(out, open(os.path.join(APP, 'data', 'species.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
