// 雲ができるまで — 場面（空の条件）と、結果からの雲の判定
'use strict';
(function (G) {
  const { qsw, qstar, g } = G.CT;
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const NX = 256;

  const SCENES = [
    {
      id: 'cumulus', name: '晴れの日の綿雲', tag: '積雲', Lx: 19200, Lz: 6400, nz: 100, dtMax: 3, speed: 90, horizon: 3 * 3600,
      sounding: z => ({
        theta: z < 800 ? 300 : z < 3000 ? 300 + (z - 800) * 0.0045 : 309.9 + (z - 3000) * 0.008,
        qv: 1e-3 * (z < 800 ? 14 : z < 3000 ? lerp(14, 6, (z - 800) / 2200) : lerp(6, 1.5, (z - 3000) / 3400)),
      }),
      wind: () => 3,
      force: { sfcH: 220, sfcE: 320, hs: 120, cd: 0.002, windTau: 3600, spongeTop: 1000 },
      init: s => s.addNoise(0.2, 700),
      why: '地面があたたまると、下の空気がふくらんで泡のようにのぼります。のぼると冷え、水蒸気が水滴になる高さで雲の底ができます。',
      calc: '泡の場所と大きさ、雲の底の高さ、雲の数と形', given: '地面の熱（むらをつけて）、最初の空',
      sliders: ['heat', 'humid'],
    },
    {
      id: 'cumulonimbus', name: '夏の入道雲', tag: '積乱雲', Lx: 48000, Lz: 16000, nz: 100, dtMax: 3, speed: 40, horizon: 2 * 3600,
      sounding: (z, p) => {
        const zt = 12000, th = z < zt ? 300 + 43 * Math.pow(z / zt, 1.25) : 343 * Math.exp(g * (z - zt) / (1004 * 213));
        const rh = z < zt ? 1 - 0.75 * Math.pow(z / zt, 1.25) : 0.25, T = th * Math.pow(p / 1e5, 0.2859);
        return { theta: th, qv: Math.min(0.014, rh * qsw(T, p)) };
      },
      wind: z => 14 * Math.min(1, z / 3500) - 7,
      force: { spongeTop: 3000, spongeTau: 90, cd: 0.001 },
      init: s => { s.initBubble({ x: 24000, z: 1400, rx: 8000, rz: 1400, dT: 2 }); s.addNoise(0.1, 1500); },
      why: '上のほうが冷たく乾いた空に、あたたかく湿った空気のかたまりがあると、水蒸気が水になるときの熱で浮きつづけ、対流圏のてっぺんまで届きます。',
      calc: '雲の高さ、上昇の速さ、雨と雪、地面に広がる冷たい空気', given: '最初の空（Weisman & Klemp の式の形）、最初のあたたかいかたまり、風の差',
      note: '2次元なので本物の積乱雲とは形がちがいます。',
      sliders: ['humid', 'wind'],
    },
    {
      id: 'fog', name: '朝の霧と低い雲', tag: '霧→低い雲', Lx: 3200, Lz: 1000, nz: 100, dtMax: 3, speed: 200, horizon: 11 * 3600,
      sounding: (z, p) => ({ theta: 283 + 0.005 * z, qv: Math.min(0.0078, (0.94 - 0.2 * Math.min(1, z / 800)) * qsw((283 + 0.005 * z) * Math.pow(p / 1e5, 0.2859), p)) }),
      wind: () => 1.2,
      force: {
        sfcH: t => t < 7 * 3600 ? -38 : 160 * Math.min(1, (t - 7 * 3600) / 5400) - 38 * Math.max(0, 1 - (t - 7 * 3600) / 1800),
        sfcE: 0, hs: 40, het: 0.1, lw: { F0: 45, kappa: 85 }, cd: 0.002, windTau: 1800, spongeTop: 200,
      },
      init: s => s.addNoise(0.03, 300),
      why: '夜、地面が冷えると、そのすぐ上の空気が冷えて霧になります。朝になって地面があたたまると、下から霧が消えて低い雲になり、やがて消えます。',
      calc: '霧ができる時刻と厚さ、朝に持ち上がるようす', given: '地面の冷え方とあたたまり方（夜7時間＋朝）、霧の上面の冷え方（目安）',
      note: '霧は地面についた雲で、十種雲形には入りません。',
      sliders: ['heat', 'humid'],
    },
    {
      id: 'stratocumulus', name: '海の上の雲のじゅうたん', tag: '層積雲', Lx: 3840, Lz: 1280, nz: 64, dtMax: 1.5, speed: 60, horizon: 1.5 * 3600,
      sounding: z => z < 840 ? { thl: 289, qt: 9e-3 } : { thl: 297.5 + Math.cbrt(z - 840), qt: 1.5e-3 },
      wind: () => 6,
      force: { sfcH: 15, sfcE: 115, hs: 40, het: 0.05, lw: { F0: 70, kappa: 85 }, wls: (x, z) => -3.75e-6 * z, windTau: 1800, spongeTop: 160 },
      init: s => s.addNoise(0.15, 800),
      why: '強いふた（逆転層）の下で、雲の上面が宇宙へ熱を逃がして冷えます。冷えた空気が沈むことで上下にかき混ぜられ、雲の板が保たれます。',
      calc: '板の中のかき混ぜ、雲の厚さの変化、雲の模様', given: '最初の空（DYCOMS-II RF01 の状態を借りた）・上面の冷え方と沈む速さ（目安）',
      note: '最初から薄い雲があるところから始まります。格子が粗いので、雲の厚さは計算の細かさにも左右されます。',
      sliders: ['heat', 'humid'],
    },
    (() => {
      let qtLayer = 0;
      return {
        id: 'altocumulus', name: 'ひつじ雲', tag: '高積雲', Lx: 7680, Lz: 2560, z0: 2500, nz: 64, dtMax: 2, speed: 60, horizon: 2 * 3600,
        sounding: (z, p) => {
          const pi = Math.pow(p / 1e5, 0.2859);
          if (z > 3900 && z < 4400) { if (!qtLayer) qtLayer = 1.06 * qsw(322 * pi, p * 0.985); return { thl: 322, qt: qtLayer }; }
          const th = z <= 3900 ? 300 + 0.0055 * z : 325 + 0.006 * (z - 4400);
          return { theta: th, rh: z > 4400 ? 0.7 : 0.45 };
        },
        wind: () => 8,
        force: { lw: { F0: 30, kappa: 85 }, windTau: 1800, spongeTop: 300 },
        init: s => s.addNoise(0.1, 4400),
        why: '上空に湿った薄い層があると、層の上面が冷えて上下にかき混ぜられ、小さな雲のかたまりが並びます。',
        calc: 'かたまりの並びと大きさ', given: '湿った層を最初から置く、上面の冷え方（目安）',
        sliders: ['humid'],
      };
    })(),
    {
      id: 'lenticular', name: '山のレンズ雲', tag: '高積雲（レンズ状）', Lx: 51200, Lz: 12000, nz: 100, dtMax: 5, speed: 90, horizon: 3 * 3600, cropCx: 0.42,
      sounding: z => ({
        theta: z < 3000 ? 290 + 0.007 * z : 311 + 0.0035 * (z - 3000),
        rh: z > 3000 && z < 5000 ? 0.86 : 0.25,
      }),
      wind: z => Math.min(24, 11 + 2.2 * z / 1000),
      terrain: { h: 1300, a: 4000, x0: 14000 },
      force: { spongeTop: 3500, spongeSide: 5000, spongeTau: 90, windTau: 7200 },
      why: '安定した空気が強い風で山を越えると、空気は山の風下で上下に波打ちます。波の山で冷えて雲になり、谷で消えます。雲は止まって見えますが、空気は中を通りぬけています。',
      calc: '波の位置と波長、雲ができて消える場所', given: '山の形、最初の空と風',
      sliders: ['humid', 'wind'],
    },
    (() => {
      const mx = 18000, layer = z => z > 8500 && z < 10000;
      return {
        id: 'cirrus', name: '空のすじ雲', tag: '巻雲→巻層雲', Lx: mx, Lz: 6000, z0: 6000, nz: 100, dtMax: 3, speed: 90, horizon: 2 * 3600,
        sounding: (z, p) => {
          const th = 290 + 0.005 * z, T = th * Math.pow(p / 1e5, 0.2859);
          return { theta: th, qv: (layer(z) ? 0.63 : 0.36) * qsw(T, p) };
        },
        wind: z => 7 * (z - 9000) / 3000,
        force: { wls: (x, z) => z > 8200 && z < 11000 ? 0.3 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * x / mx * 3)), 8) : 0, spongeTop: 900 },
        init: s => s.addNoise(0.1, 10000),
        why: '高い空では雲は氷の粒でできています。粒は重くなると落ちますが、高さごとに風がちがうので、落ちるあとが斜めにのびて「すじ」になります。',
        calc: 'すじの向きと長さ、下の乾いた空気で消える高さ', given: 'ゆっくりした持ち上げ（むらをつけて）、氷の粒の落ちる速さ（目安）',
        note: 'すじの形は、与えた落ちる速さと風の差でほぼ決まります。氷の過飽和と粒の大きさは計算していません。広がって空をおおうと、判定は巻層雲に変わります。',
        viewDepth: 900,
        sliders: ['humid', 'wind'],
      };
    })(),
    {
      id: 'kelvin', name: '波のかたちの雲', tag: 'ケルビン・ヘルムホルツ波', Lx: 9600, Lz: 3200, z0: 3000, nz: 128, dtMax: 1, speed: 15, horizon: 30 * 60,
      sounding: z => ({ theta: 310 + 0.004 * (z - 3000), rh: 0.45 + 0.555 * Math.exp(-Math.pow((z - 4750) / 260, 2)) }),
      wind: z => 10 * Math.tanh((z - 4600) / 150),
      force: { spongeTop: 500 },
      init: s => {
        const k = 2 * Math.PI * 4 / s.cfg.Lx;
        for (let n = 0; n < s.nz; n++) for (let i = 0; i < s.nx; i++) s.h[n * s.nx + i] += 1004 * 0.15 * Math.sin(k * (i + 0.5) * s.dx) * Math.exp(-Math.pow((s.zc[n] - 4600) / 350, 2));
        s.addNoise(0.01, 6000);
      },
      why: '速さのちがう2つの空気の層がこすれ合うと、さかい目が波打って巻きこみます。さかい目に湿った空気があると、その形のまま雲に見えます。',
      calc: '波の成長、巻きこみ、くずれて混ざるまで', given: '風の差、湿った層の高さ、最初の小さなゆらぎ',
      note: '「ケルビン・ヘルムホルツ波」は雲の種類（類）ではなく、雲に現れる特徴（国際雲図帳の fluctus）です。',
      sliders: ['humid'],
    },
    (() => {
      const lift = (x, z, t) => {
        const xf = 60000 + 12 * t, zf = (x - xf) / 150;
        if (zf < -200) return zf < -800 ? -0.02 : 0;   // 前線が通りすぎた側は ゆっくり沈んで 雲が消える
        const dz = (z - zf - 1600) / 1600;
        return 0.11 * Math.exp(-Math.max(0, x - xf) / 450000) * Math.exp(-dz * dz);
      };
      return {
        id: 'front', name: '温暖前線の雲の列', tag: '巻層雲・高層雲・乱層雲', Lx: 1024000, Lz: 12000, nz: 80, dtMax: 30, speed: 1200, horizon: 20 * 3600, bands: true, cropCx: 0.55,
        sounding: z => ({ theta: 293 + 0.0045 * z, rh: z < 5000 ? 0.72 : 0.72 }),
        force: { wls: lift },
        why: 'あたたかい空気が冷たい空気の上にゆるやかにのり上げると、高いところから順に雲ができます。前線が近づくほど雲の底は低く、厚くなって雨になります。',
        calc: '雲の底の高さと厚さの変化、雨', given: '前線の面の形と持ち上げの速さ（決めて与えた）',
        note: '雲の並びは、与えた持ち上げの形でほぼ決まります。前線そのものの動きは計算していません。高さを大きく拡大しています。',
        sliders: ['humid'],
      };
    })(),
  ];
  for (const s of SCENES) s.nx = NX;

  // 光学的な厚さの係数（有効半径: 水 10µm、氷 40µm。見た目と判定の目安）
  const TAU_L = 1.5 / (1000 * 10e-6), TAU_I = 1.5 / (917 * 40e-6);

  // 列ごとの雲の情報を集める
  function columnStats(sim) {
    const { nx, nz, dz, zc, rhoc, qn, T, qp, kg, cfg } = sim;
    const out = new Array(nx);
    for (let i = 0; i < nx; i++) {
      let base = Infinity, top = -Infinity, tau = 0, topT = 0, ice = 0, liq = 0;
      for (let k = kg[i]; k < nz; k++) {
        const c = k * nx + i, q = qn[c];
        if (q < 1e-5) continue;
        if (zc[k] < base) base = zc[k];
        if (zc[k] > top) { top = zc[k]; topT = T[c]; }
        const o = G.CT.omN(T[c]);
        tau += rhoc[k] * q * dz * (o * TAU_L + (1 - o) * TAU_I);
        if (o > 0.5) liq += q; else ice += q;
      }
      out[i] = { base, top, tau, topT, iceFrac: (ice + liq) > 0 ? ice / (ice + liq) : 0 };
    }
    return out;
  }

  // 全体の判定（目安。WMO の高さの表と光学的な厚さ・雨から）
  function classifyAll(cols, sim, rainRate, wMax) {
    const nx = cols.length, z0 = sim.z0;
    let n = 0, sumB = 0, sumT = 0, minB = Infinity, maxT = -Infinity, tau = 0, ice = 0, topT = 300;
    for (const c of cols) if (c.tau > 0.3) { n++; sumB += c.base; sumT += c.top; if (c.base < minB) minB = c.base; if (c.top > maxT) { maxT = c.top; topT = c.topT; } tau += c.tau; ice += c.iceFrac; }
    const cover = n / nx;
    if (n === 0) return { name: '雲はありません', short: '雲なし', cover: 0, base: null, top: null };
    const base = sumB / n, top = maxT, depth = top - base, tauM = tau / n, iceM = ice / n;
    const res = { cover, base, top, tauM, iceM };
    const ground = z0 + sim.dz * 1.5, tall = maxT - minB;
    res.base = minB;
    let name;
    if (base <= ground && top - z0 < 900) name = '霧';
    else if (tall > 6000 && topT < 253 && wMax > 2 && (rainRate > 0.1 || wMax > 5)) name = '積乱雲';
    else if (sim.cfg.terrain && cover < 0.6 && base >= 2000 && iceM < 0.6) name = '高積雲（レンズ状）';
    else if (wMax > 1.5 && cover < 0.75 && iceM < 0.3 && minB < 3000) name = tall > 2500 ? '雄大積雲' : '積雲';
    else if (base < 2000) name = cover > 0.7 ? (depth > 2500 && rainRate > 0.1 ? '乱層雲' : wMax > 0.35 ? '層積雲' : '層雲') : '積雲';
    else if (base < 5500 && iceM < 0.6) name = cover > 0.8 && tauM > 3 ? '高層雲' : '高積雲';
    else name = cover > 0.6 ? '巻層雲' : '巻雲';
    res.name = name; res.short = name;
    return res;
  }
  // 前線の場面: 列ごとに名前をつけて帯にする
  function bandName(c, rain) {
    if (c.tau < 0.3) return '';
    if (c.base < 2500 && rain > 0.05) return '乱層雲';
    if (c.base > 5000 && c.iceFrac > 0.5) return c.tau > 0.8 ? '巻層雲' : '巻雲';
    if (c.base < 7000 && c.tau > 3) return '高層雲';
    if (c.top > 5000) return c.tau > 0.8 ? '巻層雲' : '巻雲';
    return '高積雲';
  }

  G.CS = { SCENES, columnStats, classifyAll, bandName };
})(globalThis);
