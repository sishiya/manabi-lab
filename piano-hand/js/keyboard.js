// 鍵盤の見た目（本物に近い形）: 白鍵は手前が幅いっぱい・黒鍵のあいだの奥が細い（切り欠き）、上面は角の丸い樹脂の板と前の面、下に木の本体。
// 黒鍵は上が細い台形で手前の面が斜め。鍵はシーソーのように奥の支点（KEY_PIVOT）で回って沈む（手前ほど深い）。
// 手前の木の縁（拍子木）・奥のフェルト・両端の木の部品。寸法は keys.js の KB（目安の値は下のコメント）
'use strict';

const KEYTOP_T = 2.4, KEYFRONT_H = 11, KEY_GAP = 1.0, BLACK_TOP_W = 9.6, BLACK_TOP_INSET = 7; // 白鍵の樹脂の厚さ・前の面の高さ・すき間、黒鍵の上面の幅・手前の傾きの長さ（mm、目安）

function whiteKeyShape(m) {
  // 上から見た輪郭（shape の x = 横、y = 奥への距離）。となりが黒鍵なら、その分だけ奥を細く
  const hw = (KB.W - KEY_GAP) / 2, cx = keyX(m), cut = -KB.BFRONT + 1.2; // 切り欠きは黒鍵の手前の端の 1.2mm 手前から
  const left = isBlack(m - 1) && m - 1 >= KB.lo ? keyX(m - 1) + KB.BW / 2 + KEY_GAP * 0.8 - cx : -hw;
  const right = isBlack(m + 1) && m + 1 <= KB.hi ? keyX(m + 1) - KB.BW / 2 - KEY_GAP * 0.8 - cx : hw;
  const s = new THREE.Shape(), b = 0.6; // 角の丸め（bevel）の分だけ内側に
  s.moveTo(-hw + b, b); s.lineTo(hw - b, b);
  if (right < hw) { s.lineTo(hw - b, cut); s.lineTo(right - b, cut); }
  s.lineTo(right - b, KB.WL - b); s.lineTo(left + b, KB.WL - b);
  if (left > -hw) { s.lineTo(left + b, cut); s.lineTo(-hw + b, cut); }
  s.closePath();
  return { s, left, right, hw };
}

// 黒鍵: 下は幅 BW・長さ BL の箱、白鍵の上面より上は上が細い台形（手前の面は斜め）
function blackKeyGeometry() {
  const hb = KB.BW / 2, ht = BLACK_TOP_W / 2, z0 = KB.BFRONT, z1 = -KB.WL, H = KB.BH;
  const v = [ // 下の4点（y=-10）・白鍵の上面の高さの4点（y=0）・上の4点（y=H）
    [-hb, -10, z0], [hb, -10, z0], [hb, -10, z1], [-hb, -10, z1],
    [-hb, 0, z0], [hb, 0, z0], [hb, 0, z1], [-hb, 0, z1],
    [-ht, H, z0 - BLACK_TOP_INSET], [ht, H, z0 - BLACK_TOP_INSET], [ht, H, z1], [-ht, H, z1]];
  const quads = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 9, 8], [5, 6, 10, 9], [6, 7, 11, 10], [7, 4, 8, 11], [8, 9, 10, 11]];
  const pos = [];
  for (const [a, b, c, d] of quads) for (const i of [a, b, c, a, c, d]) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function makeKeyboard(sc) {
  const KP = KEY_PIVOT;
  const ivory = new THREE.MeshPhysicalMaterial({ color: linCol(0xf3f0e7), roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.18, sheen: new THREE.Color(0.15, 0.14, 0.12) });
  const wood = new THREE.MeshStandardMaterial({ color: linCol(0xcdbb96), roughness: 0.8 });
  const ebony = new THREE.MeshPhysicalMaterial({ color: linCol(0x111114), roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  const blackG = blackKeyGeometry();
  for (let m = KB.lo; m <= KB.hi; m++) {
    const b = isBlack(m);
    // 支点のまわりに回すので、支点（z = -KEY_PIVOT）を原点にした組に入れる
    const k = new THREE.Group(); k.position.set(keyX(m), 0, -KP);
    const mats = [];
    const add = (geo, mat, z) => { const mm = mat.clone(); mats.push(mm); const o = new THREE.Mesh(geo, mm); o.position.z = KP + (z || 0); o.castShadow = b; o.receiveShadow = true; k.add(o); return o; };
    if (b) add(blackG, ebony);
    else {
      const { s, left, right, hw } = whiteKeyShape(m);
      const top = new THREE.ExtrudeGeometry(s, { depth: KEYTOP_T - 1.2, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2, curveSegments: 4 });
      top.rotateX(-Math.PI / 2); top.translate(-keyX(m) * 0, -KEYTOP_T + 0.6, 0);
      add(top, ivory);
      const front = new THREE.BoxGeometry(hw * 2 - 0.4, KEYFRONT_H, 2.2); front.translate(0, -KEYFRONT_H / 2 - 0.4, -1.1);
      add(front, ivory);
      const body = new THREE.BoxGeometry(Math.max(8, right - left - 1.5), 8.6, KB.WL - 3); body.translate((left + right) / 2, -KEYTOP_T - 4.3, -KB.WL / 2 - 1.5); // 木の本体（前の面の後ろに隠れる高さ）
      add(body, wood);
    }
    k.userData = { mats, cols: mats.map(x => x.color.clone()) };
    sc.add(k); V.keys[m] = k;
  }
  // 手前の木の縁（拍子木）・奥のフェルト・両端の木の部品
  const lacquer = new THREE.MeshPhysicalMaterial({ color: linCol(0x0d0d10), roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  const slip = new THREE.Mesh(new THREE.BoxGeometry(KB_WIDTH + 70, 30, 14), lacquer);
  slip.position.set(0, -27, 9); slip.receiveShadow = true; sc.add(slip);
  const felt = new THREE.Mesh(new THREE.BoxGeometry(KB_WIDTH, 6, 4), new THREE.MeshStandardMaterial({ color: linCol(0x6e1420), roughness: 1 }));
  felt.position.set(0, -5, -KB.WL - 2.2); sc.add(felt);
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(32, 44, KB.WL + 22), lacquer);
    cheek.position.set(sx * (KB_WIDTH / 2 + 17), -14, -KB.WL / 2 + 6); cheek.castShadow = true; cheek.receiveShadow = true; sc.add(cheek);
  }
}

// 鍵を押しこみ d（手前の端での深さ、mm）だけ回す。f は押している指（色づけ）
function setKeyState(m, d, f) {
  const k = V.keys[m];
  k.rotation.x = Math.atan(d / KEY_PIVOT);
  k.userData.mats.forEach((mat, i) => {
    const base = k.userData.cols[i];
    if (d > 0 && i === 0) { const c = linCol(f ? FCOL[f] : 0x8892a6); mat.color.copy(c).lerp(base, 0.8); mat.emissive.copy(c).multiplyScalar(0.08 * d / KB.DEPTH); }
    else { mat.color.copy(base); mat.emissive.setRGB(0, 0, 0); }
  });
}
