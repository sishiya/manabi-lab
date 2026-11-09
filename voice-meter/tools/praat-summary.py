import json, re, statistics as st, sys
cur = None; rows = {}; fr = {}
for line in open(sys.argv[1], encoding="utf-8-sig"):
    m = re.match(r"== (\S+) ceiling (\d+) frames (\{.*\})", line)
    if m:
        cur = m[1] if m[1].startswith("file-") else None
        if cur: rows[cur] = {}; fr[cur] = json.loads(m[3].replace("NaN", "null"))
        continue
    m = re.match(r"\s+(\w+)\s+engine\s+(\S+)\s+praat\s+(\S+)\s+diff\s+(\S+?)%?$", line)
    if cur and m:
        rows[cur][m[1]] = (float(m[2]), float(m[3]), float(m[4]))
for kind in ("hold", "talk"):
    ids = [k for k in rows if k.endswith(kind)]
    print(f"\n#### {kind} n={len(ids)}")
    if not ids: continue
    for key in "f0_med f0_p20 f0_p80 jit_loc jit_rap shim_loc shim_db shim_apq3 hnr F1 T1 T2 T3 cpp".split():
        v = sorted((abs(rows[i][key][2]), i) for i in ids if key in rows[i])
        if not v: continue
        sg = [rows[i][key][2] for i in ids if key in rows[i]]
        print(f"{key:9s} n={len(v):2d} med {st.median(x[0] for x in v):7.2f} p90 {v[int(.9*len(v))][0]:7.2f} max {v[-1][0]:7.2f} ({v[-1][1][5:]})  signed-mean {st.mean(sg):+.2f}")
    b = sum(fr[i]["both"] for i in ids); e = sum(fr[i]["eng_only"] for i in ids); p = sum(fr[i]["pr_only"] for i in ids); o = sum(fr[i]["over100c"] for i in ids)
    print(f"frames both {b} eng_only {e} ({100*e/(b+e+p):.1f}%) pr_only {p} ({100*p/(b+e+p):.1f}%) over100c {o} ({100*o/b:.2f}%)")
    print("over100c by file", sorted(((fr[i]["over100c"], i[5:]) for i in ids), reverse=True)[:5])
print("\n#### outliers")
for i, r in rows.items():
    out = []
    if "f0_med" in r and abs(r["f0_med"][2]) > 2: out.append(("f0_med", r["f0_med"]))
    if "jit_loc" in r and abs(r["jit_loc"][2]) > .25: out.append(("jit", r["jit_loc"]))
    if "shim_loc" in r and abs(r["shim_loc"][2]) > 1.5: out.append(("shim", r["shim_loc"]))
    if "hnr" in r and abs(r["hnr"][2]) > 2.5: out.append(("hnr", r["hnr"]))
    for k in ("T1", "T2", "T3"):
        if k in r and abs(r[k][2]) > 12: out.append((k, r[k]))
    if out: print(i[5:], out, fr[i]["both"])
