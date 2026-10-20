// 心地よい音・いやな音 — 地図の目標の点から、つまみを探す（推定の式を逆にたどる）
// 式は「つまみ → 点」の一方向なので、逆は1つに決まらない。ここでは、なぞりはじめの音から
// なるべく少しだけつまみを動かして、目標に近づく組み合わせを探す（つまみを1本ずつ少し動かして、近づけば採る）。
'use strict';
const Inverse = (() => {
  // 動かすつまみ（2つ目の音・自然の音の種類・ゆらぎ・倍音のずれは、見る人が決めたままにする）
  const VARS = ['f0', 'bright', 'level', 'squeal', 'amRate', 'amDepth', 'bpm', 'cents', 'noise', 'tone'];
  const meta = (k) => UI.KNOBS.find(d => d.k === k);
  const HI = { level: (68 - 40) / 35 };   // 探すときは 68 dB まで（大きくしすぎない）
  let start = null, steps = {}, allow = 'all';

  function begin(P, keys = 'all') {   // keys: そのタブで見せているつまみ（'all' ならぜんぶ）
    allow = keys; start = {}; steps = {};
    for (const k of VARS) { start[k] = UI.toPos(meta(k), P[k]) / 1000; steps[k] = 0.08; }
  }
  function cost(P, x, tv, ta) {
    const r = Psycho.analyze(P);
    let reg = 0; for (const k in x) reg += (x[k] - start[k]) ** 2;   // 動かしているつまみだけ
    return { c: (r.valence - tv) ** 2 + (r.arousal - ta) ** 2 + 0.015 * reg, r };
  }
  // 1回呼ぶごとに、つまみ1本ずつ ± に動かして試す（なぞっている間、毎コマ呼ぶ）
  function iterate(P, tv, ta, passes = 2) {
    if (!start) begin(P);
    const use = VARS.filter(k => (allow === 'all' || allow.includes(k)) && (k !== 'cents' || P.two) && ((k !== 'noise' && k !== 'tone') || (P.nature && P.nature !== 'none')));
    const x = {}; for (const k of use) x[k] = UI.toPos(meta(k), P[k]) / 1000;
    let best = cost(P, x, tv, ta);
    for (let pass = 0; pass < passes; pass++) {
      for (const k of use) {
        let moved = false;
        for (const dir of [1, -1]) {
          let nx = Math.max(0, Math.min(HI[k] || 1, x[k] + dir * steps[k]));
          if (k === 'bpm' && dir > 0 && x[k] < 0.2) nx = Math.max(nx, ta > 0 ? 0.6 : 0.25);   // 30 拍/分より下は「なし」なので、つけるときは 108（興奮へ）か 45 拍/分（落ち着きへ）から
          if (nx === x[k]) continue;
          const old = P[k];
          P[k] = UI.fromPos(meta(k), nx * 1000);
          const xx = Object.assign({}, x, { [k]: nx });
          const t = cost(P, xx, tv, ta);
          if (t.c < best.c - 1e-6) { best = t; x[k] = nx; moved = true; break; }
          P[k] = old;
        }
        steps[k] = moved ? Math.min(0.15, steps[k] * 1.3) : Math.max(0.01, steps[k] * 0.6);
      }
    }
    return { dist: Math.hypot(best.r.valence - tv, best.r.arousal - ta), res: best.r };
  }
  function end() { start = null; }
  return { iterate, begin, end, VARS };
})();
window.Inverse = Inverse;
