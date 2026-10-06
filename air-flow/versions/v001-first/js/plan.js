// ================= grid and floor plan =================
// The plan is a 2LDK flat seen from above (same layout as wifi-wave, snapped to 10 cm).
// x → right, y → down, in metres; top of the screen is north.
'use strict';
const DX = 0.1;                 // m per cell
const W = 96, H = 60;           // cells (9.6 m × 6.0 m)
const HCEIL = 2.4;              // ceiling height (m) — 2D fluxes are spread over this height
const RHO = 1.2;                // air density (kg/m³)
const FLUID = 0, WALL = 1, OUT = 2, FURN = 3;

const cell = new Uint8Array(W * H);      // FLUID / WALL / OUT / FURN
const doorOf = new Int16Array(W * H).fill(-1);  // index into DOORS for door cells

const ci = (x) => Math.round(x / DX);
function fillRect(type, x0, y0, x1, y1) {
  for (let j = Math.max(0, ci(y0)); j < Math.min(H, ci(y1)); j++)
    for (let i = Math.max(0, ci(x0)); i < Math.min(W, ci(x1)); i++) cell[j * W + i] = type;
}
function cellsIn(x0, y0, x1, y1) {
  const out = [];
  for (let j = Math.max(0, ci(y0)); j < Math.min(H, ci(y1)); j++)
    for (let i = Math.max(0, ci(x0)); i < Math.min(W, ci(x1)); i++) out.push(j * W + i);
  return out;
}

// rooms: label position, and the rectangle used for the room's mean age
const ROOMS = [
  { key: 'r1',   name: '洋室1',   rect: [0.7, 0.7, 3.5, 2.5] },
  { key: 'r2',   name: '洋室2',   rect: [0.7, 3.5, 3.5, 5.3] },
  { key: 'hall', name: '廊下・玄関', rect: [0.7, 2.6, 5.6, 3.4], label: [2.0, 3.0] },
  { key: 'bath', name: '浴室',    rect: [3.6, 0.7, 5.6, 1.7], label: [4.75, 1.2] },
  { key: 'wash', name: '洗面',    rect: [3.6, 1.8, 5.6, 2.5] },
  { key: 'wc',   name: 'トイレ',  rect: [3.6, 3.5, 4.6, 5.3] },
  { key: 'ldk',  name: 'LDK',     rect: [5.7, 0.7, 8.9, 5.3], label: [7.6, 3.0] },
];

// interior doors (cells cut out of a wall line). beta = how much air the closed door lets through
// (undercut ≈ 1 cm under the door; the bathroom door has a louvre)
const DOORS = [
  { key: 'd1',   name: '洋室1のドア', rect: [2.6, 2.5, 3.4, 2.6], hinge: [2.6, 2.6], swing: -1, beta: .05 },
  { key: 'd2',   name: '洋室2のドア', rect: [2.6, 3.4, 3.4, 3.5], hinge: [2.6, 3.4], swing: 1,  beta: .05 },
  { key: 'dw',   name: '洗面のドア',   rect: [4.0, 2.5, 4.8, 2.6], hinge: [4.8, 2.6], swing: -1, beta: .05 },
  { key: 'db',   name: '浴室のドア',   rect: [4.2, 1.7, 4.9, 1.8], hinge: [4.9, 1.8], swing: 1,  beta: .2, louvre: true },
  { key: 'dt',   name: 'トイレのドア', rect: [3.8, 3.4, 4.5, 3.5], hinge: [4.5, 3.4], swing: 1,  beta: .05 },
  { key: 'dl',   name: 'LDKのドア',    rect: [5.6, 2.6, 5.7, 3.4], hinge: [5.7, 2.6], swing: 1,  beta: .05, glass: true },
];

// openings in the outer wall. facade W = corridor side (west), E = balcony side (east).
// w = width (m), h = height of the opening (m). inner = the fluid cells just inside.
const OPENINGS = [
  { key: 'w1', kind: 'window', name: '洋室1の窓', facade: 'W', rect: [0.5, 1.1, 0.7, 2.3], w: 1.2, h: 1.1 },
  { key: 'w2', kind: 'window', name: '洋室2の窓', facade: 'W', rect: [0.5, 3.8, 0.7, 5.0], w: 1.2, h: 1.1 },
  { key: 'w3', kind: 'window', name: 'LDKの窓（北）', facade: 'E', rect: [8.9, 1.1, 9.1, 2.9], w: 1.8, h: 2.0 },
  { key: 'w4', kind: 'window', name: 'LDKの窓（南）', facade: 'E', rect: [8.9, 3.1, 9.1, 4.9], w: 1.8, h: 2.0 },
  { key: 'fd', kind: 'door',   name: '玄関ドア',  facade: 'W', rect: [0.5, 2.6, 0.7, 3.4], w: 0.8, h: 2.0 },
  { key: 'v1', kind: 'vent',   name: '洋室1の給気口', facade: 'W', rect: [0.5, 0.8, 0.7, 0.9], w: 0.1 },
  { key: 'v2', kind: 'vent',   name: '洋室2の給気口', facade: 'W', rect: [0.5, 5.1, 0.7, 5.2], w: 0.1 },
  { key: 'v3', kind: 'vent',   name: 'LDKの給気口',   facade: 'E', rect: [8.9, 0.8, 9.1, 0.9], w: 0.1 },
];
// exhaust fans (ceiling / hood). q = flow at zero pressure (m³/h), p = pressure where the flow stops (Pa)
const FANS = [
  { key: 'fb', name: '浴室の換気扇', rect: [3.7, 0.8, 3.9, 1.0], facade: 'W', levels: [null, { q: 55, p: 45 }, { q: 100, p: 90 }], lvName: ['切', '24時間（弱）', '強'] },
  { key: 'ft', name: 'トイレの換気扇', rect: [3.9, 4.9, 4.1, 5.1], facade: 'W', levels: [null, { q: 30, p: 40 }, { q: 60, p: 70 }], lvName: ['切', '弱', '強'] },
  { key: 'fk', name: 'キッチンの換気扇', rect: [6.9, 0.7, 7.5, 0.8], facade: 'E', hood: true, levels: [null, { q: 250, p: 110 }, { q: 450, p: 230 }], lvName: ['切', '弱', '強'] },
];
// air conditioners: blow a jet from the wall into the room (they take the same air back in: no net flow)
const ACS = [
  { key: 'ac1', name: 'LDKのエアコン',   x: 7.4, y: 5.3, ang: -90, w: 0.8 },
  { key: 'ac2', name: '洋室1のエアコン', x: 1.7, y: 0.7, ang: 90,  w: 0.8 },
];
const AC_SPEED = [0, 0.8, 1.5];       // slice velocity just off the louvre (m/s), off / 弱 / 強
const CIRC_SPEED = [0, 2.5, 4.0];     // circulator outlet velocity (m/s), off / 弱 / 強
const CIRC_D = 0.25;                  // circulator diameter (m)

const LEAK_C = 2.0;                   // C value: equivalent leakage area per floor area (cm²/m²)
const VENT_AA = 0.004;                // effective area of one supply vent (m²), φ100 with filter
const CD = 0.6;                       // discharge coefficient of a window / door

function buildPlan() {
  cell.fill(OUT);
  fillRect(WALL, 0.5, 0.5, 9.1, 5.5);
  fillRect(FLUID, 0.7, 0.7, 8.9, 5.3);
  // corridor walls
  fillRect(WALL, 0.7, 2.5, 5.7, 2.6);
  fillRect(WALL, 0.7, 3.4, 5.7, 3.5);
  // bedroom / bath block walls
  fillRect(WALL, 3.5, 0.7, 3.6, 2.5);
  fillRect(WALL, 3.5, 3.5, 3.6, 5.3);
  fillRect(WALL, 5.6, 0.7, 5.7, 5.3);
  fillRect(WALL, 3.6, 1.7, 5.6, 1.8);
  fillRect(WALL, 4.6, 3.5, 4.7, 5.3);
  fillRect(FURN, 4.7, 3.5, 5.6, 5.3);   // storage
  fillRect(FURN, 5.8, 0.8, 6.4, 1.4);   // fridge
  // door cells
  doorOf.fill(-1);
  DOORS.forEach((d, k) => { d.cells = cellsIn(...d.rect); for (const c of d.cells) { cell[c] = FLUID; doorOf[c] = k; } });
  // openings: inner cells along the inside of the outer wall
  for (const o of OPENINGS) {
    const [x0, y0, x1, y1] = o.rect;
    o.inner = o.facade === 'W' ? cellsIn(0.7, y0, 0.8, y1) : cellsIn(8.8, y0, 8.9, y1);
    o.normal = o.facade === 'W' ? [1, 0] : [-1, 0];   // into the room
  }
  for (const f of FANS) f.cells = cellsIn(...f.rect);
  for (const r of ROOMS) {
    r.cells = cellsIn(...r.rect).filter(c => cell[c] === FLUID);
    if (!r.label) r.label = [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2];
  }
}

// ================= scenes (presets) =================
// st: element states. windows 0 閉 / 1 少し / 2 開ける, doors 0 閉 / 1 開, vents 0/1, fans 0/1/2, ac 0/1/2
const SCENES = [
  { key: '24h', name: '24時間換気だけ', sub: '窓を閉めた冬の夜',
    st: { v1: 1, v2: 1, v3: 1, fb: 1 }, wind: [270, 0],
    hint: '窓を閉めて、浴室の<b>24時間換気</b>だけで空気を入れかえている状態。各部屋の給気口から入った空気が、ドアの下のすき間を通って浴室へ流れます。<b>ドアや給気口を押して</b>、空気の古さの変化を見てみよう。',
    now: '<b>24時間換気だけ。</b>浴室の換気扇（弱）が家じゅうの空気を少しずつ引き出し、給気口から外の空気が入ります。ドアは閉めていて、下のすき間（約1cm）だけが通り道です。外は無風（風を吹かせると、風下の給気口から空気が出ていくこともあります）。' },
  { key: 'cross', name: '窓を2か所あける', sub: '風の通り道を作る',
    st: { w1: 2, w4: 2, d1: 1, dl: 1, v1: 1, v2: 1, v3: 1, fb: 1 }, wind: [270, 3],
    hint: '向かい合う2つの窓をあけると、風上の窓から入った空気が家を通りぬけて風下の窓から出ます。<b>風の向きを変えたり</b>、途中の<b>ドアを閉めたり</b>してみよう。',
    now: '<b>窓を2か所あける。</b>洋室1の窓（西）とLDKの窓（東）をあけ、間のドアも開けました。西から 3 m/s の風。' },
  { key: 'single', name: '窓を1か所だけ', sub: '通り道がないと？',
    st: { w4: 2, d1: 1, d2: 1, dl: 1, v1: 1, v2: 1, v3: 1, fb: 1 }, wind: [270, 3],
    hint: '窓を1つだけあけても、空気の出口がないと風は通りぬけません（風の乱れで窓の近くが少し入れかわるだけ）。<b>もう1つ窓をあける</b>と、どう変わる？',
    now: '<b>窓を1か所だけ。</b>LDKの窓（南）だけをあけました。風は西から 3 m/s。' },
  { key: 'door', name: '玄関と窓をあける', sub: 'マンションの通風',
    st: { fd: 1, w3: 2, dl: 1, v1: 1, v2: 1, v3: 1, fb: 1 }, wind: [90, 3],
    hint: 'マンションでは、玄関とバルコニーの窓が家の両側にある通り道。今は東（バルコニー側）からの風。<b>LDKのドアを閉める</b>と、通り道はどうなる？',
    now: '<b>玄関と窓をあける。</b>玄関ドアと LDK の窓（北）をあけ、LDKのドアも開けました。東から 3 m/s の風。' },
  { key: 'hood', name: 'キッチンの換気扇', sub: '強で回すと？',
    st: { fk: 2, fb: 1, v1: 0, v2: 0, v3: 0 }, wind: [270, 0],
    hint: '給気口を閉めたままキッチンの換気扇を強で回すと、入口がすき間しかないので<b>室内の気圧が大きく下がり</b>、思ったほど空気を引けません（玄関ドアが重くなるのもこのため）。力の弱い浴室の換気扇は気圧の差に負けて、空気を出せなくなります。<b>給気口をあけたり、窓を少しあけたり</b>してみよう。',
    now: '<b>キッチンの換気扇（強）。</b>給気口は3つとも閉め、窓も閉めています。外は無風。' },
  { key: 'circ', name: 'サーキュレーター', sub: 'よどんだ部屋に風を送る',
    st: { w1: 2, w4: 2, d1: 1, d2: 1, dl: 1, v1: 1, v2: 1, v3: 1, fb: 1 }, wind: [270, 3],
    circs: [{ x: 3.0, y: 3.0, ang: 110, lv: 2 }],
    hint: '窓を2か所あけても、風の通り道からはずれた部屋の空気はなかなか入れかわりません。洋室2の入口に置いた<b>サーキュレーターを押して止めたり</b>、ドラッグで動かしたりして、洋室2の空気の古さを比べてみよう。先の黄色い丸をドラッグすると向きが変わります。',
    now: '<b>サーキュレーター。</b>洋室1とLDKの窓をあけて西風を通した状態で、廊下から洋室2へ向けてサーキュレーター（強）で風を送っています。' },
];
