// 画面の文と読み取り。スライダーの目盛り、いまの場所、押した光の説明、ろうと図の置き場所
'use strict';
const $ = id => document.getElementById(id);
const fmt = (v, n = 1) => v.toFixed(n);

// スマホの縦ではろうと図を景色に重ね、それ以外はパネルの中（固定の部分から図が消えないように）
function placeFunnel() {
  const portrait = matchMedia('(max-width:860px) and (orientation:portrait)').matches;
  const box = $('funnelBox'), over = $('funnelOver'), home = $('funnelHome');
  if (portrait && box.parentElement !== over) over.appendChild(box);
  if (!portrait && box.parentElement !== home) home.insertBefore(box, home.querySelector('.cap'));
}

function zoneOf(S) {
  if (Math.abs(S.l) <= S.a + 0.02) return 0;
  return S.l < 0 ? -1 : 1;
}

function updateReadouts(S, T) {
  const zone = zoneOf(S), side = zone === 0 ? 'のどの中' : zone < 0 ? 'もとの宇宙' : '向こうの宇宙';
  const tag = $('roZone'); tag.textContent = side; tag.style.color = zone === 0 ? 'var(--ink)' : zone < 0 ? 'var(--acc)' : 'var(--far)';
  $('roDist').textContent = fmt(Math.abs(S.l), Math.abs(S.l) < 10 ? 2 : 1);
  $('roDistU').textContent = 'km（のどの中心まで）';
  const cap = (1 - Math.cos(T.psiC)) / 2, farFrac = S.l <= 0 ? cap : 1 - cap;
  $('roFar').textContent = `空の ${fmt(farFrac * 100, farFrac < 0.1 ? 2 : 1)}%`;
  $('roHole').textContent = `${fmt(T.psiC * 180 / Math.PI, 1)}°`;
}

function updateHint(S, T) {
  const psi = T.psiC * 180 / Math.PI, zone = zoneOf(S);
  let t;
  if (zone === 0) t = 'いま、のどの中です。前は向こうの宇宙、うしろはもとの宇宙。空がちょうど半分ずつです。';
  else if (zone < 0) t = psi > 30 ? '穴が空いっぱいに広がってきました。下の帯で、空のどこまでが穴かを見られます。' : '穴の奥に見えるのが向こうの宇宙。穴のまわりの星は、光が曲げられてゆがんでいます。';
  else t = psi > 30 ? '通りぬけました。もう前は向こうの宇宙です。「うしろを見る」と穴が見えます。' : 'うしろを見ると、今度は穴の中にもとの宇宙が見えます。';
  $('hint').textContent = t;
}

function updateTicks(S, uOf) {
  const box = $('ticks');
  const add = (u, txt, cls) => `<span class="${cls || ''}" style="left:${(u + 1) * 50}%">${txt}</span>`;
  let html = add(-1, 'もとの宇宙', 'l') + add(1, '向こうの宇宙', 'r') + add(0, 'のど', 'c');
  if (S.a > 0.2) { const u = uOf(S.a); html += add(-u, '入口') + add(u, '出口'); }
  box.innerHTML = html;
}

function describeRay(S, ray) {
  if (!ray) { $('rayText').innerHTML = ''; $('rayLine').textContent = '景色の点を押すと、その光の来た道が図に出ます。'; return; }
  const from = ray.side > 0 ? '<b class="far">向こうの宇宙</b>' : '<b class="near">もとの宇宙</b>';
  const deg = Math.abs(ray.phi) * 180 / Math.PI, laps = Math.floor(deg / 360);
  const how = ray.cross ? 'のどを通ってきた光' : 'のどを通らずに届いた光';
  const lap = laps >= 1 ? `。のどのまわりを約 ${laps} 周` : '';
  $('rayLine').innerHTML = `この点の光は ${from} から。${how}${lap}。`;
  $('rayText').innerHTML = `<p>のどの中心から見て <b>${fmt(deg, 0)}°</b> ぶん回りこんで届いた光です（カメラの位置を 0° とする角度）。のどの半径を 1 としたとき、この光の中心からの離れ具合（衝突径数）は <b>${fmt(ray.b, 3)}</b>。これが 1 より小さい光だけがのどを通ります。</p>`;
}
