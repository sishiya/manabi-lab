// 形と動きの測り方（実物の測定と同じものさし）: 体の波の数・波長・ふれはば（体長あたり）、すべり（1 − 速さ/波の速さ）、頭の通り道のふれはば
const G = require('../js/ground.js');
function kin(o, label) {
  const s = G.make(o), dt = s.p.tau / 200, N = G.N, L = s.p.L;
  for (let t = 0; t < s.p.tau * 3; t += dt) G.step(s, dt);
  // 進む向きを1周期で決める
  const x0 = s.X, y0 = s.Y, t0 = s.t; const head = [];
  let amp = 0, lam = 0, nw = 0, n = 0;
  for (let t = 0; t < s.p.tau * 2; t += dt) {
    G.step(s, dt); head.push([s.x[N - 1], s.y[N - 1]]);
  }
  const dx = s.X - x0, dy = s.Y - y0, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
  const U = d / (s.t - t0);
  // 体の形: 進む向きを x' にとり、横のずれ y'
  const xs = [], ys = [];
  for (let i = 0; i < N; i++) { xs.push(s.x[i] * ux + s.y[i] * uy); ys.push(-s.x[i] * uy + s.y[i] * ux); }
  const ym = ys.reduce((a, b) => a + b) / N;
  // 横のずれの山と谷（ゼロを横切る点）から波長
  const zc = [];
  for (let i = 1; i < N; i++) if ((ys[i - 1] - ym) * (ys[i] - ym) < 0) zc.push(xs[i]);
  const halfw = zc.length > 1 ? Math.abs(zc[zc.length - 1] - zc[0]) / (zc.length - 1) : NaN;
  const A = (Math.max(...ys) - Math.min(...ys)) / 2;
  const ext = Math.abs(xs[N - 1] - xs[0]);
  // 頭の通り道の横ふれ
  const hy = head.map(q => -q[0] * uy + q[1] * ux), hA = (Math.max(...hy) - Math.min(...hy)) / 2;
  // 体の各点の横すべり（体の向きに直角な速さ / 速さ）
  let lat = 0, tot = 0;
  for (let i = 0; i < N; i++) { const v = Math.hypot(s.vx[i], s.vy[i]); const vn = Math.abs(-s.ty[i] * s.vx[i] + s.tx[i] * s.vy[i]); lat += vn; tot += v; }
  // 波の速さ（体に対して）: 体1周の弧が τ で流れる → 1波長の弧 / τ。地面に対する波の速さは 1波長（x 方向）/ τ
  const lamX = 2 * halfw, Vw = lamX / s.p.tau;
  console.log(`${label.padEnd(26)} 波長 ${(lamX / L).toFixed(2)} L  ふれはば ${(A / L).toFixed(3)} L  体に波 ${(ext / lamX).toFixed(2)}  体の伸び ${(ext / L).toFixed(2)} L  頭の横ふれ ${(hA / L).toFixed(3)} L  速さ ${(U * s.p.tau / L).toFixed(3)} L/周期  すべり ${(1 - U / Vw).toFixed(2)}  横すべり/速さ ${(lat / tot).toFixed(2)}`);
}
module.exports = kin;
if (require.main === module) {
  kin({}, 'いま（α7 k2 持ち上げ）');
  kin({ lift: false }, 'いま（持ち上げなし）');
}
