// ビッグバンから惑星まで — 場面⑤ 大きな衝突（月ができる）: 準備 → 落ち着かせる → ぶつける → 結末
import { getDevice } from './gpu.js';
import { SphSim } from './sph.js';
import { mtArray, makeBody, toX, approach, analyze, TU, VU, EU, MOON, IRON, ROCK } from './impact-model.js';
import { drawNav } from './nav.js';

window.__bibaErr = [];
window.addEventListener('error', e => window.__bibaErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__bibaErr.push(String(e.reason)));
const $ = id => document.getElementById(id);
drawNav($('scenes'));

const S = { Mi: 0.1, th: 45, vr: 1, nPick: 'auto', slice: 0, play: true, fast: false, phase: 'boot', t: 0, dt: 0.01, half: 5, cx: 0, cy: 0, res: null, frame: 0, step: -1, tEnd: 30 * 3600 / TU };
let dev = null, sim = null, msStep = 5, cv = $('cv'), ov = $('ov'), g = ov.getContext('2d');
const fin = { on: false, x: 0, y: 0, vx: 0, vy: 0, r: 0.5, invTau: 0, sp: null, prev: null };

const TOUR = [
  () => `左が <b>地球のもと</b>（地球の ${(1 - S.Mi).toFixed(2)} 倍、鉄の芯と岩のマントル）、右が <b>ぶつかる星</b>（${S.Mi} 倍）。どちらも何千個もの粒でできています。`,
  () => `ななめ <b>${S.th}°</b> に、逃げる速さの <b>${S.vr} 倍</b> でぶつかる。ぶつかった所は押しつぶされて<b>熱く</b>なります（黄色）。`,
  () => `ぶつかった星の岩は引きのばされて、地球のまわりに<b>円盤</b>をつくる。重い<b>鉄は地球の芯へ</b>沈みます（「断面」で中が見える）。`,
  () => `点線の輪は <b>ロシュ限界</b>。これより内では地球に引きさかれ、外にまわる岩だけが、のちに<b>月</b>にまとまれます。`,
  () => `本物の月は地球の 0.0123 倍。鉄がとても少ないのは、円盤が<b>マントルの岩</b>からできたから、と考えられています。`,
];
function say(html) { $('say').innerHTML = html; }
function sayTour() { say(S.step < 0 ? (S.phase === 'done' ? conclusion() : '火星くらいの星が、できたばかりの地球にぶつかる。<b>「つぎへ」</b>で案内、<b>「結末へ」</b>で早送り。') : `<span class="n">${S.step + 1}/${TOUR.length}</span>` + TOUR[S.step]()); }
function conclusion() {
  const r = S.res; if (!r) return '';
  return `結末（${hours(S.t)}）: 円盤は <b>月の ${(r.Md / MOON).toFixed(1)} 倍</b>、そのうちロシュ限界より外は 月の ${(r.Mout / MOON).toFixed(1)} 倍・鉄は ${(100 * r.Mfe / Math.max(r.Md, 1e-9)).toFixed(0)}%。地球の1日は 約 ${r.dayH < 100 ? r.dayH.toFixed(1) : '—'} 時間。条件を変えて「もう一度ぶつける」で くらべられます。`;
}
const hours = t => { const h = t * TU / 3600; return h < 1 ? `${Math.round(h * 60)} 分` : `${h.toFixed(1)} 時間`; };

async function boot() {
  const r = await getDevice();
  if (r.err) { say(`この端末・ブラウザでは <b>WebGPU</b> が使えないため、この場面は計算できません（${r.err}）。`); for (const b of document.querySelectorAll('button')) b.disabled = true; return; }
  dev = r.device;
  dev.addEventListener?.('uncapturederror', e => window.__bibaErr.push('gpu: ' + e.error.message));
  // 速さをはかって粒の数を決める（1歩 6 ms 以内）
  const B = build(8192, true), t = new SphSim(dev, null, B.n); t.load(B.X); t.set({ mt: mtArray(), dt: 0.001 });
  t.prime(); await dev.queue.onSubmittedWorkDone();
  let t0 = performance.now(); t.frame(4); await dev.queue.onSubmittedWorkDone(); const ms = (performance.now() - t0) / 4; t.destroy();
  const phone = matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 700;
  S.nAuto = ms < 2 && !phone ? 16384 : ms < 7 && !phone ? 8192 : 4096; S.msPer8k = ms;
  $('nAuto').textContent = `自動（${S.nAuto.toLocaleString('ja-JP')}）`;
  start();
}
// 2つの星の粒（落ち着かせるあいだは はなして置く）
function build(N, quick) {
  const Mt = 1 - S.Mi, mp = 1 / N;
  const A = makeBody(Mt, 0.3, mp, 0, 0), Bd = makeBody(S.Mi, 0.3, mp, 12, 0);
  const n = A.list.length + Bd.list.length, { X } = toX([A.list, Bd.list], mp, n);
  return { X, n, nt: A.list.length, Rt: A.R, Ri: Bd.R };
}
async function start() {
  if (!dev) return;
  if (sim) sim.destroy();
  const N = S.nPick === 'auto' ? S.nAuto : +S.nPick, b = build(N);
  Object.assign(S, { phase: 'relax', t: 0, res: null, nt: b.nt, n: b.n, frame: 0, play: true, fast: false, half: 5 });
  sim = new SphSim(dev, cv, b.n); sim.set({ mode: 0, mt: mtArray(), G: 1, damp: 0.9 }); sim.load(b.X, { dtMax: 0.02, courant: 0.2 });
  sim.prime();
  say('星を落ち着かせています（重さで少し縮んで、揺れが止まるまで）…');
  // 落ち着かせる: 速さを毎歩 9 割にしながら 300 歩
  for (let k = 0; k < 15; k++) { sim.frame(20); await dev.queue.onSubmittedWorkDone(); }
  const X = await sim.frame(0, { read: true });
  // それぞれの重心を出して、ぶつかる道すじにのせる
  const cm = (a, b) => { let m = 0, x = 0, y = 0, z = 0, rmax = []; for (let i = a; i < b; i++) { const o = i * 16; m += X[o + 3]; x += X[o + 3] * X[o]; y += X[o + 3] * X[o + 1]; z += X[o + 3] * X[o + 2]; }
    x /= m; y /= m; z /= m; for (let i = a; i < b; i++) { const o = i * 16; rmax.push(Math.hypot(X[o] - x, X[o + 1] - y, X[o + 2] - z)); } rmax.sort((p, q) => p - q); return { m, x, y, z, R: rmax[Math.floor(rmax.length * 0.98)] }; };
  const T = cm(0, S.nt), I = cm(S.nt, S.n), ap = approach(T.m, I.m, T.R, I.R, S.vr, S.th);
  for (let i = 0; i < S.n; i++) { const o = i * 16, isT = i < S.nt, c = isT ? T : I, d = isT ? ap.t : ap.i;
    X[o] += d.x - c.x; X[o + 1] += d.y - c.y; X[o + 2] -= c.z; X[o + 4] = d.vx; X[o + 5] = d.vy; X[o + 6] = 0; }
  sim.set({ damp: 1 }); sim.load(X, { dtMax: 0.05, courant: 0.25 }); sim.prime();
  Object.assign(S, { phase: 'run', vimp: ap.vc * VU / 1000, vesc: ap.vesc * VU / 1000, cx: 0, cy: 0 });
  S.dt = 0.01; sayTour();
}

let lastT = performance.now();
function frame(now) {
  const real = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  resize();
  if (sim && S.phase !== 'relax') {
    let sub = 0;
    if (S.play && S.phase === 'run') sub = Math.max(1, Math.min(40, Math.floor((S.fast ? 45 : 12) / Math.max(0.5, S.msStep || 6))));
    tickFinger();
    const ppa = Math.min(ov.clientWidth, ov.clientHeight) / 2 / S.half;
    sim.setView([2 * ppa / ov.clientWidth, -2 * ppa / ov.clientHeight * -1, S.cx, S.cy, 2 / ov.clientWidth, 2 / ov.clientHeight, 0.55 * Math.cbrt(1 / S.n / (ROCK.rho0 / 23093)) * ppa, 1.0, S.slice ? 0.3 : 0, EU, 0, 0, IRON.cv, ROCK.cv, 0, 0]);
    const t0 = performance.now();
    const job = sim.frame(sub, { fin: fin.on ? fin : null, read: S.frame % 8 === 0 });
    S.frame++;   // 時刻は GPU が数える（読み出したときに S.t へ）
    if (sub) S.msStep = 0.9 * (S.msStep || 6) + 0.1 * Math.max(0.5, (performance.now() - t0) / sub);
    if (job) job.catch(() => null).then(X => { if (!X) return; S.dt = X.ts[0]; S.t = X.ts[1]; S.res = analyze(X, S.n); if (S.res) { S.cx += 0.3 * (S.res.cx - S.cx); S.cy += 0.3 * (S.res.cy - S.cy); } readout(); });
    if (S.phase === 'run' && S.t >= S.tEnd) { S.phase = 'done'; S.play = false; S.fast = false; $('play').textContent = '▶ 動かす'; S.step = -1; }
    if (S.frame % 10 === 0) { sayTour(); ruler(); }
  }
  overlay();
  requestAnimationFrame(frame);
}
function ruler() { $('ruler').innerHTML = `<span class="big">${hours(S.t)}</span>　ぶつかる速さ 秒速 ${S.vimp ? S.vimp.toFixed(1) : '—'} km（逃げる速さ ${S.vesc ? S.vesc.toFixed(1) : '—'} km）　粒 ${(S.n || 0).toLocaleString('ja-JP')} 個`; }
function readout() {
  const r = S.res; if (!r) return;
  $('readout').innerHTML = [`地球（星）: 地球の <b>${r.Mp.toFixed(3)}</b> 倍`, `円盤: <b>月の ${(r.Md / MOON).toFixed(2)} 倍</b>（ロシュ限界より外 月の ${(r.Mout / MOON).toFixed(2)} 倍）`,
    `円盤の鉄: <b>${(100 * r.Mfe / Math.max(r.Md, 1e-9)).toFixed(1)}%</b>（本物の月の芯は 重さの数% くらいと考えられている）`, `とび出し: 地球の ${r.Mesc.toFixed(3)} 倍`,
    `地球の1日: 約 <b>${r.dayH < 100 ? r.dayH.toFixed(1) : '—'} 時間</b>（星の回る速さから。慣性の係数 0.33 は推定）`].map(s => `<span>${s}</span>`).join('');
}
function resize() {
  const r = ov.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  for (const c of [cv, ov]) if (c.width !== w || c.height !== h) { c.width = Math.max(1, w); c.height = Math.max(1, h); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const toS = (x, y) => { const ppa = Math.min(ov.clientWidth, ov.clientHeight) / 2 / S.half; return { x: ov.clientWidth / 2 + (x - S.cx) * ppa, y: ov.clientHeight / 2 - (y - S.cy) * ppa, ppa }; };
function overlay() {
  const w = ov.clientWidth, h = ov.clientHeight; g.clearRect(0, 0, w, h);
  g.font = '12px "Zen Kaku Gothic New", sans-serif';
  if (S.res && S.phase !== 'relax') { const c = toS(S.res.cx, S.res.cy);
    g.setLineDash([4, 5]); g.strokeStyle = 'rgba(127,212,255,0.55)'; g.beginPath(); g.arc(c.x, c.y, S.res.aR * c.ppa, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(127,212,255,0.8)'; g.fillText('ロシュ限界', c.x + S.res.aR * c.ppa * 0.71 + 4, c.y - S.res.aR * c.ppa * 0.71); }
  // 大きさの目安: 今の地球
  const s = toS(S.cx, S.cy); g.strokeStyle = 'rgba(232,240,244,0.35)'; g.beginPath(); g.moveTo(12, h - 40); g.lineTo(12 + s.ppa, h - 40); g.stroke();
  g.fillStyle = 'rgba(232,240,244,0.6)'; g.fillText('今の地球の半径 6371 km', 12, h - 46);
  if (fin.on && fin.sp) { g.strokeStyle = 'rgba(166,224,122,0.85)'; g.beginPath(); g.arc(fin.sp.x, fin.sp.y, 50, 0, 7); g.stroke(); }
}
// 指: 輪の中の粒を、指の動き（計算の中の時間で割った速さ）にそろえる
function tickFinger() {
  if (!fin.on || !fin.sp) { fin.prev = null; return; }
  const ppa = toS(0, 0).ppa, x = S.cx + (fin.sp.x - ov.clientWidth / 2) / ppa, y = S.cy - (fin.sp.y - ov.clientHeight / 2) / ppa;
  if (fin.prev && S.t > fin.prev.t) { const dt = S.t - fin.prev.t; fin.vx = 0.5 * fin.vx + 0.5 * (x - fin.prev.x) / dt; fin.vy = 0.5 * fin.vy + 0.5 * (y - fin.prev.y) / dt; }
  if (!fin.prev || S.t > fin.prev.t) fin.prev = { x, y, t: S.t };
  const v = Math.hypot(fin.vx, fin.vy), vmax = 2; if (v > vmax) { fin.vx *= vmax / v; fin.vy *= vmax / v; }
  Object.assign(fin, { x, y, r: 50 / ppa, invTau: 1 / (5 * S.dt) });
}
const pos = e => { const r = ov.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
ov.addEventListener('pointerdown', e => { ov.setPointerCapture?.(e.pointerId); fin.on = true; fin.sp = pos(e); fin.vx = fin.vy = 0; });
ov.addEventListener('pointermove', e => { if (fin.on) fin.sp = pos(e); });
for (const k of ['pointerup', 'pointercancel', 'pointerleave']) ov.addEventListener(k, () => { fin.on = false; });
ov.addEventListener('wheel', e => { e.preventDefault(); S.half = Math.min(30, Math.max(1.5, S.half * Math.exp(e.deltaY * 0.0012))); }, { passive: false });

const seg = (id, key, conv = Number) => { for (const b of document.querySelectorAll(`#${id} button`)) b.onclick = () => { S[key] = key === 'nPick' ? b.dataset.v : conv(b.dataset.v);
  for (const x of document.querySelectorAll(`#${id} button`)) x.classList.toggle('on', x === b); if (id !== 'sliceB') start(); }; };
seg('miB', 'Mi'); seg('thB', 'th'); seg('vB', 'vr'); seg('nB', 'nPick'); seg('sliceB', 'slice');
$('play').onclick = () => { if (S.phase === 'done') return start(); S.play = !S.play; $('play').textContent = S.play ? '❚❚ 止める' : '▶ 動かす'; };
$('toEnd').onclick = () => { S.fast = true; S.play = true; $('play').textContent = '❚❚ 止める'; };
$('reset').onclick = () => start();
$('next').onclick = () => { S.step = (S.step + 1) % TOUR.length; sayTour(); };
for (const b of document.querySelectorAll('#zoom button[data-z]')) b.onclick = () => { S.half = Math.min(30, Math.max(1.5, S.half * (b.dataset.z === 'in' ? 0.8 : 1.25))); };
requestAnimationFrame(frame);
boot().catch(e => { window.__bibaErr.push(String(e)); say('準備でエラー: ' + e.message); });
window.__bibi = { S, get sim() { return sim; }, start, analyze };
