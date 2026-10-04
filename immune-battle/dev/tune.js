// dev/tune.js — model checking helper (not published). In the browser console on index.html:
//   const s=document.createElement('script'); s.src='dev/tune.js'; document.head.appendChild(s);
//   tuneRun('flu','adult',5,'none',true)   // one course, half-day rows
//   tuneTable('staph')                      // every body × memory × dose
'use strict';
window.tfmt = x => x < 1e-3 && x > 0 ? x.toExponential(0) : x < 10 ? x.toFixed(2) : x.toExponential(1);
window.tuneRun = function (pk, body, dose, mem, show, extra) {
  const B = BODIES[body], P = { dose: 10 ** dose, inn: B.inn, adp: B.adp, fev: B.fev, mem, ...(extra || {}) };
  const path = PATHOGENS[pk], out = forecast(path, path.init(P), P, 0, 21, 0.25);
  let maxT = 0, maxD = 0, maxP = 0, tP = 0, end = null, fevH = 0; const sym = new Set(), L = [];
  for (const s of out) {
    if (s.o.temp > maxT) maxT = s.o.temp; if (s.o.temp >= 37.5) fevH += 6; if (s.o.damage > maxD) maxD = s.o.damage;
    if (s.o.pathogen > maxP) { maxP = s.o.pathogen; tP = s.t; }
    if (end === null && s.t > 0.5 && path.ended(s.y)) end = s.t; s.o.sym.forEach(x => sym.add(x));
  }
  L.push([pk, body, '1e' + dose, mem, '| maxT', maxT.toFixed(1), 'fevH', fevH, 'Dmg', tfmt(maxD), 'peak', tfmt(maxP), '@', tP.toFixed(1), 'end', end && end.toFixed(1), '|', [...sym].join(',')].join(' '));
  if (show) for (const s of out.filter((_, i) => i % 2 == 0)) L.push([' d' + s.t.toFixed(1), 'P', tfmt(s.o.pathogen), 'inf', tfmt(s.o.infected), 'T', tfmt(s.o.killerT), 'Ab', tfmt(s.o.antibody), 'temp', s.o.temp.toFixed(1), 'D', tfmt(s.o.damage),
    pk == 'staph' ? 'N ' + tfmt(s.y.N) + ' S ' + tfmt(s.y.S) + ' Bb ' + tfmt(s.y.Bb) + ' pus ' + tfmt(s.o.pus) : 'F ' + tfmt(s.y.F) + ' R ' + tfmt(s.y.R) + ' NK ' + tfmt(s.y.NK)].join(' '));
  return L.join('\n');
};
window.tuneTable = function (pk, doses) {
  const path = PATHOGENS[pk], L = [];
  doses = doses || (pk == 'flu' ? [3, 4, 5, 6, 7] : [3, 4, 5, 6, 7, 8]);
  for (const body of BODY_ORDER) for (const mem of Object.keys(path.memOptions)) for (const d of doses) L.push(tuneRun(pk, body, d, mem));
  return L.join('\n');
};
