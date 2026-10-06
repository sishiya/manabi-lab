// ui.js — パネル（選ぶもの・行き先・数字のカード・説明）と、ものさしの操作
'use strict';

const $ = id => document.getElementById(id);
const LVL_TXT = ['問題なし', '注意', '危険', '限界をこえた'];
const TAG_TXT = { rec: '記録', calc: '計算', est: '推定' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function buildUI() {
  // 何を置く？（見本の絵つき）
  const box = $('things');
  for (const th of THINGS) {
    const b = document.createElement('button');
    b.className = 'thing'; b.dataset.k = th.key; b.title = th.desc;
    b.setAttribute('aria-pressed', 'false');
    const cv = document.createElement('canvas'); cv.width = 112; cv.height = 84; cv.setAttribute('aria-hidden', 'true');
    b.append(cv, document.createTextNode(th.name.replace('（', '\n（')));
    b.style.whiteSpace = 'pre-line';
    b.onclick = () => setThing(th.key);
    box.append(b);
  }
  // 行き先
  const groups = [['宇宙・空', m => m.z > 0], ['地上', m => m.z === 0], ['海', m => m.z < 0]];
  for (const [title, f] of groups) {
    const h = document.createElement('h3'); h.textContent = title;
    const g = document.createElement('div'); g.className = 'pgrid';
    for (const m of MARKS.filter(f)) {
      const b = document.createElement('button'); b.className = 'place'; b.dataset.z = m.z;
      b.innerHTML = `${esc(m.name)}<small>${esc(placeBig(m.z))}</small>`;
      b.onclick = () => goTo(m.z);
      g.append(b);
    }
    $('places').append(h, g);
  }
  $('btnHome').onclick = () => goTo(0);
  $('optArrows').onchange = e => { S.arrows = e.target.checked; };
  $('btnNew').onclick = () => renewThing();
  $('zRange').oninput = e => goTo(zOfU(+e.target.value / 1000), true);
  bindCanvas();
}

function drawIcons() {
  for (const b of document.querySelectorAll('.thing')) drawIcon(b.querySelector('canvas'), THINGS.find(t => t.key === b.dataset.k));
}

// ものさしの上: 目印の名前を押すとそこへ、帯をクリック・ドラッグで好きな所へ
function bindCanvas() {
  const cv = CV.el;
  let drag = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = pos(e);
    if (x > CV.SW) return;
    const hit = CV.hits.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (hit) { goTo(hit.z); return; }
    drag = true; cv.setPointerCapture(e.pointerId);
    goTo(zOfU(uOfBarY(y)), true);
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (drag) { goTo(zOfU(uOfBarY(y)), true); return; }
    const hit = x <= CV.SW && CV.hits.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    cv.title = hit ? hit.name + '（押すとここへ運ぶ）' : x <= CV.SW ? 'クリック・ドラッグで高さ・深さを変える' : '';
  });
  const up = () => { drag = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}

// ---- 数字の書き方 ----
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function fPa(P) {
  if (P >= 1e6) return f1(P / 1e6) + ' MPa';
  if (P >= 1000) return f1(P / 1000) + ' kPa';
  if (P >= 1) return (P >= 10 ? f0(P) : f1(P)) + ' Pa';
  const e = Math.floor(Math.log10(P)), m = P / 10 ** e;
  return f1(m) + '×10' + String(e).split('').map(c => SUP[c]).join('') + ' Pa';
}
const JP_POW = { 2: '100', 3: '1,000', 4: '1万', 5: '10万', 6: '100万', 7: '1,000万', 8: '1億', 9: '10億', 10: '100億' };
function fLight(env) {
  if (env.medium !== 'water') return env.medium === 'space' ? '日光がそのまま（空気で弱まらない）' : '日光';
  const l = env.light;
  if (l >= 0.01) return '地上の ' + (l >= 0.1 ? f0(l * 100) : f1(l * 100)) + ' %';
  const k = Math.round(-Math.log10(l));
  if (k <= 10) return 'ほんのわずか（地上の' + JP_POW[k] + '分の1）';
  return '日光は届かない（生き物の光だけ）';
}
function fBoil(b) {
  if (b.kind === 'nolq') return '液体の水でいられない';
  if (b.kind === 'super') return '沸かない（臨界圧をこえる）';
  return f0(b.T) + ' ℃';
}

// ---- パネルの表示（変わったときだけ書きかえる） ----
const LAST = {};
function setHTML(id, html) { if (LAST[id] !== html) { LAST[id] = html; $(id).innerHTML = html; } }
function setText(id, s) { if (LAST[id] !== s) { LAST[id] = s; $(id).textContent = s; } }

function updatePanel(S, env, st) {
  const th = THINGS.find(t => t.key === S.key);
  setHTML('roName', `${esc(th.name)} <span class="mono" style="font-weight:400">${esc(th.size)}</span>`);
  setHTML('roTag', `<span style="color:var(--l${st.lvl})">● ${LVL_TXT[st.lvl]}</span>`);
  setHTML('roVerdict', `<span style="color:var(--l${st.lvl})">${esc(st.verdict)}</span>`);
  setText('roVal', st.big.val); setText('roUnit', st.big.unit); setText('roLabel', st.big.label);
  setHTML('roGrid', st.rows.map(([a, b]) => `<span>${esc(a)}</span><b>${esc(b)}</b>`).join(''));
  const m = S.mem;
  setText('roTrip', m.zMax != null ? 'これまで: ' + (m.zMax > 0 ? fPlace(m.zMax) : '地上') + ' 〜 ' + (m.zMin < 0 ? fPlace(m.zMin) : '地上') : '');
  setHTML('notes', st.notes.map(([k, t]) => `<li><span class="tag ${k}">${TAG_TXT[k]}</span>${esc(t)}</li>`).join(''));

  setText('plZ', placeBig(S.z));
  const rows = [
    ['気圧', fAtm(env.atm) + '（' + fPa(env.P) + '）'],
    [env.medium === 'water' ? '水温' : '気温', env.T == null ? 'なし（空気がほとんどない）' : f0(env.T) + ' ℃'],
  ];
  if (env.medium !== 'water') rows.push(['吸える酸素', env.pO2 < 0.05 ? 'ほぼなし' : '地上の ' + f0(env.pO2 / SEA_PO2 * 100) + ' %']);
  rows.push(['水が沸く温度', fBoil(env.boil)], ['明るさ', fLight(env)], ['区分', env.zone]);
  // 押す力: 1cm² あたりと、大人の体の表面全体（約1.8m²）
  const kgcm2 = env.P / 98066.5, tons = env.P * BODY_AREA / 9806.65 / 1000;
  rows.push(['1cm² を押す力', kgcm2 < 0.01 ? 'ほぼ0' : '約 ' + (kgcm2 >= 10 ? f0(kgcm2) : kgcm2 >= 1 ? f1(kgcm2) : f2(kgcm2)) + ' kg']);
  rows.push(['体の表面全体（1.8m²）を押す力', tons < 0.01 ? 'ほぼ0' : '約 ' + (tons >= 10 ? f0(tons) : f1(tons)) + ' トン']);
  setHTML('plGrid', rows.map(([a, b]) => `<span>${esc(a)}</span><b>${esc(b)}</b>`).join(''));

  // ボタンの押された状態
  const ks = S.key + '|' + Math.round(S.zTarget);
  if (LAST.press !== ks) {
    LAST.press = ks;
    for (const b of document.querySelectorAll('.thing')) b.setAttribute('aria-pressed', b.dataset.k === S.key);
    for (const b of document.querySelectorAll('.place')) b.setAttribute('aria-pressed', +b.dataset.z === Math.round(S.zTarget));
  }
  const r = $('zRange'), uv = Math.round(uOfZ(S.z) * 1000);
  if (document.activeElement !== r && +r.value !== uv) r.value = uv;
  r.setAttribute('aria-valuetext', placeBig(S.z));
}
