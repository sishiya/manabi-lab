# praat-dump.mjs が書いた声を Praat で測り、エンジンの値と並べる
# python praat-compare.py <出力フォルダ>   （praat-parselmouth が要る。検証だけの道具で、アプリには含めない）
import json, statistics, sys
from pathlib import Path
import parselmouth as pm
from parselmouth.praat import call

out = Path(sys.argv[1])
cases = json.loads((out / "engine.json").read_text(encoding="utf-8"))


def med(v):
    v = [x for x in v if x == x]
    return statistics.median(v) if v else float("nan")


def praat(c):
    snd = pm.Sound(str(out / (c["id"] + ".wav")))
    # Praat の既定値（To Pitch (ac)）
    pitch = snd.to_pitch_ac(time_step=c["hop"], pitch_floor=75.0, pitch_ceiling=600.0)
    voiced = [t for t, f in zip(c["t"], c["f0"]) if f > 0]
    r = {"f0_med": call(pitch, "Get quantile", 0, 0, 0.5, "Hertz"),
         "f0_p20": call(pitch, "Get quantile", 0, 0, 0.2, "Hertz"),
         "f0_p80": call(pitch, "Get quantile", 0, 0, 0.8, "Hertz")}

    # 1 コマずつの高さの一致
    both, cents, eng_only, pr_only = 0, [], 0, 0
    for t, f in zip(c["t"], c["f0"]):
        p = pitch.get_value_at_time(t)
        pv, ev = p == p and p > 0, f > 0
        if pv and ev:
            both += 1
            cents.append(abs(1200 * __import__("math").log2(f / p)))
        elif ev:
            eng_only += 1
        elif pv:
            pr_only += 1
    r["_frames"] = {"both": both, "eng_only": eng_only, "pr_only": pr_only,
                    "cents_med": med(cents), "cents_p99": sorted(cents)[int(len(cents) * .99)] if cents else None,
                    "over100c": sum(1 for x in cents if x > 100)}

    # 高さの選び方のちがいが後ろへ響かないよう、印はエンジンと同じ範囲で Praat の手順のまま打つ
    if c["range"]:
        a, b = c["range"]
        pp = call([snd, pitch], "To PointProcess (cc)")
        r["jit_loc"] = 100 * call(pp, "Get jitter (local)", a, b, 0.0001, 0.02, 1.3)
        r["jit_rap"] = 100 * call(pp, "Get jitter (rap)", a, b, 0.0001, 0.02, 1.3)
        r["shim_loc"] = 100 * call([snd, pp], "Get shimmer (local)", a, b, 0.0001, 0.02, 1.3, 1.6)
        r["shim_db"] = call([snd, pp], "Get shimmer (local_dB)", a, b, 0.0001, 0.02, 1.3, 1.6)
        r["shim_apq3"] = 100 * call([snd, pp], "Get shimmer (apq3)", a, b, 0.0001, 0.02, 1.3, 1.6)

    # HNR: 既定の To Harmonicity (cc) とエンジンに近い (ac)
    for key, h in (("hnr_cc", snd.to_harmonicity_cc(0.01, 75.0, 0.1, 1.0)), ("hnr_ac", snd.to_harmonicity_ac(0.01, 75.0, 0.1, 4.5))):
        r[key] = med([h.get_value(t) for t in voiced])

    # フォルマント: エンジンが選んだ上限でそろえる（Burg のちがいだけを見る）
    fm = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5.0, maximum_formant=float(c["ceiling"]), window_length=0.025, pre_emphasis_from=50.0)
    for i in range(1, 5):
        r[f"F{i}"] = med([fm.get_value_at_time(i, t) for t in voiced])
    for i in range(1, 4):
        r[f"B{i}"] = med([fm.get_bandwidth_at_time(i, t) for t in voiced])
    fm55 = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5.0, maximum_formant=5500.0, window_length=0.025, pre_emphasis_from=50.0)
    for i in range(1, 4):
        r[f"F{i}_5500"] = med([fm55.get_value_at_time(i, t) for t in voiced])
    # To Formant の出力は根を低い順に並べただけで、番号に偽の極が混じる。Praat の Track で番号を付け直したものも比べる
    c0 = float(c["ceiling"]) / 5500
    # 根が 3 つしかないコマがあると 4 本は引けない（無声の所など）ので、そのときは 3 本で
    for tracks in (4, 3):
        try:
            tr = call(fm, "Track", tracks, 550 * c0, 1650 * c0, 2750 * c0, 3850 * c0, 4950 * c0, 1.0, 1.0, 1.0)
        except pm.PraatError:
            continue
        for i in range(1, tracks + 1):
            r[f"T{i}"] = med([tr.get_value_at_time(i, t) for t in voiced])
        break

    # CPPS（Praat の PowerCepstrogram）
    try:
        pc = call(snd, "To PowerCepstrogram", 60.0, 0.002, 5000.0, 50.0)
        r["cpp"] = call(pc, "Get CPPS", True, 0.02, 0.0005, 60.0, 330.0, 0.05, "Parabolic", 0.001, 0.05, "Straight", "Robust")
    except Exception as e:
        r["cpp"] = float("nan")
        r["_cpp_err"] = str(e)[:120]
    return r


KEYS = [("f0_med", "rel"), ("f0_p20", "rel"), ("f0_p80", "rel"),
        ("jit_loc", "abs"), ("jit_rap", "abs"), ("shim_loc", "abs"), ("shim_db", "abs"), ("shim_apq3", "abs"),
        ("hnr", "abs"), ("F1", "rel"), ("F2", "rel"), ("F3", "rel"), ("F4", "rel"), ("T1", "rel"), ("T2", "rel"), ("T3", "rel"), ("T4", "rel"), ("B1", "abs"), ("B2", "abs"), ("B3", "abs"), ("cpp", "abs")]

rows = []
for c in cases:
    p = praat(c)
    p["hnr"] = p["hnr_ac"]
    print("\n== " + c["id"], "ceiling", c["ceiling"], "frames", json.dumps(p["_frames"]))
    if "_cpp_err" in p:
        print("  CPP error:", p["_cpp_err"])
    for k, kind in KEYS:
        if k not in p:
            continue
        e = c["value"].get("F" + k[1] if k[0] == "T" else k)
        if e is None or p[k] != p[k]:
            print(f"  {k:10s} engine {e}  praat {p[k]}")
            continue
        diff = (e - p[k]) / p[k] * 100 if kind == "rel" else e - p[k]
        rows.append((c["id"], k, e, p[k], diff))
        print(f"  {k:10s} engine {e:10.3f}  praat {p[k]:10.3f}  diff {diff:+8.2f}{'%' if kind == 'rel' else ''}")
    print(f"  hnr_cc={p['hnr_cc']:.2f}  F1-3@5500={p['F1_5500']:.0f}/{p['F2_5500']:.0f}/{p['F3_5500']:.0f}")

print("\n--- summary (median |diff|, worst)")
for k, kind in KEYS:
    d = [(abs(r[4]), r[0]) for r in rows if r[1] == k]
    if d:
        w = max(d)
        print(f"{k:10s} n={len(d):2d}  med {statistics.median(x[0] for x in d):7.2f}{'%' if kind == 'rel' else ' '}  worst {w[0]:7.2f} ({w[1]})")
