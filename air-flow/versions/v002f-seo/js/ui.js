// ================= panel, readouts, chart, pointer =================
'use strict';
const $ = id => document.getElementById(id);
const SPEEDS = [[1, L('実際', 'Real')], [10, L('10倍', '10×')], [60, L('1分/秒', '1 min/s')], [600, L('10分/秒', '10 min/s')], [3600, L('1時間/秒', '1 h/s')]];
const STATE_NAMES = LANG === 'en' ? {
  window: ['Shut', 'Ajar', 'Open'], door: ['Shut', 'Open'], vent: ['Shut', '¼', '½', 'Full'], idoor: ['Shut', 'Open'], ac: ['Off', 'Low', 'High'],
} : {
  window: ['閉', '少し', '開ける'], door: ['閉', '開'], vent: ['閉', '少し', '半分', '全開'], idoor: ['閉', '開'], ac: ['切', '弱', '強'],
};
function setSeg(el, v) { el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }

// ---------- build ----------
function buildUI() {
  const sc = $('scenes');
  for (const p of SCENES) {
    const b = document.createElement('button'); b.className = 'preset'; b.dataset.v = p.key;
    b.innerHTML = `${p.name}<small>${p.sub}</small>`; b.onclick = () => loadScene(p.key); sc.appendChild(b);
  }
  const sp = $('segSpeed');
  for (const [v, t] of SPEEDS) { const b = document.createElement('button'); b.dataset.v = v; b.textContent = t; sp.appendChild(b); }
  sp.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.speed = +b.dataset.v; setSeg(sp, S.speed); updateSpeedCap(); };
  // compass: wind comes FROM this direction
  const cp = $('compass');
  const order = [[315, L('北西', 'NW')], [0, L('北', 'N')], [45, L('北東', 'NE')], [270, L('西', 'W')], [null, ''], [90, L('東', 'E')], [225, L('南西', 'SW')], [180, L('南', 'S')], [135, L('南東', 'SE')]];
  for (const [a, t] of order) {
    if (a == null) { const d = document.createElement('span'); d.className = 'cc'; d.textContent = L('から', 'from'); cp.appendChild(d); continue; }
    const b = document.createElement('button'); b.dataset.v = a; b.textContent = t; b.title = L(`${t}から吹く風`, `Wind from the ${t}`);
    b.onclick = () => { S.wind[0] = a; setSeg(cp, a); netChanged(); }; cp.appendChild(b);
  }
  $('windU').oninput = e => { S.wind[1] = +e.target.value; netChanged(); };
  // element rows
  const groups = [
    [L('窓と玄関（外とつながる）', 'Windows and front door (open to outside)'), OPENINGS.filter(o => o.kind !== 'vent').map(o => [o.key, o.name, STATE_NAMES[o.kind]])],
    [L('給気口（24時間換気の入口）', 'Vents (inlets for 24-hour ventilation)'), OPENINGS.filter(o => o.kind === 'vent').map(o => [o.key, o.name, STATE_NAMES.vent])],
    [L('換気扇', 'Exhaust fans'), FANS.map(f => [f.key, f.name, f.lvName])],
    [L('室内のドア（閉めても下に約1cmのすき間）', 'Inside doors (about a 1 cm gap underneath even when shut)'), DOORS.map(d => [d.key, d.name + (d.louvre ? L('（ガラリつき）', ' (with louvre)') : ''), STATE_NAMES.idoor])],
    [L('エアコン（同じ空気を吸って吹き出す）', 'Air conditioners (take in and blow out the same air)'), ACS.map(a => [a.key, a.name, STATE_NAMES.ac])],
  ];
  const els = $('els');
  for (const [title, rows] of groups) {
    const g = document.createElement('div'); g.className = 'elgroup';
    g.innerHTML = `<h3>${title}</h3>`;
    for (const [key, name, names] of rows) {
      const r = document.createElement('div'); r.className = 'elrow';
      r.innerHTML = `<span>${name}</span><div class="seg tiny" data-key="${key}">${names.map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}</div>`;
      r.querySelector('.seg').onclick = e => { const b = e.target.closest('button'); if (b) setState(key, +b.dataset.v); };
      g.appendChild(r);
    }
    els.appendChild(g);
  }
  $('segMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.mode = b.dataset.v; setSeg($('segMode'), S.mode); updateLegend(); };
  $('segPSpeed').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.pSpeed = +b.dataset.v; setSeg($('segPSpeed'), S.pSpeed); };
  $('optPart').onchange = e => { S.particles = e.target.checked; };
  $('segTool').onclick = e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.v); };
  const playLabel = () => { $('btnPlay').textContent = S.paused ? L('再生', 'Play') : L('一時停止', 'Pause'); };
  $('btnPlay').onclick = () => { S.paused = !S.paused; playLabel(); };
  playLabel();
  $('btnFill').onclick = () => fillSmoke();
  $('btnClear').onclick = () => { smoke.fill(0); S.fill = null; S.smokeOn = false; drawChart(); };
  $('btnCirc').onclick = () => setTool('circ');
  $('btnCircClear').onclick = () => { S.circs = []; };
  $('hint').onclick = () => $('hint').classList.toggle('open');
  addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); $('btnPlay').click(); } });
  // 言語の切り替え（ページを読み直す）と、言語で変わる属性
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.l === LANG); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
  document.title = L('空気の流れの見える部屋', 'Seeing Airflow at Home');
  cv.setAttribute('aria-label', L('2LDKの間取り図。空気の古さ・風・煙を色で表示。窓・ドア・給気口・換気扇を押すと開け閉めできます', 'Floor plan of a 2-bedroom apartment. Colors show the age of air, air speed or smoke. Tap windows, doors, vents and fans to open or close them.'));
  $('toolbar').setAttribute('aria-label', L('図の上でできること', 'What you can do on the map'));
  $('compass').setAttribute('aria-label', L('風が吹いてくる向き', 'Direction the wind blows from'));
  $('windU').setAttribute('aria-label', L('風の強さ', 'Wind speed'));
  $('chart').setAttribute('aria-label', L('家に残っている煙の割合のグラフ', 'Graph of how much smoke is left in the home'));
}
function setTool(t) {
  S.tool = t; setSeg($('segTool'), t);
  if (t === 'smoke' && S.mode !== 'smoke') { S.mode = 'smoke'; setSeg($('segMode'), 'smoke'); updateLegend(); }
  cv.style.cursor = t === 'touch' ? 'default' : 'crosshair';
}
function syncUI() {
  document.querySelectorAll('#els .seg').forEach(s => setSeg(s, S.st[s.dataset.key] | 0));
  setSeg($('compass'), S.wind[0]); $('windU').value = S.wind[1];
  const dir = DIRN[S.wind[0] / 45 | 0];
  $('windCap').textContent = S.wind[1] ? L(`${dir}から ${S.wind[1]} m/s（${windWord(S.wind[1])}）`, `From ${dir}, ${S.wind[1]} m/s (${windWord(S.wind[1])})`) : L('無風', 'No wind');
  setSeg($('segSpeed'), S.speed); setSeg($('segPSpeed'), S.pSpeed); setSeg($('segMode'), S.mode);
  document.querySelectorAll('.preset').forEach(b => b.setAttribute('aria-pressed', String(S.scene && b.dataset.v === S.scene.key)));
}
const windWord = U => U <= 1 ? L('煙がなびく程度', 'smoke drifts') : U <= 3 ? L('顔に風を感じる', 'you feel it on your face') : U <= 5 ? L('木の葉や小枝がたえず動く', 'leaves and twigs keep moving') : L('小枝が動き、砂ぼこりが立つ', 'small branches move, dust rises');
function updateSpeedCap() {
  const s = S.speed;
  const step = s >= 3600 ? L('1時間', '1 hour') : s >= 600 ? L('10分', '10 minutes') : s >= 60 ? L('1分', '1 minute') : L('10秒', '10 seconds');
  $('speedCap').textContent = s === 1 ? L('実際の時間で進みます。', 'Runs in real time.') :
    L(`空気の古さと煙は、1秒で${step}ぶん進みます。流れの粒は見やすいように速めずに動かします。`, `The age of air and the smoke move ahead ${step} every second. The flow particles are not sped up, so they are easy to follow.`);
}

function updateLegend() {
  const el = $('legend');
  if (S.mode === 'age') {
    const ticks = [0, 3, 10, 30, 60, 120, 240, 480], X = ageX(480);
    const stops = []; for (let k = 0; k <= 40; k++) { const m = Math.expm1(X * k / 40); stops.push(`${css(ageCol(m * 60))} ${(k / 40 * 100).toFixed(1)}%`); }
    el.innerHTML = `<div class="lg-bar" style="background:linear-gradient(90deg,${stops.join(',')})"></div>
      <div class="lg-ticks">${ticks.map(m => `<span style="left:${(ageX(m) / X * 100).toFixed(1)}%">${m < 60 ? m : m / 60 + (m === 60 ? L('時間', ' h') : '')}</span>`).join('')}</div>
      <div>${L('外から入って何分たった空気か（右ほど古い。単位は分、60から先は時間）。', 'How many minutes ago the air came in from outside (older to the right; minutes, then hours from 60).')}</div>`;
  } else if (S.mode === 'speed') {
    const vals = [0.01, 0.03, 0.1, 0.3, 1, 2.5], lo = Math.log(0.005), hi = Math.log(2.5);
    const stops = []; for (let k = 0; k <= 30; k++) stops.push(`${css(spdCol(Math.exp(lo + (hi - lo) * k / 30)))} ${(k / 30 * 100).toFixed(1)}%`);
    el.innerHTML = `<div class="lg-bar" style="background:linear-gradient(90deg,${stops.join(',')})"></div>
      <div class="lg-ticks">${vals.map(s => `<span style="left:${((Math.log(s) - lo) / (hi - lo) * 100).toFixed(1)}%">${s < 1 ? Math.round(s * 100) : s}</span>`).join('')}</div>
      <div>${L('風の速さ（cm/s、1から先は m/s）。人が風を感じるのはおよそ 20〜30 cm/s から。', 'Air speed (cm/s, then m/s from 1). People start to feel a breeze at about 20–30 cm/s.')}</div>`;
  } else {
    el.innerHTML = `<div class="lg-bar" style="background:linear-gradient(90deg,${css(smokeBg(0))},${css(smokeBg(1))})"></div>
      <div class="lg-ticks"><span style="left:2%">0</span><span style="left:50%">50</span><span style="left:96%">100%</span></div>
      <div>${L('煙（汚れた空気）の濃さ。「煙を出す」で図の上をなぞるか、「部屋じゅうを煙で満たす」。', 'Smoke (dirty air) concentration. Trace on the map with “Add smoke”, or use “Fill the home with smoke”.')}</div>`;
  }
}

// ---------- readout ----------
let fluidCount = 0;
function houseStats() {
  if (!fluidCount) for (let c = 0; c < W * H; c++) if (cell[c] === FLUID) fluidCount++;
  const V = fluidCount * DX * DX * HCEIL;
  let Q = 0; for (const z of S.net.zones) Q += z.qin; for (const it of S.net.items) Q += it.qx;
  let big = 0; const cnt = new Array(nZones).fill(0); for (let c = 0; c < W * H; c++) if (zoneOf[c] >= 0) cnt[zoneOf[c]]++;
  for (let z = 1; z < nZones; z++) if (cnt[z] > cnt[big]) big = z;
  let sa = 0, ss = 0; for (let c = 0; c < W * H; c++) if (cell[c] === FLUID) { sa += age[c]; ss += smoke[c]; }
  // flux-weighted age of the air leaving the house (equals V/Q when settled)
  const sc = 1 / (HCEIL * DX); let eo = 0, eq = 0;
  for (let c = 0; c < W * H; c++) { const q = (src[c] < 0 ? -src[c] : 0) + exch[c]; if (q > 0) { eo += q * age[c]; eq += q; } }
  return { V, Q, n: Q * 3600 / V, tau: Q > 1e-9 ? V / Q : Infinity, p: S.net.zones[big] ? S.net.zones[big].p : 0, meanAge: sa / fluidCount, meanSmoke: ss / fluidCount, exitAge: eq ? eo / eq : NaN };
}
const NO_CHANGE = L('入れかわらない', 'never');
function fmtTime(sec) {
  if (!isFinite(sec)) return NO_CHANGE;
  if (sec < 60) return L(`${Math.round(sec)}秒`, `${Math.round(sec)} s`);
  return fmtAge(sec).replace(L('1分未満', 'under 1 min'), L('1分', '1 min'));
}
function updateReadout() {
  const st = houseStats(); S.stats = st;
  for (const r of ROOMS) { let s = 0; for (const c of r.cells) s += age[c]; r.meanAge = s / r.cells.length; }
  $('roVal').textContent = st.n < 10 ? st.n.toFixed(2) : st.n.toFixed(0);
  const ok = st.n >= 0.5;
  $('roTag').textContent = st.n >= 5 ? L('窓をあけた換気', 'open-window airing') : ok ? L('基準を満たす', 'meets the standard') : L('基準より少ない', 'below the standard');
  $('roTag').style.color = st.n >= 5 ? 'var(--fresh)' : ok ? 'var(--good)' : 'var(--weak)';
  $('roVerdict').innerHTML = isFinite(st.tau) ? L(`<span>家じゅうの空気が<b>${fmtTime(st.tau)}</b>で1回入れかわる量</span>`, `<span>Enough to replace all the air in the home once every <b>${fmtTime(st.tau)}</b></span>`)
    : L(`<span>家じゅうの空気が<b>${fmtTime(st.tau)}</b>で1回入れかわる量</span>`, `<span>The air in the home is <b>not being replaced</b></span>`);
  const settled = S.t - S.tChange > Math.min(3 * st.tau, 8 * 3600);
  const old = ROOMS.reduce((a, r) => r.meanAge > a.meanAge ? r : a);
  const eff = st.tau / (2 * st.meanAge);
  const pa = `${st.p >= 0 ? '+' : '−'}${Math.abs(st.p) < 10 ? Math.abs(st.p).toFixed(1) : Math.round(Math.abs(st.p))} Pa`;
  const rows = [
    [L('入れかわる空気', 'Air exchanged'), L(`${Math.round(st.Q * 3600)} m³/時`, `${Math.round(st.Q * 3600)} m³/h`), L(`家の空気 ${Math.round(st.V)} m³`, `home holds ${Math.round(st.V)} m³`)],
    [L('室内の気圧', 'Indoor pressure'), L(`外より ${pa}`, `${pa} vs. outside`), pressWord(st.p)],
    [L('空気の古さ（平均）', 'Age of air (average)'), fmtAge(st.meanAge), settled ? '' : L('変化中', 'changing')],
    [L('空気交換効率', 'Air change efficiency'), settled && isFinite(eff) ? `${Math.round(eff * 100)}%` : '—', settled ? effWord(eff) : L('落ち着くのを待っています', 'waiting for it to settle')],
    [L('いちばん古い部屋', 'Stalest room'), `${old.name}`, fmtAge(old.meanAge)],
  ];
  $('roGrid').innerHTML = rows.map(([a, b, c]) => `<span>${a}</span><div><b>${b}</b>${c ? ` <small>${c}</small>` : ''}</div>`).join('');
  if (S.fill) { S.fill.pts.push([S.t - S.fill.t0, st.meanSmoke]); if (S.fill.pts.length > 600) S.fill.pts = S.fill.pts.filter((_, i) => i % 2 === 0); drawChart(); }
}
const pressWord = p => p < -20 ? L('ドアが重くなるほど', 'enough to make doors heavy') : p < -5 ? L('少し引かれている', 'pulled a little') : p > 5 ? L('外より高い', 'higher than outside') : L('ほぼ外と同じ', 'about the same as outside');
const effWord = e => e > .6 ? L('押し出すように入れかわる', 'fresh air pushes old air out') : e > .42 ? L('ほぼまんべんなく混ざる', 'mixes almost evenly') : L('通り道だけが入れかわる', 'only the path gets fresh air');

// ---------- smoke chart ----------
function fillSmoke() {
  for (let c = 0; c < W * H; c++) smoke[c] = cell[c] === FLUID ? 1 : 0;
  S.smokeOn = true;
  S.fill = { t0: S.t, tau: S.stats ? S.stats.tau : Infinity, pts: [[0, 1]] };
  if (S.mode !== 'smoke') { S.mode = 'smoke'; setSeg($('segMode'), 'smoke'); updateLegend(); }
  drawChart();
}
function drawChart() {
  const c = $('chart'), g = c.getContext('2d'), w = c.width, h = c.height, PL = 34, B = 18, T = 8, R = 8;
  g.clearRect(0, 0, w, h);
  g.font = "10px 'IBM Plex Mono',monospace"; g.fillStyle = '#7f93a0'; g.strokeStyle = 'rgba(170,210,220,.15)'; g.lineWidth = 1;
  for (const f of [0, .5, 1]) { const y = T + (1 - f) * (h - T - B); g.beginPath(); g.moveTo(PL, y); g.lineTo(w - R, y); g.stroke(); g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(`${f * 100}%`, PL - 4, y); }
  const F = S.fill;
  if (!F) { g.textAlign = 'center'; g.fillText(L('まだ煙がありません', 'No smoke yet'), (PL + w - R) / 2, h / 2); $('chartCap').textContent = L('煙で満たすと、家に残っている煙の割合をグラフにします。点線は、空気がすぐに全体へ混ざる場合。', 'After you fill the home with smoke, this graph shows how much smoke is left. The dotted line is what would happen if the air mixed through the whole home instantly.'); return; }
  const last = F.pts[F.pts.length - 1][0];
  const span = Math.max(isFinite(F.tau) ? 2.5 * F.tau : 0, last * 1.05, 60);
  const X = t => PL + t / span * (w - PL - R), Y = f => T + (1 - f) * (h - T - B);
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const f of [0, .5, 1]) g.fillText(fmtTime(span * f).replace(NO_CHANGE, '—'), X(span * f) + (f === 0 ? 4 : f === 1 ? -14 : 0), h - B + 4);
  if (isFinite(F.tau)) {
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(200,220,230,.55)'; g.beginPath();
    for (let k = 0; k <= 60; k++) { const t = span * k / 60; g.lineTo(X(t), Y(Math.exp(-t / F.tau))); } g.stroke(); g.setLineDash([]);
  }
  g.strokeStyle = '#7ee0c8'; g.lineWidth = 2; g.beginPath(); for (const [t, f] of F.pts) g.lineTo(X(t), Y(f)); g.stroke();
  const f = F.pts[F.pts.length - 1][1], left = Math.round(f * 100), mixed = isFinite(F.tau) ? Math.round(Math.exp(-last / F.tau) * 100) : 0;
  $('chartCap').innerHTML = L(`煙を満たしてから ${fmtTime(last)}、残り <b>${left}%</b>` + (isFinite(F.tau) ? `（すぐに混ざる場合は ${mixed}%。点線）` : ''),
    `${fmtTime(last)} after filling with smoke: <b>${left}%</b> left` + (isFinite(F.tau) ? ` (${mixed}% if it mixed instantly; dotted line)` : ''));
}

// ---------- pointer on the plan ----------
const toM = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };
const inR = (p, r, pad) => p[0] >= r[0] - pad && p[0] <= r[2] + pad && p[1] >= r[1] - pad && p[1] <= r[3] + pad;
function hitElement(p, pad) {
  for (const f of FANS) if (inR(p, f.hood ? [f.rect[0], f.rect[1], f.rect[2], f.rect[1] + .32] : f.rect, pad)) return [f.key, 3];
  for (const a of ACS) { const r = [a.x - a.w / 2, a.y - .2, a.x + a.w / 2, a.y + .2]; if (inR(p, r, pad * .5)) return [a.key, 3]; }
  for (const o of OPENINGS) if (inR(p, o.rect, o.kind === 'vent' ? pad + .06 : pad)) return [o.key, o.kind === 'window' ? 3 : o.kind === 'vent' ? 4 : 2];
  for (const d of DOORS) if (inR(p, d.rect, pad)) return [d.key, 2];
  return null;
}
let drag = null;
function onDown(e) {
  const p = toM(e), pad = (e.pointerType === 'touch' ? 18 : 10) / scale;
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }
  if (S.tool === 'smoke') { puff(p); drag = { kind: 'smoke' }; return; }
  if (S.tool === 'circ') {
    const c = ((p[1] / DX) | 0) * W + ((p[0] / DX) | 0);
    if (c >= 0 && c < W * H && cell[c] === FLUID) S.circs.push({ x: p[0], y: p[1], ang: 0, lv: 2 });
    setTool('touch'); return;
  }
  // circulators first (handle, then body)
  for (const q of S.circs) {
    const a = q.ang * Math.PI / 180, hx = q.x + Math.cos(a) * .55, hy = q.y + Math.sin(a) * .55;
    if (Math.hypot(p[0] - hx, p[1] - hy) < .12 + pad) { drag = { kind: 'rot', q }; return; }
  }
  for (const q of S.circs) if (Math.hypot(p[0] - q.x, p[1] - q.y) < CIRC_D / 2 + .08 + pad) { drag = { kind: 'move', q, p0: p, moved: false }; return; }
  const h = hitElement(p, pad);
  if (h) { const [key, n] = h; setState(key, ((S.st[key] | 0) + 1) % n); }
}
function onMove(e) {
  const p = toM(e); S.hover = p;
  if (!drag) {
    if (S.tool === 'touch') { const pad = 10 / scale; cv.style.cursor = hitElement(p, pad) || S.circs.some(q => Math.hypot(p[0] - q.x, p[1] - q.y) < .3 || Math.hypot(p[0] - q.x - Math.cos(q.ang * Math.PI / 180) * .55, p[1] - q.y - Math.sin(q.ang * Math.PI / 180) * .55) < .15) ? 'pointer' : 'default'; }
    return;
  }
  if (drag.kind === 'smoke') puff(p);
  else if (drag.kind === 'rot') drag.q.ang = Math.round(Math.atan2(p[1] - drag.q.y, p[0] - drag.q.x) * 180 / Math.PI / 5) * 5;
  else if (drag.kind === 'move') {
    if (Math.hypot(p[0] - drag.p0[0], p[1] - drag.p0[1]) > .05) drag.moved = true;
    const c = ((p[1] / DX) | 0) * W + ((p[0] / DX) | 0);
    if (drag.moved && c >= 0 && c < W * H && cell[c] === FLUID) { drag.q.x = p[0]; drag.q.y = p[1]; }
  }
}
function onUp() {
  if (drag && drag.kind === 'move' && !drag.moved) drag.q.lv = (drag.q.lv + 1) % 3;
  drag = null;
}
function puff([x, y]) {
  const r = 0.3, i0 = Math.floor((x - r) / DX), i1 = Math.ceil((x + r) / DX), j0 = Math.floor((y - r) / DX), j1 = Math.ceil((y + r) / DX);
  for (let j = Math.max(0, j0); j < Math.min(H, j1); j++) for (let i = Math.max(0, i0); i < Math.min(W, i1); i++) {
    const c = j * W + i, d = Math.hypot((i + .5) * DX - x, (j + .5) * DX - y);
    if (cell[c] === FLUID && d < r) { smoke[c] = Math.min(1, smoke[c] + 0.5 * (1 - d / r)); S.smokeOn = true; }
  }
}
cv.addEventListener('pointerdown', onDown);
cv.addEventListener('pointermove', onMove);
cv.addEventListener('pointerup', onUp);
cv.addEventListener('pointercancel', onUp);
cv.addEventListener('pointerleave', () => { S.hover = null; $('probe').textContent = ''; });
