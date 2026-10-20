// 波が育つまで — ブイの真下の断面（紺の線の図）。水の粒は円をえがき、深くなるほど円が小さくなる。
// 線形の波の理論（深い海）: 粒の動き = Σ a e^{kz}（横 −sin・上下 cos）、流される分 = Σ ω k a² e^{2kz}（ストークスドリフト）。
// 断面は「同じ分布から作った、風の向きに進む1本の波の列」（上の海とは模様がちがう）。
'use strict';
window.WGsection = (() => {
  const G = 9.81, NC = 40;   // 波の数
  let comps = [], key = null, lam = 1, drift0 = 0, trails = new Map(), lastT = null;
  // 分布 S(f) を周波数で区切って波を作る（乱数の位相は固定）
  function build(H, Tp) {
    const W = window.WGgrowth, fp = 1 / Tp; comps = [];
    let seed = 99; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const f0 = 0.6 * fp, f1 = 5 * fp;
    for (let i = 0; i < NC; i++) {
      const fa = f0 * Math.pow(f1 / f0, i / NC), fb = f0 * Math.pow(f1 / f0, (i + 1) / NC), f = Math.sqrt(fa * fb);
      const a = Math.sqrt(2 * W.Sf(f, H, Tp) * (fb - fa)), w = 2 * Math.PI * f, k = w * w / G;
      comps.push({ a, w, k, ph: rnd() * 2 * Math.PI });
    }
    lam = G * Tp * Tp / (2 * Math.PI); trails = new Map(); drift0 = 0;
  }
  function motion(x0, z0, t) {   // 粒の位置（水の中の止まった位置 x0, z0 から）
    let dx = 0, dz = 0, us = 0;
    for (const c of comps) { const e = Math.exp(c.k * z0), th = c.k * x0 - c.w * t + c.ph; dx -= c.a * e * Math.sin(th); dz += c.a * e * Math.cos(th); us += c.w * c.k * c.a * c.a * e * e; }
    return [dx, dz, us];
  }
  // usG = 上の海の計算と同じ水面の流される速さ（growth.stokes）。断面の流れはこれに合わせる
  // 幅に合わせて折り返す（日本語なので1文字ずつ）
  function wrap(g, text, maxW) { const out = []; let line = '';
    for (const ch of text) { if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
    if (line) out.push(line); return out; }
  function draw(cv, st, t, buoyOn, usG, mag = 1) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (!r.width) return;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height;
    g.fillStyle = 'rgba(14,34,51,.94)'; g.fillRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement), font = css.getPropertyValue('--f-body');
    g.font = '12px ' + font; g.fillStyle = '#e8f0f4'; g.textAlign = 'left';
    if (!(st.Hm0 >= 0.05)) { g.fillText(st.Hm0 > 0 ? 'まだ波がとても小さい（高さ 5 cm 未満）。時間を進めてください。' : 'まだ波がない（風が吹く前）。水の粒は止まっています。', 16, 40); return; }
    // 作りなおすのは高さか周期が 3% 以上かわったときと、倍率を変えたとき（跡も消える）
    if (!key || Math.abs(st.Hm0 / key.H - 1) > 0.03 || Math.abs(st.Tp / key.T - 1) > 0.03 || key.mag !== mag) { key = { H: st.Hm0, T: st.Tp, mag }; build(st.Hm0, st.Tp); }
    const dt = lastT == null ? 0 : Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
    // 縮尺（縦横同じ。本当の形のまま）: 横は波長の 1.4 倍、深さは波長の 0.55 倍まで
    const head = wrap(g, 'ブイの真下の断面（風の向きにそって・縦横同じ縮尺）' + (mag > 1 ? `　※ 水の動きを ${mag} 倍にして見せています` : ''), w - 32);
    g.font = '12px ' + font; const us = usG;
    const foot = wrap(g, `黄色 = ブイの下の水。水は進まず円をえがき、少しずつ風下へ（水面で 1 秒に ${(us * 100).toFixed(1)} cm）。`, w - 32);
    const top = 20 + head.length * 15 + 22, bot = 50 + foot.length * 15;
    const sc = Math.min((w - 70) / (1.4 * lam), (h - top - bot) / (0.62 * lam)), X0 = w / 2;
    const Y0 = top + Math.max(0, (h - top - bot - 0.62 * lam * sc) / 2) + 0.07 * lam * sc;
    const X = x => X0 + x * sc, Y = z => Y0 - z * sc;
    head.forEach((l, i) => g.fillText(l, 16, 20 + i * 15));
    g.fillStyle = '#a3b4bf'; g.fillText(`いちばん多い波の長さ ${lam < 1 ? (lam * 100).toFixed(0) + ' cm' : lam.toFixed(1) + ' m'}`, 16, 20 + head.length * 15 + 2);
    // 深さの目盛り
    g.strokeStyle = 'rgba(163,180,191,.35)'; g.lineWidth = 1; g.textAlign = 'right';
    for (const [fr, lab] of [[0.25, '波長の 1/4'], [0.5, '波長の 1/2']]) { const y = Y(-fr * lam); g.setLineDash([3, 4]); g.beginPath(); g.moveTo(30, y); g.lineTo(w - 10, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#a3b4bf'; g.fillText(`${lab}（${(fr * lam).toFixed(lam < 4 ? 2 : 1)} m）: 動き ${(Math.exp(-2 * Math.PI * fr) * 100).toFixed(0)}%`, w - 12, y - 4); }
    // 水面（水面の粒をつないだ線）
    g.strokeStyle = '#7fd0e8'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 160; i++) { const x0 = (-0.75 + 1.5 * i / 160) * lam, m = motion(x0, 0, t), x = X(x0 + mag * m[0]), y = Y(mag * m[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    // 水の粒（列ごと・深さごと）。跡を残す。まん中の列 = ブイの下
    const depths = [0, -0.05, -0.1, -0.2, -0.33, -0.5], cols = [-0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5];
    const span = 1.4 * lam, us0 = motion(0, 0, 0)[2], fac = us0 > 0 ? usG / us0 : 0;
    for (const zf of depths) for (const xf of cols) {
      const z0 = zf * lam, id = zf + ':' + xf, m = motion(xf * lam, z0, t);
      let tr = trails.get(id); if (!tr) { tr = { drift: 0, pts: [] }; trails.set(id, tr); }
      tr.drift += m[2] * fac * mag * dt;
      let xs = xf * lam + tr.drift + mag * m[0]; if (xs > span / 2) { tr.drift -= span; tr.pts = []; xs -= span; }
      tr.pts.push([xs, z0 + mag * m[1]]); if (tr.pts.length > 260) tr.pts.shift();
      const center = xf === 0;
      g.strokeStyle = center ? 'rgba(255,201,90,.75)' : 'rgba(127,208,232,.45)'; g.lineWidth = center ? 1.6 : 1;
      g.beginPath(); tr.pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke();
      g.fillStyle = center ? '#ffc95a' : '#e8f0f4'; g.beginPath(); g.arc(X(xs), Y(z0 + mag * m[1]), center ? 3.2 : 2.2, 0, Math.PI * 2); g.fill();
      if (center && zf === 0 && buoyOn) { g.fillStyle = '#d92b1f'; g.fillRect(X(xs) - 4, Y(z0 + mag * m[1]) - 12, 8, 12); }
    }
    g.fillStyle = '#e8f0f4'; g.textAlign = 'left'; g.font = '12px ' + font;
    foot.forEach((l, i) => g.fillText(l, 16, h - 48 - (foot.length - 1 - i) * 15));
  }
  return { draw };
})();
