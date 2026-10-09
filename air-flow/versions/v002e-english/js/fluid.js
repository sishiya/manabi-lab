// ================= 2D flow (incompressible, MAC grid) and air age / smoke transport =================
'use strict';
const NU = 0.003;        // eddy viscosity (m²/s): stands in for the turbulence a 10 cm grid cannot resolve
const FRIC = 0.25;       // linear drag (1/s): a jet in a real room spreads in 3D and slows faster than a 2D one
const DIFF = 0.005;      // eddy diffusivity of age and smoke (m²/s): small drafts from people, sun, heaters
const DT = 0.05;         // flow time step (s)
const SOR_IT = 40, SOR_W = 1.85;

const NU1 = W + 1, NV = W;                    // row strides of u (W+1 × H) and v (W × H+1)
const u = new Float32Array((W + 1) * H), v = new Float32Array(W * (H + 1));
const u2 = new Float32Array(u.length), v2 = new Float32Array(v.length);
const bu = new Float32Array(u.length), bv = new Float32Array(v.length);   // face openness 0..1
const psi = new Float32Array(W * H), rhs = new Float32Array(W * H);
const src = new Float32Array(W * H);     // net inflow into the cell from outside (m³/s; <0 = out)
const exch = new Float32Array(W * H);    // two-way exchange with outside air (m³/s)
const age = new Float32Array(W * H);     // air age (s)
const smoke = new Float32Array(W * H);   // smoke concentration (0..1)
const zoneOf = new Int16Array(W * H);
let nZones = 0;
const isFluid = c => cell[c] === FLUID;

// face openness: 1 between two fluid cells, door.beta next to a closed door, 0 at walls
function buildFaces(st) {
  const dc = c => { const k = doorOf[c]; return k >= 0 && !(st[DOORS[k].key] | 0) ? DOORS[k].beta : 1; };
  bu.fill(0); bv.fill(0);
  for (let j = 0; j < H; j++) for (let i = 1; i < W; i++) {
    const a = j * W + i - 1, b = a + 1;
    if (isFluid(a) && isFluid(b)) bu[j * NU1 + i] = Math.min(dc(a), dc(b));
  }
  for (let j = 1; j < H; j++) for (let i = 0; i < W; i++) {
    const a = (j - 1) * W + i, b = a + W;
    if (isFluid(a) && isFluid(b)) bv[j * NV + i] = Math.min(dc(a), dc(b));
  }
  for (let k = 0; k < u.length; k++) if (!bu[k]) u[k] = 0;
  for (let k = 0; k < v.length; k++) if (!bv[k]) v[k] = 0;
  // zones = air spaces joined by any open face
  zoneOf.fill(-1); nZones = 0;
  for (let s = 0; s < W * H; s++) {
    if (!isFluid(s) || zoneOf[s] >= 0) continue;
    const stack = [s]; zoneOf[s] = nZones;
    while (stack.length) {
      const c = stack.pop(), i = c % W, j = (c / W) | 0;
      const nb = [[bu[j * NU1 + i + 1], c + 1], [bu[j * NU1 + i], c - 1], [bv[(j + 1) * NV + i], c + W], [bv[j * NV + i], c - W]];
      for (const [b, n] of nb) if (b > 0 && zoneOf[n] < 0) { zoneOf[n] = nZones; stack.push(n); }
    }
    nZones++;
  }
}

// sources from the network result
function applyNet(net) {
  src.fill(0); exch.fill(0);
  for (const it of net.items) {
    const n = it.cells.length;
    for (const c of it.cells) { src[c] += it.q / n; exch[c] += (it.qx || 0) / n; }
  }
}

// ---------- sampling ----------
function sampleU(x, y) {   // x,y in cells (cell centre of (i,j) = i+.5, j+.5)
  let gx = x, gy = y - .5;
  gx = Math.max(0, Math.min(W - .001, gx)); gy = Math.max(0, Math.min(H - 1.001, gy));
  const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * NU1 + i;
  return (u[k] * (1 - fx) + u[k + 1] * fx) * (1 - fy) + (u[k + NU1] * (1 - fx) + u[k + NU1 + 1] * fx) * fy;
}
function sampleV(x, y) {
  let gx = x - .5, gy = y;
  gx = Math.max(0, Math.min(W - 1.001, gx)); gy = Math.max(0, Math.min(H - .001, gy));
  const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * NV + i;
  return (v[k] * (1 - fx) + v[k + 1] * fx) * (1 - fy) + (v[k + NV] * (1 - fx) + v[k + NV + 1] * fx) * fy;
}
function sampleArr(a, x, y, w) {    // generic bilinear on a w-wide cell array (cell centred)
  let gx = x - .5, gy = y - .5;
  gx = Math.max(0, Math.min(w - 1.001, gx)); gy = Math.max(0, Math.min(H - 1.001, gy));
  const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * w + i;
  return (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fy) + (a[k + w] * (1 - fx) + a[k + w + 1] * fx) * fy;
}

// ---------- forcing: jets from circulators, air conditioners and inflow through open windows ----------
// jets: [{x,y (m), ang (deg, screen: 0 = right, 90 = down), speed (m/s), width (m), len (m)}]
function force(jets, dt) {
  const r = Math.min(1, dt / 0.05);
  for (const J of jets) {
    const a = J.ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const tu = J.speed * ca, tv = J.speed * sa, hw = J.width / 2, L = J.len;
    const R = Math.ceil((Math.max(hw, L) + .2) / DX);
    const ic = Math.round(J.x / DX), jc = Math.round(J.y / DX);
    for (let j = Math.max(0, jc - R); j <= Math.min(H, jc + R); j++)
      for (let i = Math.max(0, ic - R); i <= Math.min(W, ic + R); i++) {
        // u face at (i, j+.5), v face at (i+.5, j)
        if (j < H) {
          const k = j * NU1 + i;
          if (bu[k] === 1) { const dx = i * DX - J.x, dy = (j + .5) * DX - J.y, al = dx * ca + dy * sa, cr = -dx * sa + dy * ca;
            if (al >= 0 && al <= L && Math.abs(cr) <= hw) u[k] += (tu - u[k]) * r * J.k; }
        }
        if (i < W) {
          const k = j * NV + i;
          if (bv[k] === 1) { const dx = (i + .5) * DX - J.x, dy = j * DX - J.y, al = dx * ca + dy * sa, cr = -dx * sa + dy * ca;
            if (al >= 0 && al <= L && Math.abs(cr) <= hw) v[k] += (tv - v[k]) * r * J.k; }
        }
      }
  }
}

// ---------- one flow step ----------
function flowStep(jets, dt = DT) {
  force(jets, dt);
  // advect (semi-Lagrangian, RK2 back-trace), then diffuse + drag
  const h = dt / DX;
  for (let j = 0; j < H; j++) for (let i = 0; i <= W; i++) {
    const k = j * NU1 + i; if (!bu[k]) { u2[k] = 0; continue; }
    const x = i, y = j + .5, uu = u[k], vv = sampleV(x, y);
    const mx = x - .5 * h * uu, my = y - .5 * h * vv;
    u2[k] = sampleU(x - h * sampleU(mx, my), y - h * sampleV(mx, my));
  }
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) {
    const k = j * NV + i; if (!bv[k]) { v2[k] = 0; continue; }
    const x = i + .5, y = j, uu = sampleU(x, y), vv = v[k];
    const mx = x - .5 * h * uu, my = y - .5 * h * vv;
    v2[k] = sampleV(x - h * sampleU(mx, my), y - h * sampleV(mx, my));
  }
  const nd = NU * dt / (DX * DX), dr = 1 / (1 + FRIC * dt);
  for (let j = 0; j < H; j++) for (let i = 0; i <= W; i++) {
    const k = j * NU1 + i; if (!bu[k]) { u[k] = 0; continue; }
    if (bu[k] < 1) { u[k] = 0; continue; }       // closed door: only the pressure pushes air through
    const l = (i > 0 ? u2[k - 1] : 0) + (i < W ? u2[k + 1] : 0) + (j > 0 ? u2[k - NU1] : 0) + (j < H - 1 ? u2[k + NU1] : 0) - 4 * u2[k];
    u[k] = (u2[k] + nd * l) * dr;
  }
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) {
    const k = j * NV + i; if (!bv[k]) { v[k] = 0; continue; }
    if (bv[k] < 1) { v[k] = 0; continue; }
    const l = (i > 0 ? v2[k - 1] : 0) + (i < W - 1 ? v2[k + 1] : 0) + (j > 0 ? v2[k - NV] : 0) + (j < H ? v2[k + NV] : 0) - 4 * v2[k];
    v[k] = (v2[k] + nd * l) * dr;
  }
  project();
}

// make the flow divergence-free except at sources: Σ_faces β(ψn − ψc) = div − s
const zsum = new Float64Array(64), zcnt = new Float64Array(64);
function project(iters = SOR_IT) {
  const sc = 1 / (HCEIL * DX);
  zsum.fill(0); zcnt.fill(0);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = j * W + i; if (!isFluid(c)) { rhs[c] = 0; continue; }
    const d = u[j * NU1 + i + 1] - u[j * NU1 + i] + v[(j + 1) * NV + i] - v[j * NV + i] - src[c] * sc;
    rhs[c] = d; const z = zoneOf[c]; zsum[z] += d; zcnt[z]++;
  }
  // remove the tiny imbalance left by the bisection so the equations have a solution
  for (let c = 0; c < W * H; c++) if (isFluid(c)) rhs[c] -= zsum[zoneOf[c]] / zcnt[zoneOf[c]];
  for (let it = 0; it < iters; it++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = j * W + i; if (!isFluid(c)) continue;
      const be = bu[j * NU1 + i + 1], bw = bu[j * NU1 + i], bs = bv[(j + 1) * NV + i], bn = bv[j * NV + i];
      const sb = be + bw + bs + bn; if (!sb) continue;
      const s = be * psi[c + 1] + bw * psi[c - 1] + bs * psi[c + W] + bn * psi[c - W];
      psi[c] += SOR_W * ((s - rhs[c]) / sb - psi[c]);
    }
  }
  for (let j = 0; j < H; j++) for (let i = 1; i < W; i++) { const k = j * NU1 + i; if (bu[k]) u[k] -= bu[k] * (psi[j * W + i] - psi[j * W + i - 1]); }
  for (let j = 1; j < H; j++) for (let i = 0; i < W; i++) { const k = j * NV + i; if (bv[k]) v[k] -= bv[k] * (psi[j * W + i] - psi[(j - 1) * W + i]); }
}
// largest remaining divergence (m/s), for checking
function maxDiv() {
  const sc = 1 / (HCEIL * DX); let m = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = j * W + i; if (!isFluid(c)) continue;
    m = Math.max(m, Math.abs(u[j * NU1 + i + 1] - u[j * NU1 + i] + v[(j + 1) * NV + i] - v[j * NV + i] - src[c] * sc));
  }
  return m;
}


// ---------- transport of age and smoke: finite volume, upwind, implicit Euler ----------
// per cell (all terms divided by DX, so velocities are in m/s):
//   (DX/Δt)(a − a_old) + Σ_out u·a − Σ_in u·a_n − q_in·a_in + q_out·a + x(a − a_in) + (D/DX)Σ(a − a_n) = DX·S
// a_in = 0 for outdoor air. S = 1 s/s for age (air gets one second older every second), 0 for smoke.
// The linear system is solved with BiCGSTAB (Jacobi preconditioner), warm-started from the old field.
let FL = null, NFL = 0;                          // indices of fluid cells
const dg = new Float64Array(W * H), cE = new Float64Array(W * H), cWc = new Float64Array(W * H), cS = new Float64Array(W * H), cN = new Float64Array(W * H);
const tb = new Float64Array(W * H), tr = new Float64Array(W * H), tr0 = new Float64Array(W * H), tp = new Float64Array(W * H),
  tv = new Float64Array(W * H), ts = new Float64Array(W * H), tt = new Float64Array(W * H), ty = new Float64Array(W * H), tz = new Float64Array(W * H), tx = new Float64Array(W * H);
function fluidList() { const l = []; for (let c = 0; c < W * H; c++) if (isFluid(c)) l.push(c); FL = Int32Array.from(l); NFL = FL.length; }
// coefficients of the current flow (shared by age and smoke); inv = DX/Δt (0 = steady)
function buildCoef(inv) {
  if (!FL) fluidList();
  const sc = 1 / (HCEIL * DX), dd = DIFF / DX;
  for (let q = 0; q < NFL; q++) {
    const c = FL[q], i = c % W, j = (c / W) | 0;
    const ue = u[j * NU1 + i + 1], uw = u[j * NU1 + i], vs = v[(j + 1) * NV + i], vn = v[j * NV + i];
    const be = bu[j * NU1 + i + 1], bw = bu[j * NU1 + i], bs = bv[(j + 1) * NV + i], bn = bv[j * NV + i];
    // inflow brings age-0 air (adds nothing; the faces carry it on), outflow and exchange take this cell's air
    let d = inv + (src[c] < 0 ? -src[c] * sc : 0) + exch[c] * sc;
    let e = dd * be, w = dd * bw, s = dd * bs, n = dd * bn;
    d += e + w + s + n;
    if (ue > 0) d += ue; else e -= ue;
    if (uw < 0) d -= uw; else w += uw;
    if (vs > 0) d += vs; else s -= vs;
    if (vn < 0) d -= vn; else n += vn;
    dg[c] = d; cE[c] = e; cWc[c] = w; cS[c] = s; cN[c] = n;
  }
}
function matvec(x, y) {
  for (let q = 0; q < NFL; q++) { const c = FL[q]; y[c] = dg[c] * x[c] - cE[c] * x[c + 1] - cWc[c] * x[c - 1] - cS[c] * x[c + W] - cN[c] * x[c - W]; }
}
function dot(a, b) { let s = 0; for (let q = 0; q < NFL; q++) { const c = FL[q]; s += a[c] * b[c]; } return s; }
// solve A·a = inv·a_old + DX·S in place (BiCGSTAB, Jacobi preconditioner). returns iterations used
function transport(a, inv, S, maxIt, cap, tol = 1e-6) {
  for (let q = 0; q < NFL; q++) { const c = FL[q]; tb[c] = inv * a[c] + DX * S; tx[c] = a[c]; }
  matvec(tx, tt);
  for (let q = 0; q < NFL; q++) { const c = FL[q]; tr[c] = tb[c] - tt[c]; tr0[c] = tr[c]; tp[c] = 0; tv[c] = 0; }
  const bn = Math.sqrt(dot(tb, tb)) || 1;
  let rho = 1, al = 1, om = 1, it = 0;
  for (; it < maxIt; it++) {
    if (Math.sqrt(dot(tr, tr)) / bn < tol) break;
    const rn = dot(tr0, tr); if (rn === 0) break;
    const be = rn / rho * al / om; rho = rn;
    for (let q = 0; q < NFL; q++) { const c = FL[q]; tp[c] = tr[c] + be * (tp[c] - om * tv[c]); ty[c] = tp[c] / dg[c]; }
    matvec(ty, tv);
    al = rho / dot(tr0, tv);
    for (let q = 0; q < NFL; q++) { const c = FL[q]; ts[c] = tr[c] - al * tv[c]; tz[c] = ts[c] / dg[c]; }
    matvec(tz, tt);
    const tt2 = dot(tt, tt); om = tt2 ? dot(tt, ts) / tt2 : 0;
    for (let q = 0; q < NFL; q++) { const c = FL[q]; tx[c] += al * ty[c] + om * tz[c]; tr[c] = ts[c] - om * tt[c]; }
    if (!om) { it++; break; }
  }
  for (let q = 0; q < NFL; q++) { const c = FL[q]; let x = tx[c]; if (!(x >= 0)) x = 0; else if (x > cap) x = cap; a[c] = x; }
  return it;
}
