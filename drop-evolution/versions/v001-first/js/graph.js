// 下のグラフ: 数の移り変わり（系統ごとに積む）・系統樹・からだの変化
import { GI, GENES } from './sim.js';

const TRAITS = [
  ['cilia', '泳ぐ速さ', '#3d6f9e'],
  ['range', '感じる範囲', '#8a6bb0'],
  ['food', 'エサへ向かう', '#b07a2a'],
  ['memory', '記憶', '#4f8a6a'],
  ['mouth', '口', '#b04a3a'],
  ['chloro', '緑の色素', '#5c9a3a'],
  ['size', '大きさ', '#6a6a6a'],
];

export class Graph {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.mode = 'pop';
    this.hits = [];            // 系統樹の当たり { y0, y1, x0, x1, id }
  }

  resize() {
    const r = this.cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height; this.d = d;
    this.cv.width = Math.round(r.width * d); this.cv.height = Math.round(r.height * d);
  }

  draw(world, selClade) {
    if (!this.w) this.resize();
    const g = this.g;
    g.setTransform(this.d, 0, 0, this.d, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    const hist = world.history;
    if (hist.length < 2) { this.note('記録をあつめています…'); return; }
    if (this.mode === 'pop') this.drawPop(world, hist, selClade);
    else if (this.mode === 'tree') this.drawTree(world, selClade);
    else this.drawTraits(hist);
  }

  note(s) { const g = this.g; g.fillStyle = '#8b8170'; g.font = '13px "Zen Kaku Gothic New", sans-serif'; g.fillText(s, 12, this.h / 2); }

  drawPop(world, hist, selClade) {
    const g = this.g, w = this.w, h = this.h, pad = 4;
    let maxN = 1; for (const s of hist) if (s.n > maxN) maxN = s.n;
    const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
    // よく出た系統から順に下へ積む
    const order = [...world.clades.values()].filter(c => c.peak >= 3).sort((a, b) => a.id - b.id);
    const X = t => pad + (t - t0) / Math.max(1, t1 - t0) * (w - pad * 2);
    const Y = n => h - pad - n / maxN * (h - pad * 2 - 14);
    const base = new Float32Array(hist.length);
    for (const c of order) {
      g.beginPath();
      let started = false, any = false;
      const top = new Float32Array(hist.length);
      for (let i = 0; i < hist.length; i++) { top[i] = base[i] + (hist[i].counts[c.id] || 0); if (top[i] > base[i]) any = true; }
      if (!any) continue;
      for (let i = 0; i < hist.length; i++) { const x = X(hist[i].t), y = Y(top[i]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }
      for (let i = hist.length - 1; i >= 0; i--) g.lineTo(X(hist[i].t), Y(base[i]));
      g.closePath();
      g.fillStyle = cladeColor(c, selClade === c.id ? 0.95 : 0.75);
      g.fill();
      base.set(top);
    }
    // ほかの小さな系統（残り）
    g.beginPath();
    for (let i = 0; i < hist.length; i++) { const x = X(hist[i].t), y = Y(hist[i].n); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = 'rgba(60,50,40,0.6)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#6d6455'; g.font = '11px "Zen Kaku Gothic New", sans-serif';
    g.fillText(`${maxN} 匹`, pad + 2, 12);
    g.textAlign = 'right'; g.fillText(fmtT(t1), w - pad, 12); g.textAlign = 'left';
  }

  drawTree(world, selClade) {
    const g = this.g, w = this.w, h = this.h, pad = 6;
    // 少しでも増えた系統と、生きている系統だけ
    const show = new Map();
    for (const c of world.clades.values()) if (c.peak >= 4 || c.n > 0) show.set(c.id, c);
    // 見せない親をとばして、見せる祖先につなぐ
    const up = c => { let p = world.clades.get(c.parent); while (p && !show.has(p.id)) p = world.clades.get(p.parent); return p ? p.id : 0; };
    const kids = new Map();
    for (const c of show.values()) { const p = up(c); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(c); }
    const rows = [];
    const walk = (id, depth) => { for (const c of (kids.get(id) || []).sort((a, b) => a.born - b.born)) { rows.push(c); walk(c.id, depth + 1); } };
    walk(0, 0);
    const T = world.t, X = t => pad + 40 + t / Math.max(1, T) * (w - pad * 2 - 40);
    const rh = Math.min(12, (h - pad * 2 - 14) / Math.max(1, rows.length));
    const rowY = new Map();
    rows.forEach((c, i) => rowY.set(c.id, pad + rh * (i + 0.5)));
    this.hits = [];
    g.lineCap = 'round';
    for (const c of rows) {
      const y = rowY.get(c.id), x0 = X(c.born), x1 = X(c.died ?? T);
      const p = up(c);
      if (p && rowY.has(p)) {
        g.strokeStyle = 'rgba(80,70,55,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x0, rowY.get(p)); g.lineTo(x0, y); g.stroke();
      }
      const alive = c.n > 0;
      g.strokeStyle = cladeColor(c, alive ? 0.95 : 0.45);
      g.lineWidth = Math.max(1.5, Math.min(rh * 0.8, alive ? 2 + Math.sqrt(c.n) : 1.5));
      g.beginPath(); g.moveTo(x0, y); g.lineTo(Math.max(x1, x0 + 1), y); g.stroke();
      if (!alive) { g.fillStyle = 'rgba(80,70,55,0.6)'; g.fillRect(x1 - 0.5, y - rh * 0.35, 1.5, rh * 0.7); }
      if (c.id === selClade) {
        g.strokeStyle = 'rgba(30,50,80,0.9)'; g.lineWidth = 1;
        g.strokeRect(x0 - 3, y - rh / 2, Math.max(x1 - x0, 2) + 6, rh);
      }
      this.hits.push({ y0: y - rh / 2, y1: y + rh / 2, x0: x0 - 4, x1: x1 + 4, id: c.id });
    }
    g.fillStyle = '#6d6455'; g.font = '11px "Zen Kaku Gothic New", sans-serif';
    g.fillText('むかし', pad, h - pad); g.textAlign = 'right'; g.fillText('いま ' + fmtT(T), w - pad, h - pad); g.textAlign = 'left';
  }

  drawTraits(hist) {
    const g = this.g, w = this.w, h = this.h, pad = 4, top = 18;
    const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
    const X = t => pad + (t - t0) / Math.max(1, t1 - t0) * (w - pad * 2);
    // 遺伝子の幅に対する割合。いちばん大きい値に合わせて縦をのばす
    let vmax = 0.1;
    const norm = (s, i) => (s.mean[i] - GENES[i][1]) / (GENES[i][2] - GENES[i][1]);
    for (const s of hist) for (const [k] of TRAITS) vmax = Math.max(vmax, norm(s, GI[k]));
    vmax = Math.min(1, vmax * 1.1);
    g.font = '11px "Zen Kaku Gothic New", sans-serif';
    let lx = pad;
    for (const [k, label, col] of TRAITS) {
      const i = GI[k];
      g.beginPath();
      hist.forEach((s, n) => { const y = h - pad - norm(s, i) / vmax * (h - pad - top); n ? g.lineTo(X(s.t), y) : g.moveTo(X(s.t), y); });
      g.strokeStyle = col; g.lineWidth = 1.8; g.stroke();
      g.fillStyle = col; g.fillRect(lx, 5, 8, 8);
      g.fillText(label, lx + 11, 13);
      lx += g.measureText(label).width + 22;
    }
  }

  hitTree(x, y) {
    for (const k of this.hits) if (y >= k.y0 && y <= k.y1 && x >= k.x0 && x <= k.x1) return k.id;
    return null;
  }
}

export function cladeColor(c, a = 1) { return `hsla(${c.hue},45%,52%,${a})`; }
export function fmtT(t) {
  t = Math.floor(t);
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return h ? `${h}時間${m}分` : m ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
}
