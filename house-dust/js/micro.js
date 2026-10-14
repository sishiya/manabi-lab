// ほこりが積もるまで — ズームの奥: 積もったほこりを真上から見た顕微鏡の絵
// 粒の数 = その面の重さ ÷ 粒1つの重さ（GRAIN、推定）。場所ごとに決まった乱数で並べるので、
// 動かしても同じ粒が同じ所にあり、ほこりが増えると新しい粒が足され、掃除すると消える。
'use strict';

let MCLS = null;   // 粒の種類の一覧（出どころ・大きさ・絵の大きさ・1つの重さ）
function microClasses() {
  if (MCLS) return MCLS;
  MCLS = [];
  for (const k in GRAIN) for (const b in GRAIN[k]) {
    const G = GRAIN[k][b], size = (G.len || G.size) * 1e-6;
    MCLS.push({ k, s: SI[k], b: +b, G, size, T: Math.max(40e-6, Math.min(8e-3, size * 120)) });
  }
  MCLS.sort((a, b) => a.size - b.size);
  MCLS.forEach((C, i) => C.i = i);
  return MCLS;
}
// 1つのます目（1辺 C.T）の粒。決まった乱数なので、いつ呼んでも同じ並び（数が増えると後ろに足される）
function genTile(C, ta, tb, n2) {
  const rnd = mulberry((ta * 73856093) ^ (tb * 19349663) ^ (C.i * 83492791) ^ 0x5bd1e995);
  const T = C.T, lam = n2 * T * T, n = Math.min(400, Math.floor(lam) + (rnd() < lam - Math.floor(lam) ? 1 : 0));
  const out = [];
  for (let q = 0; q < n; q++) {
    const u = (ta + rnd()) * T, v = (tb + rnd()) * T, an = rnd() * Math.PI * 2, wob = 0.6 + rnd() * 0.8;
    out.push({ u, v, an, wob, sub: mulberry(Math.floor(rnd() * 1e9)) });
  }
  return out;
}
// いちばん近い kind の粒をさがす（顕微鏡の面の列で、まわりのます目を広げながら）
function findNearest(kind) {
  const F0 = FACES[VIEW.mf]; if (!F0) return null;
  let best = null;
  const cls = microClasses().filter(C => C.k === kind).sort((a, b) => b.size - a.size);
  for (const C of cls) {
    for (let dc = -8; dc <= 8; dc++) {
      const col = Math.floor(VIEW.cx / DX) + dc; if (col < 0 || col >= NX) continue;
      const fi = faceAt.up[ix(col, F0.j)]; if (fi < 0) continue;
      const n2 = numPerM2(FACES[fi], C); if (n2 <= 0) continue;
      const T = C.T, ta0 = Math.floor(col * DX / T), ta1 = Math.floor(((col + 1) * DX - 1e-9) / T);
      const tbc = Math.floor(VIEW.cvz / T), R = Math.min(40, Math.ceil(0.4 / T));
      for (let ta = ta0; ta <= ta1; ta++) for (let tb = Math.max(0, tbc - R); tb <= tbc + R; tb++) {
        for (const p of genTile(C, ta, tb, n2)) {
          if (p.u < col * DX || p.u >= (col + 1) * DX) continue;
          const d = Math.hypot(p.u - VIEW.cx, p.v - VIEW.cvz) / (1 + C.size * 2000);   // 大きい粒を少し優先
          if (!best || d < best.d) best = { d, u: p.u, v: p.v, C, wob: p.wob };
        }
      }
    }
    if (best) break;   // 大きい段で見つかったら、それにする
  }
  return best;
}

// 面の出どころ×大きさ の「1m² あたりの数」
function numPerM2(F, C) { return F.dep[di(C.s, C.b)] / FACE_AREA / (C.G.ng * 1e-3); }

function surfaceLook(place) {
  if (place === 'ベッドの上') return { base: '#55606c', kind: 'weave', name: 'シーツ（綿の布）' };
  if (['机の上', '棚の上', 'エアコンの上', '空気清浄機の上', '家具の上'].includes(place)) return { base: '#353d49', kind: 'flat', name: place.replace('の上', '') + 'の天板' };
  return { base: '#3d3128', kind: 'wood', name: 'フローリング' };
}

function drawMicro(alpha) {
  const F0 = FACES[VIEW.mf]; if (!F0) return;
  const W = VIEW.w, H = VIEW.h, s = VIEW.s, j = F0.j;
  const u0 = VIEW.cx - W / 2 / s, u1 = VIEW.cx + W / 2 / s, v0 = VIEW.cvz - H / 2 / s, v1 = VIEW.cvz + H / 2 / s;
  const PX = u => (u - VIEW.cx) * s + W / 2, PY = v => (v - VIEW.cvz) * s + H / 2;
  g.save(); g.globalAlpha = alpha;
  g.fillStyle = '#0b1118'; g.fillRect(0, 0, W, H);
  g.restore();
  g.save();
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  g.globalAlpha = alpha;
  // 面ごと（5cm の列）に下地
  const cols = [];
  for (let col = Math.floor(u0 / DX); col <= Math.floor(u1 / DX); col++) {
    const fi = col >= 0 && col < NX ? faceAt.up[ix(col, j)] : -1;
    const xa = PX(col * DX), xb = PX((col + 1) * DX);
    if (fi < 0) { // 面がない（家具のはしの外）
      g.fillStyle = '#0b1118'; g.fillRect(xa, 0, xb - xa, H);
      g.strokeStyle = 'rgba(120,140,160,.15)'; g.lineWidth = 1;
      for (let k = -H; k < xb - xa; k += 14) { g.beginPath(); g.moveTo(xa + k, 0); g.lineTo(xa + k + H, H); g.stroke(); }
      continue;
    }
    const F = FACES[fi], L = surfaceLook(F.place);
    cols.push({ col, F, fi, xa, xb });
    g.fillStyle = L.base; g.fillRect(xa, 0, xb - xa, H);
    // 下地の模様（見える大きさのときだけ）
    if (L.kind === 'weave') {
      const pitch = 0.25e-3 * s;   // 糸の間かく 0.25mm
      if (pitch > 4) {
        g.strokeStyle = 'rgba(200,210,220,.22)'; g.lineWidth = Math.max(1, pitch * 0.55);
        const k0 = Math.floor(v0 / 0.25e-3), k1 = Math.ceil(v1 / 0.25e-3);
        for (let k = k0; k <= k1; k++) { const y = PY(k * 0.25e-3); g.beginPath(); g.moveTo(xa, y); g.lineTo(xb, y); g.stroke(); }
        g.strokeStyle = 'rgba(160,170,185,.18)';
        const m0 = Math.floor(u0 / 0.25e-3), m1 = Math.ceil(u1 / 0.25e-3);
        for (let k = m0; k <= m1; k++) { const x = PX(k * 0.25e-3); if (x < xa || x > xb) continue; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      }
    } else if (L.kind === 'wood') {
      const pitch = 0.4e-3;
      if (pitch * s > 3) {
        const k0 = Math.floor(v0 / pitch), k1 = Math.ceil(v1 / pitch);
        for (let k = k0; k <= k1; k++) { const r = mulberry(k * 977)(); g.strokeStyle = `rgba(110,85,60,${0.15 + r * 0.25})`; g.lineWidth = Math.max(1, pitch * s * (0.15 + r * 0.3)); const y = PY(k * pitch); g.beginPath(); g.moveTo(xa, y); g.lineTo(xb, y); g.stroke(); }
      }
    }
  }
  // 粒
  const hits = [];
  let budget = 6000;
  for (const C of microClasses()) {
    const sizePx = C.size * s;
    for (const cc of cols) {
      const n2 = numPerM2(cc.F, C); if (n2 <= 0) continue;
      if (sizePx < 0.6) {   // 見えないほど小さい粒は、もやとして（おおう面積の割合）
        const cover = Math.min(0.55, n2 * Math.PI / 4 * C.size * C.size * 6);
        if (cover > 0.005) { g.fillStyle = C.k === 'soot' ? `rgba(80,86,96,${cover})` : `rgba(200,190,170,${cover})`; g.fillRect(cc.xa, 0, cc.xb - cc.xa, H); }
        continue;
      }
      const T = C.T, ta0 = Math.floor(Math.max(u0, cc.col * DX) / T), ta1 = Math.floor(Math.min(u1, (cc.col + 1) * DX - 1e-9) / T);
      const tb0 = Math.floor(v0 / T), tb1 = Math.floor(v1 / T);
      for (let ta = ta0 - 1; ta <= ta1 + 1 && budget > 0; ta++) for (let tb = tb0 - 1; tb <= tb1 + 1 && budget > 0; tb++) {
        for (const p of genTile(C, ta, tb, n2)) {
          if (budget <= 0) break;
          const { u, v, an, wob, sub } = p;
          if (u < cc.col * DX || u >= (cc.col + 1) * DX) continue;
          const x = PX(u), y = PY(v), half = sizePx * wob;
          if (x < -half || x > W + half || y < -half || y > H + half) continue;
          budget--;
          let label = '';
          if (C.k === 'fiber') {
            const kind = sub() < 0.67 ? 'cotton' : 'synthetic';
            drawFiber(g, x, y, C.G.len * 1e-6 * s * wob, Math.max(0.7, C.G.w * 1e-6 * s), an, sub, kind);
            label = kind === 'cotton' ? `綿などの天然の繊維（長さ 約${Math.round(C.G.len * wob)}µm・太さ 約${C.G.w}µm）。平たいリボンがねじれた形` : `合成の繊維（ポリエステルなど。長さ 約${Math.round(C.G.len * wob)}µm）。まっすぐでなめらか`;
          } else if (C.k === 'skin') {
            drawSkin(g, x, y, sizePx * wob, an, sub);
            label = `皮ふのかけら（約${Math.round(C.G.size * wob)}µm）。はがれた角質。ダニのえさになる`;
          } else if (C.k === 'soil') {
            const m = pickMineral(sub);
            drawSoil(g, x, y, sizePx * wob, an, sub, m);
            label = `土・砂の粒（${m.name}・約${Math.round(C.G.size * wob * 10) / 10}µm）。外から足や服で入る`;
          } else if (C.k === 'pollen') {
            drawPollen(g, x, y, sizePx * (0.9 + 0.2 * (wob - 0.6) / 0.8), an, sub);
            label = 'スギ花粉（直径 約30µm）。突起が1本ある';
          } else if (C.k === 'soot') {
            drawSoot(g, x, y, sizePx * wob, sub);
            label = `すす・細かい粒（約${C.G.size}µm）。小さな玉がつながったかたまり`;
          }
          if (half > 2.5 && hits.length < 3000) hits.push({ x, y, r: Math.max(5, C.k === 'fiber' ? sizePx * 0.3 : half / 2), label, fiber: C.k === 'fiber' });
        }
      }
    }
  }
  VIEW.hits = hits;
  g.restore();
  // 目盛り
  g.globalAlpha = alpha;
  const want = W / 5 / s, nice = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2];
  let L = nice[0]; for (const n of nice) if (n <= want) L = n;
  const bx = 14, by = H - 16;
  g.fillStyle = 'rgba(8,12,18,.7)'; g.fillRect(bx - 6, by - 20, L * s + 12, 28);
  g.strokeStyle = '#e8f0f4'; g.lineWidth = 3; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + L * s, by); g.stroke();
  g.fillStyle = '#e8f0f4'; g.font = `11px ${FF}`; g.textAlign = 'left';
  g.fillText(L >= 1e-3 ? `${L * 1e3}mm` : `${Math.round(L * 1e6)}µm`, bx, by - 6);
  g.globalAlpha = 1;
}

// 顕微鏡の絵の上の説明（何を見ているか・1mm² あたりの数）
function microCaption() {
  const F0 = FACES[VIEW.mf]; if (!F0) return '';
  const col = Math.floor(VIEW.cx / DX), fi = col >= 0 && col < NX ? faceAt.up[ix(col, F0.j)] : -1;
  const fw = fieldW();
  const wtxt = fw >= 1e-3 ? `${(fw * 1e3).toFixed(fw < 0.01 ? 1 : 0)}mm` : `${Math.round(fw * 1e6)}µm`;
  if (fi < 0) return `真上から（幅 ${wtxt}）: ここには面がない`;
  const F = FACES[fi], cnt = {};
  for (const C of microClasses()) cnt[C.k] = (cnt[C.k] || 0) + numPerM2(F, C) * 1e-6;
  const fmt = v => v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? Math.round(v) : v >= 1 ? v.toFixed(1) : v.toFixed(2);
  const parts = [['fiber', '繊維'], ['skin', '皮ふ'], ['soil', '土・砂'], ['pollen', '花粉'], ['soot', 'すす']].filter(([k]) => cnt[k] > 0.005).map(([k, n]) => `${n} ${fmt(cnt[k])}`);
  return `<b>${F.place}</b>を真上から（${surfaceLook(F.place).name}・幅 ${wtxt}）<br>1mm² あたり: ${parts.length ? parts.join('・') + ' こ' : 'まだほとんど何もない'}`;
}
function microHit(px, py) {
  if (!VIEW.hits) return null;
  let best = null, bd = 1e9;
  for (const h of VIEW.hits) { const d = Math.hypot(h.x - px, h.y - py); if (d < h.r + 4 && d < bd) { bd = d; best = h; } }
  return best;
}
