// space.js — 段階F「宇宙へ」。地図（Cesium）より引いたら、Three.js の宇宙に切り替える。
// 画面の幅 W = 10^L m を1つの数 L で持ち、ホイールで L を直接動かす（地球と月 → 太陽系 → 近くの恒星 → 天の川銀河 → 局所銀河群 → 宇宙の大規模構造）。
// 位置はすべて「太陽を原点、赤道座標 J2000（astronomy-engine の EQJ）、メートル」の float64 で持ち、
// 描くときに (位置 − 注目点) / W にしてから Three.js に渡す（60 桁の大きさの差でも精度が落ちないように）。
// ライブラリ（Three.js・astronomy-engine）と星表は、宇宙に出たときに初めて読み込む（地図だけ使うときは軽いまま）。
'use strict';

(function () {
  const GV = window.GV;
  const AU = 1.495978707e11, PC = 3.0856775814913673e16, KPC = PC * 1e3, MPC = PC * 1e6, LY = 9.4607e15;
  const L_ENTER = 7.55;          // これより引いたら宇宙（地球の直径の約3倍）
  const L_MAX = 27.4;            // 観測できる宇宙（直径 約 8.8×10^26 m）の全体が見えるまで
  const LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
    'data/stars.js',
  ];
  const EARTH_TEX = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/jpeg';

  GV.stage = 'earth';
  let libsP = null, built = false;
  let THREE, A, renderer, scene, camera, canvas, labelsEl;
  let L = L_ENTER, Lgoal = L_ENTER, yaw = 0, pitch = 0.3;
  const objs = [];      // { pos: [x,y,z] m (関数でもよい), mesh, radius, Lmin, Lmax, label }
  const clouds = [];    // { group, anchor: [x,y,z] m, unit: m, Lmin, Lmax }
  let sunPos = [0, 0, 0], earthPos = [AU, 0, 0], gc = [0, 0, 0], lgCenter = [0, 0, 0];
  let credit = '';

  function loadLibs() {
    return libsP || (libsP = LIBS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('読み込めません: ' + src)); document.head.appendChild(s);
    })), Promise.resolve()));
  }

  // ---------- 座標の道具 ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const lerp3 = (a, b, f) => add(a, mul(sub(b, a), f));
  const radec = (raDeg, decDeg, r) => {           // 赤経・赤緯（度）→ 赤道座標
    const ra = raDeg * Math.PI / 180, de = decDeg * Math.PI / 180;
    return [r * Math.cos(de) * Math.cos(ra), r * Math.cos(de) * Math.sin(ra), r * Math.sin(de)];
  };
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // 銀河座標の向き（赤道座標の単位ベクトル）: x = 銀河の中心の方向、z = 銀河の北極
  const GX = radec(266.405, -28.936, 1), GZ = radec(192.859, 27.128, 1);
  const GY = [GZ[1] * GX[2] - GZ[2] * GX[1], GZ[2] * GX[0] - GZ[0] * GX[2], GZ[0] * GX[1] - GZ[1] * GX[0]];
  const gal = (x, y, z) => add(add(mul(GX, x), mul(GY, y)), mul(GZ, z));
  const R0 = 8.2 * KPC;                            // 太陽から銀河の中心まで（約 2.7 万光年）

  // ---------- 作る ----------
  function sphere(radius, color, map) {
    const g = new THREE.SphereGeometry(1, 48, 24);
    g.rotateX(Math.PI / 2);                        // 極を z 軸（天の北極）に
    const m = new THREE.MeshStandardMaterial({ color, map: map || null, roughness: 0.9, metalness: 0 });
    return new THREE.Mesh(g, m);
  }
  function dotSprite(color) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const GLOW = {};
  function glow(color, px) {                       // いつも見える大きさの光の点（小さな天体の目印）
    const t = GLOW[color] || (GLOW[color] = dotSprite(color));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, sizeAttenuation: false }));
    s.scale.set(px / 600, px / 600, 1);
    return s;
  }
  function addBody(name, radius, color, posFn, Lmin, Lmax, opts = {}) {
    const mesh = sphere(radius, color, opts.map);
    if (opts.emissive) { mesh.material.emissive = new THREE.Color(color); mesh.material.emissiveIntensity = 1; }
    scene.add(mesh);
    const dot = glow(opts.dot || '#' + new THREE.Color(color).getHexString(), opts.px || 8);
    scene.add(dot);
    const o = { name, radius, mesh, dot, posFn, pos: [0, 0, 0], Lmin, Lmax, label: opts.label !== false, rot: opts.rot };
    objs.push(o);
    return o;
  }
  function pointsCloud(positions, colors, size, anchor, unit, Lmin, Lmax, opts = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, map: opts.map || null, blending: THREE.AdditiveBlending });
    const p = new THREE.Points(g, m);
    const group = new THREE.Group(); group.add(p); scene.add(group);
    const c = { group, anchor, unit, Lmin, Lmax, mat: m, name: opts.name, labelPos: opts.labelPos };
    clouds.push(c);
    return c;
  }

  // 恒星の色（B-V 色指数 → だいたいの色）
  function bvColor(bv) {
    const t = Math.max(-0.4, Math.min(2, bv));
    if (t < 0) return [0.65, 0.75, 1];
    if (t < 0.4) return [0.85 + t * 0.3, 0.9, 1 - t * 0.4];
    if (t < 1.0) return [1, 0.95 - (t - 0.4) * 0.3, 0.8 - (t - 0.4) * 0.6];
    return [1, 0.75 - (t - 1) * 0.25, 0.45 - (t - 1) * 0.25];
  }

  // 渦巻銀河の点（演出）。中心のふくらみ＋棒＋4本の腕＋円盤
  function spiralGalaxy(n, rDisk, arms, pitchDeg, thick, seed) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u / 6 - 0.5; };
    const pos = [], col = [];
    const k = 1 / Math.tan(pitchDeg * Math.PI / 180);
    for (let i = 0; i < n; i++) {
      const r0 = rnd();
      let x, y, z, c;
      if (r0 < 0.18) {                             // 中心のふくらみ（古い黄色い星）
        const r = Math.abs(gauss()) * rDisk * 0.25;
        const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
        x = r * Math.sin(ph) * Math.cos(th) * 1.6; y = r * Math.sin(ph) * Math.sin(th) * 0.7; z = r * Math.cos(ph) * 0.5;
        c = [1, 0.85, 0.6];
      } else if (r0 < 0.75) {                      // 腕（若い青白い星と赤い星雲）
        const arm = Math.floor(rnd() * arms), r = rDisk * (0.15 + Math.pow(rnd(), 0.8) * 0.85);
        const th = arm * 2 * Math.PI / arms + Math.log(r / (rDisk * 0.15)) * k + gauss() * 1.1;   // 腕の幅（v007: 細すぎて線に見えたので広げた）
        const rr = r * (1 + gauss() * 0.25);
        x = rr * Math.cos(th); y = rr * Math.sin(th); z = gauss() * thick;
        c = rnd() < 0.12 ? [1, 0.45, 0.55] : [0.7, 0.8, 1];
      } else {                                     // 円盤（腕の間）
        const r = -Math.log(1 - rnd() * 0.95) * rDisk * 0.33, th = rnd() * Math.PI * 2;
        x = r * Math.cos(th); y = r * Math.sin(th); z = gauss() * thick * 1.5;
        c = [0.9, 0.85, 0.75];
      }
      pos.push(x, y, z); col.push(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6);
    }
    return { pos, col };
  }

  // 不規則な形の銀河（マゼラン雲など。演出）: いくつかの塊の重ね合わせ
  function blobGalaxy(n, r, seed) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u / 6 - 0.5; };
    const centers = [];
    for (let i = 0; i < 6; i++) centers.push([gauss() * r * 1.2, gauss() * r * 0.8, gauss() * r * 0.3, 0.3 + rnd() * 0.5]);
    const pos = [], col = [];
    for (let i = 0; i < n; i++) {
      const c = centers[Math.floor(rnd() * centers.length)];
      pos.push(c[0] + gauss() * r * c[3] * 2, c[1] + gauss() * r * c[3] * 2, c[2] + gauss() * r * 0.15);
      const blue = rnd() < 0.5;
      col.push(blue ? 0.45 : 0.6, blue ? 0.5 : 0.55, blue ? 0.65 : 0.5);
    }
    return { pos, col };
  }

  function build() {
    THREE = window.THREE; A = window.Astronomy;
    canvas = document.getElementById('space');
    labelsEl = document.getElementById('space-labels');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));   // 軽量化: 高精細の画面でも 1.5 倍まで
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 1e-7, 1e7);
    scene.add(new THREE.AmbientLight(0x333344, 1));
    const sunLight = new THREE.PointLight(0xffffff, 1.4, 0, 0);
    scene.add(sunLight);
    GV._sunLight = sunLight;

    // 太陽・惑星・月・地球（大きさは本当の半径。小さすぎて見えないときは光の点で目印）
    const tex = new THREE.TextureLoader();
    tex.setCrossOrigin('anonymous');
    const earthMap = tex.load(EARTH_TEX);
    addBody('太陽', 6.957e8, 0xffe9a8, () => sunPos, 7.5, 18.5, { emissive: true, dot: '#ffdd88', px: 16 });
    const P = [['水星', 'Mercury', 2.4397e6, 0xb5aea5], ['金星', 'Venus', 6.0518e6, 0xf0dcae], ['火星', 'Mars', 3.3895e6, 0xd2694a],
      ['木星', 'Jupiter', 6.9911e7, 0xd9b38c], ['土星', 'Saturn', 5.8232e7, 0xe8d4a2], ['天王星', 'Uranus', 2.5362e7, 0xa8e0e6], ['海王星', 'Neptune', 2.4622e7, 0x5b7fe0]];
    for (const [ja, en, r, c] of P) addBody(ja, r, c, () => helio(en), 7.5, 14.6, { px: 6 });
    GV._earthObj = addBody('地球', 6.371e6, 0xffffff, () => earthPos, 7.0, 14.6, { map: earthMap, dot: '#7fb3ff', px: 7, rot: true });
    addBody('月', 1.7374e6, 0xbdbdbd, () => moonPos, 7.0, 10.5, { px: 4 });
    // 惑星の軌道（1 周分）
    orbitLines(P.map(p => p[1]).concat(['Earth']));
    // 恒星（HYG、パーセク）
    const sp = [], sc = [];
    for (const s of GV.STARS) {
      sp.push(s[0], s[1], s[2]);
      const b = Math.max(0.15, Math.min(1, Math.pow(10, -0.4 * (s[3] - 1.5))));
      const c = bvColor(s[4]);
      sc.push(c[0] * b, c[1] * b, c[2] * b);
    }
    const starTex = dotSprite('#ffffff');
    pointsCloud(sp, sc, 4, [0, 0, 0], PC, 13.0, 21.5, { map: starTex, name: 'stars' });
    // 天の川銀河（演出: 観測にもとづく形 — 半径 約5万光年、4本の腕、棒）
    const mw = spiralGalaxy(60000, 15, 4, 13, 0.3, 7);   // 単位 kpc
    gc = add(sunPos, gal(R0, 0, 0));
    // 銀河座標（kpc）→ 赤道座標の向きに回してから置く
    const mwPos = [];
    for (let i = 0; i < mw.pos.length; i += 3) { const v = gal(mw.pos[i], mw.pos[i + 1], mw.pos[i + 2]); mwPos.push(v[0], v[1], v[2]); }
    pointsCloud(mwPos, mw.col, 2, gc, KPC, 18.3, 24.8, { map: starTex, name: '天の川銀河', labelPos: gc });
    // 局所銀河群の主な銀河（位置は観測値、形は演出）
    const groupGal = [['アンドロメダ銀河', 10.6847, 41.2690, 765, 23, 1, 3], ['さんかく座銀河', 23.4621, 30.6599, 840, 9, 2, 5], ['大マゼラン雲', 80.894, -69.756, 50, 5, 1, 9], ['小マゼラン雲', 13.187, -72.829, 62, 3, 1, 11]];
    lgCenter = add(sunPos, mul(radec(10.6847, 41.2690, 1), 0.4 * 765 * KPC));
    for (const [name, ra, dec, dkpc, rk, kind, seed] of groupGal) {
      const c = add(sunPos, radec(ra, dec, dkpc * KPC));
      let g;
      if (kind === 9 || kind === 11 || seed >= 9) g = blobGalaxy(5000, rk, seed);          // マゼラン雲は不規則な形
      else g = spiralGalaxy(12000, rk, 2, 15, rk * 0.03, seed);
      // 少し傾ける（見た目のため）
      const pp = [];
      for (let i = 0; i < g.pos.length; i += 3) { const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2]; pp.push(x, y * 0.6 + z * 0.8, -y * 0.8 + z * 0.6); }
      // マゼラン雲は天の川のすぐそばなので、近くを見ているときだけ名前を出す
      const Lmax = seed >= 9 ? 22.6 : 25.2;
      pointsCloud(pp, g.col, 2, c, KPC, 20.5, Lmax, { map: starTex, name, labelPos: c });
    }
    // 宇宙の大規模構造（演出: 銀河の集まりが網の目のようにつながる。おとめ座銀河団の方向は観測値）
    cosmicWeb(starTex);
    // 観測できる宇宙の果て（宇宙背景放射、半径 約 465 億光年）
    // 外から見たときだけ見える（表の面だけ描く）うすい光の球。内側からは見えない（v007: 網の線にしたら内側から線だらけになった）
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ color: 0xff8a5c, transparent: true, opacity: 0.18, side: THREE.FrontSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(shell);
    objs.push({ name: '観測できる宇宙の果て', radius: 4.4e26, mesh: shell, dot: null, posFn: () => sunPos, pos: [0, 0, 0], Lmin: 26.55, Lmax: 30, label: true, fixedSize: true, maxOpacity: 0.18 });
    built = true;
  }

  function cosmicWeb(tex) {
    let s = 3;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const nodes = [];
    for (let i = 0; i < 260; i++) nodes.push([(rnd() - 0.5) * 900, (rnd() - 0.5) * 900, (rnd() - 0.5) * 900]);   // Mpc
    nodes.push(radec(187.7, 12.4, 16.5));                                                                         // おとめ座銀河団
    const pos = [], col = [];
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    for (const a of nodes) {
      // 銀河団（節）
      for (let k = 0; k < 60; k++) { pos.push(a[0] + (rnd() - 0.5) * 8, a[1] + (rnd() - 0.5) * 8, a[2] + (rnd() - 0.5) * 8); col.push(0.9, 0.75, 0.55); }
      // 近い節どうしを糸（フィラメント）でつなぐ
      const near = nodes.filter(b => b !== a).sort((p, q) => d2(a, p) - d2(a, q)).slice(0, 3);
      for (const b of near) for (let k = 0; k < 40; k++) {
        const f = rnd();
        pos.push(a[0] + (b[0] - a[0]) * f + (rnd() - 0.5) * 6, a[1] + (b[1] - a[1]) * f + (rnd() - 0.5) * 6, a[2] + (b[2] - a[2]) * f + (rnd() - 0.5) * 6);
        col.push(0.45, 0.5, 0.75);
      }
    }
    pointsCloud(pos, col, 2, sunPos, MPC, 23.3, 27.5, { map: tex, name: '宇宙の大規模構造' });
  }

  // 惑星の位置（太陽から、m）。時刻は地図と同じ Cesium の時計
  let date = new Date(), moonPos = [0, 0, 0];
  function helio(body) { const v = A.HelioVector(A.Body[body], date); return [v.x * AU, v.y * AU, v.z * AU]; }
  function updateEphemeris() {
    date = Cesium.JulianDate.toDate(GV.viewer.clock.currentTime);
    earthPos = helio('Earth');
    const m = A.GeoMoon(date);
    moonPos = add(earthPos, [m.x * AU, m.y * AU, m.z * AU]);
    for (const o of objs) o.pos = o.posFn();
  }
  const orbits = [];
  function orbitLines(bodies) {
    const period = { Mercury: 88, Venus: 225, Earth: 365.25, Mars: 687, Jupiter: 4333, Saturn: 10759, Uranus: 30687, Neptune: 60190 };
    const t0 = new Date();
    for (const b of bodies) {
      const pts = [];
      for (let i = 0; i <= 180; i++) {
        const d = new Date(t0.getTime() + period[b] * 86400000 * i / 180);
        const v = A.HelioVector(A.Body[b], d);
        pts.push(v.x, v.y, v.z);                  // AU
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: b === 'Earth' ? 0x6cc3ff : 0x8890a0, transparent: true, opacity: 0.45 }));
      const group = new THREE.Group(); group.add(line); scene.add(group);
      clouds.push({ group, anchor: sunPos, unit: AU, Lmin: 9.3, Lmax: 15.2, mat: line.material, isLine: true });
    }
  }

  // ---------- 注目点（L によって地球 → 太陽 → 銀河の中心 → 局所銀河群） ----------
  function focus() {
    let f = lerp3(earthPos, sunPos, smooth(9.2, 10.6, L));
    f = lerp3(f, gc, smooth(18.6, 20.6, L));
    f = lerp3(f, lgCenter, smooth(22.4, 23.6, L));
    return f;
  }

  // ---------- 描く ----------
  const tmpV = { x: 0, y: 0, z: 0 };
  function render() {
    if (GV.stage !== 'space' || !built) return;
    L += (Lgoal - L) * 0.18;
    GV.viewer.clock.tick();                          // 地図の描画を止めているので、時計はここで進める
    updateEphemeris();
    const W = Math.pow(10, L);
    const f = focus();
    // カメラ: 注目点のまわりを yaw・pitch で回る。距離は画面の幅 W が見える距離（単位は W = 1）
    const dist = 0.5 / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect);   // 横幅がちょうど W（= 1）に見える距離
    camera.position.set(dist * Math.cos(pitch) * Math.cos(yaw), dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch));
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    const vis = (Lmin, Lmax) => smooth(Lmin - 0.4, Lmin + 0.4, L) * (1 - smooth(Lmax - 0.4, Lmax + 0.4, L));
    for (const o of objs) {
      const v = vis(o.Lmin, o.Lmax), rel = mul(sub(o.pos, f), 1 / W);
      o.mesh.visible = v > 0.01;
      o.mesh.position.set(rel[0], rel[1], rel[2]);
      const sc = o.radius / W;
      o.mesh.scale.set(sc, sc, sc);
      if (o.fixedSize) o.mesh.material.opacity = v * (o.maxOpacity || 1);
      else if (o.mesh.material.opacity !== undefined) { o.mesh.material.transparent = v < 1; o.mesh.material.opacity = v; }
      if (o.rot) o.mesh.rotation.z = A.SiderealTime(date) / 24 * 2 * Math.PI;   // 地球の自転（グリニッジ恒星時）
      if (o.dot) {
        o.dot.visible = v > 0.01 && sc < 0.004;    // 小さくて見えないときだけ光の点
        o.dot.position.copy(o.mesh.position);
        o.dot.material.opacity = v;
      }
      if (o.name === '太陽') GV._sunLight.position.copy(o.mesh.position);
    }
    for (const c of clouds) {
      const v = vis(c.Lmin, c.Lmax), rel = mul(sub(c.anchor, f), 1 / W), sc = c.unit / W;
      c.group.visible = v > 0.01;
      c.group.position.set(rel[0], rel[1], rel[2]);
      c.group.scale.set(sc, sc, sc);
      c.mat.opacity = v * (c.isLine ? 0.45 : 1);
    }
    renderer.render(scene, camera);
    drawLabels(f, W, vis);
    if (GV.onSpace) GV.onSpace(W);
  }

  // 名前のラベル（HTML）
  function drawLabels(f, W, vis) {
    const items = [];
    const put = (name, pos, v) => {
      if (v < 0.3) return;
      const rel = mul(sub(pos, f), 1 / W), p = new THREE.Vector3(rel[0], rel[1], rel[2]).project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
      items.push({ name, x: (p.x + 1) / 2 * canvas.clientWidth, y: (1 - p.y) / 2 * canvas.clientHeight, v });
    };
    for (const o of objs) if (o.label) put(o.name, o.pos, vis(o.Lmin, o.Lmax));
    for (const c of clouds) if (c.name && c.labelPos) put(c.name, c.labelPos, vis(c.Lmin, c.Lmax));
    // 恒星の名前（明るい順に、近くを見ているときだけ）
    const sv = vis(13.0, 18.5);
    if (sv > 0.3) {
      const named = GV._namedStars || (GV._namedStars = GV.STARS.filter(s => s[5]).sort((a, b) => a[3] - b[3]).slice(0, 40));
      for (const s of named) put(STAR_JA[s[5]] || s[5], [s[0] * PC, s[1] * PC, s[2] * PC], sv);
    }
    // 重なるラベルは、先に出したもの（大きな天体・明るい星が先）を残して省く
    const shown = [];
    for (const i of items) if (!shown.some(j => Math.abs(j.x - i.x) < 70 && Math.abs(j.y - i.y) < 14)) shown.push(i);
    items.length = 0; items.push(...shown);
    labelsEl.innerHTML = items.map(i => `<div style="left:${i.x.toFixed(0)}px;top:${i.y.toFixed(0)}px;opacity:${i.v.toFixed(2)}">${i.name}</div>`).join('');
  }
  const STAR_JA = { Sirius: 'シリウス', Canopus: 'カノープス', Arcturus: 'アークトゥルス', Vega: 'ベガ（織姫）', Capella: 'カペラ', Rigel: 'リゲル', Procyon: 'プロキオン', Betelgeuse: 'ベテルギウス', Achernar: 'アケルナル', Altair: 'アルタイル（彦星）', Aldebaran: 'アルデバラン', Antares: 'アンタレス', Spica: 'スピカ', Pollux: 'ポルックス', Fomalhaut: 'フォーマルハウト', Deneb: 'デネブ', Regulus: 'レグルス', Polaris: '北極星', 'Rigil Kentaurus': 'ケンタウルス座α星', Proxima: 'プロキシマ・ケンタウリ（いちばん近い星）', "Barnard's Star": 'バーナード星', Castor: 'カストル', Mira: 'ミラ' };

  // ---------- 出入り ----------
  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  let raf = 0;
  function loop() { raf = requestAnimationFrame(loop); render(); }

  GV.enterSpace = async function (Lstart) {
    if (GV.stage === 'space') return;
    const hint = document.getElementById('space-hint'), hintText = GV._hintText || (GV._hintText = hint.textContent);
    GV.onSpace && GV.onSpace(null, '宇宙を読み込んでいます…');
    try { await loadLibs(); } catch (e) {
      GV.err && GV.err(e); hint.textContent = '宇宙を読み込めませんでした（通信）';
      setTimeout(() => { document.body.classList.remove('in-space'); hint.textContent = hintText; }, 2500);
      return;
    }
    hint.textContent = hintText;
    if (!built) build();
    // 地図で見ていた向きのまま宇宙へ: カメラの地球に対する向き（地球固定）→ 恒星時で回して赤道座標に
    const cp = GV.viewer.camera.positionWC, r = Math.hypot(cp.x, cp.y, cp.z);
    const gst = A.SiderealTime(Cesium.JulianDate.toDate(GV.viewer.clock.currentTime)) / 24 * 2 * Math.PI;
    const ex = cp.x / r, ey = cp.y / r, ez = cp.z / r;
    const qx = ex * Math.cos(gst) - ey * Math.sin(gst), qy = ex * Math.sin(gst) + ey * Math.cos(gst);
    yaw = Math.atan2(qy, qx); pitch = Math.asin(Math.max(-1, Math.min(1, ez)));
    L = Lgoal = Lstart || L_ENTER + 0.05;
    GV.stage = 'space';
    document.body.classList.add('in-space');
    resize();
    if (!raf) loop();
    GV.viewer.useDefaultRenderLoop = false;          // 地図の描画を止める（軽量化）
  };
  GV.exitSpace = function () {
    if (GV.stage !== 'space') return;
    GV.stage = 'earth';
    document.body.classList.remove('in-space');
    cancelAnimationFrame(raf); raf = 0;
    labelsEl.innerHTML = '';
    GV.viewer.useDefaultRenderLoop = true;
    // 宇宙で見ていた向きから地球を見る位置へ
    const gst = A.SiderealTime(Cesium.JulianDate.toDate(GV.viewer.clock.currentTime)) / 24 * 2 * Math.PI;
    const qx = Math.cos(pitch) * Math.cos(yaw), qy = Math.cos(pitch) * Math.sin(yaw), qz = Math.sin(pitch);
    const ex = qx * Math.cos(-gst) - qy * Math.sin(-gst), ey = qx * Math.sin(-gst) + qy * Math.cos(-gst);
    const lon = Math.atan2(ey, ex) * 180 / Math.PI, lat = Math.asin(qz) * 180 / Math.PI;
    GV.viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 2.6e7) });
    GV.viewer.scene.requestRender();
    GV.updateScale && GV.updateScale();
  };
  GV.spaceWidth = () => Math.pow(10, L);
  GV.spaceGoto = function (Lt) { if (GV.stage === 'space') Lgoal = Math.max(L_ENTER - 0.2, Math.min(L_MAX, Lt)); };

  // ---------- 操作（宇宙にいるとき） ----------
  GV.initSpace = function () {
    const sp = document.getElementById('space');
    sp.addEventListener('wheel', e => {
      e.preventDefault();
      Lgoal = Math.min(L_MAX, Lgoal + Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0016));
      if (Lgoal < L_ENTER - 0.1) GV.exitSpace();   // 地球まで寄ったら地図に戻る
    }, { passive: false });
    let drag = null, pinch = null;
    sp.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; sp.setPointerCapture(e.pointerId); });
    sp.addEventListener('pointermove', e => {
      if (!drag || pinch) return;
      yaw -= (e.clientX - drag.x) * 0.005; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - drag.y) * 0.005));
      drag = { x: e.clientX, y: e.clientY };
    });
    sp.addEventListener('pointerup', () => { drag = null; });
    sp.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    sp.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !pinch) return;
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      Lgoal = Math.min(L_MAX, Lgoal - Math.log10(d / pinch));
      pinch = d;
      if (Lgoal < L_ENTER - 0.1) GV.exitSpace();
    }, { passive: true });
    sp.addEventListener('touchend', () => { pinch = null; });
    window.addEventListener('resize', resize);
    // 地図をいちばん引いた所からさらにホイールで引くと宇宙へ
    const g = document.getElementById('globe');
    g.addEventListener('wheel', e => {
      if (GV.stage !== 'earth' || e.deltaY <= 0) return;
      if (GV.viewer.camera.positionCartographic.height > 3.3e7) GV.enterSpace();
    }, { passive: true });
    g.addEventListener('touchmove', () => {
      if (GV.stage === 'earth' && GV.viewer.camera.positionCartographic.height > 3.6e7) GV.enterSpace();
    }, { passive: true });
  };
})();
