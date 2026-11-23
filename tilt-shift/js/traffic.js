// ジオラマに見えるわけ — 道を走る物（車・列車・人）。決まった道すじ（折れ線）の上を、前との間をあけて進み、赤信号・駅で止まる
// 前の車との間: 目標の速さ v0 と「車間 ÷ 車間時間」の小さいほう（かんたんな追従のモデル）。加速・減速の上限つき。
'use strict';
const Traffic = (() => {
  // path: [[x, z], ...]、loop: 端から始めにもどるか。y は高さ（高架など）
  function lane(path, o = {}) {
    const seg = [], P = path.slice(); if (o.loop) P.push(P[0]);
    let L = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[i + 1], l = Math.hypot(x1 - x0, z1 - z0);
      seg.push({ x0, z0, dx: (x1 - x0) / l, dz: (z1 - z0) / l, s0: L, l }); L += l;
    }
    return { seg, L, loop: !!o.loop, y: o.y || 0, v0: o.v0 || 12, stops: o.stops || [], items: [] };
  }
  // 返す: [x, z, 向き, 道の外か]。端のある道では、道の外（はじめの前・終わりのあと）にいる物は見せない
  function at(ln, s) {
    const out = !ln.loop && (s < 0 || s > ln.L);
    s = ln.loop ? ((s % ln.L) + ln.L) % ln.L : Math.min(ln.L, Math.max(0, s));
    let lo = 0, hi = ln.seg.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ln.seg[m].s0 <= s) lo = m; else hi = m - 1; }
    const g = ln.seg[lo], t = s - g.s0;
    return [g.x0 + g.dx * t, g.z0 + g.dz * t, Math.atan2(g.dx, g.dz), out];
  }
  // 物を道に置く: { s, len, v0, gap（止まったときの間 m）, Th（車間時間 s）, a（加速）, b（減速） }
  function add(ln, it) {
    Object.assign(it, Object.assign({ v: 0, gap: 2.5, Th: 1.3, a: 2.0, b: 4.5, v0: ln.v0 }, it)); ln.items.push(it); return it;
  }
  // stops: [{ s, red: t => bool, dwell? }]。dwell（駅）: その位置で dwell 秒止まってから出る
  function step(ln, dt, t) {
    if (!ln.items.length) return;
    const it = ln.items.slice().sort((a, b) => a.s - b.s);   // 並べ替えは写しで（items の順＝絵の番号を変えない）
    for (let i = 0; i < it.length; i++) {
      const c = it[i]; let free = Infinity;
      const nx = it[(i + 1) % it.length];
      if (it.length > 1 && (ln.loop || i < it.length - 1)) {
        let d = nx.s - c.s; if (d <= 0) d += ln.L;
        free = d - (nx.len + c.len) / 2 - c.gap;
      }
      for (const st of ln.stops) {
        let d = st.s - c.s; if (ln.loop && d < -c.len) d += ln.L;
        if (d < -0.5 || d > 80) continue;
        if (st.dwell) {
          if (c.dwellUntil == null && d < 0.6 && c.v < 0.6) c.dwellUntil = t + st.dwell * (0.8 + Math.random() * 0.4);
          if (c.dwellUntil != null) { if (t < c.dwellUntil) free = Math.min(free, 0); else { c.leftStop = st; c.dwellUntil = null; } }
          else if (c.leftStop !== st) free = Math.min(free, d);
        } else if (st.red(t) && d > 1.0) free = Math.min(free, d - 1.0);
      }
      for (const st of ln.stops) if (c.leftStop === st && Math.abs(st.s - c.s) > 30) c.leftStop = null;
      const vMax = Math.max(0, Math.min(c.v0, free / c.Th, Math.sqrt(Math.max(0, 2 * c.b * 0.8 * free))));
      c.v = vMax > c.v ? Math.min(vMax, c.v + c.a * dt) : Math.max(vMax, c.v - c.b * 2 * dt);
    }
    for (const c of it) {
      c.s += c.v * dt;
      if (ln.loop) c.s = ((c.s % ln.L) + ln.L) % ln.L;
      else if (c.s > ln.L + c.len) c.s -= ln.L + 2 * c.len;   // 端まで行ったら始めから（場面の外なので見えない）
    }
  }
  return { lane, at, add, step };
})();
