// 脱毛のしくみ — ボタン・選ぶもの・案内（つぎへ）・説明の吹き出し
'use strict';

const $ = id => document.getElementById(id);

// 案内。set は S を書きかえる（main.js の applyGuide がよぶ）
const GUIDE = [
  { t: -7, text: '3列とも同じ<b>すね</b>の肌です。毛穴の中で毛は「のびる（成長期）→ 止まる（退行期）→ 休む（休止期）」をくり返します。図の部分をさわると説明が出ます。' },
  { t: -7, text: '見出しの下の帯は毛穴の期の割合です（<span style="color:#e57a7a">赤</span>＝成長期、<span style="color:#b39a90">灰</span>＝休止期）。すねでは、休んでいる毛穴のほうが多いとされます。' },
  { t: 0, text: '0日目に手入れをします。<b style="color:var(--shave)">剃る</b>は表面で切るだけ。<b style="color:var(--pluck)">抜く</b>は根もとから取ります。<b style="color:var(--light)">光</b>の列は、光の前の日に剃っておきます。' },
  { t: 2, text: '剃って2日。のびている（成長期の）毛は、もう先が出てきました。毛穴の中は何も変わっていないからです。休止期の毛は切ったまま止まっています。' },
  { t: 7, text: '剃っても毛は太く・濃くなりません（片足だけ毎週剃っても、太さ・のびる速さに差がなかった: Lynfield & Macwilliams 1970）。切り口が平らなので、チクチクするだけです。' },
  { t: 18, text: '抜いた列: 毛穴の奥で新しい毛が作られ、表面へ向かってのびています（まだ見えない）。毛穴そのものは残っています。' },
  { t: 35, text: '抜いて1か月ほどで、新しい毛が一度に出てきました。抜くとたくさんの毛穴が同時に生えかわりを始めるからです（遅れの日数は推定）。' },
  { t: 0.05, text: '<b style="color:var(--light)">光</b>った瞬間。光は毛の黒い色（メラニン）に吸われて熱になります。成長期の毛球（色の濃い毛母）は 80°C をこえ、細胞がいたみます。細い毛からバルジへ届く熱は少しだけです（熱がすぐ逃げるため）。' },
  { t: 8, text: '毛母がいたんだ毛はもう伸びず、押し出されて<b>伸びているように見え</b>、1〜3週で落ちます。毛穴そのもの（幹細胞）は残るので、休んだあとまた生えてきます。' },
  { t: 13.9, text: '光の前の日に剃りました。いまは成長期の毛穴がほとんどありません（前の光で休みに入った）。<b>休止期の毛穴には光が効かない</b>ので、間をあけて何回もあてます（2週ごと4回→4週ごと）。' },
  { t: 120, text: '4か月。<b style="color:var(--light)">光</b>の列は、表面に出る毛がとても少なくなりました。ただしこれは「生えかわりのたびに落としている」状態で、毛穴はこわれていません（このモデルでは）。' },
  { t: 120, text: '下の「光」で強さ・肌の色・毛の色・光の前の準備を変えてみてください。茶色やうすい色の毛は熱をためられず、ほとんど効きません。濃い肌や日焼けした肌は表皮が熱くなります。' },
  { t: 120, text: '「1週間前に抜く」にすると、目印の毛と色のある毛球がなく、光が効きにくくなります。周期の値・手入れの予定も変えて試せます（数値の多くは推定。下の「このアプリについて」）。' },
];

const UI = { tipTimer: null };

function buildControls(S, onChange) {
  // 周期の値
  const site = $('site');
  for (const [k, v] of Object.entries(SITES)) { const o = document.createElement('option'); o.value = k; o.textContent = v.name; site.appendChild(o); }
  site.value = S.site;
  site.onchange = () => { S.site = site.value; onChange(true); };
  // 列ごとの予定
  const box = $('lanesCtl');
  for (const L of LANES) {
    const row = document.createElement('label'); row.className = 'lane';
    row.innerHTML = `<b style="color:${L.color}">${L.name}</b>`;
    const sel = document.createElement('select'); sel.id = 'pre-' + L.id;
    for (const p of PRESETS[L.id]) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); }
    sel.value = S.pre[L.id];
    sel.onchange = () => { S.pre[L.id] = sel.value; onChange(true); };
    row.appendChild(sel);
    if (L.id === 'light') { const s = document.createElement('span'); s.className = 'hint'; s.textContent = '（前の日に剃る）'; row.appendChild(s); }
    box.appendChild(row);
  }
  $('speed').onchange = () => { S.speed = +$('speed').value; };
  // 光の設定
  for (const [id, tbl] of [['skin', SKINS], ['hairc', HAIRS]]) for (const [k, v] of Object.entries(tbl)) { const o = document.createElement('option'); o.value = k; o.textContent = v.name; $(id).appendChild(o); }
  $('lv').oninput = () => { S.light.level = +$('lv').value; onChange(true); };
  $('skin').onchange = () => { S.light.skin = $('skin').value; onChange(true); };
  $('hairc').onchange = () => { S.light.hair = $('hairc').value; onChange(true); };
  $('prep').onchange = () => { S.light.prep = $('prep').value; onChange(true); };
  $('cool').onchange = () => { S.light.cool = $('cool').checked; onChange(true); };
  // 出どころ
  const ul = $('srcs');
  for (const [txt, url] of SOURCES) { const li = document.createElement('li'); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = txt; li.appendChild(a); ul.appendChild(li); }
}

function syncControls(S) {
  $('site').value = S.site;
  for (const L of LANES) $('pre-' + L.id).value = S.pre[L.id];
  $('siteNote').textContent = SITES[S.site].note;
  const L = S.light;
  $('lv').value = L.level; $('lvv').textContent = 'Lv' + L.level; $('lvF').textContent = `約 ${(L.level * LIGHT.fPerLevel).toFixed(1)} J/cm²（推定）`;
  $('skin').value = L.skin; $('hairc').value = L.hair; $('prep').value = L.prep; $('cool').checked = L.cool;
}

// 説明の吹き出し（マウスをのせる・さわる）
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
