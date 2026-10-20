// ビッグバンから惑星まで — GPU の計算と描画（WGSL）。式は physics.js と同じ（そちらを先に直してからこちらへ）
import { G, DT, EPS2, R_SUN_EAT, R_LOST, CSTAR, MUBAR, RHO1, RHO, MAX_FRAG, CP, T_MELT, L_MELT, T_VAP, L_VAP, ETA_KE, KAPPA, SB, AL_H0, AL_TAU, MSUN, AU, YR, V2SI } from './physics.js';

const f = x => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };
// 温度（physics.js の tempOfE と同じ）
const e1 = CP * T_MELT, e2 = e1 + L_MELT, e3 = e2 + CP * (T_VAP - T_MELT), e4 = e3 + L_VAP;
const tempWGSL = `fn tempOfE(e: f32) -> f32 {
  if (e < ${f(e1)}) { return e / ${f(CP)}; }
  if (e < ${f(e2)}) { return ${f(T_MELT)}; }
  if (e < ${f(e3)}) { return ${f(T_MELT)} + (e - ${f(e2)}) / ${f(CP)}; }
  if (e < ${f(e4)}) { return ${f(T_VAP)}; }
  return ${f(T_VAP)} + (e - ${f(e4)}) / ${f(CP)};
}`;

const common = /* wgsl */`
struct Body { p: vec4f, v: vec4f, a: vec4f, e: vec4f };   // p.w = 重さ（0 で空き）・v.w = 半径（AU）・a.w = 岩どうしの位置エネルギー・e.x = 比エネルギー J/kg
struct Params {
  n: u32, nTiles: u32, _a: u32, _b: u32,
  sim: vec4f,    // dt, G, eps², F（ぶつかる大きさの倍率）
  k: vec4f,      // mMin（かけらのいちばん小さい重さ）, 仕事の目盛り, 熱の目盛り, ぶつかりを調べる距離²
  fin: vec4f,    // 指の位置 x, y、指の速さ ux, uy（AU/年）
  fin2: vec4f,   // 指の半径, 1/τ, 指がふれているか, _
  th: vec4f,     // このコマで進んだ年, いまの年, _, _
};
@group(0) @binding(0) var<storage, read_write> B: array<Body>;
@group(0) @binding(1) var<uniform> P: Params;
@group(0) @binding(2) var<storage, read_write> partner: array<i32>;
@group(0) @binding(3) var<storage, read_write> C: array<atomic<i32>, 16>;   // 数え: 0 ちり・1 太陽へ・2 とび出し・3 ぶつかり・4 くっつき・5 砕け・6/7 指の仕事 +/−・8 熱・9 空きの数・15 歩の通し番号
@group(0) @binding(4) var<storage, read_write> freeList: array<u32>;

const PI = 3.14159265;
const WG = 64u;
const MSUN = ${f(MSUN)}; const AUM = ${f(AU)}; const YRS = ${f(YR)}; const V2SI = ${f(V2SI)};
const RHO = ${f(RHO)}; const RHO1 = ${f(RHO1)}; const CSTAR = ${f(CSTAR)}; const MUBAR = ${f(MUBAR)};
const GSI = 6.674e-11; const MAXF = ${MAX_FRAG}u; const SUN_EAT = ${f(R_SUN_EAT)}; const LOST = ${f(R_LOST)};

fn hash(x0: u32) -> u32 {
  var x = (x0 ^ 61u) ^ (x0 >> 16u); x = x * 9u; x = x ^ (x >> 4u); x = x * 0x27d4eb2du; x = x ^ (x >> 15u); return x;
}
fn rnd(x: u32) -> f32 { return f32(hash(x)) / 4294967296.0; }
fn radiusAU(m: f32) -> f32 { return pow(3.0 * m * MSUN / (4.0 * PI * RHO), 1.0 / 3.0) / AUM; }
${tempWGSL}

fn eOfTemp(t: f32) -> f32 { if (t <= ${f(T_MELT)}) { return ${f(CP)} * t; } return ${f(CP)} * t + ${f(L_MELT)}; }
fn tEq(r: f32) -> f32 { return 278.0 / sqrt(max(r, 0.05)); }
`;

export const computeWGSL = common + /* wgsl */`
// 前半: 半分だけ速さを変え（指の力もここ）、1歩すすむ
@compute @workgroup_size(256) fn kick1(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i == 0u) { atomicAdd(&C[15], 1); }
  if (i >= P.n) { return; }
  let b = B[i];
  if (b.p.w <= 0.0) { return; }
  let dt = P.sim.x;
  var v = b.v.xyz + b.a.xyz * (0.5 * dt);
  if (P.fin2.z > 0.5) {
    let d = b.p.xy - P.fin.xy;
    let rr = dot(d, d) / (P.fin2.x * P.fin2.x);
    if (rr < 1.0) {
      let w = (1.0 - rr) * (1.0 - rr);
      // 指は「その場所を円くまわる速さ」でいっしょにまわっていて、そこからの指の動きを足す
      let rxy = max(0.05, length(b.p.xy));
      let vcirc = sqrt(P.sim.y / rxy) * vec2f(-b.p.y, b.p.x) / rxy;
      let dv = (vcirc + P.fin.zw - v.xy) * min(1.0, w * P.fin2.y * dt);
      let dW = b.p.w * dot(v.xy + 0.5 * dv, dv);          // 指がした仕事 = 動きのエネルギーの増え
      v = vec3f(v.xy + dv, v.z);
      let q = i32(round(dW * P.k.y));
      if (q > 0) { atomicAdd(&C[6], q); } else if (q < 0) { atomicAdd(&C[7], -q); }
    }
  }
  let p = b.p.xyz + v * dt;
  let r = length(p);
  if (r < SUN_EAT) { atomicAdd(&C[1], i32(b.p.w * 1e15)); B[i].p = vec4f(p, 0.0); return; }
  if (r > LOST) { atomicAdd(&C[2], i32(b.p.w * 1e15)); B[i].p = vec4f(p, 0.0); return; }
  B[i].p = vec4f(p, b.p.w);
  B[i].v = vec4f(v, b.v.w);
}

// 重力: ぜんぶの組を足す（64 個ずつ共有メモリに読む。粒が少なくても GPU 全体が働くよう小さめ）。同じ回り道で、この1歩のあいだにいちばん近づいた相手（ぶつかり）もさがす
var<workgroup> tp: array<vec4f, WG>;
var<workgroup> tv: array<vec4f, WG>;
@compute @workgroup_size(64) fn force(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_index) li: u32) {
  let i = g.x;
  var pi = vec4f(0.0); var vi = vec4f(0.0);
  if (i < P.n) { pi = B[i].p; vi = B[i].v; }
  let alive = i < P.n && pi.w > 0.0;
  var acc = vec3f(0.0); var pot = 0.0; var best = -1; var bestQ = 1.0;
  let dt = P.sim.x; let eps2 = P.sim.z; let F = P.sim.w;
  for (var t = 0u; t < P.nTiles; t++) {
    let j0 = t * WG + li;
    if (j0 < P.n) { tp[li] = B[j0].p; tv[li] = B[j0].v; } else { tp[li] = vec4f(0.0); tv[li] = vec4f(0.0); }
    workgroupBarrier();
    if (alive) {
      for (var k = 0u; k < WG; k++) {
        let pj = tp[k];
        let j = t * WG + k;
        if (pj.w > 0.0 && j != i) {
          let d = pj.xyz - pi.xyz;
          let r2 = dot(d, d) + eps2;
          let inv = inverseSqrt(r2);
          acc += d * (pj.w * inv * inv * inv);
          pot -= pj.w * inv;
          if (r2 < P.k.w) {          // 1歩で届かないほど遠い組は、ぶつかりを調べない
            let w = tv[k].xyz - vi.xyz;
            let rc = F * (tv[k].w + vi.w);
            let ww = dot(w, w);
            var s = 0.0;
            if (ww > 0.0) { s = clamp(-dot(d, w) / ww, -dt, 0.0); }
            let dm = d + w * s;
            let q = dot(dm, dm) / (rc * rc);
            if (q < bestQ) { bestQ = q; best = i32(j); }
          }
        }
      }
    }
    workgroupBarrier();
  }
  if (i < P.n) {
    if (alive) {
      let r2 = dot(pi.xyz, pi.xyz) + eps2; let inv = inverseSqrt(r2);
      acc -= pi.xyz * (inv * inv * inv);
      B[i].a = vec4f(acc * P.sim.y, pot * P.sim.y);
    }
    partner[i] = best;
  }
}

@compute @workgroup_size(256) fn kick2(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= P.n) { return; }
  let b = B[i];
  if (b.p.w <= 0.0) { return; }
  B[i].v = vec4f(b.v.xyz + b.a.xyz * (0.5 * P.sim.x), b.v.w);
}

// ぶつかり（Leinhardt & Stewart 2012 の式28・23・5。正面として。おたがいに相手どうしの組だけ）
@compute @workgroup_size(256) fn collide(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= P.n) { return; }
  let jj = partner[i];
  if (jj < 0) { return; }
  let j = u32(jj);
  if (j <= i || j >= P.n) { return; }
  if (partner[j] != i32(i)) { return; }
  let b1 = B[i]; let b2 = B[j];
  if (b1.p.w <= 0.0 || b2.p.w <= 0.0) { return; }
  let Gc = P.sim.y; let F = P.sim.w;
  let m1 = b1.p.w; let m2 = b2.p.w; let M = m1 + m2; let mu = m1 * m2 / M;
  let pc = (b1.p.xyz * m1 + b2.p.xyz * m2) / M;
  let vc = (b1.v.xyz * m1 + b2.v.xyz * m2) / M;
  let w = b2.v.xyz - b1.v.xyz;
  let Rs = b1.v.w + b2.v.w;
  let vimp2 = dot(w, w) + 2.0 * Gc * M * (1.0 / Rs - 1.0 / (F * Rs));
  let vesc2 = 2.0 * Gc * M / Rs;
  let Eimp = 0.5 * mu * vimp2;
  let qr = Eimp / M * V2SI;
  var mlr = M; var frag = false;
  if (vimp2 > vesc2) {
    let gam = min(m1, m2) / max(m1, m2);
    let Rc1 = pow(3.0 * M * MSUN / (4.0 * PI * RHO1), 1.0 / 3.0);
    let q1 = CSTAR * 0.8 * PI * RHO1 * GSI * Rc1 * Rc1;
    let qs = q1 * pow(0.25 * (gam + 1.0) * (gam + 1.0) / gam, 2.0 / (3.0 * MUBAR) - 1.0);
    let x = qr / qs;
    if (x < 1.8) { mlr = M * (1.0 - 0.5 * x); } else { mlr = M * 0.1 * pow(1.8 / x, 1.5); }
    mlr = clamp(mlr, 0.0, M);
    frag = true;
  }
  atomicAdd(&C[3], 1);
  if (mlr < 0.9 * M) { atomicAdd(&C[5], 1); } else { atomicAdd(&C[4], 1); }   // 9割より多く残れば「くっつく（少し欠ける）」と数える
  let Rlr = radiusAU(mlr);
  let md = M - mlr;
  var nf = 0u; var heat = Eimp; var dust = 0.0;
  var mf = 0.0; var Rf = 0.0; var d = 0.0; var vej = 0.0;
  if (frag) {
    nf = min(MAXF, u32(floor(md / P.k.x)));
    nf = nf - nf % 2u;
    if (nf == 0u || mlr <= 0.0) { dust = md; nf = 0u; }
    else {
      mf = md / f32(nf); Rf = radiusAU(mf); d = 1.2 * F * (Rlr + 2.0 * Rf);
      let fall = 2.0 * Gc * mlr * (1.0 / (Rlr + Rf) - 1.0 / d);
      let KEmin = 0.5 * md * (1.44 * 2.0 * Gc * mlr / d + fall);
      let KEf = min(Eimp, max(KEmin, ${f(ETA_KE)} * Eimp));
      vej = sqrt(max(0.0, 2.0 * KEf / md - fall));
      heat = Eimp - KEf;
    }
  }
  let eNew = (m1 * b1.e.x + m2 * b2.e.x + heat * V2SI) / M;
  atomicAdd(&C[8], i32(min(2.0e9, heat * P.k.z)));
  if (dust > 0.0) { atomicAdd(&C[0], i32(dust * 1e15)); }
  B[i] = Body(vec4f(pc, mlr), vec4f(vc, Rlr), vec4f(b1.a.xyz, 0.0), vec4f(eNew, 0.0, b1.e.z, 0.0));
  B[j].p = vec4f(b2.p.xyz, 0.0);
  let key = u32(atomicLoad(&C[15])) * 2654435761u + i;
  // かけらは立方体の角の向きを、でたらめに回して置く（physics.js の rotOf と同じ）
  let ra = 2.0 * PI * rnd(key); let rb = acos(2.0 * rnd(key + 1u) - 1.0); let rc = 2.0 * PI * rnd(key + 2u);
  let s3 = 0.57735027;
  var cube = array<vec3f, 4>(vec3f(s3, s3, s3), vec3f(s3, s3, -s3), vec3f(s3, -s3, s3), vec3f(-s3, s3, s3));
  for (var k = 0u; k < nf; k += 2u) {
    let c0 = cube[k / 2u];
    let x1 = cos(rc) * c0.x - sin(rc) * c0.y; let y1 = sin(rc) * c0.x + cos(rc) * c0.y;
    let x2 = cos(rb) * x1 + sin(rb) * c0.z; let z2 = -sin(rb) * x1 + cos(rb) * c0.z;
    let dir = vec3f(cos(ra) * x2 - sin(ra) * y1, sin(ra) * x2 + cos(ra) * y1, z2);
    for (var s = 0u; s < 2u; s++) {
      let sg = select(-1.0, 1.0, s == 0u);
      var q = j;
      if (k > 0u || s > 0u) {
        let c = atomicSub(&C[9], 1);
        if (c <= 0) { atomicAdd(&C[9], 1); atomicAdd(&C[0], i32(mf * 1e15)); continue; }
        q = freeList[u32(c - 1)];
      }
      B[q] = Body(vec4f(pc + sg * dir * d, mf), vec4f(vc + sg * dir * vej, Rf), vec4f(0.0), vec4f(eNew, 0.0, f32(q), 0.0));
    }
  }
}

// 熱: 1コマに1回。とけている間は表面から光で、固まったら中から伝わる熱で冷える。アルミニウム26 の発熱
@compute @workgroup_size(256) fn heat(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= P.n) { return; }
  let b = B[i];
  if (b.p.w <= 0.0) { return; }
  var e = b.e.x; let r = length(b.p.xyz); let Te = tEq(r); let Rm = b.v.w * AUM;
  let h = ${f(AL_H0)} * exp(-P.th.y / ${f(AL_TAU)});
  let floor = eOfTemp(Te);
  var sec = P.th.x * YRS;
  // とても熱いと一気に冷えるので小分けに（physics.js の heatStep と同じ）
  for (var k = 0; k < 24 && sec > 0.0; k++) {
    let T = tempOfE(e);
    var rate = h;
    if (T > ${f(T_MELT)} - 1.0) { rate -= 3.0 * ${f(SB)} * (T * T * T * T - Te * Te * Te * Te) / (RHO * Rm); }
    else { let tau = Rm * Rm / (PI * PI * ${f(KAPPA)}); rate -= (e - floor) / tau; }
    var dt = sec;
    if (rate < 0.0 && e > floor) { dt = min(sec, 0.25 * (e - floor) / -rate); }
    var lo = 0.0;
    if (rate < 0.0) { lo = min(e, floor); }
    e = max(lo, e + rate * dt); sec -= dt;
  }
  B[i].e.x = e;
}

// 空きの一覧（かけらを置く場所）。コマのはじめに作りなおす
@compute @workgroup_size(1) fn freeReset() { atomicStore(&C[9], 0); }
@compute @workgroup_size(256) fn freePush(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= P.n) { return; }
  if (B[i].p.w <= 0.0) { let k = atomicAdd(&C[9], 1); freeList[u32(k)] = i; }
}
`;

// 描画: 岩1つを四角1枚で。色は温度、大きさは半径に比例（※ 目印: 実際よりずっと大きく描く）
export const renderWGSL = /* wgsl */`
struct Body { p: vec4f, v: vec4f, a: vec4f, e: vec4f };
struct View { sc: vec4f, px: vec4f, hi: vec4f };   // sc: AU→クリップ x, y, 中心 x, y ／ px: 1px→クリップ x, y, 基本の大きさ px, はじめの半径 ／ hi: 目立たせる番号, _, _, _
@group(0) @binding(0) var<storage, read> B: array<Body>;
@group(0) @binding(1) var<uniform> V: View;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec3f, @location(2) glow: f32 };
${tempWGSL}

fn tcol(T: f32) -> vec3f {
  let rock = vec3f(0.70, 0.75, 0.82); let warm = vec3f(0.80, 0.30, 0.16); let hot = vec3f(1.0, 0.58, 0.20); let white = vec3f(1.0, 0.95, 0.82);
  if (T < 500.0) { return rock; }
  if (T < 1500.0) { return mix(rock, warm, (T - 500.0) / 1000.0); }
  if (T < 2500.0) { return mix(warm, hot, (T - 1500.0) / 1000.0); }
  return mix(hot, white, clamp((T - 2500.0) / 1500.0, 0.0, 1.0));
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let b = B[ii];
  if (b.p.w <= 0.0) { o.pos = vec4f(2.0, 2.0, 0.0, 1.0); return o; }
  var corners = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = corners[vi];
  let T = tempOfE(b.e.x);
  let glow = clamp((T - 1200.0) / 1500.0, 0.0, 1.0);
  let sz = max(0.7, V.px.z * b.v.w / V.px.w) * (1.0 + 1.6 * glow);
  let ctr = (b.p.xy - V.sc.zw) * V.sc.xy;
  o.pos = vec4f(ctr + c * sz * V.px.xy, 0.0, 1.0);
  o.uv = c; o.col = tcol(T); o.glow = glow;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let r = length(i.uv);
  if (r > 1.0) { discard; }
  let core = 1.0 / (1.0 + 1.6 * i.glow);
  var a = 1.0 - smoothstep(core * 0.75, core, r);
  let halo = i.glow * 0.55 * pow(1.0 - r, 2.0);
  a = max(a, halo);
  return vec4f(i.col * a, a);
}
`;

export { G, DT, EPS2 };
