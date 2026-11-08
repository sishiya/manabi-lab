// 光の計算の確かめ: node wormhole/tools/verify.js
// 1) Ellis の形の厳密解と比べる  2) 保存量のずれ  3) 表（lut.js）と直接の計算の差  4) 通りぬけの境目
'use strict';
const path = require('path');
const M = require(path.join(__dirname, '..', 'js', 'metric.js'));
const L = require(path.join(__dirname, '..', 'js', 'lut.js'));

// 第1種完全楕円積分 K(k)（算術幾何平均）
function ellK(k) { let a = 1, b = Math.sqrt(1 - k * k); for (let i = 0; i < 30; i++) { const c = (a + b) / 2; b = Math.sqrt(a * b); a = c; } return Math.PI / (2 * a); }

let bad = 0;
function check(name, got, want, tol) {
  const e = Math.abs(got - want), ok = e <= tol;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'NG '} ${name}: ${got.toFixed(6)} （期待 ${want.toFixed(6)}、差 ${e.toExponential(2)}、許容 ${tol}）`);
}

// 1) Ellis。無限遠の両側での角度の差が 通過 2kK(k)（k = b）、反射 2K(1/b)
//    遠くのカメラ（ℓ = -L）から b を決めて打つ。カメラまでの角度 φ0 = 厳密解の片側分は、対称な半分 + 残りで近似せず、
//    両側の無限遠の差を出すため、カメラを十分遠くに置いて  Δφ = phi + asin(b/r_cam) とする。
const E = M.makeEllis(), far = -20000;
const rFar = M.radius(E, far);
for (const b of [0.2, 0.5, 0.8, 0.95, 0.99]) {
  const r = M.traceRay(E, far, Math.asin(b / rFar));
  check(`Ellis 通過 b=${b}`, r.phi + Math.asin(b / rFar), 2 * b * ellK(b), 3e-3);
  if (r.side !== 1) { bad++; console.log('NG 通過のはずが反射'); }
}
for (const b of [1.05, 1.2, 2, 5]) {
  const r = M.traceRay(E, far, Math.asin(b / rFar));
  check(`Ellis 反射 b=${b}`, r.phi + Math.asin(b / rFar), 2 * ellK(1 / b), 3e-3);
  if (r.side !== -1) { bad++; console.log('NG 反射のはずが通過'); }
}

// 2) 保存量 p² + b²/r² = 1
for (const [name, S] of [['映画', M.makeShape(0.005, 0.05)], ['長い', M.makeShape(5, 0.05)], ['なめらか', M.makeShape(0.5, 0.43)]]) {
  let worst = 0;
  for (let i = 1; i < 60; i++) {
    const r = M.traceRay(S, -6.26 - S.a, Math.PI * i / 60), rr = M.radius(S, r.end[0]);
    worst = Math.max(worst, Math.abs(r.end[2] * r.end[2] + r.b * r.b / (rr * rr) - 1));
  }
  check(`保存量のずれ（${name}）`, worst, 0, 2e-5);
}

// 3) 表と直接の計算の差
for (const [name, S] of [['映画', M.makeShape(0.005, 0.05)], ['長い', M.makeShape(5, 0.05)], ['なめらか', M.makeShape(0.5, 0.43)]]) {
  for (const l0 of [-6.26 - S.a, -S.a - 0.2, -S.a * 0.5, 0, 3 + S.a]) {
    const T = L.buildLUT(S, l0);
    let worst = 0, n = 0;
    for (let i = 1; i < 400; i++) {
      const psi = Math.PI * (i + 0.37) / 400, g = L.lookup(T, psi);
      if (Math.abs(g.delta) < 3e-3) continue;   // 境目から3画素（1画素 ≈ 1.3e-3 rad）より近い所は、1画素の中で何周もするので比べない
      const d = M.traceRay(S, l0, psi);
      if (d.side !== g.side) { bad++; console.log(`NG 表の宇宙がちがう ${name} l0=${l0} psi=${psi}`); }
      worst = Math.max(worst, Math.abs(d.phi - g.phi) / Math.max(1, Math.abs(d.phi))); n++;   // 何周もする光は、全体の角度に対する割合で見る
    }
    check(`表の誤差の割合（${name}、ℓ=${l0.toFixed(2)}、${n}本）`, worst, 0, 2e-3);
  }
}

// 4) 通りぬけの境目は b = 1（のどの半径）
for (const [name, S] of [['映画', M.makeShape(0.005, 0.05)], ['なめらか', M.makeShape(0.5, 0.43)]]) {
  const l0 = -6.26 - S.a, r0 = M.radius(S, l0);
  const a = M.traceRay(S, l0, Math.asin(0.999 / r0)), c = M.traceRay(S, l0, Math.asin(1.001 / r0));
  if (a.side !== 1 || c.side !== -1) { bad++; console.log(`NG 境目 ${name}`); } else console.log(`OK  境目（${name}）: b=0.999 は通過、1.001 は反射`);
}

// 4b) Dneg は口で r″ が飛ぶので Ellis では試せない。歩幅を 1/10 にした解と比べる
for (const [name, S] of [['映画', M.makeShape(0.005, 0.05)], ['長い', M.makeShape(5, 0.05)], ['なめらか', M.makeShape(0.5, 0.43)]]) {
  let worst = 0;
  for (const l0 of [-6.26 - S.a, -S.a - 0.1, 3 + S.a]) for (let i = 1; i < 120; i++) {
    const psi = Math.PI * (i + 0.37) / 120, c = M.traceRay(S, l0, psi), f = M.traceRay(S, l0, psi, { stepScale: 0.1 });
    if (c.side !== f.side) { bad++; console.log('NG 歩幅で行き先が変わった'); }
    worst = Math.max(worst, Math.abs(c.phi - f.phi) / Math.max(1, Math.abs(f.phi)));
  }
  check(`歩幅 1/10 との差の割合（${name}）`, worst, 0, 1e-3);
}

// 4c) 向こうの宇宙が見える範囲は (1 − cos ψc)/2 = (1 − √(1 − ρ²/r²))/2。全天の光を立体角で足し合わせて比べる
for (const [name, S, l0] of [['映画', M.makeShape(0.005, 0.05), -6.255], ['なめらか', M.makeShape(0.5, 0.43), -2]]) {
  const N = 4000; let far = 0, tot = 0;
  for (let i = 0; i < N; i++) { const psi = Math.PI * (i + 0.5) / N, w = Math.sin(psi); tot += w; if (M.traceRay(S, l0, psi).side > 0) far += w; }
  const r0 = M.radius(S, l0);
  check(`向こうの宇宙の割合（${name}）`, far / tot, (1 - Math.sqrt(1 - 1 / (r0 * r0))) / 2, 2e-3);
}

// 5) 速さ
const timeIt = (S, coarse) => { const t0 = Date.now(); for (let i = 0; i < 20; i++) L.buildLUT(S, -3 - i * 0.2, null, coarse); return ((Date.now() - t0) / 20).toFixed(1); };
for (const [name, S] of [['映画', M.makeShape(0.005, 0.05)], ['長い', M.makeShape(5, 0.05)], ['なめらか', M.makeShape(0.5, 0.43)]])
  console.log(`表を作る時間（${name}）: 細かい ${timeIt(S, false)} ms、動かしている間 ${timeIt(S, true)} ms`);
console.log(bad ? `NG が ${bad} 件` : 'すべて OK');
process.exit(bad ? 1 : 0);
