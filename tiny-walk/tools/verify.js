// 物理の確かめ（node tiny-walk/tools/verify.js）。数値の道すじを、教科書の式（解析解）と答え合わせする。
'use strict';
const P = require('../js/phys.js');
let ng = 0;
const ok = (name, got, want, tol) => {
  const e = Math.abs(got - want) / Math.abs(want), pass = e <= tol;
  if (!pass) ng++;
  console.log((pass ? 'OK  ' : 'NG  ') + name + ': ' + got.toPrecision(6) + '（式 ' + want.toPrecision(6) + '、ずれ ' + (e * 100).toExponential(1) + '%）');
};
const sphere = R => () => R;

console.log('ω0 = ' + P.W0.toExponential(4) + ' /s、すれすれ一周 ' + (P.T0 / 60).toFixed(2) + ' 分');
ok('地球の重力 g', P.at(P.RE).g, 9.82, 0.005);

// 1. 一周の時間はどの大きさでも同じ（空気なし・高さ 1.5 m から水平に一周の速さで）
for (const R of [100, 1000, 1e5, P.RE]) {
  const r0 = R + 1.5, v = Math.sqrt(P.W0 * P.W0 * R * R * R / r0);
  const tr = P.fly([0, r0, 0], [v, 0, 0], { R, air: false, body: P.BALL, surf: sphere(R) });
  const want = P.T0 * Math.pow(r0 / R, 1.5);
  console.log('   R=' + R + ' m: 終わり方 ' + tr.end + '、点の数 ' + tr.n);
  ok('一周の時間 R=' + R, tr.T, want, 2e-3);
}
// 2. 地球での放物線（空気なし）: 距離 v² sin2θ/g、時間 2v sinθ/g
{
  const R = P.RE, g = P.at(R).g, v = 20, a = Math.PI / 4;
  const tr = P.fly([0, R, 0], [v * Math.cos(a), v * Math.sin(a), 0], { R, air: false, body: P.BODY, surf: sphere(R) });
  const e = tr.p.slice(-3), dist = R * Math.atan2(e[0], e[1]);
  ok('放物線の距離（地球・20 m/s・45°）', dist, v * v / g, 2e-3);
  ok('放物線の時間', tr.T, 2 * v * Math.sin(a) / g, 2e-3);
}
// 3. 真上に投げた高さ（半径 1 km、エネルギーの式 1/r = 1/R − v²/2μ）
{
  const R = 1000, v = 1.0, mu = P.W0 * P.W0 * R ** 3;
  const tr = P.fly([0, R, 0], [0, v, 0], { R, air: false, body: P.BODY, surf: sphere(R) });
  ok('真上 1 m/s の高さ（R=1 km）', tr.rMax - R, 1 / (1 / R - v * v / (2 * mu)) - R, 2e-3);
  console.log('   終わり方 ' + tr.end + '、時間 ' + (tr.T / 60).toFixed(1) + ' 分');
}
// 4. 飛び出す速さのしきい（R=1 km: √2·ω0·R）
{
  const R = 1000, ve = P.at(R).vEsc;
  const lo = P.fly([0, R, 0], [0, ve * 0.98, 0], { R, air: false, body: P.BODY, surf: sphere(R) });
  const hi = P.fly([0, R, 0], [0, ve * 1.02, 0], { R, air: false, body: P.BODY, surf: sphere(R) });
  const pass = lo.end === 'land' && hi.end === 'escape'; if (!pass) ng++;
  console.log((pass ? 'OK  ' : 'NG  ') + '飛び出す速さ ' + ve.toFixed(3) + ' m/s の 0.98倍 → ' + lo.end + '、1.02倍 → ' + hi.end);
}
// 5. 空気あり: 落ちる速さの上限 √(2mg/(ρCdA))（R=1 km・高さ 200 m から）
{
  // 高さ h から落ちたときの速さ v² = vt²(1 − e^(−2h/L))、L = m/(½ρCdA)。重力がほぼ変わらない R=100 km・h=300 m で
  const R = 1e5, h = 300, g = P.at(R).g, b = P.BODY, L = b.m / (0.5 * 1.2 * b.Cd * b.A);
  const vt = Math.sqrt(2 * b.m * g / (1.2 * b.Cd * b.A)) * Math.sqrt(1 - Math.exp(-2 * h / L));
  const tr = P.fly([0, R + h, 0], [0, -1e-3, 0], { R, air: true, body: b, surf: sphere(R) });
  const n = tr.n, dt = tr.t[n - 1] - tr.t[n - 2], dv = Math.hypot(tr.p[n * 3 - 3] - tr.p[n * 3 - 6], tr.p[n * 3 - 2] - tr.p[n * 3 - 5], tr.p[n * 3 - 1] - tr.p[n * 3 - 4]) / dt;
  ok('空気ありで 300 m 落ちた速さ（R=100 km）', dv, vt, 0.02);
}
// 6. いろいろな大きさの数字
for (const R of [100, 1000, 1e4, 1e5, 1737e3, P.RE]) {
  const a = P.at(R);
  console.log('R=' + R + ': g=' + a.g.toExponential(3) + ' 地平線=' + a.horizon.toFixed(1) + ' m 歩く=' + a.walk.toFixed(4) + ' 跳ねる上限=' + a.jump.toFixed(2) + ' 一周の速さ=' + a.vOrb.toFixed(3) + ' 飛び出す=' + a.vEsc.toFixed(3));
}
console.log(ng ? 'NG ' + ng + ' 件' : 'ぜんぶ OK');
process.exit(ng ? 1 : 0);
