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

// opt: { y0 (start state instead of a fresh body), mode ('normal' | 'vaccine' | 'second'), ghost ([{t, o}] drawn faintly
// for comparison), ghostName }
function simReset(pk, P, opt) {
  opt = opt || {};
  SIM.pk = pk; SIM.path = PATHOGENS[pk]; SIM.P = { ...P, drugs:{} };
  SIM.y = opt.y0 || SIM.path.init(SIM.P); SIM.t = SIM.y.t || 0;
  SIM.mode = opt.mode || 'normal'; SIM.challenged = false;
  SIM.ghost = opt.ghost || null; SIM.ghostName = opt.ghostName || ''; SIM.first = opt.first || null;
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
function simAddDose(n, silent) {
  if (SIM.path.kind === 'virus') SIM.y.V += n; else if (SIM.y.Bu != null) SIM.y.Bu += n; else SIM.y.Bac += n;
  SIM.endT = null; SIM.fcDirty = true;
  SIM.fired.delete('clear'); SIM.fired.delete('blocked');
  if (!silent) addLog({ id:'again', title:L('もう一度入ってきた', 'It got in again'), tag:'art', text:L(`同じ病原体が ${fmtCount(n)} 入ってきた。いまの免疫の状態で迎え撃つ。`, `${fmtCount(n)} of the same germ got in. The immune system meets them in its current state.`) });
}

// ---------- second infection and vaccines (stage D) ----------
const zeroPathogen = y => { const z = { ...y }; for (const k of ['V', 'I', 'E', 'Bac', 'Bb', 'Bu', 'Ba']) if (z[k] != null) z[k] = 0; return z; };

// Recovered, then after `gap` days the same pathogen comes in again (drift: a slightly changed strain, so old antibodies
// fit badly). The time in between is run through the model without the pathogen: antibodies fall, T and B cells
// shrink back to a memory pool. The first course is kept as a faint comparison line.
function simSecond(gap, drift, P) {
  const path = SIM.path, firstHist = SIM.hist.map(p => ({ t:p.t, o:p.o })), firstMax = SIM.maxTemp, firstPeak = SIM.peakV;
  const Pq = { ...SIM.P, drugs:{}, vacc:null };
  let w = zeroPathogen(SIM.y);
  for (let i = 0; i < gap * 24; i++) w = rk4(path, w, Pq, 1 / 24);
  const y0 = { ...path.init(P), t:0, T:w.T, B:w.B * (drift ? 0.3 : 1), Ab:w.Ab * (drift ? 0.15 : 1) };
  simReset(SIM.pk, P, { y0, mode:'second', ghost:firstHist, ghostName:L('1回目', '1st time'), first:{ maxTemp:firstMax, peak:firstPeak } });
  const when = gap >= 365 ? L('1年後', 'A year later') : L('1か月後', 'A month later');
  addLog({ id:'second', title:L(`${when}、${drift ? '少し型の変わったものが' : '同じものが'}また入ってきた`, `${when}, ${drift ? 'a slightly changed strain' : 'the same germ'} got in again`), tag:'sure',
    text:L(`前の感染で増えたキラーT細胞・B細胞の一部が「記憶細胞」として残っている（いま キラーT ${fmtCount(w.T)}、B細胞 ${fmtCount(w.B)}。最初はどちらも数百個だった）。抗体は${gap >= 365 ? 'ゆっくり減ったが、作り続ける細胞（長寿命の形質細胞）のおかげで少し残っている' : 'まだたくさん残っている'}。${drift ? 'ただし、ウイルスの表面の形が少し変わっているので、前の抗体はあまりくっつかない（インフルエンザやコロナが毎年はやる理由）。' : ''}うすい線が1回目。`,
      `Some of the killer T cells and B cells that multiplied in the last infection remain as “memory cells” (now killer T ${fmtCount(w.T)}, B cells ${fmtCount(w.B)}; both were only a few hundred at first). Antibodies ${gap >= 365 ? 'slowly decreased, but some remain thanks to cells that keep making them (long-lived plasma cells)' : 'are still plentiful'}. ${drift ? 'But the virus surface has changed a little, so old antibodies do not stick well (the reason flu and COVID-19 spread every year). ' : ''}The faint line is the first time.`) });
}

// Vaccine practice: the body meets the vaccine first (no pathogen). simChallenge() later lets the real one in;
// a faint line shows what the same dose would have done without the vaccine.
function simVaccinate(pk, P) {
  const V = VACCINES[pk];
  const y0 = zeroPathogen(PATHOGENS[pk].init({ ...P, mem:'none' }));
  simReset(pk, { ...P, mem:'none', vaccine:V, vacc:V.doses.slice() }, { y0, mode:'vaccine' });
  addLog({ id:'vac0', title:L(`${V.name}を打った（${V.kind}）`, `Got the ${V.name} (${V.kind})`), tag:'sure', text:V.text + (V.doses.length > 1 ? L(` ${V.doses[1]}日後に2回目を打つ。`, ` The second shot comes ${V.doses[1]} days later.`) : '') });
}
function simChallenge(n) {
  const path = SIM.path, Pn = { ...SIM.P, drugs:{}, vaccine:null, vacc:null };
  const fresh = path.init({ ...Pn, mem:'none', dose:n });
  SIM.ghost = forecast(path, { ...fresh, t:SIM.t }, Pn, SIM.t, 21, 1 / 12).map(s => ({ t:s.t, o:s.o }));
  SIM.ghostName = L('ワクチンなしなら', 'without the vaccine');
  simAddDose(n, true);
  SIM.challenged = true; SIM.flags.infectedEver = false; SIM.endT = null; SIM.peakV = 0; SIM.maxTemp = 36.7;
  addLog({ id:'chal', title:L(`${path.kind === 'virus' ? 'ウイルス' : '菌'}が入ってきた（ワクチンのあと）`, `${path.kind === 'virus' ? 'Viruses' : 'Bacteria'} got in (after the vaccine)`), tag:'sure',
    text:L('待ちかまえていた抗体がすぐにくっつき、記憶B細胞・記憶T細胞が数日のうちに増える。うすい線は、ワクチンを打っていなかった場合。', 'Antibodies lying in wait stick right away, and memory B and T cells multiply within days. The faint line shows what happens without the vaccine.') });
}

// ---------- medicines (stage B) ----------
function simStartDrug(key) {
  const D = DRUGS[key], d = SIM.P.drugs || (SIM.P.drugs = {});
  d[key] = { on:SIM.t, off:SIM.t + D.days };
  SIM.fcDirty = true;
  let when = '';
  if (SIM.flags.feverT != null) {
    const h = (SIM.t - SIM.flags.feverT) * 24;
    when = h < 0.5 ? L('熱が出たところで始めた。', 'Started just as the fever began. ') : L(`熱が出てから${Math.round(h)}時間後に始めた。`, `Started ${Math.round(h)} hours after the fever began. `);
    const lim = key === 'nirm' ? 120 : 48;
    if (D.eff) when += h <= lim ? L(`（${lim}時間以内なので効きやすい）`, `(within ${lim} hours, so it works well) `) : L(`（${lim}時間を過ぎると効き目はかなり小さい）`, `(after ${lim} hours the effect is much smaller) `);
  } else if (D.eff) when = L('まだ熱が出る前に始めた（家族がかかったときの予防に使うことがある）。', 'Started before any fever (sometimes used to prevent illness when a family member is sick). ');
  addLog({ id:'drug-' + key, title:L(`${D.name}を始めた`, `Started ${D.name}`), tag:'sure', drug:true, text:L(`${D.how}。${when}${D.text}`, `${D.how}. ${when}${D.text}`) });
}
function simStopDrug(key) {
  const d = SIM.P.drugs && SIM.P.drugs[key];
  if (d && d.off > SIM.t) { d.off = SIM.t; SIM.fcDirty = true; addLog({ id:'stop-' + key, title:L(`${DRUGS[key].name}をやめた`, `Stopped ${DRUGS[key].name}`), tag:'art', drug:true, text:L('途中でやめると、残った菌やウイルスがまた増えることがある。', 'Stopping partway can let the remaining bacteria or viruses multiply again.') }); }
}
function simAntipyretic() {
  const d = SIM.P.drugs || (SIM.P.drugs = {});
  (d.apy || (d.apy = [])).push(SIM.t);
  SIM.fcDirty = true;
  addLog({ id:'apy', title:L('解熱剤を飲んだ', 'Took a fever reducer'), tag:'sure', drug:true, text:DRUGS.apy.text });
}
// incision and drainage of an abscess: most pus and the bacteria inside it are let out (a one-time change of the state)
function simDrain() {
  const y = SIM.y, k = HILL(y.Pus, 3e7);
  y.Pus *= 0.1; y.Bac *= 1 - 0.75 * k; y.S *= 0.6;
  SIM.fcDirty = true; SIM.drains = (SIM.drains || []).concat(SIM.t);
  addLog({ id:'drain', title:L('切ってうみを出した', 'Cut open and drained the pus'), tag:'sure', drug:true,
    text:L('病院で皮膚を小さく切り、たまったうみを出した（切開排膿）。うみの中の菌もいっしょに出ていく。うみの中には抗生物質も免疫細胞も届きにくいので、大きな膿瘍ではこれがいちばん大事な治療。', 'At the hospital, a small cut was made in the skin to let the collected pus out (incision and drainage). The bacteria in the pus come out with it. Antibiotics and immune cells have trouble reaching inside pus, so for a large abscess this is the most important treatment.') });
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
  const waiting = SIM.mode === 'vaccine' && !SIM.challenged;          // vaccine practice: nothing to finish yet
  if (!waiting && SIM.endT === null && SIM.t > 0.3 && SIM.path.ended(y)) SIM.endT = SIM.t;
}

function checkEvents() {
  const waiting = SIM.mode === 'vaccine' && !SIM.challenged;
  const list = (waiting ? [] : EVENTS[SIM.pk]).concat(MODE_EVENTS[SIM.mode] || []);
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
  if (LANG === 'en') {
    if (n < 1) return '0';
    if (n < 1e4) return String(Math.round(n));
    for (const [v, s] of [[1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million'], [1e3, ' thousand']]) if (n >= v) {
      const x = n / v; return (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(0) : x.toFixed(1)) + s;
    }
  }
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
  return L(`${d}日 ${String(h).padStart(2, '0')}時間`, `Day ${d} ${String(h).padStart(2, '0')}h`);
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
  const foe = isFlu ? L('ウイルス', 'Viruses') : L('菌', 'Bacteria');
  const r = (verdict, tone, phase) => ({ verdict, tone, phase, rate, born, gone, removal, cellKill });
  if (SIM.mode === 'vaccine' && !SIM.challenged) {                 // vaccine practice: no enemy yet
    const doses = SIM.P.vacc.filter(td => SIM.t >= td).length, next = SIM.P.vacc.find(td => td > SIM.t);
    const ph = y.Ab > 0.05 ? (doses > 1 ? L('2回目で記憶細胞が一気に増え、抗体がたくさんできた', 'The second shot made memory cells jump and lots of antibodies form') : L('抗体ができた。記憶細胞も残る', 'Antibodies formed. Memory cells remain too')) : y.B > 2e3 ? L('このかけらに合うB細胞・T細胞がリンパ節で増えている', 'B cells and T cells that match this piece are multiplying in the lymph nodes') : L('樹状細胞がワクチンのかけらをリンパ節へ運んでいる', 'Dendritic cells are carrying vaccine pieces to the lymph nodes');
    return r(L('ワクチンで練習中', 'Practicing with a vaccine'), 'calm', ph + (next != null ? L(`（${next}日目に${doses + 1}回目）`, ` (shot ${doses + 1} on day ${next})`) : ''));
  }
  if (!F.infectedEver) {
    if (SIM.t > 0.3 && o.pathogen < 1) return r(L('感染しなかった', 'No infection'), 'good', isFlu ? L('細胞の中で増える前に、粘液とマクロファージが片づけた', 'Mucus and macrophages cleared them before they could multiply in cells') : L('補体と、もともといたマクロファージが片づけた', 'Complement and resident macrophages cleared them'));
    return r(L('入ってきた', 'Just got in'), 'calm', isFlu ? L('粘液がウイルスをからめとり、のどへ流そうとしている', 'Mucus is trapping the viruses and trying to carry them to the throat') : L('補体とマクロファージがすぐに働きはじめた', 'Complement and macrophages started working right away'));
  }
  if (SIM.endT !== null) return o.damage > 0.03
    ? r(L('回復中', 'Recovering'), 'good', isFlu ? L('ウイルスはもういない。死んだ細胞のあとを、下の細胞が分かれて修理している', 'The viruses are gone. Cells below are dividing to repair where cells died') : L('菌はもういない。傷んだ組織を修理している', 'The bacteria are gone. The damaged tissue is being repaired'))
    : r(L('治った', 'Recovered'), 'good', L('記憶細胞が残り、次に同じ相手が来たら早く戦える', 'Memory cells remain and can fight fast if the same enemy comes again'));
  const severe = o.sym.some(s => /肺へ|菌血症|敗血症|to the lungs|bacteremia|sepsis/.test(s));
  const quiet = !F.feverEver && o.rawTemp < 37.5 && !o.sym.some(s => !/解熱剤|水分|副反応|by medicine|water and salts|side effect/.test(s));
  // before any symptom: in the first days the dip after arrival (mucus clearing the dose) is not "getting better"
  if (quiet && SIM.t < 2 && rate <= 0.25 && SIM.mode !== 'second') return r(L('潜伏期', 'Incubation'), 'warn', isFlu ? L('入ったウイルスの一部が細胞の中で増えはじめている。まだ症状は出ない', 'Some of the viruses are starting to multiply inside cells. No symptoms yet') : L('菌が足場を作ろうとしている。まだ目立たない', 'The bacteria are trying to get a foothold. Nothing shows yet'));
  if (rate > 0.25) {
    if (quiet) return r(L('潜伏期', 'Incubation'), 'warn', isFlu ? L('細胞の中でウイルスが増えている。まだ症状は出ない', 'Viruses are multiplying inside cells. No symptoms yet') : L('菌が増えている。まだ目立たない', 'The bacteria are multiplying. Nothing shows yet'));
    return r(severe ? L('悪化中（重い）', 'Getting worse (serious)') : L('悪化中', 'Getting worse'), 'bad', isFlu ? L('ウイルスが増え、隣の細胞へ感染が広がっている', 'Viruses are increasing and the infection is spreading to neighboring cells') : L('菌が増え、好中球が追いついていない', 'The bacteria are increasing and neutrophils cannot keep up'));
  }
  if (rate > -0.25) return r(L('ピーク', 'Peak'), 'warn', L(`${foe}が増える速さと減る速さがつり合っている`, `${foe} are increasing and decreasing at about the same speed`));
  const adaptive = y.T > 1e5 || y.Ab > 0.3;
  const abx = !isFlu && (drugLevel(SIM.P, 'ceph', SIM.t) > 0.3 || drugLevel(SIM.P, 'vanc', SIM.t) > 0.3);
  return r(severe ? L('快方へ（まだ重い）', 'Getting better (still serious)') : L('快方へ', 'Getting better'), 'good', isFlu
    ? (adaptive ? L('キラーT細胞と抗体が、ウイルスと感染した細胞を片づけている', 'Killer T cells and antibodies are clearing the viruses and infected cells') : L('インターフェロンと自然免疫が、ウイルスの増え方をおさえている', 'Interferon and innate immunity are holding back the viruses'))
    : (abx ? L('抗生物質と好中球が菌を減らしている', 'Antibiotics and neutrophils are reducing the bacteria') : adaptive ? L('好中球と抗体が菌を減らしている', 'Neutrophils and antibodies are reducing the bacteria') : L('好中球が菌を減らしている', 'Neutrophils are reducing the bacteria')));
}
