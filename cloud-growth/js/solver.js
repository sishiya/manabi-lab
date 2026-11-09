// 雲ができるまで — 計算の核（2次元の非弾性の式）。Worker と tools/verify.js で共通
// 変数: u（左の面）・w（下の面）・h（液体・氷の静的エネルギー）・qt（水蒸気＋雲）・qp（雨・雪）
// 手順: 強制 → 運ぶ（方向分割の TVD）→ 温度と雲を出す → 浮力 → 圧力（横 FFT＋縦 三重対角）→ 雨・雪
'use strict';
(function (G) {
  const { g, cp, Rd, Lf, Lv, p00, KAP, diag, qstar, qsw, qsi, omN, omP, LnOf, LpOf } = G.CT;
  const QC0 = 1e-3, QI0 = 1e-4;    // 雨・雪ができはじめる雲の量（水は Kessler、氷は目安）
  const VSNOW = 1.0, VICE = 0.4;   // 雪と雲の氷の落ちる速さ [m/s]（目安・推定）

  function fftPlan(n) {
    const bits = Math.round(Math.log2(n));
    if ((1 << bits) !== n) throw new Error('nx は 2 のべき乗に');
    const rev = new Int32Array(n), cs = new Float64Array(n), sn = new Float64Array(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
    return { n, rev, cs, sn };
  }
  function fft(P, re, im, off, sign) {
    const n = P.n, rev = P.rev;
    for (let i = 0; i < n; i++) { const r = rev[i]; if (r > i) { let t = re[off + i]; re[off + i] = re[off + r]; re[off + r] = t; t = im[off + i]; im[off + i] = im[off + r]; im[off + r] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) for (let j = 0, tw = 0; j < half; j++, tw += step) {
        const c = P.cs[tw], s = sign * P.sn[tw], a = off + i + j, b = a + half;
        const xr = re[b] * c - im[b] * s, xi = re[b] * s + im[b] * c;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }

  function makeSim(cfg) {
    const nx = cfg.nx, nz = cfg.nz, dx = cfg.Lx / nx, dz = cfg.Lz / nz, z0 = cfg.z0 || 0, N = nx * nz, NW = nx * (nz + 1);
    const zc = new Float64Array(nz), zf = new Float64Array(nz + 1);
    for (let k = 0; k <= nz; k++) { zf[k] = z0 + k * dz; if (k < nz) zc[k] = z0 + (k + 0.5) * dz; }

    // 基本の空（静水圧でつみ上げる）
    const pc = new Float64Array(nz), rhoc = new Float64Array(nz), rhof = new Float64Array(nz + 1);
    const T0 = new Float64Array(nz), qv0 = new Float64Array(nz), qn0 = new Float64Array(nz), h0 = new Float64Array(nz), qt0 = new Float64Array(nz), ub = new Float64Array(nz);
    const profOf = (z, p) => {
      const s = cfg.sounding(z, p), pi = Math.pow(p / p00, KAP);
      if (s.thl !== undefined) { const Tl = s.thl * pi; return { T: Tl, qt: s.qt, hT: Tl }; }
      const T = s.theta * pi;
      const qt = s.qv !== undefined ? s.qv : s.rh * qsw(T, p);
      return { T, qt, hT: T };
    };
    const STEP = 2;
    let pS = cfg.ps || 1e5, zS = 0;
    const pAt = new Float64Array(Math.ceil((z0 + cfg.Lz + 200) / STEP) + 2);
    for (let i = 0; i < pAt.length; i++) {
      pAt[i] = pS;
      const pr = profOf(zS, pS), qv = Math.min(pr.qt, qstar(pr.T, pS));
      const Tv = pr.T * (1 + 0.608 * qv);
      pS -= pS * g / (Rd * Tv) * STEP; zS += STEP;
    }
    const pOf = z => { const x = z / STEP, i = Math.min(pAt.length - 2, x | 0), f = x - i; return pAt[i] + (pAt[i + 1] - pAt[i]) * f; };
    for (let k = 0; k < nz; k++) {
      const p = pc[k] = pOf(zc[k]), pr = profOf(zc[k], p);
      qt0[k] = pr.qt; h0[k] = cp * pr.hT + g * zc[k];
      const d = diag(h0[k], qt0[k], 0, zc[k], p, pr.T);
      T0[k] = d.T; qn0[k] = d.qn; qv0[k] = qt0[k] - d.qn;
      rhoc[k] = p / (Rd * T0[k] * (1 + 0.608 * qv0[k] - qn0[k]));
      ub[k] = cfg.wind ? cfg.wind(zc[k]) : 0;
    }
    for (let k = 1; k < nz; k++) rhof[k] = Math.sqrt(rhoc[k - 1] * rhoc[k]);
    rhof[0] = rhoc[0] * rhoc[0] / (rhof[1] || rhoc[0]); rhof[nz] = rhoc[nz - 1] * rhoc[nz - 1] / rhof[nz - 1];

    // 地形（Agnesi の山）: セルをふさぐ。圧力の解き方を保つため速度を 0 にして射影をくり返す
    const mask = new Uint8Array(N), kg = new Int32Array(nx);
    if (cfg.terrain) for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * dx, a = cfg.terrain.a, h = cfg.terrain.h / (1 + Math.pow((x - cfg.terrain.x0) / a, 2));
      for (let k = 0; k < nz; k++) if (zc[k] < z0 + h) { mask[i + k * nx] = 1; kg[i] = k + 1; }
    }

    // 変数
    const u = new Float64Array(N), w = new Float64Array(NW), h = new Float64Array(N), qt = new Float64Array(N), qp = new Float64Array(N);
    const T = new Float64Array(N), qn = new Float64Array(N), qv = new Float64Array(N), buo = new Float64Array(N);
    const rainCol = new Float64Array(nx);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const c = i + k * nx; h[c] = h0[k]; qt[c] = qt0[k]; u[c] = mask[c] ? 0 : ub[k]; T[c] = T0[k]; }

    // 作業用
    const im1 = new Int32Array(nx), im2 = new Int32Array(nx), ip1 = new Int32Array(nx);
    for (let i = 0; i < nx; i++) { im1[i] = (i + nx - 1) % nx; im2[i] = (i + nx - 2) % nx; ip1[i] = (i + 1) % nx; }
    const fxC = new Float64Array(N), fzC = new Float64Array(NW);
    const fxU = new Float64Array(N), fzU = new Float64Array(NW);
    const fxW = new Float64Array(NW), fzW = new Float64Array(nx * (nz + 2));
    const flux = new Float64Array(nx), fluxZ = new Float64Array(nx * (nz + 2));
    const dCell = new Float64Array(NW), tmp = new Float64Array(NW);

    const limiter = (r) => r <= 0 ? 0 : r > 1e12 ? 2 : 2 * r / (1 + r);   // van Leer（r が無限大でも NaN にしない）
    function sweepX(phi, Nr, F, d, dtdx) {
      for (let k = 0; k < Nr; k++) {
        const o = k * nx;
        for (let i = 0; i < nx; i++) {
          const f = F[o + i], m = im1[i];
          let a, b, c0;
          if (f >= 0) { a = phi[o + m]; b = phi[o + i]; c0 = phi[o + im2[i]]; } else { a = phi[o + i]; b = phi[o + m]; c0 = phi[o + ip1[i]]; }
          const dd = b - a, cr = Math.abs(f) / d[o + i] * dtdx, r = dd !== 0 ? (a - c0) / dd : 0;
          flux[i] = f * (a + 0.5 * (1 - cr) * limiter(r) * dd);
        }
        for (let i = 0; i < nx; i++) {
          const p = ip1[i], dOld = d[o + i], dNew = dOld - dtdx * (F[o + p] - F[o + i]);
          tmp[o + i] = (dOld * phi[o + i] - dtdx * (flux[p] - flux[i])) / dNew;
          d[o + i] = dNew;
        }
      }
      for (let c = 0, n = Nr * nx; c < n; c++) phi[c] = tmp[c];
    }
    function sweepZ(phi, Nr, F, d, dtdz) {
      for (let i = 0; i < nx; i++) { fluxZ[i] = 0; fluxZ[Nr * nx + i] = 0; }
      for (let k = 1; k < Nr; k++) {
        const o = k * nx;
        for (let i = 0; i < nx; i++) {
          const f = F[o + i];
          let a, b, c0;
          if (f >= 0) { a = phi[o + i - nx]; b = phi[o + i]; c0 = k >= 2 ? phi[o + i - 2 * nx] : a; } else { a = phi[o + i]; b = phi[o + i - nx]; c0 = k < Nr - 1 ? phi[o + i + nx] : a; }
          const dd = b - a, up = f >= 0 ? o + i - nx : o + i, cr = Math.abs(f) / d[up] * dtdz, r = dd !== 0 ? (a - c0) / dd : 0;
          fluxZ[o + i] = f * (a + 0.5 * (1 - cr) * limiter(r) * dd);
        }
      }
      for (let k = 0; k < Nr; k++) {
        const o = k * nx;
        for (let i = 0; i < nx; i++) {
          const c = o + i, dOld = d[c], dNew = dOld - dtdz * (F[c + nx] - F[c]);
          tmp[c] = (dOld * phi[c] - dtdz * (fluxZ[c + nx] - fluxZ[c])) / dNew;
          d[c] = dNew;
        }
      }
      for (let c = 0, n = Nr * nx; c < n; c++) phi[c] = tmp[c];
    }

    let flip = false;
    function advectOne(phi, Nr, fx, fz, dBase, dtdx, dtdz) {
      for (let k = 0; k < Nr; k++) for (let i = 0; i < nx; i++) dCell[k * nx + i] = dBase[k];
      if (flip) { sweepZ(phi, Nr, fz, dCell, dtdz); sweepX(phi, Nr, fx, dCell, dtdx); }
      else { sweepX(phi, Nr, fx, dCell, dtdx); sweepZ(phi, Nr, fz, dCell, dtdz); }
    }
    function advectAll(dt) {
      const dtdx = dt / dx, dtdz = dt / dz;
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) fxC[k * nx + i] = rhoc[k] * u[k * nx + i];
      for (let k = 0; k <= nz; k++) for (let i = 0; i < nx; i++) fzC[k * nx + i] = rhof[k] * w[k * nx + i];
      // u の箱の面の流れ
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; fxU[c] = 0.5 * (fxC[k * nx + im1[i]] + fxC[c]); }
      for (let k = 0; k <= nz; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; fzU[c] = 0.5 * (fzC[k * nx + im1[i]] + fzC[c]); }
      // w の箱の面の流れ（縦は nz+1 段）
      for (let k = 0; k <= nz; k++) for (let i = 0; i < nx; i++) {
        const c = k * nx + i, lo = k > 0 ? u[c - nx] : u[c], hi = k < nz ? u[c] : u[c - nx];
        fxW[c] = rhof[k] * 0.5 * (lo + hi);
      }
      for (let i = 0; i < nx; i++) { fzW[i] = 0; fzW[(nz + 1) * nx + i] = 0; }
      for (let k = 1; k <= nz; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; fzW[c] = 0.5 * (fzC[c - nx] + fzC[c]); }
      advectOne(h, nz, fxC, fzC, rhoc, dtdx, dtdz);
      advectOne(qt, nz, fxC, fzC, rhoc, dtdx, dtdz);
      advectOne(qp, nz, fxC, fzC, rhoc, dtdx, dtdz);
      advectOne(u, nz, fxU, fzU, rhoc, dtdx, dtdz);
      advectOne(w, nz + 1, fxW, fzW, rhof, dtdx, dtdz);
      for (let c = 0; c < N; c++) { if (qt[c] < 0) qt[c] = 0; if (qp[c] < 0) qp[c] = 0; }
      flip = !flip;
    }

    function diagAll() {
      for (let k = 0; k < nz; k++) {
        const o = k * nx, z = zc[k], p = pc[k], Tb = T0[k], qvb = qv0[k], qnb = qn0[k];
        for (let i = 0; i < nx; i++) {
          const c = o + i;
          const d = diag(h[c], qt[c], qp[c], z, p, T[c]);
          T[c] = d.T; qn[c] = d.qn; qv[c] = qt[c] - d.qn;
          buo[c] = g * ((d.T - Tb) / Tb + 0.608 * (qv[c] - qvb) - (d.qn - qnb) - qp[c]);
        }
      }
    }

    // 圧力: 横 FFT、縦 三重対角
    const P = fftPlan(nx), re = new Float64Array(N), im = new Float64Array(N);
    const cP = new Float64Array(N), dI = new Float64Array(N);  // 三重対角のあらかじめの計算（波数ごと）
    const aL = new Float64Array(nz + 1); for (let k = 0; k <= nz; k++) aL[k] = (k === 0 || k === nz) ? 0 : rhof[k] / (dz * dz);
    for (let m = 0; m < nx; m++) {
      const lam = (2 * Math.cos(2 * Math.PI * m / nx) - 2) / (dx * dx);
      let cPrev = 0;
      for (let k = 0; k < nz; k++) {
        const c = k * nx + m;
        let b = -(aL[k] + aL[k + 1]) + rhoc[k] * lam, cup = aL[k + 1], am = aL[k];
        if (m === 0 && k === 0) { b = 1; cup = 0; am = 0; }  // 平均の圧力は決まらないので下の段を 0 に
        const denom = b - am * cPrev;
        dI[c] = 1 / denom; cP[c] = cup / denom; cPrev = cP[c];
      }
    }
    function project(dt) {
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const c = k * nx + i;
        re[c] = (rhoc[k] * (u[k * nx + ip1[i]] - u[c]) / dx + (rhof[k + 1] * w[c + nx] - rhof[k] * w[c]) / dz) / dt;
        im[c] = 0;
      }
      for (let k = 0; k < nz; k++) fft(P, re, im, k * nx, -1);
      for (let m = 0; m < nx; m++) {
        let pr = 0, pi = 0;
        for (let k = 0; k < nz; k++) {
          const c = k * nx + m, am = (m === 0 && k === 0) ? 0 : aL[k];
          const rr = (m === 0 && k === 0) ? 0 : re[c], ri = (m === 0 && k === 0) ? 0 : im[c];
          re[c] = (rr - am * pr) * dI[c]; im[c] = (ri - am * pi) * dI[c]; pr = re[c]; pi = im[c];
        }
        for (let k = nz - 2; k >= 0; k--) { const c = k * nx + m; re[c] -= cP[c] * re[c + nx]; im[c] -= cP[c] * im[c + nx]; }
      }
      for (let k = 0; k < nz; k++) fft(P, re, im, k * nx, 1);
      for (let c = 0; c < N; c++) re[c] /= nx;
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; u[c] -= dt * (re[c] - re[k * nx + im1[i]]) / dx; }
      for (let k = 1; k < nz; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; w[c] -= dt * (re[c] - re[c - nx]) / dz; }
    }
    function maskVel() {
      if (!cfg.terrain) return;
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const c = k * nx + i;
        if (mask[c] || mask[k * nx + im1[i]]) u[c] = 0;
        if (mask[c]) { w[c] = 0; w[c + nx] = 0; }
      }
    }

    // 雨と雪（Kessler の式。氷は同じ形の目安）
    function micro(dt) {
      for (let k = 0; k < nz; k++) {
        const o = k * nx, p = pc[k], rg = rhoc[k] * 1e-3, pmb = p * 0.01;
        for (let i = 0; i < nx; i++) {
          const c = o + i, qnc = qn[c], qpc = qp[c];
          if ((qnc <= 1e-10 && qpc <= 1e-10) || mask[c]) continue;
          const Tc = T[c], oN = omN(Tc), oP = omP(Tc), ql = oN * qnc, qi = (1 - oN) * qnc, qr = oP * qpc, qs = (1 - oP) * qpc;
          let conv = 0;
          if (ql > 0) conv += (1e-3 * Math.max(0, ql - QC0) + (qr > 1e-10 ? 2.2 * ql * Math.pow(qr, 0.875) : 0) + (cfg.graupel && qs > 1e-10 ? 1.0 * ql * Math.pow(qs, 0.875) : 0)) * dt;   // graupel: 凍った粒が過冷却の水を集める（目安）
          if (qi > 0) conv += (1e-3 * Math.max(0, qi - QI0) + (qs > 1e-10 ? 1.0 * qi * Math.pow(qs, 0.875) : 0)) * dt;
          if (conv > qnc) conv = qnc;
          let evap = 0;
          if (qpc > 1e-10 && qnc <= 0) {
            const qsv = qstar(Tc, p), S = 1 - qv[c] / qsv;
            if (S > 0) {
              const ev = (qq, qsat) => {
                if (qq < 1e-10) return 0;
                const rq = rg * qq, Cv = 1.6 + 124.9 * Math.pow(rq, 0.2046);
                return (1 - qv[c] / qsat) * Cv * Math.pow(rq, 0.525) / (5.4e5 + 2.55e6 / (pmb * qsat)) / rg;
              };
              evap = (Math.max(0, ev(qr, qsw(Tc, p))) + Math.max(0, ev(qs, qsi(Tc, p)))) * dt;
              const limit = Math.min(qpc, 0.5 * (qsv - qv[c]));
              if (evap > limit) evap = limit;
            }
          }
          if (conv > 0 || evap > 0) {
            qp[c] += conv - evap; qt[c] += evap - conv;
            h[c] += (LnOf(Tc) - LpOf(Tc)) * conv;
          }
        }
      }
      // 落ちる（上流の差分。速いときは細かく刻む）
      const sqRef = rhoc[0];
      const qCol = new Float64Array(nz), vCol = new Float64Array(nz + 1);
      for (let i = 0; i < nx; i++) {
        const kb = kg[i];
        let any = false, vmax = 0;
        for (let k = kb; k < nz; k++) {
          const c = k * nx + i, q = qp[c];
          if (q > 1e-10) { any = true; const v = fallSpeed(q, T[c], k); if (v > vmax) vmax = v; }
        }
        if (any) {
          const sub = Math.max(1, Math.ceil(vmax * dt / dz / 0.8)), ds = dt / sub;
          for (let s = 0; s < sub; s++) {
            for (let k = kb; k < nz; k++) { const c = k * nx + i; qCol[k] = qp[c]; vCol[k] = qCol[k] > 1e-10 ? fallSpeed(qCol[k], T[c], k) : 0; }
            vCol[nz] = 0;
            for (let k = kb; k < nz; k++) {
              const c = k * nx + i, Fout = rhoc[k] * qCol[k] * vCol[k], Fin = k + 1 < nz ? rhoc[k + 1] * qCol[k + 1] * vCol[k + 1] : 0;
              const dq = ds * (Fin - Fout) / (rhoc[k] * dz);
              qp[c] += dq; h[c] -= LpOf(T[c]) * dq;
              if (qp[c] < 0) qp[c] = 0;
              if (k === kb) rainCol[i] += ds * Fout;  // 地面に届いた水 [kg/m²]
            }
          }
        }
        // 雲の氷もゆっくり落ちる
        if (cfg.iceFall !== false) {
          let hasIce = false;
          for (let k = kb; k < nz; k++) { const c = k * nx + i; const qi = (1 - omN(T[c])) * qn[c]; qCol[k] = qi; if (qi > 1e-9) hasIce = true; }
          if (hasIce) {
            const sub = Math.max(1, Math.ceil(VICE * dt / dz / 0.8)), ds = dt / sub;
            for (let s = 0; s < sub; s++) for (let k = kb; k < nz; k++) {
              const c = k * nx + i, sq = Math.sqrt(sqRef / rhoc[k]);
              const Fout = k > kb ? rhoc[k] * qCol[k] * VICE * sq : 0;
              const Fin = k + 1 < nz ? rhoc[k + 1] * qCol[k + 1] * VICE * Math.sqrt(sqRef / rhoc[k + 1]) : 0;
              const dq = ds * (Fin - Fout) / (rhoc[k] * dz);
              qt[c] += dq; if (qt[c] < 0) qt[c] = 0;
              h[c] -= LnOf(T[c]) * dq;
              qCol[k] += dq; if (qCol[k] < 0) qCol[k] = 0;
            }
          }
        }
      }
    }
    function fallSpeed(q, Tc, k) {
      const o = omP(Tc), s = Math.sqrt(rhoc[0] / rhoc[k]);
      let v = (1 - o) * VSNOW * s;
      if (cfg.graupel && o < 1) {   // 凍った降水を温度で雪とあられに分ける（SAM の定数。Lin 1983 のあられ）
        const oG = Math.max(0, Math.min(1, (Tc - 223.16) / 60)), m = rhoc[k] * (1 - o) * q;
        v = (1 - o) * s * (oG * 183.2 * Math.pow(oG * m / 5.0265e9, 0.125) + (1 - oG) * 6.684 * Math.pow((1 - oG) * m / 9.4248e8, 0.0625));
      }
      if (o > 0) v += o * 36.34 * Math.pow(rhoc[k] * 1e-3 * o * q, 0.1346) * s;
      return v;
    }

    // 外から加わるもの（地面の熱・放射・上空のスポンジ・風）。ctl はつまみの値
    const ctl = { heat: 0, wind: 1 };
    const heter = new Float64Array(nx);
    if (cfg.seed !== false) {
      // 地面のむら（滑らかなゆらぎ。量は scene ごと）
      let s = cfg.seed || 12345; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let m = 1; m <= 12; m++) { const a = R() * 2 * Math.PI, A = (R() * 2 - 1) / Math.sqrt(m); for (let i = 0; i < nx; i++) heter[i] += A * Math.cos(2 * Math.PI * m * i / nx + a); }
      let mx = 0; for (let i = 0; i < nx; i++) mx = Math.max(mx, Math.abs(heter[i]));
      for (let i = 0; i < nx; i++) heter[i] /= (mx || 1);
    }
    function forcing(dt) {
      const F = cfg.force || {};
      if (F.sfcH !== undefined || F.sfcE !== undefined || ctl.heat) {
        const hs = Math.max(2 * dz, F.hs || 100), fk = []; let fsum = 0;
        for (let k = 0; k < nz; k++) { const f = Math.exp(-(k + 0.5) * dz / hs); if (f < 0.02) break; fk.push(f); fsum += f * dz; }
        const H = (typeof F.sfcH === 'function' ? F.sfcH(S.t) : (F.sfcH || 0)) + 30 * ctl.heat, E = (F.sfcE || 0) + 15 * Math.max(0, ctl.heat), het = F.het === undefined ? 0.3 : F.het;
        for (let i = 0; i < nx; i++) {
          const b = kg[i], fac = 1 + het * heter[i];
          for (let j = 0; j < fk.length && b + j < nz; j++) {
            const c = (b + j) * nx + i, q = fk[j] / (rhoc[b + j] * fsum) * dt * fac;
            h[c] += H * q; qt[c] += E / Lv * q;
          }
        }
      }
      if (F.lw) {  // 雲の上面の放射冷却（雲の水の量で指数的に弱まる簡単な式。推定）
        const { F0, kappa } = F.lw, f = new Float64Array(nz + 1);
        for (let i = 0; i < nx; i++) {
          let lwp = 0, any = false; f[nz] = F0;
          for (let k = nz - 1; k >= kg[i]; k--) { const q = qn[k * nx + i]; if (q > 0) any = true; lwp += rhoc[k] * q * dz; f[k] = F0 * Math.exp(-kappa * lwp); }
          if (!any) continue;
          for (let k = nz - 1; k >= kg[i]; k--) h[k * nx + i] -= dt * (f[k + 1] - f[k]) / (rhoc[k] * dz);
        }
      }
      if (F.wls) {  // 大きな場の上昇（決めて与える）: 上から運ぶぶん。上流差分
        for (let k = 1; k < nz; k++) for (let i = 0; i < nx; i++) {
          const c = k * nx + i, ww = F.wls((i + 0.5) * dx, zc[k], S.t);
          if (ww === 0) continue;
          const kk = ww > 0 ? c - nx : (k + 1 < nz ? c + nx : c);
          h[c] -= dt * ww * (h[c] - h[kk]) / (ww > 0 ? dz : -dz);
          qt[c] -= dt * ww * (qt[c] - qt[kk]) / (ww > 0 ? dz : -dz);
          if (qt[c] < 0) qt[c] = 0;
        }
      }
      // 地面の摩擦
      if (F.cd) for (let i = 0; i < nx; i++) { const c = kg[i] * nx + i; if (kg[i] < nz) u[c] -= dt * F.cd * Math.abs(u[c]) * u[c] / dz; }
      // 平均の風を目標へ
      if (F.windTau) {
        for (let k = 0; k < nz; k++) {
          let m = 0, n = 0; for (let i = 0; i < nx; i++) if (!mask[k * nx + i]) { m += u[k * nx + i]; n++; }
          if (!n) continue;
          const du = (ub[k] * ctl.wind - m / n) * Math.min(1, dt / F.windTau);
          for (let i = 0; i < nx; i++) if (!mask[k * nx + i]) u[k * nx + i] += du;
        }
      }
      // 上のスポンジ（波が天井で跳ね返らないように）
      const top = F.spongeTop || 0;
      if (top > 0) {
        const zb = z0 + cfg.Lz - top;
        for (let k = 0; k < nz; k++) {
          if (zc[k] < zb) continue;
          const f = 0.5 * (1 - Math.cos(Math.PI * (zc[k] - zb) / top)), r = Math.min(1, dt * f / (F.spongeTau || 120));
          for (let i = 0; i < nx; i++) {
            const c = k * nx + i;
            w[c] -= r * w[c]; u[c] += r * (ub[k] * ctl.wind - u[c]); h[c] += r * (h0[k] - h[c]); qt[c] += r * (qt0[k] - qt[c]); qp[c] *= 1 - r;
          }
        }
      }
      // 横のスポンジ（山の場面: 右へ抜けた波と雲が左から入らないように）
      if (F.spongeSide) {
        const L = F.spongeSide;
        for (let i = 0; i < nx; i++) {
          const x = (i + 0.5) * dx, dd = Math.min(x, cfg.Lx - x);
          if (dd > L) continue;
          const f = 0.5 * (1 + Math.cos(Math.PI * dd / L)), r = Math.min(1, dt * f / (F.spongeTau || 120));
          for (let k = 0; k < nz; k++) {
            const c = k * nx + i;
            if (mask[c]) continue;
            w[c] -= r * w[c]; u[c] += r * (ub[k] * ctl.wind - u[c]); h[c] += r * (h0[k] - h[c]); qt[c] += r * (qt0[k] - qt[c]); qp[c] *= 1 - r; qn[c] *= 1 - r;
          }
        }
      }
    }

    let vmax = 1, lastDt = 0;
    function pickDt() {
      let um = 1e-3, wm = 1e-3;
      for (let c = 0; c < N; c++) { const a = Math.abs(u[c]); if (a > um) um = a; }
      for (let c = 0; c < NW; c++) { const a = Math.abs(w[c]); if (a > wm) wm = a; }
      vmax = Math.max(um, wm);
      return Math.min(cfg.dtMax || 3, 0.55 / (um / dx + wm / dz));
    }
    const S = { t: 0 };
    function step(dtForce) {
      const dt = dtForce || pickDt();
      forcing(dt);
      advectAll(dt);
      for (let i = 0; i < nx; i++) { w[i] = 0; w[nz * nx + i] = 0; }
      diagAll();
      for (let k = 1; k < nz; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; w[c] += dt * 0.5 * (buo[c - nx] + buo[c]); }
      maskVel();
      for (let it = 0, n = cfg.terrain ? 3 : 1; it < n; it++) { project(dt); maskVel(); }
      if (cfg.micro !== false) micro(dt);
      S.t += dt; lastDt = dt;
      return dt;
    }

    // 指でなぞる: amount は 中心の 温度[K]／水[kg/kg]
    function paint(xc, zcv, rad, kind, amount, dt) {
      const rx = rad / dx, rz = rad / dz, ix = xc / dx, kz = (zcv - z0) / dz;
      for (let k = Math.max(0, Math.floor(kz - rz * 2)); k < Math.min(nz, Math.ceil(kz + rz * 2)); k++)
        for (let i2 = Math.floor(ix - rx * 2); i2 < Math.ceil(ix + rx * 2); i2++) {
          const i = ((i2 % nx) + nx) % nx, c = k * nx + i;
          if (mask[c]) continue;
          const dd = Math.pow((i2 + 0.5 - ix) / rx, 2) + Math.pow((k + 0.5 - kz) / rz, 2), a = Math.exp(-dd) * dt;
          if (kind === 'wet') qt[c] += amount * a; else h[c] += cp * amount * a;
        }
    }
    function moistenAll(frac, below) {   // 湿りのつまみ: 全水量を割合で増やす
      for (let k = 0; k < nz; k++) { if (zc[k] > below) continue; for (let i = 0; i < nx; i++) qt[k * nx + i] *= 1 + frac; }
    }

    // タイムバーのための保存（必要なぶんだけ Float32 にする）
    function snapshot() {
      const hh = new Float32Array(N), q1 = new Float32Array(N), q2 = new Float32Array(N), uu = new Float32Array(N), ww = new Float32Array(NW);
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; hh[c] = h[c] - h0[k]; q1[c] = qt[c]; q2[c] = qp[c]; uu[c] = u[c]; }
      ww.set(w);
      return { t: S.t, hh, q1, q2, uu, ww, rain: Float32Array.from(rainCol) };
    }
    function restore(s) {
      S.t = s.t;
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; h[c] = s.hh[c] + h0[k]; qt[c] = s.q1[c]; qp[c] = s.q2[c]; u[c] = s.uu[c]; }
      w.set(s.ww); rainCol.set(s.rain);
      diagAll();
    }

    function initBubble(b) {
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const r = Math.hypot(((i + 0.5) * dx - b.x) / b.rx, (zc[k] - b.z) / b.rz);
        if (r >= 1) continue;
        h[k * nx + i] += cp * b.dT * Math.pow(Math.cos(Math.PI * r / 2), 2);
      }
    }
    function addNoise(amp, zTop, seed) {
      let s = seed || 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < nz; k++) { if (zc[k] > zTop) continue; for (let i = 0; i < nx; i++) h[k * nx + i] += cp * amp * (R() * 2 - 1); }
    }
    diagAll();

    return { nx, nz, dx, dz, z0, zc, zf, rhoc, rhof, pc, T0, qv0, qn0, h0, qt0, ub, mask, kg, u, w, h, qt, qp, T, qn, qv, buo, rainCol, S, ctl, step, paint, moistenAll, snapshot, restore, initBubble, addNoise, diagAll, cfg, N, NW, getLastDt: () => lastDt };
  }
  G.makeSim = makeSim;
})(globalThis);
