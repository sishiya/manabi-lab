// 心地よい音・いやな音 — 耳のモデル（簡単版）と、快さ・興奮の推定
// 音のつまみ → 成分の一覧（周波数・振幅） → 大きさ（sone）・鋭さ（acum）・粗さ（asper）→ 地図の点。
// 合成（synth.js）も同じ成分の一覧から鳴らすので、聞こえる音と計算した値は同じものを見ている。
'use strict';

// ---- 等ラウドネス曲線 ISO 226:2003 の表（20 Hz〜12.5 kHz） ----
const ISO_F  = [20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500];
const ISO_AF = [0.532,0.506,0.480,0.455,0.432,0.409,0.387,0.367,0.349,0.330,0.315,0.301,0.288,0.276,0.267,0.259,0.253,0.250,0.246,0.244,0.243,0.243,0.243,0.242,0.242,0.245,0.254,0.271,0.301];
const ISO_LU = [-31.6,-27.2,-23.0,-19.1,-15.9,-13.0,-10.3,-8.1,-6.2,-4.5,-3.1,-2.0,-1.1,-0.4,0.0,0.3,0.5,0.0,-2.7,-4.1,-1.0,1.7,2.5,1.2,-2.1,-7.1,-11.2,-10.7,-3.1];
const ISO_TF = [78.5,68.7,59.5,51.1,44.0,37.5,31.5,26.5,22.1,17.9,14.4,11.4,8.6,6.2,4.4,3.0,2.2,2.4,3.5,1.7,-1.3,-4.2,-6.0,-5.4,-1.5,6.0,12.6,13.9,12.3];

// 表の間は log 周波数で直線補間（表の外は端の値）
function isoParams(f) {
  const lf = Math.log(Math.max(ISO_F[0], Math.min(ISO_F[ISO_F.length - 1], f)));
  let i = 0;
  while (i < ISO_F.length - 2 && Math.log(ISO_F[i + 1]) < lf) i++;
  const t = (lf - Math.log(ISO_F[i])) / (Math.log(ISO_F[i + 1]) - Math.log(ISO_F[i]));
  const m = (a) => a[i] + (a[i + 1] - a[i]) * Math.max(0, Math.min(1, t));
  return { af: m(ISO_AF), lu: m(ISO_LU), tf: m(ISO_TF) };
}
// 音圧レベル Lp（dB SPL）→ ラウドネスレベル（phon）。ISO 226 の式を逆にたどる。聞こえない音は -1
function splToPhon(f, lp) {
  const { af, lu, tf } = isoParams(f);
  if (lp <= tf) return -1;
  const Af = Math.pow(10, (lp + lu - 94) * af / 10);
  const Bf = Math.pow(0.4 * Math.pow(10, (tf + lu) / 10 - 9), af);
  const x = (Af - Bf) / 4.47e-3 + 1.15;
  if (x <= 0) return -1;
  return 40 * Math.log10(x);
}
// phon → sone（40 phon で 1 sone、10 phon ごとに2倍。40 未満は Zwicker の近似）
function phonToSone(p) { return p <= 0 ? 0 : p >= 40 ? Math.pow(2, (p - 40) / 10) : Math.pow(p / 40, 2.642); }
// 周波数 → 臨界帯域の番号（Bark。Traunmüller 1990 の近似式）
function bark(f) { return 26.81 * f / (1960 + f) - 0.53; }

// ---- つまみ → 成分の一覧 ----
// tone: 1つ目の音（と2つ目の音）の倍音、squeal: キーキーの帯の成分（黒板の音のかわり）
const SQUEAL_F = [2610, 3080, 3340, 3890, 4270, 4930];   // 2.5〜5.5 kHz の中に、近い組を入れた（近い組は粗さも出す）
function partialsOf(P) {
  const out = [];
  const pw = 5 - 4.3 * P.bright;                   // 倍音の弱まり方（大きいほど sin に近い）
  const ex = 1 + 0.12 * P.stretch;                  // 倍音のずれ（0 なら整数倍）
  const addTone = (f0, grp, base) => {   // base: 合成の枠の番号（1つ目 0〜15、2つ目 16〜31、3つ目 32〜47、キーキー 48〜）
    for (let n = 1; n <= 16; n++) {
      const f = f0 * Math.pow(n, ex);
      if (f > 12000) break;
      const a = Math.pow(n, -pw);
      if (a < 0.002) break;
      out.push({ f, a, g: grp, s: base + n - 1 });
    }
  };
  if (P.chord && P.chord.length) P.chord.slice(0, 3).forEach((st, i) => addTone(P.f0 * Math.pow(2, st / 12), 0, 16 * i));   // BGM の和音（半音の数）
  else {
    addTone(P.f0, 0, 0);
    if (P.two) addTone(P.f0 * Math.pow(2, P.cents / 1200), 0, 16);
  }
  if (P.squeal > 0.001) SQUEAL_F.forEach((f, i) => out.push({ f, a: 1.4 * P.squeal * (i % 2 ? 0.8 : 1), g: 1, s: 48 + i }));
  // 音程のある音の全体の強さ（パワー）を tone² に、ノイズ（自然の音）を noise² にそろえる
  const tone = P.tone === undefined ? 1 : P.tone;
  let pt = 0; for (const p of out) pt += p.a * p.a;
  const kt = pt > 0 ? tone / Math.sqrt(pt) : 0;
  for (const p of out) p.a *= kt;
  if (P.nature && P.nature !== 'none' && P.noise > 0.001) {
    const nb = noiseBands(P.nature);
    let pn = 0; for (const b of nb) pn += b.a * b.a;
    for (const b of nb) out.push({ f: b.f, a: b.a * P.noise / Math.sqrt(pn), g: 2 });
  }
  return out.filter(p => p.a > 0);
}

// ---- ノイズ・自然の音のスペクトル（合成 worklet.js のフィルタと同じ形の式） ----
// 1/3 オクターブの帯ごとに1つの成分（帯のパワーの平方根）として耳のモデルに入れる。粗さには数えない（g=2）
const BANDS = []; for (let i = -13; i <= 11; i++) BANDS.push(1000 * Math.pow(2, i / 3));   // 約 50 Hz〜12.7 kHz
const hp = (f, fc) => { const r = (f / fc) ** 2; return r / (1 + r); };
const lp = (f, fc) => 1 / (1 + (f / fc) ** 2);
const bp = (f, fc, q) => { const x = f / fc, d = x / q; return d * d / ((1 - x * x) ** 2 + d * d); };
const NOISE = {
  white: { name: 'ザー（ホワイトノイズ）', d: f => 1 },
  pink:  { name: 'ピンクノイズ', d: f => 1 / f },
  rain:  { name: '雨', d: f => (1 / f) * hp(f, 1000) * hp(f, 1000) * lp(f, 9000) },
  wave:  { name: '波', d: f => (1 / (f * f)) * lp(f, 700) * hp(f, 40) },
  wind:  { name: '風', d: f => (1 / f) * bp(f, 450, 1.5) },
};
function noiseBands(type) {
  const n = NOISE[type]; if (!n) return [];
  return BANDS.map(fc => ({ f: fc, a: Math.sqrt(n.d(fc) * fc * 0.2316) }));   // 帯の幅 = 0.2316·fc
}

// 振幅のゆらし（AM）を、ゆらす前の成分と両わきの成分に分ける（耳のモデル用。合成はゆらしをそのままかける）
// 合成の式: (1 - m/2 + m/2·cos 2πfm t) → まん中 1 - m/2、両わき m/4 ずつ
function withSidebands(parts, P) {
  const m = P.amDepth, fm = P.amRate;
  if (m < 0.001 || fm < 0.5) return parts;
  const out = [];
  for (const p of parts) {
    if (p.g === 2) { out.push(p); continue; }   // ゆらしは音程のある音だけにかける（合成も同じ）
    out.push({ f: p.f, a: p.a * (1 - m / 2), g: p.g });
    out.push({ f: p.f + fm, a: p.a * m / 4, g: p.g });
    if (p.f - fm > 15) out.push({ f: p.f - fm, a: p.a * m / 4, g: p.g });
  }
  return out;
}

// ---- 成分（周波数・振幅）と想定の音圧レベル → 各成分の dB SPL・phon・sone ----
function levelsOf(comps, levelDb) {
  let pw = 0; for (const c of comps) pw += c.a * c.a;
  const ref = Math.sqrt(pw) || 1;
  return comps.map(c => {
    const lp = levelDb + 20 * Math.log10(Math.max(1e-9, c.a / ref));
    const ph = splToPhon(c.f, lp);
    return { f: c.f, a: c.a, g: c.g, lp, ph, sone: phonToSone(ph) };
  });
}

// 大きさ（sone）: 臨界帯域ごとに強さを足し、帯域ごとの sone を合計（マスキングは入れない簡単版）
// 鋭さ（acum）: Zwicker の式 0.11·Σ N'·g(z)·z / N（16 Bark より上を重く）
function loudSharp(lv) {
  const band = new Float64Array(25);
  for (const c of lv) if (c.ph > 0) band[Math.max(0, Math.min(24, Math.floor(bark(c.f))))] += Math.pow(10, c.ph / 10);
  let N = 0, num = 0;
  const bandSone = [];
  for (let i = 0; i < 25; i++) {
    const s = band[i] > 0 ? phonToSone(10 * Math.log10(band[i])) : 0;
    bandSone.push(s); N += s;
    const z = i + 0.5, gz = z < 16 ? 1 : 0.066 * Math.exp(0.171 * z);
    num += s * gz * z;
  }
  return { N, S: N > 0 ? 0.11 * num / N : 0, bandSone };
}

// 粗さ: 成分の組ごとに Plomp & Levelt（1965）の曲線（Sethares 1993 の式）を足す。
// 重みは Sethares と同じく小さいほうの振幅（いちばん強い成分を 1 とした比。聞こえない成分は 0）に、
// 全体の大きさの分 2^((L-60)/20)（20 dB 大きいと2倍。音が大きいほど少し粗い）をかける。1 kHz・60 dB・70 Hz で 100% ゆらした音を 1 asper にそろえる
function pairRough(lv) {
  let amax = 0, pw = 0;
  for (const c of lv) { if (c.g !== 2) amax = Math.max(amax, c.a); pw += c.a * c.a; }
  if (amax <= 0) return 0;
  const L = lv[0].lp - 20 * Math.log10(lv[0].a / Math.sqrt(pw));   // 全体の音圧レベル
  const G = Math.pow(2, (L - 60) / 20);
  let d = 0;
  for (let i = 0; i < lv.length; i++) {
    const a = lv[i]; if (a.sone <= 0) continue;
    if (a.g === 2) continue;
    for (let j = i + 1; j < lv.length; j++) {
      const b = lv[j]; if (b.sone <= 0 || b.g === 2) continue;
      const lo = Math.min(a.f, b.f), df = Math.abs(a.f - b.f);
      const s = 0.24 / (0.0207 * lo + 18.96), x = s * df;
      if (x > 6) continue;
      d += Math.min(a.a, b.a) / amax * (Math.exp(-3.51 * x) - Math.exp(-5.75 * x));
    }
  }
  return d * G;
}
const ROUGH_REF = (() => {
  const P = { f0: 1000, bright: 1, stretch: 0, two: false, cents: 0, squeal: 0, amRate: 70, amDepth: 1, level: 60 };
  return pairRough(levelsOf(withSidebands([{ f: 1000, a: 1, g: 0 }], P), 60));
})();

// ---- 快さと興奮の推定 ----
// 快さ: Aures（1985）の考え方（粗さ・鋭さ・大きさで下がり、音らしさ＝tonality で上がる。どれも指数の形）にならった式。
//   係数はこのアプリでの推定（原典の値と同じかは確かめていない。DEVNOTES）。
// 興奮: 大きいほど・鋭いほど・粗いほど興奮のほう（Juslin & Laukka 2003 のまとめ、Arnal ほか 2015）。重みはこのアプリの推定。
function analyze(P) {
  const parts = partialsOf(P);
  const comps = withSidebands(parts, P);
  const lv = levelsOf(comps, P.level);
  const { N, S, bandSone } = loudSharp(lv);
  const R = pairRough(lv) / ROUGH_REF;
  // 音らしさ（tonality）: 音程のある成分の sone ÷ ぜんぶの sone（Aures の「音の成分の大きさの割合」の簡単版）
  let st = 0, sa = 0; for (const c of lv) { sa += c.sone; if (c.g !== 2) st += c.sone; }
  const T = sa > 0 ? st / sa : 1;
  const pleas = Math.exp(-0.7 * R) * Math.exp(-1.08 * S) * (1.24 - Math.exp(-2.43 * T)) * Math.exp(-Math.pow(0.023 * N, 2));
  const valence = Math.max(-1, Math.min(1, Math.log10(pleas / 0.25) / 0.65));
  // テンポ: 速いほど興奮のほう（Bernardi ほか 2006: 速いテンポで呼吸・心拍・血圧が上がった）。拍がないときは 0
  const tempo = P.bpm > 0 ? 0.6 * Math.tanh((P.bpm - 90) / 40) : 0;
  const arousal = Math.tanh(0.45 * Math.log2(Math.max(0.05, N) / 4) + 0.5 * (S - 1.0) + 0.6 * R + tempo);
  // 内わけ（地図の目盛りでの寄与）: 快さは log10 の各項 ÷ 0.65、興奮は tanh の中の各項
  const why = {
    v: { R: -0.7 * R / Math.LN10 / 0.65, S: -1.08 * S / Math.LN10 / 0.65, T: Math.log10((1.24 - Math.exp(-2.43 * T)) / (1.24 - Math.exp(-2.43))) / 0.65, N: -Math.pow(0.023 * N, 2) / Math.LN10 / 0.65 },
    a: { N: 0.45 * Math.log2(Math.max(0.05, N) / 4), S: 0.5 * (S - 1.0), R: 0.6 * R, bpm: tempo },
  };
  return { parts, comps: lv, N, S, R, T, pleas, valence, arousal, bandSone, why };
}

// 2つ目の音の音程（セント）を 0〜1200 で動かしたときの粗さ（いまの音色・高さ・大きさで。ゆらしは入れない）
function roughCurve(P, step = 5) {
  const out = [];
  const q = Object.assign({}, P, { two: true, squeal: 0, amDepth: 0, chord: null, nature: 'none' });
  for (let c = 0; c <= 1200; c += step) {
    q.cents = c;
    out.push(pairRough(levelsOf(partialsOf(q), q.level)) / ROUGH_REF);
  }
  return out;
}

window.Psycho = { NOISE, noiseBands, splToPhon, phonToSone, bark, partialsOf, withSidebands, levelsOf, loudSharp, analyze, roughCurve, SQUEAL_F, ISO_F, ISO_TF };
