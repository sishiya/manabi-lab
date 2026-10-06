// Tools: what your finger does to the wall (a round brush), and the one that works on the whole bathroom.
// Effects of the chemicals are estimates of the kind "most at the surface, less inside the material" (DEVNOTES).

const TOOLS = [
  { id: 'lens', name: 'ルーペ', icon: '🔍', sub: '当てた所を顕微鏡の大きさで見る' },
  { id: 'water', name: '水をかける', icon: '💧', col: '#6ec1f0' },
  { id: 'wipe', name: 'ふき取る', icon: '🧻', col: '#e8e2d0' },
  { id: 'dry', name: '乾かす', icon: '💨', col: '#ffd36b', sub: 'ドライヤー' },
  { id: 'dirt', name: '汚す', icon: '🧴', col: '#e2cf8f', sub: '石けんかす・皮脂' },
  { id: 'spore', name: '胞子をまく', icon: '✨', col: '#b8d66a', sub: '実験用' },
  { id: 'scrub', name: 'こする', icon: '🧽', col: '#f2e6a0', sub: 'スポンジと中性洗剤' },
  { id: 'chlorine', name: '塩素系カビ取り剤', icon: '🧪', col: '#7ec8ff', sub: 'カビハイターなど' },
  { id: 'alcohol', name: 'アルコール', icon: '🍶', col: '#d6a6ff', sub: 'エタノール 70〜80%' },
  { id: 'fungicide', name: '防カビ剤スプレー', icon: '🛡️', col: '#ffb86b', sub: '表面に残って効く' },
];
const BRUSH = { r: 5 };   // mm

function forCells(x, y, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r) / CELL)), i1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
  const j0 = Math.max(0, Math.floor((y - r) / CELL)), j1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = (i + 0.5) * CELL - x, dy = (j + 0.5) * CELL - y, d2 = dx * dx + dy * dy;
    if (d2 <= r * r) fn(j * GW + i, 1 - Math.sqrt(d2) / r);
  }
}
function inBrush(px, py, x, y, r) { const dx = px - x, dy = py - y; return dx * dx + dy * dy <= r * r; }
function killTipsIn(x, y, r, pSurface) {
  const T = W.tips;
  for (let i = T.n - 1; i >= 0; i--) if (inBrush(T.x[i], T.y[i], x, y, r)) {
    const c = cellOf(T.x[i], T.y[i]);
    if (W.rnd() < (MATS[W.mat[c]].pen > 0 && W.rnd() < W.E[c] * 0.5 ? pSurface * 0.4 : pSurface)) killTip(i);
  }
}

// apply a tool along the finger, `amt` = strength for this stroke step (0..1)
function useTool(id, x, y, amt = 1) {
  const r = BRUSH.r;
  if (id === 'lens') return;
  W.usedTools = true;
  if (id === 'water') forCells(x, y, r, (c, f) => { W.water[c] = Math.min(0.35, W.water[c] + 0.08 * f * amt); });
  else if (id === 'wipe') forCells(x, y, r, c => { W.water[c] = Math.min(W.water[c], W.mat[c] === 2 ? 0.02 : 0.008); });
  else if (id === 'dry') forCells(x, y, r, (c, f) => { W.water[c] = Math.max(0, W.water[c] - 0.04 * f * amt); });
  else if (id === 'dirt') forCells(x, y, r, (c, f) => { W.food[c] = Math.min(1, W.food[c] + 0.15 * f * amt); });
  else if (id === 'spore') { for (let k = 0; k < 6 * amt; k++) { const a = W.rnd() * 6.283, d = Math.sqrt(W.rnd()) * r; addSpore(x + Math.cos(a) * d, y + Math.sin(a) * d, pickAirSpecies(), 'hand'); } }
  else if (id === 'scrub') {
    forCells(x, y, r, c => { W.food[c] *= 0.5; W.B[c] *= 0.7; W.S[c] *= 0.7; W.D[c] *= 0.6; W.Dp[c] *= 0.7; });
    killTipsIn(x, y, r, 0.3 * amt);
    W.spores = W.spores.filter(s => !inBrush(s.x, s.y, x, y, r) || W.rnd() < 0.7);
  } else if (id === 'chlorine') {
    forCells(x, y, r, c => {
      // hypochlorite kills and bleaches what it touches; hyphae deep in silicone / grout partly survive, their stain stays
      if (W.B[c] + W.S[c] + W.E[c] > 0.02) {
        W.Pe[c] = Math.max(W.Pe[c], W.E[c] * 0.55);
        W.D[c] = Math.min(1, W.D[c] + W.B[c]); W.B[c] = 0; W.S[c] = 0; W.Dp[c] *= 0.3;
        W.E[c] *= 0.92; W.K[c] = W.E[c] > 0.05 ? 1 : 0;
      }
      W.food[c] *= 0.85;
      W.water[c] = Math.max(W.water[c], 0.07);
    });
    killTipsIn(x, y, r, 0.6 * amt);
    W.spores = W.spores.filter(s => !inBrush(s.x, s.y, x, y, r));
  } else if (id === 'alcohol') {
    forCells(x, y, r, c => {
      if (W.B[c] + W.S[c] > 0.02) {
        W.Dp[c] = Math.min(1, W.Dp[c] + W.S[c] * SPECIES[Math.max(0, W.sp[c])].pig + W.B[c] * 0.25);
        W.D[c] = Math.min(1, W.D[c] + W.B[c]); W.B[c] = 0; W.S[c] = 0;
        W.E[c] *= 0.97; W.K[c] = W.E[c] > 0.05 ? 1 : 0;
      }
    });
    killTipsIn(x, y, r, 0.5 * amt);
    W.spores = W.spores.filter(s => !inBrush(s.x, s.y, x, y, r) || W.rnd() < 0.25);   // some dry spores survive
  } else if (id === 'fungicide') forCells(x, y, r, (c, f) => { W.R[c] = Math.min(1, W.R[c] + 0.35 * amt * (0.5 + f)); });
  W.events.push({ k: 'tool:' + id, t: W.t, x, y });
}

// the whole bathroom at once: silver-ion smoke (fills the air, settles on every surface)
function useSmoke() {
  W.usedTools = true;
  for (let c = 0; c < NC; c++) W.R[c] = Math.max(W.R[c], 0.85);
  W.events.push({ k: 'tool:smoke', t: W.t });
}
