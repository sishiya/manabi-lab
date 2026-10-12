// 脱毛のしくみ — 道具・設定・案内（つぎへ）・吹き出し
'use strict';

const $ = id => document.getElementById(id);

// 案内。ev = その段で使う手入れ（ユーザーの手入れは置きかわる）、t = 見せる日、tool = 選ぶ道具
const ALL10 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const LIGHT_DEMO = [{ t: 0, type: 'shave', idx: ALL10 }, { t: 1, type: 'light', idx: ALL10 }];
const LIGHT_MORE = LIGHT_DEMO.concat([14, 28, 42].flatMap(d => [{ t: d, type: 'shave', idx: ALL10 }, { t: d + 1, type: 'light', idx: ALL10 }]));
const SH_PL = [{ t: 0, type: 'shave', idx: [0, 1, 2, 3, 4] }, { t: 0, type: 'pluck', idx: [5, 6, 7, 8, 9] }];
const GUIDE = [
  { t: 0, ev: [], tool: 'look', text: '<b>すね</b>の肌の断面です。毛穴が一列に10個。札は毛穴のいまのようす（のびる・ちぢむ・休む）。🔍 で図をさわると、部分の説明が出ます。' },
  { t: 0, ev: [], tool: 'look', play: true, text: '時間を進めてみます（▶、または +1日・+1週）。毛は「のびる → ちぢむ → 休む → また のびる」をくり返します。毛穴の下半分は周期ごとに縮んで作りなおされます（1つの毛穴では周期に1回）。' },
  { t: 0, ev: SH_PL.slice(0, 1), tool: 'shave', text: '<b style="color:var(--shave)">カミソリ</b>で左の5個を剃りました（肌の表面を横になぞると剃れます）。表面で切るだけで、毛穴の中は何も変わりません。' },
  { t: 3, ev: SH_PL.slice(0, 1), tool: 'shave', text: '3日後。のびる毛穴の毛は、もう先が出ています。休む毛穴の毛は切ったまま伸びません。剃っても太くはなりません（Lynfield & Macwilliams 1970）。' },
  { t: 0, ev: SH_PL, tool: 'pluck', text: '<b style="color:var(--pluck)">毛抜き</b>で右の5個を抜きました（どの道具も、横になぞった範囲に使えます）。根もとごと取れますが、毛穴は残ります。' },
  { t: 28, ev: SH_PL, tool: 'pluck', text: '4週後。抜いた毛穴は新しい成長期に入り、毛の先が表面に出てきました。左の剃っただけの所とくらべてみてください。' },
  { t: 1.05, ev: LIGHT_DEMO, tool: 'light', text: '<b style="color:var(--light)">光</b>（家庭用の光脱毛器）: 前の日に剃ってから、10個ぜんぶにあてました。光は毛の黒い色に吸われて熱になり、のびる毛穴の毛球（色の濃い毛母）が 80°C をこえて、細胞がいたみます。休む毛穴は変化なし。' },
  { t: 14, ev: LIGHT_DEMO, tool: 'light', text: 'いたんだ毛はもう伸びず、押し出されて抜け落ちます。毛穴はちぢんで休みに入りますが、なくなってはいません。' },
  { t: 70, ev: LIGHT_MORE, tool: 'light', text: '2週ごとに4回あてました。休んでいた毛穴があとから のびる に入るので、何回もあてます。下の「毛穴ごとの周期」で、光の日に赤い帯（のびる）が途切れているのを見てください。' },
  { t: 0, ev: [], tool: 'look', age: 60, text: '<b>白髪</b>: 年齢を 60歳 にしました。札に「白」がある毛穴は、色の幹細胞（黄色の点）が毛球へ届かなくなり、バルジに取り残されています（灰色の点）。その毛穴は、次の周期から白い毛を作ります。' },
  { t: 1.05, ev: LIGHT_DEMO, tool: 'light', age: 60, text: '60歳の肌に光をあてました。白い毛はメラニンがないので光が熱にならず、いたみません（できごとの一覧に「白い毛で…無事」）。<b>光脱毛は白髪には効きません</b>。' },
  { t: 0, ev: [], tool: 'shave', free: true, text: 'ここからは自由に。部位と道具を選んで、好きなときに好きな所を手入れしてください（↶ で1つ戻せます）。光の強さ・肌や毛の色は下の「光の設定」で。' },
];

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
  for (const [id, tbl] of [['skin', SKINS], ['hairc', HAIRS]]) for (const [k, v] of Object.entries(tbl)) { const o = document.createElement('option'); o.value = k; o.textContent = v.name; $(id).appendChild(o); }
  $('lv').oninput = () => on.light({ level: +$('lv').value });
  $('skin').onchange = () => on.light({ skin: $('skin').value });
  $('hairc').onchange = () => on.light({ hair: $('hairc').value });
  $('cool').onchange = () => on.light({ cool: $('cool').checked });
  $('speed').onchange = () => { S.speed = +$('speed').value; };
  const ul = $('srcs');
  for (const [txt, url] of SOURCES) { const li = document.createElement('li'); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = txt; li.appendChild(a); ul.appendChild(li); }
}

function syncControls(S) {
  $('site').value = S.site; $('age').value = S.age; $('gray').value = S.gray;
  $('siteNote').textContent = SITES[S.site].name + ': ' + SITES[S.site].note;
  for (const T of TOOLS) $('tool-' + T.id).setAttribute('aria-checked', String(S.tool === T.id));
  $('hint').textContent = TOOLS.find(T => T.id === S.tool).hint;
  const L = S.light;
  $('lv').value = L.level; $('lvv').textContent = 'Lv' + L.level; $('lvF').textContent = `約 ${(L.level * LIGHT.fPerLevel).toFixed(1)} J/cm²（推定）`;
  $('skin').value = L.skin; $('hairc').value = L.hair; $('cool').checked = L.cool;
  $('undo').disabled = !S.events.length;
}

// できごとの一覧（いまの日まで・新しい順）
function renderLog(log, t) {
  const items = log.filter(n => n.t <= t + 1e-9).slice(-40).reverse();
  $('log').innerHTML = items.map(n => `<li><span class="d">${Math.floor(n.t)}日目</span><span class="n">${n.i == null ? '' : n.i + 1}</span><span>${n.text}</span></li>`).join('') || '<li>まだ何も起きていません</li>';
}

// 狭い画面では案内を3行で折りたたむ（さわると全部）
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#gtext')) $('gtext').classList.toggle('open'); });

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
