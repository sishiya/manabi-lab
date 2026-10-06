// ================= panel, readouts, chart, pointer =================
'use strict';
const $ = id => document.getElementById(id);
const SPEEDS = [[1, '実際'], [10, '10倍'], [60, '1分/秒'], [600, '10分/秒'], [3600, '1時間/秒']];
const STATE_NAMES = {
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
  const order = [[315, '北西'], [0, '北'], [45, '北東'], [270, '西'], [null, ''], [90, '東'], [225, '南西'], [180, '南'], [135, '南東']];
  for (const [a, t] of order) {
    if (a == null) { const d = document.createElement('span'); d.className = 'cc'; d.textContent = 'から'; cp.appendChild(d); continue; }
    const b = document.createElement('button'); b.dataset.v = a; b.textContent = t; b.title = `${t}から吹く風`;
    b.onclick = () => { S.wind[0] = a; setSeg(cp, a); netChanged(); }; cp.appendChild(b);
  }
  $('windU').oninput = e => { S.wind[1] = +e.target.value; netChanged(); };
  // element rows
  const groups = [
    ['窓と玄関（外とつながる）', OPENINGS.filter(o => o.kind !== 'vent').map(o => [o.key, o.name, STATE_NAMES[o.kind]])],
    ['給気口（24時間換気の入口）', OPENINGS.filter(o => o.kind === 'vent').map(o => [o.key, o.name, STATE_NAMES.vent])],
    ['換気扇', FANS.map(f => [f.key, f.name, f.lvName])],
    ['室内のドア（閉めても下に約1cmのすき間）', DOORS.map(d => [d.key, d.name + (d.louvre ? '（ガラリつき）' : ''), STATE_NAMES.idoor])],
    ['エアコン（同じ空気を吸って吹き出す）', ACS.map(a => [a.key, a.name, STATE_NAMES.ac])],
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
  $('btnPlay').onclick = () => { S.paused = !S.paused; $('btnPlay').textContent = S.paused ? '再生' : '一時停止'; };
  $('btnFill').onclick = () => fillSmoke();
  $('btnClear').onclick = () => { smoke.fill(0); S.fill = null; S.smokeOn = false; drawChart(); };
  $('btnCirc').onclick = () => setTool('circ');
  $('btnCircClear').onclick = () => { S.circs = []; };
  $('hint').onclick = () => $('hint').classList.toggle('open');
  addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); $('btnPlay').click(); } });
}
function setTool(t) {
  S.tool = t; setSeg($('segTool'), t);
  if (t === 'smoke' && S.mode !== 'smoke') { S.mode = 'smoke'; setSeg($('segMode'), 'smoke'); updateLegend(); }
  cv.style.cursor = t === 'touch' ? 'default' : 'crosshair';
}
function syncUI() {
  document.querySelectorAll('#els .seg').forEach(s => setSeg(s, S.st[s.dataset.key] | 0));
  setSeg($('compass'), S.wind[0]); $('windU').value = S.wind[1];
  $('windCap').textContent = S.wind[1] ? `${DIRN[S.wind[0] / 45 | 0]}から ${S.wind[1]} m/s（${windWord(S.wind[1])}）` : '無風';
  setSeg($('segSpeed'), S.speed); setSeg($('segPSpeed'), S.pSpeed); setSeg($('segMode'), S.mode);
  document.querySelectorAll('.preset').forEach(b => b.setAttribute('aria-pressed', String(S.scene && b.dataset.v === S.scene.key)));
}
const windWord = U => U <= 1 ? '煙がなびく程度' : U <= 3 ? '顔に風を感じる' : U <= 5 ? '木の葉や小枝がたえず動く' : '小枝が動き、砂ぼこりが立つ';
function updateSpeedCap() {
  const s = S.speed;
  $('speedCap').textContent = s === 1 ? '実際の時間で進みます。' :
    `空気の古さと煙は、1秒で${s >= 3600 ? '1時間' : s >= 600 ? '10分' : s >= 60 ? '1分' : '10秒'}ぶん進みます。流れの粒は見やすいように速めずに動かします。`;
}

function updateLegend() {
  const el = $('legend');
  if (S.mode === 'age') {
    const ticks = [0, 3, 10, 30, 60, 120, 240, 480], X = ageX(480);
    const stops = []; for (let k = 0; k <= 40; k++) { const m = Math.expm1(X * k / 40); stops.push(`${css(ageCol(m * 60))} ${(k / 40 * 100).toFixed(1)}%`); }
    el.innerHTML = `<div class="lg-bar" style="background:linear-gradient(90deg,${stops.join(',')})"></div>
      <div class="lg-ticks">${ticks.map(m => `<span style="left:${(ageX(m) / X * 100).toFixed(1)}%">${m < 60 ? m : m / 60 + (m === 60 ? '時間' : '')}</span>`).join('')}</div>
      <div>外から入って何分たった空気か（右ほど古い。単位は分、60から先は時間）。</div>`;
  } else if (S.mode === 'speed') {
    const vals = [0.01, 0.03, 0.1, 0.3, 1, 2.5], lo = Math.log(0.005), hi = Math.log(2.5);
    const stops = []; for (let k = 0; k <= 30; k++) stops.push(`${css(spdCol(Math.exp(lo + (hi - lo) * k / 30)))} ${(k / 30 * 100).toFixed(1)}%`);
    el.innerHTML = `<div class="lg-bar" style="background:linear-gradient(90deg,${stops.join(',')})"></div>
      <div class="lg-ticks">${vals.map(s => `<span style="left:${((Math.log(s) - lo) / (hi - lo) * 100).toFixed(1)}%">${s < 1 ? Math.round(s * 100) : s}</span>`).join('')}</div>
      <div>風の速さ（cm/s、1から先は m/s）。人が風を感じるのはおよそ 20〜30 cm/s から。</div>`;
  } else {
    el.innerHTML = `<div class="lg-bar" style="background:linear-gradient(90deg,${css(smokeBg(0))},${css(smokeBg(1))})"></div>
      <div class="lg-ticks"><span style="left:2%">0</span><span style="left:50%">50</span><span style="left:96%">100%</span></div>
      <div>煙（汚れた空気）の濃さ。「煙を出す」で図の上をなぞるか、「部屋じゅうを煙で満たす」。</div>`;
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
function fmtTime(sec) {
  if (!isFinite(sec)) return '入れかわらない';
  if (sec < 60) return `${Math.round(sec)}秒`;
  return fmtAge(sec).replace('1分未満', '1分');
}
function updateReadout() {
  const st = houseStats(); S.stats = st;
  for (const r of ROOMS) { let s = 0; for (const c of r.cells) s += age[c]; r.meanAge = s / r.cells.length; }
  $('roVal').textContent = st.n < 10 ? st.n.toFixed(2) : st.n.toFixed(0);
  const ok = st.n >= 0.5;
  $('roTag').textContent = st.n >= 5 ? '窓をあけた換気' : ok ? '基準を満たす' : '基準より少ない';
  $('roTag').style.color = st.n >= 5 ? 'var(--fresh)' : ok ? 'var(--good)' : 'var(--weak)';
  $('roVerdict').innerHTML = `<span>家じゅうの空気が<b>${fmtTime(st.tau)}</b>で1回入れかわる量</span>`;
  const settled = S.t - S.tChange > Math.min(3 * st.tau, 8 * 3600);
  const old = ROOMS.reduce((a, r) => r.meanAge > a.meanAge ? r : a);
  const eff = st.tau / (2 * st.meanAge);
  const rows = [
    ['入れかわる空気', `${Math.round(st.Q * 3600)} m³/時`, `家の空気 ${Math.round(st.V)} m³`],
    ['室内の気圧', `外より ${st.p >= 0 ? '+' : '−'}${Math.abs(st.p) < 10 ? Math.abs(st.p).toFixed(1) : Math.round(Math.abs(st.p))} Pa`, pressWord(st.p)],
    ['空気の古さ（平均）', fmtAge(st.meanAge), settled ? '' : '変化中'],
    ['空気交換効率', settled && isFinite(eff) ? `${Math.round(eff * 100)}%` : '—', settled ? effWord(eff) : '落ち着くのを待っています'],
    ['いちばん古い部屋', `${old.name}`, fmtAge(old.meanAge)],
  ];
  $('roGrid').innerHTML = rows.map(([a, b, c]) => `<span>${a}</span><div><b>${b}</b>${c ? ` <small>${c}</small>` : ''}</div>`).join('');
  if (S.fill) { S.fill.pts.push([S.t - S.fill.t0, st.meanSmoke]); if (S.fill.pts.length > 600) S.fill.pts = S.fill.pts.filter((_, i) => i % 2 === 0); drawChart(); }
}
const pressWord = p => p < -20 ? 'ドアが重くなるほど' : p < -5 ? '少し引かれている' : p > 5 ? '外より高い' : 'ほぼ外と同じ';
const effWord = e => e > .6 ? '押し出すように入れかわる' : e > .42 ? 'ほぼまんべんなく混ざる' : '通り道だけが入れかわる';

// ---------- smoke chart ----------
function fillSmoke() {
  for (let c = 0; c < W * H; c++) smoke[c] = cell[c] === FLUID ? 1 : 0;
  S.smokeOn = true;
  S.fill = { t0: S.t, tau: S.stats ? S.stats.tau : Infinity, pts: [[0, 1]] };
  if (S.mode !== 'smoke') { S.mode = 'smoke'; setSeg($('segMode'), 'smoke'); updateLegend(); }
  drawChart();
}
function drawChart() {
  const c = $('chart'), g = c.getContext('2d'), w = c.width, h = c.height, L = 34, B = 18, T = 8, R = 8;
  g.clearRect(0, 0, w, h);
  g.font = "10px 'IBM Plex Mono',monospace"; g.fillStyle = '#7f93a0'; g.strokeStyle = 'rgba(170,210,220,.15)'; g.lineWidth = 1;
  for (const f of [0, .5, 1]) { const y = T + (1 - f) * (h - T - B); g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(`${f * 100}%`, L - 4, y); }
  const F = S.fill;
  if (!F) { g.textAlign = 'center'; g.fillText('まだ煙がありません', (L + w - R) / 2, h / 2); $('chartCap').textContent = '煙で満たすと、家に残っている煙の割合をグラフにします。点線は、空気がすぐに全体へ混ざる場合。'; return; }
  const last = F.pts[F.pts.length - 1][0];
  const span = Math.max(isFinite(F.tau) ? 2.5 * F.tau : 0, last * 1.05, 60);
  const X = t => L + t / span * (w - L - R), Y = f => T + (1 - f) * (h - T - B);
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const f of [0, .5, 1]) g.fillText(fmtTime(span * f).replace('入れかわらない', '—'), X(span * f) + (f === 0 ? 4 : f === 1 ? -14 : 0), h - B + 4);
  if (isFinite(F.tau)) {
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(200,220,230,.55)'; g.beginPath();
    for (let k = 0; k <= 60; k++) { const t = span * k / 60; g.lineTo(X(t), Y(Math.exp(-t / F.tau))); } g.stroke(); g.setLineDash([]);
  }
  g.strokeStyle = '#7ee0c8'; g.lineWidth = 2; g.beginPath(); for (const [t, f] of F.pts) g.lineTo(X(t), Y(f)); g.stroke();
  const f = F.pts[F.pts.length - 1][1];
  $('chartCap').innerHTML = `煙を満たしてから ${fmtTime(last)}、残り <b>${Math.round(f * 100)}%</b>` + (isFinite(F.tau) ? `（すぐに混ざる場合は ${Math.round(Math.exp(-last / F.tau) * 100)}%。点線）` : '');
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
