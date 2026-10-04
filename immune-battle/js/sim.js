// sim.js — the running course: current state, history (for the chart), forecast (dotted lines), story events,
// and running totals of *how* the pathogen was removed (from the model's separate terms).
'use strict';

const SIM = {
  pk:'flu', path:null, P:null, y:null, t:0,
  hist:[], fc:[], fcDirty:true,
  fired:new Set(), log:[], onEvent:null,
  flags:{}, tally:{}, cellTally:{}, peakV:0, maxTemp:36.7, maxDmg:0, endT:null,
};
const HIST_EVERY = 1 / 48;     // 30 min
const FC_DAYS = 21;

function simReset(pk, P) {
  SIM.pk = pk; SIM.path = PATHOGENS[pk]; SIM.P = { ...P };
  SIM.y = SIM.path.init(SIM.P); SIM.t = 0;
  SIM.hist = []; SIM.fc = []; SIM.fcDirty = true;
  SIM.fired = new Set(); SIM.log = [];
  SIM.flags = { t:0, P:SIM.P, infectedEver:false, feverEver:false, peakPassed:false };
  SIM.tally = {}; SIM.cellTally = {}; SIM.peakV = 0; SIM.maxTemp = 36.7; SIM.maxDmg = 0; SIM.endT = null;
  SIM.o = SIM.path.obs(SIM.y, SIM.P);
  recordHist(); checkEvents();
}

// change parameters in the middle (immune sliders). The dose only matters at the start.
function simSetParams(p) { Object.assign(SIM.P, p); SIM.fcDirty = true; }
// the same number comes in again (re-exposure)
function simAddDose(n) {
  if (SIM.pk === 'flu') SIM.y.V += n; else SIM.y.Bac += n;
  SIM.endT = null; SIM.fcDirty = true;
  SIM.fired.delete('clear'); SIM.fired.delete('blocked');
  addLog({ id:'again', title:'もう一度入ってきた', tag:'art', text:`同じ病原体が ${fmtCount(n)} 入ってきた。いまの免疫の状態で迎え撃つ。` });
}

function recordHist() {
  SIM.hist.push({ t:SIM.t, o:SIM.o });
}

function simAdvance(days) {
  const path = SIM.path;
  let left = days;
  while (left > 1e-12) {
    const h = Math.min(DT, left);
    // running totals of removal by each route (Euler on the separate terms)
    const fx = path.flux(SIM.y, SIM.P);
    for (const k in fx.pathogen) SIM.tally[k] = (SIM.tally[k] || 0) + fx.pathogen[k] * h;
    if (fx.infected) for (const k in fx.infected) SIM.cellTally[k] = (SIM.cellTally[k] || 0) + fx.infected[k] * h * path.N0;
    SIM.y = rk4(path, SIM.y, SIM.P, h);
    SIM.t += h; left -= h;
    if (SIM.t + 1e-9 >= (SIM.hist.length) * HIST_EVERY) {
      SIM.o = path.obs(SIM.y, SIM.P);
      recordHist();
      trackFlags();
      checkEvents();
    }
  }
  SIM.o = path.obs(SIM.y, SIM.P);
}

function trackFlags() {
  const y = SIM.y, o = SIM.o, F = SIM.flags;
  F.t = SIM.t;
  if (o.infected * (SIM.path.N0 || 0) >= 1 || (SIM.pk === 'staph' && y.N >= 1e6)) F.infectedEver = true;
  if (o.temp >= 37.5) F.feverEver = true;
  if (o.pathogen > SIM.peakV) SIM.peakV = o.pathogen;
  else if (F.infectedEver && SIM.pk === 'flu' && o.pathogen < SIM.peakV * 0.5 && SIM.peakV > 1e7) F.peakPassed = true;
  SIM.maxTemp = Math.max(SIM.maxTemp, o.temp); SIM.maxDmg = Math.max(SIM.maxDmg, o.damage);
  if (SIM.endT === null && SIM.t > 0.3 && SIM.path.ended(y)) SIM.endT = SIM.t;
}

function checkEvents() {
  const list = EVENTS[SIM.pk];
  SIM.flags.t = SIM.t;
  for (const e of list) {
    if (SIM.fired.has(e.id)) continue;
    if (e.when(SIM.y, SIM.o, SIM.flags)) { SIM.fired.add(e.id); addLog(e); }
  }
}
function addLog(e) {
  const item = { t:SIM.t, ...e };
  SIM.log.push(item);
  if (SIM.onEvent) SIM.onEvent(item);
}

function simForecast() {
  const out = forecast(SIM.path, SIM.y, SIM.P, SIM.t, Math.max(3, FC_DAYS - SIM.t + 2), 1 / 12);
  SIM.fc = out.map(s => ({ t:s.t, o:s.o }));
  SIM.fcDirty = false;
}

// ---------- formatting ----------
function fmtCount(n) {
  if (n < 1) return '0個';
  if (n < 1e4) return Math.round(n) + '個';
  const u = [[1e12, '兆'], [1e8, '億'], [1e4, '万']];
  for (const [v, s] of u) if (n >= v) {
    const x = n / v;
    return (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(0) : x.toFixed(1)) + s + '個';
  }
}
function fmtTime(t) {
  const d = Math.floor(t + 1e-9), h = Math.floor((t - d) * 24 + 1e-6);
  return `${d}日 ${String(h).padStart(2, '0')}時間`;
}
