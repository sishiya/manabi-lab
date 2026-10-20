// ビッグバンから惑星まで — 見る位置（拡大）・指（かきまぜ）・上にかさねる 2D の絵（太陽・軌道の目印・指の輪）
export const HAND = 0.5;   // 指の速さ: 画面の上の 1 AU/秒 → 0.5 AU/年（1 秒で 1 周、半径 1.4 AU をなでると、地球の公転の約半分の速さ）
export const U_MAX = 6.3;  // 指の速さの上限 AU/年（地球の公転の速さ 秒速30km）
export const TAU_HAND = 0.01;   // 指につられるまでの時間（年）

export class View {
  constructor(gpuCanvas, ov) {
    this.cv = gpuCanvas; this.ov = ov; this.g = ov.getContext('2d');
    this.half = 2.3;            // 画面の短い辺の半分 = 何 AU
    this.cx = 0; this.cy = 0;
    this.fin = { on: false, x: 0, y: 0, ux: 0, uy: 0, r: 0.15, invTau: 1 / TAU_HAND };
    this.ptrs = new Map(); this.pinch0 = null; this.last = null;
    this.hl = null;             // 目立たせる岩 {x, y, label}
    this.resize();
    const P = ov;
    P.addEventListener('pointerdown', e => this.down(e));
    P.addEventListener('pointermove', e => this.move(e));
    for (const k of ['pointerup', 'pointercancel', 'pointerleave']) P.addEventListener(k, e => this.up(e));
    P.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }
  resize() {
    const r = this.ov.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.dpr = dpr;
    for (const c of [this.cv, this.ov]) { c.width = Math.max(1, Math.round(this.w * dpr)); c.height = Math.max(1, Math.round(this.h * dpr)); }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  get ppa() { return Math.min(this.w, this.h) / 2 / this.half; }   // 1 AU = 何 px
  toWorld(px, py) { return { x: this.cx + (px - this.w / 2) / this.ppa, y: this.cy - (py - this.h / 2) / this.ppa }; }
  toScreen(x, y) { return { x: this.w / 2 + (x - this.cx) * this.ppa, y: this.h / 2 - (y - this.cy) * this.ppa }; }
  zoom(k) { this.half = Math.min(8, Math.max(0.4, this.half * k)); }
  // 岩の見た目の大きさ（px）: 数が多いほど・画面が小さいほど小さく（※ 目印）
  gpuView(R0, n) {
    const s = this.ppa, base = 1.9 * Math.min(1.3, Math.max(0.5, Math.sqrt(4096 / n))) * Math.min(1, Math.min(this.w, this.h) / 560) * Math.sqrt(2.3 / this.half);
    return { sx: 2 * s / this.w, sy: 2 * s / this.h, cx: this.cx, cy: this.cy, pxx: 2 / this.w, pxy: 2 / this.h, base: Math.max(0.7, base), R0 };
  }
  pos(e) { const r = this.ov.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  down(e) {
    this.ov.setPointerCapture?.(e.pointerId);
    this.ptrs.set(e.pointerId, this.pos(e));
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), half: this.half }; this.fin.on = false; return; }
    const p = this.pos(e), w = this.toWorld(p.x, p.y);
    this.last = { x: w.x, y: w.y, t: performance.now() };
    Object.assign(this.fin, { on: true, x: w.x, y: w.y, ux: 0, uy: 0 });
    this.onStir?.();
  }
  move(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.set(e.pointerId, this.pos(e));
    if (this.ptrs.size === 2 && this.pinch0) { const [a, b] = [...this.ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.half = Math.min(8, Math.max(0.4, this.pinch0.half * this.pinch0.d / Math.max(10, d))); return; }
    if (!this.fin.on) return;
    const p = this.pos(e), w = this.toWorld(p.x, p.y), now = performance.now();
    const dt = Math.max(0.008, (now - this.last.t) / 1000);
    const k = 0.5;   // 指の速さをならす
    this.fin.ux = (1 - k) * this.fin.ux + k * HAND * (w.x - this.last.x) / dt;
    this.fin.uy = (1 - k) * this.fin.uy + k * HAND * (w.y - this.last.y) / dt;
    const u = Math.hypot(this.fin.ux, this.fin.uy);
    if (u > U_MAX) { this.fin.ux *= U_MAX / u; this.fin.uy *= U_MAX / u; }
    this.fin.x = w.x; this.fin.y = w.y; this.last = { x: w.x, y: w.y, t: now };
  }
  up(e) {
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size < 2) this.pinch0 = null;
    if (this.ptrs.size === 0) this.fin.on = false;
  }
  // 止めた指は、速さがだんだん 0 に（そのまま押さえると岩をつかんで止める）
  tick() { if (this.fin.on && performance.now() - this.last.t > 60) { this.fin.ux *= 0.8; this.fin.uy *= 0.8; } }
  fingerRadius() { this.fin.r = 34 / this.ppa; return this.fin.r; }

  drawOverlay(hint) {
    const g = this.g, w = this.w, h = this.h;
    g.clearRect(0, 0, w, h);
    // 軌道の目印（※ 目印）: 今の水星・金星・地球・火星
    const sun = this.toScreen(0, 0);
    g.lineWidth = 1; g.setLineDash([3, 5]);
    for (const [a, name] of [[0.39, '水星'], [0.72, '金星'], [1.0, '地球'], [1.52, '火星']]) {
      g.strokeStyle = 'rgba(127,212,255,0.18)'; g.beginPath(); g.arc(sun.x, sun.y, a * this.ppa, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(127,212,255,0.45)'; g.font = '11px "Zen Kaku Gothic New", sans-serif';
      g.fillText(name, sun.x + a * this.ppa * 0.707 + 3, sun.y - a * this.ppa * 0.707 - 3);
    }
    g.setLineDash([]);
    // 太陽（※ 目印の大きさ）
    const rg = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 16);
    rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.4, 'rgba(255,200,90,0.9)'); rg.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(sun.x, sun.y, 16, 0, Math.PI * 2); g.fill();
    // 目立たせる岩
    if (this.hl) { const s = this.toScreen(this.hl.x, this.hl.y);
      g.strokeStyle = '#ffb35a'; g.lineWidth = 2; g.beginPath(); g.arc(s.x, s.y, 14, 0, Math.PI * 2); g.stroke();
      if (this.hl.label) { g.fillStyle = '#ffb35a'; g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.fillText(this.hl.label, s.x + 17, s.y + 4); } }
    // 指の輪
    if (this.fin.on) { const s = this.toScreen(this.fin.x, this.fin.y);
      g.strokeStyle = 'rgba(166,224,122,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(s.x, s.y, this.fin.r * this.ppa, 0, Math.PI * 2); g.stroke(); }
    if (hint) { g.fillStyle = 'rgba(232,240,244,0.75)'; g.font = '13px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
      g.fillText(hint, w / 2, h - 12); g.textAlign = 'left'; }
  }
}
