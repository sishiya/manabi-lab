// physics.js — 環境 ENVS と、1匹を15秒動かす物理（関節＝点、筋肉＝ばね、地面の摩擦、水の抵抗）
'use strict';

const DT = 1 / 120;          // 計算のきざみ（秒）
const TRIAL = 15;            // 1匹を走らせる時間（秒）
const MASS = 2;              // 関節1つの質量（kg）
const AIR_DAMP = 0.1;        // 空気などによるごく小さい減衰（1/秒）
const ZETA = 0.5;            // 筋肉の減衰（臨界減衰に対する割合）
const VMAX = 60;             // これより速くなったら計算がこわれたとみなす（m/秒）
const GRIP = 200;            // いちばんすべりにくい足が地面をつかむ力（N。爪・ひづめが土にくいこむ分）

// 環境。g は重力（m/s²）、slope は上り坂の角度（度）、fric は足の裏の摩擦にかける倍率
const ENVS = [
  { key: 'flat',  name: '平地',     sub: '地球・土の上', g: 9.8,  slope: 0,  fric: 1,    water: false,
    note: '重力 9.8m/s²。足の裏の摩擦係数は遺伝子のまま（0.2〜1.2）。すべりにくい足は爪のように地面をつかむ（最大 200N）。' },
  { key: 'slope', name: '上り坂',   sub: '10°',         g: 9.8,  slope: 10, fric: 1,    water: false,
    note: '10°の上り坂（tan10° = 0.18）。摩擦係数がこれより小さい足は、止まっていてもずり落ちる。' },
  { key: 'ice',   name: '氷の上',   sub: '摩擦 0.1倍',   g: 9.8,  slope: 0,  fric: 0.1,  water: false,
    note: '摩擦係数と地面をつかむ力を 0.1 倍（ゴムでも 0.1、スケートの刃は 0.01 くらい）。けるのはむずかしいが、すべりだすと止まりにくいので、スケートのようにすべって進むものが出てくる。' },
  { key: 'moon',  name: '月面',     sub: '重力 1/6',     g: 1.62, slope: 0,  fric: 1,    water: false,
    note: '重力 1.62m/s²（地球の約6分の1）。体が軽いぶん地面を押す力も小さく、すべりやすい。跳ぶと長く浮く。' },
  { key: 'water', name: '水の中',   sub: '中性浮力',     g: 0,    slope: 0,  fric: 0.5,  water: true,
    note: '体は水と同じ重さ（浮きも沈みもしない）。筋肉の棒が水を横に押すと抵抗（速さの2乗に比例）が返ってきて進む。底は泥（摩擦 0.5倍）。' },
];
const envByKey = k => ENVS.find(e => e.key === k);

// 水の抵抗: 流れに垂直な向き ½ρ·Cd·太さ（ρ=1000kg/m³、Cd=1.0、太さ 8cm）＝ 40 N·s²/m³（筋肉 1m あたり）
const WATER_CN = 40;
const WATER_CT = 2;          // 筋肉に沿う向き（線形、N·s/m²）
const WATER_START = 1.2;     // 水の中では底から 1.2m 浮かせて始める

// 1匹ぶんの計算の状態を作る。座標は「坂に沿った」向き（x = 坂を上る向き、y = 地面からの高さ）
function makeSim(g, env) {
  const n = g.nodes.length;
  const S = { g, env, n, t: 0, px: new Float64Array(n), py: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n),
    ax: new Float64Array(n), ay: new Float64Array(n), fr: new Float64Array(n), gr: new Float64Array(n), ok: true, x0: 0, contract: new Uint8Array(g.muscles.length) };
  let minY = Infinity, cx = 0;
  for (const p of g.nodes) { minY = Math.min(minY, p.y); cx += p.x / n; }
  const lift = env.water ? WATER_START : 0;
  g.nodes.forEach((p, i) => { S.px[i] = p.x - cx; S.py[i] = p.y - minY + lift; S.fr[i] = p.f * env.fric; S.gr[i] = gripOf(p.f) * env.fric / MASS * DT; });
  const th = env.slope * Math.PI / 180;
  S.gx = -env.g * Math.sin(th); S.gy = -env.g * Math.cos(th);
  S.musc = g.muscles.map(m => ({ a: m.a, b: m.b, lo: m.lo, hi: m.hi, on: m.on, dur: m.dur, k: m.k, c: 2 * ZETA * Math.sqrt(m.k * MASS / 2) }));
  S.x0 = centerX(S);
  return S;
}

// 足が地面をつかむ力（爪・吸盤・ひづめが土にくいこむ分。押しつける力に関係なく横の動きを止める）
function gripOf(f) { const t = clamp((f - G.FRIC_MIN) / (G.FRIC_MAX - G.FRIC_MIN), 0, 1); return GRIP * t * t; }

function centerX(S) { let s = 0; for (let i = 0; i < S.n; i++) s += S.px[i]; return s / S.n; }

// 筋肉が縮んでいる時間帯か（周期の中の on から dur の長さ）
function inWindow(ph, on, dur) { const d = ph - on; return (d >= 0 ? d : d + 1) < dur; }

function stepSim(S) {
  const { n, px, py, vx, vy, musc } = S, water = S.env.water;
  const ax = S.ax, ay = S.ay;
  ax.fill(0); ay.fill(0);
  const ph = wrap1(S.t / S.g.period);
  for (let j = 0; j < musc.length; j++) {
    const m = musc[j], a = m.a, b = m.b;
    const c = inWindow(ph, m.on, m.dur);
    S.contract[j] = c ? 1 : 0;
    const dx = px[b] - px[a], dy = py[b] - py[a], L = Math.hypot(dx, dy) || 1e-6, ux = dx / L, uy = dy / L;
    const rel = (vx[b] - vx[a]) * ux + (vy[b] - vy[a]) * uy;
    const F = m.k * (L - (c ? m.lo : m.hi)) + m.c * rel;   // 引っぱる力（N）
    ax[a] += F * ux / MASS; ay[a] += F * uy / MASS;
    ax[b] -= F * ux / MASS; ay[b] -= F * uy / MASS;
    if (water) {
      // 筋肉の両端それぞれで、棒に垂直な速さに2乗の抵抗、沿う速さに線形の抵抗（行きすぎないよう速さで頭打ち）
      const nx = -uy, ny = ux, half = L / 2;
      for (const i of [a, b]) {
        const vn = vx[i] * nx + vy[i] * ny, vt = vx[i] * ux + vy[i] * uy;
        const dn = Math.min(Math.abs(vn), WATER_CN * half * vn * vn / MASS * DT) * Math.sign(vn);
        const dtg = Math.min(Math.abs(vt), WATER_CT * half * Math.abs(vt) / MASS * DT) * Math.sign(vt);
        vx[i] -= dn * nx + dtg * ux; vy[i] -= dn * ny + dtg * uy;
      }
    }
  }
  const damp = 1 - AIR_DAMP * DT;
  for (let i = 0; i < n; i++) {
    vx[i] = (vx[i] + (ax[i] + S.gx) * DT) * damp;
    vy[i] = (vy[i] + (ay[i] + S.gy) * DT) * damp;
    px[i] += vx[i] * DT; py[i] += vy[i] * DT;
    if (py[i] < 0) {
      // 地面にめりこんだ: 押し戻し、下向きの速さを消した分（撃力）× 摩擦係数（クーロン摩擦）＋ 地面をつかむ力の分だけ横の速さを止める
      py[i] = 0;
      if (vy[i] < 0) {
        const cap = S.fr[i] * -vy[i] + S.gr[i];
        vy[i] = 0;
        vx[i] = Math.abs(vx[i]) <= cap ? 0 : vx[i] - Math.sign(vx[i]) * cap;
      }
    }
    if (!(Math.abs(vx[i]) < VMAX && Math.abs(vy[i]) < VMAX)) S.ok = false;
  }
  S.t += DT;
}

// 15秒走らせて、進んだ距離（m、重心の横の移動）を返す。計算がこわれたら 0
function runTrial(g, env) {
  const S = makeSim(g, env), steps = Math.round(TRIAL / DT);
  for (let k = 0; k < steps; k++) { stepSim(S); if (!S.ok) return 0; }
  return centerX(S) - S.x0;
}
