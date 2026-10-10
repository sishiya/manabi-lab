// scale.js — スケール値 L（画面の幅が 10^L m）と、身近なものさし、宇宙〜素粒子の目盛り。
// いまは地球のステージだけ。宇宙（段階F）とミクロ（段階G）はここにステージを足していく。
'use strict';

(function () {
  const GV = window.GV;

  // 画面の幅（m）に近い身近なもの
  GV.RULERS = [
    // ミクロ（v010: ヒトの道をやめたので、地面・水・植物の道に合うものさしに）
    [1.6e-35, 'プランク長（これより小さい長さは今の物理では意味が分からない）'], [1e-18, 'クォーク（大きさはこれより小さい）'], [1.7e-15, '陽子の大きさ'], [6e-15, '原子核'], [1e-12, '原子の中のすきま'], [2e-10, '原子ひとつ'], [3e-10, '水の分子'], [7e-10, '結晶の並びのくり返し'], [1e-9, 'クロロフィル分子'], [1.5e-8, 'チラコイドの膜の重なり'],
    [5e-7, '見える光の波の長さ'], [2e-6, '粘土の粒'], [5e-6, '葉緑体'], [1e-5, '霧の粒'], [3e-5, '気孔'], [6e-5, '細かい砂（シルト）'], [5e-4, '砂つぶ'], [3e-3, '水しぶきの粒'], [0.02, '小石'], [0.08, '葉っぱ1枚'],
    [0.3, 'ネコ1匹分'], [1.7, '人ひとり分'], [10, '家1軒分'], [25, '学校のプールの長さ'],
    [105, 'サッカー場の長さ'], [333, '東京タワーの高さ'], [1000, '町内ひとつ分'],
    [3776, '富士山の高さ'], [12000, '大きめの市ひとつ分'], [40000, '東京23区くらい'],
    [130000, '関東平野くらい'], [500000, '東京から大阪まで'], [1300000, '本州の半分くらい'],
    [3000000, '日本列島の長さ'], [12742000, '地球の直径'],
    [3.844e8, '地球から月まで'], [1.496e11, '太陽から地球まで（1 天文単位）'], [1.2e12, '太陽から土星まで'], [9e12, '太陽系（海王星の軌道）'],
    [9.46e15, '1 光年'], [4.0e16, 'いちばん近い恒星まで（4.2 光年）'], [3e17, '近くの恒星たち（30 光年）'], [3e18, '星団くらい（300 光年）'],
    [2.5e20, '天の川銀河の中心まで（2.7 万光年）'], [9.5e20, '天の川銀河（直径 約10万光年）'], [2.4e22, 'アンドロメダ銀河まで（250 万光年）'], [1e23, '局所銀河群'],
    [1e24, 'おとめ座超銀河団'], [1e25, '宇宙の大規模構造（網の目）'], [8.8e26, '観測できる宇宙（直径 930 億光年）'],
  ];

  // 宇宙からミクロまでの帯（PLAN.md 4章）。ready = もう見られる
  GV.BANDS = [
    { from: -35, to: -33.2, label: 'プランク', ready: true },
    { from: -33.2, to: -19.4, label: '…', ready: false, gap: true },   // 何もない区間（目盛りでは短く描く）
    { from: -19.4, to: -15, label: '素粒子', ready: true },
    { from: -15, to: -10, label: '原子核', ready: true },
    { from: -10, to: -5, label: '分子・原子', ready: true },
    { from: -5, to: -1, label: 'つぶ', ready: true },
    { from: -1, to: 1, label: '地面', ready: true },
    { from: 1, to: 5, label: '街・地形', ready: true },
    { from: 5, to: 8, label: '地球', ready: true },
    { from: 8, to: 13, label: '太陽系', ready: true },
    { from: 13, to: 21, label: '恒星・銀河', ready: true },
    { from: 21, to: 27.4, label: '宇宙', ready: true },
  ];
  // English (I18N.md): same order as GV.RULERS / GV.BANDS
  if (LANG === 'en') {
    const RULERS_EN = ['The Planck length (current physics cannot say what smaller lengths mean)', 'A quark (smaller than this)', 'Size of a proton', 'An atomic nucleus', 'Empty space inside an atom', 'One atom', 'A water molecule', 'Repeat of a crystal pattern', 'A chlorophyll molecule', 'Stacked thylakoid membranes',
      'Wavelength of visible light', 'A clay particle', 'A chloroplast', 'A fog droplet', 'A stoma', 'Fine sand (silt)', 'A grain of sand', 'A drop of spray', 'A pebble', 'One leaf',
      'One cat', 'One person', 'One house', 'Length of a school pool',
      'Length of a soccer field', 'Height of Tokyo Tower', 'One neighborhood',
      'Height of Mount Fuji', 'One large city', 'About Tokyo’s 23 wards',
      'About the Kanto Plain', 'Tokyo to Osaka', 'About half of Honshu',
      'Length of the Japanese islands', 'Earth’s diameter',
      'Earth to the Moon', 'Sun to Earth (1 astronomical unit)', 'Sun to Saturn', 'The Solar System (Neptune’s orbit)',
      '1 light-year', 'To the nearest star (4.2 light-years)', 'Nearby stars (30 light-years)', 'About a star cluster (300 light-years)',
      'To the center of the Milky Way (27,000 light-years)', 'The Milky Way (about 100,000 light-years across)', 'To the Andromeda Galaxy (2.5 million light-years)', 'The Local Group',
      'The Virgo Supercluster', 'Large-scale structure of the universe (the cosmic web)', 'The observable universe (93 billion light-years across)'];
    GV.RULERS.forEach((r, i) => { r[1] = RULERS_EN[i]; });
    const BANDS_EN = ['Planck', '…', 'Particles', 'Nuclei', 'Molecules, atoms', 'Grains', 'Ground', 'Town, terrain', 'Earth', 'Solar System', 'Stars, galaxies', 'Universe'];
    GV.BANDS.forEach((b, i) => { b.label = BANDS_EN[i]; });
  }
  GV.L_MIN = -35; GV.L_MAX = 27.4;
  // 目盛りの上の位置（0〜1）。何もない区間（10^-19.4〜10^-33.2 m）は 1 けたを 0.12 けた分の幅に縮める（v010: 素粒子の区域が長すぎた）
  const GAP_A = -33.2, GAP_B = -19.4, GAP_K = 0.12;
  const squeeze = L => L <= GAP_A ? L - GV.L_MIN : L <= GAP_B ? (GAP_A - GV.L_MIN) + (L - GAP_A) * GAP_K : (GAP_A - GV.L_MIN) + (GAP_B - GAP_A) * GAP_K + (L - GAP_B);
  GV.rulerX = L => squeeze(Math.max(GV.L_MIN, Math.min(GV.L_MAX, L))) / squeeze(GV.L_MAX);

  const scratch = new Cesium.Cartesian2();
  // いまの画面の横幅（m）
  GV.viewWidth = function () {
    if (GV.stage === 'space') return GV.spaceWidth();
    if (GV.stage === 'micro') return GV.microWidth();
    const v = GV.viewer, cam = v.camera, cv = v.scene.canvas;
    scratch.x = cv.clientWidth / 2; scratch.y = cv.clientHeight / 2;
    const ray = cam.getPickRay(scratch);
    let d;
    const hit = ray && v.scene.globe.pick(ray, v.scene);
    if (hit) d = Cesium.Cartesian3.distance(cam.positionWC, hit);
    else d = Math.max(1, Cesium.Cartesian3.magnitude(cam.positionWC) - 6371000);
    const f = cam.frustum, aspect = cv.clientWidth / Math.max(1, cv.clientHeight);
    const fovx = aspect >= 1 ? f.fov : 2 * Math.atan(Math.tan(f.fov / 2) * aspect);
    return 2 * d * Math.tan(fovx / 2);
  };

  GV.nearestRuler = function (w) {
    let best = GV.RULERS[0], bd = Infinity;
    for (const r of GV.RULERS) {
      const d = Math.abs(Math.log10(w / r[0]));
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };

  // 大きな数を「万・億・兆」で（有効数字 2〜3 けた）
  function jpNum(x) {
    if (LANG === 'en') {                              // English: thousand / million / billion / trillion
      for (const [u, s] of [[1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million']]) if (x >= u) { const v = x / u; return (v >= 100 ? Math.round(v) : +v.toPrecision(2)).toLocaleString('en-US') + s; }
      return (x >= 100 ? Math.round(x) : +x.toPrecision(2)).toLocaleString('en-US');
    }
    const units = [[1e12, '兆'], [1e8, '億'], [1e4, '万']];
    for (const [u, s] of units) if (x >= u) { const v = x / u; return (v >= 100 ? Math.round(v) : +v.toPrecision(2)).toLocaleString('ja-JP') + s; }
    return (x >= 100 ? Math.round(x) : +x.toPrecision(2)).toLocaleString('ja-JP');
  }
  GV.fmtLen = function (m) {
    if (m >= 9.4607e14) return jpNum(m / 9.4607e15) + L(' 光年', ' light-years');    // 0.1 光年より大きければ光年で
    if (m >= 1e8) return jpNum(m / 1000) + ' km';
    if (m >= 1000) {
      const km = m / 1000;
      return (km >= 100 ? Math.round(km).toLocaleString('ja-JP') : km.toPrecision(2)) + ' km';
    }
    if (m >= 1) return (m >= 100 ? Math.round(m) : m.toPrecision(2)) + ' m';
    // 小さな長さ: cm → mm → µm（マイクロメートル）→ nm（ナノ）→ pm（ピコ）→ fm（フェムト）、それより小さければ 10 の何乗
    const U = [[1e-2, 'cm'], [1e-3, 'mm'], [1e-6, 'µm'], [1e-9, 'nm'], [1e-12, 'pm'], [1e-15, 'fm']];
    for (const [u, s] of U) if (m >= u) { const v = m / u; return (v >= 100 ? Math.round(v) : +v.toPrecision(2)) + ' ' + s; }
    const e = Math.floor(Math.log10(m)); return (m / Math.pow(10, e)).toFixed(1) + '×10^' + e + ' m';
  };
})();
