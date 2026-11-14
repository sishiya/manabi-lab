# 第二弾: 重ねた森1 を「土台」と「鳥の切り出し」に分けて書き出す（ブラウザが声ごとに ON／OFF して重ねて鳴らす）。
# 作り方は build_mix.py と同じ（土台を塗りつぶす・鳥はまわりの音を引く・seed 1 = 重ねた森1）。build_mix.py の前半を読みこんで使う。
# 動かし方: python build_stems.py <録音と annotations.csv のあるフォルダ> <jungle-sound フォルダ>
# 作るもの: audio/bed.m4a（土台 3分）、audio/birds.m4a（鳥の切り出しを 0.4 秒あけて1本に並べたもの）、data/forest.json（鳴らす表）
import os, sys, json, subprocess
SRC, APP = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
head = open(os.path.join(here, 'build_mix.py'), encoding='utf-8').read().split('# ---------- 物差し ----------')[0]
sys.argv = ['build_mix.py', SRC, APP]
exec(compile(head, 'build_mix.py（前半）', 'exec'))

mix, base, info = make_mix(1, bed='fill', mode='sub')
GAP = 0.4
sprite = []; offs = {}; pos = 0.0
for e in info['events']:
    k = tuple(e['clip'])
    if k in offs: continue
    seg = fade(cut(*k, *next((c[3], c[4]) for c in clips[e['sp']] if tuple(c[:3]) == k), 'sub'), int(0.05 * SR))
    offs[k] = (pos, len(seg) / SR); sprite.append(seg); sprite.append(np.zeros(int(GAP * SR), 'float32')); pos += len(seg) / SR + GAP
sp_audio = np.concatenate(sprite)

def save(x, name, peak_to=None):
    tmp = os.path.join(SRC, name + '.wav'); sf.write(tmp, np.clip(x, -1, 1), SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
                    os.path.join(APP, 'audio', name + '.m4a')], check=True)
save(base, 'bed'); save(sp_audio, 'birds')

count = {}
for e in info['events']: count[e['sp']] = count.get(e['sp'], 0) + 1
species = [dict(code=k, sci=names.get(k, ('', ''))[0], en=names.get(k, ('', ''))[1], n=v, messy=k in fallback)
           for k, v in sorted(count.items(), key=lambda kv: -kv[1])]
events = [[e['sp'], round(e['t'], 3), round(offs[tuple(e['clip'])][0], 3), round(e['dur'], 3)] for e in sorted(info['events'], key=lambda e: e['t'])]
out = dict(length_s=WLEN, sr=SR, bed=dict(file='audio/bed.m4a', **info['bed']), birds_file='audio/birds.m4a',
           species=species, events=events, note='events = [種, 鳴らす時刻（秒）, birds.m4a の中の位置（秒）, 長さ（秒）]')
json.dump(out, open(os.path.join(APP, 'data', 'forest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('土台', len(base) / SR, '秒 ／ 鳥の切り出し', len(offs), '個・', round(len(sp_audio) / SR, 1), '秒 ／ 鳴らす', len(events), '回・', len(species), '種')
print([ (s['code'], s['sci'], s['n']) for s in species])
