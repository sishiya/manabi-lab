// キーボードの見た目: 上がせまい台形のキー（上面に文字）、土台の板、ケース。キーはまっすぐ沈む。
// F と J には、ホームポジションの目印の小さな出っぱり。寸法は keys.js の KB（目安）
'use strict';
const KEY_BOTTOM_GAP = 1.2; // となりのキーとの、下の端のすき間（mm、目安）
const KEY_CAP_IN = (KB.U - KB.CAP) / 2; // 上面が下より内側に入る量（片側）

// 上がせまい台形の箱（下 w×d、上は片側 KEY_CAP_IN ずつせまい、高さ h）。上面が y=0
function capGeometry(w, d, h) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0) p.setXYZ(i, x - Math.sign(x) * (KEY_CAP_IN - KEY_BOTTOM_GAP / 2), y, z - Math.sign(z) * (KEY_CAP_IN - KEY_BOTTOM_GAP / 2));
  }
  g.translate(0, -h / 2, 0);
  g.computeVertexNormals();
  return g;
}
// キーの文字（上面に貼る板）
function capLabelTexture(text, wpx) {
  const c = document.createElement('canvas'); c.width = wpx; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3d44'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const big = text.length <= 1;
  g.font = (big ? '600 70px' : '500 40px') + ' "Zen Kaku Gothic New", sans-serif';
  g.fillText(text, wpx / 2, 66);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}

function makeKeyboard(sc) {
  V.keys = {};
  const capMat = () => new THREE.MeshPhysicalMaterial({ color: linCol(0xe8e6e1), roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 });
  // 土台の板とケース
  const yB = -KB.CAP_H - 2.2; // 板の中心（ホームの段のキーの下の端のすぐ下。厚さ 4mm）
  const w = KB.X_MAX - KB.X_MIN, d = KB.Z_FRONT - KB.Z_BACK;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), V.baseMat);
  plate.position.set((KB.X_MAX + KB.X_MIN) / 2, yB, (KB.Z_FRONT + KB.Z_BACK) / 2);
  plate.rotation.x = Math.atan(KB.ROW_UP / KB.U); // キーボードの傾き（奥が高い）
  plate.receiveShadow = true; sc.add(plate);
  for (const k of KEYS) {
    const kw = k.w * KB.U - KEY_BOTTOM_GAP, kd = k.d * KB.U - KEY_BOTTOM_GAP, zc = k.zv !== undefined ? k.zv : k.z;
    const grp = new THREE.Group(); grp.position.set(k.x, k.top, zc);
    const mat = capMat();
    const cap = new THREE.Mesh(capGeometry(kw, kd, KB.CAP_H), mat);
    cap.castShadow = true; cap.receiveShadow = true; grp.add(cap);
    const tw = kw - 2 * KEY_CAP_IN + KEY_BOTTOM_GAP, td = kd - 2 * KEY_CAP_IN + KEY_BOTTOM_GAP;
    if (k.label) {
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(tw * 0.9, Math.min(td, KB.CAP) * 0.9), new THREE.MeshBasicMaterial({ map: capLabelTexture(k.label, Math.round(128 * Math.max(1, tw / KB.CAP))), transparent: true, depthWrite: false }));
      lab.rotation.x = -Math.PI / 2; lab.position.set(0, 0.05, k.code === 'Enter' ? KB.U / 2 - 1 : 0); grp.add(lab);
    }
    if (k.code === 'KeyF' || k.code === 'KeyJ') { // ホームポジションの目印（小さな横棒の出っぱり）
      const bump = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 0.8), mat);
      bump.position.set(0, 0.3, 3.5); grp.add(bump);
    }
    sc.add(grp);
    V.keys[k.m] = { grp, mat, k, y0: k.top };
  }
}
// キーの沈み（mm）と、押している指の色（なければ割り当ての色を淡く、または色なし）
function setKeyState(m, depth, finger, mapOn) {
  const K = V.keys[m]; if (!K) return;
  K.grp.position.y = K.y0 - depth;
  const f = finger || 0, base = mapOn && K.k.f ? FCOL[K.k.f] : 0;
  const key = f * 1e7 + base;
  if (K.last === key) return;
  K.last = key;
  if (f) { K.mat.color.copy(linCol(0xe8e6e1)).lerp(linCol(FCOL[f]), 0.55); K.mat.emissive.copy(linCol(FCOL[f])).multiplyScalar(0.12); }
  else if (base) { K.mat.color.copy(linCol(0xe8e6e1)).lerp(linCol(base), 0.45); K.mat.emissive.setRGB(0, 0, 0); }
  else { K.mat.color.copy(linCol(0xe8e6e1)); K.mat.emissive.setRGB(0, 0, 0); }
}
