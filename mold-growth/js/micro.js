// View 3: microscope cross-section (side view, about 0.4 mm wide). One spore that landed in the middle, its hyphae on and
// inside the material, the stalks that make spores, the food being digested, the water film. Units: micrometres,
// origin = the spore, y down = into the material.

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const NET_CACHE = {};
const REACH = 215;   // half width of the field (um)
function getNet(place) {
  if (NET_CACHE[place]) return NET_CACHE[place];
  const rnd = mulberry(place.length * 977 + 13), depthMax = 25 + PLACES[place].deep * 120;
  const segs = [], tips = [
    { x: 2, y: -1.5, a: 0.05, len: 0, kind: 's' }, { x: -2, y: -1.5, a: Math.PI - 0.05, len: 0, kind: 's' },
    { x: 0, y: 0, a: Math.PI / 2 + 0.2, len: 8, kind: 'd' }];
  let maxLen = 1;
  while (tips.length && segs.length < 2200) {
    tips.sort((p, q) => p.len - q.len);
    const tp = tips.shift(), step = 5;
    let a = tp.a + (rnd() - 0.5) * 0.4;
    if (tp.kind === 'd') a = clamp(a, 0.25 * Math.PI, 0.75 * Math.PI);
    if (tp.kind === 'a') a = clamp(a, -0.85 * Math.PI, -0.15 * Math.PI);
    let nx = tp.x + Math.cos(a) * step, ny = tp.y + Math.sin(a) * step;
    if (tp.kind === 's') { ny = clamp(ny, -4.5, 1.5); if (Math.abs(Math.sin(a)) > 0.5) a = Math.cos(a) > 0 ? 0.1 : Math.PI - 0.1; }
    if (Math.abs(nx) > REACH + 10) continue;
    if (tp.kind === 'd' && ny > depthMax) continue;
    if (tp.kind === 'a' && ny < -32) continue;
    const len = tp.len + step;
    segs.push({ x1: tp.x, y1: tp.y, x2: nx, y2: ny, len, kind: tp.kind });
    maxLen = Math.max(maxLen, len);
    tips.push({ x: nx, y: ny, a, len, kind: tp.kind });
    const r = rnd();
    if (tp.kind === 's') {
      if (r < 0.07) tips.push({ x: nx, y: ny, a: rnd() < 0.5 ? 0.1 : Math.PI - 0.1, len, kind: 's' });
      else if (r < 0.095) tips.push({ x: nx, y: ny, a: Math.PI / 2 + (rnd() - 0.5) * 0.9, len, kind: 'd' });
      else if (r < 0.125 && len > 60) tips.push({ x: nx, y: ny, a: -Math.PI / 2 + (rnd() - 0.5) * 1.2, len: len + 40, kind: 'a' });
    } else if (tp.kind === 'd' && r < 0.045) tips.push({ x: nx, y: ny, a: Math.PI / 2 + (rnd() - 0.5) * 1.4, len, kind: 'd' });
  }
  // birth: 0..1 by path length (the network spreads outward from the spore)
  const lim = REACH * 1.25;
  segs.forEach(s => { s.b = Math.min(1, s.len / lim) + (s.kind === 'a' ? 0.25 : 0) + (s.kind === 'd' ? 0.08 : 0); s.h = hash(s.len, s.x1); });
  // stalks (conidiophores): nearest to the spore appear first
  const stalks = [];
  for (let j = 0; j < 12; j++) {
    const side = j % 2 ? 1 : -1, x = side * (14 + (j / 11) * 180 + (rnd() - 0.5) * 16);
    stalks.push({ x, m0: 1.7 + j * 0.3, u: rnd(), hh: 0.7 + rnd() * 0.3, lean: (rnd() - 0.5) * 0.25 });
  }
  return (NET_CACHE[place] = { segs, stalks, depthMax });
}
const gOf = m => clamp(m / 2.6, 0, 1.4);   // how far the network has spread for mould index m

// one spore-making stalk; p = 0..1 (stalk grows, head forms, spore chains get longer); style: live / bleach / dark
function stalk(g, X, Y, s, sp, hUm, p, style, lean, clock, released) {
  if (p <= 0) return null;
  const S = SPECIES[sp];
  const pSt = clamp(p / 0.45, 0, 1), pHd = clamp((p - 0.45) / 0.2, 0, 1), pCh = clamp((p - 0.6) / 0.4, 0, 1);
  const h = hUm * s * pSt, tx = X + Math.sin(lean) * h, ty = Y - Math.cos(lean) * h;
  const stCol = style === 'bleach' ? 'rgba(225,228,222,.28)' : style === 'dark' ? 'rgba(120,122,112,.85)' : (S.id === 'clado' ? mixHex(S.col, '#9a9a70', 0.45) : 'rgba(228,236,222,.9)');
  const spCol = style === 'bleach' ? 'rgba(225,228,222,.25)' : style === 'dark' ? '#77796f' : S.spore;
  g.strokeStyle = stCol; g.lineWidth = Math.max(1.3, 3.5 * s); g.lineCap = 'round';
  g.beginPath(); g.moveTo(X, Y); g.quadraticCurveTo(X + Math.sin(lean) * h * 0.4 + 3 * s, Y - h * 0.5, tx, ty); g.stroke();
  if (pHd <= 0) return { tx, ty };
  const rim = style === 'live' ? 'rgba(225,235,215,.55)' : null;
  const ball = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(1, r), 0, 7); g.fill(); if (rim) { g.strokeStyle = rim; g.lineWidth = 0.7; g.stroke(); } };
  const sporeR = Math.max(1.2, 1.8 * s), shrink = style === 'dark' ? 0.75 : 1;
  const chainN = n => Math.round(n * pCh);
  if (S.id === 'peni') {        // brush
    for (let i = -1; i <= 1; i++) {
      const a1 = lean + i * 0.32, mx = tx + Math.sin(a1) * 12 * s * pHd, my = ty - Math.cos(a1) * 12 * s * pHd;
      g.strokeStyle = stCol; g.lineWidth = Math.max(1, 2.6 * s); g.beginPath(); g.moveTo(tx, ty); g.lineTo(mx, my); g.stroke();
      for (let k = -1; k <= 1; k++) {
        const a2 = a1 + k * 0.16, fx = mx + Math.sin(a2) * 9 * s * pHd, fy = my - Math.cos(a2) * 9 * s * pHd;
        g.strokeStyle = stCol; g.lineWidth = Math.max(0.8, 2 * s); g.beginPath(); g.moveTo(mx, my); g.lineTo(fx, fy); g.stroke();
        for (let q = 0; q < chainN(9); q++) ball(fx + Math.sin(a2) * (q + 0.6) * 3.4 * s, fy - Math.cos(a2) * (q + 0.6) * 3.4 * s, sporeR * shrink, spCol);
      }
    }
  } else if (S.id === 'asp' || S.id === 'xero') {   // swollen head with chains
    const vr = (S.id === 'asp' ? 9 : 5) * s * pHd;
    ball(tx, ty, vr, stCol);
    const nPh = S.id === 'asp' ? 11 : 5, spread = S.id === 'asp' ? 1.35 : 0.5, len = S.id === 'asp' ? 8 : 13;
    for (let i = 0; i < nPh; i++) {
      const a = lean - spread + 2 * spread * i / (nPh - 1);
      const fx = tx + Math.sin(a) * vr, fy = ty - Math.cos(a) * vr;
      for (let q = 0; q < chainN(len); q++) ball(fx + Math.sin(a) * (q + 0.8) * 3.4 * s, fy - Math.cos(a) * (q + 0.8) * 3.4 * s, sporeR * shrink * (S.id === 'xero' ? 0.9 : 1), spCol);
    }
  } else {                        // clado: branching chains of oval spores (a little tree)
    const tree = (x, y, a, n, depth) => {
      let px = x, py = y;
      for (let q = 0; q < n; q++) {
        const nx = px + Math.sin(a) * 4.2 * s, ny = py - Math.cos(a) * 4.2 * s;
        g.fillStyle = spCol; g.beginPath(); g.ellipse((px + nx) / 2, (py + ny) / 2, Math.max(1, 1.5 * s * shrink), Math.max(1.4, 2.4 * s * shrink), a, 0, 7); g.fill(); if (rim) { g.strokeStyle = rim; g.lineWidth = 0.7; g.stroke(); }
        px = nx; py = ny;
        if (depth < 2 && q === 1) { tree(px, py, a - 0.45, Math.max(0, n - 2), depth + 1); tree(px, py, a + 0.45, Math.max(0, n - 2), depth + 1); return; }
      }
    };
    tree(tx, ty, lean, chainN(9), 0);
  }
  // spores flying off
  if (released && style === 'live') {
    for (let i = 0; i < 4; i++) {
      const ph = (clock * 0.12 + hash(i, X)) % 1;
      ball(tx + (hash(i, X + 1) - 0.5) * 60 * s * ph + ph * 20 * s, ty - 20 * s - ph * 90 * s, sporeR, rgba(S.spore, 1 - ph));
    }
  }
  return { tx, ty };
}

function drawMicro(g, W, H, box, R, t, clock) {
  const c = R.cond, P = PLACES[c.place], sc = sceneRect(W, H, box);
  if (sc.h < 140) return;
  const net = getNet(c.place);
  const s = Math.min(sc.w / (2 * REACH + 20), sc.h * 0.62 / 150);
  const cx = sc.x + sc.w / 2, sy = sc.y + sc.h * 0.62;
  const X = x => cx + x * s, Y = y => sy + y * s;
  const M = R.M[t], ks = killState(R, t), sh = speciesShare(R, t), top = sh.indexOf(Math.max(...sh));
  const Ms = ks ? Math.min(M, ks.regrow * 1.6) : M;            // what grows on the surface again after a treatment
  const gS = gOf(Ms), gD = gOf(M), gDead = ks ? gOf(ks.Mbefore) : 0;
  const growing = R.grow[t] && R.P[t] < 0.6;
  g.save(); rr(g, sc.x, sc.y, sc.w, sc.h, 10); g.clip();
  // air
  const air = g.createLinearGradient(0, sc.y, 0, sy);
  air.addColorStop(0, '#111816'); air.addColorStop(1, '#17201d');
  g.fillStyle = air; g.fillRect(sc.x, sc.y, sc.w, sy - sc.y);
  // material
  const matTop = { bath: '#cfd4d0', window: '#6f7578', wall: '#e1dbcd', closet: '#c3a274' }[c.place];
  g.fillStyle = matTop; g.fillRect(sc.x, sy, sc.w, sc.y + sc.h - sy);
  if (c.place === 'wall') {
    g.fillStyle = '#cdb98f'; g.fillRect(sc.x, Y(70), sc.w, sc.y + sc.h - Y(70));
    g.strokeStyle = 'rgba(120,96,60,.45)'; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const y = Y(75 + hash(i, 1) * 80), x = sc.x + hash(i, 2) * sc.w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + hash(i, 3) * 60, y + (hash(i, 4) - 0.5) * 10); g.stroke(); }
    note(g, 'ビニール', sc.x + 8, Y(30), 'left', '#5f5a50'); note(g, '紙とのり（えさになる）', sc.x + 8, Y(90), 'left', '#5f4a2a');
  } else if (c.place === 'closet') {
    g.strokeStyle = 'rgba(110,80,46,.45)'; g.lineWidth = 1;
    for (let y = 0; y < 200; y += 12) for (let x = -REACH - 20; x < REACH + 20; x += 34) g.strokeRect(X(x + (y % 24 ? 17 : 0)), Y(y + 2), 34 * s, 12 * s);
    note(g, '木の細胞（えさになる）', sc.x + 8, Y(40), 'left', '#4a3418');
  } else {
    g.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(sc.x + hash(i, 5) * sc.w, Y(8 + hash(i, 6) * 140), (1 + hash(i, 7) * 3) * s, 0, 7); g.fill(); }
    note(g, c.place === 'bath' ? 'シリコン' : 'ゴム', sc.x + 8, Y(30), 'left', c.place === 'bath' ? '#59605a' : '#cfd4d6');
  }
  // dirt layer on top (soap scum / dust)
  const N = R.N[t];
  if (c.place === 'bath') { g.fillStyle = `rgba(226,214,170,${0.25 + 0.5 * N})`; g.fillRect(sc.x, sy - 1.5 * s * (1 + 4 * N), sc.w, 1.5 * s * (1 + 4 * N)); }
  // food particles, digested where the hyphae have reached
  const reach = Math.max(gS, ks ? gDead * 0.9 : 0) * REACH / 1.1;   // food already eaten stays eaten
  for (let i = 0; i < 26; i++) {
    if (hash(i, 51) > 0.25 + N * 0.75) continue;
    const x = (hash(i, 52) - 0.5) * 2 * REACH, size = 6 + hash(i, 53) * 18;
    const eat = clamp((reach - Math.abs(x)) / 70, 0, 1) * 0.75;
    const r = size * (1 - eat);
    if (r < 1) continue;
    if (eat > 0.03 && eat < 0.74 && growing && (!ks || gS >= gDead * 0.9)) { g.fillStyle = COL.enzyme + '0.28)'; g.beginPath(); g.ellipse(X(x), Y(-r * 0.3), (r + 8) * s, (r * 0.5 + 6) * s, 0, 0, 7); g.fill(); }
    g.fillStyle = c.place === 'bath' ? (i % 3 ? 'rgba(240,232,200,.85)' : 'rgba(236,200,190,.8)') : 'rgba(150,140,128,.85)';
    g.beginPath(); g.ellipse(X(x), Y(-r * 0.35), r * s, r * 0.45 * s, hash(i, 54) * 0.4, 0, 7); g.fill();
  }
  // water film or humid haze
  if (R.wet[t]) {
    const d = 34;
    g.fillStyle = COL.water + '0.25)'; g.fillRect(sc.x, Y(-d), sc.w, d * s);
    g.strokeStyle = COL.water + '0.7)'; g.lineWidth = 1.5; g.beginPath();
    for (let x = -REACH - 20; x <= REACH + 20; x += 6) { const y = -d + Math.sin(x * 0.05 + clock * 1.2) * 1.2; x === -REACH - 20 ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y)); }
    g.stroke();
  } else if (R.RH[t] >= R.RHc[t]) {
    const hz = g.createLinearGradient(0, Y(-40), 0, sy);
    hz.addColorStop(0, COL.water + '0)'); hz.addColorStop(1, COL.water + '0.16)');
    g.fillStyle = hz; g.fillRect(sc.x, Y(-40), sc.w, 40 * s);
  }
  // fungicide on the surface
  if (R.P[t] > 0.05) {
    g.fillStyle = `rgba(235,240,245,${0.3 + R.P[t] * 0.6})`;
    for (let i = 0; i < Math.round(R.P[t] * 90); i++) { g.beginPath(); g.arc(sc.x + hash(i, 61) * sc.w, sy - 1 - hash(i, 62) * 3 * s, 1.1, 0, 7); g.fill(); }
  }
  // hyphae
  const S0 = SPECIES[top];
  const liveCol = S0.id === 'clado' ? 'rgba(150,146,104,.95)' : 'rgba(226,236,220,.9)';
  const stainCol = 'rgba(70,72,60,.85)';
  g.lineCap = 'round';
  let tipX = null;
  for (const sg of net.segs) {
    const deep = sg.kind === 'd';
    let style = null;
    if (deep) {
      if (sg.b <= gD || (ks && sg.b <= gDead)) style = ks && ks.k === 'chlorine' && sg.b <= gDead ? 'stain' : 'live';
    } else if (sg.b <= gS) style = 'live';
    else if (ks && sg.b <= gDead) {
      if (ks.k === 'scrub' || (ks.scrubbed && sg.h < 0.8)) style = null;
      else style = ks.k === 'chlorine' ? 'bleach' : 'dark';
    }
    if (!style) continue;
    g.strokeStyle = style === 'live' ? liveCol : style === 'stain' ? stainCol : style === 'bleach' ? 'rgba(225,228,222,.22)' : 'rgba(110,112,102,.85)';
    g.lineWidth = Math.max(1.1, 3 * s) * (style === 'dark' || deep ? 0.75 : 1);
    if (style === 'bleach') g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(X(sg.x1), Y(sg.y1)); g.lineTo(X(sg.x2), Y(sg.y2)); g.stroke();
    if (style === 'bleach') g.setLineDash([]);
    if (style === 'live' && sg.kind === 's' && sg.x2 > 0 && (tipX === null || sg.x2 > tipX.x)) tipX = { x: sg.x2, y: sg.y2 };
  }
  // the spore it all started from
  const swollen = M > 0.003 || R.grow.slice(0, t + 1).some(v => v);
  g.fillStyle = mixHex(S0.spore, '#ffffff', swollen ? 0.25 : 0);
  g.beginPath(); g.ellipse(X(0), Y(-2.2), (swollen ? 3.4 : 2.3) * s, (swollen ? 2.8 : 1.9) * s, 0, 0, 7); g.fill();
  // spore-making stalks
  const airUm = (sy - sc.y - 20) / s;
  let firstStalk = null;
  net.stalks.forEach((st, j) => {
    const sp = pickSpecies(sh, st.u), hUm = Math.min(airUm * 0.85, { clado: 110, peni: 120, asp: 135, xero: 80 }[SPECIES[sp].id] * st.hh);
    const pLive = clamp((Ms - st.m0) / 0.9, 0, 1), pDead = ks ? clamp((ks.Mbefore - st.m0) / 0.9, 0, 1) : 0;
    if (pDead > pLive && ks && ks.k !== 'scrub' && !ks.scrubbed) stalk(g, X(st.x), sy - 2 * s, s, sp, hUm, pDead, ks.k === 'chlorine' ? 'bleach' : 'dark', st.lean, clock, false);
    const r = stalk(g, X(st.x), sy - 2 * s, s, sp, hUm, pLive, 'live', st.lean, clock, M >= 3 && pLive >= 1 && R.grow[t]);
    if (r && pLive > 0.6 && !firstStalk) firstStalk = { ...r, sp, x: X(st.x) };
  });
  g.restore();
  g.strokeStyle = 'rgba(200,230,200,.14)'; rr(g, sc.x, sc.y, sc.w, sc.h, 10); g.stroke();
  // scale: 50 um bar and a hair for comparison
  const bx = sc.x + 14, byy = sc.y + 26;
  g.fillStyle = COL.ink; g.fillRect(bx, byy, 50 * s, 3);
  note(g, '50µm（0.05mm）', bx + 50 * s + 6, byy + 2, 'left', COL.ink);
  // a hair (80 um) drawn as an outline in the lower right, for size
  const hr = 40 * s, hx = sc.x + sc.w - 16 - hr, hy = Math.min(sc.y + sc.h - 16 - hr, sy + 14 + hr);
  g.strokeStyle = 'rgba(214,170,120,.75)'; g.lineWidth = 1.5; g.setLineDash([5, 4]);
  g.beginPath(); g.arc(hx, hy, hr, 0, 7); g.stroke(); g.setLineDash([]);
  if (VIEW.labels) note(g, '髪の毛（80µm）', hx, hy, 'center', 'rgba(150,104,60,.95)');
  // labels by stage
  const lb = (txt, x, y, tx, ty, col) => label(g, txt, x, y, clamp(tx, sc.x + 10, sc.x + sc.w - 10), clamp(ty, sc.y + 40, sc.y + sc.h - 12), col);
  if (M < 1 && !ks) lb(swollen ? '胞子（水を吸ってふくらむ）' : '胞子（直径 約4µm）', X(0), Y(-3), X(-40), Y(-46));
  if (M >= 0.02 && M < 0.5 && !ks) lb('発芽管（胞子から出た細い管）', X(10), Y(-1.5), X(40), Y(-60));
  if (M >= 0.3 && tipX && growing) lb('菌糸の先：酵素を出してえさを溶かす', X(tipX.x), Y(tipX.y), X(tipX.x) + 30, Y(-70));
  if (M >= 0.15 && (!tipX || tipX.x > 50)) lb('菌糸（太さ 約3µm）', X(-60), Y(-1), X(-110), Y(-30));
  if (gD > 0.25 || (ks && gDead > 0.25)) lb(ks && ks.k === 'chlorine' ? '奥で生き残った菌糸（色素も残る）' : '材料の奥にもぐった菌糸', X(4), Y(net.depthMax * 0.55), X(60), Y(net.depthMax * 0.8 + 20));
  if (firstStalk) {
    const nm = { clado: '木の枝のように胞子がつながる', peni: 'ほうきの形', asp: '先がふくらんだ丸い頭', xero: '小さな頭から胞子が柱のように' }[SPECIES[firstStalk.sp].id];
    lb(`胞子をつくる柄（${SPECIES[firstStalk.sp].name}：${nm}）`, firstStalk.tx, firstStalk.ty, firstStalk.tx + (firstStalk.tx > cx ? -70 : 70), firstStalk.ty - 28);
  }
  if (N > 0.25 && M < 2.5) lb(c.place === 'bath' ? 'えさ（石けんかす・皮脂・あか）' : 'えさ（ほこり・汚れ）', X(-150), Y(-5), X(-170), Y(-90));
  if (R.wet[t]) lb('水の膜', X(120), Y(-20), X(150), Y(-60), '#a9dcff');
  if (ks && ks.k === 'chlorine' && gDead > gS) lb('色が抜けた死骸（塩素で漂白）', X(-140), Y(-2), X(-120), Y(-120), COL.chlorine);
  if (ks && ks.k === 'alcohol' && gDead > gS) lb('死んだ菌糸（色は残る）', X(-140), Y(-2), X(-120), Y(-120), COL.alcohol);
  if (R.P[t] > 0.1) lb('表面に残った防カビ成分', X(170), Y(-3), X(150), Y(40));
}
