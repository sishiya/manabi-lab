// ワームホールの形と光の道すじ（CPU 側）。James, von Tunzelmann, Franklin, Thorne (2015) の式 5・7・16。
// 単位は のどの半径 ρ = 1。球対称なので光は1枚の平面を進み、(ℓ, φ, p) と b だけで道が決まる。
'use strict';

const TAU = Math.PI * 2;
const W_PER_M = 1.42953;      // レンズの幅 W = 1.42953 M（式 7）

function makeShape(a, W) { return { kind: 'dneg', a, W, M: W / W_PER_M }; }
function makeEllis() { return { kind: 'ellis', a: 0, W: 1, M: 1 }; }   // 確かめ用（厳密解がある形）

// のどからの半径 r(ℓ)（式 5）
function radius(S, l) {
  if (S.kind === 'ellis') return Math.sqrt(1 + l * l);
  const d = Math.abs(l) - S.a;
  if (d <= 0) return 1;
  const x = 2 * d / (Math.PI * S.M);
  return 1 + S.M * (x * Math.atan(x) - 0.5 * Math.log1p(x * x));
}
// dr/dℓ
function dRadius(S, l) {
  if (S.kind === 'ellis') return l / Math.sqrt(1 + l * l);
  const d = Math.abs(l) - S.a;
  if (d <= 0) return 0;
  return Math.sign(l) * (2 / Math.PI) * Math.atan(2 * d / (Math.PI * S.M));
}

const STEP_K = 0.15, STEP_ANG = 0.07, MAX_STEPS = 60000;

// 1歩の長さ。口のまがり具合の幅と、1歩で回る角度の両方で抑える
function stepLen(S, l, b) {
  const d = Math.max(0, Math.abs(l) - S.a), r = radius(S, l);
  const scale = S.kind === 'ellis' ? r : Math.min(r, S.M + d);
  let h = STEP_K * Math.max(scale, 1e-3);
  if (b > 0) h = Math.min(h, STEP_ANG * r * r / b);
  return h;
}

// 式 16 の右辺のうち p を変える力 b² r′/r³ と、φ の速さ b/r²（表を作るときに何百万回も呼ぶので、配列を作らない）
let _dphi = 0;
function force(S, b, l) {
  let r, dr;
  if (S.kind === 'ellis') { r = Math.sqrt(1 + l * l); dr = l / r; }
  else {
    const d = Math.abs(l) - S.a;
    if (d <= 0) { r = 1; dr = 0; }
    else {
      const x = 2 * d / (Math.PI * S.M), at = Math.atan(x);
      r = 1 + S.M * (x * at - 0.5 * Math.log1p(x * x));
      dr = (l < 0 ? -1 : 1) * 0.6366197723675814 * at;
    }
  }
  const ir2 = 1 / (r * r);
  _dphi = b * ir2;
  return b * b * dr * ir2 / r;
}

// RK4 の1歩（式 16）。y = [ℓ, φ, p]
function rkStep(S, b, y, h, out) {
  const l = y[0], p = y[2];
  const f1 = force(S, b, l), w1 = _dphi;
  const p2 = p + 0.5 * h * f1, f2 = force(S, b, l + 0.5 * h * p), w2 = _dphi;
  const p3 = p + 0.5 * h * f2, f3 = force(S, b, l + 0.5 * h * p2), w3 = _dphi;
  const p4 = p + h * f3, f4 = force(S, b, l + h * p3), w4 = _dphi;
  out[0] = l + h / 6 * (p + 2 * p2 + 2 * p3 + p4);
  out[1] = y[1] + h / 6 * (w1 + 2 * w2 + 2 * w3 + w4);
  out[2] = p + h / 6 * (f1 + 2 * f2 + 2 * f3 + f4);
}

// 光を1本たどる。カメラの位置 l0、+ℓ の向きからの角度 psi（0〜π）。時間は逆向きでなく、カメラから外へ進める
// 返すのは { side: 終わりの宇宙の符号（ℓ の符号）, phi: 無限遠での角度, cross: のどを通ったか, path?: [[ℓ, φ], …] }
function traceRay(S, l0, psi, opts) {
  const r0 = radius(S, l0), b = r0 * Math.sin(psi);
  let y = [l0, 0, Math.cos(psi)], n = [0, 0, 0];
  const lEnd = S.a + Math.max(200, 30 * r0);
  const path = opts && opts.path ? [[l0, 0]] : null;
  let steps = 0, cross = false;
  const startSide = l0 === 0 ? 0 : Math.sign(l0);

  for (; steps < MAX_STEPS; steps++) {
    const l = y[0], p = y[2];
    if (Math.abs(l) >= lEnd && l * p > 0) break;

    // のどの円筒の中は r = 1 で p が変わらないので、口まで一気に進める（厳密）
    if (S.a > 0 && Math.abs(l) <= S.a && p !== 0 && (Math.abs(l) < S.a || l * p < 0)) {
      const target = Math.sign(p) * S.a, t = (target - l) / p, ph0 = y[1];
      if (path) { const m = Math.min(80, Math.ceil(Math.abs(b * t) / 0.08) + 1); for (let i = 1; i <= m; i++) path.push([l + (target - l) * i / m, ph0 + b * t * i / m]); }
      y[0] = target; y[1] = ph0 + b * t;
      if (l * target < 0 || l === 0) cross = true;
      continue;
    }

    let h = stepLen(S, l, b) * (opts && opts.stepScale || 1);
    if (S.a > 0 && l * p < 0 && Math.abs(l) > S.a) h = Math.min(h, Math.max(1e-6, (Math.abs(l) - S.a) / Math.abs(p)));   // 口の手前でちょうど止める
    rkStep(S, b, y, h, n);
    if (S.a > 0 && Math.abs(l) > S.a && Math.abs(n[0]) < S.a) n[0] = Math.sign(l) * S.a;
    if (l * n[0] < 0) cross = true;
    y[0] = n[0]; y[1] = n[1]; y[2] = n[2];
    if (path && (steps % 2 === 0)) path.push([y[0], y[1]]);
  }
  const r = radius(S, y[0]);
  const phi = y[1] + Math.asin(Math.min(1, b / r));   // 打ち切った所から先はまっすぐとして、無限遠の向きを足す
  if (path) path.push([y[0], y[1]]);
  const side = Math.sign(y[0]) || 1;
  return { side, phi, cross: cross || (startSide !== 0 && side !== startSide), steps, b, path, end: y, trapped: steps >= MAX_STEPS };
}

// のどの臨界の角度。ψ がこれより小さい光は（ℓ<0 のカメラから）のどを通りぬける
function criticalPsi(S, lEff) { return Math.asin(Math.min(1, 1 / radius(S, lEff))); }

if (typeof module !== 'undefined') module.exports = { TAU, W_PER_M, makeShape, makeEllis, radius, dRadius, traceRay, criticalPsi, stepLen };
