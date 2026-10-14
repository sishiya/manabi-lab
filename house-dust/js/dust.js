// ほこりが積もるまで — ほこりの粒（出る・運ばれる・落ちる・舞い上がる・取れる）
// 大きい粒（10・30・100µm）は「点」1つ1つを流れ＋落ちる速さ＋乱れ（ランダムウォーク）で動かす。
// 小さい粒（0.3・1・3µm）は部屋の中でよくまざると考え、部屋全体の濃さ1つで扱う（室内の粒のふつうの扱い）。
'use strict';

const PMAX = 6000;
const P = {
  n: 0,
  x: new Float32Array(PMAX), y: new Float32Array(PMAX), m: new Float32Array(PMAX),
  s: new Uint8Array(PMAX), b: new Uint8Array(PMAX), age: new Float32Array(PMAX),
};
const D = {
  box: new Float64Array(NS * NB),      // 小さい粒の濃さ µg/m³（box の大きさだけ使う）
  bed: new Float64Array(NS * NB),      // ふとんの中にたまった分 µg
  pend: new Map(),                     // 点にする前の、出た量のたまり（場所ごと）
  mDot: BINS.map(b => b.box ? 0 : 0.4),// 点1つの重さ µg（ふだんは 0.4µg で、点の多さ＝濃さ。多すぎると重くなるので自動で増やす）
  spawned: 0,
  V: 0,
  tot: { emit: new Float64Array(NS), out: new Float64Array(NS), pur: new Float64Array(NS), vac: new Float64Array(NS), wipe: new Float64Array(NS), ac: new Float64Array(NS), wash: new Float64Array(NS) },
  stir: 0,                             // かきまぜの強さ 0〜1（歩く・エアコン・掃除機）
  lamWin: 0, lamVent: 0, lamPur: 0,
};
const di = (s, b) => s * NB + b;

function dustReset() {
  P.n = 0; D.box.fill(0); D.bed.fill(0); D.pend.clear();
  for (const f of FACES) f.dep.fill(0);
  for (const k in D.tot) D.tot[k].fill(0);
  D.V = fluidCount() * CELL_VOL;
}

// ---------- 出る ----------
// site: 場所の名前（たまりを分けるため）。split: 大きさの割合（SPLIT のどれか）か、大きさの番号
function emit(site, x, y, s, split, mass, spread = 0.05) {
  if (!(mass > 0)) return;
  for (let b = 0; b < NB; b++) {
    const mb = typeof split === 'number' ? (b === split ? mass : 0) : mass * split[b];
    if (mb <= 0) continue;
    D.tot.emit[s] += mb;
    addAir(site, x, y, s, b, mb, spread);
  }
}
// すでに数えた量を空気へ（舞い上がり・掃除機の排気など。emit の合計には入れない）
function addAir(site, x, y, s, b, mb, spread = 0.05) {
  if (BINS[b].box) { D.box[di(s, b)] += mb / D.V; return; }
  const key = site + '|' + s + '|' + b;
  let p = D.pend.get(key);
  if (!p) { p = { m: 0, x, y, s, b, spread }; D.pend.set(key, p); }
  p.m += mb; p.x = x; p.y = y; p.spread = spread;
}
function flushPending() {
  for (const p of D.pend.values()) {
    const md = D.mDot[p.b];
    let guard = 0;
    while (p.m >= md && guard++ < 60) { spawn(p.x + (Math.random() - 0.5) * 2 * p.spread, p.y + (Math.random() - 0.5) * p.spread, p.s, p.b, md); p.m -= md; }
    if (guard >= 60 && p.m >= md) { spawn(p.x, p.y, p.s, p.b, p.m); p.m = 0; }   // 多すぎるときは1つにまとめる
  }
}
function spawn(x, y, s, b, m) {
  x = Math.max(0.001, Math.min(ROOM_W - 0.001, x)); y = Math.max(0.001, Math.min(ROOM_H - 0.001, y));
  let i = Math.floor(x / DX), j = Math.floor(y / DX);
  if (isSolid(i, j)) {   // 家具の中なら、すぐ上の空気へ
    while (j < NY - 1 && isSolid(i, j)) j++;
    y = (j + 0.5) * DX;
  }
  if (P.n >= PMAX) {    // いっぱいなら、いちばん重い点に足す（量は失わない）
    let k = 0; for (let q = 1; q < 50; q++) { const r = (Math.random() * P.n) | 0; if (P.b[r] === b && P.s[r] === s) { k = r; break; } }
    P.m[k] += m; return;
  }
  const k = P.n++;
  P.x[k] = x; P.y[k] = y; P.m[k] = m; P.s[k] = s; P.b[k] = b; P.age[k] = 0;
  D.spawned++; spawnedBin[b]++;
}
function kill(k) {
  const l = --P.n;
  if (k !== l) { P.x[k] = P.x[l]; P.y[k] = P.y[l]; P.m[k] = P.m[l]; P.s[k] = P.s[l]; P.b[k] = P.b[l]; P.age[k] = P.age[l]; }
}

// ---------- 大きい粒の点を動かす ----------
let randSpare = null;
function randn() {
  if (randSpare !== null) { const r = randSpare; randSpare = null; return r; }
  let u = 0, v = 0; while (u === 0) u = Math.random(); v = Math.random();
  const r = Math.sqrt(-2 * Math.log(u)); randSpare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v);
}
function curK() { return K_EDDY + (K_EDDY_STIR - K_EDDY) * D.stir; }

function stepParticles(dt, st) {
  const K = curK(), sig = Math.sqrt(2 * K * dt);
  const pur = st.purifier ? FURN.find(f => f.key === 'pur') : null;
  const purI0 = pur ? Math.round(pur.x0 / DX) : -9, purI1 = pur ? Math.round(pur.x1 / DX) : -9, purEff = PURIFIER.eff;
  const acF = FURN.find(f => f.key === 'ac'), acI0 = Math.round(acF.x0 / DX), acI1 = Math.round(acF.x1 / DX), acJ0 = Math.round(acF.y0 / DX);
  for (let k = P.n - 1; k >= 0; k--) {
    const b = P.b[k], vs = BINS[b].vs;
    let x = P.x[k], y = P.y[k];
    const u = sampleU(x, y), v = sampleV(x, y) - vs;
    let dxT = u * dt + sig * randn(), dyT = v * dt + sig * randn();
    // 1マスより短い歩幅に分けて、家具・壁をすべらせる
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dxT), Math.abs(dyT)) / (0.8 * DX)));
    const sx = dxT / n, sy = dyT / n;
    let gone = false;
    for (let q = 0; q < n && !gone; q++) {
      let nx = x + sx, ny = y + sy;
      // 外へ出る所
      if (nx < 0) {
        const j = Math.floor(y / DX);
        if (st.window && j >= WINDOW.j0 && j < WINDOW.j1) { D.tot.out[P.s[k]] += P.m[k]; gone = true; break; }
        nx = -nx;
      }
      if (nx >= ROOM_W) {
        const j = Math.floor(y / DX);
        if (j >= DOOR.j0 && j < DOOR.j1 && st.vent) { D.tot.out[P.s[k]] += P.m[k]; gone = true; break; }
        nx = 2 * ROOM_W - nx - 1e-4;
      }
      if (ny >= ROOM_H) ny = 2 * ROOM_H - ny - 1e-4;
      if (ny < 0) ny = 1e-4;
      const i1 = Math.floor(nx / DX), j1 = Math.floor(ny / DX);
      if (!isSolid(i1, j1)) { x = nx; y = ny; continue; }
      // ぶつかったら、動ける向きだけ動く
      if (!isSolid(i1, Math.floor(y / DX))) x = nx;
      else if (!isSolid(Math.floor(x / DX), j1)) y = ny;
    }
    if (gone) { kill(k); continue; }
    const i = Math.floor(x / DX), j = Math.floor(y / DX), c = ix(i, j);
    // 空気清浄機に吸われる（吸いこみ口の前のマス）
    if (pur && (i === purI0 - 1 || i === purI1) && j >= 1 && j < 8) {   // 両横の吸いこみ口
      const uin = i === purI1 ? Math.max(0, -fu[uI(purI1, j)]) : Math.max(0, fu[uI(purI0, j)]);
      if (Math.random() < 1 - Math.exp(-uin * dt / DX)) {
        if (Math.random() < purEff[b]) { D.tot.pur[P.s[k]] += P.m[k]; kill(k); continue; }
      }
    }
    // エアコンに吸われる（上の吸いこみ口）→ 大きい粒はフィルターに、あとは吹き出し口から出る（推定）
    if (st.ac && j === NY - 1 && i >= acI0 && i < acI1) {
      const vin = Math.max(0, -fv[vI(i, NY - 1)]);   // 吸いこみ口（エアコンの上の面）へ下向きに入る速さ
      if (Math.random() < 1 - Math.exp(-vin * dt / DX)) {
        if (Math.random() < [0, 0, 0, 0.3, 0.7, 0.9][b]) { D.tot.ac[P.s[k]] += P.m[k]; kill(k); continue; }
        x = (i + 0.5) * DX; y = (acJ0 - 0.5) * DX;
      }
    }
    // 面に付く（その面に接するマスにいるとき、付く速さ × dt / DX の確からしさで）
    const dep = D.stir > 0.3 ? BINS[b].depStir : BINS[b].dep;
    let f = faceAt.up[c];
    if (f >= 0 && Math.random() < 1 - Math.exp(-dep.up * dt / DX)) { FACES[f].dep[di(P.s[k], b)] += P.m[k]; kill(k); continue; }
    f = faceAt.wl[c] >= 0 ? faceAt.wl[c] : faceAt.wr[c];
    if (f >= 0 && Math.random() < 1 - Math.exp(-dep.wall * dt / DX)) { FACES[f].dep[di(P.s[k], b)] += P.m[k]; kill(k); continue; }
    P.x[k] = x; P.y[k] = y; P.age[k] += dt;
  }
}

// ---------- 小さい粒（部屋全体で1つの濃さ） ----------
function upArea() { return FACES.filter(f => f.o === 'up').length * FACE_AREA; }
function stepBox(dt, st) {
  const V = D.V, lamVent = st.vent ? VENT_ACH / 3600 : 0, lamWin = D.lamWin, lamPur = st.purifier ? PURIFIER.q / V : 0;
  D.lamVent = lamVent; D.lamPur = lamPur;
  const stirred = D.stir > 0.3;
  // 面の向きごとの広さ
  let aUp = 0, aWall = 0, aDown = 0;
  for (const f of FACES) { if (f.o === 'up') aUp++; else if (f.o === 'wall') aWall++; else aDown++; }
  aUp *= FACE_AREA; aWall *= FACE_AREA; aDown *= FACE_AREA;
  for (let b = 0; b < NB; b++) {
    if (!BINS[b].box) continue;
    const dep = stirred ? BINS[b].depStir : BINS[b].dep;
    const lamDep = (dep.up * aUp + dep.wall * aWall + dep.down * aDown) / V;
    for (let s = 0; s < NS; s++) {
      const k = di(s, b);
      // 外から入る分 µg/m³/s
      let cOut = 0;
      if (s === SI.soot) cOut = OUTDOOR.soot * SPLIT.soot[b];
      else if (s === SI.soil) cOut = OUTDOOR.soilAir * SPLIT.soilAir[b];
      const srcIn = lamVent * cOut * VENT_PASS[b] + lamWin * cOut;
      D.tot.emit[s] += srcIn * V * dt;
      const L = lamVent + lamWin + lamPur * PURIFIER.eff[b] + lamDep;
      const cInf = srcIn / L, c0 = D.box[k];
      const e = Math.exp(-L * dt), c1 = cInf + (c0 - cInf) * e;
      const integ = cInf * dt + (c0 - cInf) * (1 - e) / L;   // ∫C dt
      D.box[k] = c1;
      const vol = integ * V;
      D.tot.out[s] += (lamVent + lamWin) * vol;
      D.tot.pur[s] += lamPur * PURIFIER.eff[b] * vol;
      // 面へ（向きごとの付く速さ × 広さ）
      const perUp = integ * dep.up * FACE_AREA, perWall = integ * dep.wall * FACE_AREA, perDown = integ * dep.down * FACE_AREA;
      for (const f of FACES) f.dep[k] += f.o === 'up' ? perUp : f.o === 'wall' ? perWall : perDown;
    }
  }
}

// ---------- 舞い上がる・取れる ----------
// 面のほこりのうち frac（大きさごとの配列か数）を空気へ
function disturb(f, frac, site = 'resusp') {
  const F = FACES[f];
  for (let s = 0; s < NS; s++) for (let b = 0; b < NB; b++) {
    const k = di(s, b), r = typeof frac === 'number' ? frac : frac[b], m = F.dep[k] * r;
    if (m <= 0) continue;
    F.dep[k] -= m;
    addAir(site + f, F.x, F.y + 0.03, s, b, m, 0.03);
  }
}
// 面のほこりのうち frac を取りのぞく（掃除機・拭き掃除）
function removeFrom(f, frac, bucket) {
  const F = FACES[f], out = [];
  for (let s = 0; s < NS; s++) for (let b = 0; b < NB; b++) {
    const k = di(s, b), r = typeof frac === 'number' ? frac : frac[b], m = F.dep[k] * r;
    if (m <= 0) continue;
    F.dep[k] -= m; D.tot[bucket][s] += m;
    out.push([s, b, m]);
  }
  return out;
}
// 強い風が床をなでたときの舞い上がり（毎コマ）
function windResuspend(dt) {
  for (let f = 0; f < FACES.length; f++) {
    const F = FACES[f]; if (F.o !== 'up') continue;
    const U = speedAt(F.x, F.y + 0.5 * DX);
    if (U <= 0.5) continue;
    const e = (U - 0.5) * (U - 0.5);
    disturb(f, RESUSP_WIND.map(r => 1 - Math.exp(-r * e * dt)), 'wind');
  }
}

// ---------- まとめの数 ----------
function faceGm2(F) { let m = 0; for (let k = 0; k < F.dep.length; k++) m += F.dep[k]; return m * 1e-6 / FACE_AREA; }
function airborne() {   // 部屋の平均 µg/m³ { fine, coarse, bySrc }
  let fine = 0, coarse = 0; const bySrc = new Float64Array(NS);
  for (let s = 0; s < NS; s++) for (let b = 0; b < NB; b++) if (BINS[b].box) { fine += D.box[di(s, b)]; bySrc[s] += D.box[di(s, b)]; }
  for (let k = 0; k < P.n; k++) { const c = P.m[k] / D.V; coarse += c; bySrc[P.s[k]] += c; }
  for (const p of D.pend.values()) { const c = p.m / D.V; if (BINS[p.b].box) continue; coarse += c; bySrc[p.s] += c; }
  return { fine, coarse, bySrc };
}
// 場所の名前ごとの合計（µg と広さ）
function byPlace() {
  const out = {};
  for (const F of FACES) {
    const o = out[F.place] || (out[F.place] = { m: 0, n: 0, src: new Float64Array(NS), bin: new Float64Array(NB) });
    o.n++;
    for (let s = 0; s < NS; s++) for (let b = 0; b < NB; b++) { const m = F.dep[di(s, b)]; o.m += m; o.src[s] += m; o.bin[b] += m; }
  }
  for (const k in out) out[k].gm2 = out[k].m * 1e-6 / (out[k].n * FACE_AREA);
  return out;
}
// 量の帳じり（出た = 空気中 + 積もった + ふとん + 取りのぞいた）。ずれの割合を返す
function massBalance() {
  let emitted = 0, gone = 0, air = 0, dep = 0, bed = 0;
  for (let s = 0; s < NS; s++) { emitted += D.tot.emit[s]; gone += D.tot.out[s] + D.tot.pur[s] + D.tot.vac[s] + D.tot.wipe[s] + D.tot.ac[s] + D.tot.wash[s]; }
  for (let k = 0; k < D.box.length; k++) air += D.box[k] * D.V;
  for (let k = 0; k < P.n; k++) air += P.m[k];
  for (const p of D.pend.values()) air += p.m;
  for (const F of FACES) for (let k = 0; k < F.dep.length; k++) dep += F.dep[k];
  for (let k = 0; k < D.bed.length; k++) bed += D.bed[k];
  return { emitted, air, dep, bed, gone, err: emitted > 0 ? (air + dep + bed + gone - emitted) / emitted : 0 };
}
// 点の重さを、点の数が多すぎず少なすぎないように変える（1コマに生まれた数と、浮いている数で）
const spawnedBin = new Float64Array(NB);
function tuneDots() {
  const alive = new Float64Array(NB);
  for (let k = 0; k < P.n; k++) alive[P.b[k]]++;
  for (let b = 0; b < NB; b++) {
    if (BINS[b].box) continue;
    if (spawnedBin[b] > 40 || alive[b] > 1800) D.mDot[b] = Math.min(1e4, D.mDot[b] * 1.25);
    else if (spawnedBin[b] < 5 && alive[b] < 600 && D.mDot[b] > 0.4) D.mDot[b] = Math.max(0.4, D.mDot[b] / 1.05);
    spawnedBin[b] = 0;
  }
}
