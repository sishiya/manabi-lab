// 物理の検証（node tools/verify.js [vdp|kick]）: 保存則・1台のふれはばと振動数・2台のそろい方（論文 Pantaleone 2002 と比べる）
const P = require('../js/physics.js');
const esc = process.argv[2] || 'vdp', dt = 1 / 2000;
function run(sys, sec) { const n = Math.round(sec / dt); for (let k = 0; k < n; k++) P.rk4(sys, dt); }
const deg = a => Math.round(Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 180 / Math.PI);
console.log(`押し方 ${esc}  S=${P.S.toExponential(3)} kg·m  ω0=${P.omega0.toFixed(3)} rad/s  I=${P.I0.toExponential(3)} kg·m²`);
if (esc === 'vdp') for (const dts of [1 / 500, 1 / 2000]) {   // 1) 保存則（摩擦・駆動なし）
  const s = P.make({ n: 3, spread: 0.02 }); s.drive = false;
  s.y[2] = 0.7; s.y[4] = -0.4; s.y[6] = 0.1; s.y[7] = 2;
  const E0 = P.energy(s), p0 = P.momentum(s); let dE = 0, dp = 0;
  for (let k = 0, n = Math.round(60 / dts); k < n; k++) { P.rk4(s, dts); dE = Math.max(dE, Math.abs(P.energy(s) - E0)); dp = Math.max(dp, Math.abs(P.momentum(s) - p0)); }
  console.log(`保存 dt=${(dts * 1000).toFixed(1)}ms 60秒: エネルギー ${(dE / Math.abs(E0)).toExponential(1)}（比）  運動量 ${dp.toExponential(1)} kg·m/s`);
}
{ const s = P.make({ n: 1, esc }); s.y[2] = 0.3; let last = 0, zs = [], amp = 0;   // 2) 1台
  for (let k = 0; k < 40 / dt; k++) { P.rk4(s, dt); const th = s.y[2]; if (s.t > 30) amp = Math.max(amp, Math.abs(th)); if (last < 0 && th >= 0) zs.push(s.t); last = th; }
  const T = (zs[zs.length - 1] - zs[zs.length - 11]) / 10;
  console.log(`1台: ふれはば ${(amp * 180 / Math.PI).toFixed(1)}°  ${(60 / T).toFixed(1)} 往復/分（論文: 104 往復/分、最大のふれ約45°）`);
}
function two(opt, label, sec = 300, every = 30) {   // 3) 2台
  for (const start of ['逆向き', '同じ向き']) {
    const s = P.make(Object.assign({ n: 2, spread: 1e-3, esc }, opt));
    s.y[2] = 0.7; s.y[4] = start === '逆向き' ? -0.68 : 0.5; if (opt.pin) s.pinned = true;
    const out = []; for (let t = 0; t <= sec; t += every) { if (t) run(s, every); out.push(deg(P.phase(s, 0) - P.phase(s, 1))); }
    console.log(`${label}・${start}から`.padEnd(22), out.join(' '));
  }
}
console.log(`2台（ばらつき 0.1%）の位相差（30秒ごと、度）`);
two({}, 'ふつうの床');
two({ pin: true }, '板をおさえる');
two({ addMass: 2 }, '板に 2kg');
for (const c of [3, 15, 30]) two({ damp: c }, `板の摩擦 c=${c}`);
{ const s = P.make({ n: 5, spread: 0.01, esc }); [0.7, -0.3, 0.1, -0.7, 0.5].forEach((v, i) => s.y[2 + 2 * i] = v);   // 4) 5台
  const out = []; for (let t = 0; t <= 120; t += 15) { if (t) run(s, 15); let cx = 0, cy = 0; for (let i = 0; i < 5; i++) { const p = P.phase(s, i); cx += Math.cos(p); cy += Math.sin(p); } out.push((Math.hypot(cx, cy) / 5).toFixed(2)); }
  console.log('5台（ばらつき 1%）のそろい具合 r（15秒ごと）:', out.join(' ')); }
