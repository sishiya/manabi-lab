// ビッグバンから惑星まで — デバッグ用の窓口の中身（RULES 5）。main.js が window.__biba に入れる
import { initDisk, DT, forceCPU, stepCPU, heatCPU, radiusAU, eOfTemp } from './physics.js';
import { Sim, MASS_SCALE } from './gpu.js';

// 描かずに進める（ペインが隠れていても）。years = 計算の中の年
export async function simRun(ctx, years, sub = 16) {
  const { sim, S, ui, view, dev } = ctx(), k = Math.ceil(years / (sub * DT));
  for (let i = 0; i < k; i++) { const job = sim.frame(sub, { t: S.t, fin: view.fin, read: i === k - 1 }); S.t += sub * DT; if (job) { const { B, C } = await job; ui.absorb(S, B, C); ui.ruler(S); ui.readout(S); } }
  await dev.queue.onSubmittedWorkDone(); return { t: S.t, alive: S.alive, big: S.big, coll: ui.coll };
}

// GPU と JS の同じ計算をくらべる（ぶつからない 256 個を 64 歩・正面衝突 1 回）
export async function testGpu(dev) {
  const out = {};
  const run = async (B0, n, F, mMin, frames, sub) => {
    const g = new Sim(dev, null, n); g.load(B0.slice(), F, mMin);
    let last; for (let f = 0; f < frames; f++) { const j = g.frame(sub, { t: f * sub * DT, read: f === frames - 1 }); if (j) last = await j; }
    g.destroy(); return last;
  };
  const cpu = (B0, n, F, mMin, frames, sub) => {
    const Sx = { B: B0.slice(), n }; forceCPU(Sx, F); const o = { dust: 0, coll: 0 };
    for (let f = 0; f < frames; f++) { for (let s = 0; s < sub; s++) { const r = stepCPU(Sx, F, mMin, f * sub + s, 0); o.dust += r.dust; o.coll += r.coll; } heatCPU(Sx, sub * DT, f * sub * DT); }
    return { B: Sx.B, o };
  };
  // 1) ぶつからない: 256 個（速い道 small）と 512 個（ふつうの道）
  for (const nn of [256, 512]) {
    const d = initDisk(nn, 7), gA = await run(d.B, nn, 1, d.m0 * 0.5, 8, 8), cA = cpu(d.B, nn, 1, d.m0 * 0.5, 8, 8);
    let dx = 0, de = 0; for (let i = 0; i < nn; i++) { const o = i * 16; dx = Math.max(dx, Math.hypot(gA.B[o] - cA.B[o], gA.B[o + 1] - cA.B[o + 1], gA.B[o + 2] - cA.B[o + 2])); de = Math.max(de, Math.abs(gA.B[o + 12] - cA.B[o + 12]) / cA.B[o + 12]); }
    out['noCollide' + nn] = { maxPosDiffAU: dx, maxHeatRel: de, gpuColl: gA.C[3], cpuColl: cA.o.coll };
  }
  // 1b) ぶつかる円盤（×100、256 個 = 速い道）: 重さが保たれるか
  { const d = initDisk(256, 3), gA = await run(d.B, 256, 100, d.m0 * 0.5, 40, 64); let M = 0; for (let i = 0; i < 256; i++) M += Math.max(0, gA.B[i * 16 + 3]);
    out.small100 = { coll: gA.C[3], massRatio: (M + (gA.C[0] + gA.C[1] + gA.C[2]) / MASS_SCALE) / (d.m0 * 256) }; }
  // 正面衝突: 地球の 0.1 倍どうし、1 AU で、たがいに 10 km/s で
  const n = 64, B = new Float32Array(n * 16), m = 0.1 * 3.003e-6, R = radiusAU(m), v = 10000 / 4740.47;
  const put = (i, x, vx) => { const o = i * 16; B[o] = 1 + x; B[o + 1] = 0; B[o + 3] = m; B[o + 4] = vx; B[o + 5] = 2 * Math.PI; B[o + 7] = R; B[o + 12] = eOfTemp(278); };
  put(0, -3 * R, v / 2); put(1, 3 * R, -v / 2);
  const gB = await run(B, n, 1, m * 0.02, 1, 8), cB = cpu(B, n, 1, m * 0.02, 1, 8);
  const sum = X => { let M = 0, px = 0, k = 0; for (let i = 0; i < n; i++) { const o = i * 16; if (X[o + 3] > 0) { M += X[o + 3]; px += X[o + 3] * X[o + 4]; k++; } } return { M, px, k }; };
  const sg = sum(gB.B), sc = sum(cB.B);
  out.headOn = { gpu: { bodies: sg.k, massPlusDust: (sg.M + gB.C[0] / MASS_SCALE) / (2 * m), px: sg.px, coll: gB.C[3], frag: gB.C[5] },
    cpu: { bodies: sc.k, massPlusDust: (sc.M + cB.o.dust) / (2 * m), px: sc.px, coll: cB.o.coll } };
  return out;
}
