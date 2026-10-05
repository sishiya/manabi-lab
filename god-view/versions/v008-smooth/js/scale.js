// scale.js — スケール値 L（画面の幅が 10^L m）と、身近なものさし、宇宙〜素粒子の目盛り。
// いまは地球のステージだけ。宇宙（段階F）とミクロ（段階G）はここにステージを足していく。
'use strict';

(function () {
  const GV = window.GV;

  // 画面の幅（m）に近い身近なもの
  GV.RULERS = [
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
    { from: -35, to: -15, label: '素粒子', ready: false },
    { from: -15, to: -10, label: '原子核', ready: false },
    { from: -10, to: -5, label: '分子・原子', ready: false },
    { from: -5, to: -1, label: '細胞', ready: false },
    { from: -1, to: 1, label: '人', ready: false },
    { from: 1, to: 5, label: '街・地形', ready: true },
    { from: 5, to: 8, label: '地球', ready: true },
    { from: 8, to: 13, label: '太陽系', ready: true },
    { from: 13, to: 21, label: '恒星・銀河', ready: true },
    { from: 21, to: 27.4, label: '宇宙', ready: true },
  ];
  GV.L_MIN = -35; GV.L_MAX = 27.4;

  const scratch = new Cesium.Cartesian2();
  // いまの画面の横幅（m）
  GV.viewWidth = function () {
    if (GV.stage === 'space') return GV.spaceWidth();
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
    const units = [[1e12, '兆'], [1e8, '億'], [1e4, '万']];
    for (const [u, s] of units) if (x >= u) { const v = x / u; return (v >= 100 ? Math.round(v) : +v.toPrecision(2)).toLocaleString('ja-JP') + s; }
    return (x >= 100 ? Math.round(x) : +x.toPrecision(2)).toLocaleString('ja-JP');
  }
  GV.fmtLen = function (m) {
    if (m >= 9.4607e14) return jpNum(m / 9.4607e15) + ' 光年';    // 0.1 光年より大きければ光年で
    if (m >= 1e8) return jpNum(m / 1000) + ' km';
    if (m >= 1000) {
      const km = m / 1000;
      return (km >= 100 ? Math.round(km).toLocaleString('ja-JP') : km.toPrecision(2)) + ' km';
    }
    if (m >= 1) return (m >= 100 ? Math.round(m) : m.toPrecision(2)) + ' m';
    return (m * 100).toPrecision(2) + ' cm';
  };
})();
