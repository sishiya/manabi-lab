// draw.js — 絵: 走るようす drawScene()、生きもの drawCreature()、世代の一覧 drawGrid()、グラフ drawProgress() drawSpecies()、遺伝子 drawGenome()
'use strict';

// 種の色: 決まった順の8色（dataviz の暗い背景用）。枠のない種は灰色の「その他」
const SLOT_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const OTHER_COLOR = '#7d8288';
const SLOTS = new Map();   // 種の key → 色の番号（その種がいなくなるまで同じ色）

// 世代ごとに、多い種から順に空いている色を割りあてる（いなくなった種の色は空ける）
function assignSlots(species) {
  for (const k of [...SLOTS.keys()]) if (!species[k]) SLOTS.delete(k);
  const used = new Set(SLOTS.values());
  const keys = Object.keys(species).sort((a, b) => species[b] - species[a]);
  for (const k of keys) {
    if (SLOTS.has(k) || species[k] < 2) continue;
    const free = SLOT_COLORS.findIndex((_, i) => !used.has(i));
    if (free < 0) break;
    SLOTS.set(k, free); used.add(free);
  }
}
const spColor = key => SLOTS.has(key) ? SLOT_COLORS[SLOTS.get(key)] : OTHER_COLOR;

const QCOL = { best: '#9ec5f4', med: '#3987e5', low: '#256abf' };   // いちばん・まんなか・下から1割（青の濃さ）
const INK = '#e8f0f4', MUTED = '#a4b6c0', DIM = '#6f8794', GRID = 'rgba(170,205,225,.12)';
const MONO = "'IBM Plex Mono',ui-monospace,Consolas,monospace";
const SANS = "'Zen Kaku Gothic New','Hiragino Sans','Yu Gothic',sans-serif";

function fitCanvas(c) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), r = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map(x => parseInt(x, 16)), pb = b.match(/\w\w/g).map(x => parseInt(x, 16));
  return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')';
}

function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// 生きもの1匹。pts = [[x,y],…]（画面の座標）、contract = 筋肉ごとの縮み（0/1）、s = 1m の画素数
function drawCreature(ctx, g, pts, contract, s, color) {
  const h = hull(pts);
  if (h.length >= 3) {
    ctx.beginPath(); h.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.fillStyle = color + '22'; ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.012); ctx.strokeStyle = color + '44'; ctx.stroke();
  }
  ctx.lineCap = 'round';
  g.muscles.forEach((m, j) => {
    const a = pts[m.a], b = pts[m.b], on = contract ? contract[j] : 0;
    const wdt = Math.max(1.2, s * (0.045 + 0.02 * (m.k - G.K_MIN) / (G.K_MAX - G.K_MIN)) * (on ? 1.15 : 1));   // 当たり判定の太さ 6cm 前後
    ctx.strokeStyle = on ? mix(color.slice(1), 'ffffff', 0.45) : mix(color.slice(1), '0b1219', 0.35);
    ctx.lineWidth = wdt;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  });
  const r = Math.max(2, s * BODY.R);
  g.nodes.forEach((n, i) => {
    const t = (n.f - G.FRIC_MIN) / (G.FRIC_MAX - G.FRIC_MIN);   // すべりやすい足は明るく、すべりにくい足は暗く
    ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], r, 0, Math.PI * 2);
    ctx.fillStyle = mix('ece8dc', '2a2520', t); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.22); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
  });
}

// 環境ごとの空と地面の色
const LOOK = {
  flat:  { sky: ['#1d2a36', '#43586a'], ground: '#3a3027', top: '#5b4a39', line: 'rgba(255,240,220,.35)' },
  slope: { sky: ['#1d2a36', '#43586a'], ground: '#33302a', top: '#5a5444', line: 'rgba(255,240,220,.35)' },
  ice:   { sky: ['#22313d', '#5d7b8e'], ground: '#8fb3c7', top: '#d7ebf5', line: 'rgba(20,40,60,.45)' },
  moon:  { sky: ['#020305', '#0b0d12'], ground: '#4b4b48', top: '#8a8984', line: 'rgba(255,255,255,.3)' },
  water: { sky: ['#06202f', '#0d4a64'], ground: '#3d3b30', top: '#6b6450', line: 'rgba(220,240,255,.3)' },
};
function hash01(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// 走るようす。V = { sim, env, cam（カメラの x）, trail, label, best（この世代の1位の距離）}
function drawScene(ctx, w, h, V) {
  const env = V.env, LK = LOOK[env.key], S = V.sim;
  const s = Math.min(h / 3.4, w / 5.5);                    // 1m の画素数
  const gy = env.water ? h * 0.86 : h * 0.74;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, LK.sky[0]); sky.addColorStop(1, LK.sky[1]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  if (env.key === 'moon') {                                // 星（動かない、暗め）
    for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.5 * hash01(i + 9)})`; ctx.fillRect(hash01(i) * w, hash01(i + 300) * gy * 0.9, 1.2, 1.2); }
  }
  const th = env.slope * Math.PI / 180;
  ctx.save();
  ctx.translate(w / 2, gy); ctx.rotate(-th); ctx.translate(0, (V.camY || 0) * s);
  const X = x => (x - V.cam) * s, Y = y => -y * s;
  if (env.water) {                                         // マリンスノー（水といっしょに止まっている粒。体が進むと流れて見える）
    const x0 = Math.floor(V.cam - 6), x1 = Math.ceil(V.cam + 6);
    const r0 = Math.max(0, Math.floor((V.camY || 0) - 1)), r1 = r0 + 5;
    for (let c = x0; c <= x1; c++) for (let rw = r0; rw <= r1; rw++) for (let k = 0; k < 2; k++) {
      const id = c * 131 + rw * 7 + k, px = c + hash01(id), py = rw + hash01(id + 77);
      ctx.fillStyle = `rgba(210,230,240,${0.12 + 0.25 * hash01(id + 5)})`;
      ctx.beginPath(); ctx.arc(X(px), Y(py), 0.8 + 1.4 * hash01(id + 3), 0, Math.PI * 2); ctx.fill();
    }
  }
  // 地面
  const span = (w / s) * 1.5 + 4;
  ctx.fillStyle = LK.ground; ctx.fillRect(X(V.cam - span), 0, span * 2 * s, h * 2);
  ctx.fillStyle = LK.top; ctx.fillRect(X(V.cam - span), 0, span * 2 * s, Math.max(2, s * 0.03));
  // 目盛り（1m ごと、5m ごとに数字）
  ctx.strokeStyle = LK.line; ctx.fillStyle = LK.line; ctx.lineWidth = 1;
  ctx.font = `11px ${MONO}`; ctx.textAlign = 'center';
  for (let m = Math.floor(V.cam - span); m <= V.cam + span; m++) {
    const big = m % 5 === 0;
    ctx.beginPath(); ctx.moveTo(X(m), 0); ctx.lineTo(X(m), big ? 12 : 6); ctx.stroke();
    if (big) ctx.fillText(m + ' m', X(m), 26);
  }
  // スタートの線と、この世代の1位の記録
  const flag = (x, col, txt) => {
    ctx.strokeStyle = col; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), -s * 2.2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.font = `11px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText(txt, X(x) + 4, -s * 2.2 + 10);
  };
  flag(S.x0, 'rgba(255,255,255,.45)', L('スタート', 'start'));
  if (V.best != null && Math.abs(V.best) > 0.05) flag(S.x0 + V.best, 'rgba(255,201,90,.7)', L('この世代の1位 ', 'best this generation ') + V.best.toFixed(1) + 'm');
  // 重心の通り道
  if (V.trail.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5; ctx.beginPath();
    V.trail.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke();
  }
  // 影（陸のとき）
  if (!env.water) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < S.n; i++) { lo = Math.min(lo, S.px[i]); hi = Math.max(hi, S.px[i]); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(X((lo + hi) / 2), 1, (hi - lo) * s / 2 + 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  const pts = []; for (let i = 0; i < S.n; i++) pts.push([X(S.px[i]), Y(S.py[i])]);
  drawCreature(ctx, S.g, pts, S.contract, s, V.color);
  ctx.restore();
  // 右下: 1m のものさし
  ctx.fillStyle = 'rgba(232,240,244,.8)'; ctx.fillRect(w - 16 - s, h - 18, s, 2);
  ctx.font = `11px ${MONO}`; ctx.textAlign = 'right'; ctx.fillText('1 m', w - 16, h - 24);
}

// 世代の一覧: 順位順に並べた小さな絵。返り値は1マスの大きさ（クリックの判定用）
function drawGrid(ctx, w, h, members, sel, hover) {
  ctx.clearRect(0, 0, w, h);
  const N = members.length, cols = Math.max(1, Math.round(Math.sqrt(N * w / h))), rows = Math.ceil(N / cols);
  const cw = w / cols, ch = h / rows;
  members.forEach((m, i) => {
    const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch, key = speciesKey(m.g), col = spColor(key);
    ctx.fillStyle = i === sel ? 'rgba(255,201,90,.16)' : i === hover ? 'rgba(255,255,255,.07)' : (m.kept ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.0)');
    ctx.fillRect(cx + 1, cy + 1, cw - 2, ch - 2);
    if (i === sel) { ctx.strokeStyle = '#ffc95a'; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 1.5, cy + 1.5, cw - 3, ch - 3); }
    // 体を枠に合わせて縮める
    const ns = m.g.nodes; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of ns) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
    const tH = ch > 30 ? 11 : 0, sc = Math.min((cw - 6) / Math.max(0.4, x1 - x0 + 0.12), (ch - 6 - tH) / Math.max(0.4, y1 - y0 + 0.12));
    const ox = cx + cw / 2 - (x0 + x1) / 2 * sc, oy = cy + 3 + (ch - 6 - tH) / 2 + (y0 + y1) / 2 * sc;
    drawCreature(ctx, m.g, ns.map(n => [ox + n.x * sc, oy - n.y * sc]), null, sc, col);
    if (tH) {
      ctx.font = `10px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = i === sel ? INK : MUTED;
      ctx.fillText(m.dist == null ? '…' : m.dist.toFixed(1), cx + cw / 2, cy + ch - 3);
    }
  });
  return { cols, cw, ch };
}

// 進んだ距離のグラフ（いちばん・まんなか・下から1割）。hover = マウスの世代
function drawProgress(ctx, w, h, hist, hover) {
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padR = 64, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB;
  if (!hist.length) return null;
  let lo = 0, hi = 1;
  for (const p of hist) { hi = Math.max(hi, p.best); lo = Math.min(lo, p.low); }
  const step = niceStep((hi - lo) / 4); hi = Math.ceil(hi / step) * step; lo = Math.floor(lo / step) * step;
  const g1 = Math.max(1, hist[hist.length - 1].gen);
  const X = gen => padL + iw * gen / g1, Y = v => padT + ih * (1 - (v - lo) / (hi - lo));
  ctx.font = `10px ${MONO}`; ctx.textAlign = 'right'; ctx.lineWidth = 1;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? 'rgba(170,205,225,.35)' : GRID;
    ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + iw, Y(v)); ctx.stroke();
    ctx.fillStyle = DIM; ctx.fillText(+v.toFixed(1) + '', padL - 4, Y(v) + 3);
  }
  ctx.textAlign = 'center'; ctx.fillStyle = DIM;
  const gs = Math.max(1, Math.round(niceStep(g1 / 5)));
  for (let gq = 0; gq <= g1; gq += gs) ctx.fillText(gq, X(gq), h - 4);
  // 環境を変えた世代に縦の線
  for (let i = 1; i < hist.length; i++) if (hist[i].env !== hist[i - 1].env) {
    ctx.strokeStyle = 'rgba(255,201,90,.4)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(hist[i].gen), padT); ctx.lineTo(X(hist[i].gen), padT + ih); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,201,90,.8)'; ctx.textAlign = 'left'; ctx.fillText(envByKey(hist[i].env).name, X(hist[i].gen) + 3, padT + 9);
  }
  const last = hist[hist.length - 1];
  for (const [k, name] of [['low', L('下から1割', 'low 10%')], ['med', L('まんなか', 'median')], ['best', L('いちばん', 'best')]]) {
    ctx.strokeStyle = QCOL[k]; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    hist.forEach((p, i) => i ? ctx.lineTo(X(p.gen), Y(p[k])) : ctx.moveTo(X(p.gen), Y(p[k]))); ctx.stroke();
    if (hist.length === 1) { ctx.fillStyle = QCOL[k]; ctx.beginPath(); ctx.arc(X(0), Y(last[k]), 4, 0, 7); ctx.fill(); }
  }
  // 右はしに名前（重ならないよう少しずらす）
  const labs = [['best', L('いちばん', 'best')], ['med', L('まんなか', 'median')], ['low', L('下から1割', 'low 10%')]].map(([k, n]) => ({ k, n, y: Y(last[k]) }));
  for (let i = 1; i < labs.length; i++) if (labs[i].y < labs[i - 1].y + 12) labs[i].y = labs[i - 1].y + 12;
  ctx.font = `11px ${SANS}`; ctx.textAlign = 'left';
  for (const l of labs) { ctx.fillStyle = QCOL[l.k]; ctx.fillRect(padL + iw + 5, l.y - 1, 8, 2); ctx.fillStyle = MUTED; ctx.fillText(l.n, padL + iw + 16, l.y + 4); }
  if (hover != null) {
    const p = hist.find(q => q.gen === hover);
    if (p) {
      ctx.strokeStyle = 'rgba(232,240,244,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(p.gen), padT); ctx.lineTo(X(p.gen), padT + ih); ctx.stroke();
      for (const k of ['best', 'med', 'low']) { ctx.fillStyle = QCOL[k]; ctx.strokeStyle = '#0e1820'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(p.gen), Y(p[k]), 4, 0, 7); ctx.fill(); ctx.stroke(); }
    }
  }
  return { padL, iw, g1 };
}
function niceStep(x) {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

// 種の割合の帯グラフ（下から関節の数・筋肉の数の少ない順）
function drawSpecies(ctx, w, h, hist, hover) {
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padR = 64, padT = 4, padB = 4, iw = w - padL - padR, ih = h - padT - padB;
  if (!hist.length) return;
  const keys = [...new Set(hist.flatMap(p => Object.keys(p.species)))].sort((a, b) => { const [an, am] = a.split('-').map(Number), [bn, bm] = b.split('-').map(Number); return an - bn || am - bm; });
  const g1 = Math.max(1, hist[hist.length - 1].gen), X = gen => padL + iw * gen / g1;
  const one = hist.length === 1, base = hist.map(() => 0);
  for (const k of keys) {
    const col = spColor(k);
    ctx.fillStyle = col; ctx.beginPath();
    const top = hist.map((p, i) => base[i] + (p.species[k] || 0) / p.n);
    if (!top.some((v, i) => v > base[i])) continue;
    const pt = (i, v) => [one ? (i ? padL + iw : padL) : X(hist[i].gen), padT + ih * (1 - v)];
    const idx = one ? [0, 1] : hist.map((_, i) => i), get = (arr, i) => arr[one ? 0 : i];
    idx.forEach((i, j) => { const [x, y] = pt(i, get(top, i)); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (let j = idx.length - 1; j >= 0; j--) { const [x, y] = pt(idx[j], get(base, idx[j])); ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#0e1820'; ctx.lineWidth = 1; ctx.stroke();   // 帯のあいだのすきま
    top.forEach((v, i) => base[i] = v);
  }
  ctx.font = `10px ${MONO}`; ctx.fillStyle = DIM; ctx.textAlign = 'right';
  ctx.fillText('100%', padL - 4, padT + 8); ctx.fillText('0', padL - 4, padT + ih);
  // 右はし: いまの世代で多い種の名前
  const last = hist[hist.length - 1], tops = Object.keys(last.species).sort((a, b) => last.species[b] - last.species[a]).slice(0, 3);
  ctx.textAlign = 'left'; ctx.font = `10.5px ${SANS}`;
  tops.forEach((k, i) => { ctx.fillStyle = spColor(k); ctx.fillRect(padL + iw + 5, padT + 6 + i * 14, 8, 8); ctx.fillStyle = MUTED; ctx.fillText(spShort(k), padL + iw + 16, padT + 14 + i * 14); });
  if (hover != null) { ctx.strokeStyle = 'rgba(232,240,244,.5)'; ctx.beginPath(); ctx.moveTo(X(hover), padT); ctx.lineTo(X(hover), padT + ih); ctx.stroke(); }
}
const spName = k => { const [n, m] = k.split('-'); return L(`関節${n}・筋${m}`, `${n} joints, ${m} muscles`); };
const spShort = k => { const [n, m] = k.split('-'); return L(`関節${n}・筋${m}`, `${n}J ${m}M`); };  // グラフの右はしの凡例（英語は J = 関節、M = 筋肉）

// 遺伝子の図: 上に体（番号つき）、下に筋肉ごとの「縮む時間帯」の帯。phase = いまの周期の位置（0〜1）
function drawGenome(ctx, w, h, g, phase, contract, color) {
  ctx.clearRect(0, 0, w, h);
  const bodyH = 92, ns = g.nodes;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const n of ns) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  const sc = Math.min((w - 40) / Math.max(0.4, x1 - x0), (bodyH - 20) / Math.max(0.3, y1 - y0));
  const ox = w / 2 - (x0 + x1) / 2 * sc, oy = bodyH / 2 + (y0 + y1) / 2 * sc;
  const pts = ns.map(n => [ox + n.x * sc, oy - n.y * sc]);
  drawCreature(ctx, g, pts, contract, sc, color);
  ctx.font = `10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  g.muscles.forEach((m, j) => {
    const a = pts[m.a], b = pts[m.b];
    ctx.fillStyle = 'rgba(14,24,32,.85)'; ctx.fillRect((a[0] + b[0]) / 2 - 6, (a[1] + b[1]) / 2 - 6, 12, 12);
    ctx.fillStyle = INK; ctx.fillText(j + 1, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  });
  ctx.textBaseline = 'alphabetic';
  // 時間帯の帯
  const top = bodyH + 16, rowH = Math.min(14, (h - top - 16) / Math.max(1, g.muscles.length)), bx = 34, bw = w - bx - 8;
  ctx.font = `10px ${MONO}`; ctx.fillStyle = DIM; ctx.textAlign = 'left';
  ctx.fillText('0', bx, top - 4); ctx.textAlign = 'right'; ctx.fillText(L('1周 ' + g.period.toFixed(2) + '秒', 'cycle ' + g.period.toFixed(2) + ' s'), bx + bw, top - 4);
  g.muscles.forEach((m, j) => {
    const y = top + j * rowH;
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(bx, y + 2, bw, rowH - 4);
    ctx.fillStyle = color;
    const a = m.on, b = m.on + m.dur;
    ctx.fillRect(bx + bw * a, y + 2, bw * (Math.min(1, b) - a), rowH - 4);
    if (b > 1) ctx.fillRect(bx, y + 2, bw * (b - 1), rowH - 4);
    ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.fillText(j + 1, bx - 6, y + rowH / 2 + 3);
  });
  if (phase != null) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx + bw * phase, top - 2); ctx.lineTo(bx + bw * phase, top + g.muscles.length * rowH); ctx.stroke();
  }
}
