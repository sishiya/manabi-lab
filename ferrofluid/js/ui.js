// パネル・読み取り・グラフ・見つけてみよう・皿の上の操作
'use strict';

const $ = id => document.getElementById(id);
const fmt = (v, d) => (isFinite(v) ? v.toFixed(d) : '—');

function segWire(id, fn) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.v) return;
    fn(b.dataset.v);
  });
}
function segSet(id, v) {
  for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === String(v)));
}

// ---- 見つけてみよう ----
const QUESTS = [
  { id: 'one', t: 'トゲを<b>1本だけ</b>立てる', tip: '磁石を少しずつ遠ざけてみよう' },
  { id: 'many', t: 'トゲを<b>30本以上</b>立てる', tip: '大きい磁石を、皿にくっつけて' },
  { id: 'tilt', t: '磁石を皿の<b>ふち</b>へ動かして、トゲが傾くのを見る', tip: '横から見てみよう' },
  { id: 'onset', t: 'コイルで、トゲが<b>立ちはじめる強さ</b>を 0.1 mT まで見つける', tip: '0.1 mT ずつ上げて、少し待つ（境目の近くでは育つのがおそい）' },
  { id: 'hyst', t: 'トゲが立ったあと、<b>境目より弱くしても残る</b>ところを見つける', tip: 'トゲが立ったら 0.1 mT ずつ下げる' },
  { id: 'water', t: '<b>水</b>に強い磁石を近づけると？', tip: '液を「水」にして、大きい磁石を 3 mm に' },
];
const questDone = {};
function buildQuests() {
  $('quests').innerHTML = QUESTS.map(q => `<li id="q-${q.id}"><span class="mk"></span><span>${q.t}<small>${q.tip}</small></span></li>`).join('');
}
function completeQuest(id, msg) {
  if (questDone[id]) return;
  questDone[id] = msg;
  const li = $('q-' + id); li.classList.add('done'); li.querySelector('small').innerHTML = msg;
  toast(msg);
}
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.innerHTML = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 5200);
}
function checkQuests(st) {
  const f = FLUIDS[S.fluid];
  if (S.src === 'coil') {
    const Bc = bcUsed(f) * 1000;
    if (f.magnetic && st.count >= 5 && S.coilB <= Bc + 0.35 && S.coilB >= Bc - 0.3 && !S.coilWasSpiky)
      completeQuest('onset', `${S.coilB.toFixed(1)} mT でトゲが立った（研究では ${Bc.toFixed(2)} mT）`);
    if (f.magnetic && st.count >= 5 && S.coilB < Bc - 0.04)
      completeQuest('hyst', `境目（${Bc.toFixed(2)} mT）より弱い ${S.coilB.toFixed(1)} mT でもトゲが残った。立ったトゲは自分で磁力線を集めて、自分を支えている`);
  } else if (f.magnetic) {
    if (st.count === 1) completeQuest('one', `磁石まで ${S.gap} mm でトゲが1本。境目をぎりぎり超えた所だけにトゲが立つ`);
    if (st.count >= 30) completeQuest('many', `トゲが ${st.count} 本。どれも約 ${lambdaC(f).toFixed(0)} mm おきに六角形に並ぶ`);
    if (st.tilt > 25 && Math.hypot(S.mag.x, S.mag.y) > 28) completeQuest('tilt', `トゲは磁力線の向きに傾く。磁石の真上から離れると、磁力線がななめになるから`);
  } else if (S.fluid === 'water' && st.Bmax > 0.2) {
    completeQuest('water', `水はほとんど反応しない。それどころか、わずかに押しのけられて <b>${(st.dent * 1000).toFixed(0)} μm</b> へこむ（反磁性。目には見えない）`);
  }
}

// ---- 読み取り ----
function updateReadout(st) {
  const f = FLUIDS[S.fluid], Bc = bcUsed(f) * 1000;
  $('roVal').textContent = st.count;
  let tag = '', verdict = '';
  if (!f.magnetic) { tag = '反応しない'; verdict = '水は磁石にほとんど反応しません。'; }
  else if (st.count > 0) { tag = 'トゲが立っている'; verdict = `いちばん強い所の磁場は、境目の <b>${(st.Bmax * 1000 / Bc).toFixed(2)} 倍</b>。`; }
  else if (st.Bmax * 1000 > Bc) { tag = 'もうすぐ'; verdict = '境目を超えた所がある。トゲが育つのを待とう。'; }
  else { tag = 'たいら'; verdict = `磁場が境目（${Bc.toFixed(1)} mT）に届いていない。`; }
  $('roTag').textContent = tag;
  $('roTag').style.color = st.count > 0 ? 'var(--accent)' : 'var(--muted)';
  $('roVerdict').innerHTML = verdict;
  const rows = [
    ['いちばん強い所の磁場', `${fmt(st.Bmax * 1000, 1)} mT`],
    ['トゲが立つ境目', f.magnetic ? `${Bc.toFixed(2)} mT <small>${f.estimated ? '推定' : '研究の実測'}</small>` : '—'],
    ['トゲの高さ', st.count > 0 ? `${fmt(st.spikeH, 1)} mm` : '—'],
    ['トゲの間隔', f.magnetic ? `${lambdaC(f).toFixed(2)} mm <small>重さと表面張力で決まる</small>` : '—'],
    ['液の山の高さ', `${fmt(st.mound, 1)} mm <small>たいらなら ${S.depth} mm</small>`],
  ];
  $('roGrid').innerHTML = rows.map(r => `<span>${r[0]}</span><b>${r[1]}</b>`).join('');
}
function probeText(p) {
  if (!p) { $('probe').innerHTML = ''; return; }
  const f = FLUIDS[S.fluid], Bc = bcUsed(f);
  const k = probeCell(p.x, p.y);
  if (k < 0) { $('probe').innerHTML = ''; return; }
  const B = Math.hypot(F.Bx[k], F.By[k], F.Bz[k]);
  $('probe').innerHTML = `この場所: 磁場 <b>${(B * 1000).toFixed(1)} mT</b>` +
    (f.magnetic ? `（境目の <b>${(B / Bc).toFixed(2)}</b> 倍）` : '') + `・液の深さ <b>${F.h0[k].toFixed(1)} mm</b>`;
}

// ---- コイルのグラフ ----
function drawChart() {
  const c = $('chart'), g = c.getContext('2d'), W = c.width, H = c.height, f = FLUIDS[S.fluid];
  const css = getComputedStyle(document.documentElement);
  g.clearRect(0, 0, W, H);
  if (!f.magnetic) { g.fillStyle = css.getPropertyValue('--dim'); g.font = '12px sans-serif'; g.fillText('水ではトゲは立ちません', 16, 24); return; }
  const Bc = bcUsed(f) * 1000, x0 = Math.floor((Bc - 0.8) * 2) / 2, x1 = x0 + 2.5, y1 = 4;   // 境目のまわり 2.5 mT（ヒステリシスが見える幅）
  const L = 34, R = 10, T = 10, B = 26;
  const X = b => L + (b - x0) / (x1 - x0) * (W - L - R), Y = h => H - B - h / y1 * (H - T - B);
  g.strokeStyle = 'rgba(160,220,215,.14)'; g.lineWidth = 1; g.fillStyle = css.getPropertyValue('--dim'); g.font = '10.5px "IBM Plex Mono",monospace';
  for (let b = x0; b <= x1 + 1e-6; b += 0.5) { g.beginPath(); g.moveTo(X(b), T); g.lineTo(X(b), H - B); g.stroke(); g.fillText(b.toFixed(1), X(b) - 11, H - B + 13); }
  for (let h = 0; h <= y1; h += 1) { g.beginPath(); g.moveTo(L, Y(h)); g.lineTo(W - R, Y(h)); g.stroke(); g.fillText(h, L - 14, Y(h) + 4); }
  g.fillText('mT', W - R - 16, H - 4); g.fillText('mm', 4, T + 8);
  const acc = css.getPropertyValue('--accent');
  // たいら（境目まで安定、その先は不安定）
  g.strokeStyle = acc; g.lineWidth = 2;
  g.beginPath(); g.moveTo(X(x0), Y(0)); g.lineTo(X(Bc), Y(0)); g.stroke();
  g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(Bc), Y(0)); g.lineTo(X(x1), Y(0)); g.stroke();
  // 下の枝（不安定）
  g.beginPath(); let first = true;
  for (let b = Bc * Math.sqrt(1 + EPS_SUB); b <= Bc; b += 0.005) {
    const h = ampPhysLow((b * b - Bc * Bc) / (Bc * Bc), f); if (!isFinite(h)) continue;
    if (first) { g.moveTo(X(b), Y(h)); first = false; } else g.lineTo(X(b), Y(h));
  }
  g.stroke(); g.setLineDash([]);
  // 上の枝（トゲが立っている）
  g.beginPath(); first = true;
  for (let b = Bc * Math.sqrt(1 + EPS_SUB); b <= x1; b += 0.004) {
    const h = ampPhys((b * b - Bc * Bc) / (Bc * Bc), f);
    if (first) { g.moveTo(X(b), Y(h)); first = false; } else g.lineTo(X(b), Y(Math.min(h, y1)));
  }
  g.stroke();
  // あなたの道のり
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  g.fillStyle = 'rgba(255,255,255,.35)';
  for (const p of S.path) { g.beginPath(); g.arc(cl(X(p[0]), L, W - R), cl(Y(p[1]), T, H - B), 2, 0, 7); g.fill(); }
  const last = S.path[S.path.length - 1];
  if (last) { g.fillStyle = '#fff'; g.beginPath(); g.arc(cl(X(last[0]), L, W - R), cl(Y(last[1]), T, H - B), 4.5, 0, 7); g.fill(); }
}

// ---- 説明の一言 ----
function updateHint() {
  const f = FLUIDS[S.fluid];
  let h;
  if (S.src === 'coil') h = '下の<b>コイル</b>が、皿のどこでも同じ強さの縦の磁場を作ります。パネルの −0.1・+0.1 で少しずつ変えて、トゲが立つ瞬間と、消える瞬間を探してみよう。境目のすぐ近くでは、トゲが育つのにとても時間がかかります（<b>早送り</b>も使える）。';
  else if (S.tool === 'poke') h = '皿の上を<b>押す</b>と、そこの液を指でつつきます。トゲがくずれても、磁場が強ければまた立ち上がります。';
  else h = '皿の上を<b>ドラッグ</b>すると、下の磁石が動きます（皿の外をドラッグで見る向きを回す、ホイールで寄る）。磁石の真上に液が集まって山になり、磁場が境目を超えた所にだけトゲが立ちます。';
  if (!f.magnetic) h = '<b>水</b>は磁石にほとんど反応しません。くらべるために置いています。';
  $('hint').innerHTML = h;
}

function syncUI() {
  segSet('segSrc', S.src); segSet('segGap', S.gap); segSet('segFluid', S.fluid); segSet('segDepth', S.depth); segSet('segTool', S.tool);
  $('gapBox').hidden = S.src === 'coil'; $('coilBox').hidden = S.src !== 'coil';
  $('srcCap').textContent = S.src === 'coil'
    ? 'コイル（電磁石）は、流す電流で磁場の強さを細かく変えられます。研究ではこの方法でトゲの立ち方を測りました。'
    : `${MAGNETS[S.src].size}。赤い面が N 極。`;
  const f = FLUIDS[S.fluid];
  $('fluidCap').textContent = f.sub + '。' + (f.magnetic ? `密度 ${f.rho} kg/m³・表面張力 ${(f.sigma * 1000).toFixed(1)} mN/m・はじめの磁化率 ${f.chi0}・飽和磁化 ${(f.Ms / 1000).toFixed(1)} kA/m` : '磁化率 −0.000009（わずかに磁石を避ける反磁性）');
  $('coilVal').textContent = S.coilB.toFixed(1) + ' mT';
  $('coilB').value = S.coilB;
  $('btnFast').textContent = S.speed > 1 ? '早送り中（×10）' : '早送り ×10';
  $('btnFast').setAttribute('aria-pressed', String(S.speed > 1));
  updateHint();
  drawChart();
}

function buildUI() {
  buildQuests();
  segWire('segSrc', v => setSrc(v));
  segWire('segGap', v => { S.gap = +v; S.shapeDirty = true; syncUI(); });
  segWire('segFluid', v => setFluid(v));
  segWire('segDepth', v => { S.depth = +v; S.shapeDirty = true; syncUI(); });
  segWire('segTool', v => { S.tool = v; syncUI(); });
  segWire('views', v => { setView(v); segSet('views', v); });
  for (const b of document.querySelectorAll('.coilrow button')) b.addEventListener('click', () => setCoil(S.coilB + +b.dataset.d));
  $('coilB').addEventListener('input', e => setCoil(+e.target.value));
  $('btnClearPath').addEventListener('click', () => { S.path.length = 0; drawChart(); });
  $('btnFast').addEventListener('click', () => { S.speed = S.speed > 1 ? 1 : 10; syncUI(); });
  $('hint').addEventListener('click', () => $('hint').classList.toggle('open'));
  wirePointer($('view'));
  syncUI();
}

function setView(v) {
  const o = V.orbit;
  if (v === 'top') { o.ph = 0.02; o.dist = 160; }
  else if (v === 'side') { o.ph = 1.42; o.dist = 160; }
  else { o.ph = 0.92; o.dist = 165; }
}

// ---- 皿の上の操作（ドラッグで磁石・つつく・見る向き）----
function wirePointer(cv) {
  const pts = new Map(); let mode = null, last = null, pinch0 = 0;
  const rel = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r.width, r.height]; };
  const onDish = (p) => p && Math.hypot(p.x, p.y) < DISH.R + 4;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const a = [...pts.values()]; pinch0 = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); mode = 'pinch'; return; }
    const [x, y, w, h] = rel(e), p = pickPlane(x, y, w, h, 0);
    if (onDish(p) && S.tool === 'poke') { mode = 'poke'; doPoke(p); }
    else if (onDish(p) && S.src !== 'coil') { mode = 'mag'; moveMagnet(p); cv.style.cursor = 'grabbing'; }
    else { mode = 'orbit'; cv.style.cursor = 'grabbing'; }
    last = [e.clientX, e.clientY];
  });
  cv.addEventListener('pointermove', e => {
    const [x, y, w, h] = rel(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (mode === 'pinch' && pts.size === 2) {
      const a = [...pts.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
      if (pinch0 > 0) zoomBy(pinch0 / d); pinch0 = d; return;
    }
    const p = pickPlane(x, y, w, h, 0);
    if (mode === 'mag') moveMagnet(p);
    else if (mode === 'poke' && onDish(p)) doPoke(p);
    else if (mode === 'orbit' && last) {
      V.orbit.th -= (e.clientX - last[0]) * 0.006;
      V.orbit.ph = Math.max(0.02, Math.min(1.5, V.orbit.ph - (e.clientY - last[1]) * 0.006));
      segSet('views', '');
    }
    if (mode !== 'orbit') { S.probe = onDish(p) ? p : null; }
    last = [e.clientX, e.clientY];
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size === 0) { mode = null; last = null; cv.style.cursor = ''; S.pokeAt = null; }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { if (!mode) S.probe = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: false });
}
function zoomBy(s) { V.orbit.dist = Math.max(70, Math.min(420, V.orbit.dist * s)); }
function moveMagnet(p) {
  if (!p) return;
  let { x, y } = p; const r = Math.hypot(x, y), rm = 60;
  if (r > rm) { x *= rm / r; y *= rm / r; }
  S.mag.x = x; S.mag.y = y; S.shapeDirty = true;
}
function doPoke(p) { S.pokeAt = p; poke(p.x, p.y, 3.5); }   // 押している間は main の step で押し続ける
