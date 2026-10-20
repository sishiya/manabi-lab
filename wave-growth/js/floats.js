// 波が育つまで — 浮かべたブイ。その場の水の動き（FFT の海面の横と上下の変位）のとおりに動き、通った跡を残す。
// 風下へ少しずつ流される分（ストークスドリフト）は、線形の波の計算には入っていないので足す。
'use strict';
window.WGfloats = (() => {
  const MAX = 6, TRAIL = 14, STEP = 0.05;   // ブイの数・跡を残す秒数・跡の間かく（秒）
  const list = [];
  function add(x, z, t) { if (list.length >= MAX) list.shift(); list.push({ x0: x, z0: z, drift: [0, 0], trail: [], last: t, born: t }); }
  function clear() { list.length = 0; }
  // 読む点（ブイのまん中。さざ波も入れる）
  function points() { return list.map(b => ({ x: b.x0 + b.drift[0], z: b.z0 + b.drift[1], wc: 1 })); }
  // probe = 読んだ海面の動き（points と同じ順）、us = 流される速さ、dir = 波が進む向き
  function step(dt, t, probe, us, dir) {
    list.forEach((b, i) => {
      b.drift[0] += us * Math.cos(dir) * dt; b.drift[1] += us * Math.sin(dir) * dt;
      const p = probe[i]; if (!p) return;
      b.pos = [b.x0 + b.drift[0] + p.d[0], p.d[1], b.z0 + b.drift[1] + p.d[2]]; b.p = p;
      if (t - b.last >= STEP) { b.trail.push([...b.pos]); b.last = t; if (b.trail.length > TRAIL / STEP) b.trail.shift(); }
    });
  }
  return { list, add, clear, points, step, MAX };
})();
