// 変化球のしくみ — 計算（描画なし。Node でも動く）
// 座標（PITCHf/x・Statcast と同じ向き）: 原点 ホームベースの先、x 捕手から見て右（一塁側）、y 投手の方へ、z 上。単位 m・s・kg。
'use strict';

const PHY = {
  m: 0.145,                         // ボールの重さ kg（5.125 オンス。規則 5〜5¼）
  r: 0.0369,                        // 半径 m（周り 9.125 インチ ÷ 2π）
  g: 9.80665,
  rho: 1.20,                        // 風洞（ナックルの係数）とふつうの空気の密度 kg/m³（20 ℃・海面くらい）
  plateY: 17 / 12 * 0.3048,         // ホームベースの前の端（y = 17 インチ）
  rubberY: 60.5 * 0.3048,           // 投手板（18.44 m）
  dt: 0.001,
  // Nathan の軌道計算機の係数（pybbda の移植で式の形を確認）
  cd0: 0.3008, cdspin: 0.0292,      // C_D = cd0 + cdspin × (回転数 / 1000 rpm)
  cl0: 0.583, cl1: 2.333, cl2: 1.120, // C_L = cl2 S / (cl0 + cl1 S)、S = r ω⊥ / v
  // ナックル: Watts & Sawyer 1975（4つの縫い目の向き）。横の力 ≈ F0 sin 4θ、65 mph で最大がボールの重さの約半分、v² に比例
  knuckleRefV: 65 * 0.44704,
};
PHY.A = Math.PI * PHY.r * PHY.r;
// 65 mph で ½ρA C v² = 0.5 mg となる C（風洞の空気の密度は論文に書かれていないので 1.20 とした）
PHY.ck0 = 0.5 * PHY.m * PHY.g / (0.5 * PHY.rho * PHY.A * PHY.knuckleRefV * PHY.knuckleRefV);

// 空気の密度（Nathan の軌道計算機と同じ式。pybbda の parameters.py で確認）
// tC 気温 ℃、elev 標高 m、pHpa 海面に直した気圧 hPa（天気予報の気圧）、rh 湿度 %
// ρ = 1.2929 × 273/(T+273) × (P·e^(−βh) − 0.3783 × RH × SVP / 100) / 760（P・SVP は mmHg、β = 1.217×10⁻⁴ /m）
function airDensity(tC, elev, pHpa, rh) {
  const pmm = pHpa * 0.750062;
  const svp = 4.5841 * Math.exp((18.687 - tC / 234.5) * tC / (257.14 + tC));   // 飽和水蒸気圧 mmHg
  return 1.2929 * (273 / (tC + 273)) * (pmm * Math.exp(-1.217e-4 * elev) - 0.3783 * rh * svp * 0.01) / 760;
}
// 空気と風。wind は地面に対する風の速度（m/s、x・y・z）
const STD_ENV = { rho: airDensity(20, 0, 1013.25, 50), wind: [0, 0, 0] };
PHY.env = { rho: STD_ENV.rho, wind: [0, 0, 0] };

const KMH = 1 / 3.6, MPH = 0.44704;
const RPM = 2 * Math.PI / 60;

// ---- ベクトル ----
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

const cdOf = rpm => PHY.cd0 + PHY.cdspin * (rpm / 1000);
const clOf = S => S <= 0 ? 0 : PHY.cl2 * S / (PHY.cl0 + PHY.cl1 * S);

// 投げ方 P から、放した瞬間の位置・速度・回転（角速度ベクトル）を作る
// P: { v0 km/h, vAng 上下の角度°（＋上）, hAng 左右の角度°（＋捕手から見て右）, x0, z0, ext（投手板から前へ m）,
//      rpm, dir 回転の向き（捕手から見た「手前の面が動く向き」の時計の角度°。0=12時、90=3時）, eff 使える回転の割合 0〜1,
//      knuckle 縫い目の力を入れるか, seam0 縫い目の向き θ0°, axisDeg ナックルの回転軸（捕手から見た時計の角度°） }
function launch(P, env = PHY.env) {
  const v0 = P.v0 * KMH;
  const va = P.vAng * Math.PI / 180, ha = P.hAng * Math.PI / 180;
  const vel = [v0 * Math.cos(va) * Math.sin(ha), -v0 * Math.cos(va) * Math.cos(ha), v0 * Math.sin(va)];
  const pos = [P.x0, PHY.rubberY - P.ext, P.z0];
  const vh = V.norm(vel);
  const w = P.rpm * RPM;
  let omega;
  if (P.knuckle) {
    // ナックル: 回転軸は捕手から見た向き（進む向きに直角）。ゆっくり回す
    const a = P.axisDeg * Math.PI / 180, ax = [Math.sin(a), 0, Math.cos(a)];
    omega = V.mul(V.norm(V.sub(ax, V.mul(vh, V.dot(ax, vh)))), w);
  } else {
    // 手前の面が動く向き d（捕手から見た時計）。ω⊥ = v̂ × d とすると ω⊥ × v̂ = d（マグヌス力は d の向き）
    const a = P.dir * Math.PI / 180, d0 = [Math.sin(a), 0, Math.cos(a)];
    const d = V.norm(V.sub(d0, V.mul(vh, V.dot(d0, vh))));
    const eff = Math.max(0, Math.min(1, P.eff));
    const wT = V.mul(V.cross(vh, d), w * eff);                 // 曲げる回転（進む向きに直角）
    const wG = V.mul(vh, w * Math.sqrt(1 - eff * eff));         // ジャイロ回転（進む向きと同じ向き）
    omega = V.add(wT, wG);
  }
  return { pos, vel, omega, rpm: P.rpm, knuckle: !!P.knuckle, seam0: (P.seam0 || 0) * Math.PI / 180, rho: env.rho, wind: env.wind.slice() };
}

// 力（N）を部分ごとに。opt: { air, magnus, seam } で入れる力を選ぶ（比べる道すじ用）
function forces(st, t, vel, opt) {
  const m = PHY.m, out = { grav: [0, 0, -m * PHY.g], drag: [0, 0, 0], magnus: [0, 0, 0], seam: [0, 0, 0], S: 0, cd: 0, cl: 0, ck: 0, theta: 0 };
  if (!opt.air) return out;
  // 空気の力は、空気に対する速さ（ボールの速度 − 風）で決まる
  const vr = V.sub(vel, st.wind || [0, 0, 0]);
  const v = V.len(vr), vh = V.mul(vr, 1 / v), q = 0.5 * (st.rho || PHY.rho) * PHY.A * v * v;
  out.cd = cdOf(st.rpm);
  out.drag = V.mul(vh, -q * out.cd);
  const wPar = V.dot(st.omega, vh), wPerp = V.sub(st.omega, V.mul(vh, wPar)), wT = V.len(wPerp);
  out.S = PHY.r * wT / v;
  if (opt.magnus && wT > 1e-9) {
    out.cl = clOf(out.S);
    out.magnus = V.mul(V.norm(V.cross(wPerp, vh)), q * out.cl);
  }
  if (opt.seam && st.knuckle) {
    const w = V.len(st.omega);
    out.theta = st.seam0 + w * t;                               // 縫い目の向き（回転軸のまわりの角度）
    out.ck = PHY.ck0 * Math.sin(4 * out.theta);
    const ax = w > 1e-9 ? V.mul(st.omega, 1 / w) : [0, 0, 1];
    const n = V.cross(ax, vh), nl = V.len(n);
    if (nl > 1e-9) out.seam = V.mul(n, q * out.ck / nl);
  }
  return out;
}
function accel(st, t, vel, opt) {
  const f = forces(st, t, vel, opt);
  const s = V.add(V.add(f.grav, f.drag), V.add(f.magnus, f.seam));
  return V.mul(s, 1 / PHY.m);
}

// RK4 でホームベースの前の端まで。返す: { pts: [{t, p, v}], tPlate, pPlate, vPlate }
function simulate(P, opt = { air: true, magnus: true, seam: true }, env = PHY.env) {
  const st = launch(P, env);
  let p = st.pos.slice(), v = st.vel.slice(), t = 0;
  const dt = PHY.dt, pts = [{ t, p: p.slice(), v: v.slice() }];
  for (let i = 0; i < 4000; i++) {
    const k1v = accel(st, t, v, opt), k1p = v;
    const v2 = V.add(v, V.mul(k1v, dt / 2)), k2v = accel(st, t + dt / 2, v2, opt), k2p = v2;
    const v3 = V.add(v, V.mul(k2v, dt / 2)), k3v = accel(st, t + dt / 2, v3, opt), k3p = v3;
    const v4 = V.add(v, V.mul(k3v, dt)), k4v = accel(st, t + dt, v4, opt), k4p = v4;
    const np = V.add(p, V.mul(V.add(V.add(k1p, V.mul(k2p, 2)), V.add(V.mul(k3p, 2), k4p)), dt / 6));
    const nv = V.add(v, V.mul(V.add(V.add(k1v, V.mul(k2v, 2)), V.add(V.mul(k3v, 2), k4v)), dt / 6));
    if (np[1] <= PHY.plateY) {                                  // ホームの前の端を越えた → 直線で補間して止める
      const f = (p[1] - PHY.plateY) / (p[1] - np[1]);
      const pe = V.add(p, V.mul(V.sub(np, p), f)), ve = V.add(v, V.mul(V.sub(nv, v), f));
      t += dt * f; pts.push({ t, p: pe, v: ve });
      return { st, pts, tPlate: t, pPlate: pe, vPlate: ve, opt };
    }
    if (np[2] < 0) { t += dt; pts.push({ t, p: np, v: nv }); return { st, pts, tPlate: t, pPlate: np, vPlate: nv, opt, ground: true }; }
    p = np; v = nv; t += dt;
    pts.push({ t, p: p.slice(), v: v.slice() });
  }
  return { st, pts, tPlate: t, pPlate: p, vPlate: v, opt };
}

// 時刻 t の点（線形補間）
function sampleAt(res, t) {
  const pts = res.pts, n = pts.length;
  if (t <= 0) return pts[0];
  if (t >= res.tPlate) return pts[n - 1];
  const i = Math.min(n - 2, Math.floor(t / PHY.dt)), a = pts[i], b = pts[i + 1], f = (t - a.t) / ((b.t - a.t) || 1);
  return { t, p: V.add(a.p, V.mul(V.sub(b.p, a.p), f)), v: V.add(a.v, V.mul(V.sub(b.v, a.v), f)) };
}

// ねらい: 放す角度を変えて、ホームの前の端で (x, z) = target を通るようにする（全部の力を入れた道すじで）
function aim(P, target = { x: 0, z: 0.75 }) {
  const Q = Object.assign({}, P);
  for (let k = 0; k < 8; k++) {
    const r = simulate(Q), d = Math.max(1, Q.ext ? PHY.rubberY - Q.ext - PHY.plateY : 17);
    const ex = target.x - r.pPlate[0], ez = target.z - r.pPlate[2];
    Q.vAng += Math.atan2(ez, d) * 180 / Math.PI;
    Q.hAng += Math.atan2(ex, d) * 180 / Math.PI;
    if (Math.abs(ex) < 0.002 && Math.abs(ez) < 0.002) break;
  }
  return { vAng: Q.vAng, hAng: Q.hAng };
}

// 変化量: 回転・縫い目の力なし（重力と抗力だけ）の道すじとの、ホームでの差（Statcast の「変化量」と同じ考え）
function movement(full, plain) {
  return { dx: full.pPlate[0] - plain.pPlate[0], dz: full.pPlate[2] - plain.pPlate[2] };
}

if (typeof module !== 'undefined') module.exports = { airDensity, STD_ENV, PHY, V, KMH, MPH, RPM, cdOf, clOf, launch, forces, simulate, sampleAt, aim, movement };
