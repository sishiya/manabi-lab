// 虫を組む（形も歩き方もこのアプリで作った。CC0 で本物らしい虫の 3D が見つからなかったため）
// 単位は cm。どの虫も、頭が +Z、背中が +Y、地面が y=0。update(dt, 速さ cm/s) で脚・触角・羽が動く
// 歩き方: 三脚歩行（左前・右中・左後 と 右前・左中・右後 の3本ずつを交互に。昆虫のふつうの歩き方）
import * as THREE from 'three';

const geoS = new THREE.SphereGeometry(1, 32, 20), geoC = new THREE.CylinderGeometry(0.7, 1, 1, 10).translate(0, 0.5, 0);   // 棒は先が少し細い
const pits = (() => {   // 殻の小さなくぼみ（点刻）と細かい傷の模様
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 2600; i++) { const x = Math.random() * n, y = Math.random() * n, r = Math.random() * 1.6 + 0.4; g.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.35})`; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); }
  for (let i = 0; i < 120; i++) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); const x = Math.random() * n, y = Math.random() * n; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
})();
function chitin(color, rough = 0.42) { return new THREE.MeshPhysicalMaterial({ color, roughness: rough, roughnessMap: pits, bumpMap: pits, bumpScale: 0.6, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color(0x887766) }); }
function ell(rx, ry, rz, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geoS, mat); m.scale.set(rx, ry, rz); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function rod(len, r, mat) { const m = new THREE.Mesh(geoC, mat); m.scale.set(r, len, r); m.castShadow = true; return m; }   // 根もとが原点、+Y へのびる

// 点 a から点 b へ棒を置く（太さ r）
const UPV = new THREE.Vector3(0, 1, 0);
function seg(parent, a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), m = rod(d.length(), r, mat);
  m.position.copy(a); m.quaternion.setFromUnitVectors(UPV, d.normalize()); parent.add(m); return m;
}
// 脚: 付け根（胸）→ 腿（もも。外へ少し上がる）→ すね（外へ下がって地面へ）→ 先（ふ節）。side = +1 右・-1 左、k = 前0・中1・後2
// 組み方: 付け根の Group の +X が「外向き」。前脚は前へ、後脚は後ろへ開く
function leg(parent, side, at, L, r, mat, k) {
  const hip = new THREE.Group(); hip.position.copy(at); parent.add(hip);
  const a = (1 - k) * 0.6; hip.rotation.y = side > 0 ? -a : Math.PI + a;
  const swing = new THREE.Group(); hip.add(swing);       // 前後にふる
  const fem = new THREE.Group(); swing.add(fem);         // 持ち上げる
  const p0 = new THREE.Vector3(0, 0, 0), p1 = new THREE.Vector3(L[0] * 0.85, L[0] * 0.5, 0);
  const groundY = -at.y;                                  // 体の中の高さ → 地面
  const p2 = new THREE.Vector3(p1.x + L[1] * 0.55, Math.max(groundY + L[2] * 0.3, p1.y - L[1] * 0.85), 0);
  const p3 = new THREE.Vector3(p2.x + L[2] * 0.85, groundY, 0);
  seg(fem, p0, p1, r, mat); seg(fem, p1, p2, r * 0.8, mat); seg(fem, p2, p3, r * 0.55, mat);
  for (const [p, rr] of [[p1, r * 1.05], [p2, r * 0.85]]) fem.add(ell(rr, rr, rr, mat, p.x, p.y, p.z));   // 関節
  hip.userData = { swing, fem, k, side };
  return hip;
}
function antenna(parent, side, at, L, mat, elbow = 0) {
  const a = new THREE.Group(); a.position.copy(at); parent.add(a);
  a.rotation.set(-0.5, side * 0.45, 0);
  const s1 = rod(L * (elbow ? 0.4 : 1), 0.012, mat); s1.rotation.x = Math.PI / 2 - 0.3; a.add(s1);
  if (elbow) { const j = new THREE.Group(); j.position.set(0, Math.cos(Math.PI / 2 - 0.3) * L * 0.4, Math.sin(Math.PI / 2 - 0.3) * L * 0.4); a.add(j); const s2 = rod(L * 0.6, 0.01, mat); s2.rotation.x = Math.PI / 2 + 0.7; s2.rotation.z = side * 0.3; j.add(s2); }
  a.userData = { side };
  return a;
}

// 三脚歩行: phase で脚を前後・上下に振る
function gait(legs, t, amp, lift) {
  for (const h of legs) {
    const { swing, fem, k, side } = h.userData; if (!swing) continue;
    const grp = (k === 1) === (side > 0) ? 0 : 1;   // 左前・右中・左後 が 0
    const ph = t + grp * Math.PI, s = Math.sin(ph), c = Math.cos(ph);
    swing.rotation.y = -side * c * amp;              // 前後にふる（左右で前の向きが逆になる組み方なので side をかける）
    fem.rotation.z = Math.max(0, s) * lift;          // 前へふるとき（振り出し）だけ持ち上げる
  }
}

function wingTex() {   // トンボの羽の模様（細い脈・わずかに色づく透明）
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(210,225,235,0.22)'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(40,50,60,0.55)'; g.lineWidth = 1;
  for (let x = 0; x < 256; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 4, 64); g.stroke(); }
  for (let y = 4; y < 64; y += 10) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 3, 170, y - 3, 256, y); g.stroke(); }
  g.fillStyle = 'rgba(40,30,20,0.8)'; g.fillRect(232, 6, 12, 7);   // 縁紋（はしの小さな黒い印）
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- 虫の種類 ----
export function makeInsect(kind, team = 'w') {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const legs = [], ants = [], wings = [];
  let len = 1, gaitAmp = 0.45, lift = 0.5, freq = 9;   // 1歩の回数（rad/s を速さで割る係数）
  const dark = team === 'b';
  if (kind === 'ant' || kind === 'queen') {
    const q = kind === 'queen', m = chitin(dark ? 0x140c08 : 0x7a2e12, 0.28), leg_m = chitin(dark ? 0x1d120c : 0x8a3a18, 0.4);
    body.add(ell(0.17, 0.15, 0.19, m, 0, 0.26, 0.47));                       // 頭
    body.add(ell(0.11, 0.1, 0.24, m, 0, 0.27, 0.16));                        // 胸
    body.add(ell(0.06, 0.08, 0.06, m, 0, 0.27, -0.12));                      // 腹柄（くびれ）
    body.add(ell(q ? 0.3 : 0.19, q ? 0.27 : 0.17, q ? 0.5 : 0.28, m, 0, q ? 0.32 : 0.28, q ? -0.62 : -0.42));   // 腹
    if (q) { body.add(ell(0.13, 0.12, 0.16, m, 0, 0.34, 0.12)); }           // 女王は胸が大きい（羽を落としたあと）
    for (const s of [-1, 1]) { const md = rod(0.13, 0.025, leg_m); md.position.set(s * 0.07, 0.22, 0.62); md.rotation.set(Math.PI / 2, 0, -s * 0.5); body.add(md); }   // 大あご
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) legs.push(leg(body, s, new THREE.Vector3(s * 0.08, 0.24, 0.26 - k * 0.11), [0.32, 0.36, 0.22], 0.022, leg_m, k));
    for (const s of [-1, 1]) ants.push(antenna(body, s, new THREE.Vector3(s * 0.07, 0.36, 0.6), 0.55, leg_m, 1));
    len = q ? 1.6 : 0.9;   // クロオオアリの女王 約 1.7 cm・働きアリ 約 0.7〜1.2 cm
  } else if (kind === 'beetle') {   // カブトムシ（雄）
    const m = chitin(dark ? 0x1a0e08 : 0x5a2a12, 0.22), leg_m = chitin(0x22140c, 0.35);
    body.add(ell(0.36, 0.26, 0.38, m, 0, 0.5, 0.42));                        // 前胸
    const ely = ell(0.42, 0.36, 0.62, m, 0, 0.5, -0.32); ely.scale.y = 0.34; body.add(ely);   // 上ばね（さや羽）
    body.add(ell(0.2, 0.14, 0.18, m, 0, 0.38, 0.82));                        // 頭
    const horn = new THREE.Group(); horn.position.set(0, 0.42, 0.95); body.add(horn);
    let p = horn; for (let i = 0; i < 5; i++) { const h = rod(0.22, 0.07 - i * 0.011, m); h.rotation.x = 0.9 - i * 0.28; p.add(h); const j = new THREE.Group(); j.position.set(0, Math.cos(0.9 - i * 0.28) * 0.22, Math.sin(0.9 - i * 0.28) * 0.22); p.add(j); p = j; }   // 曲がった角
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) legs.push(leg(body, s, new THREE.Vector3(s * 0.26, 0.36, 0.42 - k * 0.32), [0.5, 0.55, 0.32], 0.05, leg_m, k));
    for (const s of [-1, 1]) ants.push(antenna(body, s, new THREE.Vector3(s * 0.1, 0.4, 0.95), 0.18, leg_m));
    len = 5.0; gaitAmp = 0.35; lift = 0.35; freq = 5;   // カブトムシ（雄・角を含む）約 3〜8 cm
  } else if (kind === 'grasshopper') {   // バッタ（トノサマバッタ）
    const m = chitin(dark ? 0x4a4224 : 0x5f8a2c, 0.45), leg_m = chitin(dark ? 0x3e3820 : 0x6b9634, 0.5), wingM = chitin(dark ? 0x5e4f30 : 0x8a7a42, 0.6);
    body.add(ell(0.14, 0.17, 0.16, m, 0, 0.32, 0.62));                       // 頭
    body.add(ell(0.13, 0.15, 0.22, m, 0, 0.32, 0.35));                       // 胸
    body.add(ell(0.11, 0.12, 0.5, m, 0, 0.28, -0.2));                        // 腹
    const w = ell(0.12, 0.06, 0.62, wingM, 0, 0.42, -0.1); body.add(w);     // たたんだ羽
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) legs.push(leg(body, s, new THREE.Vector3(s * 0.07, 0.24, 0.42 - k * 0.12), [0.22, 0.26, 0.12], 0.018, leg_m, k));
    for (const s of [-1, 1]) {   // 後脚（大きなもも。跳ぶ脚）
      const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.28, 0.2); body.add(hip);
      const fem = ell(0.06, 0.08, 0.32, leg_m, 0, 0.18, -0.22); fem.rotation.x = -0.6; hip.add(fem);
      const tib = rod(0.55, 0.018, leg_m); tib.position.set(0, 0.36, -0.48); tib.rotation.x = Math.PI - 0.35; hip.add(tib);
      hip.rotation.y = s * 0.12; hip.userData = { hind: true };
    }
    for (const s of [-1, 1]) ants.push(antenna(body, s, new THREE.Vector3(s * 0.05, 0.42, 0.75), 0.4, leg_m));
    len = 4.5; freq = 8;   // トノサマバッタ 約 3.5〜6.5 cm
  } else if (kind === 'leafhopper') {   // ヨコバイ（ツマグロヨコバイのような緑の小さな虫）
    const m = chitin(dark ? 0x2a3a1a : 0x7cc240, 0.35), leg_m = chitin(dark ? 0x2a3020 : 0x9acc6a, 0.5);
    body.add(ell(0.18, 0.1, 0.12, m, 0, 0.22, 0.42));                        // 頭（横に広い）
    for (const s of [-1, 1]) { const w = ell(0.1, 0.05, 0.42, m, s * 0.08, 0.27, -0.02); w.rotation.z = -s * 0.5; body.add(w); }   // 屋根形の羽
    const tip = ell(0.05, 0.04, 0.06, chitin(0x111111), 0, 0.28, -0.42); body.add(tip);   // 羽の先の黒い斑
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) legs.push(leg(body, s, new THREE.Vector3(s * 0.08, 0.16, 0.25 - k * 0.12), [0.15, 0.17, 0.09], 0.012, leg_m, k));
    for (const s of [-1, 1]) ants.push(antenna(body, s, new THREE.Vector3(s * 0.12, 0.25, 0.5), 0.12, leg_m));
    len = 0.6; freq = 11;   // ツマグロヨコバイ 約 0.5〜0.6 cm（とても小さい）
  } else if (kind === 'dragonfly') {   // トンボ（オニヤンマのつもり）
    const eye = new THREE.MeshPhysicalMaterial({ color: dark ? 0x2a5040 : 0x2f9a6a, roughness: 0.15, clearcoat: 1, metalness: 0.1 });
    const m = chitin(dark ? 0x141410 : 0x1c1c14, 0.3), band = chitin(dark ? 0x8a2a1a : 0xd8c22a, 0.35);
    body.add(ell(0.1, 0.09, 0.08, eye, -0.07, 0.6, 0.62), ell(0.1, 0.09, 0.08, eye, 0.07, 0.6, 0.62));   // 大きな複眼
    body.add(ell(0.1, 0.12, 0.17, m, 0, 0.56, 0.42));                        // 胸
    for (let i = 0; i < 9; i++) { const sgm = ell(0.045, 0.05, 0.075, i % 2 ? band : m, 0, 0.56, 0.2 - i * 0.135); body.add(sgm); }   // 長い腹（黄と黒の縞）
    const wt = wingTex(), wm = new THREE.MeshBasicMaterial({ map: wt, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (const [z, l] of [[0.5, 0.95], [0.36, 0.9]]) for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.06, 0.64, z); body.add(pivot);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.2).translate(l / 2, 0, 0).rotateX(-Math.PI / 2), wm); w.scale.x = s; pivot.add(w);
      pivot.userData = { s, front: z > 0.4 }; wings.push(pivot);
    }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const h = leg(body, s, new THREE.Vector3(s * 0.05, 0.48, 0.48 - k * 0.06), [0.14, 0.14, 0.06], 0.012, m, k); h.rotation.x = 0.8; legs.push(h); }   // 脚はたたむ
    len = 9.5; freq = 0;   // オニヤンマ 約 9〜11 cm
  }
  { const box = new THREE.Box3().setFromObject(body); const L = box.max.z - box.min.z; body.scale.setScalar(len / L); }   // 体長を len cm に（実物のおよその大きさ）
  let t = 0, hop = 0;
  const api = {
    root, kind, len,
    // speed: cm/s。sideways = 横に這う（ヨコバイ）
    update(dt, speed = 0, opt = {}) {
      t += dt;
      const s = Math.abs(speed);
      if (kind !== 'dragonfly' && s > 0.01) gait(legs, t * freq * Math.min(2.2, 0.6 + s / len), gaitAmp, lift);
      else if (kind !== 'dragonfly') gait(legs, 0, 0, 0);
      for (const a of ants) a.rotation.x = -0.5 + Math.sin(t * 3 + a.userData.side) * 0.08;   // 触角をふる
      if (kind === 'dragonfly') {   // 羽ばたき（本物は 1 秒に 30 回ほど。画面ではそのままだと止まって見えるので、ゆっくりにした ※ 演出）
        for (const w of wings) w.rotation.z = w.userData.s * Math.sin(t * 22 + (w.userData.front ? 0 : 1.6)) * 0.55;
        body.position.y = (opt.fly ?? 1) * (2.5 + Math.sin(t * 2) * 0.25);
      } else body.position.y = s > 0.01 ? Math.abs(Math.sin(t * freq)) * 0.01 * len : 0;
    },
  };
  return api;
}
