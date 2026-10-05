// Shared numbers: time axis, stages, colors, hormone curves, small math helpers.
// Time t is in days from pupation (t = 0). Eclosion (adult emerges) is t = 10.

const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, k) => a + (b - a) * k;
const lin = (a, b, t) => clamp((t - a) / (b - a), 0, 1);
const sm = (a, b, t) => { const k = lin(a, b, t); return k * k * (3 - 2 * k); };
const bump = (c, w, t) => Math.exp(-(((t - c) / w) ** 2));
// deterministic pseudo random in [0,1) from integers
function hash(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const T_MIN = -3, T_ECL = 10, T_MAX = 11.5;
const MIN = 1 / 1440; // one minute in days

// Slider position u (0..1) -> time. The first 30 minutes after eclosion get their own stretch of the slider
// (proboscis, wing expansion), so the axis is piecewise linear.
const TAX = [
  { u: 0, t: T_MIN },
  { u: 0.78, t: T_ECL },
  { u: 0.87, t: T_ECL + 30 * MIN },
  { u: 0.93, t: T_ECL + 3 / 24 },
  { u: 1, t: T_MAX },
];
function uToT(u) {
  u = clamp(u, 0, 1);
  for (let i = 1; i < TAX.length; i++) if (u <= TAX[i].u) {
    const a = TAX[i - 1], b = TAX[i];
    return lerp(a.t, b.t, (u - a.u) / (b.u - a.u));
  }
  return T_MAX;
}
function tToU(t) {
  t = clamp(t, T_MIN, T_MAX);
  for (let i = 1; i < TAX.length; i++) if (t <= TAX[i].t) {
    const a = TAX[i - 1], b = TAX[i];
    return lerp(a.u, b.u, (t - a.t) / (b.t - a.t));
  }
  return 1;
}

const STAGES = [
  { t0: T_MIN, t1: -2.2, name: '終齢幼虫（5齢）', sub: '葉をたくさん食べて大きくなる' },
  { t0: -2.2, t1: -1.5, name: 'ワンダリング', sub: '食べるのをやめ、蛹になる場所をさがす' },
  { t0: -1.5, t1: -0.08, name: '前蛹', sub: '糸で体を固定して、じっとしている' },
  { t0: -0.08, t1: 0.12, name: '蛹化（脱皮）', sub: '幼虫の皮をぬいで蛹になる' },
  { t0: 0.12, t1: T_ECL, name: '蛹', sub: '' },
  { t0: T_ECL, t1: T_ECL + 30 * MIN, name: '羽化', sub: '蛹の皮から出て、翅をのばす' },
  { t0: T_ECL + 30 * MIN, t1: T_MAX + 1, name: '成虫', sub: '' },
];
const stageAt = t => STAGES.find(s => t < s.t1) || STAGES[STAGES.length - 1];

// Categories (Okabe-Ito based so that they stay apart for most color vision types)
const CATS = {
  brk:  { name: '壊れる', sub: '幼虫だけの部品。細胞が自分で死に、血球が片づける', col: '#ef6a3a' },
  keep: { name: '残って作りかえる', sub: '同じ細胞を使い続けて、形やつながりを変える', col: '#56b4e9' },
  new:  { name: '新しく作る', sub: '成虫原基などの小さな細胞の集まりから育つ', col: '#2fc495' },
  mat:  { name: '材料・たくわえ', sub: '幼虫のうちにためた栄養。蛹の間に使われる', col: '#f0d042' },
  hem:  { name: '片づけ役（血球）', sub: '体液の中を動き、壊れた細胞のかけらを食べる', col: '#d58cc0' },
};
const CAT_ORDER = ['brk', 'keep', 'new', 'mat', 'hem'];

// Hormone levels (0..1, shape only). Based on Manduca / Bombyx patterns, mapped onto a ~10 day Papilio pupa.
function hormoneJH(t) {
  return 0.10 * (1 - sm(-3.0, -2.6, t))      // last bits from the feeding larva
    + 0.42 * bump(-1.05, 0.3, t)             // prepupal JH peak (keeps the pupa from skipping to adult)
    + 0.45 * sm(10.4, 11.4, t);              // adult: back again for reproduction (estimate)
}
function hormoneEcd(t) {
  return 0.04
    + 0.28 * bump(-2.4, 0.22, t)             // small "commitment" peak -> wandering
    + 0.72 * bump(-0.95, 0.33, t)            // prepupal peak -> pupal molt
    + 0.96 * sm(0.8, 3.4, t) * (1 - sm(5.2, 8.6, t)); // big pupal peak -> builds the adult; its fall -> eclosion
}
// Switch genes (0..1)
const geneKr = t => clamp(hormoneJH(t) / 0.12, 0, 1) * (t < 10.3 ? 1 : 0.8);
const geneBr = t => sm(-2.6, -2.0, t) * (1 - sm(0.6, 1.8, t));
const geneE93 = t => sm(-0.4, 1.4, t);
