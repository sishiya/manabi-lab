// 雲ができるまで（3次元の試作）— 計算の確かめ。sky.html#verify で動く。window.__skyVerify に結果
import { SkySim, makeBase, S0 } from './sky-sim.js';

const { cp, g, diag, qstar, LnOf, LpOf } = globalThis.CT;
const SCENE = globalThis.CS.SCENES.find(s => s.id === 'cumulus');

export async function runVerify(dev, log) {
  const out = {}, base = makeBase(SCENE, 100, 4000);
  const mk = (over) => new SkySim(dev, { nx: 64, ny: 64, dx: 50, dy: 50, base, ...over });
  const flush = () => dev.queue.onSubmittedWorkDone();

  // ① 温度と雲: GPU の diag と CT.diag（CPU）を、飽和・未飽和をまぜた値で比べる
  {
    const s = mk({}), n = s.n, nx = s.nx, ny = s.ny, nz = s.nz;
    const S = new Float32Array(n), Q = new Float32Array(n);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = i + nx * (j + ny * k);
      S[c] = base.h0[k] / cp - S0 + (i / nx - 0.5) * 3;
      Q[c] = base.qt0[k] * (0.9 + 0.6 * j / ny);
    }
    dev.queue.writeBuffer(s.f.S, 0, S); dev.queue.writeBuffer(s.f.Q, 0, Q);
    s._setP(1);
    const enc = dev.createCommandEncoder(); s.diagOnly(enc); dev.queue.submit([enc.finish()]);
    await flush();
    const qn = await s.read(s.f.Qn, n * 4);
    let e = 0, nsat = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j += 7) for (let i = 0; i < nx; i += 7) {
      const c = i + nx * (j + ny * k), d = diag((S[c] + S0) * cp, Q[c], 0, base.zc[k], base.pc[k], base.T0[k]);
      if (d.qn > 0) nsat++;
      e = Math.max(e, Math.abs(d.qn - Math.max(0, qn[c])));
    }
    out.diag = { qnErrMax_gkg: e * 1e3, saturatedSamples: nsat };
    log('① 雲の量の差（g/kg）: ' + (e * 1e3).toExponential(2) + ' / 飽和の点 ' + nsat);
  }

  // ② 静止大気: 何も与えないと動かない
  {
    const s = mk({});
    for (let i = 0; i < 100; i++) { s.step(2); if (i % 10 === 9) await flush(); }
    await flush();
    const st = await s.stats();
    out.still = st;
    log('② 静止大気の最大の速さ（100歩後）: w ' + st.wm.toExponential(2) + '、u ' + st.um.toExponential(2) + ' m/s');
  }

  // ③ 暖気塊: 水・エネルギーの保存と、2次元の本編との一致（奥行き一様）
  {
    const nx = 256, nz = 100, Lx = nx * 50, cfg = { ...SCENE, nx, Lx, nz, Lz: 4000, seed: false, micro: false, force: {}, wind: () => 0 };
    const cpu = globalThis.makeSim(cfg);
    const bub = { x: Lx / 2, z: 800, rx: 1500, rz: 800, dT: 3 };
    cpu.initBubble(bub); cpu.diagAll();
    const s = new SkySim(dev, { nx, ny: 4, dx: 50, dy: 50, base: makeBase({ ...SCENE, wind: () => 0 }, nz, 4000) });
    s.reset((S, Q, U, c) => {
      for (let k = 0; k < nz; k++) for (let j = 0; j < 4; j++) for (let i = 0; i < nx; i++) {
        const r = Math.hypot(((i + 0.5) * 50 - bub.x) / bub.rx, (cpu.zc[k] - bub.z) / bub.rz);
        if (r < 1) S[c(i, j, k)] += bub.dT * Math.pow(Math.cos(Math.PI * r / 2), 2);
      }
    });
    const sumMass = (a) => { let m = 0; for (let k = 0; k < nz; k++) { let t = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < nx; i++) t += a[i + nx * (j + 4 * k)]; m += t * base.rhoc[k]; } return m; };
    const q0 = sumMass(await s.read(s.f.Q, s.n * 4)), s0 = sumMass(await s.read(s.f.S, s.n * 4));
    const rows = [];
    for (let i = 1; i <= 900; i++) {
      s.step(1); cpu.step(1);
      if (i % 20 === 0) await flush();
      if (i % 300 === 0) {
        await flush();
        const [W, Qn] = [await s.read(s.f.W, s.n * 4), await s.read(s.f.Qn, s.n * 4)];
        let wg = 0, wc = 0, qg = 0, qc = 0, tg = 0, tc = 0;
        for (let k = 0; k < nz; k++) for (let x = 0; x < nx; x++) {
          const c = x + nx * (0 + 4 * k), cc = k * nx + x;
          wg = Math.max(wg, W[c]); wc = Math.max(wc, cpu.w[cc]);
          qg += Math.max(0, Qn[c]); qc += cpu.qn[cc];
          if (Qn[c] > 1e-5) tg = Math.max(tg, cpu.zf[k + 1]); if (cpu.qn[cc] > 1e-5) tc = Math.max(tc, cpu.zf[k + 1]);
        }
        rows.push({ t: i, wGPU: +wg.toFixed(2), wCPU: +wc.toFixed(2), topGPU: tg, topCPU: tc, qnGPU: +(qg * 1e3).toFixed(1), qnCPU: +(qc * 1e3).toFixed(1) });
        log('③ t=' + i + 's 最大w GPU ' + wg.toFixed(2) + ' / CPU ' + wc.toFixed(2) + '　雲頂 ' + tg + ' / ' + tc + ' m　雲水 ' + (qg * 1e3).toFixed(1) + ' / ' + (qc * 1e3).toFixed(1));
      }
    }
    const q1 = sumMass(await s.read(s.f.Q, s.n * 4)), s1 = sumMass(await s.read(s.f.S, s.n * 4));
    out.compare2D = rows;
    out.conserve = { qt_rel: (q1 - q0) / q0, s_rel: (s1 - s0) / Math.abs(s0) };
    log('④ 全水量の変化 ' + out.conserve.qt_rel.toExponential(2) + '、s の変化 ' + out.conserve.s_rel.toExponential(2));
  }
  return out;
}

// 入道雲: 雨と氷の式の確かめ（sky.html#verify-cb）。① 温度と雲 ② 奥行き一様で2次元の本編と比べる ③ 水の量の保存
export async function runVerifyIce(dev, log, opt = {}) {
  const SC = globalThis.CS.SCENES.find(s => s.id === 'cumulonimbus'), out = {}, nz = 100, Lz = SC.Lz, dx = SC.Lx / 256;
  const base = makeBase(SC, nz, Lz), flush = () => dev.queue.onSubmittedWorkDone();
  {  // ① 水と氷がまざる温度、降水あり・なしを CPU の式と比べる
    const s = new SkySim(dev, { nx: 64, ny: 64, dx, dy: dx, base, ice: true }), n = s.n, nx = 64, ny = 64;
    const S = new Float32Array(n), Q = new Float32Array(n), P = new Float32Array(n);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = i + nx * (j + ny * k);
      S[c] = base.h0[k] / cp - S0 + (i / nx - 0.3) * 12; Q[c] = base.qt0[k] * (0.8 + 1.2 * j / ny) + 2e-4; P[c] = (i + j) % 3 === 0 ? 2e-3 * i / nx : 0;
    }
    dev.queue.writeBuffer(s.f.S, 0, S); dev.queue.writeBuffer(s.f.Q, 0, Q); dev.queue.writeBuffer(s.f.Qp, 0, P);
    s._setP(1);
    const enc = dev.createCommandEncoder(); s.diagOnly(enc); dev.queue.submit([enc.finish()]);
    await flush();
    const [qn, Tm] = [await s.read(s.f.Qn, n * 4), await s.read(s.f.Tm, n * 4)];
    let eq = 0, eT = 0, nsat = 0, mix = 0, worst = null, resG = 0;
    for (let k = 0; k < nz; k += 2) for (let j = 0; j < ny; j += 3) for (let i = 0; i < nx; i += 3) {
      const c = i + nx * (j + ny * k), d = diag((S[c] + S0) * cp, Q[c], P[c], base.zc[k], base.pc[k], base.T0[k]), T = d.T, qq = d.qn;
      if (qq > 0) { nsat++; if (T > 253.16 && T < 273.16) mix++; }
      const a = Math.abs(qq - Math.max(0, qn[c])), b = Math.abs(T - Tm[c]), Tl = S[c] + S0 - g * base.zc[k] / cp, TG = Tm[c];
      if (qn[c] > 0) resG = Math.max(resG, Math.abs(TG - LnOf(TG) / cp * Math.max(0, Q[c] - qstar(TG, base.pc[k])) - LpOf(TG) / cp * P[c] - Tl));
      if (a > eq) { eq = a; worst = { k, i, j, T, TG: Tm[c], q: qq, qG: qn[c] }; } eT = Math.max(eT, b);
    }
    out.diag = { qnErrMax_gkg: eq * 1e3, TErrMax: eT, saturated: nsat, mixedPhase: mix, worst, gpuResidualK: resG };
    log('① 雲の量の差 ' + (eq * 1e3).toExponential(2) + ' g/kg、温度の差 ' + eT.toExponential(2) + ' K（飽和 ' + nsat + ' 点、うち水と氷がまざる温度 ' + mix + ' 点）、GPU の式の残り ' + resG.toExponential(2) + ' K');
    if (opt.only1) return out;
  }
  {  // ② 奥行き一様の暖気塊で2次元の本編と比べる（風・地面の摩擦・上のスポンジは本編と同じ）
    const F = SC.force, bub = { x: 24000, z: 1400, rx: 8000, rz: 1400, dT: 2 };
    const cpu = globalThis.makeSim({ ...SC, nx: 256, seed: false });
    cpu.initBubble(bub); cpu.diagAll();
    const s = new SkySim(dev, { nx: 256, ny: 4, dx, dy: dx, base, ice: true, wind: true, cd: F.cd, spongeTop: F.spongeTop, spongeTau: F.spongeTau });
    s.reset((S, Q, U, c) => {
      for (let k = 0; k < nz; k++) for (let j = 0; j < 4; j++) for (let i = 0; i < 256; i++) {
        const r = Math.hypot(((i + 0.5) * dx - bub.x) / bub.rx, (cpu.zc[k] - bub.z) / bub.rz);
        if (r < 1) S[c(i, j, k)] += bub.dT * Math.pow(Math.cos(Math.PI * r / 2), 2);
      }
    });
    const rows = [], dt = 1.5, N = opt.steps || 2400;
    for (let i = 1; i <= N; i++) {
      s.step(dt); cpu.step(dt);
      if (i % 20 === 0) await flush();
      if (i % 400 === 0) {
        await flush();
        const [W, Qn, Qp, Rn] = [await s.read(s.f.W, s.n * 4), await s.read(s.f.Qn, s.n * 4), await s.read(s.f.Qp, s.n * 4), await s.read(s.Rain, 256 * 4 * 4)];
        let wg = 0, wc = 0, tg = 0, tc = 0, qg = 0, qc = 0, pg = 0, pc = 0, rg = 0, rc = 0;
        for (let k = 0; k < nz; k++) for (let x = 0; x < 256; x++) {
          const a = x + 256 * (4 * k), cc = k * 256 + x;
          wg = Math.max(wg, W[a]); wc = Math.max(wc, cpu.w[cc]);
          qg += Math.max(0, Qn[a]) * base.rhoc[k]; qc += cpu.qn[cc] * base.rhoc[k]; pg += Qp[a] * base.rhoc[k]; pc += cpu.qp[cc] * base.rhoc[k];
          if (Qn[a] > 1e-5) tg = Math.max(tg, cpu.zf[k + 1]); if (cpu.qn[cc] > 1e-5) tc = Math.max(tc, cpu.zf[k + 1]);
        }
        for (let x = 0; x < 256; x++) { rg += Rn[x]; rc += cpu.rainCol[x]; }
        const row = { min: i * dt / 60, wGPU: +wg.toFixed(2), wCPU: +wc.toFixed(2), topGPU: tg, topCPU: tc, cloudGPU: +(qg * 1e3).toFixed(1), cloudCPU: +(qc * 1e3).toFixed(1), precipGPU: +(pg * 1e3).toFixed(1), precipCPU: +(pc * 1e3).toFixed(1), rainGPU: +(rg / 256).toFixed(3), rainCPU: +(rc / 256).toFixed(3) };
        rows.push(row); log('② ' + JSON.stringify(row));
      }
    }
    out.compare2D = rows;
  }
  {  // ③ 水の量の保存（スポンジ・摩擦なし、雨は地面に届いたぶんを足す）
    const nx = 64, s = new SkySim(dev, { nx, ny: 64, dx: 500, dy: 500, base, ice: true, wind: false });
    const bub = { rx: 8000, rz: 1400, z: 1400, dT: 3 };
    s.reset((S, Q, U, c) => { for (let k = 0; k < nz; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const r = Math.hypot(Math.hypot((i + 0.5) * 500 - 16000, (j + 0.5) * 500 - 16000) / bub.rx, (base.zc[k] - bub.z) / bub.rz); if (r < 1) S[c(i, j, k)] += bub.dT * Math.pow(Math.cos(Math.PI * r / 2), 2); } });
    const mass = async () => { const [Q, P, R] = [await s.read(s.f.Q, s.n * 4), await s.read(s.f.Qp, s.n * 4), await s.read(s.Rain, nx * nx * 4)]; let m = 0, r = 0, p = 0; for (let k = 0; k < nz; k++) { let t = 0, u = 0; for (let c = 0, o = nx * nx * k; c < nx * nx; c++) { t += Q[o + c]; u += P[o + c]; } m += t * base.rhoc[k] * base.dz; p += u * base.rhoc[k] * base.dz; } for (const v of R) r += v; return { all: m + p + r, p, r }; };
    const m0 = await mass();
    for (let i = 1; i <= 1600; i++) { s.step(1.5); if (i % 20 === 0) await flush(); }
    await flush();
    const m1 = await mass();
    out.conserve = { rel: (m1.all - m0.all) / m0.all, precip: m1.p / (nx * nx), rainMean: m1.r / (nx * nx) };
    const W = await s.read(s.f.W, s.n * 4); let wm = 0, as = 0, am = 0;
    for (let k = 0; k <= nz; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const a = W[i + nx * (j + nx * k)]; wm = Math.max(wm, Math.abs(a)); as = Math.max(as, Math.abs(a - W[j + nx * (i + nx * k)])); am = Math.max(am, Math.abs(a - W[(nx - 1 - i) + nx * (j + nx * k)])); }
    out.symmetry = { wMax: wm, xyDiff: as, mirrorDiff: am };
    log('④ 左右の対称: 最大 w ' + wm.toFixed(2) + ' に対して x と y の入れかえの差 ' + as.toFixed(3) + '、鏡像の差 ' + am.toFixed(3) + ' m/s');
    log('③ 水の量の変化 ' + out.conserve.rel.toExponential(2) + '（40分後の降水 ' + out.conserve.precip.toFixed(2) + ' mm、地面の雨 ' + out.conserve.rainMean.toFixed(2) + ' mm）');
  }
  {  // ⑤ 持ち上げた空気（下から 500 m の空気を断熱で、降水なし）が浮かなくなる高さ
    let k0 = 0; while (base.zc[k0] < 500) k0++;
    const h = base.h0[k0], q = base.qt0[k0]; let lnb = 0;
    for (let k = k0; k < nz; k++) { const d = diag(h, q, 0, base.zc[k], base.pc[k], base.T0[k]), Tv = d.T * (1 + 0.608 * (q - d.qn)), Tb = base.T0[k] * (1 + 0.608 * base.qv0[k]); if (Tv > Tb) lnb = base.zc[k]; }
    out.lnb = lnb;
    log('⑤ 持ち上げた空気が浮かなくなる高さ ' + (lnb / 1000).toFixed(2) + ' km（水を落とさない計算）');
  }
  return out;
}
export { g };
