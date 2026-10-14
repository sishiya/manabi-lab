// ほこりが積もるまで — ルーペ（えらんだ場所の積もったほこりを、1mm 四方の顕微鏡の絵で）
// 粒の数 = その場所の重さ ÷ 粒1つの重さ（下の表。形と大きさからの推定）
'use strict';

const LOUPE_MM = 1;   // 見ている広さ（1辺 mm）
// 粒1つの重さ ng と、絵の大きさ µm（推定。空気力学的な大きさの段ごとに、ありそうな形を1つ決めた）
const GRAIN = {
  fiber:  { 3: { ng: 3, len: 100, w: 5 }, 4: { ng: 25, len: 400, w: 10 }, 5: { ng: 120, len: 1200, w: 15 } },   // 綿の繊維 15µm の太さ・密度 1.5
  skin:   { 2: { ng: 0.04, size: 5 }, 3: { ng: 0.5, size: 13 }, 4: { ng: 4, size: 32 } },                      // 厚さ 3〜4µm の平たいかけら
  soil:   { 2: { ng: 0.01, size: 2 }, 3: { ng: 0.33, size: 6 }, 4: { ng: 8.8, size: 19 }, 5: { ng: 320, size: 62 } }, // 密度 2.6 の球に近い粒
  pollen: { 4: { ng: 14, size: 30 } },                                                                     // スギ花粉 約30µm
};

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// いちばん近い「上向きの面」（なければどの面でも）
function nearestFace(x, y) {
  let best = -1, bd = 1e9;
  for (let f = 0; f < FACES.length; f++) {
    const F = FACES[f];
    const d = Math.hypot(F.x - x, (F.y - y) * (F.o === 'up' ? 1.5 : 1)) + (F.o === 'up' ? 0 : 0.04);
    if (d < bd) { bd = d; best = f; }
  }
  return bd < 0.4 ? best : -1;
}

// 数を数える（その面と、となりの面2つをならす）
function loupeCounts(f) {
  const F = FACES[f], list = [F];
  for (const G of FACES) if (G !== F && G.o === F.o && G.j === F.j && Math.abs(G.i - F.i) === 1 && G.place === F.place) list.push(G);
  const mm2 = LOUPE_MM * LOUPE_MM, perMm2 = 1 / (list.length * FACE_AREA * 1e6);
  const out = [];
  for (const k in GRAIN) {
    const s = SI[k];
    for (const b in GRAIN[k]) {
      let m = 0; for (const G of list) m += G.dep[di(s, +b)];
      const ng = m * 1e3 * perMm2 * mm2;   // µg → ng、この広さの中の量
      out.push({ k, s, b: +b, n: ng / GRAIN[k][b].ng, info: GRAIN[k][b] });
    }
  }
  let fine = 0; for (const G of list) for (let s = 0; s < NS; s++) for (let b = 0; b < 2; b++) fine += G.dep[di(s, b)];
  return { items: out, fineNg: fine * 1e3 * perMm2 * mm2, gm2: list.reduce((a, G) => a + faceGm2(G), 0) / list.length };
}

function drawLoupe(lc, f) {
  const r = lc.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (lc.width !== Math.round(r.width * dpr)) { lc.width = Math.round(r.width * dpr); lc.height = Math.round(r.height * dpr); }
  const c = lc.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, R = Math.min(W, H) / 2 - 2, cx = W / 2, cy = H / 2;
  c.clearRect(0, 0, W, H);
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 7); c.clip();
  c.fillStyle = '#1a2533'; c.fillRect(0, 0, W, H);
  const pxPerUm = 2 * R / (LOUPE_MM * 1000);
  if (f >= 0) {
    const L = loupeCounts(f);
    // すす・細かい粒は、灰色のもやのような点に
    const fineDots = Math.min(1500, L.fineNg * 40);
    const rf = mulberry(f * 7 + 1);
    c.fillStyle = 'rgba(140,150,165,.55)';
    for (let q = 0; q < fineDots; q++) c.fillRect(cx - R + rf() * 2 * R, cy - R + rf() * 2 * R, 0.8, 0.8);
    // 小さい順に描く（大きいものが上に）
    const items = L.items.slice().sort((a, b) => a.b - b.b);
    let drawn = 0;
    for (const it of items) {
      const rnd = mulberry(f * 131 + it.s * 17 + it.b);
      const n = Math.min(400, Math.floor(it.n + 0.5));
      const col = SRC[it.s].color;
      for (let q = 0; q < n; q++) {
        const x = cx - R + rnd() * 2 * R, y = cy - R + rnd() * 2 * R, an = rnd() * Math.PI, wob = rnd();
        drawn++;
        if (it.k === 'fiber') {
          const len = it.info.len * pxPerUm * (0.6 + wob * 0.8);
          c.strokeStyle = col; c.globalAlpha = 0.85; c.lineWidth = Math.max(0.8, it.info.w * pxPerUm);
          c.beginPath(); c.moveTo(x, y);
          c.bezierCurveTo(x + Math.cos(an) * len * 0.3 + 6 * (wob - 0.5), y + Math.sin(an) * len * 0.3, x + Math.cos(an) * len * 0.7, y + Math.sin(an) * len * 0.7 - 6 * (wob - 0.5), x + Math.cos(an) * len, y + Math.sin(an) * len);
          c.stroke();
        } else if (it.k === 'skin') {
          const sz = Math.max(1.5, it.info.size * pxPerUm * (0.7 + wob * 0.6));
          c.fillStyle = col; c.globalAlpha = 0.7;
          c.beginPath();
          for (let v = 0; v < 6; v++) { const a2 = an + v * Math.PI / 3, rr = sz * (0.4 + 0.25 * Math.sin(v * 2.1 + wob * 9)); c[v ? 'lineTo' : 'moveTo'](x + Math.cos(a2) * rr, y + Math.sin(a2) * rr); }
          c.closePath(); c.fill();
        } else if (it.k === 'soil') {
          const sz = Math.max(1, it.info.size * pxPerUm * (0.6 + wob * 0.8) / 2);
          c.fillStyle = col; c.globalAlpha = 0.9;
          c.beginPath();
          for (let v = 0; v < 5; v++) { const a2 = an + v * 1.256, rr = sz * (0.7 + 0.3 * Math.sin(v * 3.3 + wob * 7)); c[v ? 'lineTo' : 'moveTo'](x + Math.cos(a2) * rr, y + Math.sin(a2) * rr); }
          c.closePath(); c.fill();
        } else if (it.k === 'pollen') {
          const sz = Math.max(1.2, it.info.size * pxPerUm / 2);
          c.fillStyle = col; c.globalAlpha = 0.9;
          c.beginPath(); c.arc(x, y, sz, 0, 7); c.fill();
          c.strokeStyle = '#8a7a20'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + Math.cos(an) * sz, y + Math.sin(an) * sz); c.lineTo(x + Math.cos(an) * sz * 1.4, y + Math.sin(an) * sz * 1.4); c.stroke();   // スギ花粉の小さな突起
        }
      }
    }
    c.globalAlpha = 1;
    if (!drawn && fineDots < 1) { c.fillStyle = '#6f8494'; c.font = `11px ${FF}`; c.textAlign = 'center'; c.fillText('まだ何もない', cx, cy + 4); }
  }
  c.restore();
  c.strokeStyle = 'rgba(230,200,138,.8)'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
  // 目盛り 200µm
  const bar = 200 * pxPerUm;
  c.strokeStyle = '#e8f0f4'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - bar / 2, cy + R * 0.72); c.lineTo(cx + bar / 2, cy + R * 0.72); c.stroke();
  c.fillStyle = '#e8f0f4'; c.font = `10px ${FF}`; c.textAlign = 'center'; c.fillText('0.2mm', cx, cy + R * 0.72 - 5);
}
