// ビッグバンから惑星まで — 場面③ 星のゆりかご: ガスの雲が自分の重さでつぶれ、いくつもの星に分かれる
import { getDevice } from './gpu.js';
import { SphSim } from './sph.js';
import { makeCloud, rhoSink, sinks, CS, RHO_C, RACC, BD, TU, YR, VU, RHOU } from './cloud-model.js';
import { drawNav } from './nav.js';

window.__bibaErr = [];
window.addEventListener('error', e => window.__bibaErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__bibaErr.push(String(e.reason)));
const $ = id => document.getElementById(id);
drawNav($('scenes'));

const S = { turb: 0.1, zoomed: false, nPick: 'auto', play: true, fast: false, phase: 'boot', t: 0, dt: 0.01, half: 4.6, frame: 0, step: -1, sk: null, tff: 1.2 };
let dev = null, sim = null; const cv = $('cv'), ov = $('ov'), g = ov.getContext('2d');
const fin = { on: false, x: 0, y: 0, vx: 0, vy: 0, r: 0.5, invTau: 0, sp: null, prev: null };
const yrs = t => { const y = t * TU / YR; return y < 1e4 ? `${Math.round(y).toLocaleString('ja-JP')} 年` : `${(y / 1e4).toFixed(1)} 万年`; };

const TOUR = [
  () => `太陽の 50 倍の重さの <b>ガスの雲</b>（さしわたし 7万7千 AU ＝ 0.375 パーセク、温度 10 K）。雲の中は <b>乱れて</b> 渦を巻いています。`,
  () => `重力で <b>自分の重さでつぶれ</b>はじめる。乱れのぶつかる所が濃い <b>すじ</b> になり、すじの中で もっと濃い かたまりができます。`,
  () => `とても濃くなった所は <b>星の種</b>（光る点）。まわりのガスを取りこんで重くなります。`,
  () => `太陽の 0.08 倍より重い種は、真ん中が熱くなって <b>光る星</b> に（白）。軽いものは <b>褐色矮星</b>（赤茶）。光るかどうかは決まり（核融合は計算していない）。`,
  () => `1つの雲から、<b>たくさんの星が群れで</b>生まれる。太陽もこうして、兄弟の星といっしょに生まれたと考えられています。`,
];
function say(html) { $('say').innerHTML = html; }
function sayTour() { say(S.step < 0 ? (S.phase === 'done' ? conclusion() : 'ガスの雲が自分の重さでつぶれて、星が生まれる。<b>「つぎへ」</b>で案内、<b>「結末へ」</b>で早送り。図をなぞると雲をかきまぜられます。') : `<span class="n">${S.step + 1}/${TOUR.length}</span>` + TOUR[S.step]()); }
function counts() { const L = S.sk ? S.sk.list : []; return { stars: L.filter(s => s.m >= BD).length, bds: L.filter(s => s.m < BD).length, inS: L.reduce((a, s) => a + s.m, 0), big: L[0]?.m || 0 }; }
function conclusion() {
  const c = counts();
  return `結末（${yrs(S.t)}・つぶれる時間の ${(S.t / S.tff).toFixed(1)} 倍）: <b>光る星 ${c.stars} 個</b>・褐色矮星 ${c.bds} 個。ガスの ${(100 * c.inS / 50).toFixed(0)}% が星に。いちばん重い星は太陽の ${c.big.toFixed(2)} 倍。研究（粒 350万個）では、同じころ 星 23・褐色矮星 18（Bate ほか 2003）。粒が少ないと、小さい星を見分けられず 数が少なく出ます。`;
}

async function boot() {
  const r = await getDevice();
  if (r.err) { say(`この端末・ブラウザでは <b>WebGPU</b> が使えないため、この場面は計算できません（${r.err}）。`); for (const b of document.querySelectorAll('button')) b.disabled = true; return; }
  dev = r.device; dev.addEventListener?.('uncapturederror', e => window.__bibaErr.push('gpu: ' + e.error.message));
  const c = makeCloud(8192), t = new SphSim(dev, null, 8192); t.load(c.X); t.set({ mode: 1, gas: [CS * CS, RHO_C, 1.4, 1e30], dt: 0.001 }); t.prime(); await dev.queue.onSubmittedWorkDone();
  const t0 = performance.now(); t.frame(4); await dev.queue.onSubmittedWorkDone(); const ms = (performance.now() - t0) / 4; t.destroy();
  const phone = matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 700;
  S.nAuto = ms < 2.5 && !phone ? 16384 : ms < 8 && !phone ? 8192 : 4096;
  $('nAuto').textContent = `自動（${S.nAuto.toLocaleString('ja-JP')}）`;
  start();
}
function start() {
  if (!dev) return;
  if (sim) sim.destroy();
  const N = S.nPick === 'auto' ? S.nAuto : +S.nPick, c = makeCloud(N, 7, S.turb);
  sim = new SphSim(dev, cv, N);
  S.rs = rhoSink(c.m);
  sim.set({ mode: 1, gas: [CS * CS, RHO_C, 1.4, S.rs], racc: RACC, G: 1, damp: 1, hmax: 3 }); sim.load(c.X, { dtMax: 0.004, courant: 0.25 });
  sim.prime();
  Object.assign(S, { phase: 'run', t: 0, half: 4.6, zoomed: false, n: N, m: c.m, rho0: c.rho0, tff: c.tff, tEnd: 1.4 * c.tff, sk: null, frame: 0, play: true, fast: false, dt: 0.004 });
  $('play').textContent = '❚❚ 止める'; sayTour();
}

let lastT = performance.now();
function frame(now) {
  lastT = now; resize();
  if (sim && S.phase !== 'boot') {
    const sub = S.play && S.phase === 'run' ? (S.fast ? 16 : 5) : 0;
    tickFinger();
    const ppa = Math.min(ov.clientWidth, ov.clientHeight) / 2 / S.half;
    sim.setView([2 * ppa / ov.clientWidth, 2 * ppa / ov.clientHeight, 0, 0, 2 / ov.clientWidth, 2 / ov.clientHeight, 0.7 * ppa, 1.0, 0, 0, 1, S.rho0, 0, 0, 0, 0]);
    const job = sim.frame(sub, { fin: fin.on ? fin : null, read: S.frame % 6 === 0 });
    S.frame++;   // 時刻は GPU が数える（読み出したときに S.t へ）
    if (job) job.catch(() => null).then(X => { if (!X) return; S.dt = X.ts[0]; S.t = X.ts[1]; S.sk = sinks(X, S.n); let mx = 0; for (let i = 0; i < S.n; i++) if (X[i * 16 + 3] > 0 && X[i * 16 + 14] < 1.5) mx = Math.max(mx, X[i * 16 + 13]); S.rhoMax = mx; autoZoom(); readout(); });
    if (S.phase === 'run' && S.t >= S.tEnd) { S.phase = 'done'; S.play = false; S.fast = false; $('play').textContent = '▶ 動かす'; S.step = -1; }
    if (S.frame % 10 === 0) { sayTour(); ruler(); }
  }
  overlay(); requestAnimationFrame(frame);
}
// 星ができたら、星の群れが入る大きさへ ゆっくり寄る（自分で拡大したら やめる）
function autoZoom() {
  const L = S.sk && S.sk.list; if (S.zoomed || !L || L.length < 2) return;
  const r = Math.sqrt(L.reduce((a, s) => a + s.x * s.x + s.y * s.y, 0) / L.length);
  S.half += 0.3 * (Math.min(4.6, Math.max(0.4, 2.2 * r)) - S.half);
}
function ruler() { const c = counts(); $('ruler').innerHTML = `<span class="big">${yrs(S.t)}</span>　つぶれる時間の ${(S.t / S.tff).toFixed(2)} 倍　光る星 ${c.stars}・褐色矮星 ${c.bds}　粒 ${(S.n || 0).toLocaleString('ja-JP')} 個`; }
function readout() {
  const c = counts(), L = S.sk.list;
  $('readout').innerHTML = [`光る星 <b>${c.stars}</b> 個・褐色矮星 <b>${c.bds}</b> 個（太陽の 0.08 倍で分ける）`, `星になったガス: <b>${(100 * c.inS / 50).toFixed(1)}%</b>`,
    `星の種の重さ（太陽 = 1、重い順）: ${L.slice(0, 12).map(s => s.m.toFixed(2)).join('・') || 'まだない'}`,
    `星の種ができる濃さ: ${(S.rs * RHOU).toExponential(1)} g/cm³（研究は 10⁻¹¹）・取りこむ半径 200 AU（研究は 5 AU）`].map(s => `<span>${s}</span>`).join('');
}
function resize() {
  const r = ov.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  for (const c of [cv, ov]) if (c.width !== w || c.height !== h) { c.width = Math.max(1, w); c.height = Math.max(1, h); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const ppaOf = () => Math.min(ov.clientWidth, ov.clientHeight) / 2 / S.half;
function overlay() {
  const w = ov.clientWidth, h = ov.clientHeight; g.clearRect(0, 0, w, h); g.font = '12px "Zen Kaku Gothic New", sans-serif';
  const ppa = ppaOf(), au = 1e4 / 1e4;   // 1万 AU の物差し
  g.strokeStyle = 'rgba(232,240,244,0.4)'; g.beginPath(); g.moveTo(12, h - 40); g.lineTo(12 + ppa, h - 40); g.stroke();
  g.fillStyle = 'rgba(232,240,244,0.65)'; g.fillText('1万 AU（太陽から海王星の 330 倍）', 12, h - 46);
  if (S.sk) { g.font = 'bold 11px "Zen Kaku Gothic New", sans-serif';
    const used = []; S.sk.list.slice(0, 8).forEach(s => { if (s.m < 0.3) return; const x = w / 2 + s.x * ppa, y = h / 2 - s.y * ppa; if (used.some(u => Math.abs(u[0] - x) < 90 && Math.abs(u[1] - y) < 16)) return; used.push([x, y]); g.fillStyle = s.m >= BD ? '#ffe9b0' : '#d08060'; g.fillText(`太陽の ${s.m.toFixed(1)} 倍`, x + 9, y - 6); }); }   // 名札は重ならないものだけ
  if (fin.on && fin.sp) { g.strokeStyle = 'rgba(166,224,122,0.85)'; g.beginPath(); g.arc(fin.sp.x, fin.sp.y, 50, 0, 7); g.stroke(); }
}
function tickFinger() {
  if (!fin.on || !fin.sp) { fin.prev = null; return; }
  const ppa = ppaOf(), x = (fin.sp.x - ov.clientWidth / 2) / ppa, y = -(fin.sp.y - ov.clientHeight / 2) / ppa;
  if (fin.prev && S.t > fin.prev.t) { const dt = S.t - fin.prev.t; fin.vx = 0.5 * fin.vx + 0.5 * (x - fin.prev.x) / dt; fin.vy = 0.5 * fin.vy + 0.5 * (y - fin.prev.y) / dt; }
  if (!fin.prev || S.t > fin.prev.t) fin.prev = { x, y, t: S.t };
  const v = Math.hypot(fin.vx, fin.vy), vmax = 15; if (v > vmax) { fin.vx *= vmax / v; fin.vy *= vmax / v; }
  Object.assign(fin, { x, y, r: 50 / ppa, invTau: 1 / (5 * S.dt) });
}
const pos = e => { const r = ov.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
ov.addEventListener('pointerdown', e => { ov.setPointerCapture?.(e.pointerId); fin.on = true; fin.sp = pos(e); fin.vx = fin.vy = 0; });
ov.addEventListener('pointermove', e => { if (fin.on) fin.sp = pos(e); });
for (const k of ['pointerup', 'pointercancel', 'pointerleave']) ov.addEventListener(k, () => { fin.on = false; });
ov.addEventListener('wheel', e => { e.preventDefault(); S.zoomed = true; S.half = Math.min(12, Math.max(0.3, S.half * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
const seg = (id, key) => { for (const b of document.querySelectorAll(`#${id} button`)) b.onclick = () => { S[key] = key === 'nPick' ? b.dataset.v : +b.dataset.v;
  for (const x of document.querySelectorAll(`#${id} button`)) x.classList.toggle('on', x === b); start(); }; };
seg('tB', 'turb'); seg('nB', 'nPick');
$('play').onclick = () => { if (S.phase === 'done') return start(); S.play = !S.play; $('play').textContent = S.play ? '❚❚ 止める' : '▶ 動かす'; };
$('toEnd').onclick = () => { S.fast = true; S.play = true; $('play').textContent = '❚❚ 止める'; };
$('reset').onclick = () => start();
$('next').onclick = () => { S.step = (S.step + 1) % TOUR.length; sayTour(); };
for (const b of document.querySelectorAll('#zoom button[data-z]')) b.onclick = () => { S.zoomed = true; S.half = Math.min(12, Math.max(0.3, S.half * (b.dataset.z === 'in' ? 0.8 : 1.25))); };
requestAnimationFrame(frame);
boot().catch(e => { window.__bibaErr.push(String(e)); say('準備でエラー: ' + e.message); });
window.__bibc = { S, get sim() { return sim; }, start };
