// ビッグバンから惑星まで — メイン（起動・粒の数を決める・まわす・ボタン・デバッグ用の窓口）
import { initDisk, solidMassKg, MSUN, DT, forceCPU, stepCPU, heatCPU, radiusAU, eOfTemp } from './physics.js';
import { getDevice, Sim, MASS_SCALE } from './gpu.js';
import { View } from './view.js';
import { UI } from './ui.js';

window.__bibaErr = [];
window.addEventListener('error', e => window.__bibaErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__bibaErr.push(String(e.reason)));

const $ = id => document.getElementById(id);
const view = new View($('cv'), $('ov'));
const ui = new UI();
const NS = [1024, 2048, 4096, 8192, 16384, 32768];
const S = { t: 0, n0: 0, F: 30, nPick: 'auto', speed: 'normal', play: true, sub: 1, yps: 0, alive: 0, big: 0, mass: 0, hot: 0, mTot: solidMassKg() / MSUN, R0: 0, seed: 1, msPerStep: 1, frame: 0 };
let dev = null, sim = null;

function unsupported(why) {
  $('say').innerHTML = `この端末・ブラウザでは <b>WebGPU</b> が使えないため、ここでは計算できません（${why}）。前もって計算した<b>記録の再生だけ</b>を、次の段階で用意します。WebGPU に対応したブラウザ（新しい Chrome・Edge・Safari など）なら計算できます。`;
  $('ruler').textContent = '';
  for (const b of document.querySelectorAll('#bar button, #try button')) b.disabled = true;
}

async function boot() {
  const r = await getDevice();
  if (r.err) return unsupported(r.err);
  dev = r.device;
  dev.lost.then(info => { window.__bibaErr.push('device lost: ' + info.message); unsupported('GPU が止まりました。読みこみなおしてください'); });
  dev.addEventListener?.('uncapturederror', e => window.__bibaErr.push('gpu: ' + e.error.message));
  // 速さをはかって粒の数を決める（1歩の重力が 2.2 ms 以内に入るいちばん多い数）。小さい数から順に
  for (const n of NS) {
    const b = new Sim(dev, null, n), d = initDisk(n, 1);
    b.load(d.B, S.F, d.m0 * 0.5); await b.bench(3);
    bench[n] = await b.bench(12); b.destroy();
    if (bench[n] > 2.2) break;
  }
  start();
}
const bench = {};
const msOf = n => { if (bench[n]) return bench[n]; const ks = Object.keys(bench).map(Number).sort((a, b) => b - a), k = ks[0]; return bench[k] * (n / k) ** 2; };

function pickN() {
  if (S.nPick !== 'auto') return +S.nPick;
  const phone = matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 700;
  let n = NS[0];
  for (const k of NS) if (bench[k] && bench[k] <= 2.2) n = k;
  return phone ? Math.min(n, 4096) : n;
}

function start() {
  if (sim) sim.destroy();
  const n = pickN(), d = initDisk(n, S.seed);
  sim = new Sim(dev, $('cv'), n);
  sim.load(d.B, S.F, d.m0 * 0.5);
  Object.assign(S, { t: 0, n0: n, n, R0: d.R0, m0: d.m0, E0: undefined, frame: 0, msPerStep: 1.25 * msOf(n) + 0.05 });
  ui.reset(); ui.say(S);
  $('nAuto').textContent = `自動（${n.toLocaleString('ja-JP')}）`;
}

let lastT = performance.now(), fps = 60;
// 1コマの歩数。近くで見るときは目で追える速さに（1コマ 0.4〜4 歩。端数はためておく）、全体は GPU の速さで決める
let acc = 0;
function subFor() {
  if (!S.play) return 0;
  if (view.mode === 'near') { acc += { slow: 0.4, normal: 1.25, fast: 4 }[S.speed]; const k = Math.floor(acc); acc -= k; return k; }
  if (S.speed === 'slow') return 1;
  const budget = S.speed === 'fast' ? 14 : 8;
  return Math.max(1, Math.min(96, Math.floor(budget / S.msPerStep)));
}
function frame(now) {
  const dtr = Math.max(1, now - lastT); lastT = now; fps = 0.95 * fps + 0.05 * (1000 / dtr);
  if (sim) {
    const sub = subFor(); if (sub) S.sub = sub; S.yps = 0.97 * S.yps + 0.03 * sub * DT * fps;
    view.setTime(S.t); view.tick(S.t);
    sim.setView(view.gpuView(S.R0, S.n0));
    const job = sim.frame(sub, { t: S.t, fin: view.fin, read: S.frame % 4 === 0 });
    S.t += sub * DT; S.frame++;
    if (job) job.then(({ B, C, E }) => { ui.absorb(S, B, C); view.addEvents(E); ui.ruler(S); if (S.frame % 16 < 4) ui.readout(S);
      const b = ui.top[0]; view.hl = ui.step === 5 && b ? { x: b.x, y: b.y, label: 'いちばん大きい' } : null;
      if (ui.step >= 0 && (ui.step === 5 || ui.step === 0)) ui.say(S); });
  }
  view.drawOverlay(sim && !view.fin.on && ui.step < 0 ? '図を押さえると岩が集まる・速く動かすと はげしくぶつかる' : '');
  requestAnimationFrame(frame);
}

// ボタン
$('next').onclick = () => ui.next(S);
$('play').onclick = () => { S.play = !S.play; $('play').textContent = S.play ? '❚❚ 止める' : '▶ 動かす'; };
$('reset').onclick = () => start();
for (const b of document.querySelectorAll('#speeds button')) b.onclick = () => { S.speed = b.dataset.sp; for (const x of document.querySelectorAll('#speeds button')) x.classList.toggle('on', x === b); };
for (const b of document.querySelectorAll('#zoom button[data-z]')) b.onclick = () => view.zoom(b.dataset.z === 'in' ? 0.8 : 1.25);
for (const b of document.querySelectorAll('#modeB button')) b.onclick = () => { view.setMode(b.dataset.v); for (const x of document.querySelectorAll('#modeB button')) x.classList.toggle('on', x === b); ui.say(S); };
for (const b of document.querySelectorAll('#nPick button')) b.onclick = () => { S.nPick = b.dataset.v; for (const x of document.querySelectorAll('#nPick button')) x.classList.toggle('on', x === b); start(); };
for (const b of document.querySelectorAll('#fPick button')) b.onclick = () => { S.F = +b.dataset.v; for (const x of document.querySelectorAll('#fPick button')) x.classList.toggle('on', x === b); start(); };
view.onStir = () => { if (ui.step < 0) { ui.step = 2; ui.say(S); } };
window.addEventListener('resize', () => view.resize());
requestAnimationFrame(frame);
boot().catch(e => { window.__bibaErr.push(String(e)); unsupported(String(e.message || e)); });

// デバッグ用の窓口（RULES 5）
window.__biba = {
  S, ui, view, get sim() { return sim; },
  // 描かずに進める（ペインが隠れていても）。sec = 実時間ではなく「年」
  async simRun(years, sub = 16) {
    const k = Math.ceil(years / (sub * DT));
    for (let i = 0; i < k; i++) { const job = sim.frame(sub, { t: S.t, fin: view.fin, read: i === k - 1 }); S.t += sub * DT; if (job) { const { B, C } = await job; ui.absorb(S, B, C); ui.ruler(S); ui.readout(S); } }
    await dev.queue.onSubmittedWorkDone(); return { t: S.t, alive: S.alive, big: S.big, coll: ui.coll };
  },
  // GPU と JS の同じ計算をくらべる（ぶつからない 256 個を 64 歩・正面衝突 1 回）
  async testGpu() {
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
    // 1) ぶつからない
    const d = initDisk(256, 7), gA = await run(d.B, 256, 1, d.m0 * 0.5, 8, 8), cA = cpu(d.B, 256, 1, d.m0 * 0.5, 8, 8);
    let dx = 0, de = 0; for (let i = 0; i < 256; i++) { const o = i * 16; dx = Math.max(dx, Math.hypot(gA.B[o] - cA.B[o], gA.B[o + 1] - cA.B[o + 1], gA.B[o + 2] - cA.B[o + 2])); de = Math.max(de, Math.abs(gA.B[o + 12] - cA.B[o + 12]) / cA.B[o + 12]); }
    out.noCollide = { maxPosDiffAU: dx, maxHeatRel: de, gpuColl: gA.C[3], cpuColl: cA.o.coll };
    // 2) 正面衝突: 地球の 0.1 倍どうし、1 AU で、たがいに 10 km/s で
    const n = 64, B = new Float32Array(n * 16), m = 0.1 * 3.003e-6, R = radiusAU(m), v = 10000 / 4740.47;
    const put = (i, x, vx) => { const o = i * 16; B[o] = 1 + x; B[o + 1] = 0; B[o + 3] = m; B[o + 4] = vx; B[o + 5] = 2 * Math.PI; B[o + 7] = R; B[o + 12] = eOfTemp(278); };
    put(0, -3 * R, v / 2); put(1, 3 * R, -v / 2);
    const gB = await run(B, n, 1, m * 0.02, 1, 8), cB = cpu(B, n, 1, m * 0.02, 1, 8);
    const sum = X => { let M = 0, px = 0, k = 0; for (let i = 0; i < n; i++) { const o = i * 16; if (X[o + 3] > 0) { M += X[o + 3]; px += X[o + 3] * X[o + 4]; k++; } } return { M, px, k }; };
    const sg = sum(gB.B), sc = sum(cB.B);
    out.headOn = { gpu: { bodies: sg.k, massPlusDust: (sg.M + gB.C[0] / MASS_SCALE) / (2 * m), px: sg.px, coll: gB.C[3], frag: gB.C[5] },
      cpu: { bodies: sc.k, massPlusDust: (sc.M + cB.o.dust) / (2 * m), px: sc.px, coll: cB.o.coll } };
    return out;
  },
};
