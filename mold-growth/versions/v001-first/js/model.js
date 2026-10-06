// Model, hourly for 12 weeks.
// 1) surface climate of the chosen place (temperature, surface RH, liquid water)
// 2) living mould index M (0-6): VTT mould growth model (Hukka & Viitanen 1999) with the material sensitivity classes
//    of Ojanen et al. 2010. The class is set by the material plus the dirt on it (dirt -> more sensitive: our estimate).
// 3) dirt, fungicide residue, treatments, visible stain, airborne spores, species mix (all estimates).

const H_DAY = 24, H_WEEK = 168, WEEKS = 12, T_END = WEEKS * H_WEEK;
const BATH_HOUR = 21;          // bath every evening 21:00-22:00
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esat = T => 610.94 * Math.exp(17.625 * T / (T + 243.04));   // saturation vapour pressure (Pa), Magnus

const SEASONS = {
  rainy:  { name: '梅雨〜夏', Tout: 25, amp: 3, RHout: 80, dE: 0.45, roomRH: 78, bathT: 25, bathUp: 5, spores: 1500 },
  mild:   { name: '春・秋', Tout: 15, amp: 5, RHout: 65, dE: 0.7, roomRH: 60, bathT: 19, bathUp: 8, spores: 600 },
  winter: { name: '冬', Tout: 4, amp: 4, RHout: 60, dE: 1, roomRH: 48, bathT: 12, bathUp: 12, spores: 150 },
};

// food: how much the material itself feeds mould (0 = none, 1 = like raw pine). deep: how far hyphae get into it.
// area: mould-prone area (cm2) for the spore source, vol: air volume it sheds into (m3).
const PLACES = {
  bath:   { name: '浴室のゴムパッキン', short: '浴室', mat: 'シリコンのゴムパッキン（目地）', food: 0.45, dirtRate: 0.025, deep: 0.65, area: 3000, vol: 5,
            sub: '浴そうのふちのシリコン。石けんかす・皮脂・あかがたまり、毎日ぬれる',
            opts: ['season', 'vent', 'after', 'clean'], def: { season: 'rainy', vent: 'h2', after: 'none', clean: 'month' } },
  window: { name: '窓のゴムパッキン', short: '窓', mat: 'ゴムのパッキン', food: 0.45, dirtRate: 0.012, deep: 0.55, area: 800, vol: 30,
            sub: '冬の朝、ガラスの結露が流れて下のゴムにたまる。ほこりもつく',
            opts: ['season', 'glass', 'moist', 'wipe', 'clean'], def: { season: 'winter', glass: 'single', moist: 'normal', wipe: 'none', clean: 'none' } },
  wall:   { name: '北側の部屋の壁', short: '壁', mat: 'ビニールの壁紙（裏に紙とのり）', food: 0.7, dirtRate: 0.002, deep: 0.45, area: 10000, vol: 30,
            sub: '外に面した冷たい壁。家具の裏は空気が動かず、さらに冷える',
            opts: ['season', 'insul', 'furn', 'moist'], def: { season: 'winter', insul: 'normal', furn: 'tight', moist: 'high' } },
  closet: { name: '押し入れ', short: '押し入れ', mat: '合板（木）', food: 0.75, dirtRate: 0.002, deep: 0.5, area: 10000, vol: 30,
            sub: '北の壁ぞいの押し入れ。朝しまったふとんの湿気がこもる',
            opts: ['season', 'futon', 'cAir', 'moist'], def: { season: 'rainy', futon: 'soon', cAir: 'closed', moist: 'normal' } },
};

const CHOICES = {
  season: { label: '季節', opts: [
    { v: 'rainy', name: '梅雨〜夏', sub: '外の湿度が高い（80〜90%）。暖かい' },
    { v: 'mild', name: '春・秋', sub: 'すごしやすい' },
    { v: 'winter', name: '冬', sub: '外は寒く乾いている。暖房した部屋の中の水蒸気が、冷たい所で結露する' }] },
  vent: { label: '換気扇', opts: [
    { v: 'none', name: '回さない', sub: '湯気がこもり、ひと晩じゅう湿度が高い' },
    { v: 'h2', name: '入浴後2時間', sub: '止めたあと、残った水が蒸発して湿度が上がる' },
    { v: 'h24', name: '24時間', sub: '弱くても回し続ける。ドアは閉めて、ドアの下から空気を入れる' }] },
  after: { label: '入浴後', opts: [
    { v: 'none', name: 'そのまま', sub: '水滴が残り、ゴムパッキンは朝までぬれている' },
    { v: 'squeegee', name: '水を切る', sub: 'スクイージー（水切りワイパー）で壁と床の水を落とす' },
    { v: 'wipe', name: '冷水＋ふき取る', sub: '冷たいシャワーで壁を冷まし、タオルでパッキンの水をふく' }] },
  clean: { label: '掃除（汚れを落とす）', opts: [
    { v: 'week', name: '週1回', sub: 'スポンジと中性洗剤で、汚れ（えさ）を落とす' },
    { v: 'month', name: '月1回', sub: '' },
    { v: 'none', name: 'しない', sub: '' }] },
  glass: { label: '窓', opts: [
    { v: 'single', name: '1枚ガラス', sub: 'アルミの枠。ガラスが外の寒さでよく冷える' },
    { v: 'double', name: '複層ガラス', sub: '2枚のガラスの間に空気の層' },
    { v: 'resin', name: '複層＋樹脂の枠', sub: '断熱の高い窓。ガラスも枠も冷えにくい' }] },
  wipe: { label: '朝の結露', opts: [
    { v: 'none', name: 'そのまま', sub: '流れた水がパッキンにたまり、昼まで乾かない' },
    { v: 'wipe', name: '朝ふき取る', sub: 'ガラスとパッキンの水を毎朝ふく' }] },
  insul: { label: '壁の断熱', opts: [
    { v: 'good', name: 'よい', sub: '新しい家。壁の表面が冷えにくい' },
    { v: 'normal', name: 'ふつう', sub: '' },
    { v: 'poor', name: 'わるい', sub: '古い家。断熱材がうすい・ない' }] },
  furn: { label: '家具', opts: [
    { v: 'tight', name: '壁にぴったり', sub: 'たんす・本棚の裏は空気が動かず、壁がさらに冷える' },
    { v: 'gap', name: '5cm はなす', sub: '裏に空気が通る' },
    { v: 'none', name: '家具なし', sub: '' }] },
  moist: { label: '部屋の湿気', opts: [
    { v: 'low', name: '少ない', sub: '換気をする・除湿する' },
    { v: 'normal', name: 'ふつう', sub: '人の息・料理・お風呂の湿気' },
    { v: 'high', name: '多い', sub: '加湿器・部屋干し・石油ストーブ（燃やすと水蒸気が出る）' }] },
  futon: { label: 'ふとん', opts: [
    { v: 'soon', name: '起きてすぐしまう', sub: '寝ている間の汗（コップ1杯ほど）を含んだまま' },
    { v: 'air', name: '湿気をとばしてからしまう', sub: 'しばらく広げておく・ときどき干す' }] },
  cAir: { label: '押し入れの中', opts: [
    { v: 'closed', name: '閉めきり・壁にぴったり', sub: 'ふとんが奥の冷たい壁に触れる' },
    { v: 'sunoko', name: 'すのこで すき間', sub: '壁と床からはなして空気の通り道を作る' },
    { v: 'open', name: 'すのこ＋ときどき開ける', sub: '晴れた日はふすまを開けて風を通す' }] },
};
function optOf(key, v) { return CHOICES[key].opts.find(o => o.v === v) || CHOICES[key].opts[0]; }
function condFor(place, keep) {
  const c = { place, ...PLACES[place].def, events: [] };
  if (keep) for (const k of PLACES[place].opts) if (keep[k] !== undefined && k !== 'season') c[k] = keep[k];
  return c;
}
const DEFAULT_COND = condFor('bath');

// ---- treatments (used at one moment). Effects are estimates; mechanisms are in text.js (TREATS) ----
const TREAT_KINDS = {
  chlorine: { name: '塩素系カビ取り剤', short: '塩素', col: '#7ec8ff' },
  alcohol:  { name: 'アルコール（エタノール）', short: 'アルコール', col: '#d6a6ff' },
  scrub:    { name: '中性洗剤でこすり洗い', short: 'こする', col: '#f2e6a0' },
  silver:   { name: '防カビくん煙剤（銀イオン）', short: '銀イオン', col: '#d7dde0' },
  spray:    { name: '防カビ剤スプレー', short: '防カビ剤', col: '#ffb86b' },
};

// ---- VTT mould model ----
// sensitivity classes: very sensitive, sensitive, medium resistant, resistant (Ojanen et al. 2010)
const VTT_CLS = [
  { k1a: 1, k1b: 2, A: 1, B: 7, C: 2, RHmin: 80 },
  { k1a: 0.578, k1b: 0.386, A: 0.3, B: 6, C: 1, RHmin: 80 },
  { k1a: 0.072, k1b: 0.097, A: 0, B: 5, C: 1.5, RHmin: 85 },
  { k1a: 0.033, k1b: 0.014, A: 0, B: 3, C: 1, RHmin: 85 },
];
const CLS_NAME = ['とても弱い', '弱い', 'やや強い', '強い'];
function vttParams(F) {           // F: food 0..1 -> class index 3..0 (interpolated)
  const c = clamp(3 * (1 - F), 0, 3), i = Math.min(2, Math.floor(c)), f = c - i, a = VTT_CLS[i], b = VTT_CLS[i + 1];
  const lin = k => a[k] + (b[k] - a[k]) * f, lg = k => Math.exp(Math.log(a[k]) + (Math.log(b[k]) - Math.log(a[k])) * f);
  return { cls: c, k1a: lg('k1a'), k1b: lg('k1b'), A: lin('A'), B: lin('B'), C: lin('C'), RHmin: lin('RHmin') };
}
function rhCrit(T, RHmin) {
  const poly = T <= 20 ? -0.00267 * T * T * T + 0.160 * T * T - 3.13 * T + 100 : 0;
  return Math.max(poly, RHmin);
}
// VTT growth rate (index per day) before k1, k2
function vttRate(T, RH) { return 1 / (7 * Math.exp(-0.68 * Math.log(T) - 13.9 * Math.log(RH) + 66.02)); }
const CMEM = 0.5;                 // decline coefficient when dry (VTT: 1 for wood, smaller for most materials; estimate)

// visible index -> fraction of the area covered (VTT: 3 = first visible, 4 = >10%, 5 = >50%, 6 = 100%)
function coverage(V) {
  if (V < 3) return 0;
  if (V < 4) return 0.01 * Math.pow(10, V - 3);
  if (V < 5) return 0.1 + 0.4 * (V - 4);
  return Math.min(1, 0.5 + 0.5 * (V - 5));
}

// ---- species (estimates from the lowest water activity / temperatures they grow at) ----
const SPECIES = [
  { id: 'clado', name: 'クロカビ', sci: 'クラドスポリウム', col: '#2c3326', spore: '#3d4a33', prior: 0.45, rmax: 1, wetF: 1.8, RHmin: 85, RHopt: 98, drop: 0, Tmin: -3, Topt: 22, Tmax: 32,
    note: '外の空気にいちばん多い。ぬれる所が好き（浴室・窓）。黒〜こい緑' },
  { id: 'peni', name: 'アオカビ', sci: 'ペニシリウム', col: '#3f7f6c', spore: '#5fa58a', prior: 0.25, rmax: 0.9, wetF: 0.8, RHmin: 81, RHopt: 96, drop: 0, Tmin: 0, Topt: 24, Tmax: 35,
    note: '壁・押し入れ・食べもの。青緑。寒い所でも育つ' },
  { id: 'asp', name: 'コウジカビのなかま', sci: 'アスペルギルス', col: '#8f9a3c', spore: '#c2c25a', prior: 0.15, rmax: 0.8, wetF: 0.8, RHmin: 78, RHopt: 95, drop: 0, Tmin: 8, Topt: 29, Tmax: 42,
    note: 'ほこり・壁。暖かい所が好き。種類で黄緑・黒など' },
  { id: 'xero', name: 'カワキコウジカビ', sci: 'アスペルギルス・レストリクタス', col: '#6c8478', spore: '#9fb8aa', prior: 0.15, rmax: 0.3, wetF: 0.4, RHmin: 70, RHopt: 88, drop: 0.6, Tmin: 10, Topt: 26, Tmax: 38,
    note: '乾き気味の所に強い（押し入れ・畳・本）。ゆっくり育つ。灰緑' },
];
function cardinalT(T, a, o, b) {   // cardinal temperature model (Rosso et al. 1993)
  if (T <= a || T >= b) return 0;
  return (T - b) * (T - a) * (T - a) / ((o - a) * ((o - a) * (T - o) - (o - b) * (o + a - 2 * T)));
}
function speciesRate(s, T, RH, wet) {
  if (RH < s.RHmin) return 0;
  const r = RH <= s.RHopt ? (RH - s.RHmin) / (s.RHopt - s.RHmin) : 1 - s.drop * (RH - s.RHopt) / (100 - s.RHopt);
  return s.rmax * (wet ? s.wetF : 1) * Math.max(0, r) * cardinalT(T, s.Tmin, s.Topt, s.Tmax);
}

// ---- 1) surface climate ----
function climate(c) {
  const P = PLACES[c.place], S = SEASONS[c.season], n = T_END + 1;
  const T = new Float32Array(n), RH = new Float32Array(n), wet = new Uint8Array(n), Tin = new Float32Array(n), RHin = new Float32Array(n);
  if (c.place === 'bath') {
    const add = { none: 19, h2: 10, h24: -1 }[c.vent], tau = { none: 6, h2: 1.2, h24: 1.5 }[c.vent];
    const dry = { none: 0, squeegee: -3, wipe: -6 }[c.after];
    const base = clamp(S.roomRH + add + dry, 40, 97);
    const wetH = c.after === 'wipe' ? 0.3 : ({ none: 10, h2: 5, h24: 3.5 }[c.vent]) * (c.after === 'squeegee' ? 0.45 : 1);
    for (let t = 0; t < n; t++) {
      const hd = t % 24, since = (hd - BATH_HOUR + 24) % 24;   // hours since the bath started
      const warm = since < 8 ? S.bathUp * Math.exp(-since / 1.5) * (c.after === 'wipe' && since >= 1 ? 0.6 : 1) : 0;
      T[t] = S.bathT + warm;
      Tin[t] = T[t];
      if (since < 1) { RH[t] = 100; wet[t] = 1; }
      else {
        const h = since - 1;
        let rh = base + (100 - base) * Math.exp(-h / tau);
        if (c.vent === 'h2' && h >= 2) rh = Math.max(rh, base);      // fan stopped
        RH[t] = clamp(rh, 0, 100);
        wet[t] = h < wetH ? 1 : 0;
      }
      RHin[t] = RH[t];
    }
    return { T, RH, wet, Tin, RHin };
  }
  // window / wall / closet: vapour in the room, surface temperature from the outside temperature
  const moistE = { low: 200, normal: 550, high: 850 }[c.moist] * S.dE;
  let f;   // how much the surface cools toward the outside (0 = room temperature, 1 = outside temperature)
  if (c.place === 'window') f = { single: 0.62, double: 0.36, resin: 0.22 }[c.glass];
  else if (c.place === 'wall') f = { good: 0.06, normal: 0.12, poor: 0.22 }[c.insul] + { tight: 0.2, gap: 0.03, none: 0 }[c.furn];
  else f = 0.13 + { closed: 0.12, sunoko: 0.04, open: 0.03 }[c.cAir];
  let water = 0, eCl = 0;
  for (let t = 0; t < n; t++) {
    const hd = t % 24;
    const To = S.Tout + S.amp * Math.cos(2 * Math.PI * (hd - 14) / 24);
    let Ti;
    if (c.season === 'winter') {   // heated 7-23 h, heating off at night
      if (hd >= 7 && hd < 23) Ti = 20 - 5 * Math.exp(-(hd - 7) / 1.2);
      else Ti = 13 + 7 * Math.exp(-((hd - 23 + 24) % 24) / 3.5);
    } else if (c.season === 'mild') Ti = 19 + 1.5 * Math.cos(2 * Math.PI * (hd - 16) / 24);
    else Ti = S.Tout + 1.5 + 1.2 * Math.cos(2 * Math.PI * (hd - 16) / 24);   // walls and furniture damp the daily swing
    const eOut = S.RHout / 100 * esat(S.Tout);   // vapour outside stays about the same through the day (RH rises at night)
    let e = eOut + moistE;
    if (c.place === 'closet') {
      // futon put away at 7:00 still holding the night's sweat; closed closets keep the vapour longer
      const tauC = { closed: 14, sunoko: 9, open: 4 }[c.cAir];
      if (t === 0) eCl = e;
      const src = (c.futon === 'soon' && hd >= 7 && hd < 11) ? 120 : (c.futon === 'air' && hd >= 9 && hd < 11 ? 25 : 0);
      eCl += (e - eCl) / tauC + src;
      e = eCl;
    }
    const Ts = Ti - f * (Ti - To);
    const es = esat(Ts);
    Tin[t] = Ti; RHin[t] = clamp(100 * e / esat(Ti), 0, 100);
    T[t] = Ts;
    let rh = 100 * e / es;
    // condensation collects as liquid water; dries when the air can take it again
    if (rh > 100) water += (e - es) / 120 * (c.place === 'window' ? 1.4 : 0.5);
    else water -= (es - e) / 1000;
    if (c.place === 'window' && c.wipe === 'wipe' && hd === 8) water *= 0.1;
    water = clamp(water, 0, 1.5);
    RH[t] = clamp(rh, 0, 100);
    wet[t] = water > 0.05 ? 1 : 0;
  }
  return { T, RH, wet, Tin, RHin };
}

// ---- 2-6) simulate ----
function simulate(c) {
  const P = PLACES[c.place], S = SEASONS[c.season], cl = climate(c), n = T_END + 1;
  const M = new Float32Array(n), V = new Float32Array(n), N = new Float32Array(n), F = new Float32Array(n), Pr = new Float32Array(n);
  const RHc = new Float32Array(n), grow = new Float32Array(n), Cin = new Float32Array(n), landed = new Float32Array(n);
  const W = SPECIES.map(() => new Float32Array(n));
  const ev = [...(c.events || [])].sort((a, b) => a.t - b.t);
  const kills = [];          // {t, k, Mbefore, Mafter} for the pictures
  let m = 0, vd = 0, dirt = 0.15, prot = 0, protTau = 30, dry = 0, ei = 0, land = 0, mPeak = 0;  // mPeak: before the last kill
  const w = SPECIES.map(() => 0);
  const cleanEvery = { week: H_WEEK, month: 4 * H_WEEK, none: 0 }[c.clean] || 0;
  for (let t = 0; t < n; t++) {
    // treatments used at this hour
    while (ei < ev.length && ev[ei].t <= t) {
      const e = ev[ei++], deepF = P.deep * clamp((m - 1) / 3, 0, 1), before = m;
      if (e.k === 'chlorine') {
        m *= deepF * 0.55 + (1 - deepF) * 0.01;              // surface killed; part of the hyphae deep in the material survive
        const vis = Math.max(vd, before);
        vd = vis > 3 ? 2.6 + (vis - 3) * P.deep * 0.6 : vis * 0.25;   // pigment bleached; a large, deep colony leaves a stain
        dirt *= 0.5;
      } else if (e.k === 'alcohol') {
        m *= deepF * 0.75 + (1 - deepF) * 0.08;
        vd = Math.max(vd, before);                          // dead, but the black stays
        dirt *= 0.9;
      } else if (e.k === 'scrub') {
        const keep = deepF + (1 - deepF) * 0.45;
        m *= keep; vd *= deepF * 0.9 + (1 - deepF) * 0.5;
        dirt *= 0.2;
      } else if (e.k === 'silver') {
        m *= m < 1 ? 0.35 : 0.9;
        prot = Math.max(prot, 0.8); protTau = 50 * H_DAY;
      } else if (e.k === 'spray') {
        m *= m < 1 ? 0.5 : 0.95;
        prot = Math.max(prot, 0.7); protTau = (c.place === 'bath' ? 12 : 30) * H_DAY;
      }
      if (e.k === 'chlorine' || e.k === 'alcohol' || e.k === 'scrub') mPeak = Math.max(mPeak, before);
      if (e.k === 'chlorine' || e.k === 'alcohol' || e.k === 'scrub') kills.push({ t: e.t, k: e.k, Mbefore: before, Mafter: m });
    }
    // dirt (food) builds up; regular cleaning removes most of it
    dirt = Math.min(1, dirt + P.dirtRate / 24);
    if (cleanEvery && t > 0 && t % cleanEvery === (cleanEvery - 24 + 10) % cleanEvery) dirt *= 0.35;
    const food = clamp(P.food + 0.7 * dirt, 0, 1);
    const vp = vttParams(food);
    const Tt = cl.T[t], RHe = cl.wet[t] ? 100 : cl.RH[t];
    const rc = rhCrit(Tt, vp.RHmin);
    let dm = 0, g = 0;
    if (Tt > 0 && Tt < 50 && RHe >= rc) {
      const x = (rc - RHe) / (rc - 100), Mmax = vp.A + vp.B * x - vp.C * x * x;
      const k2 = Math.max(1 - Math.exp(2.3 * (m - Mmax)), 0);
      const regrow = m < mPeak ? 2.2 : 1;   // surviving mycelium grows back faster than new spores start (estimate)
      dm = vttRate(Tt, RHe) * (m < 1 ? vp.k1a : vp.k1b) * k2 / 24 * (1 - prot) * regrow;
      g = 1; dry = 0;
      SPECIES.forEach((s, i) => { w[i] += speciesRate(s, Tt, RHe, cl.wet[t]) * (1 - prot); });
    } else {
      dry++;
      if (m > 0) dm = -CMEM * (dry <= 6 ? 0.00133 : dry <= 24 ? 0 : 0.000667);
    }
    m = Math.max(0, m + dm);
    prot *= Math.exp(-1 / protTau);
    // spores in the air: outdoor air coming in + what the mould here sheds (estimates)
    const live = coverage(m) * P.area;
    const ach = c.place === 'bath' ? ({ none: 0.6, h2: (t % 24 >= 22 && t % 24 < 24) ? 4 : 0.6, h24: 2 }[c.vent]) : (c.place === 'closet' ? 0.6 : 0.5);
    const cin = 0.4 * S.spores + live * 20 / (P.vol * ach);
    land += cin * 3e-4 * 3600 / 1e4;     // per cm2: concentration x settling speed of a 3 um spore
    M[t] = m; V[t] = Math.max(m, vd); N[t] = dirt; F[t] = food; Pr[t] = prot; RHc[t] = rc; grow[t] = g; Cin[t] = cin; landed[t] = land;
    SPECIES.forEach((s, i) => { W[i][t] = w[i]; });
  }
  return { cond: c, ...cl, M, V, N, F, P: Pr, RHc, grow, Cin, landed, W, events: ev, kills };
}

// species share at hour t (prior abundance x how well each grew; squared = competition)
function speciesShare(R, t) {
  const raw = SPECIES.map((s, i) => s.prior * Math.pow(R.W[i][t] + 0.01, 2));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => v / sum);
}

function summarize(R) {
  let vis = -1, wetH = 0, growH = 0, rhSum = 0;
  for (let t = 0; t <= T_END; t++) {
    if (vis < 0 && R.V[t] >= 3) vis = t;
    wetH += R.wet[t]; growH += R.grow[t]; rhSum += R.wet[t] ? 100 : R.RH[t];
  }
  let air = 0; for (let t = T_END - H_WEEK; t <= T_END; t++) air += R.Cin[t]; air /= H_WEEK + 1;
  const sh = speciesShare(R, T_END), top = sh.indexOf(Math.max(...sh));
  return {
    visDay: vis < 0 ? null : vis / 24, M: R.M[T_END], V: R.V[T_END], cov: coverage(R.V[T_END]),
    growFrac: growH / (T_END + 1), wetFrac: wetH / (T_END + 1), rhMean: rhSum / (T_END + 1),
    top: R.M[T_END] > 0.3 ? top : -1, air,
  };
}
