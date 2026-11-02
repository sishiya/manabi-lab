// 顕微鏡の視野を描く（明視野。暖かい光・ピントの外のちり・半透明の細胞）
import { W, H, GI } from './sim.js';
import { FRAMES } from './body.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.cam = { x: W / 2, y: H / 2, z: 0.5 };
    this.dpr = 1;
    this.ghosts = [];          // 消えた生き物のなごり { x, y, r, hue, t, eaten }
    this.prev = new Map();     // id -> { x, y, r, hue }
    this.dust = [];
    const rnd = mulberry(99);
    for (let i = 0; i < 46; i++) this.dust.push({ x: rnd() * W * 1.2 - W * 0.1, y: rnd() * H * 1.2 - H * 0.1, r: 8 + rnd() * 40, k: 0.4 + rnd() * 0.5, a: 0.08 + rnd() * 0.12 });
    this.dustSprite = makeDustSprite();
  }

  resize(w, h, dpr) {
    this.dpr = dpr; this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    this.vignette = null;
  }

  fitZoom() { return Math.min(this.w / (W * 1.04), this.h / (H * 1.04)); }

  toWorld(sx, sy) { const c = this.cam; return { x: (sx - this.w / 2) / c.z + c.x, y: (sy - this.h / 2) / c.z + c.y }; }

  draw(world, sel, time) {
    if (this.style && this.style !== 'scope') return this.drawMech(world, sel, time);
    const g = this.cx, c = this.cam, z = c.z, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 背景（光の当たる左上ほど明るい）
    const tl = this.toWorld(0, 0), br = this.toWorld(this.w, this.h);
    g.fillStyle = '#2a2620'; g.fillRect(0, 0, this.w, this.h);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.w / 2 - c.x * z), dpr * (this.h / 2 - c.y * z));
    const L = world.light;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, mixc([238, 228, 200], [214, 216, 210], 1 - L));
    bg.addColorStop(1, mixc([201, 186, 150], [168, 168, 162], 1 - L));
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 奥のピントの外のちり
    this.drawDust(g, 0.55, false);
    // 細菌
    this.drawFood(world, g, z, tl, br);
    this.drawPieces(world, g, z, 'hsla(30,25%,35%,A)');
    // 生き物
    this.trackGhosts(world, time);
    for (const gh of this.ghosts) this.drawGhost(g, gh, time);
    const pad = 60;
    for (const o of world.orgs) {
      if (o.x < tl.x - pad || o.x > br.x + pad || o.y < tl.y - pad || o.y > br.y + pad) continue;
      this.drawOrg(g, o, z, time, o === sel);
    }
    if (sel && !sel.dead) this.drawSelection(g, sel, z, time);
    // ふちの影
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawDust(g, 1.25, true);
    if (!this.vignette) {
      const v = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.42, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * 0.58);
      v.addColorStop(0, 'rgba(30,24,16,0)'); v.addColorStop(1, 'rgba(30,24,16,0.55)');
      this.vignette = v;
    }
    g.fillStyle = this.vignette; g.fillRect(0, 0, this.w, this.h);
  }

  drawDust(g, k, front) {
    const c = this.cam;
    for (const d of this.dust) {
      if ((d.k > 0.7) !== front) continue;
      let x, y, r;
      if (front) {                    // 手前（大きくぼけて、速く流れる）
        x = (d.x - c.x) * c.z * k + this.w / 2; y = (d.y - c.y) * c.z * k + this.h / 2; r = d.r * 2.2 * c.z * k + 20;
      } else { x = d.x + (c.x - d.x) * (1 - k) * 0.3; y = d.y + (c.y - d.y) * (1 - k) * 0.3; r = d.r; }
      g.globalAlpha = d.a * (front ? 0.6 : 1);
      g.drawImage(this.dustSprite, x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }

  drawFood(world, g, z, tl, br) {
    const n = world.fn, fx = world.fx, fy = world.fy, age = world.fage;
    g.fillStyle = 'rgba(52,120,110,0.75)';
    if (z < 0.9) {
      const s = Math.max(1.6 / z, 2.2);
      for (let i = 0; i < n; i++) {
        const x = fx[i], y = fy[i];
        if (x < tl.x || x > br.x || y < tl.y || y > br.y) continue;
        g.fillRect(x - s / 2, y - s / 2, s, s);
      }
      return;
    }
    // 寄ったら棒の形の細菌（向きは場所から決める）
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = fx[i], y = fy[i];
      if (x < tl.x - 3 || x > br.x + 3 || y < tl.y - 3 || y > br.y + 3) continue;
      if (age[i] >= 1e8) continue;
      const a = hash(x, y) * TAU, ca = Math.cos(a) * 1.3, sa = Math.sin(a) * 1.3;
      g.moveTo(x - ca, y - sa); g.lineTo(x + ca, y + sa);
    }
    g.strokeStyle = 'rgba(52,120,110,0.8)'; g.lineWidth = 1.1; g.lineCap = 'round'; g.stroke();
  }

  trackGhosts(world, time) {
    const now = new Map();
    for (const o of world.orgs) now.set(o.id, o);
    for (const [id, p] of this.prev) if (!now.has(id)) this.ghosts.push({ ...p, t: time });
    this.prev.clear();
    for (const o of world.orgs) this.prev.set(o.id, { x: o.x, y: o.y, r: o.r, hue: o.g[GI.hue], a: o.a });
    this.ghosts = this.ghosts.filter(gh => time - gh.t < 1.6);
  }

  drawGhost(g, gh, time) {
    const k = (time - gh.t) / 1.6;
    g.strokeStyle = `hsla(${gh.hue},30%,30%,${0.35 * (1 - k)})`;
    g.lineWidth = 0.8;
    g.beginPath(); g.arc(gh.x, gh.y, gh.r * (1 + k * 0.6), 0, TAU); g.stroke();
  }

  drawOrg(g, o, z, time, selected) {
    const gn = o.g, r = o.r, hue = gn[GI.hue], px = r * z;
    const chl = gn[GI.pig], P = o.bp;
    // 節の形のこま。打つ動きは速いので、画面では 1 秒に 2.5 回までに落として描く
    let pts = null, wob = 0;
    if (P.n) {
      const ph = ((time * Math.min(1 / o.b.T, 2.5) + o.id * 0.37) % 1) * FRAMES, f0 = ph | 0, k = ph - f0;
      const A = P.frames[f0], B = P.frames[(f0 + 1) % FRAMES];
      pts = SEG.length < A.pts.length ? (SEG = new Float32Array(A.pts.length * 2)) : SEG;
      for (let i = 0; i < A.pts.length; i++) pts[i] = A.pts[i] + (B.pts[i] - A.pts[i]) * k;
      wob = A.w + (B.w - A.w) * k;
    }
    if (px < 3.2) {                       // 遠いときは点と線で
      if (pts && P.reach * px > 5) this.drawSegs(g, o, pts, wob, z, hue, true);
      g.fillStyle = `hsla(${hue},40%,${chl > 0.4 ? 38 : 42}%,0.85)`;
      g.beginPath(); g.arc(o.x, o.y, Math.max(r, 2.6 / z), 0, TAU); g.fill();
      return;
    }
    if (pts) this.drawSegs(g, o, pts, wob, z, hue, false);
    const wb = 1 + 0.04 * Math.sin(time * 1.7 + o.id);
    const a = o.a + wob;
    const rx = r * wb, ry = r / wb;
    g.save();
    g.translate(o.x, o.y); g.rotate(a);
    // 体
    const body = g.createRadialGradient(-rx * 0.3, -ry * 0.35, r * 0.1, 0, 0, rx);
    body.addColorStop(0, `hsla(${hue},35%,88%,0.7)`);
    body.addColorStop(0.75, `hsla(${hue},40%,66%,0.62)`);
    body.addColorStop(1, `hsla(${hue},42%,48%,0.75)`);
    g.fillStyle = body;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
    if (px > 6) {
      // 食胞（食べたものの粒）。生き物を食べたことがあるものは大きな粒
      const nV = Math.min(6, 1 + (o.ate % 7));
      for (let i = 0; i < nV; i++) {
        const t = hash(o.id, i) * TAU, d = 0.25 + hash(i, o.id) * 0.4;
        g.fillStyle = 'rgba(110,84,44,0.45)';
        g.beginPath(); g.arc(Math.cos(t) * rx * d, Math.sin(t) * ry * d, r * (i === 0 && o.prey ? 0.2 : 0.09), 0, TAU); g.fill();
      }
      // 葉緑体
      const nP = Math.round(chl * 16);
      for (let i = 0; i < nP; i++) {
        const t = hash(i * 3.1, o.id) * TAU, d = 0.2 + hash(o.id * 1.7, i) * 0.6;
        g.fillStyle = 'rgba(70,126,48,0.8)';
        g.beginPath(); g.ellipse(Math.cos(t) * rx * d, Math.sin(t) * ry * d, r * 0.12, r * 0.07, t, 0, TAU); g.fill();
      }
      // 核
      g.fillStyle = `hsla(${hue},28%,40%,0.5)`;
      g.beginPath(); g.ellipse(-rx * 0.15, ry * 0.1, r * 0.28, r * 0.22, 0.3, 0, TAU); g.fill();
      g.fillStyle = `hsla(${hue},30%,28%,0.5)`;
      g.beginPath(); g.arc(-rx * 0.13, ry * 0.08, r * 0.08, 0, TAU); g.fill();
      // 収縮胞（ふくらんでしぼむ）
      const cv = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(time * 2 + o.id));
      g.fillStyle = 'rgba(250,250,240,0.6)';
      g.beginPath(); g.arc(-rx * 0.55, -ry * 0.3, r * cv, 0, TAU); g.fill();
    }
    // 膜
    g.strokeStyle = `hsla(${hue},35%,26%,${selected ? 0.95 : 0.7})`;
    g.lineWidth = Math.max(0.5, 1.1 / z);
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.stroke();
    // つやの光
    g.strokeStyle = 'rgba(255,255,250,0.5)'; g.lineWidth = Math.max(0.4, 0.9 / z);
    g.beginPath(); g.ellipse(0, 0, rx * 0.84, ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    g.restore();
  }

  // 節: 根もとが太く先が細い半透明の棒。関節に小さな節目、先に丸み
  drawSegs(g, o, pts, wob, z, hue, far) {
    const r = o.r, a = o.a + wob, c = Math.cos(a), s = Math.sin(a), n = o.bp.n, segs = o.b.segs;
    const X = (lx, ly) => o.x + (c * lx - s * ly) * r, Y = (lx, ly) => o.y + (s * lx + c * ly) * r;
    g.lineCap = 'round';
    if (far) {
      g.strokeStyle = `hsla(${hue},30%,32%,0.6)`; g.lineWidth = Math.max(0.6 / z, r * 0.15);
      g.beginPath();
      for (let i = 0; i < n; i++) { const q = i * 4; g.moveTo(X(pts[q], pts[q + 1]), Y(pts[q], pts[q + 1])); g.lineTo(X(pts[q + 2], pts[q + 3]), Y(pts[q + 2], pts[q + 3])); }
      g.stroke();
      return;
    }
    // 根もとから先へ細くなる形（台形）。外がわに膜の線、中は半透明
    const ol = Math.max(0.5, 1.1 / z);
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass ? `hsla(${hue},32%,80%,0.8)` : `hsla(${hue},35%,26%,0.5)`;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const q = i * 4, dep = segDepth(segs, i), kids = hasKid(segs, i);
        const w0 = r * Math.max(0.07, 0.15 - dep * 0.03) + (pass ? 0 : ol), w1 = (kids ? r * Math.max(0.07, 0.12 - dep * 0.03) : r * 0.035) + (pass ? 0 : ol);
        const ax = X(pts[q], pts[q + 1]), ay = Y(pts[q], pts[q + 1]), bx = X(pts[q + 2], pts[q + 3]), by = Y(pts[q + 2], pts[q + 3]);
        const L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L, ny = (bx - ax) / L;
        g.moveTo(ax + nx * w0, ay + ny * w0); g.lineTo(bx + nx * w1, by + ny * w1);
        g.lineTo(bx - nx * w1, by - ny * w1); g.lineTo(ax - nx * w0, ay - ny * w0); g.closePath();
        g.moveTo(bx + w1, by); g.arc(bx, by, w1, 0, TAU, true);   // 台形と同じまわり向き（重なりに穴があかない）
        g.moveTo(ax + w0, ay); g.arc(ax, ay, w0, 0, TAU, true);
      }
      g.fill();
    }
    if (r * z > 5) {                      // 関節の節目
      g.fillStyle = `hsla(${hue},30%,34%,0.55)`;
      for (let i = 0; i < n; i++) if (segs[i].p >= 0) { const q = i * 4; g.beginPath(); g.arc(X(pts[q], pts[q + 1]), Y(pts[q], pts[q + 1]), r * 0.07, 0, TAU); g.fill(); }
    }
  }

  // 死んだ体のかけら（細胞は弧、節は棒）。のこりのエネルギーで薄れる
  drawPieces(world, g, z, col, w = 1) {
    for (const p of world.pieces) {
      const k = Math.max(0.15, p.e / p.e0), hx = Math.cos(p.a) * p.len / 2, hy = Math.sin(p.a) * p.len / 2;
      g.strokeStyle = col.replace('A', (0.7 * k).toFixed(2)); g.lineWidth = Math.max(0.6 / z, p.s * (p.kind ? 1.2 : 0.5)) * w;
      g.beginPath();
      if (p.kind) { g.moveTo(p.x - hx, p.y - hy); g.lineTo(p.x + hx, p.y + hy); }
      else g.arc(p.x - Math.cos(p.a) * p.s, p.y - Math.sin(p.a) * p.s, p.len * 0.7, p.a - 0.9, p.a + 0.9);
      g.stroke();
    }
  }

  // ── 機械の造形（見くらべの案）: 細胞は輪、節はまっすぐな棒、関節はピン ──
  drawMech(world, sel, time) {
    const st = this.style, P = MECH[st], g = this.cx, c = this.cam, z = c.z, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (st === 'phosphor') { g.fillStyle = 'rgba(3,7,5,0.42)'; g.fillRect(0, 0, this.w, this.h); }   // 残像
    else { g.fillStyle = P.out; g.fillRect(0, 0, this.w, this.h); }
    const tl = this.toWorld(0, 0), br = this.toWorld(this.w, this.h);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.w / 2 - c.x * z), dpr * (this.h / 2 - c.y * z));
    if (st !== 'phosphor') { g.fillStyle = P.bg; g.fillRect(0, 0, W, H); }
    // 方眼（20 µm と 100 µm）
    for (const [step, col] of [[20, P.grid1], [100, P.grid2]]) {
      if (step * z < 6) continue;
      g.strokeStyle = col; g.lineWidth = 1 / z; g.beginPath();
      for (let x = Math.max(0, Math.ceil(tl.x / step) * step); x <= Math.min(W, br.x); x += step) { g.moveTo(x, Math.max(0, tl.y)); g.lineTo(x, Math.min(H, br.y)); }
      for (let y = Math.max(0, Math.ceil(tl.y / step) * step); y <= Math.min(H, br.y); y += step) { g.moveTo(Math.max(0, tl.x), y); g.lineTo(Math.min(W, br.x), y); }
      g.stroke();
    }
    g.strokeStyle = P.grid2; g.lineWidth = 2 / z; g.strokeRect(0, 0, W, H);
    // 藍藻: 点
    g.fillStyle = P.food;
    const fs = Math.max(1.4, 1.8 / z);
    for (let i = 0; i < world.fn; i++) {
      const x = world.fx[i], y = world.fy[i];
      if (x < tl.x || x > br.x || y < tl.y || y > br.y || world.fage[i] >= 1e8) continue;
      g.fillRect(x - fs / 2, y - fs / 2, fs, fs);
    }
    this.drawPieces(world, g, z, P.piece, 0.6);
    this.trackGhosts(world, time);
    for (const gh of this.ghosts) {
      const k = (time - gh.t) / 1.6;
      g.strokeStyle = P.dim; g.globalAlpha = Math.max(0, 1 - k); g.lineWidth = 1 / z;
      g.beginPath(); g.arc(gh.x, gh.y, gh.r * (1 + k), 0, TAU); g.stroke(); g.globalAlpha = 1;
    }
    for (const o of world.orgs) {
      if (o.x < tl.x - 80 || o.x > br.x + 80 || o.y < tl.y - 80 || o.y > br.y + 80) continue;
      this.drawOrgMech(g, o, z, time, o === sel, P);
    }
    if (sel && !sel.dead) {
      g.strokeStyle = P.accent; g.lineWidth = 1.4 / z; g.setLineDash([4 / z, 4 / z]);
      g.beginPath(); g.arc(sel.x, sel.y, sel.g[GI.range] + sel.r, 0, TAU); g.stroke(); g.setLineDash([]);
    }
  }

  drawOrgMech(g, o, z, time, selected, P) {
    const r = o.r, B = o.bp, hue = o.g[GI.hue], pig = o.g[GI.pig], lw = Math.max(1 / z, r * 0.07);
    let pts = null, wob = 0;
    if (B.n) {
      const ph = ((time * Math.min(1 / o.b.T, 2.5) + o.id * 0.37) % 1) * FRAMES, f0 = ph | 0, k = ph - f0;
      const A = B.frames[f0], Bf = B.frames[(f0 + 1) % FRAMES];
      pts = SEG.length < A.pts.length ? (SEG = new Float32Array(A.pts.length * 2)) : SEG;
      for (let i = 0; i < A.pts.length; i++) pts[i] = A.pts[i] + (Bf.pts[i] - A.pts[i]) * k;
      wob = A.w + (Bf.w - A.w) * k;
    }
    const a = o.a + wob, ca = Math.cos(a), sa = Math.sin(a);
    const X = (lx, ly) => o.x + (ca * lx - sa * ly) * r, Y = (lx, ly) => o.y + (sa * lx + ca * ly) * r;
    const ink = selected ? P.accent : P.line;
    const pcol = pig > 0.05 ? `hsla(${hue},${P.sat}%,${P.lit}%,${(0.25 + 0.7 * pig).toFixed(2)})` : null;
    if (r * z < 3) {                                     // 遠いとき
      g.fillStyle = pcol || ink; g.beginPath(); g.arc(o.x, o.y, Math.max(r, 2 / z), 0, TAU); g.fill();
      if (pts) { g.strokeStyle = P.dim; g.lineWidth = 1 / z; g.beginPath(); for (let i = 0; i < B.n; i++) { const q = i * 4; g.moveTo(X(pts[q], pts[q + 1]), Y(pts[q], pts[q + 1])); g.lineTo(X(pts[q + 2], pts[q + 3]), Y(pts[q + 2], pts[q + 3])); } g.stroke(); }
      return;
    }
    // 節: まっすぐな棒
    g.lineCap = 'round'; g.strokeStyle = ink; g.lineWidth = lw;
    if (pts) {
      g.beginPath();
      for (let i = 0; i < B.n; i++) { const q = i * 4; g.moveTo(X(pts[q], pts[q + 1]), Y(pts[q], pts[q + 1])); g.lineTo(X(pts[q + 2], pts[q + 3]), Y(pts[q + 2], pts[q + 3])); }
      g.stroke();
    }
    // 細胞
    g.beginPath(); g.arc(o.x, o.y, r, 0, TAU);
    g.fillStyle = pcol || P.cell; g.fill();
    g.lineWidth = lw * 1.1; g.stroke();
    if (P.inner && r * z > 8) {                          // 内側の目盛りの輪
      g.lineWidth = lw * 0.5; g.setLineDash([r * 0.18, r * 0.14]);
      g.beginPath(); g.arc(o.x, o.y, r * 0.66, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    // 核と前の目印
    g.fillStyle = ink; g.beginPath(); g.arc(o.x - ca * r * 0.2, o.y - sa * r * 0.2, r * 0.16, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(X(0.75, 0), Y(0.75, 0)); g.lineTo(X(1.3, 0), Y(1.3, 0)); g.lineWidth = lw; g.stroke();
    // 関節と先
    if (pts && r * z > 5) {
      const js = r * 0.15;
      for (let i = 0; i < B.n; i++) {
        const q = i * 4, x = X(pts[q], pts[q + 1]), y = Y(pts[q], pts[q + 1]);
        if (P.joint === 'square') { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = P.bg; g.fillRect(-js, -js, js * 2, js * 2); g.lineWidth = lw * 0.8; g.strokeRect(-js, -js, js * 2, js * 2); g.restore(); }
        else if (P.joint === 'pin') { g.beginPath(); g.arc(x, y, js, 0, TAU); g.fillStyle = P.bg; g.fill(); g.lineWidth = lw * 0.8; g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(x, y, js * 0.35, 0, TAU); g.fill(); }
        else { g.fillStyle = ink; g.beginPath(); g.arc(x, y, js * 0.8, 0, TAU); g.fill(); }
      }
      for (const i of B.tips) {
        const q = i * 4, x = X(pts[q + 2], pts[q + 3]), y = Y(pts[q + 2], pts[q + 3]);
        g.beginPath(); g.arc(x, y, r * 0.09, 0, TAU);
        if (P.joint === 'square') { g.lineWidth = lw * 0.7; g.stroke(); } else { g.fillStyle = ink; g.fill(); }
      }
    }
  }

  drawSelection(g, o, z, time) {
    const R = o.g[GI.range] + o.r;
    g.save();
    g.setLineDash([6 / z, 6 / z]); g.lineDashOffset = -time * 8 / z;
    g.strokeStyle = 'rgba(40,60,90,0.45)'; g.lineWidth = 1.2 / z;
    g.beginPath(); g.arc(o.x, o.y, R, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(30,50,80,0.85)'; g.lineWidth = 1.6 / z;
    g.beginPath(); g.arc(o.x, o.y, o.r + 5 / z, 0, TAU); g.stroke();
    g.restore();
  }
}

function makeDustSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  rg.addColorStop(0, 'rgba(255,250,235,0.7)');
  rg.addColorStop(0.6, 'rgba(255,250,235,0.15)');
  rg.addColorStop(0.82, 'rgba(60,48,30,0.55)');
  rg.addColorStop(1, 'rgba(60,48,30,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return c;
}

let SEG = new Float32Array(64);
// 機械の造形の色（見くらべの案）
const MECH = {
  blueprint: { out: '#0a1d30', bg: '#0f2a44', grid1: 'rgba(160,200,240,0.07)', grid2: 'rgba(160,200,240,0.2)', line: '#e6f0fb', dim: 'rgba(200,225,255,0.45)', cell: 'rgba(15,42,68,0.85)', food: 'rgba(120,220,200,0.75)', piece: 'rgba(200,225,255,A)', accent: '#ffcf5a', joint: 'square', inner: true, sat: 70, lit: 62 },
  phosphor: { out: '#030705', bg: '#030705', grid1: 'rgba(90,255,150,0.04)', grid2: 'rgba(90,255,150,0.1)', line: '#9dffbd', dim: 'rgba(120,255,160,0.35)', cell: 'rgba(3,12,7,0.9)', food: 'rgba(80,190,110,0.65)', piece: 'rgba(120,255,160,A)', accent: '#eaffef', joint: 'dot', inner: false, sat: 80, lit: 60 },
  ink: { out: '#d9d4c6', bg: '#efece2', grid1: 'rgba(40,70,110,0.08)', grid2: 'rgba(40,70,110,0.2)', line: '#1c1c1e', dim: 'rgba(28,28,30,0.35)', cell: '#fbfaf5', food: 'rgba(30,130,120,0.8)', piece: 'rgba(28,28,30,A)', accent: '#c4402c', joint: 'pin', inner: false, sat: 62, lit: 55 },
};
function hasKid(segs, i) { for (const s of segs) if (s.p === i) return true; return false; }
function segDepth(segs, i) { let d = 0; while (segs[i].p >= 0) { i = segs[i].p; d++; } return d; }
function mixc(a, b, t) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }
function hash(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 札の小さな図: 細胞と節（いまの形）と、ひと打ちの間に節の先が通る道。前（進む向き）が右
export function drawBodyDiagram(cv, o) {
  const d = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  const g = cv.getContext('2d'), P = o.bp, hue = o.g[GI.hue];
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  // 形の広がりに合わせて縮める
  let x0 = -1, x1 = 1, y0 = -1, y1 = 1;
  for (const f of P.frames) for (let i = 0; i < f.pts.length; i += 2) { x0 = Math.min(x0, f.pts[i]); x1 = Math.max(x1, f.pts[i]); y0 = Math.min(y0, f.pts[i + 1]); y1 = Math.max(y1, f.pts[i + 1]); }
  const k = Math.min((w - 16) / (x1 - x0), (h - 16) / (y1 - y0)), cx = w / 2 - (x0 + x1) / 2 * k, cy = h / 2 - (y0 + y1) / 2 * k;
  g.lineCap = 'round';
  // 先が通る道
  g.strokeStyle = 'rgba(200,225,255,0.45)'; g.lineWidth = 1; g.setLineDash([2, 3]);
  for (const j of P.tips) {
    g.beginPath();
    P.frames.forEach((f, n) => { const x = cx + f.pts[j * 4 + 2] * k, y = cy + f.pts[j * 4 + 3] * k; n ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.stroke();
  }
  g.setLineDash([]);
  // 節（はじめのこま）
  const f = P.frames[0];
  for (let i = 0; i < P.n; i++) {
    const q = i * 4;
    g.strokeStyle = '#e6f0fb'; g.lineWidth = Math.max(1.5, k * 0.12);
    g.beginPath(); g.moveTo(cx + f.pts[q] * k, cy + f.pts[q + 1] * k); g.lineTo(cx + f.pts[q + 2] * k, cy + f.pts[q + 3] * k); g.stroke();
  }
  // 細胞
  const pg = o.g[GI.pig];
  g.fillStyle = pg > 0.05 ? `hsla(${hue},70%,62%,${0.25 + 0.7 * pg})` : '#0f2a44'; g.strokeStyle = '#e6f0fb'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(cx, cy, k, 0, TAU); g.fill(); g.stroke();
  // 進む向き
  if (P.fwd > 0.02) {
    const ax = cx + k * 0.2, ay = cy;
    g.strokeStyle = '#ffcf5a'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(ax - k * 0.5, ay); g.lineTo(ax + k * 0.5, ay); g.moveTo(ax + k * 0.2, ay - k * 0.25); g.lineTo(ax + k * 0.5, ay); g.lineTo(ax + k * 0.2, ay + k * 0.25); g.stroke();
  }
}
