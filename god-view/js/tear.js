// tear.js — 段階H「地球をちぎる」の画面。宇宙の場面の「✋ 地球をちぎる」から入る。
// 計算は tear-worker.js（裏の Worker）で、ここは粒を描くことと操作だけ。Three.js は宇宙で読み込んだものを使う。
// 座標: 計算は m、描くときは 1 = 1000 km。z が北極、x が経度 0 の向き（宇宙の地球と同じ）。
'use strict';

(function () {
  const GV = window.GV;
  const U = 1e6;                       // 描くときの 1 = 1000 km
  const EARTH_TEX = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1024&HEIGHT=512&FORMAT=image/jpeg';
  let THREE, renderer, scene, camera, canvas, points, geo, mat, worker = null;
  let built = false, ready = false, raf = 0;
  let st = null, frame = null, stat0 = null;
  let yaw = 2.4, pitch = 0.6, dist = 26;            // カメラ（はじめは日本の上）
  const opt = { Rg: 2e6, after: 'away', view: 'look', cut: false, run: true, speed: 60 };
  let grab = null, torn = false, exposed = null, holeU = null, lastFrameT = 0, photo = null;
  const $ = id => document.getElementById(id);

  // ---------- 色 ----------
  // 熱で光る色（黒体の色の近似。約 800 K から赤く光りはじめる）
  function glowColor(T) {
    const t = T / 100;
    let r, g, b;
    r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
    g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -0.0755);
    b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305.0;
    const k = Math.max(0, Math.min(1, (T - 750) / 1100));      // 明るさ: 750 K で 0、1850 K でいっぱい
    const c = x => Math.max(0, Math.min(255, x)) / 255 * k;
    return [c(r), c(g), c(b)];
  }
  // 温度の色の目盛り（「温度」の見え方）
  const TSCALE = [[300, [0.15, 0.25, 0.6]], [1000, [0.35, 0.2, 0.55]], [1600, [0.8, 0.2, 0.15]], [2500, [1, 0.5, 0.1]], [4000, [1, 0.85, 0.3]], [5500, [1, 1, 0.9]]];
  function tempColor(T) {
    if (T <= TSCALE[0][0]) return TSCALE[0][1];
    for (let k = 1; k < TSCALE.length; k++) if (T <= TSCALE[k][0]) {
      const a = TSCALE[k - 1], b = TSCALE[k], f = (T - a[0]) / (b[0] - a[0]);
      return [0, 1, 2].map(d => a[1][d] + (b[1][d] - a[1][d]) * f);
    }
    return TSCALE[TSCALE.length - 1][1];
  }
  const LAYER = [[0.72, 0.38, 0.22], [0.95, 0.62, 0.2], [1, 0.93, 0.7]];   // マントル・外核・内核
  function photoColor(lat, lon) {
    if (!photo) return [0.1, 0.25, 0.55];
    const x = Math.max(0, Math.min(photo.w - 1, Math.floor((lon + 180) / 360 * photo.w)));
    const y = Math.max(0, Math.min(photo.h - 1, Math.floor((90 - lat) / 180 * photo.h)));
    const k = 4 * (y * photo.w + x);
    return [photo.d[k] / 255, photo.d[k + 1] / 255, photo.d[k + 2] / 255];
  }
  function loadPhoto() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 512, 256);
      try { photo = { w: 512, h: 256, d: x.getImageData(0, 0, 512, 256).data }; } catch (e) { photo = null; }
      if (frame) paint();
      sendWater();
    };
    img.src = EARTH_TEX;
  }

  // ---------- 作る ----------
  const VS = `
    attribute vec3 acol; attribute float asize; attribute vec2 aux;
    uniform float pscale; uniform vec3 cutN; uniform vec3 cutO; uniform float cutOn;
    varying vec3 vCol; varying float vGlow;
    void main() {
      vCol = acol; vGlow = aux.x;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = asize * pscale / max(0.001, -mv.z);
      if (cutOn > 0.5 && aux.y > 0.5 && dot(position - cutO, cutN) > 0.0) gl_PointSize = 0.0;   // 断面: 手前の半分を消す
    }`;
  const FS = `
    uniform vec3 lightV;
    varying vec3 vCol; varying float vGlow;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0; p.y = -p.y;
      float r2 = dot(p, p);
      if (r2 > 1.0) discard;
      vec3 n = vec3(p, sqrt(1.0 - r2));
      float lit = max(dot(n, lightV), 0.0) * 0.9 + 0.18;
      float self = 0.72 + 0.28 * n.z;                 // 光っている粒は自分の光（形だけ少し丸く）
      gl_FragColor = vec4(vCol * mix(lit, self, vGlow), 1.0);
    }`;

  function build() {
    THREE = window.THREE;
    canvas = $('tear');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    // 星（背景の飾り）
    const sp = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1500; i++) {
      const u = rnd() * 2 - 1, th = rnd() * 2 * Math.PI, r = 400;
      sp.push(r * Math.sqrt(1 - u * u) * Math.cos(th), r * Math.sqrt(1 - u * u) * Math.sin(th), r * u);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x8090a8, size: 1.2, sizeAttenuation: false })));
    built = true;
    resize();
  }

  function makePoints(n) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('acol', new THREE.BufferAttribute(new Float32Array(3 * n), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('asize', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(2 * n), 2).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { pscale: { value: 1 }, cutN: { value: new THREE.Vector3(1, 0, 0) }, cutO: { value: new THREE.Vector3() }, cutOn: { value: 0 }, lightV: { value: new THREE.Vector3(-0.4, 0.5, 0.77).normalize() } },
    });
    points = new THREE.Points(geo, mat);
    scene.add(points);
  }

  // ---------- 水と湯気（v012） ----------
  // 水の粒: 岩と同じ丸い粒（小さめ）。湯気・水蒸気: ふちがぼやけた半透明の点
  const PUFF_FS = `
    varying vec3 vCol; varying float vGlow;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float r2 = dot(p, p);
      if (r2 > 1.0) discard;
      float a = (1.0 - r2) * (1.0 - r2) * vGlow;
      gl_FragColor = vec4(vCol, a);
    }`;
  let wgeo = null, pgeo = null;
  function attrs(g, n) {
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('acol', new THREE.BufferAttribute(new Float32Array(3 * n), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('asize', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(2 * n), 2).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  }
  function makeWater(nw) {
    wgeo = new THREE.BufferGeometry(); attrs(wgeo, nw);
    const wm = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: mat.uniforms });   // 断面・光は岩と同じ
    scene.add(new THREE.Points(wgeo, wm));
    pgeo = new THREE.BufferGeometry(); attrs(pgeo, 2500);
    const pm = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: PUFF_FS, uniforms: mat.uniforms, transparent: true, depthWrite: false });
    const pp = new THREE.Points(pgeo, pm); pp.renderOrder = 2;
    scene.add(pp);
  }
  function paintWater(F) {
    const Wd = F.water;
    if (!Wd) return;
    const nw = Wd.ph.length;
    if (!wgeo) makeWater(nw);
    const pos = wgeo.attributes.position.array, col = wgeo.attributes.acol.array, sz = wgeo.attributes.asize.array, aux = wgeo.attributes.aux.array;
    const show = opt.view === 'look' || opt.view === 'layer';
    for (let i = 0; i < nw; i++) {
      pos[3 * i] = Wd.x[3 * i] / U; pos[3 * i + 1] = Wd.x[3 * i + 1] / U; pos[3 * i + 2] = Wd.x[3 * i + 2] / U;
      let c, g = 0;
      // 動いていない海は小さく暗めに（海の色の岩の粒と見分けがつく程度）。動き出した水・沸騰・凍った水は大きく明るく
      const big = Wd.mv[i] || Wd.hot[i] || Wd.ph[i] === 2;
      if (Wd.ph[i] === 2) c = [0.88, 0.94, 1];                 // 凍った（宇宙で）
      else if (Wd.hot[i]) { c = [0.85, 0.93, 1]; g = 1; }      // 熱い岩の上で沸騰している
      else if (big) c = [0.3, 0.62, 1];
      else c = [0.12, 0.3, 0.62];
      col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
      sz[i] = show ? (big ? 0.36 : 0.2) : 0;
      aux[2 * i] = g; aux[2 * i + 1] = Wd.body[i] ? 0 : 1;
    }
    wgeo.setDrawRange(0, nw);
    // 湯気（地球）・水蒸気（かけら）。地球の湯気の高さは 5 倍に強調（本当は数十 km で、岩の粒に隠れてしまうため）
    const np = Wd.pk.length, ppos = pgeo.attributes.position.array, pcol = pgeo.attributes.acol.array, psz = pgeo.attributes.asize.array, paux = pgeo.attributes.aux.array;
    const com = F.stats.com, rS = F.stats.rSurf || 6.4e6;
    for (let k = 0; k < np; k++) {
      let x = Wd.px[3 * k], y = Wd.px[3 * k + 1], z = Wd.px[3 * k + 2];
      const age = Wd.pa[k];
      if (Wd.pk[k] === 1) {
        const dx = x - com[0], dy = y - com[1], dz = z - com[2], r = Math.hypot(dx, dy, dz);
        if (r > rS) { const f = (rS + (r - rS) * 5) / r; x = com[0] + dx * f; y = com[1] + dy * f; z = com[2] + dz * f; }
        pcol[3 * k] = 0.96; pcol[3 * k + 1] = 0.97; pcol[3 * k + 2] = 1;
        psz[k] = show ? 0.5 + 1.1 * Math.sqrt(age) : 0;
        paux[2 * k] = 0.55 * Math.min(1, age * 20) * (1 - age); paux[2 * k + 1] = 1;
      } else {
        pcol[3 * k] = 0.8; pcol[3 * k + 1] = 0.88; pcol[3 * k + 2] = 1;
        psz[k] = show ? 0.22 : 0;
        paux[2 * k] = 0.7 * (1 - age); paux[2 * k + 1] = 0;
      }
      ppos[3 * k] = x / U; ppos[3 * k + 1] = y / U; ppos[3 * k + 2] = z / U;
    }
    pgeo.setDrawRange(0, np);
    for (const g of [wgeo, pgeo]) for (const a of ['position', 'acol', 'asize', 'aux']) g.attributes[a].needsUpdate = true;
  }

  // 海の場所: 地球の写真で青い所（海の色）。球の上にほぼ等間隔の 7000 点をとって、海の点だけ残す
  function oceanDirs() {
    if (!photo) return null;
    const N = 7000, out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), th = ga * i;
      const x = r * Math.cos(th), y = r * Math.sin(th);
      const lat = Math.asin(z) * 180 / Math.PI, lon = Math.atan2(y, x) * 180 / Math.PI;
      const c = photoColor(lat, lon);
      if (c[2] > c[0] + 0.1 && c[2] >= c[1]) out.push(x, y, z);
    }
    return new Float64Array(out);
  }
  let waterSent = false;
  function sendWater() {
    if (waterSent || !worker || !photo) return;
    const d = oceanDirs();
    if (d && d.length) { worker.postMessage({ cmd: 'water', dirs: d }); waterSent = true; }
  }

  // ---------- 計算から届いた 1 こま を描く形に ----------
  function paint() {
    const n = st.n, F = frame, pos = geo.attributes.position.array, col = geo.attributes.acol.array, sz = geo.attributes.asize.array, aux = geo.attributes.aux.array;
    const now = F.stats.t, dts = Math.max(0, now - lastFrameT); lastFrameT = now;
    // 「割れた」「表に出た」は計算の側で判定: 地表の粒は 1 個 400 km の厚さだが、本当の地殻は 7〜35 km しかないので、割れて動いた粒は中の熱い岩として描く
    const broken = F.brk;
    for (let i = 0; i < n; i++) {
      pos[3 * i] = F.pos[3 * i] / U; pos[3 * i + 1] = F.pos[3 * i + 1] / U; pos[3 * i + 2] = F.pos[3 * i + 2] / U;
      const T = F.temp[i], surf = st.surf[i] && !broken[i], m = st.mat[i];
      sz[i] = (st.surf[i] ? 1.5 : 1.25) * F.size[i] / U;
      // 表に出た中身（表面の目印 sh が小さい = まわりの片側に粒がない）。出ていた時間で表面が冷えて黒い皮になる（推定）
      // 中の粒は約 0.97、表に出た粒は 0.5〜0.9（はじめから表面のすぐ下にある粒も低めなので、はじめより下がったときだけ）。割れて動いた地表の粒も表に出ている
      const open = !!F.hotS[i];
      exposed[i] = open ? exposed[i] + dts : Math.max(0, exposed[i] - dts * 3);
      let c, g = 0;
      if (opt.view === 'look') {
        if (surf) c = photoColor(st.lat[i], st.lon[i]);
        else if (open || opt.cut) {
          c = glowColor(T); g = 1;
          if (open) { const skin = Math.exp(-exposed[i] / 1800); c = c.map(v => v * (0.25 + 0.75 * skin) + 0.04 * (1 - skin)); }
        } else c = [0.16, 0.12, 0.1];                          // 表の粒のすき間から見える所は、光らせない（ひびに見えるため）
      } else if (opt.view === 'temp') { c = tempColor(T); g = 1; }
      else if (opt.view === 'layer') { c = surf ? photoColor(st.lat[i], st.lon[i]) : LAYER[m]; }
      else {                                                   // 溶け
        const f = F.melt[i];
        if (m === 1) c = [0.25, 0.45, 0.75];
        else if (f > 0.001) { const k = Math.min(1, 0.35 + f * 3); c = [1 * k, 0.55 * k, 0.1 * k]; g = 1; }
        else c = surf ? [0.42, 0.42, 0.45] : [0.3, 0.3, 0.33];
      }
      col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
      aux[2 * i] = g; aux[2 * i + 1] = F.grp[i] ? 0 : 1;
    }
    geo.attributes.position.needsUpdate = geo.attributes.acol.needsUpdate = geo.attributes.asize.needsUpdate = geo.attributes.aux.needsUpdate = true;
    paintWater(F);
    showInfo(F.stats);
  }

  // ---------- 表示（数と説明） ----------
  function fmtT(sec) {
    if (sec < 60) return Math.round(sec) + ' 秒';
    const m = Math.floor(sec / 60), h = Math.floor(m / 60);
    return h ? `${h} 時間 ${m % 60} 分` : `${m} 分 ${Math.floor(sec % 60)} 秒`;
  }
  // 水の量: km³（1 km³ の水 = 10^12 kg）と、海全体のうちの割合
  function vol(kg, ocean) {
    const km3 = kg / 1e12, pct = 100 * kg / ocean;
    const v = km3 >= 1e8 ? `${(km3 / 1e8).toFixed(2)} 億 km³` : km3 >= 1e4 ? `${(km3 / 1e4).toFixed(km3 >= 1e5 ? 0 : 1)} 万 km³` : `${Math.round(km3).toLocaleString('ja-JP')} km³`;
    const p = pct === 0 ? '0' : pct >= 0.1 ? pct.toFixed(1) : String(Number(pct.toPrecision(1)));
    return `${v}（海の ${p}%）`;
  }
  function showInfo(s) {
    const box = $('tear-info');
    let msg;
    if (!grab && !torn) msg = '地球を<b>指でつまんで、外へ引っぱって</b>ください。';
    else if (!torn) msg = '引っぱっています…';
    else if (s.depth > opt.Rg * 0.5) msg = '穴の壁と底が内側へ<b>くずれ込んで</b>います。マントルは固い岩ですが、この大きさでは重力が岩の強さよりずっと強く、水あめのように動きます。';
    else if (s.depth > opt.Rg * 0.12) msg = '穴が<b>埋まっていきます</b>。深い所の岩は圧力が抜けて一部が溶けます（左の「溶け」で見られます）。';
    else msg = '穴は<b>ほとんど埋まり</b>、地球はまた丸に戻っていきます。くずれ込んだ所は、落ちた分のエネルギーで熱くなっています。';
    const rows = [];
    if (torn) {
      rows.push(['ちぎってから', fmtT(s.tTear)]);
      rows.push(['穴の深さ', `${Math.round(s.depth / 1e3).toLocaleString('ja-JP')} km`]);
      rows.push(['いちばん速い流れ', `秒速 ${(s.vmax / 1e3).toFixed(1)} km`]);
      rows.push(['一部溶けた岩', `マントルの ${s.meltPct.toFixed(1)}%（ちぎる前 ${s.melt0Pct.toFixed(1)}%）`]);
      rows.push(['いちばん熱くなった所', `+${Math.round(s.heat).toLocaleString('ja-JP')}℃`]);
      if (s.oceanKg) {
        rows.push(['穴に流れこんだ海の水', vol(s.holeKg, s.oceanKg)]);
        rows.push(['湯気になった水', vol(s.steamKg, s.oceanKg)]);
      }
    }
    const water = torn && s.oceanKg ? '<div class="tw">海の水は<b>霧散しません</b>。穴へ流れこみ、熱い岩に触れた所で沸騰して<b>湯気の雲</b>に（湯気も地球の重力から逃げられず、やがて雨に）。かけらの上の水は、宇宙で表面が沸きながら<b>凍り</b>ます。</div>' : '';
    box.innerHTML = `<div>${msg}</div>` + water + (rows.length ? `<table>${rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</table>` : '');
  }

  // ---------- 描く ----------
  function camPos() { return new THREE.Vector3(dist * Math.cos(pitch) * Math.cos(yaw), dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch)); }
  function render() {
    if (GV.stage !== 'tear') return;
    const c = frame ? frame.stats.com : [0, 0, 0], O = new THREE.Vector3(c[0] / U, c[1] / U, c[2] / U);
    camera.position.copy(O).add(camPos());
    camera.up.set(0, 0, 1);
    camera.lookAt(O);
    if (mat) {
      mat.uniforms.pscale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
      mat.uniforms.cutOn.value = opt.cut ? 1 : 0;
      mat.uniforms.cutO.value.copy(O);
      mat.uniforms.cutN.value.copy(cutNormal());
    }
    renderer.render(scene, camera);
  }
  // 断面で消す側: カメラの側の半分。穴があるときは、切り口が穴をたてに通るように、穴の向きを含む面で切る
  function cutNormal() {
    const v = camPos().normalize();
    if (!holeU) return v;
    const p = v.clone().sub(holeU.clone().multiplyScalar(v.dot(holeU)));
    return p.length() > 0.2 ? p.normalize() : v;
  }
  // 断面にしたとき、穴が正面を向いていたら、穴を横から見る向きへカメラを回す
  function sideView() {
    if (!holeU || Math.abs(camPos().normalize().dot(holeU)) < 0.7) return;
    let w = new THREE.Vector3().crossVectors(holeU, new THREE.Vector3(0, 0, 1));
    if (w.length() < 0.3) w = new THREE.Vector3().crossVectors(holeU, new THREE.Vector3(1, 0, 0));
    w.normalize();
    yaw = Math.atan2(w.y, w.x); pitch = Math.asin(Math.max(-1, Math.min(1, w.z)));
  }
  function loop() { raf = requestAnimationFrame(loop); render(); }
  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    // 地球（半径 約 6.3）がたてにも横にも入る距離。スマホの縦長の画面では横で決まる
    const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
    const fit = 8.5 / Math.min(tv, th);
    fitDist = Math.max(26, fit);
    if (!fitted && w > 0) { dist = fitDist; fitted = true; }
    // 縦長の画面（スマホ）では下にパネルがあるので、地球を少し上に寄せて描く
    if (camera.aspect < 0.8) camera.setViewOffset(w, h, 0, h * 0.14, w, h); else camera.clearViewOffset();
  }
  let fitted = false, fitDist = 26;

  // ---------- 計算（Worker） ----------
  function startWorker() {
    worker = new Worker('js/tear-worker.js');
    setTimeout(sendWater, 0);                       // 写真がもう届いていれば海の場所を送る（まだなら届いたときに）
    worker.onmessage = e => {
      const d = e.data;
      if (d.type === 'static') {
        st = d; exposed = new Float32Array(d.n);
        makePoints(d.n);
      } else if (d.type === 'progress') {
        $('tear-info').innerHTML = `地球を粒（${st.n.toLocaleString('ja-JP')} 個、1 個 ≒ ${Math.round(st.s / 1e3)} km）で組み立てて、重力と圧力をつり合わせています… ${Math.round(d.f * 100)}%`;
      } else if (d.type === 'ready') {
        ready = true;
        worker.postMessage({ cmd: 'speed', v: opt.speed });
      } else if (d.type === 'frame') {
        frame = d;
        if (!stat0) stat0 = d.stats;
        paint();
        worker.postMessage({ cmd: 'ack' });
      } else if (d.type === 'torn') {
        torn = true;
        const b = $('tear-pop'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
        if (grab && !grab.down) release();
      } else if (d.type === 'grabbed') {
        holeU = new THREE.Vector3(d.u[0], d.u[1], d.u[2]);
      }
    };
    worker.onerror = e => { GV.err && GV.err(e.message || e); $('tear-info').textContent = '計算を始められませんでした'; };
    worker.postMessage({ cmd: 'init', N: 16000 });
  }

  // ---------- 操作 ----------
  function rayFrom(ev) {
    const r = canvas.getBoundingClientRect();
    const v = new THREE.Vector3(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
    const o = camera.position.clone();
    return { o, d: v.sub(o).normalize() };
  }
  function earthHit(ev) {
    if (!frame) return null;
    const c = frame.stats.com, C = new THREE.Vector3(c[0] / U, c[1] / U, c[2] / U), R = 6.28;
    const { o, d } = rayFrom(ev);
    const oc = o.clone().sub(C), b = oc.dot(d), cc = oc.lengthSq() - R * R, disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? o.add(d.multiplyScalar(t)) : null;
  }
  function planePoint(ev, P, N) {
    const { o, d } = rayFrom(ev), den = d.dot(N);
    if (Math.abs(den) < 1e-6) return null;
    const t = P.clone().sub(o).dot(N) / den;
    return o.add(d.multiplyScalar(t));
  }
  function sendHand(p) { worker.postMessage({ cmd: 'hand', pos: [p.x * U, p.y * U, p.z * U] }); }
  function release() {
    if (!grab) return;
    if (opt.after === 'drop' || !torn) { worker.postMessage({ cmd: 'release', mode: 'drop' }); grab = null; return; }
    // 遠くへ持っていく: 地球とかけらの引き合いを切って、画面の右上へ運ぶ（本当は地球の重力が届かないくらい遠くへ運んだことにする）
    // 置き場所: 画面で地球の右下（説明の箱に隠れないように）。少し引いて、地球とかけらの両方が見えるように
    const c = frame.stats.com, C = new THREE.Vector3(c[0] / U, c[1] / U, c[2] / U);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const narrow = camera.aspect < 0.8;          // スマホの縦長の画面では地球の下（パネルとのあいだ）に置く
    const goal = narrow ? C.clone().add(up.multiplyScalar(-11)) : C.clone().add(right.multiplyScalar(12.5)).add(up.multiplyScalar(-3));
    dist = Math.max(dist, fitDist * (narrow ? 1.9 : 1.3));
    worker.postMessage({ cmd: 'release', mode: 'away', goal: [goal.x * U, goal.y * U, goal.z * U] });
    grab = null;
  }

  function setupInput() {
    let rot = null, pinch = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* 試験用の合成イベントでは捕まえられない */ }
      const hit = e.button === 0 && ready && !grab && !torn && opt.tool !== 'rotate' ? earthHit(e) : null;
      if (hit) {
        const c = frame.stats.com, C = new THREE.Vector3(c[0] / U, c[1] / U, c[2] / U);
        const n = hit.clone().sub(C).normalize();
        grab = { p0: hit.clone(), n, N: camPos().normalize(), hand: hit.clone(), down: true };
        worker.postMessage({ cmd: 'grab', point: [hit.x * U, hit.y * U, hit.z * U], Rg: opt.Rg });
        if (!opt.run) setRun(true);
      } else rot = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointermove', e => {
      if (pinch) return;
      if (grab && grab.down) {
        const q = planePoint(e, grab.p0, grab.N);
        if (!q) return;
        const dv = q.sub(grab.p0), L = Math.min(dv.length(), 8);
        // ちぎる＝地面から引きはなす: 指を動かした長さだけ外向き（地面から離れる向き）に持ち上げ、横へは 3 割だけ
        dv.sub(grab.n.clone().multiplyScalar(dv.dot(grab.n))).setLength(Math.min(dv.length(), 8) * 0.3);
        grab.hand = grab.p0.clone().add(dv).add(grab.n.clone().multiplyScalar(L));
        sendHand(grab.hand);
      } else if (rot) {
        yaw -= (e.clientX - rot.x) * 0.006; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - rot.y) * 0.006));
        rot = { x: e.clientX, y: e.clientY };
      }
    });
    const up = () => { rot = null; if (grab && grab.down) { grab.down = false; if (torn) release(); else { worker.postMessage({ cmd: 'release', mode: 'drop' }); grab = null; } } };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      dist = Math.max(9, Math.min(120, dist * Math.exp(Math.sign(e.deltaY) * 0.1)));
      if (dist >= 120 && e.deltaY > 0) GV.exitTear();
    }, { passive: false });
    canvas.addEventListener('touchstart', e => { if (e.touches.length === 2) { pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); rot = null; } }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !pinch) return;
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      dist = Math.max(9, Math.min(120, dist * pinch / d)); pinch = d;
    }, { passive: true });
    canvas.addEventListener('touchend', () => { pinch = null; });
    window.addEventListener('resize', resize);
  }

  // ---------- パネル ----------
  function setRun(on) { opt.run = on; worker && worker.postMessage({ cmd: 'run', on }); syncPanel(); }
  function reset() {
    grab = null; torn = false; stat0 = null; holeU = null;
    if (exposed) exposed.fill(0);
    worker.postMessage({ cmd: 'reset' });
    opt.run = true;                                  // 計算はつまんだときに動き出す（それまでは止めておく）
    syncPanel();
  }
  function seg(name, items, cur) {
    return `<div class="tseg" data-k="${name}">` + items.map(([v, t]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${t}</button>`).join('') + '</div>';
  }
  function syncPanel() {
    const p = $('tear-panel');
    p.innerHTML =
      `<div class="th">ちぎる大きさ</div>` + seg('Rg', [[1e6, '1000 km'], [2e6, '2000 km'], [3e6, '3000 km']], opt.Rg) +
      `<div class="th">はなすと</div>` + seg('after', [['away', '遠くへ運ぶ'], ['drop', 'その場で落とす']], opt.after) +
      `<div class="th">見え方</div>` + seg('view', [['look', '見た目'], ['temp', '温度'], ['layer', '層'], ['melt', '溶け']], opt.view) +
      `<div class="tseg"><button data-act="cut" class="${opt.cut ? 'on' : ''}">✂ 断面</button><button data-act="rotate" class="${opt.tool === 'rotate' ? 'on' : ''}" title="指で回すだけ（ちぎらない）">🔄 回すだけ</button></div>` +
      `<div class="th">時間</div>` + `<div class="tseg"><button data-act="run">${opt.run ? '⏸ 止める' : '▶ 進める'}</button></div>` +
      seg('speed', [[10, '1秒＝10秒'], [60, '1秒＝1分'], [300, '1秒＝5分'], [1e9, '最速']], opt.speed) +
      `<div class="tseg"><button data-act="reset">↺ もとに戻す</button><button data-act="exit">← 宇宙へ</button></div>` +
      legend();
  }
  function legend() {
    if (opt.view === 'temp') return `<div class="tleg"><span style="background:linear-gradient(90deg,${TSCALE.map(s => `rgb(${s[1].map(v => Math.round(v * 255)).join(',')})`).join(',')})"></span><small>300 K　1600　2500　4000　5500 K</small></div>`;
    if (opt.view === 'layer') return `<div class="tleg"><small><i style="background:#b8613a"></i>マントル <i style="background:#f29e33"></i>外核 <i style="background:#ffedb3"></i>内核</small></div>`;
    if (opt.view === 'melt') return `<div class="tleg"><small><i style="background:#ff8c1a"></i>一部溶けた岩（明るいほど多い） <i style="background:#4073bf"></i>外核（もともと液体の鉄）</small></div>`;
    return `<div class="tleg"><small>中の岩は熱で光る色（推定）。表に出た所は冷えて黒い皮ができる（推定）。<i style="background:#4d9eff"></i>動いた海の水 <i style="background:#d9eeff"></i>沸騰している水・湯気・氷</small></div>`;
  }
  function setupPanel() {
    $('tear-panel').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const sg = b.parentElement.dataset.k;
      if (sg) {
        opt[sg] = sg === 'Rg' || sg === 'speed' ? Number(b.dataset.v) : b.dataset.v;
        if (sg === 'speed') worker && worker.postMessage({ cmd: 'speed', v: opt.speed });
        if (sg === 'view' && frame) paint();
      }
      const a = b.dataset.act;
      if (a === 'cut') { opt.cut = !opt.cut; if (opt.cut) sideView(); }
      if (a === 'rotate') opt.tool = opt.tool === 'rotate' ? '' : 'rotate';
      if (a === 'run') setRun(!opt.run);
      if (a === 'reset') reset();
      if (a === 'exit') GV.exitTear();
      syncPanel();
    });
  }

  // ---------- 出入り ----------
  GV.enterTear = function () {
    if (GV.stage !== 'space' || !window.THREE) return;
    if (!built) { build(); setupInput(); setupPanel(); loadPhoto(); }
    GV.stage = 'tear';
    document.body.classList.add('in-tear');
    syncPanel();
    resize();
    if (!worker) { $('tear-info').textContent = '地球を粒で組み立てています…'; startWorker(); }
    else if (opt.run && (grab || torn)) worker.postMessage({ cmd: 'run', on: true });
    if (!raf) loop();
  };
  GV.exitTear = function (toEarth) {
    if (GV.stage !== 'tear') return;
    GV.stage = 'space';
    document.body.classList.remove('in-tear');
    cancelAnimationFrame(raf); raf = 0;
    worker && worker.postMessage({ cmd: 'run', on: false });    // 見ていないあいだは計算も止める
    if (toEarth) GV.exitSpace();
  };
  GV._tear = { opt, get frame() { return frame; }, get ready() { return ready; }, get worker() { return worker; }, get grab() { return grab; }, get torn() { return torn; }, render: () => render(), hit: (x, y) => earthHit({ clientX: x, clientY: y }), cam: (y, p, d) => { yaw = y; pitch = p; if (d) dist = d; return { yaw, pitch, dist }; } };
})();
