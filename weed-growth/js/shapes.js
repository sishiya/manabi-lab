// 雑草がふえるまで — 形（株・根・土の中のタネの位置）。世界の座標 m で作り、株ごとにしまっておく。
'use strict';
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function h01(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function qpt(c, t) { const u = 1 - t; return { x: u * u * c.x0 + 2 * u * t * c.cx + t * t * c.x1, y: u * u * c.y0 + 2 * u * t * c.cy + t * t * c.y1 }; }

// k 番目のタネのます目の中の位置（数が増えても前からあるタネは動かない）
function seedSpot(i, k) {
  const b = i * 7919 + k * 104729;
  const x = i % NX, z = (i / NX) | 0;
  return { x: (x + h01(b)) * DXC, y: -(z + h01(b + 1)) * DZC, a: h01(b + 2) * Math.PI };
}

// ---------- 地上の株（エノコログサ: 根もとから分げつした茎に葉、てっぺんに穂） ----------
function plantGeom(p) {
  if (SP.shape && SP.shape !== 'grass') return formGeom(p);   // タンポポ・スベリヒユ・カタバミ（forms.js）
  const fall = p.st === 3 ? Math.min(1, p.dd / 45) : 0;
  const key = p.st + '|' + Math.round(p.H * 600) + '|' + p.til + '|' + Math.round(fall * 20) + '|' + (p.st >= 2 ? Math.min(30, Math.floor(p.made / p.n / 120)) : 0);
  if (p._gk === key) return p._g;
  const r = mulberry(p.rs), G = { stems: [], leaves: [], pans: [] };
  const H = Math.max(0.006, p.H), seedling = H < 0.03;
  const nt = seedling ? 1 : Math.min(10, 1 + p.til), fs = p.lean >= 0 ? 1 : -1;
  const npan = p.st >= 2 ? Math.min(nt, 1 + Math.floor(p.made / p.n / 500)) : 0;
  for (let k = 0; k < nt; k++) {
    const side = k === 0 ? 0 : (k % 2 ? 1 : -1), ring = Math.ceil(k / 2);
    let a = side * (0.07 + 0.08 * ring) * (0.8 + 0.5 * r()) + p.lean * 0.25 + fall * fs * 1.25;
    a = Math.max(-1.35, Math.min(1.35, a));
    const L = H * (k === 0 ? 1 : 0.7 + 0.3 * r());
    const x0 = p.x + side * 0.0012 * ring;
    const st = { x0, y0: 0, cx: x0 + Math.sin(a) * L * 0.35, cy: Math.cos(a * 0.6) * L * 0.5, x1: x0 + Math.sin(a) * L, y1: Math.cos(a) * L };
    G.stems.push(st);
    const nl = seedling ? Math.min(3, 1 + Math.floor(p.cd / 40)) : Math.max(2, Math.min(6, Math.round(1.5 + L / 0.08)));
    for (let j = 0; j < nl; j++) {
      const t = seedling ? 0.02 + 0.1 * j : 0.06 + 0.72 * j / Math.max(1, nl - 1);
      const b = qpt(st, t), sd = ((j + k) % 2 ? 1 : -1);
      const lb = seedling ? H * (0.95 - 0.2 * j) : Math.min(0.24, 0.035 + 0.42 * L) * (1 - 0.3 * t) * (0.8 + 0.4 * r());
      const ph = a + sd * (seedling ? 0.12 + 0.15 * j : 0.4 + 0.45 * r());
      const droop = seedling ? 0 : lb * (0.25 + 0.3 * r());
      G.leaves.push({ x0: b.x, y0: b.y, cx: b.x + Math.sin(ph) * lb * 0.55, cy: b.y + Math.cos(ph) * lb * 0.6,
        x1: b.x + Math.sin(ph) * lb * 0.85, y1: b.y + Math.cos(ph) * lb * 0.7 - droop,
        w: SP.leafW * (seedling ? 0.35 : 0.55 + 0.45 * Math.min(1, L / 0.3)) });
    }
    if (k < npan) {
      const len = (0.015 + 0.075 * Math.sqrt(Math.min(1, p.W / SP.wmax))) * (k === 0 ? 1 : 0.65 + 0.35 * r());
      const pn = { x: st.x1, y: st.y1, ang: a, bend: (a >= 0 ? 1 : -1) * (0.5 + 0.5 * r()) + fall * fs, len };
      pn.pts = []; for (let i = 0; i <= 10; i++) pn.pts.push(panAt(pn, i / 10));   // 遠くから描く線（しまっておく）
      G.pans.push(pn);
    }
  }
  p._g = G; p._gk = key; return G;
}
// 穂の軸にそった点（t: 0 根もと → 1 先）
function panAt(pn, t) {
  // 角度が ang から ang+bend へ変わる弧を、小さな直線でたどる
  let x = pn.x, y = pn.y, n = Math.max(1, Math.ceil(t * 12));
  for (let i = 0; i < n; i++) {
    const tt = (i + 0.5) / 12, a = pn.ang + pn.bend * tt * tt, d = pn.len * Math.min(1 / 12, t - i / 12);
    x += Math.sin(a) * d; y += Math.cos(a) * d;
  }
  return { x, y, a: pn.ang + pn.bend * t * t };
}

// ---------- 根（ひげ根。重力の向きへ曲がりながら広がる） ----------
function rootGeom(p) {
  const key = Math.round(Math.sqrt(p.W / SP.wmax) * 80) + '|' + Math.min(40, Math.floor(p.cd / 15)) + '|' + p.st;
  if (p._rk === key) return p._r;
  const r = mulberry(p.rs ^ 0x5bd1e995), R0 = { roots: [], tips: [] };
  const nr = Math.max(1, Math.min(14, 1 + 2 * p.til + Math.floor(p.cd / 90)));
  const D = Math.min(0.19, 0.012 + 0.2 * Math.pow(p.W / SP.wmax, 0.45) + 0.04 * Math.min(1, p.cd / 250));
  for (let j = 0; j < nr; j++) {
    // 1本目はタネから出た根（種子根）。ほかは地ぎわの節から出る根（冠根）
    const tap = SP.root === 'tap';   // 直根（タンポポ・カタバミ）: 1本目は太くまっすぐ深く、ほかは細い根
    const sx = p.x + (j === 0 ? 0 : (r() - 0.5) * 0.004), sy = j === 0 ? (tap ? -0.004 : -p.z0) : tap ? -0.01 - r() * D * 0.6 : -0.004 - r() * 0.006;
    let a = j === 0 ? (r() - 0.5) * (tap ? 0.12 : 0.3) : (r() * 2 - 1) * 1.15;
    const L = Math.max(0.003 + Math.min(0.03, p.cd * 0.0002), (D + sy) * (j === 0 ? 1 : 0.45 + 0.55 * r()) / Math.max(0.5, Math.cos(a) * 0.8 + 0.2));
    const pts = [{ x: sx, y: sy }], n = 10;
    let x = sx, y = sy;
    for (let i = 0; i < n; i++) {
      a = a * 0.86 + (r() - 0.5) * 0.25;
      x += Math.sin(a) * L / n; y -= Math.cos(a) * L / n;
      if (y < -SOIL_D + 0.004) y = -SOIL_D + 0.004;
      pts.push({ x, y });
    }
    const rw = tap ? (j === 0 ? SP.rootDia * (0.3 + 0.7 * Math.sqrt(Math.min(1, p.W / SP.wmax))) : 0.0004) : SP.rootDia * (j === 0 ? 1 : 1.15);
    R0.roots.push({ pts, w: rw });
    R0.tips.push({ x, y, a: Math.PI + a, w: rw, p });
    // 横に出る細い根
    const nlat = Math.min(6, Math.floor(L / 0.02));
    for (let k = 0; k < nlat; k++) {
      const q = pts[2 + Math.floor(r() * (n - 3))], la = a + (r() < 0.5 ? -1 : 1) * (0.8 + 0.6 * r()), ll = L * (0.12 + 0.18 * r());
      const ex = q.x + Math.sin(la) * ll, ey = Math.max(-SOIL_D + 0.004, q.y - Math.cos(la) * ll * 0.6);
      R0.roots.push({ pts: [q, { x: (q.x + ex) / 2, y: (q.y + ey) / 2 + 0.002 }, { x: ex, y: ey }], w: SP.rootDia * 0.5 });
      R0.tips.push({ x: ex, y: ey, a: Math.atan2(ex - q.x, -(ey - q.y)) + Math.PI, w: SP.rootDia * 0.5, p });
    }
  }
  p._r = R0; p._rk = key; return R0;
}
// 土の中で芽をのばしているところ（タネ・幼根・子葉鞘）
function sproutGeom(p) {
  const f = Math.min(1, p.cdU / p.need);
  return { sx: p.x, sy: -p.z0, rootLen: Math.min(0.03, 0.001 + p.cdU * 0.00012), shootTop: -p.z0 + (p.z0 - 0.0005) * f, f };
}
