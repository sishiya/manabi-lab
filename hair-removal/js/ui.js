// 脱毛のしくみ — 道具・設定・一覧・吹き出し・お知らせ
'use strict';

const $ = id => document.getElementById(id);

function buildControls(S, on) {
  const site = $('site');
  for (const k of ['shin', 'thighF', 'thighM', 'armF', 'armM', 'lip']) { const o = document.createElement('option'); o.value = k; o.textContent = SITES[k].name; site.appendChild(o); }
  site.onchange = () => on.site(site.value);
  for (let a = 20; a <= 80; a += 10) { const o = document.createElement('option'); o.value = a; o.textContent = L(a + '歳', 'age ' + a); $('age').appendChild(o); }
  $('age').onchange = () => on.age(+$('age').value);
  for (const [k, v] of Object.entries(GRAY_TYPES)) { const o = document.createElement('option'); o.value = k; o.textContent = L(`${v.name}（平均 ${v.mean}歳）`, `${v.name} (average age ${v.mean})`); $('gray').appendChild(o); }
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
  for (const [v, ja, en] of [[2, '1秒で2日', '2 days per second'], [7, '1秒で1週', '1 week per second'], [30, '1秒で1か月', '1 month per second'], [120, '1秒で4か月', '4 months per second']]) { const o = document.createElement('option'); o.value = v; o.textContent = L(ja, en); if (v === 7) o.selected = true; $('speed').appendChild(o); }
  $('speed').onchange = () => { S.speed = +$('speed').value; };
  $('tools').setAttribute('aria-label', L('道具', 'Tools'));
  $('zin').setAttribute('aria-label', L('拡大', 'Zoom in')); $('zout').setAttribute('aria-label', L('縮小', 'Zoom out'));
  $('play').setAttribute('aria-label', L('再生', 'Play'));
  $('undo').title = L('最後の手入れを取り消す', 'Undo the last treatment'); $('undo').setAttribute('aria-label', $('undo').title);
  document.title = L('脱毛のしくみ', 'How Hair Removal Works');
  document.querySelectorAll('#langsw button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
  if (!FEATURES.gray) { $('siteH').textContent = L('部位', 'Body site'); $('age').closest('label').remove(); for (const id of ['grayH', 'grayRow', 'grayNote']) $(id).remove(); }   // 白髪を外しているときは設定ごと取り除く（hidden だけだと .row の display:flex で見えてしまう）
  document.querySelectorAll('.srcs').forEach(ul => { for (let [txt, url] of SOURCES) {
    if (txt.startsWith('gray:')) { if (!FEATURES.gray) continue; txt = txt.slice(5); } const li = document.createElement('li'); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = txt; li.appendChild(a); ul.appendChild(li); } });
}

function syncControls(S) {
  $('site').value = S.site; if ($('age')) $('age').value = S.age; if ($('gray')) $('gray').value = S.gray;
  $('who').textContent = SITES[S.site].name.replace(/\s*[（(].*[）)]$/, '') + (FEATURES.gray ? L(`・${S.age}歳`, ` · age ${S.age}`) : '');
  $('siteNote').textContent = SITES[S.site].name + ': ' + SITES[S.site].note;
  for (const T of TOOLS) $('tool-' + T.id).setAttribute('aria-checked', String(S.tool === T.id));
  $('hint').textContent = TOOLS.find(T => T.id === S.tool).hint;
  $('undo').disabled = !S.events.length;
}

// できごとの一覧（いまの日まで・新しい順）
function renderLog(log, t) {
  const items = log.filter(n => n.t <= t + 1e-9 && n.kind !== 'cut').slice(-40).reverse();
  $('log').innerHTML = items.map(n => `<li><span class="d">${L(Math.floor(n.t) + '日目', 'day ' + Math.floor(n.t))}</span><span class="n">${n.i == null ? '' : n.i + 1}</span><span>${n.text}</span></li>`).join('') || '<li>' + L('まだ何も起きていません', 'Nothing has happened yet') + '</li>';
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
