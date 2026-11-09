# エンジンが選んだ上限で、F1〜F3 を Praat と同じコマどうし比べる（検証だけ。praat-parselmouth はアプリに含めない）
# 使い方: python -X utf8 praat-frames.py <ceiling-dump の json> <wav のあるフォルダ>...
# 全体の中央値の差だけでは、F2 のように分布が 2 つの山になる値は少しのコマのちがいで大きく動くので、コマごとの差も出す
import json, statistics as st, sys
from pathlib import Path
import parselmouth as pm
from parselmouth.praat import call

data = json.load(open(sys.argv[1], encoding="utf-8"))
dirs = [Path(p) for p in sys.argv[2:]]
groups = {"PVQD": [], "日本語": []}
for s in data:
    wav = next(d / (s["id"] + ".wav") for d in dirs if (d / (s["id"] + ".wav")).exists())
    snd = pm.Sound(str(wav)).convert_to_mono().resample(16000)
    a = next(q for q in s["all"] if q["ceiling"] == s["picked"])
    c = s["picked"]; k = c / 5500
    fm = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5.0, maximum_formant=float(c), window_length=0.025, pre_emphasis_from=50.0)
    try:
        tr = call(fm, "Track", 3, 550*k, 1650*k, 2750*k, 3850*k, 4950*k, 1.0, 1.0, 1.0)
    except pm.PraatError:  # 根が 3 つに足りないコマがあると引けない
        print(s["id"][5:], c, "Track できない", flush=True); continue
    rows = []
    for i in range(3):
        e, p = [], []
        for f in range(len(a["F"][i])):
            v = a["F"][i][f]
            if v is None: continue
            q = call(tr, "Get value at time", i + 1, f * s["hop"] + s["winSec"] / 2, "Hertz", "Linear")
            if q == q and q > 0: e.append(v); p.append(q)
        d = [100 * (u - v) / v for u, v in zip(e, p)]
        ab = sorted(abs(v) for v in d)
        rows.append(dict(med=st.median(ab), p90=ab[int(.9 * len(ab))], off=100 * sum(v > 10 for v in ab) / len(ab), high=100 * sum(v > 10 for v in d) / len(d), low=100 * sum(v < -10 for v in d) / len(d), whole=100 * (st.median(e) - st.median(p)) / st.median(p)))
    print(s["id"][5:], c, " | ".join(f"F{i+1} 差 {r['med']:.1f}% p90 {r['p90']:.1f}% 10%超 {r['off']:.0f}%（高 {r['high']:.0f}・低 {r['low']:.0f}）全体 {r['whole']:+.1f}%" for i, r in enumerate(rows)), flush=True)
    groups["PVQD" if s["id"].startswith("file-p") else "日本語"].append(rows)
for g, v in groups.items():
    if not v: continue
    print(f"\n{g} n={len(v)}（話者の中央値）")
    for i in range(3):
        m = lambda key: st.median(r[i][key] for r in v)
        print(f"F{i+1} コマの差 {m('med'):.1f}%  p90 {m('p90'):.1f}%  10%超のコマ {m('off'):.1f}%（エンジンが高い {m('high'):.1f}・低い {m('low'):.1f}）  全体の中央値の差 {st.median(abs(r[i]['whole']) for r in v):.1f}%（最大 {max(abs(r[i]['whole']) for r in v):.1f}%）")
