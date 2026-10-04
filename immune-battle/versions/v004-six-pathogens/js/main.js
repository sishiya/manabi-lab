// main.js — panel UI, time controls, the main loop, "what is happening now" status, result summary, debug hook window.__ib.
'use strict';

const $ = id => document.getElementById(id);
const errs = [];
window.addEventListener('error', e => errs.push(String(e.message || e)));

const SPEEDS = [['10分/秒', 10 / 1440], ['1時間/秒', 1 / 24], ['6時間/秒', 0.25]];
const UI = { pk:'flu', body:'adult', mem:'none', resist:false, dose:5, inn:1, adp:1, speed:1, playing:true, autoStop:28, last:0, acc:0, fcT:0 };
const log2 = x => Math.log2(x), pow2 = x => 2 ** x;
const isVirus = () => SIM.path.kind === 'virus';
const foeName = () => isVirus() ? 'ウイルス' : '菌';

// names and colours of the ways the pathogen is removed (keys of flux.pathogen)
const TALLY = {
  mucus:['粘液で流された・自然にこわれた', '#c9e3a0'], mac:['マクロファージが食べた', '#4fb3d9'], ab:['抗体（IgA）が無力化', '#cdefff'], cell:['細胞に入った', '#e58fb4'],
  comp:['補体', '#7fe6ff'], neut:['好中球', '#bcdcff'], abx:['抗生物質', '#a6e86b'], wash:['おしっこで流された', '#e8d97a'], exfol:['はがれた細胞といっしょに出た', '#e6cbc6'],
};
function tallyNames() {
  const out = {}, keys = Object.keys(SIM.path.flux(SIM.y, SIM.P).pathogen);
  for (const k of keys) out[k] = k === 'mucus' && SIM.path.scene === 'gut' ? ['腸の流れ・便で出た・自然にこわれた', '#c9e3a0'] : k === 'mac' && !isVirus() ? ['マクロファージ', '#4fb3d9'] : TALLY[k];
  return out;
}
const TALLY_NAMES = { cells: { self:['ウイルスのせいで死んだ', '#e58fb4'], nk:['NK細胞が壊した', '#38cfc4'], ctl:['キラーT細胞が壊した', '#4d7dff'] } };
// what is listed under 画面の見かた for each place
const KEYS = {
  airway: ['virion', 'infected', 'macrophage', 'nk', 'ctl', 'dc', 'plasma', 'antibody', 'protectedCell', 'cell', 'goblet', 'mucus', 'rbc', 'drug'],
  gut: ['virion', 'infected', 'macrophage', 'nk', 'ctl', 'dc', 'plasma', 'antibody', 'protectedCell', 'enterocyte', 'goblet', 'gutMucus', 'chyme', 'rbc'],
  skin: ['bacterium', 'complement', 'macrophage', 'neutrophil', 'helper', 'antibody', 'pus', 'keratinocyte', 'fibroblast', 'rbc', 'drug'],
  alveolus: ['bacterium', 'macrophage', 'neutrophil', 'helper', 'antibody', 'pus', 'alvWall', 'airspace', 'rbc', 'drug'],
  bladder: ['bacterium', 'neutrophil', 'macrophage', 'helper', 'antibody', 'umbrella', 'urine', 'rbc', 'drug'],
};

// ---------- panel ----------
function buildPanel() {
  const pw = $('pathogens');
  for (const k of PATHOGEN_ORDER) {
    const p = PATHOGENS[k], b = document.createElement('button');
    b.dataset.k = k;
    b.innerHTML = `<span>${p.icon} ${p.name}</span><small>${p.kind === 'virus' ? 'ウイルス' : '細菌'}・${p.site}</small>`;
    b.onclick = () => { UI.pk = k; UI.dose = p.doseDefault; if (!p.memOptions[UI.mem]) UI.mem = 'none'; restart(); };
    pw.appendChild(b);
  }
  const bw = $('bodies');
  for (const k of BODY_ORDER) {
    const b = document.createElement('button'); b.dataset.k = k; b.textContent = BODIES[k].name;
    b.onclick = () => { UI.body = k; UI.inn = BODIES[k].inn; UI.adp = BODIES[k].adp; restart(); };
    bw.appendChild(b);
  }
  $('dose').oninput = e => { UI.dose = +e.target.value; $('doseV').textContent = fmtCount(10 ** UI.dose); };
  $('dose').onchange = () => restart();
  $('inn').oninput = e => { UI.inn = +pow2(+e.target.value).toFixed(3); sliderLabels(); simSetParams({ inn:UI.inn }); markCustom(); };
  $('adp').oninput = e => { UI.adp = +pow2(+e.target.value).toFixed(3); sliderLabels(); simSetParams({ adp:UI.adp }); markCustom(); };
  $('again').onclick = () => simAddDose(10 ** UI.dose);
  const sp = $('speeds');
  SPEEDS.forEach(([name], i) => {
    const b = document.createElement('button'); b.innerHTML = name.replace('/秒', '<span class="ps">/秒</span>'); b.dataset.i = i;
    b.onclick = () => { UI.speed = i; UI.playing = true; syncTime(); };
    sp.appendChild(b);
  });
  $('play').onclick = () => { UI.playing = !UI.playing; if (UI.playing && SIM.t >= UI.autoStop) restart(); syncTime(); };
  $('reset').onclick = () => restart();
  $('labels').onchange = e => { MI.labels = e.target.checked; };
  $('talk').onchange = e => { MI.talk = e.target.checked; if (!MI.talk) MI.callouts = []; };
  $('bwToggle').onclick = () => { const w = $('bodyWin'); w.classList.toggle('min'); $('bwToggle').textContent = w.classList.contains('min') ? '+' : '−'; };
  MI.cv.addEventListener('click', e => {
    if (CAM.moved > 4) return;                                  // it was a drag, not a tap
    if (!MI.tissueMain) { stepLevel(-1); return; }
    const p = pickAt(e); if (p) showCard(p.key); else hideCard();
  });
  MI.cv.addEventListener('pointermove', e => {
    const p = MI.hover, tip = $('hoverTip');
    if (!p || matchMedia('(pointer:coarse)').matches) { tip.hidden = true; return; }
    const r = MI.cv.getBoundingClientRect();
    tip.hidden = false; tip.textContent = `【${TEAMS[CELLS[p.key].team][0].replace(/（.*）/, '')}】${CELLS[p.key].name}`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
  });
  MI.cv.addEventListener('pointerleave', () => { $('hoverTip').hidden = true; });
}
function markCustom() { document.querySelectorAll('#bodies button').forEach(b => b.setAttribute('aria-pressed', false)); $('bodyNote').textContent = '免疫の細胞の数を手で変えた。'; }

function sliderLabels() {
  $('innV').textContent = '×' + fmtMul(UI.inn); $('adpV').textContent = '×' + fmtMul(UI.adp);
}
const fmtMul = x => x >= 1 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3);

function syncPanel() {
  const p = PATHOGENS[UI.pk];
  document.querySelectorAll('#pathogens button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === UI.pk));
  document.querySelectorAll('#bodies button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === UI.body && UI.inn === BODIES[UI.body].inn && UI.adp === BODIES[UI.body].adp));
  $('bodyNote').textContent = BODIES[UI.body].note;
  $('route').textContent = '入り方: ' + p.route;
  const mw = $('mems'); mw.innerHTML = '';
  for (const [k, name] of Object.entries(p.memOptions)) {
    const b = document.createElement('button'); b.textContent = name; b.setAttribute('aria-pressed', k === UI.mem);
    b.onclick = () => { UI.mem = k; restart(); };
    mw.appendChild(b);
  }
  const memNote = { staph:'黄色ブドウ球菌のワクチンはまだ実用化されていない。', noro:'ノロウイルスのワクチンはまだない（開発中）。', ecoli:'膀胱炎のワクチンは、日本ではまだ使われていない。' }[UI.pk];
  if (memNote) { const n = document.createElement('small'); n.className = 'note'; n.textContent = memNote; mw.appendChild(n); }
  const d = $('dose'); d.min = p.doseRange[0]; d.max = p.doseRange[1]; d.step = 0.5; d.value = UI.dose;
  $('doseV').textContent = fmtCount(10 ** UI.dose);
  $('inn').value = log2(UI.inn); $('adp').value = log2(UI.adp); sliderLabels();
  // key (what is on screen), grouped by team
  const lk = LOOK_KEY[p.look];
  const keys = KEYS[p.scene].map(k => k === 'virion' || k === 'bacterium' ? lk : k).filter(k => k !== 'drug' || p.drugs.some(d => DRUGS[d] && (DRUGS[d].eff || DRUGS[d].kill)));
  const kw = $('key'); kw.innerHTML = '';
  for (const team of Object.keys(TEAMS)) {
    const ks = keys.filter(k => CELLS[k].team === team);
    if (!ks.length) continue;
    const h = document.createElement('div'); h.className = 'teamH'; h.innerHTML = `<i style="background:${TEAMS[team][1]}"></i>${TEAMS[team][0]}`; kw.appendChild(h);
    const row = document.createElement('div'); row.className = 'teamRow'; kw.appendChild(row);
    for (const k of ks) {
      const b = document.createElement('button'); b.innerHTML = `<i style="background:${CELLS[k].color}"></i>${CELLS[k].name.replace(/（.*）/, '')}`;
      b.onclick = () => showCard(k); row.appendChild(b);
    }
  }
  buildMeds();
  chartLegend($('chartLegend'));
  syncTime();
}

function syncTime() {
  document.querySelectorAll('#speeds button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === UI.speed && UI.playing));
  $('play').textContent = UI.playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', UI.playing ? '一時停止' : '再生');
}

function showCard(key) {
  const c = CELLS[key], el = $('pickCard');
  el.hidden = false;
  el.innerHTML = `<button aria-label="閉じる">×</button><span class="team" style="border-color:${TEAMS[c.team][1]};color:${TEAMS[c.team][1]}">${TEAMS[c.team][0]}</span><b style="color:${c.color}">${c.name}</b>${c.size ? `<span class="sz">${c.size}</span>` : ''}<div>${c.text}</div>`;
  el.querySelector('button').onclick = hideCard;
}
function hideCard() { $('pickCard').hidden = true; }

// ---------- medicines (stage B) ----------
const MED_NOTES = {
  flu:'抗ウイルス薬は「症状が出てから48時間以内」が目安。早いほど効く。予測の点線を見ながら、いつ飲むとどう変わるか試してみよう。解熱剤は熱を下げるが、ウイルスの数は変えない。',
  covid:'飲み薬は、高齢者など重くなりやすい人に、症状が出てから5日以内に使う。予測の点線で、始める日による違いを見てみよう。',
  noro:'ノロウイルスに効く薬はない。からだがウイルスを追い出すまで、水分と塩分をとって脱水を防ぐ。アルコール消毒は効きにくく、手洗いと、塩素系の消毒（次亜塩素酸ナトリウム）がうつさない決め手。',
  staph:'うみがたまった膿瘍には抗生物質が届きにくい。大きな膿瘍では切ってうみを出すのが大事。MRSA にはセファレキシンが効かない。',
  pneumo:'肺炎球菌の肺炎は、抗生物質でよくなる。高齢者や免疫が弱い人では早めの治療が大事。ワクチン（予防接種）で重い肺炎や、菌が血液に入るのをかなり防げる。',
  ecoli:'水をたくさん飲んでおしっこの回数を増やすと、浮いている菌が流し出される。痛みや熱があれば抗生物質。細胞の中にかくれた菌が残ると、またぶり返すことがある。',
};
function buildMeds() {
  const box = $('meds'); box.innerHTML = '';
  const p = SIM.path;
  $('strainRow').hidden = !p.resistName;
  const sw = $('strains'); sw.innerHTML = '';
  if (p.resistName) for (const [k, name] of [[false, 'ふつうの菌'], [true, p.resistName]]) {
    const b = document.createElement('button'); b.textContent = name; b.setAttribute('aria-pressed', UI.resist === k);
    b.onclick = () => { UI.resist = k; restart(); };
    sw.appendChild(b);
  }
  for (const k of p.drugs) {
    const d = document.createElement('div'); d.className = 'med'; d.dataset.k = k;
    const name = k === 'drain' ? '切ってうみを出す（切開排膿）' : DRUGS[k].name;
    const how = k === 'drain' ? '病院で行う処置。うみがたまってから。' : DRUGS[k].how;
    d.innerHTML = `<div class="mh"><b>${name}</b><button></button></div><small>${how}</small><div class="ms"></div>`;
    d.querySelector('b').onclick = () => showDrug(k);
    d.querySelector('button').onclick = () => {
      if (k === 'apy') simAntipyretic();
      else if (k === 'drain') { simDrain(); microDrain(); }
      else if (drugActive(k)) simStopDrug(k); else simStartDrug(k);
      updateMeds(); UI.fcT = 99;
    };
    box.appendChild(d);
  }
  $('medNote').textContent = MED_NOTES[UI.pk] || '';
  updateMeds();
}
function updateMeds() {
  for (const d of document.querySelectorAll('#meds .med')) {
    const k = d.dataset.k, b = d.querySelector('button'), st = d.querySelector('.ms');
    if (k === 'apy') {
      const n = (SIM.P.drugs.apy || []).length, L = apyLevel(SIM.P, SIM.t);
      b.textContent = '1回飲む'; st.textContent = n ? `${n}回飲んだ・${L > 0.2 ? 'いま効いている' : '切れている'}` : '';
    } else if (k === 'drain') {
      b.textContent = '処置する'; b.disabled = !(SIM.o.pus > 0.15);
      st.textContent = SIM.drains.length ? `${SIM.drains.length}回 処置した` : (SIM.o.pus > 0.15 ? 'うみがたまっている' : 'うみがたまっていない');
    } else {
      const c = SIM.P.drugs[k], on = drugActive(k), L = drugLevel(SIM.P, k, SIM.t);
      b.textContent = on ? 'やめる' : c ? 'もう一度始める' : '始める';
      d.classList.toggle('on', L > 0.05);
      st.textContent = c ? `${fmtTime(c.on)}から${on ? `・あと${Math.max(0, Math.round((c.off - SIM.t) * 24))}時間` : '・終わった'}${L > 0.05 ? `・効き目 ${Math.round(L * 100)}%` : ''}` : '';
    }
  }
}
function showDrug(k) {
  const el = $('pickCard'), D = k === 'drain' ? { name:'切開排膿', how:'処置', text:'皮膚を小さく切り、膿瘍にたまったうみを出す。うみといっしょに中の菌も出ていき、抗生物質や免疫細胞が届くようになる。' } : DRUGS[k];
  el.hidden = false;
  el.innerHTML = `<button aria-label="閉じる">×</button><span class="team" style="border-color:${TEAMS.drug[1]};color:${TEAMS.drug[1]}">くすり・治療</span><b style="color:${TEAMS.drug[1]}">${D.name}</b><span class="sz">${D.how}</span><div>${D.text}</div>`;
  el.querySelector('button').onclick = hideCard;
}

// ---------- course ----------
function restart() {
  const p = PATHOGENS[UI.pk];
  UI.dose = clamp(UI.dose, p.doseRange[0], p.doseRange[1]);
  setScene(UI.pk);
  CH.hide.clear();
  $('log').innerHTML = ''; UI.lastEvent = null;
  simReset(UI.pk, { dose:10 ** UI.dose, inn:UI.inn, adp:UI.adp, fev:BODIES[UI.body].fev, mem:UI.mem, resist:UI.resist });
  simForecast();
  UI.playing = true; UI.fcT = 0;
  syncPanel(); updateNumbers(); updateResult(); updateStatus(); buildZoomUI();
}

SIM.onEvent = e => {
  const li = document.createElement('li');
  li.innerHTML = `<span class="tm">${fmtTime(e.t)}</span><span class="k k-${e.tag}">${{ sure:'確か', est:'推定', art:'演出' }[e.tag]}</span><b>${e.title}</b><br>${e.text}`;
  $('log').prepend(li);
  UI.lastEvent = e;
};

// ---------- "what is happening now" (top of the micro view) ----------
const VERDICT_COL = { bad:'#ff6b7f', warn:'#ffb04a', good:'#7fd3a0', calm:'#a9b4bd' };
function updateStatus() {
  const s = simStatus(), o = SIM.o, isFlu = isVirus(), foe = foeName();
  const arrow = s.rate > 0.25 ? '↗' : s.rate < -0.25 ? '↘' : '→';
  const fold = s.rate > 0.25 ? `1日で約${fmtFold(10 ** s.rate)}倍のペース` : s.rate < -0.25 ? `1日で約${fmtFold(10 ** -s.rate)}分の1のペース` : 'ほぼ横ばい';
  const tcol = s.rate > 0.25 ? '#ff6b7f' : s.rate < -0.25 ? '#7fd3a0' : '#ffb04a';
  // compact, on top of the picture
  let h = `<div class="st-top"><span class="st-v" style="background:${VERDICT_COL[s.tone]}">${s.verdict}</span><span>${s.phase}</span></div>`;
  h += `<div class="st-line">${foe} <b>${fmtCount(o.pathogen)}</b> ${o.pathogen >= 1 ? `<span style="color:${tcol}">${arrow} ${fold}</span>` : ''}　体温 <b>${o.temp.toFixed(1)}℃</b></div>`;
  if (o.pathogen >= 1) h += `<div class="st-line dim">いま1日に 生まれる ${fmtCount(s.born)} ／ 消える ${fmtCount(s.gone)}</div>`;
  $('status').innerHTML = h;
  // details, in the panel
  let d = '';
  if (o.pathogen >= 1) d += shareBar(`${foe}を${isFlu ? '減らしているもの' : 'やっつけているもの'}`, s.removal, tallyNames());
  if (isFlu && s.cellKill) d += shareBar('感染した細胞を終わらせているもの', s.cellKill, TALLY_NAMES.cells);
  if (isFlu) {
    const y = SIM.y, parts = [['健康', y.U, PAL.cell], ['守りを固めた', y.R, PAL.shield], ['乗っ取られた', y.E + y.I, PAL.takenOver], ['死んだ・修理中', y.D, '#6f6468']];
    d += `<div class="st-lab">粘膜の細胞（本当の割合）</div><div class="st-bar">${parts.map(([, v, c]) => `<span style="width:${100 * v}%;background:${c}"></span>`).join('')}</div>`;
    d += `<div class="st-legend">${parts.filter(p => p[1] > 0.005).map(([n, v, c]) => `<i style="background:${c}"></i>${n} ${pct(v)}`).join('　')}</div>`;
  } else if (o.free != null) d += `<div class="st-legend">尿に浮いている菌 ${fmtCount(o.free)}　細胞についた・中の菌 ${fmtCount(o.att)}　好中球 ${fmtCount(o.neutrophil)}</div>`;
  else if (o.spo2) d += `<div class="st-legend">肺胞がうまった割合 ${pct(o.damage)}　血液の酸素 ${o.spo2}%　好中球 ${fmtCount(o.neutrophil)}</div>`;
  else d += `<div class="st-legend">組織の傷み ${pct(o.damage)}　うみ ${pct(o.pus)}　好中球 ${fmtCount(o.neutrophil)}</div>`;
  if (UI.lastEvent) d += `<div class="st-ev">最新のできごと: ${UI.lastEvent.title}（${fmtTime(UI.lastEvent.t)}）</div>`;
  $('now').innerHTML = d || '<div class="st-legend">まだ何も起きていない</div>';
}
const fmtFold = x => x >= 100 ? Math.round(x).toLocaleString() : x >= 10 ? Math.round(x) : x.toFixed(1);
function shareBar(title, w, names) {
  const tot = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0);
  if (tot <= 0) return '';
  const ks = Object.keys(names).filter(k => w[k] > tot * 0.005);
  return `<div class="st-lab">${title}</div><div class="st-bar">${ks.map(k => `<span style="width:${100 * w[k] / tot}%;background:${names[k][1]}"></span>`).join('')}</div>
    <div class="st-legend">${ks.map(k => `<i style="background:${names[k][1]}"></i>${names[k][0]} ${Math.round(100 * w[k] / tot)}%`).join('　')}</div>`;
}

function updateNumbers() {
  const o = SIM.o, y = SIM.y, rows = [];
  if (isVirus()) {
    rows.push(['#ff4f7b', 'ウイルス', fmtCount(o.pathogen)]);
    rows.push(['#e58fb4', '感染した細胞', fmtCount(o.infected * SIM.path.N0) + `（${pct(o.infected)}）`]);
    rows.push(['#5ad1ff', '守りを固めた細胞', pct(y.R)]);
    rows.push(['#38cfc4', 'NK細胞の働き', '×' + y.NK.toFixed(1)]);
    rows.push(['#4d7dff', 'キラーT細胞', fmtCount(o.killerT)]);
  } else if (o.free != null) {                               // bladder
    rows.push(['#ff9a2e', '尿の中に浮いている菌', fmtCount(o.free)]);
    rows.push(['#ff9a2e', '細胞についた・中の菌', fmtCount(o.att)]);
    rows.push(['#bcdcff', '好中球（尿のにごり）', fmtCount(o.neutrophil)]);
    rows.push(['#86a9ff', 'ヘルパーT細胞', fmtCount(o.killerT)]);
  } else {
    rows.push(['#ff9a2e', '菌', fmtCount(o.pathogen)]);
    rows.push(['#bcdcff', '好中球', fmtCount(o.neutrophil)]);
    rows.push(['#cfc79a', SIM.path.scene === 'alveolus' ? '肺胞にたまった液と細胞' : 'うみ', pct(o.pus)]);
    rows.push(['#86a9ff', 'ヘルパーT細胞', fmtCount(o.killerT)]);
    rows.push(['#ff9a2e', '血液の中の菌', y.Bb < 0.01 ? 'なし' : y.Bb.toFixed(y.Bb < 10 ? 2 : 0) + '個/mL']);
    if (o.spo2) rows.push(['#9fd9ee', '血液の酸素（SpO2）', o.spo2 + '%']);
  }
  rows.push(['#cdefff', '抗体', o.antibody < 0.01 ? 'ほぼなし' : o.antibody.toFixed(2) + '（目安）']);
  rows.push(['#ffd25a', '体温', o.temp.toFixed(1) + '℃']);
  rows.push(['#b9b9b9', isVirus() ? '粘膜の傷み' : SIM.path.scene === 'alveolus' ? '肺胞がうまった割合' : '組織の傷み', pct(o.damage)]);
  $('nums').innerHTML = rows.map(r => `<tr><td><i style="background:${r[0]}"></i>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  // body window text
  const sym = o.sym.length ? `<div class="sym">${o.sym.map(s => `<span>${s}</span>`).join('')}</div>` : '<div class="ok">症状なし</div>';
  $('bwInfo').innerHTML = `<div><span class="temp">${o.temp.toFixed(1)}℃</span></div>${sym}`;
  $('clock').textContent = fmtTime(SIM.t);
}
const pct = x => (x < 0.001 ? '0' : x < 0.01 ? '<1' : Math.round(x * 100)) + '%';

function updateResult() {
  const H = SIM.hist, done = SIM.endT !== null;
  $('resultTitle').textContent = done ? `結果（${fmtTime(SIM.endT)}で終わり）` : 'ここまでの結果';
  const feverH = H.filter(p => p.o.temp >= 37.5).length * HIST_EVERY * 24;
  let peak = H[0], dmg = 0;
  for (const p of H) { if (p.o.pathogen > peak.o.pathogen) peak = p; dmg = Math.max(dmg, p.o.damage); }
  const infected = SIM.flags.infectedEver;
  let verdict;
  if (!infected && SIM.t > 0.3) verdict = isVirus() ? '感染しなかった（入口で片づいた）' : 'すぐに片づいた';
  else if (!infected) verdict = 'まだわからない';
  else if (SIM.maxTemp < 37.5 && dmg < 0.05) verdict = '感染したが、ほとんど症状なし';
  else if (SIM.o.sym.some(s => /肺へ|敗血症|菌血症/.test(s)) || dmg > 0.3 || SIM.maxTemp >= 39.5) verdict = '重い経過';
  else verdict = SIM.maxTemp >= 38.5 ? 'はっきり症状が出た' : '軽い症状が出た';
  const tallyBar = (T, names) => {
    const tot = Object.values(T).reduce((a, b) => a + b, 0);
    if (tot < 1) return '';
    const ks = Object.keys(names).filter(k => T[k] > 0);
    return `<div class="bar">${ks.map(k => `<span style="width:${100 * T[k] / tot}%;background:${names[k][1]}"></span>`).join('')}</div>
      <ul>${ks.map(k => `<li><span style="color:${names[k][1]}">■</span> ${names[k][0]} ${Math.round(100 * T[k] / tot)}%</li>`).join('')}</ul>`;
  };
  let h = `<div class="big">${verdict}</div>`;
  h += `最高体温 ${SIM.maxTemp.toFixed(1)}℃・熱があった時間 ${feverH < 1 ? 'なし' : Math.round(feverH) + '時間'}<br>`;
  h += `${foeName()}がいちばん多かった: ${fmtCount(peak.o.pathogen)}（${fmtTime(peak.t)}）<br>`;
  h += `${isVirus() ? '粘膜' : '組織'}の傷み（最大） ${pct(dmg)}`;
  h += `<div class="note">${foeName()}が消えた道（モデルの計算）</div>` + tallyBar(SIM.tally, tallyNames());
  if (isVirus() && infected) h += `<div class="note">感染した細胞の終わり方</div>` + tallyBar(SIM.cellTally, TALLY_NAMES.cells);
  $('result').innerHTML = h;
}

// ---------- loop ----------
function frame(dtReal) {
  const days = UI.playing ? SPEEDS[UI.speed][1] * dtReal : 0;
  if (days > 0) {
    simAdvance(days);
    if (SIM.endT !== null && SIM.t > SIM.endT + 2 || SIM.t >= UI.autoStop) { UI.playing = false; syncTime(); updateResult(); }
  }
  updateMicro(dtReal, days / Math.max(dtReal, 1e-6));
  stepZoom(dtReal);
  renderAll();
  drawBody(dtReal);
  UI.acc += dtReal; UI.fcT += dtReal;
  if (SIM.fcDirty || UI.fcT > 1.5) { simForecast(); UI.fcT = 0; }
  if (UI.acc > 0.25) { UI.acc = 0; updateNumbers(); updateResult(); updateMeds(); updateStatus(); }
  drawChart();
}
function loop(ts) {
  const dt = UI.last ? Math.min(0.1, (ts - UI.last) / 1000) : 0.016;
  UI.last = ts;
  try { frame(dt); } catch (e) { errs.push(String(e && e.stack || e)); }
  requestAnimationFrame(loop);
}

function resizeAll() { resizeMicro(); resizeBody(); resizeChart(); }

// ---------- start ----------
initMicro($('micro')); initZoom(); initBody($('body')); initChart($('chart'));
buildPanel();
restart();
window.addEventListener('resize', resizeAll);
if (window.ResizeObserver) new ResizeObserver(resizeAll).observe($('microWrap'));
requestAnimationFrame(loop);

// debug: __ib.run(days) advances the course without drawing; __ib.frame(n) draws n frames of 1/30 s.
window.__ib = {
  SIM, MI, UI, err:errs, restart, set:(o) => { Object.assign(UI, o); restart(); },
  run(days) { simAdvance(days); for (let i = 0; i < 30; i++) updateMicro(1 / 30, 0); renderAll(); updateNumbers(); updateResult(); simForecast(); drawChart(); return fmtTime(SIM.t); },
  frame(n) { for (let i = 0; i < (n || 1); i++) frame(1 / 30); return fmtTime(SIM.t); },
  counts() { const c = {}; for (const a of MI.agents) c[a.type] = (c[a.type] || 0) + 1; c.cells = cellCounts ? cellCounts() : null; return c; },
};
