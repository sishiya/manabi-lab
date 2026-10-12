// Shared numbers: the timeline (TL), time axis, stages, colors, hormone curves, small math helpers.
// Species: tobacco hornworm Manduca sexta, reared at about 26°C (the standard lab schedule).
// Time t is in days from pupal ecdysis (P0 = 0). The adult emerges late on day 18 (T_ECL).

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

const T_MIN = -6, T_ECL = 18, T_MAX = 19.5;
const MIN = 1 / 1440; // one minute in days

// Timeline in days (t = 0 pupal ecdysis). [a, b] = from a to b. Where the numbers come from:
//  sure: measured in Manduca (sources in DEVNOTES)   est: estimate / taken from other moths
const TL = {
  commit: -5.2,          // small ecdysteroid "commitment" pulse (L3)                          sure (day: est)
  wander: -4,            // W0: stops eating, empties the gut, wanders; pupal ecdysis on W4    sure
  burrow: [-3.7, -3.3],  // digs into the soil and makes a chamber                             sure (hours: est)
  prolegs: [-3.3, -0.1], // prolegs shrink                                                     sure (days: est)
  labial: [-2.5, 2],     // labial (silk/salivary) glands die over 4-5 days around pupation    sure
  lining: [-2.5, 0.3],   // larval midgut lining is shed into the gut (yellow body)            sure (days: est)
  larvalMuscle: [-0.8, 2.5], // larval muscles die as the prepupal ecdysteroid peak falls     sure
  tan: [0, 0.6],         // new pupa: pale green -> brown                                      sure (hours: est)
  apolysis: [2, 3],      // epidermis lets go of the pupal cuticle: adult development starts   sure
  airSacs: [2, 12],      // air sacs appear on P2-3                                            sure (MRI)
  gut: [2, 11],          // gut remodelling: crop P4-6, midgut moves P5-7, adult-like P9-12    sure (MRI)
  rectalSac: [14, 18],   // rectal sac fills with waste (meconium ~30% of wet weight)          sure (MRI)
  flight: [3, 14],       // adult flight muscle grows from a remnant larval fibre from P3      sure (end: est)
  cns: [2, 9],           // ganglia move forward and fuse                                      est
  scaleCells: [3, 5],    // scale-building cells become polyploid (P3-4)                       sure
  scales: [5, 11],       // scales grow out                                                    est
  wingGrey: [12.5, 15.5],// wing scales turn grey-brown (melanin, late pupa)                   est
  wingLines: [14.5, 16.8], // dark lines and spots                                             est
  eyeBuild: [0, 6],      // ommatidia are assembled (eye disc from the end of the larval stage) sure (days: est)
  eyePigment: [8, 11],   // eye pigment                                                        est
  pg: [7, 11],           // prothoracic glands die during adult development                   est
  ecdPeak: [7, 9],       // adult ecdysteroid peak; sharp fall on day 10, low by 14            sure
  ism: [T_ECL + 0.1, T_ECL + 1.3], // intersegmental muscles die after emergence (~30 h)       sure
  emerge: [T_ECL, T_ECL + 8 * MIN], // splits the pupal case at the head end and crawls out                  sure (minutes: est)
  dig: [T_ECL + 8 * MIN, T_ECL + 14 * MIN], // digs up through the soil (the case stays behind)           sure (minutes: est)
  inflate: [T_ECL + 15 * MIN, T_ECL + 70 * MIN], // wings inflate (start ~15 min, spread and tanned by ~80 min) est (no Manduca timing source found; Reynolds 1977 covers the hormones only)
  fold: T_ECL + 85 * MIN, // spread wings are rotated at the base into the resting position (~80 min) est
  meconium: [T_ECL + 80 * MIN, T_ECL + 105 * MIN], // drops the meconium                       est
};

// Slider position u (0..1) -> time. The first 100 minutes after emergence get their own stretch of the slider.
const TAX = [
  { u: 0, t: T_MIN },
  { u: 0.76, t: T_ECL },
  { u: 0.84, t: T_ECL + 15 * MIN },
  { u: 0.91, t: T_ECL + 100 * MIN },
  { u: 0.94, t: T_ECL + 6 / 24 },
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
  { id: 'larva', t0: T_MIN, t1: TL.wander, name: '終齢幼虫（5齢）', sub: 'タバコなどの葉を食べて、10g ほどまで大きくなる' },
  { id: 'wander', t0: TL.wander, t1: TL.burrow[1], name: 'ワンダリング', sub: '食べるのをやめ、もぐる場所をさがして歩き回る' },
  { id: 'prepupa', t0: TL.burrow[1], t1: -0.08, name: '前蛹', sub: '土の中に小さな部屋を作り、じっとしている' },
  { id: 'ecdysis', t0: -0.08, t1: 0.12, name: '蛹化（脱皮）', sub: '土の中で幼虫の皮をぬいで蛹になる' },
  { id: 'pupa', t0: 0.12, t1: T_ECL, name: '蛹', sub: '' },
  { id: 'eclosion', t0: T_ECL, t1: T_ECL + 100 * MIN, name: '羽化', sub: '' },
  { id: 'adult', t0: T_ECL + 100 * MIN, t1: T_MAX + 1, name: '成虫', sub: '' },
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

// Hormone levels (0..1, shape only), after the measured Manduca titres.
function hormoneJH(t) {
  return 0.12 * (1 - sm(-6, -5.4, t))       // JH falls early in the last larval stage (before the commitment pulse)
    + 0.4 * bump(-1.7, 0.45, t)             // prepupal JH peak (keeps the pupa from skipping to adult)
    + 0.45 * sm(T_ECL + 0.4, T_ECL + 1.5, t); // adult: back again for reproduction (estimate)
}
function hormoneEcd(t) {
  return 0.04
    + 0.26 * bump(TL.commit, 0.25, t)       // commitment pulse -> wandering
    + 0.7 * bump(-1.5, 0.8, t)              // prepupal peak (W1 .. P0) -> pupal molt
    + 0.96 * sm(2.5, 7, t) * (1 - sm(9.2, 10.6, t)) // adult peak: max P7-9, sharp fall on P10 -> builds the adult
    + 0.1 * sm(9.5, 10.5, t) * (1 - sm(11, 14, t)); // low by P14; the fall lets eclosion happen
}
// Switch genes (0..1)
const geneKr = t => clamp(hormoneJH(t) / 0.12, 0, 1) * (t < T_ECL + 0.3 ? 1 : 0.8);
const geneBr = t => sm(-5.6, -4.8, t) * (1 - sm(0.8, 2.5, t));
const geneE93 = t => sm(-0.8, 2.5, t);
