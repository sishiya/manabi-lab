/* ui.js — the stimulus chooser, the timeline, the scalp-wave chart, the station list, quests and sources */

const $ = id => document.getElementById(id);
const FONT = () => getComputedStyle(document.body).fontFamily;
const fmtMs = t => (t < 10 ? t.toFixed(t < 2 ? 2 : 1) : Math.round(t)) + ' ms';

/* ---------- chooser (where the stimulus goes) ---------- */
const CW = 320, CH = 200;
function chooserSpots(sp, stim) {
  if (stim === 'touch') {
    if (sp === 'rat') return [
      { k: 'whisk', side: 'L', x: 112, y: 46, lb: 'ひげ' }, { k: 'whisk', side: 'R', x: 208, y: 46, lb: 'ひげ' },
      { k: 'pawF', side: 'L', x: 120, y: 102, lb: '前足' }, { k: 'pawF', side: 'R', x: 200, y: 102, lb: '前足' },
      { k: 'pawH', side: 'L', x: 124, y: 160, lb: '後ろ足' }, { k: 'pawH', side: 'R', x: 196, y: 160, lb: '後ろ足' }];
    const a = [
      { k: 'face', side: 'L', x: 146, y: 36, lb: 'ほお' }, { k: 'face', side: 'R', x: 174, y: 36, lb: 'ほお' },
      { k: 'hand', side: 'L', x: 88, y: 112, lb: '手首' }, { k: 'hand', side: 'R', x: 232, y: 112, lb: '手首' },
      { k: 'foot', side: 'L', x: 140, y: 184, lb: '足首' }, { k: 'foot', side: 'R', x: 180, y: 184, lb: '足首' }];
    if (sp === 'human') a.push({ k: 'braille', side: 'L', x: 50, y: 136, lb: '点字' }, { k: 'braille', side: 'R', x: 270, y: 136, lb: '点字' });
    return a;
  }
  if (stim === 'pain') return [{ k: 'hand', side: 'L', x: 88, y: 112, lb: '手の甲' }, { k: 'hand', side: 'R', x: 232, y: 112, lb: '手の甲' }];
  if (stim === 'sound') return [{ k: 'ear', side: 'L', x: 70, y: 90, lb: '左耳' }, { k: 'ear', side: 'R', x: 250, y: 90, lb: '右耳' }];
  return [];
}

function drawChooser(cv, sp, stim, where) {
  const dpr = cv.width / CW, ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, CW, CH);
  ctx.font = '12px ' + FONT(); ctx.textAlign = 'center';
  const ink = 'rgba(240,230,235,.85)', faint = 'rgba(240,230,235,.18)';
  if (stim === 'light') {
    ctx.beginPath(); ctx.arc(160, 100, 85, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fill(); ctx.strokeStyle = faint; ctx.stroke();
    ctx.beginPath(); ctx.arc(160, 100, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(160, 12); ctx.lineTo(160, 188); ctx.moveTo(72, 100); ctx.lineTo(248, 100); ctx.stroke();
    ctx.fillStyle = ink; ctx.fillText('左の視野', 38, 22); ctx.fillText('右の視野', 282, 22);
    ctx.fillStyle = 'rgba(240,230,235,.5)'; ctx.fillText('上', 172, 22); ctx.fillText('下', 172, 192);
    ctx.beginPath(); ctx.arc(160, 100, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = 'rgba(240,230,235,.5)'; ctx.fillText('見つめる点', 160, 120);
    if (where.light) {
      const x = 160 + where.light.x * 85, y = 100 - where.light.y * 85;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 14); g.addColorStop(0, '#fff6c8'); g.addColorStop(1, 'rgba(255,230,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if (stim === 'face') {
    ctx.beginPath(); ctx.ellipse(160, 96, 46, 58, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,220,190,.18)'; ctx.fill(); ctx.strokeStyle = ink; ctx.stroke();
    ctx.fillStyle = ink; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(160 + s * 17, 84, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(160, 92); ctx.lineTo(156, 108); ctx.lineTo(163, 108); ctx.stroke();
    ctx.beginPath(); ctx.arc(160, 118, 14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.fillText('クリックで顔の写真を見せる', 160, 188);
    return;
  }
  if (stim === 'click') {
    ctx.fillStyle = ink; ctx.font = '700 30px ' + FONT();
    ctx.fillText('カチッ', 105, 100); ctx.fillText('カチッ', 225, 100);
    ctx.font = '12px ' + FONT(); ctx.fillStyle = 'rgba(240,230,235,.6)';
    ctx.fillText('0.5 秒あけて', 165, 132); ctx.fillText('クリックで2回鳴らす（両耳）', 160, 188);
    return;
  }
  // figure
  ctx.strokeStyle = faint; ctx.lineWidth = 1.4; ctx.fillStyle = 'rgba(255,255,255,.03)';
  if (stim === 'sound') {
    ctx.beginPath(); ctx.arc(160, 90, 52, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(240,230,235,.5)'; ctx.fillText('頭（後ろから見た向き）', 160, 170);
  } else if (sp === 'rat') {
    ctx.beginPath(); ctx.ellipse(160, 108, 34, 78, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(160, 186); ctx.quadraticCurveTo(175, 198, 205, 196); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(160 + s * 14, 44 + k * 3); ctx.lineTo(160 + s * 52, 38 + k * 6); } ctx.stroke(); }
    ctx.fillStyle = 'rgba(240,230,235,.45)'; ctx.fillText('上から見たラット', 262, 190);
  } else {
    ctx.beginPath(); ctx.arc(160, 36, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(132, 62); ctx.lineTo(188, 62); ctx.lineTo(180, 140); ctx.lineTo(140, 140); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(132, 64); ctx.lineTo(80, 120); ctx.lineTo(56, 134); ctx.moveTo(188, 64); ctx.lineTo(240, 120); ctx.lineTo(264, 134);
    ctx.moveTo(148, 140); ctx.lineTo(140, 186); ctx.moveTo(172, 140); ctx.lineTo(180, 186); ctx.stroke();
    ctx.fillStyle = 'rgba(240,230,235,.45)'; ctx.fillText('後ろから見た体', 268, 190);
  }
  for (const s of chooserSpots(sp, stim)) {
    const sel = where.spot && where.spot.k === s.k && where.spot.side === s.side;
    ctx.beginPath(); ctx.arc(s.x, s.y, sel ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = sel ? '#ffd27a' : 'rgba(255,210,122,.35)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,122,.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = ink; ctx.font = '11px ' + FONT();
    const lx = s.x + (s.x < 160 ? -4 : s.x > 160 ? 4 : 0);
    ctx.textAlign = s.x < 150 ? 'right' : s.x > 170 ? 'left' : 'center';
    ctx.fillText(s.lb, s.textAlign ? lx : (s.x < 150 ? s.x - 12 : s.x > 170 ? s.x + 12 : s.x), s.y - 12);
    ctx.textAlign = 'center';
  }
}

function chooserHit(sp, stim, px, py) {
  if (stim === 'light') {
    let x = (px - 160) / 85, y = -(py - 100) / 85;
    const r = Math.hypot(x, y); if (r > 1.15) return null;
    if (r > 1) { x /= r; y /= r; }
    if (Math.abs(x) < 0.03) x = x < 0 ? -0.03 : 0.03;          // never exactly on the vertical meridian
    return { light: { x, y } };
  }
  if (stim === 'face' || stim === 'click') return { go: true };
  let best = null, bd = 26;
  for (const s of chooserSpots(sp, stim)) { const d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = s; } }
  return best ? { spot: best } : null;
}

/* ---------- timeline ---------- */
const TL = { lab: 228, right: 984, top: 26, row: 19 };
/* rows: a station that exists on both sides (ids ending in L/R) shares one row */
function timelineRows(T) {
  const rows = [], byKey = {};
  for (const s of T.stations) {
    if (!s.label) continue;
    const base = /[LR]$/.test(s.id) ? s.id.slice(0, -1) : null;
    const key = base && T.stations.some(x => x !== s && x.id === base + other(s.id.slice(-1))) ? base : s.id;
    if (!byKey[key]) { byKey[key] = { key, members: [] }; rows.push(byKey[key]); }
    byKey[key].members.push(s);
  }
  return rows;
}
function timelineHeight(T) { return TL.top + Math.max(3, timelineRows(T).length) * TL.row + 12; }
const TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

function drawTimeline(cv, T, base, p, hoverId) {
  const W = cv.clientWidth || 1000, H = cv.clientHeight || 200, ctx = cv.getContext('2d'), dpr = cv.width / W;
  TL.lab = Math.round(Math.min(228, Math.max(112, W * 0.3))); TL.right = W - 14;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.font = '12px ' + FONT();
  const X = t => TL.lab + tAxis(t, T.tmax) * (TL.right - TL.lab);
  // ticks
  ctx.textAlign = 'center';
  let lastX = -99;
  for (const t of TICKS) {
    if (t > T.tmax) break;
    const x = X(t); if (x - lastX < 26) continue; lastX = x;
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(x, TL.top - 6); ctx.lineTo(x, H - 6); ctx.stroke();
    ctx.fillStyle = 'rgba(240,230,235,.5)'; ctx.fillText(t, x, 14);
  }
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(240,230,235,.5)'; ctx.fillText('刺激から（ms）', 8, 14);
  const rows = timelineRows(T);
  if (!rows.length) {
    ctx.fillStyle = 'rgba(240,230,235,.6)'; ctx.fillText(T.missing || '反応はありません', TL.lab, TL.top + 22);
  }
  const baseById = {}; if (base) for (const s of base.stations) baseById[s.id] = s;
  rows.forEach((row, i) => {
    const y = TL.top + i * TL.row, cy = y + TL.row / 2, s0 = row.members[0];
    const a = row.members.some(s => activation(s, p, T.tmax));
    if (row.key === hoverId) { ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, y, W, TL.row); }
    ctx.fillStyle = a ? '#fff1dc' : 'rgba(240,230,235,.6)';
    const sideTxt = s0.way ? '' : row.members.length > 1 ? '左右 ' : (s0.side === 'L' ? '左 ' : '右 ');
    let lb = sideTxt + s0.label; while (ctx.measureText(lb).width > TL.lab - 14 && lb.length > 4) lb = lb.slice(0, -2) + '…';
    ctx.fillText(lb, 8, cy + 4);
    // the stronger side first, solid; the other one fainter
    const mem = row.members.slice().sort((m, n) => Math.abs(n.gain) - Math.abs(m.gain));
    mem.forEach((s, j) => drawTrace(ctx, s, y, cy, X, T, baseById, j > 0 && Math.abs(s.t - mem[0].t) < 0.01));
  });
  // playhead
  const px = TL.lab + p * (TL.right - TL.lab);
  ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, TL.top - 8); ctx.lineTo(px, H - 4); ctx.stroke();
  ctx.lineWidth = 1;
}
function drawTrace(ctx, s, y, cy, X, T, baseById, quiet) {
    const col = s.gain < 0 ? '120,175,255' : s.cond ? '255,130,200' : '255,195,100';
    // baseline ghost
    const b = baseById[s.id];
    if (b && Math.abs(b.t - s.t) > 0.01) {
      ctx.strokeStyle = 'rgba(240,230,235,.55)'; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(X(b.t), y + 3); ctx.lineTo(X(b.t), y + TL.row - 3); ctx.stroke(); ctx.setLineDash([]);
    }
    if (s.ev === 'range') {
      ctx.fillStyle = `rgba(${col},.28)`; ctx.fillRect(X(s.t1), y + 5, Math.max(3, X(s.t2) - X(s.t1)), TL.row - 10);
    }
    // activation trace
    ctx.beginPath();
    const x0 = X(s.t);
    for (let x = x0; x <= TL.right; x += 3) {
      const pp = (x - TL.lab) / (TL.right - TL.lab);
      const v = Math.abs(activation(s, pp, T.tmax));
      const yy = y + TL.row - 3 - Math.min(1, v) * (TL.row - 6);
      x === x0 ? ctx.moveTo(x, y + TL.row - 3) : ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = `rgba(${col},${(s.ev === 'place' ? .35 : s.ev === 'order' ? .55 : .9) * (quiet ? .5 : 1)})`;
    ctx.setLineDash(s.ev === 'place' ? [3, 3] : s.ev === 'order' ? [6, 3] : []); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    if (quiet) return;
    // onset mark
    ctx.fillStyle = `rgba(${col},${s.ev === 'measured' || s.ev === 'range' ? 1 : .5})`;
    if (s.ev === 'measured') { ctx.fillRect(x0 - 1.5, y + 3, 3, TL.row - 6); }
    else if (s.ev === 'place') { ctx.fillText('?', x0 - 3, cy + 4); }
    else if (s.ev === 'order') { ctx.fillText('~', x0 - 4, cy + 4); }
    if (s.ev === 'measured' || s.ev === 'range') {
      ctx.fillStyle = 'rgba(240,230,235,.7)'; ctx.font = '11px ' + FONT();
      const txt = s.ev === 'range' ? `${fmtNum(s.t1)}〜${fmtNum(s.t2)}` : fmtNum(s.t);
      const tx = (s.ev === 'range' ? X(s.t2) : x0) + 5;
      if (tx < TL.right - 30) ctx.fillText(txt, tx, y + 10);
      ctx.font = '12px ' + FONT();
    }
}
const fmtNum = t => (t < 10 ? (Math.round(t * 100) / 100).toString() : Math.round(t).toString());

/* ---------- scalp wave ---------- */
function drawWave(cv, T, base, p) {
  const W = cv.clientWidth || 320, H = cv.clientHeight || 160, ctx = cv.getContext('2d'), dpr = cv.width / W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.font = '12px ' + FONT();
  const L = 16, Rr = W - 12, mid = H / 2 - 2, A = H * 0.3;
  const X = pp => L + pp * (Rr - L);
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(L, mid); ctx.lineTo(Rr, mid); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(240,230,235,.45)'; let lastX = -99;
  for (const t of TICKS) { if (t > T.tmax) break; const x = X(tAxis(t, T.tmax)); if (x - lastX < 22) continue; lastX = x; ctx.fillText(t, x, H - 4); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, H - 18); ctx.stroke(); }
  ctx.textAlign = 'left'; ctx.fillText('＋', 2, 24); ctx.fillText('−', 3, H - 22); ctx.textAlign = 'right'; ctx.fillText('ms', W - 2, H - 4);
  if (!T.peaks.length) {
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(240,230,235,.7)';
    wrapText(ctx, T.noScalp || T.missing || '頭の表面の波は、このデータにはありません。', 24, 40, W - 48, 18);
    return;
  }
  const curve = (peaks, col, lw, dash, upto) => {
    ctx.beginPath();
    for (let x = L; x <= Rr; x += 1.5) {
      const pp = (x - L) / (Rr - L); if (upto != null && pp > upto) break;
      const y = mid - waveAt(peaks, pp, T.tmax) * A;
      x === L ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  };
  if (base && base.peaks.length) curve(base.peaks, 'rgba(240,230,235,.4)', 1.4, [4, 3]);
  curve(T.peaks, 'rgba(255,210,122,.25)', 1.4);
  curve(T.peaks, base ? '#ff9ed2' : '#ffd27a', 2.2, null, p);
  ctx.textAlign = 'center'; ctx.font = '700 12px ' + FONT();
  for (const k of T.peaks) {
    const x = X(tAxis(k.t, T.tmax)), y = mid - k.amp * A;
    ctx.fillStyle = 'rgba(255,240,225,.9)'; ctx.fillText(k.name, x, k.amp >= 0 ? y - 8 : y + 18);
  }
  ctx.lineWidth = 1;
  const px = X(p); ctx.strokeStyle = 'rgba(255,210,122,.6)'; ctx.beginPath(); ctx.moveTo(px, 16); ctx.lineTo(px, H - 18); ctx.stroke();
}
function wrapText(ctx, txt, x, y, w, lh) {
  let line = '';
  for (const ch of txt) {
    if (ctx.measureText(line + ch).width > w) { ctx.fillText(line, x, y); y += lh; line = ch; } else line += ch;
  }
  ctx.fillText(line, x, y);
}

/* ---------- station list ---------- */
function srcLinks(keys) {
  return keys.map(k => SRC[k]).filter(Boolean).map(s => s.u ? `<a href="${s.u}" target="_blank" rel="noopener">${s.a}</a>` : s.a).join('・');
}
function timeText(s) {
  if (s.ev === 'range') return `${fmtNum(s.t1)}〜${fmtNum(s.t2)} ms`;
  if (s.ev === 'measured') return fmtMs(s.t);
  if (s.ev === 'order') return `およそ ${fmtNum(s.t)} ms`;
  return '時刻データなし';
}
function buildList(el, T, p) {
  if (!T.stations.length) { el.innerHTML = `<li class="empty">${T.missing || '反応はありません。'}</li>`; return; }
  el.innerHTML = timelineRows(T).map(row => {
    const s = row.members[0], e = EV[s.ev], two = row.members.length > 1;
    const differ = two && row.members.some(m => Math.abs(m.t - s.t) > 0.01);
    const tt = differ ? row.members.map(m => `${sideName(m.side)} ${timeText(m)}`).join(' / ') : timeText(s);
    const where = s.way ? '' : two ? '左右の脳・' : (s.side === 'L' ? '左の脳・' : '右の脳・');
    return `<li data-id="${row.key}"><div class="st-top"><span class="st-t">${tt}</span><span class="ev ${e.cls}" title="${e.desc}">${e.tag}</span></div>
      <div class="st-name">${where}${s.label}${s.gain < 0 ? '（下がる）' : ''}</div>
      <div class="st-note">${s.note || ''}<span class="st-src">${srcLinks(s.src || [])}</span></div></li>`;
  }).join('');
}
function syncList(el, T, p) {
  const rows = timelineRows(T);
  for (const li of el.children) {
    const row = rows.find(r => r.key === li.dataset.id); if (!row) continue;
    li.classList.toggle('on', row.members.some(s => Math.abs(activation(s, p, T.tmax)) > 0.05));
  }
}

/* ---------- quests ---------- */
const QUESTS = [
  { id: 'cross', t: '左の視野に光を出して、右の脳だけが光るのを見る' },
  { id: 'ecc', t: '視野の中心と端に光を出して、V1 の光る場所が前後に動くのを見る' },
  { id: 'handfoot', t: '手首と足首を触って、体の地図の場所と時刻（N20 と P40）を比べる' },
  { id: 'abr', t: '音が耳から中脳（下丘）まで 6 ms たらずで届くのを見る' },
  { id: 'pitch', t: '低い音と高い音で、聴覚野の光る場所を比べる（ヒトは高い音で2つに分かれる）' },
  { id: 'whisk', t: 'ラットのひげを触って、8 ms で大脳の「たる」に届くのを見る' },
  { id: 'monkey', t: 'サルに光を見せて、V1 と V4 の時刻のちがいを見る' },
  { id: 'pain2', t: '熱い痛みが2回（0.3 秒ごろと 1 秒ごろ）届くのを見る' },
  { id: 'cond', t: '病気・特性を1つ選んで、典型（点線）と比べる' }
];
function buildQuests(el, done) {
  el.innerHTML = QUESTS.map(q => `<li class="${done[q.id] ? 'done' : ''}"><span class="qk">${done[q.id] ? '✓' : ''}</span>${q.t}</li>`).join('');
}

/* ---------- sources ---------- */
function buildSources(el) {
  el.innerHTML = Object.values(SRC).map(s => `<li>${s.u ? `<a href="${s.u}" target="_blank" rel="noopener">${s.a}</a>` : s.a}「${s.t}」</li>`).join('');
}
