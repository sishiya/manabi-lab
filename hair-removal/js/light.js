// 脱毛のしくみ — 光（家庭用の光脱毛器）の熱の物理。DOM なし（node でも動く）
// 1) 光が肌の中で弱まる（波長ごと） 2) 毛のメラニンが吸って熱になる 3) 熱がまわりへ広がる（円柱の熱伝導）
// 4) 細胞のいたみ = Arrhenius の積分 Ω（生き残る割合 = e^−Ω）
'use strict';

const LIGHT = {
  lamMin: 600, lamMax: 1100, lamStep: 25,   // 光の波長の幅（nm）。ケノンは公表なし → 家庭用の光脱毛器の一般的な幅で推定
  fPerLevel: 0.74,  // J/cm² / レベル。Lv10 = 35 J ÷ 4.5〜4.9 cm² ≈ 7.1〜7.7 J/cm²（ストロング2。販売店・比較サイト）の中ほど。ほかのレベルは比例と推定
  tau: 0.005,       // 光る長さ（秒）。公表なし → 推定 5 ms
  epiCm: 0.006,     // 表皮 60 µm（Jacques の皮ふの光学のまとめ）
  rhoC: 3.8,        // 体積あたりの熱容量 J/(cm³·K)（組織。推定）
  kappa: 0.0052,    // 熱伝導率 W/(cm·K)（組織。推定） → 熱拡散率 約 1.4×10⁻³ cm²/s
  Ahen: 3.1e98, Ehen: 6.28e5, Rgas: 8.314,   // Henriques 1947 の Arrhenius の定数（1/s, J/mol）
  T0: 35,           // 毛穴のあたりのはじめの温度 °C（推定）
  Tskin0: 22,       // 冷やしたあとの表皮の温度 °C（ケノンは照射の前後に冷やす。推定）
  TskinWarm: 32,    // 冷やさないときの表皮の温度 °C（推定）
};

// 肌の色: 表皮（60 µm）のメラノソームの体積割合。
// 測り方で大きくちがう（生体の測定 Tseng ほか 2011: 約 0.9〜1.7%。Jacques 1998 のまとめ: 明るい 1.3〜6.3%・中ほど 11〜16%・濃い 18〜43%）→ 幅の中から推定
const SKINS = {
  light: { name: '明るい肌', fmel: 0.02 },
  mid: { name: '中ほど', fmel: 0.05 },
  dark: { name: '濃い肌・日焼け', fmel: 0.13 },
};
// 毛の色: 毛のなかのメラニン（メラノソーム相当）の体積割合。測った値が見つからない → 推定
const HAIRS = {
  black: { name: '黒い毛', fh: 0.10 },
  brown: { name: '茶色の毛', fh: 0.05 },
  light: { name: 'うすい色の毛', fh: 0.015 },
};

// --- 光学（Jacques 2013・OMLC）。λ は nm、係数は 1/cm ---
const muaMel = lam => 6.6e11 * Math.pow(lam, -3.33);                    // メラノソームの中
const muaBase = lam => 0.244 + 85.3 * Math.exp(-(lam - 154) / 66.2);    // 血の少ない皮ふの下地
const musP = lam => 46.0 * Math.pow(lam / 500, -1.421);                 // 皮ふの換算散乱係数（Table 2 の平均）

// 血液（ヘモグロビンのモル吸光係数 cm⁻¹/M。Prahl の表 OMLC、50 nm ごと。1000 nm より先は 1000 nm の値で代用）
const HB = { lam: [600, 650, 700, 750, 800, 850, 900, 950, 1000], oxy: [3200, 368, 290, 518, 816, 1058, 1198, 1204, 1024], deo: [14677, 3750, 1794, 1405, 762, 691, 762, 602, 207] };
// 水の吸収係数 1/cm（Hale & Querry 1973、OMLC）
const WATER = { lam: [600, 625, 650, 675, 700, 725, 750, 775, 800, 825, 850, 875, 900, 925, 950, 975, 1000, 1020, 1040, 1060, 1080, 1100], v: [0.0023, 0.0028, 0.0032, 0.00415, 0.006, 0.0159, 0.026, 0.024, 0.02, 0.028, 0.043, 0.056, 0.068, 0.144, 0.39, 0.45, 0.36, 0.27, 0.16, 0.12, 0.13, 0.17] };
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0]; if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 1; while (xs[i] < x) i++;
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + t * (ys[i] - ys[i - 1]);
}
const muaBlood = (lam, S) => 2.303 * 150 / 64500 * (S * interp(HB.lam, HB.oxy, lam) + (1 - S) * interp(HB.lam, HB.deo, lam));   // 全血 150 g/L
// 真皮: 血液 0.2%・酸素飽和度 39%・水 65%（Choudhury ほか 2010。Jacques 2013 の Table 3）＋下地
const DERM = { B: 0.002, S: 0.39, W: 0.65 };
const muaDerm = lam => (1 - DERM.W) * muaBase(lam) + DERM.W * interp(WATER.lam, WATER.v, lam) + DERM.B * muaBlood(lam, DERM.S);

// 光の届き方（Jacques 2010 PDT の式）: φ(z) = E·k·exp(−z/δ)、δ = 1/√(3μa(μa+μs'))、Rd ≈ exp(−8/√(3(1+μs'/μa)))
// k は Rd=0 で 1、Rd→1 で 約8.4、Rd>0.2 で Rd に比例（同論文の文）→ k = 1 + 7.4·Rd と直線で近似（推定）
// 表面の φ(0)/E は Rd 0.2〜0.6 で 2.4〜5.1（同）→ 1 + 6.8·Rd。Rd は表皮のメラニンを行き帰り2回通る分だけ減らす
function lightSpectrum(fmel) {
  const out = [];
  const n = Math.round((LIGHT.lamMax - LIGHT.lamMin) / LIGHT.lamStep) + 1;
  for (let i = 0; i < n; i++) {
    const lam = LIGHT.lamMin + i * LIGHT.lamStep;
    const ma = muaDerm(lam), ms = musP(lam);
    const delta = 1 / Math.sqrt(3 * ma * (ma + ms));
    const muaEpi = fmel * muaMel(lam) + (1 - fmel) * muaBase(lam);
    const Tepi = Math.exp(-muaEpi * LIGHT.epiCm);
    const Rd = Math.exp(-8 / Math.sqrt(3 * (1 + ms / ma))) * Tepi * Tepi;
    out.push({ lam, w: 1 / n, delta, k: 1 + 7.4 * Rd, k0: 1 + 6.8 * Rd, Rd, Tepi, muaEpi, mel: muaMel(lam) });
  }
  return out;
}

// 深さ z cm（表皮の下から）で、メラノソームが吸う「エネルギー密度 / 体積割合」= Σ w·μa_mel·φ（J/cm³ を F0=1 J/cm² あたり）
function melAbsorbed(spec, zcm) {
  let q = 0;
  for (const s of spec) q += s.w * s.mel * s.k * s.Tepi * Math.exp(-zcm / s.delta);
  return q;
}
function fluenceAt(spec, zcm) {   // 深さの光の量（F0 = 1 あたり。目安の表示用）
  let F = 0;
  for (const s of spec) F += s.w * s.k * s.Tepi * Math.exp(-zcm / s.delta);
  return F;
}

// --- 熱: 半径 R の円柱が τ のあいだ一様に熱を出す。q=1 W/cm³ のときの温度の上がり方を、いくつかの距離で記録 ---
// （熱の式は線形なので、本当の q をかければよい。ずっと長い毛穴を輪切りにした2次元の近似）
const _resp = {};
function unitResponse(Rcm, targets, Ri = 0) {
  const key = Rcm + '|' + Ri + '|' + targets.join(',');
  if (_resp[key]) return _resp[key];
  const alpha = LIGHT.kappa / LIGHT.rhoC, dr = Rcm / 8, N = Math.ceil(0.08 / dr) + 2;   // 0.8 mm まで
  const dt = 0.2 * dr * dr / alpha, tEnd = LIGHT.tau * 6 + 0.02;
  let T = new Float64Array(N), Tn = new Float64Array(N);
  const idx = targets.map(r => Math.min(N - 2, Math.round(r / dr)));
  const hist = targets.map(() => []), times = [];
  for (let t = 0; t < tEnd; t += dt) {
    const heat = t < LIGHT.tau;
    for (let i = 0; i < N - 1; i++) {
      const r = i * dr;
      let lap;
      if (i === 0) lap = 4 * (T[1] - T[0]) / (dr * dr);
      else lap = (T[i + 1] - 2 * T[i] + T[i - 1]) / (dr * dr) + (T[i + 1] - T[i - 1]) / (2 * dr * r);
      Tn[i] = T[i] + dt * (alpha * lap + (heat && r <= Rcm && r >= Ri ? 1 / LIGHT.rhoC : 0));
    }
    Tn[N - 1] = 0;
    [T, Tn] = [Tn, T];
    times.push(dt);
    idx.forEach((j, m) => hist[m].push(T[j]));
  }
  return (_resp[key] = { hist, dt, targets });
}
// 温度の上がり方 × q（W/cm³）から Ω と、いちばん高い温度
function damage(resp, m, q, T0) {
  let om = 0, Tmax = T0;
  const h = resp.hist[m];
  for (let i = 0; i < h.length; i++) {
    const T = T0 + h[i] * q;
    if (T > Tmax) Tmax = T;
    if (T > 43) om += LIGHT.Ahen * Math.exp(-LIGHT.Ehen / (LIGHT.Rgas * (T + 273.15))) * resp.dt;
  }
  return { om, Tmax };
}

// 毛穴の部分の寸法（cm）
const LG = {
  shaftR: 0.0035,     // 毛の半径 35 µm
  matrixR: 0.010,     // 毛球の色のある部分の半径 0.1 mm（推定）
  bulgeAt: 0.0105,    // バルジの細胞（外毛根鞘の外側）の、毛の軸からの距離
  papR: 0.005,        // 毛乳頭の半径 0.05 mm。毛母（色のある輪）に囲まれている
};

// 1回の光で、毛穴1つに起きること。opt = {F0, spec, fh}
// 返す: {om:{matrix, pap, bulge}, T:{matrix, bulge}}
function flashFollicle(f, opt) {
  const { F0, spec, fh } = opt;
  const res = { om: { matrix: 0, pap: 0, bulge: 0 }, T: { matrix: LIGHT.T0, bulge: LIGHT.T0 } };
  const tau = LIGHT.tau;
  const hasShaft = f.hairs.some(h => h.L > 0.2);
  const shaftPig = Math.max(0, ...f.hairs.filter(h => h.L > 0.2).map(h => h.pig == null ? 1 : h.pig));   // 白い毛はメラニンがない
  // バルジ: 毛（色のある毛幹）が熱をもつ。休止期は根もと（棍毛のまわり）に色がなく弱い（推定 0.3 倍）
  if (hasShaft) {
    const pig = f.ph === 'T' ? 0.3 : f.ph === 'R' || f.ph === 'X' ? 0 : 1;
    const q = fh * pig * shaftPig * melAbsorbed(spec, GEO.bulge / 10) * F0 / tau;
    const r = unitResponse(LG.shaftR, [LG.bulgeAt]);
    const d = damage(r, 0, q, LIGHT.T0);
    res.om.bulge = d.om; res.T.bulge = d.Tmax;
  }
  // 毛球: 成長期は毛母にいちばん色が多い。退行期は色を作るのをやめる（推定 0.4 倍）。休止期・抜いたあとは色のある毛球がない
  // 成長期の毛母が色を作りはじめるのは、毛球ができあがってから（成長期のはじめは色がない）。5日目から12日目にかけて増えると推定
  const pigM = (f.ph === 'A' ? Math.min(1, Math.max(0, (f.t - 5) / 7)) : f.ph === 'C' ? 0.4 : 0) * (f.pig == null ? 1 : f.pig);   // 白髪の毛穴は毛母に色の細胞がない
  if (pigM > 0) {
    const z = Math.max(0.1, f.bulb - 0.15) / 10;
    const q = fh * pigM * melAbsorbed(spec, z) * F0 / tau;
    // 毛母 = 毛乳頭をとり囲む輪（半径 0.05〜0.1 mm）。毛乳頭の高さの毛母は色が少ないので、毛乳頭へは半分（推定）
    const r = unitResponse(LG.matrixR, [(LG.matrixR + LG.papR) / 2, 0], LG.papR);
    const a = damage(r, 0, q, LIGHT.T0), b = damage(r, 1, q * 0.5, LIGHT.T0);
    res.om.matrix = a.om; res.T.matrix = a.Tmax; res.om.pap = b.om; res.T.pap = b.Tmax;
  }
  return res;
}

// 表皮: 厚さ 60 µm の層が τ のあいだ吸って温まり、熱は下の真皮へ逃げる（表面は空気で断熱）。1次元の熱の式
let _epiResp = null;
function epiResponse() {
  if (_epiResp) return _epiResp;
  const alpha = LIGHT.kappa / LIGHT.rhoC, L = LIGHT.epiCm, dz = L / 12, N = Math.ceil(0.05 / dz);
  const dt = 0.3 * dz * dz / alpha, tEnd = LIGHT.tau * 4;
  let T = new Float64Array(N), Tn = new Float64Array(N);
  const hist = [], jB = Math.round(L / dz) - 1;           // 基底層（表皮のいちばん下）
  for (let t = 0; t < tEnd; t += dt) {
    for (let i = 0; i < N - 1; i++) {
      const lap = i === 0 ? 2 * (T[1] - T[0]) / (dz * dz) : (T[i + 1] - 2 * T[i] + T[i - 1]) / (dz * dz);
      Tn[i] = T[i] + dt * (alpha * lap + (t < LIGHT.tau && i * dz < L ? 1 / LIGHT.rhoC : 0));
    }
    Tn[N - 1] = 0; [T, Tn] = [Tn, T]; hist.push(T[jB]);
  }
  return (_epiResp = { hist: [hist], dt });
}
// 表皮と、表面に出ている毛の温度（目安）
function flashSurface(opt, unshaved, cool = true) {
  const T0 = cool ? LIGHT.Tskin0 : LIGHT.TskinWarm;
  const { F0, spec, fh } = opt;
  let qe = 0;
  for (const s of spec) qe += s.w * s.k0 * s.muaEpi * F0;           // J/cm³（表皮で吸われる密度）
  const d = damage(epiResponse(), 0, qe / LIGHT.tau, T0);
  // 表面に出ている毛（まわりを組織とした円柱の式で目安に。空気の中なので本当はもっと熱くなる）
  let Thair = null;
  if (unshaved) {
    let q = 0; for (const s of spec) q += s.w * s.mel * s.k0 * F0;
    Thair = damage(unitResponse(LG.shaftR, [0]), 0, fh * q / LIGHT.tau, T0).Tmax;
  }
  return { Tepi: d.Tmax, omEpi: d.om, Thair };
}

// 表面に寝ている毛が光をさえぎる割合（剃っていないとき）。60 本/cm² 相当の毛が肌にそって寝ているとして推定
function hairShade(fs, opt) {
  let cover = 0;
  for (const f of fs) for (const h of f.hairs) {
    const above = h.L - rootDepth(f, h);
    if (above > 0.3) cover += (above / 10) * 0.007 * 60 / fs.length * (h.pig == null ? 1 : h.pig);   // 白い毛はほとんど吸わない   // 長さ cm × 太さ cm × 本数/cm²
  }
  cover = Math.min(0.9, cover);
  let a = 0; for (const s of opt.spec) a += s.w * (1 - Math.exp(-opt.fh * s.mel * 0.007));
  return cover * a;     // さえぎられる光の割合
}

// 光を1回あてる（idx の毛穴だけ）。L = 光の設定 {level, skin, hair, cool}。できごとを R.log に、結果を R.flashes に残す
const _specCache = {};
function lightEvent(fs, e, R, idx, L) {
  const sk = SKINS[L.skin];
  const spec = _specCache[L.skin] || (_specCache[L.skin] = lightSpectrum(sk.fmel));
  const F0 = L.level * LIGHT.fPerLevel;
  const opt = { F0, spec, fh: HAIRS[L.hair].fh, fmel: sk.fmel };
  const lit = idx.map(i => fs[i]);
  const shade = hairShade(lit, opt);                // 剃っていない毛が表面で光をさえぎる
  const surf = flashSurface(Object.assign({}, opt), shade > 0.01, L.cool);
  opt.F0 *= 1 - shade;
  let nA = 0, hit = 0, Tm = 0;
  const t = e.t;
  const skinWord = surf.omEpi >= 1 ? '（このモデルでは、やけどのおそれ）' : surf.omEpi >= 0.1 ? '（熱い）' : '';
  R.note(t, null, `光をあてた（Lv${L.level}・約 ${F0.toFixed(1)} J/cm²、${idx.length} 個の毛穴の上）。肌の表面（表皮）は最高 ${surf.Tepi.toFixed(0)}°C${skinWord}` +
    (shade > 0.01 ? `。剃っていない毛が光の ${(shade * 100).toFixed(0)}% をさえぎり、表面の毛は ${surf.Thair.toFixed(0)}°C に（こげる）` : ''), 'light');
  for (const i of idx) {
    const f = fs[i], ph = f.ph, doomedBefore = f.doomed;
    const res = flashFollicle(f, opt);
    const hitNow = applyFlash(f, res, t);
    if (ph === 'A' || ph === 'C') { nA++; Tm = Math.max(Tm, res.T.matrix); }   // 色のある毛球がある毛穴
    let text;
    if (ph === 'A' || ph === 'C') {
      if (hitNow) { hit++; text = `毛母が ${res.T.matrix.toFixed(0)}°C になり、熱でいたんだ → この毛はもう伸びない`; }
      else if (f.pig === 0) text = `白い毛で、毛母にも毛にも色（メラニン）がない → 熱にならず無事（${res.T.matrix.toFixed(0)}°C）`;
      else if (ph === 'A' && f.t < 12) text = `成長期のはじめで、毛母にまだ色がない（${res.T.matrix.toFixed(0)}°C）→ 無事`;
      else text = (f.pig < 1 ? '色がうすい毛で、' : '') + `毛母は ${res.T.matrix.toFixed(0)}°C まで。温まり足りず無事`;
    } else if (ph === 'X') text = 'もう毛を作らない毛穴（変化なし）';
    else text = ph === 'R' ? '抜いたあとで毛も色のある毛球もない → 光が効かない' : '休み中で、色のある毛球がない → 変化なし';
    if (f.doomed && !doomedBefore) text += '。幹細胞（バルジ）や毛乳頭もいたみ、次の毛は作れない';
    R.note(t, i, text, hitNow ? 'hit' : 'safe', hitNow ? '熱でいたんだ' : (ph === 'A' || ph === 'C') ? '無事' : '効かない');
  }
  (R.flashes || (R.flashes = [])).push({ t, idx, nA, hit, Tm, shade, ...surf });
}
