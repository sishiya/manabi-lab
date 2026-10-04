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
  SIM.pk = pk; SIM.path = PATHOGENS[pk]; SIM.P = { ...P, drugs:{} };
  SIM.y = SIM.path.init(SIM.P); SIM.t = 0;
  SIM.hist = []; SIM.fc = []; SIM.fcDirty = true;
  SIM.fired = new Set(); SIM.log = [];
  SIM.flags = { t:0, P:SIM.P, infectedEver:false, feverEver:false, feverT:null, peakPassed:false }; SIM.drains = [];
  SIM.tally = {}; SIM.cellTally = {}; SIM.peakV = 0; SIM.maxTemp = 36.7; SIM.maxDmg = 0; SIM.endT = null;
  SIM.o = SIM.path.obs(SIM.y, SIM.P);
  recordHist(); checkEvents();
}

// change parameters in the middle (immune sliders). The dose only matters at the start.
function simSetParams(p) { Object.assign(SIM.P, p); SIM.fcDirty = true; }
// the same number comes in again (re-exposure)
function simAddDose(n) {
  if (SIM.path.kind === 'virus') SIM.y.V += n; else if (SIM.y.Bu != null) SIM.y.Bu += n; else SIM.y.Bac += n;
  SIM.endT = null; SIM.fcDirty = true;
  SIM.fired.delete('clear'); SIM.fired.delete('blocked');
  addLog({ id:'again', title:'もう一度入ってきた', tag:'art', text:`同じ病原体が ${fmtCount(n)} 入ってきた。いまの免疫の状態で迎え撃つ。` });
}

// ---------- medicines (stage B) ----------
function simStartDrug(key) {
  const D = DRUGS[key], d = SIM.P.drugs || (SIM.P.drugs = {});
  d[key] = { on:SIM.t, off:SIM.t + D.days };
  SIM.fcDirty = true;
  let when = '';
  if (SIM.flags.feverT != null) {
    const h = (SIM.t - SIM.flags.feverT) * 24;
    when = h < 0.5 ? '熱が出たところで始めた。' : `熱が出てから${Math.round(h)}時間後に始めた。`;
    const lim = key === 'nirm' ? 120 : 48;
    if (D.eff) when += h <= lim ? `（${lim}時間以内なので効きやすい）` : `（${lim}時間を過ぎると効き目はかなり小さい）`;
  } else if (D.eff) when = 'まだ熱が出る前に始めた（家族がかかったときの予防に使うことがある）。';
  addLog({ id:'drug-' + key, title:`${D.name}を始めた`, tag:'sure', drug:true, text:`${D.how}。${when}${D.text}` });
}
function simStopDrug(key) {
  const d = SIM.P.drugs && SIM.P.drugs[key];
  if (d && d.off > SIM.t) { d.off = SIM.t; SIM.fcDirty = true; addLog({ id:'stop-' + key, title:`${DRUGS[key].name}をやめた`, tag:'art', drug:true, text:'途中でやめると、残った菌やウイルスがまた増えることがある。' }); }
}
function simAntipyretic() {
  const d = SIM.P.drugs || (SIM.P.drugs = {});
  (d.apy || (d.apy = [])).push(SIM.t);
  SIM.fcDirty = true;
  addLog({ id:'apy', title:'解熱剤を飲んだ', tag:'sure', drug:true, text:DRUGS.apy.text });
}
// incision and drainage of an abscess: most pus and the bacteria inside it are let out (a one-time change of the state)
function simDrain() {
  const y = SIM.y, k = HILL(y.Pus, 3e7);
  y.Pus *= 0.1; y.Bac *= 1 - 0.75 * k; y.S *= 0.6;
  SIM.fcDirty = true; SIM.drains = (SIM.drains || []).concat(SIM.t);
  addLog({ id:'drain', title:'切ってうみを出した', tag:'sure', drug:true,
    text:'病院で皮膚を小さく切り、たまったうみを出した（切開排膿）。うみの中の菌もいっしょに出ていく。うみの中には抗生物質も免疫細胞も届きにくいので、大きな膿瘍ではこれがいちばん大事な治療。' });
}
const drugActive = key => { const d = SIM.P.drugs && SIM.P.drugs[key]; return !!d && SIM.t >= d.on && SIM.t < d.off; };

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
  if (o.infected * (SIM.path.N0 || 0) >= 1 || (SIM.path.kind === 'bacteria' && (y.N >= 1e6 || (y.S || 0) > 0.3))) F.infectedEver = true;
  if (o.rawTemp >= 37.5) { if (!F.feverEver) F.feverT = SIM.t; F.feverEver = true; }
  if (o.pathogen > SIM.peakV) SIM.peakV = o.pathogen;
  else if (F.infectedEver && SIM.path.kind === 'virus' && o.pathogen < SIM.peakV * 0.5 && SIM.peakV > 1e7) F.peakPassed = true;
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

// ---------- what is happening now ----------
// verdict (悪化中 / ピーク / 快方へ …), a one-line phase, the pathogen trend over the last 6 hours (log10 per day),
// and the model's births vs removals right now, with the share of each way of removal.
function simStatus() {
  const H = SIM.hist, n = H.length, o = SIM.o, y = SIM.y, F = SIM.flags, isFlu = SIM.path.kind === 'virus';
  const back = H[Math.max(0, n - 13)], lg = x => Math.log10(Math.max(x, 1));
  const rate = n > 1 && SIM.t - back.t > 1e-3 ? (lg(o.pathogen) - lg(back.o.pathogen)) / (SIM.t - back.t) : 0;
  const fx = SIM.path.flux(y, SIM.P), sum = w => Object.values(w).reduce((a, b) => a + Math.max(0, b), 0);
  const removal = fx.pathogen, gone = sum(removal), born = isFlu ? fx.prod : fx.growth;
  const cellKill = isFlu && sum(fx.infected) * PATHOGENS.flu.N0 > 1 ? fx.infected : null;
  const foe = isFlu ? 'ウイルス' : '菌';
  const r = (verdict, tone, phase) => ({ verdict, tone, phase, rate, born, gone, removal, cellKill });
  if (!F.infectedEver) {
    if (SIM.t > 0.3 && o.pathogen < 1) return r('感染しなかった', 'good', isFlu ? '細胞の中で増える前に、粘液とマクロファージが片づけた' : '補体と、もともといたマクロファージが片づけた');
    return r('入ってきた', 'calm', isFlu ? '粘液がウイルスをからめとり、のどへ流そうとしている' : '補体とマクロファージがすぐに働きはじめた');
  }
  if (SIM.endT !== null) return o.damage > 0.03
    ? r('回復中', 'good', isFlu ? 'ウイルスはもういない。死んだ細胞のあとを、下の細胞が分かれて修理している' : '菌はもういない。傷んだ組織を修理している')
    : r('治った', 'good', '記憶細胞が残り、次に同じ相手が来たら早く戦える');
  const severe = o.sym.some(s => /肺へ|菌血症|敗血症/.test(s));
  if (rate > 0.25) {
    if (!F.feverEver && o.rawTemp < 37.5 && !o.sym.some(s => !/解熱剤|水分/.test(s))) return r('潜伏期', 'warn', isFlu ? '細胞の中でウイルスが増えている。まだ症状は出ない' : '菌が増えている。まだ目立たない');
    return r(severe ? '悪化中（重い）' : '悪化中', 'bad', isFlu ? 'ウイルスが増え、隣の細胞へ感染が広がっている' : '菌が増え、好中球が追いついていない');
  }
  if (rate > -0.25) return r('ピーク', 'warn', `${foe}が増える速さと減る速さがつり合っている`);
  const adaptive = y.T > 1e5 || y.Ab > 0.3;
  const abx = !isFlu && (drugLevel(SIM.P, 'ceph', SIM.t) > 0.3 || drugLevel(SIM.P, 'vanc', SIM.t) > 0.3);
  return r(severe ? '快方へ（まだ重い）' : '快方へ', 'good', isFlu
    ? (adaptive ? 'キラーT細胞と抗体が、ウイルスと感染した細胞を片づけている' : 'インターフェロンと自然免疫が、ウイルスの増え方をおさえている')
    : (abx ? '抗生物質と好中球が菌を減らしている' : adaptive ? '好中球と抗体が菌を減らしている' : '好中球が菌を減らしている'));
}
