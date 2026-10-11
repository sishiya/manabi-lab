// 推定に使う表を作る: node lab/make-table.js
// 男性・女性・子どもごとに、筋肉と肺の圧とすき間の組み合わせを模型（js/letalker.js）で計算し、
// js/analyze.js と同じ分析で特徴を取り出して js/table.js に書く（画面はこれを読むだけ。マイクの声もサンプルも同じ表で推定する）。
// すき間 0.042cm のときだけ息の乱れの雑音を入れる（LeTalker の標準は雑音なし。すき間の広い声で雑音が目立つので）。
const fs = require('fs'), path = require('path');
const LT = require('../js/letalker.js'), A = require('../js/analyze.js');
const ACT = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1], ATA = ACT, PLS = [3000, 5000, 8000, 12000, 16000], GAPS = [0.011, 0.025, 0.042];
const T = { made: '2026-10-11', grid: { act: ACT, ata: ATA, PL: PLS, x01: GAPS }, vowel: 'aa', dur: 0.6, cols: ['act', 'ata', 'PL', 'x01', 'f0', 'voiced', 'hnr', 'cpp', 'h1h2', 'closed'], rows: {} };
const rd = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
for (const sex of ['male', 'female', 'child']) {
  const rows = []; const t0 = Date.now();
  for (const act of ACT) for (const ata of ATA) for (const PL of PLS) for (const x01 of GAPS) {
    const r = LT.run({ sex, act, ata, alc: 0.5, PL, x01, x02: x01 - 0.001, vowel: 'aa', noise: x01 >= 0.04 ? 1 : 0, dur: T.dur });
    const o = A.analyze(r.po, r.fs, { from: 0.3 });
    let cl = 0; const i0 = Math.round(0.4 * r.ga.length);
    for (let i = i0; i < r.ga.length; i++) if (r.ga[i] <= 2e-7) cl++;
    rows.push([act, ata, PL, x01, rd(o.f0), rd(o.voiced), rd(o.hnr), rd(o.cpp), rd(o.h1h2), rd(cl / (r.ga.length - i0))]);
  }
  T.rows[sex] = rows;
  console.log(sex, rows.length, 'rows', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
const G = '(typeof self !== "undefined" ? self : globalThis)';
const text = '// lab/make-table.js が作った表（手で直さない）\n' + G + '.VF_TABLE = ' + JSON.stringify(T) + ';\nif (typeof module !== "undefined") module.exports = ' + G + '.VF_TABLE;\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'table.js'), text);
console.log('wrote js/table.js', text.length, 'bytes');
