// レールガンのしくみ — 計算の検証（node railgun/tools/verify.js [isl|atla|dt]）
// isl : Hundertmark & Liebfried 2017 の結果（約 2,500 m/s・電流の平らな所 約 4.5 MA・効率 47/40/33%）と比べる
// atla: 40 mm 試作の推定の値が、公開値（5 MJ で 320 g が 2,297 m/s・効率 約17%）に合うか
// dt  : 刻みを変えても答えが変わらないか・エネルギーの帳じり
'use strict';
const PH = require('../js/physics.js');
const PR = require('../js/presets.js');
const mode = process.argv[2] || 'isl';
const f = (x, d = 1) => x.toFixed(d);

function show(name, p, dt) {
  const s = PH.run(p, dt);
  const r = PH.summary(s);
  // 電流の「平らな所」: 1〜4 ms の平均
  const mid = s.hist.filter(h => h.t > 1e-3 && h.t < 4e-3);
  const Imid = mid.length ? mid.reduce((a, h) => a + h.I, 0) / mid.length : NaN;
  console.log(`${name.padEnd(14)} 蓄え ${f(r.E0 / 1e6)} MJ  砲口 ${f(r.t * 1e3, 2)} ms  ${f(r.v, 0)} m/s  運動 ${f(r.KE / 1e6, 2)} MJ  効率 ${f(r.eff * 100)}%  ` +
    `最大 ${f(r.Imax / 1e6, 2)} MA  1-4ms ${f(Imid / 1e6, 2)} MA  熱 ${f(r.Q / 1e6, 2)}  摩擦 ${f(r.Wf / 1e6, 2)}  残り磁場 ${f(r.left / 1e6, 2)}  コンデンサ残 ${f(r.Ecap / 1e6, 2)} MJ  ` +
    `平均 ${f(r.accG / 1000, 1)} 千G  帳じり ${r.err.toExponential(1)}`);
  return r;
}

if (mode === 'isl') {
  console.log('論文: 0.1 mΩ → 53 MJ・47%、0.5 mΩ → 63 MJ・40%、1 mΩ → 75 MJ・33%、どれも約 2,500 m/s（25 MJ）、平らな所 約 4.5 MA、砲口まで 約 5〜6 ms');
  for (const R of [0.1, 0.5, 1]) show(`ISL ${R} mΩ`, PR.isl(R));
} else if (mode === 'atla') {
  console.log('公開値: 5 MJ・8.5 kV・320 g・初速 2,297 m/s（効率 17%）、全長 約6 m');
  show('atla', PR.atla());
  show('atla 一度に', PR.atla({ seq: false }));
  show('atla 3 MJ', PR.atla({ E: 3e6 }));
  show('atla 1 kg', PR.atla({ m: 1 }));
} else if (mode === 'dt') {
  for (const dt of [2e-6, 1e-6, 5e-7, 2.5e-7]) show(`ISL0.1 dt=${dt}`, PR.isl(0.1), dt);
  for (const dt of [1e-6, 5e-7, 2.5e-7]) show(`atla dt=${dt}`, PR.atla(), dt);
}
