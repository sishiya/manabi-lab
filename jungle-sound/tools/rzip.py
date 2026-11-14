# zip の中の1ファイルだけを HTTP の範囲指定で取り出す（全体 2.4GB を落とさない）
import sys, struct, urllib.request, zlib, json
URL = 'https://zenodo.org/records/7079124/files/soundscape_data.zip?download=1'
def rng(a, b):
    req = urllib.request.Request(URL, headers={'Range': f'bytes={a}-{b}'})
    return urllib.request.urlopen(req).read()
def size():
    req = urllib.request.Request(URL, method='HEAD'); r = urllib.request.urlopen(req)
    return int(r.headers['Content-Length']), r.geturl()
def central():
    n, final = size()
    global URL; URL = final
    tail = rng(n - 70000, n - 1)
    i = tail.rfind(b'PK\x05\x06')
    cnt, cdsize, cdoff = struct.unpack('<HII', tail[i+10:i+20])
    if cdoff == 0xFFFFFFFF:  # zip64
        j = tail.rfind(b'PK\x06\x06'); cnt, cdsize, cdoff = struct.unpack('<QQQ', tail[j+32:j+56])
    cd = rng(cdoff, cdoff + cdsize - 1); ents = []; p = 0
    while cd[p:p+4] == b'PK\x01\x02':
        meth, = struct.unpack('<H', cd[p+10:p+12]); csz, usz = struct.unpack('<II', cd[p+20:p+28])
        fl, el, cl = struct.unpack('<HHH', cd[p+28:p+34]); off, = struct.unpack('<I', cd[p+42:p+46])
        name = cd[p+46:p+46+fl].decode(); extra = cd[p+46+fl:p+46+fl+el]
        q = 0
        while q < len(extra):
            hid, hl = struct.unpack('<HH', extra[q:q+4])
            if hid == 1:
                vals = list(struct.unpack('<' + 'Q' * (hl // 8), extra[q+4:q+4+hl])); k = 0
                if usz == 0xFFFFFFFF: usz = vals[k]; k += 1
                if csz == 0xFFFFFFFF: csz = vals[k]; k += 1
                if off == 0xFFFFFFFF: off = vals[k]
            q += 4 + hl
        ents.append(dict(name=name, meth=meth, csz=csz, usz=usz, off=off)); p += 46 + fl + el + cl
    return ents
if sys.argv[1] == 'list':
    e = central(); json.dump(e, open('zip_index.json', 'w'))
    for x in e: print(x['name'], x['meth'], round(x['csz'] / 1e6), 'MB')
else:
    e = {x['name']: x for x in json.load(open('zip_index.json'))}; central()
    for nm in sys.argv[2:]:
        x = next(v for k, v in e.items() if k.endswith(nm))
        h = rng(x['off'], x['off'] + 29); fl, el = struct.unpack('<HH', h[26:30])
        start = x['off'] + 30 + fl + el; data = rng(start, start + x['csz'] - 1)
        if x['meth'] == 8: data = zlib.decompress(data, -15)
        open(nm, 'wb').write(data); print('got', nm, len(data))
