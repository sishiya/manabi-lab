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
  { t: 14, text: '<b style="color:var(--light)">光</b>は毛の黒い色（メラニン）に吸われて熱になり、毛を作る所をいためます。光の前に剃るのは、表面の毛で熱をむだにしない・肌を熱くしないため。抜かないのは、熱を集める目印の毛がなくなるため。光の効き目の計算は次の段階で入れます。' },
  { t: 120, text: '下の「手入れの予定」と「周期の値」を変えて試してみてください。周期の値は出どころによって大きくちがいます（太ももを測った研究では、もっと短い）。' },
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
  // 出どころ
  const ul = $('srcs');
  for (const [txt, url] of SOURCES) { const li = document.createElement('li'); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = txt; li.appendChild(a); ul.appendChild(li); }
}

function syncControls(S) {
  $('site').value = S.site;
  for (const L of LANES) $('pre-' + L.id).value = S.pre[L.id];
  $('siteNote').textContent = SITES[S.site].note;
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
