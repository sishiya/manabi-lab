// ビッグバンから惑星まで — 記録の再生（このPCで前もって計算した1本。WebGPU のない端末でも 2D で描ける）
// コマのあいだは、岩それぞれをその場所の円軌道の速さで回して うめる（※ 近似）
import { G, MEARTH, MSUN, radiusAU } from './physics.js';
import { decodeFrame, fullToBodies } from './record-format.js';

const ME = MEARTH / MSUN;
export class Replay {
  constructor(base) { this.base = base; this.idx = null; this.cache = new Map(); this.full = null; }
  async load() {
    const [j, b] = await Promise.all([fetch(this.base + '.json').then(r => { if (!r.ok) throw new Error('記録がありません'); return r.json(); }),
      fetch(this.base + '-frames.bin').then(r => r.arrayBuffer())]);
    this.idx = j; this.buf = b; this.T = j.frames.map(f => f.t); this.end = this.T[this.T.length - 1];
    this.m0 = 2 * Math.PI * 71 * 1.495978707e11 ** 2 * 2 * (Math.sqrt(2) - Math.sqrt(0.4)) / MSUN / j.n;   // physics.js の solidMassKg と同じ
    this.R0 = radiusAU(this.m0);
    return this;
  }
  // 時間のつまみ（0〜1）⇔ 年（対数: 1 年から先は同じ比で）
  tOf(s) { return s <= 0 ? 0 : Math.pow(this.end + 1, s) - 1; }
  sOf(t) { return t <= 0 ? 0 : Math.log(t + 1) / Math.log(this.end + 1); }
  kAt(t) { let lo = 0, hi = this.T.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.T[m] <= t) lo = m; else hi = m - 1; } return lo; }
  frame(k) {
    if (!this.cache.has(k)) { const f = this.idx.frames[k]; this.cache.set(k, decodeFrame(this.buf, f.off, f.n)); if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value); }
    return this.cache.get(k);
  }
  info(t) { const k = this.kAt(t), f = this.idx.frames[k]; return { k, n: f.n, big: f.big, c: f.c, fr: this.frame(k), tk: f.t }; }
  // いちばん大きい岩（重さ・場所・温度）
  top(t, m = 6) {
    const { fr, tk } = this.info(t), ids = Array.from({ length: fr.k }, (_, i) => i).sort((a, b) => fr.m[b] - fr.m[a]).slice(0, m);
    return ids.map(i => { const [x, y] = this.pos(fr, i, t - tk); return { m: fr.m[i], x, y, r: Math.hypot(x, y), T: fr.T[i] }; });
  }
  pos(fr, i, dt) {
    const x = fr.x[i], y = fr.y[i], r = Math.max(0.05, Math.hypot(x, y)), a = Math.sqrt(G / r ** 3) * dt, c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
  }
  // 2D で描く（色・大きさは GPU の描画と同じ決まり）
  draw(g, view, t, base) {
    const { fr, tk } = this.info(t), dt = t - tk;
    for (let i = 0; i < fr.k; i++) {
      const [x, y] = this.pos(fr, i, dt), s = view.toScreen(x, y);
      if (s.x < -30 || s.y < -30 || s.x > view.w + 30 || s.y > view.h + 30) continue;
      const T = fr.T[i], glow = Math.min(1, Math.max(0, (T - 1200) / 1500));
      const r = Math.max(0.7, base * Math.cbrt(fr.m[i] / this.m0));
      if (glow > 0) { g.fillStyle = `rgba(255,150,60,${0.25 * glow})`; g.beginPath(); g.arc(s.x, s.y, r * 2.6, 0, 7); g.fill(); }
      g.fillStyle = tcol(T); g.beginPath(); g.arc(s.x, s.y, r, 0, 7); g.fill();
    }
  }
  // 分かれる: t より前でいちばん近い完全な記録を、GPU に入れる形で
  async branch(t, seats) {
    if (!this.full) this.full = await fetch(this.base + '-full.bin').then(r => r.arrayBuffer());
    const L = this.idx.full; let k = 0; for (let i = 0; i < L.length; i++) if (L[i].t <= t + 1e-6) k = i;
    const f = L[k], n = Math.max(seats || 0, 256, 1 << Math.ceil(Math.log2(f.n * 1.5)));
    return { B: fullToBodies(this.full, f.off, f.n, n), n, t: f.t, F: this.idx.F, m0: this.m0, R0: this.R0 };
  }
}
export const meOf = m => m / ME;
function tcol(T) {
  const L = (a, b, k) => a.map((v, i) => Math.round(255 * (v + (b[i] - v) * Math.min(1, Math.max(0, k)))));
  const rock = [0.70, 0.75, 0.82], warm = [0.80, 0.30, 0.16], hot = [1.0, 0.58, 0.20], white = [1.0, 0.95, 0.82];
  const c = T < 500 ? L(rock, rock, 0) : T < 1500 ? L(rock, warm, (T - 500) / 1000) : T < 2500 ? L(warm, hot, (T - 1500) / 1000) : L(hot, white, (T - 2500) / 1500);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
