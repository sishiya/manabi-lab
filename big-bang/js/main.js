// ビッグバンから惑星まで — メイン（起動・記録の再生 ⇔ 自分の宇宙・粒の数を決める・まわす・ボタン・デバッグ用の窓口）
import { initDisk, solidMassKg, MSUN, DT } from './physics.js';
import { getDevice, Sim } from './gpu.js';
import { View } from './view.js';
import { UI } from './ui.js';
import { Replay } from './replay.js';
import { simRun, testGpu } from './debug.js';
import { drawNav } from './nav.js';

window.__bibaErr = [];
window.addEventListener('error', e => window.__bibaErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__bibaErr.push(String(e.reason)));

const $ = id => document.getElementById(id);
drawNav(scenes);
const view = new View($('cv'), $('ov'));
const ui = new UI();
const rp = new Replay('data/' + (new URLSearchParams(location.search).get('rec') || 'disk'));   // ?rec=test で別の記録（たしかめ用）
const NS = [1024, 2048, 4096, 8192, 16384, 32768];
// mode: 'replay'（記録の再生）／'live'（自分の宇宙）
const S = { mode: 'replay', t: 0, s: 0, n0: 0, F: 100, nPick: 'auto', speed: 'normal', play: true, sub: 1, yps: 0, alive: 0, big: 0, mass: 0, hot: 0,
  mTot: solidMassKg() / MSUN, R0: 0, seed: 1, msPerStep: 1, frame: 0, from: null, rpOk: false, gpu: false };
let dev = null, sim = null;
const STORY = { slow: 60, normal: 30, fast: 12 };   // 記録ぜんぶを何秒で再生するか

function noGpu(why) {
  S.gpu = false; S.why = why;
  for (const b of document.querySelectorAll('#try button')) b.disabled = true;
  if (!S.rpOk) $('say').innerHTML = `この端末・ブラウザでは <b>WebGPU</b> が使えず（${why}）、記録も読めませんでした。`;
}

async function boot() {
  rp.load().then(() => { S.rpOk = true; S.R0 = rp.R0; S.n0 = rp.idx.n; S.m0 = rp.m0; setMode('replay'); }).catch(e => { window.__bibaErr.push('replay: ' + e.message); });
  const r = await getDevice();
  if (r.err) return noGpu(r.err);
  dev = r.device; S.gpu = true;
  dev.lost.then(info => { window.__bibaErr.push('device lost: ' + info.message); noGpu('GPU が止まりました'); });
  dev.addEventListener?.('uncapturederror', e => window.__bibaErr.push('gpu: ' + e.error.message));
  for (const n of NS) {   // 速さをはかる（1歩の重力が 2.2 ms 以内に入るいちばん多い数）
    const b = new Sim(dev, null, n), d = initDisk(n, 1);
    b.load(d.B, S.F, d.m0 * 0.5); await b.bench(3);
    bench[n] = await b.bench(12); b.destroy();
    if (bench[n] > 2.2) break;
  }
  if (!S.rpOk) start();   // 記録が無いときは、はじめから自分の宇宙
}
const bench = {};
const msOf = n => { if (bench[n]) return bench[n]; const ks = Object.keys(bench).map(Number).sort((a, b) => b - a), k = ks[0]; return k ? bench[k] * (n / k) ** 2 : 1; };
function pickN() {
  if (S.nPick !== 'auto') return +S.nPick;
  const phone = matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 700;
  let n = NS[0]; for (const k of NS) if (bench[k] && bench[k] <= 2.2) n = k;
  return phone ? Math.min(n, 4096) : n;
}

function setMode(m) {
  S.mode = m;
  $('cv').style.visibility = m === 'live' ? 'visible' : 'hidden';
  $('tl').hidden = m !== 'replay'; $('branch').hidden = m !== 'live' || !S.from;
  $('play').textContent = S.play ? '❚❚ 止める' : '▶ 動かす';
  ui.reset(); ui.say(S);
}
// 自分の宇宙を、はじめから（試すの数・大きさ）
function start() {
  if (!S.gpu) return;
  if (sim) sim.destroy();
  const n = pickN(), d = initDisk(n, S.seed);
  sim = new Sim(dev, $('cv'), n); sim.load(d.B, S.F, d.m0 * 0.5);
  Object.assign(S, { t: 0, n0: n, n, R0: d.R0, m0: d.m0, E0: undefined, frame: 0, msPerStep: 1.25 * msOf(n) + 0.05, from: null });
  $('nAuto').textContent = `自動（${n.toLocaleString('ja-JP')}）`;
  setMode('live');
}
// 記録のいまの時から、自分の宇宙に分かれる
async function branch() {
  if (S.mode !== 'replay' || S.busy) return;
  if (!S.gpu) { $('say').innerHTML = `この端末では<b>記録の再生だけ</b>です（WebGPU が使えないため、分かれた計算はできません）。`; return; }
  S.busy = true;
  const b = await rp.branch(S.t);
  if (sim) sim.destroy();
  sim = new Sim(dev, $('cv'), b.n); sim.load(b.B, b.F, b.m0 * 0.5);
  Object.assign(S, { t: b.t, n0: b.n, n: b.n, R0: b.R0, m0: b.m0, F: b.F, E0: undefined, frame: 0, msPerStep: 1.25 * msOf(b.n) + 0.05, from: b.t, play: true, busy: false });
  for (const x of document.querySelectorAll('#fPick button')) x.classList.toggle('on', +x.dataset.v === b.F);
  $('fromT').textContent = ui.yrs(b.t);
  setMode('live');
}

let lastT = performance.now(), fps = 60, acc = 0;
// 自分の宇宙の 1コマの歩数。近くで見るときは目で追える速さに（端数はためる）、全体は GPU の速さで決める
function subFor() {
  if (!S.play) return 0;
  if (view.mode === 'near') { acc += { slow: 0.4, normal: 1.25, fast: 4 }[S.speed]; const k = Math.floor(acc); acc -= k; return k; }
  if (S.speed === 'slow') return 1;
  return Math.max(1, Math.min(96, Math.floor((S.speed === 'fast' ? 14 : 8) / S.msPerStep)));
}
function frame(now) {
  const dtr = Math.min(0.1, Math.max(0.001, (now - lastT) / 1000)); lastT = now; fps = 0.95 * fps + 0.05 / dtr;
  if (S.mode === 'replay' && S.rpOk) {
    if (S.play) { S.s = Math.min(1, S.s + dtr / STORY[S.speed]); if (S.s >= 1) { S.play = false; $('play').textContent = '▶ 動かす'; } $('tlr').value = Math.round(S.s * 1000); }
    S.t = rp.tOf(S.s); view.setTime(S.t);
    const base = view.gpuView(rp.R0, rp.idx.n).base;
    view.under = g => { rp.draw(g, view, S.t, base); labelBig(g); };
    if (S.frame++ % 6 === 0) { ui.fromReplay(S, rp); ui.say(S); }
  } else if (S.mode === 'live' && sim) {
    view.under = null;
    const sub = subFor(); if (sub) S.sub = sub; S.yps = 0.97 * S.yps + 0.03 * sub * DT * fps;
    view.setTime(S.t); view.tick(S.t);
    sim.setView(view.gpuView(S.R0, S.n0));
    const job = sim.frame(sub, { t: S.t, fin: view.fin, read: S.frame % 4 === 0 });
    S.t += sub * DT; S.frame++;
    if (job) job.then(({ B, C, E }) => { ui.absorb(S, B, C); view.addEvents(E); ui.ruler(S); if (S.frame % 16 < 4) ui.readout(S);
      const b = ui.top[0]; view.hl = ui.step === 5 && b ? { x: b.x, y: b.y, label: 'いちばん大きい' } : null;
      if (ui.step >= 0 && (ui.step === 5 || ui.step === 0)) ui.say(S); });
  }
  view.drawOverlay(S.mode === 'live' && !view.fin.on && ui.step < 0 ? '図を押さえると岩が集まる・速く動かすと はげしくぶつかる' : '');
  requestAnimationFrame(frame);
}
// 再生では、地球の 0.05 倍より大きい星に名札
function labelBig(g) {
  g.font = 'bold 12px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = '#ffc95a';
  for (const b of rp.top(S.t, 8)) { if (b.m / 3.003e-6 < 0.05) break; const s = view.toScreen(b.x, b.y); g.fillText(`地球の ${(b.m / 3.003e-6).toFixed(2)} 倍`, s.x + 8, s.y - 6); }
}

// ボタン
$('next').onclick = () => ui.next(S);
$('play').onclick = () => { if (S.mode === 'replay' && S.s >= 1) S.s = 0; S.play = !S.play; $('play').textContent = S.play ? '❚❚ 止める' : '▶ 動かす'; };
$('reset').onclick = () => { if (S.mode === 'replay') { S.s = 0; S.play = true; } else start(); };
$('tlr').oninput = () => { S.s = $('tlr').value / 1000; };
$('toEnd').onclick = () => { S.s = 1; S.play = false; $('play').textContent = '▶ 動かす'; };
$('back').onclick = () => { S.s = rp.sOf(S.from || 0); S.play = true; setMode('replay'); };
for (const b of document.querySelectorAll('#speeds button')) b.onclick = () => { S.speed = b.dataset.sp; for (const x of document.querySelectorAll('#speeds button')) x.classList.toggle('on', x === b); };
for (const b of document.querySelectorAll('#zoom button[data-z]')) b.onclick = () => view.zoom(b.dataset.z === 'in' ? 0.8 : 1.25);
for (const b of document.querySelectorAll('#modeB button')) b.onclick = () => { view.setMode(b.dataset.v); for (const x of document.querySelectorAll('#modeB button')) x.classList.toggle('on', x === b); ui.say(S); };
for (const b of document.querySelectorAll('#nPick button')) b.onclick = () => { S.nPick = b.dataset.v; for (const x of document.querySelectorAll('#nPick button')) x.classList.toggle('on', x === b); start(); };
for (const b of document.querySelectorAll('#fPick button')) b.onclick = () => { S.F = +b.dataset.v; for (const x of document.querySelectorAll('#fPick button')) x.classList.toggle('on', x === b); start(); };
view.onStir = () => { if (S.mode === 'replay') branch(); else if (ui.step < 0) { ui.step = 2; ui.say(S); } };
window.addEventListener('resize', () => view.resize());
view.setMode('all'); for (const x of document.querySelectorAll('#modeB button')) x.classList.toggle('on', x.dataset.v === 'all');
requestAnimationFrame(frame);
boot().catch(e => { window.__bibaErr.push(String(e)); noGpu(String(e.message || e)); });

window.__biba = {
  S, ui, view, rp, get sim() { return sim; }, branch, start,
  simRun: (y, sub) => simRun(() => ({ sim, S, ui, view, dev }), y, sub),
  testGpu: () => testGpu(dev),
};
