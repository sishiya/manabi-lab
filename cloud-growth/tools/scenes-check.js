// 雲ができるまで — 9場面を画面なしで回して、できる雲を確かめる
// node cloud-growth/tools/scenes-check.js [場面id ...]
'use strict';
const path = require('path');
for (const f of ['thermo', 'solver', 'scenes']) require(path.join(__dirname, '../js/' + f + '.js'));
const { SCENES, columnStats, classifyAll, bandName } = globalThis.CS, makeSim = globalThis.makeSim;
const NS = +(process.env.NS || 6), want = process.argv.slice(2);
for (const sc of SCENES) {
  if (want.length && !want.includes(sc.id)) continue;
  const sim = makeSim(sc);
  if (sc.init) sc.init(sim);
  sim.diagAll();
  const T0 = Date.now(); let steps = 0, next = sc.horizon / NS, prevRain = 0, prevT = 0, nan = false;
  console.log(`== ${sc.id} ${sc.name} dx=${sim.dx.toFixed(1)} dz=${sim.dz.toFixed(1)}`);
  while (sim.S.t < sc.horizon && !nan) {
    sim.step(); steps++;
    if (steps % 20 === 0) for (const [nm, a] of [['h', sim.h], ['qt', sim.qt], ['qp', sim.qp], ['u', sim.u], ['w', sim.w], ['T', sim.T]]) { const ix = a.findIndex(v => !Number.isFinite(v)); if (ix >= 0) { nan = true; console.log('  NaN!', nm, 't=', sim.S.t, 'i=', ix % sim.nx, 'k=', Math.floor(ix / sim.nx)); break; } }
    if (sim.S.t >= next) {
      next += sc.horizon / NS;
      const cols = columnStats(sim);
      const rain = sim.rainCol.reduce((a, b) => a + b, 0) / sim.nx, rate = (rain - prevRain) / (sim.S.t - prevT) * 3600; prevRain = rain; prevT = sim.S.t;
      let wm = 0, qnm = 0, qpm = 0; for (const v of sim.w) wm = Math.max(wm, Math.abs(v)); for (const v of sim.qn) qnm = Math.max(qnm, v); for (const v of sim.qp) qpm = Math.max(qpm, v);
      const r = classifyAll(cols, sim, rate, wm);
      let band = '';
      if (sc.bands) { const m = new Map(); for (const c of cols) { const b = bandName(c, rate); m.set(b, (m.get(b) || 0) + 1); } band = ' ' + [...m].map(([a, b]) => (a || '-') + ':' + b).join(' '); }
      console.log(`  t=${(sim.S.t / 3600).toFixed(2)}h ${r.name} 雲量${(r.cover * 100).toFixed(0)}% 底${r.base ? (r.base / 1000).toFixed(2) : '-'} 頂${r.top ? (r.top / 1000).toFixed(2) : '-'}km τ${(r.tauM || 0).toFixed(1)} 氷${(r.iceM || 0).toFixed(2)} w${wm.toFixed(1)} qn${(qnm * 1e3).toFixed(2)} qp${(qpm * 1e3).toFixed(2)}g/kg 雨${rate.toFixed(2)}mm/h${band}`);
    }
  }
  console.log(`  ${steps} 歩 ${((Date.now() - T0) / 1000).toFixed(0)} s（1歩 ${((Date.now() - T0) / steps).toFixed(1)} ms）`);
}
