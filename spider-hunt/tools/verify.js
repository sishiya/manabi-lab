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

// 3) 一覧（獲物 × 速さ × モデル）。p はつかまえる確率（獲物が動く時刻のばらつきから）
const fmt = x => x == null ? '   —  ' : (x * 1000).toFixed(0).padStart(5) + 'ms';
console.log('\n獲物        速さ   モデル | 気づく距離  逃げる予定  とどく   結果');
for (const prey of ['housefly', 'drosophila', 'roach']) for (const speed of ['dill', 'const', 'fast']) for (const model of (prey === 'roach' ? ['size'] : ['size', 'rate'])) {
  const P = { speed, model, crouch: true, fastV: 30, prey };
  const s2 = M.newState(P); let dWr = null;
  while (!M.done(s2) && s2.t < 30) { M.step(s2, P, 0.0005); if (dWr == null && s2.ev.wr != null) dWr = s2.D; }
  const ev = s2.ev, vd = M.verdict(s2, P), t0 = ev.pounce;
  console.log(`${prey.padEnd(11)} ${speed.padEnd(6)} ${(prey === 'roach' ? 'wind' : model).padEnd(5)} | ${dWr == null ? '   —   ' : (dWr.toFixed(1) + 'mm').padStart(7)}  ${fmt(ev.toPlan != null && t0 != null ? ev.toPlan - t0 : null)}  ${fmt(ev.contact != null ? ev.contact - t0 : null)}  ${vd ? (vd.k || '?') + ' p=' + vd.p.toFixed(2) : '—'}`);
}
console.log('（時刻は跳びつき（踏み切りの始まり）から）');

// 4) 大きさモデルでは、忍び寄りのあいだに気づかない（跳ぶ前に 49° に届かない）
const st = M.run({ speed: 'dill', model: 'size', crouch: true, prey: 'housefly' });
const rr = M.run({ speed: 'dill', model: 'size', crouch: true, prey: 'roach' });
ok(M.verdict(rr, { prey: 'roach' }).k === 'caught', 'ゴキブリ（風で気づく）は、跳躍が速すぎて間に合わない');
ok(Math.abs(M.phi(0) - 0.5) < 1e-6 && Math.abs(M.phi(1.96) - 0.975) < 1e-3, '正規分布の累積の式');
ok(st.ev.wr > st.ev.pounce, '大きさのモデルでは、ハエが気づくのはクモが跳んだあと');
ok(M.angSize(7, 11.6) * 180 / Math.PI < 49, `跳びつく距離での見かけの大きさ ${(M.angSize(7, 11.6) * 180 / Math.PI).toFixed(1)}° は 49° より小さい`);

// 5) ぼけで距離を知るしくみ（Nagata 2012 の式）
const O = require('../js/optics.js'), Ly = O.layers();
ok(Math.abs(O.estimate(20, 'red') / 20 - 0.90) < 1e-9, '赤い光では 2cm を 0.90 倍に見積もる（f はこの比から逆算した推定）');
ok(O.blur(11.6, O.OPT.Fg, Ly.L2) > O.blur(30, O.OPT.Fg, Ly.L2) && O.blur(30, O.OPT.Fg, Ly.L2) > O.blur(73, O.OPT.Fg, Ly.L2), '緑の光: 近いほど L2 のぼけが大きい');
ok(O.Fr() > O.OPT.Fg, '赤のほうが焦点距離が長い（色収差）');
const Pr = { speed: 'dill', model: 'size', crouch: true, prey: 'housefly', color: 'red' }, sr = M.run(Pr), Pw = Object.assign({}, Pr, { color: 'white' });
console.log(`赤い光: ${sr.Dp.toFixed(2)}mm から跳び ${sr.short.toFixed(2)}mm 手前に着地。つかまえる割合 ${M.verdict(sr, Pr).p.toFixed(2)}（ふつう ${M.verdict(M.run(Pw), Pw).p.toFixed(2)}）`);
ok(sr.Dp > 11.6 && sr.short > 0, '赤い光では遠くから跳び、手前に着地する');
ok(M.verdict(sr, Pr).p < M.verdict(M.run(Pw), Pw).p, '赤い光ではつかまえる割合が下がる');

console.log(ng ? `\nNG ${ng} 件` : '\nすべて OK');
process.exit(ng ? 1 : 0);
