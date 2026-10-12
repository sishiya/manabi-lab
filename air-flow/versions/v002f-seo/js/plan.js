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
  { key: 'r1',   name: L('洋室1','Bedroom 1'), rect: [0.7, 0.7, 3.5, 2.5] },
  { key: 'r2',   name: L('洋室2','Bedroom 2'), rect: [0.7, 3.5, 3.5, 5.3] },
  { key: 'hall', name: L('廊下・玄関','Hall / entrance'), rect: [0.7, 2.6, 5.6, 3.4], label: [2.0, 3.0] },
  { key: 'bath', name: L('浴室','Bath'), rect: [3.6, 0.7, 5.6, 1.7], label: [4.75, 1.2] },
  { key: 'wash', name: L('洗面','Washroom'), rect: [3.6, 1.8, 5.6, 2.5] },
  { key: 'wc',   name: L('トイレ','Toilet'), rect: [3.6, 3.5, 4.6, 5.3] },
  { key: 'ldk',  name: L('LDK','Living / kitchen'), rect: [5.7, 0.7, 8.9, 5.3], label: [7.6, 3.0] },
];

// interior doors (cells cut out of a wall line). beta = how much air the closed door lets through
// (undercut ≈ 1 cm under the door; the bathroom door has a louvre)
const DOORS = [
  { key: 'd1',   name: L('洋室1のドア','Bedroom 1 door'), rect: [2.6, 2.5, 3.4, 2.6], hinge: [2.6, 2.6], swing: -1, beta: .05 },
  { key: 'd2',   name: L('洋室2のドア','Bedroom 2 door'), rect: [2.6, 3.4, 3.4, 3.5], hinge: [2.6, 3.4], swing: 1,  beta: .05 },
  { key: 'dw',   name: L('洗面のドア','Washroom door'),  rect: [4.0, 2.5, 4.8, 2.6], hinge: [4.8, 2.6], swing: -1, beta: .05 },
  { key: 'db',   name: L('浴室のドア','Bathroom door'),  rect: [4.2, 1.7, 4.9, 1.8], hinge: [4.9, 1.8], swing: 1,  beta: .2, louvre: true },
  { key: 'dt',   name: L('トイレのドア','Toilet door'), rect: [3.8, 3.4, 4.5, 3.5], hinge: [4.5, 3.4], swing: 1,  beta: .05 },
  { key: 'dl',   name: L('LDKのドア','Living room door'),  rect: [5.6, 2.6, 5.7, 3.4], hinge: [5.7, 2.6], swing: 1,  beta: .05, glass: true },
];

// openings in the outer wall. facade W = corridor side (west), E = balcony side (east).
// w = width (m), h = height of the opening (m). inner = the fluid cells just inside.
const OPENINGS = [
  { key: 'w1', kind: 'window', name: L('洋室1の窓','Bedroom 1 window'), facade: 'W', rect: [0.5, 1.1, 0.7, 2.3], w: 1.2, h: 1.1 },
  { key: 'w2', kind: 'window', name: L('洋室2の窓','Bedroom 2 window'), facade: 'W', rect: [0.5, 3.8, 0.7, 5.0], w: 1.2, h: 1.1 },
  { key: 'w3', kind: 'window', name: L('LDKの窓（北）','Living room window (north)'), facade: 'E', rect: [8.9, 1.1, 9.1, 2.9], w: 1.8, h: 2.0 },
  { key: 'w4', kind: 'window', name: L('LDKの窓（南）','Living room window (south)'), facade: 'E', rect: [8.9, 3.1, 9.1, 4.9], w: 1.8, h: 2.0 },
  { key: 'fd', kind: 'door',   name: L('玄関ドア','Front door'), facade: 'W', rect: [0.5, 2.6, 0.7, 3.4], w: 0.8, h: 2.0 },
  { key: 'v1', kind: 'vent',   name: L('洋室1の給気口','Bedroom 1 vent'), facade: 'W', rect: [0.5, 0.8, 0.7, 0.9], w: 0.1 },
  { key: 'v2', kind: 'vent',   name: L('洋室2の給気口','Bedroom 2 vent'), facade: 'W', rect: [0.5, 5.1, 0.7, 5.2], w: 0.1 },
  { key: 'v3', kind: 'vent',   name: L('LDKの給気口','Living room vent'), facade: 'E', rect: [8.9, 0.8, 9.1, 0.9], w: 0.1 },
];
// exhaust fans (ceiling / hood). q = flow at zero pressure (m³/h), p = pressure where the flow stops (Pa)
const FANS = [
  { key: 'fb', name: L('浴室の換気扇','Bathroom fan'), rect: [3.7, 0.8, 3.9, 1.0], facade: 'W', levels: [null, { q: 55, p: 45 }, { q: 100, p: 90 }], lvName: [L('切','Off'), L('24時間（弱）','24h low'), L('強','High')] },
  { key: 'ft', name: L('トイレの換気扇','Toilet fan'), rect: [3.9, 4.9, 4.1, 5.1], facade: 'W', levels: [null, { q: 30, p: 40 }, { q: 60, p: 70 }], lvName: [L('切','Off'), L('弱','Low'), L('強','High')] },
  { key: 'fk', name: L('キッチンの換気扇','Kitchen hood fan'), rect: [6.9, 0.7, 7.5, 0.8], facade: 'E', hood: true, levels: [null, { q: 250, p: 110 }, { q: 450, p: 230 }], lvName: [L('切','Off'), L('弱','Low'), L('強','High')] },
];
// air conditioners: blow a jet from the wall into the room (they take the same air back in: no net flow)
const ACS = [
  { key: 'ac1', name: L('LDKのエアコン','Living room air conditioner'), x: 7.4, y: 5.3, ang: -90, w: 0.8 },
  { key: 'ac2', name: L('洋室1のエアコン','Bedroom 1 air conditioner'), x: 1.7, y: 0.7, ang: 90,  w: 0.8 },
];
const AC_SPEED = [0, 0.8, 1.5];       // slice velocity just off the louvre (m/s), off / 弱 / 強
const CIRC_SPEED = [0, 2.5, 4.0];     // circulator outlet velocity (m/s), off / 弱 / 強
const CIRC_D = 0.25;                  // circulator diameter (m)

const LEAK_C = 2.0;                   // C value: equivalent leakage area per floor area (cm²/m²)
const VENT_AA = 0.004;                // effective area of one fully open supply vent (m²), φ100 with filter
const VENT_OPEN = [0, .25, .5, 1];     // the dial on the vent: 閉 / 少し / 半分 / 全開 (share of the full area)
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
// st: element states. windows 0 閉 / 1 少し / 2 開ける, doors 0 閉 / 1 開, vents 0 閉 … 3 全開 (VENT_OPEN), fans 0/1/2, ac 0/1/2
const SCENES = [
  { key: '24h', name: L('24時間換気だけ', '24-hour ventilation only'), sub: L('窓を閉めた冬の夜', 'A winter night, windows shut'),
    st: { v1: 3, v2: 3, v3: 3, fb: 1 }, wind: [270, 0],
    hint: L('窓を閉めて、浴室の<b>24時間換気</b>だけで空気を入れかえている状態。各部屋の給気口から入った空気が、ドアの下のすき間を通って浴室へ流れます。<b>ドアや給気口を押して</b>、空気の古さの変化を見てみよう。',
      'The windows are shut and only the bathroom’s <b>24-hour ventilation</b> fan is replacing the air. Air comes in through the vent in each room and flows to the bathroom through the gaps under the doors. <b>Tap doors and vents</b> and watch how the age of air changes.'),
    now: L('<b>24時間換気だけ。</b>浴室の換気扇（弱）が家じゅうの空気を少しずつ引き出し、給気口から外の空気が入ります。ドアは閉めていて、下のすき間（約1cm）だけが通り道です。外は無風（風を吹かせると、風下の給気口から空気が出ていくこともあります）。',
      '<b>24-hour ventilation only.</b> The bathroom fan (low) slowly draws air out of the whole home, and outside air comes in through the vents. The doors are closed, so the only path is the gap under each door (about 1 cm). There is no wind outside (with wind, air can also leave through the vents on the leeward side).') },
  { key: 'cross', name: L('窓を2か所あける', 'Open two windows'), sub: L('風の通り道を作る', 'Make a path for the wind'),
    st: { w1: 2, w4: 2, d1: 1, dl: 1, v1: 3, v2: 3, v3: 3, fb: 1 }, wind: [270, 3],
    hint: L('向かい合う2つの窓をあけると、風上の窓から入った空気が家を通りぬけて風下の窓から出ます。<b>風の向きを変えたり</b>、途中の<b>ドアを閉めたり</b>してみよう。',
      'With two windows open on opposite sides, air comes in through the windward window, passes through the home and leaves through the leeward one. Try <b>changing the wind direction</b> or <b>closing a door</b> along the way.'),
    now: L('<b>窓を2か所あける。</b>洋室1の窓（西）とLDKの窓（東）をあけ、間のドアも開けました。西から 3 m/s の風。',
      '<b>Open two windows.</b> The bedroom 1 window (west) and a living room window (east) are open, and so are the doors between them. A 3 m/s wind blows from the west.') },
  { key: 'single', name: L('窓を1か所だけ', 'Only one window'), sub: L('通り道がないと？', 'What if there is no way out?'),
    st: { w4: 2, d1: 1, d2: 1, dl: 1, v1: 3, v2: 3, v3: 3, fb: 1 }, wind: [270, 3],
    hint: L('窓を1つだけあけても、空気の出口がないと風は通りぬけません（風の乱れで窓の近くが少し入れかわるだけ）。<b>もう1つ窓をあける</b>と、どう変わる？',
      'With only one window open, the wind cannot pass through because there is no way out (gusts replace a little air near the window). What changes when you <b>open another window</b>?'),
    now: L('<b>窓を1か所だけ。</b>LDKの窓（南）だけをあけました。風は西から 3 m/s。',
      '<b>Only one window.</b> Only the living room window (south) is open. A 3 m/s wind blows from the west.') },
  { key: 'door', name: L('玄関と窓をあける', 'Front door and window'), sub: L('マンションの通風', 'Airflow in an apartment'),
    st: { fd: 1, w3: 2, dl: 1, v1: 3, v2: 3, v3: 3, fb: 1 }, wind: [90, 3],
    hint: L('マンションでは、玄関とバルコニーの窓が家の両側にある通り道。今は東（バルコニー側）からの風。<b>LDKのドアを閉める</b>と、通り道はどうなる？',
      'In an apartment, the front door and the balcony windows are the openings on the two sides of the home. The wind is now from the east (balcony side). What happens to the path when you <b>close the living room door</b>?'),
    now: L('<b>玄関と窓をあける。</b>玄関ドアと LDK の窓（北）をあけ、LDKのドアも開けました。東から 3 m/s の風。',
      '<b>Front door and window open.</b> The front door and the living room window (north) are open, and so is the living room door. A 3 m/s wind blows from the east.') },
  { key: 'hood', name: L('キッチンの換気扇', 'Kitchen hood fan'), sub: L('強で回すと？', 'What happens on high?'),
    st: { fk: 2, fb: 1, v1: 0, v2: 0, v3: 0 }, wind: [270, 0],
    hint: L('給気口を閉めたままキッチンの換気扇を強で回すと、入口がすき間しかないので<b>室内の気圧が大きく下がり</b>、思ったほど空気を引けません（玄関ドアが重くなるのもこのため）。力の弱い浴室の換気扇は気圧の差に負けて、空気を出せなくなります。<b>給気口をあけたり、窓を少しあけたり</b>してみよう。',
      'If you run the kitchen hood fan on high with the vents closed, the only inlets are gaps, so <b>the pressure inside drops a lot</b> and the fan moves less air than you expect (this is also why the front door gets heavy). The weaker bathroom fan loses to the pressure difference and cannot push air out. Try <b>opening the vents or opening a window a little</b>.'),
    now: L('<b>キッチンの換気扇（強）。</b>給気口は3つとも閉め、窓も閉めています。外は無風。',
      '<b>Kitchen hood fan (high).</b> All three vents and the windows are closed. There is no wind outside.') },
  { key: 'circ', name: L('サーキュレーター', 'Circulator fan'), sub: L('よどんだ部屋に風を送る', 'Blow air into a stale room'),
    st: { w1: 2, w4: 2, d1: 1, d2: 1, dl: 1, v1: 3, v2: 3, v3: 3, fb: 1 }, wind: [270, 3],
    circs: [{ x: 3.0, y: 3.0, ang: 110, lv: 2 }],
    hint: L('窓を2か所あけても、風の通り道からはずれた部屋の空気はなかなか入れかわりません。洋室2の入口に置いた<b>サーキュレーターを押して止めたり</b>、ドラッグで動かしたりして、洋室2の空気の古さを比べてみよう。先の黄色い丸をドラッグすると向きが変わります。',
      'Even with two windows open, the air in a room away from the wind’s path is slow to change. <b>Tap the circulator fan</b> at the door of bedroom 2 to stop it, or drag it somewhere else, and compare the age of air in bedroom 2. Drag the yellow dot in front to turn it.'),
    now: L('<b>サーキュレーター。</b>洋室1とLDKの窓をあけて西風を通した状態で、廊下から洋室2へ向けてサーキュレーター（強）で風を送っています。',
      '<b>Circulator fan.</b> With the bedroom 1 and living room windows open and a west wind blowing through, a circulator fan (high) in the hall blows air into bedroom 2.') },
];
