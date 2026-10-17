// キーボードの見た目: 上がせまい台形のキー（上面に文字）、土台の板、ケース。キーはまっすぐ沈む。
// F と J には、ホームポジションの目印の小さな出っぱり。寸法は keys.js の KB（目安）
'use strict';
const KEY_BOTTOM_GAP = 1.2; // となりのキーとの、下の端のすき間（mm、目安）
const capIn = () => (KB.U - KB.CAP) / 2; // 上面が下より内側に入る量（片側。キーボードの種類で変わる）

// キーの形（2026-10-17 に作りなおし。ユーザー「ポリゴンすぎる」）: 角を丸めた四角の断面を、下から上へすぼめながら重ねた筒。
// 側面は少しふくらみ、上面のふちは丸く落とし、上面は指の当たる所が横方向に少しくぼむ（円筒のくぼみ）。面の陰影はなめらか。
// 下 w×d、上は片側 capIn() ずつせまい、高さ h。上面のふちが y=0。寸法の丸め・くぼみの深さは目安
const CAP_CORNER = 1.6, CAP_TOP_CORNER = 2.6, CAP_EDGE = 0.9, CAP_SEG = 5; // 下の角の半径・上の角の半径・上のふちの丸み・角の分け数
function roundRectRing(w, d, r, y, dish) { // 角の丸い四角の周の点（反時計まわり、どの大きさでも同じ数）
  const pts = [], hw = w / 2, hd = d / 2; r = Math.min(r, hw - 0.1, hd - 0.1);
  const cs = [[hw - r, hd - r, 0], [-hw + r, hd - r, 0.5], [-hw + r, -hd + r, 1], [hw - r, -hd + r, 1.5]];
  for (const [cx, cz, a0] of cs) for (let i = 0; i <= CAP_SEG; i++) {
    const a = (a0 + 0.5 * i / CAP_SEG) * Math.PI, x = cx + r * Math.cos(a), z = cz + r * Math.sin(a);
    pts.push([x, y - (dish ? dish(x) : 0), z]);
  }
  return pts;
}
function capGeometry(w, d, h) {
  const ins = capIn() - KEY_BOTTOM_GAP / 2, tw = w - 2 * ins, td = d - 2 * ins, thin = h < 5;
  const dishD = thin ? 0.15 : 0.6, dish = x => dishD * (1 - Math.min(1, (2 * x / tw) ** 2)); // 上面のくぼみ（横に円筒）
  const rings = [];
  // 側面: 下から上へ。少しふくらませる（まっすぐな台形より丸みのある形）
  const NS = 5;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, bulge = Math.sin(Math.PI * s) * 0.35;
    const ww = w + (tw - w) * s + bulge, dd = d + (td - d) * s + bulge, r = CAP_CORNER + (CAP_TOP_CORNER - CAP_CORNER) * s;
    rings.push(roundRectRing(ww, dd, r, -h + (h - CAP_EDGE) * s, null));
  }
  // 上のふちの丸み（4分の1円）
  for (let i = 1; i <= 3; i++) {
    const a = i / 3 * Math.PI / 2, inset = CAP_EDGE * (1 - Math.cos(a)), up = CAP_EDGE * Math.sin(a);
    rings.push(roundRectRing(tw - 2 * inset, td - 2 * inset, CAP_TOP_CORNER - inset, -CAP_EDGE + up, i === 3 ? dish : null));
  }
  // 上面（くぼみ）: まん中へ向かって小さくした周を重ね、最後はまん中の1点
  const tw2 = tw - 2 * CAP_EDGE, td2 = td - 2 * CAP_EDGE;
  for (const s of [0.7, 0.4]) rings.push(roundRectRing(tw2 * s, td2 * s, (CAP_TOP_CORNER - CAP_EDGE) * s, 0, dish));
  const n = rings[0].length, pos = [], idx = [];
  for (const R of rings) for (const p of R) pos.push(...p);
  const c = pos.length / 3; pos.push(0, -dishD, 0);
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i, b = j * n + (i + 1) % n, cc = (j + 1) * n + i, dd = (j + 1) * n + (i + 1) % n;
    idx.push(a, cc, b, b, cc, dd);
  }
  const last = (rings.length - 1) * n;
  for (let i = 0; i < n; i++) idx.push(last + i, c, last + (i + 1) % n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// キーの文字（上面に貼る板）
function capLabelTexture(text, wpx, color) {
  const c = document.createElement('canvas'); c.width = wpx; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color || '#3a3d44'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const big = text.length <= 1;
  g.font = (big ? '600 70px' : '500 40px') + ' "Zen Kaku Gothic New", sans-serif';
  g.fillText(text, wpx / 2, 66);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}

function makeKeyboard(sc) {
  // 作りなおすとき（キーボードの種類を変えた）は、前のものを外す
  if (V.kbRoot) { V.kbRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== V.baseMat) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); sc.remove(V.kbRoot); }
  const root = V.kbRoot = new THREE.Group(); sc.add(root);
  V.keys = {};
  const capMat = () => new THREE.MeshPhysicalMaterial({ color: linCol(0xe8e6e1), roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 });
  for (const k of KEYS) {
    const kw = k.w * KB.U - KEY_BOTTOM_GAP, kd = k.d * KB.U - KEY_BOTTOM_GAP, zc = k.zv !== undefined ? k.zv : k.z;
    const grp = new THREE.Group(); grp.position.set(k.x, k.top, zc); grp.rotation.y = k.rot;
    const mat = KB.round ? new THREE.MeshPhysicalMaterial({ color: linCol(0x1b1b1d), roughness: 0.35, clearcoat: 0.6 }) : capMat();
    if (KB.round) typewriterKey(grp, k, kw, mat, root);
    else {
      // 土台の板（キーの下に、キー1つ分ずつ。左右に分かれた形でも同じ作り方ですむ）
      const base = new THREE.Mesh(new THREE.BoxGeometry(k.w * KB.U, 4, k.d * KB.U), V.baseMat);
      base.position.set(k.x, k.top - KB.CAP_H - 2.2, zc); base.rotation.y = k.rot; base.receiveShadow = true; root.add(base);
      const cap = new THREE.Mesh(capGeometry(kw, kd, KB.CAP_H), mat);
      cap.castShadow = true; cap.receiveShadow = true; grp.add(cap);
    }
    const tw = kw - 2 * capIn() + KEY_BOTTOM_GAP, td = kd - 2 * capIn() + KEY_BOTTOM_GAP;
    if (k.label && !KB.round) {
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(tw * 0.9, Math.min(td, KB.CAP) * 0.9), new THREE.MeshBasicMaterial({ map: capLabelTexture(k.label, Math.round(128 * Math.max(1, tw / KB.CAP))), transparent: true, depthWrite: false }));
      lab.rotation.x = -Math.PI / 2; lab.position.set(0, 0.05, k.d === 2 ? KB.U / 2 - 1 : 0); grp.add(lab);
    }
    if (!KB.round && (k.code === 'KeyF' || k.code === 'KeyJ')) { // ホームポジションの目印（小さな横棒の出っぱり）
      const bump = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 0.8), mat);
      bump.position.set(0, 0.3, 3.5); grp.add(bump);
    }
    root.add(grp);
    V.keys[k.m] = { grp, mat, k, y0: k.top };
  }
}
// タイプライターのキー（2026-10-17〜）: 黒い丸い天板（文字は白）を金属の輪でかこみ、細い棒（レバー）が奥へ下りていく。スペースは横に長い金属の棒。
// 寸法は目安。機械の本体はキーボードの奥の下に置いた暗い箱
const TW_METAL = () => new THREE.MeshStandardMaterial({ color: linCol(0xb9bcc2), roughness: 0.25, metalness: 1 });
function typewriterKey(grp, k, kw, mat, root) {
  const metal = TW_METAL();
  if (k.code === 'Space') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(kw, KB.CAP_H, 9), metal); bar.position.y = -KB.CAP_H / 2; bar.castShadow = true; grp.add(bar);
  } else {
    const r = KB.CAP / 2, h = KB.CAP_H;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), mat); top.position.y = -h / 2; top.castShadow = true; grp.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.4, 0.9, 10, 40), metal); ring.rotation.x = Math.PI / 2; ring.position.y = -0.6; grp.add(ring);
    const lab = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 32), new THREE.MeshBasicMaterial({ map: capLabelTexture(k.label, 128, '#f2efe6'), transparent: true, depthWrite: false }));
    lab.rotation.x = -Math.PI / 2; lab.position.y = 0.05; grp.add(lab);
  }
  // レバー: キーの下から奥の下へ（本体の中へ）
  const len = 60 + (4 - k.row) * 10, stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, len, 8), metal);
  const tilt = 0.5, hh = len / 2; // 上の端がキーの下、下の端は奥（−z）の下へ
  stem.rotation.x = tilt; stem.position.set(0, -KB.CAP_H - hh * Math.cos(tilt), -hh * Math.sin(tilt)); grp.add(stem);
  if (!V.twBody || V.twBody.parent !== root) { // 本体（1つだけ）
    const body = V.twBody = new THREE.Mesh(new THREE.BoxGeometry(KB.X_MAX - KB.X_MIN + 40, 60, 140), V.baseMat);
    body.position.set((KB.X_MAX + KB.X_MIN) / 2, -60, KB.Z_BACK - 40); body.receiveShadow = true; root.add(body);
  }
}

// キーの沈み（mm）と、押している指の色（なければ割り当ての色を淡く、または色なし）
function setKeyState(m, depth, finger, mapOn) {
  const BASE = KB.round ? 0x1b1b1d : 0xe8e6e1;
  const K = V.keys[m]; if (!K) return;
  K.grp.position.y = K.y0 - depth;
  const f = finger || 0, base = mapOn && K.k.f ? FCOL[K.k.f] : 0;
  const key = f * 1e7 + base;
  if (K.last === key) return;
  K.last = key;
  if (f) { K.mat.color.copy(linCol(BASE)).lerp(linCol(FCOL[f]), 0.55); K.mat.emissive.copy(linCol(FCOL[f])).multiplyScalar(0.12); }
  else if (base) { K.mat.color.copy(linCol(BASE)).lerp(linCol(base), 0.45); K.mat.emissive.setRGB(0, 0, 0); }
  else { K.mat.color.copy(linCol(BASE)); K.mat.emissive.setRGB(0, 0, 0); }
}
