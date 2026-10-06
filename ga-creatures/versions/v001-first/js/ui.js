// ui.js — パネルを作る buildUI()、操作 bindUI()、表示の更新 updatePanel()、グラフと一覧のツールチップ
'use strict';

const $ = id => document.getElementById(id);
const HOV = { grid: -1, gen: null };
let GRID_GEOM = null, PROG_GEOM = null;

function buildUI() {
  $('envs').innerHTML = ENVS.map(e => `<button class="env" data-env="${e.key}" aria-pressed="false">${e.name}<small>${e.sub}</small></button>`).join('');
}

function bindUI() {
  $('envs').addEventListener('click', e => { const b = e.target.closest('.env'); if (b) setEnv(b.dataset.env); });
  $('btnStep').onclick = () => queueGens(1);
  $('btnStep10').onclick = () => queueGens(10);
  $('btnAuto').onclick = $('btnAutoM').onclick = () => setAuto(!RUN.auto);
  $('btnReplay').onclick = () => restartView();
  $('btnTop').onclick = () => watchTop();
  document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => {
    VIEW.speed = +b.dataset.speed;
    document.querySelectorAll('[data-speed]').forEach(q => q.setAttribute('aria-pressed', q === b));
  });
  $('selPop').onchange = e => { resizePop(+e.target.value); if (POP.members.some(m => m.env !== POP.env.key)) RUN.reeval = true; else afterGeneration(); };
  $('selSel').onchange = e => POP.sel = e.target.value;
  $('rngRate').oninput = e => { POP.rate = +e.target.value; $('rateVal').textContent = POP.rate.toFixed(1); };
  $('chkCross').onchange = e => POP.cross = e.target.checked;
  $('btnReset').onclick = () => restart(+$('inSeed').value || 1);
  $('btnRand').onclick = () => { const s = 1 + Math.floor(Math.random() * 999999); $('inSeed').value = s; restart(s); };
  $('histRange').oninput = e => watchHistory(+e.target.value);

  const grid = $('grid');
  grid.addEventListener('mousemove', e => {
    const i = gridIndex(e); HOV.grid = i;
    const m = POP.members[i];
    if (m && m.dist != null) showTip(e, `<b>${i + 1}位</b> ${m.dist.toFixed(2)} m<br>${spName(speciesKey(m.g))}・1周 ${m.g.period.toFixed(2)}秒<br>${m.kept ? '前の世代から生き残り' : '第' + m.g.gen + '世代に生まれた子'}`);
    else hideTip();
  });
  grid.addEventListener('mouseleave', () => { HOV.grid = -1; hideTip(); });
  grid.addEventListener('click', e => { const i = gridIndex(e); if (POP.members[i]) watchMember(i); });

  for (const id of ['prog', 'spec']) {
    const c = $(id);
    c.addEventListener('mousemove', e => {
      const gen = chartGen(e, c);
      HOV.gen = gen;
      const p = POP.history.find(q => q.gen === gen);
      if (!p) { hideTip(); return; }
      const sp = Object.keys(p.species).sort((a, b) => p.species[b] - p.species[a]).slice(0, 3)
        .map(k => `<span style="color:${spColor(k)}">■</span> ${spName(k)} ${Math.round(100 * p.species[k] / p.n)}%`).join('<br>');
      showTip(e, `第<b>${p.gen}</b>世代（${envByKey(p.env).name}）<br>いちばん <b>${p.best.toFixed(2)}</b> m<br>まんなか <b>${p.med.toFixed(2)}</b> m<br>下から1割 <b>${p.low.toFixed(2)}</b> m<br>${sp}`);
    });
    c.addEventListener('mouseleave', () => { HOV.gen = null; hideTip(); });
    c.addEventListener('click', e => { const gen = chartGen(e, c); if (POP.history.some(q => q.gen === gen)) { $('histRange').value = gen; watchHistory(gen); } });
  }
}

function gridIndex(e) {
  if (!GRID_GEOM) return -1;
  const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const i = Math.floor(y / GRID_GEOM.ch) * GRID_GEOM.cols + Math.floor(x / GRID_GEOM.cw);
  return i < POP.members.length ? i : -1;
}
function chartGen(e, c) {
  if (!PROG_GEOM) return null;
  const r = c.getBoundingClientRect(), x = e.clientX - r.left;
  return Math.round(clamp((x - PROG_GEOM.padL) / PROG_GEOM.iw, 0, 1) * PROG_GEOM.g1);
}
function showTip(e, html) {
  const tip = $('tip'), st = $('stage').getBoundingClientRect();
  tip.innerHTML = html; tip.hidden = false;
  let x = e.clientX - st.left + 14, y = e.clientY - st.top + 14;
  if (x + tip.offsetWidth > st.width - 8) x = e.clientX - st.left - tip.offsetWidth - 14;
  if (y + tip.offsetHeight > st.height - 8) y = e.clientY - st.top - tip.offsetHeight - 14;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { $('tip').hidden = true; }

const fm = v => (v >= 0 ? '' : '−') + Math.abs(v).toFixed(2) + ' m';

function updatePanel() {
  const h = POP.history[POP.history.length - 1];
  $('genNo').textContent = POP.gen;
  $('runState').textContent = RUN.auto ? '自動で進めています' : RUN.queue > 0 ? `あと ${RUN.queue} 世代` : '';
  $('btnAuto').setAttribute('aria-pressed', RUN.auto);
  $('btnAuto').textContent = $('btnAutoM').textContent = RUN.auto ? '止める' : '自動で進める';
  $('btnAutoM').setAttribute('aria-pressed', RUN.auto);
  document.querySelectorAll('.env').forEach(b => b.setAttribute('aria-pressed', b.dataset.env === POP.env.key));
  $('envNote').textContent = POP.env.note;
  $('gridTitle').textContent = `第${POP.gen}世代の全員（${POP.members.length}匹、進んだ順）`;
  if (h) {
    const kept = POP.members.filter(m => m.kept).length, first = POP.history[0];
    const rows = [
      ['いちばん', fm(h.best)], ['まんなか', fm(h.med)], ['下から1割', fm(h.low)],
      ['種の数', Object.keys(h.species).length + ' 種'],
      ['いちばん多い種', spName(Object.keys(h.species).sort((a, b) => h.species[b] - h.species[a])[0])],
      ['前の世代から残った', POP.gen ? kept + ' 匹' : '—'],
      ['第0世代の1位', fm(first.best)],
    ];
    $('statGrid').innerHTML = rows.map(r => `<span>${r[0]}</span><b>${r[1]}</b>`).join('');
  }
  const hr = $('histRange'), maxGen = POP.history.length ? POP.history[POP.history.length - 1].gen : 0;
  hr.max = maxGen;
  if (VIEW.mode !== 'hist') hr.value = maxGen;
  updatePick();
}

function updatePick() {
  const g = VIEW.g;
  if (!g) return;
  $('pickTag').textContent = VIEW.label;
  const par = g.parents.length === 2 ? `2匹（#${g.parents[0]} と #${g.parents[1]}）の子` : g.parents.length ? `#${g.parents[0]} の子` : '第0世代（でたらめに生まれた）';
  const fr = g.nodes.map(n => n.f.toFixed(2)).join(' / ');
  $('pickGrid').innerHTML = [
    ['番号', '#' + g.id + `（第${g.gen}世代に生まれた）`], ['親', par], ['種', spName(speciesKey(g))],
    ['体のリズム', '1周 ' + g.period.toFixed(2) + ' 秒'], ['足の裏の摩擦', fr],
    ['この環境で', VIEW.dist == null ? '…' : fm(VIEW.dist) + ' / 15秒'],
  ].map(r => `<span>${r[0]}</span><b>${r[1]}</b>`).join('');
}
