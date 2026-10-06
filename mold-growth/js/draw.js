// Shared drawing helpers for the three views (room / surface / micro) and the view switch.

const VIEW = { mode: 'room', labels: true, hidden: false };   // hidden: also show what the eye cannot see
const COL = {
  bg: '#0d1110', ink: '#eef2ea', dim: '#93a093', water: 'rgba(110,190,240,', dead: '#9aa39a',
  chlorine: '#7ec8ff', alcohol: '#d6a6ff', dmg: '#ffd36b', enzyme: 'rgba(255,214,107,',
};

function hash(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function lerp(a, b, f) { return a + (b - a) * f; }
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
function mixHex(a, b, f) { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], f)).toString(16).padStart(2, '0')).join(''); }

function setupCanvas(cv, minW = 120, minH = 160) {
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (W < minW || H < minH) return null;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W, H };
}
// margins kept free for the title (top) and the time bar (bottom)
function viewBox(W, H) { const narrow = W < 560; return { top: narrow ? 118 : 70, bot: narrow ? 134 : 70, narrow }; }

function label(g, text, x, y, tx, ty, col) {
  if (!VIEW.labels) return;
  g.strokeStyle = 'rgba(238,242,234,.5)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
  g.beginPath(); g.arc(x, y, 1.8, 0, 7); g.fillStyle = 'rgba(238,242,234,.8)'; g.fill();
  g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle';
  const w = g.measureText(text).width, cw = g.canvas.clientWidth;
  let right = tx < x;
  if (right && tx - 6 - w < 4) right = false;          // keep the text inside the canvas
  else if (!right && tx + 6 + w > cw - 4) right = true;
  g.textAlign = right ? 'right' : 'left';
  let px = right ? tx - 3 : tx + 3;
  if (right) px = Math.max(px, w + 6); else px = Math.min(px, cw - w - 6);   // long text on a narrow screen
  g.fillStyle = 'rgba(13,17,16,.82)'; g.fillRect(right ? px - w - 3 : px - 3, ty - 9, w + 6, 18);
  g.fillStyle = col || COL.ink; g.fillText(text, px, ty);
}
function note(g, text, x, y, align, col) {
  g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle'; g.textAlign = align || 'left';
  g.fillStyle = col || COL.dim; g.fillText(text, x, y);
}

// colour of the mould at hour t: species mix, weighted by share
function mouldColor(R, t, spore) {
  const sh = speciesShare(R, t);
  let r = 0, gg = 0, b = 0;
  SPECIES.forEach((s, i) => { const c = hexRgb(spore ? s.spore : s.col); r += c[0] * sh[i]; gg += c[1] * sh[i]; b += c[2] * sh[i]; });
  return '#' + [r, gg, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function pickSpecies(sh, u) { let a = 0; for (let i = 0; i < sh.length; i++) { a += sh[i]; if (u <= a) return i; } return sh.length - 1; }

// what the treatments left at hour t
function killState(R, t) {
  const k = lastKill(R, t);
  if (!k) return null;
  return { ...k, regrow: Math.max(0, R.M[t] - k.Mafter), scrubbed: R.kills.some(x => x.k === 'scrub' && x.t > k.t && x.t <= t) };
}

// small readout in the top-right corner (below the view buttons)
function hud(g, R, t, W, box) {
  const c = R.cond, wet = R.wet[t], RH = wet ? 100 : R.RH[t];
  const rows = [
    ['部屋', `${R.Tin[t].toFixed(0)}℃ ${R.RHin[t].toFixed(0)}%`],
    ['表面', `${R.T[t].toFixed(0)}℃ ${RH.toFixed(0)}%${wet ? ' ぬれ' : ''}`],
    ['育つ線', `${R.RHc[t].toFixed(0)}% 以上`],
    ['カビ指数', `${R.M[t].toFixed(1)} / 6`],
  ];
  if (c.place === 'bath') rows[0][1] = '（浴室の空気）';
  // wide: a box in the top-right corner. narrow: two columns across the top of the picture
  const cols = box.narrow ? 2 : 1, w = box.narrow ? W - 28 : 158, x = box.narrow ? 14 : W - w - 12, y = box.top + 4;
  const cw = w / cols, nRow = Math.ceil(rows.length / cols);
  g.fillStyle = 'rgba(13,17,16,.78)'; rr(g, x, y, w, nRow * 18 + 10, 7); g.fill();
  g.strokeStyle = 'rgba(200,230,200,.14)'; g.stroke();
  g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle';
  rows.forEach(([a, b], i) => {
    const col = cols === 2 ? i % 2 : 0, row = cols === 2 ? i >> 1 : i;
    const xx = x + col * cw, yy = y + 14 + row * 18;
    g.textAlign = 'left'; g.fillStyle = COL.dim; g.fillText(a, xx + 9, yy);
    g.textAlign = 'right';
    g.fillStyle = i === 1 ? (RH >= R.RHc[t] ? '#ffd36b' : '#9fd8a8') : i === 3 ? (R.M[t] >= 3 ? '#ffb08a' : COL.ink) : COL.ink;
    g.font = '12px "IBM Plex Mono", Consolas, monospace'; g.fillText(b, xx + cw - 9, yy);
    g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif';
  });
}

function drawView(cv, R, t, clock) {
  const s = setupCanvas(cv);
  if (!s) return;
  const { g, W, H } = s;
  g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
  const box = viewBox(W, H);
  if (VIEW.mode === 'room') drawRoom(g, W, H, box, R, t, clock);
  else if (VIEW.mode === 'surface') drawSurface(g, W, H, box, R, t, clock);
  else drawMicro(g, W, H, box, R, t, clock);
  hud(g, R, t, W, box);
}
