# 重ねた森（夜明けのアマゾン）を作り、本物の録音とくらべる。
# 使う録音: Hopping, Kahl & Klinck 2022「A collection of fully-annotated soundscape recordings from the
#   Southwestern Amazon Basin」Zenodo 10.5281/zenodo.7079124（CC BY 4.0）。ペルー Inkaterra Reserva Amazonica、
#   2019年1月、5:00〜6:00、32 kHz・モノラル。鳥だけに注釈（132種＋種のわからない鳥「????」）。
# 動かし方（numpy・soundfile のある Python で。例: tools の audio-studio-mcp の .venv。ffmpeg も使う）:
#   python build_mix.py <録音と annotations.csv のあるフォルダ> <jungle-sound フォルダ>
# 作るもの: <jungle-sound>/audio/mix1〜3.m4a（重ねた森）・ref1〜3.m4a（本物の基準）、data/mix.json、data/mix-spec.png
# 批判役3回目（DEVNOTES）を受けて: 土台は1か所・1日から時刻の順／鳥の鳴く時刻は本物の並びを写す／
#   本物は18区間の分布とくらべる／わざと悪く作った重ね方でも測って、物差しが見分けられるかを見る／圧縮して戻した音で測る
import csv, json, os, random, subprocess, sys, struct, zlib
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8')

SRC, APP = sys.argv[1], sys.argv[2]
SR = 32000
W0, WLEN = 1500.0, 180.0        # 重ねた森がまねる時間: 録音の 25:00〜28:00（5時25分ごろ）
NEAR = 600.0                    # 鳥の並びは 15:00〜38:00 から取る
REFWIN = [900 + 180 * k for k in range(7)]   # 本物の基準: 15:00〜36:00 を3分ずつ7区間 × 3本
BED = os.environ.get('JUNGLE_BED', 'PER_020_S08_20190131')   # 土台は1か所・1日（S01 は小川のそばで、試した3通りのうち S08 がいちばん本物に近かった）
TRAIN = ['PER_015_S01_20190131', 'PER_020_S08_20190131', 'PER_005_S06_20190116', 'PER_012_S06_20190120']
REF = ['PER_002_S02_20190116', 'PER_010_S04_20190120', 'PER_018_S05_20190131']   # 場所も日も TRAIN とちがう

def fn(stem): return stem + '_100007Z.flac'
ann = {}
for r in csv.DictReader(open(os.path.join(SRC, 'annotations.csv'), encoding='utf-8')):
    ann.setdefault(r['Filename'], []).append((float(r['Start Time (s)']), float(r['End Time (s)']),
        float(r['Low Freq (Hz)']), float(r['High Freq (Hz)']), r['Species eBird Code']))
names = {r['Species eBird Code']: (r['Scientific Name'], r['Common Name'])
         for r in csv.DictReader(open(os.path.join(SRC, 'species.csv'), encoding='utf-8'))}
audio = {}
def load(stem):
    if stem not in audio:
        x, sr = sf.read(os.path.join(SRC, fn(stem)), dtype='float32'); assert sr == SR, sr
        audio[stem] = x if x.ndim == 1 else x.mean(1)
    return audio[stem]

def busy(stem, pad):
    iv = sorted((max(0, a - pad), b + pad) for a, b, *_ in ann[fn(stem)]); out = []
    for a, b in iv:
        if out and a <= out[-1][1]: out[-1][1] = max(out[-1][1], b)
        else: out.append([a, b])
    return out
def fade(x, n):
    n = min(n, len(x) // 2)
    if n > 0:
        w = np.sin(np.linspace(0, np.pi / 2, n)) ** 2; x[:n] *= w; x[-n:] *= w[::-1]
    return x
def bandpass(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); a, b, e = lo / 1.2, hi * 1.2, 250.0
    m = np.clip((f - (a - e)) / e, 0, 1) * np.clip(((b + e) - f) / e, 0, 1)
    return np.fft.irfft(X * m, len(x)).astype('float32')

# ---------- 土台: 1か所・1日の録音から、鳥の注釈のない区間を「時刻の順に」つなぐ ----------
def make_bed():
    x = load(BED); dur = len(x) / SR; prev = 0.0; gaps = []
    for a, b in busy(BED, 0.4) + [[dur, dur]]:
        if a - prev >= 1.0: gaps.append((prev, a))
        prev = max(prev, b)
    mid = W0 + WLEN / 2                                        # まねる時刻に近い区間から、時刻の順に3分ぶん
    gaps.sort(key=lambda g: abs((g[0] + g[1]) / 2 - mid)); pick = []; tot = 0
    for g in gaps:
        if tot >= WLEN + 2: break
        pick.append(g); tot += g[1] - g[0] - 0.25
    pick.sort(); X = int(0.25 * SR); out = np.zeros(0, 'float32')
    for a, b in pick:
        seg = x[int(a * SR):int(b * SR)].copy()
        if len(out) == 0: out = seg
        else:
            w = np.sin(np.linspace(0, np.pi / 2, X)) ** 2
            out[-X:] = out[-X:] * w[::-1] + seg[:X] * w; out = np.concatenate([out, seg[X:]])
    assert len(out) >= WLEN * SR, len(out) / SR
    return out[:int(WLEN * SR)], [[round(a, 1), round(b, 1)] for a, b in pick]

# ---------- 鳥: 種ごとに、ほかの録音で「本物が鳴いた時刻の並び」を写し、その種の切り出しをはめる ----------
clips = {}; messy = {}   # messy: ほかの鳥の声と重なる切り出し（きれいな切り出しが1つもない種だけに使う）
for stem in TRAIN:
    A = ann[fn(stem)]
    for i, (a, b, lo, hi, sp) in enumerate(A):
        if b - a > 15: continue
        clean = not any(j != i and c < b + 0.2 and d > a - 0.2 for j, (c, d, *_) in enumerate(A))
        (clips if clean else messy).setdefault(sp, []).append((stem, a, b, lo, hi))
fallback = sorted(sp for sp in messy if sp not in clips)
for sp in fallback: clips[sp] = messy[sp]

def make_mix(seed, band=True, scale=1.0, shuffle_time=False):
    rng = random.Random(seed); bed, segs = make_bed(); mix = bed.copy(); placed = {}; missing = {}; reuse = 0
    src_of = {}                                                # 種ごとに、並びを写す録音を1本選ぶ
    for stem in TRAIN:
        for a, b, lo, hi, sp in ann[fn(stem)]:
            if abs(a - (W0 + WLEN / 2)) <= NEAR: src_of.setdefault(sp, set()).add(stem)
    for sp in sorted(src_of):
        stem = rng.choice(sorted(src_of[sp])); off = rng.uniform(-NEAR + WLEN / 2, NEAR - WLEN / 2)
        starts = sorted(a - (W0 + off) for a, b, lo, hi, s in ann[fn(stem)] if s == sp and b - a <= 15)
        starts = [t for t in starts if 0 <= t < WLEN]
        if scale > 1: starts += [rng.uniform(0, WLEN) for _ in range(int(len(starts) * (scale - 1)))]
        if shuffle_time: starts = [rng.uniform(0, WLEN) for _ in starts]
        if not starts: continue
        if sp not in clips: missing[sp] = len(starts); continue
        pool = []
        for t in starts:
            if not pool:
                pool = clips[sp][:]; rng.shuffle(pool)
                if placed.get(sp): reuse += 1           # 一周使い切って、同じ切り出しをもう一度使いはじめた回数
            stem2, a, b, lo, hi = pool.pop()
            seg = load(stem2)[int((a - 0.1) * SR):int((b + 0.1) * SR)].copy()
            if band: seg = bandpass(seg, lo, hi)
            seg = fade(seg, int(0.05 * SR)); i = int(t * SR); seg = seg[:max(0, len(mix) - i)]
            mix[i:i + len(seg)] += seg; placed[sp] = placed.get(sp, 0) + 1
    return mix, bed, dict(bed_segments=segs, placed=placed, missing=missing, clip_reuse_rounds=reuse)

# ---------- 物差し ----------
def roundtrip(x):
    """アプリで流すのと同じ AAC 64 kbps に圧縮して戻した音で測る"""
    tmp = os.path.join(SRC, '_rt.wav'); out = os.path.join(SRC, '_rt.m4a'); back = os.path.join(SRC, '_rt2.wav')
    sf.write(tmp, np.clip(x, -1, 1), SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'aac', '-b:a', '64k', '-ac', '1', out], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-ar', str(SR), back], check=True)
    y, _ = sf.read(back, dtype='float32'); return y if y.ndim == 1 else y.mean(1)
def stft(x):
    n, h = 1024, 512; w = np.hanning(n).astype('float32')
    fr = np.lib.stride_tricks.sliding_window_view(x, n)[::h] * w
    return np.abs(np.fft.rfft(fr, axis=1)) ** 2 + 1e-12, np.fft.rfftfreq(n, 1 / SR)
def metrics(x):
    P, f = stft(x); o = {}; tot = P.sum()
    o['level_dbfs'] = float(10 * np.log10(np.mean(x ** 2) + 1e-12))
    sec = 10 * np.log10(np.mean(x[:len(x) // SR * SR].reshape(-1, SR) ** 2, 1) + 1e-12)
    o['L10'] = float(np.percentile(sec, 90)); o['L90'] = float(np.percentile(sec, 10))    # 大きさのばらつき
    for k in range(16):
        m = (f >= k * 1000) & (f < (k + 1) * 1000); e = P[:, m].sum(1); d = 10 * np.log10(e)
        o[f'shape_{k:02d}k'] = float(10 * np.log10(e.sum() / tot))
        o[f'active_{k:02d}k'] = float(np.mean(d > np.percentile(d, 20) + 6))
    for nm, lo, hi in [('onset_1_4k', 1000, 4000), ('onset_4_8k', 4000, 8000), ('onset_8_16k', 8000, 16000)]:
        d = 10 * np.log10(P[:, (f >= lo) & (f < hi)].sum(1)); rise = d[3:] - d[:-3]; c = 0; last = -99
        for i in np.where(rise > 6)[0]:                        # 鳴きはじめ（6 dB 以上の立ち上がり、0.2 秒あけて数える）
            if i - last > 12: c += 1; last = i
        o[nm] = c / (len(x) / SR / 60)
    m = (f >= 1000) & (f < 16000); Q = P[:, m]; k = int(5 * SR / 512); aci = 0.0
    for s in range(0, len(Q) - 1, k):
        c = Q[s:s + k]; aci += float(np.sum(np.abs(np.diff(c, axis=0)).sum(0) / (c.sum(0) + 1e-12)))
    o['aci'] = aci / (len(x) / SR / 60)
    env = np.abs(x); env = env / env.sum(); ht = -np.sum(env * np.log(env + 1e-20)) / np.log(len(env))
    sp = Q.mean(0); sp = sp / sp.sum(); hf = -np.sum(sp * np.log(sp + 1e-20)) / np.log(len(sp)); o['H'] = float(ht * hf)
    bio = P[:, (f >= 2000) & (f < 8000)].sum(); an = P[:, (f >= 1000) & (f < 2000)].sum(); o['ndsi'] = float((bio - an) / (bio + an))
    dB = 10 * np.log10(P / P.max()); props = np.array([np.mean(dB[:, (f >= k * 1000) & (f < (k + 1) * 1000)] > -50) for k in range(10)])
    p = props / (props.sum() + 1e-12); o['adi'] = float(-np.sum(p * np.log(p + 1e-12)))   # ADI（Villanueva-Rivera 2011）
    s = np.sort(props); n = len(s); o['aei'] = float((2 * np.sum((np.arange(1, n + 1)) * s) / (n * s.sum() + 1e-12)) - (n + 1) / n)  # AEI（ジニ係数）
    return o

# ---------- 作る・測る ----------
refwins = {f'{s}@{w}': load(s)[int(w * SR):int((w + WLEN) * SR)] for s in REF for w in REFWIN}
R = {k: metrics(roundtrip(v)) for k, v in refwins.items()}
cands = {}
for band in (True, False):
    for seed in (1, 2, 3):
        mix, bed, info = make_mix(seed, band=band); cands[(band, seed)] = (mix, info, metrics(roundtrip(mix)))
keys = list(next(iter(R.values())).keys())
def pct(v, key): rv = np.array([R[k][key] for k in R]); return float(np.mean(rv < v) * 100 + np.mean(rv == v) * 50)
def score(M): return sum(1 for k in keys if 5 <= pct(M[k], k) <= 95)
best_band = max((True, False), key=lambda b: sum(score(cands[(b, s)][2]) for s in (1, 2, 3)))
bad = {'鳥なし（土台だけ）': metrics(roundtrip(make_bed()[0])),
       '鳥を2倍': metrics(roundtrip(make_mix(1, band=best_band, scale=2.0)[0])),
       '鳥の時刻をでたらめ': metrics(roundtrip(make_mix(1, band=best_band, shuffle_time=True)[0]))}
# 物差しのきびしさの目安: 基準に入れていない本物（TRAIN 4本の同じ時刻）が、いくつ範囲に入るか
real_other = {s: score(metrics(roundtrip(load(s)[int(W0 * SR):int((W0 + WLEN) * SR)]))) for s in TRAIN}
print('基準に入れていない本物が範囲に入った数:', real_other, '/', len(keys))
print('帯で切る' if best_band else '帯で切らない', 'を採用（本物の5〜95%に入った数:',
      {('切る' if b else '切らない'): [score(cands[(b, s)][2]) for s in (1, 2, 3)] for b in (True, False)}, '/', len(keys), '）')

rows = []
for k in keys:
    rv = sorted(R[kk][k] for kk in R)
    rows.append(dict(key=k, ref_p05=float(np.percentile(rv, 5)), ref_p50=float(np.percentile(rv, 50)), ref_p95=float(np.percentile(rv, 95)),
                     mix=[cands[(best_band, s)][2][k] for s in (1, 2, 3)], mix_pct=[pct(cands[(best_band, s)][2][k], k) for s in (1, 2, 3)],
                     other=[cands[(not best_band, s)][2][k] for s in (1, 2, 3)],
                     bad={nm: dict(v=M[k], pct=pct(M[k], k)) for nm, M in bad.items()}))

# ---------- 書き出し ----------
os.makedirs(os.path.join(APP, 'audio'), exist_ok=True); os.makedirs(os.path.join(APP, 'data'), exist_ok=True)
def save(x, name):
    tmp = os.path.join(SRC, name + '.wav'); peak = float(np.max(np.abs(x)))
    y = x / max(1.0, peak / 0.98); sf.write(tmp, y, SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
                    os.path.join(APP, 'audio', name + '.m4a')], check=True)
    return [round(float(v), 2) for v in 10 * np.log10(np.mean(y[:len(y) // SR * SR].reshape(-1, SR) ** 2, 1) + 1e-12)]
def spec_png(x, path, W=720, H=150):
    P, f = stft(x); P = P[:, f < 16000]; d = 10 * np.log10(P); lo, hi = np.percentile(d, 5), np.percentile(d, 99.7)
    t = np.clip((d - lo) / (hi - lo), 0, 1)
    ti = (np.arange(W) * len(t) / W).astype(int); fi = ((1 - np.arange(H) / (H - 1)) * (t.shape[1] - 1)).round().astype(int)
    v = t[ti][:, fi].T
    rgb = np.stack([np.minimum(255, 40 + 420 * v * v), np.minimum(255, 20 + 330 * v), np.minimum(255, 18 + 120 * v ** 3)], -1).astype('uint8')
    raw = b''.join(b'\x00' + rgb[y].tobytes() for y in range(H))
    ch = lambda k, d: struct.pack('>I', len(d)) + k + d + struct.pack('>I', zlib.crc32(k + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw, 9)) + ch(b'IEND', b''))
loud = {}
for s in (1, 2, 3): loud[f'mix{s}'] = save(cands[(best_band, s)][0], f'mix{s}')
for i, s in enumerate(REF, 1): loud[f'ref{i}'] = save(load(s)[int(W0 * SR):int((W0 + WLEN) * SR)], f'ref{i}')
spec_png(cands[(best_band, 1)][0], os.path.join(APP, 'data', 'mix-spec.png'))
info1 = cands[(best_band, 1)][1]
def birds(info): return [dict(code=k, sci=names.get(k, ('', ''))[0], en=names.get(k, ('', ''))[1], placed=v) for k, v in sorted(info['placed'].items(), key=lambda kv: -kv[1])]
out = dict(
    window=dict(start_s=W0, length_s=WLEN, note='録音の開始 5:00:07（ペルー時間）から数えた秒'),
    bed_file=BED, train=TRAIN, ref=REF, ref_windows=REFWIN, band_filter=best_band,
    mixes=[dict(seed=s, bed_segments=len(cands[(best_band, s)][1]['bed_segments']), birds=birds(cands[(best_band, s)][1]),
                missing=len(cands[(best_band, s)][1]['missing']), clip_reuse_rounds=cands[(best_band, s)][1]['clip_reuse_rounds']) for s in (1, 2, 3)],
    bed_segments=info1['bed_segments'], messy_species=fallback, real_other=real_other, loud=loud, metrics=rows)
json.dump(out, open(os.path.join(APP, 'data', 'mix.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"{'指標':<12} 本物(5%〜50%〜95%)          重ねた森1〜3（本物の中の位置%）     悪い作り方（位置%）")
for r in rows:
    print(f"{r['key']:<12} {r['ref_p05']:8.3f}〜{r['ref_p50']:8.3f}〜{r['ref_p95']:8.3f}  " + ' '.join(f"{p:5.0f}" for p in r['mix_pct']) + '   ' +
          ' '.join(f"{nm[:4]}{b['pct']:4.0f}" for nm, b in r['bad'].items()))
for s in (1, 2, 3):
    m = out['mixes'][s - 1]; print(f"重ねた森{s}: 土台のつなぎ目 {m['bed_segments'] - 1}・鳥 {len(m['birds'])} 種 {sum(b['placed'] for b in m['birds'])} 回・置けなかった種 {m['missing']}・切り出しの使い回し {m['clip_reuse_rounds']} 周")
