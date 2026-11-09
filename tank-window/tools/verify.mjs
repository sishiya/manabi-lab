// 画面の奥の水槽 — 計算の確かめ。 node tank-window/tools/verify.mjs
import { faceSample, makeCalibration, eyeFrom, frustum, OneEuro, IPD_CM } from '../js/eye.js';

let ng = 0;
const ok = (name, cond, note = '') => { console.log(`${cond ? 'OK' : 'NG'}  ${name}${note ? '  ' + note : ''}`); if (!cond) ng++; };
const near = (a, b, e) => Math.abs(a - b) <= e;

// 点 P を、目 eye・窓 W×H の投影で画面の位置（-1〜1）へ
function project(P, eye, W, H) {
  const n = 1, f = frustum(eye, W, H, n);
  const dz = eye.z - P.z, X = (P.x - eye.x) * n / dz, Y = (P.y - eye.y) * n / dz;
  return { x: (2 * X - f.right - f.left) / (f.right - f.left), y: (2 * Y - f.top - f.bottom) / (f.top - f.bottom) };
}
const W = 34.5, H = 19.4;

// 1. 窓の面の点は、どこから見ても同じ場所に映る
const eyes = [{ x: 0, y: 0, z: 55 }, { x: 15, y: 4, z: 40 }, { x: -22, y: -9, z: 80 }];
let same = true;
for (const P of [{ x: 10, y: 5, z: 0 }, { x: -W / 2, y: H / 2, z: 0 }]) {
  const a = project(P, eyes[0], W, H);
  for (const e of eyes) { const b = project(P, e, W, H); same = same && near(a.x, b.x, 1e-9) && near(a.y, b.y, 1e-9); }
}
ok('窓の面の点は目が動いても動かない', same);

// 2. 窓のふちは画面の端（±1）にぴったり重なる
const c = project({ x: W / 2, y: H / 2, z: 0 }, eyes[1], W, H);
ok('窓の角は画面の角に映る', near(c.x, 1, 1e-9) && near(c.y, 1, 1e-9));

// 3. 頭を右へ動かすと、奥の点は画面の上で右へ動く（頭と同じ向き）。奥ほど大きく動く
const px = z => project({ x: 0, y: 0, z }, { x: 10, y: 0, z: 55 }, W, H).x;
ok('奥の点は頭と同じ向きへ動く', px(-20) > 0);
ok('奥ほど大きく動く', px(-40) > px(-20) && px(-20) > px(-5), `(${px(-5).toFixed(3)} ${px(-20).toFixed(3)} ${px(-40).toFixed(3)})`);

// 4. カメラの模型で顔を映し、目の位置を戻す
const aspect = 4 / 3, F = 0.75;   // 焦点距離 / 映像の幅
const camAt = { x: 0, y: 11 };    // カメラは画面の上（画面の中心から cm）
const matrix = { data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
function shoot(eye) {
  const u = (X, Z) => 0.5 - F * (X - camAt.x) / Z;   // 鏡でない映像: 右へ動くと u は小さく
  const v = (Y, Z) => 0.5 - F * aspect * (Y - camAt.y) / Z;
  const lm = [];
  lm[468] = { x: u(eye.x - IPD_CM / 2, eye.z), y: v(eye.y, eye.z) };
  lm[473] = { x: u(eye.x + IPD_CM / 2, eye.z), y: v(eye.y, eye.z) };
  return faceSample(lm, aspect, matrix);
}
const cal = makeCalibration(shoot({ x: 0, y: 0, z: 55 }), 55);
ok('基準では目は真ん中', (() => { const e = eyeFrom(shoot({ x: 0, y: 0, z: 55 }), cal); return near(e.x, 0, 1e-9) && near(e.y, 0, 1e-9) && near(e.z, 55, 1e-9); })());
let round = true;
for (const t of [{ x: 12, y: 0, z: 55 }, { x: -9, y: 6, z: 40 }, { x: 5, y: -4, z: 75 }]) {
  const e = eyeFrom(shoot(t), cal);
  round = round && near(e.x, t.x, 1e-6) && near(e.y, t.y, 1e-6) && near(e.z, t.z, 1e-6);
}
ok('動かした目の位置が戻る（カメラが中心にないときも）', round);
const fwd = eyeFrom(shoot({ x: 0, y: 0, z: 35 }), cal);
ok('前へ出ただけなら横にも上下にも動かない', near(fwd.x, 0, 1e-6) && near(fwd.y, 0, 1e-6));

// 5. 横を向きすぎた顔は使わない
const turned = { data: [Math.cos(1), 0, -Math.sin(1), 0, 0, 1, 0, 0, Math.sin(1), 0, Math.cos(1), 0, 0, 0, 0, 1] };
const lmT = []; lmT[468] = { x: .45, y: .5 }; lmT[473] = { x: .55, y: .5 };
ok('横を向きすぎた顔は読まない', eyeFrom(faceSample(lmT, aspect, turned), cal) === null);
ok('点がないときは null', faceSample([], aspect, matrix) === null);
const rot = (axis, a) => ({ data: axis === 'x'
  ? [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1]
  : [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1] });
ok('画面の真ん中を見て下を向いた顔（16°）で基準がとれる', !!makeCalibration(faceSample(lmT, aspect, rot('x', 16 * Math.PI / 180)), 55));
ok('左右に 20° 向いた顔では基準をとらない', makeCalibration(faceSample(lmT, aspect, rot('y', 20 * Math.PI / 180)), 55) === null);

// 6. 1€ フィルタ: 止まっている頭のぶれを減らし、動く頭には遅れすぎない（30 回/秒）
let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647 - 0.5;
const rms = (noisy, cut, beta, fn) => {
  const f = new OneEuro(cut, beta); let s = 0, n = 0;
  for (let i = 0; i < 300; i++) { const t = i / 30, truth = fn(t), o = f.filter(truth + (noisy ? rnd() * 0.6 : 0), 1 / 30); if (i > 30) { s += (o - truth) ** 2; n++; } }
  return Math.sqrt(s / n);
};
const still = rms(true, 1.2, 0.3, () => 0), raw = Math.sqrt(0.36 / 12);
ok('止まっているときのぶれが半分以下', still < raw / 2, `(そのまま ${raw.toFixed(3)} → ${still.toFixed(3)} cm)`);
const lag = rms(false, 1.2, 0.3, t => 12 * Math.sin(2 * Math.PI * 0.5 * t));   // ±12cm を 2 秒で往復
ok('頭を動かしているときの遅れが 1.5 cm 以下', lag < 1.5, `(ずれ ${lag.toFixed(2)} cm)`);

console.log(ng ? `\nNG ${ng} 件` : '\nすべて OK');
process.exit(ng ? 1 : 0);
