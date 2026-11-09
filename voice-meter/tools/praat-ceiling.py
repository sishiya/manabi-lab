# 本物の話し声で、上限ごとにエンジンと Praat の F1〜F3 の差を見る（検証だけ。praat-parselmouth はアプリに含めない）
# 使い方: python -X utf8 praat-ceiling.py <ceiling-dump の json> <wav のあるフォルダ>...
import json, statistics as st, sys
from pathlib import Path
import parselmouth as pm
from parselmouth.praat import call

data = json.load(open(sys.argv[1], encoding="utf-8"))
dirs = [Path(p) for p in sys.argv[2:]]
tot = {}
for s in data:
    wav = next(d / (s["id"] + ".wav") for d in dirs if (d / (s["id"] + ".wav")).exists())
    snd = pm.Sound(str(wav)).convert_to_mono().resample(16000)
    row = []
    for a in s["all"]:
        c = a["ceiling"]
        fm = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5.0, maximum_formant=float(c), window_length=0.025, pre_emphasis_from=50.0)
        k = c / 5500
        try:
            tr = call(fm, "Track", 3, 550 * k, 1650 * k, 2750 * k, 3850 * k, 4950 * k, 1.0, 1.0, 1.0)
        except pm.PraatError:  # 根が 3 つに足りないコマがあると引けない
            row.append(f"{c/100:.0f}: Track できない")
            tot.setdefault(c, []).append([float("nan")] * 3)
            continue
        diffs = [[], [], []]
        for f in range(len(a["F"][0])):
            t = f * s["hop"] + s["winSec"] / 2
            for i in range(3):
                e = a["F"][i][f]
                if e is None: continue
                p = call(tr, "Get value at time", i + 1, t, "Hertz", "Linear")
                if p == p and p > 0: diffs[i].append(100 * (e - p) / p)
        med = [st.median(d) if d else float("nan") for d in diffs]
        ab = [st.median(abs(v) for v in d) if d else float("nan") for d in diffs]
        row.append(f"{c/100:.0f}: " + "/".join(f"{m:+.1f}" for m in med) + " (" + "/".join(f"{m:.1f}" for m in ab) + ")")
        tot.setdefault(c, []).append(ab)
    print(s["id"][5:], f"f0 {s['f0']:.0f}", " | ".join(row), flush=True)
print("\n上限ごと: 差の絶対値の中央値（話者の中央値）F1/F2/F3")
for c, v in tot.items():
    print(c, "/".join(f"{st.median(x[i] for x in v if x[i] == x[i]):.1f}" for i in range(3)))
