#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
帆船が風で進むしくみ: 力の表を Python-VPP（M. Lauber ほか、MIT）の式そのもので作る。

アプリは「速さ V・本当の風の角度 TWA・風速 TWS」ごとの
  前へ進む力の余り Fnet = 帆の駆動力 − 船体の抵抗（N）
を表から引いて、m(1+k) dV/dt = Fnet で時間を進める。
各点では、傾き φ・横流れ λ・帆の平らさ flat・リーフ red を動かして、
横の力と傾けるモーメントのつりあいを保ったまま Fnet が最大になる調整を選ぶ
（Python-VPP の VPP が「つりあいの中で速さ最大」を解くのと同じ選び方。Fnet = 0 の速さが VPP の答え）。
横流れの上限（6°）の中で横の力がつりあわない遅い速さでは、横の力のつりあいを外して λ = 6° とし、ok = 0 を記録する
（実際は横へ流される。アプリでは「横に流される」と出す）。

使い方（Python-VPP を入れた Python で。sail-wind/ で）:
  python tools/build-table.py            → data/yd41-orc.bin・data/yd41-push.bin・data/yd41.json
  python tools/build-table.py --ref      → tools/ref-vpp.json（verify.js の答え合わせの基準）
Python-VPP: https://github.com/marinlauber/Python-VPP （このアプリでは commit 141ea66 で作った）
"""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

from python_vpp.AeroMod import AeroMod
from python_vpp.HydroMod import HydroMod
from python_vpp.SailMod import Jib, Main
from python_vpp.VPPMod import VPP, FLAT_MIN, RESID_SCALE
from python_vpp.YachtMod import Keel, Rudder, Yacht

KN = 0.5144
ROOT = Path(__file__).resolve().parent.parent

TWS_KN = np.arange(4.0, 20.1, 2.0)        # 4〜20 kt（9）
TWA = np.arange(0.0, 180.1, 5.0)          # 0〜180°（37）
V_KN = np.arange(0.0, 13.01, 0.5)         # 0〜13 kt（27）
PHI_MAX = 35.0
LEEWAY_MAX = 6.0
# 押されるだけの帆（仮想）: 揚力 0、抗力は ORC の表の 180°（主帆 1.34483、ジブ 0.90）を全部の向きで
PUSH_CD = {"main": 1.34483, "jib": 0.90}

CHANNELS = ["fnet", "lift", "drag", "heel", "leeway", "keel", "awa", "aws", "ok"]


def make_yacht(mode):
    """runVPP.py の YD-41（主帆＋ジブだけ）。"""
    if mode == "push":
        a = [0.0, 60.0, 120.0, 180.0]
        main_kw = dict(cl_data={"awa": a, "values": [0.0] * 4}, cd_data={"awa": a, "values": [PUSH_CD["main"]] * 4})
        jib_kw = dict(cl_data={"awa": a, "values": [0.0] * 4}, cd_data={"awa": a, "values": [PUSH_CD["jib"]] * 4})
    else:
        main_kw, jib_kw = {}, {}
    return Yacht(
        Name="YD41", Lwl=11.90, Vol=6.05, Bwl=3.18, Tc=0.4, WSA=28.20, Tmax=2.30, Amax=1.051,
        Mass=6500, Ff=1.5, Fa=1.5, Boa=4.2, Loa=12.5,
        App=[Keel(Cu=1.00, Cl=0.78, Span=1.90), Rudder(Cu=0.48, Cl=0.22, Span=1.15)],
        Sails=[Main("MN1", P=16.60, E=5.60, Roach=0.1, BAD=1.0, **main_kw),
               Jib("J1", I=16.20, J=5.10, LPG=5.40, HBI=1.8, **jib_kw)],

    )


def state(aero, hydro, vb, tws, twa, x):
    phi, lee, flat, red = x
    Fxh, Fyh, Mxh = hydro.update(vb, phi, lee, twa, tws)
    Fxa, Fya, Mxa = aero.update(vb, phi, tws, twa, flat, red)
    return Fxa - Fxh, (Fyh - Fya) / RESID_SCALE[1], (Mxh - Mxa) / RESID_SCALE[2], Fyh


def solve(aero, hydro, vb, tws, twa, guesses):
    """つりあいの中で Fnet 最大。だめなら λ = 上限で傾きだけつりあわせる（ok = 0）。"""
    bounds = [(0.0, PHI_MAX), (-2.0, LEEWAY_MAX), (FLAT_MIN, 1.0), (0.5, 2.0)]
    best = None
    for x0 in guesses:
        sol = minimize(lambda x: -state(aero, hydro, vb, tws, twa, x)[0] / 1e3, x0, method="SLSQP", bounds=bounds,
                       constraints=[{"type": "eq", "fun": lambda x: state(aero, hydro, vb, tws, twa, x)[1]},
                                    {"type": "eq", "fun": lambda x: state(aero, hydro, vb, tws, twa, x)[2]}],
                       options={"maxiter": 300, "ftol": 1e-10})
        if not sol.success:
            continue
        f, ry, rm, _ = state(aero, hydro, vb, tws, twa, sol.x)
        if max(abs(ry), abs(rm)) > 1e-4:
            continue
        if best is None or f > best[0]:
            best = (f, sol.x)
    balanced = best
    # 遅いときは、横の力をつりあわせるために帆を大きくゆるめる解しかないことがある。実際の船は横へ流されながら
    # 帆いっぱいで加速するので、λ = 上限・傾きのモーメントだけつりあわせた解（ok = 0）と比べて、前へ進む力の大きいほうをとる。
    b2 = [(0.0, PHI_MAX), (FLAT_MIN, 1.0), (0.5, 2.0)]
    full = lambda y: np.array([y[0], LEEWAY_MAX, y[1], y[2]])
    best = None
    for y0 in ([10.0, 1.0, 2.0], [25.0, 0.8, 1.5]):
        sol = minimize(lambda y: -state(aero, hydro, vb, tws, twa, full(y))[0] / 1e3, y0, method="SLSQP", bounds=b2,
                       constraints=[{"type": "eq", "fun": lambda y: state(aero, hydro, vb, tws, twa, full(y))[2]}],
                       options={"maxiter": 300, "ftol": 1e-10})
        if not sol.success:
            continue
        f, _, rm, _ = state(aero, hydro, vb, tws, twa, full(sol.x))
        if abs(rm) > 1e-4:
            continue
        if best is None or f > best[0]:
            best = (f, full(sol.x))
    if balanced is not None and (best is None or balanced[0] >= best[0]):
        return balanced[1], 1
    if best is None:
        # 風上すぎ・風が強すぎて傾きのモーメントもつりあわない（傾き・リーフが上限）。モーメントの残りがいちばん小さい調整をとる
        sol = minimize(lambda y: state(aero, hydro, vb, tws, twa, full(y))[2] ** 2, [PHI_MAX, FLAT_MIN, 0.5],
                       method="L-BFGS-B", bounds=b2)
        print(f"モーメントがつりあわない: V={vb / KN:.1f} kt TWS={tws / KN:.0f} kt TWA={twa:.0f}", flush=True)
        return full(sol.x), 0
    return best[1], 0


def row(args):
    mode, i_tws = args
    yacht = make_yacht(mode)
    aero, hydro = AeroMod(yacht), HydroMod(yacht)
    tws = TWS_KN[i_tws] * KN
    out = np.zeros((len(TWA), len(V_KN), len(CHANNELS)))
    for j, twa in enumerate(TWA):
        prev = None
        for k, vkn in enumerate(V_KN):
            vb = vkn * KN
            guesses = [np.array([10.0, 3.0, 1.0, 2.0]), np.array([25.0, 4.0, 0.7, 1.2]), np.array([2.0, 1.0, 1.0, 2.0])]
            if prev is not None:
                guesses.insert(0, prev)
            x, ok = solve(aero, hydro, vb, tws, twa, guesses)
            if ok:
                prev = x
            f, _, _, fyh = state(aero, hydro, vb, tws, twa, x)
            out[j, k] = [f, aero.lift, aero.drag, x[0], x[1], fyh, aero.awa, aero.aws, ok]
    print(f"{mode} TWS {TWS_KN[i_tws]:.0f} kt done", flush=True)
    return mode, i_tws, out


def build():
    jobs = [(m, i) for m in ("orc", "push") for i in range(len(TWS_KN))]
    res = {m: np.zeros((len(TWS_KN), len(TWA), len(V_KN), len(CHANNELS))) for m in ("orc", "push")}
    with ProcessPoolExecutor() as pool:
        for mode, i, out in pool.map(row, jobs):
            res[mode][i] = out
    meta = {"source": "Python-VPP (M. Lauber et al., MIT) commit 141ea66, YD-41 main+jib",
            "tws_kn": TWS_KN.tolist(), "twa": TWA.tolist(), "v_kn": V_KN.tolist(),
            "channels": CHANNELS, "layout": "int16 [tws][twa][v][channel], value = q * scale[channel]",
            "units": {"fnet": "N", "lift": "N", "drag": "N", "heel": "deg", "leeway": "deg", "keel": "N",
                      "awa": "deg", "aws": "m/s", "ok": "1 = all balanced, 0 = side force not balanced"},
            "mass": 6500, "push_cd": PUSH_CD, "scale": {}}
    (ROOT / "data").mkdir(exist_ok=True)
    for m in ("orc", "push"):
        a = res[m]
        scale = [float(max(np.abs(a[..., c]).max(), 1e-9) / 32000.0) for c in range(len(CHANNELS))]
        q = np.round(a / np.array(scale)).astype("<i2")
        (ROOT / "data" / f"yd41-{m}.bin").write_bytes(q.tobytes())
        meta["scale"][m] = scale
    (ROOT / "data" / "yd41.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")


def ref():
    """答え合わせの基準: Python-VPP の VPP そのもの（主帆＋ジブ）で定常の速さ。"""
    vpp = VPP(Yacht=make_yacht("orc"))
    tws = np.array([4.0, 6.0, 10.0, 16.0])
    twa = np.arange(40.0, 180.1, 10.0)
    vpp.set_analysis(tws_range=tws, twa_range=twa)
    vpp.run()
    vb = vpp.store[:, :, 0, 0]  # kt
    (ROOT / "tools" / "ref-vpp.json").write_text(json.dumps(
        {"source": "Python-VPP commit 141ea66 VPP.run, YD-41 main+jib, phi_max 35",
         "tws_kn": tws.tolist(), "twa": twa.tolist(), "vb_kn": np.round(vb, 4).tolist()}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    ref() if "--ref" in sys.argv else build()
