// ⑥ リアルな手（v002〜）: 骨格（FINGERS）に合わせて、丸い円すいと手のひらの板をなめらかにつないだ陰関数（SDF）を作り、
// 起動時に一度だけサーフェスネッツで網にする。頂点ごとに骨の重み（近さから）を持たせ、毎フレーム CPU でスキニングする。
// 爪は末節骨に固定した薄い面。肌の細かい凹凸（毛穴・関節のしわ）と色むらはシェーダーで足す。
'use strict';
const SKIN_RES = 1.5; // 網の細かさ（mm）
const FLAT = 1.12;    // 指の断面の縦横比（横が広い）
// 網を作るときの姿勢（度）: [付け根の横, 付け根の曲げ, 2つめの曲げ]。指を少し開いて、となりの指とくっつかないように
const REST_DEG = [null, [-30, 8, 20], [-10, 12, 14], [-2, 12, 14], [7, 12, 14], [16, 12, 14]];
// 指の太さ（半径 mm）: 付け根・関節2つ・指先。指先は鍵に当たる球（PAD）とほぼ同じ
// 親指は、生きた手で測った周囲（男性 IP 関節 6.8cm・爪の幅 1.8cm。"Investigating Normative Measurements of the Thumb and Index Finger to Aid in Reconstructive Surgery"、PMC12309929。成人 162 人）から、IP 関節の半径 10.8mm、指先 8.8mm
const RADII = [null, [10.0, 11.0, 10.8, 8.8], [9.6, 8.9, 7.7, 6.6], [10.0, 9.3, 8.0, 6.8], [9.4, 8.7, 7.5, 6.5], [8.4, 7.6, 6.8, 6.0]];
// 骨の番号: 0 前腕、1 手のひら、2 + (指-1)*3 + 節
const BONE_ARM = 0, BONE_PALM = 1, boneOf = (f, j) => 2 + (f - 1) * 3 + j, N_BONES = 17;

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
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
// 前腕の太さ（横の半径、手のひらの中の始まり z=-42 と肘の側 z=240）。v025〜: 周囲の測定値に合わせる。
// 米陸軍の身体計測 ANSUR II（2012、男性 4,082 人）: 手首の周囲（茎状突起の所）17.59cm、前腕の周囲（肘のしわ、こぶしを握って力を入れて）31.01cm。
// このモデルの手（大人・大きめ）は手の幅・手の周囲が男性平均の約 95% なので、手首 16.8cm、肘の側は力を抜いた分を見込んで 27.5cm（目安）。
// 前は 26・36 で、手首 15.0cm・肘の近く 19.1cm と細すぎた（手首の幅と厚みは近かったが、太さが足りなかった）
const ARM_R = [26.8, 52.2];
// 骨の表面から皮ふまでの肉の厚さ（v024〜。皮ふを骨から作る）
// 手の甲: 皮ふ・皮下・伸筋腱。手の甲の肉の厚さ 3.20mm（超音波、20 人。IMCAS 2023 の要旨）に、伸筋腱の上の分を少し足した目安
const TD_HAND = 3.5;
// 指の甲の側: 皮ふ・うすい皮下・伸筋腱の膜。目安（指の手のひら側は、太さ（周囲・幅は測定値）の残りがすべて手のひら側＝屈筋腱・腱鞘・脂肪になる）
const TD_FINGER = 2.5;
// 手の甲の屋根: 中手骨 II〜V の甲の面＋TD_HAND の尾根を、横へは放物線（曲率の半径 MC_ROOF_RC）で下げ、なめらかな最大でつなぐ。
// 本物の手の甲は中手骨の横のアーチ（中指が高く、小指が低い）に沿って丸い。前は平らな板で、小指の側で骨の上に 15mm の肉があった
const MC_ROOF_RC = 13, MC_ROOF_K = 5;
function mcRoof(P, x, z) {
  let m = -1e9;
  for (const M of P.mc) {
    // 手首の側（u < 0）は根もとの高さのまま前腕へ続ける（横の距離は線からの距離だけ）。指の側（u > 1）は先の点からの距離で下げる
    const dx = x - M.s[0], dz = z - M.s[2], u0 = (dx * M.d[0] + dz * M.d[2]) / M.l2, u = Math.max(0, Math.min(1.08, u0));
    const ua = u0 < 0 ? u0 : u; // 横の距離を測る点（手首の側は線の上）
    const ax = M.s[0] + M.d[0] * ua, ay = M.s[1] + M.d[1] * u, az = M.s[2] + M.d[2] * ua;
    // 甲の面は根もとと頭の太さをまっすぐつなぐ（伸筋腱が骨幹の細い所をまたいで張っているので、皮ふは骨幹でへこまない）
    const ry = M.r[0] + (M.r[2] - M.r[0]) * Math.min(1, u);
    const lx = x - ax, lz = z - az;
    const h = ay + ry + P.tdH - (lx * lx + lz * lz) / (2 * MC_ROOF_RC);
    m = m < -1e8 ? h : -smin(-m, -h, MC_ROOF_K);
  }
  return m;
}
// 手首から肘の側では屋根をゆっくり外して、前腕の形にまかせる（急に外すと手首に段が、外しはじめが遅いと手首の甲に 3mm のくぼみができた）
const roofFade = z => smoothF((z + 12) / 36);
const smax = (a, b, k) => -smin(-a, -b, k);
const PALM_UP = 0.75; // 手のひらの板の上半分を縦にのばす割合の逆数（板の上面が手の甲の屋根より上へ出るように）
function palmD(x, y, z) {
  const s = 0.74 + 0.26 * Math.min(1, Math.max(0, (-z - 20) / 67)); // 指の付け根から手首へ台形にすぼめる
  // 手首に近いほどうすく（同じ厚みのまま細い前腕につなぐと、手の甲と前腕の境目がこぶのように盛り上がった）
  const thin = 1 + 0.6 * Math.min(1, Math.max(0, (z + 38) / 30));
  // 先の端は指の付け根の弧に合わせる（小指の付け根は中指より 16mm 手前。まっすぐだと手のひらが小指の付け根にかぶさって見えた）
  const arc = (Math.max(0, x - 12) * 0.6 + Math.max(0, -18 - x) * 0.4) * Math.min(1, Math.max(0, (-z - 40) / 40));
  const px = (x - PALM.c[0]) / s, py = (y - PALM.c[1]) * thin, pz = z + arc - PALM.c[2];
  const qx = Math.abs(px) - PALM.h[0], qy = Math.abs(py) - PALM.h[1], qz = Math.abs(pz) - PALM.h[2];
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0); // Math.hypot は遅いので平方根で（毎回よばれる）
  const box = Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - PALM.r;
  const [rx, ry, rz] = PALM_E; // だ円体のおよその距離（Inigo Quilez）
  const ax = px / rx, ay = py / ry, az = pz / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
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
  // 中手骨 II〜V（骨格と同じ位置）: 手の甲の屋根に使う。r は甲の向きの半径 [根もと, 骨幹, 頭]（骨は縦に 0.85 倍）
  // 手のモデルごとの皮下脂肪の上乗せ（HAND.fat、mm、目安）。子どもの手は皮下脂肪が多く、こぶしや関節が目立たない
  const fat = HAND.fat || 0; P.tdH = TD_HAND + fat;
  P.mc = [];
  for (let f = 2; f <= 5; f++) { const { s, h } = mcEnds(f), d = sub3(h, s); P.mc.push({ s, d, l2: d[0] * d[0] + d[2] * d[2], r: MC_AP[f].slice() }); } // r は縦の半径（厚みの半分、CT の測定値）
  // 中手骨の上の肉（骨の太さ＋TD_HAND の円すい、骨格と同じ位置）。こぶし（中手骨の頭）の上の皮ふもこれで決まる
  // 根もとで丸く終わらせると手首の手前に縁が見えたので、手根骨の上まで（中手骨の長さの 35%）手首の側へのばす
  for (const M of P.mc) { const c = mkCone(add3(M.s, M.d.map(v => -v * 0.35)), add3(M.s, M.d), M.r[0] + P.tdH, M.r[2] + P.tdH, BONE_PALM); c.k = 6; c.noW = true; P.palm.push(c); }
  P.palm.push(mkCone(sub3(FINGERS_U[2].base, [0, 2, -3]), sub3(FINGERS_U[5].base, [0, 2, -3]), 10.5, 9, BONE_PALM));
  P.palm.push(mkCone([21, -8, -28], [28, -6, -66], 12, 10, BONE_PALM));
  { const c = mkCone([-6, -15, -24], [-14, -15, -40], 8, 7, BONE_PALM); c.k = 12; P.palm.push(c); } // 母指球の根もと（手根骨の手のひら側から始まる部分。手のひらに固定）
  // 親指の中手骨は手のひらと同じ組で溶けあわせる（骨は親指）
  const t0 = rest[1][0];
  // 母指球（親指の付け根の手のひら側の筋肉: 短母指外転筋・短母指屈筋・母指対立筋）。親指の中手骨の手のひら側に付いて、親指といっしょに動く。
  // 中手骨の手のひら側 5mm・手のひらの中心寄り 3mm に、根もとから MP 関節の手前まで（太さ 11 → 8mm は目安）。親指を開くと、
  // 手のひらに固定した根もとの部分とのあいだが伸びて、うすくなる（重みのなめらかな移りで）
  { const pc = [-4, -12, -48], m1 = rest[1][1].o, off = (p, u) => { const q = lerp3(t0.o, m1, u), d = sub3(pc, q), n = Math.hypot(...d) || 1;
      return [q[0] - t0.y[0] * 5 + d[0] / n * 3, q[1] - t0.y[1] * 5 + d[1] / n * 3, q[2] - t0.y[2] * 5 + d[2] / n * 3]; };
    const c = mkCone(off(null, 0.1), off(null, 0.8), 11, 8, boneOf(1, 0)); c.k = 12; c.thumb = true; P.palm.push(c); }
  // 親指の中手骨は根もとから太さを保ち、手首の親指側から途切れずにつなぐ（少し先から細く始めると、手首から MP 関節までが手の甲の側でへこんで見えた）
  { const c = mkCone([-16, -3, -14], t0.o, 9, RADII[1][0], BONE_PALM); c.k = 12; c.thumb = true; P.palm.push(c); } // 手首の親指側 → 親指の根もと（CMC）
  { const c = mkCone(t0.o, rest[1][1].o, RADII[1][0], RADII[1][1], boneOf(1, 0)); c.k = 12; c.thumb = true; P.palm.push(c); } // 親指の中手骨
  { const c = mkCone([-17, 3, -60], lerp3(t0.o, rest[1][1].o, 0.9), 10, 7.5, BONE_PALM); c.k = 14; c.thumb = true; P.palm.push(c); } // 親指と人さし指のあいだの水かき（甲の側の筋肉）。甲の側に寄せて厚く（うすいと、親指と手の甲のあいだが谷になった）
  P.arm = mkCone([2, -5, -42], [3, -16, 240], ARM_R[0], ARM_R[1], BONE_ARM); // 形: 手のひらの中から細く始めて、手首で自然に太くなる（手首で丸く始めると、境目に段ができた）。一人称で切れ目が見えないよう、肘の近くまで
  P.armW = mkCone([2, -6, -4], [3, -16, 240], ARM_R[0] + 3.4, ARM_R[1], BONE_ARM); // 重み用: 手首から先だけ（手のひらの皮ふが前腕といっしょに動かないように）
  // 指の皮ふの筒の中心を、手のひら側へずらす量（関節ごと: 付け根・2つめ・3つめ・指先）。甲の側の肉が TD_FINGER になるように。
  // 指先は鍵に当たるはらの中心（動きの計算の指先の点）なので 0
  const offN = f => {
    const B = BONE_R[f], ry = k => f === 1 && k === 1 ? Math.max(MC_AP[1][2], B[1][0] * 0.78) : (k === 0 ? (f === 1 ? B[0][2] : B[0][0]) : Math.max(B[k - 1][2], B[k][0])) * 0.78; // 親指の MP 関節は中手骨の頭の厚み（CT）
    return [0, 1, 2].map(k => Math.max(0, RADII[f][k] / FLAT - ry(k) - TD_FINGER - fat)).concat([0]);
  };
  for (let f = 1; f <= 5; f++) {
    const R = rest[f], off = offN(f);
    for (let j = f === 1 ? 1 : 0; j < 3; j++) {
      const a = R[j].o, b = j < 2 ? R[j + 1].o : fingerFK(FINGERS_U[f], REST_DEG[f][0] * D2R, REST_DEG[f][1] * D2R, REST_DEG[f][2] * D2R)[3];
      const c = mkCone(a, b, RADII[f][j], RADII[f][j + 1], boneOf(f, j));
      c.fr = R[j]; // 指は縦に少しうすい: 骨の y（甲の向き）を FLAT 倍に伸ばした点で測る
      c.off0 = off[j]; c.off1 = off[j + 1]; c.il = 1 / Math.hypot(...sub3(b, a));
      P.fing[f].push(c);
      if (j >= 1) { // 関節の少しのふくらみ
        const kr = RADII[f][j] * (1 + (HAND.knuckle === undefined ? 0.07 : HAND.knuckle));
        const k = mkCone(a, a, kr, kr, boneOf(f, j)); k.fr = R[j]; k.knuckle = true; k.off0 = k.off1 = off[j]; k.il = 0;
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
  // 手首より 40mm 以上肘の側は前腕の形だけ（手の部品は届かない。前腕を太くして網が広がったので、そこで手の計算をとばして速く）
  if (cull && z > 40) return coneD(P.arm, x, (y - P.arm.a[1]) * ARM_FLAT + P.arm.a[1], z, false);
  // 手のひらの板は上へのばしてから、手の甲の屋根で切る（甲の面は中手骨から決まる）。手のひらの部品をつないだあとで切る
  // （先に切ると、部品をなめらかにつなぐときの太りが積み重なって、また甲がふくらんだ）。親指の部品は切らずにあとからつなぐ
  let rf = mcRoof(P, x, z);
  // 手首の手前 30mm から、屋根を前腕の甲の高さへなめらかに下ろす（最大 3mm）。手の甲が前腕より 2〜3mm 高いままだと、
  // つなぎ目が手首を横切る折れ目に見えた（本物の手首の甲は、中手骨の根もと・手根骨・橈骨の端までほぼ平らにつながる）
  const wf = smoothF((z + 32) / 20);
  if (wf > 0) { const A = P.arm, t = (z - A.a[2]) / A.ba[2], cx = A.a[0] + A.ba[0] * t, cy = A.a[1] + A.ba[1] * t, r = A.ra + (A.rb - A.ra) * t, q = r * r - (x - cx) * (x - cx);
    const top = A.a[1] + (cy + Math.sqrt(Math.max(0, q)) - A.a[1]) / ARM_FLAT + 0.5; // 前腕の甲の高さ（縦は ARM_FLAT 分の1）
    const side = smoothF((0.8 - Math.abs(x - cx) / r) / 0.3); // 前腕の断面のふちでは高さの式が急に変わる（細い溝ができた）ので、ふちに近いほど弱める
    rf -= Math.min(3, Math.max(0, rf - top)) * wf * side; }
  const roof = y - rf - 60 * roofFade(z);
  // 上へのばすのは上半分を縦に 1/PALM_UP 倍にして（まっすぐ引きのばすと、手首の側の端が丸みのない壁になり、前腕とのあいだに段ができた）。
  // 手首の近く（z > -40 から）はのばさない（のばした板の端が前腕より 3〜4mm 高く出て、手首を横切る尾根になった）
  const yc = PALM.c[1], up = PALM_UP + (1 - PALM_UP) * smoothF((z + 40) / 20);
  let pal = palmD(x, y > yc ? yc + (y - yc) * up : y, z);
  // 重み（どの骨について動くか）は、形を変える前の手のひらの板からの距離で（のばした板で測ると、手首で手のひらと前腕の重みの境目が急になり、手首を曲げると折れ目が出た）
  if (comp) { comp.fill(1e9); comp[BONE_PALM] = palmD(x, y, z); }
  for (const c of P.palm) {
    if (c.thumb) continue;
    const d = coneD(c, x, y, z, cull);
    pal = smin(pal, d, c.k || 14);
    if (comp && !c.noW) comp[c.bone] = Math.min(comp[c.bone], d);
  }
  pal = smax(pal, roof, 3);
  for (const c of P.palm) {
    if (!c.thumb) continue;
    const d = coneD(c, x, y, z, cull);
    pal = smin(pal, d, c.k || 14);
    if (comp) comp[c.bone] = Math.min(comp[c.bone], d);
  }
  // 前腕は縦にうすい（だ円）。手のひらの中に入りこんだ部分（z < -10）だけ屋根で切る（手首では前腕の形そのまま）
  const arm = smax(coneD(P.arm, x, (y - P.arm.a[1]) * ARM_FLAT + P.arm.a[1], z, cull), y - rf - 60 * smoothF((z + 30) / 20), 3);
  if (comp) comp[BONE_ARM] = coneD(P.armW, x, (y - P.armW.a[1]) * ARM_FLAT + P.armW.a[1], z, false);
  let d = smin(pal, arm, 9); // つなぎ目の幅。大きいと手首に肉が足されて、手の甲と前腕の境目がこぶのように盛り上がった（13 でも手首の小指側の尾根が高くなった）
  for (let f = 1; f <= 5; f++) {
    let fd = 1e9;
    for (const c of P.fing[f]) {
      if (cull && (x < c.lo[0] || y < c.lo[1] || z < c.lo[2] || x > c.hi[0] || y > c.hi[1] || z > c.hi[2])) continue;
      const F = c.fr, qx = x - F.o[0], qy = y - F.o[1], qz = z - F.o[2];
      // 甲の向きの座標を、中心を手のひら側へ off ずらしてから FLAT 倍（off は節にそって関節の値をつなぐ）
      const yy = qx * F.y[0] + qy * F.y[1] + qz * F.y[2], u = Math.max(0, Math.min(1, (qx * F.z[0] + qy * F.z[1] + qz * F.z[2]) * c.il));
      const t = (yy + c.off0 + (c.off1 - c.off0) * u) * FLAT - yy;
      const kx = x + F.y[0] * t - c.a[0], ky = y + F.y[1] * t - c.a[1], kz = z + F.y[2] * t - c.a[2];
      const e = c.knuckle && c.l2 === 0 ? Math.sqrt(kx * kx + ky * ky + kz * kz) - c.ra
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

// 網の姿勢の点 p の、骨の重みの上位4つ [[重み, 骨], ...]（合計で割る前）。皮ふと、筋肉・腱・脂肪の模型（tissue.js）で同じものを使う
function skinWeights(P, restB, p, comp) {
  if (p[2] > 60) return [[1, BONE_ARM]]; // 手首より 60mm 以上肘の側は前腕の骨だけ（手のひらまでの距離が遠く、ほかの重みは 0 になる）
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
  return sc.slice(0, 4);
}

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
  const vein = new Float32Array(NV), raise = new Float32Array(NV);
  for (let v = 0; v < NV; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], ny = nrm[v * 3 + 1];
    if (ny < 0.35 || z > 30 || z < -100) continue;
    const dors = Math.min(1, (ny - 0.35) * 2.5);
    let hgt = 0, vn = 0;
    for (const T of TENDONS) { const d = segDist2(x, z, T); const fade = smoothF((T[1] - z) / 10) * smoothF((z - T[3]) / 14); hgt += 0.75 * Math.exp(-((d / 2.4) ** 2)) * fade; }
    for (const L of VEINS) for (let i = 0; i < L.length - 1; i++) { const d = segDist2(x, z, [L[i][0], L[i][1], L[i + 1][0], L[i + 1][1]]); const e = Math.exp(-((d / 2.3) ** 2)); hgt += 0.22 * e; vn = Math.max(vn, e); } // 静脈は太さ 3〜4mm で低く盛り上がる（細く高いと光って白い線に見えた）
    const vk = HAND.veins === undefined ? 1 : HAND.veins; // 手のモデルごとの静脈・腱の目立ち方
    hgt *= dors * vk; vein[v] = vn * dors * vk; raise[v] = hgt;
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
    // 三角形からの法線は、盛り上げた量に合わせて陰関数の法線となめらかにまぜる（ある範囲だけ切りかえると、
    // 三角形の法線のこまかい角が出る所と出ない所の境目が、手首の甲に角の丸い四角の輪郭として見えた）
    for (let v = 0; v < NV; v++) {
      const w = Math.min(1, raise[v] / 0.25);
      if (w <= 0) continue;
      const l = Math.hypot(acc[v * 3], acc[v * 3 + 1], acc[v * 3 + 2]) || 1;
      const nx = nrm[v * 3] + (acc[v * 3] / l - nrm[v * 3]) * w, ny = nrm[v * 3 + 1] + (acc[v * 3 + 1] / l - nrm[v * 3 + 1]) * w, nz = nrm[v * 3 + 2] + (acc[v * 3 + 2] / l - nrm[v * 3 + 2]) * w;
      const m = Math.hypot(nx, ny, nz) || 1;
      nrm[v * 3] = nx / m; nrm[v * 3 + 1] = ny / m; nrm[v * 3 + 2] = nz / m;
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
    const top = skinWeights(P, restB, p, comp), sum = top.reduce((s, e) => s + e[0], 0);
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
// 爪半月の見えやすさ（親指〜小指、目安。親指ではっきり、小指ではほとんど見えない）
const LUNULA = [0, 1.0, 0.6, 0.5, 0.3, 0.1];
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
        // 浮かせる量: まん中は少し盛り上がり、両わきは低く、根もとは皮ふのひだ（甘皮）の下へもぐる。ふちは材質でなめらかに透明にする（v031〜。前は全体が浮いた板で、ふちが線に見えた）
        const g = sdfGrad(P, ...p), mid = Math.sin(Math.PI * it / NT), lift = 0.18 + 0.4 * Math.pow(mid, 0.6) - Math.max(0, 0.1 - u) * 4; // 皮ふの網は 1.5mm の三角形で、丸い所は本当の表面より少し外にあるので、もぐらせすぎると爪が網の下に隠れた
        p = [p[0] + g[0] * lift, p[1] + g[1] * lift, p[2] + g[2] * lift];
        if (u > 0.86) { const o = (u - 0.86) * 9; p = [p[0] + B.z[0] * o * 0.6 - g[0] * o * 0.15, p[1] + B.z[1] * o * 0.6 - g[1] * o * 0.15, p[2] + B.z[2] * o * 0.6 - g[2] * o * 0.15]; }
        const q = sub3(p, B.o);
        pos.push(dot3(q, B.x), dot3(q, B.y), dot3(q, B.z));
        // 色: 根元は白っぽい爪半月（指ごとの見えやすさ LUNULA、目安）、なかほどは爪床の桃色（先へ行くほど少し赤く）、先のはみ出し（自由縁）は白
        const side = Math.abs(it / NT * 2 - 1), lun = LUNULA[f];
        let c = mix3(lin3(0.97, 0.80, 0.77), lin3(0.95, 0.70, 0.66), Math.min(1, u / 0.8)); // 爪の板ごしの爪床（まわりの肌より明るい桃色。近い色だと爪が見分けられなかった）
        if (u < 0.26 && side < 0.75) { const k = Math.max(0, 1 - (u / 0.26) ** 2 - (side / 0.75) ** 2); c = mix3(c, lin3(0.97, 0.90, 0.86), Math.min(1, k * 1.6) * lun); }
        if (u > 0.82) c = mix3(c, lin3(0.98, 0.96, 0.91), smoothF((u - 0.82) / 0.08));
        c = mix3(c, lin3(0.86, 0.64, 0.58), side ** 4 * 0.5);
        col.push(...c); uvs.push(u, it / NT);
      }
    }
    const idx = [];
    for (let iu = 0; iu < NU; iu++) for (let it = 0; it < NT; it++) {
      const a = iu * (NT + 1) + it, b = a + 1, c = a + NT + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    nails.push({ f, pos: new Float32Array(pos), col: new Float32Array(col), uv: new Float32Array(uvs), idx });
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
