// ⑥ リアルな手（v002〜）: 骨格（FINGERS）に合わせて、丸い円すいと手のひらの板をなめらかにつないだ陰関数（SDF）を作り、
// 起動時に一度だけサーフェスネッツで網にする。頂点ごとに骨の重み（近さから）を持たせ、毎フレーム CPU でスキニングする。
// 爪は末節骨に固定した薄い面。肌の細かい凹凸（毛穴・関節のしわ）と色むらはシェーダーで足す。
'use strict';
const SKIN_RES = 1.5; // 網の細かさ（mm）
const FLAT = 1.12;    // 指の断面の縦横比（横が広い）
// 網を作るときの姿勢（度）: [付け根の横, 付け根の曲げ, 2つめの曲げ]。指を少し開いて、となりの指とくっつかないように
const REST_DEG = [null, [-30, 8, 20], [-10, 12, 14], [-2, 12, 14], [7, 12, 14], [16, 12, 14]];
// 指の太さ（半径 mm）: 付け根・関節2つ・指先。指先は鍵に当たる球（PAD）とほぼ同じ
// 親指の中手骨は細め（太いと、親指を開いたときに手の甲から飛び出してこぶになった）
const RADII = [null, [8.5, 9.5, 9.2, 8.0], [9.6, 8.9, 7.7, 6.6], [10.0, 9.3, 8.0, 6.8], [9.4, 8.7, 7.5, 6.5], [8.4, 7.6, 6.8, 6.0]];
// 骨の番号: 0 前腕、1 手のひら、2 + (指-1)*3 + 節
const BONE_ARM = 0, BONE_PALM = 1, boneOf = (f, j) => 2 + (f - 1) * 3 + j, N_BONES = 17;

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// 指の3つの骨の座標軸（手の座標）。x: 横、y: 指の甲の側、z: 指先の向き
function boneFrames(F, yaw, a1, a2) {
  const pts = fingerFK(F, yaw, a1, a2);
  const { d, nb, x } = fingerBasis(F, yaw);
  const angs = [F.b + a1, F.b + a1 + a2, F.b + a1 + a2 + F.c * a2];
  return angs.map((a, j) => {
    const c = Math.cos(a), s = Math.sin(a);
    const z = [d[0] * c + nb[0] * s, d[1] * c + nb[1] * s, d[2] * c + nb[2] * s];
    return { o: pts[j], x, y: cross3(x, z), z, len: F.L[j] };
  });
}

// 丸い円すい（両端が球）。Inigo Quilez の sdRoundCone
function mkCone(a, b, ra, rb, bone, group) {
  const ba = sub3(b, a), l2 = dot3(ba, ba), rr = ra - rb, r = Math.max(ra, rb) + 14;
  return { a, ba, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, ra, rb, bone, group,
    lo: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
    hi: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r] };
}
function coneD(P, x, y, z, cull) {
  if (cull && (x < P.lo[0] || y < P.lo[1] || z < P.lo[2] || x > P.hi[0] || y > P.hi[1] || z > P.hi[2])) return 1e9;
  const px = x - P.a[0], py = y - P.a[1], pz = z - P.a[2];
  const yy = px * P.ba[0] + py * P.ba[1] + pz * P.ba[2], zz = yy - P.l2;
  const qx = px * P.l2 - P.ba[0] * yy, qy = py * P.l2 - P.ba[1] * yy, qz = pz * P.l2 - P.ba[2] * yy;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * P.l2, z2 = zz * zz * P.l2;
  const k = Math.sign(P.rr) * P.rr * P.rr * x2;
  if (Math.sign(zz) * P.a2 * z2 > k) return Math.sqrt(x2 + z2) * P.il2 - P.rb;
  if (Math.sign(yy) * P.a2 * y2 < k) return Math.sqrt(x2 + y2) * P.il2 - P.ra;
  return (Math.sqrt(x2 * P.a2 * P.il2) + yy * P.rr) * P.il2 - P.ra;
}
// 手のひらの板（手首の側ほど細い、角の丸い箱）
// 手首の皮ふのつなぎ目は、手首の回転の中心（z=0）より 8mm 指の側（本物の手と同じく、親指の根もとが手首のすぐ先に見えるように。
// 前は手首のつなぎ目が回転の中心より肘の側にあり、手の甲が長く、親指が手の甲の途中から生えているように見えた）
const PALM = { c: [4, -1, -54], h: [25, 1, 29.5], r: 13 }; // 角を大きく丸めて、人さし指・小指の付け根が角ばらないように
// 手のひら: 角の丸い箱とだ円体のあいだの形（PALM_ROUND の割合だけだ円体に寄せる）。箱だけだと四角く、
// 人さし指・小指の付け根が角ばって見えた。手首の側ほど細い
const PALM_ROUND = 0.4, PALM_E = [42, 12, 46];
// 手首・前腕: 横に広く縦にうすいだ円（大人の手首はおよそ幅 55〜60mm・厚み 35〜40mm）。前は丸に近く、真上から見ると手首だけ細くくびれていた
const ARM_FLAT = 1.45;
function palmD(x, y, z) {
  const s = 0.74 + 0.26 * Math.min(1, Math.max(0, (-z - 20) / 67)); // 指の付け根から手首へ台形にすぼめる
  // 手首に近いほどうすく（同じ厚みのまま細い前腕につなぐと、手の甲と前腕の境目がこぶのように盛り上がった）
  const thin = 1 + 0.6 * Math.min(1, Math.max(0, (z + 38) / 30));
  // 先の端は指の付け根の弧に合わせる（小指の付け根は中指より 16mm 手前。まっすぐだと手のひらが小指の付け根にかぶさって見えた）
  const arc = (Math.max(0, x - 12) * 0.6 + Math.max(0, -18 - x) * 0.4) * Math.min(1, Math.max(0, (-z - 40) / 40));
  const px = (x - PALM.c[0]) / s, py = (y - PALM.c[1]) * thin, pz = z + arc - PALM.c[2];
  const qx = Math.abs(px) - PALM.h[0], qy = Math.abs(py) - PALM.h[1], qz = Math.abs(pz) - PALM.h[2];
  const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - PALM.r;
  const [rx, ry, rz] = PALM_E; // だ円体のおよその距離（Inigo Quilez）
  const k0 = Math.hypot(px / rx, py / ry, pz / rz), k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  const ell = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
  return box + (ell - box) * PALM_ROUND;
}

// 網を作る姿勢での、陰関数の部品
function buildPrims() {
  const P = { palm: [], arm: null, fing: [null, [], [], [], [], []] };
  const rest = [null];
  for (let f = 1; f <= 5; f++) {
    const F = FINGERS_U[f], d = REST_DEG[f];
    rest.push(boneFrames(F, d[0] * D2R, d[1] * D2R, d[2] * D2R));
  }
  // 手のひら: 手首の横棒・中手骨（甲の盛り上がり）・指の付け根の横棒・小指球・母指球
  P.palm.push(mkCone([-15, -3, -11], [19, -3, -11], 10, 10, BONE_PALM)); // 手首の横棒（細めにして、手首と手のひらの境目がでっぱらないように）
  const wx = [0, 0, -12, 0, 11, 21];
  for (let f = 2; f <= 5; f++) {
    const b = FINGERS_U[f].base, s = [wx[f], 1, -14], d = sub3(b, s), n = Math.hypot(...d);
    const end = [b[0] - d[0] * 4 / n, b[1] - 1, b[2] - d[2] * 4 / n]; // 付け根の関節の 4mm 手前まで
    P.palm.push(mkCone(s, end, 9, RADII[f][0] + 0.5, BONE_PALM));
  }
  P.palm.push(mkCone(sub3(FINGERS_U[2].base, [0, 2, -3]), sub3(FINGERS_U[5].base, [0, 2, -3]), 10.5, 9, BONE_PALM));
  P.palm.push(mkCone([21, -8, -28], [28, -6, -66], 12, 10, BONE_PALM));
  { const c = mkCone([-6, -14, -26], [-18, -14, -50], 10, 8, BONE_PALM); c.k = 12; P.palm.push(c); } // 母指球（手のひらの側のふくらみ。手のひらの内側寄り。つなぎ目の幅 k が大きいと肉が足されて玉のようにふくらんだ）
  // 親指の中手骨は手のひらと同じ組で溶けあわせる（骨は親指）
  const t0 = rest[1][0];
  // 親指の中手骨は根もとから太さを保ち、手首の親指側から途切れずにつなぐ（少し先から細く始めると、手首から MP 関節までが手の甲の側でへこんで見えた）
  { const c = mkCone([-16, -3, -14], t0.o, 9, RADII[1][0], BONE_PALM); c.k = 12; P.palm.push(c); } // 手首の親指側 → 親指の根もと（CMC）
  { const c = mkCone(t0.o, rest[1][1].o, RADII[1][0], RADII[1][1], boneOf(1, 0)); c.k = 12; P.palm.push(c); } // 親指の中手骨
  { const c = mkCone([-17, 3, -60], lerp3(t0.o, rest[1][1].o, 0.9), 10, 7.5, BONE_PALM); c.k = 14; P.palm.push(c); } // 親指と人さし指のあいだの水かき（甲の側の筋肉）。甲の側に寄せて厚く（うすいと、親指と手の甲のあいだが谷になった）
  P.arm = mkCone([2, -5, -42], [3, -16, 240], 26, 36, BONE_ARM); // 形: 手のひらの中から細く始めて、手首で自然に太くなる（手首で丸く始めると、境目に段ができた）。一人称で切れ目が見えないよう、肘の近くまで
  P.armW = mkCone([2, -6, -4], [3, -16, 240], 27, 36, BONE_ARM); // 重み用: 手首から先だけ（手のひらの皮ふが前腕といっしょに動かないように）
  for (let f = 1; f <= 5; f++) {
    const R = rest[f];
    for (let j = f === 1 ? 1 : 0; j < 3; j++) {
      const a = R[j].o, b = j < 2 ? R[j + 1].o : fingerFK(FINGERS_U[f], REST_DEG[f][0] * D2R, REST_DEG[f][1] * D2R, REST_DEG[f][2] * D2R)[3];
      const c = mkCone(a, b, RADII[f][j], RADII[f][j + 1], boneOf(f, j));
      c.fr = R[j]; // 指は縦に少しうすい: 骨の y（甲の向き）を FLAT 倍に伸ばした点で測る
      P.fing[f].push(c);
      if (j >= 1) { // 関節の少しのふくらみ
        const k = mkCone(a, a, RADII[f][j] * 1.07, RADII[f][j] * 1.07, boneOf(f, j)); k.fr = R[j]; k.knuckle = true;
        P.fing[f].push(k);
      }
    }
  }
  P.rest = rest;
  return P;
}

// 全体の距離。comp を渡すと骨ごとの距離も入れる（重みづけ用）
function handSDF(P, x, y, z, comp) {
  const cull = !comp;
  let pal = palmD(x, y, z);
  if (comp) { comp.fill(1e9); comp[BONE_PALM] = pal; }
  for (const c of P.palm) {
    const d = coneD(c, x, y, z, cull);
    pal = smin(pal, d, c.k || 14);
    if (comp) comp[c.bone] = Math.min(comp[c.bone], d);
  }
  const arm = coneD(P.arm, x, (y - P.arm.a[1]) * ARM_FLAT + P.arm.a[1], z, cull); // 前腕は縦にうすい（だ円）
  if (comp) comp[BONE_ARM] = coneD(P.armW, x, (y - P.armW.a[1]) * ARM_FLAT + P.armW.a[1], z, false);
  let d = smin(pal, arm, 9); // つなぎ目の幅。大きいと手首に肉が足されて、手の甲と前腕の境目がこぶのように盛り上がった
  for (let f = 1; f <= 5; f++) {
    let fd = 1e9;
    for (const c of P.fing[f]) {
      if (cull && (x < c.lo[0] || y < c.lo[1] || z < c.lo[2] || x > c.hi[0] || y > c.hi[1] || z > c.hi[2])) continue;
      const F = c.fr, qx = x - F.o[0], qy = y - F.o[1], qz = z - F.o[2];
      const t = (qx * F.y[0] + qy * F.y[1] + qz * F.y[2]) * (FLAT - 1);
      const e = c.knuckle && c.l2 === 0 ? Math.hypot(x + F.y[0] * t - c.a[0], y + F.y[1] * t - c.a[1], z + F.y[2] * t - c.a[2]) - c.ra
        : coneD(c, x + F.y[0] * t, y + F.y[1] * t, z + F.y[2] * t, cull);
      fd = smin(fd, e, 2.5);
      if (comp) comp[c.bone] = Math.min(comp[c.bone], e);
    }
    d = smin(d, fd, f === 1 ? 9 : 7);
  }
  return d;
}

// サーフェスネッツ。dims の格子で陰関数の値を取り、符号が変わるセルに頂点を1つ置いて、四角形でつなぐ
function surfaceNets(P) {
  const lo = [-125, -62, -212], hi = [80, 40, 280], h = SKIN_RES;
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // ブロックごとに中心で測り、表面から遠ければまとめて埋める（陰関数の傾きは 1 前後なので安全側に 1.6 倍）
  const B = 6, reach = (B * h * 0.87 + 2) * 1.6;
  for (let bk = 0; bk < nz; bk += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const cx = lo[0] + (bi + B / 2) * h, cy = lo[1] + (bj + B / 2) * h, cz = lo[2] + (bk + B / 2) * h;
    const dc = handSDF(P, cx, cy, cz);
    const far = Math.abs(dc) > reach;
    for (let k = bk; k < Math.min(nz, bk + B + 1); k++) for (let j = bj; j < Math.min(ny, bj + B + 1); j++) for (let i = bi; i < Math.min(nx, bi + B + 1); i++) {
      val[id(i, j, k)] = far ? dc : handSDF(P, lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
    }
  }
  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const g = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { g[c] = val[id(i + CO[c][0], j + CO[c][1], k + CO[c][2])]; if (g[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of ED) {
      if ((g[a] < 0) === (g[b] < 0)) continue;
      const t = g[a] / (g[a] - g[b]);
      sx += CO[a][0] + (CO[b][0] - CO[a][0]) * t; sy += CO[a][1] + (CO[b][1] - CO[a][1]) * t; sz += CO[a][2] + (CO[b][2] - CO[a][2]) * t; n++;
    }
    cellV[id(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  const tri = [];
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; tri.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[id(i, j, k)] < 0;
    if (v0 !== (val[id(i + 1, j, k)] < 0)) quad(cellV[id(i, j - 1, k - 1)], cellV[id(i, j, k - 1)], cellV[id(i, j, k)], cellV[id(i, j - 1, k)]);
    if (v0 !== (val[id(i, j + 1, k)] < 0)) quad(cellV[id(i - 1, j, k - 1)], cellV[id(i, j, k - 1)], cellV[id(i, j, k)], cellV[id(i - 1, j, k)]);
    if (v0 !== (val[id(i, j, k + 1)] < 0)) quad(cellV[id(i - 1, j - 1, k)], cellV[id(i, j - 1, k)], cellV[id(i, j, k)], cellV[id(i - 1, j, k)]);
  }
  return { pos: new Float32Array(pos), idx: tri };
}

// 手の甲の腱（[x0, z0, x1, z1]: 手首の側 → 指の付け根）と静脈（折れ線）。手の座標（mm）、目安
const TENDONS = [[-10, -14, -24, -88], [-3, -14, -4, -92], [6, -14, 14, -86], [14, -14, 29, -76]];
const VEINS = [[[-20, -6], [-16, -24], [-6, -40], [4, -52], [8, -70]], [[18, -6], [16, -26], [6, -42], [4, -52]], [[-6, -38], [-14, -58], [-16, -72]]];
// 手のひらのしわ（手の座標の x, z の折れ線。目安）: 感情線・知能線・生命線
const PALM_LINES = [
  [[37, -66], [24, -73], [10, -77], [-4, -80], [-12, -84]],
  [[-33, -60], [-18, -60], [0, -57], [16, -52], [27, -46]],
  [[-33, -60], [-26, -48], [-21, -34], [-17, -22], [-12, -14]],
];
const smoothF = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function segDist2(x, z, T) {
  const dx = T[2] - T[0], dz = T[3] - T[1], l = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - T[0]) * dx + (z - T[1]) * dz) / l));
  return Math.hypot(x - T[0] - dx * t, z - T[1] - dz * t);
}

function sdfGrad(P, x, y, z) {
  const e = 0.25;
  const g = [handSDF(P, x + e, y, z) - handSDF(P, x - e, y, z), handSDF(P, x, y + e, z) - handSDF(P, x, y - e, z), handSDF(P, x, y, z + e) - handSDF(P, x, y, z - e)];
  const n = Math.hypot(...g) || 1;
  return [g[0] / n, g[1] / n, g[2] / n];
}

const srgbLin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const lin3 = (r, g, b) => [srgbLin(r), srgbLin(g), srgbLin(b)];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// 手の網・骨の重み・色・しわの目印を作る（起動時に一度）
function buildSkin() {
  const t0 = performance.now();
  const P = buildPrims();
  const net = surfaceNets(P);
  const NV = net.pos.length / 3;
  const pos = net.pos, nrm = new Float32Array(NV * 3);
  // 表面へ寄せて、法線は陰関数の傾きから
  for (let v = 0; v < NV; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let it = 0; it < 2; it++) { const d = handSDF(P, x, y, z), g = sdfGrad(P, x, y, z); x -= d * g[0]; y -= d * g[1]; z -= d * g[2]; }
    const g = sdfGrad(P, x, y, z);
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nrm[v * 3] = g[0]; nrm[v * 3 + 1] = g[1]; nrm[v * 3 + 2] = g[2];
  }
  // 三角形の向きを法線にそろえる
  const idx = net.idx;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const fn = cross3(sub3([pos[b], pos[b + 1], pos[b + 2]], [pos[a], pos[a + 1], pos[a + 2]]), sub3([pos[c], pos[c + 1], pos[c + 2]], [pos[a], pos[a + 1], pos[a + 2]]));
    if (fn[0] * (nrm[a] + nrm[b] + nrm[c]) + fn[1] * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + fn[2] * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  // 骨の座標軸（網を作った姿勢）
  // 手の甲の腱と静脈: 表面を法線の向きに少し盛り上げる（網を作った姿勢で一度だけ）
  const vein = new Float32Array(NV);
  for (let v = 0; v < NV; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], ny = nrm[v * 3 + 1];
    if (ny < 0.35 || z > 30 || z < -100) continue;
    const dors = Math.min(1, (ny - 0.35) * 2.5);
    let hgt = 0, vn = 0;
    for (const T of TENDONS) { const d = segDist2(x, z, T); const fade = smoothF((T[1] - z) / 10) * smoothF((z - T[3]) / 14); hgt += 0.75 * Math.exp(-((d / 2.4) ** 2)) * fade; }
    for (const L of VEINS) for (let i = 0; i < L.length - 1; i++) { const d = segDist2(x, z, [L[i][0], L[i][1], L[i + 1][0], L[i + 1][1]]); const e = Math.exp(-((d / 2.3) ** 2)); hgt += 0.22 * e; vn = Math.max(vn, e); } // 静脈は太さ 3〜4mm で低く盛り上がる（細く高いと光って白い線に見えた）
    const vk = HAND.veins === undefined ? 1 : HAND.veins; // 手のモデルごとの静脈・腱の目立ち方
    hgt *= dors * vk; vein[v] = vn * dors * vk;
    pos[v * 3] += nrm[v * 3] * hgt; pos[v * 3 + 1] += ny * hgt; pos[v * 3 + 2] += nrm[v * 3 + 2] * hgt;
  }
  // 盛り上げた分の法線をつけ直す（三角形から）
  {
    const acc = new Float32Array(NV * 3);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const fn = cross3(sub3([pos[b], pos[b + 1], pos[b + 2]], [pos[a], pos[a + 1], pos[a + 2]]), sub3([pos[c], pos[c + 1], pos[c + 2]], [pos[a], pos[a + 1], pos[a + 2]]));
      for (const o of [a, b, c]) { acc[o] += fn[0]; acc[o + 1] += fn[1]; acc[o + 2] += fn[2]; }
    }
    for (let v = 0; v < NV; v++) {
      if (vein[v] === 0 && nrm[v * 3 + 1] < 0.35) continue;
      const l = Math.hypot(acc[v * 3], acc[v * 3 + 1], acc[v * 3 + 2]) || 1;
      nrm[v * 3] = acc[v * 3] / l; nrm[v * 3 + 1] = acc[v * 3 + 1] / l; nrm[v * 3 + 2] = acc[v * 3 + 2] / l;
    }
  }
  const restB = restBoneFrames(P.rest);
  // 重み: 骨ごとの距離の近さから。上位4つ
  const bi = new Uint8Array(NV * 4), bw = new Float32Array(NV * 4);
  const col = new Float32Array(NV * 3), aWrk = new Float32Array(NV), aAlong = new Float32Array(NV);
  // 関節の内側のふくらみ（曲げるほど手のひらの側を押し出して、線形ブレンドのへこみを補う）: どの関節か・どれだけ近いか
  const aJ = new Float32Array(NV * 2);
  // 指先のはら（指紋の中心からの座標と、はらの目印）・手のひらと関節の手のひらの側のしわ
  const aPad = new Float32Array(NV * 3), aCrease = new Float32Array(NV);
  const comp = new Float64Array(N_BONES);
  const VEINC = lin3(0.66, 0.58, 0.58); // 皮ふごしの静脈（肌の赤みが少し抜けて、くすんだ青緑がかる。青紫にすると線を描いたように見えた）
  const PADC = lin3(0.90, 0.58, 0.52);
  const SKIN = lin3(0.86, 0.62, 0.50), DORSAL = lin3(0.83, 0.59, 0.46), PALMC = lin3(0.89, 0.59, 0.51), TIP = lin3(0.87, 0.50, 0.44), KNK = lin3(0.77, 0.50, 0.42);
  for (let v = 0; v < NV; v++) {
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], n = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    handSDF(P, p[0], p[1], p[2], comp);
    let dmin = Infinity;
    for (let b = 0; b < N_BONES; b++) dmin = Math.min(dmin, comp[b]);
    const sc = [];
    for (let b = 0; b < N_BONES; b++) { const s = Math.exp(-(comp[b] - dmin) / (b <= BONE_PALM || b === boneOf(1, 0) ? 5 : 2.6)); if (s > 0.01) sc.push([s, b]); }
    sc.sort((a, b) => b[0] - a[0]);
    // 親指の中手骨は手のひらの中に深く埋まっていて、付け根に近い皮ふはほとんど手のひらと一緒に動く。
    // 付け根からの位置 u（0 = 付け根、1 = MP 関節）で、親指の骨の重みを手のひらへなめらかに移す
    // （そのままだと、親指を動かすたびに手首の親指側の皮ふが引っぱられて、こぶのように出っぱった）
    {
      const tb = boneOf(1, 0), ti = sc.findIndex(e => e[1] === tb);
      if (ti >= 0) {
        const B = restB[tb], u = dot3(sub3(p, B.o), B.z) / B.len, f = smoothF((u + 0.05) / 1.0);
        const move = sc[ti][0] * (1 - f);
        sc[ti][0] *= f;
        const pi = sc.findIndex(e => e[1] === BONE_PALM);
        if (pi >= 0) sc[pi][0] += move; else sc.push([move, BONE_PALM]);
        sc.sort((a, b) => b[0] - a[0]);
      }
    }
    const top = sc.slice(0, 4), sum = top.reduce((s, e) => s + e[0], 0);
    for (let k = 0; k < 4; k++) {
      const e = top[k] || [0, top[0][1]], B = restB[e[1]];
      bi[v * 4 + k] = e[1]; bw[v * 4 + k] = e[0] / sum;
    }
    // 近い指の関節（骨の付け根）。手のひらの側ほど強く
    let jb = 0, jw = 0;
    for (let b = 2; b < N_BONES; b++) {
      const B = restB[b], q = sub3(p, B.o), d = Math.hypot(...q);
      const w = Math.exp(-((d / 9) ** 2)) * Math.max(0, -dot3(n, B.y));
      if (w > jw) { jw = w; jb = b; }
    }
    aJ[v * 2] = jb; aJ[v * 2 + 1] = jw;
    // 手のひらのしわ（感情線・知能線・生命線。手の座標、手のひらの側だけ）
    if (n[1] < -0.3) for (const L of PALM_LINES) for (let i = 0; i < L.length - 1; i++) {
      const d = segDist2(p[0], p[2], [L[i][0], L[i][1], L[i + 1][0], L[i + 1][1]]);
      aCrease[v] = Math.max(aCrease[v], Math.exp(-((d / 0.9) ** 2)) * Math.min(1, (-n[1] - 0.3) * 3));
    }
    // 色: 甲は少し日焼け、手のひらの側は赤み、指先と関節の甲は赤み
    const main = top[0][1];
    let c = mix3(SKIN, n[1] > 0 ? DORSAL : PALMC, Math.min(1, Math.abs(n[1]) * 1.2));
    c = mix3(c, VEINC, vein[v] * 0.14); // 皮ふごしの静脈の青み（ひかえめに。強いと青白い線を描いたように見えた）
    let wrk = 0, along = 0;
    if (main >= 2) {
      const f = Math.floor((main - 2) / 3) + 1, j = (main - 2) % 3, B = restB[main];
      const q = sub3(p, B.o), u = dot3(q, B.z), up = dot3(n, B.y);
      along = u;
      if (j === 2) c = mix3(c, TIP, Math.min(1, Math.max(0, u / B.len)) * 0.55);
      // 指先のはら: 末節の手のひらの側。指紋の渦の中心（はらのふくらみ）からの座標
      if (j === 2 && up < -0.2) {
        const cu = u - B.len * 0.62, cx = dot3(q, B.x);
        aPad[v * 3] = cx; aPad[v * 3 + 1] = cu; aPad[v * 3 + 2] = Math.min(1, (-up - 0.2) * 2.5) * Math.exp(-((cu / 11) ** 2));
        c = mix3(c, PADC, aPad[v * 3 + 2] * 0.4);
      }
      // 関節の手のひらの側のしわ（2本の細い線）
      if (up < -0.3 && (j >= 1 || true)) {
        const cr = Math.max(Math.exp(-(((u - 1.2) / 0.7) ** 2)), Math.exp(-(((u + 1.0) / 0.7) ** 2))) * Math.min(1, (-up - 0.3) * 3);
        aCrease[v] = Math.max(aCrease[v], cr);
      }
      // 関節（この骨の付け根）の甲のしわ
      if (j >= 1 || f > 1) {
        const near = Math.exp(-(((u - 1) / 5.5) ** 2)) * Math.min(1, Math.max(0, up * 1.6));
        wrk = near * (HAND.wrinkles === undefined ? 1 : HAND.wrinkles); c = mix3(c, KNK, wrk * 0.35);
      }
    }
    col.set(c, v * 3); aWrk[v] = wrk; aAlong[v] = along;
  }
  const nails = buildNails(P);
  // 手のモデルの大きさ（HAND.s）で縮める: 網の位置・骨の付け根・爪（骨の座標の中の位置）
  const sc = HAND.s;
  if (sc !== 1) {
    for (let i = 0; i < pos.length; i++) pos[i] *= sc;
    for (const B of restB.slice(2)) B.o = B.o.map(v => v * sc);
    for (const N of nails) for (let i = 0; i < N.pos.length; i++) N.pos[i] *= sc;
  }
  const ms = performance.now() - t0;
  return { NV, pos0: pos, nrm0: nrm, idx, bi, bw, col, aWrk, aAlong, aJ, aPad, aCrease, nails, ms, P, restB };
}

function restBoneFrames(rest) {
  const I = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const out = [I, I];
  for (let f = 1; f <= 5; f++) for (let j = 0; j < 3; j++) out.push(rest[f][j]);
  return out;
}

// 爪: 末節骨の甲の側に、表面へ沿わせた曲面。骨に固定して動かす
function buildNails(P) {
  const nails = [];
  const NU = 10, NT = 9;
  for (let f = 1; f <= 5; f++) {
    const B = P.rest[f][2];
    const r = RADII[f][3], L = B.len;
    const th0 = 0; // 親指の向きは骨の座標軸（ねじれ）に入っている
    const pos = [], col = [], uvs = [];
    for (let iu = 0; iu <= NU; iu++) {
      const u = iu / NU; // 0 = 根元（甘皮）、1 = 先（指先より少し出る）
      const s = L * (0.38 + 0.74 * u);
      const wide = 50 * D2R * Math.min(1, 0.45 + 2.6 * u) * (u > 0.9 ? 1 - (u - 0.9) * 2.5 : 1);
      for (let it = 0; it <= NT; it++) {
        const th = th0 + (it / NT * 2 - 1) * wide;
        const dir = [B.y[0] * Math.cos(th) + B.x[0] * Math.sin(th), B.y[1] * Math.cos(th) + B.x[1] * Math.sin(th), B.y[2] * Math.cos(th) + B.x[2] * Math.sin(th)];
        let p = [B.o[0] + B.z[0] * s + dir[0] * (r + 3), B.o[1] + B.z[1] * s + dir[1] * (r + 3), B.o[2] + B.z[2] * s + dir[2] * (r + 3)];
        // 表面へ寄せる（外から内へ）
        for (let k = 0; k < 6; k++) { const d = handSDF(P, ...p), g = sdfGrad(P, ...p); p = [p[0] - g[0] * d, p[1] - g[1] * d, p[2] - g[2] * d]; }
        const g = sdfGrad(P, ...p), lift = 0.35 + 0.25 * Math.sin(Math.PI * it / NT);
        p = [p[0] + g[0] * lift, p[1] + g[1] * lift, p[2] + g[2] * lift];
        if (u > 0.86) { const o = (u - 0.86) * 9; p = [p[0] + B.z[0] * o * 0.6 - g[0] * o * 0.15, p[1] + B.z[1] * o * 0.6 - g[1] * o * 0.15, p[2] + B.z[2] * o * 0.6 - g[2] * o * 0.15]; }
        const q = sub3(p, B.o);
        pos.push(dot3(q, B.x), dot3(q, B.y), dot3(q, B.z));
        // 色: 根元は白っぽい爪半月、なかほどは爪床の桃色、先は白
        const side = Math.abs(it / NT * 2 - 1);
        let c = lin3(0.93, 0.70, 0.66);
        if (u < 0.2 && side < 0.6) c = mix3(c, lin3(0.95, 0.86, 0.82), (1 - u / 0.2) * (1 - side / 0.6));
        if (u > 0.84) c = mix3(c, lin3(0.97, 0.94, 0.88), Math.min(1, (u - 0.84) / 0.06));
        c = mix3(c, lin3(0.85, 0.66, 0.58), side ** 4 * 0.6);
        col.push(...c); uvs.push(u, it / NT);
      }
    }
    const idx = [];
    for (let iu = 0; iu < NU; iu++) for (let it = 0; it < NT; it++) {
      const a = iu * (NT + 1) + it, b = a + 1, c = a + NT + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    nails.push({ f, pos: new Float32Array(pos), col: new Float32Array(col), idx });
  }
  return nails;
}

// 姿勢から、骨ごとの世界の座標軸
function poseBones(pose) {
  const W = pose.W, psi = W[3] || 0, sd = W[4] || 1;
  const R = v => { const r = W[6] ? rollZ(W[6], v) : v; return rotY(psi, [r[0] * sd, r[1], r[2]]); }; // 傾けて、左手は鏡に映してから回す
  // 前腕は腕の向きに回し、手のひらと同じだけひねる（ひねりは前腕でおきる。手首だけひねると、手首の皮ふがねじれてこぶになった）
  const A = v => { const r = W[6] ? rollZ(W[6], v) : v; return rotY(W[5] || 0, [r[0] * sd, r[1], r[2]]); };
  const out = [{ o: [W[0], W[1], W[2]], x: A([1, 0, 0]), y: A([0, 1, 0]), z: A([0, 0, 1]) }, { o: [W[0], W[1], W[2]], x: R([1, 0, 0]), y: R([0, 1, 0]), z: R([0, 0, 1]) }];
  for (let f = 1; f <= 5; f++) {
    const a = pose.fingers[f].ang;
    for (const B of boneFrames(FINGERS[f], a.yaw, a.a1, a.a2)) out.push({ o: toWorld(W, B.o), x: R(B.x), y: R(B.y), z: R(B.z) });
  }
  return out;
}

// 骨ごとのスキニング行列（GPU へ渡す）: 世界の骨の座標軸 × 網を作った姿勢の骨の座標軸の逆
function frameMat(B, out) {
  out.makeBasis(new THREE.Vector3(...B.x), new THREE.Vector3(...B.y), new THREE.Vector3(...B.z)).setPosition(...B.o);
  return out;
}
function skinMatrices(S, bones, outArr) {
  if (!S.restInv) S.restInv = S.restB.map(B => frameMat(B, new THREE.Matrix4()).invert());
  const m = new THREE.Matrix4();
  for (let b = 0; b < N_BONES; b++) { frameMat(bones[b], m).multiply(S.restInv[b]); m.toArray(outArr, b * 16); }
}
// 関節ごとの曲げの角度（ふくらみの補正用）
function jointFlex(pose, out) {
  out.fill(0);
  for (let f = 1; f <= 5; f++) {
    const a = pose.fingers[f].ang, F = FINGERS[f], d = REST_DEG[f];
    out[boneOf(f, 0)] = Math.max(0, a.a1 - d[1] * D2R);
    out[boneOf(f, 1)] = Math.max(0, a.a2 - d[2] * D2R);
    out[boneOf(f, 2)] = Math.max(0, F.c * (a.a2 - d[2] * D2R));
  }
}
