// ほこりが積もるまで — 部屋の空気の流れ（2次元・MAC 格子・セミラグランジュ＋投影）
// 断面を奥行き方向にならした流れ。2次元の流量 = 体積の流量 ÷ 奥行き DEPTH。
'use strict';

const NU1 = NX + 1, NV1 = NY + 1;
const fu = new Float32Array(NU1 * NY), fv = new Float32Array(NX * NV1);      // 面の速度 m/s
const tu = new Float32Array(NU1 * NY), tv = new Float32Array(NX * NV1);
const phi = new Float32Array(NX * NY);
const uFix = new Float32Array(NU1 * NY), vFix = new Float32Array(NX * NV1);   // NaN でない面は決まった速度
const uFree = new Uint8Array(NU1 * NY), vFree = new Uint8Array(NX * NV1);    // 1 = 圧力で動く面
const uOpen = new Uint8Array(NU1 * NY);                                       // 1 = 外（圧力 0）とつながる面（窓）
const FLOW_DT = 0.1, FLOW_NU = 0.003, FLOW_DAMP = 0.05, SOR_IT = 40, SOR_W = 1.7;
const uI = (i, j) => i + j * NU1, vI = (i, j) => i + j * NX;
let JETS = [];          // 噴流など: { i0, i1, j0, j1, u, v, rate }（この範囲の速度を目標へ寄せる）
let flowInfo = { qIn: 0, qWin: 0 };   // 外から入る量（m³/s、体積）

// 開口・機器の状態から、面の種類と決まった速度を作る
function setupFaces(st) {
  uFix.fill(NaN); vFix.fill(NaN); uFree.fill(0); vFree.fill(0); uOpen.fill(0);
  for (let j = 0; j < NY; j++) for (let i = 1; i < NX; i++) if (!isSolid(i - 1, j) && !isSolid(i, j)) uFree[uI(i, j)] = 1;
  for (let j = 1; j < NY; j++) for (let i = 0; i < NX; i++) if (!isSolid(i, j - 1) && !isSolid(i, j)) vFree[vI(i, j)] = 1;
  const V = fluidCount() * CELL_VOL;
  let qVent = 0;
  if (st.vent) {   // 給気口から入り、ドアの下から出る（24時間換気）
    qVent = VENT_ACH * V / 3600;
    const q2 = qVent / DEPTH;
    for (let j = VENT.j0; j < VENT.j1; j++) uFix[uI(0, j)] = q2 / ((VENT.j1 - VENT.j0) * DX);
    for (let j = DOOR.j0; j < DOOR.j1; j++) uFix[uI(NX, j)] = q2 / ((DOOR.j1 - DOOR.j0) * DX);
  }
  if (st.window) for (let j = WINDOW.j0; j < WINDOW.j1; j++) { uFree[uI(0, j)] = 1; uOpen[uI(0, j)] = 1; }
  const box = k => FURN.find(f => f.key === k);
  if (st.purifier) {   // 横から吸って上へ吹く
    const f = box('pur'), i0 = Math.round(f.x0 / DX), i1 = Math.round(f.x1 / DX), jt = Math.round(f.y1 / DX);
    const q2 = PURIFIER.q / DEPTH, ja = 1, jb = 8;
    for (let j = ja; j < jb; j++) { uFix[uI(i0, j)] = q2 / 2 / ((jb - ja) * DX); uFix[uI(i1, j)] = -q2 / 2 / ((jb - ja) * DX); }
    for (let i = i0; i < i1; i++) vFix[vI(i, jt)] = q2 / ((i1 - i0) * DX);
  }
  if (st.ac) {         // 上から吸って下（左ななめ下）へ吹く。風量 10 m³/分（推定）
    const f = box('ac'), i0 = Math.round(f.x0 / DX), i1 = Math.round(f.x1 / DX), j0 = Math.round(f.y0 / DX), j1 = Math.round(f.y1 / DX);
    const q2 = (10 / 60) / DEPTH;
    for (let i = i0; i < i1; i++) { vFix[vI(i, j1)] = -q2 / ((i1 - i0) * DX); vFix[vI(i, j0)] = -q2 / ((i1 - i0) * DX); }
  }
  flowInfo.qVent = qVent;
}

function sampleU(x, y) {   // u は (i·DX, (j+0.5)·DX) に置いてある
  let gx = x / DX, gy = y / DX - 0.5;
  gx = Math.max(0, Math.min(NX, gx)); gy = Math.max(0, Math.min(NY - 1, gy));
  const i = Math.min(NX - 1, Math.floor(gx)), j = Math.min(NY - 2, Math.floor(gy)), a = gx - i, b = gy - j;
  return (1 - b) * ((1 - a) * fu[uI(i, j)] + a * fu[uI(i + 1, j)]) + b * ((1 - a) * fu[uI(i, j + 1)] + a * fu[uI(i + 1, j + 1)]);
}
function sampleV(x, y) {   // v は ((i+0.5)·DX, j·DX)
  let gx = x / DX - 0.5, gy = y / DX;
  gx = Math.max(0, Math.min(NX - 1, gx)); gy = Math.max(0, Math.min(NY, gy));
  const i = Math.min(NX - 2, Math.floor(gx)), j = Math.min(NY - 1, Math.floor(gy)), a = gx - i, b = gy - j;
  return (1 - b) * ((1 - a) * fv[vI(i, j)] + a * fv[vI(i + 1, j)]) + b * ((1 - a) * fv[vI(i, j + 1)] + a * fv[vI(i + 1, j + 1)]);
}

function applyFixed() {
  for (let k = 0; k < fu.length; k++) { if (!isNaN(uFix[k])) fu[k] = uFix[k]; else if (!uFree[k]) fu[k] = 0; }
  for (let k = 0; k < fv.length; k++) { if (!isNaN(vFix[k])) fv[k] = vFix[k]; else if (!vFree[k]) fv[k] = 0; }
}

function flowStep(dt) {
  // 1. 噴流・上昇流・歩く人などを目標の速度へ寄せる
  for (const J of JETS) {
    const r = 1 - Math.exp(-J.rate * dt);
    for (let j = J.j0; j < J.j1; j++) for (let i = J.i0; i < J.i1; i++) {
      if (i < 0 || i >= NX || j < 0 || j >= NY || isSolid(i, j)) continue;
      if (J.u !== undefined) { const a = uI(i, j), b = uI(i + 1, j); if (uFree[a]) fu[a] += (J.u - fu[a]) * r; if (uFree[b]) fu[b] += (J.u - fu[b]) * r; }
      if (J.v !== undefined) { const a = vI(i, j), b = vI(i, j + 1); if (vFree[a]) fv[a] += (J.v - fv[a]) * r; if (vFree[b]) fv[b] += (J.v - fv[b]) * r; }
    }
  }
  applyFixed();
  // 2. 移流（セミラグランジュ）
  for (let j = 0; j < NY; j++) for (let i = 0; i <= NX; i++) {
    const k = uI(i, j); if (!uFree[k]) { tu[k] = fu[k]; continue; }
    const x = i * DX, y = (j + 0.5) * DX, u = fu[k], v = sampleV(x, y);
    tu[k] = sampleU(x - u * dt, y - v * dt);
  }
  for (let j = 0; j <= NY; j++) for (let i = 0; i < NX; i++) {
    const k = vI(i, j); if (!vFree[k]) { tv[k] = fv[k]; continue; }
    const x = (i + 0.5) * DX, y = j * DX, v = fv[k], u = sampleU(x, y);
    tv[k] = sampleV(x - u * dt, y - v * dt);
  }
  // 3. 粘り（乱れの粘りの代わり）と、奥行き方向の抵抗の代わりの弱め
  const c = FLOW_NU * dt / (DX * DX), damp = Math.exp(-FLOW_DAMP * dt);
  for (let j = 0; j < NY; j++) for (let i = 1; i < NX; i++) {
    const k = uI(i, j); if (!uFree[k]) { fu[k] = tu[k]; continue; }
    const l = tu[uI(i - 1, j)], r = tu[uI(i + 1, j)], d = j > 0 ? tu[uI(i, j - 1)] : 0, t = j < NY - 1 ? tu[uI(i, j + 1)] : 0;
    fu[k] = (tu[k] + c * (l + r + d + t - 4 * tu[k])) * damp;
  }
  for (let j = 1; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = vI(i, j); if (!vFree[k]) { fv[k] = tv[k]; continue; }
    const l = i > 0 ? tv[vI(i - 1, j)] : 0, r = i < NX - 1 ? tv[vI(i + 1, j)] : 0, d = tv[vI(i, j - 1)], t = tv[vI(i, j + 1)];
    fv[k] = (tv[k] + c * (l + r + d + t - 4 * tv[k])) * damp;
  }
  for (let j = 0; j < NY; j++) { const k = uI(0, j); if (uOpen[k]) fu[k] = tu[k] * damp; }
  applyFixed();
  project();
}

// 投影: Σ_自由な面 (φc − φn) = −DX·div* を SOR で解き、速度から勾配を引く
function project() {
  for (let it = 0; it < SOR_IT; it++) {
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const c = ix(i, j); if (solid[c]) continue;
      let n = 0, s = 0;
      const e = uI(i + 1, j), w = uI(i, j), no = vI(i, j + 1), so = vI(i, j);
      const div = fu[e] - fu[w] + fv[no] - fv[so];
      if (uFree[e]) { n++; s += i + 1 < NX ? phi[c + 1] : 0; }
      if (uFree[w]) { n++; s += i > 0 ? phi[c - 1] : 0; }
      if (vFree[no]) { n++; s += phi[c + NX]; }
      if (vFree[so]) { n++; s += phi[c - NX]; }
      if (!n) continue;
      const target = (s - DX * div) / n;
      phi[c] += SOR_W * (target - phi[c]);
    }
  }
  // 勾配を引くのは最後に1回（反復の中では div* は固定して φ を解いている）
  for (let j = 0; j < NY; j++) for (let i = 0; i <= NX; i++) {
    const k = uI(i, j); if (!uFree[k]) continue;
    const pr = i < NX ? phi[ix(i, j)] : 0, pl = i > 0 ? phi[ix(i - 1, j)] : 0;
    fu[k] -= (pr - pl) / DX;
  }
  for (let j = 1; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = vI(i, j); if (!vFree[k]) continue;
    fv[k] -= (phi[ix(i, j)] - phi[ix(i, j - 1)]) / DX;
  }
}

// 外から窓を通って入る体積の流量 m³/s
function windowInflow() {
  let q = 0;
  for (let j = WINDOW.j0; j < WINDOW.j1; j++) { const u = fu[uI(0, j)]; if (u > 0) q += u * DX * DEPTH; }
  return q;
}
function maxDiv() {
  let m = 0;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (!solid[ix(i, j)]) {
    m = Math.max(m, Math.abs(fu[uI(i + 1, j)] - fu[uI(i, j)] + fv[vI(i, j + 1)] - fv[vI(i, j)]) / DX);
  }
  return m;
}
function speedAt(x, y) { return Math.hypot(sampleU(x, y), sampleV(x, y)); }
