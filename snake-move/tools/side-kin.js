// 横ばいの測り方: 跡と進む向きの角度・止まっている所の割合（速さが体の速さの1割以下）・跡の長さ・体の向きと進む向き
const G = require('../js/ground.js');
module.exports = function sk(o, label) {
  const base = { gait: 'side', L: 0.48, mass: 0.098, tau: 2, k: 4, alpha: 18, surf: 'same', contact: 0.3, delta: 1.51 };
  const s = G.make(Object.assign({}, base, o)), dt = 0.01, N = G.N;
  for (let t = 0; t < 4; t += dt) G.step(s, dt);
  const x0 = s.X, y0 = s.Y; let cx = 0, cy = 0, sl = 0, sw = 0, still = 0, n = 0, thx = 0, thy = 0;
  const tr = new Map();
  for (let t = 0; t < 8; t += dt) {
    G.step(s, dt);
    thx += Math.cos(2 * s.TH); thy += Math.sin(2 * s.TH);
    for (let i = 0; i < N; i++) if (s.nu[i] > 0) { const w = s.nu[i], a = 2 * Math.atan2(s.ty[i], s.tx[i]); cx += w * Math.cos(a); cy += w * Math.sin(a); sl += w * Math.hypot(s.vx[i], s.vy[i]); sw += w; }
  }
  const dx = s.X - x0, dy = s.Y - y0, v = Math.hypot(dx, dy) / 8, dir = Math.atan2(dy, dx);
  for (let i = 0; i < N; i++) { n++; if (Math.hypot(s.vx[i], s.vy[i]) < 0.1 * v) still++; }
  // 止まっている割合を時間平均で
  let st = 0, cnt = 0;
  for (let t = 0; t < 2; t += dt) { G.step(s, dt); for (let i = 0; i < N; i++) { cnt++; if (Math.hypot(s.vx[i], s.vy[i]) < 0.1 * v) st++; } }
  const ang = d => { let a = Math.abs(d * 180 / Math.PI) % 180; return a > 90 ? 180 - a : a; };
  console.log(`${label.padEnd(18)} 速さ ${(v * s.p.tau / s.p.L).toFixed(2)} L/周期  跡と進む向き ${ang(dir - Math.atan2(cy, cx) / 2).toFixed(0)}°  体の向きと進む向き ${ang(dir - Math.atan2(thy, thx) / 2).toFixed(0)}°  止まっている所 ${(st / cnt * 100).toFixed(0)}%  ふれている所のすべり ${(sl / sw / v * 100).toFixed(0)}%`);
};
if (require.main === module) {
  const sk = module.exports;
  for (const c of [0.3, 0.44, 0.5]) for (const a of [10, 14, 18]) sk({ contact: c, alpha: a }, `ふれる${c} α${a}`);
}
