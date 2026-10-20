// ビッグバンから惑星まで — 粒の流体（SPH）＋重力の GPU 計算（WGSL）。場面⑤（岩と鉄）と場面③（ガス）で使う
// 近くの粒さがしはせず、重力と同じく全部の組を調べる（数万個までなら GPU で間に合う。距離がカーネルの外の組は SPH を飛ばす）
// 式: Monaghan (1992) の SPH（密度は足し合わせ、人工粘性 α・β、3次スプライン）。状態方程式は mode で切りかえ
//   mode 0: Tillotson（岩・鉄。物質ごとの値は P.mt）、mode 1: 濃さで決まるガス（等温 → 濃いと断熱。Bate ほか 2003 の形）
export const sphWGSL = /* wgsl */`
struct Pt { p: vec4f, v: vec4f, a: vec4f, q: vec4f };   // p: 位置・重さ ／ v: 速さ・h（カーネルの届く距離）／ a: 加速度・du/dt ／ q: u（比エネルギー）・密度・物質・圧力
struct Params {
  n: u32, nTiles: u32, mode: u32, _a: u32,
  sim: vec4f,     // dt, G, ゆるめ（毎歩かける速さの割合。1 で ふつう。1 より小さい間は熱を変えない）, h のいちばん大きい値
  gas: vec4f,     // mode 1: 音速², 断熱になる密度, γ, _
  fin: vec4f,     // 指: 位置 x, y・速さ x, y
  fin2: vec4f,    // 指: 半径, 1/τ, ふれているか, _
  mt: array<vec4f, 6>,   // mode 0: 物質 0（鉄）・1（岩）の Tillotson: [ρ0, a, b, A] [B, u0, us, us2] [α, β, cv, _]
};
@group(0) @binding(0) var<storage, read_write> X: array<Pt>;
@group(0) @binding(1) var<uniform> P: Params;
@group(0) @binding(2) var<storage, read_write> aux: array<vec4f>;   // h, 音速, P/ρ², 密度（重さの計算の組で読む）
@group(0) @binding(4) var<storage, read_write> DTM: array<atomic<u32>, 1>;   // つぎの歩の時間の候補（いちばん小さいもの。f32 のビット）
@group(0) @binding(5) var<storage, read_write> TS: array<f32, 4>;   // いまの dt・すぎた時間・dt の上限・クーラン数
fn dtNow() -> f32 { return TS[0]; }

const PI = 3.14159265;
const WG = 64u;
fn kW(r: f32, h: f32) -> f32 {   // 3次スプライン（届く距離 h）
  let q = r / h; let s = 8.0 / (PI * h * h * h);
  if (q < 0.5) { return s * (1.0 - 6.0 * q * q + 6.0 * q * q * q); }
  if (q < 1.0) { let t = 1.0 - q; return s * 2.0 * t * t * t; }
  return 0.0;
}
fn kdW(r: f32, h: f32) -> f32 {  // dW/dr
  let q = r / h; let s = 8.0 / (PI * h * h * h * h);
  if (q < 0.5) { return s * (-12.0 * q + 18.0 * q * q); }
  if (q < 1.0) { let t = 1.0 - q; return s * -6.0 * t * t; }
  return 0.0;
}
// Tillotson（Melosh 1989 の形）。圧力は 0 より下げない（引っぱりの強さは入れない）
fn tillotson(rho: f32, u: f32, m: u32) -> vec2f {
  let A0 = P.mt[m * 3u]; let A1 = P.mt[m * 3u + 1u]; let A2 = P.mt[m * 3u + 2u];
  let rho0 = A0.x; let a = A0.y; let b = A0.z; let A = A0.w; let B = A1.x; let u0 = A1.y; let us = A1.z; let us2 = A1.w; let al = A2.x; let be = A2.y;
  let eta = rho / rho0; let mu = eta - 1.0; let w = u / (u0 * eta * eta) + 1.0;
  let pc = (a + b / w) * rho * u + A * mu + B * mu * mu;
  var p = pc;
  if (rho < rho0 && u > us) {
    let z = rho0 / rho - 1.0;
    let pe = a * rho * u + (b * rho * u / w + A * mu * exp(-be * z)) * exp(-al * z * z);
    if (u >= us2) { p = pe; } else { p = ((u - us) * pe + (us2 - u) * pc) / (us2 - us); }
  }
  p = max(p, 0.0);
  let c2 = A / rho0 * max(0.3, 1.0 + 2.0 * max(mu, 0.0) * B / A) + (a + b) * max(u, 0.0);   // 音速²（目安。粘性と時間の刻みに使う）
  return vec2f(p, sqrt(c2));
}
fn gasEOS(rho: f32) -> vec2f {
  let c2 = P.gas.x * (1.0 + pow(rho / P.gas.y, P.gas.z - 1.0));
  return vec2f(rho * c2, sqrt(c2));
}

// 1) 密度・圧力・音速、h を密度から（近くに約50個）
var<workgroup> tp: array<vec4f, WG>;
var<workgroup> th: array<vec4f, WG>;
@compute @workgroup_size(64) fn density(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_index) li: u32) {
  let i = g.x;
  var pi = vec4f(0.0); var hi = 0.0; var sink = false;
  if (i < P.n) { pi = X[i].p; hi = X[i].v.w; sink = X[i].q.z > 1.5; }
  let alive = i < P.n && pi.w > 0.0;
  var rho = 0.0;
  for (var t = 0u; t < P.nTiles; t++) {
    let j = t * WG + li;
    if (j < P.n) { tp[li] = X[j].p; th[li] = vec4f(X[j].v.w, X[j].q.z, 0.0, 0.0); } else { tp[li] = vec4f(0.0); th[li] = vec4f(0.0); }
    workgroupBarrier();
    if (alive && !sink) {
      for (var k = 0u; k < WG; k++) {
        let pj = tp[k];
        if (pj.w > 0.0 && th[k].y < 1.5) { let hij = 0.5 * (hi + th[k].x); let r = length(pj.xyz - pi.xyz); if (r < hij) { rho += pj.w * kW(r, hij); } }
      }
    }
    workgroupBarrier();
  }
  if (alive && sink) { aux[i] = vec4f(P.fin2.w, 0.0, 0.0, -1.0); }   // 星の種: 届く距離 = 取りこむ半径、密度 -1 を目印に（圧力の力はなし）
  if (alive && !sink) {
    let q = X[i].q;
    var pc = vec2f(0.0);
    if (P.mode == 0u) { pc = tillotson(rho, q.x, u32(q.z)); } else { pc = gasEOS(rho); }
    X[i].q = vec4f(q.x, rho, q.z, pc.x);
    let hn = min(P.sim.w, clamp(2.3 * pow(pi.w / rho, 1.0 / 3.0), 0.8 * hi, 1.25 * hi));   // 近くに約50個入る大きさへ（1歩で変えすぎない）。X の h は kick2 で入れかえる（ほかの粒が読んでいる最中なので）
    aux[i] = vec4f(hn, pc.y, pc.x / (rho * rho), rho);
  }
}

// 2) 力: 重力（やわらげ = h の半分）＋圧力＋人工粘性、du/dt
var<workgroup> tv: array<vec4f, WG>;
var<workgroup> ta: array<vec4f, WG>;
@compute @workgroup_size(64) fn force(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_index) li: u32) {
  let i = g.x;
  var pi = vec4f(0.0); var vi = vec4f(0.0); var ai = vec4f(0.0);
  if (i < P.n) { pi = X[i].p; vi = X[i].v; ai = aux[i]; }
  let alive = i < P.n && pi.w > 0.0;
  var acc = vec3f(0.0); var du = 0.0; var top = true; var nearSink = false;
  for (var t = 0u; t < P.nTiles; t++) {
    let j = t * WG + li;
    if (j < P.n) { tp[li] = X[j].p; tv[li] = X[j].v; ta[li] = aux[j]; } else { tp[li] = vec4f(0.0); tv[li] = vec4f(0.0); ta[li] = vec4f(1.0); }
    workgroupBarrier();
    if (alive) {
      for (var k = 0u; k < WG; k++) {
        let pj = tp[k];
        let jj = t * WG + k;
        if (pj.w > 0.0 && jj != i) {
          let d = pi.xyz - pj.xyz; let r2 = dot(d, d); let r = sqrt(r2);
          let hij = 0.5 * (ai.x + ta[k].x);
          let e2 = 0.25 * hij * hij;
          let inv = inverseSqrt(r2 + e2);
          acc -= d * (P.sim.y * pj.w * inv * inv * inv);
          if (ta[k].w < 0.0 && r < 2.0 * P.fin2.w) { nearSink = true; }
          if (r < hij && ta[k].w > ai.w) { top = false; }
          if (r < hij && r > 0.0 && ai.w > 0.0 && ta[k].w > 0.0) {
            let dv = vi.xyz - tv[k].xyz; let vr = dot(dv, d);
            var pi_ij = 0.0;
            if (vr < 0.0) {
              let mu = hij * vr / (r2 + 0.01 * hij * hij);
              let cm = 0.5 * (ai.y + ta[k].y); let rm = 0.5 * (ai.w + ta[k].w);
              pi_ij = (-1.0 * cm * mu + 2.0 * mu * mu) / rm;
            }
            let f = pj.w * (ai.z + ta[k].z + pi_ij) * kdW(r, hij) / r;
            acc -= d * f;
            du += 0.5 * f * vr;
          }
        }
      }
    }
    workgroupBarrier();
  }
  if (alive) {
    X[i].a = vec4f(acc, du);
    // 時間の刻みの候補: 音と動きが h を渡る時間、加速度で h だけ動く時間（いちばん小さいものを集める）
    let cand = min(ai.x / (ai.y + length(vi.xyz) + 1e-6), sqrt(ai.x / (length(acc) + 1e-9)));
    atomicMin(&DTM[0], bitcast<u32>(cand));
    // mode 1: 星の種になる印（いちばん濃い・決めた密度より濃い・近くに種がない）。q.w は mode 1 では使っていない
    if (P.mode == 1u && ai.w > 0.0) { X[i].q.w = select(0.0, 1.0, top && !nearSink && ai.w > P.gas.w); }
  }
}

// 7) 時計: つぎの歩の dt を決め、すぎた時間を足す（1つだけ動かす）
@compute @workgroup_size(1) fn clock() {
  TS[1] += TS[0];
  let c = bitcast<f32>(atomicLoad(&DTM[0]));
  TS[0] = min(TS[2], TS[3] * c);
  atomicStore(&DTM[0], 0x7f7fffffu);
}
// mode 1: 星の種が、取りこむ半径の中のガスを取りこむ（5) どの種に入るか決める → 6) 種ごとに足す）
@group(0) @binding(3) var<storage, read_write> claim: array<i32>;
@compute @workgroup_size(64) fn claimK(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_index) li: u32) {
  let i = g.x;
  var pi = vec4f(0.0); var gas = false;
  if (i < P.n) { pi = X[i].p; gas = pi.w > 0.0 && X[i].q.z < 1.5; }
  var best = -1; var bd = P.fin2.w;
  for (var t = 0u; t < P.nTiles; t++) {
    let j = t * WG + li;
    if (j < P.n) { tp[li] = X[j].p; th[li] = vec4f(X[j].q.z); } else { tp[li] = vec4f(0.0); th[li] = vec4f(0.0); }
    workgroupBarrier();
    if (gas) { for (var k = 0u; k < WG; k++) { if (tp[k].w > 0.0 && th[k].x > 1.5) { let r = length(tp[k].xyz - pi.xyz); if (r < bd) { bd = r; best = i32(t * WG + k); } } } }
    workgroupBarrier();
  }
  if (i < P.n) { claim[i] = best; }
}
@compute @workgroup_size(64) fn eat(@builtin(global_invocation_id) g: vec3u) {
  let j = g.x;
  if (j >= P.n) { return; }
  var s = X[j];
  if (s.p.w <= 0.0 || s.q.z < 1.5) { return; }
  var m = s.p.w; var mv = s.v.xyz * m; var mx = s.p.xyz * m;
  for (var i = 0u; i < P.n; i++) {
    if (claim[i] == i32(j)) { let x = X[i]; m += x.p.w; mv += x.v.xyz * x.p.w; mx += x.p.xyz * x.p.w; X[i].p.w = 0.0; }
  }
  X[j].p = vec4f(mx / m, m); X[j].v = vec4f(mv / m, s.v.w);
}

// 3) 前半: 半分けり（＋指）→ 進む ／ 4) 後半: 半分けり
@compute @workgroup_size(256) fn kick1(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= P.n) { return; }
  var x = X[i];
  if (x.p.w <= 0.0) { return; }
  let dt = dtNow();
  var v = (x.v.xyz + x.a.xyz * (0.5 * dt)) * P.sim.z;
  if (P.fin2.z > 0.5) {
    let d = x.p.xy - P.fin.xy; let rr = dot(d, d) / (P.fin2.x * P.fin2.x);
    if (rr < 1.0) { let w = (1.0 - rr) * (1.0 - rr); v = vec3f(v.xy + (P.fin.zw - v.xy) * min(1.0, w * P.fin2.y * dt), v.z); }
  }
  var u = max(0.0, x.q.x + x.a.w * 0.5 * dt);
  if (P.sim.z < 1.0) { u = x.q.x; }   // 落ち着かせている間は熱を変えない（縮むときの熱で、ぶつかる前から熱くならないよう）
  X[i].v = vec4f(v, x.v.w);
  X[i].p = vec4f(x.p.xyz + v * dt, x.p.w);
  X[i].q.x = u;
}
@compute @workgroup_size(256) fn kick2(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= P.n) { return; }
  let x = X[i];
  if (x.p.w <= 0.0) { return; }
  let dt = dtNow();
  X[i].v = vec4f((x.v.xyz + x.a.xyz * (0.5 * dt)) * P.sim.z, aux[i].x);
  if (P.sim.z >= 1.0) { X[i].q.x = max(0.0, x.q.x + x.a.w * 0.5 * dt); }
  if (P.mode == 1u && x.q.z < 1.5 && x.q.w > 0.5) { X[i].q.z = 2.0; X[i].v.w = P.fin2.w; }   // 星の種になる
}
`;

// 描画: 粒を丸い点で（色は物質と温度。断面のときは |z| が小さい粒だけ）
export const sphRenderWGSL = /* wgsl */`
struct Pt { p: vec4f, v: vec4f, a: vec4f, q: vec4f };
struct View { sc: vec4f, px: vec4f, opt: vec4f, cv: vec4f };   // sc: スケール x, y・中心 x, y ／ px: 1px→クリップ x, y・粒の大きさ px・最小 px ／ opt: 断面の厚さ（0 で全部）・温度の単位→K・場面（0 岩と鉄・1 ガス）・ガスの基準密度 ／ cv: 物質 0, 1 の比熱
@group(0) @binding(0) var<storage, read> X: array<Pt>;
@group(0) @binding(1) var<uniform> V: View;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let x = X[ii];
  if (x.p.w <= 0.0 || (V.opt.x > 0.0 && abs(x.p.z) > V.opt.x)) { o.pos = vec4f(2.0, 2.0, 0.0, 1.0); return o; }
  var corners = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = corners[vi];
  var col = vec4f(1.0); var gasSz = -1.0;
  if (V.opt.z < 0.5) {
    let m = u32(x.q.z); let T = x.q.x * V.opt.y / select(V.cv.y, V.cv.x, m == 0u);
    var base = vec3f(0.78, 0.55, 0.36); if (m == 0u) { base = vec3f(0.55, 0.62, 0.75); }
    let hot = clamp((T - 3000.0) / 9000.0, 0.0, 1.0);   // 3000 K から 1万2千 K で黄色へ
    col = vec4f(mix(base, vec3f(1.0, 0.85, 0.55), hot), 0.9);
  } else if (x.q.z > 1.5) {
    // 星の種: 太陽の 0.08 倍より重いと光る星（白〜黄）、軽いと褐色矮星（赤茶）。重さは太陽 = 1 の単位
    let star = x.p.w >= 0.08;
    col = select(vec4f(0.75, 0.32, 0.2, 1.0), vec4f(1.0, 0.93, 0.7, 1.0), star);
    let s2 = (3.0 + 7.0 * sqrt(min(x.p.w, 3.0))) * select(1.0, 1.6, star);
    o.pos = vec4f((x.p.xy - V.sc.zw) * V.sc.xy + c * s2 * V.px.xy, 0.0, 1.0); o.uv = c; o.col = col;
    return o;
  } else {
    gasSz = clamp(V.px.z * pow(x.p.w / max(x.q.y, 1e-12), 1.0 / 3.0), V.px.w, 7.0);   // ガス: 粒どうしの間かくくらいの大きさ（濃いほど小さく）
    let k = clamp(log(x.q.y / V.opt.w) / 9.0, 0.0, 1.0);   // ガス: 濃いほど明るく
    col = vec4f(mix(vec3f(0.35, 0.45, 0.75), vec3f(1.0, 0.85, 0.6), k), 0.25 + 0.6 * k);
  }
  var sz = max(V.px.w, V.px.z); if (gasSz > 0.0) { sz = gasSz; }   // 見た目の大きさは粒の重さから決めた一定の大きさ（h はうすい所で大きくなるので使わない）
  o.pos = vec4f((x.p.xy - V.sc.zw) * V.sc.xy + c * sz * V.px.xy, 0.0, 1.0);
  o.uv = c; o.col = col;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let r = length(i.uv);
  if (r > 1.0) { discard; }
  let a = i.col.a * (1.0 - smoothstep(0.6, 1.0, r));
  return vec4f(i.col.rgb * a, a);
}
`;
