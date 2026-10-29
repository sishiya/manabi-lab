// インターネットの経路 — ボタン・タップ・説明・結果の表示
'use strict';

const $ = id => document.getElementById(id);
const PH_COL = { dns: '#ffd36a', tcp: '#f4f4f4', tls: '#c59bff', get: '#a98ae0', data: '#6fd3ff' };
const PH_NAME = { dns: '名前', tcp: 'あいさつ', tls: '暗号', get: 'ください', data: 'ページ' };
const ms = v => v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString();

function setSlow() {
  const v = +$('slow').value / 100, secPerMs = 0.005 * Math.pow(100, v);   // 1ミリ秒を 0.005〜0.5 秒で
  SIM.msPerSec = 1 / secPerMs;
  $('slowT').textContent = '1ミリ秒を ' + (secPerMs < 0.1 ? secPerMs.toFixed(3) : secPerMs.toFixed(2)) + '秒で';
}
$('slow').addEventListener('input', setSlow); setSlow();

$('open').addEventListener('click', () => { openPage(); SIM.paused = false; $('pause').textContent = '一時停止'; $('open').textContent = 'もう一度開く'; closeInfo(); });
$('pause').addEventListener('click', () => { SIM.paused = !SIM.paused; $('pause').textContent = SIM.paused ? '再開' : '一時停止'; });
document.querySelectorAll('[data-srv]').forEach(b => b.addEventListener('click', () => {
  SIM.server = b.dataset.srv; resetSim(); closeInfo();
  document.querySelectorAll('[data-srv]').forEach(x => x.classList.toggle('on', x === b));
  $('open').textContent = 'ページを開く';
}));

let infoTimer = 0;
function closeInfo() { VIEW.sel = null; $('info').hidden = true; clearTimeout(infoTimer); }
// パケットの中身は開いたまま（動きを追う）。線・点の説明は少しで消す（図をかくさない）
function showInfo(html, autoClose = false) {
  $('info').innerHTML = '<button class="x" aria-label="とじる">×</button>' + html; $('info').hidden = false; $('info').querySelector('.x').onclick = closeInfo;
  clearTimeout(infoTimer); if (autoClose) infoTimer = setTimeout(closeInfo, 4000);
}

function linkInfo(l) {
  const ends = NODE[l.a].name + ' ー ' + NODE[l.b].name;
  const gc = l.gc ? `（いちばん短い道 ${fmtKm(l.gc)} × ${l.sea ? SEA_K : LAND_K}・推定）` : '';
  return `<b>${l.name}</b><br>${ends}<br>長さ ${fmtKm(l.km)}${gc}<br>光が通りぬけるのに <b>${ms(l.prop)} ミリ秒</b>` +
    (l.cut ? '<br><span style="color:#ff6b6b">切れています。もう一度タップでつなぎます。</span>' : '<br>もう一度タップで切ります。');
}
function packetInfo(p) {
  const st = p.state === 'fly' ? `${NODE[p.from].short} → ${NODE[p.to].short} を進んでいる` : p.state === 'node' ? `${NODE[p.at].short} で順番待ち` : p.state === 'lost' ? 'なくなった' : '着いた';
  const content = p.kind === 'data' ? `ページの ${p.seq + 1} / ${DATA_N} 番め` : KIND[p.kind];
  return `<b>${content}</b>${p.resend ? '（送り直し）' : ''}<br>出したところ ${NODE[p.src].short} → 宛先 ${NODE[p.dst].short}<br>大きさ ${p.size} バイト・通った中継 ${p.hops}<br>いま: ${st}<br>出してから ${ms(SIM.T - p.born)} ミリ秒`;
}

$('cv').addEventListener('click', e => {
  const r = $('cv').getBoundingClientRect(), h = hitTest(e.clientX - r.left, e.clientY - r.top);
  if (!h) { closeInfo(); return; }
  VIEW.sel = h;
  if (h.type === 'link') { toggleCut(h.l); onCut(h.l); showInfo(linkInfo(h.l), true); }
  else if (h.type === 'node') {
    const n = h.n;
    if (n.kind === 'router') { toggleJam(n.id); showInfo(`<b>${n.name}</b><br>${NET.jam[n.id] ? '混ませました。ここを通る包みは待たされ、ときどき捨てられます（推定）。' : '混雑を消しました。'}<br>もう一度タップで切りかえ。`, true); }
    else showInfo(`<b>${n.name}</b><br>${n.kind === 'server' ? 'ページを置いているコンピューター。下の「サーバー」で選べます。' : 'ページを見たい人。ここから話しかけます。'}`, true);
  } else showInfo(packetInfo(h.p));
});

let uiAcc = 0;
function updateUI(dt) {
  uiAcc += dt; if (uiAcc < 0.15) return; uiAcc = 0;
  const [t, b] = PHASES[SIM.phase]; $('capT').textContent = t; $('capB').textContent = b;
  if (VIEW.sel && VIEW.sel.type === 'packet' && !$('info').hidden) {
    const box = $('info'), p = VIEW.sel.p; box.innerHTML = '<button class="x" aria-label="とじる">×</button>' + packetInfo(p); box.querySelector('.x').onclick = closeInfo;
  }
  // 内訳
  const bd = breakdown(), total = bd.reduce((s, x) => s + x.ms, 0);
  $('bar').innerHTML = bd.map(x => `<div style="width:${total ? 100 * x.ms / total : 0}%;background:${PH_COL[x.ph]}" title="${PH_NAME[x.ph]} ${ms(x.ms)}ms">${PH_NAME[x.ph]}</div>`).join('');
  const route = shortest('phone', SIM.server), done = SIM.marks.done;
  const rows = [];
  rows.push(done != null ? `ページ（HTML 1つ・60KB の例）がそろうまで <b>${ms(done - SIM.marks.dns)} ミリ秒</b>` : SIM.phase === 'idle' ? '「ページを開く」を押してください' : `経過 <b>${ms(SIM.T)} ミリ秒</b>`);
  if (bd.length) rows.push(bd.map(x => `${PH_NAME[x.ph]} ${ms(x.ms)}`).join('・') + ' ミリ秒');
  if (SIM.srtt != null) rows.push(`測った往復の時間 <b>${ms(SIM.srtt)} ミリ秒</b>`);
  if (route) {
    const km = pathKm(route);
    rows.push(`いまの道 ${route.map(id => NODE[id].short).join('→')}（${fmtKm(km)}・中継 ${route.length - 2}）`);
    rows.push(`この道を光が往復するだけで <b>${ms(2 * km / V_FIBER)} ミリ秒</b>／地球の表面にそっていちばん短い道を真空の光で行けば ${ms(lightFloor())} ミリ秒`);
  } else rows.push('<span style="color:#ff6b6b">サーバーまでの道がありません（ケーブルをつないでください）</span>');
  if (SIM.lost || SIM.resent) rows.push(`なくなった包み ${SIM.lost}・送り直し ${SIM.resent}`);
  $('nums').innerHTML = rows.map(r => `<li>${r}</li>`).join('');
}
