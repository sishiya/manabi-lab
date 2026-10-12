// main.js — panel UI, time controls, the main loop, "what is happening now" status, result summary, debug hook window.__ib.
'use strict';

const $ = id => document.getElementById(id);
const errs = [];
window.addEventListener('error', e => errs.push(String(e.message || e)));

const SPEEDS = [[L('10分/秒', '10 min/s'), 10 / 1440], [L('1時間/秒', '1 h/s'), 1 / 24], [L('6時間/秒', '6 h/s'), 0.25]];
const UI = { pk:'flu', body:'adult', mem:'none', resist:false, dose:5, inn:1, adp:1, speed:1, playing:true, autoStop:28, last:0, acc:0, fcT:0 };
const log2 = x => Math.log2(x), pow2 = x => 2 ** x;
const isVirus = () => SIM.path.kind === 'virus';
const foeName = () => isVirus() ? L('ウイルス', 'Viruses') : L('菌', 'Bacteria');
const noParen = s => s.replace(/（.*）/, '').replace(/ \(.*\)/, '');   // drop the part in parentheses (both languages)

// names and colours of the ways the pathogen is removed (keys of flux.pathogen)
const TALLY = {
  mucus:[L('粘液で流された・自然にこわれた', 'Washed away by mucus / broke down'), '#c9e3a0'], mac:[L('マクロファージが食べた', 'Eaten by macrophages'), '#4fb3d9'], ab:[L('抗体（IgA）が無力化', 'Neutralized by antibodies (IgA)'), '#cdefff'], cell:[L('細胞に入った', 'Entered cells'), '#e58fb4'],
  comp:[L('補体', 'Complement'), '#7fe6ff'], neut:[L('好中球', 'Neutrophils'), '#bcdcff'], abx:[L('抗生物質', 'Antibiotics'), '#a6e86b'], wash:[L('おしっこで流された', 'Flushed out by peeing'), '#e8d97a'], exfol:[L('はがれた細胞といっしょに出た', 'Left with shed cells'), '#e6cbc6'],
};
function tallyNames() {
  const out = {}, keys = Object.keys(SIM.path.flux(SIM.y, SIM.P).pathogen);
  for (const k of keys) out[k] = k === 'mucus' && SIM.path.scene === 'gut' ? [L('腸の流れ・便で出た・自然にこわれた', 'Carried out by the gut / in stool / broke down'), '#c9e3a0'] : k === 'mac' && !isVirus() ? [L('マクロファージ', 'Macrophages'), '#4fb3d9'] : TALLY[k];
  return out;
}
const TALLY_NAMES = { cells: { self:[L('ウイルスのせいで死んだ', 'Died from the virus'), '#e58fb4'], nk:[L('NK細胞が壊した', 'Destroyed by NK cells'), '#38cfc4'], ctl:[L('キラーT細胞が壊した', 'Destroyed by killer T cells'), '#4d7dff'] } };
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
    b.innerHTML = `<span>${p.icon} ${p.name}</span><small>${p.kind === 'virus' ? L('ウイルス', 'Virus') : L('細菌', 'Bacterium')}${L('・', ' · ')}${p.site}</small>`;
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
    const b = document.createElement('button'); b.innerHTML = name.replace(/\/(秒|s)$/, '<span class="ps">/$1</span>'); b.dataset.i = i;
    b.onclick = () => { UI.speed = i; UI.playing = true; syncTime(); };
    sp.appendChild(b);
  });
  $('play').onclick = () => { UI.playing = !UI.playing; if (UI.playing && SIM.t >= UI.autoStop) restart(); syncTime(); };
  $('reset').onclick = () => restart();
  // antibiotics diagram: touching an item lights up where that drug works
  const svg = $('abxSvg'), lis = [...document.querySelectorAll('.abxList li')];
  const light = n => { svg.setAttribute('class', n ? `hl hl-${n}` : ''); lis.forEach(l => l.classList.toggle('on', l.dataset.t === n)); };
  for (const li of lis) { li.tabIndex = 0; li.onmouseenter = li.onfocus = li.onclick = () => light(li.dataset.t); li.onmouseleave = li.onblur = () => light(null); }
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
    tip.hidden = false; tip.textContent = L(`【${noParen(TEAMS[CELLS[p.key].team][0])}】${CELLS[p.key].name}`, `[${noParen(TEAMS[CELLS[p.key].team][0])}] ${CELLS[p.key].name}`); tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
  });
  MI.cv.addEventListener('pointerleave', () => { $('hoverTip').hidden = true; });
}
function markCustom() { document.querySelectorAll('#bodies button').forEach(b => b.setAttribute('aria-pressed', false)); $('bodyNote').textContent = L('免疫の細胞の数を手で変えた。', 'The number of immune cells was changed by hand.'); }

function sliderLabels() {
  $('innV').textContent = '×' + fmtMul(UI.inn); $('adpV').textContent = '×' + fmtMul(UI.adp);
}
const fmtMul = x => x >= 1 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3);

function syncPanel() {
  const p = PATHOGENS[UI.pk];
  document.querySelectorAll('#pathogens button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === UI.pk));
  document.querySelectorAll('#bodies button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === UI.body && UI.inn === BODIES[UI.body].inn && UI.adp === BODIES[UI.body].adp));
  $('bodyNote').textContent = BODIES[UI.body].note;
  $('route').textContent = L('入り方: ', 'How it gets in: ') + p.route;
  const mw = $('mems'); mw.innerHTML = '';
  for (const [k, name] of Object.entries(p.memOptions)) {
    const b = document.createElement('button'); b.textContent = name; b.setAttribute('aria-pressed', k === UI.mem);
    b.onclick = () => { UI.mem = k; restart(); };
    mw.appendChild(b);
  }
  const memNote = { staph:L('黄色ブドウ球菌のワクチンはまだ実用化されていない。', 'There is no Staphylococcus aureus vaccine in use yet.'), noro:L('ノロウイルスのワクチンはまだない（開発中）。', 'There is no norovirus vaccine yet (in development).'), ecoli:L('膀胱炎のワクチンは、日本ではまだ使われていない。', 'Bladder infection vaccines are not yet used in Japan.') }[UI.pk];
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
      const b = document.createElement('button'); b.innerHTML = `<i style="background:${CELLS[k].color}"></i>${noParen(CELLS[k].name)}`;
      b.onclick = () => showCard(k); row.appendChild(b);
    }
  }
  buildMeds(); buildMem();
  chartLegend($('chartLegend'));
  syncTime();
}

function syncTime() {
  document.querySelectorAll('#speeds button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === UI.speed && UI.playing));
  $('play').textContent = UI.playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', UI.playing ? L('一時停止', 'Pause') : L('再生', 'Play'));
}

function showCard(key) {
  const c = CELLS[key], el = $('pickCard');
  el.hidden = false;
  el.innerHTML = `<button aria-label="${L('閉じる', 'Close')}">×</button><span class="team" style="border-color:${TEAMS[c.team][1]};color:${TEAMS[c.team][1]}">${TEAMS[c.team][0]}</span><b style="color:${c.color}">${c.name}</b>${c.size ? `<span class="sz">${c.size}</span>` : ''}<div>${c.text}</div>`;
  el.querySelector('button').onclick = hideCard;
}
function hideCard() { $('pickCard').hidden = true; }

// ---------- medicines (stage B) ----------
const MED_NOTES = {
  flu:L('抗ウイルス薬は「症状が出てから48時間以内」が目安。早いほど効く。予測の点線を見ながら、いつ飲むとどう変わるか試してみよう。解熱剤は熱を下げるが、ウイルスの数は変えない。', 'Antiviral drugs should be started “within 48 hours of symptoms”; the sooner, the better. Watch the dotted forecast and try different starting times. A fever reducer lowers the fever but does not change the number of viruses.'),
  covid:L('飲み薬は、高齢者など重くなりやすい人に、症状が出てから5日以内に使う。予測の点線で、始める日による違いを見てみよう。', 'The pills are used for people at risk of getting very sick, such as older adults, within 5 days of symptoms. Use the dotted forecast to see how the starting day makes a difference.'),
  noro:L('ノロウイルスに効く薬はない。からだがウイルスを追い出すまで、水分と塩分をとって脱水を防ぐ。アルコール消毒は効きにくく、手洗いと、塩素系の消毒（次亜塩素酸ナトリウム）がうつさない決め手。', 'There is no medicine for norovirus. Until the body gets rid of the virus, drink water and salts to prevent dehydration. Alcohol sanitizer works poorly; handwashing and chlorine-based disinfectant (sodium hypochlorite) are the keys to not spreading it.'),
  staph:L('うみがたまった膿瘍には抗生物質が届きにくい。大きな膿瘍では切ってうみを出すのが大事。MRSA にはセファレキシンが効かない。', 'Antibiotics have trouble reaching into an abscess full of pus. For a large abscess, cutting it open to drain the pus is important. Cephalexin does not work on MRSA.'),
  pneumo:L('肺炎球菌の肺炎は、抗生物質でよくなる。高齢者や免疫が弱い人では早めの治療が大事。ワクチン（予防接種）で重い肺炎や、菌が血液に入るのをかなり防げる。', 'Pneumococcal pneumonia gets better with antibiotics. Early treatment is important for older adults and people with weak immunity. The vaccine greatly helps prevent severe pneumonia and bacteria entering the blood.'),
  ecoli:L('水をたくさん飲んでおしっこの回数を増やすと、浮いている菌が流し出される。痛みや熱があれば抗生物質。細胞の中にかくれた菌が残ると、またぶり返すことがある。', 'Drinking lots of water and peeing more often flushes out floating bacteria. With pain or fever, antibiotics are used. If bacteria hiding inside cells remain, the infection can come back.'),
};
function buildMeds() {
  const box = $('meds'); box.innerHTML = '';
  const p = SIM.path;
  $('strainRow').hidden = !p.resistName;
  const sw = $('strains'); sw.innerHTML = '';
  if (p.resistName) for (const [k, name] of [[false, L('ふつうの菌', 'Ordinary staph')], [true, p.resistName]]) {
    const b = document.createElement('button'); b.textContent = name; b.setAttribute('aria-pressed', UI.resist === k);
    b.onclick = () => { UI.resist = k; restart(); };
    sw.appendChild(b);
  }
  for (const k of p.drugs) {
    const d = document.createElement('div'); d.className = 'med'; d.dataset.k = k;
    const name = k === 'drain' ? L('切ってうみを出す（切開排膿）', 'Cut open and drain the pus (incision and drainage)') : DRUGS[k].name;
    const how = k === 'drain' ? L('病院で行う処置。うみがたまってから。', 'Done at a hospital, once pus has collected.') : DRUGS[k].how;
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
      const n = (SIM.P.drugs.apy || []).length, lv = apyLevel(SIM.P, SIM.t);
      b.textContent = L('1回飲む', 'Take one'); st.textContent = n ? L(`${n}回飲んだ・${lv > 0.2 ? 'いま効いている' : '切れている'}`, `Taken ${n}× · ${lv > 0.2 ? 'working now' : 'worn off'}`) : '';
    } else if (k === 'drain') {
      b.textContent = L('処置する', 'Do it'); b.disabled = !(SIM.o.pus > 0.15);
      st.textContent = SIM.drains.length ? L(`${SIM.drains.length}回 処置した`, `Done ${SIM.drains.length}×`) : (SIM.o.pus > 0.15 ? L('うみがたまっている', 'Pus has collected') : L('うみがたまっていない', 'No pus collected'));
    } else {
      const c = SIM.P.drugs[k], on = drugActive(k), lv = drugLevel(SIM.P, k, SIM.t);
      b.textContent = on ? L('やめる', 'Stop') : c ? L('もう一度始める', 'Start again') : L('始める', 'Start');
      d.classList.toggle('on', lv > 0.05);
      st.textContent = c ? L(`${fmtTime(c.on)}から${on ? `・あと${Math.max(0, Math.round((c.off - SIM.t) * 24))}時間` : '・終わった'}${lv > 0.05 ? `・効き目 ${Math.round(lv * 100)}%` : ''}`, `From ${fmtTime(c.on)}${on ? ` · ${Math.max(0, Math.round((c.off - SIM.t) * 24))} h left` : ' · finished'}${lv > 0.05 ? ` · strength ${Math.round(lv * 100)}%` : ''}`) : '';
    }
  }
}
function showDrug(k) {
  const el = $('pickCard'), D = k === 'drain' ? { name:L('切開排膿', 'Incision and drainage'), how:L('処置', 'Procedure'), text:L('皮膚を小さく切り、膿瘍にたまったうみを出す。うみといっしょに中の菌も出ていき、抗生物質や免疫細胞が届くようになる。', 'A small cut is made in the skin to let out the pus collected in the abscess. The bacteria inside leave with the pus, and antibiotics and immune cells can reach the area.') } : DRUGS[k];
  el.hidden = false;
  el.innerHTML = `<button aria-label="${L('閉じる', 'Close')}">×</button><span class="team" style="border-color:${TEAMS.drug[1]};color:${TEAMS.drug[1]}">${L('くすり・治療', 'Medicine and treatment')}</span><b style="color:${TEAMS.drug[1]}">${D.name}</b><span class="sz">${D.how}</span><div>${D.text}</div>`;
  el.querySelector('button').onclick = hideCard;
}

// ---------- course ----------
const baseP = () => ({ dose:10 ** UI.dose, inn:UI.inn, adp:UI.adp, fev:BODIES[UI.body].fev, mem:UI.mem, resist:UI.resist });
// start: kind = undefined (a normal course), 'vaccine' (vaccine practice), or {gap, drift} (second infection)
function restart(kind) {
  const p = PATHOGENS[UI.pk];
  UI.dose = clamp(UI.dose, p.doseRange[0], p.doseRange[1]);
  const keepMicro = kind && kind.gap != null;                  // the second infection continues in the same body
  if (!keepMicro) setScene(UI.pk); else { MI.agents = []; MI.callouts = []; buildScene(false); }
  CH.hide.clear();
  $('log').innerHTML = ''; UI.lastEvent = null;
  if (kind === 'vaccine') simVaccinate(UI.pk, baseP());
  else if (keepMicro) simSecond(kind.gap, kind.drift, { ...baseP(), mem:'none' });
  else simReset(UI.pk, baseP());
  simForecast();
  UI.playing = true; UI.fcT = 0;
  UI.autoStop = kind === 'vaccine' ? 70 : 28;
  syncPanel(); updateNumbers(); updateResult(); updateStatus(); buildZoomUI();
}

// ---------- second infection / vaccine buttons (stage D) ----------
function buildMem() {
  const box = $('memBtns'); box.innerHTML = '';
  const add = (label, fn, title) => { const b = document.createElement('button'); b.textContent = label; if (title) b.title = title; b.onclick = fn; box.appendChild(b); return b; };
  const V = VACCINES[UI.pk], virus = SIM.path.kind === 'virus';
  UI.memBtns = {
    m1: add(L('1か月後に、同じものがまた入ってくる', 'The same germ gets in again a month later'), () => restart({ gap:30 })),
    y1: add(L('1年後に、同じものがまた入ってくる', 'The same germ gets in again a year later'), () => restart({ gap:365 })),
    drift: virus && UI.pk !== 'noro' ? add(L('1年後に、少し型の変わったものが入ってくる', 'A slightly changed strain gets in a year later'), () => restart({ gap:365, drift:true })) : null,
    vac: V ? add(L(`ワクチンのしくみを見る（${V.name}）`, `See how a vaccine works (${V.name})`), () => restart('vaccine')) : null,
    chal: add('', () => { simChallenge(10 ** PATHOGENS[UI.pk].doseDefault); UI.playing = true; UI.autoStop = Math.max(UI.autoStop, SIM.t + 21); syncTime(); updateMem(); }),
  };
  updateMem();
}
function updateMem() {
  if (!UI.memBtns) return;
  const b = UI.memBtns, done = SIM.endT !== null && SIM.flags.infectedEver && SIM.mode !== 'vaccine';
  for (const k of ['m1', 'y1', 'drift']) if (b[k]) b[k].disabled = !done;
  const vacWait = SIM.mode === 'vaccine' && !SIM.challenged;
  b.chal.hidden = !vacWait;
  b.chal.textContent = L(`ここで${foeName()}が入ってくる（${fmtCount(10 ** PATHOGENS[UI.pk].doseDefault)}）`, `${foeName()} get in now (${fmtCount(10 ** PATHOGENS[UI.pk].doseDefault)})`);
  const V = VACCINES[UI.pk];
  $('memNote').textContent = vacWait ? L(`${V.kind}。${V.doses.length > 1 ? `${V.doses[1]}日目に2回目。` : ''}グラフの抗体の線が上がるのを見てから、「入ってくる」を押そう。`, `${V.kind}. ${V.doses.length > 1 ? `Second shot on day ${V.doses[1]}. ` : ''}Wait until the antibody line on the chart rises, then press “get in”.`)
    : SIM.mode === 'second' ? L('うすい線が1回目。2回目は記憶細胞のおかげで早く片づく。', 'The faint line is the first time. The second time is cleared faster thanks to memory cells.')
    : !done ? L('まず1回目を最後まで進めると、2回目を試せる。', 'Run the first infection to the end, then you can try a second one.')
    : (V ? '' : { noro:L('ノロウイルスのワクチンはまだない（開発中）。', 'There is no norovirus vaccine yet (in development).'), staph:L('黄色ブドウ球菌のワクチンはまだない。抗体ができても、何度もかかることがある。', 'There is no Staphylococcus aureus vaccine yet. Even with antibodies, people can get it again and again.'), ecoli:L('膀胱炎のワクチンは、日本ではまだ使われていない。', 'Bladder infection vaccines are not yet used in Japan.') }[UI.pk] || '');
}

SIM.onEvent = e => {
  const li = document.createElement('li');
  li.innerHTML = `<span class="tm">${fmtTime(e.t)}</span><span class="k k-${e.tag}">${{ sure:L('確か', 'Known'), est:L('推定', 'Estimate'), art:L('演出', 'Display') }[e.tag]}</span><b>${e.title}</b><br>${e.text}`;
  $('log').prepend(li);
  UI.lastEvent = e;
};

// ---------- "what is happening now" (top of the micro view) ----------
const VERDICT_COL = { bad:'#ff6b7f', warn:'#ffb04a', good:'#7fd3a0', calm:'#a9b4bd' };
function updateStatus() {
  const s = simStatus(), o = SIM.o, isFlu = isVirus(), foe = foeName();
  const arrow = s.rate > 0.25 ? '↗' : s.rate < -0.25 ? '↘' : '→';
  const fold = s.rate > 0.25 ? L(`1日で約${fmtFold(10 ** s.rate)}倍のペース`, `about ×${fmtFold(10 ** s.rate)} per day`) : s.rate < -0.25 ? L(`1日で約${fmtFold(10 ** -s.rate)}分の1のペース`, `about 1/${fmtFold(10 ** -s.rate)} per day`) : L('ほぼ横ばい', 'about level');
  const tcol = s.rate > 0.25 ? '#ff6b7f' : s.rate < -0.25 ? '#7fd3a0' : '#ffb04a';
  // compact, on top of the picture
  let h = `<div class="st-top"><span class="st-v" style="background:${VERDICT_COL[s.tone]}">${s.verdict}</span><span>${s.phase}</span></div>`;
  h += `<div class="st-line">${foe} <b>${fmtCount(o.pathogen)}</b> ${o.pathogen >= 1 ? `<span style="color:${tcol}">${arrow} ${fold}</span>` : ''}${L('　体温', ' · Temp')} <b>${o.temp.toFixed(1)}℃</b></div>`;
  if (o.pathogen >= 1) h += `<div class="st-line dim">${L(`いま1日に 生まれる ${fmtCount(s.born)} ／ 消える ${fmtCount(s.gone)}`, `Per day now: born ${fmtCount(s.born)} / gone ${fmtCount(s.gone)}`)}</div>`;
  $('status').innerHTML = h;
  // details, in the panel
  let d = '';
  if (o.pathogen >= 1) d += shareBar(L(`${foe}を${isFlu ? '減らしているもの' : 'やっつけているもの'}`, `What is ${isFlu ? 'reducing' : 'killing'} the ${foe.toLowerCase()}`), s.removal, tallyNames());
  if (isFlu && s.cellKill) d += shareBar(L('感染した細胞を終わらせているもの', 'What is ending infected cells'), s.cellKill, TALLY_NAMES.cells);
  if (isFlu) {
    const y = SIM.y, parts = [[L('健康', 'Healthy'), y.U, PAL.cell], [L('守りを固めた', 'On guard'), y.R, PAL.shield], [L('乗っ取られた', 'Hijacked'), y.E + y.I, PAL.takenOver], [L('死んだ・修理中', 'Dead / repairing'), y.D, '#6f6468']];
    d += `<div class="st-lab">${L('粘膜の細胞（本当の割合）', 'Lining cells (real shares)')}</div><div class="st-bar">${parts.map(([, v, c]) => `<span style="width:${100 * v}%;background:${c}"></span>`).join('')}</div>`;
    d += `<div class="st-legend">${parts.filter(p => p[1] > 0.005).map(([n, v, c]) => `<i style="background:${c}"></i>${n} ${pct(v)}`).join(L('　', ' · '))}</div>`;
  } else if (o.free != null) d += `<div class="st-legend">${L(`尿に浮いている菌 ${fmtCount(o.free)}　細胞についた・中の菌 ${fmtCount(o.att)}　好中球 ${fmtCount(o.neutrophil)}`, `Bacteria floating in urine ${fmtCount(o.free)} · on or in cells ${fmtCount(o.att)} · neutrophils ${fmtCount(o.neutrophil)}`)}</div>`;
  else if (o.spo2) d += `<div class="st-legend">${L(`肺胞がうまった割合 ${pct(o.damage)}　血液の酸素 ${o.spo2}%　好中球 ${fmtCount(o.neutrophil)}`, `Alveoli filled ${pct(o.damage)} · blood oxygen ${o.spo2}% · neutrophils ${fmtCount(o.neutrophil)}`)}</div>`;
  else d += `<div class="st-legend">${L(`組織の傷み ${pct(o.damage)}　うみ ${pct(o.pus)}　好中球 ${fmtCount(o.neutrophil)}`, `Tissue damage ${pct(o.damage)} · pus ${pct(o.pus)} · neutrophils ${fmtCount(o.neutrophil)}`)}</div>`;
  if (UI.lastEvent) d += `<div class="st-ev">${L(`最新のできごと: ${UI.lastEvent.title}（${fmtTime(UI.lastEvent.t)}）`, `Latest event: ${UI.lastEvent.title} (${fmtTime(UI.lastEvent.t)})`)}</div>`;
  $('now').innerHTML = d || `<div class="st-legend">${L('まだ何も起きていない', 'Nothing has happened yet')}</div>`;
}
const fmtFold = x => x >= 100 ? Math.round(x).toLocaleString() : x >= 10 ? Math.round(x) : x.toFixed(1);
function shareBar(title, w, names) {
  const tot = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0);
  if (tot <= 0) return '';
  const ks = Object.keys(names).filter(k => w[k] > tot * 0.005);
  return `<div class="st-lab">${title}</div><div class="st-bar">${ks.map(k => `<span style="width:${100 * w[k] / tot}%;background:${names[k][1]}"></span>`).join('')}</div>
    <div class="st-legend">${ks.map(k => `<i style="background:${names[k][1]}"></i>${names[k][0]} ${Math.round(100 * w[k] / tot)}%`).join(L('　', ' · '))}</div>`;
}

function updateNumbers() {
  const o = SIM.o, y = SIM.y, rows = [];
  if (isVirus()) {
    rows.push(['#ff4f7b', L('ウイルス', 'Viruses'), fmtCount(o.pathogen)]);
    rows.push(['#e58fb4', L('感染した細胞', 'Infected cells'), fmtCount(o.infected * SIM.path.N0) + L(`（${pct(o.infected)}）`, ` (${pct(o.infected)})`)]);
    rows.push(['#5ad1ff', L('守りを固めた細胞', 'Cells on guard'), pct(y.R)]);
    rows.push(['#38cfc4', L('NK細胞の働き', 'NK cell activity'), '×' + y.NK.toFixed(1)]);
    rows.push(['#4d7dff', L('キラーT細胞', 'Killer T cells'), fmtCount(o.killerT)]);
  } else if (o.free != null) {                               // bladder
    rows.push(['#ff9a2e', L('尿の中に浮いている菌', 'Bacteria floating in urine'), fmtCount(o.free)]);
    rows.push(['#ff9a2e', L('細胞についた・中の菌', 'Bacteria on or in cells'), fmtCount(o.att)]);
    rows.push(['#bcdcff', L('好中球（尿のにごり）', 'Neutrophils (cloudy urine)'), fmtCount(o.neutrophil)]);
    rows.push(['#86a9ff', L('ヘルパーT細胞', 'Helper T cells'), fmtCount(o.killerT)]);
  } else {
    rows.push(['#ff9a2e', L('菌', 'Bacteria'), fmtCount(o.pathogen)]);
    rows.push(['#bcdcff', L('好中球', 'Neutrophils'), fmtCount(o.neutrophil)]);
    rows.push(['#cfc79a', SIM.path.scene === 'alveolus' ? L('肺胞にたまった液と細胞', 'Fluid and cells in the alveoli') : L('うみ', 'Pus'), pct(o.pus)]);
    rows.push(['#86a9ff', L('ヘルパーT細胞', 'Helper T cells'), fmtCount(o.killerT)]);
    rows.push(['#ff9a2e', L('血液の中の菌', 'Bacteria in the blood'), y.Bb < 0.01 ? L('なし', 'none') : y.Bb.toFixed(y.Bb < 10 ? 2 : 0) + L('個/mL', ' /mL')]);
    if (o.spo2) rows.push(['#9fd9ee', L('血液の酸素（SpO2）', 'Blood oxygen (SpO2)'), o.spo2 + '%']);
  }
  rows.push(['#cdefff', L('抗体', 'Antibodies'), o.antibody < 0.01 ? L('ほぼなし', 'almost none') : o.antibody.toFixed(2) + L('（目安）', ' (rough)')]);
  rows.push(['#ffd25a', L('体温', 'Body temperature'), o.temp.toFixed(1) + '℃']);
  rows.push(['#b9b9b9', isVirus() ? L('粘膜の傷み', 'Lining damage') : SIM.path.scene === 'alveolus' ? L('肺胞がうまった割合', 'Alveoli filled') : L('組織の傷み', 'Tissue damage'), pct(o.damage)]);
  $('nums').innerHTML = rows.map(r => `<tr><td><i style="background:${r[0]}"></i>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  // body window text
  const sym = o.sym.length ? `<div class="sym">${o.sym.map(s => `<span>${s}</span>`).join('')}</div>` : `<div class="ok">${L('症状なし', 'No symptoms')}</div>`;
  $('bwInfo').innerHTML = `<div><span class="temp">${o.temp.toFixed(1)}℃</span></div>${sym}`;
  $('clock').textContent = fmtTime(SIM.t);
}
const pct = x => (x < 0.001 ? '0' : x < 0.01 ? '<1' : Math.round(x * 100)) + '%';

function updateResult() {
  const H = SIM.hist, done = SIM.endT !== null;
  $('resultTitle').textContent = done ? L(`結果（${fmtTime(SIM.endT)}で終わり）`, `Result (ended at ${fmtTime(SIM.endT)})`) : L('ここまでの結果', 'Result so far');
  const feverH = H.filter(p => p.o.temp >= 37.5).length * HIST_EVERY * 24;
  let peak = H[0], dmg = 0;
  for (const p of H) { if (p.o.pathogen > peak.o.pathogen) peak = p; dmg = Math.max(dmg, p.o.damage); }
  const infected = SIM.flags.infectedEver;
  let verdict;
  if (!infected && SIM.t > 0.3) verdict = isVirus() ? L('感染しなかった（入口で片づいた）', 'No infection (cleared at the doorway)') : L('すぐに片づいた', 'Cleared right away');
  else if (!infected) verdict = L('まだわからない', 'Not known yet');
  else if (SIM.maxTemp < 37.5 && dmg < 0.05) verdict = L('感染したが、ほとんど症状なし', 'Infected, but almost no symptoms');
  else if (SIM.o.sym.some(s => /肺へ|敗血症|菌血症|to the lungs|sepsis|bacteremia/.test(s)) || dmg > 0.3 || SIM.maxTemp >= 39.5) verdict = L('重い経過', 'A serious course');
  else verdict = SIM.maxTemp >= 38.5 ? L('はっきり症状が出た', 'Clear symptoms') : L('軽い症状が出た', 'Mild symptoms');
  const tallyBar = (T, names) => {
    const tot = Object.values(T).reduce((a, b) => a + b, 0);
    if (tot < 1) return '';
    const ks = Object.keys(names).filter(k => T[k] > 0);
    return `<div class="bar">${ks.map(k => `<span style="width:${100 * T[k] / tot}%;background:${names[k][1]}"></span>`).join('')}</div>
      <ul>${ks.map(k => `<li><span style="color:${names[k][1]}">■</span> ${names[k][0]} ${Math.round(100 * T[k] / tot)}%</li>`).join('')}</ul>`;
  };
  let h = `<div class="big">${verdict}</div>`;
  if (SIM.ghost && SIM.ghost.length) {                       // compare with the 1st infection / no vaccine
    const gMax = SIM.ghost.reduce((m, p) => Math.max(m, p.o.temp), 36.7), gPeak = SIM.ghost.reduce((m, p) => Math.max(m, p.o.pathogen), 0);
    const curPeak = H.reduce((m, p) => Math.max(m, p.o.pathogen), 0);
    h += L(`<div class="cmp">${SIM.ghostName}: 最高 ${gMax.toFixed(1)}℃・${foeName()}最大 ${fmtCount(gPeak)}<br>こんど: 最高 ${SIM.maxTemp.toFixed(1)}℃・${foeName()}最大 ${fmtCount(curPeak)}</div>`,
      `<div class="cmp">${SIM.ghostName}: max ${gMax.toFixed(1)}℃ · ${foeName().toLowerCase()} max ${fmtCount(gPeak)}<br>This time: max ${SIM.maxTemp.toFixed(1)}℃ · ${foeName().toLowerCase()} max ${fmtCount(curPeak)}</div>`);
  }
  h += L(`最高体温 ${SIM.maxTemp.toFixed(1)}℃・熱があった時間 ${feverH < 1 ? 'なし' : Math.round(feverH) + '時間'}<br>`, `Highest temperature ${SIM.maxTemp.toFixed(1)}℃ · hours with fever ${feverH < 1 ? 'none' : Math.round(feverH) + ' h'}<br>`);
  h += L(`${foeName()}がいちばん多かった: ${fmtCount(peak.o.pathogen)}（${fmtTime(peak.t)}）<br>`, `Most ${foeName().toLowerCase()}: ${fmtCount(peak.o.pathogen)} (${fmtTime(peak.t)})<br>`);
  h += L(`${isVirus() ? '粘膜' : '組織'}の傷み（最大） ${pct(dmg)}`, `${isVirus() ? 'Lining' : 'Tissue'} damage (max) ${pct(dmg)}`);
  h += `<div class="note">${L(`${foeName()}が消えた道（モデルの計算）`, `How the ${foeName().toLowerCase()} were removed (model calculation)`)}</div>` + tallyBar(SIM.tally, tallyNames());
  if (isVirus() && infected) h += `<div class="note">${L('感染した細胞の終わり方', 'How infected cells ended')}</div>` + tallyBar(SIM.cellTally, TALLY_NAMES.cells);
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
  if (UI.acc > 0.25) { UI.acc = 0; updateNumbers(); updateResult(); updateMeds(); updateStatus(); updateMem(); }
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
// language (I18N.md): texts that live in attributes, and the JP / EN switch
{
  document.title = L('免疫のたたかい', 'The Immune Battle');
  const at = (id, a, ja, en) => $(id).setAttribute(a, L(ja, en));
  at('micro', 'aria-label', '感染した場所の断面をミクロの大きさで見る画面。細胞や病原体をタップすると説明が出る', 'Micro-scale cross-section of the infected area. Tap a cell or germ for an explanation');
  at('zoomCtl', 'aria-label', 'ズーム（ホイール・ピンチでも）', 'Zoom (wheel or pinch also works)');
  at('zoomOut', 'aria-label', '引いて見る', 'Zoom out'); at('zoomIn', 'aria-label', '近づいて見る', 'Zoom in');
  at('bodyWin', 'aria-label', 'からだ全体の様子', 'Whole-body view'); at('bwToggle', 'aria-label', '小窓をたたむ', 'Fold the window');
  at('speeds', 'aria-label', '時間の速さ', 'Speed of time'); at('reset', 'aria-label', '最初から', 'Restart');
  at('chart', 'aria-label', '日ごとの経過のグラフ。実線はここまで、点線は予測', 'Day-by-day chart. Solid line so far, dotted line forecast');
  at('bodies', 'aria-label', 'からだの例', 'Body examples'); at('mems', 'aria-label', '前の記憶', 'Past memory'); at('strains', 'aria-label', '菌の種類', 'Strain');
  at('abxSvg', 'aria-label', '菌の断面と、抗生物質がねらう場所', 'Cross-section of bacteria and where antibiotics aim');
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.l === LANG); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
}
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
