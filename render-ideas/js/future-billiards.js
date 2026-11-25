// ②-B 未来の霧 × ビリヤード — ねらっているあいだ、打つずれ（角度・強さ）の未来を球ごとの色の霧で描く
// 物理（2次元・真上から）: 台 2.54 m × 1.27 m、球の半径 28.6 mm。
//   すべり → 転がり: 球の中心の速さ v と、回転の速さ u（= 半径 × 角速度、転がっているとき v = u）を別に持つ。
//   v と u がちがう（すべっている）あいだは、すべり摩擦 μ = 0.2 が v を ŝ と逆向きに、u を ŝ の向きに（5/2 倍）変える（ŝ はすべりの向き）。
//   そろったら転がりの抵抗で 0.1 m/s² ずつ遅くなる。真ん中を突くと最初は回転なし → 7分の5 の速さで転がりはじめる。
//   球どうし: はね返り係数 0.93、v の中心を結ぶ向きの成分だけやりとり（回転はそのまま）→ 当たったあと手球はおよそ 30° の向きへ曲がる。
//   クッション: はね返り係数 0.75（v と u の、かべに垂直な成分を返す。簡単にした）。穴: 中心が穴の点から 6 cm 以内で入る。
//   代表値は Alciatore 2004 ほか。ずれは角度 ±0.5°・強さ ±3%（人の打つずれの目安。推定）。
'use strict';
(() => {
  const L = 2.54, W = 1.27, R = 0.028575, G = 9.81, MU_S = 0.2, A_ROLL = 0.1, E_B = 0.93, E_C = 0.75, POCKET = 0.06;
  const DT = 1 / 500, SAMPLE = 1 / 30, TMAX = 8, N = 48;
  const POCKETS = [[0, 0], [L / 2, -0.01], [L, 0], [0, W], [L / 2, W + 0.01], [L, W]];
  const COLORS = [[245, 245, 240], [255, 205, 60], [60, 120, 230], [230, 70, 60], [150, 90, 210], [255, 140, 40], [60, 190, 110], [170, 50, 70], [150, 150, 160], [255, 225, 120]];
  let balls = [];                 // { x,y, vx,vy, ux,uy, on }
  let aim = null;                 // { dir:[cx,cy], speed }
  let fog = null, job = null, moving = false, normal = false;
  let angSig = 0.5, spdSig = 3;   // ずれ（° と %）
  const DEV = Fog.gauss(777, N * 2);
  let noteEl = null, view = { s: 1, ox: 0, oy: 0, rot: false };

  function rack() {
    balls = [{ x: L * 0.25, y: W / 2 }];
    const fx = L * 0.72, d = 2 * R * 1.002, rows = [1, 2, 3, 2, 1];   // ひし形に9個
    let k = 0;
    rows.forEach((n, r) => { for (let i = 0; i < n; i++) { balls.push({ x: fx + r * d * Math.cos(Math.PI / 6), y: W / 2 + (i - (n - 1) / 2) * d }); k++; } });
    balls.forEach((b, i) => Object.assign(b, { vx: 0, vy: 0, ux: 0, uy: 0, on: true, id: i }));
    fog = null; job = null; moving = false;
  }

  // 1刻み進める（bs は球の配列。書きかえる）。動いている球があれば true
  function stepAll(bs) {
    let any = false;
    for (const b of bs) {
      if (!b.on) continue;
      const sx = b.vx - b.ux, sy = b.vy - b.uy, s = Math.hypot(sx, sy), sp = Math.hypot(b.vx, b.vy);
      if (s > 1e-3) {   // すべっている
        const a = MU_S * G * DT, k = Math.min(a, s * 2 / 7) / s;   // 行きすぎない（そろう点で止める）
        b.vx -= k * sx; b.vy -= k * sy; b.ux += 2.5 * k * sx; b.uy += 2.5 * k * sy;
      } else if (sp > 0) {   // 転がっている
        const nv = Math.max(0, sp - A_ROLL * DT);
        if (nv < 0.003) { b.vx = b.vy = b.ux = b.uy = 0; }
        else { const f = nv / sp; b.vx *= f; b.vy *= f; b.ux = b.vx; b.uy = b.vy; }
      }
      if (b.vx || b.vy) any = true;
      b.x += b.vx * DT; b.y += b.vy * DT;
      // 穴
      for (const p of POCKETS) if ((b.x - p[0]) ** 2 + (b.y - p[1]) ** 2 < POCKET * POCKET) { b.on = false; b.pocket = POCKETS.indexOf(p); }
      if (!b.on) continue;
      // クッション
      if (b.x < R) { b.x = R; b.vx = -E_C * b.vx; b.ux = -E_C * b.ux; }
      if (b.x > L - R) { b.x = L - R; b.vx = -E_C * b.vx; b.ux = -E_C * b.ux; }
      if (b.y < R) { b.y = R; b.vy = -E_C * b.vy; b.uy = -E_C * b.uy; }
      if (b.y > W - R) { b.y = W - R; b.vy = -E_C * b.vy; b.uy = -E_C * b.uy; }
    }
    // 球どうし
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]; if (!a.on) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const c = bs[j]; if (!c.on) continue;
        const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        const push = (2 * R - d) / 2; a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
        if (vn <= 0) continue;
        const j2 = (1 + E_B) / 2 * vn;
        a.vx -= j2 * nx; a.vy -= j2 * ny; c.vx += j2 * nx; c.vy += j2 * ny; any = true;
      }
    }
    return any;
  }

  const clone = bs => bs.map(b => ({ ...b }));
  function shoot(bs, dir, speed, k) {   // k: ずれの番号（-1 ならずれなし）
    const ang = Math.atan2(dir[1], dir[0]) + (k >= 0 ? DEV[k * 2] * angSig * Math.PI / 180 : 0);
    const v = speed * (1 + (k >= 0 ? DEV[k * 2 + 1] * spdSig / 100 : 0));
    const c = bs[0]; c.vx = v * Math.cos(ang); c.vy = v * Math.sin(ang); c.ux = 0; c.uy = 0;   // 真ん中を突く＝最初は回転なし
  }
  function simulate(k) {   // 1本の未来。球ごとの道すじと、入った穴
    const bs = clone(balls); shoot(bs, aim.dir, aim.speed, k);
    const paths = bs.map(b => [[b.x, b.y]]), per = Math.round(SAMPLE / DT);
    for (let t = 0, i = 0; t < TMAX; t += DT, i++) {
      const any = stepAll(bs);
      if (i % per === 0) bs.forEach((b, n) => { if (b.on) paths[n].push([b.x, b.y]); });
      if (!any) break;
    }
    return { paths, pocket: bs.map(b => b.on ? -1 : b.pocket) };
  }

  function work(budget) {
    if (!aim || moving) return false;
    if (!job) job = { aim: { ...aim }, runs: [] };
    const t0 = performance.now();
    while (job.runs.length < N && performance.now() - t0 < budget) job.runs.push(simulate(job.runs.length));
    fog = job.runs;
    return job.runs.length < N;
  }

  function step(dt) {
    let busy = false;
    if (moving) {
      const n = Math.round(Math.min(dt, 0.05) / DT);
      let any = false; for (let i = 0; i < n; i++) any = stepAll(balls) || any;
      if (!any) { moving = false; if (!balls[0].on) { Object.assign(balls[0], { x: L * 0.25, y: W / 2, vx: 0, vy: 0, ux: 0, uy: 0, on: true }); } }
      busy = true;
    } else if (!normal) busy = work(8);
    return busy;
  }

  // 台を画面へ（縦長の画面では 90° 回す）
  function resize(w, h) {
    const rot = h > w * 1.05, M = 0.12, tw = (rot ? W : L) + 2 * M, th = (rot ? L : W) + 2 * M;
    const s = Math.min(w / tw, h / th);
    view = { s, rot, ox: (w - tw * s) / 2 + M * s, oy: (h - th * s) / 2 + M * s };
  }
  const P = (x, y) => view.rot ? [view.ox + (W - y) * view.s, view.oy + x * view.s] : [view.ox + x * view.s, view.oy + y * view.s];
  const Pinv = (sx, sy) => view.rot ? [(sy - view.oy) / view.s, W - (sx - view.ox) / view.s] : [(sx - view.ox) / view.s, (sy - view.oy) / view.s];

  function draw(g, w, h) {
    g.clearRect(0, 0, w, h);
    const s = view.s, [x0, y0] = P(0, 0), [x1, y1] = P(L, W);
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1), rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0), M = 0.07 * s;
    // 木のふちと布
    g.fillStyle = '#4a2f1f'; g.beginPath(); g.roundRect(rx - M, ry - M, rw + 2 * M, rh + 2 * M, 10); g.fill();
    const gr = g.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, Math.max(rw, rh) * 0.7);
    gr.addColorStop(0, '#2a7a52'); gr.addColorStop(1, '#17503a'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
    g.fillStyle = 'rgba(240,225,190,0.7)';
    for (let i = 1; i < 8; i++) { if (i === 4) continue; const [a, b] = P(L * i / 8, -0.035), [c, d] = P(L * i / 8, W + 0.035); g.fillRect(a - 1.5, b - 1.5, 3, 3); g.fillRect(c - 1.5, d - 1.5, 3, 3); }
    g.fillStyle = '#05090c';
    for (const p of POCKETS) { const [a, b] = P(p[0], p[1]); g.beginPath(); g.arc(a, b, POCKET * s * 0.85, 0, Math.PI * 2); g.fill(); }
    // 霧（球ごとの色）
    if (!normal && fog && !moving) {
      // 画面の座標に直すのは、霧の本数か画面の大きさが変わったときだけ
      const key = fog.length + ':' + s + ':' + view.rot;
      if (!draw.cache || draw.cache.key !== key || draw.cache.fog !== fog) {
        draw.cache = { key, fog, per: balls.map((_, n) => fog.map(r => r.paths[n].map(q => P(q[0], q[1])))) };
      }
      draw.cache.per.forEach((paths, n) => {
        if (paths.every(p => p.length < 3)) return;
        Fog.draw(g, paths, { color: COLORS[n], width: Math.max(3, R * 2 * s * 0.8), alpha: n === 0 ? 0.035 : 0.05, bins: 8, grow: 0.3 });
      });
    }
    // 球
    balls.forEach((b, n) => {
      if (!b.on) return; const [a, c] = P(b.x, b.y), r = Math.max(3, R * s);
      g.fillStyle = `rgb(${COLORS[n]})`; g.beginPath(); g.arc(a, c, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
      if (n > 0 && r > 6) { g.fillStyle = '#14202c'; g.font = `700 ${Math.round(r * 1.1)}px 'IBM Plex Mono', monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, a, c + 0.5); }
    });
    // キュー（ねらい）
    if (aim && !moving) {
      const c = balls[0], [a, b] = P(c.x, c.y), len = 0.2 + aim.speed * 0.06;
      const [e, f] = P(c.x - aim.dir[0] * (len + 0.05), c.y - aim.dir[1] * (len + 0.05)), [e2, f2] = P(c.x - aim.dir[0] * 0.05, c.y - aim.dir[1] * 0.05);
      g.strokeStyle = 'rgba(232,210,170,0.9)'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(e, f); g.lineTo(e2, f2); g.stroke();
      g.setLineDash([4, 6]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
      const [p2, q2] = P(c.x + aim.dir[0] * 0.5, c.y + aim.dir[1] * 0.5); g.beginPath(); g.moveTo(a, b); g.lineTo(p2, q2); g.stroke(); g.setLineDash([]);
    }
    RI.hud(moving ? '打ちました（実際の1本）' : aim ? `強さ ${aim.speed.toFixed(1)} m/s　霧＝ずれだけちがう ${fog ? fog.length : 0} / ${N} 本の未来` : '台の上を引っぱって放すと打ちます');
    showOdds();
  }

  function showOdds() {
    if (!noteEl) return;
    if (!aim || !fog || moving) { noteEl.innerHTML = aim ? '' : '球の色の霧＝その球がこれから通りうる道。<b>手球のうしろを引っぱる</b>と、ねらいと強さが決まります。'; return; }
    const n = fog.length, out = [];
    for (let b = 0; b < balls.length; b++) {
      if (!balls[b].on) continue;
      const k = fog.filter(r => r.pocket[b] >= 0).length;
      if (k) out.push(`${b === 0 ? '手球' : b + '番'} <b>${Math.round(k / n * 10) * 10}%</b>`);
    }
    noteEl.innerHTML = `穴に入る見こみ（${n} 本中、10% きざみ）: ${out.length ? out.join('　') : 'どれも入らない'}`;
  }

  let drag = null;
  function pointer(type, x, y) {
    if (moving || normal) return;
    const c = balls[0];
    if (type === 'down') drag = true;
    if ((type === 'down' || type === 'drag') && drag) {
      const [wx, wy] = Pinv(x, y), dx = c.x - wx, dy = c.y - wy, d = Math.hypot(dx, dy);
      if (d < 0.02) return;
      aim = { dir: [dx / d, dy / d], speed: Math.max(0.4, Math.min(6, d * 5)) };
      job = null; fog = null;
    }
    if (type === 'up' && drag) {
      drag = null; if (!aim) return;
      shoot(balls, aim.dir, aim.speed, Math.floor(Math.random() * N));   // 実際の1本も、ずれのどれか1つ
      moving = true; aim = null; fog = null; job = null;
    }
  }

  RI.add({
    id: 'future-billiards', group: 'future', label: 'ビリヤード',
    lead: '手球のうしろを<b>引っぱる</b>と、打つずれだけちがう未来が<b>球ごとの色の霧</b>になります。放すと打ちます。',
    how: `<p>ねらっているあいだ、打つ向き（±0.5°）と強さ（±3%）だけちがう 48 本の未来を計算し、球ごとにその球の色で霧を描きます。球がぶつかるたびに霧が広がるのは、小さなずれが衝突で大きくなるからです。放すと、そのうちの1本と同じずれで打ちます。</p>
      <p>すべり → 転がりの物理を入れています。真ん中を突くと手球は最初すべり、7分の5 の速さで転がりはじめます。転がる手球が的球に当たると、手球はおよそ 30° の向きへ曲がります（すべりだけなら 90°）。</p>
      <p>簡単にしているところ: 横や上下のひねり（スピン）、球どうしの摩擦、クッションでの回転の変わり方は計算していません。値は代表値です（すべり摩擦 0.2、転がりの抵抗 0.1 m/s²、はね返り 球どうし 0.93・クッション 0.75。Alciatore 2004 など）。確率は 48 本から数えたもので、±15% ほどぶれます。</p>`,
    init() { rack(); }, resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（くらべる）', normal, v => { normal = v; });
      RI.action(b, '並べなおす', () => { rack(); aim = null; });
      RI.slider(root, { label: '打つ向きのずれ', min: 0, max: 3, step: 0.1, value: angSig, fmt: v => `±${v}°`, oninput: v => { angSig = v; job = null; } });
      RI.slider(root, { label: '打つ強さのずれ', min: 0, max: 15, step: 1, value: spdSig, fmt: v => `±${v}%`, oninput: v => { spdSig = v; job = null; } });
      noteEl = RI.note(root, '');
      noteEl.style.minHeight = '3.2em';
    },
    step, draw, pointer,
  });
  window.__reidBilliards = { get balls() { return balls; }, stepAll, simulate, setAim(a) { aim = a; job = null; }, rack };
})();
