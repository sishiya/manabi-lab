// カー時空（回るブラックホール）の式。長さと時間は質量 M を単位にする（G = c = M = 1）。
// 同じ式を render.js のシェーダーにも書いている。片方を直したら、もう片方も直す。
'use strict';

const TAU = Math.PI * 2;

// 事象の地平面（外側）の半径
function horizon(a) { return 1 + Math.sqrt(Math.max(0, 1 - a * a)); }

// いちばん内側の安定な円軌道（ISCO、回転と同じ向き）。Bardeen, Press, Teukolsky 1972
function iscoR(a) {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
}

// 光がぐるぐる回れる円軌道（赤道面）。pro = 回転と同じ向き、retro = 逆向き
function photonR(a) {
  return {
    pro: 2 * (1 + Math.cos((2 / 3) * Math.acos(-a))),
    retro: 2 * (1 + Math.cos((2 / 3) * Math.acos(a))),
  };
}

// その場所に浮かぶ観測者（ゼロ角運動量の観測者 ZAMO）の量
// alpha: 時計の進み方（遠くの時計に対して）、omega: 空間が引きずられる角速度、varpi: 円周の半径
function zamo(r, th, a) {
  const s = Math.sin(th), c = Math.cos(th);
  const rho2 = r * r + a * a * c * c, D = r * r - 2 * r + a * a;
  const A = (r * r + a * a) ** 2 - a * a * D * s * s;
  return { alpha: Math.sqrt(rho2 * D / A), omega: 2 * a * r / A, varpi: Math.sqrt(A) * s / Math.sqrt(rho2), rho: Math.sqrt(rho2), D };
}

// 赤道面を回るガス（ケプラー回転、回転と同じ向き）の u^t と角速度
function diskUt(r, a) {
  const r32 = r ** 1.5;
  return (r32 + a) / (r ** 0.75 * Math.sqrt(r32 - 3 * Math.sqrt(r) + 2 * a));
}
function diskOmega(r, a) { return 1 / (r ** 1.5 + a); }

// カメラの向きのベクトル N（ZAMO の正規直交基底 r̂, θ̂, φ̂ の成分。カメラから空へ向かう向き）から、
// 光の保存量と初めの運動量を作る。光の進む向きは n = −N（カメラへ向かって来る）。p_t = −1 にそろえる。
function initRay(cam, N, a) {
  const z = zamo(cam.r, cam.th, a);
  const nr = -N[0], nth = -N[1], nph = -N[2];
  const EF = 1 / (z.alpha + z.omega * z.varpi * nph);   // カメラが測る光のエネルギー
  const pr = EF * z.rho / Math.sqrt(z.D) * nr;
  const pth = EF * z.rho * nth;
  const b = EF * z.varpi * nph;                         // 角運動量 L/E
  const s = Math.sin(cam.th), c = Math.cos(cam.th);
  const q = pth * pth + c * c * (b * b / (s * s) - a * a); // カーターの定数 Q/E²
  return { b, q, pr, pth, EF };
}

// 光の道すじの微分（アフィン・パラメータ λ について。時間の向きに進む式）
// y = [r, θ, φ, p_r, p_θ]
function deriv(y, b, q, a, out) {
  const r = y[0], th = y[1], pr = y[3], pth = y[4];
  let s = Math.sin(th); const c = Math.cos(th);
  if (Math.abs(s) < 1e-6) s = s < 0 ? -1e-6 : 1e-6;
  const S = r * r + a * a * c * c, D = r * r - 2 * r + a * a;
  const P = r * r + a * a - a * b, K = (b - a) * (b - a) + q, R = P * P - D * K;
  const Dp = 2 * r - 2, Rp = 4 * r * P - Dp * K;
  out[0] = D * pr / S;
  out[1] = pth / S;
  out[2] = (a * P / D - a + b / (s * s)) / S;
  out[3] = (Rp / D - R * Dp / (D * D) - Dp * pr * pr) / (2 * S);
  out[4] = (b * b * c / (s * s * s) - a * a * s * c) / S;
  return out;
}

// 1 歩（ルンゲ・クッタ 4 次）
const _k1 = new Float64Array(5), _k2 = new Float64Array(5), _k3 = new Float64Array(5), _k4 = new Float64Array(5), _t = new Float64Array(5);
// 歩幅 h は「穴からの距離で決めた長さ」。回転軸の近くでは 1 歩で回る角度が 0.04 rad を超えないように縮める（シェーダーと同じ）
function rk4(y, h, b, q, a) {
  deriv(y, b, q, a, _k1);
  const lim = 0.04 / (Math.abs(_k1[2]) + Math.abs(_k1[1]) + 1e-6);
  if (Math.abs(h) > lim) h = Math.sign(h) * lim;
  for (let i = 0; i < 5; i++) _t[i] = y[i] + 0.5 * h * _k1[i];
  deriv(_t, b, q, a, _k2);
  for (let i = 0; i < 5; i++) _t[i] = y[i] + 0.5 * h * _k2[i];
  deriv(_t, b, q, a, _k3);
  for (let i = 0; i < 5; i++) _t[i] = y[i] + h * _k3[i];
  deriv(_t, b, q, a, _k4);
  for (let i = 0; i < 5; i++) y[i] += h / 6 * (_k1[i] + 2 * _k2[i] + 2 * _k3[i] + _k4[i]);
}

// 歩幅（穴に近いほど小さく）。シェーダーと同じ
const STEP_K = 0.06, STEP_MIN = 0.004;
function stepLen(r, rh) { return Math.max(STEP_K * (r - rh), STEP_MIN); }

// 図に描くための座標（x はカメラの方向、z は回転軸）
function toXYZ(r, th, ph, a) {
  const rr = Math.sqrt(r * r + a * a), s = Math.sin(th);
  return [rr * s * Math.cos(ph), rr * s * Math.sin(ph), r * Math.cos(th)];
}

// カメラから 1 本の光を逆向きにたどる（光の道すじの図・読み取り・確認用）。
// 結果: kind = 'hole' | 'disk' | 'sky'、通った点 pts、円盤なら rHit・g・fromTop、回った角度 sweep
function traceRay(cam, N, a, disk, maxSteps = 4000) {
  const ray = initRay(cam, N, a), rh = horizon(a);
  const y = new Float64Array([cam.r, cam.th, 0, ray.pr, ray.pth]);
  const rEsc = Math.max(cam.r * 2, 60);
  const pts = [toXYZ(y[0], y[1], y[2], a)];
  let sweep = 0, rmin = y[0], crossings = 0;
  const res = { kind: 'lost', pts, EF: ray.EF, b: ray.b, q: ray.q };
  for (let i = 0; i < maxSteps; i++) {
    const r0 = y[0], c0 = Math.cos(y[1]), ph0 = y[2], th0 = y[1];
    rk4(y, -stepLen(r0, rh), ray.b, ray.q, a);
    const p = toXYZ(y[0], y[1], y[2], a), pp = pts[pts.length - 1];
    const l0 = Math.hypot(...pp), l1 = Math.hypot(...p);
    if (l0 > 0 && l1 > 0) sweep += Math.acos(Math.max(-1, Math.min(1, (pp[0] * p[0] + pp[1] * p[1] + pp[2] * p[2]) / (l0 * l1))));
    pts.push(p);
    rmin = Math.min(rmin, y[0]);
    if (!isFinite(y[0])) break;
    if (y[0] < rh + 0.01) { res.kind = 'hole'; break; }
    const c1 = Math.cos(y[1]);
    if (c0 * c1 <= 0 && c0 !== c1) {
      crossings++;
      const f = c0 / (c0 - c1), rc = r0 + (y[0] - r0) * f;
      if (disk && rc >= disk.rin && rc <= disk.rout) {
        res.kind = 'disk'; res.rHit = rc; res.phiHit = ph0 + (y[2] - ph0) * f;
        if (Math.sin(th0 + (y[1] - th0) * f) < 0) res.phiHit += Math.PI;
        res.g = ray.EF / (diskUt(rc, a) * (1 - diskOmega(rc, a) * ray.b));
        res.fromTop = c0 > 0;          // 逆にたどって上から来た＝円盤の上の面から出た光
        res.hitXYZ = pp.map((v, k) => v + (p[k] - v) * f);   // 回転軸をまたいで θ < 0 になった光でも正しい位置
        pts[pts.length - 1] = res.hitXYZ;
        break;
      }
    }
    if (y[0] > rEsc && y[0] > r0) {
      res.kind = 'sky';
      const d = [p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]], l = Math.hypot(...d);
      res.dir = d.map(v => v / l);
      break;
    }
  }
  res.sweep = sweep; res.rmin = rmin; res.crossings = crossings;
  // 曲がった角度（向きの変化を足し合わせる。180° を超えることもある）
  let bend = 0, prev = null;
  for (let i = 1; i < pts.length; i++) {
    const u = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]], l = Math.hypot(...u);
    if (l < 1e-9) continue;
    const d = u.map(v => v / l);
    if (prev) bend += Math.acos(Math.max(-1, Math.min(1, d[0] * prev[0] + d[1] * prev[1] + d[2] * prev[2])));
    prev = d;
  }
  res.bend = bend;
  return res;
}

// 画面の点（-1〜1 の正規化座標）→ カメラの向きのベクトル N（r̂, θ̂, φ̂ 成分）
// カメラは穴の方を向き（前 = −r̂）、上 = −θ̂（北）、右 = φ̂。look = [左右, 上下] の首振り（ラジアン）
function camDir(nx, ny, aspect, tanF, look) {
  let x = nx * tanF * aspect, y = ny * tanF, z = 1;
  const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
  if (look) {
    // 上下（x 軸まわり）→ 左右（y 軸まわり）
    const cp = Math.cos(look[1]), sp = Math.sin(look[1]);
    const y2 = y * cp + z * sp, z2 = -y * sp + z * cp; y = y2; z = z2;
    const cy = Math.cos(look[0]), sy = Math.sin(look[0]);
    const x3 = x * cy + z * sy, z3 = -x * sy + z * cy; x = x3; z = z3;
  }
  return [-z, -y, x];
}
