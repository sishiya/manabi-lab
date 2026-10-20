// 波が育つまで — 計算の検証（node wave-growth/tools/verify.js）
'use strict';
const W = require('../js/growth.js');
let bad = 0;
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'NG '} ${name}: ${got.toPrecision(5)}（期待 ${want.toPrecision(5)}）`);
}
// 1) CEM の式そのもの: 発達しきった海の無次元の値
for (const U of [5, 10, 20]) {
  const us = W.ustar(U), f = W.fullyDev(U);
  check(`U=${U} gHm0/u*² (発達しきった)`, W.G * f.Hm0 / us / us, 211.5, 1e-9);
  check(`U=${U} gTp/u* (発達しきった)`, W.G * f.Tp / us, 239.8, 1e-9);
}
// 2) 時間 → 高さ → 時間 が戻る
for (const [U, h] of [[8, 1], [15, 6], [20, 24]]) {
  const r = W.fromDuration(U, h * 3600);
  check(`U=${U} ${h}時間 の高さから時間を戻す`, W.durationForH(U, r.Hm0) / 3600, h, 1e-9);
}
// 3) 風を途中で変えない記録は、ふつうの計算と同じ
check('記録1区間 = fromDuration', W.stateAt([{ t: 0, U: 12 }], 5 * 3600).Hm0, W.fromDuration(12, 5 * 3600).Hm0, 1e-12);
// 4) 分布の面積 = Hm0²/16
for (const [H, T] of [[0.3, 2.5], [2, 7], [6, 12]]) {
  let s = 0; const df = 0.0005; for (let f = df / 2; f < 5; f += df) s += W.Sf(f, H, T) * df;
  check(`∫S(f)df = Hm0²/16（Hm0 ${H} m）`, s, H * H / 16, 2e-3);
}
// 5) 向きの広がりの面積 = 1
for (const s of [0.5, 2, 10, 40]) { let a = 0; const n = 20000; for (let i = 0; i < n; i++) a += W.spread(-Math.PI + (i + .5) * 2 * Math.PI / n, s) * 2 * Math.PI / n; check(`∫D(θ)dθ = 1（s=${s}）`, a, 1, 1e-6); }
// 6) 波数の面の分布の体積 = Hm0²/16（細かい格子で）
{ const H = 2, T = 7, SK = W.makeSpecK(H, T, 0.3), dk = 0.004; let v = 0;
  for (let kx = -1.2; kx < 1.2; kx += dk) for (let kz = -1.2; kz < 1.2; kz += dk) v += SK(kx + dk / 2, kz + dk / 2) * dk * dk;
  check('∫∫S(kx,kz) = Hm0²/16（k<1.2 の範囲。高い周波数の尾のぶん少し小さい）', v, H * H / 16, 0.02); }
// 7) 流される速さ（ストークスドリフト）: 波が1つだけ（幅のせまい分布）なら ω k a² と同じになるはず
{ const H = 1, T = 6, w = 2 * Math.PI / T, k = w * w / W.G, a = H / (2 * Math.SQRT2);   // Hm0 = 4√m0、1つの波なら m0 = a²/2
  const us = W.stokes(H, T, 3, 1e6), mono = w * k * a * a;
  console.log(`参考 u_s（JONSWAP の幅あり・向きはほぼそろえた）${us.toFixed(4)} m/s ／ 波1つ ${mono.toFixed(4)} m/s（幅のぶん大きくなる）`); }
console.log('流される速さ（風速 10 m/s）: ' + [3, 12, 30].map(h => { const r = W.fromDuration(10, h * 3600); return `${h}時間 ${(W.stokes(r.Hm0, r.Tp) * 100).toFixed(1)} cm/s`; }).join('・'));
// 8) うねり: 周期 15 秒の波の群れが 3000 km 進む時間 = R / (gT/4π) ≒ 2.96 日（深い海の群速度）
{ global.window = { WGgrowth: W }; require('../js/swell.js'); const Sw = window.WGswell;
  check('群速度で 3000 km（周期 15 秒）', 3000e3 / Sw.cg(1 / 15) / 86400, 3000e3 / (9.81 * 15 / (4 * Math.PI)) / 86400, 1e-9);
  Sw.P.R = 3000e3; const early = Sw.obs(2.5 * 86400), late = Sw.obs(8 * 86400);
  check('うねり: 後から届く波ほど周期が短い（8 日 < 2.5 日）', late.Tp < early.Tp ? 1 : 0, 1, 0); }
// 表: 発達しきるまでの時間
console.log('\n風速 → 発達しきった海（有義波高・周期）と、そこまでの時間');
for (const U of [3, 5, 10, 15, 20, 25]) { const f = W.fullyDev(U); console.log(`  ${U} m/s: ${f.Hm0.toFixed(2)} m・${f.Tp.toFixed(1)} 秒・${(W.durationForH(U, f.Hm0) / 3600).toFixed(1)} 時間`); }
console.log('\n風速 10 m/s の育ち方');
for (const h of [1 / 6, 1, 3, 6, 12, 24, 36]) { const r = W.fromDuration(10, h * 3600); console.log(`  ${(h * 60).toFixed(0).padStart(4)} 分: ${r.Hm0.toFixed(2)} m・${r.Tp.toFixed(2)} 秒・波長 ${(W.G * r.Tp ** 2 / 2 / Math.PI).toFixed(1)} m`); }
console.log(bad ? `\nNG ${bad} 件` : '\nすべて OK');
process.exit(bad ? 1 : 0);
