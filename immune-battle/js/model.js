// model.js — the numbers behind the picture: within-host ODE models (time in days), body presets, the integrator.
// The micro view and the body window only *display* this state. Parameter sources and simplifications: DEVNOTES.md「モデル」.
'use strict';

const HILL = (x, h) => x / (x + h);

// ---------- body presets and memory ----------
// inn: innate cells (neutrophils, macrophages, NK) ×, adp: naive T/B precursors ×, fev: how strongly fever rises ×
const BODIES = {
  adult:  { name:'健康な大人', inn:1,    adp:1,   fev:1,    note:'ふつうの例。' },
  child:  { name:'子ども',     inn:1,    adp:1,   fev:1.2,  note:'記憶がまだ少ない。熱は高く出やすい。' },
  elder:  { name:'高齢者',     inn:0.75, adp:0.35, fev:0.55, note:'新しい T・B 細胞が少なく、獲得免疫が遅く弱い。熱があまり上がらないことがある（重くても気づきにくい）。' },
  weak:   { name:'免疫が弱い', inn:0.15, adp:0.15, fev:0.8,  note:'例: 抗がん剤の治療中で好中球がとても少ない。' },
};
const BODY_ORDER = ['adult', 'child', 'elder', 'weak'];

// ---------- pathogens ----------
// Each: vars (state names), init(P) → y, f(y, P, dy), obs(y, P) → what the body / UI shows.
// P = { dose, inn, adp, fev, mem } (mem: 'none' | 'vac' | 'prior').
const PATHOGENS = {};

// Influenza A in the nose / throat epithelium.
// Target-cell-limited model with eclipse phase (Baccam et al. 2006) + interferon-protected cells,
// saturable mucus / macrophage clearance (so small doses fail), NK cells, CTL and antibody from tiny naive pools.
PATHOGENS.flu = {
  key:'flu', name:'インフルエンザウイルス', kind:'virus', icon:'🦠',
  site:'鼻とのどの粘膜', route:'せきやくしゃみのしぶきを吸いこんで、鼻やのどの粘膜に着く。',
  doseRange:[1, 8], doseDefault:5, doseUnit:'個',
  N0: 4e8,                                   // susceptible epithelial cells in the upper airway (Baccam 2006)
  vars:['U','R','E','I','D','V','F','NK','M','A1','Ag','T','B','Ab'],
  memOptions:{ none:'なし', vac:'ワクチンを打った', prior:'前に同じ型にかかった' },
  init(P) {
    const m = P.mem;
    return { U:1, R:0, E:0, I:0, D:0, V:P.dose, F:0, NK:P.inn, M:P.inn, A1:0, Ag:0,
      T: P.adp * (m === 'prior' ? 2e4 : m === 'vac' ? 2e3 : 200),
      B: P.adp * (m === 'prior' ? 2e4 : m === 'vac' ? 2e4 : 100),
      Ab: m === 'prior' ? 1.2 : m === 'vac' ? 0.25 : 0,
    };
  },
  K: { b:0.05, kE:4, del:1.5, Y:2000, c0:3, Cm:150, Vs:2e3, phi:6, rho:0.5, rep:0.3,
       pF:40, dF:1.6, kNK:0.35, rT:2.6, Th:3e5, kT:9, rB:2.1, pA:1.5e-6, dA:0.03, kA:40 },
  // Separate terms, so the picture can show *how* each virion / infected cell disappears in the same proportions.
  // pathogen removal per day: mucus (mucus + cilia + decay), mac (macrophages), ab (antibody), cell (entering cells)
  // infected-cell loss per day: self (dies of the infection), nk, ctl
  flux(y, P) {
    const K = this.K;
    const nk = K.kNK * y.NK, ctl = K.kT * HILL(y.T, K.Th);
    return {
      pathogen: { mucus: K.c0 * y.V, mac: K.Cm * y.M * y.V / (1 + y.V / K.Vs), ab: K.kA * y.Ab * y.V, cell: K.b * y.U * y.V },
      infected: { self: K.del * y.I, nk: nk * y.I, ctl: ctl * (y.I + 0.3 * y.E) },
      prod: K.Y * K.del * this.N0 * y.I / (1 + 4 * y.F),     // interferon slows virus production in infected cells
      nk, ctl,
    };
  },
  f(y, P, d) {
    const K = this.K, N0 = this.N0, x = this.flux(y, P), pv = x.pathogen;
    const inf = pv.cell;                                      // virions entering cells per day
    const stim = HILL(y.Ag, P.mem === 'none' ? 0.02 : 0.003);   // memory cells react to less antigen
    d.U = -inf / N0 - K.phi * y.F * y.U + K.rho * y.R + K.rep * y.D;
    d.R = K.phi * y.F * y.U - K.rho * y.R;
    d.E = inf / N0 - K.kE * y.E - 0.3 * x.ctl * y.E;
    d.I = K.kE * y.E - (K.del + x.nk + x.ctl) * y.I;
    d.D = (K.del + x.nk + x.ctl) * y.I + 0.3 * x.ctl * y.E - K.rep * y.D;
    d.V = x.prod - pv.mucus - pv.mac - pv.ab - inf;
    d.F = K.pF * (0.3 + 0.7 * P.inn) * (y.I + 0.2 * y.E) - K.dF * y.F;
    d.NK = 1.0 * (P.inn * (1 + 6 * HILL(y.F, 0.05)) - y.NK);
    d.M  = 0.8 * (P.inn * (1 + 2 * HILL(y.F, 0.05)) - y.M);
    // antigen carried by dendritic cells to the lymph node (two-step delay of ~1 day)
    d.A1 = 30 * (y.I + y.E) - 1.2 * y.A1;
    d.Ag = 1.2 * y.A1 - 0.6 * y.Ag;
    const T0 = P.adp * 200, B0 = P.adp * 100;
    const pro = Math.min(1.2, 0.4 + 0.6 * P.adp);              // fewer / suppressed lymphocytes also divide less
    d.T = K.rT * pro * stim * y.T * (1 - y.T / (3e7 * P.adp + 1)) - 0.35 * (1 - stim) * Math.max(0, y.T - 20 * T0);
    d.B = K.rB * pro * stim * y.B * (1 - y.B / (2e7 * P.adp + 1)) - 0.12 * (1 - stim) * Math.max(0, y.B - 40 * B0);
    d.Ab = K.pA * y.B - K.dA * y.Ab;
  },
  obs(y, P) {
    const cy = y.F + 0.15 * HILL(y.T, 3e6) * (y.I + y.E > 1e-5 ? 1 : 0);
    const temp = 36.7 + P.fev * 2.7 * HILL(cy, 0.35);
    const sym = [];
    if (temp >= 37.5) sym.push(temp >= 38.5 ? '高い熱' : '熱');
    if (cy > 0.12) sym.push('だるさ・頭や関節の痛み');
    if (y.D + y.I > 0.03) sym.push('のどの痛み');
    if (cy > 0.04 && y.D + y.I > 0.01) sym.push('鼻水');
    if (y.D > 0.1) sym.push('せき');
    if (y.D + y.I > 0.3) sym.push('肺へ広がるおそれ');
    return {
      temp, damage: y.D + y.I, pathogen: Math.max(0, y.V), infected: y.E + y.I, protectedCells: y.R,
      innate: (y.NK + y.M) / 2, killerT: y.T, antibody: y.Ab, cytokine: cy, sym,
      lung: HILL(Math.max(0, y.D + y.I - 0.22), 0.1), lymph: HILL(y.T + y.B, 2e5), blood: 0,
    };
  },
  ended(y) { return y.V < 1 && (y.I + y.E) * this.N0 < 1; },
};

// Staphylococcus aureus in a skin cut (skin / soft-tissue infection).
// Logistic growth; complement + resident macrophages (saturable, so small inocula are cleared — Elek 1957: ~10^5–10^6 CFU
// are needed for a pustule without a foreign body); neutrophils recruited by chemokines, die into pus; antibody opsonizes.
PATHOGENS.staph = {
  key:'staph', name:'黄色ブドウ球菌', kind:'bacteria', icon:'🟡',
  site:'皮膚の傷口', route:'皮膚や鼻にふだんからいる菌が、すり傷や切り傷から中に入る。',
  doseRange:[1, 8], doseDefault:6, doseUnit:'個',
  vars:['Bac','S','N','Pus','D','Bb','A1','Ag','T','B','Ab'],
  memOptions:{ none:'なし', prior:'前にかかった（少しだけ抗体）' },
  init(P) {
    const m = P.mem;
    return { Bac:P.dose, S:0, N:0, Pus:0, D:0, Bb:0, A1:0, Ag:0,
      T:P.adp * (m === 'prior' ? 3e3 : 200), B:P.adp * (m === 'prior' ? 3e3 : 100), Ab:m === 'prior' ? 0.3 : 0 };
  },
  // r: growth per day (doubling ~3 h in tissue), Kc: local ceiling, Cc/Cm: complement / resident macrophage killing,
  // a: neutrophil search rate per bacterium, h: handling time (a neutrophil kills ~20 bacteria a day at most)
  K: { r:5.5, Kc:2e9, Cc:3, Cm:6, Bs:3e4, Nrec:4e7, a:2e-6, h:0.05, dN:1, rep:0.12 },
  // bacteria removal per day: comp (complement), mac (resident macrophages), neut (neutrophils); growth = new bacteria per day
  flux(y, P) {
    const K = this.K, B = Math.max(0, y.Bac);
    const ops = 1 + 1.5 * y.Ab;                                        // opsonizing antibody helps phagocytes
    const wall = 1 / (1 + 6 * HILL(y.Pus, 3e7));                       // inside a pus-filled abscess, bacteria are harder to reach
    const sat = B / (1 + B / K.Bs);
    return {
      pathogen: { comp: K.Cc * (0.5 + 0.5 * P.inn) * ops * sat, mac: K.Cm * P.inn * ops * sat,
                  neut: K.a * ops * wall * y.N * B / (1 + K.a * K.h * B) },
      growth: K.r * B * (1 - B / K.Kc), ops, wall,
    };
  },
  f(y, P, d) {
    const K = this.K, B = Math.max(0, y.Bac), x = this.flux(y, P), pv = x.pathogen;
    const stim = HILL(y.Ag, P.mem === 'none' ? 0.02 : 0.003), help = 1 + 1.5 * HILL(y.T, 1e6);    // helper T cells (Th17) call more neutrophils
    d.Bac = x.growth - pv.comp - pv.mac - pv.neut;
    d.S = 3 * HILL(B, 3e6) + 0.6 * y.D * HILL(B, 100) - 2 * y.S;   // damaged tissue keeps calling only while bacteria remain
    d.N = P.inn * K.Nrec * help * HILL(y.S, 0.5) - K.dN * y.N;
    d.Pus = K.dN * y.N - 0.12 * y.Pus;
    d.D = (0.6 * HILL(B, 5e8) + 0.15 * HILL(y.N, 1e8)) * (1 - y.D) - K.rep * y.D;
    d.Bb = 4e-8 * B * (0.2 + y.D) - ((3 + 40 * P.inn) * x.ops - 1.5) * y.Bb;   // spleen and liver macrophages clear the blood
    d.A1 = 6 * HILL(B, 1e6) - 1.2 * y.A1;
    d.Ag = 1.2 * y.A1 - 0.6 * y.Ag;
    const T0 = P.adp * 200, B0 = P.adp * 100;
    const pro = Math.min(1.2, 0.4 + 0.6 * P.adp);
    d.T = 2.4 * pro * stim * y.T * (1 - y.T / (2e7 * P.adp + 1)) - 0.35 * (1 - stim) * Math.max(0, y.T - 20 * T0);
    d.B = 2.0 * pro * stim * y.B * (1 - y.B / (2e7 * P.adp + 1)) - 0.12 * (1 - stim) * Math.max(0, y.B - 40 * B0);
    d.Ab = 1.2e-6 * y.B - 0.03 * y.Ab;
  },
  obs(y, P) {
    const B = Math.max(0, y.Bac);
    const cy = 0.6 * y.S * HILL(B + y.Pus * 0.01, 1e7) + 3 * HILL(y.Bb, 30);
    const temp = 36.7 + P.fev * 2.8 * HILL(cy, 0.8);
    const infl = HILL(y.S, 0.6), pus = HILL(y.Pus, 5e7);
    const sym = [];
    if (infl > 0.25) sym.push('赤み・はれ・熱っぽさ（傷のまわり）');
    if (infl > 0.4 || y.D > 0.1) sym.push('ずきずきする痛み');
    if (pus > 0.3) sym.push('うみがたまる');
    if (temp >= 37.5) sym.push(temp >= 38.5 ? '高い熱' : '熱');
    if (y.Bb > 4) sym.push('血液に菌が入った（菌血症）');
    if (y.Bb > 300) sym.push('敗血症のおそれ');
    return {
      temp, damage: y.D, pathogen: B, infected: 0, innate: y.N, neutrophil: y.N, pus, inflam: infl,
      killerT: y.T, antibody: y.Ab, cytokine: cy, sym, lung: 0, lymph: HILL(y.T + y.B, 2e5), blood: HILL(y.Bb, 20),
    };
  },
  ended(y) { return y.Bac < 1 && y.Bb < 0.01; },
};

const PATHOGEN_ORDER = ['flu', 'staph'];

// ---------- integrator ----------
// RK4 on plain objects. Values are kept ≥ 0 after each step (populations).
// The system is stiff at times (antibody neutralization can reach ~1000/day), so each step is split into
// sub-steps short enough that the fastest decay rate × sub-step stays below 0.8 (RK4 is stable to ~2.8).
function rk4(path, y, P, h) {
  const vs = path.vars, k1 = {}, k2 = {}, k3 = {}, k4 = {}, t = {};
  const add = (a, k, s) => { for (const v of vs) t[v] = Math.max(0, a[v] + s * k[v]); return t; };
  let left = h, n = 0;
  while (left > 1e-12 && n++ < 400) {
    path.f(y, P, k1);
    let rate = 0;
    for (const v of vs) if (k1[v] < 0 && y[v] > 1e-30) rate = Math.max(rate, -k1[v] / y[v]);
    const s = Math.min(left, 0.8 / Math.max(rate, 1e-9));
    path.f({ ...add(y, k1, s / 2) }, P, k2);
    path.f({ ...add(y, k2, s / 2) }, P, k3);
    path.f({ ...add(y, k3, s) }, P, k4);
    const o = {};
    for (const v of vs) o[v] = Math.max(0, y[v] + s / 6 * (k1[v] + 2 * k2[v] + 2 * k3[v] + k4[v]));
    y = o; left -= s;
  }
  return y;
}
const DT = 1 / 288;          // 5 minutes

// Run from state y for `days`, sampling every `every` days. Returns [{t, o}] (o = obs).
function forecast(path, y, P, t0, days, every) {
  const out = [];
  let t = t0, next = t0;
  for (let i = 0; t < t0 + days; i++) {
    if (t >= next - 1e-9) { out.push({ t, o: path.obs(y, P), y }); next += every; }
    y = rk4(path, y, P, DT); t += DT;
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { PATHOGENS, BODIES, rk4, forecast, DT };
