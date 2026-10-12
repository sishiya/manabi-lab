// 目のなかの光の道 — 時間の流れ（記録・グラフ・ふりかえり・速さ）
// 毎コマの状態を記録して、網膜のぼけ・調節（ねらいと実際）・ひとみを時間で並べる。グラフをさわると、その瞬間の目に戻せる
'use strict';

const TL = { rec: [], ev: [], win: 6, lastT: -1, live: null, drag: false };
const SPEEDS = [{ v: 0.1, label: '1/10', title: 'スロー 1/10 倍' }, { v: 0.25, label: '1/4', title: 'スロー 1/4 倍' }, { v: 1, label: 'ふつう', title: 'ふつうの速さ' }, { v: 4, label: '×4', title: 'はやおくり 4 倍' }];
const WINS = [6, 30];
const COND_KEYS = ['age', 'len', 'glasses', 'light'];
const BLUR_OK = 2;   // ぼけの円 2 分（このアプリの「ぼやける」の目安）

// 見かけのひとみの直径（mm）: 虹彩のあなの半径から（stopRadiusFor はほぼ比例なので比で戻す）
let PUP_K = 0;
function pupilShown(stopR) { if (!PUP_K) PUP_K = 4 / stopRadiusFor(4); return stopR * PUP_K; }

// 切りかえの印。merge: 同じ印が続く（ドラッグ中など）ときは最初の時刻のまま
function markEvent(label, merge) {
  const e = TL.ev[TL.ev.length - 1];
  if (merge && e && e.label === label && S.t - e.touch < 1) { e.touch = S.t; return; }
  const ne = { t: S.t, touch: S.t, label };
  TL.ev.push(ne); S.ev = ne;
  if (TL.ev.length > 60) TL.ev.shift();
}

function tlRecord() {
  if (S.replay || !S.res) return;
  if (S.t - TL.lastT < 0.004) return;
  TL.lastT = S.t;
  const r = { t: S.t, d: S.d, A: S.A, At: S.At, stopR: S.stopR, blur: S.res.blurArcmin };
  for (const k of COND_KEYS) r[k] = S[k];
  TL.rec.push(r);
  const old = S.t - 40;
  if (TL.rec.length > 9000 || (TL.rec.length && TL.rec[0].t < old)) { let i = 0; while (i < TL.rec.length && (TL.rec[i].t < old || TL.rec.length - i > 9000)) i++; TL.rec.splice(0, i); }
}
function tlClear() { TL.rec.length = 0; TL.ev.length = 0; TL.lastT = -1; S.ev = null; }

// ふりかえり: 記録の1コマの状態を目にのせる（いまの状態は TL.live にとっておく）
function snapshot() { const o = { d: S.d, A: S.A, At: S.At, stopR: S.stopR }; for (const k of COND_KEYS) o[k] = S[k]; return o; }
function applySnap(o) {
  let changed = false;
  for (const k of COND_KEYS) if (S[k] !== o[k]) { S[k] = o[k]; changed = true; }
  S.d = o.d;
  if (changed) { recompute(); syncControls(); }
  S.A = o.A; S.At = o.At; S.stopR = o.stopR;
  compute();
}
function tlReplayAt(t) {
  if (!TL.rec.length) return;
  let lo = 0, hi = TL.rec.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (TL.rec[m].t < t) lo = m + 1; else hi = m; }
  if (!S.replay) TL.live = snapshot();
  S.replay = TL.rec[lo]; S.anim = null; applySnap(S.replay);
  document.getElementById('resume').hidden = false;
}
function tlResume() {
  if (!S.replay) return;
  S.replay = null; applySnap(TL.live); TL.live = null;
  document.getElementById('resume').hidden = true;
}

// グラフの配置
function tlLayout() {
  const c = document.getElementById('tl'), W = c.clientWidth, H = c.clientHeight;
  const narrow = W < 560, lx = narrow ? 46 : 74, top = 14, bot = 16, gap = 4;
  const lh = (H - top - bot - gap * 2) / 3;
  return { W, H, lx, rx: W - 8, top, lh, gap, narrow, lanes: [0, 1, 2].map(i => top + i * (lh + gap)) };
}
function tlDraw() {
  const c = document.getElementById('tl'); if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), L = tlLayout();
  if (c.width !== Math.round(L.W * dpr) || c.height !== Math.round(L.H * dpr)) { c.width = Math.round(L.W * dpr); c.height = Math.round(L.H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, L.W, L.H);
  const tEnd = TL.live ? TL.rec.length ? TL.rec[TL.rec.length - 1].t : S.t : S.t, t0 = tEnd - TL.win;
  const tx = t => L.lx + (t - t0) / TL.win * (L.rx - L.lx);
  const font = getComputedStyle(document.documentElement);
  const fb = font.getPropertyValue('--f-body'), fm = font.getPropertyValue('--f-mono');
  // 段の背景と名前
  const names = [['見え方のぼけ', 'ぼけ'], ['調節（ピント）', '調節'], ['ひとみ', 'ひとみ']];
  g.font = `11px ${fb}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    const y = L.lanes[i];
    g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(L.lx, y, L.rx - L.lx, L.lh);
    g.fillStyle = '#a3b4bf'; g.fillText(names[i][L.narrow ? 1 : 0], 4, y + L.lh / 2);
  }
  // 時刻の目盛り（いま から何秒前）
  g.font = `10px ${fm}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#7f919c';
  const step = TL.win <= 6 ? 1 : 5;
  for (let s = 0; s <= TL.win; s += step) { const x = tx(tEnd - s); g.fillRect(x - 0.5, L.H - L.top + 2 - 14, 1, 3); g.fillText(s === 0 ? 'いま' : `−${s}秒`, Math.min(L.rx - 12, Math.max(L.lx + 12, x)), L.H - 3); }
  // 切りかえの印
  g.font = `10px ${fb}`; g.textAlign = 'left';
  let leftEdge = Infinity;   // 新しい印から順に書き、文字が重なる古い印は線だけ
  for (let i = TL.ev.length - 1; i >= 0; i--) {
    const e = TL.ev[i];
    if (e.t < t0 || e.t > tEnd) continue;
    const x = tx(e.t), w = g.measureText(e.label).width, lx = Math.min(x + 3, L.rx - w);
    g.strokeStyle = 'rgba(127,212,255,0.55)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, L.top - 2); g.lineTo(x, L.H - L.top - 2); g.stroke(); g.setLineDash([]);
    if (lx + w + 6 < leftEdge) { g.fillStyle = '#7fd4ff'; g.fillText(e.label, lx, 10); leftEdge = lx; }
  }
  const rec = TL.rec; let i0 = 0;
  while (i0 < rec.length && rec[i0].t < t0) i0++;
  i0 = Math.max(0, i0 - 1);
  const line = (lane, val, lo, hi, color, dash) => {
    const y0 = L.lanes[lane], yv = v => y0 + L.lh - Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * L.lh;
    g.strokeStyle = color; g.lineWidth = dash ? 1.2 : 1.8; g.setLineDash(dash ? [4, 3] : []);
    g.beginPath(); let started = false;
    for (let i = i0; i < rec.length; i++) { const x = tx(rec[i].t), y = yv(val(rec[i])); started ? g.lineTo(x, y) : g.moveTo(x, y); started = true; }
    g.stroke(); g.setLineDash([]);
    return yv;
  };
  // ぼけ（分）: 0〜12 分を平方根の目盛りで（小さいぼけも見えるように）
  const bl = v => Math.sqrt(Math.min(12, v) / 12);
  const yb = line(0, r => bl(r.blur), 0, 1, 'rgba(0,0,0,0)', false);
  for (let i = Math.max(i0, 1); i < rec.length; i++) {
    const a = rec[i - 1], b = rec[i];
    g.strokeStyle = b.blur > BLUR_OK ? '#ffb070' : '#9be59b'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(tx(a.t), yb(bl(a.blur))); g.lineTo(tx(b.t), yb(bl(b.blur))); g.stroke();
  }
  g.strokeStyle = 'rgba(255,176,112,0.45)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(L.lx, yb(bl(BLUR_OK))); g.lineTo(L.rx, yb(bl(BLUR_OK))); g.stroke(); g.setLineDash([]);
  g.font = `10px ${fb}`; g.fillStyle = 'rgba(255,176,112,0.85)'; g.textAlign = 'right';
  if (!L.narrow) g.fillText('ぼやける目安', L.rx - 2, yb(bl(BLUR_OK)) - 3);
  // 調節（D）: ねらい（点線）と実際（実線）
  let amax = 1; for (let i = i0; i < rec.length; i++) amax = Math.max(amax, rec[i].At, rec[i].A);
  amax = Math.ceil(amax);
  line(1, r => r.At, 0, amax, 'rgba(232,240,244,0.65)', true);
  line(1, r => r.A, 0, amax, '#ffd66a', false);
  // ひとみ（mm）: 2〜8 mm
  line(2, r => pupilShown(r.stopR), 2, 8, '#7fe0ff', false);
  // 段の右上の数字（目盛り）
  g.font = `10px ${fm}`; g.fillStyle = '#7f919c'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('12分', L.lx + 3, L.lanes[0] + 1); g.fillText(`${amax} D`, L.lx + 3, L.lanes[1] + 1); g.fillText('8 mm', L.lx + 3, L.lanes[2] + 1);
  g.textBaseline = 'alphabetic';
  // ふりかえりの線
  if (S.replay) {
    const x = tx(S.replay.t);
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, L.top - 4); g.lineTo(x, L.H - L.top); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `11px ${fm}`; g.textAlign = x > L.rx - 60 ? 'right' : 'left';
    g.fillText(`−${(tEnd - S.replay.t).toFixed(2)}秒`, x + (g.textAlign === 'right' ? -4 : 4), L.lanes[1] + L.lh / 2);
  }
}

function tlInit() {
  const c = document.getElementById('tl');
  const tAt = e => { const L = tlLayout(), b = c.getBoundingClientRect(); const x = Math.max(L.lx, Math.min(L.rx, e.clientX - b.left));
    const tEnd = TL.live ? TL.rec[TL.rec.length - 1].t : S.t; return tEnd - TL.win + (x - L.lx) / (L.rx - L.lx) * TL.win; };
  c.addEventListener('pointerdown', e => { if (!TL.rec.length) return; TL.drag = true; c.setPointerCapture(e.pointerId); tlReplayAt(tAt(e)); });
  c.addEventListener('pointermove', e => { if (TL.drag) tlReplayAt(tAt(e)); });
  const end = () => { TL.drag = false; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  document.getElementById('resume').onclick = tlResume;
  const sp = document.getElementById('speeds');
  for (const s of SPEEDS) { const b = document.createElement('button'); b.textContent = s.label; b.title = s.title; b.dataset.v = s.v; b.onclick = () => { S.speed = s.v; syncControls(); }; sp.appendChild(b); }
  const wn = document.getElementById('wins');
  for (const w of WINS) { const b = document.createElement('button'); b.textContent = w + '秒'; b.dataset.v = w; b.onclick = () => { TL.win = w; syncControls(); }; wn.appendChild(b); }
}
function tlSync() {
  for (const b of document.querySelectorAll('#speeds button')) b.classList.toggle('on', +b.dataset.v === S.speed);
  for (const b of document.querySelectorAll('#wins button')) b.classList.toggle('on', +b.dataset.v === TL.win);
}
