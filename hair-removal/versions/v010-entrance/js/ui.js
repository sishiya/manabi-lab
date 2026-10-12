// 脱毛のしくみ — 道具・設定・一覧・吹き出し・お知らせ
'use strict';

const $ = id => document.getElementById(id);

function buildControls(S, on) {
  const site = $('site');
  for (const k of ['shin', 'thighF', 'thighM', 'armF', 'armM', 'lip']) { const o = document.createElement('option'); o.value = k; o.textContent = SITES[k].name; site.appendChild(o); }
  site.onchange = () => on.site(site.value);
  for (let a = 20; a <= 80; a += 10) { const o = document.createElement('option'); o.value = a; o.textContent = a + '歳'; $('age').appendChild(o); }
  $('age').onchange = () => on.age(+$('age').value);
  for (const [k, v] of Object.entries(GRAY_TYPES)) { const o = document.createElement('option'); o.value = k; o.textContent = `${v.name}（平均 ${v.mean}歳）`; $('gray').appendChild(o); }
  $('gray').onchange = () => on.age(null, $('gray').value);
  const box = $('tools');
  for (const T of TOOLS) {
    const b = document.createElement('button'); b.className = 'tool'; b.id = 'tool-' + T.id; b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="ic" aria-hidden="true">${T.icon}</span>${T.name}`;
    if (TOOL_COLOR[T.id]) b.style.setProperty('--c', TOOL_COLOR[T.id]);
    b.onclick = () => on.tool(T.id);
    box.appendChild(b);
  }
  // 光の条件は決めてある（設定はなし。2026-10-12 ユーザー「一般的に光脱毛で何が起こるかを説明できればいい」）
  $('speed').onchange = () => { S.speed = +$('speed').value; };
  if (!FEATURES.gray) { $('siteH').textContent = '部位'; $('age').closest('label').remove(); for (const id of ['grayH', 'grayRow', 'grayNote']) $(id).remove(); }   // 白髪を外しているときは設定ごと取り除く（hidden だけだと .row の display:flex で見えてしまう）
  const ul = $('srcs');
  for (let [txt, url] of SOURCES) {
    if (txt.startsWith('gray:')) { if (!FEATURES.gray) continue; txt = txt.slice(5); } const li = document.createElement('li'); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = txt; li.appendChild(a); ul.appendChild(li); }
}

function syncControls(S) {
  $('site').value = S.site; if ($('age')) $('age').value = S.age; if ($('gray')) $('gray').value = S.gray;
  $('who').textContent = SITES[S.site].name.replace(/（.*）/, '') + (FEATURES.gray ? `・${S.age}歳` : '');
  $('siteNote').textContent = SITES[S.site].name + ': ' + SITES[S.site].note;
  for (const T of TOOLS) $('tool-' + T.id).setAttribute('aria-checked', String(S.tool === T.id));
  $('hint').textContent = TOOLS.find(T => T.id === S.tool).hint;
  $('undo').disabled = !S.events.length;
}

// できごとの一覧（いまの日まで・新しい順）
function renderLog(log, t) {
  const items = log.filter(n => n.t <= t + 1e-9 && n.kind !== 'cut').slice(-40).reverse();
  $('log').innerHTML = items.map(n => `<li><span class="d">${Math.floor(n.t)}日目</span><span class="n">${n.i == null ? '' : n.i + 1}</span><span>${n.text}</span></li>`).join('') || '<li>まだ何も起きていません</li>';
}

function showTip(x, y, key, stage) {
  const tip = $('tip');
  if (!key) { tip.hidden = true; return; }
  tip.innerHTML = PARTS[key] || '';
  tip.hidden = false;
  const W = stage.clientWidth, tw = Math.min(260, W - 16);
  tip.style.maxWidth = tw + 'px';
  tip.style.left = Math.max(8, Math.min(W - tw - 8, x + 12)) + 'px';
  tip.style.top = Math.max(4, y - 10 - (y > stage.clientHeight / 2 ? tip.offsetHeight + 10 : -24)) + 'px';
}
let _toastT = null;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(_toastT); _toastT = setTimeout(() => { el.hidden = true; }, 2200);
}
