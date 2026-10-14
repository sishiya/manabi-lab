// ほこりが積もるまで — 部屋の形（家具・開口）と、ほこりが積もる「面」の一覧
'use strict';

// マスの種類
const FLUID = 0, SOLID = 1;
const solid = new Uint8Array(NX * NY);       // i + j*NX（j は床から上へ）
const ix = (i, j) => i + j * NX;

// 家具（m）。kind は描き方。label は面の名前
const FURN = [
  { key: 'bed',   label: 'ベッド',   x0: 0.10, x1: 1.10, y0: 0.20, y1: 0.50 },   // シングル（幅1m）を横から。脚のあいだは空き（ベッドの下）
  { key: 'legL',  label: 'ベッド',   x0: 0.10, x1: 0.15, y0: 0.0, y1: 0.20 },
  { key: 'legR',  label: 'ベッド',   x0: 1.05, x1: 1.10, y0: 0.0, y1: 0.20 },
  { key: 'desk',  label: '机',       x0: 2.75, x1: 3.55, y0: 0.70, y1: 0.75 },   // 右の壁ぎわの机
  { key: 'dlegL', label: '机',       x0: 2.75, x1: 2.80, y0: 0.0, y1: 0.70 },
  { key: 'dlegR', label: '机',       x0: 3.50, x1: 3.55, y0: 0.0, y1: 0.70 },
  { key: 'shelf', label: '棚',       x0: 2.85, x1: 3.60, y0: 1.75, y1: 1.80 },
  { key: 'ac',    label: 'エアコン', x0: 3.25, x1: 3.60, y0: 2.10, y1: 2.35 },
  { key: 'pur',   label: '空気清浄機', x0: 1.95, x1: 2.15, y0: 0.0, y1: 0.55 },   // ベッドと机のあいだ
];
// 開口（左の壁 = 外、右の壁の下 = ドアの下のすき間）
const WINDOW = { j0: Math.round(0.9 / DX), j1: Math.round(2.0 / DX) };   // 腰窓 0.9〜2.0m（j0 ≤ j < j1）
const VENT = { j0: Math.round(2.20 / DX), j1: Math.round(2.30 / DX) };   // 給気口（左の壁の上）
const DOOR = { j0: 0, j1: 1 };                                           // ドアの下のすき間（右の壁の下）
const DESK_X = 2.45, BED_X = [0.15, 1.05], WALK_X = [1.25, 1.85];   // 机にすわる位置（いす）・ベッドの上・歩く範囲

function fillBox(f) {
  const i0 = Math.round(f.x0 / DX), i1 = Math.round(f.x1 / DX), j0 = Math.round(f.y0 / DX), j1 = Math.round(f.y1 / DX);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (i >= 0 && i < NX && j >= 0 && j < NY) solid[ix(i, j)] = SOLID;
}
function isSolid(i, j) { return i < 0 || i >= NX || j < 0 || j >= NY || solid[ix(i, j)] === SOLID; }

// 面: ほこりがのる・付く所。o = 'up'（上向き。床・ベッドの上・棚の上）/'wall'（たて）/'down'（下向き。天井・机の裏）
// cell = 面に接する空気のマス。dep = 出どころ×大きさ の量 µg（NS*NB）
const FACES = [];
const faceAt = { up: new Int32Array(NX * NY).fill(-1), down: new Int32Array(NX * NY).fill(-1), wl: new Int32Array(NX * NY).fill(-1), wr: new Int32Array(NX * NY).fill(-1) };

function placeLabel(i, j, o) {
  const x = (i + 0.5) * DX, y = j * DX;
  if (o === 'up') {
    if (j === 0) {
      if (x > 0.15 && x < 1.05) return 'ベッドの下';
      if (x < 0.1) return 'ベッドと壁のすきま';
      if (isSolid(i - 1, j) || isSolid(i + 1, j) || i === NX - 1) return 'すみ・家具のきわ';
      if (x > 2.8 && x < 3.5) return '机の下';
      return '床';
    }
    if (y > 1.7 && y < 1.85) return '棚の上';
    if (y > 0.65 && y < 0.8) return '机の上';
    if (y > 0.45 && y < 0.6 && x < 1.2) return 'ベッドの上';
    if (y > 0.5 && x > 1.9 && x < 2.2) return '空気清浄機の上';
    if (y > 2) return 'エアコンの上';
    return '家具の上';
  }
  if (o === 'down') return j === NY - 1 ? '天井' : '家具の裏';
  if (i === 0 || i === NX - 1) return x < 0.1 && y > 0.9 && y < 2.0 ? '窓' : '壁';
  return '家具の横';
}

function buildRoom() {
  solid.fill(FLUID);
  for (const f of FURN) fillBox(f);
  FACES.length = 0;
  for (const k in faceAt) faceAt[k].fill(-1);
  const add = (i, j, o, side) => {
    const f = { i, j, o, side, place: placeLabel(i, j, o), dep: new Float64Array(NS * NB), x: 0, y: 0 };
    if (o === 'up') { f.x = (i + 0.5) * DX; f.y = j * DX; }
    else if (o === 'down') { f.x = (i + 0.5) * DX; f.y = (j + 1) * DX; }
    else { f.x = side < 0 ? i * DX : (i + 1) * DX; f.y = (j + 0.5) * DX; }
    // すみ: 床で、横が壁・家具（掃除機のノズルが届きにくい）
    f.corner = o === 'up' && (isSolid(i - 1, j) || isSolid(i + 1, j));
    f.underBed = f.place === 'ベッドの下';
    FACES.push(f); return FACES.length - 1;
  };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (isSolid(i, j)) continue;
    const c = ix(i, j);
    if (isSolid(i, j - 1)) faceAt.up[c] = add(i, j, 'up', 0);
    if (isSolid(i, j + 1)) faceAt.down[c] = add(i, j, 'down', 0);
    if (isSolid(i - 1, j) && !(i === 0 && isOpening(j, -1))) faceAt.wl[c] = add(i, j, 'wall', -1);
    if (isSolid(i + 1, j) && !(i === NX - 1 && isOpening(j, 1))) faceAt.wr[c] = add(i, j, 'wall', 1);
  }
}
// 外とつながる所（窓は開いているときだけ空気が通るが、面としては窓ガラスがある）
function isOpening(j, side) {
  if (side < 0) return j >= VENT.j0 && j < VENT.j1;
  return j >= DOOR.j0 && j < DOOR.j1;
}
function fluidCount() { let n = 0; for (let k = 0; k < NX * NY; k++) if (!solid[k]) n++; return n; }
