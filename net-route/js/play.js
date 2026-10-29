// インターネットの経路 — 遊び: サーバーをどこにでも置く（月・火星も）／家からの道（衛星・伝書鳩）／本当にあった切断
// 点数や勝ち負けはなし。どれも同じ計算（光の速さ・道えらび・送り直し）のまま
'use strict';

const PLAY = { access: 'fiber', event: null, show: new Set(), placing: false };
const R_EARTH = 6371;

// 描くかどうか（ふだんは描かない点 opt は、サーバー・道の上・できごとのときだけ）
function nodeShown(n) {
  if (!n.opt || n.id === SIM.server || PLAY.show.has(n.id)) return true;
  const r = shortest('phone', SIM.server); return !!(r && r.includes(n.id));
}
function linkShown(l) { return !l.off && nodeShown(NODE[l.a]) && nodeShown(NODE[l.b]); }

// 片道で進むだけの時間（道がなければ null）
function oneWayMs() { const r = shortest('phone', SIM.server); return r ? pathMs(r) : null; }

// 遠いほど時間をはやく回す（片道が画面で約4秒）。近いときは初めの速さ
const SLOW_DEFAULT = 0.032;
function autoSpeed() {
  const ow = oneWayMs();
  setSecPerMs(ow == null ? 5 / 127000 : ow > 300 ? 4 / ow : SLOW_DEFAULT);   // 道がないときは、あきらめるまでの127秒を画面の約5秒に
}

function setServer(id) {
  SIM.server = id; resetSim();
  document.querySelectorAll('[data-srv]').forEach(x => x.classList.toggle('on', x.dataset.srv === id || (id === 'mars' && x.dataset.srv === 'mars-' + PLAY.mars)));
  $('open').textContent = 'ページを開く';
  autoSpeed();
}
function setMars(which) {             // 火星はいつも同じ距離ではない
  PLAY.mars = which;
  const l = linkBetween('usuda', 'mars');
  l.km = which === 'near' ? 55760000 : 401000000;   // 2003年の大接近 ／ 太陽の向こう側でいちばん遠いとき（NASA）
  l.prop = l.km / l.v; netChanged();
}

// 家からの道: 光ファイバー／静止衛星／低い軌道の衛星／伝書鳩
function setAccess(a) {
  PLAY.access = a;
  LINKS.forEach(l => { if (l.acc) l.off = l.acc !== a; if (l.home) l.off = a !== 'fiber'; });
  netChanged(); resetSim(); $('open').textContent = 'ページを開く';
  document.querySelectorAll('[data-acc]').forEach(x => x.classList.toggle('on', x.dataset.acc === a));
  autoSpeed();
}

// 本当にあった切断
const EVENTS = {
  taiwan: {
    server: 'hk', view: { lat: 27, lon: 128, zoom: 2.6 }, jam: ['busan'], cut: l => l.strait,
    title: '2006年12月26日 台湾の南の海の地震',
    text: 'ルソン海峡のケーブルが何本も切れた。のこった予備の道は混む（推定）。',
  },
  tonga: {
    server: 'tonga', view: { lat: -8, lon: -175, zoom: 1.7 }, jam: [], cut: l => l.a === 'tonga',
    title: '2022年1月15日 トンガの海底火山の噴火',
    text: '外へつながるケーブルは1本だけ。約5週間つながらなかった。',
  },
};
function startEvent(key) {
  endEvent(false);
  const ev = EVENTS[key]; PLAY.event = key;
  setServer(ev.server);
  const before = oneWayMs();
  LINKS.forEach(l => { if (ev.cut(l)) { l.evPrev = l.cut; l.cut = true; l.ev = true; } });
  ev.jam.forEach(id => NET.jam[id] = true);
  netChanged(); autoSpeed();
  const after = oneWayMs();
  PLAY.show = new Set([ev.server, ...LINKS.filter(l => l.ev).flatMap(l => [l.a, l.b])]);
  setView('globe'); flyTo(ev.view);
  const cmp = after == null ? '<b style="color:#ff6b6b">道がなくなった。</b>' : `片道 ${dur(before)} → <b>${dur(after)}</b>（道がかわった）`;
  showInfo(`<b>${ev.title}</b><br>${ev.text}<br>${cmp}`);
  document.querySelectorAll('[data-ev]').forEach(x => x.classList.toggle('on', x.dataset.ev === key));
}
function endEvent(redraw = true) {
  if (!PLAY.event) return;
  EVENTS[PLAY.event].jam.forEach(id => delete NET.jam[id]);
  LINKS.forEach(l => { if (l.ev) { l.cut = l.evPrev; l.ev = false; } });   // 手で切っていた線は切れたまま
  PLAY.event = null; PLAY.show = new Set(); netChanged();
  document.querySelectorAll('[data-ev]').forEach(x => x.classList.remove('on'));
  if (redraw) setServer('dc');
}

// 地球儀のタップした所にサーバーを置く。いちばん近い2つの中継へ、仮のケーブル（大円×1.2・推定）でつなぐ
const GATEWAYS = ['ix', 'chikura', 'shima', 'hawaii', 'bandon', 'la', 'busan', 'fiji'];
function unproject(x, y) {             // 画面 → 緯度経度（正射図法の逆）。地球の外なら null
  prepProj();
  const u = (x - PJ.cx) / PJ.R, v = -(y - PJ.cy) / PJ.R, rr = u * u + v * v;
  if (rr > 1) return null;
  const z = Math.sqrt(1 - rr);
  const lat = Math.asin(z * PJ.s0 + v * PJ.c0) / RAD;
  const lon = (PJ.l0 + Math.atan2(u, z * PJ.c0 - v * PJ.s0)) / RAD;
  return [lat, ((lon + 540) % 360) - 180];
}
function removeFree() {
  for (let i = LINKS.length - 1; i >= 0; i--) if (LINKS[i].free) LINKS.splice(i, 1);
  const k = NODES.findIndex(n => n.id === 'free'); if (k >= 0) NODES.splice(k, 1);
  delete NODE.free;
}
function placeServer(lat, lon) {
  endEvent(false); removeFree();
  const n = { id: 'free', short: '置いた場所', x: 0.92, y: 0.92, kind: 'server', opt: true, lat, lon,
    name: `置いたサーバー（${lat >= 0 ? '北緯' : '南緯'}${Math.abs(lat).toFixed(1)}°・${lon >= 0 ? '東経' : '西経'}${Math.abs(lon).toFixed(1)}°）` };
  NODES.push(n); NODE.free = n;
  const near = GATEWAYS.map(id => [id, greatCircleKm(NODE[id], n)]).sort((a, b) => a[1] - b[1]).slice(0, 2);
  near.forEach(([id]) => { const l = { a: id, b: 'free', medium: 'fiber', bw: 10, k: 1.2, free: true, name: '仮のケーブル（いちばん短い道×1.2・推定）' }; LINKS.push(l); });
  LINKS.forEach(initLink); netChanged();
  $('srvFree').hidden = false;
  setServer('free');
  PLAY.placing = false; $('place').classList.remove('on');
  const ow = oneWayMs();
  showInfo(`<b>${n.name}</b><br>近くの ${near.map(([id]) => NODE[id].short).join('・')} から仮のケーブルでつなぎました（このアプリにある中継から選ぶので、本物の道とはちがいます）。<br>片道で進むだけで <b>${ms(ow)} ミリ秒</b>。「ページを開く」で見てみよう。`);
}

// 宇宙のサーバー（地球儀・図とも、画面のすみに置く。縮尺はちがう）
function spaceText(n) { const l = LINKS.find(x => x.b === n.id); return `${n.short} ${fmtKm(l.km)}（縮尺はちがう）`; }
