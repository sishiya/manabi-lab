// ビッグバンから惑星まで — 見る位置（近くで＝いっしょに回る／全体）・指（かきまぜ）・上にかさねる 2D の絵
// 近くで: 半径 A0 の円軌道と同じ速さで回るカメラ。画面の右 = 回る向き、上 = 太陽から外向き
import { G } from './physics.js';

export const U_MAX = 6.3;  // 指の速さの上限 AU/年（地球の公転の速さ 秒速30km）
export const TAU_HAND = 0.01;   // 指につられるまでの時間（年）
export const PULL0 = 0.1, PULL_K = 0.3, PULL_MAX = 1.2;   // 指の真ん中へ引きよせる速さ AU/年 = 0.1 + 0.3 × 指の速さ、1.2 まで（止めた指で秒速 0.5 km、いちばん強くて 5.7 km）
export const RING = 80;    // 指の輪の半径 px
export const A0 = 1.0;     // 近くで見る場所（AU）
const KMS = 4.74047;       // 1 AU/年 = 4.74 km/s

export class View {
  constructor(gpuCanvas, ov) {
    this.cv = gpuCanvas; this.ov = ov; this.g = ov.getContext('2d');
    this.mode = 'near';
    this.half = 0.25;           // 画面の短い辺の半分 = 何 AU
    this.th = 0;                // カメラの角度（近くで）
    this.fin = { on: false, x: 0, y: 0, ux: 0, uy: 0, r: 0.1, invTau: 1 / TAU_HAND };
    this.ptrs = new Map(); this.pinch0 = null; this.last = null; this.sp = null;
    this.hl = null; this.fx = [];
    this.setTime(0);
    this.resize();
    const P = ov;
    P.addEventListener('pointerdown', e => this.down(e));
    P.addEventListener('pointermove', e => this.move(e));
    for (const k of ['pointerup', 'pointercancel', 'pointerleave']) P.addEventListener(k, e => this.up(e));
    P.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }
  setMode(m) { this.mode = m; this.half = m === 'near' ? 0.25 : 2.3; this.fx = []; this.setTime(this.tNow || 0); }
  resize() {
    const r = this.ov.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.dpr = dpr;
    for (const c of [this.cv, this.ov]) { c.width = Math.max(1, Math.round(this.w * dpr)); c.height = Math.max(1, Math.round(this.h * dpr)); }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // 時刻 t（年）でのカメラ: 中心 c と、画面の右 tx,ty・上 rx,ry（世界の向き）
  setTime(t) {
    this.tNow = t;
    if (this.mode === 'near') { this.th = Math.sqrt(G / A0 ** 3) * t; const c = Math.cos(this.th), s = Math.sin(this.th);
      Object.assign(this, { cx: A0 * c, cy: A0 * s, tx: -s, ty: c, rx: c, ry: s }); }
    else Object.assign(this, { cx: 0, cy: 0, tx: 1, ty: 0, rx: 0, ry: 1 });
  }
  get ppa() { return Math.min(this.w, this.h) / 2 / this.half; }   // 1 AU = 何 px
  toWorld(px, py) { const lx = (px - this.w / 2) / this.ppa, ly = -(py - this.h / 2) / this.ppa;
    return { x: this.cx + lx * this.tx + ly * this.rx, y: this.cy + lx * this.ty + ly * this.ry }; }
  toScreen(x, y) { const dx = x - this.cx, dy = y - this.cy;
    return { x: this.w / 2 + (dx * this.tx + dy * this.ty) * this.ppa, y: this.h / 2 - (dx * this.rx + dy * this.ry) * this.ppa }; }
  zoom(k) { const [lo, hi] = this.mode === 'near' ? [0.06, 0.8] : [0.4, 8]; this.half = Math.min(hi, Math.max(lo, this.half * k)); }
  // 岩の見た目の大きさ（px）: 数が多いほど・画面が小さいほど小さく、寄るほど大きく（※ 目印）
  gpuView(R0, n) {
    const s = this.ppa, base = 1.9 * Math.min(1.3, Math.max(0.5, Math.sqrt(4096 / n))) * Math.min(1, Math.min(this.w, this.h) / 560) * Math.min(3, Math.sqrt(2.3 / this.half));
    return { sx: 2 * s / this.w, sy: 2 * s / this.h, cx: this.cx, cy: this.cy, pxx: 2 / this.w, pxy: 2 / this.h, base: Math.max(0.7, base), R0,
      tx: this.tx, ty: this.ty, rx: this.rx, ry: this.ry };
  }
  pos(e) { const r = this.ov.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  down(e) {
    this.ov.setPointerCapture?.(e.pointerId);
    this.ptrs.set(e.pointerId, this.pos(e));
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), half: this.half }; this.fin.on = false; return; }
    const p = this.pos(e);
    this.sp = p; this.last = { x: p.x, y: p.y, t: performance.now() };
    Object.assign(this.fin, { on: true, ux: 0, uy: 0 });
    this.onStir?.();
  }
  move(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.set(e.pointerId, this.pos(e));
    if (this.ptrs.size === 2 && this.pinch0) { const [a, b] = [...this.ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.half = this.pinch0.half * this.pinch0.d / Math.max(10, d); this.zoom(1); return; }
    if (!this.fin.on) return;
    const p = this.pos(e); this.sp = p; this.last.t = performance.now();
  }
  up(e) {
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size < 2) this.pinch0 = null;
    if (this.ptrs.size === 0) this.fin.on = false;
  }
  // 毎コマ: 指の世界の位置（カメラが回るので、止めた指も世界では動く）。止めた指は速さが 0 へ
  tick(tSim) {
    if (!this.fin.on || !this.sp) { this.prev = null; return; }
    const w = this.toWorld(this.sp.x, this.sp.y), f = this.fin; f.x = w.x; f.y = w.y;
    // 指の動き（カメラから見て）を、計算の中の時間で割った本当の速さに（指は計算の中の物として動く）
    if (this.prev && tSim > this.prev.t) {
      const dt = tSim - this.prev.t, lx = (this.sp.x - this.prev.x) / this.ppa / dt, ly = -(this.sp.y - this.prev.y) / this.ppa / dt, k = 0.5;
      f.ux = (1 - k) * f.ux + k * (lx * this.tx + ly * this.rx);
      f.uy = (1 - k) * f.uy + k * (lx * this.ty + ly * this.ry);
      const u = Math.hypot(f.ux, f.uy); if (u > U_MAX) { f.ux *= U_MAX / u; f.uy *= U_MAX / u; }
    }
    if (!this.prev || tSim > this.prev.t) this.prev = { x: this.sp.x, y: this.sp.y, t: tSim };
    // 指そのものの速さ = 近くで: カメラといっしょに回る速さ、全体: その場所の円軌道の速さ ＋ 画面の上の動き
    const rr = Math.max(0.05, Math.hypot(w.x, w.y)), om = this.mode === 'near' ? Math.sqrt(G / A0 ** 3) : Math.sqrt(G / rr ** 3);
    f.vx = -om * w.y + f.ux; f.vy = om * w.x + f.uy;
    this.fin.r = RING / this.ppa;
    this.fin.vEdge = Math.min(PULL_MAX, PULL0 + PULL_K * Math.hypot(this.fin.ux, this.fin.uy));
  }
  // ぶつかった所（GPU から）。E = [x, y, 種類, 残った割合] × n
  addEvents(E) {
    const now = performance.now();
    for (let k = 0; k < E.length; k += 4) this.fx.push({ x: E[k], y: E[k + 1], kind: E[k + 2], f: E[k + 3], t0: now });
    if (this.fx.length > 300) this.fx.splice(0, this.fx.length - 300);
  }

  drawOverlay(hint) {
    const g = this.g, w = this.w, h = this.h, now = performance.now(), near = this.mode === 'near';
    g.clearRect(0, 0, w, h);
    if (this.under) this.under(g);   // 記録の再生の岩（replay.js）
    g.font = '12px "Zen Kaku Gothic New", sans-serif';
    // 軌道の目印（※ 目印）: 今の水星・金星・地球・火星
    const sun = this.toScreen(0, 0);
    g.lineWidth = 1; g.setLineDash([3, 5]);
    for (const [a, name] of [[0.39, '水星'], [0.72, '金星'], [1.0, '地球'], [1.52, '火星']]) {
      const R = a * this.ppa;
      g.strokeStyle = 'rgba(127,212,255,0.22)'; g.beginPath(); g.arc(sun.x, sun.y, R, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(127,212,255,0.55)';
      if (near) { const y = sun.y - R; if (y > 14 && y < h - 30) g.fillText(`今の${name}の軌道`, 10, y - 4); }
      else g.fillText(name, sun.x + R * 0.707 + 3, sun.y - R * 0.707 - 3);
    }
    g.setLineDash([]);
    if (near) {
      g.fillStyle = 'rgba(255,200,90,0.85)'; g.textAlign = 'center';
      const narrow = w < 560;
      g.fillText('↓ 太陽はこちら（1億5千万 km 先）', w / 2, h - (narrow ? 58 : 30));
      g.fillStyle = 'rgba(232,240,244,0.55)';
      g.fillText('内側の岩は追いこす →　　← 外側の岩は遅れる', w / 2, narrow ? h - 78 : 46); g.textAlign = 'left';
    } else {
      const rg = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 16);
      rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.4, 'rgba(255,200,90,0.9)'); rg.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(sun.x, sun.y, 16, 0, Math.PI * 2); g.fill();
    }
    // ぶつかった所の印（1.6 秒で消える）。近くでは文字も（新しい 4 つまで）
    this.fx = this.fx.filter(e => now - e.t0 < 1600);
    let labels = 0;
    for (let k = this.fx.length - 1; k >= 0; k--) {
      const e = this.fx[k], s = this.toScreen(e.x, e.y), a = 1 - (now - e.t0) / 1600;
      if (s.x < -20 || s.y < -20 || s.x > w + 20 || s.y > h + 20) continue;
      const broke = e.kind > 1.5, col = broke ? '255,140,70' : '166,224,122', R = (near ? 10 : 5) + (1 - a) * (near ? 22 : 10);
      g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = 2;
      if (broke) { for (let q = 0; q < 8; q++) { const an = q * Math.PI / 4; g.beginPath(); g.moveTo(s.x + Math.cos(an) * R * 0.5, s.y + Math.sin(an) * R * 0.5); g.lineTo(s.x + Math.cos(an) * R, s.y + Math.sin(an) * R); g.stroke(); } }
      else { g.beginPath(); g.arc(s.x, s.y, R, 0, Math.PI * 2); g.stroke(); }
      if (near && labels < 4) { labels++; g.fillStyle = `rgba(${col},${a})`; g.font = 'bold 13px "Zen Kaku Gothic New", sans-serif';
        g.fillText(broke ? `砕けた（${Math.round(e.f * 100)}% 残る）` : 'くっついた', s.x + R + 3, s.y - 3); g.font = '12px "Zen Kaku Gothic New", sans-serif'; }
    }
    // 目立たせる岩
    if (this.hl) { const s = this.toScreen(this.hl.x, this.hl.y);
      g.strokeStyle = '#ffb35a'; g.lineWidth = 2; g.beginPath(); g.arc(s.x, s.y, 14, 0, Math.PI * 2); g.stroke();
      if (this.hl.label) { g.fillStyle = '#ffb35a'; g.fillText(this.hl.label, s.x + 17, s.y + 4); } }
    // 指の輪と速さ（いっしょに回る流れから、どれだけ速く押しているか）
    if (this.fin.on && this.sp) { const s = this.sp, u = 2 * (this.fin.vEdge || PULL0) * KMS, hard = u > 1.5;
      g.strokeStyle = hard ? 'rgba(255,154,107,0.9)' : 'rgba(166,224,122,0.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(s.x, s.y, RING, 0, Math.PI * 2); g.stroke();
      for (let q = 0; q < 6; q++) { const an = q * Math.PI / 3 + now / 600, r0 = RING - 4, r1 = RING - 14;   // 真ん中へ引く矢じるし
        g.beginPath(); g.moveTo(s.x + Math.cos(an) * r0, s.y + Math.sin(an) * r0); g.lineTo(s.x + Math.cos(an) * r1, s.y + Math.sin(an) * r1); g.stroke(); }
      g.fillStyle = hard ? '#ff9a6b' : '#a6e07a'; g.font = 'bold 13px "Zen Kaku Gothic New", sans-serif';
      const txt = `寄せる速さ 秒速 ${u.toFixed(1)} km（${hard ? '速い → 砕けやすい' : 'ゆっくり → くっつきやすい'}）`, tw = g.measureText(txt).width;
      g.fillText(txt, Math.max(6, Math.min(w - tw - 6, s.x - tw / 2)), s.y - RING - 8 < 62 ? s.y + RING + 18 : s.y - RING - 8); }
    if (hint) { g.fillStyle = 'rgba(232,240,244,0.8)'; g.font = '13px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
      g.fillText(hint, w / 2, near ? h - 50 : h - 12); g.textAlign = 'left'; }
  }
}
