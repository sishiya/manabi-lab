// 顕微鏡の視野を描く（明視野。暖かい光・ピントの外のちり・半透明の細胞）
import { W, H, GI, mouthOf } from './sim.js';

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
    // 栄養のかすみ（細菌の雲のあたり）
    for (const p of world.patches) {
      const f = Math.min(1, p.age / 15, (p.life - p.age) / 15) * p.str;
      if (f <= 0) continue;
      const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rad * 1.3);
      rg.addColorStop(0, `rgba(150,128,70,${0.10 * f})`); rg.addColorStop(1, 'rgba(150,128,70,0)');
      g.fillStyle = rg; g.fillRect(p.x - p.rad * 1.3, p.y - p.rad * 1.3, p.rad * 2.6, p.rad * 2.6);
    }
    // 奥のピントの外のちり
    this.drawDust(g, 0.55, false);
    // 細菌
    this.drawFood(world, g, z, tl, br);
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
    const n = world.fn, fx = world.fx, fy = world.fy, age = world.fage, life = world.flife;
    g.fillStyle = 'rgba(92,74,40,0.75)';
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
      if (age[i] > life[i]) continue;
      const a = hash(x, y) * TAU, ca = Math.cos(a) * 1.3, sa = Math.sin(a) * 1.3;
      g.moveTo(x - ca, y - sa); g.lineTo(x + ca, y + sa);
    }
    g.strokeStyle = 'rgba(92,74,40,0.8)'; g.lineWidth = 1.1; g.lineCap = 'round'; g.stroke();
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
    const chl = gn[GI.chloro];
    if (px < 3.2) {                       // 遠いときは点で
      g.fillStyle = `hsla(${hue},40%,${chl > 0.4 ? 38 : 42}%,0.85)`;
      g.beginPath(); g.arc(o.x, o.y, Math.max(r, 2.6 / z), 0, TAU); g.fill();
      return;
    }
    const elong = 1 + Math.min(0.7, Math.max(0, (gn[GI.cilia] - 40) / 260));
    const wob = 1 + 0.04 * Math.sin(o.phase * 1.3);
    const a = o.a;
    const rx = r * Math.sqrt(elong) * wob, ry = r / Math.sqrt(elong) / wob;
    g.save();
    g.translate(o.x, o.y); g.rotate(a);
    // 繊毛
    if (px > 7) {
      const nC = 28, len = Math.min(r * 0.45, 1.2 + gn[GI.cilia] / 55);
      g.beginPath();
      for (let i = 0; i < nC; i++) {
        const t = i / nC * TAU;
        const ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
        const nx = Math.cos(t) * ry, ny = Math.sin(t) * rx, nl = Math.hypot(nx, ny);
        const beat = Math.sin(o.phase * 3 - i * 0.7) * 0.6;
        const ux = nx / nl, uy = ny / nl;
        const tx = -uy, ty = ux;
        g.moveTo(ex, ey);
        g.lineTo(ex + (ux + tx * beat) * len, ey + (uy + ty * beat) * len);
      }
      g.strokeStyle = `hsla(${hue},25%,28%,0.45)`; g.lineWidth = Math.max(0.35, 0.7 / z); g.stroke();
    }
    // 体
    const body = g.createRadialGradient(-rx * 0.3, -ry * 0.35, r * 0.1, 0, 0, rx);
    body.addColorStop(0, `hsla(${hue},35%,88%,0.7)`);
    body.addColorStop(0.75, `hsla(${hue},40%,66%,0.62)`);
    body.addColorStop(1, `hsla(${hue},42%,48%,0.75)`);
    g.fillStyle = body;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
    // 口（前の切れこみ）
    const m = mouthOf(gn);
    if (m > 0.12) {
      const mw = ry * Math.min(0.9, m * 0.9), md = rx * (0.25 + m * 0.35);
      g.fillStyle = `hsla(${hue},30%,32%,0.45)`;
      g.beginPath(); g.moveTo(rx * 1.01, -mw); g.quadraticCurveTo(rx - md, 0, rx * 1.01, mw); g.closePath(); g.fill();
    }
    if (px > 6) {
      // 食胞（食べたものの粒）
      const nV = Math.min(6, 1 + (o.ate % 7));
      for (let i = 0; i < nV; i++) {
        const t = hash(o.id, i) * TAU, d = 0.25 + hash(i, o.id) * 0.4;
        g.fillStyle = 'rgba(110,84,44,0.45)';
        g.beginPath(); g.arc(Math.cos(t) * rx * d, Math.sin(t) * ry * d, r * 0.09, 0, TAU); g.fill();
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

function mixc(a, b, t) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }
function hash(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
