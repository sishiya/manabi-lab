// 雑草がふえるまで — エノコログサ以外の草の形（タンポポ rosette・スベリヒユ mat・カタバミ creep）と、寄ったときのタネ・花
// 形は図鑑・写真に合わせた目安（推定）。株の大きさは計算の重さ W から作る。
'use strict';
const FCOL = { dflower: '#f2c531', bud: '#7fae5a', puff: '#eef2f4', bare: '#9a8a6a', stemR: '#b06a5a', pflower: '#f0d44a', pcap: '#8fbf6a', oflower: '#f3d64e', ocap: '#7fb85a', ripe: '#b7a25e', leaf: '#7cc46a' };

// 子葉（2まい）だけの芽生え
function cotyledons(p, G) {
  const h = Math.max(0.004, Math.min(0.012, p.H)), r = 0.0035;
  G.stems.push({ x0: p.x, y0: 0, cx: p.x, cy: h / 2, x1: p.x, y1: h });
  G.blobs.push({ x: p.x - r * 1.1, y: h + r * 0.2, rx: r, ry: r * 0.55, a: 0.3, c: 'leaf' }, { x: p.x + r * 1.1, y: h + r * 0.2, rx: r, ry: r * 0.55, a: -0.3, c: 'leaf' });
}
// 花・実の並び（batches の古さで、咲いている／閉じた／熟した）
function headStages(p) {
  const out = [];
  for (const b of p.batches) out.push(p.cdH - b.cd < 50 ? 'flower' : 'closed');
  const nr = p.ripe > 0 ? Math.min(5, Math.max(1, Math.round(p.ripe / p.n / (SP.short === 'タンポポ' ? 150 : 40)))) : 0;
  for (let i = 0; i < nr; i++) out.push('ripe');
  if (p.st === 2 && !p.batches.length && !nr) out.push('flower');
  return out.slice(-7);
}

function formGeom(p) {
  const fall = p.st === 3 ? Math.min(1, p.dd / 20) : 0;
  const hs = p.st === 3 && !p.uproot ? [] : headStages(p);
  const key = SP.shape + '|' + p.st + '|' + Math.round(Math.log(p.W) * 6) + '|' + hs.join('') + '|' + Math.round(fall * 10) + '|' + (p.uproot ? 1 : 0);   // 重さは対数で粗く（作りなおしを減らす）
  if (p._gk === key) return p._g;
  const r = mulberry(p.rs), G = { stems: [], leaves: [], pans: [], blobs: [], heads: [], stalks: [] };
  const f = Math.sqrt(Math.min(1, p.W / SP.wmax));
  if (p.st !== 3 && p.cd < 40 && p.W < SP.seedMass * 30) { cotyledons(p, G); p._g = G; p._gk = key; return G; }
  const flat = p.uproot ? 1 : 0;   // 抜いて置いた株は横だおし
  if (SP.shape === 'rosette') {
    const nL = Math.max(3, Math.min(18, 3 + Math.floor(4 * Math.log2(1 + p.W / 0.02)))), L = 0.03 + 0.17 * f;
    for (let i = 0; i < nL; i++) {
      const az = i * 2.39996, side = Math.cos(az), el = 0.12 + 0.35 * r() * (1 - f * 0.5), Li = L * (0.6 + 0.4 * r());
      const ex = p.x + side * Li * Math.cos(el), ey = Math.max(0.002, Li * Math.sin(el) * 0.6);
      G.leaves.push({ x0: p.x, y0: 0.002, cx: p.x + side * Li * 0.5, cy: ey * 1.4 + 0.004, x1: ex, y1: ey, w: SP.leafW * (0.4 + 0.6 * f) * (0.5 + 0.5 * Math.abs(side)) });
    }
    hs.forEach((st, i) => {
      const a = (i - (hs.length - 1) / 2) * 0.35 + (r() - 0.5) * 0.2;
      const sh = (st === 'ripe' ? 0.12 + 0.18 * f : st === 'closed' ? 0.05 + 0.08 * f : 0.05 + 0.1 * f) * (0.8 + 0.4 * r());   // 綿毛になると茎がのびる（推定）
      const tx = p.x + Math.sin(a) * sh, ty = Math.cos(a) * sh;
      G.stalks.push({ x0: p.x, y0: 0, cx: p.x + Math.sin(a) * sh * 0.3, cy: ty * 0.6, x1: tx, y1: ty });
      G.heads.push({ t: st === 'flower' ? 'dflower' : st === 'closed' ? 'dbud' : 'puff', x: tx, y: ty, r: st === 'ripe' ? 0.022 : st === 'flower' ? 0.017 : 0.006, a });
    });
  } else {   // mat（スベリヒユ）・creep（カタバミ）: 地面をはう茎
    const mat = SP.shape === 'mat';
    const k = Math.max(2, Math.min(10, 2 + Math.floor(3 * Math.log2(1 + p.W / 0.05)))), L = (mat ? 0.03 + 0.27 * f : 0.03 + 0.2 * f);
    const tips = [];
    for (let i = 0; i < k; i++) {
      const az = i * 2.39996 + r() * 0.5, side = Math.cos(az), Li = L * (0.6 + 0.4 * r()) * (0.4 + 0.6 * Math.abs(side));
      const ex = p.x + side * Li, ey = mat ? 0.006 + 0.012 * r() : 0.004;
      const st = { x0: p.x, y0: 0.003, cx: p.x + side * Li * 0.5, cy: mat ? 0.018 + 0.01 * r() : 0.006, x1: ex, y1: ey, red: mat };
      G.stems.push(st); tips.push(st);
      const nb = Math.max(2, Math.round(Li / 0.025));
      for (let j = 1; j <= nb; j++) {
        const t = j / (nb + 0.5), q = qpt(st, t);
        if (mat) {   // 肉の厚いへら形の葉（長さ 1.5cm ほど。推定）
          const sd = j % 2 ? 1 : -1, s = 0.0045 + 0.004 * f;
          G.blobs.push({ x: q.x + side * s * 0.6, y: q.y + sd * s * 0.5 + s * 0.4, rx: s, ry: s * 0.5, a: -side * 0.3 + sd * 0.6, c: 'leaf' });
        } else {     // カタバミ: 節から葉の柄が立ち、先にハート形の小葉が3まい
          const hh = 0.02 + (SP.hmax - 0.02) * f * (0.6 + 0.4 * r()), s = 0.004 + 0.003 * f;
          G.stalks.push({ x0: q.x, y0: q.y, cx: q.x + (r() - 0.5) * 0.01, cy: q.y + hh * 0.6, x1: q.x + (r() - 0.5) * 0.01, y1: q.y + hh });
          const cx = G.stalks[G.stalks.length - 1].x1, cy = q.y + hh;
          for (const d of [-1, 0, 1]) G.blobs.push({ x: cx + d * s * 1.1, y: cy + (d ? 0 : s * 0.5), rx: s, ry: s * 0.7, a: d * 0.5, c: 'leaf' });
        }
      }
    }
    hs.forEach((st, i) => {
      const tp = tips[i % tips.length], q = mat ? { x: tp.x1, y: tp.y1 + 0.004 } : null;
      if (mat) G.heads.push({ t: st === 'flower' ? 'pflower' : 'pcap', open: st === 'ripe', x: q.x, y: q.y, r: 0.004, a: 0 });
      else {
        const b = qpt(tp, 0.3 + 0.6 * ((i * 0.37) % 1)), hh = SP.hmax * (0.6 + 0.6 * f) * (st === 'flower' ? 1 : 1.15);
        G.stalks.push({ x0: b.x, y0: b.y, cx: b.x, cy: b.y + hh * 0.6, x1: b.x + (r() - 0.5) * 0.01, y1: b.y + hh });
        const s = G.stalks[G.stalks.length - 1];
        G.heads.push({ t: st === 'flower' ? 'oflower' : 'ocap', ripe: st === 'ripe', x: s.x1, y: s.y1, r: st === 'flower' ? 0.006 : 0.0025, a: 0 });
      }
    });
  }
  if (fall || flat) {   // 枯れた株・抜いて置いた株はつぶれる
    const sq = o => { o.y0 *= 1 - (fall || flat) * 0.8; o.cy *= 1 - (fall || flat) * 0.8; o.y1 *= 1 - (fall || flat) * 0.8; };
    G.stems.forEach(sq); G.leaves.forEach(sq); G.stalks.forEach(sq); for (const b of G.blobs) b.y *= 1 - (fall || flat) * 0.8; for (const h of G.heads) h.y *= 1 - (fall || flat) * 0.8;
  }
  p._g = G; p._gk = key; return G;
}

// ---------- 描く（遠く: まとめて / 近く: 1本ずつ） ----------
function drawFormsBatch(list, colOf, s) {
  // 茎・葉の柄・花の茎
  for (const [key, sel] of [['stems', G => G.stems], ['stalks', G => G.stalks]]) {
    g.lineWidth = Math.max(0.7, (key === 'stems' ? 0.0022 : 0.0012) * s);
    g.strokeStyle = SP.shape === 'mat' && key === 'stems' ? FCOL.stemR : 'rgba(120,170,100,0.95)';
    g.beginPath();
    for (const p of list) for (const c of sel(formGeom(p))) { g.moveTo(X(c.x0), Y(c.y0)); g.quadraticCurveTo(X(c.cx), Y(c.cy), X(c.x1), Y(c.y1)); }
    g.stroke();
  }
  // 葉（タンポポ）
  const wide = SP.leafW * s > 6;
  g.fillStyle = FCOL.leaf; g.strokeStyle = FCOL.leaf;
  if (wide) { g.beginPath(); for (const p of list) for (const l of formGeom(p).leaves) leafShape(l, l.w); g.fill(); }
  else { g.lineWidth = Math.max(0.9, SP.leafW * s * 0.5); g.beginPath(); for (const p of list) for (const l of formGeom(p).leaves) { g.moveTo(X(l.x0), Y(l.y0)); g.quadraticCurveTo(X(l.cx), Y(l.cy), X(l.x1), Y(l.y1)); } g.stroke(); }
  // 小さな葉（だ円）
  g.beginPath();
  for (const p of list) for (const b of formGeom(p).blobs) {
    const rx = b.rx * s, ry = b.ry * s, px = X(b.x), py = Y(b.y);
    if (rx < 2) { const w = Math.max(1, rx * 1.6), h = Math.max(0.8, ry * 1.6); g.rect(px - w / 2, py - h / 2, w, h); continue; }   // 小さい葉は四角で（軽く）
    g.moveTo(px + rx, py); g.ellipse(px, py, rx, ry, b.a, 0, Math.PI * 2);
  }
  g.fill();
  // 花・実: 小さいものは色ごとにまとめて、大きいものは1つずつ
  const groups = new Map();
  for (const p of list) for (const h of formGeom(p).heads) {
    if (Math.max(1.6, h.r * s) > 22) { drawHeadForm(h, p); continue; }
    const c = headColor(h); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(h);
  }
  for (const [c, hs] of groups) {
    if (c === 'puff') { g.strokeStyle = 'rgba(238,242,244,0.85)'; g.fillStyle = 'rgba(238,242,244,0.35)'; g.lineWidth = 1; g.beginPath(); for (const h of hs) { const R = Math.max(1.6, h.r * s); g.moveTo(X(h.x) + R, Y(h.y)); g.arc(X(h.x), Y(h.y), R, 0, Math.PI * 2); } g.fill(); g.stroke(); continue; }
    g.fillStyle = c; g.beginPath();
    for (const h of hs) { const R = Math.max(1.6, h.r * s), px = X(h.x), py = Y(h.y);
      if (h.t === 'ocap') { g.moveTo(px + R, py - R * 2); g.ellipse(px, py - R * 2, Math.max(1, R * 0.8), R * 3, 0, 0, Math.PI * 2); }
      else { g.moveTo(px + R, py); g.arc(px, py, R, 0, Math.PI * 2); } }
    g.fill();
  }
}
function headColor(h) {
  return h.t === 'puff' ? 'puff' : h.t === 'dflower' ? FCOL.dflower : h.t === 'dbud' ? FCOL.bud : h.t === 'pflower' ? FCOL.pflower : h.t === 'oflower' ? FCOL.oflower
    : h.t === 'pcap' ? (h.open ? FCOL.ripe : FCOL.pcap) : h.ripe ? FCOL.ripe : FCOL.ocap;
}
function drawHeadForm(h, p) {
  const s = VIEW.s, px = X(h.x), py = Y(h.y), R = Math.max(1.6, h.r * s);
  if (R > 22) { drawHeadDetail(h, p, px, py, h.r * s); return; }
  if (h.t === 'puff') { g.strokeStyle = 'rgba(238,242,244,0.85)'; g.lineWidth = 1; g.beginPath(); g.arc(px, py, R, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(238,242,244,0.35)'; g.fill(); return; }
  g.fillStyle = h.t === 'dflower' ? FCOL.dflower : h.t === 'dbud' ? FCOL.bud : h.t === 'pflower' ? FCOL.pflower : h.t === 'oflower' ? FCOL.oflower
    : h.t === 'pcap' ? (h.open ? FCOL.ripe : FCOL.pcap) : h.ripe ? FCOL.ripe : FCOL.ocap;
  g.beginPath();
  if (h.t === 'ocap') g.ellipse(px, py - R * 2, Math.max(1, R * 0.8), R * 3, 0, 0, Math.PI * 2);   // 細長いさや（0.6〜2.8cm: UC IPM）
  else g.arc(px, py, R, 0, Math.PI * 2);
  g.fill();
}
// 寄ったときの花・実
function drawHeadDetail(h, p, px, py, R) {
  g.save(); g.translate(px, py);
  let lab = '';
  if (h.t === 'dflower') {   // たくさんの小さな花（舌状花）が集まって1つに見える
    g.strokeStyle = FCOL.dflower; g.lineCap = 'round';
    for (let i = 0; i < 120; i++) { const a = i * 2.39996, rr = R * (0.25 + 0.75 * Math.sqrt((i + 1) / 120)); g.lineWidth = Math.max(1, R * 0.07); g.beginPath(); g.moveTo(Math.cos(a) * rr * 0.4, Math.sin(a) * rr * 0.25); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.6); g.stroke(); }
    lab = 'タンポポの花: 小さな花（1つ1つに実が1つ）がたくさん集まっている';
  } else if (h.t === 'dbud') {
    g.fillStyle = FCOL.bud; g.beginPath(); g.ellipse(0, 0, R * 0.6, R, 0, 0, Math.PI * 2); g.fill();
    lab = '花がおわって閉じ、中で実が熟していく';
  } else if (h.t === 'puff') {   // 綿毛: 実（そう果）から細い柄、その先にパラシュートの毛
    g.strokeStyle = 'rgba(238,242,244,0.85)'; g.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const a = i * 2.39996, z = 1 - 2 * ((i + 0.5) / 90), rr = Math.sqrt(1 - z * z), dx = Math.cos(a) * rr, dy = z;
      const ex = dx * R, ey = dy * R;
      g.beginPath(); g.moveTo(dx * R * 0.15, dy * R * 0.15); g.lineTo(ex * 0.8, ey * 0.8); g.stroke();
      if (R > 60) for (let k = -3; k <= 3; k++) { const aa = Math.atan2(ey, ex) + k * 0.12; g.beginPath(); g.moveTo(ex * 0.8, ey * 0.8); g.lineTo(ex * 0.8 + Math.cos(aa) * R * 0.2, ey * 0.8 + Math.sin(aa) * R * 0.2); g.stroke(); }
      g.fillStyle = '#8a6a4a'; g.beginPath(); g.ellipse(dx * R * 0.12, dy * R * 0.12, Math.max(1, R * 0.02), Math.max(1.5, R * 0.05), Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI * 2); g.fill();
    }
    lab = '綿毛: 1つ1つが実（タネ）とパラシュート。風に乗って飛ぶ';
  } else if (h.t === 'pflower' || h.t === 'oflower') {   // 花びら5まい
    g.fillStyle = FCOL.pflower;
    for (let i = 0; i < 5; i++) { const a = i * 1.2566 - Math.PI / 2; g.beginPath(); g.ellipse(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.45, R * 0.3, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#d8a020'; g.beginPath(); g.arc(0, 0, R * 0.2, 0, Math.PI * 2); g.fill();
    lab = h.t === 'pflower' ? 'スベリヒユの花（花びら5まい）' : 'カタバミの花（花びら5まい）';
  } else if (h.t === 'pcap') {   // ふたが取れる実
    g.fillStyle = FCOL.pcap; g.beginPath(); g.ellipse(0, R * 0.2, R * 0.7, R * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,60,30,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-R * 0.7, 0); g.lineTo(R * 0.7, 0); g.stroke();
    if (h.open) { g.fillStyle = '#20201c'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc((i % 3 - 1) * R * 0.3, R * 0.25 + Math.floor(i / 3) * R * 0.18, R * 0.1, 0, Math.PI * 2); g.fill(); } }
    else { g.fillStyle = '#9fcf7a'; g.beginPath(); g.ellipse(0, -R * 0.25, R * 0.62, R * 0.35, 0, Math.PI, Math.PI * 2); g.fill(); }
    lab = h.open ? '実のふたが取れて、カップの中の黒いタネがこぼれる' : '実（熟すと上のふたが取れる）';
  } else if (h.t === 'ocap') {   // 5本のすじのある細長いさや
    g.fillStyle = h.ripe ? FCOL.ripe : FCOL.ocap; g.beginPath(); g.ellipse(0, -R * 2, R * 0.9, R * 3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,60,30,0.6)'; g.lineWidth = 1; g.beginPath();
    for (const d of [-0.5, 0, 0.5]) { g.moveTo(d * R, -R * 4.6); g.lineTo(d * R, R * 0.6); }
    g.stroke();
    lab = h.ripe ? '熟したさや: さわるとはじけて、タネを 3m 以上とばす（UC IPM）' : 'さや（実）。熟すとはじける';
  }
  g.restore();
  offerLabel(px, py, () => caption(px, Math.min(VIEW.h - 30, py + R * (h.t === 'ocap' ? 1.5 : 1.2) + 18), lab));
}

// ---------- 寄ったときのタネ（土の中） ----------
function drawSeedOther(x, y, a, kind, q) {
  const s = VIEW.s, L = SP.seedLen * s, W = SP.seedWid * s, px = X(x), py = Y(y);
  g.save(); g.translate(px, py); g.rotate(a);
  let parts = [];
  if (SP.shape === 'rosette') {   // タンポポの実（そう果）: 細長く、すじと小さなとげ。先は細い柄（綿毛は取れている）
    g.fillStyle = kind === 'dorm' ? '#7a5a3a' : '#8e6c44'; g.beginPath(); g.ellipse(0, 0, L / 2, W / 2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,25,10,0.6)'; g.lineWidth = 1; g.beginPath();
    for (const d of [-0.25, 0, 0.25]) { g.moveTo(-L * 0.45, d * W); g.lineTo(L * 0.45, d * W); }
    g.moveTo(L / 2, 0); g.lineTo(L * 0.9, 0); g.stroke();
    g.fillStyle = '#efe4c8'; g.beginPath(); g.ellipse(-L * 0.02, 0, L * 0.36, W * 0.3, 0, 0, Math.PI * 2); g.fill();   // 中のタネ（胚）
    g.strokeStyle = '#c8b890'; g.beginPath(); g.moveTo(-L * 0.3, 0); g.lineTo(L * 0.3, 0); g.stroke();
    parts = [[L * 0.2, -W * 0.1, '子葉（2まい。芽が出ると開く）'], [-L * 0.35, 0, '幼根'], [L * 0.7, 0, '柄（ここに綿毛がついていた）'], [0, -W * 0.45, '実の皮（すじと小さなとげ）']];
  } else if (SP.shape === 'mat') {   // スベリヒユ: 黒くつやのある腎臓形、表面に小さなつぶつぶ。中で胚がくるりと曲がる
    g.fillStyle = '#25231f'; g.beginPath(); g.arc(0, 0, L / 2, 0.35, Math.PI * 2 - 0.35); g.closePath(); g.fill();
    if (L > 80) { g.fillStyle = 'rgba(120,120,110,0.5)'; for (let i = 0; i < 60; i++) { const aa = i * 0.105 + 0.4, rr = L * 0.47; g.beginPath(); g.arc(Math.cos(aa) * rr, Math.sin(aa) * rr, L * 0.015, 0, Math.PI * 2); g.fill(); } }
    g.strokeStyle = '#efe4c8'; g.lineWidth = Math.max(1.5, L * 0.12); g.beginPath(); g.arc(0, 0, L * 0.3, 0.6, Math.PI * 2 - 0.6); g.stroke();
    g.fillStyle = '#d8d0b8'; g.beginPath(); g.arc(0, 0, L * 0.16, 0, Math.PI * 2); g.fill();
    parts = [[0, -L * 0.3, '胚（くるりと曲がっている）'], [0, 0, '周乳（芽の弁当）'], [-L * 0.46, -L * 0.1, '種皮（小さなつぶつぶ）']];
  } else {   // カタバミ: 平たい卵形、横のすじ（UC IPM）
    g.fillStyle = kind === 'dorm' ? '#7a4e30' : '#8e5c38'; g.beginPath(); g.ellipse(0, 0, L / 2, W / 2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,20,10,0.6)'; g.lineWidth = 1; g.beginPath();
    for (let i = -4; i <= 4; i++) { const xx = i / 5 * L / 2, hh = W / 2 * Math.sqrt(Math.max(0, 1 - (xx / (L / 2)) ** 2)); g.moveTo(xx, -hh); g.lineTo(xx + L * 0.02, hh); }
    g.stroke();
    g.fillStyle = '#efe4c8'; g.beginPath(); g.ellipse(0, 0, L * 0.3, W * 0.22, 0, 0, Math.PI * 2); g.fill();
    parts = [[L * 0.15, 0, '胚（子葉2まい）'], [0, -W * 0.45, '種皮（横のすじ）']];
  }
  if (kind === 'sprout' && q) {   // 根と、子葉をつけた芽がのびる
    g.strokeStyle = '#f5f0e0'; g.lineWidth = Math.max(1, W * 0.15); g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(-L / 2 - L * 0.4, W * 0.2); g.stroke();
  }
  g.restore();
  const tx = (u, v) => ({ x: px + Math.cos(a) * u - Math.sin(a) * v, y: py + Math.sin(a) * u + Math.cos(a) * v });
  offerLabel(px, py, () => {
    const st = kind === 'dorm' ? '眠っているタネ（休眠）' : kind === 'awake' ? '目ざめたタネ' : '芽を出しているタネ';
    caption(px, py + Math.max(L, W) / 2 + 22, `${st}　${SP.short}・長さ 約${(SP.seedLen * 1000).toFixed(1)}mm`);
    if (L < 150) return;
    parts.forEach(([u, v, t], i) => { const p0 = tx(u, v); tag(p0.x, p0.y, p0.x + (i % 2 ? -1 : 1) * (60 + i * 10), p0.y + (i < 2 ? -50 : 45), t); });
  });
}
