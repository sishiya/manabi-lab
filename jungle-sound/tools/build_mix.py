# 重ねた森（夜明けのアマゾン）を作り、本物の録音とくらべる。
# 使う録音: Hopping, Kahl & Klinck 2022「A collection of fully-annotated soundscape recordings from the
#   Southwestern Amazon Basin」Zenodo 10.5281/zenodo.7079124（CC BY 4.0）。ペルー Inkaterra Reserva Amazonica、
#   2019年1月、5:00〜6:00、32 kHz・モノラル。鳥だけに注釈（132種＋種のわからない鳥「????」）。
# 動かし方（numpy・soundfile のある Python で。例: tools の audio-studio-mcp の .venv。ffmpeg も使う）:
#   python build_mix.py <録音と annotations.csv のあるフォルダ> <jungle-sound フォルダ>
# 作るもの: <jungle-sound>/audio/mix1〜3.m4a（重ねた森）・ref1〜3.m4a（本物の基準）、data/mix.json、data/mix-spec.png
# v003（2026-11-14、ユーザーの聞きくらべが 20 回中 19 回当たり → 聞き分けられた）:
#   土台は「つなぐ」のをやめ、本物の連続した3分の鳥の注釈の箱を、近くの時刻の同じ高さの音で塗りつぶす（つなぎ目なし）。
#   鳥の切り出しは、まわりの音（虫）をスペクトル減算で引く（虫の音が二重にならない）。
#   物差しに「機械の聞き分け」（15秒ずつ、ロジスティック回帰）を足し、作り方はこれがいちばん見分けにくいものを選ぶ。
import csv, json, os, random, subprocess, sys, struct, zlib
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8')

SRC, APP = sys.argv[1], sys.argv[2]
SR = 32000
W0, WLEN = 1500.0, 180.0        # 重ねた森がまねる時間: 録音の 25:00〜28:00（5時25分ごろ）
NEAR = 600.0                    # 鳥の並びは 15:00〜38:00 から取る
REFWIN = [900 + 180 * k for k in range(7)]   # 本物の基準: 15:00〜36:00 を3分ずつ7区間 × 3本
SNIP = 15.0                                  # 機械の聞き分けは 15 秒ずつ（耳の聞きくらべと同じ長さ）
BED = os.environ.get('JUNGLE_BED', 'PER_020_S08_20190131')   # 土台は1か所・1日
TRAIN = ['PER_015_S01_20190131', 'PER_020_S08_20190131', 'PER_005_S06_20190116', 'PER_012_S06_20190120']
REF = ['PER_002_S02_20190116', 'PER_010_S04_20190120', 'PER_018_S05_20190131']   # 数の表の基準（場所も日も TRAIN とちがう）
# 聞きくらべと機械の聞き分けの「本物」は、土台と同じ場所・同じ日の、別の時刻（土台の3分と塗りつぶしに使った前後 90 秒に重ならない）。
# 場所がちがうと、つなぎ目などの不自然さより先に「場所のちがい」で見分けられてしまう（機械: 本物どうしでも 93%。2026-11-14）
SAMEWIN = [900, 1080, 1800, 1980, 2160]      # 5:15・5:18・5:30・5:33・5:36 から3分
# ところが夜明けの虫の合唱は数分ごとに変わり、機械は手を加えていない同じ3分でも「時刻のちがい」で見分けた（2026-11-14）。
# だから聞きくらべの「本物」は、土台のもとになった同じ3分（塗る前）。虫の音は同じなので、ちがいは鳥の入れ方と塗りつぶしの跡だけになる
ABXWIN = [W0]

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
def fade(x, n):
    n = min(n, len(x) // 2)
    if n > 0:
        w = np.sin(np.linspace(0, np.pi / 2, n)) ** 2; x[:n] *= w; x[-n:] *= w[::-1]
    return x
def bandpass(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); a, b, e = lo / 1.2, hi * 1.2, 250.0
    m = np.clip((f - (a - e)) / e, 0, 1) * np.clip(((b + e) - f) / e, 0, 1)
    return np.fft.irfft(X * m, len(x)).astype('float32')

# ---------- 複素 STFT と逆変換（塗りつぶし・引き算用）----------
N, HOP = 1024, 256
WIN = np.hanning(N).astype('float32')
FREQ = np.fft.rfftfreq(N, 1 / SR)
def stft_c(x):
    x = np.pad(x, (N // 2, N // 2))
    return np.fft.rfft(np.lib.stride_tricks.sliding_window_view(x, N)[::HOP] * WIN, axis=1)
def istft(Z, length):
    fr = np.fft.irfft(Z, N, axis=1) * WIN; out = np.zeros(HOP * (len(Z) - 1) + N, 'float32'); wsum = np.zeros_like(out)
    for i in range(len(Z)): out[i * HOP:i * HOP + N] += fr[i]; wsum[i * HOP:i * HOP + N] += WIN ** 2
    out = out / np.maximum(wsum, 1e-6); return out[N // 2:N // 2 + length]
def fbin(hz): return int(np.clip(np.searchsorted(FREQ, hz), 0, len(FREQ) - 1))
def tfr(sec): return int(round(sec * SR / HOP))

# ---------- 土台 ----------
def bed_splice():
    """（第一弾の作り方。くらべるために残す）鳥の注釈のない区間を、時刻の順につなぐ"""
    x = load(BED); dur = len(x) / SR; prev = 0.0; gaps = []
    iv = sorted((max(0, a - 0.4), b + 0.4) for a, b, *_ in ann[fn(BED)]); busy = []
    for a, b in iv:
        if busy and a <= busy[-1][1]: busy[-1][1] = max(busy[-1][1], b)
        else: busy.append([a, b])
    for a, b in busy + [[dur, dur]]:
        if a - prev >= 1.0: gaps.append((prev, a))
        prev = max(prev, b)
    mid = W0 + WLEN / 2; gaps.sort(key=lambda g: abs((g[0] + g[1]) / 2 - mid)); pick = []; tot = 0
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
    return out[:int(WLEN * SR)], dict(kind='splice', joins=len(pick) - 1)

_bed_fill = None
def bed_fill():
    """本物の連続した3分（BED の W0〜）の、鳥の注釈の箱（時間 ±0.15 秒・高さ ×1/1.15〜1.15）を、
    近くの時刻（±90 秒）で同じ高さに鳥の箱が少ない所の音で塗りつぶす。位相ごと写すので虫の音のきめが残る。つなぎ目はない"""
    global _bed_fill
    if _bed_fill is not None: return _bed_fill
    M0 = 90.0; x = load(BED)[int((W0 - M0) * SR):int((W0 + WLEN + M0) * SR)]
    Z0 = stft_c(x); Z = Z0.copy(); T, F = Z.shape; mask = np.zeros((T, F), bool); boxes = []
    for a, b, lo, hi, sp in ann[fn(BED)]:
        if b < W0 - M0 or a > W0 + WLEN + M0: continue
        t0, t1 = max(0, tfr(a - 0.15 - (W0 - M0))), min(T, tfr(b + 0.15 - (W0 - M0)) + 1)
        f0, f1 = fbin(lo / 1.15), fbin(hi * 1.15) + 1
        if t1 > t0 and f1 > f0: mask[t0:t1, f0:f1] = True; boxes.append((t0, t1, f0, f1))
    cs = np.zeros((T + 1, F + 1)); cs[1:, 1:] = np.cumsum(np.cumsum(mask, 0), 1)   # 箱の多さを速く数える
    def frac(t0, t1, f0, f1): return (cs[t1, f1] - cs[t0, f1] - cs[t1, f0] + cs[t0, f0]) / ((t1 - t0) * (f1 - f0))
    lo_t, hi_t = tfr(M0), tfr(M0 + WLEN); filled = 0; step = tfr(0.25)
    for t0, t1, f0, f1 in sorted(boxes, key=lambda b: (b[1] - b[0]) * (b[3] - b[2]), reverse=True):
        if t1 < lo_t - 8 or t0 > hi_t + 8: continue           # 3分の外の箱は塗らない（ドナーの候補としてだけ数える）
        L = t1 - t0; best = None
        for d in range(-tfr(M0), tfr(M0) + 1, step):
            if abs(d) < L or t0 + d < 0 or t1 + d > T: continue
            s = (frac(t0 + d, t1 + d, f0, f1), abs(d))
            if best is None or s < best[0]: best = (s, d)
        if best is None: continue
        d = best[1]; e = 4                                      # はしは 4 コマ・3 本でなめらかに
        wt = np.ones(L); r = min(e, L // 2)
        if r: wt[:r] = np.linspace(0, 1, r + 2)[1:-1]; wt[-r:] = wt[:r][::-1]
        wf = np.ones(f1 - f0); q = min(3, (f1 - f0) // 2)
        if q: wf[:q] = np.linspace(0, 1, q + 2)[1:-1]; wf[-q:] = wf[:q][::-1]
        W = np.outer(wt, wf)
        Z[t0:t1, f0:f1] = Z[t0:t1, f0:f1] * (1 - W) + Z0[t0 + d:t1 + d, f0:f1] * W; filled += 1
    y = istft(Z, len(x))[int(M0 * SR):int((M0 + WLEN) * SR)]
    _bed_fill = (y.astype('float32'), dict(kind='fill', boxes=filled))
    return _bed_fill

# ---------- 鳥の切り出し ----------
clips = {}; messy = {}   # messy: ほかの鳥の声と重なる切り出し（きれいな切り出しが1つもない種だけに使う）
for stem in TRAIN:
    A = ann[fn(stem)]
    for i, (a, b, lo, hi, sp) in enumerate(A):
        if b - a > 15 or a < 1.2: continue
        clean = not any(j != i and c < b + 0.2 and d > a - 0.2 for j, (c, d, *_) in enumerate(A))
        (clips if clean else messy).setdefault(sp, []).append((stem, a, b, lo, hi))
fallback = sorted(sp for sp in messy if sp not in clips)
for sp in fallback: clips[sp] = messy[sp]

def cut(stem, a, b, lo, hi, mode):
    """mode: raw＝そのまま / band＝箱の高さだけ / sub＝前後 1 秒のまわりの音（虫）をスペクトル減算で引き、箱の近くの高さだけ残す"""
    x = load(stem)
    if mode != 'sub':
        seg = x[int((a - 0.1) * SR):int((b + 0.1) * SR)].copy()
        return bandpass(seg, lo, hi) if mode == 'band' else seg
    seg = x[int((a - 1.0) * SR):int((b + 1.0) * SR)]; Z = stft_c(seg); P = np.abs(Z)
    pad = tfr(0.9); Bk = np.median(np.concatenate([P[:pad], P[-pad:]]), 0)           # まわりの音の大きさ（高さごと）
    G = np.sqrt(np.clip(1 - (2.0 * Bk / (P + 1e-9)) ** 2, 0, 1))                      # 2 倍（+6 dB）の余裕で引く
    fr = np.clip((FREQ - lo / 1.3) / 200, 0, 1) * np.clip((hi * 1.3 - FREQ) / 200, 0, 1)   # 箱の近くの高さだけ（倍音は 1.3 倍まで）
    G = G * fr[None, :]
    k = np.ones(3) / 3                                                               # ちらつき（ミュージカルノイズ）を減らす
    G = np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 0, G); G = np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 1, G)
    y = istft(Z * G, len(seg))
    return y[int(0.9 * SR):len(y) - int(0.9 * SR)].copy()

def make_mix(seed, bed='fill', mode='sub', scale=1.0, shuffle_time=False):
    rng = random.Random(seed); base, binfo = (bed_fill() if bed == 'fill' else bed_splice()) if bed else (np.zeros(int(WLEN * SR), 'float32'), {})
    mix = base.copy(); placed = {}; missing = {}; reuse = 0
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
            seg = fade(cut(*pool.pop(), mode), int(0.05 * SR)); i = int(t * SR); seg = seg[:max(0, len(mix) - i)]
            mix[i:i + len(seg)] += seg; placed[sp] = placed.get(sp, 0) + 1
    return mix, base, dict(bed=binfo, placed=placed, missing=missing, clip_reuse_rounds=reuse)

# ---------- 物差し ----------
def roundtrip(x):
    """アプリで流すのと同じ AAC 64 kbps に圧縮して戻した音で測る"""
    tmp = os.path.join(SRC, '_rt.wav'); out = os.path.join(SRC, '_rt.m4a'); back = os.path.join(SRC, '_rt2.wav')
    sf.write(tmp, np.clip(x, -1, 1), SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'aac', '-b:a', '64k', '-ac', '1', out], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-ar', str(SR), back], check=True)
    y, _ = sf.read(back, dtype='float32'); y = y if y.ndim == 1 else y.mean(1)
    return y[:len(x)]
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

def snippets(x):
    """3分を 15 秒ずつ 12 個にして、それぞれの数（機械の聞き分けの手がかり）"""
    # 耳の聞きくらべと同じく、全体の大きさは手がかりにしない（大きさはそろえて聞くので）。大きさのばらつき（L10−L90）だけ残す
    k = int(SNIP * SR); out = []
    for i in range(len(x) // k):
        m = metrics(x[i * k:(i + 1) * k]); m['L10'] -= m['L90']; del m['level_dbfs'], m['L90']; out.append(list(m.values()))
    return out
def split(groups):
    """3分を 15 秒ずつ別のまとまりに（同じ3分の本物が1本しかないとき用）"""
    return [[s] for g in groups for s in g]
def machine(pos, neg, seed=0, folds=6):
    """機械の聞き分け: 15 秒ずつの数から、ロジスティック回帰で pos と neg を見分ける。
    同じ3分から取った 15 秒が、学ぶ側と試す側に分かれないように、3分ごとにまとめて分ける。
    正解率（両方の平均）が 50% なら見分けられない"""
    rng = np.random.default_rng(seed)
    X = np.array([s for g in pos + neg for s in g]); y = np.array([1] * sum(map(len, pos)) + [0] * sum(map(len, neg)))
    grp = np.array([i for i, g in enumerate(pos + neg) for _ in g])
    gid = rng.permutation(len(pos + neg)); fold = {g: i % folds for i, g in enumerate(gid)}
    pred = np.zeros(len(y))
    for k in range(folds):
        te = np.array([fold[g] == k for g in grp]); tr = ~te
        if te.sum() == 0 or len(set(y[tr])) < 2: continue
        mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-9; A = (X - mu) / sd
        w = np.zeros(A.shape[1]); b = 0.0; cw = np.where(y[tr] == 1, 0.5 / y[tr].mean(), 0.5 / (1 - y[tr].mean()))
        for _ in range(800):
            p = 1 / (1 + np.exp(-(A[tr] @ w + b))); g = (p - y[tr]) * cw
            w -= 0.1 * (A[tr].T @ g / tr.sum() + 0.05 * w); b -= 0.1 * g.mean()
        pred[te] = 1 / (1 + np.exp(-(A[te] @ w + b)))
    hit = (pred > 0.5) == (y == 1)
    return float((hit[y == 1].mean() + hit[y == 0].mean()) / 2 * 100)

# ---------- 作る・測る ----------
print('本物を測っています…', flush=True)
refwins = {f'{s}@{w}': roundtrip(load(s)[int(w * SR):int((w + WLEN) * SR)]) for s in REF for w in REFWIN}
R = {k: metrics(v) for k, v in refwins.items()}
RS = [snippets(v) for v in refwins.values()]
SAME = [snippets(roundtrip(load(BED)[int(w * SR):int((w + WLEN) * SR)])) for w in SAMEWIN]
ORIG = split([snippets(roundtrip(load(BED)[int(W0 * SR):int((W0 + WLEN) * SR)]))])   # 土台のもとの同じ3分（塗る前の本物）
base_site = machine([snippets(roundtrip(load(s)[int(w * SR):int((w + WLEN) * SR)])) for s in ('PER_015_S01_20190131',) for w in SAMEWIN], SAME)
base_time = machine(SAME[:2], SAME[2:])                         # 同じ場所で、時刻（5:15〜21 と 5:30〜39）だけちがう本物どうし
print(f'機械の聞き分け（目安）: 同じ場所の本物どうし・時刻ちがい {base_time:.0f}% ／ 場所ちがいの本物 {base_site:.0f}%', flush=True)
VARIANTS = [('splice', 'raw', '第一弾（土台をつなぐ・鳥はそのまま）'), ('fill', 'raw', '土台を塗りつぶす・鳥はそのまま'),
            ('fill', 'band', '土台を塗りつぶす・鳥は高さで切る'), ('fill', 'sub', '土台を塗りつぶす・鳥はまわりの音を引く')]
SEEDS = [1, 2, 3, 4, 5, 6]
built = {}; acc = {}; acc_t = {}
for bed, mode, label in VARIANTS:
    mixes = [make_mix(s, bed=bed, mode=mode) for s in SEEDS]
    rts = [roundtrip(m[0]) for m in mixes]
    acc[(bed, mode)] = machine(split([snippets(r) for r in rts]), ORIG)                # 同じ3分の本物と
    acc_t[(bed, mode)] = machine([snippets(r) for r in rts], SAME)                     # （参考）別の時刻の本物と
    built[(bed, mode)] = (mixes, rts)
    print(f'  {label}: 機械の聞き分け 同じ3分の本物と {acc[(bed, mode)]:.0f}% ／ 別の時刻の本物と {acc_t[(bed, mode)]:.0f}%', flush=True)
# 土台はつなぎ目のない塗りつぶしに決める（ユーザー: 違和感の主はつなぎ目。2026-11-14）。鳥の入れ方は機械の聞き分けがいちばん低いもの
best = min((k for k in acc if k[0] == 'fill'), key=acc.get)
mixes, rts = built[best]
keys = list(next(iter(R.values())).keys())
def pct(v, key): rv = np.array([R[k][key] for k in R]); return float(np.mean(rv < v) * 100 + np.mean(rv == v) * 50)
def score(M): return sum(1 for k in keys if 5 <= pct(M[k], k) <= 95)
MM = [metrics(r) for r in rts[:3]]
bad = {'鳥なし（土台だけ）': metrics(roundtrip(mixes[0][1])),
       '鳥を2倍': metrics(roundtrip(make_mix(1, bed=best[0], mode=best[1], scale=2.0)[0])),
       '鳥の時刻をでたらめ': metrics(roundtrip(make_mix(1, bed=best[0], mode=best[1], shuffle_time=True)[0]))}
real_other = {s: score(metrics(roundtrip(load(s)[int(W0 * SR):int((W0 + WLEN) * SR)]))) for s in TRAIN}
rows = []
for k in keys:
    rv = sorted(R[kk][k] for kk in R)
    rows.append(dict(key=k, ref_p05=float(np.percentile(rv, 5)), ref_p50=float(np.percentile(rv, 50)), ref_p95=float(np.percentile(rv, 95)),
                     mix=[m[k] for m in MM], mix_pct=[pct(m[k], k) for m in MM],
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
for i in range(3): loud[f'mix{i + 1}'] = save(mixes[i][0], f'mix{i + 1}')
for i, w in enumerate(ABXWIN, 1): loud[f'ref{i}'] = save(load(BED)[int(w * SR):int((w + WLEN) * SR)], f'ref{i}')
spec_png(mixes[0][0], os.path.join(APP, 'data', 'mix-spec.png'))
def birds(info): return [dict(code=k, sci=names.get(k, ('', ''))[0], en=names.get(k, ('', ''))[1], placed=v) for k, v in sorted(info['placed'].items(), key=lambda kv: -kv[1])]
out = dict(
    window=dict(start_s=W0, length_s=WLEN, note='録音の開始 5:00:07（ペルー時間）から数えた秒'),
    bed_file=BED, train=TRAIN, ref=REF, ref_windows=REFWIN, method=dict(bed=best[0], clip=best[1]),
    bed_info=mixes[0][2]['bed'],
    abx_ref=dict(file=BED, windows=ABXWIN), same_windows=SAMEWIN,
    machine=dict(base_time=base_time, base_site=base_site, variants=[dict(bed=b, clip=m, label=l, acc=acc[(b, m)], acc_time=acc_t[(b, m)]) for b, m, l in VARIANTS], snip_s=SNIP, seeds=len(SEEDS)),
    mixes=[dict(seed=SEEDS[i], birds=birds(mixes[i][2]), missing=len(mixes[i][2]['missing']), clip_reuse_rounds=mixes[i][2]['clip_reuse_rounds']) for i in range(3)],
    messy_species=fallback, real_other=real_other, loud=loud, metrics=rows)
json.dump(out, open(os.path.join(APP, 'data', 'mix.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('採用:', [l for b, m, l in VARIANTS if (b, m) == best][0])
print('本物の5〜95%に入った数:', [score(m) for m in MM], '/ 基準に入れていない本物:', list(real_other.values()), '/', len(keys))
for r in rows:
    if r['key'].startswith(('shape', 'active')): continue
    print(f"{r['key']:<12} {r['ref_p05']:9.3f}〜{r['ref_p95']:9.3f}  " + ' '.join(f"{p:5.0f}" for p in r['mix_pct']))
