// The world: a 100 x 60 mm piece of bathroom wall (tiles, grout, silicone gasket, tub rim) in 0.5 mm cells.
// Every hour: air (temperature, humidity, spores in the room), water on the surface, dirt (food), dormant spores
// (germination), hyphal tips (each one moves), spore making, spores released, regrowth after a treatment.
// Units: mm, hours. Numbers and what is measured vs estimated: DEVNOTES.md.

const BOX_W = 100, BOX_H = 60, CELL = 0.5, GW = BOX_W / CELL, GH = BOX_H / CELL, NC = GW * GH;
const H_DAY = 24, H_WEEK = 168, RECORD_WEEKS = 8;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- materials ----
const MATS = [
  { id: 'tile', name: 'タイル', food: 0.02, pen: 0, keep: 0.35 },          // keep: how slowly water dries
  { id: 'grout', name: '目地（セメント）', food: 0.06, pen: 0.35, keep: 1.4 },
  { id: 'sil', name: 'ゴムパッキン（シリコン）', food: 0.1, pen: 0.7, keep: 1.0 },
  { id: 'tub', name: '浴そうのふち', food: 0.02, pen: 0, keep: 0.4 },
];
const GASKET_Y0 = 46, GASKET_Y1 = 53, GROUT_Y = [18, 21], GROUT_X = [[28, 31], [76, 79]];
function matAt(x, y) {
  if (y >= GASKET_Y1) return 3;
  if (y >= GASKET_Y0) return 2;
  if (y >= GROUT_Y[0] && y < GROUT_Y[1]) return 1;
  for (const [a, b] of GROUT_X) if (x >= a && x < b) return 1;
  return 0;
}

// ---- species (Grant et al. 1989 for the lowest water activity; speeds: estimates, see DEVNOTES) ----
const SPECIES = [
  { id: 'clado', name: 'クロカビ', sci: 'クラドスポリウム', air: 0.45, awMin: 0.86, awOpt: 0.98, drop: 0, Tmin: -3, Topt: 22, Tmax: 32, vmax: 0.35,
    hy: '#8d8a63', col: '#262b20', pig: 1.0, note: '外の空気にいちばん多い。ぬれる所が好き。黒〜こい緑' },
  { id: 'peni', name: 'アオカビ', sci: 'ペニシリウム', air: 0.25, awMin: 0.82, awOpt: 0.97, drop: 0, Tmin: 0, Topt: 24, Tmax: 35, vmax: 0.4,
    hy: '#d9e3d4', col: '#3c6f5e', pig: 0.85, note: '青緑。寒い所でも育つ' },
  { id: 'asp', name: 'コウジカビのなかま', sci: 'アスペルギルス', air: 0.15, awMin: 0.79, awOpt: 0.96, drop: 0, Tmin: 8, Topt: 29, Tmax: 42, vmax: 0.3,
    hy: '#e3e3cf', col: '#7d7d3a', pig: 0.85, note: '暖かい所が好き。種類で黄緑・黒など' },
  { id: 'xero', name: 'カワキコウジカビ', sci: 'アスペルギルス・レストリクタス', air: 0.15, awMin: 0.76, awOpt: 0.90, drop: 0.6, Tmin: 10, Topt: 26, Tmax: 38, vmax: 0.12,
    hy: '#dfe6e0', col: '#6f8a7c', pig: 0.7, note: '乾き気味の所に強いが、ゆっくり。灰緑' },
];

const SEASONS = {
  rainy: { name: '梅雨〜夏', T: 25, roomRH: 76, outSpores: 1500 },
  mild: { name: '春・秋', T: 19, roomRH: 62, outSpores: 600 },
  winter: { name: '冬', T: 12, roomRH: 50, outSpores: 150 },
};
const HABITS = {
  season: { label: '季節', opts: [['rainy', '梅雨〜夏'], ['mild', '春・秋'], ['winter', '冬']] },
  fan: { label: '換気扇', opts: [['none', '回さない'], ['h2', '入浴後2時間'], ['h24', '24時間']] },
  after: { label: '入浴後', opts: [['none', 'そのまま'], ['squeegee', '水を切る'], ['wipe', 'ふき取る']] },
  clean: { label: '掃除', opts: [['none', 'しない'], ['week', '週1回こする']] },
};
const BATH_HOUR = 21;

function cardinalT(T, a, o, b) {   // Rosso et al. 1993
  if (T <= a || T >= b) return 0;
  return (T - b) * (T - a) * (T - a) / ((o - a) * ((o - a) * (T - o) - (o - b) * (o + a - 2 * T)));
}
// how well a species grows here, 0..1 (water activity, temperature, food)
function growF(s, aw, T, food) {
  const awMin = s.awMin + 0.03 * (1 - clamp(food * 2, 0, 1));   // on poor material it needs a little more water
  if (aw < awMin) return 0;
  const a = aw <= s.awOpt ? (aw - awMin) / (s.awOpt - awMin) : 1 - s.drop * (aw - s.awOpt) / (1 - s.awOpt);
  return clamp(a, 0, 1) * cardinalT(T, s.Tmin, s.Topt, s.Tmax) * (food / (food + 0.15));
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- state ----
const W = {
  t: 0, rnd: mulberry(1), habits: { season: 'rainy', fan: 'h2', after: 'none', clean: 'none' },
  mat: new Uint8Array(NC), water: new Float32Array(NC), food: new Float32Array(NC),
  wAvg: new Float32Array(NC), rhAvg: 76,   // water and air humidity averaged over a day (drawn when time runs fast, so nothing flashes)
  B: new Float32Array(NC),     // living hyphae on the surface (0..1)
  E: new Float32Array(NC),     // hyphae inside the material (0..1)
  S: new Float32Array(NC),     // spores made here (coloured, 0..1)
  D: new Float32Array(NC),     // dead hyphae, colourless
  Dp: new Float32Array(NC),    // dead but still coloured (alcohol)
  Pe: new Float32Array(NC),    // stain deep in the material that bleach did not reach
  R: new Float32Array(NC),     // fungicide on the surface (0..1)
  K: new Uint8Array(NC),       // 1 = killed here, living hyphae may be left inside
  sp: new Int8Array(NC), born: new Float32Array(NC),
  // dormant spores
  spores: [],                  // {x, y, s, p (germination 0..1), from: 'air'|'local'}
  // hyphal tips (struct of arrays)
  tips: { n: 0, x: new Float32Array(9000), y: new Float32Array(9000), a: new Float32Array(9000), s: new Int8Array(9000), lx: new Float32Array(9000), ly: new Float32Array(9000) },
  air: { T: 25, RH: 76, C: 600, fan: false },
  segs: [[], [], [], []],      // new hyphae segments to draw, per species: x1,y1,x2,y2,...
  events: [],                  // things that happened (for the discovery cards)
  stats: null, usedTools: false,
};

function cellOf(x, y) { const i = Math.floor(x / CELL), j = Math.floor(y / CELL); return (i < 0 || j < 0 || i >= GW || j >= GH) ? -1 : j * GW + i; }

function resetWorld(habits, seed) {
  W.t = 0; W.rnd = mulberry(seed || 1); W.usedTools = false;
  if (habits) W.habits = { ...habits };
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const c = j * GW + i, y = (j + 0.5) * CELL;
    W.mat[c] = matAt((i + 0.5) * CELL, y);
    // a little dirt to start with, more low on the wall (splashes run down)
    W.food[c] = (W.mat[c] === 2 ? 0.08 : 0.02) + (y > 30 ? 0.03 : 0);
  }
  for (const a of [W.water, W.wAvg, W.B, W.E, W.S, W.D, W.Dp, W.Pe, W.R, W.born]) a.fill(0);
  W.K.fill(0); W.sp.fill(-1);
  W.spores = []; W.tips.n = 0; W.segs = [[], [], [], []]; W.events = [];
  W.air = { T: SEASONS[W.habits.season].T, RH: SEASONS[W.habits.season].roomRH, C: 0.4 * SEASONS[W.habits.season].outSpores, fan: false };
  W.stats = { germDay: null, visDay: null, visArea: 0, maxC: 0, firsts: {} };
  W.hist = [];   // one snapshot per hour (last 8 days): how things are going
  envHour();
}

// ---- air of the bathroom at the current hour ----
function fanOn(hd) { const f = W.habits.fan; return f === 'h24' || (f === 'h2' && (hd >= 22 && hd < 24)); }
function envHour() {
  const S = SEASONS[W.habits.season], hd = Math.floor(W.t) % 24, since = (hd - BATH_HOUR + 24) % 24;
  const fan = fanOn(hd);
  // humidity the room settles to between baths: fan and the water left on the walls decide it
  let wet = 0; for (let c = 0; c < NC; c += 7) wet += W.water[c];
  wet /= NC / 7;
  const base = clamp(S.roomRH + (W.habits.fan === 'none' ? 14 : W.habits.fan === 'h2' ? 7 : -2) + 60 * wet, 35, 98);
  let RH;
  if (since < 1) RH = 100;
  else RH = base + (100 - base) * Math.exp(-(since - 1) / (fan ? 0.8 : 3));
  if (W.habits.fan === 'h2' && since >= 3) RH = Math.max(base, RH);
  const warm = since < 6 ? (S.T < 20 ? 12 : 6) * Math.exp(-since / 1.5) : 0;
  W.air.T = S.T + warm; W.air.RH = clamp(RH, 0, 100); W.air.fan = fan;
}

function awOf(w, RH) {
  if (w >= 0.06) return 1;
  return Math.max(RH / 100, w > 0.003 ? 0.84 + w * 2.6 : 0);
}
function awAt(c) { return awOf(W.water[c], W.air.RH); }

// ---- water ----
function bath() {
  // a shower wets everything; more low down. Water on tiles runs down into the grout and the gasket.
  for (let c = 0; c < NC; c++) {
    const m = W.mat[c], y = Math.floor(c / GW) * CELL;
    const add = m === 0 ? 0.06 + 0.06 * (y / BOX_H) : m === 1 ? 0.12 : m === 2 ? 0.2 : 0.15;
    W.water[c] = Math.max(W.water[c], add * (0.8 + 0.4 * W.rnd()));
    // soap scum and skin oil land with the splashes (more low down)
    W.food[c] = Math.min(1, W.food[c] + (m === 2 ? 0.018 : m === 1 ? 0.01 : 0.004) * (0.4 + y / BOX_H));
  }
  runoff();
  W.events.push({ k: 'bath', t: W.t });
}
function afterBath() {
  const a = W.habits.after;
  if (a === 'none') return;
  for (let c = 0; c < NC; c++) {
    const m = W.mat[c];
    if (a === 'squeegee') W.water[c] *= m === 0 || m === 3 ? 0.1 : 0.55;
    else W.water[c] = Math.min(W.water[c], m === 2 ? 0.02 : 0.01);
  }
}
function runoff() {
  for (let i = 0; i < GW; i++) {
    let carry = 0;
    for (let j = 0; j < GH; j++) {
      const c = j * GW + i, m = W.mat[c];
      if (m === 0) { const ex = Math.max(0, W.water[c] - 0.05); W.water[c] -= ex; carry += ex * 0.85; }
      else if (m === 1) { const take = Math.min(carry, Math.max(0, 0.25 - W.water[c])); W.water[c] += take; carry -= take; }
      else if (m === 2) { const take = Math.min(carry, Math.max(0, 0.3 - W.water[c])); W.water[c] += take; carry -= take; }
      else carry = 0;
    }
  }
}
function dryHour() {
  const fan = W.air.fan ? 2.5 : 1, ev = 0.06 * Math.max(0.02, 1 - W.air.RH / 100) * fan * (1 + Math.max(0, W.air.T - 20) * 0.04);
  for (let c = 0; c < NC; c++) if (W.water[c] > 0) W.water[c] = Math.max(0, W.water[c] - ev / MATS[W.mat[c]].keep);
  runoff();
}

// ---- spores landing from the room air ----
function landHour() {
  // spores settle at ~0.03 cm/s (3 um, Stokes): per mm2 per hour = C (per m3) x 3e-4 m/s x 3600 s / 1e6
  const expected = W.air.C * 3e-4 * 3600 / 1e6 * BOX_W * BOX_H;
  let n = Math.floor(expected); if (W.rnd() < expected - n) n++;
  for (let k = 0; k < n; k++) addSpore(W.rnd() * BOX_W, W.rnd() * BOX_H, pickAirSpecies(), 'air');
}
function pickAirSpecies() { let u = W.rnd(), a = 0; for (let i = 0; i < SPECIES.length; i++) { a += SPECIES[i].air; if (u <= a) return i; } return 0; }
function addSpore(x, y, s, from) {
  if (x < 0 || y < 0 || x >= BOX_W || y >= BOX_H) return;
  if (W.spores.length >= 12000) {   // keep the list small: forget a dormant spore on dry tile
    const i = Math.floor(W.rnd() * W.spores.length); W.spores[i] = W.spores[W.spores.length - 1]; W.spores.pop();
  }
  W.spores.push({ x, y, s, p: 0, from, t: W.t });
  if (!W.stats.firsts.land) W.events.push({ k: 'land', t: W.t, x, y });
}

// ---- germination (accumulated like Sedlbauer's isopleth model; drying slowly undoes it) ----
function germHour() {
  const keep = [];
  for (const sp of W.spores) {
    const c = cellOf(sp.x, sp.y), s = SPECIES[sp.s];
    const food = MATS[W.mat[c]].food + W.food[c];
    let g = growF(s, awAt(c), W.air.T, food);
    const blocked = W.R[c] > 0.1 && g > 0;
    g *= 1 - 0.95 * W.R[c];
    if (blocked && g < 0.05 && !W.stats.firsts.block) W.events.push({ k: 'block', t: W.t, x: sp.x, y: sp.y });
    if (g > 0.01) {
      sp.p += 1 / (12 / Math.pow(g, 1.5));          // ~12 h at the best conditions, days when barely wet enough
      if (sp.p > 0.3 && !W.stats.firsts.swell) W.events.push({ k: 'swell', t: W.t, x: sp.x, y: sp.y });
    } else sp.p = Math.max(0, sp.p - 1 / 240);
    if (sp.p >= 1) {
      const n = 1 + (W.rnd() < 0.5 ? 1 : 0), a0 = W.rnd() * 6.283;
      for (let k = 0; k < n; k++) addTip(sp.x, sp.y, a0 + k * Math.PI, sp.s);
      if (W.stats.germDay === null) W.stats.germDay = W.t / 24;
      W.events.push({ k: 'germ', t: W.t, x: sp.x, y: sp.y });
    } else keep.push(sp);
  }
  W.spores = keep;
}

// ---- hyphal tips ----
function addTip(x, y, a, s) {
  const T = W.tips;
  if (T.n >= T.x.length) return false;
  const i = T.n++;
  T.x[i] = x; T.y[i] = y; T.a[i] = a; T.s[i] = s; T.lx[i] = x; T.ly[i] = y;
  return true;
}
function killTip(i) {
  const T = W.tips, j = --T.n;
  T.x[i] = T.x[j]; T.y[i] = T.y[j]; T.a[i] = T.a[j]; T.s[i] = T.s[j]; T.lx[i] = T.lx[j]; T.ly[i] = T.ly[j];
}
function tipsHour() {
  const T = W.tips, crowded = T.n > 7000;
  let moving = 0, paused = 0, branched = false, ate = false, deep = false;
  for (let i = T.n - 1; i >= 0; i--) {
    const c = cellOf(T.x[i], T.y[i]);
    if (c < 0) { killTip(i); continue; }
    const s = SPECIES[T.s[i]], m = W.mat[c];
    const food = MATS[m].food + W.food[c];
    const g = growF(s, awAt(c), W.air.T, food) * (1 - 0.9 * W.R[c]);
    if (g <= 0.005) { paused++; continue; }
    moving++;
    const dl = s.vmax / 24 * g;                      // mm this hour
    T.a[i] += (W.rnd() - 0.5) * 0.7;
    const nx = T.x[i] + Math.cos(T.a[i]) * dl, ny = T.y[i] + Math.sin(T.a[i]) * dl;
    const nc = cellOf(nx, ny);
    if (nc < 0) { killTip(i); continue; }
    T.x[i] = nx; T.y[i] = ny;
    // leave hyphae behind, eat, go into soft material
    if (W.B[nc] < 0.02 && W.sp[nc] < 0) { W.sp[nc] = T.s[i]; W.born[nc] = W.t; }
    W.B[nc] = Math.min(1, W.B[nc] + dl * 0.9);
    const pen = MATS[W.mat[nc]].pen;
    if (pen) { W.E[nc] = Math.min(1, W.E[nc] + pen * dl * 0.5); if (W.E[nc] > 0.4) deep = true; }
    if (W.food[nc] > 0.01) { W.food[nc] = Math.max(0, W.food[nc] - dl * 0.12); ate = true; }
    W.K[nc] = 0;
    // record the drawn line every ~0.12 mm
    const ddx = nx - T.lx[i], ddy = ny - T.ly[i];
    if (ddx * ddx + ddy * ddy > 0.015) { W.segs[T.s[i]].push(T.lx[i], T.ly[i], nx, ny); T.lx[i] = nx; T.ly[i] = ny; }
    // branch / stop in a crowd
    if (!crowded && W.rnd() < dl * 1.6) { addTip(nx, ny, T.a[i] + (W.rnd() < 0.5 ? -1 : 1) * (0.5 + W.rnd() * 0.6), T.s[i]); branched = true; }
    if (W.B[nc] > 0.95 && W.rnd() < 0.4) killTip(i);
  }
  W.stats.moving = moving; W.stats.paused = paused;
  if (branched && !W.stats.firsts.branch) W.events.push({ k: 'branch', t: W.t });
  if (ate && !W.stats.firsts.eat) W.events.push({ k: 'eat', t: W.t });
  if (deep && !W.stats.firsts.deep) W.events.push({ k: 'deep', t: W.t });
  if (paused > 30 && moving < paused * 0.2 && W.stats.firsts.branch && !W.stats.firsts.pause) W.events.push({ k: 'pause', t: W.t });
}

// ---- spores made by the mould, released to the air and to nearby spots; regrowth after a treatment ----
function colonyHour() {
  let made = false, rel = 0, visCells = 0;
  for (let c = 0; c < NC; c++) {
    if (W.B[c] > 0.25 && W.sp[c] >= 0 && W.t - W.born[c] > 120) {
      const s = SPECIES[W.sp[c]], food = MATS[W.mat[c]].food + W.food[c];
      const g = growF(s, awAt(c), W.air.T, Math.max(food, 0.1));
      if (g > 0.15) { W.S[c] = Math.min(W.B[c], W.S[c] + 0.003 * g); made = true; }
    }
    if (W.S[c] > 0.2) {
      // a few spores land close by (gravity pulls them down), the rest go to the room air (more when the fan blows / it dries)
      const kick = W.air.fan ? 3 : 1;
      rel += W.S[c] * kick;
      if (W.rnd() < W.S[c] * 0.0006 * kick) {
        const x = (c % GW + 0.5) * CELL, y = (Math.floor(c / GW) + 0.5) * CELL;
        addSpore(x + (W.rnd() - 0.5) * 8, y + W.rnd() * 6 - 1, W.sp[c], 'local');
      }
    }
    // regrowth: hyphae left inside the material after a treatment come back out when it is wet again
    if (W.K[c] && W.E[c] > 0.08 && W.R[c] < 0.5) {
      const s = SPECIES[Math.max(0, W.sp[c])], food = MATS[W.mat[c]].food + W.food[c];
      const g = growF(s, awAt(c), W.air.T, food);
      if (g > 0.05 && W.rnd() < W.E[c] * g * 0.012) {
        const x = (c % GW + 0.5) * CELL, y = (Math.floor(c / GW) + 0.5) * CELL;
        addTip(x, y, W.rnd() * 6.283, Math.max(0, W.sp[c])); W.K[c] = 0;
        W.events.push({ k: 'regrow', t: W.t, x, y });
      }
    }
    if (W.S[c] * SPECIES[Math.max(0, W.sp[c])].pig + W.Dp[c] + W.Pe[c] > 0.3) visCells++;
    if (W.R[c] > 0) W.R[c] *= W.water[c] > 0.06 ? 0.997 : 0.9995;   // washed off slowly when wet
  }
  if (made && !W.stats.firsts.sporulate) W.events.push({ k: 'sporulate', t: W.t });
  // the room air: outside air coming in + spores from mould in the bathroom (our patch x 50 for the rest of the walls)
  const S = SEASONS[W.habits.season], ach = W.air.fan ? 4 : 0.6;
  const emit = rel * 2;                               // spores per m3 per hour from the bathroom's mould (estimate)
  const Ceq = 0.4 * S.outSpores + emit / ach;          // where the air settles; it gets there at the air change rate
  W.air.C = Ceq + (W.air.C - Ceq) * Math.exp(-ach);
  W.stats.maxC = Math.max(W.stats.maxC, W.air.C);
  if (rel > 0.5 && !W.stats.firsts.release) W.events.push({ k: 'release', t: W.t });
  W.stats.visArea = visCells * CELL * CELL;
  W.hist.push(measure());
  if (W.hist.length > 192) W.hist.shift();
  if (W.stats.visArea >= 1 && W.stats.visDay === null) { W.stats.visDay = W.t / 24; W.events.push({ k: 'visible', t: W.t }); }
}

function weeklyClean() {
  for (let c = 0; c < NC; c++) {
    W.food[c] *= W.mat[c] === 2 ? 0.4 : 0.25;
    W.B[c] *= 0.5; W.S[c] *= 0.5; W.D[c] *= 0.3; W.Dp[c] *= 0.5;
  }
  const T = W.tips;
  for (let i = T.n - 1; i >= 0; i--) { const c = cellOf(T.x[i], T.y[i]); if (c >= 0 && W.rnd() < (W.E[c] > 0.2 ? 0.2 : 0.6)) killTip(i); }
  W.spores = W.spores.filter(() => W.rnd() < 0.3);
}

// one hour of the world
function stepHour() {
  const hd = Math.floor(W.t) % 24, day = Math.floor(W.t / 24);
  if (hd === BATH_HOUR) bath();
  if (hd === BATH_HOUR + 1) afterBath();
  if (W.habits.clean === 'week' && day % 7 === 6 && hd === 10) weeklyClean();
  envHour();
  dryHour();
  landHour();
  germHour();
  tipsHour();
  colonyHour();
  for (let c = 0; c < NC; c++) W.wAvg[c] += (W.water[c] - W.wAvg[c]) / 24;
  W.rhAvg += (W.air.RH - W.rhAvg) / 24;
  W.t += 1;
}

// how things stand right now (for the status box and the before / after of a tool)
function measure() {
  let live = 0, vis = 0, deep = 0, wetG = 0, nG = 0, food = 0, fung = 0;
  for (let c = 0; c < NC; c++) {
    live += W.B[c] + 0.5 * W.E[c];
    if (W.S[c] * SPECIES[Math.max(0, W.sp[c])].pig + W.Dp[c] + W.Pe[c] > 0.3) vis++;
    if (W.K[c] && W.E[c] > 0.08) deep++;
    if (W.mat[c] === 2 || W.mat[c] === 1) { nG++; if (W.water[c] >= 0.06) wetG++; }
    food += W.food[c]; fung += W.R[c];
  }
  let germ = 0; for (const s of W.spores) if (s.p > 0.3) germ++;
  return { t: W.t, live: live * CELL * CELL, vis: vis * CELL * CELL, deep: deep * CELL * CELL, wet: wetG / nG, food: food / NC, fung: fung / NC, germ, tips: W.tips.n };
}
