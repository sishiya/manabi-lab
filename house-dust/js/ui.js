// ほこりが積もるまで — パネル（ボタン・数字・時間のバー・グラフ・説明の表）
'use strict';

const $ = id => document.getElementById(id);
const SPEEDS = [
  { v: 1, label: '実際' }, { v: 10, label: '10倍' }, { v: 60, label: '1分<span class="ps">/秒</span>' }, { v: 600, label: '10分<span class="ps">/秒</span>' }, { v: 3600, label: '1時間<span class="ps">/秒</span>' },
];
const PERSON = [
  { k: 'routine', label: 'いつもの1日' }, { k: 'sleep', label: 'ねる' }, { k: 'sit', label: 'すわる' }, { k: 'walk', label: '歩く' }, { k: 'out', label: '出かける' },
];
const CHART_PLACES = [
  { p: 'ベッドの下', c: '#e6c88a' }, { p: 'すみ・家具のきわ', c: '#e8b98f' }, { p: 'ベッドと壁のすきま', c: '#ff9d57' }, { p: '床', c: '#9fd3f0' }, { p: '棚の上', c: '#b9a6ff' }, { p: 'ベッドの上', c: '#7fdc8a' },
];

function fmtNum(v, d = 1) {
  if (!isFinite(v)) return '–';
  if (v === 0) return '0';
  if (v < 0.001) return v.toExponential(1);
  if (v < 0.01) return v.toFixed(4);
  if (v < 0.1) return v.toFixed(3);
  if (v < 10) return v.toFixed(d + (v < 1 ? 1 : 0));
  return Math.round(v).toLocaleString();
}
function fmtDur(s) {
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} 秒`;
  if (s < 3600) return `${Math.round(s / 60)} 分`;
  if (s < 86400) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)} 時間`;
  return `${(s / 86400).toFixed(1)} 日`;
}
function fmtClock(t) {
  const day = Math.floor(t / 86400) + 1, h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
  return `${day}日目 ${h}:${String(m).padStart(2, '0')}`;
}
function mixHTML(src) {
  let tot = 0; for (const v of src) tot += v;
  if (tot <= 0) return '';
  return SRC.map((s, i) => src[i] > 0 ? `<span style="width:${(100 * src[i] / tot).toFixed(2)}%;background:${s.color}" title="${s.name} ${Math.round(100 * src[i] / tot)}%"></span>` : '').join('');
}

function buildUI(S, H) {
  // 速さ
  const ss = $('segSpeed');
  ss.innerHTML = SPEEDS.map(o => `<button data-v="${o.v}">${o.label}</button>`).join('');
  ss.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.speed = +b.dataset.v; syncUI(S); };
  $('play').onclick = () => { S.playing = !S.playing; syncUI(S); };
  // 人
  const sp = $('segPerson');
  sp.innerHTML = PERSON.map(o => `<button data-k="${o.k}">${o.label}</button>`).join('');
  sp.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k === 'routine') { S.routine = true; PS.lastAct = routineAct(S.t); }
    else { S.routine = false; S.manual = b.dataset.k; logEvent(S, PERSON.find(o => o.k === b.dataset.k).label); }
    syncUI(S);
  };
  // やってみる
  $('acts').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.do === 'wash') { washSheets(S); syncUI(S); return; }
    startTask(b.dataset.task, S); syncUI(S);
  };
  // 部屋
  $('toggles').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.k; S[k] = !S[k];
    logEvent(S, { window: S.window ? '窓をあける' : '窓をしめる', vent: S.vent ? '24時間換気 入' : '24時間換気 切', ac: S.ac ? 'エアコン 入' : 'エアコン 切', purifier: S.purifier ? '空気清浄機 入' : '空気清浄機 切' }[k]);
    syncUI(S);
  };
  // 設定
  $('optSpring').onchange = e => { S.spring = e.target.checked; };
  $('optShoes').onchange = e => { S.shoes = e.target.checked; };
  $('optHepa').onchange = e => { S.hepa = e.target.checked; };
  $('optFlow').onchange = e => { S.showFlow = e.target.checked; };
  // 時間
  $('tl').oninput = e => { restoreSnap(+e.target.value); };
  $('restart').onclick = () => { restartSim(); };
  // 図をさわる: タップ = ルーペの場所（顕微鏡の絵では粒の説明）、ドラッグ = 動かす、ホイール・2本指 = ズーム
  const pick = (px, py) => {
    const w = toWorld(px, py);
    if (w.x < -0.05 || w.x > ROOM_W + 0.05 || w.y < -0.1 || w.y > ROOM_H + 0.05) return;
    const f = nearestFace(w.x, w.y);
    S.sel = { x: w.x, y: w.y, f };
    if (f >= 0) S.selPlace = FACES[f].place;
  };
  setupInput(
    (px, py) => { if (microAlpha() > 0.5) { VIEW.hover = microHit(px, py); } else pick(px, py); },
    (px, py) => { if (microAlpha() > 0.5) VIEW.hover = microHit(px, py); },
  );
  $('zIn').onclick = () => zoomAt(VIEW.w / 2, VIEW.h / 2, 2.5);
  $('zOut').onclick = () => zoomAt(VIEW.w / 2, VIEW.h / 2, 1 / 2.5);
  $('zAll').onclick = () => resetView();
  $('mjump').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const ok = jumpTo(b.dataset.k, S.sel ? S.sel.f : -1);
    if (!ok) { VIEW.note = `この面の近くには、まだ${b.textContent}の粒がない`; VIEW.noteT = performance.now(); }
  };
  $('zoomHere').onclick = () => {   // えらんだ場所へ、幅 3mm になるまで寄る
    const F = S.sel && S.sel.f >= 0 ? FACES[S.sel.f] : FACES.find(F => F.place === '床');
    VIEW.mf = -1; aimAt(F.x, F.y + 0.002, VIEW.w / 0.003 / VIEW.s0);
  };
  $('places').onclick = e => {
    const r = e.target.closest('.pl'); if (!r) return;
    S.selPlace = r.dataset.p;
    // その場所の面のうち、まん中あたりのもの
    const list = FACES.filter(F => F.place === S.selPlace);
    const F = list[Math.floor(list.length / 2)];
    if (F) S.sel = { x: F.x, y: F.y + 0.01, f: FACES.indexOf(F) };
  };
  // 説明の表
  $('srcChips').innerHTML = $('srcChipsM').innerHTML = SRC.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
  $('srcList').innerHTML = SRC.map(s => `<li><i style="background:${s.color}"></i><b>${s.name}</b> — ${s.note}</li>`).join('');
  const ex = ['すす・排気の粒', 'すす・カビの胞子くらい', '細かい土ぼこり・小さな皮ふのかけら', '皮ふのかけら・土ぼこり', 'スギ花粉・皮ふのかけら', '繊維くず・砂つぶ'];
  $('vsTable').innerHTML = '<tr><th>大きさ</th><th>落ちる速さ</th><th>1.5m 落ちるのに</th><th>たとえば</th></tr>' +
    BINS.map((b, i) => `<tr><td class="mono">${b.label}</td><td class="mono">${b.vs < 1e-3 ? (b.vs * 1e6).toFixed(b.vs < 1e-5 ? 1 : 0) + ' µm/秒' : b.vs < 0.1 ? (b.vs * 1000).toFixed(1) + ' mm/秒' : (b.vs * 100).toFixed(0) + ' cm/秒'}</td><td class="mono">${fmtDur(1.5 / b.vs)}</td><td>${ex[i]}</td></tr>`).join('');
  $('chartLegend').innerHTML = CHART_PLACES.map(o => `<span><i style="background:${o.c}"></i>${o.p}</span>`).join('');
}

function syncUI(S) {
  for (const b of $('segSpeed').children) b.setAttribute('aria-pressed', +b.dataset.v === S.speed);
  $('play').textContent = S.playing ? '❚❚' : '▶'; $('play').setAttribute('aria-label', S.playing ? '止める' : '進める');
  for (const b of $('segPerson').children) b.setAttribute('aria-pressed', S.routine ? b.dataset.k === 'routine' : b.dataset.k === S.manual);
  for (const b of $('toggles').children) b.setAttribute('aria-pressed', !!S[b.dataset.k]);
  for (const b of $('acts').children) b.classList.toggle('on', !!(PS.task && PS.task.type === b.dataset.task));
}

// 毎コマの数字
let lastPlaces = 0;
function updateReadout(S) {
  $('clock').textContent = fmtClock(S.t);
  const a = airborne();
  $('roFine').textContent = fmtNum(a.fine);
  $('roCoarse').textContent = fmtNum(a.coarse);
  const bp = byPlace();
  const pl = bp[S.selPlace] || bp['床'];
  $('roPlace').textContent = S.selPlace || '床';
  $('roGm2').textContent = pl ? fmtNum(pl.gm2, 2) : '–';
  $('roMix').innerHTML = pl ? mixHTML(pl.src) : '';
  // ルーペの中の数
  const lc = $('loupe');
  const f = S.sel && S.sel.f >= 0 ? S.sel.f : -1;
  drawLoupe(lc, f);
  if (f >= 0) {
    const L = loupeCounts(f), cnt = {};
    for (const it of L.items) cnt[it.k] = (cnt[it.k] || 0) + it.n;
    const parts = [['fiber', '繊維'], ['skin', '皮ふ'], ['soil', '土'], ['pollen', '花粉']].map(([k, n]) => cnt[k] >= 0.5 ? `${n} ${cnt[k] < 10 ? Math.round(cnt[k]) : Math.round(cnt[k]).toLocaleString()}` : '').filter(Boolean);
    const all = ['fiber', 'skin', 'soil', 'pollen'].reduce((a, k) => a + (cnt[k] || 0), 0) * 100 / (LOUPE_MM * LOUPE_MM);
    $('roCount').textContent = parts.length ? `ルーペ（1mm四方）の中: ${parts.join('・')} こ。1cm四方なら 約${Math.round(all).toLocaleString()}こ` : 'ルーペの中: まだ粒はない';
  } else $('roCount').textContent = '';
  // 顕微鏡の絵の説明
  const mc = $('mcap'), on = microAlpha() > 0.3;
  mc.hidden = !on; if (on && lastPlaces % 4 === 0) mc.innerHTML = microCaption() + '<br><small>' + (VIEW.note && performance.now() - VIEW.noteT < 3000 ? VIEW.note : '粒にさわると名前が出る') + '</small>';
  $('zhint').hidden = VIEW.z > 1.5;
  $('mjump').hidden = !on;
  // 場所の表（重いので 4コマに1回）
  if (++lastPlaces % 4 === 0) {
    const rows = Object.entries(bp).filter(([k]) => !['天井', '壁', '家具の横', '家具の裏', '窓'].includes(k)).sort((x, y) => y[1].gm2 - x[1].gm2);
    const wallish = ['壁', '窓', '天井'].map(k => bp[k]).filter(Boolean);
    const wall = wallish.length ? wallish.reduce((s, o) => ({ m: s.m + o.m, n: s.n + o.n, src: s.src.map((v, i) => v + o.src[i]) }), { m: 0, n: 0, src: new Float64Array(NS) }) : null;
    let html = rows.map(([k, o]) => `<div class="pl${k === S.selPlace ? ' sel' : ''}" data-p="${k}"><span>${k}</span><div class="mix">${mixHTML(o.src)}</div><b>${fmtNum(o.gm2, 2)}</b></div>`).join('');
    if (wall) html += `<div class="pl" data-p="壁"><span>壁・天井</span><div class="mix">${mixHTML(wall.src)}</div><b>${fmtNum(wall.m * 1e-6 / (wall.n * FACE_AREA), 2)}</b></div>`;
    $('places').innerHTML = html + '<p class="cap">単位 g/m²。色は出どころの割合（重さ）。</p>';
    $('now').innerHTML = nowText(S, a);
  }
}

function nowText(S, a) {
  const T = PS.task;
  let t;
  if (T && T.type === 'vacuum') t = S.hepa ? '掃除機をかけている。HEPA の排気なので、吸った細かい粒はほとんどもれない。排気の風が当たる床では少し舞い上がる。' : '掃除機をかけている。吸いこむ一方で、排気から細かい粒がもれ（ふつうのフィルター）、排気の風が当たる床では少し舞い上がる。';
  else if (T && T.type === 'wipe') t = '床を拭いている。舞い上げずに取れる。ベッドの下は届きにくい。';
  else if (T && T.type === 'duster') t = 'はたきで棚・机の上のほこりを落としている。大きい粒は数分で床へ、細かい粒は何時間も浮いている。';
  else if (T && T.type === 'bed') t = 'ふとんをはたいている。ふとんにたまった皮ふのかけらと繊維が舞い上がり、まわりの床に落ちる。';
  else if (PS.state === 'sleep') t = '寝ている。はがれた皮ふの多くはふとんの中へたまる（ダニのえさにもなる）。';
  else if (PS.state === 'out') t = 'だれもいない。舞っていたほこりが、静かに落ちて積もる時間。';
  else if (PS.state === 'walk') t = '歩いている。足もとの床のほこりが舞い上がり、服から繊維と皮ふのかけらが出る。';
  else t = '机にすわっている。動きが少ないので、出るほこりも少なめ。';
  const extra = [];
  if (S.window) extra.push('窓から外の空気（すす・土ぼこり' + (S.spring ? '・花粉' : '') + '）が入り、部屋の細かい粒は外へ出ていく。');
  if (S.purifier) extra.push('空気清浄機が、浮いている細かい粒を取っている。');
  if (S.ac) extra.push('エアコンの風で部屋がかきまぜられ、床のほこりが舞いやすい。');
  return t + (extra.length ? '<br><small>' + extra.join('') + '</small>' : '');
}

// 時間のバー（出来事の印）
function drawTimeline(S, H) {
  const c = $('tlc'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, Hh = r.height, t0 = H.t0, t1 = Math.max(S.t, t0 + 3600 * 6);
  x.clearRect(0, 0, W, Hh);
  const X2 = t => 4 + (W - 8) * (t - t0) / (t1 - t0);
  // 夜（23〜7時）を暗く
  x.fillStyle = 'rgba(80,110,160,.18)';
  for (let d = Math.floor(t0 / 86400) - 1; d * 86400 < t1; d++) {
    const a = d * 86400 + 23 * 3600, b = a + 8 * 3600;
    if (b > t0 && a < t1) x.fillRect(X2(Math.max(a, t0)), 0, X2(Math.min(b, t1)) - X2(Math.max(a, t0)), Hh - 10);
  }
  x.strokeStyle = 'rgba(190,215,235,.3)'; x.beginPath(); x.moveTo(4, Hh - 10); x.lineTo(W - 4, Hh - 10); x.stroke();
  x.fillStyle = '#6f8494'; x.font = `10px ${FF}`; x.textAlign = 'center';
  for (let d = Math.ceil(t0 / 86400); d * 86400 <= t1; d++) { const px = X2(d * 86400); x.fillRect(px, Hh - 13, 1, 6); x.fillText(`${d + 1}日目`, px, Hh - 1); }
  x.fillStyle = '#e6c88a';
  for (const e of S.events) if (e.t >= t0) { x.fillRect(X2(e.t) - 1, 4, 2, Hh - 16); }
  x.fillStyle = '#e8f0f4'; x.beginPath(); x.arc(X2(S.t), (Hh - 10) / 2, 4, 0, 7); x.fill();
}

// 積もった量のグラフ
function drawChart(S, H) {
  const c = $('chart'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, Hh = r.height, L = 40, B = 18, T = 6;
  x.clearRect(0, 0, W, Hh);
  const ser = H.series; if (ser.length < 2) { x.fillStyle = '#6f8494'; x.font = `11px ${FF}`; x.fillText('時間が進むと、ここに積もった量の変化が出ます', L, Hh / 2); return; }
  const t0 = ser[0].t, t1 = Math.max(ser[ser.length - 1].t, t0 + 3600);
  let ymax = 0; for (const p of ser) for (const o of CHART_PLACES) ymax = Math.max(ymax, p[o.p] || 0);
  ymax = niceMax(ymax || 0.001);
  const X2 = t => L + (W - L - 6) * (t - t0) / (t1 - t0), Y2 = v => Hh - B - (Hh - B - T) * v / ymax;
  x.strokeStyle = 'rgba(190,215,235,.15)'; x.fillStyle = '#6f8494'; x.font = `10px ${FF}`; x.textAlign = 'right';
  for (let k = 0; k <= 4; k++) { const v = ymax * k / 4, y = Y2(v); x.beginPath(); x.moveTo(L, y); x.lineTo(W - 6, y); x.stroke(); x.fillText(fmtNum(v, 2), L - 4, y + 3); }
  x.textAlign = 'center';
  for (let d = Math.ceil(t0 / 86400); d * 86400 <= t1; d++) x.fillText(`${d + 1}日目`, X2(d * 86400), Hh - 4);
  x.textAlign = 'left'; x.fillText('g/m²', 2, T + 8);
  for (const o of CHART_PLACES) {
    x.strokeStyle = o.c; x.lineWidth = 1.6; x.beginPath();
    ser.forEach((p, k) => { const y = Y2(p[o.p] || 0); k ? x.lineTo(X2(p.t), y) : x.moveTo(X2(p.t), y); });
    x.stroke();
  }
}
function niceMax(v) { const e = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= v) return m * e; return 10 * e; }
