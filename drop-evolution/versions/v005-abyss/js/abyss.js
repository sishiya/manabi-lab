// 造形「深海の発光」（F3 元気で光る・航跡。2026-10-31 ユーザーが look/ から選んだ）
// 暗い紺の水に、生き物そのものが青くやわらかく光る。腹ぺこは暗く、満ちると息づく。泳いだあとに光の糸が残る。
// 真上から見ているので、太陽の光は見る向きと同じ向きに降りる。水面のうねりが集めた大きな明るいむらがゆっくり動く。明るさは「光」の強さで変わる。
// 軽くするしくみ: ぼかし（filter）は使わない。航跡（1/2）・光のにじみ（1/4・1/8）・光の筋（1/8）は小さい紙に描き、1/2 の「光の紙」にまとめてから
// 画面へは1回だけ引きのばして足す。水の色とふちの暗さは作り置きの絵。光る丸も作り置きの絵。くっきりの線は明るさ4段でまとめて引く
import { W, H, GI } from './sim.js';
import { FRAMES } from './body.js';

const TAU = Math.PI * 2;
const HUE = 188;
export const ABYSS = { ink: '#bfefff', glow: '120,225,255', food: '90,255,210', sym: '120,255,170', poo: 'rgba(150,120,90,A)', sel: '#ffc861' };
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
  const ph = ((time * Math.min(1 / o.b.T, 2.5) + o.id * 0.37) % 1) * FRAMES, f0 = ph | 0, k = ph - f0;
  const A = B.frames[f0], Bf = B.frames[(f0 + 1) % FRAMES];
  if (PTS.length < A.pts.length) PTS = new Float32Array(A.pts.length * 2);
  for (let i = 0; i < A.pts.length; i++) PTS[i] = A.pts[i] + (Bf.pts[i] - A.pts[i]) * k;
  return { pts: PTS, wob: A.w + (Bf.w - A.w) * k };
}

export function drawAbyss(ren, world, sel, time) {
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
  if (world.sandCache?.g !== g) {
    world.sandCache = { g, list: (world.sandGroups || (world.grains || []).map((q, i) => ({ x: q.x, y: q.y, R: q.r, el: 1, parts: [i] }))).map(G => {
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
    const dt = Math.min(0.2, Math.max(0, time - (ren.wakeT ?? time)));
    ren.wakeKeep = (ren.wakeKeep ?? 1) * Math.pow(0.5, dt / WAKE_HALF);
    if (ren.wakeKeep < 0.7) {
      wk.globalCompositeOperation = 'destination-out';
      wk.fillStyle = `rgba(0,0,0,${(1 - ren.wakeKeep).toFixed(3)})`; wk.fillRect(0, 0, Wk.width, Wk.height);
      ren.wakeKeep = 1;
    }
  } else { wk.clearRect(0, 0, Wk.width, Wk.height); ren.wakePrev = null; }
  wk.globalCompositeOperation = 'source-over'; Wk.fresh = false; ren.wakeCam = { x: c.x, y: c.y, z }; ren.wakeT = time;
  toWorld(ren, wk, kw); wk.lineCap = 'round';
  const prev = ren.wakePrev || new Map(), next = new Map();
  const body = new Path2D(), tipsP = new Path2D();
  for (const o of vis) {
    const p = prev.get(o.id);
    next.set(o.id, [o.x, o.y]);
    if (p && !o.anch && Math.abs(p[0] - o.x) < 25 && Math.abs(p[1] - o.y) < 25) { body.moveTo(p[0], p[1]); body.lineTo(o.x, o.y); }
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
      if (pp && Math.abs(pp[0] - x) < 25 && Math.abs(pp[1] - y) < 25) { tipsP.moveTo(pp[0], pp[1]); tipsP.lineTo(x, y); }
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

  // ── 光のにじみ（1/4 の紙に光る丸と節を描き、さらに 1/8 にして、それぞれ引きのばして重ねる） ──
  const kg = 0.25, G = paper(ren, 'glow', kg), gg = G.getContext('2d');
  gg.setTransform(1, 0, 0, 1, 0, 0); gg.globalCompositeOperation = 'source-over'; gg.clearRect(0, 0, G.width, G.height);
  toWorld(ren, gg, kg); gg.globalCompositeOperation = 'lighter';
  const spr = glowSprite();
  for (const o of vis) {
    const I = glow.get(o), R = Math.max(o.r * 2.4, 6 / z);
    gg.globalAlpha = Math.min(1, 0.08 + I * 0.9); gg.drawImage(spr, o.x - R, o.y - R, R * 2, R * 2);
  }
  gg.globalAlpha = 1;
  // 死んだときの光（ふくらんで消える輪）
  ren.trackGhosts(world, time);
  for (const gh of ren.ghosts) {
    const k = (time - gh.t) / 1.6, R = gh.r * (1 + k * 2.5);
    gg.globalAlpha = 0.5 * (1 - k); gg.drawImage(spr, gh.x - R, gh.y - R, R * 2, R * 2);
  }
  gg.globalAlpha = 1;
  const G2 = paper(ren, 'glow2', 0.125), g2 = G2.getContext('2d');
  g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, G2.width, G2.height); g2.drawImage(G, 0, 0, G2.width, G2.height);
  lt.globalAlpha = 0.9 * GLOW_K; lt.drawImage(G, 0, 0, Lt.width, Lt.height);
  lt.globalAlpha = 0.8 * GLOW_K; lt.drawImage(G2, 0, 0, Lt.width, Lt.height);
  lt.globalAlpha = 1;
  // 真上からの光: 水面のうねりが集めた、大きくぼんやりした明るいむら（2026-10-31 に網目のコースティクス・なしと見くらべて選んだ。
  // 網目は光のもやが生き物の光とまぎれた）
  const rayAt = softLight(ren, lt, Lt, time, 0.04 + 0.12 * world.light);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
  g.drawImage(Lt, 0, 0, ren.cv.width, ren.cv.height);
  g.globalCompositeOperation = 'source-over';

  // ── くっきりの光: 藍藻・かけら・柄・群体・節・細胞・核・関節・先 ──
  toWorld(ren, g, dpr);
  // 藍藻: またたく小さな火花（明るさを4段にまとめて描く）
  const ss = Math.max(1.6, 1.8 / z);
  for (let b = 0; b < 4; b++) {
    g.fillStyle = `rgba(${ABYSS.food},${(0.3 + b * 0.13).toFixed(2)})`; g.beginPath();
    for (let i = 0; i < world.fn; i++) {
      const x = world.fx[i], y = world.fy[i];
      if (x < tl.x || x > br.x || y < tl.y || y > br.y || world.fage[i] >= 1e8) continue;
      if ((Math.max(0, Math.sin(time * 2 + i * 1.7)) * 3.99 | 0) !== b) continue;
      g.rect(x - ss / 2, y - ss / 2, ss, ss);
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
  for (const o of vis) for (const q of o.links) if (o.id < q.id) { g.moveTo(o.x, o.y); g.lineTo(q.x, q.y); }
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
    rp.moveTo(o.x + Math.cos(mm + 0.5) * r, o.y + Math.sin(mm + 0.5) * r); rp.arc(o.x, o.y, r, mm + 0.5, mm - 0.5 + TAU);
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

  // 筋の中できらめく粒
  motes(ren, g, time, rayAt);
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
  const c = ren.cam, z = c.z, k = Lt.width / ren.w, blobs = [];
  lt.setTransform(k * z, 0, 0, k * z, k * (ren.w / 2 - c.x * z), k * (ren.h / 2 - c.y * z));
  for (let i = 0; i < 9; i++) {
    const x = (h01(i + 3) * 1.2 - 0.1) * W + Math.sin(time * 0.03 + i * 1.9) * 160, y = (h01(i + 9) * 1.2 - 0.1) * H + Math.cos(time * 0.025 + i * 2.3) * 120;
    const R = 260 + 340 * h01(i + 5), I = A * (0.55 + 0.45 * Math.sin(time * 0.15 + i * 2.7));
    const gr = lt.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, `rgba(170,215,240,${I.toFixed(3)})`); gr.addColorStop(1, 'rgba(170,215,240,0)');
    lt.fillStyle = gr; lt.fillRect(x - R, y - R, R * 2, R * 2);
    blobs.push({ x, y, R, I });
  }
  lt.setTransform(1, 0, 0, 1, 0, 0);
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
