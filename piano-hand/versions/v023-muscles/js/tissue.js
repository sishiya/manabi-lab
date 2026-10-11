// 骨と皮ふのあいだ（v023〜）: 筋肉・腱・脂肪の模型。「筋肉・腱・脂肪」の表示で骨の上に見せる。
// 部品は両端をそれぞれ骨に付ける。両端が別の骨なら、関節が動くとのび縮みする。筋肉は体積がほぼ変わらない
// （水が主な、ほぼ縮まない組織）ので、のびると細く・縮むと太くなるように、太さを √(元の長さ / いまの長さ) 倍にする。腱と脂肪は太さを変えない。
// 位置と太さは解剖学の図をもとにしたこのアプリの目安（測った値ではない）。測った値があるのは、指先の肉（Buryanov & Kotiuk 2010）と
// 手首の手のひら側の肉（PubMed 16844164）だけで、それに合うかは DEVNOTES の「筋肉・腱・脂肪の模型」に。
// 次の段階で、皮ふはこの模型（と骨）の外側に作りなおす。
'use strict';

// 色（種類ごと）
const TISSUE_KIND = {
  muscle: { col: 0xa8453d, rough: 0.55 }, // 筋肉
  tendon: { col: 0xa9bdd0, rough: 0.25 }, // 腱・腱膜（本物は銀白色だが、骨の象牙色と見分けられるよう青みの灰色に）
  fat: { col: 0xe9c66a, rough: 0.6 },     // 脂肪
};

// 部品の位置の書き方（大きさをかける前の手の座標・mm）
// 手のひらの骨に付く点: 中手骨 f（2〜5）にそって u（0 = 根もと、1 = 頭）、そこから横 dx（+ が小指の側）・上 dy（+ が甲の側）
function mcEnds(f) {
  const b = FINGERS_U[f].base, c = [2, 0, 40], d = [c[0] - b[0], c[1] - b[1], c[2] - b[2]], n = Math.hypot(...d);
  return { s: [b[0] + d[0] / n * MC_LEN[f], b[1] + d[1] / n * MC_LEN[f], b[2] + d[2] / n * MC_LEN[f]], h: b };
}
const tM = (f, u, dx, dy) => { const { s, h } = mcEnds(f); return { bone: BONE_PALM, p: [s[0] + (h[0] - s[0]) * u + dx, s[1] + (h[1] - s[1]) * u + dy, s[2] + (h[2] - s[2]) * u] }; };
const tP = p => ({ bone: BONE_PALM, p }); // 手のひら（手根骨のあたり）に固定した点
const tA = p => ({ bone: BONE_ARM, p });  // 前腕に固定した点
// 指の骨（f, j）に付く点: 骨にそって u（0 = 関節、1 = 次の関節）、骨の座標で横 dx・甲の側 dy。local は骨の座標
const tF = (f, j, u, dx, dy) => ({ bone: boneOf(f, j), local: [dx, dy, u * FINGERS_U[f].L[j]] });
const mcR = (f, k) => MC_R[f][k] * 0.85;     // 中手骨の縦の半径（骨は縦に 0.85 倍うすい）
const pdR = (f, j, k) => BONE_R[f][j][k] * 0.78; // 指骨の縦の半径（0.78 倍）

// 部品の一覧: [名前（日本語, 英語）, 種類, 端 a, 端 b, 太さ a, 太さ b, 中ほどのふくらみ, 縦の比（y / x）]
function tissueParts() {
  const T = [];
  const add = (ja, en, kind, a, b, ra, rb, bulge, flat) => T.push({ ja, en, kind, a, b, ra, rb, bulge: bulge || 0, flat: flat || 1 });
  const RAD = -1; // 指の骨の座標で親指の側（下で確かめた向き）
  for (let f = 2; f <= 5; f++) {
    const rh = mcR(f, 2), rs = mcR(f, 1);
    // 伸筋腱（総指伸筋）: 手首の甲 → 中手骨の甲 → 指の背の腱膜 → 中節骨（中央索）→ 末節骨。うすく平たい
    add('指をのばす腱（総指伸筋腱）', 'Finger extensor tendon', 'tendon', tA([mcEnds(f).s[0] * 0.5, 7, 30]), tM(f, 0, 0, mcR(f, 0) + 1.5), 2.6, 2.6, 0, 0.4);
    add('指をのばす腱（総指伸筋腱）', 'Finger extensor tendon', 'tendon', tM(f, 0, 0, mcR(f, 0) + 1.5), tM(f, 1, 0, rh + 1.2), 2.6, 2.8, 0, 0.4);
    add('指の背の腱膜', 'Extensor hood', 'tendon', tM(f, 1, 0, rh + 1.2), tF(f, 0, 0.55, 0, pdR(f, 0, 1) + 1.0), 4.2, 3.6, 0, 0.25);
    add('指の背の腱膜', 'Extensor hood', 'tendon', tF(f, 0, 0.55, 0, pdR(f, 0, 1) + 1.0), tF(f, 1, 0.1, 0, pdR(f, 1, 0) + 0.9), 3.6, 3.0, 0, 0.25);
    add('指の背の腱膜', 'Extensor hood', 'tendon', tF(f, 1, 0.1, 0, pdR(f, 1, 0) + 0.9), tF(f, 2, 0.12, 0, pdR(f, 2, 0) + 0.7), 3.0, 2.4, 0, 0.25);
    // 屈筋腱（浅指屈筋・深指屈筋の2本をまとめて）: 前腕 → 手根管 → 中手骨の手のひら側 → 指の手のひら側（腱鞘で骨に沿う）
    const cx = mcEnds(f).s[0] * 0.35;
    add('指を曲げる腱（浅指屈筋腱・深指屈筋腱）', 'Finger flexor tendons', 'tendon', tA([cx, -12, 40]), tP([cx, -10, -4]), 3.4, 3.4, 0, 0.6);
    add('指を曲げる腱（浅指屈筋腱・深指屈筋腱）', 'Finger flexor tendons', 'tendon', tP([cx, -10, -4]), tM(f, 0.97, 0, -(rh + 3.2)), 3.4, 3.2, 0, 0.6);
    add('指を曲げる腱（浅指屈筋腱・深指屈筋腱）', 'Finger flexor tendons', 'tendon', tM(f, 0.97, 0, -(rh + 3.2)), tF(f, 0, 0.92, 0, -(pdR(f, 0, 2) + 2.4)), 3.2, 3.0, 0, 0.55);
    add('指を曲げる腱（深指屈筋腱）', 'Finger flexor tendon', 'tendon', tF(f, 0, 0.92, 0, -(pdR(f, 0, 2) + 2.4)), tF(f, 1, 0.9, 0, -(pdR(f, 1, 2) + 1.8)), 3.0, 2.2, 0, 0.55);
    add('指を曲げる腱（深指屈筋腱）', 'Finger flexor tendon', 'tendon', tF(f, 1, 0.9, 0, -(pdR(f, 1, 2) + 1.8)), tF(f, 2, 0.25, 0, -(pdR(f, 2, 0) + 1.4)), 2.2, 1.6, 0, 0.55);
    // 虫様筋: 屈筋腱から、指の親指の側の付け根の腱膜へ
    add('虫様筋', 'Lumbrical', 'muscle', tM(f, 0.35, -2, -(rs + 5)), tF(f, 0, 0.3, RAD * (pdR(f, 0, 1) / 0.78 + 1.5), -1), 1.8, 1.4, 1.6, 0.8);
    // 手のひらの脂肪のふくらみ（指の付け根の手のひら側。手の皮ふの「指の付け根のふくらみ」）
    add('指の付け根の脂肪', 'Fat pad at the finger base', 'fat', tM(f, 0.78, 0, -(rh + 7.5)), tM(f, 1.08, 0, -(rh + 7)), 4.5, 4.0, 1.5, 0.75);
    // 手掌腱膜（手のひらの皮ふの下の、扇のような腱の膜）
    add('手掌腱膜', 'Palmar aponeurosis', 'tendon', tP([4, -15, -12]), tM(f, 0.8, 0, -(rh + 5.5)), 1.5, 3.5, 0, 0.25);
  }
  // 指の手のひら側の脂肪（基節・中節のはら、指先のはら）
  for (let f = 1; f <= 5; f++) {
    if (f > 1) add('指のはらの脂肪', 'Finger pad fat', 'fat', tF(f, 0, 0.25, 0, -(pdR(f, 0, 1) + 3.5)), tF(f, 0, 0.78, 0, -(pdR(f, 0, 1) + 3.5)), 2.6, 2.6, 1.3, 0.7);
    add('指のはらの脂肪', 'Finger pad fat', 'fat', tF(f, 1, 0.2, 0, -(pdR(f, 1, 1) + 3.2)), tF(f, 1, 0.8, 0, -(pdR(f, 1, 1) + 3.2)), 2.4, 2.4, 1.2, 0.7);
    add('指先のはらの脂肪', 'Fingertip pulp', 'fat', tF(f, 2, 0.2, 0, -(pdR(f, 2, 1) + 3.0)), tF(f, 2, 0.95, 0, -(pdR(f, 2, 1) + 2.4)), 3.0, 3.6, 1.6, 0.75);
  }
  // 骨間筋（中手骨のあいだを埋める。背側と掌側をまとめて1つ）
  for (let f = 2; f <= 4; f++) {
    const mid = u => { const A = tM(f, u, 0, -2.5).p, B = tM(f + 1, u, 0, -2.5).p; return tP([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]); };
    add('骨間筋', 'Interosseous muscles', 'muscle', mid(0.1), mid(0.88), 2.4, 2.2, 1.8, 1.35); // 中手骨の甲の面より上へは出ない高さ
  }
  // 親指: 長母指屈筋腱・長母指伸筋腱
  const t0 = pdR(1, 0, 1), t0h = pdR(1, 0, 2), t1 = pdR(1, 1, 2);
  add('親指を曲げる腱（長母指屈筋腱）', 'Thumb flexor tendon', 'tendon', tA([-8, -12, 40]), tP([-8, -10, -4]), 2.4, 2.4, 0, 0.7);
  add('親指を曲げる腱（長母指屈筋腱）', 'Thumb flexor tendon', 'tendon', tP([-8, -10, -4]), tF(1, 0, 0.95, 0, -(t0h + 2.2)), 2.4, 2.4, 0, 0.7);
  add('親指を曲げる腱（長母指屈筋腱）', 'Thumb flexor tendon', 'tendon', tF(1, 0, 0.95, 0, -(t0h + 2.2)), tF(1, 1, 0.92, 0, -(t1 + 1.8)), 2.4, 2.0, 0, 0.7);
  add('親指を曲げる腱（長母指屈筋腱）', 'Thumb flexor tendon', 'tendon', tF(1, 1, 0.92, 0, -(t1 + 1.8)), tF(1, 2, 0.3, 0, -(pdR(1, 2, 0) + 1.4)), 2.0, 1.6, 0, 0.7);
  add('親指をのばす腱（長母指伸筋腱）', 'Thumb extensor tendon', 'tendon', tA([-6, 8, 40]), tP([-8, 7, -2]), 1.8, 1.8, 0, 0.6);
  add('親指をのばす腱（長母指伸筋腱）', 'Thumb extensor tendon', 'tendon', tP([-8, 7, -2]), tF(1, 0, 0.5, 0, t0 + 1.4), 1.8, 1.8, 0, 0.6);
  add('親指をのばす腱（長母指伸筋腱）', 'Thumb extensor tendon', 'tendon', tF(1, 0, 0.5, 0, t0 + 1.4), tF(1, 1, 0.5, 0, pdR(1, 1, 1) + 1.2), 1.8, 2.0, 0, 0.5);
  add('親指をのばす腱（長母指伸筋腱）', 'Thumb extensor tendon', 'tendon', tF(1, 1, 0.5, 0, pdR(1, 1, 1) + 1.2), tF(1, 2, 0.12, 0, pdR(1, 2, 0) + 0.8), 2.0, 1.8, 0, 0.5);
  // 母指球（短母指外転筋・短母指屈筋: 手根骨の手のひら側 → 親指の基節骨の根もと）と母指対立筋（→ 親指の中手骨）
  add('母指球の筋肉（短母指外転筋・短母指屈筋）', 'Thenar muscles (abductor and flexor pollicis brevis)', 'muscle', tP([-13, -14, -16]), tF(1, 1, 0.08, 0, -(pdR(1, 1, 0) + 1)), 4.5, 3.0, 5.5, 0.8);
  add('母指対立筋', 'Opponens pollicis', 'muscle', tP([-10, -12, -20]), tF(1, 0, 0.75, 0, -(t0 + 2)), 4.0, 2.8, 3.0, 0.8);
  // 母指内転筋（中指の中手骨の手のひら側から、扇のようにうすく親指の基節骨へ）と第1背側骨間筋（親指と人さし指の中手骨のあいだの水かき）
  add('母指内転筋', 'Adductor pollicis', 'muscle', tM(3, 0.55, 0, -(mcR(3, 1) + 3)), tF(1, 1, 0.06, 0, -2), 8.0, 3.0, 1.5, 0.4);
  add('第1背側骨間筋', 'First dorsal interosseous', 'muscle', tF(1, 0, 0.45, 0, 0), tM(2, 0.88, -6, 0), 4.5, 3.5, 4.5, 1.0);
  // 小指球（小指外転筋・短小指屈筋・小指対立筋: 豆状骨・有鉤骨鉤 → 小指の基節骨の根もと・中手骨）
  add('小指球の筋肉', 'Hypothenar muscles', 'muscle', tP([12, -10, -10]), tF(5, 0, 0.1, -RAD * 3, -(pdR(5, 0, 0) + 1)), 5.0, 2.6, 5.0, 0.85);
  // 前腕の筋肉のふくらみ（手首から 6cm より肘の側。屈筋群は手のひら側、伸筋群は甲の側）
  add('前腕の屈筋群', 'Forearm flexor muscles', 'muscle', tA([3, -13, 55]), tA([3, -18, 235]), 9, 14, 6, 0.55);
  add('前腕の伸筋群', 'Forearm extensor muscles', 'muscle', tA([2, 4, 55]), tA([3, -2, 235]), 8, 12, 5, 0.6);
  return T;
}

// 網を作る姿勢（REST_DEG）での骨の座標軸（大きさをかける前）。手のひら・前腕は手の座標そのもの
function tissueRestFrames() {
  const I = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const out = [I, I];
  for (let f = 1; f <= 5; f++) for (const B of boneFrames(FINGERS_U[f], REST_DEG[f][0] * D2R, REST_DEG[f][1] * D2R, REST_DEG[f][2] * D2R)) out.push(B);
  return out;
}
// 端の点の、骨の座標（local）。手の座標で書いた点は、網の姿勢の骨の座標へ直す
function endLocal(e, R) {
  if (e.local) return e.local;
  const B = R[e.bone], q = sub3(e.p, B.o);
  return [dot3(q, B.x), dot3(q, B.y), dot3(q, B.z)];
}
const endAt = (B, l, s) => [B.o[0] + (B.x[0] * l[0] + B.y[0] * l[1] + B.z[0] * l[2]) * s, B.o[1] + (B.x[1] * l[0] + B.y[1] * l[1] + B.z[1] * l[2]) * s, B.o[2] + (B.x[2] * l[0] + B.y[2] * l[1] + B.z[2] * l[2]) * s];

// 長さ 1 の回転体（z = 0 〜 1）。太さは mm（大きさは描くときにかける）
function tissueGeom(T) {
  const N = 16, pts = [new THREE.Vector2(0.01, 0)];
  for (let i = 0; i <= N; i++) {
    const u = i / N, cap = Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.min(u, 1 - u) * 8) / 2)));
    pts.push(new THREE.Vector2(Math.max(0.01, (T.ra + (T.rb - T.ra) * u + T.bulge * Math.sin(Math.PI * u)) * (0.35 + 0.65 * cap)), u));
  }
  pts.push(new THREE.Vector2(0.01, 1));
  const g = new THREE.LatheGeometry(pts, 18);
  g.rotateX(Math.PI / 2); g.scale(1, T.flat, 1); g.computeVertexNormals();
  return g;
}

let TISSUE_GEOM_KEY = '';
function makeTissueHand(sc, side) {
  const mats = {};
  for (const k in TISSUE_KIND) mats[k] = new THREE.MeshStandardMaterial({ color: linCol(TISSUE_KIND[k].col), roughness: TISSUE_KIND[k].rough, metalness: 0, transparent: true, opacity: 1 });
  const H = { side, mats, parts: [], group: new THREE.Group() };
  sc.add(H.group);
  buildTissueParts(H);
  return H;
}
function buildTissueParts(H) {
  for (const p of H.parts) { H.group.remove(p.mesh); p.mesh.geometry.dispose(); }
  H.parts = [];
  const R = tissueRestFrames();
  for (const T of tissueParts()) {
    const la = endLocal(T.a, R), lb = endLocal(T.b, R);
    const L0 = Math.hypot(...sub3(endAt(R[T.a.bone], la, 1), endAt(R[T.b.bone], lb, 1)));
    const mesh = new THREE.Mesh(tissueGeom(T), H.mats[T.kind]);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    H.group.add(mesh);
    H.parts.push({ T, mesh, la, lb, L0 });
  }
  TISSUE_GEOM_KEY = HAND.id;
}

const _tm = new THREE.Matrix4(), _tx = new THREE.Vector3(), _ty = new THREE.Vector3(), _tz = new THREE.Vector3();
// 部品ごとの、いまの長さ ÷ 網の姿勢での長さ（のび縮み）。検査・表示用に H.stretch に入れる
function renderTissueHand(H, pose, opt) {
  const show = !!pose && !!opt.muscles;
  H.group.visible = show;
  if (!show) return;
  if (TISSUE_GEOM_KEY !== HAND.id) for (const VH of V.hands) buildTissueParts(VH.tissue);
  const ghost = !!opt.xray;
  for (const k in H.mats) { const m = H.mats[k]; m.opacity = ghost ? 0.75 : 1; m.depthWrite = !ghost; }
  const bones = poseBones(pose), s = HAND.s;
  for (const P of H.parts) {
    const A = bones[P.T.a.bone], a = endAt(A, P.la, s), b = endAt(bones[P.T.b.bone], P.lb, s);
    const d = sub3(b, a), L = Math.hypot(...d) || 1e-6, ratio = L / (P.L0 * s);
    P.ratio = ratio;
    // 筋肉は体積を保つ: 太さ √(元 / いま)。腱・脂肪はそのまま
    const k = s * (P.T.kind === 'muscle' ? Math.min(1.5, Math.max(0.65, Math.sqrt(1 / ratio))) : 1);
    _tz.set(d[0] / L, d[1] / L, d[2] / L);
    _ty.set(...A.y); _ty.addScaledVector(_tz, -_ty.dot(_tz));
    if (_ty.lengthSq() < 1e-6) _ty.set(0, 1, 0).addScaledVector(_tz, -_tz.y);
    _ty.normalize(); _tx.crossVectors(_ty, _tz);
    _tm.makeBasis(_tx.multiplyScalar(k), _ty.multiplyScalar(k), _tz.multiplyScalar(L)).setPosition(a[0], a[1], a[2]);
    P.mesh.matrix.copy(_tm); P.mesh.matrixWorldNeedsUpdate = true;
  }
}
