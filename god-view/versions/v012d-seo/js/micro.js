// micro.js — 段階G「ミクロへ」。地上でいちばん寄った所からさらに寄ると、Three.js のミクロの世界へ。
// 画面の幅 W = 10^L m（宇宙と同じ考え方）。寄った場所の地面の種類で 3 本の道に分かれる（v010。ヒトの道はやめた）:
//   岩・砂: 地面の小石 → 砂つぶ → 砂つぶの表面 → 結晶の段 → 石英の結晶格子 → ケイ素原子 → 原子核
//   水    : 水面 → 水しぶき → 水の中 → ひしめく水分子 → 水分子と水素結合 → 酸素原子 → 原子核
//   植物  : 葉っぱ → 葉脈 → 葉の表面と気孔 → 葉緑体 → チラコイド → クロロフィル分子 → マグネシウム原子 → 原子核
// 原子核から先（陽子 → クォーク → プランク長）は共通。どの層も「形は演出、大きさは本物」。
// 層ごとに自分の単位（m・mm・µm・nm・pm・fm…）で作り、原点を中心に group の縮尺 = 単位 ÷ W で描く。
// 次の層に寄っていく先が原点に来るように置き、原点より上（カメラの側）には物を置かない（寄るときに視界をふさがないように）。
'use strict';

(function () {
  const GV = window.GV;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const L_START = 0.55, L_EXIT = 0.75, L_MIN = -35.3;
  const DESERT_A = -33.2, DESERT_B = -19.4;   // 何もない区間。ホイールで速く進む
  const FADE = 700;
  const PATHS = {
    rock: { name: L('岩・砂の道', 'Rock and sand path'), where: L('街・山・砂地', 'towns, mountains, sandy ground') },
    water: { name: L('水の道', 'Water path'), where: L('海・川・湖・氷', 'sea, rivers, lakes, ice') },
    plant: { name: L('植物の道', 'Plant path'), where: L('森・草地・公園・畑', 'forests, grass, parks, fields') },
  };

  let THREE, renderer, scene, camera, canvas, infoEl, built = false, libP = null, raf = 0;
  let Lw = L_START, Lgoal = L_START, yaw = -Math.PI / 2, pitch = 1.05, t0 = performance.now();
  let path = 'rock', pathWhy = '';
  const layers = [];

  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function loadThree() {
    if (window.THREE) return Promise.resolve();
    return libP || (libP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = THREE_URL; s.onload = res; s.onerror = rej; document.head.appendChild(s); }));
  }
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u / 6 - 0.5; };
  const pick = a => a[Math.floor(rnd() * a.length)];

  // ---------- テクスチャ（canvas で描く） ----------
  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  function glowTex(color) {
    return canvasTex(64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(0.3, color); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  }
  // ボロノイ（細胞・小石の境目）。cb(x, S, pts) で中を塗ってから境目の線を描く
  function voronoiLines(x, S, n, lineRGB, width, wobble) {
    const pts = []; for (let i = 0; i < n; i++) pts.push([rnd() * S, rnd() * S]);
    const cell = Math.max(32, Math.floor(S / Math.sqrt(n) * 1.5)), grid = {};
    pts.forEach((p, i) => { const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); (grid[k] = grid[k] || []).push(i); });
    const img = x.getImageData(0, 0, S, S), d = img.data;
    for (let py = 0; py < S; py += 2) for (let px = 0; px < S; px += 2) {
      const qx = px + (wobble ? Math.sin(py * 0.05) * wobble : 0), qy = py + (wobble ? Math.cos(px * 0.05) * wobble : 0);
      let b1 = 1e12, b2 = 1e12;
      const gx = Math.floor(qx / cell), gy = Math.floor(qy / cell);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const i of grid[(gx + dx) + ',' + (gy + dy)] || []) {
        const dd = (pts[i][0] - qx) ** 2 + (pts[i][1] - qy) ** 2;
        if (dd < b1) { b2 = b1; b1 = dd; } else if (dd < b2) b2 = dd;
      }
      if (Math.sqrt(b2) - Math.sqrt(b1) < width) for (let k = 0; k < 4; k++) { const o = ((py + (k >> 1)) * S + px + (k & 1)) * 4; d[o] = lineRGB[0]; d[o + 1] = lineRGB[1]; d[o + 2] = lineRGB[2]; }
    }
    x.putImageData(img, 0, 0);
    return pts;
  }
  // 岩: 小石の地面（4 m 四方）
  const gravelTex = () => canvasTex(2048, (x, S) => {
    x.fillStyle = '#6f6458'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const cx = rnd() * S, cy = rnd() * S, r = 4 + rnd() * rnd() * 30, n = 7;
      const c = pick(['#9a9184', '#b3aa9b', '#7e766c', '#c8bfae', '#8c7c6a', '#5d5850']);
      x.fillStyle = c; x.beginPath();
      for (let k = 0; k < n; k++) { const a = k / n * 6.28, rr = r * (0.7 + rnd() * 0.5); k ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(cx - r * 0.25, cy - r * 0.25, r * 0.35, 0, 6.28); x.fill();
    }
    // 中央は砂（細かい粒）
    for (let i = 0; i < 9000; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 160; x.fillStyle = pick(['#c9bba4', '#a89982', '#d8cdb8', '#8a7d6a']); x.fillRect(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 2, 2); }
  });
  // 岩: 砂つぶの表面（貝がら状の割れ目。600 µm 四方）
  const fractureTex = () => canvasTex(2048, (x, S) => {
    const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#a9a292'); g.addColorStop(1, '#8f877a');   // v010: 明るすぎて模様が飛んだ
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const cx = rnd() * S, cy = rnd() * S, a0 = rnd() * 6.28;
      for (let r = 20; r < 200 + rnd() * 300; r += 9 + rnd() * 8) {
        x.strokeStyle = `rgba(70,62,52,${0.25 + rnd() * 0.25})`; x.lineWidth = 3;
        x.beginPath(); x.arc(cx, cy, r, a0, a0 + 1.2 + rnd() * 0.8); x.stroke();
      }
    }
  });
  // 水: 水面（4 m 四方）
  const waterTex = () => canvasTex(2048, (x, S) => {
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.7); g.addColorStop(0, '#2f7fa8'); g.addColorStop(1, '#1d4e6e');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 25; i++) {
      const cx = rnd() * S, cy = rnd() * S;
      for (let r = 10; r < 260; r += 22) { x.strokeStyle = `rgba(190,230,255,${0.25 * (1 - r / 260)})`; x.lineWidth = 3; x.beginPath(); x.ellipse(cx, cy, r, r * 0.8, 0, 0, 6.28); x.stroke(); }
    }
    for (let i = 0; i < 600; i++) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(rnd() * S, rnd() * S, 6, 2); }
  });
  // 植物: 葉っぱの重なり（4 m 四方）
  const leavesTex = () => canvasTex(2048, (x, S) => {
    x.fillStyle = '#2d3a22'; x.fillRect(0, 0, S, S);
    const leaf = (cx, cy, len, ang, col) => {
      x.save(); x.translate(cx, cy); x.rotate(ang);
      x.fillStyle = col; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0); x.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0); x.fill();
      x.strokeStyle = 'rgba(220,240,180,0.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(len, 0); x.stroke();
      for (let k = 1; k < 6; k++) { const t = k / 6 * len; x.beginPath(); x.moveTo(t, 0); x.lineTo(t + len * 0.1, -len * 0.12); x.moveTo(t, 0); x.lineTo(t + len * 0.1, len * 0.12); x.stroke(); }
      x.restore();
    };
    for (let i = 0; i < 700; i++) leaf(rnd() * S, rnd() * S, 40 + rnd() * 110, rnd() * 6.28, pick(['#4f8a2e', '#3f7a26', '#6aa33a', '#5a9632', '#7cb346']));
    leaf(S / 2 - 140, S / 2, 280, 0, '#62a236');   // 中央の葉（原点が葉の上）
  });
  // 植物: 葉脈（40 mm 四方）
  // 植物: 葉脈（40 mm 四方）。太い主脈 → 斜めの側脈 → その間を細かい網目（v010: でたらめな線にしか見えなかったので作り直し）
  const veinTex = () => canvasTex(2048, (x, S) => {
    x.fillStyle = '#5c9a34'; x.fillRect(0, 0, S, S);
    voronoiLines(x, S, 1600, [138, 190, 96], 2.2, 3);      // 細かい網目（1 区画 約 1 mm）
    const line = (x0, y0, x1, y1, w, a) => { x.strokeStyle = `rgba(205,235,160,${a})`; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); };
    const midY = S * 0.62;
    line(0, midY + 60, S, midY - 60, 26, 0.95);              // 主脈
    for (let i = -2; i < 14; i++) {                         // 側脈（主脈から斜めに）
      const t = i / 12, px = t * S, py = midY + 60 - t * 120;
      for (const s of [-1, 1]) {   // s = 1 は主脈の上側、-1 は下側。主脈から 約 43° で出て、少しずつ曲がる
        let cx = px, cy = py, ang = 0.75;
        for (let k = 0; k < 8; k++) { const nx = cx + Math.cos(ang) * 90, ny = cy - s * Math.sin(ang) * 90; line(cx, cy, nx, ny, 10 - k, 0.85); cx = nx; cy = ny; ang += 0.06; }
      }
    }
  });
  // 植物: 葉の表面の細胞（ジグソーパズル形、800 µm 四方）
  const epidermisTex = () => canvasTex(2048, (x, S) => {
    x.fillStyle = '#9ccf6e'; x.fillRect(0, 0, S, S);
    voronoiLines(x, S, 700, [70, 120, 50], 3, 6);
  });

  // ---------- 層 ----------
  function layer(def) {
    const group = new THREE.Group(); scene.add(group);
    def.group = group;
    def.build(group);
    // 透明度の切り替え用に、元の不透明度を覚える
    group.traverse(o => { if (o.material) { o.material.transparent = true; o.material.userData.base = o.material.opacity; o.material.userData.dw = o.material.depthWrite; } });
    layers.push(def);
  }
  const mat = (color, opts = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0 }, opts));
  const plane = (size, tex, opts = {}) => new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.9, transparent: true }, opts)));
  const ball = (r, color, opts) => new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color, opts));
  // でこぼこの粒（砂つぶ・鉱物の粒）
  function grain(r, color, opts) {
    // 多面体は面ごとに頂点が別々なので、頂点ごとにでたらめに動かすと面が割れる → 向きから決まるでこぼこにする
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
    const a = rnd() * 6, b = rnd() * 6, c = rnd() * 6, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const k = 1 + 0.22 * Math.sin(3 * v.x + a) * Math.sin(3 * v.y + b) + 0.12 * Math.sin(5 * v.z + c);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k * 0.8);
    }
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat(color, Object.assign({ flatShading: true, roughness: 0.5 }, opts)));
  }
  // 棒（2 点を結ぶ円柱）
  function stick(a, b, r, color, opts) {
    const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat(color, opts));
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return m;
  }
  // 原子の電子の雲（点の濃さ = 電子が見つかりやすさ。s は大きさの倍率）
  function electronCloud(g, s, nInner) {
    const pos = [], col = [];
    for (let i = 0; i < 14000; i++) {
      const inner = i < nInner;
      const r = (inner ? -Math.log(rnd() * rnd()) * 6 : (-Math.log(rnd() * rnd() * rnd()) * 18)) * s;
      const th = rnd() * 6.28, ph = Math.acos(2 * rnd() - 1);
      let x = r * Math.sin(ph) * Math.cos(th), y = r * Math.sin(ph) * Math.sin(th), z = r * Math.cos(ph);
      if (!inner && i % 3 === 0) { x *= 1.6; y *= 0.6; z *= 0.6; }   // p 軌道の向き（ダンベル形）をうっすら
      pos.push(x, y, z); col.push(inner ? 0.9 : 0.55, inner ? 1 : 0.8, 1);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex('#9fc8ff') })));
  }
  // 原子核（陽子 Z・中性子 N をかたまりに。半径の目安 1.2 × A^(1/3) fm）。原点の近くの陽子は (0.3, 0.2, 0)
  function nucleus(g, Z, N) {
    const A = Z + N, R = 1.2 * Math.cbrt(A) - 0.6, P = [[0.3, 0.2, 0, 1]];
    let tries = 0, gap = 1.35;
    while (P.length < A && tries < 20000) {
      tries++; if (tries % 4000 === 0) gap *= 0.92;     // 詰められないときは少しずつ間をつめる
      const v = [gauss() * R * 2.2, gauss() * R * 2.2, gauss() * R * 2.2];
      if (Math.hypot(...v) < R && P.every(q => Math.hypot(q[0] - v[0], q[1] - v[1], q[2] - v[2]) > gap)) P.push(v);
    }
    // 陽子と中性子を交互に（最初の 1 個は陽子。どちらかが足りなくなったら残りはもう一方）
    let nP = 0, nN = 0;
    // 原点の陽子以外は、さらに寄るとうすくする（カメラが原子核の中に入ると、ほかの陽子・中性子が画面をふさぐ）
    P.forEach((v, i) => {
      const isP = nP < Z && (nN >= N || i % 2 === 0);
      if (isP) nP++; else nN++;
      const b = ball(0.84, isP ? 0xe04040 : 0x3c6ee0); b.position.set(v[0], v[1], v[2]);
      b.userData.fadeBelow = i ? [-14.5, -14.0] : [-14.75, -14.35]; g.add(b);
    });
  }

  function build() {
    THREE = window.THREE;
    canvas = document.getElementById('micro');
    infoEl = document.getElementById('micro-info');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090f);
    camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(1, -1, 2); scene.add(dl);
    const qLink = [[L('量子の実験室', 'The Quantum Lab'), '../quantum/']];

    // ===== 岩・砂の道 =====
    layer({ path: 'rock', name: L('地面の小石と砂', 'Pebbles and sand on the ground'), Lmin: -1.3, Lmax: 1.5, unit: 1, desc: L('地面には小石と砂。まん中の砂の 1 つぶに寄っていきます。', 'Pebbles and sand on the ground. We zoom in on one grain of sand in the middle.'),
      build: g => g.add(plane(4, gravelTex())) });
    layer({ path: 'rock', name: L('砂つぶ', 'Grains of sand'), Lmin: -3.3, Lmax: -1.1, unit: 1e-3, desc: L('砂は、岩がくだけた鉱物のつぶ（0.06〜2 mm）。白っぽいのは石英、ピンクは長石、黒は雲母など。まん中の石英のつぶに寄ります。', 'Sand is grains of minerals from broken rock (0.06–2 mm). Whitish ones are quartz, pink is feldspar, black is mica and so on. We zoom in on the quartz grain in the middle.'),
      build: g => {
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat(0x8c7f6c, { roughness: 1 })); ground.position.z = -1.0; g.add(ground);   // 粒の下の砂の地面（v010: 粒が宙に浮いて見えた）
        const center = grain(0.45, 0xe2ddd2, { opacity: 0.92 }); center.position.set(0, 0, -0.4); g.add(center);
        for (let i = 0; i < 420; i++) {
          const r = 0.12 + rnd() * rnd() * 0.6, a = rnd() * 6.28, d = 0.6 + Math.sqrt(rnd()) * 7;
          const m = grain(r, pick([0xe2ddd2, 0xe2ddd2, 0xd3a088, 0xc8b89a, 0x3b3631, 0xb9b2a5]));
          m.position.set(Math.cos(a) * d, Math.sin(a) * d, -r - rnd() * 0.3); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); g.add(m);
        }
      } });
    layer({ path: 'rock', name: L('砂つぶの表面', 'Surface of a sand grain'), Lmin: -5.6, Lmax: -3.1, unit: 1e-6, desc: L('石英のつぶの表面。割れたあとが貝がらのような曲線を残しています。うすい六角形の板は粘土の粒（約 1〜2 µm、カオリナイトなど）。', 'The surface of a quartz grain. Breaks leave shell-like curves. The thin hexagonal plates are clay particles (about 1–2 µm, such as kaolinite).'),
      build: g => {
        g.add(plane(600, fractureTex()));
        const hex = new THREE.CylinderGeometry(1, 1, 0.12, 6);
        for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(hex, mat(0xd9cfbc)); const s = 0.4 + rnd() * 0.7; m.scale.set(s, 1, s); m.position.set(gauss() * 70, gauss() * 70, 0.1 + rnd() * 0.3); m.rotation.set(Math.PI / 2 + gauss() * 0.6, rnd() * 6, 0); if (Math.hypot(m.position.x, m.position.y) > 1.5) g.add(m); }
      } });
    layer({ path: 'rock', name: L('結晶の段', 'Crystal steps'), Lmin: -7.7, Lmax: -5.4, unit: 1e-9, desc: L('石英は原子が規則正しく並んだ結晶。表面には、原子の層の段（高さ 約 0.4 nm〜数 nm）が階段のように続いています。', 'Quartz is a crystal with atoms lined up in a regular pattern. On its surface, steps of atomic layers (about 0.4 nm to a few nm high) continue like a staircase.'),
      build: g => {
        for (let i = -6; i <= 6; i++) {
          const h = 2 + (i % 3 === 0 ? 2 : 0);
          const box = new THREE.Mesh(new THREE.BoxGeometry(70, 400, h), mat(i % 2 ? 0xa59d8c : 0x968e7e, { roughness: 0.55 }));   // v010: 明るすぎて白く飛んだ
          box.position.set(i * 60, 0, -h / 2 - Math.max(0, i) * 2.5 - (i < 0 ? 0 : 0)); g.add(box);
        }
      } });
    layer({ path: 'rock', name: L('石英の結晶', 'Quartz crystal'), Lmin: -9.9, Lmax: -7.5, unit: 1e-12, desc: L('石英（SiO₂）: ケイ素（ベージュ）1 個を酸素（赤）4 個が四面体の形にかこみ、その四面体が頂点の酸素を分け合ってどこまでもつながる。形はかんたんにした模型（クリストバライトの並びに近い）。', 'Quartz (SiO₂): each silicon (beige) is surrounded by 4 oxygens (red) in a tetrahedron, and the tetrahedra share their corner oxygens to link on and on. The shape is a simplified model (close to the cristobalite arrangement).'),
      build: g => {
        const a = 716, si = [];
        const fcc = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 0; k++) for (const f of fcc) for (const b of [[0, 0, 0], [0.25, 0.25, 0.25]]) {   // 部品の数を約 1000 におさえる
          const p = [(i + f[0] + b[0]) * a, (j + f[1] + b[1]) * a, (k + f[2] + b[2]) * a];
          if (p[2] <= 1) si.push(new THREE.Vector3(...p));
        }
        const dBond = a * Math.sqrt(3) / 4;
        si.forEach(p => { const m = ball(60, 0xd9c49c); m.position.copy(p); g.add(m); });
        for (let i = 0; i < si.length; i++) for (let j = i + 1; j < si.length; j++) {
          if (Math.abs(si[i].distanceTo(si[j]) - dBond) > 5) continue;
          const o = si[i].clone().lerp(si[j], 0.5); o.x += 25;
          const m = ball(48, 0xd23a3a); m.position.copy(o); g.add(m);
          g.add(stick(si[i], o, 12, 0x9a9488)); g.add(stick(o, si[j], 12, 0x9a9488));
        }
      } });
    layer({ path: 'rock', name: L('ケイ素原子', 'Silicon atom'), Lmin: -12.3, Lmax: -9.7, unit: 1e-12, desc: L('ケイ素の原子（電子 14 個、大きさ 約 220 pm）。電子は「雲」のように広がっている（点が濃いほど見つかりやすい）。中心の原子核は原子の約 10 万分の 1 の大きさで、原子の中はほとんど空っぽ。', 'A silicon atom (14 electrons, about 220 pm across). The electrons spread out like a “cloud” (denser dots = more likely to be found there). The nucleus in the center is about 1/100,000 the size of the atom, so the atom is almost empty.'), links: qLink,
      build: g => electronCloud(g, 1.6, 4000) });
    layer({ path: 'rock', name: L('ケイ素の原子核', 'Silicon nucleus'), Lmin: -15.3, Lmax: -13.9, unit: 1e-15, desc: L('ケイ素 28 の原子核: 陽子（赤）14 個と中性子（青）14 個が、強い力で集まっている（さしわたし 約 7 fm）。', 'The nucleus of silicon-28: 14 protons (red) and 14 neutrons (blue) held together by the strong force (about 7 fm across).'),
      build: g => nucleus(g, 14, 14) });

    // ===== 水の道 =====
    layer({ path: 'water', name: L('水面', 'Water surface'), Lmin: -1.3, Lmax: 1.5, unit: 1, desc: L('水面には波の輪と光の反射。はねた水しぶきに寄っていきます。', 'Rings of ripples and reflected light on the water. We zoom in on a splash of spray.'),
      build: g => g.add(plane(4, waterTex())) });
    layer({ path: 'water', name: L('水しぶき', 'Spray'), Lmin: -3.3, Lmax: -1.1, unit: 1e-3, desc: L('水しぶきの粒（0.1〜3 mm）。小さい粒ほど表面張力で丸くなります。まん中の粒の中へ入っていきます。', 'Drops of spray (0.1–3 mm). The smaller the drop, the rounder surface tension makes it. We go inside the drop in the middle.'),
      build: g => {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat(0x1f5f86, { roughness: 0.15, metalness: 0.2 })); pl.position.z = -3; g.add(pl);
        const d = ball(1, 0xbfe6ff, { roughness: 0.05, metalness: 0.1, opacity: 0.55 }); d.position.z = -1; g.add(d);
        for (let i = 0; i < 160; i++) { const r = 0.05 + rnd() * rnd() * 1.4, a = rnd() * 6.28, dd = 1.6 + Math.sqrt(rnd()) * 14; const b = ball(r, 0xcdeeff, { roughness: 0.05, opacity: 0.5 }); b.position.set(Math.cos(a) * dd, Math.sin(a) * dd, -r - rnd() * 2); g.add(b); }
      } });
    layer({ path: 'water', name: L('水の中', 'Inside the water'), Lmin: -5.6, Lmax: -3.1, unit: 1e-6, desc: L('水のつぶの中。ただよう細かい鉱物の粒（1〜10 µm）や、小さな空気の泡（10〜50 µm）があります。水そのものは、ここではまだ透明に見えます。', 'Inside the drop. Tiny mineral particles (1–10 µm) drift around, along with small air bubbles (10–50 µm). The water itself still looks clear at this size.'),
      build: g => {
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat(0x0f3550, { roughness: 1 })); bg.position.z = -400; g.add(bg);
        for (let i = 0; i < 70; i++) { const m = grain(0.5 + rnd() * 3, pick([0x8a7a62, 0x6e6250, 0xa89880])); m.position.set(gauss() * 300, gauss() * 300, -5 - rnd() * 300); g.add(m); }
        for (let i = 0; i < 14; i++) { const b = ball(5 + rnd() * 20, 0xdff3ff, { roughness: 0.05, opacity: 0.3 }); b.position.set(gauss() * 500, gauss() * 500, -40 - rnd() * 300); g.add(b); }   // v010: 込み合いすぎたので減らした
      } });
    layer({ path: 'water', name: L('ひしめく水分子', 'Crowded water molecules'), Lmin: -7.7, Lmax: -5.4, unit: 1e-9, desc: L('水は水分子（約 0.3 nm）がぎっしり集まったもの。1 nm の立方体に約 33 個。いつも動き回って、つながったり離れたりしています。（点は実際よりまばらに描いています）', 'Water is water molecules (about 0.3 nm) packed tightly together — about 33 in a 1 nm cube. They are always moving, joining and separating. (The dots are drawn sparser than in reality.)'),
      build: g => {
        const pos = [];
        for (let i = 0; i < 30000; i++) pos.push(gauss() * 160, gauss() * 160, -Math.abs(gauss()) * 80);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: 0x7fc4ff, transparent: true, opacity: 0.85, depthWrite: false, map: glowTex('#bfe3ff') })));
        g.userData.jiggle = geo;
      } });
    layer({ path: 'water', name: L('水分子と水素結合', 'Water molecules and hydrogen bonds'), Lmin: -9.9, Lmax: -7.5, unit: 1e-12, desc: L('水分子（H₂O）: 酸素（赤）1 個に水素（白）2 個が 104.5° の角度でつく。となりの分子の酸素と水素が、弱く引き合う「水素結合」（点線）でつながっています。', 'A water molecule (H₂O): 2 hydrogens (white) attach to 1 oxygen (red) at an angle of 104.5°. The oxygen and hydrogen of neighboring molecules are linked by weak “hydrogen bonds” (dotted lines).'),
      build: g => {
        const mols = [];
        const addMol = (o, ang) => {
          const h1 = new THREE.Vector3(Math.cos(ang) * 96, Math.sin(ang) * 96, 0).add(o), h2 = new THREE.Vector3(Math.cos(ang + 1.824) * 96, Math.sin(ang + 1.824) * 96, gauss() * 30).add(o);
          const O = ball(66, 0xd23a3a); O.position.copy(o); g.add(O);
          [h1, h2].forEach(h => { const H = ball(38, 0xf2f2f2); H.position.copy(h); g.add(H); g.add(stick(o, h, 10, 0xdddddd)); });
          mols.push({ o, h: [h1, h2] });
        };
        addMol(new THREE.Vector3(0, 0, 0), 0.3);
        for (let i = 0; i < 70; i++) addMol(new THREE.Vector3(gauss() * 2600, gauss() * 2600, -100 - rnd() * 700), rnd() * 6.28);
        const dash = new THREE.LineDashedMaterial({ color: 0x9fd3ff, dashSize: 25, gapSize: 20, transparent: true, opacity: 0.8 });
        for (const a of mols) for (const b of mols) { if (a === b) continue; for (const h of a.h) { const d = h.distanceTo(b.o); if (d > 150 && d < 300) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([h, b.o]), dash); l.computeLineDistances(); g.add(l); } } }
      } });
    layer({ path: 'water', name: L('酸素原子', 'Oxygen atom'), Lmin: -12.3, Lmax: -9.7, unit: 1e-12, desc: L('酸素の原子（電子 8 個、大きさ 約 120 pm）。電子は「雲」のように広がり、中心の原子核は原子の約 10 万分の 1。原子の中はほとんど空っぽ。', 'An oxygen atom (8 electrons, about 120 pm across). The electrons spread out like a “cloud”, and the nucleus in the center is about 1/100,000 the size of the atom. The atom is almost empty.'), links: qLink,
      build: g => electronCloud(g, 0.85, 3000) });
    layer({ path: 'water', name: L('酸素の原子核', 'Oxygen nucleus'), Lmin: -15.3, Lmax: -13.9, unit: 1e-15, desc: L('酸素 16 の原子核: 陽子（赤）8 個と中性子（青）8 個（さしわたし 約 6 fm）。', 'The nucleus of oxygen-16: 8 protons (red) and 8 neutrons (blue) (about 6 fm across).'),
      build: g => nucleus(g, 8, 8) });

    // ===== 植物の道 =====
    layer({ path: 'plant', name: L('葉っぱ', 'Leaves'), Lmin: -1.3, Lmax: 1.5, unit: 1, desc: L('地面をおおう葉っぱ。まん中の葉に寄っていきます。', 'Leaves covering the ground. We zoom in on the leaf in the middle.'),
      build: g => g.add(plane(4, leavesTex())) });
    layer({ path: 'plant', name: L('葉脈', 'Leaf veins'), Lmin: -3.3, Lmax: -1.1, unit: 1e-3, desc: L('葉の中には、水や養分を運ぶ葉脈がはりめぐらされています（細いもので 0.1 mm ほど）。', 'Veins that carry water and nutrients run all through the leaf (the thin ones are about 0.1 mm).'),
      build: g => g.add(plane(40, veinTex())) });
    layer({ path: 'plant', name: L('葉の表面と気孔', 'Leaf surface and stomata'), Lmin: -5.0, Lmax: -3.1, unit: 1e-6, desc: L('葉の表面の細胞は、ジグソーパズルのような形（50〜100 µm）。くちびるのような形は「気孔」（約 30 µm）で、ここから二酸化炭素を取り入れ、酸素と水蒸気を出します。気孔の細胞の中へ寄ります。', 'Cells on the leaf surface are shaped like jigsaw pieces (50–100 µm). The lip-shaped openings are “stomata” (about 30 µm), which take in carbon dioxide and let out oxygen and water vapor. We zoom into a stoma cell.'),
      build: g => {
        g.add(plane(800, epidermisTex()));
        // 気孔: 2 つの孔辺細胞が楕円の輪になり、まん中にすきま（孔）（v010: 半分の輪を重ねたら「8」の字に見えた）
        const ring = new THREE.TorusGeometry(10, 3.6, 12, 32), slit = new THREE.CircleGeometry(6.5, 24);
        const stoma = (x, y, rot) => {
          const s = new THREE.Group(); s.position.set(x, y, 0.5); s.rotation.z = rot; s.scale.set(1, 0.6, 1);
          s.add(new THREE.Mesh(ring, mat(0x6fb04a)));
          const hole = new THREE.Mesh(slit, mat(0x1d3315)); hole.position.z = -0.4; hole.scale.set(1, 0.35, 1); s.add(hole);
          g.add(s);
        };
        stoma(0, -6, 0);   // 輪の上側（孔辺細胞）が原点を通る
        for (let i = 0; i < 40; i++) stoma(gauss() * 700, gauss() * 700, rnd() * 6);
      } });
    layer({ path: 'plant', name: L('葉緑体', 'Chloroplasts'), Lmin: -6.6, Lmax: -4.8, unit: 1e-6, desc: L('細胞の中の緑の粒が葉緑体（約 5 µm）。光のエネルギーで、水と二酸化炭素から糖を作ります（光合成）。', 'The green grains in the cell are chloroplasts (about 5 µm). They use light energy to make sugar from water and carbon dioxide (photosynthesis).'),
      build: g => {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat(0x2f5c22)); wall.position.z = -6; g.add(wall);
        const cp = new THREE.SphereGeometry(1, 24, 16);
        const add = (x, y, rot) => { const m = new THREE.Mesh(cp, mat(0x3f9a2c, { roughness: 0.5 })); m.scale.set(2.6, 1.4, 1.1); m.position.set(x, y, -1.2); m.rotation.z = rot; g.add(m); };
        add(0, 0, 0.2);
        for (let i = 0; i < 70; i++) { const x = gauss() * 80, y = gauss() * 80; if (Math.hypot(x, y) > 6) add(x, y, rnd() * 3); }
      } });
    layer({ path: 'plant', name: L('チラコイド', 'Thylakoids'), Lmin: -8.2, Lmax: -6.4, unit: 1e-9, desc: L('葉緑体の中には、うすい袋（チラコイド、厚さ 約 10〜20 nm）が硬貨を積んだように重なっています（グラナ）。この膜に、光を受けとめるクロロフィルが並んでいます。', 'Inside a chloroplast, thin sacs (thylakoids, about 10–20 nm thick) are stacked like piles of coins (grana). Chlorophyll, which catches light, is lined up on these membranes.'),
      build: g => {
        const disc = new THREE.CylinderGeometry(220, 220, 14, 32);
        for (let s = 0; s < 6; s++) {
          let cx = 0, cy = 0;
          if (s) { do { cx = gauss() * 3000; cy = gauss() * 3000; } while (Math.hypot(cx, cy) < 900); }   // ほかの積み重ねは原点から離す
          // 原点が手前の積み重ねの「ふち」に来るように（v010: 円盤の真ん中だと画面が緑一色で重なりが見えなかった）
          for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(disc, mat(k % 2 ? 0x2f7a22 : 0x56b83c, { roughness: 0.4 })); m.rotation.x = Math.PI / 2; m.position.set(cx + 225, cy, -7 - k * 22); g.add(m); }
        }
        // 積み重ねどうしをつなぐ板（ストロマラメラ）。原点の近くには置かない（v010: 大きな板が原点の下に入り、背景が緑一色になった）
        for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1600, 50, 10), mat(0x2f6f22)); m.position.set(gauss() * 2400, gauss() * 2400, -80 - rnd() * 100); m.rotation.z = rnd() * 3; if (Math.hypot(m.position.x, m.position.y) > 1200) g.add(m); }
      } });
    layer({ path: 'plant', name: L('クロロフィル分子', 'Chlorophyll molecule'), Lmin: -9.9, Lmax: -8.0, unit: 1e-12, desc: L('クロロフィル: 窒素（青）4 個が中心のマグネシウム（緑）をかこむ環（ポルフィリン環、さしわたし 約 1 nm）と、長いしっぽ。この環が赤や青の光を吸い、緑を残すので葉は緑に見えます。形はかんたんにした模型。', 'Chlorophyll: a ring of 4 nitrogens (blue) around a central magnesium (green) (the porphyrin ring, about 1 nm across), plus a long tail. The ring absorbs red and blue light and leaves green, so leaves look green. The shape is a simplified model.'),
      build: g => {
        // 実際の分子に近い配置（v010: 最初の形は原子が重なって団子になった）:
        //   Mg が原点、N 4 個が 205 pm。5 角形の環（ピロール、辺 約 140 pm → 外接円の半径 119 pm）の頂点の 1 つが N。
        //   環のとなりの炭素（α）どうしを、環と環の間の炭素（メソ位）がつなぐ。原子の玉は見やすい大きさ（実際の半径より小さめ）
        const add = (p, c, r) => { const m = ball(r, c); m.position.copy(p); g.add(m); return p; };
        const bond = (a, b) => g.add(stick(a, b, 9, 0x9a9488));
        const Mg = add(new THREE.Vector3(0, 0, 0), 0x6fd06f, 55);
        const alphas = [];
        for (let q = 0; q < 4; q++) {
          const a = q * Math.PI / 2, c = new THREE.Vector3(Math.cos(a) * 324, Math.sin(a) * 324, 0);
          const ring = [];
          for (let k = 0; k < 5; k++) { const b = a + Math.PI + k * 2 * Math.PI / 5; ring.push(new THREE.Vector3(c.x + Math.cos(b) * 119, c.y + Math.sin(b) * 119, 0)); }
          add(ring[0], 0x3a62d2, 40); bond(Mg, ring[0]);                         // 窒素
          for (let k = 1; k < 5; k++) add(ring[k], 0x555c66, 34);                // 炭素
          for (let k = 0; k < 5; k++) bond(ring[k], ring[(k + 1) % 5]);
          alphas.push([ring[1], ring[4]]);
        }
        for (let q = 0; q < 4; q++) {                                             // メソ位の炭素で環どうしをつなぐ
          const a1 = alphas[q][0], a2 = alphas[(q + 1) % 4][1];
          const m = a1.clone().add(a2).multiplyScalar(0.5); m.multiplyScalar(1.12);
          add(m, 0x555c66, 34); bond(a1, m); bond(m, a2);
        }
        // しっぽ（フィトール鎖。じぐざぐの炭素の列）
        let p = alphas[3][1].clone().add(new THREE.Vector3(60, -120, 0));
        add(p, 0x555c66, 34);
        for (let k = 0; k < 18; k++) { const q = p.clone().add(new THREE.Vector3(120, (k % 2 ? 70 : -70), -40)); add(q, 0x555c66, 34); bond(p, q); p = q; }
      } });
    layer({ path: 'plant', name: L('マグネシウム原子', 'Magnesium atom'), Lmin: -12.3, Lmax: -9.7, unit: 1e-12, desc: L('クロロフィルの中心のマグネシウム原子（電子 12 個、大きさ 約 300 pm）。電子は「雲」のように広がり、中心の原子核は原子の約 10 万分の 1。原子の中はほとんど空っぽ。', 'The magnesium atom at the center of chlorophyll (12 electrons, about 300 pm across). The electrons spread out like a “cloud”, and the nucleus in the center is about 1/100,000 the size of the atom. The atom is almost empty.'), links: qLink,
      build: g => electronCloud(g, 2.0, 3500) });
    layer({ path: 'plant', name: L('マグネシウムの原子核', 'Magnesium nucleus'), Lmin: -15.3, Lmax: -13.9, unit: 1e-15, desc: L('マグネシウム 24 の原子核: 陽子（赤）12 個と中性子（青）12 個（さしわたし 約 7 fm）。', 'The nucleus of magnesium-24: 12 protons (red) and 12 neutrons (blue) (about 7 fm across).'),
      build: g => nucleus(g, 12, 12) });

    // ===== 共通（原子の中のすきま → 陽子 → クォーク → プランク長） =====
    layer({ name: L('原子の中のすきま', 'Empty space inside the atom'), Lmin: -14.3, Lmax: -11.8, unit: 1e-15, desc: L('電子の雲の内側は、ほとんど何もない空間。もし原子が東京ドームの大きさなら、原子核はまん中の 1 粒のビー玉くらいです。', 'Inside the electron cloud is almost empty space. If an atom were the size of a big stadium, the nucleus would be about one marble in the middle.'),
      build: g => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffb36b'), sizeAttenuation: false, transparent: true, depthWrite: false })); s.scale.set(0.07, 0.07, 1); g.add(s); } });
    layer({ key: 'proton', name: L('陽子の中', 'Inside a proton'), Lmin: -16.6, Lmax: -14.4, unit: 1e-15, desc: L('陽子（半径 約 0.84 fm）の中には、クォークが 3 つ（アップ 2 つ・ダウン 1 つ）。グルーオン（ばね）がクォークどうしを強く結びつけています。色は「色荷」というクォークの性質の演出。', 'Inside a proton (radius about 0.84 fm) are 3 quarks (2 up, 1 down). Gluons (springs) bind the quarks strongly together. The colors stand in for a quark property called “color charge”.'),
      build: g => {
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.84, 40, 24), new THREE.MeshStandardMaterial({ color: 0xe04040, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
        shell.position.set(0.3, 0.2, 0); g.add(shell);
        const q = [[0, 0, 0, 0x3a7be0], [0.55, 0.35, 0.1, 0xe04a4a], [0.45, -0.2, -0.3, 0x46c060]];
        // クォークの玉は見せるための大きさ。寄ると光の点（次の層）に入れかえる
        q.forEach(([x, y, z, c]) => { const b = ball(0.06, c, { emissive: new THREE.Color(c), emissiveIntensity: 0.6 }); b.position.set(x, y, z); b.userData.fadeBelow = [-16.1, -15.7]; g.add(b); });
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
          const a = new THREE.Vector3(...q[i].slice(0, 3)), b = new THREE.Vector3(...q[j].slice(0, 3)), pts = [];
          for (let k = 0; k <= 40; k++) { const p = a.clone().lerp(b, k / 40); p.z += Math.sin(k * 1.2) * 0.04; p.y += Math.cos(k * 1.2) * 0.04; pts.push(p); }
          g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.012, 5), mat(0xffd25e, { emissive: new THREE.Color(0x553300) })));
        }
      } });
    layer({ name: L('クォーク', 'Quarks'), Lmin: -19.6, Lmax: -16.4, unit: 1e-18, desc: L('クォークには、今の実験で分かる大きさがありません（あっても 10^-18 m よりずっと小さい）。電子も同じで、「点」のような粒と考えられています。この先は何もない広がりが続くので、ホイールで速く進みます。', 'Quarks have no size that today’s experiments can measure (if any, far smaller than 10^-18 m). Electrons are the same: they are thought of as point-like particles. Beyond this is an empty stretch, so the wheel moves fast.'),
      build: g => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#6fa8ff'), sizeAttenuation: false, transparent: true, depthWrite: false })); s.scale.set(0.12, 0.12, 1); g.add(s); } });
    layer({ key: 'planck', name: L('プランク長', 'The Planck length'), Lmin: -36, Lmax: -33.4, unit: 1e-35, desc: L('プランク長（約 1.6×10^-35 m）。これより小さい世界では、空間や時間そのものがどうなっているか、今の物理では分かりません。泡のような姿は想像です。', 'The Planck length (about 1.6×10^-35 m). At smaller scales, current physics cannot say what space and time themselves are like. The foam-like look is imagined.'),
      build: g => {
        const pos = [];
        for (let i = 0; i < 3000; i++) pos.push(gauss() * 20, gauss() * 20, gauss() * 20);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, color: 0x8f7bff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex('#b8a8ff') })));
        g.userData.foam = geo;
      } });
    built = true;
    GV._micro = { layers, scene, camera, get L() { return Lw; }, set L(v) { Lw = Lgoal = v; }, get path() { return path; }, setPath };   // デバッグ用の窓口
  }

  // 何もない区間（クォークとプランク長の間）の説明
  const DESERT = { name: L('わからない広がり', 'The unknown stretch'), desc: L('10^-19 m から 10^-33 m までは、まだ実験で確かめられていない長さです。ここに何があるのか（ないのか）は、これからの研究の課題です。この区間はホイールで速く進みます。', 'Lengths from 10^-19 m to 10^-33 m have not yet been tested by experiments. What is here (or not) is a question for future research. The wheel moves fast through this stretch.') };

  function render() {
    if (GV.stage !== 'micro' || !built) return;
    Lw += (Lgoal - Lw) * 0.18;
    if (!GV.viewer.useDefaultRenderLoop) GV.viewer.clock.tick();
    const W = Math.pow(10, Lw);
    const dist = 0.5 / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
    camera.position.set(dist * Math.cos(pitch) * Math.cos(yaw), dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch));
    camera.up.set(0, 0, 1); camera.lookAt(0, 0, 0);
    camera.near = dist * 0.01; camera.far = dist * 100; camera.updateProjectionMatrix();
    let best = null, bestV = 0;
    const t = (performance.now() - t0) / 1000;
    for (const ly of layers) {
      const on = !ly.path || ly.path === path;
      const v = on ? smooth(ly.Lmin - 0.3, ly.Lmin + 0.3, Lw) * (1 - smooth(ly.Lmax - 0.3, ly.Lmax + 0.3, Lw)) : 0;
      ly.group.visible = v > 0.01;
      if (!ly.group.visible) continue;
      const sc = ly.unit / W;
      ly.group.scale.set(sc, sc, sc);
      // うすくなっているあいだは奥行きを書かない（書くと、うすい玉の内側にあるものが隠れる）
      ly.group.traverse(o => { if (!o.material) return; const op = (o.material.userData.base ?? 1) * v * (o.userData.fadeBelow ? smooth(o.userData.fadeBelow[0], o.userData.fadeBelow[1], Lw) : 1); o.material.opacity = op; o.material.depthWrite = o.material.userData.dw && op > 0.98; });
      if (ly.key === 'planck') { const p = ly.group.userData.foam.attributes.position; for (let i = 0; i < 60; i++) { const k = Math.floor(Math.random() * p.count); p.setXYZ(k, gauss() * 20, gauss() * 20, gauss() * 20); } p.needsUpdate = true; }
      if (ly.group.userData.jiggle) { const p = ly.group.userData.jiggle.attributes.position; for (let i = 0; i < 400; i++) { const k = Math.floor(Math.random() * p.count); p.setXYZ(k, p.getX(k) + gauss() * 2, p.getY(k) + gauss() * 2, Math.min(0, p.getZ(k) + gauss() * 2)); } p.needsUpdate = true; }
      if (ly.key === 'proton') ly.group.rotation.z = t * 0.3;
      if (v >= bestV) { bestV = v; best = ly; }   // 同じなら奥（後ろに並ぶ小さい方）の層の説明
    }
    renderer.render(scene, camera);
    showInfo(bestV > 0.3 ? best : DESERT);
    if (GV.onSpace) GV.onSpace(W);
  }

  let lastInfo = null;
  function showInfo(ly) {
    const key = ly.name + '|' + path;
    if (key === lastInfo) return;
    lastInfo = key;
    const links = (ly.links || []).map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${L(n + 'へ', 'To ' + n)}</a>`).join('');
    const paths = Object.entries(PATHS).map(([k, p]) => `<button type="button" data-path="${k}" class="${k === path ? 'on' : ''}">${p.name}</button>`).join('');
    infoEl.innerHTML = `<b>${ly.name}</b> <span class="tag tag-fx">${GV.TAGS.fx}</span> <small>${L('形は演出、大きさは本物', 'shapes are for display, sizes are real')}</small><br>${ly.desc}` +
      (links ? '<div class="micro-links">' + links + '</div>' : '') +
      `<div class="micro-paths"><small>${pathWhy}</small>${paths}</div>`;
  }
  function setPath(p) { if (PATHS[p]) { path = p; lastInfo = null; } }

  // ---------- 寄った場所の地面の種類（OpenFreeMap のタイル: 水面・土地の種類・公園）→ 道 ----------
  async function groundPath() {
    try {
      const v = GV.viewer, cv = v.scene.canvas;
      const ray = v.camera.getPickRay(new Cesium.Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
      const hit = ray && v.scene.globe.pick(ray, v.scene);
      const c = hit ? Cesium.Cartographic.fromCartesian(hit) : v.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
      const z = 14, n = 2 ** z, fx = (lon + 180) / 360 * n, s = Math.sin(lat * Math.PI / 180), fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
      const tx = Math.floor(fx), ty = Math.floor(fy);
      const tpl = await GV.ofmTemplate();
      const buf = await (await fetch(tpl.replace('{z}', z).replace('{x}', tx).replace('{y}', ty))).arrayBuffer();
      const d = GV.decodeMVT(buf, ['water', 'landcover', 'park', 'landuse']);
      const inside = (layer, test) => {
        if (!layer) return null;
        const px = (fx - tx) * layer.extent, py = (fy - ty) * layer.extent;
        for (const f of layer.features) {
          if (f.type !== 3 || !test(f.props)) continue;
          let inPoly = false;
          for (const r of f.geom) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
            if ((r[i + 1] > py) !== (r[j + 1] > py) && px < (r[j] - r[i]) * (py - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) inPoly = !inPoly;
          }
          if (inPoly) return f.props;
        }
        return null;
      };
      if (inside(d.water, () => true)) return ['water', L('この場所: 水面', 'This spot: water surface')];
      const lc = inside(d.landcover, () => true);
      if (lc && /ice|glacier/.test(lc.class)) return ['water', L('この場所: 氷', 'This spot: ice')];
      if (lc && /sand|rock|bare/.test(lc.class)) return ['rock', L('この場所: 砂・岩', 'This spot: sand, rock')];
      if (lc && /wood|forest|grass|farmland|wetland|scrub/.test(lc.class)) return ['plant', L('この場所: ', 'This spot: ') + ({ wood: L('森', 'forest'), forest: L('森', 'forest'), grass: L('草地', 'grass'), farmland: L('畑', 'farmland'), wetland: L('湿地', 'wetland'), scrub: L('やぶ', 'scrub') }[lc.class] || L('緑地', 'green area'))];
      if (inside(d.park, () => true)) return ['plant', L('この場所: 公園', 'This spot: park')];
      return ['rock', L('この場所: 街・地面', 'This spot: town, ground')];
    } catch (e) { return ['rock', L('この場所: （分からないので岩・砂）', 'This spot: (unknown, so rock and sand)')]; }
  }

  // ---------- 出入り（宇宙と同じく、重ねてゆっくり入れかえる） ----------
  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  function loop() { raf = requestAnimationFrame(loop); render(); }
  let fadeTimer = 0, fadeEnd = null;
  function fadeTo(show, done) {
    clearTimeout(fadeTimer);
    if (fadeEnd) canvas.removeEventListener('transitionend', fadeEnd);
    let fin = false;
    const finish = () => { if (fin) return; fin = true; canvas.removeEventListener('transitionend', fadeEnd); fadeEnd = null; clearTimeout(fadeTimer); done(); };
    fadeEnd = e => { if (e.propertyName === 'opacity') finish(); };
    canvas.addEventListener('transitionend', fadeEnd);
    canvas.style.transition = `opacity ${FADE}ms ease`;
    requestAnimationFrame(() => { const tg = show ? '1' : '0'; if (getComputedStyle(canvas).opacity === tg) finish(); else canvas.style.opacity = tg; });
    fadeTimer = setTimeout(finish, 3000);
  }

  GV.enterMicro = async function (Lt) {
    if (GV.stage === 'micro') { if (Lt != null) Lgoal = Lt; return; }
    if (GV.stage === 'space') return;
    let gp;
    try { [, gp] = await Promise.all([loadThree(), groundPath()]); } catch (e) { GV.err && GV.err(e); return; }
    if (!built) build();
    [path, pathWhy] = gp;
    pathWhy += ` → ${PATHS[path].name}`;
    canvas.style.opacity = '0'; canvas.style.pointerEvents = '';
    GV.stage = 'micro';
    document.body.classList.add('in-micro');
    resize();
    Lw = Lgoal = L_START;
    if (Lt != null) Lgoal = Math.max(L_MIN, Lt);
    lastInfo = null;
    render();
    if (!raf) loop();
    fadeTo(true, () => { if (GV.stage !== 'micro') return; document.body.classList.add('micro-solid'); GV.viewer.useDefaultRenderLoop = false; });
  };
  GV.exitMicro = function () {
    if (GV.stage !== 'micro') return;
    GV.stage = 'earth';
    GV.viewer.useDefaultRenderLoop = true;
    document.body.classList.remove('micro-solid');
    GV.viewer.scene.requestRender();
    Lgoal = Lw; canvas.style.pointerEvents = 'none';
    fadeTo(false, () => {
      if (GV.stage !== 'earth') return;
      document.body.classList.remove('in-micro');
      cancelAnimationFrame(raf); raf = 0;
      GV.updateScale && GV.updateScale();
    });
  };
  GV.microWidth = () => Math.pow(10, Lw);
  GV.microGoto = Lt => { if (GV.stage === 'micro') Lgoal = Math.max(L_MIN, Math.min(L_EXIT + 0.2, Lt)); };

  GV.initMicro = function () {
    const mc = document.getElementById('micro');
    const zoom = d => {
      // 何もない区間（10^-19〜10^-33 m）は 5 倍の速さで通り過ぎる（v010: 素粒子の区域が長すぎた）
      if (Lgoal < DESERT_B && Lgoal > DESERT_A) d *= 5;
      Lgoal = Math.max(L_MIN, Lgoal + d);
      if (Lgoal > L_EXIT) GV.exitMicro();   // 地面より引いたら地図に戻る
    };
    mc.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0016)); }, { passive: false });
    let drag = null, pinch = null;
    mc.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; mc.setPointerCapture(e.pointerId); });
    mc.addEventListener('pointermove', e => {
      if (!drag || pinch) return;
      yaw -= (e.clientX - drag.x) * 0.005; pitch = Math.max(0.15, Math.min(1.5, pitch + (e.clientY - drag.y) * 0.005));
      drag = { x: e.clientX, y: e.clientY };
    });
    mc.addEventListener('pointerup', () => { drag = null; });
    mc.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    mc.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !pinch) return;
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoom(-Math.log10(d / pinch)); pinch = d;
    }, { passive: true });
    mc.addEventListener('touchend', () => { pinch = null; });
    window.addEventListener('resize', resize);
    // 説明の欄の道の切りかえボタン
    document.getElementById('micro-info').addEventListener('click', e => { const b = e.target.closest('button[data-path]'); if (b) { setPath(b.dataset.path); pathWhy = pathWhy.replace(/→ .*$/, '→ ' + PATHS[path].name + L('（えらびなおし）', ' (chosen again)')); } });
    // 地図でいちばん寄った所（画面の幅 8 m 未満）から、さらにホイールで寄るとミクロへ
    const g = document.getElementById('globe');
    g.addEventListener('wheel', e => {
      if (GV.stage !== 'earth' || e.deltaY >= 0) return;
      if (GV.viewWidth() < 8) GV.enterMicro();
    }, { passive: true });
  };
})();
