// ビッグバンから惑星まで — 物理の検証（node big-bang/tools/verify.mjs [kepler|collide|headon|disk|heat|all]）
// GPU の式と同じ JS（js/physics.js）で調べる。GPU と JS のくらべは、ブラウザで __biba.testGpu()
import * as P from '../js/physics.js';

const which = process.argv[2] || 'all';
const ME = P.MEARTH / P.MSUN;
const ok = (c, s) => console.log((c ? '  OK  ' : '  NG  ') + s);

function kepler() {
  console.log('kepler: 1 AU の円軌道を 1000 周（太陽だけ）');
  const n = 1, B = new Float32Array(16);
  B[0] = 1; B[3] = 1e-12; B[5] = 2 * Math.PI; B[7] = 1e-9; B[12] = 3e5;
  const S = { B, n }; P.forceCPU(S, 1);
  const E = () => 0.5 * (B[4] ** 2 + B[5] ** 2) - P.G / Math.hypot(B[0], B[1]);
  const e0 = E(), steps = Math.round(1000 / P.DT);
  for (let s = 0; s < steps; s++) P.stepCPU(S, 1, 0, s, 0);
  const r = Math.hypot(B[0], B[1]), ph = Math.atan2(B[1], B[0]);
  ok(Math.abs(E() / e0 - 1) < 1e-4, `エネルギーのずれ ${((E() / e0 - 1) * 100).toExponential(2)}%（32ビットで記録）`);
  ok(Math.abs(r - 1) < 1e-3, `半径 ${r.toFixed(6)} AU`);
  console.log(`        1000 周後の位相のずれ ${(ph * 180 / Math.PI).toFixed(3)}°`);
}

function collideCase(m1, m2, vkms, label) {
  const R1 = P.radiusAU(m1), R2 = P.radiusAU(m2), v = vkms * 1000 / (P.AU / P.YR);
  const b1 = { m: m1, R: R1, p: [1, 0, 0], v: [0, 2 * Math.PI, 0], e: P.eOfTemp(278) };
  const b2 = { m: m2, R: R2, p: [1 + R1 + R2, 0, 0], v: [-v, 2 * Math.PI, 0], e: P.eOfTemp(278) };
  const r = P.collide(b1, b2, 1, 0.01 * (m1 + m2), 12345);
  const M = m1 + m2, mOut = r.lr.m + r.frags.reduce((s, f) => s + f.m, 0) + r.dust;
  const px = [0, 1, 2].map(k => m1 * b1.v[k] + m2 * b2.v[k]);
  const py = [0, 1, 2].map(k => r.lr.m * r.lr.v[k] + r.frags.reduce((s, f) => s + f.m * f.v[k], 0) + r.dust * (px[k] / M));
  const vesc = Math.sqrt(r.vesc2) * P.AU / P.YR / 1000;
  console.log(`  ${label}: ${vkms} km/s（逃げる速さ ${vesc.toFixed(2)} km/s）→ ${r.kind}、残る ${(100 * r.lr.m / M).toFixed(1)}%・かけら ${r.frags.length}・ちり ${(100 * r.dust / M).toFixed(2)}%、温度 ${Math.round(P.tempOfE(r.e))} K、Q_R ${r.qr.toExponential(2)} J/kg`);
  ok(Math.abs(mOut / M - 1) < 1e-12, '重さが変わらない');
  ok(px.every((p, k) => Math.abs(p - py[k]) <= 1e-12 * Math.abs(px[1])), '勢い（運動量）が変わらない');
  // かけらが本当に離れていくか（残りの星から見て外向き、ふれる距離より外）
  for (const f of r.frags) {
    const d = f.p.map((x, k) => x - r.lr.p[k]), w = f.v.map((x, k) => x - r.lr.v[k]);
    if (Math.hypot(...d) <= r.lr.R + f.R || d[0] * w[0] + d[1] * w[1] + d[2] * w[2] <= 0) { ok(false, 'かけらが残りの星の中か、近づいている'); break; }
  }
  return r;
}
function collide() {
  console.log('collide: ぶつかりの結果（Leinhardt & Stewart 2012）');
  collideCase(0.1 * ME, 0.1 * ME, 1, '火星の約1/1どうし ゆっくり');
  collideCase(0.1 * ME, 0.1 * ME, 10, '同 10 km/s');
  collideCase(0.1 * ME, 0.1 * ME, 30, '同 30 km/s');
  collideCase(1 * ME, 0.1 * ME, 12, '地球と火星くらい 12 km/s');
  // 同じ重さで、いちばん大きく残るのが半分になる速さ（Q_R = Q*_RD）
  const m = 0.1 * ME, R = P.radiusAU(m), Rc1 = Math.cbrt(3 * 2 * m * P.MSUN / (4 * Math.PI * 1000));
  const q = P.CSTAR * 0.8 * Math.PI * 1000 * P.GSI * Rc1 * Rc1;
  console.log(`  同じ重さ（地球の0.1倍×2）の Q*_RD = ${q.toExponential(3)} J/kg → 半分残る速さ ${(Math.sqrt(8 * q) / 1000).toFixed(1)} km/s`);
}

function headon() {
  console.log('headon: 地球の 0.1 倍どうしを 10 km/s で正面から、そのあと 8 歩（ブラウザの testGpu と同じ）');
  const n = 64, B = new Float32Array(n * 16), m = 0.1 * ME, R = P.radiusAU(m), v = 10000 / (P.AU / P.YR);
  const put = (i, x, vx) => { const o = i * 16; B[o] = 1 + x; B[o + 3] = m; B[o + 4] = vx; B[o + 5] = 2 * Math.PI; B[o + 7] = R; B[o + 12] = P.eOfTemp(278); };
  put(0, -3 * R, v / 2); put(1, 3 * R, -v / 2);
  const S = { B, n }; P.forceCPU(S, 1);
  for (let s = 0; s < 8; s++) {
    const r = P.stepCPU(S, 1, m * 0.02, s, 0);
    const alive = []; for (let i = 0; i < n; i++) if (B[i * 16 + 3] > 0) alive.push(i);
    console.log(`  歩 ${s}: ぶつかり ${r.coll}（くっつく ${r.merge}・砕ける ${r.frag}）残り ${alive.length} 個`);
  }
}

function disk() {
  const n = 512, F = 30, steps = 4000;
  console.log(`disk: 岩 ${n} 個・ぶつかる大きさ ×${F}・${(steps * P.DT).toFixed(0)} 年`);
  const d = P.initDisk(n, 3), S = { B: d.B, n }; P.forceCPU(S, F);
  const M0 = P.solidMassKg() / P.MSUN; let lost = 0, c = 0, mg = 0, fr = 0;
  const E0 = P.energy(d.B, n);
  for (let s = 0; s < steps; s++) { const r = P.stepCPU(S, F, d.m0 * 0.5, s, s * P.DT); lost += r.dust + r.sun + r.lost; c += r.coll; mg += r.merge; fr += r.frag; if (s % 16 === 15) P.heatCPU(S, 16 * P.DT, s * P.DT); }
  let M = 0, k = 0, big = 0; for (let i = 0; i < n; i++) { const m = d.B[i * 16 + 3]; if (m > 0) { M += m; k++; big = Math.max(big, m); } }
  ok(Math.abs((M + lost) / M0 - 1) < 1e-5, `重さ: 岩 ${(100 * M / M0).toFixed(3)}% + 失った ${(100 * lost / M0).toFixed(3)}%`);
  console.log(`        ぶつかり ${c}（くっつく ${mg}・砕ける ${fr}）、残り ${k} 個、いちばん大きい 地球の ${(big / ME).toFixed(4)} 倍、エネルギー ${(100 * (P.energy(d.B, n) / E0 - 1)).toFixed(3)}%（ぶつかりでへる）`);
}

function heat() {
  console.log('heat: 冷え方');
  for (const [mE, T] of [[0.001, 2500], [0.1, 2500], [0.1, 1000]]) {
    const R = P.radiusAU(mE * ME), B = new Float32Array(16); B[0] = 1; B[3] = mE * ME; B[7] = R; B[12] = P.eOfTemp(T);
    let t = 0; const dt = 1; const S = { B, n: 1 };
    while (t < 1e6 && P.tempOfE(B[12]) > (T > 1500 ? 1499 : T - 100)) { P.heatCPU(S, dt, 1e7); t += dt; }
    console.log(`  地球の ${mE} 倍（直径 ${Math.round(R * P.AU * 2 / 1000)} km）、${T} K から ${T > 1500 ? '固まる' : '100 K 下がる'}まで ${t >= 1e6 ? '100万年より長い' : t + ' 年'}`);
  }
}

if (which === 'kepler' || which === 'all') kepler();
if (which === 'collide' || which === 'all') collide();
if (which === 'headon' || which === 'all') headon();
if (which === 'heat' || which === 'all') heat();
if (which === 'disk' || which === 'all') disk();
