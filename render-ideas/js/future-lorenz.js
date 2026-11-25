// ②-C 未来の霧 × ローレンツの式（天気の模型）— 光る3Dの蝶の形の上で、霧がのび、ちぎれて、2つの羽に分かれる
// 式: dx/dt = σ(y−x), dy/dt = x(ρ−z) − y, dz/dt = xy − βz（σ=10, ρ=28, β=8/3。Lorenz 1963）。RK4、刻み 0.005。
//   空気の対流を3つの数にしぼった模型で、本物の天気ではない。時間に単位はない（「日」に言いかえない）。
// 霧: いまの点から ±ずれ だけちがう 300 本を H だけ先まで計算。H 先に「右の羽（x>0）」にいる割合を予報として出す。
// 予報しやすさの色ぬり（Palmer 1993 の考え）: 蝶の形の上の点ごとに、30 本のばらつきが 3 をこえるまでの時間を少しずつ計算して色に。
'use strict';
(() => {
  const SG = 10, RH = 28, BT = 8 / 3, DT = 0.005, N = 200, SAMPLE = 0.02;
  let st = [1, 1, 20], H = 5, sigK = 1.5, rotA = 0.6, normal = false, paint = false, auto = true;
  const DEV = Fog.gauss(4242, N * 3);
  let fog = null, odds = null, hz = null, hist = [];
  let ghost = [], pmap = [], pIdx = 0;   // 背景の蝶の形・予報しやすさの色
  let view = { s: 1, cx: 0, cy: 0 };

  function rk(s, n) {
    let [x, y, z] = s;
    for (let i = 0; i < n; i++) {
      const f = (x, y, z) => [SG * (y - x), x * (RH - z) - y, x * y - BT * z];
      const a = f(x, y, z), b = f(x + DT / 2 * a[0], y + DT / 2 * a[1], z + DT / 2 * a[2]);
      const c = f(x + DT / 2 * b[0], y + DT / 2 * b[1], z + DT / 2 * b[2]), d = f(x + DT * c[0], y + DT * c[1], z + DT * c[2]);
      x += DT / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0]); y += DT / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1]); z += DT / 6 * (a[2] + 2 * b[2] + 2 * c[2] + d[2]);
    }
    return [x, y, z];
  }
  function init() {
    let s = rk([1, 1, 20], 2000); ghost = [];
    for (let i = 0; i < 6000; i++) { s = rk(s, 2); ghost.push(s); }
    // 始まりは、2つの羽の分かれ目（x ≈ 0）の少し手前（いちばん未来が分かれやすい所）
    const i = ghost.findIndex((p, k) => k > 1500 && Math.abs(p[0]) < 1 && p[2] > 20);
    st = i > 60 ? ghost[i - 60] : s; pmap = ghost.filter((_, i) => i % 15 === 0).map(p => ({ p, t: null }));
  }

  function computeFog() {
    const steps = Math.round(H / SAMPLE), per = Math.round(SAMPLE / DT), sg = 1e-3 * Math.pow(10, sigK);
    const paths = []; let right = 0;
    for (let k = 0; k < N; k++) {
      let s = [st[0] + sg * DEV[k * 3], st[1] + sg * DEV[k * 3 + 1], st[2] + sg * DEV[k * 3 + 2]];
      const pts = [s];
      for (let i = 0; i < steps; i++) { s = rk(s, per); pts.push(s); }
      paths.push(pts); if (s[0] > 0) right++;
    }
    // ばらつきが 3 をこえるまでの時間
    hz = null;
    for (let i = 0; i <= steps; i++) if (Fog.spread(paths.map(p => p[i])) > 3) { hz = i * SAMPLE; break; }
    fog = paths; odds = right / N;
    hist.push(hz === null ? H : hz); if (hist.length > 240) hist.shift();
  }
  function paintWork(budget) {   // 予報しやすさ（30 本、ばらつき 3 をこえるまで、最大 4）
    const t0 = performance.now();
    while (pIdx < pmap.length && performance.now() - t0 < budget) {
      const q = pmap[pIdx++]; let ens = Array.from({ length: 30 }, (_, k) => [q.p[0] + 1e-3 * DEV[k * 3], q.p[1] + 1e-3 * DEV[k * 3 + 1], q.p[2] + 1e-3 * DEV[k * 3 + 2]]);
      let t = 0; while (t < 4 && Fog.spread(ens) <= 3) { ens = ens.map(s => rk(s, 4)); t += 4 * DT; }
      q.t = t;
    }
    return pIdx < pmap.length;
  }

  let frame = 0;
  function step(dt) {
    st = rk(st, Math.max(1, Math.round(dt * 0.45 / DT)));   // 1秒で模型の時間 0.45
    if (auto) rotA += dt * 0.15;
    if (!normal && frame++ % 4 === 0) computeFog();
    if (paint) paintWork(5);
    return true;
  }

  function resize(w, h) { const s = Math.min(w / 62, (h - 40) / 56); view = { s, cx: w / 2, cy: h / 2 + 8 }; }
  function proj(p) {   // z 軸のまわりに回し、少し上から見る
    const c = Math.cos(rotA), sn = Math.sin(rotA), x = p[0] * c - p[1] * sn, y = p[0] * sn + p[1] * c, z = p[2] - 25;
    return [view.cx + x * view.s, view.cy - (z * 0.95 + y * 0.3) * view.s];
  }
  const heat = t => { // 予報しやすい（長い）＝青 → しにくい（短い）＝赤
    const k = Math.max(0, Math.min(1, t / 2.5)); return [Math.round(255 - 150 * k), Math.round(90 + 120 * k), Math.round(80 + 175 * k)];
  };

  function draw(g, w, h) {
    g.fillStyle = '#070d14'; g.fillRect(0, 0, w, h);
    // 背景の蝶の形
    g.lineWidth = 1; g.strokeStyle = 'rgba(163,180,191,0.16)'; g.beginPath();
    ghost.forEach((p, i) => { const [x, y] = proj(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    if (paint) for (const q of pmap) if (q.t !== null) { const [x, y] = proj(q.p), c = heat(q.t); g.fillStyle = `rgba(${c},0.85)`; g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
    if (!normal && fog) Fog.draw(g, fog.map(p => p.map(proj)), { color: Fog.warmToCool, width: 3, alpha: 0.07, bins: 10, grow: 1.2, groups: 10 });
    const [px, py] = proj(st);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();
    // 羽の名前
    g.font = "500 13px 'Zen Kaku Gothic New', sans-serif"; g.textAlign = 'center'; g.fillStyle = 'rgba(232,240,244,0.6)';
    const cL = proj([-8.5, -8.5, 27]), cR = proj([8.5, 8.5, 27]);
    g.fillText('左の羽', cL[0], cL[1] - 70 * view.s / 8); g.fillText('右の羽', cR[0], cR[1] - 70 * view.s / 8);
    // 予報と、言い当てられる時間のうつりかわり
    if (!normal && odds !== null) {
      g.textAlign = 'left'; g.font = "700 15px 'Zen Kaku Gothic New', sans-serif"; g.fillStyle = '#ffc95a';
      g.fillText(`${H} 先の予報: 右の羽 ${Math.round(odds * 100)}%・左の羽 ${100 - Math.round(odds * 100)}%`, 12, 22);
      g.font = "500 12px 'Zen Kaku Gothic New', sans-serif"; g.fillStyle = 'rgba(163,180,191,0.95)';
      g.fillText(hz === null ? `${H} 先までばらつき 3 以内` : `ばらつきが 3 をこえるまで ${hz.toFixed(2)}`, 12, 40);
      const gx = w - 132, gy = 12, gw = 120, gh = 34;
      g.strokeStyle = 'rgba(44,64,82,1)'; g.strokeRect(gx, gy, gw, gh); g.strokeStyle = '#8fd3ff'; g.beginPath();
      hist.forEach((v, i) => { const x = gx + i / 240 * gw, y = gy + gh - Math.min(1, v / 7) * gh; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      g.fillStyle = 'rgba(163,180,191,0.9)'; g.textAlign = 'right'; g.fillText('言い当てられる長さ', gx + gw, gy + gh + 14);
    }
    RI.hud(paint ? `点の色＝そこから予報できる長さ（赤＝短い・青＝長い）${pIdx < pmap.length ? `　計算中 ${Math.round(pIdx / pmap.length * 100)}%` : ''}` : '霧＝ずれだけちがう 200 本の未来（黄＝すぐ先 → 青＝先のほう）');
  }

  let dragX = null;
  function pointer(type, x) {
    if (type === 'down') { dragX = x; auto = false; }
    if (type === 'drag' && dragX !== null) { rotA += (x - dragX) * 0.01; dragX = x; }
    if (type === 'up') dragX = null;
  }

  RI.add({
    id: 'future-lorenz', group: 'future', label: 'ローレンツ（天気の模型）',
    lead: '天気の模型の式の上で、少しずつちがう未来が<b>のび、ちぎれて、2つの羽に分かれ</b>ます。左右に引っぱると回ります。',
    how: `<p>ローレンツの式は、空気の対流を3つの数だけにしぼった模型です（Lorenz 1963）。点は蝶の形の「左の羽」と「右の羽」を行き来し、いつ移るかは小さなずれで変わります。少しだけちがう 200 本を計算し、「この先どちらの羽にいるか」を割合で出します。天気予報の「降水確率」と同じ考えです（アンサンブル予報）。</p>
      <p>「予報しやすさで色をぬる」を押すと、蝶の形の上の場所ごとに、未来が広がるまでの長さを計算して色にします。同じ式でも、羽の外側は予報しやすく、2つの羽の分かれ目の近くは予報しにくい、と場所でちがいます（Palmer 1993）。</p>
      <p>簡単にしているところ: これは本物の天気ではなく模型です。時間に単位はなく、日数には言いかえられません。値は σ = 10、ρ = 28、β = 8/3、計算の刻みは 0.005 です。</p>`,
    init, resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（くらべる）', normal, v => { normal = v; });
      RI.toggle(b, '予報しやすさで色をぬる', paint, v => { paint = v; });
      RI.slider(root, { label: 'どこまで先', min: 1, max: 7, step: 0.5, value: H, fmt: v => `${v}（模型の時間）`, oninput: v => { H = v; hist = []; } });
      RI.slider(root, { label: '測りのずれ', min: -1, max: 2, step: 0.5, value: sigK, fmt: v => `±${+(0.001 * Math.pow(10, v)).toPrecision(2)}`, oninput: v => { sigK = v; hist = []; } });
    },
    step, draw, pointer,
  });
  window.__reidLorenz = { get odds() { return odds; }, get hz() { return hz; }, computeFog };
})();
