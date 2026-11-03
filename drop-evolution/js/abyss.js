// 造形「深海の発光」（F3 元気で光る・航跡。2026-10-31 ユーザーが look/ から選んだ）
// 暗い紺の水に、生き物そのものが青くやわらかく光る。腹ぺこは暗く、満ちると息づく。泳いだあとに光の糸が残る。
// 真上から見ているので、太陽の光は見る向きと同じ向きに降りる。水面のうねりが集めた大きな明るいむらがゆっくり動く。明るさは「光」の強さで変わる。
// 軽くするしくみ: ぼかし（filter）は使わない。航跡（1/2）・光のにじみ（1/4・1/8）・光の筋（1/8）は小さい紙に描き、1/2 の「光の紙」にまとめてから
// 画面へは1回だけ引きのばして足す。水の色とふちの暗さは作り置きの絵。光る丸も作り置きの絵。くっきりの線は明るさ4段でまとめて引く
import { W, H, GI } from './sim.js';
import { FRAMES } from './body.js';
import { makeGL, rgba } from './glbatch.js';

// WebGL2 が使えれば、光の輪とくっきりの線を GPU でまとめて描く（2026-11-01 実機の記録で、描くの 7 割がこの2つだった）。?nogl で今の描き方
function glOf(ren, name) {
  if (ren[name] === undefined) { try { ren[name] = new URLSearchParams(location.search).has('nogl') ? null : makeGL(); } catch (e) { console.warn(e); ren[name] = null; } }
  return ren[name];
}
const GLOW_RGB = [0.65, 0.95, 0.99];   // 光の輪の色（hsl 188・95%・82%）

const TAU = Math.PI * 2;
const HUE = 188;
export const ABYSS = { ink: '#bfefff', glow: '120,225,255', food: '160,232,215', sym: '120,255,170', poo: 'rgba(150,120,90,A)', sel: '#ffc861' };
const WATER = '#031424';   // 真上から見るので、上下で明るさを変えない（2026-10-31 まで上ほど明るい＝横から見た海だった）
// 航跡が半分の明るさになるまでの秒。0.25 は look/ の F3（毎こま 4.5% 薄める＝60fps で 0.25 秒）と同じ尾の長さ（ユーザーが見くらべで選んだ見え方）。
// 0.12 にしたこともあるが、それは消え残りのバグで尾が長く見えていたため。バグを直したうえで 0.25 にもどした
const WAKE_HALF = 0.175;   // 航跡が半分の明るさになる秒（2026-11-01 ユーザー「もう7割に」。前は 0.25）
const GLOW_K = 0.7;      // 体のまわりのにじみと航跡の明るさ（2026-11-01 ユーザー「7割くらいに」）

function h01(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
// 光る丸の絵（まん中が白っぽく、ふちへ消える）
let GLOW = null;
function glowSprite() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, `hsla(${HUE},95%,88%,1)`); rg.addColorStop(0.35, `hsla(${HUE},95%,62%,0.55)`); rg.addColorStop(1, `hsla(${HUE},95%,50%,0)`);
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return (GLOW = c);
}
// 膜のすぐ外にもれる光の輪の絵。q は体の半径÷光の外の半径（8 段に分けて作り置く）。内はうすく、膜でいちばん明るく、外へ消える
// （光は幻想的に見せるための絵で、大きく進化しても光る力は増えない。2026-11-01 ユーザー「身体のすこしそとがわにぼんやり光が漏れる見え方に」）
const HALO = 7;                 // 膜の外へもれる光の幅 µm（体の大きさによらない）
const RINGS = [];
function ringSprite(q) {
  const i = Math.max(0, Math.min(7, Math.round(q * 8 - 0.5)));
  if (RINGS[i]) return RINGS[i];
  const qi = (i + 0.5) / 8, c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, `hsla(${HUE},95%,70%,0.03)`); rg.addColorStop(qi * 0.8, `hsla(${HUE},95%,72%,0.08)`);
  rg.addColorStop(qi, `hsla(${HUE},95%,82%,0.85)`); rg.addColorStop(qi + (1 - qi) * 0.4, `hsla(${HUE},95%,60%,0.3)`); rg.addColorStop(1, `hsla(${HUE},95%,50%,0)`);
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return (RINGS[i] = c);
}
// 紙（画面の css の大きさ × k）
function paper(ren, name, k) {
  const w = Math.max(1, Math.round(ren.w * k)), h = Math.max(1, Math.round(ren.h * k)), P = ren.papers || (ren.papers = {});
  let c = P[name];
  if (!c || c.width !== w || c.height !== h) { c = P[name] = document.createElement('canvas'); c.width = w; c.height = h; c.fresh = true; }
  return c;
}
function toWorld(ren, g, s) { const c = ren.cam; g.setTransform(s * c.z, 0, 0, s * c.z, s * (ren.w / 2 - c.x * c.z), s * (ren.h / 2 - c.y * c.z)); }
// 元気の光: 腹ぺこは暗く、満ちると明るく、ゆっくり息づく
function glowOf(o, time) { const e = Math.min(1, o.e / o.eS); return Math.pow(e, 1.6) * (0.65 + 0.35 * Math.sin(time * 1.1 + o.x * 0.031 + o.y * 0.017)); }

// 節のいまのこま（打つ動きは 1 秒に 2.5 回までに落として描く）
let PTS = new Float32Array(64);
function pose(o, time) {
  const B = o.bp;
  if (!B.n) return null;
  const u = (time * Math.min(1 / o.b.T, 2.5) + o.id * 0.37) % 1, ph = (u < 0 ? u + 1 : u) * FRAMES, f0 = Math.min(FRAMES - 1, ph | 0), k = ph - f0;
  const A = B.frames[f0], Bf = B.frames[(f0 + 1) % FRAMES];
  if (PTS.length < A.pts.length) PTS = new Float32Array(A.pts.length * 2);
  for (let i = 0; i < A.pts.length; i++) PTS[i] = A.pts[i] + (Bf.pts[i] - A.pts[i]) * k;
  return { pts: PTS, wob: A.w + (Bf.w - A.w) * k };
}

export function drawAbyss(ren, world, sel, time) {
  // 確かめ用: 部分ごとの描く時間（ms、なめらかにした値）。?test の計測ログに出す
  const PF = ren.prof || (ren.prof = {}); let lapT = performance.now();
  const lap = k => { const n = performance.now(); PF[k] = (PF[k] || 0) * 0.9 + (n - lapT) * 0.1; lapT = n; };
  const g = ren.cx, c = ren.cam, z = c.z, dpr = ren.dpr, w = ren.w, h = ren.h;
  const tl = ren.toWorld(0, 0), br = ren.toWorld(w, h);
  const inView = (o, m) => !(o.x < tl.x - m || o.x > br.x + m || o.y < tl.y - m || o.y > br.y + m);
  const vis = world.orgs.filter(o => inView(o, 80));
  const glow = new Map();
  for (const o of vis) glow.set(o, glowOf(o, time));

  // ── 水 ──
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.drawImage(waterImage(ren), 0, 0, w, h);
  // 一滴の外は暗く
  toWorld(ren, g, dpr);
  g.fillStyle = 'rgba(0,1,4,0.7)'; g.beginPath(); g.rect(tl.x - 10, tl.y - 10, br.x - tl.x + 20, br.y - tl.y + 20); g.rect(0, 0, W, H); g.fill('evenodd');
  g.strokeStyle = 'rgba(110,200,240,0.18)'; g.lineWidth = 1.5 / z; g.strokeRect(0, 0, W, H);
  // 砂つぶ（光らない。水の色にしずむ）。1つのつぶは 1〜3 個の丸を重ねた形: 先にふちの線を太めに引き、上から中を塗って、外がわの線だけ残す
  const sandPath = q => {
    const p = new Path2D();
    for (let i = 0; i <= 28; i++) {
      const t = i / 28 * TAU, k = 1 + 0.05 * (Math.sin(t * 3 + q.seed + q.x) * 0.6 + Math.sin(t * 5 + q.seed * 1.7) * 0.4);
      i ? p.lineTo(q.x + Math.cos(t) * q.r * k, q.y + Math.sin(t) * q.r * k) : p.moveTo(q.x + q.r * k, q.y);
    }
    return p;
  };
  // 砂つぶは動かないので、形とぼかし色は一滴ごとに1回だけ作る
  if (world.sandCache?.g !== g || world.sandCache.ver !== world.sandVer) {   // 砂つぶを置いたら作りなおす
    world.sandCache = { g, ver: world.sandVer, list: (world.sandGroups || (world.grains || []).map((q, i) => ({ x: q.x, y: q.y, R: q.r, el: 1, parts: [i] }))).map(G => {
      const paths = G.parts.map(k => sandPath(world.grains[k]));
      const sg = g.createRadialGradient(G.x - G.R * 0.15, G.y - G.R * 0.15, G.R * 0.1, G.x, G.y, G.R * G.el * 1.05);
      sg.addColorStop(0, 'rgba(46,70,92,1)'); sg.addColorStop(0.7, 'rgba(24,42,62,1)'); sg.addColorStop(1, 'rgba(10,22,38,1)');
      return { G, paths, sg, RR: G.R * G.el * 1.3 };
    }) };
  }
  for (const { G, paths, sg, RR } of world.sandCache.list) {
    if (G.x + RR < tl.x || G.x - RR > br.x || G.y + RR < tl.y || G.y - RR > br.y) continue;
    g.strokeStyle = 'rgba(130,180,215,0.45)'; g.lineWidth = 2.6 / z;
    for (const p of paths) g.stroke(p);
    g.fillStyle = sg;   // 真上から照らされた玉: まん中が少し明るく、ふちが暗い
    for (const p of paths) g.fill(p);
  }
  // ふん（光らない茶色の点。分解されるほど薄れる）
  const fs = Math.max(1.4, 1.8 / z);
  const pooP = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];   // 薄さを4段にまとめて描く
  for (const p of world.poos) {
    if (p.x < tl.x || p.x > br.x || p.y < tl.y || p.y > br.y) continue;
    pooP[Math.min(3, (p.n / p.n0 * 4) | 0)].rect(p.x - fs / 2, p.y - fs / 2, fs, fs);
  }
  for (let b = 0; b < 4; b++) { g.fillStyle = ABYSS.poo.replace('A', (0.2 + 0.45 * (b + 0.5) / 4).toFixed(2)); g.fill(pooP[b]); }

  lap('water');
  // ── 光の航跡（1/2 の紙。前のこまの場所から今の場所へ線。砂についているものは出さない） ──
  const kw = 0.5, Wk = paper(ren, 'wake', kw), wk = Wk.getContext('2d');
  const L = ren.wakeCam;
  wk.setTransform(1, 0, 0, 1, 0, 0);
  if (!Wk.fresh && L && Math.abs(L.z - z) < 1e-6) {
    const dx = (L.x - c.x) * z * kw, dy = (L.y - c.y) * z * kw;
    if (dx || dy) { wk.globalCompositeOperation = 'copy'; wk.drawImage(Wk, dx, dy); }
    // WAKE_HALF 秒ごとに半分の明るさに（こまの速さによらない）。
    // 毎こま少しずつ薄めると、透明度は 0〜255 の整数なので、ごく薄い所が丸めで元にもどり、うっすらした跡がずっと残る。
    // 薄める分をためて、30% を超えたらまとめて薄める（残るのは 1/255 だけで、見えない）
    // 一滴の中の時間で薄める（倍速では速く消え、止めている間は残る。2026-11-01 ユーザー「軌跡も倍速の値を反映して消えるように」）
    const dt = Math.min(2, Math.max(0, world.t - (ren.wakeT ?? world.t)));
    ren.wakeKeep = (ren.wakeKeep ?? 1) * Math.pow(0.5, dt / WAKE_HALF);
    if (ren.wakeKeep < 0.7) {
      wk.globalCompositeOperation = 'destination-out';
      wk.fillStyle = `rgba(0,0,0,${(1 - ren.wakeKeep).toFixed(3)})`; wk.fillRect(0, 0, Wk.width, Wk.height);
      ren.wakeKeep = 1;
    }
  } else { wk.clearRect(0, 0, Wk.width, Wk.height); ren.wakePrev = null; }
  const moved = world.t !== ren.wakeT;   // 止めている間は軌跡を足さない（同じ所に点が重なって明るい丸になる）
  wk.globalCompositeOperation = 'source-over'; Wk.fresh = false; ren.wakeCam = { x: c.x, y: c.y, z }; ren.wakeT = world.t;
  toWorld(ren, wk, kw); wk.lineCap = 'round';
  const prev = ren.wakePrev || new Map(), next = new Map();
  const body = new Path2D(), tipsP = new Path2D();
  for (const o of vis) {
    const p = prev.get(o.id);
    next.set(o.id, [o.x, o.y]);
    if (moved && p && !o.anch && Math.abs(p[0] - o.x) < 25 && Math.abs(p[1] - o.y) < 25) { body.moveTo(p[0], p[1]); body.lineTo(o.x, o.y); }
  }
  ren.wakePrev = next;
  // 節の先（ごくうすく。前のこまの先の場所は wakeTips）
  const ptips = ren.wakeTips || new Map(), ntips = new Map();
  const poses = new Map();
  for (const o of vis) {
    const P = pose(o, time); if (!P) continue;
    poses.set(o, { pts: Float32Array.from(P.pts.subarray(0, o.bp.n * 4)), wob: P.wob });
    if (o.anch || o.r * z < 3) continue;
    const a = o.a + P.wob, ca = Math.cos(a), sa = Math.sin(a), r = o.r;
    for (const i of o.bp.tips) {
      const q = i * 4, x = o.x + (ca * P.pts[q + 2] - sa * P.pts[q + 3]) * r, y = o.y + (sa * P.pts[q + 2] + ca * P.pts[q + 3]) * r, key = o.id * 16 + i, pp = ptips.get(key);
      ntips.set(key, [x, y]);
      if (moved && pp && Math.abs(pp[0] - x) < 25 && Math.abs(pp[1] - y) < 25) { tipsP.moveTo(pp[0], pp[1]); tipsP.lineTo(x, y); }
    }
  }
  ren.wakeTips = ntips;
  wk.strokeStyle = 'rgba(90,210,255,0.2)'; wk.lineWidth = Math.max(1.2 / z, 4); wk.stroke(body);
  wk.strokeStyle = 'rgba(120,240,255,0.13)'; wk.lineWidth = Math.max(0.8 / z, 0.7); wk.stroke(tipsP);
  // 光の紙（1/2）: 航跡・にじみ・光の筋をここにまとめる
  const Lt = paper(ren, 'light', 0.5), lt = Lt.getContext('2d');
  lt.setTransform(1, 0, 0, 1, 0, 0); lt.globalCompositeOperation = 'source-over'; lt.clearRect(0, 0, Lt.width, Lt.height);
  lt.imageSmoothingEnabled = true; lt.globalCompositeOperation = 'lighter';
  lt.globalAlpha = GLOW_K; lt.drawImage(Wk, 0, 0); lt.globalAlpha = 1;

  lap('wake');
  // ── 光のにじみ（1/4 の紙に光る丸と節を描き、さらに 1/8 にして、それぞれ引きのばして重ねる） ──
  const kg = 0.25, G = paper(ren, 'glow', kg), gg = G.getContext('2d');
  gg.setTransform(1, 0, 0, 1, 0, 0); gg.globalCompositeOperation = 'source-over'; gg.clearRect(0, 0, G.width, G.height);
  toWorld(ren, gg, kg); gg.globalCompositeOperation = 'lighter';
  const spr = glowSprite(), gG = glOf(ren, 'glGlow');
  ren.trackGhosts(world, time);
  if (gG) {
    gG.begin(G.width, G.height, c.x, c.y, z * kg);
    for (const o of vis) {
      const I = glow.get(o), R = Math.max(o.r + HALO, 6 / z);
      gG.glowRing(o.x, o.y, R, o.r / R, [...GLOW_RGB, Math.min(1, 0.08 + I * 0.9) * (o.inner ? 0.25 : o.colN > 1 ? 0.6 : 1)]);
    }
    for (const gh of ren.ghosts) { const k = (time - gh.t) / 1.6; gG.blob(gh.x, gh.y, gh.r * (1 + k * 2.5), [...GLOW_RGB, 0.5 * (1 - k)]); }
    gG.flush(true);
    gg.setTransform(1, 0, 0, 1, 0, 0); gg.globalCompositeOperation = 'source-over'; gg.drawImage(gG.canvas, 0, 0);
  } else {
    for (const o of vis) {
      const I = glow.get(o), R = Math.max(o.r + HALO, 6 / z);
      // 群体の中の細胞は、光が仲間に重なって明るくなりすぎるので弱く（光は群体の外へもれる）
      gg.globalAlpha = Math.min(1, 0.08 + I * 0.9) * (o.inner ? 0.25 : o.colN > 1 ? 0.6 : 1); gg.drawImage(ringSprite(o.r / R), o.x - R, o.y - R, R * 2, R * 2);
    }
    gg.globalAlpha = 1;
    // 死んだときの光（ふくらんで消える輪）
    for (const gh of ren.ghosts) {
      const k = (time - gh.t) / 1.6, R = gh.r * (1 + k * 2.5);
      gg.globalAlpha = 0.5 * (1 - k); gg.drawImage(spr, gh.x - R, gh.y - R, R * 2, R * 2);
    }
    gg.globalAlpha = 1;
  }
  const G2 = paper(ren, 'glow2', 0.125), g2 = G2.getContext('2d');
  g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, G2.width, G2.height); g2.drawImage(G, 0, 0, G2.width, G2.height);
  lt.globalAlpha = 0.9 * GLOW_K; lt.drawImage(G, 0, 0, Lt.width, Lt.height);
  lt.globalAlpha = 0.8 * GLOW_K; lt.drawImage(G2, 0, 0, Lt.width, Lt.height);
  lt.globalAlpha = 1;
  lap('glow');
  // 真上からの光: 水面のうねりが集めた、大きくぼんやりした明るいむら（2026-10-31 に網目のコースティクス・なしと見くらべて選んだ。
  // 網目は光のもやが生き物の光とまぎれた）
  const rayAt = softLight(ren, lt, Lt, time, 0.04 + 0.12 * world.light);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
  g.drawImage(Lt, 0, 0, ren.cv.width, ren.cv.height);
  g.globalCompositeOperation = 'source-over';

  lap('light');
  // ── 群体を包む寒天質（本物の群体は、細胞のまわりを共有の寒天質がひとかたまりに包む。オオヒゲマワリの球の輪郭もこれ） ──
  // 細胞を少し広げた丸をつなげた形。ふちを少し明るく、中はうすく
  const members = vis.filter(o => o.colN > 1);
  if (members.length) {
    const kG = 0.5, Gl = paper(ren, 'gel', kG), gl = Gl.getContext('2d');
    gl.setTransform(1, 0, 0, 1, 0, 0); gl.globalCompositeOperation = 'source-over'; gl.clearRect(0, 0, Gl.width, Gl.height);
    toWorld(ren, gl, kG);
    const blob = (pad, k) => { gl.beginPath(); for (const o of members) { const R = o.r * k + pad; if (R <= 0) continue; gl.moveTo(o.x + R, o.y); gl.arc(o.x, o.y, R, 0, TAU); } gl.fill(); };   // 引いて見ると内側の半径がマイナスになることがある
    gl.fillStyle = 'rgb(140,215,255)'; blob(2.5, 1.35);
    gl.globalCompositeOperation = 'destination-out'; gl.fillStyle = 'rgba(0,0,0,0.75)'; blob(2.5 - Math.max(0.8, 1.5 / z), 1.35);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.3; g.drawImage(Gl, 0, 0, ren.cv.width, ren.cv.height); g.globalAlpha = 1;
  }
  lap('gel');
  // ── くっきりの光: 藍藻・かけら・柄・群体・節・細胞・核・関節・先 ──
  const gC = glOf(ren, 'glCrisp');
  if (gC) crispGL(gC, ren, world, vis, glow, poses, sel, time, tl, br);
  toWorld(ren, g, dpr);
  if (!gC) {
  // 藍藻: またたく小さな火花（明るさを4段にまとめて描く）
  const ss = Math.max(1.6, 1.8 / z);
  for (let b = 0; b < 4; b++) {
    g.fillStyle = `rgba(${ABYSS.food},${(0.34 + b * 0.1).toFixed(2)})`; g.beginPath();
    for (let i = 0; i < world.fn; i++) {
      const x = world.fx[i], y = world.fy[i];
      if (x < tl.x || x > br.x || y < tl.y || y > br.y || world.fage[i] >= 1e8) continue;
      if ((Math.max(0, Math.sin(time * 2 + i * 1.7)) * 3.99 | 0) !== b) continue;
      g.moveTo(x + ss / 2, y); g.arc(x, y, ss / 2, 0, TAU);   // 藍藻は丸い小さな細胞（四角だと寄ったときカクカクした）
    }
    g.fill();
  }
  // 死んだ体のかけら（消えていく光）
  g.lineCap = 'round'; g.strokeStyle = `rgba(${ABYSS.glow},0.22)`; g.lineWidth = Math.max(0.6 / z, 0.7); g.beginPath();
  for (const p of world.pieces) {
    if (p.x < tl.x || p.x > br.x || p.y < tl.y || p.y > br.y) continue;
    const hx = Math.cos(p.a) * p.len / 2, hy = Math.sin(p.a) * p.len / 2;
    g.moveTo(p.x - hx, p.y - hy); g.lineTo(p.x + hx, p.y + hy);
  }
  g.stroke();
  // 砂つぶにくっついて待つ細胞の柄と、群体のつながり
  g.strokeStyle = 'rgba(110,200,240,0.3)'; g.lineWidth = Math.max(1 / z, 1); g.beginPath();
  for (const o of vis) if (o.anch && o.ax !== undefined) { g.moveTo(o.x, o.y); g.lineTo(o.ax, o.ay); }
  g.stroke();
  g.strokeStyle = 'rgba(120,200,255,0.3)'; g.lineWidth = Math.max(1.4 / z, 1.2); g.beginPath();
  // 細胞どうしをつなぐ細い橋（細胞質の橋）: 膜と膜の間だけ。ふれ合っていれば見えない
  for (const o of vis) for (const q of o.links) if (o.id < q.id) {
    const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (d > o.r + q.r) { g.moveTo(o.x + dx / d * o.r, o.y + dy / d * o.r); g.lineTo(q.x - dx / d * q.r, q.y - dy / d * q.r); }
  }
  g.stroke();
  // 明るさを4段に分けて、同じ段の線をまとめて引く
  const bucket = I => Math.min(3, (I * 4) | 0);
  const segP = [0, 1, 2, 3].map(() => new Path2D()), rimP = [0, 1, 2, 3].map(() => new Path2D()), dotP = new Path2D();
  const lw = Math.max(0.6 / z, 0.7);
  for (const o of vis) {
    if (o === sel) continue;
    const I = glow.get(o), b = bucket(I), r = o.r, P = poses.get(o);
    const a = o.a + (P ? P.wob : 0), ca = Math.cos(a), sa = Math.sin(a);
    if (P) {
      const pts = P.pts, sp = segP[b];
      for (let i = 0; i < o.bp.n; i++) {
        const q = i * 4;
        sp.moveTo(o.x + (ca * pts[q] - sa * pts[q + 1]) * r, o.y + (sa * pts[q] + ca * pts[q + 1]) * r);
        sp.lineTo(o.x + (ca * pts[q + 2] - sa * pts[q + 3]) * r, o.y + (sa * pts[q + 2] + ca * pts[q + 3]) * r);
      }
    }
    if (r * z < 3) continue;
    // 膜は食べる所で切れる
    const mm = a + o.g[GI.mouth], rp = rimP[b];
    // 群体で押し合っている細胞は、ふれた面で膜が平らになる（重なった分だけ。面の場所は2つの丸の半径から）
    const cuts = [];
    if (r * z >= 10) for (const q of o.links) { const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1; if (d < r + q.r) cuts.push(dx / d, dy / d, (d * d + r * r - q.r * q.r) / (2 * d)); }   // 画面で小さいときは平らな面は見えないので、ふつうの輪
    if (!cuts.length) { rp.moveTo(o.x + Math.cos(mm + 0.5) * r, o.y + Math.sin(mm + 0.5) * r); rp.arc(o.x, o.y, r, mm + 0.5, mm - 0.5 + TAU); }
    else for (let k = 0; k <= 28; k++) {
      const t = mm + 0.5 + (TAU - 1) * k / 28;
      let px = Math.cos(t) * r, py = Math.sin(t) * r;
      for (let c = 0; c < cuts.length; c += 3) { const over = px * cuts[c] + py * cuts[c + 1] - cuts[c + 2]; if (over > 0) { px -= cuts[c] * over; py -= cuts[c + 1] * over; } }
      k ? rp.lineTo(o.x + px, o.y + py) : rp.moveTo(o.x + px, o.y + py);
    }
    // 核
    const nx = o.x - ca * r * 0.2, ny = o.y - sa * r * 0.2;
    dotP.moveTo(nx + r * 0.14, ny); dotP.arc(nx, ny, r * 0.14, 0, TAU);
    // 節の先
    if (P && r * z > 5) for (const i of o.bp.tips) { const q = i * 4, x = o.x + (ca * P.pts[q + 2] - sa * P.pts[q + 3]) * r, y = o.y + (sa * P.pts[q + 2] + ca * P.pts[q + 3]) * r, s = Math.max(0.8 / z, r * 0.08); dotP.moveTo(x + s, y); dotP.arc(x, y, s, 0, TAU); }
  }
  for (let b = 0; b < 4; b++) {
    const I = (b + 0.5) / 4;
    g.strokeStyle = `rgba(${ABYSS.glow},${(0.25 + 0.5 * I).toFixed(2)})`; g.lineWidth = lw; g.stroke(segP[b]);
    g.strokeStyle = `rgba(190,245,255,${(0.2 + 0.6 * I).toFixed(2)})`; g.lineWidth = Math.max(lw, 1.1 / z); g.stroke(rimP[b]);
  }
  g.fillStyle = 'rgba(210,250,255,0.75)'; g.fill(dotP);
  // 飼っている藍藻: 細胞の中の緑の点
  g.fillStyle = `rgba(${ABYSS.sym},0.7)`;
  const ds = Math.max(1.2, 1.4 / z);
  const symP = new Path2D();
  for (const o of vis) {
    if (!o.sym) continue;
    const n = Math.min(40, o.sym);
    for (let k = 0; k < n; k++) { const a = o.a + k * 2.39996 + o.id, d = o.r * 0.7 * Math.sqrt((k + 0.5) / n); symP.rect(o.x + Math.cos(a) * d - ds / 2, o.y + Math.sin(a) * d - ds / 2, ds, ds); }
  }
  g.fill(symP);
  // 接合している2匹: 間を結ぶ光の橋（ゆっくり明滅）
  g.strokeStyle = 'rgba(255,220,150,0.8)'; g.lineWidth = Math.max(1.2 / z, 1.5);
  for (const o of vis) {
    const q = o.mate;
    if (!q || q.dead || o.mateT <= 0 || o.id > q.id) continue;
    g.globalAlpha = 0.45 + 0.35 * Math.sin(time * 3 + o.id);
    g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(q.x, q.y); g.stroke();
  }
  g.globalAlpha = 1;
  }

  lap('crisp');
  // 食べた瞬間: 食べた数がふえた生き物の口から、エサが食胞になって体の中へ入り、消化されて薄れる（下の eatFlash）。札の数を前のこまとくらべるだけ（決まりは増やさない。RELEASE.md 4章の6）
  eatFlash(ren, g, vis, time, z);
  // ── 選んだ1匹（琥珀）と、感じる範囲 ──
  if (sel && !sel.dead) {
    const r = sel.r, P = pose(sel, time), a = sel.a + (P ? P.wob : 0), ca = Math.cos(a), sa = Math.sin(a);
    g.strokeStyle = ABYSS.sel; g.lineCap = 'round'; g.lineWidth = Math.max(1 / z, r * 0.07);
    if (P) { g.beginPath(); for (let i = 0; i < sel.bp.n; i++) { const q = i * 4; g.moveTo(sel.x + (ca * P.pts[q] - sa * P.pts[q + 1]) * r, sel.y + (sa * P.pts[q] + ca * P.pts[q + 1]) * r); g.lineTo(sel.x + (ca * P.pts[q + 2] - sa * P.pts[q + 3]) * r, sel.y + (sa * P.pts[q + 2] + ca * P.pts[q + 3]) * r); } g.stroke(); }
    const mm = a + sel.g[GI.mouth];
    g.lineWidth = Math.max(1.2 / z, r * 0.08); g.beginPath(); g.arc(sel.x, sel.y, r, mm + 0.5, mm - 0.5 + TAU); g.stroke();
    g.fillStyle = ABYSS.sel; g.beginPath(); g.arc(sel.x - ca * r * 0.2, sel.y - sa * r * 0.2, r * 0.16, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,200,97,0.55)'; g.lineWidth = 1.4 / z; g.setLineDash([4 / z, 4 / z]); g.lineDashOffset = -time * 6 / z;
    g.beginPath(); g.arc(sel.x, sel.y, sel.g[GI.range] + r, 0, TAU); g.stroke(); g.setLineDash([]);
  }

  lap('sel');
  // 筋の中できらめく粒
  motes(ren, g, time, rayAt);
  lap('motes');
}

// 水の色（どこも同じ紺）と、ふちの暗さ。大きさが変わったときだけ 1/2 の絵に描きなおす
function waterImage(ren) {
  const c = paper(ren, 'water', 0.5);
  if (!c.fresh) return c;
  c.fresh = false;
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.fillStyle = WATER; g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  return c;
}

// やわらかい明暗: 水面のうねりが光を集めた、大きくぼんやりした明るいむら（一滴の側に付き、ゆっくり動く）
function softLight(ren, lt, Lt, time, A) {
  const c = ren.cam, z = c.z, blobs = [];
  for (let i = 0; i < 9; i++) {
    const x = (h01(i + 3) * 1.2 - 0.1) * W + Math.sin(time * 0.03 + i * 1.9) * 160, y = (h01(i + 9) * 1.2 - 0.1) * H + Math.cos(time * 0.025 + i * 2.3) * 120;
    const R = 260 + 340 * h01(i + 5), I = A * (0.55 + 0.45 * Math.sin(time * 0.15 + i * 2.7));
    blobs.push({ x, y, R, I });
  }
  // むらはゆっくりしか動かないので、1/8 の小さな紙に描き、カメラが動いたときか 6 こまに 1 回だけ描きなおして、引きのばして重ねる
  const S = paper(ren, 'soft', 0.125), sg = S.getContext('2d'), key = `${c.x},${c.y},${z},${S.width}`;
  ren.softN = (ren.softN || 0) + 1;
  if (S.fresh || ren.softKey !== key || ren.softN % 6 === 0) {
    S.fresh = false; ren.softKey = key;
    const k = S.width / ren.w;
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, S.width, S.height);
    sg.setTransform(k * z, 0, 0, k * z, k * (ren.w / 2 - c.x * z), k * (ren.h / 2 - c.y * z));
    for (const b of blobs) {
      const gr = sg.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.R);
      gr.addColorStop(0, `rgba(170,215,240,${b.I.toFixed(3)})`); gr.addColorStop(1, 'rgba(170,215,240,0)');
      sg.fillStyle = gr; sg.fillRect(b.x - b.R, b.y - b.R, b.R * 2, b.R * 2);
    }
  }
  lt.setTransform(1, 0, 0, 1, 0, 0); lt.drawImage(S, 0, 0, Lt.width, Lt.height);
  return (sx, sy) => {   // 画面の場所の明るさ（ちりのきらめき用）
    const wx = (sx - ren.w / 2) / z + c.x, wy = (sy - ren.h / 2) / z + c.y;
    let s = 0; for (const b of blobs) { const q = Math.hypot(wx - b.x, wy - b.y) / b.R; if (q < 1) s += b.I * (1 - q); }
    return s;
  };
}

// 漂う粒（マリンスノー）。光の網目の明るい所でだけきらめく。画面の側の粒で、カメラが動くと少し流れる
function motes(ren, g, time, rayAt) {
  const sn = ren.snow || (ren.snow = Array.from({ length: 60 }, (_, i) => ({ x: h01(i * 3 + 1), y: h01(i * 5 + 2), k: 0.3 + h01(i * 7 + 3) * 0.9, p: h01(i) * TAU })));
  const w = ren.w, h = ren.h, c = ren.cam;
  g.setTransform(ren.dpr, 0, 0, ren.dpr, 0, 0);
  for (const f of sn) {
    const x = ((f.x * w + Math.sin(time * 0.4 + f.p) * 8 - c.x * c.z * f.k * 0.15) % w + w) % w;
    const y = ((f.y * h + Math.cos(time * 0.3 + f.p * 1.3) * 8 - c.y * c.z * f.k * 0.15) % h + h) % h;   // 真上から見ているので、沈む粒は画面の下へ流れない
    const lit = rayAt(x, y) * (0.6 + 0.4 * Math.sin(time * 3 + f.p * 5));
    g.fillStyle = `rgba(${lit > 0.02 ? '235,250,255' : '200,225,240'},${Math.min(0.9, 0.1 * (0.4 + 0.6 * f.k) + lit * 5).toFixed(2)})`;
    g.beginPath(); g.arc(x, y, 0.5 + f.k * 1.1 + Math.min(1.5, lit * 3), 0, TAU); g.fill();
  }
}

// 食胞: 本物の鞭毛虫・繊毛虫は、口のくぼみからエサをのみこむと、膜の袋（食胞）にくるんで体の中をめぐらせ、消化して小さく・茶色っぽくしていく
// （ゾウリムシに墨の粒を食べさせて見る食胞と同じ）。食べた数がふえた生き物の口から点が中へ入り、体の中をゆっくり回りながら薄れて消える。
// 藍藻は緑の小さな食胞、狩った相手は琥珀色の大きな食胞。飼っている藍藻（明るい緑の四角・消えない）とまぎれないよう、くすんだ丸にする
const VAC_IN = 0.35, VAC_DIGEST = { alga: 6, prey: 9 };
function eatFlash(ren, g, vis, time, z) {
  const prev = ren.eatPrev || (ren.eatPrev = new Map()), vs = ren.flashes || (ren.flashes = []), now = new Map();
  for (const o of vis) {
    const p = prev.get(o.id);
    if (p && vs.length < 900) {
      const hunt = o.prey > p[1], n = Math.min(3, hunt ? 1 : o.ate - p[0]);
      for (let i = 0; i < n; i++) vs.push({ o, t0: time + i * 0.12, hunt, ma: o.g[GI.mouth], spin: (o.id % 2 ? 1 : -1) * (0.25 + (o.id % 5) * 0.05), d: 0.35 + ((o.id * 7 + vs.length) % 10) / 40 });
    }
    now.set(o.id, [o.ate, o.prey]);
  }
  ren.eatPrev = now;
  let k = 0;
  for (const v of vs) {
    const o = v.o, age = time - v.t0, life = VAC_IN + VAC_DIGEST[v.hunt ? 'prey' : 'alga'];
    if (o.dead || age >= life) continue;
    vs[k++] = v;
    if (age < 0 || o.r * z < 3) continue;
    // 体に対する場所: 口の外 → 口の内側 → 体の中をゆっくり回る（原形質流動）
    let ang, rad;
    if (age < VAC_IN) { const u = age / VAC_IN, e = u * u * (3 - 2 * u); ang = v.ma; rad = 1.15 - (1.15 - v.d) * e; }
    else { const t = age - VAC_IN; ang = v.ma + v.spin * t; rad = v.d * (1 - 0.25 * Math.min(1, t / 3)); }
    const a = o.a + ang, x = o.x + Math.cos(a) * o.r * rad, y = o.y + Math.sin(a) * o.r * rad;
    // 消化: だんだん小さく、緑（琥珀）から茶色へ、最後は消える
    const dig = Math.max(0, age - VAC_IN) / VAC_DIGEST[v.hunt ? 'prey' : 'alga'];
    const R = o.r * (v.hunt ? 0.3 : 0.16) * (1 - 0.55 * dig), A = (age < VAC_IN ? 0.9 : 0.75) * (1 - dig * dig);
    const c0 = v.hunt ? [255, 200, 97] : [140, 225, 120], c1 = [150, 115, 70];
    const c = c0.map((q, j) => Math.round(q + (c1[j] - q) * Math.min(1, dig * 1.4)));
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(A * 0.55).toFixed(2)})`;
    g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${A.toFixed(2)})`; g.lineWidth = Math.max(0.6 / z, R * 0.18);
    g.beginPath(); g.arc(x, y, Math.max(0.8 / z, R), 0, TAU); g.fill(); g.stroke();
  }
  vs.length = k;
}
// くっきりの光を WebGL で（2D の描き方と同じ形・同じ色。上の if (!gC) の中と対になっている）
function crispGL(gC, ren, world, vis, glow, poses, sel, time, tl, br) {
  const c = ren.cam, z = c.z, cv = ren.cv, PF = ren.prof; let t0 = performance.now();
  const sub = k => { const n = performance.now(); PF[k] = (PF[k] || 0) * 0.9 + (n - t0) * 0.1; t0 = n; };
  gC.begin(cv.width, cv.height, c.x, c.y, z * ren.dpr);
  // 藍藻: またたく小さな火花
  const ss = Math.max(1.6, 1.8 / z);
  for (let i = 0; i < world.fn; i++) {
    const x = world.fx[i], y = world.fy[i];
    if (x < tl.x || x > br.x || y < tl.y || y > br.y || world.fage[i] >= 1e8) continue;
    const b = Math.max(0, Math.sin(time * 2 + i * 1.7)) * 3.99 | 0;
    gC.disc(x, y, ss / 2, rgba(ABYSS.food, 0.34 + b * 0.1));
  }
  // 死んだ体のかけら
  const lp = Math.max(0.6 / z, 0.7), cp = rgba(ABYSS.glow, 0.22);
  for (const p of world.pieces) {
    if (p.x < tl.x || p.x > br.x || p.y < tl.y || p.y > br.y) continue;
    const hx = Math.cos(p.a) * p.len / 2, hy = Math.sin(p.a) * p.len / 2;
    gC.seg(p.x - hx, p.y - hy, p.x + hx, p.y + hy, lp, cp);
  }
  // 柄と、細胞どうしの橋
  const cs = rgba('110,200,240', 0.3), cl = rgba('120,200,255', 0.3), ws = Math.max(1 / z, 1), wl = Math.max(1.4 / z, 1.2);
  for (const o of vis) if (o.anch && o.ax !== undefined) gC.seg(o.x, o.y, o.ax, o.ay, ws, cs);
  for (const o of vis) for (const q of o.links) if (o.id < q.id) {
    const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (d > o.r + q.r) gC.seg(o.x + dx / d * o.r, o.y + dy / d * o.r, q.x - dx / d * q.r, q.y - dy / d * q.r, wl, cl);
  }
  // 節・膜・核・先（明るさは 4 段）
  const lw = Math.max(0.6 / z, 0.7), rw = Math.max(lw, 1.1 / z);
  const segC = [0, 1, 2, 3].map(b => rgba(ABYSS.glow, 0.25 + 0.5 * (b + 0.5) / 4)), rimC = [0, 1, 2, 3].map(b => rgba('190,245,255', 0.2 + 0.6 * (b + 0.5) / 4)), dotC = rgba('210,250,255', 0.75);
  for (const o of vis) {
    if (o === sel) continue;
    const I = glow.get(o), b = Math.min(3, (I * 4) | 0), r = o.r, P = poses.get(o);
    const a = o.a + (P ? P.wob : 0), ca = Math.cos(a), sa = Math.sin(a);
    if (P) {
      const pts = P.pts;
      for (let i = 0; i < o.bp.n; i++) {
        const q = i * 4;
        gC.seg(o.x + (ca * pts[q] - sa * pts[q + 1]) * r, o.y + (sa * pts[q] + ca * pts[q + 1]) * r, o.x + (ca * pts[q + 2] - sa * pts[q + 3]) * r, o.y + (sa * pts[q + 2] + ca * pts[q + 3]) * r, lw, segC[b]);
      }
    }
    if (r * z < 3) continue;
    const mm = a + o.g[GI.mouth];
    const cuts = [];
    if (r * z >= 10) for (const q of o.links) { const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1; if (d < r + q.r) cuts.push(dx / d, dy / d, (d * d + r * r - q.r * q.r) / (2 * d)); }   // 画面で小さいときは平らな面は見えないので、ふつうの輪
    if (!cuts.length) gC.ring(o.x, o.y, r, rw, mm, 0.5, rimC[b]);
    else {
      let lx = 0, ly = 0;
      for (let k = 0; k <= 28; k++) {
        const t = mm + 0.5 + (TAU - 1) * k / 28;
        let px = Math.cos(t) * r, py = Math.sin(t) * r;
        for (let j = 0; j < cuts.length; j += 3) { const over = px * cuts[j] + py * cuts[j + 1] - cuts[j + 2]; if (over > 0) { px -= cuts[j] * over; py -= cuts[j + 1] * over; } }
        if (k) gC.seg(o.x + lx, o.y + ly, o.x + px, o.y + py, rw, rimC[b], true);
        lx = px; ly = py;
      }
    }
    gC.disc(o.x - ca * r * 0.2, o.y - sa * r * 0.2, r * 0.14, dotC);
    if (P && r * z > 5) for (const i of o.bp.tips) { const q = i * 4; gC.disc(o.x + (ca * P.pts[q + 2] - sa * P.pts[q + 3]) * r, o.y + (sa * P.pts[q + 2] + ca * P.pts[q + 3]) * r, Math.max(0.8 / z, r * 0.08), dotC); }
  }
  // 飼っている藍藻
  const ds = Math.max(1.2, 1.4 / z), sc = rgba(ABYSS.sym, 0.7);
  for (const o of vis) {
    if (!o.sym) continue;
    const n = Math.min(40, o.sym);
    for (let k = 0; k < n; k++) { const a = o.a + k * 2.39996 + o.id, d = o.r * 0.7 * Math.sqrt((k + 0.5) / n); gC.square(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, ds, sc); }
  }
  // 接合している2匹の橋
  const wm = Math.max(1.2 / z, 1.5);
  for (const o of vis) {
    const q = o.mate;
    if (!q || q.dead || o.mateT <= 0 || o.id > q.id) continue;
    gC.seg(o.x, o.y, q.x, q.y, wm, [1, 0.863, 0.588, 0.8 * (0.45 + 0.35 * Math.sin(time * 3 + o.id))]);
  }
  sub('crisp_build');
  gC.flush(false);
  sub('crisp_gpu');
  // 絵は 2D の画面にうつさず、すぐ上に重ねたキャンバスとしてブラウザに重ねてもらう（うつすと GPU から読みもどして重かった）
  const L = gC.canvas;
  if (!L.isConnected) {
    L.setAttribute('aria-hidden', 'true');
    Object.assign(L.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: getComputedStyle(cv).zIndex });
    cv.after(L);
  }
  if (L.style.width !== cv.style.width || L.style.height !== cv.style.height) { L.style.width = cv.style.width; L.style.height = cv.style.height; }
  sub('crisp_copy');
}
