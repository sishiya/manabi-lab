// ② 未来の霧の共通の部品（段階Bの題材で使う）
//   Fog.draw(g, paths, opts) … paths[本][時刻] = [x, y]（画面の座標）を、時間帯ごとにまとめた太い半透明の線で重ねる
//     opts: { from: 何番目の時刻から, bins: 時間帯の数, width: 線の太さ(px), alpha, color: [r,g,b] か (0〜1の時刻) => [r,g,b], grow: 先ほど太く }
//   Fog.spread(pts) … 点の集まりのばらつき（平均からの距離の二乗平均）
//   Fog.gauss(seed) … 決まった正規乱数の列（毎回同じ＝霧がちらつかない）
'use strict';
const Fog = (() => {
  function draw(g, paths, o = {}) {
    if (!paths || !paths.length) return;
    const n = paths[0].length - 1, bins = o.bins || 10, from = o.from || 0;
    const wd = o.width || 6, al = o.alpha ?? 0.1, grow = o.grow ?? 0.8;
    g.save(); g.globalCompositeOperation = o.comp || 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let b = 0; b < bins; b++) {
      const i0 = Math.max(from, Math.floor(b * n / bins)), i1 = Math.floor((b + 1) * n / bins);
      if (i1 <= i0) continue;
      const t = b / Math.max(1, bins - 1), c = typeof o.color === 'function' ? o.color(t) : (o.color || [255, 201, 90]);
      g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${al * (1 - 0.45 * t)})`;
      g.lineWidth = wd * (1 + grow * t);
      // 1本のパスの中で重なっても濃くならないので、本を G 組に分けて描く（重なった所ほど濃くなる）
      const G = Math.min(o.groups || 8, paths.length);
      for (let gi = 0; gi < G; gi++) {
        g.beginPath();
        for (let k = gi; k < paths.length; k += G) {
          const p = paths[k]; if (p.length <= i0) continue;
          g.moveTo(p[i0][0], p[i0][1]);
          for (let i = i0 + 1; i <= Math.min(i1, p.length - 1); i++) g.lineTo(p[i][0], p[i][1]);
        }
        g.stroke();
      }
    }
    g.restore();
  }
  function spread(pts) {
    let mx = 0, my = 0, mz = 0; const n = pts.length, D = pts[0].length;
    for (const p of pts) { mx += p[0]; my += p[1]; if (D > 2) mz += p[2]; }
    mx /= n; my /= n; mz /= n; let v = 0;
    for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my, dz = D > 2 ? p[2] - mz : 0; v += dx * dx + dy * dy + dz * dz; }
    return Math.sqrt(v / n);
  }
  function gauss(seed, count) {
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s + 1) / 0x80000000; };
    const out = [];
    for (let i = 0; i < count; i++) out.push(Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()));
    return out;
  }
  // 黄（すぐ先）→ 青（先のほう）
  const warmToCool = t => [Math.round(255 + (143 - 255) * t), Math.round(201 + (211 - 201) * t), Math.round(90 + (255 - 90) * t)];
  return { draw, spread, gauss, warmToCool };
})();
