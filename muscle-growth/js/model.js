// Number model: one hour per step over the whole period. simulate(cond) returns arrays indexed by hour.
// All constants here; sources and sure/est notes are in DEVNOTES.md.

const H_DAY = 24, H_WEEK = 168;
const TRAIN_WEEKS = 12, REST_WEEKS = 6;
const T_END = (TRAIN_WEEKS + REST_WEEKS) * H_WEEK;   // hours
const TRAIN_HOUR = 18;                               // sessions at 18:00
const MEALS = [8, 12.5, 19.5];

// condition choices (the panel is built from these)
const CHOICES = {
  mode: { label: 'やり方', opts: [
    { v: 'mod',   name: 'ふつう', sub: '70%の重さで10回（限界の少し手前）', hyp: 1.00, neu: 1.00, dmg: 1.00, fat: 1.0 },
    { v: 'heavy', name: '重く',   sub: '90%の重さで3回',                     hyp: 0.85, neu: 1.55, dmg: 0.70, fat: 0.8 },
    { v: 'light', name: '軽く限界まで', sub: '30%の重さで、もう上がらないまで（約30回）', hyp: 0.95, neu: 0.55, dmg: 0.80, fat: 1.4 },
    { v: 'easy',  name: '軽く10回で止める', sub: '30%の重さで10回（限界まで遠い）', hyp: 0.08, neu: 0.20, dmg: 0.25, fat: 0.3 },
    { v: 'ecc',   name: '下ろす動作を重く', sub: 'ゆっくり下ろす（エキセントリック）を120%の重さで', hyp: 1.00, neu: 1.10, dmg: 2.60, fat: 1.1 },
  ]},
  sets: { label: '1回のセット数', opts: [1, 3, 6, 10, 20].map(n => ({ v: n, name: n + 'セット' })) },
  freq: { label: '週の回数', opts: [
    { v: 1, name: '週1', days: [0] }, { v: 2, name: '週2', days: [0, 3] }, { v: 3, name: '週3', days: [0, 2, 4] },
    { v: 5, name: '週5', days: [0, 1, 2, 3, 4] }, { v: 7, name: '毎日', days: [0, 1, 2, 3, 4, 5, 6] } ] },
  exp: { label: '経験', opts: [ { v: 'novice', name: 'はじめて' }, { v: 'trained', name: '2年以上つづけている' } ] },
  age: { label: '年齢', opts: [ { v: 'young', name: '20代' }, { v: 'old', name: '70代' } ] },
  protein: { label: 'たんぱく質', opts: [ { v: 'low', name: '少なめ', sub: '体重1kgあたり 0.8g/日' }, { v: 'ok', name: '十分', sub: '1.6g/日' } ] },
  sleep: { label: '睡眠', opts: [ { v: 'short', name: '5時間' }, { v: 'ok', name: '7〜8時間' } ] },
};
const DEFAULT_COND = { mode: 'mod', sets: 3, freq: 3, exp: 'novice', age: 'young', protein: 'ok', sleep: 'ok' };
const optOf = (key, v) => CHOICES[key].opts.find(o => o.v === v);

// session times (hours) for a condition
function sessionTimes(cond) {
  const days = optOf('freq', cond.freq).days, out = [];
  for (let w = 0; w < TRAIN_WEEKS; w++) for (const d of days) out.push((w * 7 + d) * H_DAY + TRAIN_HOUR);
  return out;
}

// meal bump 0..1 (peaks ~1.5 h after a meal, mostly gone by 4 h)
function fedAt(t) {
  const h = ((t % H_DAY) + H_DAY) % H_DAY;
  let f = 0;
  for (const m of MEALS) { let dt = h - m; if (dt < 0) dt += 24; if (dt < 6) f += (dt / 1.5) * Math.exp(1 - dt / 1.5); }
  return Math.min(1, f);
}

// the model
const K = {
  aAmp: 1.15,     // peak rise of synthesis drive after one session of "3 sets, moderate" (×basal)
  aMax: 2.6,      // ceiling of the drive when sessions overlap
  tauA0: 40,      // hours: novice drive decay
  tauA1: 18,      // hours: trained drive decay
  repK: 0.18,     // damage at which half of the extra synthesis goes to repair
  grow: 0.00037,  // growth per unit of net (rate × hour) not used for repair
  loss: 1 / (60 * 24), // pull of extra muscle back toward the start (per hour, with no training)
  dmg0: 0.32,     // damage of a first "3 sets moderate" session in a novice
  rbe: 0.7,     // protection gained from a damaging bout (fraction of the gap closed)
  rbeTau: 120 * 24, // hours: protection fades
  dTau: 90,       // hours: slow natural clearing of damage
  dRep: 0.010,    // damage removed per unit of repair synthesis
};

const SETF = { 1: 0.5, 3: 1, 6: 1.65, 10: 2.2, 20: 2.8 }; // per-session effect of the number of sets: levels off (est)

function simulate(cond) {
  const md = optOf('mode', cond.mode);
  const nov = cond.exp === 'novice', old = cond.age === 'old';
  const pf = cond.protein === 'ok' ? 1 : 0.72;
  const slp = cond.sleep === 'ok' ? 1 : 0.9;
  const ageA = old ? 0.75 : 1;
  const expG = nov ? 1 : 0.32;          // trained people are closer to their ceiling
  const setF = s => SETF[s];
  const S = sessionTimes(cond), sessSet = new Set(S);
  const N = T_END + 1;
  const arr = () => new Float32Array(N);
  const R = { cond, sessions: S, N, A: arr(), fed: arr(), mps: arr(), mpb: arr(), net: arr(), rep: arr(), D: arr(), P: arr(),
    neu: arr(), mac: arr(), sore: arr(), edema: arr(), M: arr(), size: arr(), Nr: arr(), str: arr(), fat: arr(), sat: arr(), nuc: arr(), Tr: arr() };
  // baseline: synthesis and breakdown balance over a rest day
  let mpsB = 0, mpbFed = 0;
  for (let h = 0; h < 24; h++) { const f = fedAt(h); mpsB += 1 + 0.55 * f; mpbFed += 0.3 * f; }
  const c0 = (mpsB + mpbFed) / 24;    // MPB = c0 - 0.3*fed + ...

  // states
  let P = nov ? 0 : 0.8, D = 0, M = 1, Nr = 1, Tr = nov ? 0 : 1, nSess = nov ? 0 : 200;
  let neu = 0, mac = 0, s1 = 0, sore = 0, edema = 0, fat = 0, sat = 0, nuc = 1, sat1 = 0;
  const impulses = []; // [t0, amp, tau] for drive
  const nMax = 1 + 0.18 * md.neu * (nov ? 1 : 0.25);
  for (let t = 0; t < N; t++) {
    if (sessSet.has(t)) {
      const st = setF(cond.sets);
      const tau = K.tauA0 + (K.tauA1 - K.tauA0) * Tr;
      impulses.push([t, K.aAmp * st * md.hyp * ageA, tau]);
      const dd = K.dmg0 * md.dmg * Math.pow(cond.sets / 3, 0.6) * (1 - P) * (old ? 1.15 : 1);
      D = Math.min(1.2, D + dd);
      neu += dd * 1.0; s1 += dd;
      sat1 += dd + 0.25 * st * md.hyp;
      P = P + (1 - P) * K.rbe * Math.min(1, dd / 0.25);
      fat = Math.min(0.6, fat + 0.28 * md.fat * Math.pow(cond.sets / 3, 0.4));
      Nr += 0.035 * md.neu * st * (nMax - Nr) / Math.max(0.01, nMax - 1) * (nov ? 1 : 0.3);
      nSess++;
      Tr = nov ? 1 - Math.exp(-nSess / 30) : 1;
    }
    // drive from all past sessions
    let A0 = 0;
    for (let i = impulses.length - 1; i >= 0; i--) {
      const dt = t - impulses[i][0]; if (dt > impulses[i][2] * 7) break;
      A0 += impulses[i][1] * (1 - Math.exp(-dt / 1.5)) * Math.exp(-dt / impulses[i][2]);
    }
    const A = K.aMax * (1 - Math.exp(-A0 / K.aMax)); // overlapping sessions saturate
    const f = fedAt(t);
    const mps = 1 + 0.55 * f + A * slp * (0.45 + 0.55 * f * pf);
    const mpb = c0 - 0.3 * f + 0.45 * A + 0.6 * D;
    const net = mps - mpb;
    const netPos = Math.max(0, net);
    const repFrac = D / (D + K.repK);
    const rep = netPos * repFrac;
    // growth: extra protein laid down, minus slow pull back toward the start
    M += K.grow * expG * (net - rep) * (net > 0 ? 1 : 0.5) - (M - 1) * K.loss * (A > 0.05 ? 0.15 : 1);
    D = Math.max(0, D - K.dRep * rep * (old ? 0.8 : 1) - D / K.dTau);
    P += -P / K.rbeTau * (nov ? 1 : 0.2);
    // inflammation chain: neutrophils (hours) -> macrophages (days); soreness lags damage by a day or two
    const neuOut = neu / 14; neu -= neuOut; mac += neuOut - mac / 50;
    const s1Out = s1 / 30; s1 -= s1Out; sore += s1Out - sore / 40;
    edema += 0.0016 * mac - edema / 70;
    const satOut = sat1 / 30; sat1 -= satOut; sat += satOut - sat / 40;
    // myonuclei: added when the fiber outgrows its nuclei (kept after detraining: debated)
    const need = M - 1.06 * nuc + 0.06; if (need > 0) nuc += need * 0.004 * Math.min(1, sat * 4);
    fat *= Math.exp(-1 / 3);
    Nr += -(Nr - 1) / (120 * 24) * (A > 0.05 ? 0 : 1);
    R.A[t] = A; R.fed[t] = f; R.mps[t] = mps; R.mpb[t] = mpb; R.net[t] = net; R.rep[t] = rep; R.D[t] = D; R.P[t] = P;
    R.neu[t] = neu; R.mac[t] = mac; R.sore[t] = Math.min(10, sore * 19); R.edema[t] = edema; R.M[t] = M;
    R.size[t] = M * (1 + edema); R.Nr[t] = Nr; R.fat[t] = fat; R.sat[t] = sat; R.nuc[t] = nuc; R.Tr[t] = Tr;
    R.str[t] = M * Nr * (1 - Math.min(0.7, 0.55 * D)) * (1 - fat);
  }
  return R;
}

// summary numbers at the end of training (12 weeks) and the end of the rest
function summarize(R) {
  const tEnd = TRAIN_WEEKS * H_WEEK - 1;
  const pre = tEnd - 60; // a little before the last session tail: use the rested value before the last week's sessions
  const at = (k, t) => R[k][Math.max(0, Math.min(R.N - 1, t))];
  let soreDays = 0, soreMax = 0, soreMaxT = 0;
  for (let d = 0; d < TRAIN_WEEKS * 7; d++) { let m = 0; for (let h = 0; h < 24; h++) m = Math.max(m, R.sore[d * 24 + h]); if (m >= 2) soreDays++; }
  for (let t = 0; t < R.N; t++) if (R.sore[t] > soreMax) { soreMax = R.sore[t]; soreMaxT = t; }
  // strength measured rested: 3 days after the last session
  const tStr = TRAIN_WEEKS * H_WEEK + 3 * 24;
  return {
    muscle: (at('M', tEnd) - 1) * 100,
    size: (at('size', tEnd) - 1) * 100,
    strength: (at('M', tStr) * at('Nr', tStr) - 1) * 100,
    after: (at('M', R.N - 1) - 1) * 100,
    soreDays, soreMax, soreMaxT,
    sessions: R.sessions.length,
  };
}
