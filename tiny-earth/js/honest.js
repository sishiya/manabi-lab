// ちいさな地球 — 正直モード（殻を外したら）。空気・海・森の時間の流れを、半径ごとに計算する。
//   空気: 半径方向の1次元の流体の式（重力つき、断熱 γ=1.4）で、殻を外した直後の広がりを計算。
//         重力でとどまる空気は、宇宙へ逃げる速さを式で見つもる（Parker の等温の流れ／Jeans 逃散。Catling & Kasting 2017 の5章）。
//   海: 気圧 < 水の蒸気圧 → 沸く → 蒸発で冷えて凍る → 氷の表面は日光とつりあう温度で昇華（Hertz–Knudsen、蒸発係数 1: Eames ほか 1997）。
//       蒸気圧は Murphy & Koop 2005。深い所は水の重さで沸かず、氷の下に残って上から凍る（熱伝導）。
'use strict';
const HONEST = (() => {
  const kB = 1.380649e-23, u = 1.66054e-27;
  const T0 = 288.15, P0 = 101325, GAM = 1.4;
  const mA = 28.97 * u, mW = 18.015 * u;
  const cIso2 = kB * T0 / mA;                 // 等温の音速の2乗
  const SIG = Math.PI * (3.64e-10) ** 2;      // 窒素分子の衝突の断面積（分子の直径 0.364 nm）
  const RHO_W = 1000, RHO_I = 917, CW = 4186, LF = 3.34e5, LV = 2.50e6, LS = 2.834e6, KICE = 2.2;
  const S0 = 1361, ALB = 0.5, EPS = 0.97, SB = 5.670374e-8;   // 太陽定数（Kopp & Lean 2011）・氷のアルベド（推定）

  // 飽和蒸気圧 Pa（Murphy & Koop 2005）
  function pIce(T) { return Math.exp(9.550426 - 5723.265 / T + 3.53068 * Math.log(T) - 0.00728332 * T); }
  function pLiq(T) {
    return Math.exp(54.842763 - 6763.22 / T - 4.21 * Math.log(T) + 0.000367 * T
      + Math.tanh(0.0415 * (T - 218.8)) * (53.878 - 1331.22 / T - 9.44523 * Math.log(T) + 0.014025 * T));
  }
  // 真空への蒸発・昇華の速さ kg/m²/s（Hertz–Knudsen、蒸発係数 1）
  const hk = (p, T) => p * Math.sqrt(mW / (2 * Math.PI * kB * T));
  const PV15 = pLiq(T0);

  // ---------- 空気 ----------
  function air(R, P) {
    const g = P.g, lam = g * R / cIso2, Rs = 1.25 * R, D = Rs - R, c0 = Math.sqrt(GAM * kB * T0 / mA);
    const res = { lam, Rs, samples: [], note: '' };
    const n0 = P0 / (kB * T0);
    // 宇宙へ逃げる速さの見つもり（長い時間）: 等温の大気の外圏底と音速点をくらべる
    const rs = lam * R / 2;                                 // 音速点
    let rx = 0;
    for (let r = R; r < 1e3 * R; r *= 1.002) { const n = n0 * Math.exp(lam * (R / r - 1)), H = r * r / (lam * R); if (n * SIG * H < 1) { rx = r; break; } }
    // 殻の中の空気の分子の数
    let Ntot = 0; { const nr = 400; for (let k = 0; k < nr; k++) { const r = R + (k + 0.5) / nr * D; Ntot += n0 * Math.exp(lam * (R / r - 1)) * 4 * Math.PI * r * r * D / nr; } }
    if (lam > 2 && rx && rx < rs) {
      const lx = lam * R / rx, nx = n0 * Math.exp(lam * (R / rx - 1)), v0 = Math.sqrt(2 * kB * T0 / mA);
      const rate = 4 * Math.PI * rx * rx * nx * v0 / (2 * Math.sqrt(Math.PI)) * (1 + lx) * Math.exp(-lx);
      res.tauEsc = Ntot / rate; res.mode = 'jeans';
    } else if (lam > 2) {
      const rate = 4 * Math.PI * rs * rs * n0 * Math.sqrt(cIso2) * Math.exp(1.5 - lam);
      res.tauEsc = Ntot / rate; res.mode = 'parker';
    } else { res.tauEsc = 0; res.mode = 'blowoff'; }

    // λ が大きい星は、空気が重力でとどまっていて殻を外しても急には変わらない。流体の計算もいらない
    // （この簡単な解き方は、成層したしずかな大気でもゆっくり温まって崩れてしまうので使わない。ハマったところ）
    if (lam > 5) {
      res.samples = [[0, 1, 1, T0]]; res.tEnd = 0; return res;
    }
    // 1次元の流体（球の半径方向）。格子は地面の近くほど細かい
    const N = 240, Lout = D * 60, dr0 = D / 120;
    let qa = 1.000001, qb = 1.2, q = 1.01;   // 間隔の伸び率 q を二分法で（Σ dr0·q^i = Lout）
    for (let it = 0; it < 80; it++) { q = 0.5 * (qa + qb); if (dr0 * (Math.pow(q, N) - 1) / (q - 1) > Lout) qb = q; else qa = q; }
    const rf = new Float64Array(N + 1); rf[0] = R; for (let i = 0; i < N; i++) rf[i + 1] = rf[i] + dr0 * Math.pow(q, i);
    const V = new Float64Array(N), A = new Float64Array(N + 1), rc = new Float64Array(N), gc = new Float64Array(N);
    for (let i = 0; i <= N; i++) A[i] = rf[i] * rf[i];
    for (let i = 0; i < N; i++) { V[i] = (rf[i + 1] ** 3 - rf[i] ** 3) / 3; rc[i] = 0.5 * (rf[i] + rf[i + 1]); gc[i] = g * R * R / (rc[i] * rc[i]); }
    const rho0 = P0 * mA / (kB * T0), rmin = 1e-14 * rho0, pmin = 1e-14 * P0;
    const d = new Float64Array(N), m = new Float64Array(N), E = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const inside = rc[i] < Rs, f = inside ? Math.exp(lam * (R / rc[i] - 1)) : 1e-12;
      d[i] = Math.max(rmin, rho0 * f); E[i] = Math.max(pmin, P0 * f) / (GAM - 1);
    }
    const M0 = mass(); function mass() { let s = 0; for (let i = 0; i < N; i++) if (rc[i] < 2 * Rs) s += d[i] * V[i]; return s; }
    const Fd = new Float64Array(N + 1), Fm = new Float64Array(N + 1), FE = new Float64Array(N + 1), pr = new Float64Array(N), vel = new Float64Array(N);
    let t = 0, steps = 0, nextS = 1e-4 * D / c0;
    const tMax = 200 * D / c0;
    res.samples.push([0, 1, 1, T0]);
    while (t < tMax && steps < 300000) {
      let dt = Infinity;
      for (let i = 0; i < N; i++) {
        vel[i] = m[i] / d[i]; pr[i] = Math.max(pmin, (GAM - 1) * (E[i] - 0.5 * m[i] * vel[i]));
        const c = Math.sqrt(GAM * pr[i] / d[i]); dt = Math.min(dt, (rf[i + 1] - rf[i]) / (Math.abs(vel[i]) + c));
      }
      dt *= 0.4;
      // 面の流れ（HLL）
      Fd[0] = 0; Fm[0] = pr[0]; FE[0] = 0;               // 地面は壁
      Fd[N] = m[N - 1]; Fm[N] = m[N - 1] * vel[N - 1] + pr[N - 1]; FE[N] = (E[N - 1] + pr[N - 1]) * vel[N - 1];   // 外は流れ出る
      for (let f = 1; f < N; f++) {
        const L = f - 1, Rr = f;
        const cl = Math.sqrt(GAM * pr[L] / d[L]), cr = Math.sqrt(GAM * pr[Rr] / d[Rr]);
        const sl = Math.min(vel[L] - cl, vel[Rr] - cr), sr = Math.max(vel[L] + cl, vel[Rr] + cr);
        const fdl = m[L], fml = m[L] * vel[L] + pr[L], fel = (E[L] + pr[L]) * vel[L];
        const fdr = m[Rr], fmr = m[Rr] * vel[Rr] + pr[Rr], fer = (E[Rr] + pr[Rr]) * vel[Rr];
        if (sl >= 0) { Fd[f] = fdl; Fm[f] = fml; FE[f] = fel; }
        else if (sr <= 0) { Fd[f] = fdr; Fm[f] = fmr; FE[f] = fer; }
        else {
          const k = 1 / (sr - sl);
          Fd[f] = (sr * fdl - sl * fdr + sl * sr * (d[Rr] - d[L])) * k;
          Fm[f] = (sr * fml - sl * fmr + sl * sr * (m[Rr] - m[L])) * k;
          FE[f] = (sr * fel - sl * fer + sl * sr * (E[Rr] - E[L])) * k;
        }
      }
      for (let i = 0; i < N; i++) {
        const iv = dt / V[i];
        d[i] += iv * (A[i] * Fd[i] - A[i + 1] * Fd[i + 1]);
        m[i] += iv * (A[i] * Fm[i] - A[i + 1] * Fm[i + 1]) + dt * (pr[i] * (A[i + 1] - A[i]) / V[i] - d[i] * gc[i]);
        E[i] += iv * (A[i] * FE[i] - A[i + 1] * FE[i + 1]) - dt * m[i] * gc[i];
        if (d[i] < rmin) { d[i] = rmin; m[i] = 0; }
        const ke = 0.5 * m[i] * m[i] / d[i]; if (E[i] - ke < pmin / (GAM - 1)) E[i] = ke + pmin / (GAM - 1);
      }
      t += dt; steps++;
      if (t >= nextS) {
        res.samples.push([t, pr[0] / P0, mass() / M0, pr[0] / d[0] * mA / kB]);   // 地面の近くの空気の温度も
        nextS *= 1.12;
        if (pr[0] < 1e-6 * P0 && t > 5 * D / c0) break;
      }
    }
    res.tEnd = t; res.steps = steps;
    const last = res.samples[res.samples.length - 1];
    res.endP = last[1]; res.endM = last[2]; res.endT = last[3];
    return res;
  }
  // 時刻 t の地面の気圧（1気圧との比）と、残っている空気の割合
  function airAt(A, t) {
    const s = A.samples;
    if (A.tEnd === 0) return decay(A, 1, 1, t, T0);      // 流体の計算をしない星（空気がとどまる。温度は 15℃ のまま）
    if (t <= A.tEnd) {
      if (t <= 0) return { p: 1, m: 1, T: T0 };
      let k = 1; while (k < s.length && s[k][0] < t) k++;
      if (k >= s.length) k = s.length - 1;
      const a = s[k - 1], b = s[k], f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 1;
      return { p: a[1] + (b[1] - a[1]) * f, m: a[2] + (b[2] - a[2]) * f, T: a[3] + (b[3] - a[3]) * f };
    }
    // 流体の計算の後: 吹き飛ぶ星は 3次元の自由な広がり（密度 ∝ t⁻³）、とどまる星は逃げる速さで減る
    // 断熱で広がる気体の温度 ∝ 密度^(γ−1) ∝ t^(−3·0.4)
    if (A.mode === 'blowoff') return { p: A.endP * (A.tEnd / t) ** 3, m: A.endM * (A.tEnd / t) ** 3, T: A.endT * (A.tEnd / t) ** 1.2 };
    return decay(A, A.endP, A.endM, t - A.tEnd, A.endT);
  }
  function decay(A, p, m, dt, T) { if (!(A.tauEsc > 0) || dt <= 0) return { p, m, T }; const f = Math.exp(-dt / A.tauEsc); return { p: p * f, m: m * f, T }; }

  // ---------- 海（深さ d の水の柱ひとつ） ----------
  // 返す: 時刻の列 ts と、そのときの 液体 L・氷 I（m、水の厚さに直したもの）・沸いているか・表面温度
  function column(d, g, A, tGrid) {
    let L = d, I = 0, T = T0, boiling = false;   // 沸いている層の温度 T
    const out = [];
    let t = 0;
    const qAbs = S0 * (1 - ALB) / 4;   // 一日・緯度でならした日光（推定）
    let Ts = T0;
    for (const tn of tGrid) {
      while (t < tn) {
        const pa = airAt(A, t).p * P0;
        let dt = tn - t;
        if (L + I <= 1e-9 * d) { L = 0; I = 0; t = tn; break; }
        if (I <= 0 && pa >= pLiq(T)) { t = tn; break; }                       // 空気があるうちは沸かない
        if (I <= 0 || boiling) {
          // 沸く層: 水の重さによる圧力が蒸気圧より小さい深さまで
          boiling = true;
          const db = Math.min(L, Math.max(0, (pLiq(T) - pa) / (RHO_W * g)));
          const J = hk(pLiq(Math.max(T, 273.15)), Math.max(T, 273.15));
          if (T > 273.15) {
            const mb = Math.max(1e-6, RHO_W * db), dTdt = -J * LV / (mb * CW);
            dt = Math.min(dt, Math.max(1e-6, 0.5 / -dTdt), 0.02 * mb / J + 1e-6);
            T += dTdt * dt; L -= J * dt / RHO_W;
            if (T < 273.15) T = 273.15;
          } else {
            // 0℃ で沸きながら凍る: 蒸発の熱で凍らせる
            const frz = J * LV / LF;                                         // 凍る速さ kg/m²/s
            const left = RHO_W * db - I * RHO_W;
            if (left <= 0 || db <= 0) { boiling = false; Ts = 273.15; continue; }
            dt = Math.min(dt, 0.05 * left / frz + 1e-6);
            L -= (frz + J) * dt / RHO_W; I += frz * dt / RHO_W;
            if (L < 0) L = 0;
          }
          t += dt; continue;
        }
        // 氷の面: 日光 ＝ 放射 ＋ 昇華 ＋（下に水があれば）氷を通って上がる熱 のつりあいで表面温度 Ts
        const sIce = I * RHO_W / RHO_I;                                      // 氷の本当の厚さ
        const kc = L > 0 ? KICE / Math.max(sIce, 1e-3) : 0;
        let lo = 30, hi = 273.15;
        for (let it = 0; it < 50; it++) {
          const mid = 0.5 * (lo + hi), f = qAbs + kc * (273.15 - mid) - EPS * SB * mid ** 4 - LS * hk(pIce(mid), mid);
          if (f > 0) lo = mid; else hi = mid;
        }
        Ts = 0.5 * (lo + hi);
        const Js = hk(pIce(Ts), Ts), frz = L > 0 ? kc * (273.15 - Ts) / LF : 0;
        dt = Math.min(dt, 0.02 * (I * RHO_W) / (Js + 1e-30) + 1e-3, L > 0 ? 0.02 * (L * RHO_W) / (frz + 1e-30) + 1e-3 : Infinity, 0.05 * Math.max(t, 1) + 1e-3);
        I += (frz - Js) * dt / RHO_W; L -= frz * dt / RHO_W;
        if (L < 0) L = 0; if (I < 0) I = 0;
        t += dt;
      }
      out.push([L, I, boiling ? 1 : 0, boiling ? T : (I > 0 ? Ts : T)]);
    }
    return out;
  }

  // ---------- まとめ ----------
  function build(R, P, H0) {
    const A = air(R, P);
    // 時刻の格子（対数）
    const tMin = 0.01, tMax = 3e13;
    const tGrid = []; for (let k = 0; k <= 300; k++) tGrid.push(tMin * Math.pow(tMax / tMin, k / 300));
    // 深さの種類（平均の深さの 2%〜4倍）
    const depths = []; for (let k = 0; k < 14; k++) depths.push(H0 * 0.02 * Math.pow(200, k / 13));
    const cols = depths.map(dd => column(dd, P.g, A, tGrid));
    // 出来事の時刻
    const ev = [];
    const pAt = t => airAt(A, t).p;
    const first = f => { for (let k = 0; k < tGrid.length; k++) if (f(k)) return tGrid[k]; return null; };
    const t1 = first(k => pAt(tGrid[k]) < 0.01);
    if (t1) ev.push([t1, '地面の気圧が 1% より下がる（空気がほとんど逃げた）']);
    const tb = first(k => pAt(tGrid[k]) * P0 < PV15);
    if (tb) ev.push([tb, '海が沸きはじめる（気圧が水の蒸気圧 ' + Math.round(PV15) + ' Pa より下がった）']);
    const Mo0 = { tGrid, depths, cols }, mid = k => colAt(Mo0, H0, tGrid[k]);
    const ti = first(k => mid(k)[1] > 0 && mid(k)[2] === 0);
    if (ti) ev.push([ti, '沸いた水の表面が凍る（蒸発で熱をうばわれる）']);
    const tg0 = first(k => cols[0][k][0] + cols[0][k][1] <= 0);
    if (tg0) ev.push([tg0, '浅い海（平均の深さの 2%）が消える（氷が昇華）']);
    const tgm = first(k => { const c = mid(k); return c[0] + c[1] <= 1e-6 * H0; });
    if (tgm) ev.push([tgm, '平均の深さの海が消える']);
    const tgl = first(k => cols[13][k][0] + cols[13][k][1] <= 0);
    if (tgl) ev.push([tgl, 'いちばん深い海も消える']);
    let tEnd = Math.max(t1 || 0, tgl || tgm || 0);
    if (!tEnd) tEnd = A.tauEsc ? Math.min(tMax, A.tauEsc * 3) : 1e9;
    return { A, tGrid, depths, cols, ev, tEnd: Math.max(10, tEnd * 3), H0, R };
  }
  // 時刻 t・深さ d の柱の状態
  function colAt(Mo, d, t) {
    const lg = Math.log(Mo.tGrid[0]), span = Math.log(Mo.tGrid[Mo.tGrid.length - 1]) - lg, n = Mo.tGrid.length - 1;
    if (t <= Mo.tGrid[0]) return [d, 0, 0, T0];
    const x = Math.min(n, (Math.log(t) - lg) / span * n), k = Math.min(n - 1, Math.floor(x)), f = x - k;
    const ds = Mo.depths, dl = Math.log(Math.max(d, ds[0])) , d0 = Math.log(ds[0]), dspan = Math.log(ds[ds.length - 1]) - d0;
    const y = Math.max(0, Math.min(ds.length - 1, (dl - d0) / dspan * (ds.length - 1))), j = Math.min(ds.length - 2, Math.floor(y)), h = y - j;
    const v = (jj) => { const a = Mo.cols[jj][k], b = Mo.cols[jj][k + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, f < 0.5 ? a[2] : b[2], a[3] + (b[3] - a[3]) * f]; };
    const a = v(j), b = v(j + 1), sc = d / (ds[j] * (1 - h) + ds[j + 1] * h);
    return [(a[0] * (1 - h) + b[0] * h) * sc, (a[1] * (1 - h) + b[1] * h) * sc, h < 0.5 ? a[2] : b[2], a[3] * (1 - h) + b[3] * h];
  }
  // 柱の状態 [液体, 氷, 沸く, 温度] → 表面から蒸発・昇華する速さ kg/m²/s（空気がまだあって沸かない水は 0 とする）
  function flux(c) {
    if (c[2]) { const T = Math.max(c[3], 273.15); return hk(pLiq(T), T); }
    if (c[1] > 0) return hk(pIce(c[3]), c[3]);
    return 0;
  }
  return { build, airAt, colAt, flux, pIce, pLiq, PV15, T0, P0 };
})();
