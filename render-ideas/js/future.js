// ② 未来の霧 — 物を「いまの1か所」ではなく「これから行きうる場所の霧」で描く
// 外す前提: 物は、いまいる1か所に描く。
// かわりに: 測りのずれ（角度 ±0.1°・位置 ±1 mm など）だけちがう 64 本の未来を、本物の運動方程式で H 秒先まで計算し、
//   その散らばりを霧として描く（天気のアンサンブル予報と同じ考え。Molteni ほか 1996、Lorenz 1963）。
// 物理: SI 単位、g = 9.81 m/s²。振り子と二重振り子は RK4（刻み 1/400 s、摩擦なし）。くぎの玉は刻み 1/1000 s、
//   くぎ・かべとの衝突ははね返り係数 0.5 で決まった式で解く（乱数は使わない）。
'use strict';
(() => {
  const G = 9.81;
  const N = 64;                 // 未来の本数
  const DT_P = 1 / 400, DT_B = 1 / 1000, SAMPLE = 1 / 40;   // SAMPLE は両方の刻みで割り切れる
  const THRESH = 0.05;          // 「言い当てられる」範囲（5 cm）

  // ずれの形（本ごとに決まった正規乱数。毎コマ同じなので霧がちらつかない）
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const DEV = Array.from({ length: N }, () => [gauss(), gauss(), gauss(), gauss()]);

  let H = 3;                    // 何秒先まで
  let sigK = 0;                 // ずれの大きさ 10^sigK 倍（基準: 0.1°・0.1°/s・1 mm・1 mm/s）
  let normal = false, paused = false, which = -1;   // which: -1＝3つ並べる
  const sig = () => Math.pow(10, sigK);

  // ---------- 1. 振り子（長さ 1 m） ----------
  const P1 = { name: '振り子', L: 1.0, s: [Math.PI / 3, 0],
    deriv(s) { return [s[1], -(G / this.L) * Math.sin(s[0])]; },
    tip(s) { return [this.L * Math.sin(s[0]), this.L * Math.cos(s[0])]; },
    joints(s) { return [[0, 0], this.tip(s)]; },
    perturb(s, d) { const a = 0.1 * Math.PI / 180 * sig(); return [s[0] + a * d[0], s[1] + a * d[1]]; },
    box: [-1.15, -0.2, 1.15, 1.25], dt: DT_P,
  };
  // ---------- 2. 二重振り子（0.5 m ＋ 0.5 m、おもりは同じ重さ） ----------
  const P2 = { name: '二重振り子', L: 0.5, s: [2.1, 2.6, 0, 0],
    deriv(s) {
      const [a, b, wa, wb] = s, L = this.L, d = a - b;
      const den = 3 - Math.cos(2 * d);   // 2m1+m2-m2cos(2d)（m1=m2）
      const aa = (-G * 3 * Math.sin(a) - G * Math.sin(a - 2 * b) - 2 * Math.sin(d) * (wb * wb * L + wa * wa * L * Math.cos(d))) / (L * den);
      const bb = (2 * Math.sin(d) * (wa * wa * L * 2 + G * 2 * Math.cos(a) + wb * wb * L * Math.cos(d))) / (L * den);
      return [wa, wb, aa, bb];
    },
    joints(s) { const L = this.L, x1 = L * Math.sin(s[0]), y1 = L * Math.cos(s[0]); return [[0, 0], [x1, y1], [x1 + L * Math.sin(s[1]), y1 + L * Math.cos(s[1])]]; },
    tip(s) { return this.joints(s)[2]; },
    perturb(s, d) { const a = 0.1 * Math.PI / 180 * sig(); return [s[0] + a * d[0], s[1] + a * d[1], s[2] + a * d[2], s[3] + a * d[3]]; },
    energy(s) { const L = this.L, [a, b, wa, wb] = s; return L * L * (wa * wa + 0.5 * wb * wb + wa * wb * Math.cos(a - b)) - G * L * (2 * Math.cos(a) + Math.cos(b)); },
    box: [-1.1, -1.1, 1.1, 1.15], dt: DT_P,
  };
  function rk4(sys, s, h) {
    const k1 = sys.deriv(s), n = s.length, t = new Array(n);
    for (let i = 0; i < n; i++) t[i] = s[i] + h / 2 * k1[i]; const k2 = sys.deriv(t);
    for (let i = 0; i < n; i++) t[i] = s[i] + h / 2 * k2[i]; const k3 = sys.deriv(t);
    for (let i = 0; i < n; i++) t[i] = s[i] + h * k3[i]; const k4 = sys.deriv(t);
    const o = new Array(n); for (let i = 0; i < n; i++) o[i] = s[i] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); return o;
  }
  P1.adv = function (s, n) {   // 配列を作らない RK4（式は deriv と同じ）
    let [a, w] = s; const h = this.dt, q = G / this.L;
    for (let i = 0; i < n; i++) {
      const a1 = w, w1 = -q * Math.sin(a);
      const a2 = w + h / 2 * w1, w2 = -q * Math.sin(a + h / 2 * a1);
      const a3 = w + h / 2 * w2, w3 = -q * Math.sin(a + h / 2 * a2);
      const a4 = w + h * w3, w4 = -q * Math.sin(a + h * a3);
      a += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4); w += h / 6 * (w1 + 2 * w2 + 2 * w3 + w4);
    }
    return [a, w];
  };
  // 二重振り子は霧の計算でいちばん重いので、配列を作らない RK4 で（式は deriv と同じ）
  P2.adv = function (s, n) {
    let [a, b, wa, wb] = s; const h = this.dt, L = this.L;
    const f = (a, b, wa, wb, o) => {
      const d = a - b, sd = Math.sin(d), cd = Math.cos(d), den = 3 - Math.cos(2 * d);
      o[0] = wa; o[1] = wb;
      o[2] = (-G * 3 * Math.sin(a) - G * Math.sin(a - 2 * b) - 2 * sd * (wb * wb * L + wa * wa * L * cd)) / (L * den);
      o[3] = (2 * sd * (wa * wa * L * 2 + G * 2 * Math.cos(a) + wb * wb * L * cd)) / (L * den);
    };
    const k1 = [0, 0, 0, 0], k2 = [0, 0, 0, 0], k3 = [0, 0, 0, 0], k4 = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      f(a, b, wa, wb, k1);
      f(a + h / 2 * k1[0], b + h / 2 * k1[1], wa + h / 2 * k1[2], wb + h / 2 * k1[3], k2);
      f(a + h / 2 * k2[0], b + h / 2 * k2[1], wa + h / 2 * k2[2], wb + h / 2 * k2[3], k3);
      f(a + h * k3[0], b + h * k3[1], wa + h * k3[2], wb + h * k3[3], k4);
      a += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); b += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      wa += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]); wb += h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
    }
    return [a, b, wa, wb];
  };
  P1.advance = P2.advance = function (s, T) { return this.adv(s, Math.round(T / this.dt)); };

  // ---------- 3. くぎの玉（板の幅 0.8 m、玉の半径 1.5 cm、くぎの半径 0.8 cm） ----------
  const PEGS = [], ROWS = 10, Y0 = 0.22, DY = 0.075, DX = 0.08;
  const pegAt = (r, c) => [-0.36 + (r % 2 ? 0.04 : 0) + c * DX, Y0 + r * DY];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < (r % 2 ? 9 : 10); c++) PEGS.push(pegAt(r, c));
  const RB = 0.015, RP = 0.008, E = 0.5, HALF = 0.4, FLOOR = 1.05;
  const P3 = { name: 'くぎの玉', s: [0.003, 0.05, 0, 0], drop: 0, dt: DT_B,
    advance(s, T) { return this.adv(s, Math.round(T / DT_B)); },
    adv(s, n) {
      let [x, y, vx, vy] = s;
      for (let i = 0; i < n; i++) {
        if (y >= FLOOR - RB) { y = FLOOR - RB; vx = 0; vy = 0; break; }   // 床で止まる
        vy += G * DT_B; x += vx * DT_B; y += vy * DT_B;
        if (x < -HALF + RB) { x = -HALF + RB; vx = -E * vx; }
        if (x > HALF - RB) { x = HALF - RB; vx = -E * vx; }
        // 近くのくぎだけ調べる（行と列から引く）
        const r = Math.round((y - Y0) / DY);
        if (r >= 0 && r < ROWS) {
          const nc = r % 2 ? 9 : 10, c0 = Math.round((x + 0.36 - (r % 2 ? 0.04 : 0)) / DX);
          for (let c = c0 - 1; c <= c0 + 1; c++) {
            if (c < 0 || c >= nc) continue;
            const p = pegAt(r, c), dx = x - p[0], dy = y - p[1], d2 = dx * dx + dy * dy, R = RB + RP;
            if (d2 < R * R) {
              const d = Math.sqrt(d2) || 1e-9, nx = dx / d, ny = dy / d, vn = vx * nx + vy * ny;
              x = p[0] + nx * R; y = p[1] + ny * R;
              if (vn < 0) { vx -= (1 + E) * vn * nx; vy -= (1 + E) * vn * ny; }
            }
          }
        }
      }
      return [x, y, vx, vy];
    },
    tip(s) { return [s[0], s[1]]; },
    joints(s) { return [[s[0], s[1]]]; },
    perturb(s, d) { const a = 0.001 * sig(); return [s[0] + a * d[0], s[1] + a * d[1], s[2] + a * d[2], s[3] + a * d[3]]; },
    box: [-0.5, -0.05, 0.5, 1.12],
  };
  const SYS = [P1, P2, P3];
  for (const S of SYS) { S.fog = null; S.horizon = null; S.held = false; S.rest = 0; }

  // 霧を計算する。ふだんは1コマ 6 ms までに区切って少しずつ（二重振り子は全部で 40 ms ほどかかるため）
  function member(S, s0, k, steps) {
    let s = S.perturb(s0, DEV[k]); const pts = [], per = Math.round(SAMPLE / S.dt);
    for (let i = 0; i <= steps; i++) { pts.push(S.joints(s)); if (i < steps) s = S.adv(s, per); }
    return pts;
  }
  let rr = 0;
  function work(budget) {
    const t0 = performance.now(), vis = visible();
    while (performance.now() - t0 < budget) {
      // 一時停止中は、霧がまだない（作りかけの）ものだけ計算する
      const todo = paused ? vis.filter(i => !SYS[i].fog || SYS[i].job) : vis;
      if (!todo.length) return false;
      const S = SYS[todo[rr % todo.length]];
      if (!S.job) S.job = { t0: S.time || 0, s0: S.s.slice(), steps: Math.round(H / SAMPLE), paths: [] };
      S.job.paths.push(member(S, S.job.s0, S.job.paths.length, S.job.steps));
      if (S.job.paths.length === N) { finish(S, S.job.paths, S.job.t0); S.job = null; rr++; }
    }
    return true;
  }
  function computeFog(S) {
    const steps = Math.round(H / SAMPLE), paths = [];
    for (let k = 0; k < N; k++) paths.push(member(S, S.s, k, steps));
    finish(S, paths, S.time || 0);
  }
  function finish(S, paths, t0) {
    const steps = paths[0].length - 1;
    // ばらつき（いちばん先の点の、平均からの距離の二乗平均）が 5 cm をこえる時刻
    let hz = null;
    for (let i = 0; i <= steps && hz === null; i++) {
      let mx = 0, my = 0; const J = paths[0][i].length - 1;
      for (const p of paths) { mx += p[i][J][0]; my += p[i][J][1]; }
      mx /= N; my /= N; let v = 0;
      for (const p of paths) { const dx = p[i][J][0] - mx, dy = p[i][J][1] - my; v += dx * dx + dy * dy; }
      if (Math.sqrt(v / N) > THRESH) hz = i * SAMPLE;
    }
    S.fog = paths; S.fogT = t0; S.horizon = hz;
  }

  let dirty = true;
  function step(dt) {
    if (!paused) for (const S of SYS) {
      if (S.held) continue;
      // 決まった刻みで進める（コマの長さが変わっても時間がずれない）
      S.acc = (S.acc || 0) + dt; const n = Math.floor(S.acc / S.dt + 1e-9); S.acc -= n * S.dt;
      S.s = S.adv(S.s, n); S.time = (S.time || 0) + n * S.dt;
      if (S === P3 && S.s[1] >= FLOOR - RB - 1e-6) { S.rest += dt; if (S.rest > 1.2) { S.drop = (S.drop + 1) % 7; S.s = [0.003 * (S.drop - 3), 0.05, 0, 0]; S.rest = 0; S.job = null; S.fog = null; } }
    }
    let busy = false;
    if (!normal) {
      const vis = visible();
      if (dirty) { for (const i of vis) { computeFog(SYS[i]); SYS[i].job = null; } dirty = false; }
      else busy = work(6);
    }
    return !paused || busy || SYS.some(S => S.held);
  }
  const visible = () => which < 0 ? [0, 1, 2] : [which];

  // ---------- 描く ----------
  let panels = [];
  function layout(w, h) {
    const vis = visible(); panels = [];
    const pw = w / vis.length;
    vis.forEach((i, k) => {
      const S = SYS[i], [x0, y0, x1, y1] = S.box, pad = 14;
      const sc = Math.min((pw - pad * 2) / (x1 - x0), (h - 46) / (y1 - y0));
      const cx = k * pw + pw / 2 - (x0 + x1) / 2 * sc, cy = 30 + ((h - 46) - (y1 - y0) * sc) / 2 - y0 * sc;
      panels.push({ i, x: k * pw, w: pw, sc, cx, cy });
    });
  }
  const lerpC = (t) => { // 黄（すぐ先）→ 青（H 秒先）
    const a = [255, 201, 90], b = [143, 211, 255];
    return a.map((v, j) => Math.round(v + (b[j] - v) * t));
  };

  function draw(g, w, h) {
    layout(w, h);
    g.clearRect(0, 0, w, h);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const P of panels) {
      const S = SYS[P.i], X = v => P.cx + v * P.sc, Y = v => P.cy + v * P.sc;
      g.save(); g.beginPath(); g.rect(P.x, 0, P.w, h); g.clip();
      // 板とくぎ
      if (S === P3) {
        g.strokeStyle = 'rgba(232,240,244,0.25)'; g.lineWidth = 1.5;
        g.strokeRect(X(-HALF), Y(0), HALF * 2 * P.sc, FLOOR * P.sc);
        g.fillStyle = 'rgba(232,240,244,0.55)';
        for (const p of PEGS) { g.beginPath(); g.arc(X(p[0]), Y(p[1]), Math.max(1.5, RP * P.sc), 0, Math.PI * 2); g.fill(); }
      } else {
        g.fillStyle = 'rgba(232,240,244,0.5)'; g.fillRect(X(0) - 14, Y(0) - 3, 28, 3);
      }
      // 霧
      if (!normal && S.fog) {
        g.globalCompositeOperation = 'lighter';
        const steps = S.fog[0].length - 1, BINS = 12, lag = Math.min(steps - 1, Math.max(0, Math.round(((S.time || 0) - S.fogT) / SAMPLE)));
        const J = S.fog[0][0].length - 1;
        for (let jj = (S === P2 ? 1 : J); jj <= J; jj++) {
          const wFog = Math.max(4, (S === P3 ? RB * 2 : 0.035) * P.sc);
          for (let b = 0; b < BINS; b++) {
            const i0 = Math.max(lag, Math.floor(b * steps / BINS)), i1 = Math.floor((b + 1) * steps / BINS); if (i1 <= i0) continue;
            const [r, gg, bb] = lerpC(b / (BINS - 1));
            g.strokeStyle = `rgba(${r},${gg},${bb},${(jj < J ? 0.05 : 0.13) * (1 - 0.45 * b / BINS)})`;
            g.lineWidth = wFog * (1 + 0.8 * b / BINS);
            g.beginPath();
            for (const p of S.fog) { g.moveTo(X(p[i0][jj][0]), Y(p[i0][jj][1])); for (let i = i0 + 1; i <= i1; i++) g.lineTo(X(p[i][jj][0]), Y(p[i][jj][1])); }
            g.stroke();
          }
        }
        g.globalCompositeOperation = 'source-over';
      }
      // いまの物（霧のときは薄く）
      const js = S.joints(S.s), al = normal ? 0.95 : 0.35;
      g.strokeStyle = `rgba(232,240,244,${al})`; g.lineWidth = 2;
      if (S !== P3) { g.beginPath(); g.moveTo(X(js[0][0]), Y(js[0][1])); for (const q of js.slice(1)) g.lineTo(X(q[0]), Y(q[1])); g.stroke(); }
      g.fillStyle = `rgba(232,240,244,${al})`;
      for (const q of js.slice(S === P3 ? 0 : 1)) { g.beginPath(); g.arc(X(q[0]), Y(q[1]), Math.max(4, (S === P3 ? RB : 0.03) * P.sc), 0, Math.PI * 2); g.fill(); }
      // 名前と「言い当てられる時間」
      g.fillStyle = 'rgba(232,240,244,0.9)'; g.font = "700 14px 'Zen Kaku Gothic New', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(S.name, P.x + P.w / 2, 6);
      if (!normal) {
        g.font = "500 12px 'Zen Kaku Gothic New', sans-serif"; g.fillStyle = 'rgba(163,180,191,0.95)';
        g.fillText(S.horizon === null ? `${H} 秒先まで 5 cm 以内` : `5 cm 以内で言い当てられるのは ${S.horizon.toFixed(1)} 秒`, P.x + P.w / 2, 24);
      }
      g.restore();
    }
    // 区切り線
    g.strokeStyle = 'rgba(44,64,82,1)'; g.lineWidth = 1;
    for (let k = 1; k < panels.length; k++) { g.beginPath(); g.moveTo(panels[k].x, 0); g.lineTo(panels[k].x, h); g.stroke(); }
    RI.hud(normal ? 'ふつうの描き方: いまの1か所だけ' : `霧＝ずれだけちがう ${N} 本の未来（黄＝すぐ先 → 青＝${H} 秒先）`);
  }

  // ---------- 指で動かす ----------
  let grab = null;
  function pointer(type, x, y) {
    if (type === 'down') {
      const P = panels.find(P => x >= P.x && x < P.x + P.w); if (!P) return;
      grab = P; SYS[P.i].held = true;
    }
    if (!grab || (type !== 'down' && type !== 'drag' && type !== 'up')) return;
    const S = SYS[grab.i], wx = (x - grab.cx) / grab.sc, wy = (y - grab.cy) / grab.sc;
    if (S === P1) S.s = [Math.atan2(wx, wy), 0];
    else if (S === P2) { const a = Math.atan2(wx, wy); S.s = [a, a, 0, 0]; }
    else S.s = [Math.max(-HALF + RB, Math.min(HALF - RB, wx)), Math.max(0.02, Math.min(0.17, wy)), 0, 0];
    S.rest = 0; S.job = null; S.fog = null;   // 動かしているあいだは霧を作りなおす（数コマで出る）
    if (type === 'up') { S.held = false; grab = null; computeFog(S); }   // 放したらすぐ霧を出す
  }

  let selBtns = [];
  RI.add({
    id: 'future',
    lead: '物を、いまの場所ではなく<b>これから行きうる場所の霧</b>で描きます。つかんで放してみてください。',
    how: `<p>ふつうの絵は、物を「いまの1か所」に描きます。ここでは、測りのずれ（ふつうは角度 ±0.1°、位置 ±1 mm）だけちがう 64 本の未来を運動方程式で計算し、その散らばりを霧にしています。天気予報が、少しずつちがう予報を何十本も計算する「アンサンブル予報」と同じ考えです（Molteni ほか 1996）。</p>
      <p>振り子の霧はゆっくり細長く広がり、二重振り子とくぎの玉はある時刻から一気に広がります。小さなずれがどんどん大きくなる「カオス」です（Lorenz 1963）。上の「言い当てられる時間」は、64 本の先端のばらつきが 5 cm をこえるまでの時間です。</p>
      <p>簡単にしているところ: 空気の抵抗と摩擦はなし（くぎの玉だけ、はね返り係数 0.5）。ずれは、角度と角速度（±0.1°、±0.1°/秒）、位置と速さ（±1 mm、±1 mm/秒）に入れています。計算の刻みは振り子 1/400 秒、くぎの玉 1/1000 秒です。</p>`,
    resize(w, h) { layout(w, h); },
    controls(root) {
      const b = RI.buttons(root);
      const names = ['3つ並べる', '振り子', '二重振り子', 'くぎの玉'];
      selBtns = names.map((nm, k) => RI.toggle(b, nm, which === k - 1, () => { which = k - 1; selBtns.forEach((x, j) => x.setAttribute('aria-pressed', j === k)); dirty = true; }));
      RI.slider(root, { label: 'どこまで先', min: 0.5, max: 5, step: 0.5, value: H, fmt: v => `${v} 秒`, oninput: v => { H = v; dirty = true; } });
      RI.slider(root, { label: '測りのずれ', min: -1, max: 2, step: 0.5, value: sigK, fmt: v => { const s = Math.pow(10, v); return `±${+(0.1 * s).toPrecision(2)}°・±${+(1 * s).toPrecision(2)} mm`; }, oninput: v => { sigK = v; dirty = true; } });
      const b2 = RI.buttons(root);
      RI.toggle(b2, 'ふつうの描き方（くらべる）', normal, v => { normal = v; dirty = true; });
      RI.toggle(b2, '一時停止', paused, v => { paused = v; dirty = true; });
      RI.note(root, '<span class="legend"><span><i style="background:#ffc95a"></i>すぐ先</span><span><i style="background:#8fd3ff"></i>先のほう</span></span>');
    },
    enter() { if (which === -1 && RI.size.w < 640) which = 1; dirty = true; selBtns.forEach((x, j) => x.setAttribute('aria-pressed', j === which + 1)); },
    step, draw, pointer,
  });
  window.__reidFuture = { SYS, computeFog,
    // 計算の確かめ: 二重振り子のエネルギーのずれと、刻みを半分にしたときの先端の差（測りのずれより十分小さいか）
    check(sec = 3) {
      const s0 = [2.1, 2.6, 0, 0], E0 = P2.energy(s0);
      const a = P2.advance(s0, sec); const sv = P2.dt; P2.dt = sv / 2; const b = P2.advance(s0, sec); P2.dt = sv;
      const ta = P2.tip(a), tb = P2.tip(b);
      // 速い RK4 と、ふつうに書いた RK4（deriv を使う）が同じ答えか
      let x = s0; for (let i = 0; i < Math.round(sec / P2.dt); i++) x = rk4(P2, x, P2.dt);
      let y = [1.0, 0]; for (let i = 0; i < Math.round(sec / P1.dt); i++) y = rk4(P1, y, P1.dt);
      const tx = P2.tip(x), y2 = P1.adv([1.0, 0], Math.round(sec / P1.dt));
      return { energyRel: Math.abs(P2.energy(a) - E0) / Math.abs(E0), tipDiff_m: Math.hypot(ta[0] - tb[0], ta[1] - tb[1]),
        fastVsPlain2: Math.hypot(ta[0] - tx[0], ta[1] - tx[1]), fastVsPlain1: Math.abs(y[0] - y2[0]) };
    } };
})();
