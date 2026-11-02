// ヘビが進むしくみ — 石のあいだを進む（Gray 1946 の「押す点」）
// 道は石から決める: 頭が、左右かわるがわるに次の石を選び、その石の外がわをかすめる（体の半径＋石の半径のところで、石の面にそう）。
// 本物のヘビも決まった正弦波ではなく、石の位置に合わせて曲がりを変える（Gray & Lissmann 1950・Jayne 2020）。
// 体は頭の通った道をなぞって、体にそってすべる（押す点があるので横すべりはほとんどない。足りない分は、体が道から少しずれて出る横の摩擦で補う＝推定）。
// 地面の摩擦は体にそって後ろ向き。石は体を押すだけ（押す力 N ≥ 0、石の表面はなめらか＝Gray と同じ）。
// 「押す力の合計 ＋ 摩擦の合計 = 0、回す力も 0」を満たし、押す力の合計がいちばん小さい組を探す（3つまでの石の組を全部ためす）。
// 満たせなければ前へ押せない → 止める。node でも読める（tools/verify.js stones）。
'use strict';
(function (root) {
  const N = 80;
  const G = 9.81;
  const RB = 0.006, RS = 0.008;   // 体の半径（推定）・石の半径（ふつうの大きさ。'scatter' では 0.6〜1.1 cm にばらつかせる）
  const X0 = -0.6, XMAX = 7;      // 道を作る範囲（m）
  // 石にふれる所の道の傾き（はじめにためす 35° は、正弦波の道で頂上の 0.08 波長手前の傾き 37° に近い値。推定）
  const CONTACT_ANGS = [35, 25, 45].map(d => d * Math.PI / 180);
  const BETA = 20 * Math.PI / 180;   // 横の摩擦を出すときの、すべる向きと体の向きのずれの上限（推定。体がほぼ道をなぞる範囲）
  const GAP = 0.016;              // 石の原で、となりの石とのすき間の最小（体の太さ＋4 mm。体が通れるように）
  const AHEAD = 0.8;              // 道を頭の何 m 先まで作っておくか

  function make(o = {}) {
    const p = Object.assign({
      L: 0.30, mass: 0.0152, tau: 2,     // 地面と同じミルクヘビ（Hu 2009）
      lam: 0.12, A: 0.03,                // 石の並びの目安: 波長 0.4 L・ふれはば 0.1 L（Hu 2009 の実測）
      surf: 'board',                     // 石があるのは、なめらかな板の上（Gray 1946 も板にくい）
      preset: 'scatter', ahead: 0.08,    // 'every' のとき、石を頂上の何波長ぶん手前に置くか
      seed: 7, jx: 0.15, jy: 0.4,         // 'scatter' のばらつき（前後: 波長の何倍の幅、左右: ふれはばの何倍の幅）
    }, o);
    const s = { p, t: 0, S: 0, U: 0, x: new Float64Array(N), y: new Float64Array(N), tx: new Float64Array(N), ty: new Float64Array(N),
      fx: new Float64Array(N), fy: new Float64Array(N), stones: [], contacts: [], ok: true, Nsum: 0, why: '', way: [] };
    // 1周期に、ふつうの S 字（正弦波）1波長ぶんの道の長さだけ進む（秒速 8.8 cm。道が曲がりくねるほど前へは遅い）
    let acc = 0, px = 0, py = 0;
    for (let x = 0.0005; x <= p.lam + 1e-9; x += 0.0005) { const y = p.A * Math.sin(2 * Math.PI * x / p.lam); acc += Math.hypot(x - px, y - py); px = x; py = y; }
    s.waveLen = acc; s.U0 = acc / p.tau;
    placePreset(s, p.preset, true);
    // 尾の先を、石で決めた道のはじまりに置く（その前の、石のない曲がりの上から始めない）
    const w0 = s.way.find(w => w.st && w.x > X0 + p.lam);
    s.S = arcAtX(s, w0 ? w0.x - 0.01 : 0) + p.L;
    place(s); solve(s);
    // 押せない位置なら、そこから 3 cm 押しつづけられる位置まで少し先から始める（30 cm まで）
    const okAt = S => { s.S = S; place(s); extend(s, headX(s) + AHEAD); place(s); solve(s); return s.ok; };
    if (s.stones.length) for (let k = 0, S0 = s.S; k < 60; k++) {
      const S = S0 + 0.005 * k;
      if ([0, 0.01, 0.02, 0.03].every(d => okAt(S + d))) { okAt(S); break; }
    }
    return s;
  }

  // 場所から決まる乱数（0〜1）
  function rnd(seed, k) {
    let h = Math.imul(seed * 9301 + k * 49297 + 233280, 2654435761);
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  // 石を並べる。'scatter' = 曲がりごとに1つ、位置と大きさをばらつかせ、道から離れた石もまぜる（既定）、
  // 'every' = きれいに並べる（前の版。曲がりごとに1つ、頂上の少し手前）、'half' = ばらばらから3つに1つ取る、'none' = なし
  function placePreset(s, kind, fresh) {
    const p = s.p;
    s.stones = [];
    if (kind !== 'none') {
      let k = 0;
      for (let xc = p.lam / 4; xc < XMAX; xc += p.lam / 2, k++) {
        const up = k % 2 === 0 ? 1 : -1;
        const x = xc - p.lam * p.ahead, y = p.A * Math.sin(2 * Math.PI * x / p.lam);
        const sl = p.A * 2 * Math.PI / p.lam * Math.cos(2 * Math.PI * x / p.lam), d = Math.hypot(1, sl);
        if (kind === 'every') { s.stones.push({ x: x - up * sl / d * (RB + RS), y: y + up / d * (RB + RS), r: RS }); continue; }
        // 大きさ 0.5〜1.1 cm、前後に ±jx/2 波長・左右に ±jy/2 ふれはば ずらす
        const r = 0.005 + 0.006 * rnd(p.seed, k * 5);
        if (!(kind === 'half' && k % 3 === 2))
          s.stones.push({ x: x - up * sl / d * (RB + r) + (rnd(p.seed, k * 5 + 1) - 0.5) * p.jx * p.lam, y: y + up / d * (RB + r) + up * (rnd(p.seed, k * 5 + 2) - 0.5) * p.jy * p.A, r });
        // 道から離れた石（ふれない。地面に止まっている目印にもなる）
        if (rnd(p.seed, k * 5 + 3) < 0.7) {
          const r2 = 0.004 + 0.008 * rnd(p.seed, k * 5 + 4);
          s.stones.push({ x: xc + (rnd(p.seed, k * 7) - 0.5) * p.lam, y: -up * (0.065 + 0.05 * rnd(p.seed, k * 7 + 1)), r: r2 });
        }
      }
    }
    plan(s, fresh ? -Infinity : headX(s));
  }
  const headX = s => s.x[N - 1];

  // 道を作りなおす（x0 より後ろの折り返し点はそのまま。体がいまなぞっている道は変えない）。道は頭の少し先まで作り、進むにつれて足す（extend）
  // 折り返し点: 左右かわるがわるに、前の点から 0.25〜0.8 波長先の、その側の石の外がわ。石がなければ、石のない曲がり（ふつうの大きさ）
  function plan(s, x0, keepNext = true) {
    // 頭がいま向かっている折り返し点までは残す（頭のいる区間の曲線を変えない）。ただし、その道が石を通りぬけるなら作りなおす
    const all = s.way, kn = s.way.findIndex(w => w.x > x0);
    s.way = kn < 0 ? s.way : s.way.slice(0, kn + (keepNext ? 1 : 0));
    if (keepNext && kn >= 0) {
      extend(s, Math.max(x0, X0) + AHEAD);
      if (!crosses(s, x0, x0 + AHEAD)) return;
      s.way = all.slice(0, kn);
    }
    if (s.way.length < 2) s.way = leadIn(s);
    extend(s, Math.max(x0, X0) + AHEAD);
  }
  function extend(s, xEnd, maxAdd = Infinity) {
    const p = s.p, R = st => RB + st.r, way = s.way, keep = way.length, ban = {};
    for (let guard = 0; guard < 400 && way[way.length - 1].x < Math.min(xEnd, XMAX) && way.length - keep < maxAdd; guard++) {
      const last = way[way.length - 1], up = last.y > 0 ? -1 : 1;
      // 候補: その側の、ちょうどよい距離の石（近い順。ふれる所の傾きを3とおり）と、石のない曲がり
      const cand = [];
      for (const st of s.stones) {
        if (st.y * up < -0.5 * p.A || Math.abs(st.y) > p.A * 2.2) continue;     // 反対がわの石・遠すぎる石は使わない（まん中の石はどちらがわからも回りこめる）
        const dx = st.x - last.x;
        if (dx < 0.25 * p.lam || dx > 0.8 * p.lam) continue;
        // 石には曲がりの「後ろがわの面」でふれる（頂上の手前。Gray 1946）: ふれる所の道の向きは、頂上へ向かって ang 上る
        for (const ang of CONTACT_ANGS) {
          const c = Math.cos(ang), sn = Math.sin(ang);
          cand.push({ sc: Math.abs(dx - p.lam / 2) + Math.abs(ang - CONTACT_ANGS[0]) * 0.01, w: { x: st.x + R(st) * sn, y: st.y - up * R(st) * c, tx: c, ty: up * sn, st } });
        }
      }
      cand.sort((a, b) => a.sc - b.sc);
      for (const a of [1, 0.7, 1.3]) cand.push({ w: { x: last.x + p.lam / 2, y: up * p.A * a, tx: 1, ty: 0, st: null } });
      // 頭は、そこまで進むあいだ石で押しつづけられる道を選ぶ（本物も石の位置に合わせて曲がりを変える）。
      // 石を通りぬける道は選ばない。どれもだめなら、押せる時間がいちばん長いもの
      let pick = null, bestF = -2;
      const bn = ban[way.length] || new Set();
      for (const c of cand) {
        if (bn.has(c.w.st || 'free' + c.w.y)) continue;
        const f = feasible(s, way.slice(-7).concat([c.w]));
        if (f > bestF + 1e-9) { bestF = f; pick = c; }
        if (f >= 1) break;
      }
      // どの道も石を通りぬけるなら、ひとつ前の曲がりを選びなおす（体がいまなぞっている所はもどらない）
      if ((!pick || bestF < 0) && way.length > keep) {
        const w = way.pop(), k = way.length;
        (ban[k] = ban[k] || new Set()).add(w.st || 'free' + w.y);
        for (const j in ban) if (+j > k) delete ban[j];
        continue;
      }
      way.push((pick || cand[0]).w);
    }
    buildPath(s);
  }
  // 頭が way の最後から2つめの点から最後の点まで進むあいだ、つりあう押す力がある割合（0〜1）。道が石を通りぬけるなら −1
  function feasible(s, way) {
    const t = { p: s.p, way, stones: near(s.stones, way[0].x - 0.05, way[way.length - 1].x + 0.05), S: 0,
      x: new Float64Array(N), y: new Float64Array(N), tx: new Float64Array(N), ty: new Float64Array(N), fx: new Float64Array(N), fy: new Float64Array(N) };
    buildPath(t);
    // 新しい区間（最後の2点のあいだ）が石にめりこまないか
    const k0 = idxAtArc(t.ps, arcAtX(t, way[way.length - 2].x));
    for (let k = k0; k < t.px.length; k += 2) for (const st of t.stones) if (Math.hypot(t.px[k] - st.x, t.py[k] - st.y) < RB + st.r - 0.001) return -1;
    if (way.length < 8) return 1;
    const a0 = arcAtX(t, way[way.length - 2].x), a1 = arcAtX(t, way[way.length - 1].x);
    if (a0 - s.p.L < t.ps[0]) return 1;   // 体がまだ道にのりきらない（はじめのうち）
    let ok = 0, n = 0;
    for (let a = a0; a <= a1; a += 0.005, n++) { t.S = a; place(t); solve(t); if (t.ok) ok++; }
    return n ? ok / n : 1;
  }
  // 道が x0〜x1 で石を通りぬけるか
  function crosses(s, x0, x1) {
    const st = near(s.stones, x0 - 0.03, x1 + 0.03);
    for (let k = 0; k < s.px.length; k += 2) {
      if (s.px[k] < x0 || s.px[k] > x1) continue;
      for (const o of st) if (Math.hypot(s.px[k] - o.x, s.py[k] - o.y) < RB + o.r - 0.001) return true;
    }
    return false;
  }
  const near = (stones, x0, x1) => stones.filter(st => st.x > x0 && st.x < x1);
  // はじめの道: 最初に使える石に、左右の向きが合うように、石のない曲がりを後ろへ並べる
  function leadIn(s) {
    const p = s.p;
    let fs = null;
    for (const st of s.stones) if (Math.abs(st.y) <= p.A * 2.2 && st.x > X0 + p.lam && (!fs || st.x < fs.x)) fs = st;
    const way = [];
    let x = fs ? fs.x - p.lam / 2 : X0, up = fs ? -Math.sign(fs.y) : -1;
    while (x > X0 - p.lam) { way.unshift({ x, y: up * p.A, tx: 1, ty: 0, st: null }); x -= p.lam / 2; up = -up; }
    return way;
  }

  // 折り返し点を、決めた向きで通るなめらかな曲線（エルミート）にして、弧の長さで引けるように表にする
  function buildPath(s) {
    const W = s.way, n = 40, px = [], py = [], ps = [];
    let acc = 0;
    for (let k = 0; k < W.length - 1; k++) {
      const a = W[k], b = W[k + 1], ch = Math.hypot(b.x - a.x, b.y - a.y);
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        const x = h00 * a.x + h10 * ch * a.tx + h01 * b.x + h11 * ch * b.tx;
        const y = h00 * a.y + h10 * ch * a.ty + h01 * b.y + h11 * ch * b.ty;
        if (px.length) acc += Math.hypot(x - px[px.length - 1], y - py[py.length - 1]);
        px.push(x); py.push(y); ps.push(acc);
      }
    }
    // 作りなおしても、尾の先のいる所の弧の長さがずれないように、表の弧の長さをずらしてそろえる
    const old = s.ps ? { px: s.px, ps: s.ps } : null;
    s.px = Float64Array.from(px); s.py = Float64Array.from(py); s.ps = Float64Array.from(ps);
    if (old && s.S) {
      const tailS = s.S - s.p.L, ko = idxAtArc(old.ps, tailS), f = Math.max(0, Math.min(1, (tailS - old.ps[ko]) / Math.max(1e-12, old.ps[ko + 1] - old.ps[ko]))), xT = old.px[ko] + f * (old.px[ko + 1] - old.px[ko]);
      const shift = tailS - arcAtX(s, xT);
      for (let k = 0; k < s.ps.length; k++) s.ps[k] += shift;
    }
  }
  function idxAtArc(ps, a) { let lo = 0, hi = ps.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ps[m] < a) lo = m; else hi = m; } return lo; }
  function arcAtX(s, x) {
    let lo = 0, hi = s.px.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s.px[m] < x) lo = m; else hi = m; }
    const f = Math.max(0, Math.min(1, (x - s.px[lo]) / Math.max(1e-12, s.px[hi] - s.px[lo])));
    return s.ps[lo] + f * (s.ps[hi] - s.ps[lo]);
  }
  function at(s, a) {
    const ps = s.ps, lo = idxAtArc(ps, a), hi = Math.min(ps.length - 1, lo + 1);
    const f = Math.max(0, Math.min(1, (a - ps[lo]) / Math.max(1e-12, ps[hi] - ps[lo])));
    const x = s.px[lo] + f * (s.px[hi] - s.px[lo]), y = s.py[lo] + f * (s.py[hi] - s.py[lo]);
    const dx = s.px[hi] - s.px[lo], dy = s.py[hi] - s.py[lo], d = Math.hypot(dx, dy) || 1;
    return [x, y, dx / d, dy / d];
  }

  // 地面をさわった所に石を置く・石をさわったら取る。頭より前の道を作りなおす（頭が新しい石に合わせて曲がりを変える）
  function toggleStone(s, wx, wy, tolHit) {
    let r = 'add';
    const k = s.stones.findIndex(st => Math.hypot(st.x - wx, st.y - wy) < st.r + tolHit);
    if (k >= 0) { s.stones.splice(k, 1); r = 'remove'; }
    else {
      // 体に重なる所なら、体のわきにふれる所まで外へずらす
      let bi = 0, bd = 1e9;
      for (let i = 0; i < N; i++) { const d = Math.hypot(s.x[i] - wx, s.y[i] - wy); if (d < bd) { bd = d; bi = i; } }
      if (bd < RB + RS) {
        let nx = -s.ty[bi], ny = s.tx[bi];
        if ((wx - s.x[bi]) * nx + (wy - s.y[bi]) * ny < 0) { nx = -nx; ny = -ny; }
        wx = s.x[bi] + nx * (RB + RS); wy = s.y[bi] + ny * (RB + RS);
      }
      s.stones.push({ x: wx, y: wy, r: RS });
    }
    plan(s, headX(s));
    return r;
  }

  function place(s) {
    const p = s.p, ds = p.L / N;
    for (let i = 0; i < N; i++) {
      const q = at(s, s.S - p.L + (i + 0.5) * ds);
      s.x[i] = q[0]; s.y[i] = q[1]; s.tx[i] = q[2]; s.ty[i] = q[3];
    }
  }

  // ふれている石と、つりあう押す力を探す
  function solve(s) {
    const p = s.p, sf = GROUND_SURF[p.surf], ds = p.L / N, w = p.mass * G / p.L;
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) { cx += s.x[i] / N; cy += s.y[i] / N; }
    s.cx = cx; s.cy = cy;
    // 地面の摩擦: 前へすべるので、体にそって後ろ向きに μf ν
    let Fx = 0, Fy = 0, M = 0;
    for (let i = 0; i < N; i++) {
      s.fx[i] = -sf.mf * w * s.tx[i]; s.fy[i] = -sf.mf * w * s.ty[i];
      Fx += s.fx[i] * ds; Fy += s.fy[i] * ds; M += ((s.x[i] - cx) * s.fy[i] - (s.y[i] - cy) * s.fx[i]) * ds;
    }
    s.drag = Math.hypot(Fx, Fy);
    // ふれている石（体の中心線から 体の半径＋石の半径 のところにある石）
    const C = [];
    let bx0 = 1e9, bx1 = -1e9; for (let i = 0; i < N; i++) { bx0 = Math.min(bx0, s.x[i]); bx1 = Math.max(bx1, s.x[i]); }
    for (const st of s.stones) {
      if (st.x < bx0 - 0.03 || st.x > bx1 + 0.03) continue;
      let bi = -1, bd = 1e9;
      for (let i = 0; i < N; i++) { const d = Math.hypot(s.x[i] - st.x, s.y[i] - st.y); if (d < bd) { bd = d; bi = i; } }
      // 体の中心線（区切りの点を結ぶ折れ線）の上で、石にいちばん近い点 q
      let qx = s.x[bi], qy = s.y[bi], qd = bd, qt = [s.tx[bi], s.ty[bi]];
      for (const j of [bi - 1, bi]) {
        if (j < 0 || j >= N - 1) continue;
        const ex = s.x[j + 1] - s.x[j], ey = s.y[j + 1] - s.y[j], L2 = ex * ex + ey * ey;
        const u = Math.max(0, Math.min(1, ((st.x - s.x[j]) * ex + (st.y - s.y[j]) * ey) / L2));
        const px = s.x[j] + u * ex, py = s.y[j] + u * ey, d = Math.hypot(px - st.x, py - st.y);
        if (d < qd) { qd = d; qx = px; qy = py; const l = Math.sqrt(L2); qt = [ex / l, ey / l]; }
      }
      if (Math.abs(qd - (RB + st.r)) > 0.003) continue;
      const nx = (qx - st.x) / qd, ny = (qy - st.y) / qd;
      if (Math.abs(nx * qt[0] + ny * qt[1]) > 0.5) continue;   // 体のわきでふれている石だけ（尾や頭の先の向こうの石は押せない）
      C.push({ st, i: bi, nx, ny, mz: (qx - cx) * ny - (qy - cy) * nx, N: 0 });
    }
    s.contacts = C;
    // 未知数: 石ごとの押す力 N ≥ 0 と、体の区切りの組（10 区切りずつ）ごとの「横の摩擦」。
    // 横の摩擦は、体が道から少しだけ（すべる向きが体の向きから BETA まで）横へずれると出る力で、上限は μ横 ν sin BETA。
    // 石の押す力を優先して使う（横の摩擦は重みを3倍にして、合計がいちばん小さい組み合わせを線形計画で選ぶ）
    const cols = [], cost = [], ub = [];
    for (const c of C) { cols.push([c.nx, c.ny, c.mz]); cost.push(1); ub.push(Infinity); }
    const capSeg = sf.mt * w * ds * Math.sin(BETA), GN = 10;
    for (let g0 = 0; g0 < N; g0 += GN) {
      const col = [0, 0, 0];
      for (let i = g0; i < g0 + GN; i++) { col[0] -= s.ty[i] * capSeg; col[1] += s.tx[i] * capSeg; col[2] += ((s.x[i] - cx) * s.tx[i] + (s.y[i] - cy) * s.ty[i]) * capSeg; }
      const cap = GN * capSeg;
      cols.push(col); cost.push(3 * cap); ub.push(1);
      cols.push(col.map(v => -v)); cost.push(3 * cap); ub.push(1);
    }
    const xs = lp(cost, cols, [-Fx, -Fy, -M], ub);
    const K = C.length;
    s.lat = new Float64Array(N / GN);
    if (xs) {
      let sum = 0;
      C.forEach((c, j) => { c.N = xs[j]; sum += xs[j]; });
      for (let g = 0; g < N / GN; g++) s.lat[g] = xs[K + 2 * g] - xs[K + 2 * g + 1];   // −1〜1（上限に対する割合。+ は体の左へ）
      s.ok = true; s.Nsum = sum; s.why = '';
      s.latUse = s.lat.reduce((a, v) => a + Math.abs(v), 0) / (N / GN);
    } else {
      s.ok = false; s.Nsum = 0; s.latUse = 0;
      s.why = K === 0 ? 'ふれている石がない' : K < 3 ? `ふれている石が ${K} つだけ（横の摩擦を足しても足りない）` : '石の向きが前へ押せる並びになっていない';
    }
    s.U = s.ok ? s.U0 : 0;
  }
  // 線形計画（2段階の単体法・ブランドの規則）: Σ cols[j] x_j = b、0 ≤ x_j ≤ ub[j] で Σ cost x を最小に。解けなければ null
  function lp(cost, cols, b, ub) {
    const n0 = cols.length, m0 = b.length;
    const bnd = []; for (let j = 0; j < n0; j++) if (ub[j] < Infinity) bnd.push(j);
    const m = m0 + bnd.length, n = n0 + bnd.length;     // 上限は x_j + s = ub の行と、余りの変数 s で
    const T = [];
    for (let r = 0; r < m0; r++) { const row = new Array(n + m + 1).fill(0); for (let j = 0; j < n0; j++) row[j] = cols[j][r]; row[n + m] = b[r]; T.push(row); }
    bnd.forEach((j, k) => { const row = new Array(n + m + 1).fill(0); row[j] = 1; row[n0 + k] = 1; row[n + m] = ub[j]; T.push(row); });
    for (let r = 0; r < m; r++) { if (T[r][n + m] < 0) for (let j = 0; j <= n + m; j++) T[r][j] = -T[r][j]; T[r][n + r] = 1; }
    const basis = []; for (let r = 0; r < m; r++) basis.push(n + r);
    const run = (obj, allow) => {
      for (let it = 0; it < 500; it++) {
        // 減らせる列（ブランドの規則: いちばん番号の小さい列）
        let e = -1;
        for (let j = 0; j < allow; j++) {
          let rc = obj[j]; for (let r = 0; r < m; r++) rc -= obj[basis[r]] * T[r][j];
          if (rc < -1e-12) { e = j; break; }
        }
        if (e < 0) return true;
        let lr = -1, best = Infinity;
        for (let r = 0; r < m; r++) if (T[r][e] > 1e-12) { const q = T[r][n + m] / T[r][e]; if (q < best - 1e-15 || (Math.abs(q - best) <= 1e-15 && basis[r] < basis[lr])) { best = q; lr = r; } }
        if (lr < 0) return false;
        const pv = T[lr][e]; for (let j = 0; j <= n + m; j++) T[lr][j] /= pv;
        for (let r = 0; r < m; r++) if (r !== lr && T[r][e] !== 0) { const f = T[r][e]; for (let j = 0; j <= n + m; j++) T[r][j] -= f * T[lr][j]; }
        basis[lr] = e;
      }
      return false;
    };
    const o1 = new Array(n + m).fill(0); for (let r = 0; r < m; r++) o1[n + r] = 1;
    run(o1, n + m);
    let art = 0; for (let r = 0; r < m; r++) if (basis[r] >= n) art += T[r][n + m];
    const scale = Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[2]) + 1e-12;
    if (art > 1e-9 * scale) return null;
    // 0 のまま基底に残った人工変数を、ふつうの列と入れかえて追い出す
    for (let r = 0; r < m; r++) if (basis[r] >= n) {
      let e = -1; for (let j = 0; j < n; j++) if (Math.abs(T[r][j]) > 1e-9) { e = j; break; }
      if (e < 0) continue;
      const pv = T[r][e]; for (let j = 0; j <= n + m; j++) T[r][j] /= pv;
      for (let q = 0; q < m; q++) if (q !== r && T[q][e] !== 0) { const f = T[q][e]; for (let j = 0; j <= n + m; j++) T[q][j] -= f * T[r][j]; }
      basis[r] = e;
    }
    const o2 = new Array(n + m).fill(0); for (let j = 0; j < n0; j++) o2[j] = cost[j];
    for (let r = 0; r < m; r++) if (basis[r] >= n) o2[basis[r]] = 0;
    run(o2, n);
    const x = new Array(n0).fill(0); for (let r = 0; r < m; r++) if (basis[r] < n0) x[basis[r]] = T[r][n + m];
    // 確かめ: つりあいの式と、0 ≤ x ≤ 上限
    for (let r = 0; r < m0; r++) { let v = -b[r]; for (let j = 0; j < n0; j++) v += cols[j][r] * x[j]; if (Math.abs(v) > 1e-7 * scale) return null; }
    for (let j = 0; j < n0; j++) if (x[j] < -1e-9 || x[j] > ub[j] + 1e-9) return null;
    return x;
  }

  function step(s, dt) {
    s.t += dt;
    s.S += s.U * dt;
    // 道は1コマに1つずつ足す（一度にたくさん作ると止まって見える）
    if (s.way[s.way.length - 1].x < headX(s) + AHEAD) extend(s, headX(s) + AHEAD, 1);
    place(s); solve(s);
  }

  // まとめ: 何秒か進めて、進んだ距離・押す力の平均と最大・押した石の数
  function measure(o, sec = 6, dt = 0.01) {
    const s = make(o);
    const S0 = s.S, x0 = s.cx;
    let nsum = 0, nmax = 0, n = 0, stop = 0, kmax = 0;
    for (let t = 0; t < sec; t += dt) { step(s, dt); n++; nsum += s.Nsum; nmax = Math.max(nmax, ...s.contacts.map(c => c.N), 0); if (!s.ok) stop++; kmax = Math.max(kmax, s.contacts.filter(c => c.N > 0).length); }
    const W = s.p.mass * G;
    return { speed: (s.S - S0) / sec, vx: (s.cx - x0) / sec, Navg: nsum / n / W, Nmax: nmax / W, stopFrac: stop / n, kmax, drag: s.drag / W };
  }

  // 地面の摩擦の値は ground.js と同じものを使う
  const GROUND_SURF = (typeof GROUND !== 'undefined' ? GROUND : require('./ground.js')).SURF;
  const API = { N, RB, RS, make, step, measure, toggleStone, placePreset, at, replan: s => plan(s, headX(s)) };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.STONES = API;
})(typeof window !== 'undefined' ? window : globalThis);
