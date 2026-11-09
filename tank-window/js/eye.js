// 画面の奥の水槽 — 顔の点から目の位置へ、目の位置から投影へ（画面に触らない計算だけ。tools/verify.mjs で確かめる）
// faceSample・makeCalibration・eyeFrom は liaru-lab/web-parallax の src/math.js（MIT, https://github.com/liaru-lab/web-parallax）をもとに書き直した
// 座標は cm。画面の中心が原点、右が +x、上が +y、見る人の側が +z。画面は z=0

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const IPD_CM = 6.3;   // 目の間隔の仮の値

// MediaPipe の 478 点から、両目の虹彩の中点と間隔。landmarks は 0〜1（映像の幅・高さで割った値）
export function faceSample(landmarks, aspect, matrix) {
  const l = landmarks && landmarks[468], r = landmarks && landmarks[473];
  if (!l || !r || ![l.x, l.y, r.x, r.y].every(Number.isFinite)) return null;
  const d = matrix && matrix.data;
  if (!d || d.length !== 16 || !Array.from(d).every(Number.isFinite)) return null;
  // 顔の向き: 1 なら真正面。横を向くと目の間隔が短く映るのを foreshort で戻す
  const facing = Math.abs(d[10]) / Math.hypot(d[8], d[9], d[10]);
  const foreshort = Math.hypot(d[0], d[1]) / Math.hypot(d[0], d[1], d[2]);
  const span = Math.hypot(r.x - l.x, (r.y - l.y) / aspect) / Math.max(0.5, foreshort);
  if (span < 0.015) return null;
  return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2, span, facing, foreshort, aspect };
}

// いつもの位置で取った 1 点を基準にする。その瞬間の目を「窓の真ん中、distCm の前」と決める
// 基準のときに見るのは左右の向きだけ。上下の向きは目の間隔を縮めないし、画面の真ん中を見るとカメラに対しては下を向くのがふつう
export const YAW_CAL = Math.cos(12 * Math.PI / 180);
export const FACING_USE = Math.cos(35 * Math.PI / 180);
export function makeCalibration(sample, distCm) {
  if (!sample || sample.foreshort < YAW_CAL) return null;
  return { x0: sample.x, y0: sample.y, dist: distCm, f: sample.span * distCm / IPD_CM, aspect: sample.aspect };
}

// カメラと画面が同じ面にあるとして、基準からの変化を目の位置(cm)にする。読めないときは null
export function eyeFrom(s, cal) {
  if (!s || !cal || s.facing < FACING_USE || Math.abs(s.aspect - cal.aspect) > 0.01) return null;
  const z = cal.f * IPD_CM / s.span;
  if (!Number.isFinite(z) || z < 15 || z > 200) return null;
  // 映像は鏡になっていない: 頭が画面の右へ動くと、映像の中では左へ動く。
  // 基準の項（x0-.5）*dist を残すのは、カメラが中心にないとき「近づいただけで横に動いた」ことにしないため
  return {
    x: ((cal.x0 - 0.5) * cal.dist - (s.x - 0.5) * z) / cal.f,
    y: ((cal.y0 - 0.5) * cal.dist - (s.y - 0.5) * z) / (cal.f * s.aspect),
    z,
  };
}

// 窓（幅 W・高さ H の画面）を目から見た非対称の視錐台。near の面での左右上下を返す
export function frustum(eye, W, H, near) {
  const k = near / eye.z;
  return { left: (-W / 2 - eye.x) * k, right: (W / 2 - eye.x) * k, bottom: (-H / 2 - eye.y) * k, top: (H / 2 - eye.y) * k };
}

// 1€ フィルタ（Casiez, Roussel, Vogel 2012）。止まっているときは強くならし、速く動くときは遅れを減らす
export class OneEuro {
  constructor(minCut, beta, dCut = 1) { this.minCut = minCut; this.beta = beta; this.dCut = dCut; this.x = null; this.dx = 0; }
  reset() { this.x = null; this.dx = 0; }
  filter(v, dt) {
    if (this.x === null || !(dt > 0)) { this.x = v; this.dx = 0; return v; }
    const a = c => { const r = 2 * Math.PI * c * dt; return r / (r + 1); };
    this.dx += a(this.dCut) * ((v - this.x) / dt - this.dx);
    this.x += a(this.minCut + this.beta * Math.abs(this.dx)) * (v - this.x);
    return this.x;
  }
}
