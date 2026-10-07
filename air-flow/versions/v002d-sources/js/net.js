// ================= ventilation network: how much air goes in and out =================
// Each connected air space is one zone with one indoor pressure p. Openings follow the orifice
// equation Q = αA·√(2Δp/ρ); fans follow a straight P-Q line (less flow against more pressure).
// p is found by bisection so that what comes in equals what goes out.
'use strict';

// wind pressure coefficient of a low-rise wall (Swami & Chandra 1987, ASHRAE Fundamentals).
// th = angle between the wall's outward normal and the direction the wind comes from (rad)
function cpWall(th) {
  const s2 = Math.sin(th / 2), c2 = Math.cos(th / 2), s = Math.sin(th), G = 0;
  const v = 1.248 - .703 * s2 - 1.175 * s * s + .131 * Math.pow(Math.sin(2 * th * G), 3)
    + .769 * c2 + .07 * G * G * s2 * s2 + .717 * c2 * c2;
  return 0.6 * Math.log(v);
}
const FACADE_AZ = { W: 270, E: 90, N: 0, S: 180 };   // compass direction the wall faces
function facadeP(f, wind) {
  const [from, U] = wind;
  let d = Math.abs(((from - FACADE_AZ[f]) % 360 + 540) % 360 - 180) * Math.PI / 180;
  return cpWall(d) * 0.5 * RHO * U * U;
}

// one orifice: flow into the zone (m³/s)
const orifice = (aa, dp) => aa * Math.sign(dp) * Math.sqrt(2 * Math.abs(dp) / RHO);
// one fan: flow out of the zone (m³/s). dp = p_outside - p_inside (what the fan has to push against)
function fanOut(lv, dp) {
  const q = lv.q / 3600 * (1 - dp / lv.p);
  return Math.max(0, Math.min(q, 1.6 * lv.q / 3600));
}

// floor area of the flat (m²) for the leakage area
function floorArea() { let n = 0; for (let c = 0; c < W * H; c++) if (cell[c] === FLUID) n++; return n * DX * DX; }

// list of everything that moves air across the outer wall, for the current states
function netItems(st, wind) {
  const items = [];
  const area = floorArea();
  const wsum = OPENINGS.filter(o => o.kind !== 'vent').reduce((s, o) => s + o.w, 0);
  for (const o of OPENINGS) {
    const p = facadeP(o.facade, wind), s = st[o.key] | 0;
    if (o.kind === 'window' || o.kind === 'door') {
      // the window frame / door gap share of the building leakage (always there)
      items.push({ el: o, type: 'leak', aa: LEAK_C * 1e-4 * area * o.w / wsum, p, cells: o.inner });
      if (s > 0) {
        // sliding window: "少し" = 10 cm, "開ける" = one of the two panes (half the width)
        const wOpen = o.kind === 'door' ? o.w : (s === 1 ? 0.1 : o.w / 2);
        const n = Math.max(1, Math.round(wOpen / DX));
        // the open part is at the end where the panes meet (the middle of the window)
        const mid = o.inner.length >> 1, a = s === 1 ? mid - 1 : (o.kind === 'door' ? 0 : mid - n);
        const cells = o.kind === 'door' ? o.inner : o.inner.slice(Math.max(0, a), Math.max(0, a) + n);
        items.push({ el: o, type: 'open', aa: CD * wOpen * o.h, area: wOpen * o.h, p, cells });
      }
    } else if (o.kind === 'vent' && s > 0) {
      items.push({ el: o, type: 'vent', aa: VENT_AA * VENT_OPEN[s], p, cells: o.inner });
    }
  }
  for (const f of FANS) {
    const s = st[f.key] | 0;
    if (s > 0) items.push({ el: f, type: 'fan', lv: f.levels[s], p: facadeP(f.facade, wind), cells: f.cells });
  }
  return items;
}

// solve each zone. zoneOf: cell → zone id (from fluid.js). Returns {zones:[{p,qin,qout,...}], items}
function solveNet(st, wind, zoneOf, nZones) {
  const items = netItems(st, wind);
  for (const it of items) it.zone = zoneOf[it.cells[0]];
  const zones = [];
  for (let z = 0; z < nZones; z++) {
    const mine = items.filter(it => it.zone === z);
    const bal = p => {
      let q = 0;
      for (const it of mine) q += it.type === 'fan' ? -fanOut(it.lv, it.p - p) : orifice(it.aa, it.p - p);
      return q;
    };
    let lo = -3000, hi = 3000, p = 0;
    if (mine.length) {
      for (let k = 0; k < 80; k++) { p = (lo + hi) / 2; if (bal(p) > 0) lo = p; else hi = p; }
    }
    let qin = 0, qout = 0;
    for (const it of mine) {
      it.q = it.type === 'fan' ? -fanOut(it.lv, it.p - p) : orifice(it.aa, it.p - p);
      if (it.q > 0) qin += it.q; else qout -= it.q;
    }
    zones.push({ p, qin, qout, items: mine });
  }
  // single-sided exchange through each open window / door from wind turbulence (Warren & Parkins 1985)
  const U = wind[1];
  for (const it of items) it.qx = it.type === 'open' ? 0.025 * it.area * U : 0;
  return { zones, items };
}
