// world.js — the shared garden. Every vertex carries what each sense needs:
//   aCol  : albedo for the human/visible bands (linear RGB)
//   aP    : x = UV reflectance, y = surface temp by day (°C), z = by night, w = emission (lights)
//   aA    : opacity in visible / UV / thermal-IR (bags, window glass)
// Coordinates in metres: x = right, y = up, z = toward the garden gate (house wall at z = -6).
'use strict';

const W = { root:null, mats:{}, movers:[], bounds:{ x0:-8.6, x1:8.6, z0:-5.6, z1:8.6 } };

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255), (n >> 8 & 255), (n & 255)].map(v => Math.pow(v / 255, 2.2)); };
const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// Props: { c:'#hex' or [r,g,b], uv, t:[day,night] or number, e: emission, a:[vis,uv,ir], j: colour jitter }
function paint(geo, p, fn) {
  if (geo.index) geo = geo.toNonIndexed();
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), pr = new Float32Array(n * 4), al = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let q = p;
    if (fn) q = Object.assign({}, p, fn(pos.getX(i), pos.getY(i), pos.getZ(i)));
    const c = typeof q.c === 'string' ? hex(q.c) : q.c;
    const jj = q.j ? 1 + (rnd() - 0.5) * q.j : 1;
    const t = Array.isArray(q.t) ? q.t : [q.t, q.t];
    const a = q.a || [1, 1, 1];
    col.set([c[0] * jj, c[1] * jj, c[2] * jj], i * 3);
    pr.set([q.uv == null ? 0.05 : q.uv, t[0], t[1], q.e || 0], i * 4);
    al.set(a, i * 3);
  }
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aP', new THREE.BufferAttribute(pr, 4));
  geo.setAttribute('aA', new THREE.BufferAttribute(al, 3));
  return geo;
}

// Concatenate painted, non-indexed geometries (each already transformed into a common frame).
function merge(list) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'aCol', 'aP', 'aA']) {
    const size = list[0].attributes[name].itemSize;
    const total = list.reduce((s, g) => s + g.attributes[name].count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// Make a mesh. tr: { p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz] }
function mk(geo, props, tr, parent, fn) {
  const g = paint(geo, props, fn);
  const transp = (props.a && props.a.some(v => v < 1));
  const m = new THREE.Mesh(g, transp ? W.mats.transp : W.mats.solid);
  if (tr) {
    if (tr.p) m.position.set(...tr.p);
    if (tr.r) m.rotation.set(...tr.r);
    if (tr.s) m.scale.set(...tr.s);
  }
  if (transp) m.renderOrder = 2;
  (parent || W.root).add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, a = 14, b = 10) => new THREE.SphereGeometry(r, a, b);
const cyl = (r0, r1, h, s = 10) => new THREE.CylinderGeometry(r0, r1, h, s);
// box from corner ranges
function boxAt(x0, x1, y0, y1, z0, z1, props, parent) {
  return mk(box(x1 - x0, y1 - y0, z1 - z0), props, { p:[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }, parent);
}

// ---- material properties (temps: [day, night]) ----
const M = {
  grass:  { c:'#4f7a36', uv:0.03, t:[27,13.5], j:0.35 },
  soil:   { c:'#4a3424', uv:0.02, t:[31,15], j:0.2 },
  wall:   { c:'#d9cfb8', uv:0.05, t:[29,17.5] },          // white paint (TiO2) absorbs UV
  roof:   { c:'#3d3f44', uv:0.04, t:[42,11] },
  wood:   { c:'#7a5536', uv:0.04, t:[30,13], j:0.15 },
  alum:   { c:'#9da3a6', uv:0.35, t:[30,15] },
  glass:  { c:'#9fb4bd', uv:0.04, t:[25,18.5], a:[0.16, 0.55, 1] },   // IR-opaque
  room:   { c:'#cbb497', uv:0.05, t:[23,22], e:0.22 },
  concrete:{ c:'#76736e', uv:0.06, t:[38,19.5], j:0.1 },
  stone:  { c:'#5b5852', uv:0.05, t:[41,21], j:0.15 },
  water:  { c:'#0b1c22', uv:0.02, t:[21,17] },
  leaf:   { c:'#264d1c', uv:0.03, t:[25,13], j:0.3 },
  bark:   { c:'#4a3726', uv:0.03, t:[27,14] },
  stem:   { c:'#3f6b25', uv:0.03, t:[26,13.5] },
};

function person(x, z, ry, parent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; (parent || W.root).add(g);
  const skin = { c:'#b98666', uv:0.05, t:[34.5,34] }, shirt = { c:'#9b2a1f', uv:0.07, t:[31,29] }, jeans = { c:'#2c3a5c', uv:0.06, t:[31,28] };
  mk(cyl(0.065, 0.055, 0.85), jeans, { p:[-0.1,0.43,0] }, g);
  mk(cyl(0.065, 0.055, 0.85), jeans, { p:[0.1,0.43,0] }, g);
  mk(box(0.4, 0.58, 0.22), shirt, { p:[0,1.15,0] }, g);
  mk(cyl(0.05, 0.045, 0.3), shirt, { p:[-0.25,1.28,0], r:[0,0,0.12] }, g);
  mk(cyl(0.05, 0.045, 0.3), shirt, { p:[0.25,1.28,0], r:[0,0,-0.12] }, g);
  mk(cyl(0.04, 0.035, 0.32), skin, { p:[-0.28,0.98,0.02] }, g);
  mk(cyl(0.04, 0.035, 0.32), skin, { p:[0.28,0.98,0.02] }, g);
  mk(sph(0.045), skin, { p:[-0.28,0.8,0.02] }, g);
  mk(sph(0.045), skin, { p:[0.28,0.8,0.02] }, g);
  mk(cyl(0.05, 0.05, 0.1), skin, { p:[0,1.48,0] }, g);
  mk(sph(0.115), skin, { p:[0,1.6,0], s:[1,1.12,1] }, g);
  mk(sph(0.12, 14, 8), { c:'#1a1410', uv:0.03, t:[31,30] }, { p:[0,1.65,-0.015], s:[1.02,0.95,1.05] }, g,
     (px, py, pz) => (py < 0.02 && pz > 0.03) ? { c:'#b98666', t:[34.5,34] } : null);
  return g;
}

function flower(x, z, h, kind, parent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); (parent || W.root).add(g);
  mk(cyl(0.012, 0.018, h, 6), M.stem, { p:[0, h / 2, 0] }, g);
  mk(sph(0.07, 8, 6), M.leaf, { p:[0.06, h * 0.45, 0], s:[1, 0.15, 0.5], r:[0, 0, 0.3] }, g);
  mk(sph(0.07, 8, 6), M.leaf, { p:[-0.06, h * 0.65, 0], s:[1, 0.15, 0.5], r:[0, 0, -0.3] }, g);
  const sz = kind === 'sun' ? 1 : kind === 'rud' ? 0.55 : 0.4;
  const disc = 0.11 * sz, len = 0.14 * sz, n = kind === 'white' ? 20 : 16;
  const petal = kind === 'sun' ? { c:'#ffbf10', t:[27,13.5] } : kind === 'rud' ? { c:'#f29a0c', t:[27,13.5] } : { c:'#f2f1ea', t:[27,13.5] };
  const parts = [];
  for (let i = 0; i < n; i++) {
    const pg = new THREE.PlaneGeometry(0.06 * sz, len, 1, 4);
    pg.translate(0, disc * 0.85 + len / 2, 0); pg.rotateZ(i / n * Math.PI * 2 + (i % 2) * 0.1);
    parts.push(paint(pg, petal, (px, py) => {
      const r = Math.hypot(px, py) / sz;
      if (kind === 'white') return { uv: 0.06 };
      // UV bullseye: petal base absorbs, tip reflects
      const f = Math.min(1, Math.max(0, (r - 0.15) / 0.08));
      return { uv: 0.03 + 0.55 * f };
    }));
  }
  const dg = new THREE.CylinderGeometry(disc, disc, 0.03 * sz + 0.01, 16); dg.rotateX(Math.PI / 2);
  parts.push(paint(dg, kind === 'white' ? { c:'#e8b81a', uv:0.05, t:[27,13.5] } : { c:'#2a1708', uv:0.02, t:[28,13.5] }));
  const head = new THREE.Mesh(merge(parts), W.mats.solid);
  head.position.set(0, h, 0.02); head.rotation.x = kind === 'white' ? -1.0 : -0.25;
  g.add(head);
  return g;
}

function bag(x, z, yellow) {
  const g = new THREE.Group(); g.position.set(x, 0, z); W.root.add(g);
  // contents (opaque, behind the film)
  mk(sph(0.08), { c:'#b3170c', uv:0.03, t:[24,15] }, { p:[-0.1,0.18,0.05] }, g);                 // tomato
  mk(box(0.18, 0.08, 0.12), { c:'#cc9a52', uv:0.08, t:[24,15] }, { p:[0.08,0.12,0.06], r:[0,0.4,0] }, g); // bread
  mk(sph(0.1, 10, 6), { c:'#a8adb3', uv:0.45, t:[22,15] }, { p:[0.02,0.3,-0.05], s:[1.6,0.45,0.6], r:[0,0.6,0.2] }, g); // fish
  mk(sph(0.09, 8, 6), { c:'#6f9a3b', uv:0.04, t:[24,15] }, { p:[-0.05,0.38,0.1], s:[1,0.5,1] }, g);  // cabbage leaf
  const film = yellow
    ? { c:'#e7c21a', uv:0.04, t:[25,15], a:[0.42, 1, 0.55] }    // UV-blocking pigment
    : { c:'#e2e4e6', uv:0.3,  t:[25,15], a:[0.3, 0.4, 0.55] };
  mk(sph(0.3, 18, 12), film, { p:[0,0.3,0], s:[1.05,1,0.95] }, g);
  mk(sph(0.06, 8, 6), film, { p:[0,0.62,0], s:[1,1.3,1] }, g);
  return g;
}

function buildWorld(scene) {
  W.root = new THREE.Group(); scene.add(W.root);

  // ground (grass), patio, stepping stones
  const gg = new THREE.PlaneGeometry(26, 22, 52, 44); gg.rotateX(-Math.PI / 2);
  mk(gg, M.grass, { p:[0, 0, 2] });
  boxAt(0.8, 5.2, -0.02, 0.06, -5.85, -4.3, M.concrete);
  for (let i = 0; i < 7; i++) {
    const t = i / 6, x = 0.3 + 2.1 * t + Math.sin(i * 1.7) * 0.15, z = 7.6 - 11.4 * t;
    mk(box(0.55, 0.05, 0.42), M.stone, { p:[x, 0.02, z], r:[0, i * 0.4, 0] });
  }

  // house wall with a window (x -4..-1.5, y 0.9..2.2) and a door (x 2..3, y 0..2.1)
  const zw0 = -6.3, zw1 = -6.0;
  boxAt(-9, -4, 0, 3.2, zw0, zw1, M.wall);
  boxAt(-1.5, 2, 0, 3.2, zw0, zw1, M.wall);
  boxAt(3, 9, 0, 3.2, zw0, zw1, M.wall);
  boxAt(-4, -1.5, 0, 0.9, zw0, zw1, M.wall);
  boxAt(-4, -1.5, 2.2, 3.2, zw0, zw1, M.wall);
  boxAt(2, 3, 2.1, 3.2, zw0, zw1, M.wall);
  boxAt(-9.5, 9.5, 3.2, 3.38, -6.6, -5.3, M.roof);
  // window frame + glass
  boxAt(-4.05, -1.45, 0.86, 0.92, -6.02, -5.94, M.alum);
  boxAt(-4.05, -1.45, 2.18, 2.24, -6.02, -5.94, M.alum);
  boxAt(-4.05, -3.99, 0.86, 2.24, -6.02, -5.94, M.alum);
  boxAt(-1.51, -1.45, 0.86, 2.24, -6.02, -5.94, M.alum);
  boxAt(-2.78, -2.72, 0.9, 2.2, -6.02, -5.96, M.alum);
  mk(new THREE.PlaneGeometry(2.5, 1.3), M.glass, { p:[-2.75, 1.55, -6.0] });
  // room behind the window (lit at night)
  boxAt(-4.6, -0.9, -0.02, 0.0, -9, -6.3, M.room);
  boxAt(-4.6, -0.9, 0, 3.0, -9.1, -9, M.room);
  boxAt(-4.7, -4.6, 0, 3.0, -9.1, -6.3, M.room);
  boxAt(-0.9, -0.8, 0, 3.0, -9.1, -6.3, M.room);
  boxAt(-4.6, -0.9, 3.0, 3.1, -9.1, -6.3, M.room);
  mk(box(1.2, 0.75, 0.6), { c:'#5a4030', uv:0.04, t:[22,22] }, { p:[-1.8, 0.37, -8.5] });   // shelf
  person(-2.9, -7.3, 0.25);
  // door, porch lamp
  boxAt(2, 3, 0, 2.1, -6.08, -6.0, { c:'#5e3b22', uv:0.04, t:[30,16] });
  mk(sph(0.03), M.alum, { p:[2.85, 1.0, -5.97] });
  boxAt(3.5, 3.7, 2.18, 2.42, -6.0, -5.86, { c:'#2b2b2b', uv:0.05, t:[30,18] });
  W.lamp = mk(sph(0.075, 14, 10), { c:'#fff2d8', uv:0.1, t:[45,45], e:4.5 }, { p:[3.6, 2.22, -5.82], s:[1, 1.3, 1] });

  // fences (z = 8 and x = ±8)
  const fence = M.wood;
  for (let x = -8; x <= 8.01; x += 1) mk(box(0.08, 1.2, 0.08), fence, { p:[x, 0.6, 8] });
  boxAt(-8, 8, 0.45, 0.53, 7.97, 8.03, fence); boxAt(-8, 8, 1.12, 1.2, 7.96, 8.04, fence);
  for (const sx of [-8, 8]) {
    for (let z = -5; z <= 8.01; z += 1) mk(box(0.08, 1.2, 0.08), fence, { p:[sx, 0.6, z] });
    boxAt(sx - 0.03, sx + 0.03, 0.45, 0.53, -6, 8, fence); boxAt(sx - 0.04, sx + 0.04, 1.12, 1.2, -6, 8, fence);
  }
  // backdrop: neighbouring houses and hedges beyond the fence
  for (let i = 0; i < 5; i++) {
    const x = -14 + i * 7;
    boxAt(x - 2.4, x + 2.4, 0, 3 + (i % 2) * 1.4, 14, 19, { c: i % 2 ? '#8f8a80' : '#a49a87', uv:0.06, t:[30,16] });
    boxAt(x - 2.6, x + 2.6, 3 + (i % 2) * 1.4, 3.3 + (i % 2) * 1.4, 13.7, 19.3, M.roof);
  }
  for (const sx of [-1, 1]) boxAt(sx * 9.5, sx * 11.5, 0, 1.6, -6, 10, M.leaf);

  // flower bed: sunflowers (back), rudbeckia (middle), white flowers (front)
  boxAt(-6, -2, 0, 0.12, -2, 0, M.soil);
  [-5.5, -4.5, -3.5, -2.5].forEach((x, i) => flower(x, -1.55, 1.55 + (i % 2) * 0.12, 'sun'));
  [-5.2, -4.4, -3.6, -2.8].forEach(x => flower(x + 0.15, -0.95, 0.72, 'rud'));
  [-5.6, -5.0, -4.3, -3.7, -3.1, -2.5].forEach(x => flower(x, -0.32, 0.4, 'white'));

  // blueberry bush with bloom-covered berries
  const bb = new THREE.Group(); bb.position.set(-6.5, 0, 3); W.root.add(bb);
  const lumps = [[0,0.45,0,0.45],[0.35,0.35,0.1,0.35],[-0.3,0.4,0.15,0.38],[0.05,0.78,-0.05,0.33],[0.1,0.35,-0.3,0.33]];
  for (const [x, y, z, r] of lumps) mk(new THREE.IcosahedronGeometry(r, 1), M.leaf, { p:[x, y, z] }, bb);
  for (let i = 0; i < 46; i++) {
    const L = lumps[i % lumps.length], th = rnd() * Math.PI * 2, ph = rnd() * 1.6 - 0.3;
    const d = [Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)];
    const p = [L[0] + d[0] * L[3] * 1.02, L[1] + d[1] * L[3] * 1.02, L[2] + d[2] * L[3] * 1.02];
    mk(sph(0.028, 8, 6), { c:'#3d4a6e', uv:0.5, t:[24,13] }, { p }, bb);
  }

  // garbage station
  bag(5.4, 6.6, false); bag(6.5, 6.55, true);
  boxAt(4.8, 7.2, 0, 0.03, 6.0, 7.4, M.concrete);

  // pond, frog, big warm stone
  mk(cyl(1.3, 1.3, 0.02, 28), M.water, { p:[3.5, 0.008, 2.5] });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    mk(new THREE.DodecahedronGeometry(0.16), M.stone, { p:[3.5 + Math.cos(a) * 1.38, 0.05, 2.5 + Math.sin(a) * 1.38], s:[1, 0.55, 1], r:[0, a, 0] });
  }
  const frog = new THREE.Group(); frog.position.set(2.3, 0.08, 1.75); frog.rotation.y = 2.4; W.root.add(frog);
  const fg = { c:'#4c6b1f', uv:0.04, t:[24.5,16] };
  mk(sph(0.06), fg, { s:[1, 0.65, 1.3] }, frog);
  mk(sph(0.018), fg, { p:[0.03, 0.035, 0.05] }, frog); mk(sph(0.018), fg, { p:[-0.03, 0.035, 0.05] }, frog);
  mk(new THREE.DodecahedronGeometry(0.5), M.stone, { p:[0.5, 0.18, 4.5], s:[1.1, 0.6, 0.85], r:[0.2, 0.5, 0] });

  // tree
  mk(cyl(0.13, 0.18, 2.4, 9), M.bark, { p:[6.4, 1.2, -2.2] });
  for (const [x, y, z, r] of [[6.4,2.8,-2.2,1.1],[5.8,2.4,-1.8,0.75],[7.0,2.5,-2.6,0.8],[6.5,3.5,-2.3,0.75]])
    mk(new THREE.IcosahedronGeometry(r, 1), M.leaf, { p:[x, y, z] });

  // gardener, cat on the patio, crow on the fence
  W.gardener = person(-0.8, 2.4, 0.5);
  const cat = new THREE.Group(); cat.position.set(1.6, 0.06, -4.9); cat.rotation.y = 0.3; W.root.add(cat);
  const fur = { c:'#a35a1c', uv:0.04, t:[32,27.5], j:0.15 }, face = { c:'#a35a1c', uv:0.04, t:[34,33] };
  mk(sph(0.15), fur, { p:[0, 0.18, 0], s:[0.9, 1.25, 1.05] }, cat);
  mk(sph(0.1), face, { p:[0, 0.42, 0.06] }, cat);
  mk(new THREE.ConeGeometry(0.035, 0.07, 4), face, { p:[-0.05, 0.52, 0.05] }, cat);
  mk(new THREE.ConeGeometry(0.035, 0.07, 4), face, { p:[0.05, 0.52, 0.05] }, cat);
  mk(sph(0.012), { c:'#d8c23a', uv:0.04, t:[35.5,35.5] }, { p:[-0.035, 0.44, 0.15] }, cat);
  mk(sph(0.012), { c:'#d8c23a', uv:0.04, t:[35.5,35.5] }, { p:[0.035, 0.44, 0.15] }, cat);
  W.catTail = mk(cyl(0.02, 0.025, 0.36, 6), { c:'#a35a1c', uv:0.04, t:[30,25] }, { p:[0.12, 0.04, -0.12], r:[Math.PI / 2, 0, 0.9] }, cat);

  const crow = new THREE.Group(); crow.position.set(4.2, 1.2, 8); crow.rotation.y = Math.PI * 0.85; W.root.add(crow);
  const plume = { c:'#08080a', uv:0.06, t:[29,24] };
  mk(sph(0.11), plume, { p:[0, 0.12, 0], s:[1, 1, 1.9] }, crow);
  mk(sph(0.075), { c:'#08080a', uv:0.06, t:[35,33] }, { p:[0, 0.24, 0.17] }, crow);
  mk(new THREE.ConeGeometry(0.025, 0.09, 6), { c:'#141414', uv:0.05, t:[30,22] }, { p:[0, 0.23, 0.27], r:[Math.PI / 2, 0, 0] }, crow);
  mk(box(0.1, 0.02, 0.18), plume, { p:[0, 0.1, -0.27], r:[0.4, 0, 0] }, crow);

  // mouse (runs around the flower bed)
  const mouse = new THREE.Group(); W.root.add(mouse); W.mouse = mouse;
  const mfur = { c:'#5d5048', uv:0.04, t:[31.5,29.5] }, mpink = { c:'#c08a80', uv:0.04, t:[34.5,34] };
  mk(sph(0.035), mfur, { p:[0, 0.032, 0], s:[1, 0.85, 1.8] }, mouse);
  mk(sph(0.024), mfur, { p:[0, 0.04, 0.07] }, mouse);
  mk(sph(0.007), mpink, { p:[0, 0.04, 0.095] }, mouse);
  mk(sph(0.012), mpink, { p:[-0.018, 0.062, 0.06] }, mouse); mk(sph(0.012), mpink, { p:[0.018, 0.062, 0.06] }, mouse);
  mk(cyl(0.004, 0.006, 0.11, 5), { c:'#a07d74', uv:0.04, t:[26,21] }, { p:[0, 0.02, -0.11], r:[Math.PI / 2 - 0.15, 0, 0] }, mouse);

  // moths around the porch lamp
  W.moths = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Group(); W.root.add(m);
    const mw = { c:'#9c8d74', uv:0.22, t:[23,20] };
    mk(cyl(0.005, 0.004, 0.025, 5), mw, { r:[Math.PI / 2, 0, 0] }, m);
    const wg = new THREE.PlaneGeometry(0.03, 0.02); wg.rotateX(-Math.PI / 2);
    m.wL = mk(wg.clone(), mw, { p:[-0.016, 0, 0] }, m); m.wR = mk(wg, mw, { p:[0.016, 0, 0] }, m);
    m.ph = rnd() * 10; m.r = 0.25 + rnd() * 0.35; m.sp = 1.5 + rnd() * 1.5;
    W.moths.push(m);
  }
  updateWorld(0);
}

function updateWorld(t) {
  // mouse: 30 s cycle — sniffs for 8 s at the front of the bed (a = π/2), then runs one lap
  const tt = ((t % 30) + 30) % 30, run = Math.max(0, (tt - 8) / 22);
  const a = Math.PI / 2 + Math.PI * 2 * (run * run * (3 - 2 * run));
  const x = -4 + 2.7 * Math.cos(a), z = -1 + 1.85 * Math.sin(a);
  const dx = -2.7 * Math.sin(a), dz = 1.85 * Math.cos(a);
  W.mouse.position.set(x, 0, z);
  W.mouse.rotation.y = tt < 8 ? Math.atan2(dx, dz) + 0.6 * Math.sin(tt * 1.7) : Math.atan2(dx, dz);
  W.catTail.rotation.z = 0.9 + 0.35 * Math.sin(t * 1.4);
  W.gardener.rotation.y = 0.5 + 0.15 * Math.sin(t * 0.3);
  const L = W.lamp.position;
  W.moths.forEach((m, i) => {
    const q = t * m.sp + m.ph;
    m.position.set(L.x + Math.cos(q) * m.r, L.y - 0.05 + Math.sin(q * 1.7) * 0.18, L.z + 0.25 + Math.sin(q) * m.r * 0.8);
    m.rotation.y = -q;
    const f = Math.sin(t * 40 + i) * 0.7; m.wL.rotation.z = f; m.wR.rotation.z = -f;
  });
}
