// ヘビが進むしくみ — 計算の検証（node snake-move/tools/verify.js [ground|slope|dt|tree]）
// ground: Hu ほか 2009 の模型の結果（持ち上げなし 0.17・持ち上げ 0.23 体長／周期、どの向きも同じ摩擦ではほとんど進まない）と比べる
// slope : 坂の上り。Hu 2009 の実験では 7 ± 2° をこえると後ろへすべる
// dt    : 刻みを変えても答えが変わらないか
// tree  : 木の幹（太さ・順番・締めつけの余裕・ウロコ）。ぎりぎりの余裕も探す
// stones: 石のあいだ（Gray 1946）。押す力・止まるかどうか
// rect  : まっすぐ（Lissmann 1950）。止まる時間の割合と地面ですべるか
// side  : 横ばい（Marvi ほか 2014・Astley ほか 2015）。平面の版と立体の版（side3d.js）。跡の角度 33 ± 8°・止まっている所 44%・ふれている所のすべり
'use strict';
const GR = require('../js/ground.js');
const mode = process.argv[2] || 'ground';
const f = (x, d = 3) => (x >= 0 ? ' ' : '') + x.toFixed(d);
const row = (name, o, dt) => {
  const r = GR.measure(o, 6, dt);
  console.log(`${name.padEnd(28)} 速さ ${f(r.U)} 体長/周期  上りへ ${f(r.up)}  向きの変化 ${f(r.turn, 1)}°/周期  仕事率 ${(r.P * 1000).toFixed(2)} mW  解けた ${r.ok}`);
  return r;
};
if (mode === 'ground') {
  console.log('実物（Hu 2009）: 0.22 ± 0.08 体長/周期・波長 0.4・ふれはば 0.1（形はこれに合わせた α 12・k 3.6）。論文の模型（α 7・k 2）は 持ち上げなし 0.17・持ち上げ 0.23');
  row('論文の模型の形 α7 k2 持ち上げ', { alpha: 7, k: 2 });
  row('布・持ち上げなし', { surf: 'cloth', lift: false });
  row('布・持ち上げ', { surf: 'cloth', lift: true });
  row('なめらかな板・持ち上げ', { surf: 'board', lift: true });
  row('どの向きも同じ・持ち上げ', { surf: 'same', lift: true });
  row('どの向きも同じ・持ち上げなし', { surf: 'same', lift: false });
} else if (mode === 'slope') {
  console.log('実験（Hu 2009）: 7 ± 2° をこえると後ろへすべる');
  for (const a of [0, 3, 5, 7, 9, 12, 15]) row(`布・持ち上げ 坂 ${a}°`, { surf: 'cloth', lift: true, slope: a });
} else if (mode === 'dt') {
  for (const n of [100, 200, 400]) row(`布・持ち上げ dt=τ/${n}`, { surf: 'cloth', lift: true }, 2 / n);
}
else if (mode === 'tree') {
  const TR = require('../js/tree.js');
  const show = (n, o, dt) => {
    const r = TR.measure(o, 4, dt);
    console.log(`${n.padEnd(20)} 1回で ${(r.up * 100).toFixed(2)} cm  速さ ${(r.speed * 100).toFixed(2)} cm/s  落ちた ${r.fellAt ? r.fellAt.toFixed(2) + ' 秒' : 'なし'}  つかみ ${(r.lg * 100).toFixed(1)} cm  まん中 ${(r.lm * 100).toFixed(1)} cm  ひと回り ${r.encircle}  必要 ${(r.need * r.lg / (0.421 * 9.81)).toFixed(2)} 体重  使う最大 ${(r.useMax * 100).toFixed(0)}%`);
    return r;
  };
  console.log('実物（Astley & Jayne 2007、125 cm）: まっすぐ立つ柱を 1.6・2.9・4.1 cm は登れた、5.7 cm 以上は登れない');
  for (const D of [0.016, 0.029, 0.041, 0.045, 0.05, 0.057]) show(`幹 ${(D * 100).toFixed(1)} cm`, { D });
  show('順番ちがい', { order: 'wrong' });
  show('ウロコを立てない', { scales: 'flat' });
  show('ななめ 45°', { slope: 45 });
  let lo = 0.5, hi = 4;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (TR.measure({ safety: m }).fellAt) lo = m; else hi = m; }
  console.log(`落ちない締めつけの余裕（4 cm の幹）: ${hi.toFixed(2)} 倍以上`);
  for (const dt of [0.008, 0.004, 0.002]) show(`dt ${dt}`, { }, dt);
}
else if (mode === 'stones') {
  const ST = require('../js/stones.js');
  for (const o of [{}, { surf: 'cloth' }, { surf: 'same' }, { preset: 'half' }, { ahead: 0 }, { ahead: 0.04 }, { ahead: 0.12 }]) {
    const r = ST.measure(o, 6);
    console.log(`${JSON.stringify(o).padEnd(18)} 速さ ${(r.speed * 100).toFixed(2)} cm/s  押す力の合計 体重の ${r.Navg.toFixed(3)} 倍  1つの最大 ${r.Nmax.toFixed(3)}  止まった時間 ${(r.stopFrac * 100).toFixed(0)}%  押した石 最大 ${r.kmax}  地面の摩擦 ${r.drag.toFixed(3)}`);
  }
} else if (mode === 'rect') {
  const RC = require('../js/rect.js');
  for (const surf of ['cloth', 'board']) for (const duty of [0.35, 0.4, 0.44, 0.5, 0.6]) {
    const r = RC.measure({ surf, duty });
    console.log(`${surf.padEnd(6)} 止まる ${duty}  速さ ${(r.speed * 100).toFixed(3)} cm/s（すべらなければ ${(r.ideal * 100).toFixed(2)}）  比 ${r.ratio.toFixed(3)}  支える摩擦 最大 ${(r.useMax * 100).toFixed(0)}%`);
  }
} else if (mode === 'side') {
  const base = { gait: 'side', L: 0.48, mass: 0.098, tau: 2, k: 4, alpha: 18, surf: 'same', contact: 0.3, delta: 1.51 };
  const run = (name, o) => {
    const s = GR.make(Object.assign({}, base, o)), dt = 0.01;
    for (let t = 0; t < 4; t += dt) GR.step(s, dt);
    const x0 = s.X, y0 = s.Y; let cx = 0, cy = 0, sl = 0, sw = 0;
    for (let t = 0; t < 8; t += dt) {
      GR.step(s, dt);
      for (let i = 0; i < GR.N; i++) if (s.nu[i] > 0) { const w = s.nu[i], a = 2 * Math.atan2(s.ty[i], s.tx[i]); cx += w * Math.cos(a); cy += w * Math.sin(a); sl += w * Math.hypot(s.vx[i], s.vy[i]); sw += w; }
    }
    const dx = s.X - x0, dy = s.Y - y0, v = Math.hypot(dx, dy) / 8;
    let ang = Math.abs((Math.atan2(dy, dx) - Math.atan2(cy, cx) / 2) * 180 / Math.PI) % 180; if (ang > 90) ang = 180 - ang;
    console.log(`${name.padEnd(16)} 速さ ${(v * 100).toFixed(1)} cm/s（1回で体長の ${(v * 2 / 0.48 * 100).toFixed(0)}%）  跡と進む向き ${ang.toFixed(0)}°  ふれている所のすべり 速さの ${(sl / sw / v * 100).toFixed(0)}%`);
  };
  console.log('論文（Marvi ほか 2014）: 跡と進む向きの角度 33 ± 8°、ふれている所は止まっている、位相のずれ 1.51 ± 0.17 rad');
  run('ふつう', {});
  run('布', { surf: 'cloth' });
  run('ずれ 0°', { delta: 0 });
  run('ずれ 45°', { delta: Math.PI / 4 });
  run('ふれる 20%', { contact: 0.2 });
  run('ふれる 45%', { contact: 0.45 });
  run('α 12', { alpha: 12 });
  console.log('--- 立体（js/side3d.js）。実物: 跡 33 ± 8°・止まっている所 44%（Astley ほか 2015）・ふれている所はすべらない・砂に 1.4 ± 1.3 cm めりこむ');
  const S3 = require('../js/side3d.js');
  const r3 = (name, o) => { const r = S3.measure(o); console.log(`${name.padEnd(18)} 1回で体長の ${(r.perCycle * 100).toFixed(0)}%  跡と進む向き ${r.track.toFixed(0)}°  止まっている所 ${(r.still * 100).toFixed(0)}%  ふれている所のすべり 速さの ${(r.slip * 100).toFixed(0)}%  ふれる所の数 ${r.contacts.toFixed(1)}  めりこみ ${(r.sinkMax * 1000).toFixed(0)} mm  高さ ${(r.lift * 100).toFixed(1)} cm`); };
  r3('砂（既定）', {});
  r3('かたい地面', { sink: 0.001 });
  r3('持ち上げ 0.1', { Av: 0.1 });
  r3('持ち上げ 0.3', { Av: 0.3 });
  r3('ふれる 20%', { contact: 0.2 });
  r3('ふれる 60%', { contact: 0.6 });
  r3('勢いなし', { inert: 0.01 });
  r3('なめらかな2つの波', { shape: 'wave', Ah: 1.2, Av: 0.6 });
}
