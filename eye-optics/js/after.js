// 目のなかの光の道 — 残像（色の図を見つめてから白い面へ）
// 残像は網膜（神経節細胞）の「引き算の順応」で生まれる（Zaidi ほか 2012）。見つめている図の信号 c に、順応の量 a が
// 時定数 τ で近づき、見える信号は c − k·a。図を消す（白い面）と c = 0 なので −k·a ＝ 反対の色が見え、τ で消えていく。
// 目は動かず図も変わらないので、場所ごとの順応は a(x,t) = c(x)·α(t) と書ける。α は1つの数: dα/dt = (s − α)/τ（s: 図を見ていれば 1、白い面なら 0）
'use strict';

const AFTER = {
  tau: 7,      // 順応の時定数（秒）: 神経節細胞 4.8〜17.6 s（ほとんど 5〜12 s、Zaidi ほか 2012）、見る人の残像 4〜8 s（Kelly & Martinez-Uriegas 1993）の中の推定
  k: 0.42,     // はねかえりの大きさ: Zaidi ほか 2012 の図4a（はねかえりの反応と最大の反応の傾き −0.42）からの推定
  W: 192, H: 126,   // 計算の細かさ（見え方の表をこの格子で描いて広げる）
  fig: null, bg: null,   // 図の錐体コントラスト（場所ごと LMS）・地の色
};
S.afterA = 0; S.afterMode = 'stare';   // 順応の量 α、'stare'（図を見つめる）／'white'（白い面）

// sRGB（直線）→ XYZ（D65）→ LMS（Hunt–Pointer–Estévez）
const M_RGB2LMS = (() => {
  const A = [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]];
  const B = [[0.4002, 0.7076, -0.0808], [-0.2263, 1.1653, 0.0457], [0, 0, 0.9182]];
  return B.map(r => [0, 1, 2].map(j => r[0] * A[0][j] + r[1] * A[1][j] + r[2] * A[2][j]));
})();
function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2], A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}
const M_LMS2RGB = inv3(M_RGB2LMS);
const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const toS = v => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
const mul = (m, v) => [0, 1, 2].map(i => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);

// 図: 灰色の地に、赤い円・緑の四角・青い三角・黄色の星（まん中に見つめる＋）
function afterBuild() {
  const { W, H } = AFTER, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), gray = 128;
  g.fillStyle = `rgb(${gray},${gray},${gray})`; g.fillRect(0, 0, W, H);
  const u = H / 126;
  g.fillStyle = 'rgb(220,40,40)'; g.beginPath(); g.arc(W * 0.27, H * 0.32, 22 * u, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgb(40,170,60)'; g.fillRect(W * 0.66, H * 0.14, 42 * u, 42 * u);
  g.fillStyle = 'rgb(40,80,220)'; g.beginPath(); g.moveTo(W * 0.27, H * 0.58); g.lineTo(W * 0.27 + 26 * u, H * 0.58 + 44 * u); g.lineTo(W * 0.27 - 26 * u, H * 0.58 + 44 * u); g.closePath(); g.fill();
  g.fillStyle = 'rgb(240,210,40)'; g.beginPath();
  for (let i = 0; i < 10; i++) { const r = (i % 2 ? 11 : 26) * u, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(W * 0.74 + r * Math.cos(a), H * 0.72 + r * Math.sin(a)); }
  g.closePath(); g.fill();
  const d = g.getImageData(0, 0, W, H).data, bg = mul(M_RGB2LMS, [toLin(gray), toLin(gray), toLin(gray)]);
  const fig = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const lms = mul(M_RGB2LMS, [toLin(d[i * 4]), toLin(d[i * 4 + 1]), toLin(d[i * 4 + 2])]);
    for (let j = 0; j < 3; j++) fig[i * 3 + j] = (lms[j] - bg[j]) / bg[j];   // 錐体ごとのコントラスト（地に対して）
  }
  AFTER.fig = fig; AFTER.bg = bg;
  AFTER.white = mul(M_RGB2LMS, [toLin(236), toLin(236), toLin(236)]);
  AFTER.img = new ImageData(W, H); AFTER.cv = document.createElement('canvas'); AFTER.cv.width = W; AFTER.cv.height = H; AFTER.last = '';
}

// 時間を dt（秒）進める
function afterStep(dt) {
  const s = S.chart === 'after' && S.afterMode === 'stare' ? 1 : 0;
  S.afterA += (s - S.afterA) * (1 - Math.exp(-dt / AFTER.tau));
}
// いま見えているものを描く（見つめているとき: 地＋図×(1 − kα)、白い面: 白＋図×(−kα)）
function afterRender(out) {
  if (!AFTER.fig) afterBuild();
  const stare = S.afterMode === 'stare', f = stare ? 1 - AFTER.k * S.afterA : -AFTER.k * S.afterA;
  const key = f.toFixed(3) + stare;
  if (key !== AFTER.last) {
    AFTER.last = key;
    const { W, H, fig } = AFTER, base = stare ? AFTER.bg : AFTER.white, o = AFTER.img.data;
    for (let i = 0; i < W * H; i++) {
      const lms = [0, 1, 2].map(j => base[j] * (1 + f * fig[i * 3 + j]));
      const rgb = mul(M_LMS2RGB, lms);
      o[i * 4] = toS(rgb[0]); o[i * 4 + 1] = toS(rgb[1]); o[i * 4 + 2] = toS(rgb[2]); o[i * 4 + 3] = 255;
    }
    AFTER.cv.getContext('2d').putImageData(AFTER.img, 0, 0);
  }
  const g = out.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
  g.drawImage(AFTER.cv, 0, 0, out.width, out.height);
  // 見つめる＋（いつも）
  const cx = out.width / 2, cy = out.height / 2, r = out.height * 0.035;
  g.strokeStyle = '#111'; g.lineWidth = Math.max(1.5, out.height * 0.008);
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
  // しくみの図で見ている場所（mech.js）: 点線の輪
  if (typeof SPOTS !== 'undefined') {
    const sp = SPOTS[S.afterSpot];
    g.setLineDash([4, 3]); g.strokeStyle = '#ffd66a'; g.lineWidth = Math.max(1.5, out.height * 0.01);
    g.beginPath(); g.arc(sp.fx * out.width, sp.fy * out.height, out.height * 0.2, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
}
