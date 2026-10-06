// View 2: a 2 cm x 2 cm patch of the surface. Colonies (each from one spore) grow as discs; dead ones stay as stains.

const N_COL = 26;

// colony radii (as a fraction of the field) for mould index m. Same seeds every time, so regrowth starts at the old spots.
function colonyRadii(m) {
  const raw = [];
  let area = 0;
  for (let i = 0; i < N_COL; i++) {
    const a = m - (0.3 + hash(i, 7) * 2.4);
    const r = a > 0 ? Math.pow(a, 1.5) * (0.7 + 0.6 * hash(i, 8)) : 0;
    raw.push(r); area += Math.PI * r * r;
  }
  if (m >= 3 && area > 0) {
    const k = Math.sqrt(coverage(m) * 1.25 / area);   // overlaps hide some area
    return raw.map(r => r * k);
  }
  return raw.map(r => r * 0.0035);                     // still microscopic (well under 0.3 mm)
}

function colony(g, x, y, r, sp, style) {
  if (r < 0.4) return;
  const s = SPECIES[sp];
  if (style === 'bleach') {
    g.fillStyle = 'rgba(150,152,144,.32)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(70,74,66,.55)';
    const n = Math.min(40, Math.round(r * 0.8));
    for (let i = 0; i < n; i++) { const a = hash(i, x) * 6.28, d = Math.sqrt(hash(i, y)) * r * 0.85; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + hash(i, 3) * 1.1, 0, 7); g.fill(); }
    return;
  }
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  const dead = style === 'dark';
  grd.addColorStop(0, dead ? mixHex(s.col, '#555a52', 0.35) : mixHex(s.col, '#000000', 0.25));
  grd.addColorStop(0.55, dead ? mixHex(s.spore, '#666a62', 0.4) : s.spore);
  grd.addColorStop(0.85, dead ? mixHex(s.spore, '#777a72', 0.5) : mixHex(s.spore, '#e9ece2', 0.45));
  grd.addColorStop(1, dead ? 'rgba(120,124,116,.4)' : 'rgba(238,240,230,.55)');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  if (!dead && r > 5) {   // white fringe of young hyphae
    g.strokeStyle = 'rgba(240,242,234,.45)'; g.lineWidth = 0.8;
    const n = Math.min(90, Math.round(r * 2.2));
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + hash(i, r | 0) * 0.1, l = r * (0.08 + hash(i, 5) * 0.14); g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); g.lineTo(x + Math.cos(a) * (r + l), y + Math.sin(a) * (r + l)); g.stroke(); }
  }
  if (r > 10) {   // growth rings
    g.strokeStyle = dead ? 'rgba(60,64,58,.25)' : 'rgba(0,0,0,.18)'; g.lineWidth = 1;
    for (const f of [0.35, 0.62]) { g.beginPath(); g.arc(x, y, r * f, 0, 7); g.stroke(); }
  }
}

function drawSurface(g, W, H, box, R, t, clock) {
  const c = R.cond, sc = sceneRect(W, H, box);
  const wide = sc.w > sc.h * 1.25;
  const S = Math.max(120, Math.min(wide ? sc.w * 0.62 : sc.w - 8, sc.h - 30));
  const bx = wide ? sc.x + 8 : sc.x + (sc.w - S) / 2, by = sc.y + (sc.h - S) / 2;
  g.save(); rr(g, bx, by, S, S, 8); g.clip();
  // material
  const base = { bath: '#ecede8', window: '#93989a', wall: '#e3ddd0', closet: '#c9a97c' }[c.place];
  g.fillStyle = base; g.fillRect(bx, by, S, S);
  if (c.place === 'closet') { g.strokeStyle = 'rgba(120,86,50,.3)'; for (let i = 0; i < 22; i++) { const y = by + hash(i, 1) * S; g.beginPath(); g.moveTo(bx, y); g.bezierCurveTo(bx + S * 0.3, y + 8, bx + S * 0.6, y - 8, bx + S, y + 4); g.stroke(); } }
  if (c.place === 'wall') { g.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 400; i++) g.fillRect(bx + hash(i, 2) * S, by + hash(i, 3) * S, 2, 2); }
  // dirt = food
  const N = R.N[t];
  for (let i = 0; i < 60; i++) {
    if (hash(i, 12) > N) continue;
    g.fillStyle = c.place === 'bath' ? 'rgba(222,208,160,.35)' : 'rgba(110,100,90,.28)';
    g.beginPath(); g.ellipse(bx + hash(i, 13) * S, by + hash(i, 14) * S, 4 + hash(i, 15) * S * 0.05, 3 + hash(i, 16) * S * 0.03, hash(i, 17) * 3, 0, 7); g.fill();
  }
  // landed spores (hidden mode)
  if (VIEW.hidden) {
    const n = Math.min(600, Math.round(R.landed[t] * 4));
    g.fillStyle = 'rgba(40,46,40,.75)';
    for (let i = 0; i < n; i++) { g.beginPath(); g.arc(bx + hash(i, 91) * S, by + hash(i, 92) * S, 1, 0, 7); g.fill(); }
  }
  // colonies: stain left by dead mould (if any), then the living mould on top
  const sh = speciesShare(R, t), ks = killState(R, t);
  const pos = i => [bx + (0.08 + 0.84 * hash(i, 21)) * S, by + (0.08 + 0.84 * hash(i, 22)) * S];
  const spOf = i => pickSpecies(sh, hash(i, 23));
  if (ks && R.V[t] > R.M[t] + 0.05) {
    const rv = colonyRadii(R.V[t]);
    for (let i = 0; i < N_COL; i++) { const [x, y] = pos(i); colony(g, x, y, rv[i] * S, spOf(i), ks.k === 'chlorine' ? 'bleach' : 'dark'); }
  }
  const rl = colonyRadii(R.M[t]);
  for (let i = 0; i < N_COL; i++) {
    const [x, y] = pos(i), r = rl[i] * S;
    if (R.M[t] < 3) {
      if (VIEW.hidden && r > 0) { g.strokeStyle = 'rgba(250,250,240,.8)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, Math.max(2, r * 30), 0, 7); g.stroke(); }
      continue;
    }
    colony(g, x, y, r, spOf(i), 'live');
  }
  // water
  if (R.wet[t]) {
    for (let i = 0; i < 26; i++) {
      const x = bx + hash(i, 41) * S, y = by + hash(i, 42) * S, r = S * (0.015 + hash(i, 43) * 0.04);
      g.fillStyle = 'rgba(170,215,245,.25)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(220,240,255,.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, 7); g.fill();
    }
  }
  g.restore();
  g.strokeStyle = 'rgba(200,230,200,.25)'; rr(g, bx, by, S, S, 8); g.stroke();
  // scale bar 5 mm
  const mm = S / 20;
  g.fillStyle = COL.ink; g.fillRect(bx + 10, by + S + 10, mm * 5, 3);
  note(g, '5mm', bx + 14 + mm * 5, by + S + 12, 'left', COL.ink);
  note(g, `2cm 四方の表面（${PLACES[c.place].mat}）`, bx + 64 + mm * 5, by + S + 12, 'left');
  if (VIEW.labels && R.M[t] > 0.05 && R.M[t] < 3 && !VIEW.hidden) note(g, '菌糸は育っているが、まだ目には見えない（「目に見えないものも表示」で見える）', bx + 10, by + 16, 'left', COL.ink);
  if (VIEW.hidden && VIEW.labels) note(g, `● 落ちた胞子（1cm² に約 ${fmtN(R.landed[t])} 個）　○ 目に見えない小さなコロニー`, bx + 10, by + 16, 'left', '#20261f');
  // legend: species share
  const lx = wide ? bx + S + 22 : bx, ly = wide ? by + 6 : by + S + 30;
  if (wide && R.M[t] > 0.3) {
    note(g, 'どのカビが多い？（推定）', lx, ly, 'left', COL.ink);
    SPECIES.forEach((s, i) => {
      const y = ly + 26 + i * 40;
      g.fillStyle = s.spore; g.beginPath(); g.arc(lx + 8, y, 7, 0, 7); g.fill();
      note(g, `${s.name} ${(sh[i] * 100).toFixed(0)}%`, lx + 22, y - 6, 'left', COL.ink);
      g.fillStyle = 'rgba(200,230,200,.12)'; g.fillRect(lx + 22, y + 6, 120, 5);
      g.fillStyle = s.spore; g.fillRect(lx + 22, y + 6, 120 * sh[i], 5);
    });
    if (ks) {
      const y = ly + 26 + 4 * 40 + 6;
      note(g, ks.k === 'chlorine' ? '灰色のしみ: 色が抜けた死骸と、' : ks.k === 'alcohol' ? 'くすんだ点: 死んでいるが色が残る' : 'こすって表面が取れた', lx, y, 'left', COL.dim);
      if (ks.k === 'chlorine') note(g, '奥に残った黒ずみ', lx, y + 18, 'left', COL.dim);
      if (R.M[t] > ks.Mafter + 0.05) note(g, 'あざやかな点: 生き残りから再び育つ', lx, y + 36, 'left', '#ffb08a');
    }
  }
}
