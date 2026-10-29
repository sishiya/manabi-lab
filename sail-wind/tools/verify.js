// 帆船が風で進むしくみ — 物理の確かめ（node tools/verify.js、sail-wind/ で）
// 1. 表から求めた落ちついた速さが、Python-VPP の VPP.run が直接解いた速さ（tools/ref-vpp.json）と 1% 以内
// 2. 時間を進めた最後の速さ（アプリと同じ Sim）が、表の落ちついた速さと 1% 以内
// 3. 真後ろでは船速 < 風速、押されるだけの帆は真後ろより速くならない
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const { makeTable, KN } = require(path.join(root, 'js/table.js'));
const meta = JSON.parse(fs.readFileSync(path.join(root, 'data/yd41.json'), 'utf8'));
const buf = m => { const b = fs.readFileSync(path.join(root, 'data/yd41-' + m + '.bin')); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const T = makeTable(meta, { orc: buf('orc'), push: buf('push') });
// アプリの sim.js をそのまま読む
const ctx = { KN, Math, console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/sim.js'), 'utf8') + ';this.Sim = Sim;', ctx);
const Sim = ctx.Sim; Sim.T = T;

let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? 'OK ' : 'NG ') + msg); };

// 1
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref-vpp.json'), 'utf8'));
let worst = 0, worstAt = '';
ref.tws_kn.forEach((tws, i) => ref.twa.forEach((twa, j) => {
  const r = ref.vb_kn[i][j]; if (!r) return;
  const v = T.steady('orc', tws, twa), e = Math.abs(v - r) / r;
  if (e > worst) { worst = e; worstAt = `TWS ${tws} kt TWA ${twa}°: 表 ${v.toFixed(3)} / VPP ${r.toFixed(3)} kt`; }
}));
check(worst < 0.01, `表の落ちついた速さ と Python-VPP の差 いちばん大きいところ ${(worst * 100).toFixed(2)}%（${worstAt}）`);

// 2
for (const [tws, twa] of [[6, 180], [6, 90], [6, 45], [16, 90], [16, 140]]) {
  Sim.S.twsKn = tws; Sim.S.mode = 'orc'; Sim.reset(); Sim.setHeading(twa); Sim.run(400);
  const v = Sim.S.v / KN, s = T.steady('orc', tws, twa);
  check(Math.abs(v - s) / s < 0.01, `時間を進めた速さ TWS ${tws} TWA ${twa}: ${v.toFixed(3)} kt（表 ${s.toFixed(3)}）`);
}

// 3
for (const tws of meta.tws_kn) {
  const d = T.steady('orc', tws, 180), b = T.steady('orc', tws, 90), p90 = T.steady('push', tws, 90), p180 = T.steady('push', tws, 180);
  check(d < tws, `TWS ${tws}: 真後ろ ${d.toFixed(2)} kt（比 ${(d / tws).toFixed(2)}）< 風、真横 ${b.toFixed(2)}（比 ${(b / tws).toFixed(2)}・真後ろの ${(b / d).toFixed(2)} 倍）、押されるだけ 真横 ${p90.toFixed(2)}・真後ろ ${p180.toFixed(2)}`);
  check(p90 <= p180 + 1e-6, `TWS ${tws}: 押されるだけの帆は真横（${p90.toFixed(2)}）が真後ろ（${p180.toFixed(2)}）より遅い`);
}
// 落ちつく点で横の力もつりあっている（ok = 1）
let notOk = 0;
for (const tws of meta.tws_kn) for (let a = 40; a <= 180; a += 5) { const s = T.steady('orc', tws, a); if (s > 0 && T.lookup('orc', tws, a, s).ok < 0.99) notOk++; }
check(notOk === 0, `落ちついた速さで横の力がつりあわない点: ${notOk}`);
console.log(bad ? `NG ${bad} 件` : 'すべて OK');
process.exit(bad ? 1 : 0);
