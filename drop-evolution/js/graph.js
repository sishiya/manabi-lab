// 下のグラフ: 数の移り変わり（系統ごとに積む）・系統樹・からだの変化
import { GI, GENES } from './sim.js';

// [名前, 色, 記録からの値（0..1 にそろえる）]
const gene = k => s => (s.mean[GI[k]] - GENES[GI[k]][1]) / (GENES[GI[k]][2] - GENES[GI[k]][1]);
const TRAITS = [
  ['節の数', '#ffc861', s => (s.segs || 0) / 10],
  ['速さ', '#7dffc8', s => (s.speed || 0) / 300],
  ['とどく', '#4fc3a0', s => (s.reach || 0) / 150],
  ['感じる範囲', '#a6e8ff', gene('range')],
  ['獲物へ', '#ff8a6a', gene('small')],
  ['大きさ', '#d8ffe2', gene('size')],
  ['混ぜる', '#e7a6ff', gene('mix')],
  ['くっつく', '#ff7ad9', gene('stick')],
  ['飼う', '#5fd66f', gene('keep')],
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

  note(s) { const g = this.g; g.fillStyle = 'rgba(150,215,240,.6)'; g.font = '13px "Zen Kaku Gothic New", sans-serif'; g.fillText(s, 12, this.h / 2); }

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
    g.strokeStyle = 'rgba(190,240,255,0.7)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(150,215,240,.7)'; g.font = '11px "Zen Kaku Gothic New", sans-serif';
    g.fillText(`${maxN} 匹`, pad + 2, 12);
    g.textAlign = 'right'; g.fillText(fmtT(t1), w - pad, 12); g.textAlign = 'left';
  }

  drawTree(world, selClade) {
    const g = this.g, w = this.w, h = this.h, pad = 6;
    // いま数の多い系統（8つと選んだ系統）と、それらが枝分かれした祖先・いちばん上の祖先だけ（全部だと何百本も重なって読めない。RELEASE.md 4章）
    const tops = [...world.clades.values()].filter(c => c.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
    const sc = world.clades.get(selClade);
    if (sc && !tops.includes(sc)) tops.push(sc);
    const via = new Map();   // 祖先 → その下で、上位の系統へ続く子
    let root = null;
    for (const t of tops) {
      let c = t, prev = 0;
      while (c) { if (!via.has(c.id)) via.set(c.id, new Set()); if (prev) via.get(c.id).add(prev); prev = c.id; root = c; c = world.clades.get(c.parent); }
    }
    const show = new Map();
    for (const c of tops) show.set(c.id, c);
    for (const [id, ks] of via) if (ks.size >= 2) show.set(id, world.clades.get(id));
    if (root) show.set(root.id, root);
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
        // 見せない途中の系統を通ってつながる: 祖先の線の終わりから、子が分かれた時刻まで薄くのばしてから下ろす
        const pc = show.get(p), px = Math.min(x0, X(pc.died ?? T));
        g.strokeStyle = 'rgba(110,210,255,0.3)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(px, rowY.get(p)); g.lineTo(x0, rowY.get(p)); g.lineTo(x0, y); g.stroke();
      }
      const alive = c.n > 0;
      g.strokeStyle = cladeColor(c, alive ? 0.95 : 0.45);
      g.lineWidth = Math.max(1.5, Math.min(rh * 0.8, alive ? 2 + Math.sqrt(c.n) : 1.5));
      g.beginPath(); g.moveTo(x0, y); g.lineTo(Math.max(x1, x0 + 1), y); g.stroke();
      if (!alive) { g.fillStyle = 'rgba(150,215,240,0.6)'; g.fillRect(x1 - 0.5, y - rh * 0.35, 1.5, rh * 0.7); }
      if (c.id === selClade) {
        g.strokeStyle = '#ffc861'; g.lineWidth = 1;
        g.strokeRect(x0 - 3, y - rh / 2, Math.max(x1 - x0, 2) + 6, rh);
      }
      this.hits.push({ y0: y - rh / 2, y1: y + rh / 2, x0: x0 - 4, x1: x1 + 4, id: c.id });
    }
    g.fillStyle = 'rgba(150,215,240,.7)'; g.font = '11px "Zen Kaku Gothic New", sans-serif';
    g.fillText('むかし', pad, h - pad); g.textAlign = 'right'; g.fillText('いま ' + fmtT(T), w - pad, h - pad); g.textAlign = 'left';
  }

  drawTraits(hist) {
    const g = this.g, w = this.w, h = this.h, pad = 4, top = 18;
    const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
    const X = t => pad + (t - t0) / Math.max(1, t1 - t0) * (w - pad * 2);
    // 遺伝子の幅に対する割合。いちばん大きい値に合わせて縦をのばす
    let vmax = 0.1;
    for (const s of hist) for (const [, , f] of TRAITS) vmax = Math.max(vmax, f(s));
    vmax = Math.min(1, vmax * 1.1);
    g.font = '11px "Zen Kaku Gothic New", sans-serif';
    let lx = pad;
    for (const [label, col, f] of TRAITS) {
      g.beginPath();
      hist.forEach((s, n) => { const y = h - pad - f(s) / vmax * (h - pad - top); n ? g.lineTo(X(s.t), y) : g.moveTo(X(s.t), y); });
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

export function cladeColor(c, a = 1) { return `hsla(${c.hue},55%,62%,${a})`; }
export function fmtT(t) {
  t = Math.floor(t);
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return h ? `${h}時間${m}分` : m ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
}
