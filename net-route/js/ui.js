// インターネットの経路 — ボタン・タップ・説明・結果の表示
'use strict';

const $ = id => document.getElementById(id);
const PH_COL = { dns: '#ffd36a', tcp: '#f4f4f4', tls: '#c59bff', get: '#a98ae0', data: '#6fd3ff' };
const PH_NAME = { dns: '名前', tcp: 'あいさつ', tls: '暗号', get: 'ください', data: 'ページ' };
const ms = v => v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString();

// 時間の遅さ: 本当の1ミリ秒を画面の 0.000002〜0.5 秒で（対数のつまみ。火星や伝書鳩も見られるように）
const SLOW_MIN = 2e-6, SLOW_MAX = 0.5, SLOW_SPAN = Math.log10(SLOW_MAX / SLOW_MIN);
function setSlow() {
  const secPerMs = SLOW_MIN * Math.pow(10, +$('slow').value / 100 * SLOW_SPAN);
  SIM.msPerSec = 1 / secPerMs;
  $('slowT').textContent = '画面の1秒＝' + dur(1 / secPerMs);
}
function setSecPerMs(v) { $('slow').value = Math.max(0, Math.min(100, 100 * Math.log10(v / SLOW_MIN) / SLOW_SPAN)); setSlow(); }
$('slow').addEventListener('input', setSlow); setSlow();
$('ping').addEventListener('click', () => { sendPing(); SIM.paused = false; $('pause').textContent = '一時停止'; });

$('open').addEventListener('click', () => { openPage(); SIM.paused = false; $('pause').textContent = '一時停止'; $('open').textContent = 'もう一度開く'; closeInfo(); });
$('pause').addEventListener('click', () => { SIM.paused = !SIM.paused; $('pause').textContent = SIM.paused ? '再開' : '一時停止'; });
document.querySelectorAll('[data-srv]').forEach(b => b.addEventListener('click', () => {
  const v = b.dataset.srv; closeInfo();
  if (PLAY.event) endEvent(false);
  if (v.startsWith('mars-')) { setMars(v.slice(5)); setServer('mars'); } else setServer(v);
}));
document.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', () => { closeInfo(); setAccess(b.dataset.acc); }));   // できごとの「前→後」は古くなるので閉じる
document.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => startEvent(b.dataset.ev)));
$('evOff').addEventListener('click', () => { endEvent(); closeInfo(); });

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
  const how = l.medium === 'bird' ? '鳩が運ぶのに（測られた時間の半分）' : l.medium === 'air' ? '電波が通りぬけるのに' : '光が通りぬけるのに';
  const extra = (l.pref ? '<br>ふだんは使わない予備の道（会社どうしの約束で後回し・例）。' : '') + (l.loss ? `<br>${Math.round(l.loss * 100)}% の鳩が帰ってこない（試験の結果から）。` : '');
  return `<b>${l.name}</b><br>${ends}<br>長さ ${fmtKm(l.km)}${gc}<br>${how} <b>${dur(l.prop)}</b>${extra}` +
    (l.cut ? '<br><span style="color:#ff6b6b">切れています。もう一度タップでつなぎます。</span>' : '<br>もう一度タップで切ります。');
}
function packetInfo(p) {
  const st = p.state === 'fly' ? `${NODE[p.from].short} → ${NODE[p.to].short} を進んでいる` : p.state === 'node' ? `${NODE[p.at].short} で順番待ち` : p.state === 'lost' ? 'なくなった' : '着いた';
  const content = p.kind === 'data' ? `ページの ${p.seq + 1} / ${DATA_N} 番め` : KIND[p.kind];
  return `<b>${content}</b>${p.resend ? '（送り直し）' : ''}<br>出したところ ${NODE[p.src].short} → 宛先 ${NODE[p.dst].short}<br>大きさ ${p.size} バイト・通った中継 ${p.hops}<br>いま: ${st}<br>出してから ${dur(SIM.T - p.born)}`;
}

// 見かた: 図／地球儀
VIEW.mode = 'map';
function setView(m) {
  VIEW.mode = m;
  document.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x.dataset.view === m));
  $('stage').classList.toggle('globe', m === 'globe'); $('gnav').hidden = m !== 'globe';
  if (m !== 'globe') { PLAY.placing = false; $('place').classList.remove('on'); }
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { closeInfo(); setView(b.dataset.view); }));
$('place').addEventListener('click', () => {
  PLAY.placing = !PLAY.placing; $('place').classList.toggle('on', PLAY.placing);
  if (PLAY.placing) showInfo('<b>サーバーを置く</b><br>地球のどこかをタップしてください。', true); else closeInfo();
});
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => flyTo(GLOBE_VIEWS[b.dataset.go])));
document.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => zoomBy(+b.dataset.zoom)));

// 地球儀: なぞって回す・2本指やホイールで寄る（動かしたあとのタップは無視）
const ptrs = new Map(); let dragged = false, pinch0 = 0, down0 = null;
$('cv').addEventListener('pointerdown', e => { if (VIEW.mode !== 'globe') return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 1) { dragged = false; down0 = [e.clientX, e.clientY]; } pinch0 = 0; $('cv').setPointerCapture(e.pointerId); });
$('cv').addEventListener('pointermove', e => {
  if (VIEW.mode !== 'globe' || !ptrs.has(e.pointerId)) return;
  const [px, py] = ptrs.get(e.pointerId), dx = e.clientX - px, dy = e.clientY - py;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) { if (dx || dy) panBy(dx, dy); if (down0 && Math.hypot(e.clientX - down0[0], e.clientY - down0[1]) > 6) dragged = true; }   // 押したところから合計 6px で「なぞった」
  else { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) zoomBy(d / pinch0); pinch0 = d; dragged = true; }
});
const ptrEnd = e => { ptrs.delete(e.pointerId); pinch0 = 0; };
$('cv').addEventListener('pointerup', ptrEnd); $('cv').addEventListener('pointercancel', ptrEnd);
$('cv').addEventListener('wheel', e => { if (VIEW.mode !== 'globe') return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

$('cv').addEventListener('click', e => {
  if (VIEW.mode === 'globe' && dragged) { dragged = false; return; }
  const r = $('cv').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (VIEW.mode === 'globe' && PLAY.placing) { const ll = unproject(x, y); if (ll) placeServer(ll[0], ll[1]); return; }
  const h = VIEW.mode === 'globe' ? hitTestGlobe(x, y) : hitTest(x, y);
  if (!h) { closeInfo(); return; }
  if (h.type === 'cluster') { flyTo(GLOBE_VIEWS.tokyo); showInfo(`<b>東京のあたり</b><br>${h.nodes.map(n => n.short).join('・')} が重なっているので寄ります。`, true); return; }
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
  $('pgt').textContent = pageTimeText();
  uiAcc += dt; if (uiAcc < 0.15) return; uiAcc = 0;
  const [t, b] = PHASES[SIM.phase]; $('capT').textContent = t; $('capB').textContent = SIM.phase === 'fail' ? SIM.failWhy : b;
  if (VIEW.sel && VIEW.sel.type === 'packet' && !$('info').hidden) {
    const box = $('info'), p = VIEW.sel.p; box.innerHTML = '<button class="x" aria-label="とじる">×</button>' + packetInfo(p); box.querySelector('.x').onclick = closeInfo;
  }
  // 内訳
  const bd = breakdown(), total = bd.reduce((s, x) => s + x.ms, 0);
  $('bar').innerHTML = bd.map(x => `<div style="width:${total ? 100 * x.ms / total : 0}%;background:${PH_COL[x.ph]}" title="${PH_NAME[x.ph]} ${ms(x.ms)}ms">${PH_NAME[x.ph]}</div>`).join('');
  const route = shortest('phone', SIM.server), done = SIM.marks.done;
  const rows = [];
  rows.push(done != null ? `ページ（HTML 1つ・60KB の例）がそろうまで <b>${dur(done - SIM.marks.dns)}</b>` : SIM.phase === 'fail' ? `<span style="color:#ff6b6b">ページは開けなかった（${dur(SIM.marks.fail - SIM.marks.dns)} であきらめた）</span>` : SIM.phase === 'idle' ? '「ページを開く」を押してください' : `経過 <b>${dur(SIM.T)}</b>`);
  if (bd.length) rows.push(bd.map(x => `${PH_NAME[x.ph]} ${dur(x.ms)}`).join('・'));
  const pm = SIM.marks, t0 = pm.dns, seen = [['paint', '画面に何か出た'], ['text', '文字が読めた'], ['img', '絵まで出た']].filter(([k]) => pm[k] != null);
  if (seen.length) rows.push('スマホの画面: ' + seen.map(([k, n]) => `${n} <b>${dur(pm[k] - t0)}</b>`).join('・'));
  if (SIM.srtt != null) rows.push(`測った往復の時間 <b>${dur(SIM.srtt)}</b>`);
  if (SIM.pingSent) rows.push(`ping 送った ${SIM.pingSent}・返った ${SIM.pings.length}` + (SIM.pings.length ? `（往復 <b>${SIM.pings.slice(-3).map(dur).join('・')}</b>）` : ''));
  if (route) {
    const km = pathKm(route), lf = lightFloor();
    rows.push(`いまの道 ${route.map(id => NODE[id].short).join('→')}（${fmtKm(km)}・中継 ${route.length - 2}）`);
    rows.push(`この道を往復するだけで <b>${dur(2 * pathMs(route))}</b>` + (lf != null ? `／地球の表面にそっていちばん短い道を真空の光で行けば ${dur(lf)}` : ''));
  } else rows.push('<span style="color:#ff6b6b">サーバーまでの道がありません（ケーブルをつないでください）</span>');
  if (SIM.lost || SIM.resent) rows.push(`なくなった包み ${SIM.lost}・送り直し ${SIM.resent}`);
  $('nums').innerHTML = rows.map(r => `<li>${r}</li>`).join('');
}

// 仮のページ: タップで大きく・小さく
$('vpage').addEventListener('click', () => $('vpage').classList.toggle('big'));
