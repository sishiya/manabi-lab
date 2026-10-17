// メトロノームがそろうまで — シミュレーションの状態（設定・時間を進める・記録・カチの音のきっかけ）
'use strict';
const SIM = (() => {
  const DT = 1 / 2000;          // 計算の刻み 0.5 ms（tools/verify.js で誤差を確かめた刻み）
  const REC = 0.1;              // 記録の間隔（秒）
  const REC_MAX = 12000;        // 記録するのは最後の 1200 秒まで
  const S = {
    opt: { n: 2, start: 'anti', spread: 0.001, addMass: 0, damp: 0, esc: 'vdp' },
    sys: null, speed: 1, playing: true,
    hist: [],                   // {t, d:[i番目と1番目の位相差], r}
    recNext: 0, onTick: null,   // onTick(i): 振り子がまん中を通った
    lastSign: [],
  };
  // ばらつき: 台ごとの振動数のずれ（−1〜1 の順に並べ、あとから入れかえる。となりどうしが同じ順にならないよう）
  function detune(n) {
    const d = []; for (let i = 0; i < n; i++) d.push(n === 1 ? 0 : (i / (n - 1) - 0.5) * 2);
    const order = [0, 5, 2, 8, 1, 6, 3, 9, 4, 7].filter(k => k < n);
    return order.map(k => d[k]);
  }
  // はじめ方
  function startAngles(n, how) {
    const a = [];
    for (let i = 0; i < n; i++) {
      if (how === 'anti') a.push(i % 2 ? -0.68 : 0.7);
      else if (how === 'same') a.push(0.7 - 0.03 * (i % 3));   // ほんの少しだけずらす（まったく同じだと、ずれが育つきっかけがない）
      else a.push(Math.sin(i * 2.399 + 0.4) * 0.7);   // ばらばら（決まった並び。毎回同じになるように）
    }
    return a;
  }
  function reset(o) {
    if (o) Object.assign(S.opt, o);
    const p = S.opt;
    const pinned = S.sys ? S.sys.pinned : false;
    S.sys = PHYS.make({ n: p.n, spread: p.spread, addMass: p.addMass, damp: p.damp, esc: p.esc, seedDetune: detune(p.n) });
    S.sys.pinned = pinned;
    startAngles(p.n, p.start).forEach((v, i) => { S.sys.y[2 + 2 * i] = v; });
    S.hist = []; S.recNext = 0; S.lastSign = startAngles(p.n, p.start).map(Math.sign);
    record();
  }
  // 途中で変えられるもの（いまの動きはそのまま）
  function setLive(o) {
    Object.assign(S.opt, o);
    const sys = S.sys, p = S.opt;
    sys.c = p.damp; sys.esc = p.esc;
    sys.Mtot = PHYS.P0.mBoard + sys.n * PHYS.P0.mMet + p.addMass;
    PHYS.setSpread(sys, p.spread, detune(sys.n));
  }
  function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function record() {
    const sys = S.sys, n = sys.n, p0 = PHYS.phase(sys, 0), d = [];
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { const p = PHYS.phase(sys, i); cx += Math.cos(p); cy += Math.sin(p); if (i) d.push(wrap(p - p0)); }
    S.hist.push({ t: sys.t, d, r: Math.hypot(cx, cy) / n, x: sys.y[0] });
    if (S.hist.length > REC_MAX) S.hist.splice(0, S.hist.length - REC_MAX);
    S.recNext = sys.t + REC;
  }
  // 実時間 sec 秒ぶん進める（速さをかけて）
  function advance(sec) {
    if (!S.playing) return;
    const steps = Math.min(40000, Math.round(sec * S.speed / DT));
    const sys = S.sys, n = sys.n;
    for (let k = 0; k < steps; k++) {
      PHYS.rk4(sys, DT);
      for (let i = 0; i < n; i++) {
        const s = Math.sign(sys.y[2 + 2 * i]);
        if (s && s !== S.lastSign[i]) { if (S.lastSign[i] && S.onTick && S.speed <= 4) S.onTick(i); S.lastSign[i] = s; }
      }
      if (sys.t >= S.recNext) record();
    }
  }
  // 振り子をつつく（dir: +1 で棒の先を右へ）
  function poke(i, dir) {
    const sys = S.sys; if (!sys || i < 0 || i >= sys.n) return;
    sys.y[3 + 2 * i] -= 2.5 * dir;
  }
  function order() { const h = S.hist[S.hist.length - 1]; return h ? h.r : 0; }
  return { S, DT, reset, setLive, advance, poke, order, wrap };
})();
