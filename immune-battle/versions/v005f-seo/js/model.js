// model.js — the numbers behind the picture: within-host ODE models (time in days), body presets, medicines, the integrator.
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

// ---------- medicines ----------
// P.drugs = { key: {on, off} } (days), P.drugs.apy = [dose times]. The level 0–1 rises after `on` (ramp, days)
// and falls with the half-life after `off`. Doses taken several times a day are treated as one steady level.
// Antivirals: eff = fraction of virus production blocked; mode 'release' (virions stay stuck on the cell) or 'make'
// (fewer copies are made inside the cell). Antibiotics: kill = bacteria killed per day at full level,
// s = for ordinary (sensitive) bacteria, r = for resistant ones (MRSA).
const DRUGS = {
  ose:  { name:'オセルタミビル', days:5, half:0.35, ramp:0.06, eff:0.85, mode:'release', how:'飲み薬・1日2回を5日間',
          text:'ノイラミニダーゼ阻害薬。ウイルスが細胞から切りはなれるときに使う「はさみ」（ノイラミニダーゼ）を止める。できたウイルスは細胞の表面にくっついたまま外へ出られない。すでに出たウイルスや、感染した細胞を消すわけではない。症状が出てから48時間以内に始めると、熱の出る期間が1日ほど短くなる。' },
  balo: { name:'バロキサビル', days:3, half:1.5, ramp:0.08, eff:0.97, mode:'make', how:'飲み薬・1回だけ',
          text:'細胞の核の中でウイルスの遺伝子がコピーされるのに必要な酵素（キャップ依存性エンドヌクレアーゼ）を止める。感染した細胞がウイルスを作れなくなるので、ウイルスの数は早く減る。体に長く残るので1回でよい。' },
  nirm: { name:'ニルマトレルビル（＋リトナビル）', days:5, half:0.25, ramp:0.06, eff:0.9, mode:'make', how:'飲み薬・1日2回を5日間（重くなりやすい人に）',
          text:'新型コロナウイルスが自分の部品を切り分けるときに使う「はさみ」（3CL プロテアーゼ）を止める。部品が作れず、新しいウイルスがほとんどできなくなる。リトナビルは薬が早く分解されないようにするために一緒に飲む。症状が出てから5日以内に始める。重くなりやすい人（高齢者など）で、入院や重症化を大きく減らした。' },
  ceph: { name:'セファレキシン', days:7, half:0.06, ramp:0.04, kill:{ s:15, r:0.3 }, how:'飲み薬・1日4回を7日間',
          text:'ペニシリンの仲間（βラクタム系）の抗生物質。菌が分裂するときに細胞の壁（ペプチドグリカン）を作れなくして、壁が破れて菌が死ぬ。ヒトの細胞には壁がないので効かない。MRSA は壁を作る酵素が変わっていて効かない。うみの中や、細胞の中に入りこんだ菌には届きにくい。' },
  vanc: { name:'バンコマイシン', days:7, half:0.25, ramp:0.05, kill:{ s:8, r:8 }, how:'点滴・1日2回を7日間',
          text:'別のしくみで細胞の壁の材料にくっついて、壁を作れなくする抗生物質。MRSA にも効く。ただし効き方はβラクタム系よりゆっくりで、ふつうの菌にはセファレキシンなどの方がよく効く。' },
  amox: { name:'アモキシシリン', days:7, half:0.06, ramp:0.04, kill:{ s:16, r:1 }, how:'飲み薬・1日3回を5〜7日間',
          text:'ペニシリンの仲間（βラクタム系）の抗生物質。肺炎球菌の多くによく効き、細胞の壁を作れなくして菌を壊す。重いときは入院して点滴の抗生物質を使う。' },
  water:{ name:'水分をたくさんとる', days:3, half:0.3, ramp:0.1, how:'ふだんより多めに飲み、トイレをがまんしない',
          text:'おしっこの回数が増えると、尿の中に浮いている菌がそのたびに流し出される。ただし膀胱の細胞にくっついたり、細胞の中に入りこんだりした菌は流れない。菌の数が少なければ、これだけで治ることもある。' },
  ors:  { name:'経口補水液', days:3, half:0.3, ramp:0.05, how:'少しずつ、何回にも分けて飲む',
          text:'下痢や嘔吐で失った水と塩分（ナトリウム・カリウム）とブドウ糖を、腸から吸収しやすい割合でふくむ飲み物。ノロウイルスに効く薬はないので、脱水を防ぐことがいちばん大事な手当て。ウイルスの数は変わらない。下痢止めはウイルスを出すのを妨げるので、ふつうは使わない。' },
  apy:  { name:'解熱剤（アセトアミノフェン）', how:'1回飲むと4〜6時間効く',
          text:'脳の体温の中枢に働いて、体温の目標を下げる。だるさや痛みも楽になる。ウイルスや菌を減らすわけではないので、経過そのものはほとんど変わらない（数のグラフは同じ）。' },
};
function drugLevel(P, key, t) {
  const c = P.drugs && P.drugs[key], D = DRUGS[key];
  if (!c || t < c.on) return 0;
  const up = 1 - Math.exp(-(t - c.on) / D.ramp);
  return t <= c.off ? up : up * Math.exp(-(t - c.off) * Math.LN2 / D.half);
}
// antipyretic: each dose works from ~45 min, holds ~4 h, then fades
function apyLevel(P, t) {
  let L = 0;
  for (const td of (P.drugs && P.drugs.apy) || []) {
    const x = t - td; if (x < 0) continue;
    L = Math.max(L, (1 - Math.exp(-x / 0.02)) * (x < 0.17 ? 1 : Math.exp(-(x - 0.17) / 0.06)));
  }
  return L;
}
// fever lowered by the antipyretic (by up to ~1.3 ℃, never below normal)
const lowerFever = (temp, P, t) => temp - Math.min(Math.max(0, temp - 36.8), 1.3 * apyLevel(P, t));

// ---------- vaccines ----------
// A vaccine gives the lymph node the enemy's pieces without the disease. P.vacc = [times of doses] (days).
// amp: how much antigen one dose delivers (it stays a few days at the injection site), fever: side effect.
const VACCINES = {
  flu:    { name:'インフルエンザワクチン', kind:'不活化ワクチン（こわしたウイルスのたんぱく質）', doses:[0], amp:0.004, fever:0.15,
            text:'こわしたウイルスから取り出した、とげ（ヘマグルチニン）などのたんぱく質。増えないので病気にはならない。毎年はやる型が変わるので、毎年その年の型で作り直す。' },
  covid:  { name:'新型コロナワクチン', kind:'mRNA ワクチン（スパイクの設計図）', doses:[0, 21], amp:0.004, fever:0.6,
            text:'スパイクたんぱく質の設計図（mRNA）を脂の粒に包んだもの。腕の筋肉などの細胞が設計図を読んでスパイクだけを作り、それを免疫が覚える。mRNA は数日で分解され、核の遺伝子には入らない。2回目のあとに熱やだるさが出やすい。' },
  pneumo: { name:'肺炎球菌ワクチン', kind:'結合型ワクチン（莢膜の糖＋たんぱく質）', doses:[0], amp:0.006, fever:0.1,
            text:'菌の莢膜の糖を、免疫がよく反応するたんぱく質につないだもの。莢膜に対する抗体ができ、菌が食べられやすくなる。莢膜の型は90種類以上あり、ワクチンに入っている型にだけ効く。' },
};
function vacSignal(P, t) {
  const V = P.vaccine; if (!V || !P.vacc) return 0;
  let s = 0;
  for (const td of P.vacc) if (t >= td) s += V.amp * Math.exp(-(t - td) / (V.tau || 6));   // the antigen and the germinal-centre reaction last some days
  return s;
}
// side effects in the first days after a dose: sore arm, sometimes a mild fever
function vacEffects(y, P, raw, sym) {
  if (!P.vaccine || !P.vacc) return raw;
  let side = 0, n = 0;                                            // the reaction lasts only a day or two
  for (const td of P.vacc) if (y.t >= td) { side = Math.max(side, Math.exp(-(y.t - td) / 0.7)); n++; }
  if (side < 0.01) return raw;
  if (side > 0.25) sym.push(L('注射したところが痛い・はれる（ワクチンの副反応）', 'Sore, swollen injection site (vaccine side effect)'));
  return raw + P.fev * P.vaccine.fever * (n >= 2 ? 1.6 : 1) * 2 * HILL(side, 0.6);   // the second dose usually brings more fever
}

// shared adaptive immunity: antigen reaches the lymph node in ~1 day; T and B cells grow from tiny naive pools.
// Memory cells (more B cells than the naive pool) react to less antigen and so start sooner.
function adaptive(y, P, d, signal, K) {
  const B0 = P.adp * 100, memK = HILL(y.B / (B0 + 1), 30);
  const stim = HILL(y.Ag, 0.02 * (1 - 0.85 * memK));
  signal += vacSignal(P, y.t);
  d.A1 = signal - 1.2 * y.A1;
  d.Ag = 1.2 * y.A1 - 0.6 * y.Ag;
  const T0 = P.adp * 200;
  const pro = Math.min(1.2, 0.4 + 0.6 * P.adp);                    // fewer / suppressed lymphocytes also divide less
  d.T = K.rT * pro * stim * y.T * (1 - y.T / (K.Tmax * P.adp + 1)) - 0.35 * (1 - stim) * Math.max(0, y.T - 20 * T0);
  d.B = K.rB * pro * stim * y.B * (1 - y.B / (2e7 * P.adp + 1)) - 0.12 * (1 - stim) * Math.max(0, y.B - 40 * B0);
  d.Ab = K.pA * y.B - K.dA * y.Ab;
  return stim;
}
const memInit = (P, M) => { const m = (M && M[P.mem]) || {}; return { T:P.adp * (m.T || 200), B:P.adp * (m.B || 100), Ab:m.Ab || 0 }; };

// ---------- pathogens ----------
// Each: vars (state names), init(P) → y, flux(y, P) (separate removal terms), f(y, P, dy), obs(y, P) → what the body
// and UI show, ended(y). P = { dose, inn, adp, fev, mem, drugs, resist }. y.t is the time in days (dt/dt = 1).
// Display fields: scene (micro-view layout), look (how the enemy is drawn), bodySite (body window), drugs (buttons).
const PATHOGENS = {};

// ===== viruses that grow inside epithelial cells =====
// Target-cell-limited model with eclipse phase (Baccam et al. 2006) + interferon-protected cells,
// saturable mucus / macrophage clearance (so small doses fail), NK cells, CTL and antibody from tiny naive pools.
const VIRUS_K = { b:0.05, kE:4, del:1.5, Y:2000, c0:3, Cm:150, Vs:2e3, phi:6, rho:0.5, rep:0.3,
  pF:40, dF:1.6, kNK:0.35, rT:2.6, Th:3e5, kT:9, rB:2.1, pA:1.5e-6, dA:0.03, kA:40, Tmax:3e7, fevK:2.7, agK:30 };
function makeVirus(def) {
  return Object.assign({
    kind:'virus', N0:4e8,
    vars:['t','U','R','E','I','D','V','F','NK','M','A1','Ag','T','B','Ab'],
    init(P) { return { t:0, U:1, R:0, E:0, I:0, D:0, V:P.dose, F:0, NK:P.inn, M:P.inn, A1:0, Ag:0, ...memInit(P, this.mem) }; },
    // pathogen removal per day: mucus (mucus / gut flow + decay), mac (macrophages), ab (antibody), cell (entering cells)
    // infected-cell loss per day: self (dies of the infection), nk, ctl
    flux(y, P) {
      const K = this.K;
      const nk = K.kNK * y.NK, ctl = K.kT * HILL(y.T, K.Th);
      let release = 0, make = 0, av = 0;
      for (const k of this.drugs) {
        const D = DRUGS[k]; if (!D || !D.eff) continue;
        const L = drugLevel(P, k, y.t); av = 1 - (1 - av) * (1 - D.eff * L);
        if (D.mode === 'release') release = Math.max(release, L); else make = Math.max(make, L);
      }
      return {
        pathogen: { mucus: K.c0 * y.V, mac: K.Cm * y.M * y.V / (1 + y.V / K.Vs), ab: K.kA * y.Ab * y.V, cell: K.b * y.U * y.V },
        infected: { self: K.del * y.I, nk: nk * y.I, ctl: ctl * (y.I + 0.3 * y.E) },
        // interferon slows virus production in infected cells; antivirals block a fraction of it
        prod: K.Y * K.del * this.N0 * y.I / (1 + 4 * y.F) * (1 - av),
        nk, ctl, release, make, av,
      };
    },
    f(y, P, d) {
      const K = this.K, N0 = this.N0, x = this.flux(y, P), pv = x.pathogen, inf = pv.cell;
      d.t = 1;
      d.U = -inf / N0 - K.phi * y.F * y.U + K.rho * y.R + K.rep * y.D;
      d.R = K.phi * y.F * y.U - K.rho * y.R;
      d.E = inf / N0 - K.kE * y.E - 0.3 * x.ctl * y.E;
      d.I = K.kE * y.E - (K.del + x.nk + x.ctl) * y.I;
      d.D = (K.del + x.nk + x.ctl) * y.I + 0.3 * x.ctl * y.E - K.rep * y.D;
      d.V = x.prod - pv.mucus - pv.mac - pv.ab - inf;
      d.F = K.pF * (0.3 + 0.7 * P.inn) * (y.I + 0.2 * y.E) - K.dF * y.F;
      d.NK = 1.0 * (P.inn * (1 + 6 * HILL(y.F, 0.05)) - y.NK);
      d.M  = 0.8 * (P.inn * (1 + 2 * HILL(y.F, 0.05)) - y.M);
      adaptive(y, P, d, K.agK * (y.I + y.E), K);
    },
    obs(y, P) {
      const cy = y.F + 0.15 * HILL(y.T, 3e6) * (y.I + y.E > 1e-5 ? 1 : 0);
      const hurt = y.D + y.I, sym = [];
      const raw0 = 36.7 + P.fev * this.K.fevK * HILL(cy, 0.35);
      const raw = vacEffects(y, P, raw0, sym), temp = lowerFever(raw, P, y.t);
      if (raw - temp > 0.3) sym.push(L('解熱剤で熱を下げている', 'Fever lowered by medicine'));
      if (temp >= 37.5) sym.push(temp >= 38.5 ? L('高い熱', 'High fever') : L('熱', 'Fever'));
      this.symptoms(y, P, cy, hurt, sym);
      return {
        temp, rawTemp: raw, damage: hurt, pathogen: Math.max(0, y.V), infected: y.E + y.I, protectedCells: y.R,
        innate: (y.NK + y.M) / 2, killerT: y.T, antibody: y.Ab, cytokine: cy, sym,
        lung: this.lungRisk ? HILL(Math.max(0, hurt - 0.22), 0.1) : 0, gut: this.scene === 'gut' ? HILL(hurt, 0.1) : 0,
        lymph: HILL(y.T + y.B, 2e5), blood: 0,
      };
    },
    ended(y) { return y.V < 1 && (y.I + y.E) * this.N0 < 1; },
  }, def, { K: { ...VIRUS_K, ...(def.K || {}) } });
}

PATHOGENS.flu = makeVirus({
  key:'flu', name:'インフルエンザウイルス', short:'インフル', icon:'🦠', scene:'airway', look:'flu', bodySite:'nose', lungRisk:true,
  site:'鼻とのどの粘膜', route:'せきやくしゃみのしぶきを吸いこんで、鼻やのどの粘膜に着く。',
  doseRange:[1, 8], doseDefault:5,
  memOptions:{ none:'なし', vac:'ワクチンを打った', prior:'前に同じ型にかかった' },
  mem:{ vac:{ T:2e3, B:2e4, Ab:0.25 }, prior:{ T:2e4, B:2e4, Ab:1.2 } },
  drugs:['ose', 'balo', 'apy'],
  symptoms(y, P, cy, hurt, sym) {
    if (cy > 0.12) sym.push(L('だるさ・頭や関節の痛み', 'Tiredness, headache, joint pain'));
    if (hurt > 0.03) sym.push(L('のどの痛み', 'Sore throat'));
    if (cy > 0.04 && hurt > 0.01) sym.push(L('鼻水', 'Runny nose'));
    if (y.D > 0.1) sym.push(L('せき', 'Cough'));
    if (hurt > 0.3) sym.push(L('肺へ広がるおそれ', 'May spread to the lungs'));
  },
});

// SARS-CoV-2: enters through ACE2; slower cycle (latent ~half a day, infected cells live ~1.5 days) and it holds back
// the interferon alarm, so it grows for longer before symptoms. Values tuned to: symptoms ~3–5 days after exposure,
// most virus around the start of symptoms, cleared in ~10 days (推定).
PATHOGENS.covid = makeVirus({
  key:'covid', name:'新型コロナウイルス', short:'コロナ', icon:'👑', scene:'airway', look:'corona', bodySite:'nose', lungRisk:true,
  site:'鼻とのどの粘膜（ときに肺）', route:'せき・くしゃみ・会話のしぶきや、空気中にただよう小さな粒（エアロゾル）を吸いこむ。',
  doseRange:[1, 8], doseDefault:4,
  memOptions:{ none:'なし', vac:'ワクチンを打った', prior:'前にかかった' },
  mem:{ vac:{ T:3e3, B:2e4, Ab:0.12 }, prior:{ T:1e4, B:2e4, Ab:0.25 } },
  K:{ kE:2, del:0.7, Y:1500, Cm:60, Vs:300, pF:14, fevK:2.4 },
  drugs:['nirm', 'apy'],
  symptoms(y, P, cy, hurt, sym) {
    if (cy > 0.1) sym.push(L('だるさ', 'Tiredness'));
    if (hurt > 0.03) sym.push(L('のどの痛み', 'Sore throat'));
    if (cy > 0.04 && hurt > 0.01) sym.push(L('鼻水・鼻づまり', 'Runny or stuffy nose'));
    if (y.D > 0.08) sym.push(L('せき', 'Cough'));
    if (y.D > 0.06) sym.push(L('においや味が分かりにくい', 'Hard to smell or taste'));
    if (hurt > 0.3) sym.push(L('肺炎のおそれ', 'Risk of pneumonia'));
  },
});

// Norovirus: infects cells of the small intestine; tiny doses infect (ID50 ~18 particles, Teunis 2008), the cycle is
// fast (symptoms 12–48 h after, lasting 1–3 days) and the virus keeps coming out in stool for weeks (推定の目安).
PATHOGENS.noro = makeVirus({
  key:'noro', name:'ノロウイルス', short:'ノロ', icon:'🦪', scene:'gut', look:'noro', bodySite:'gut',
  site:'小腸の粘膜', route:'ウイルスのついた手や食べ物（よく加熱していない二枚貝など）、吐いたものや便のしぶきから口に入る。',
  doseRange:[0, 6], doseDefault:2,
  memOptions:{ none:'なし', prior:'前にかかった（数か月〜数年で弱まる）' },
  mem:{ prior:{ T:5e3, B:2e4, Ab:0.6 } },
  K:{ b:0.05, kE:6, del:2.5, Y:4000, c0:1.2, Cm:4, Vs:50, pF:100, rep:1.2, fevK:1.2 },   // gut lining renews in a few days
  drugs:['ors'],
  symptoms(y, P, cy, hurt, sym) {
    if (cy > 0.06 && y.I > 0.003) sym.push(L('吐き気・嘔吐', 'Nausea, vomiting'));
    if (hurt > 0.04) sym.push(L('下痢', 'Diarrhea'));
    if (hurt > 0.03) sym.push(L('おなかの痛み', 'Stomach ache'));
    if (hurt > 0.2) sym.push(drugLevel(P, 'ors', y.t) > 0.3 ? L('水分と塩分をとっている', 'Drinking water and salts') : L('脱水のおそれ', 'Risk of dehydration'));
  },
});

// ===== bacteria that grow outside cells =====
// Logistic growth; complement + resident macrophages (saturable, so small inocula are cleared); neutrophils recruited by
// chemokines, die into pus; antibody opsonizes. capsule: fraction of phagocyte killing lost without antibody.
const BACT_K = { r:5.5, Kc:2e9, Cc:3, Cm:6, Bs:3e4, Nrec:4e7, a:2e-6, h:0.05, dN:1, rep:0.12, capsule:0,
  toxD:0.6, leak:4e-8, rT:2.4, rB:2.0, pA:1.2e-6, dA:0.03, Tmax:2e7, fevK:2.8, cyB:0.6 };
function makeBact(def) {
  return Object.assign({
    kind:'bacteria',
    vars:['t','Bac','S','N','Pus','D','Bb','A1','Ag','T','B','Ab'],
    init(P) { return { t:0, Bac:P.dose, S:0, N:0, Pus:0, D:0, Bb:0, A1:0, Ag:0, ...memInit(P, this.mem) }; },
    // bacteria removal per day: comp (complement), mac (resident macrophages), neut (neutrophils), abx (antibiotics)
    flux(y, P) {
      const K = this.K, B = Math.max(0, y.Bac);
      const ops = 1 + 1.5 * y.Ab;                                        // opsonizing antibody helps phagocytes
      const cap = 1 - K.capsule + K.capsule * HILL(y.Ab, 0.3);           // a capsule hides bacteria until antibody coats it
      const wall = 1 / (1 + 6 * HILL(y.Pus, 3e7));                       // inside pus, bacteria are harder to reach
      const sat = B / (1 + B / K.Bs), grow = 1 - B / K.Kc;
      // antibiotics kill bacteria that are growing, and reach poorly into pus
      let abxK = 0;
      for (const k of this.drugs) { const D = DRUGS[k]; if (D && D.kill) abxK += D.kill[P.resist ? 'r' : 's'] * drugLevel(P, k, y.t); }
      abxK *= (0.3 + 0.7 * grow) / (1 + 2 * HILL(y.Pus, 3e7));
      return {
        pathogen: { comp: K.Cc * (0.5 + 0.5 * P.inn) * ops * cap * sat, mac: K.Cm * P.inn * ops * cap * sat,
                    neut: K.a * ops * cap * wall * y.N * B / (1 + K.a * K.h * B), abx: abxK * B },
        growth: K.r * B * grow, ops, wall, abxK,
      };
    },
    f(y, P, d) {
      const K = this.K, B = Math.max(0, y.Bac), x = this.flux(y, P), pv = x.pathogen;
      d.t = 1;
      d.Bac = x.growth - pv.comp - pv.mac - pv.neut - pv.abx;
      d.S = 3 * HILL(B, 3e6) + 0.6 * y.D * HILL(B, 100) - 2 * y.S;   // damaged tissue keeps calling only while bacteria remain
      const help = 1 + 1.5 * HILL(y.T, 1e6);                          // helper T cells (Th17) call more neutrophils
      d.N = P.inn * K.Nrec * help * HILL(y.S, 0.5) - K.dN * y.N;
      d.Pus = K.dN * y.N - 0.12 * y.Pus;
      d.D = (K.toxD * HILL(B, 5e8) + 0.15 * HILL(y.N, 1e8)) * (1 - y.D) - K.rep * y.D;
      d.Bb = K.leak * B * (0.2 + y.D) - ((3 + 40 * P.inn) * x.ops - 1.5) * y.Bb;   // spleen and liver macrophages clear the blood
      adaptive(y, P, d, 6 * HILL(B, 1e6), K);
    },
    obs(y, P) {
      const B = Math.max(0, y.Bac), K = this.K;
      const cy = K.cyB * y.S * HILL(B + y.Pus * 0.01, 1e7) + 3 * HILL(y.Bb, 30);
      const infl = HILL(y.S, 0.6), pus = HILL(y.Pus, 5e7), sym = [];
      const raw = vacEffects(y, P, 36.7 + P.fev * K.fevK * HILL(cy, 0.8), sym), temp = lowerFever(raw, P, y.t);
      if (raw - temp > 0.3) sym.push(L('解熱剤で熱を下げている', 'Fever lowered by medicine'));
      const o = { temp, rawTemp: raw, damage: y.D, pathogen: B, infected: 0, innate: y.N, neutrophil: y.N, pus, inflam: infl,
        killerT: y.T, antibody: y.Ab, cytokine: cy, sym, lung: 0, lymph: HILL(y.T + y.B, 2e5), blood: HILL(y.Bb, 20) };
      this.symptoms(y, P, o, sym);
      if (temp >= 37.5) sym.push(temp >= 38.5 ? L('高い熱', 'High fever') : L('熱', 'Fever'));
      if (y.Bb > 4) sym.push(L('血液に菌が入った（菌血症）', 'Bacteria in the blood (bacteremia)'));
      if (y.Bb > 300) sym.push(L('敗血症のおそれ', 'Risk of sepsis'));
      return o;
    },
    ended(y) { return y.Bac < 1 && y.Bb < 0.01; },
  }, def, { K: { ...BACT_K, ...(def.K || {}) } });
}

PATHOGENS.staph = makeBact({
  key:'staph', name:'黄色ブドウ球菌', short:'ブドウ球菌', icon:'🟡', scene:'skin', look:'staph', bodySite:'arm',
  site:'皮膚の傷口', route:'皮膚や鼻にふだんからいる菌が、すり傷や切り傷から中に入る。',
  doseRange:[1, 8], doseDefault:6,
  memOptions:{ none:'なし', prior:'前にかかった（少しだけ抗体）' },
  mem:{ prior:{ T:3e3, B:3e3, Ab:0.3 } },
  resistName:'MRSA（薬が効きにくい菌）',
  drugs:['ceph', 'vanc', 'drain', 'apy'],
  symptoms(y, P, o, sym) {
    if (o.inflam > 0.25) sym.push(L('赤み・はれ・熱っぽさ（傷のまわり）', 'Redness, swelling, warmth (around the wound)'));
    if (o.inflam > 0.4 || y.D > 0.1) sym.push(L('ずきずきする痛み', 'Throbbing pain'));
    if (o.pus > 0.3) sym.push(L('うみがたまる', 'Pus collects'));
  },
});

// Streptococcus pneumoniae in the alveoli (pneumococcal pneumonia). The capsule hides it from phagocytes until
// antibody arrives — the old "crisis" around day 7 of untreated lobar pneumonia. Fluid and cells filling the alveoli
// (damage) lower the oxygen in the blood (SpO2, 推定の目安).
PATHOGENS.pneumo = makeBact({
  key:'pneumo', name:'肺炎球菌', short:'肺炎球菌', icon:'🫁', scene:'alveolus', look:'pneumo', bodySite:'lung',
  site:'肺の奥（肺胞）', route:'鼻やのどにすみついている菌が、かぜなどで弱ったときに肺の奥へ吸いこまれる。',
  doseRange:[3, 9], doseDefault:6,
  memOptions:{ none:'なし', vac:'肺炎球菌ワクチンを打った', prior:'前にかかった（同じ型）' },
  mem:{ vac:{ T:2e3, B:2e4, Ab:0.8 }, prior:{ T:2e3, B:2e4, Ab:0.4 } },
  K:{ r:4, Kc:5e9, Cm:20, capsule:0.75, toxD:0.5, leak:8e-8, fevK:3.0, cyB:0.9 },
  drugs:['amox', 'apy'],
  symptoms(y, P, o, sym) {
    o.spo2 = Math.round(98 - 10 * y.D);
    if (o.inflam > 0.3) sym.push(L('せき・たん', 'Cough, phlegm'));
    if (o.inflam > 0.5) sym.push(L('息を吸うと胸が痛い', 'Chest hurts when breathing in'));
    if (y.D > 0.2) sym.push(L('息が苦しい', 'Hard to breathe'));
    if (o.spo2 < 93) sym.push(L('血液の酸素が足りない', 'Low oxygen in the blood'));
  },
});

// Uropathogenic E. coli in the bladder (cystitis). Two places: floating in urine (Bu, washed out at each urination)
// and stuck to / inside the surface "umbrella" cells (Ba, not washed out; inside cells they form communities that
// antibiotics reach poorly). Infected umbrella cells are shed. Kd: bacteria climbing to the kidney (fever, back pain).
PATHOGENS.ecoli = {
  key:'ecoli', name:'大腸菌（膀胱炎）', short:'大腸菌', icon:'🚽', kind:'bacteria', scene:'bladder', look:'ecoli', bodySite:'bladder',
  site:'膀胱の内側', route:'おしりのまわりにいる腸の菌が、尿の出口から尿道を上って膀胱に入る（尿道が短い女性に多い）。',
  doseRange:[2, 8], doseDefault:5.5,
  memOptions:{ none:'なし', prior:'前にかかった（何度もかかりやすい）' },
  mem:{ prior:{ T:2e3, B:3e3, Ab:0.2 } },
  drugs:['water', 'ceph', 'apy'],
  vars:['t','Bu','Ba','S','N','D','Kd','A1','Ag','T','B','Ab'],
  K:{ ru:9, Ku:1e9, voids:6, out:2.3, att:3, Ka:5e8, ra:3.5, rel:1.5, ex:2.5, nBa:0.1, a:1e-6, h:0.05, Nrec:3e7, rT:2.0, rB:1.8, pA:1e-6, dA:0.03, Tmax:1e7 },
  init(P) { return { t:0, Bu:P.dose, Ba:0, S:0, N:0, D:0, Kd:0, A1:0, Ag:0, ...memInit(P, this.mem) }; },
  // removal per day: wash (urination), neut (neutrophils in the urine), exfol (shed umbrella cells), abx
  flux(y, P) {
    const K = this.K, Bu = Math.max(0, y.Bu), Ba = Math.max(0, y.Ba), ops = 1 + 0.6 * y.Ab;
    const voids = K.voids * (1 + 0.7 * drugLevel(P, 'water', y.t));
    const ab = DRUGS.ceph.kill[P.resist ? 'r' : 's'] * drugLevel(P, 'ceph', y.t);
    return {
      // neutrophils catch bacteria in the urine and, less easily, on / in the surface cells
      pathogen: { wash: voids * K.out * Bu, neut: K.a * ops * y.N * (Bu + K.nBa * Ba) / (1 + K.a * K.h * (Bu + Ba)), exfol: K.ex * HILL(y.S, 0.6) * Ba,
                  abx: ab * (0.8 * Bu + 0.25 * Ba) },
      growth: K.ru * Bu * (1 - Bu / K.Ku) + K.ra * Ba * (1 - Ba / K.Ka),
      attach: K.att * Bu * Math.max(0, 1 - Ba / K.Ka) / (1 + 2 * y.Ab),   // antibody blocks the sticky tips (pili)
      release: K.rel * Ba, voids, ab,
    };
  },
  f(y, P, d) {
    const K = this.K, Bu = Math.max(0, y.Bu), Ba = Math.max(0, y.Ba), x = this.flux(y, P), pv = x.pathogen;
    d.t = 1;
    d.Bu = K.ru * Bu * (1 - Bu / K.Ku) - pv.wash - pv.neut * Bu / (Bu + K.nBa * Ba + 1e-9) - x.attach + x.release - x.ab * 0.8 * Bu;
    d.Ba = K.ra * Ba * (1 - Ba / K.Ka) + x.attach - x.release - pv.exfol - pv.neut * K.nBa * Ba / (Bu + K.nBa * Ba + 1e-9) - x.ab * 0.25 * Ba;
    d.S = 3 * HILL(Ba + 0.1 * Bu, 1e6) - 2 * y.S;
    d.N = P.inn * K.Nrec * HILL(y.S, 0.5) - (1 + 0.3 * x.voids) * y.N;           // neutrophils go into the urine and leave with it
    d.D = (0.5 * HILL(Ba, 1e8) + 0.1 * HILL(y.N, 1e8)) * (1 - y.D) - 0.35 * y.D;
    d.Kd = 0.6 * HILL(Bu, 3e8) - 0.25 * y.Kd;
    adaptive(y, P, d, 4 * HILL(Ba, 1e6), K);
  },
  obs(y, P) {
    const B = Math.max(0, y.Bu) + Math.max(0, y.Ba), cy = 2 * HILL(Math.max(0, y.Kd - 0.4), 0.3);
    const raw = 36.7 + P.fev * 2.8 * HILL(cy, 0.6), temp = lowerFever(raw, P, y.t);
    const infl = HILL(y.S, 0.6), pyuria = HILL(y.N, 1e7), sym = [];
    if (raw - temp > 0.3) sym.push(L('解熱剤で熱を下げている', 'Fever lowered by medicine'));
    if (infl > 0.25) sym.push(L('おしっこのときに痛い', 'Pain when peeing'));
    if (infl > 0.35) sym.push(L('トイレが近い・残った感じがする', 'Peeing often, feeling not empty'));
    if (pyuria > 0.4) sym.push(L('尿がにごる（白血球）', 'Cloudy urine (white blood cells)'));
    if (y.D > 0.25) sym.push(L('尿に血がまじる', 'Blood in the urine'));
    if (y.Kd > 0.6) sym.push(L('腎臓に広がるおそれ（熱・背中の痛み）', 'May spread to the kidneys (fever, back pain)'));
    if (temp >= 37.5) sym.push(temp >= 38.5 ? L('高い熱', 'High fever') : L('熱', 'Fever'));
    return { temp, rawTemp: raw, damage: y.D, pathogen: B, free: Math.max(0, y.Bu), att: Math.max(0, y.Ba), infected: 0,
      innate: y.N, neutrophil: y.N, pus: pyuria, inflam: infl, killerT: y.T, antibody: y.Ab, cytokine: cy, sym,
      lung: 0, kidney: HILL(y.Kd, 0.6), lymph: HILL(y.T + y.B, 2e5), blood: 0 };
  },
  // "over" when the urine is nearly clear and the alarm has stopped (a few may stay hidden in the bladder wall)
  ended(y) { return y.Bu + y.Ba < 1 || (y.t > 1 && y.Bu < 1e3 && y.S < 0.03); },
};

const PATHOGEN_ORDER = ['flu', 'covid', 'noro', 'staph', 'pneumo', 'ecoli'];

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
  // less than one particle / cell left = none (otherwise 10⁻⁵⁰ of a cell can grow back in the equations)
  if (path.kind === 'virus') { if (y.V < 1e-3 && (y.I + y.E) * path.N0 < 1e-3) { y.V = 0; y.I = 0; y.E = 0; } }
  else if (y.Bu != null) { if (y.Bu + y.Ba < 1e-3) { y.Bu = 0; y.Ba = 0; } }
  else { if (y.Bac < 1e-3) y.Bac = 0; if (y.Bb < 1e-6) y.Bb = 0; }
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
