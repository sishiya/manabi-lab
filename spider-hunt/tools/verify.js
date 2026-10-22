// 計算の確かめ: node spider-hunt/tools/verify.js
// 1) Dill 1975 図4 の「しきい値 0.3 rad/s のハエに、どこまで寄れるか」を再現する
// 2) 跳躍の放物線が跳ぶ距離に届くか
// 3) 6 通り（速さ3 × モデル2）＋かがむ の結果を一覧にする
'use strict';
const M = require('../js/model.js');
let ng = 0;
const ok = (c, msg) => { console.log((c ? 'OK  ' : 'NG  ') + msg); if (!c) ng++; };

// 1) しきい値に届く距離（S = 7mm、かがまない）。遠くから 0.01mm ずつ
function reach(speed) {
  for (let D = 26; D > 5; D -= 0.01) if (M.angRate(7, D, M.stalkV({ speed }, D)) >= 0.3) return D;
  return null;
}
const dDill = reach('dill'), dConst = reach('const');
console.log(`Dill の速さ: ${dDill.toFixed(1)}mm（論文の図4: 11.8mm）／一定の速さ: ${dConst.toFixed(1)}mm（論文: 16.2mm）`);
ok(Math.abs(dConst - 16.2) < 0.3, '一定の速さで近づくと 16.2mm で気づかれる（±0.3mm）');
ok(Math.abs(dDill - 11.8) < 0.8, 'Dill の速さで近づくと 11.8mm 前後まで寄れる（±0.8mm。図3 の回帰式から計算すると 11.1mm。論文の図4は図3の平均の点から描いたと思われ、少しずれる）');
ok(dDill < dConst, 'おそくする近づき方のほうが近くまで寄れる');

// 2) 跳躍
const a = M.jumpAngle(11.6), v = M.DATA.jump.v, tf = 2 * v * Math.sin(a) / 9810, R = v * Math.cos(a) * tf;
console.log(`跳躍: 角度 ${(a * 180 / Math.PI).toFixed(1)}°、飛んでいる時間 ${(tf * 1000).toFixed(1)}ms、届く距離 ${R.toFixed(2)}mm`);
ok(Math.abs(R - 11.6) < 0.01, '放物線が跳ぶ距離 11.6mm に届く');

// 3) 一覧
const fmt = x => x == null ? '   —  ' : (x * 1000).toFixed(0).padStart(5) + 'ms';
console.log('\n速さ    モデル  かがむ | 気づく距離  跳びつき  飛び立ち  とどく   結果');
for (const speed of ['dill', 'const', 'fast']) for (const model of ['size', 'rate']) for (const crouch of [false, true]) {
  const P = { speed, model, crouch, fastV: 30 };
  const st = M.run(P), ev = st.ev, vd = M.verdict(st);
  // 気づいた距離をもう一度計算する（run は距離を残さないので、同じ条件で追う）
  const s2 = M.newState(P); let dWr = null;
  while (!M.done(s2) && s2.t < 30) { M.step(s2, P, 0.0005); if (dWr == null && s2.ev.wr != null) dWr = s2.D; }
  const t0 = ev.pounce || 0;
  console.log(`${speed.padEnd(6)} ${model.padEnd(5)} ${crouch ? 'はい ' : 'いいえ'} | ${dWr == null ? '   —   ' : (dWr.toFixed(1) + 'mm').padStart(7)}  ${fmt(ev.pounce != null ? 0 : null)}  ${fmt(ev.to != null ? ev.to - t0 : null)}  ${fmt(ev.contact != null ? ev.contact - t0 : null)}  ${vd ? vd.k + (vd.m != null ? ' (' + (vd.m * 1000).toFixed(1) + 'ms)' : '') : '—'}`);
}
console.log('（時刻は跳びつき（踏み切りの始まり）からの ms。結果の（）は「とどく − 飛び立ち」。正ならハエが先）');

// 4) 大きさモデルでは、忍び寄りのあいだに気づかない（跳ぶ前に 49° に届かない）
const st = M.run({ speed: 'dill', model: 'size' });
ok(st.ev.wr > st.ev.pounce, '大きさのモデルでは、ハエが気づくのはクモが跳んだあと');
ok(M.angSize(7, 11.6) * 180 / Math.PI < 49, `跳びつく距離での見かけの大きさ ${(M.angSize(7, 11.6) * 180 / Math.PI).toFixed(1)}° は 49° より小さい`);

console.log(ng ? `\nNG ${ng} 件` : '\nすべて OK');
process.exit(ng ? 1 : 0);
