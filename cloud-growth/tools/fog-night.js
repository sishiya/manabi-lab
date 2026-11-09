// 雲ができるまで — 3次元の霧の「夜明け前の空」を作る
// 夜の6時間半を3次元で計算すると待ち時間が長すぎるので、2次元の本編で計算して、高さごとの平均を js/fog-start.js に書き出す
// node cloud-growth/tools/fog-night.js
'use strict';
const path = require('path'), fs = require('fs');
for (const f of ['thermo', 'solver', 'scenes']) require(path.join(__dirname, '../js/' + f + '.js'));
const sc = globalThis.CS.SCENES.find(s => s.id === 'fog'), T = 6.5 * 3600, cp = globalThis.CT.cp;
const sim = globalThis.makeSim(sc);
sc.init(sim); sim.diagAll();
while (sim.S.t < T) sim.step();
const { nx, nz } = sim, mean = a => Array.from({ length: nz }, (_, k) => { let m = 0; for (let i = 0; i < nx; i++) m += a[k * nx + i]; return m / nx; });
const s = mean(sim.h).map(v => +(v / cp - 300).toFixed(4)), qt = mean(sim.qt).map(v => +v.toFixed(7)), u = mean(sim.u).map(v => +v.toFixed(3));
let base = null, top = null; mean(sim.qn).forEach((v, k) => { if (v > 1e-5) { if (base === null) base = k; top = k; } });
const body = `// tools/fog-night.js が作ったファイル（手で直さない）。霧の場面の夜明け前の空: 2次元の本編で夜 6.5 時間を計算し、高さごとに平均した値\nexport const FOG_START = ${JSON.stringify({ t: sim.S.t, s, qt, u })};\n`;
fs.writeFileSync(path.join(__dirname, '../js/fog-start.js'), body);
console.log(`t=${(sim.S.t / 3600).toFixed(2)}h 霧の底 ${base === null ? '-' : sim.zc[base]} m 上面 ${top === null ? '-' : sim.zc[top]} m`);
