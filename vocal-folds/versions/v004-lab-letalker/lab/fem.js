// 声帯の有限要素モデル（技術検証用）。Node でもブラウザでも動く。
// Zhang (2015) の付録の作り方: 声帯（片側）の固有モードを前もって求め、時間の計算はモードの重ね合わせで行う。
// 座標（単位 m）: x = 内外（x=0 が声門の中心線、声帯は x>0 側）、y = 息の流れの向き（下→上）、z = 前後（0=前、L=後ろ）。
// 要素は 27節点の六面体（2次）。材料は前後方向（z）にだけ性質のちがう横等方性・線形（Zhang 2015・2016・2021）。
(function (root) {
'use strict';

// ---------- 形 ----------
// 断面は Zhang (2017) 図1 の後ろの断面の形: 外側の縦の面の高さ 9mm、深さ Db+Dc、
// 上面は外側の面と 83°（内側へ 7° 下がる）、体部の上の面は 85°、下面は内側の面の下の端から外側の下の端まで直線、
// 外側での表層の厚さ t（上と下）、表層と体部の下面の角度の差 2°。内側の面は縦で高さ T。
// 前後の細り: 後ろの断面を前後に押し出し、外側を2次曲線の縦の面で切り落とす（深さ: 後ろ D、中央 0.875D、前 0.5D）。
function defaultGeom(o) {
  const g = Object.assign({
    L: 17e-3, T: 3e-3, Db: 6e-3, Dc: 1.5e-3,
    tLat: null,         // 外側での表層の厚さ（null なら Zhang 2017 の決め方: 1.5mm、T=1 なら 0.5、T=2 なら 1.0）
    Hlat: 9e-3,         // 外側の縦の面の高さ
    supDeg: 7,          // 上面の傾き（内側へ下がる、水平から。90-83）
    bodySupDeg: 5,      // 体部の上の面（90-85）
    infDiffDeg: 2,      // 表層と体部の下面の角度の差
    alphaDeg: 0,        // 2枚の内側の面のあいだの角度（後ろが開く）
    g0: 0,              // 中心線から内側の面までのすき間（全体を平行に。負は押しつけ）
    taper: 0.5,         // 前のはしの深さ / 後ろの深さ
    nX: 5, nY: 7, nZ: 8, // 要素の数（内外・上下・前後）
    gradeX: 1.5,        // 内側を細かく
  }, o || {});
  if (g.tLat == null) g.tLat = Math.min(1.5e-3, g.T / 2);
  return g;
}
function sectionShape(g) {
  const D = g.Db + g.Dc, T = g.T;
  const yTL = T + D * Math.tan(g.supDeg * Math.PI / 180);   // 外側の上のはし
  const yBL = yTL - g.Hlat;                                   // 外側の下のはし
  return { D, T, yTL, yBL, slopeInf: -yBL / D, slopeSup: Math.tan(g.supDeg * Math.PI / 180) };
}
// 断面（z の位置で）上の点: 写像 (s=内外 0..1, t=上下 0..1) → (x, y)
function sectionPoint(g, s, t, z) {
  const sh = sectionShape(g);
  const zr = z / g.L;                       // 0=前, 1=後ろ
  const Dz = sh.D * (1 - (1 - g.taper) * (1 - zr) * (1 - zr));
  const x = Dz * Math.pow(s, g.gradeX);
  const yBot = -x * sh.slopeInf, yTop = sh.T + x * sh.slopeSup;
  const y = yBot + t * (yTop - yBot);
  const gap = g.g0 + z * Math.tan(g.alphaDeg * Math.PI / 180) / 2;  // 半分のすき間
  return [x + gap, y];
}
// 体部かどうか（断面の中の点 x, y。x は内側の面からの距離）
function inBody(g, x, y) {
  const sh = sectionShape(g);
  if (x < g.Dc) return false;
  const yTopB = (sh.yTL - g.tLat) - (sh.D - x) * Math.tan(g.bodySupDeg * Math.PI / 180);
  const a2c = Math.atan2(sh.D, -sh.yBL);                       // 外側の面と表層の下面の角度
  const a2b = a2c - g.infDiffDeg * Math.PI / 180;
  const yBotB = (sh.yBL + g.tLat) + (sh.D - x) / Math.tan(a2b);
  return y > yBotB && y < yTopB;
}

// ---------- 網（メッシュ） ----------
function buildMesh(g) {
  const nI = 2 * g.nX + 1, nJ = 2 * g.nY + 1, nK = 2 * g.nZ + 1;
  const N = nI * nJ * nK;
  const P = new Float64Array(N * 3);
  const id = (i, j, k) => (k * nJ + j) * nI + i;
  for (let k = 0; k < nK; k++) {
    const z = g.L * k / (nK - 1);
    for (let j = 0; j < nJ; j++) for (let i = 0; i < nI; i++) {
      const [x, y] = sectionPoint(g, i / (nI - 1), j / (nJ - 1), z);
      const n = id(i, j, k);
      P[3 * n] = x; P[3 * n + 1] = y; P[3 * n + 2] = z;
    }
  }
  const els = [];
  for (let ez = 0; ez < g.nZ; ez++) for (let ey = 0; ey < g.nY; ey++) for (let ex = 0; ex < g.nX; ex++) {
    const conn = new Int32Array(27);
    let c = 0;
    for (let c3 = 0; c3 < 3; c3++) for (let c2 = 0; c2 < 3; c2++) for (let c1 = 0; c1 < 3; c1++)
      conn[c++] = id(2 * ex + c1, 2 * ey + c2, 2 * ez + c3);
    els.push({ conn, ex, ey, ez });
  }
  // 固定: 外側の面（i 最大）と前後のはし（k=0, k 最大）
  const fixed = new Uint8Array(N);
  for (let k = 0; k < nK; k++) for (let j = 0; j < nJ; j++) for (let i = 0; i < nI; i++)
    if (i === nI - 1 || k === 0 || k === nK - 1) fixed[id(i, j, k)] = 1;
  return { g, nI, nJ, nK, N, P, els, fixed, id };
}

// 表層（カバー）かどうか: 要素の中心が体部の多角形の外なら表層（Zhang 2017 図1）
// 注: 要素の境目は層の境目に合わせていないので、境目は要素の大きさの分だけ粗い
function markLayers(mesh) {
  const { g, P, els } = mesh;
  for (const e of els) {
    let cx = 0, cy = 0, cz = 0;
    for (const n of e.conn) { cx += P[3 * n]; cy += P[3 * n + 1]; cz += P[3 * n + 2]; }
    cx /= 27; cy /= 27; cz /= 27;
    const gap = g.g0 + cz * Math.tan(g.alphaDeg * Math.PI / 180) / 2;
    e.cover = !inBody(g, cx - gap, cy);
  }
}

// ---------- 材料 ----------
// 横等方性（等方の面 = x-y、とくべつな向き = z）。Voigt の順: xx, yy, zz, yz, xz, xy
function materialC(m) {
  const Et = m.Et, Ez = 4 * m.Gap, Gz = m.Gap, nuzp = m.nuAP; // Eap = 4 Gap（Zhang）
  let nup = m.nuT;
  // 断面の中のポアソン比: ほとんど縮まない横等方性の条件（Itskov & Aksel 2002）から 1 - Et/(2 Eap)。Zhang の論文には値がなく、この決め方は推定
  if (nup == null) nup = 1 - Et / (2 * Ez);
  const S = [
    [1 / Et, -nup / Et, -nuzp / Ez, 0, 0, 0],
    [-nup / Et, 1 / Et, -nuzp / Ez, 0, 0, 0],
    [-nuzp / Ez, -nuzp / Ez, 1 / Ez, 0, 0, 0],
    [0, 0, 0, 1 / Gz, 0, 0],
    [0, 0, 0, 0, 1 / Gz, 0],
    [0, 0, 0, 0, 0, 2 * (1 + nup) / Et],
  ];
  return { C: inv6(S), nup };
}
function inv6(A) {
  const n = 6, M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(r => r.slice(n));
}

// ---------- 27節点の六面体 ----------
const GP = [-Math.sqrt(0.6), 0, Math.sqrt(0.6)], GW = [5 / 9, 8 / 9, 5 / 9];
function q1(x) { return [x * (x - 1) / 2, 1 - x * x, x * (x + 1) / 2]; }
function dq1(x) { return [x - 0.5, -2 * x, x + 0.5]; }
// 前もって: 27点の積分点での形状関数と微分
const H27 = (() => {
  const pts = [];
  for (let c = 0; c < 3; c++) for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
    const u = GP[a], v = GP[b], w = GP[c];
    const Nu = q1(u), Nv = q1(v), Nw = q1(w), Du = dq1(u), Dv = dq1(v), Dw = dq1(w);
    const N = new Float64Array(27), dN = new Float64Array(81);
    let n = 0;
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      N[n] = Nu[i] * Nv[j] * Nw[k];
      dN[3 * n] = Du[i] * Nv[j] * Nw[k];
      dN[3 * n + 1] = Nu[i] * Dv[j] * Nw[k];
      dN[3 * n + 2] = Nu[i] * Nv[j] * Dw[k];
      n++;
    }
    pts.push({ N, dN, w: GW[a] * GW[b] * GW[c] });
  }
  return pts;
})();

function elementKM(P, conn, C, rho) {
  const Ke = new Float64Array(81 * 81), Me = new Float64Array(81 * 81);
  const X = new Float64Array(81);
  for (let a = 0; a < 27; a++) for (let d = 0; d < 3; d++) X[3 * a + d] = P[3 * conn[a] + d];
  const B = new Float64Array(6 * 81), CB = new Float64Array(6 * 81), dX = new Float64Array(81);
  for (const gp of H27) {
    // ヤコビアン
    const J = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let a = 0; a < 27; a++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) J[3 * r + c] += gp.dN[3 * a + r] * X[3 * a + c];
    const det = J[0] * (J[4] * J[8] - J[5] * J[7]) - J[1] * (J[3] * J[8] - J[5] * J[6]) + J[2] * (J[3] * J[7] - J[4] * J[6]);
    if (!(det > 0)) throw new Error('要素がつぶれている（det=' + det + '）');
    const iJ = [
      (J[4] * J[8] - J[5] * J[7]) / det, (J[2] * J[7] - J[1] * J[8]) / det, (J[1] * J[5] - J[2] * J[4]) / det,
      (J[5] * J[6] - J[3] * J[8]) / det, (J[0] * J[8] - J[2] * J[6]) / det, (J[2] * J[3] - J[0] * J[5]) / det,
      (J[3] * J[7] - J[4] * J[6]) / det, (J[1] * J[6] - J[0] * J[7]) / det, (J[0] * J[4] - J[1] * J[3]) / det,
    ];
    for (let a = 0; a < 27; a++) for (let c = 0; c < 3; c++)
      dX[3 * a + c] = iJ[3 * c] * gp.dN[3 * a] + iJ[3 * c + 1] * gp.dN[3 * a + 1] + iJ[3 * c + 2] * gp.dN[3 * a + 2];
    B.fill(0);
    for (let a = 0; a < 27; a++) {
      const nx = dX[3 * a], ny = dX[3 * a + 1], nz = dX[3 * a + 2], c0 = 3 * a;
      B[0 * 81 + c0] = nx; B[1 * 81 + c0 + 1] = ny; B[2 * 81 + c0 + 2] = nz;
      B[3 * 81 + c0 + 1] = nz; B[3 * 81 + c0 + 2] = ny;
      B[4 * 81 + c0] = nz; B[4 * 81 + c0 + 2] = nx;
      B[5 * 81 + c0] = ny; B[5 * 81 + c0 + 1] = nx;
    }
    const wdet = gp.w * det;
    for (let r = 0; r < 6; r++) for (let j = 0; j < 81; j++) {
      let s = 0; for (let k = 0; k < 6; k++) s += C[r][k] * B[k * 81 + j]; CB[r * 81 + j] = s;
    }
    for (let i = 0; i < 81; i++) for (let j = i; j < 81; j++) {
      let s = 0; for (let r = 0; r < 6; r++) s += B[r * 81 + i] * CB[r * 81 + j];
      Ke[i * 81 + j] += s * wdet;
    }
    for (let a = 0; a < 27; a++) for (let b = a; b < 27; b++) {
      const m = rho * gp.N[a] * gp.N[b] * wdet;
      for (let d = 0; d < 3; d++) Me[(3 * a + d) * 81 + 3 * b + d] += m;
    }
  }
  for (let i = 0; i < 81; i++) for (let j = 0; j < i; j++) { Ke[i * 81 + j] = Ke[j * 81 + i]; Me[i * 81 + j] = Me[j * 81 + i]; }
  return { Ke, Me };
}

// ---------- 組み立て（帯行列） ----------
function assemble(mesh, mat) {
  const { N, P, els, fixed } = mesh;
  const dofOf = new Int32Array(N * 3).fill(-1);
  let n = 0;
  for (let a = 0; a < N; a++) if (!fixed[a]) for (let d = 0; d < 3; d++) dofOf[3 * a + d] = n++;
  let bw = 0;
  for (const e of els) {
    let lo = 1e9, hi = -1;
    for (const a of e.conn) for (let d = 0; d < 3; d++) { const q = dofOf[3 * a + d]; if (q >= 0) { if (q < lo) lo = q; if (q > hi) hi = q; } }
    if (hi - lo > bw) bw = hi - lo;
  }
  const W = bw + 1;
  const K = new Float64Array(n * W), M = new Float64Array(n * W);
  const Cc = materialC(mat.cover), Cb = materialC(mat.body);
  for (const e of els) {
    const C = e.cover ? Cc.C : Cb.C;
    const { Ke, Me } = elementKM(P, e.conn, C, mat.rho);
    for (let i = 0; i < 81; i++) {
      const gi = dofOf[3 * e.conn[(i / 3) | 0] + (i % 3)]; if (gi < 0) continue;
      for (let j = 0; j < 81; j++) {
        const gj = dofOf[3 * e.conn[(j / 3) | 0] + (j % 3)]; if (gj < 0 || gj > gi) continue;
        K[gi * W + (gi - gj)] += Ke[i * 81 + j];
        M[gi * W + (gi - gj)] += Me[i * 81 + j];
      }
    }
  }
  return { n, bw, W, K, M, dofOf, nupCover: Cc.nup, nupBody: Cb.nup };
}

function bandMul(A, W, n, x, y) { // y = A x（下三角の帯で対称）
  y.fill(0);
  for (let i = 0; i < n; i++) {
    const base = i * W; let s = A[base] * x[i];
    const jlo = Math.max(0, i - W + 1);
    for (let j = jlo; j < i; j++) { const a = A[base + i - j]; s += a * x[j]; y[j] += a * x[i]; }
    y[i] += s;
  }
}
function bandCholesky(A, W, n) { // A を L に置きかえる（L[i][j] = A[i*W + i-j]）
  for (let j = 0; j < n; j++) {
    const bj = j * W;
    let s = A[bj];
    const klo = Math.max(0, j - W + 1);
    for (let k = klo; k < j; k++) { const v = A[bj + j - k]; s -= v * v; }
    if (!(s > 0)) throw new Error('コレスキー分解に失敗（行 ' + j + '）');
    const d = Math.sqrt(s); A[bj] = d;
    const ihi = Math.min(n - 1, j + W - 1);
    for (let i = j + 1; i <= ihi; i++) {
      const bi = i * W;
      let t = A[bi + i - j];
      const k0 = Math.max(klo, i - W + 1);
      for (let k = k0; k < j; k++) t -= A[bi + i - k] * A[bj + j - k];
      A[bi + i - j] = t / d;
    }
  }
}
function bandSolve(L, W, n, b, x) { // L L^T x = b
  for (let i = 0; i < n; i++) {
    const bi = i * W; let s = b[i];
    for (let k = Math.max(0, i - W + 1); k < i; k++) s -= L[bi + i - k] * x[k];
    x[i] = s / L[bi];
  }
  for (let i = n - 1; i >= 0; i--) {
    x[i] /= L[i * W];
    const xi = x[i], bi = i * W;
    for (let k = Math.max(0, i - W + 1); k < i; k++) x[k] -= L[bi + i - k] * xi;
  }
}

// 対称行列の固有値（ヤコビ法）。小さな行列（ランチョスの三重対角）用
function jacobiEig(A, n) {
  const a = A.slice(), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
      const th = (a[q * n + q] - a[p * n + p]) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k * n + p], akq = a[k * n + q];
        a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p * n + k], aqk = a[q * n + k];
        a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k * n + p], vkq = V[k * n + q];
        V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
      }
    }
  }
  const vals = new Float64Array(n); for (let i = 0; i < n; i++) vals[i] = a[i * n + i];
  return { vals, V };
}

// いちばん低い nModes 個の固有モード（K φ = ω² M φ）。逆反復のランチョス法、完全な再直交化つき。
function lowestModes(sys, nModes, opt) {
  opt = opt || {};
  const { n, W, K, M } = sys;
  const L = K.slice(); bandCholesky(L, W, n);
  const m = Math.min(n, opt.steps || Math.max(3 * nModes, nModes + 40));
  const Q = [], MQ = [];
  let q = new Float64Array(n);
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  for (let i = 0; i < n; i++) q[i] = rnd();
  const tmp = new Float64Array(n);
  const mnorm = v => { bandMul(M, W, n, v, tmp); let s = 0; for (let i = 0; i < n; i++) s += v[i] * tmp[i]; return Math.sqrt(s); };
  let nq = mnorm(q); for (let i = 0; i < n; i++) q[i] /= nq;
  const alpha = [], beta = [];
  const w = new Float64Array(n), Mq = new Float64Array(n);
  for (let j = 0; j < m; j++) {
    bandMul(M, W, n, q, Mq);
    Q.push(q); MQ.push(Mq.slice());
    bandSolve(L, W, n, Mq, w);
    let a = 0; for (let i = 0; i < n; i++) a += Mq[i] * w[i];
    alpha.push(a);
    // 完全な再直交化（2回）
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < Q.length; k++) {
      const mk = MQ[k]; let s = 0; for (let i = 0; i < n; i++) s += mk[i] * w[i];
      const qk = Q[k]; for (let i = 0; i < n; i++) w[i] -= s * qk[i];
    }
    const b = mnorm(w);
    beta.push(b);
    if (b < 1e-14) break;
    q = new Float64Array(n); for (let i = 0; i < n; i++) q[i] = w[i] / b;
  }
  const k = alpha.length;
  const T = new Float64Array(k * k);
  for (let i = 0; i < k; i++) { T[i * k + i] = alpha[i]; if (i + 1 < k) { T[i * k + i + 1] = beta[i]; T[(i + 1) * k + i] = beta[i]; } }
  const { vals, V } = jacobiEig(T, k);
  const order = Array.from(vals.keys()).sort((x, y) => vals[y] - vals[x]); // θ の大きい順 = ω の小さい順
  const modes = [];
  for (let r = 0; r < Math.min(nModes, k); r++) {
    const c = order[r], theta = vals[c];
    const phi = new Float64Array(n);
    for (let j = 0; j < k; j++) { const s = V[j * k + c]; const qj = Q[j]; for (let i = 0; i < n; i++) phi[i] += s * qj[i]; }
    const nm = mnorm(phi); for (let i = 0; i < n; i++) phi[i] /= nm;
    // 残差 ‖Kφ - λMφ‖ / ‖Kφ‖
    const lam = 1 / theta, Kp = new Float64Array(n), Mp = new Float64Array(n);
    bandMul(K, W, n, phi, Kp); bandMul(M, W, n, phi, Mp);
    let rr = 0, kk = 0; for (let i = 0; i < n; i++) { const d = Kp[i] - lam * Mp[i]; rr += d * d; kk += Kp[i] * Kp[i]; }
    modes.push({ omega: Math.sqrt(lam), f: Math.sqrt(lam) / (2 * Math.PI), phi, resid: Math.sqrt(rr / kk) });
  }
  return modes;
}

// ---------- 流れに触れる面の情報（時間の計算で使う） ----------
// 各前後の断面 k ごとに、面の線（下面: 外→内、内側の面: 下→上、上面: 内→外）の節点をならべる。
// 節点ごとに、面の向きつき面積 a = ∫ N n dS（外向き）を 9節点の面の積分で求める。
function surfaceData(mesh, sys, modes) {
  const { nI, nJ, nK, id, P } = mesh;
  const lines = [];
  for (let k = 0; k < nK; k++) {
    const L = [];
    for (let i = nI - 1; i >= 1; i--) L.push(id(i, 0, k));
    for (let j = 0; j < nJ; j++) L.push(id(0, j, k));
    for (let i = 1; i < nI; i++) L.push(id(i, nJ - 1, k));
    lines.push(L);
  }
  const nodes = []; const index = new Map();
  for (const L of lines) for (const a of L) if (!index.has(a)) { index.set(a, nodes.length); nodes.push(a); }
  const area = new Float64Array(nodes.length * 3);
  // 面: 下面（j=0）、内側（i=0）、上面（j=nJ-1）。各面を 9節点の四角形に分けて積分
  // 面ごとに、声帯の中の点（となりの要素の中心の節点）を覚えておき、外向きを決める
  const faces = [];
  for (let ez = 0; ez < mesh.g.nZ; ez++) {
    for (let ex = 0; ex < mesh.g.nX; ex++) {
      faces.push({ f: (u, v) => id(2 * ex + u, 0, 2 * ez + v), inner: id(2 * ex + 1, 1, 2 * ez + 1) });
      faces.push({ f: (u, v) => id(2 * ex + u, nJ - 1, 2 * ez + v), inner: id(2 * ex + 1, nJ - 2, 2 * ez + 1) });
    }
    for (let ey = 0; ey < mesh.g.nY; ey++) faces.push({ f: (u, v) => id(0, 2 * ey + u, 2 * ez + v), inner: id(1, 2 * ey + 1, 2 * ez + 1) });
  }
  for (const F of faces) {
    const nd = []; for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) nd.push(F.f(u, v));
    // 面の中心での向き（s=t=0）と、中の点への向きをくらべる
    {
      const c = nd[4], a1 = nd[5], a0 = nd[3], b1 = nd[7], b0 = nd[1];
      const xs = [0, 1, 2].map(d => P[3 * a1 + d] - P[3 * a0 + d]), xt = [0, 1, 2].map(d => P[3 * b1 + d] - P[3 * b0 + d]);
      const cr = [xs[1] * xt[2] - xs[2] * xt[1], xs[2] * xt[0] - xs[0] * xt[2], xs[0] * xt[1] - xs[1] * xt[0]];
      const inw = [0, 1, 2].map(d => P[3 * F.inner + d] - P[3 * c + d]);
      F.sign = (cr[0] * inw[0] + cr[1] * inw[1] + cr[2] * inw[2]) > 0 ? -1 : 1;
    }
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
      const s = GP[a], t = GP[b], Ns = q1(s), Nt = q1(t), Ds = dq1(s), Dt = dq1(t);
      const xs = [0, 0, 0], xt = [0, 0, 0], N = [];
      let c = 0;
      for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) {
        const nn = nd[c++], w = Ns[u] * Nt[v]; N.push(w);
        for (let d = 0; d < 3; d++) { xs[d] += Ds[u] * Nt[v] * P[3 * nn + d]; xt[d] += Ns[u] * Dt[v] * P[3 * nn + d]; }
      }
      const cr = [xs[1] * xt[2] - xs[2] * xt[1], xs[2] * xt[0] - xs[0] * xt[2], xs[0] * xt[1] - xs[1] * xt[0]];
      const ww = GW[a] * GW[b] * F.sign;
      for (let q = 0; q < 9; q++) {
        const ii = index.get(nd[q]); if (ii == null) continue;
        for (let d = 0; d < 3; d++) area[3 * ii + d] += N[q] * cr[d] * ww;
      }
    }
  }
  // モードの形（面の節点だけ）
  const nm = modes.length, phi = new Float32Array(nm * nodes.length * 3);
  for (let r = 0; r < nm; r++) for (let ii = 0; ii < nodes.length; ii++) for (let d = 0; d < 3; d++) {
    const q = sys.dofOf[3 * nodes[ii] + d];
    phi[(r * nodes.length + ii) * 3 + d] = q >= 0 ? modes[r].phi[q] : 0;
  }
  const pos = new Float64Array(nodes.length * 3);
  for (let ii = 0; ii < nodes.length; ii++) for (let d = 0; d < 3; d++) pos[3 * ii + d] = P[3 * nodes[ii] + d];
  const lineIdx = lines.map(L => L.map(a => index.get(a)));
  return { nodes: nodes.length, pos, area, phi, omega: modes.map(m => m.omega), lines: lineIdx, nI, nJ, nK };
}

// まとめ: 形と材料から、時間の計算に使うモードのデータを作る
function buildModel(geomOpt, matOpt, nModes) {
  const g = defaultGeom(geomOpt);
  const mat = Object.assign({ rho: 1030, cover: { Et: 4e3, Gap: 10e3, nuAP: 0.495 }, body: null }, matOpt || {});
  if (!mat.body) mat.body = mat.cover;
  const mesh = buildMesh(g); markLayers(mesh);
  const t0 = Date.now();
  const sys = assemble(mesh, mat);
  const t1 = Date.now();
  const modes = lowestModes(sys, nModes || 40);
  const t2 = Date.now();
  const surf = surfaceData(mesh, sys, modes);
  surf.info = { g, mat, n: sys.n, bw: sys.bw, nup: [sys.nupCover, sys.nupBody], tAssemble: t1 - t0, tEigen: t2 - t1, resid: modes.map(m => m.resid) };
  return surf;
}

const api = { defaultGeom, sectionShape, inBody, sectionPoint, buildMesh, markLayers, materialC, assemble, lowestModes, surfaceData, buildModel, bandCholesky, bandSolve, bandMul };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VFfem = api;
})(typeof self !== 'undefined' ? self : this);
