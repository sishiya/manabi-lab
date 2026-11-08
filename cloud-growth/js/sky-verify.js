// 雲ができるまで（3次元の試作）— 計算の確かめ。sky.html#verify で動く。window.__skyVerify に結果
import { SkySim, makeBase, S0 } from './sky-sim.js';

const { cp, g, diag } = globalThis.CT;
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
export { g };
