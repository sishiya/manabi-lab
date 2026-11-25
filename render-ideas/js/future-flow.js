// ②-D 未来の霧 × 流れに浮かぶ葉 — 葉を落とすと、行き先の霧が糸のように引きのばされる
// 流れ: ダブルジャイヤ（研究でよく使う模型の流れ。Shadden, Lekien & Marsden 2005）。領域 [0,2]×[0,1]。
//   ψ = A sin(π f(x,t)) sin(π y)、f = a x² + b x、a = ε sin ωt、b = 1 − 2ε sin ωt、A = 0.1、ε = 0.25、ω = 2π/10。
//   u = −∂ψ/∂y、v = ∂ψ/∂x。RK4、刻み 0.05。画面の1秒＝模型の時間 2。
// 「言い当てにくい場所の地図」: 有限時間リアプノフ指数（FTLE）σ = ln√λmax(CᵀC) / T を格子の上で少しずつ計算（前向き＝はね返す尾根）。
'use strict';
(() => {
  const A = 0.1, EPS = 0.25, OM = 2 * Math.PI / 10, DT = 0.05, N = 64, SAMPLE = 0.25, SPEED = 2;
  const LEAF = [[220, 90, 60], [240, 180, 60], [150, 200, 90], [230, 130, 170]];
  let t = 0, leaves = [], H = 12, sigK = 1, normal = false, showMap = false;
  const DEV = Fog.gauss(9090, N * 2);
  let dots = [], view = { s: 1, ox: 0, oy: 0 };
  let ftle = null, fjob = null, fimg = null;

  function vel(x, y, tt) {
    const s = Math.sin(OM * tt), a = EPS * s, b = 1 - 2 * EPS * s, f = a * x * x + b * x, df = 2 * a * x + b;
    return [-Math.PI * A * Math.sin(Math.PI * f) * Math.cos(Math.PI * y), Math.PI * A * Math.cos(Math.PI * f) * Math.sin(Math.PI * y) * df];
  }
  function rk(x, y, tt, h) {
    const k1 = vel(x, y, tt), k2 = vel(x + h / 2 * k1[0], y + h / 2 * k1[1], tt + h / 2);
    const k3 = vel(x + h / 2 * k2[0], y + h / 2 * k2[1], tt + h / 2), k4 = vel(x + h * k3[0], y + h * k3[1], tt + h);
    return [x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
  }
  function init() {
    dots = Array.from({ length: 1400 }, () => ({ x: Math.random() * 2, y: Math.random(), life: Math.random() * 6 }));
    addLeaf(1.0, 0.5); addLeaf(0.5, 0.5);
  }
  function addLeaf(x, y) {
    if (leaves.length >= 4) leaves.shift();
    const used = leaves.map(l => l.c); const c = [0, 1, 2, 3].find(k => !used.includes(k));
    leaves.push({ x, y, c, fog: null, ang: Math.random() * 6 });
    leaves.forEach(l => l.fog = null);
  }
  function computeFog(l) {
    const sg = 0.0005 * Math.pow(10, sigK), steps = Math.round(H / SAMPLE), per = Math.round(SAMPLE / DT), paths = [];
    for (let k = 0; k < N; k++) {
      let p = [l.x + sg * DEV[k * 2], l.y + sg * DEV[k * 2 + 1]], tt = t; const pts = [p];
      for (let i = 0; i < steps; i++) { for (let j = 0; j < per; j++) { p = rk(p[0], p[1], tt, DT); tt += DT; } pts.push(p); }
      paths.push(pts);
    }
    l.fog = paths; l.fogT = t;
    let hz = null; for (let i = 0; i <= steps; i++) if (Fog.spread(paths.map(q => q[i])) > 0.05) { hz = i * SAMPLE; break; }
    l.hz = hz;
  }
  // FTLE を少しずつ（1コマに何行か）
  function ftleWork(budget) {
    const nx = RI.size.w < 600 ? 60 : 100, ny = nx / 2, T = 10, h = 0.1, t0 = performance.now();
    if (!fjob) fjob = { t0: t, row: 0, nx, ny, map: new Float32Array((nx + 1) * (ny + 1) * 2) };
    while (fjob.row <= ny && performance.now() - t0 < budget) {
      const j = fjob.row++;
      for (let i = 0; i <= nx; i++) {
        let x = i / nx * 2, y = j / ny, tt = fjob.t0;
        for (let s = 0; s < T / h; s++) { [x, y] = rk(x, y, tt, h); tt += h; }
        fjob.map[(j * (nx + 1) + i) * 2] = x; fjob.map[(j * (nx + 1) + i) * 2 + 1] = y;
      }
    }
    if (fjob.row > ny) {   // 流れの写像の差分から σ
      const { nx, ny, map } = fjob, dx = 2 / nx, dy = 1 / ny, out = new Float32Array((nx + 1) * (ny + 1));
      const at = (i, j, k) => map[(j * (nx + 1) + i) * 2 + k];
      for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
        const a = (at(i + 1, j, 0) - at(i - 1, j, 0)) / (2 * dx), b = (at(i, j + 1, 0) - at(i, j - 1, 0)) / (2 * dy);
        const c = (at(i + 1, j, 1) - at(i - 1, j, 1)) / (2 * dx), d = (at(i, j + 1, 1) - at(i, j - 1, 1)) / (2 * dy);
        const p = a * a + c * c, q = a * b + c * d, r = b * b + d * d, lam = (p + r) / 2 + Math.sqrt(((p - r) / 2) ** 2 + q * q);
        out[j * (nx + 1) + i] = Math.log(Math.sqrt(lam)) / T;
      }
      ftle = { nx, ny, v: out }; fjob = null; makeImg();
    }
  }
  function makeImg() {
    const { nx, ny, v } = ftle, c = document.createElement('canvas'); c.width = nx + 1; c.height = ny + 1;
    const cx = c.getContext('2d'), im = cx.createImageData(nx + 1, ny + 1);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const k = Math.max(0, Math.min(1, v[j * (nx + 1) + i] / 0.3)), o = ((ny - j) * (nx + 1) + i) * 4;
      im.data[o] = 40 + 215 * k * k; im.data[o + 1] = 60 + 150 * k; im.data[o + 2] = 90 + 120 * k; im.data[o + 3] = 40 + 170 * k;
    }
    cx.putImageData(im, 0, 0); fimg = c;
  }

  let rr = 0;
  function step(dt) {
    const d = dt * SPEED, n = Math.max(1, Math.round(d / DT));
    for (let k = 0; k < n; k++) { for (const l of leaves) [l.x, l.y] = rk(l.x, l.y, t, DT); t += DT; }
    for (const p of dots) {
      const v = vel(p.x, p.y, t); p.px = p.x; p.py = p.y; p.x += v[0] * d; p.y += v[1] * d; p.life -= dt;
      if (p.life < 0 || p.x < 0 || p.x > 2 || p.y < 0 || p.y > 1) { p.x = Math.random() * 2; p.y = Math.random(); p.px = p.x; p.py = p.y; p.life = 3 + Math.random() * 4; }
    }
    if (!normal && leaves.length) { const l = leaves[rr++ % leaves.length]; computeFog(l); }
    if (showMap) ftleWork(6);
    return true;
  }

  function resize(w, h) { const s = Math.min((w - 16) / 2, (h - 16)); view = { s, ox: (w - 2 * s) / 2, oy: (h - s) / 2 }; }
  const P = (x, y) => [view.ox + x * view.s, view.oy + (1 - y) * view.s];

  function draw(g, w, h) {
    g.fillStyle = '#0a1820'; g.fillRect(0, 0, w, h);
    const [x0, y0] = P(0, 1), gr = g.createLinearGradient(0, y0, 0, y0 + view.s);
    gr.addColorStop(0, '#103240'); gr.addColorStop(1, '#0c2430'); g.fillStyle = gr; g.fillRect(x0, y0, 2 * view.s, view.s);
    if (showMap && fimg) { g.imageSmoothingEnabled = true; g.drawImage(fimg, x0, y0, 2 * view.s, view.s); }
    // 水面の粒（流れが見えるように）
    g.strokeStyle = 'rgba(150,220,235,0.35)'; g.lineWidth = 1.2; g.beginPath();
    for (const p of dots) { if (p.px === undefined) continue; const [a, b] = P(p.px, p.py), [c, d] = P(p.x, p.y); g.moveTo(a, b); g.lineTo(c + (c - a) * 2, d + (d - b) * 2); }
    g.stroke();
    // 霧と葉
    for (const l of leaves) {
      if (!normal && l.fog) {
        const lag = Math.max(0, Math.round((t - l.fogT) / SAMPLE));
        Fog.draw(g, l.fog.map(p => p.map(q => P(q[0], q[1]))), { from: lag, color: LEAF[l.c], width: 4, alpha: 0.05, bins: 10, grow: 0.5 });
      }
      const [a, b] = P(l.x, l.y), v = vel(l.x, l.y, t), ang = Math.atan2(-v[1], v[0]);
      g.save(); g.translate(a, b); g.rotate(ang); g.fillStyle = `rgb(${LEAF[l.c]})`;
      g.beginPath(); g.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(20,32,44,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke(); g.restore();
    }
    g.strokeStyle = 'rgba(232,240,244,0.25)'; g.lineWidth = 1; g.strokeRect(x0, y0, 2 * view.s, view.s);
    const lead = leaves.map(l => l.hz === null || l.hz === undefined ? null : l.hz);
    RI.hud(showMap ? '明るい筋＝少しのずれで行き先が大きく分かれる所（FTLE、前向き 10）' + (fjob ? `　計算中 ${Math.round(fjob.row / (fjob.ny + 1) * 100)}%` : '')
      : `水面を押すと葉を落とします（4枚まで）　霧が池の幅の 2.5% をこえるまで: ${lead.map(v => v === null ? `${H} 以上` : v.toFixed(1)).join('・')}`);
  }

  function pointer(type, x, y) {
    if (type !== 'up') return;
    const wx = (x - view.ox) / view.s, wy = 1 - (y - view.oy) / view.s;
    if (wx > 0.02 && wx < 1.98 && wy > 0.02 && wy < 0.98) addLeaf(wx, wy);
  }

  RI.add({
    id: 'future-flow', group: 'future', label: '流れに浮かぶ葉',
    lead: '水面を押すと<b>葉</b>が落ちます。行き先の霧が、場所によって<b>糸のように引きのばされ</b>ます。',
    how: `<p>2つのうずが左右にゆれる、研究でよく使う模型の流れです（ダブルジャイヤ、Shadden ほか 2005）。葉の位置に小さなずれ（池の幅の 0.025%）だけちがう 64 枚を流し、その行き先を霧にしています。うずの真ん中に落とした葉は長く言い当てられますが、2つのうずの境目に落とした葉は、霧が細い糸のように引きのばされて、すぐに分かれます。</p>
      <p>「言い当てにくい場所の地図」は、格子の点ごとに、となりの点と時間 10 のあいだにどれだけ引きはなされるかを計算したものです（有限時間リアプノフ指数、FTLE）。明るい筋の上の葉は、ほんの少しのずれで別の所へ行きます。筋は流れとともに動きます（いつから数えるかで変わります）。</p>
      <p>簡単にしているところ: 本物の池ではなく模型の流れです（A = 0.1、ε = 0.25、周期 10）。葉は水と同じに流れるとしています。明るい筋は「はね返す尾根」で、厳密な意味の流れの境目（LCS）とは少しちがいます（Haller 2011）。</p>`,
    init, resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（くらべる）', normal, v => { normal = v; });
      RI.toggle(b, '言い当てにくい場所の地図', showMap, v => { showMap = v; if (!v) { fjob = null; } });
      RI.action(b, '葉を全部とる', () => { leaves = []; });
      RI.slider(root, { label: 'どこまで先', min: 2, max: 20, step: 1, value: H, fmt: v => `${v}（模型の時間。1周期 10）`, oninput: v => { H = v; } });
      RI.slider(root, { label: '置くときのずれ', min: -1, max: 1.5, step: 0.5, value: sigK, fmt: v => `池の幅の ±${+(0.025 * Math.pow(10, v)).toPrecision(2)}%`, oninput: v => { sigK = v; } });
    },
    step, draw, pointer,
  });
  window.__reidFlow = { get leaves() { return leaves; }, vel, get ftle() { return ftle; } };
})();
