// 虫を組む（形も歩き方もこのアプリで作った。CC0 で本物らしい虫の 3D が見つからず、ユーザーと「素材は使わず作りこむ」と決めた 2026-10-31）
// 単位は cm。頭が +Z、背中が +Y、地面が y=0。makeInsect(kind, team) → { root, len, update(dt, 速さ cm/s, opt) }
// 本物らしさのために:
//  - 足がすべらない: 足先は地面に置いたまま体が進み、脚の関節は2本の骨の IK で曲げる。歩き方は三脚歩行（左前・右中・左後 と 右前・左中・右後 を交互に）
//  - 体は輪郭の線を回して作る（LatheGeometry）。節・くびれ・毛（剛毛）・複眼の小さな六角形・模様
import * as THREE from 'three';

// ---------- 材質 ----------
const TEX = {};
function canvasTex(key, w, h, draw, repeat = 1) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (TEX[key] = t);
}
const pits = () => canvasTex('pits', 256, 256, (g, w, h) => {   // 殻の点刻（小さなくぼみ）と細かい傷
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) { const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.4 + 0.3; g.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.4})`; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); }
  for (let i = 0; i < 160; i++) { g.strokeStyle = 'rgba(255,255,255,0.1)'; const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 24); g.stroke(); }
}, 3);
const facets = () => canvasTex('facets', 256, 256, (g, w, h) => {   // 複眼の小さな六角形（個眼）
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
  const r = 5; for (let y = 0, row = 0; y < h + r; y += r * 1.5, row++) for (let x = (row % 2) * r * 0.87; x < w + r; x += r * 1.74) {
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); } g.closePath();
    g.fillStyle = '#c8c8c8'; g.fill(); g.strokeStyle = '#3a3a3a'; g.lineWidth = 1; g.stroke();
  }
}, 4);
function chitin(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: o.rough ?? 0.45, roughnessMap: pits(), bumpMap: pits(), bumpScale: o.bump ?? 0.5, map: o.map || null,
    clearcoat: o.coat ?? 0.6, clearcoatRoughness: 0.3, sheen: 0.25, sheenColor: new THREE.Color(0x998877), metalness: 0 });
}
function eyeMat(color) { return new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, bumpMap: facets(), bumpScale: 1.2, clearcoat: 1, clearcoatRoughness: 0.05 }); }

// ---------- 形 ----------
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
// 輪郭の線 [[半径, z], …] を Z 軸のまわりに回す。sx・sy で断面をつぶす（横に広い・平たい）
function lathe(profile, mat, { sx = 1, sy = 1, seg = 28, at = [0, 0, 0] } = {}) {
  let pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(0.0005, r), z));
  if (pts[0].y > pts[pts.length - 1].y) pts = pts.reverse();   // 下から上へ並べる（逆だと面が裏返る）
  const g = new THREE.LatheGeometry(pts, seg); g.rotateX(Math.PI / 2);   // Y 軸 → Z 軸へ
  g.scale(sx, sy, 1); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.position.set(...at); m.castShadow = m.receiveShadow = true; return m;
}
// 卵形の輪郭（長さ L・太さ R・前後の丸み）
const ovoid = (L, R, front = 1, back = 1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n, z = (u - 0.5) * L, s = Math.sin(Math.PI * u); return [R * Math.pow(s, u < 0.5 ? 1 / back : 1 / front), z]; }).reverse();
const geoC = new THREE.CylinderGeometry(1, 1, 1, 8, 1).translate(0, 0.5, 0);
// 点 a→b の棒（太さ r0→r1）。毎コマ置きなおせるよう、置き方を関数にする
function stick(parent, mat, r0, r1) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, 8, 1).translate(0, 0.5, 0), m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m);
  return (a, b) => { const d = tmpV.subVectors(b, a), L = d.length(); m.position.copy(a); m.scale.set(1, Math.max(1e-4, L), 1); m.quaternion.setFromUnitVectors(UP, d.divideScalar(L || 1)); };
}
const tmpV = new THREE.Vector3();
function taper(parent, mat, pts, r0, r1, seg = 24) {   // 点を通るなめらかな曲線にそって、根もと r0 → 先 r1 へ細くなる管
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), g = new THREE.TubeGeometry(curve, seg, 1, 12, false), p = g.attributes.position;
  const fr = curve.computeFrenetFrames(seg, false);
  for (let i = 0; i <= seg; i++) { const u = i / seg, c = curve.getPointAt(u), r = r0 + (r1 - r0) * Math.pow(u, 0.8);
    for (let j = 0; j <= 12; j++) { const k = i * 13 + j, v = new THREE.Vector3().fromBufferAttribute(p, k).sub(c); p.setXYZ(k, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r); } }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m); return m;
}
function ball(parent, r, mat, at) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat); if (Array.isArray(r)) m.scale.set(...r); else m.scale.setScalar(r); m.position.set(...at); m.castShadow = true; parent.add(m); return m; }
// 毛（剛毛）: 形の表面からまばらに、うしろへ寝かせて生やす（細い線）
function hairs(mesh, n, len, color = 0xb89a6a, opacity = 0.35) {
  const g = mesh.geometry, p = g.attributes.position, nr = g.attributes.normal, arr = [];
  for (let i = 0; i < n; i++) {
    const k = (Math.random() * p.count) | 0, v = new THREE.Vector3().fromBufferAttribute(p, k), nn = new THREE.Vector3().fromBufferAttribute(nr, k);
    if (nn.y < -0.3 && Math.random() < 0.6) continue;   // おなかの下は少なめ
    const dir = nn.clone().addScaledVector(Z, -0.9).normalize(), l = len * (0.5 + Math.random());
    arr.push(v.x, v.y, v.z, v.x + dir.x * l, v.y + dir.y * l, v.z + dir.z * l);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity })); ls.position.copy(mesh.position); ls.scale.copy(mesh.scale); ls.rotation.copy(mesh.rotation);
  mesh.parent.add(ls); return ls;
}

// ---------- 脚（2本の骨の IK。足先は地面に置いたまま） ----------
// hip: 体の中の付け根、rest: ふだん足先を置く場所（体の中の座標、y=0 が地面）、L1 = もも、L2 = すね、tars = ふ節の長さ、knee: ひざを上へ曲げる（虫の脚はひざが体より高い）
function makeLeg(parent, mat, hip, rest, L1, L2, tars, r, grp) {
  const hipM = ball(parent, r * 1.25, mat, hip.toArray());
  const fem = stick(parent, mat, r * 1.1, r * 0.85), tib = stick(parent, mat, r * 0.75, r * 0.55), tar = stick(parent, mat, r * 0.45, r * 0.3);
  const kneeB = ball(parent, r * 0.8, mat, [0, 0, 0]), ankB = ball(parent, r * 0.5, mat, [0, 0, 0]);   // 関節は目立たない大きさ
  const foot = rest.clone(), knee = new THREE.Vector3(), ank = new THREE.Vector3();
  return {
    hip, rest, foot, grp, lift: 0,
    pose() {
      // ふ節は足先から体の方へ少しのびて地面に寝る。すねの先（ankle）を IK の目標にする
      const toHip = tmpV.subVectors(hip, foot).setY(0); const dh = toHip.length() || 1;
      ank.set(foot.x + toHip.x / dh * tars * 0.8, foot.y + tars * 0.45, foot.z + toHip.z / dh * tars * 0.8);
      const d = new THREE.Vector3().subVectors(ank, hip), D = Math.min(d.length(), (L1 + L2) * 0.999), dn = d.clone().normalize();
      const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), hgt = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      // ひざは「上＋外」へ曲げる
      const side = new THREE.Vector3(hip.x, 0, 0).normalize(), bend = UP.clone().multiplyScalar(0.55).addScaledVector(side, 1.0);   // ひざは外へ開き、少し上（体の高さくらい）
      const perp = bend.addScaledVector(dn, -bend.dot(dn)).normalize();
      knee.copy(hip).addScaledVector(dn, a).addScaledVector(perp, hgt);
      fem(hip, knee); tib(knee, ank); tar(ank, foot); kneeB.position.copy(knee); ankB.position.copy(ank);
    },
  };
}
// 三脚歩行: 体の速さ v（cm/s、体の中の向き dir）に合わせて、足を地面に置いたまま後ろへ送り、うき足は前へ弧を描いて運ぶ
function walk(legs, dt, v, dirX, dirZ, st) {
  const stride = st.stride, period = v > 0.02 ? Math.min(1.2, Math.max(0.12, stride / v)) : 0;
  if (period) st.ph = (st.ph + dt / period) % 1;
  for (const L of legs) {
    const ph = (st.ph + (L.grp ? 0.5 : 0)) % 1;   // 2つの組は半周ずれる
    if (!period) { L.foot.lerp(L.rest, 1 - Math.exp(-dt * 6)); L.foot.y = 0; L.pose(); continue; }
    if (ph < 0.5) {   // 立ち脚: 地面に置いたまま、体が進むぶん後ろへ（すべらない）
      L.foot.x -= dirX * v * dt; L.foot.z -= dirZ * v * dt; L.foot.y = 0;
    } else {          // うき脚: いまの場所から「休む場所＋歩幅の半分だけ前」へ、持ち上げて運ぶ
      const u = (ph - 0.5) / 0.5, tx = L.rest.x + dirX * stride * 0.5, tz = L.rest.z + dirZ * stride * 0.5;
      const k = 1 - Math.exp(-dt / Math.max(0.02, period * 0.5 * (1 - u) + 0.01) * 3);
      L.foot.x += (tx - L.foot.x) * k; L.foot.z += (tz - L.foot.z) * k; L.foot.y = Math.sin(u * Math.PI) * st.lift;
    }
    L.pose();
  }
}

// ---------- 羽（トンボ） ----------
const veinTex = () => canvasTex('veins', 512, 96, (g, w, h) => {   // 翅脈（細かい網目）と縁紋
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(205,215,220,0.16)'; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 3, 0, 0, 6.28); g.fill();
  g.strokeStyle = 'rgba(30,34,38,0.75)'; g.lineWidth = 1.6;
  for (const y of [h * 0.18, h * 0.32, h * 0.5, h * 0.66]) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 2, w * 0.7, y - 2, w, h / 2 + (y - h / 2) * 0.3); g.stroke(); }
  g.lineWidth = 0.7;
  for (let i = 0; i < 1400; i++) { const x = Math.random() * w, y = Math.random() * h, dx = (Math.random() - 0.5) * 9, dy = (Math.random() - 0.5) * 9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke(); }
  g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 3, 0, 0, 6.28); g.fill(); g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(30,24,16,0.9)'; g.fillRect(w * 0.86, h * 0.14, w * 0.05, h * 0.16);   // 縁紋
});

// ---------- 虫の種類 ----------
export function makeInsect(kind, team = 'w') {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const legs = [], antennae = [], wings = [];
  const dark = team === 'b';
  let len = 1, stride = 0.3, liftH = 0.15, bodyH = 0;
  const addLegs = (mat, sets, r) => sets.forEach(([hip, rest, L1, L2, tars], i) => {   // sets は右側だけ。左は鏡
    for (const s of [1, -1]) legs.push(makeLeg(body, mat, new THREE.Vector3(hip[0] * s, hip[1], hip[2]), new THREE.Vector3(rest[0] * s, 0, rest[2]), L1, L2, tars, r, ((i === 1) === (s > 0)) ? 0 : 1));
  });
  const antenna = (mat, at, L, elbow, r = 0.012) => {   // 触角（ひじのある・ない）
    for (const s of [1, -1]) {
      const g = new THREE.Group(); g.position.set(at[0] * s, at[1], at[2]); body.add(g);
      const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(s * L * 0.25, L * (elbow ? 0.38 : 0.3), L * (elbow ? 0.08 : 0.45)), p2 = new THREE.Vector3(s * L * 0.45, L * (elbow ? 0.25 : 0.42), L * 0.95);
      stick(g, mat, r, r * 0.8)(p0, p1); stick(g, mat, r * 0.8, r * 0.5)(p1, p2); ball(g, r * 1.2, mat, p2.toArray());
      g.userData.s = s; antennae.push(g);
    }
  };

  if (kind === 'ant' || kind === 'queen') {   // アリ（白の軍＝赤茶のアリ、黒の軍＝クロオオアリ）
    const q = kind === 'queen', col = dark ? 0x17100b : 0x6e2a12, m = chitin(col, { rough: 0.38 }), lm = chitin(dark ? 0x22170f : 0x7a3618, { rough: 0.5 });
    const head = lathe([[0, 0.2], [0.09, 0.19], [0.15, 0.12], [0.17, 0.02], [0.15, -0.08], [0.08, -0.14], [0, -0.15]], m, { sx: 1.05, sy: 0.75, at: [0, 0.26, 0.5] }); body.add(head);
    ball(body, [0.05, 0.05, 0.04], eyeMat(0x111111), [0.13, 0.31, 0.53]); ball(body, [0.05, 0.05, 0.04], eyeMat(0x111111), [-0.13, 0.31, 0.53]);
    for (const s of [1, -1]) { const md = stick(body, lm, 0.03, 0.012); md(new THREE.Vector3(s * 0.07, 0.2, 0.66), new THREE.Vector3(s * 0.02, 0.18, 0.8)); }   // 大あご
    const thx = lathe(q ? ovoid(0.42, 0.13, 1.3, 1) : [[0, 0.22], [0.08, 0.2], [0.1, 0.1], [0.07, 0.02], [0.08, -0.06], [0.06, -0.14], [0, -0.17]], m, { sx: 0.9, sy: 1.1, at: [0, 0.28, 0.17] }); body.add(thx);   // 胸（前胸・中胸・前伸腹節）
    ball(body, [0.05, 0.07, 0.04], m, [0, 0.3, -0.06]);   // 腹柄の節（くびれ）
    const gas = lathe(ovoid(q ? 0.95 : 0.52, q ? 0.27 : 0.17, 1.4, 1.1), chitin(col, { rough: 0.32, map: canvasTex('bands' + col, 64, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 40; y < h; y += 52) g.fillRect(0, y, w, 6); }) }), { sx: 1, sy: 0.92, at: [0, q ? 0.32 : 0.28, q ? -0.56 : -0.36] }); body.add(gas);   // 腹（節の帯）
    hairs(gas, 160, 0.035); hairs(head, 50, 0.03);
    addLegs(lm, [[[0.07, 0.22, 0.26], [0.4, 0, 0.58], 0.3, 0.34, 0.2], [[0.08, 0.22, 0.16], [0.46, 0, 0.08], 0.32, 0.38, 0.22], [[0.07, 0.24, 0.06], [0.42, 0, -0.4], 0.38, 0.46, 0.26]], 0.016);
    antenna(lm, [0.06, 0.32, 0.64], 0.62, true);
    len = q ? 1.6 : 0.9; stride = q ? 0.12 : 0.22; liftH = 0.06;
  } else if (kind === 'beetle') {   // カブトムシ（雄）
    const col = dark ? 0x140b07 : 0x4a2210, m = chitin(col, { rough: 0.22, coat: 0.9 }), lm = chitin(0x1c120b, { rough: 0.4 });
    const ely = lathe(ovoid(1.0, 0.36, 0.8, 1.6), chitin(col, { rough: 0.2, coat: 1, map: canvasTex('seam', 128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(w / 2 - 1, 0, 2, h); }) }), { sx: 1, sy: 0.62, at: [0, 0.42, -0.3] }); body.add(ely);   // 上ばね（真ん中の合わせ目）
    const pro = lathe(ovoid(0.42, 0.34, 1.2, 0.8), m, { sx: 1.05, sy: 0.7, at: [0, 0.44, 0.38] }); body.add(pro);   // 前胸
    const hd = lathe(ovoid(0.26, 0.15, 1, 1), m, { sx: 1.2, sy: 0.7, at: [0, 0.33, 0.66] }); body.add(hd);
    // 頭の角（長く上へ曲がり、先が二股）・胸の小さな角
    taper(body, m, [[0, 0.32, 0.7], [0, 0.4, 0.95], [0, 0.6, 1.14], [0, 0.86, 1.22], [0, 1.0, 1.2]], 0.085, 0.035);   // 頭の角（なめらかに上へ曲がる）
    for (const s of [1, -1]) taper(body, m, [[0, 0.98, 1.2], [s * 0.05, 1.06, 1.24], [s * 0.1, 1.12, 1.3]], 0.035, 0.01, 8);   // 先の二股
    taper(body, m, [[0, 0.6, 0.46], [0, 0.7, 0.56], [0, 0.76, 0.66]], 0.05, 0.012, 10);   // 胸の小さな角
    addLegs(lm, [[[0.2, 0.24, 0.42], [0.62, 0, 0.82], 0.4, 0.46, 0.3], [[0.24, 0.24, 0.1], [0.75, 0, 0.0], 0.42, 0.5, 0.32], [[0.24, 0.24, -0.2], [0.68, 0, -0.75], 0.46, 0.56, 0.36]], 0.04);
    antenna(lm, [0.12, 0.34, 0.8], 0.16, false, 0.015);
    hairs(pro, 40, 0.03, 0x3a2a1a, 0.4);
    len = 5.0; stride = 0.9; liftH = 0.25;
  } else if (kind === 'grasshopper') {   // トノサマバッタ（白の軍＝緑、黒の軍＝茶）
    const col = dark ? 0x6b5838 : 0x5c8a2e, m = chitin(col, { rough: 0.55, coat: 0.3 }), lm = chitin(dark ? 0x5e4c30 : 0x6d9a3a, { rough: 0.55, coat: 0.3 });
    const wingM = chitin(dark ? 0x7a6644 : 0x8b8250, { rough: 0.6, coat: 0.2, map: canvasTex('spots' + team, 128, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(40,30,15,0.5)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 2 + Math.random() * 4, 0, 0, 6.28); g.fill(); } }) });
    const hd = lathe([[0, 0.1], [0.06, 0.09], [0.085, 0.03], [0.085, -0.05], [0.06, -0.1], [0, -0.11]], m, { sx: 0.95, sy: 1.6, at: [0, 0.3, 0.6] }); hd.rotation.x = 0.5; body.add(hd);   // 縦長の顔（下向き）
    ball(body, [0.035, 0.05, 0.035], eyeMat(dark ? 0x4a3a24 : 0x6a5a2a), [0.07, 0.4, 0.6]); ball(body, [0.035, 0.05, 0.035], eyeMat(dark ? 0x4a3a24 : 0x6a5a2a), [-0.07, 0.4, 0.6]);
    const pro = lathe(ovoid(0.3, 0.12, 1, 1.2), m, { sx: 1, sy: 1.25, at: [0, 0.32, 0.38] }); body.add(pro);   // 前胸（鞍形）
    body.add(lathe(ovoid(0.82, 0.1, 1, 1.4), m, { sx: 1, sy: 1.1, at: [0, 0.27, -0.12] }));   // 腹
    for (const s of [1, -1]) { const w = lathe(ovoid(0.95, 0.07, 1.6, 1), wingM, { sx: 0.6, sy: 0.25, at: [s * 0.045, 0.4, -0.12] }); w.rotation.z = -s * 0.45; body.add(w); }   // たたんだ前ばね（まだら）
    addLegs(lm, [[[0.06, 0.2, 0.42], [0.3, 0, 0.62], 0.22, 0.26, 0.12], [[0.07, 0.2, 0.3], [0.36, 0, 0.22], 0.24, 0.28, 0.13]], 0.018);
    const femT = canvasTex('chev' + team, 256, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(30,25,10,0.4)'; g.lineWidth = 2; for (let x = 0; x < w; x += w / 4) for (let y = 8; y < h; y += 18) { g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + w / 8, y + 8); g.lineTo(x + w / 4 - 4, y); g.stroke(); } });   // 外側にだけ見える矢羽
    for (const s of [1, -1]) {   // 後脚: 大きなもも（矢羽の模様）をたたみ、すねは折りかえして地面へ
      const fm = lathe(ovoid(0.62, 0.075, 1.6, 1), chitin(dark ? 0x6b5838 : 0x6d9a3a, { rough: 0.5, coat: 0.3, map: femT }), { sx: 0.8, sy: 1.2, at: [0, 0, 0] });
      const g = new THREE.Group(); g.position.set(s * 0.1, 0.3, 0.18); g.rotation.set(-0.35, s * 0.18, 0); g.add(fm); fm.position.set(0, 0, -0.28); body.add(g);
      stick(body, lm, 0.018, 0.012)(new THREE.Vector3(s * 0.12, 0.42, -0.4), new THREE.Vector3(s * 0.2, 0.03, -0.02));   // すね
      stick(body, lm, 0.012, 0.008)(new THREE.Vector3(s * 0.2, 0.03, -0.02), new THREE.Vector3(s * 0.22, 0, -0.14));
    }
    antenna(lm, [0.04, 0.4, 0.7], 0.36, false, 0.01);
    len = 4.5; stride = 0.5; liftH = 0.18;
  } else if (kind === 'leafhopper') {   // ツマグロヨコバイ（白の軍＝緑、黒の軍＝茶）
    const col = dark ? 0x6a5a30 : 0x6fc23a, m = chitin(col, { rough: 0.35, coat: 0.8 }), lm = chitin(dark ? 0x7a6a40 : 0x9fd070, { rough: 0.5 });
    body.add(lathe([[0, 0.08], [0.1, 0.07], [0.15, 0.02], [0.15, -0.03], [0.1, -0.07], [0, -0.08]], m, { sx: 1, sy: 0.55, at: [0, 0.2, 0.38] }));   // 頭（横に広い）
    ball(body, [0.04, 0.04, 0.03], eyeMat(0x332211), [0.13, 0.23, 0.38]); ball(body, [0.04, 0.04, 0.03], eyeMat(0x332211), [-0.13, 0.23, 0.38]);
    const wingT = canvasTex('lh' + team, 64, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.92)'; g.fillRect(0, 0, w, h * 0.16); });   // 羽の先の黒い斑（つまぐろ）
    for (const s of [1, -1]) { const w = lathe(ovoid(0.85, 0.1, 1.8, 1), chitin(col, { rough: 0.3, coat: 0.9, map: wingT }), { sx: 1, sy: 0.35, at: [s * 0.075, 0.24, -0.02] }); w.rotation.z = -s * 0.55; body.add(w); }   // 屋根形の羽
    body.add(lathe(ovoid(0.5, 0.11, 1, 1), chitin(dark ? 0x4a3a20 : 0x4a8a22), { sx: 1, sy: 0.8, at: [0, 0.16, 0.05] }));
    addLegs(lm, [[[0.07, 0.12, 0.25], [0.24, 0, 0.42], 0.13, 0.15, 0.08], [[0.08, 0.12, 0.13], [0.28, 0, 0.1], 0.14, 0.16, 0.08], [[0.08, 0.12, 0.0], [0.26, 0, -0.26], 0.16, 0.2, 0.1]], 0.014);
    antenna(lm, [0.1, 0.22, 0.44], 0.1, false, 0.008);
    len = 0.6; stride = 0.12; liftH = 0.05;
  } else if (kind === 'dragonfly') {   // オニヤンマ（白の軍＝黄と黒、黒の軍＝赤みと黒）
    const black = chitin(0x14140f, { rough: 0.3, coat: 0.8 }), band = chitin(dark ? 0x9a3a20 : 0xd9c22a, { rough: 0.35, coat: 0.8 });
    const eye = eyeMat(dark ? 0x2a6a50 : 0x2fa06a);
    ball(body, [0.11, 0.1, 0.1], eye, [0.07, 0.6, 0.66]); ball(body, [0.11, 0.1, 0.1], eye, [-0.07, 0.6, 0.66]);   // 大きな複眼（左右がつく）
    body.add(lathe(ovoid(0.34, 0.12, 1, 1), black, { sx: 0.9, sy: 1.1, at: [0, 0.56, 0.42] }));   // 胸
    for (let i = 0; i < 10; i++) { const r = 0.05 - (i > 7 ? (i - 7) * 0.006 : 0); body.add(lathe(ovoid(0.13, r, 1, 1, 8), i % 2 ? band : black, { sx: 1, sy: 1.05, seg: 14, at: [0, 0.56, 0.22 - i * 0.12] })); }   // 腹の10の節
    const wm = new THREE.MeshPhysicalMaterial({ map: veinTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [200, 600], metalness: 0 });
    for (const [z, l, wd] of [[0.5, 1.0, 0.22], [0.36, 0.95, 0.26]]) for (const s of [1, -1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.05, 0.66, z); body.add(pivot);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(l, wd).translate(l / 2, 0, 0).rotateX(-Math.PI / 2), wm); w.scale.x = s; pivot.add(w);
      pivot.userData = { s, front: z > 0.4 }; wings.push(pivot);
    }
    for (const s of [1, -1]) for (let k = 0; k < 3; k++) stick(body, black, 0.012, 0.007)(new THREE.Vector3(s * 0.05, 0.48, 0.5 - k * 0.06), new THREE.Vector3(s * 0.09, 0.4, 0.62 - k * 0.04));   // 脚はたたむ
    len = 9.5;
  }
  // 体長を len cm に（実物のおよそ）。脚の座標は体の中なので、いっしょに縮む
  const box = new THREE.Box3().setFromObject(body), L = box.max.z - box.min.z, sc = len / L;
  body.scale.setScalar(sc);
  for (const Lg of legs) Lg.pose();
  const st = { ph: 0, stride, lift: liftH };
  let t = 0;
  return {
    root, kind, len,
    // speed: cm/s（体の前へ）。opt.side = 1 なら横へ這う（ヨコバイ）。opt.fly = トンボの高さの倍率
    update(dt, speed = 0, opt = {}) {
      t += dt;
      const v = speed / sc;                                   // 体の中の単位の速さ
      const dx = opt.side ? 1 : 0, dz = opt.side ? 0 : 1;
      if (legs.length) walk(legs, dt, Math.abs(v), dx, dz, st);
      body.position.y = legs.length && speed > 0.01 ? Math.abs(Math.sin(st.ph * Math.PI * 2)) * 0.012 * len : 0;
      for (const a of antennae) a.rotation.set(Math.sin(t * 3.1 + a.userData.s) * 0.12, Math.sin(t * 2.3 + a.userData.s * 2) * 0.15, 0);
      if (kind === 'dragonfly') {   // 羽ばたき（本物は 1 秒に 30 回ほど。そのままだと止まって見えるので、ゆっくりにした ※ 演出）
        for (const w of wings) w.rotation.z = w.userData.s * Math.sin(t * 24 + (w.userData.front ? 0 : 1.7)) * 0.5;
        body.position.y = (opt.fly ?? 1) * (2.6 + Math.sin(t * 2) * 0.25) / 1;
      }
    },
  };
}
