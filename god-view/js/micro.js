// micro.js — 段階G「ミクロへ」。地上でいちばん寄った所からさらに寄ると、Three.js のミクロの世界へ。
// 画面の幅 W = 10^L m（宇宙と同じ考え方）。手のひら → 指紋 → 皮膚の細胞 → 細胞の中 → DNA → 分子・原子 → 原子核 → 陽子とクォーク → プランク長。
// どの層も「形は演出、大きさは本物」。層ごとに自分の単位（mm・µm・nm・pm・fm…）で作り、原点を中心に group の縮尺 = 単位 ÷ W で描く。
// 次の層に寄っていく先が原点に来るように置いてある（指先 → 細胞 → 核 → DNA → 炭素原子 → 原子核 → 陽子 → クォーク）。
'use strict';

(function () {
  const GV = window.GV;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const L_START = 0.55, L_EXIT = 0.75, L_MIN = -35.3;
  const FADE = 700;

  let THREE, renderer, scene, camera, canvas, infoEl, built = false, libP = null, raf = 0;
  let L = L_START, Lgoal = L_START, yaw = -Math.PI / 2, pitch = 1.05, t0 = performance.now();
  const layers = [];

  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function loadThree() {
    if (window.THREE) return Promise.resolve();
    return libP || (libP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = THREE_URL; s.onload = res; s.onerror = rej; document.head.appendChild(s); }));
  }
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u / 6 - 0.5; };

  // ---------- テクスチャ（canvas で描く） ----------
  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  // 手のひら（人さし指の先が画像の中央に来るように描く）
  function handTex() {
    return canvasTex(1024, (x, S) => {
      x.clearRect(0, 0, S, S);
      x.fillStyle = '#e9b99a'; x.strokeStyle = '#c98f74'; x.lineWidth = 6;
      const cx = S / 2, cy = S / 2;
      // 人さし指の先が (cx, cy)。指は上向き、手のひらは下
      const finger = (fx, fy, w, h) => { x.beginPath(); x.moveTo(fx - w / 2, fy + h); x.lineTo(fx - w / 2, fy + w / 2); x.arc(fx, fy + w / 2, w / 2, Math.PI, 0); x.lineTo(fx + w / 2, fy + h); x.fill(); x.stroke(); };
      finger(cx - 120, cy + 40, 95, 330);    // 中指（左）…画面の都合で少し並べ替え
      finger(cx, cy, 90, 360);               // 人さし指（中央）
      finger(cx + 115, cy + 70, 85, 300);
      finger(cx + 215, cy + 150, 75, 240);
      x.beginPath(); x.ellipse(cx + 40, cy + 470, 270, 200, 0, 0, Math.PI * 2); x.fill(); x.stroke();
      x.beginPath(); x.ellipse(cx - 250, cy + 430, 70, 190, -0.6, 0, Math.PI * 2); x.fill(); x.stroke();   // 親指
      // 手のひらのしわ
      x.strokeStyle = 'rgba(160,100,80,0.6)'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(cx - 200, cy + 420); x.quadraticCurveTo(cx + 40, cy + 360, cx + 280, cy + 420); x.stroke();
      x.beginPath(); x.moveTo(cx - 180, cy + 480); x.quadraticCurveTo(cx + 20, cy + 450, cx + 200, cy + 520); x.stroke();
      // 指先の指紋（うすく）
      x.strokeStyle = 'rgba(170,110,90,0.5)'; x.lineWidth = 1.5;
      for (let r = 4; r < 42; r += 4) { x.beginPath(); x.ellipse(cx, cy + 40, r * 0.8, r, 0, 0, Math.PI * 2); x.stroke(); }
    });
  }
  // 指紋の溝（間隔 約 0.5 mm）。中央が渦の中心
  function ridgeTex() {
    return canvasTex(2048, (x, S) => {
      const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, '#e6b597'); g.addColorStop(1, '#d9a284');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      x.strokeStyle = 'rgba(150,90,70,0.85)';
      // 30 mm の画像に 0.5 mm 間隔 → 60 本（1本 約34px）
      for (let r = 10; r < S * 0.75; r += 34) {
        x.lineWidth = 12 + rnd() * 4;
        x.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.02) {
          const w = 1 + 0.04 * Math.sin(a * 3 + r * 0.01);
          const px = S / 2 + Math.cos(a) * r * 0.82 * w, py = S / 2 + Math.sin(a) * r * w;
          a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.stroke();
      }
      // 汗の出口（点）
      x.fillStyle = 'rgba(120,70,60,0.6)';
      for (let i = 0; i < 300; i++) { const a = rnd() * 6.28, r = rnd() * S * 0.7; x.beginPath(); x.arc(S / 2 + Math.cos(a) * r * 0.82, S / 2 + Math.sin(a) * r, 5, 0, 6.28); x.fill(); }
    });
  }
  // 皮膚の表面の細胞（角質の細胞、さしわたし 約 30 µm）。1 mm の画像
  function cellTex() {
    return canvasTex(2048, (x, S) => {
      x.fillStyle = '#e7c0a8'; x.fillRect(0, 0, S, S);
      const n = 1300, pts = [];
      for (let i = 0; i < n; i++) pts.push([rnd() * S, rnd() * S]);
      // かんたんなボロノイ（近い点どうしの境目を線で）: 格子で近傍を探す
      const cell = 64, grid = {};
      pts.forEach((p, i) => { const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); (grid[k] = grid[k] || []).push(i); });
      const img = x.getImageData(0, 0, S, S), d = img.data;
      for (let py = 0; py < S; py += 2) for (let px = 0; px < S; px += 2) {
        let b1 = 1e9, b2 = 1e9;
        const gx = Math.floor(px / cell), gy = Math.floor(py / cell);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const i of grid[(gx + dx) + ',' + (gy + dy)] || []) {
          const dd = (pts[i][0] - px) ** 2 + (pts[i][1] - py) ** 2;
          if (dd < b1) { b2 = b1; b1 = dd; } else if (dd < b2) b2 = dd;
        }
        if (Math.sqrt(b2) - Math.sqrt(b1) < 3.5) for (let k = 0; k < 4; k++) { const o = ((py + (k >> 1)) * S + px + (k & 1)) * 4; d[o] = 170; d[o + 1] = 115; d[o + 2] = 100; }
      }
      x.putImageData(img, 0, 0);
    });
  }
  function glowTex(color) {
    return canvasTex(64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(0.3, color); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  }

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
  const plane = (size, tex) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, transparent: true })); return m; };
  const ball = (r, color, opts) => new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color, opts));

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

    // 1. 手のひら（単位 m。画像 0.2 m 四方、人さし指の先が原点）
    layer({ key: 'hand', name: 'てのひら', Lmin: -1.5, Lmax: 1.5, unit: 1, desc: '人さし指の先に寄っていきます。指先には指紋の溝があります。',
      build: g => g.add(plane(0.2, handTex())) });
    // 2. 指紋（単位 mm。30 mm 四方）
    layer({ key: 'ridge', name: '指紋の溝', Lmin: -3.1, Lmax: -1.4, unit: 1e-3, desc: '指紋の溝の間隔は約 0.5 mm。点は汗の出口です。',
      build: g => { const p = plane(30, ridgeTex()); p.position.z = 0.001; g.add(p); } });
    // 3. 皮膚の細胞・赤血球・細菌（単位 µm）
    layer({ key: 'skin', name: '皮膚の細胞', Lmin: -4.6, Lmax: -2.9, unit: 1e-6, desc: '皮膚のいちばん外側は、平たい細胞（約 30 µm）が重なってできています。赤い円盤は赤血球（約 7.5 µm）、緑の粒は細菌（約 2 µm）。', links: [['免疫のたたかい', '../immune-battle/'], ['血管の旅', '../blood-dive/']],
      build: g => {
        const p = plane(1000, cellTex()); g.add(p);
        const rbc = new THREE.TorusGeometry(2.6, 1.15, 12, 24);
        for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(rbc, mat(0xc0283a)); m.position.set(gauss() * 120, gauss() * 120, 3 + rnd() * 6); m.rotation.set(rnd() * 3, rnd() * 3, 0); g.add(m); }
        const bac = new THREE.CylinderGeometry(0.5, 0.5, 2, 10);   // 細菌（r128 の CapsuleGeometry は使えない）
        for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(bac, mat(0x58b05a)); m.position.set(gauss() * 90, gauss() * 90, 1); m.rotation.set(Math.PI / 2, 0, rnd() * 6); g.add(m); }
      } });
    // 4. 細胞の中（単位 µm。細胞 約 20 µm、核 約 6 µm を原点に）
    layer({ key: 'cell', name: '細胞の中', Lmin: -5.9, Lmax: -4.3, unit: 1e-6, desc: 'ひとつの細胞（約 20 µm）。紫は核（約 6 µm、DNA の入れもの）、オレンジの粒はミトコンドリア（約 1〜2 µm、エネルギーを作る）。',
      build: g => {
        const memb = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 32), new THREE.MeshStandardMaterial({ color: 0xf2d0c0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
        memb.position.set(-2, 3, 0); g.add(memb);
        g.add(ball(3, 0x7d4fb5, { transparent: true, opacity: 0.55 }));
        const mito = new THREE.CylinderGeometry(0.35, 0.35, 1.6, 10);
        for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(mito, mat(0xe0893a)); const a = rnd() * 6.28, r = 4 + rnd() * 5; m.position.set(-2 + Math.cos(a) * r, 3 + Math.sin(a) * r, gauss() * 8); m.rotation.set(rnd() * 3, rnd() * 3, 0); g.add(m); }
        const ribo = new THREE.SphereGeometry(0.08, 6, 4);
        for (let i = 0; i < 400; i++) { const m = new THREE.Mesh(ribo, mat(0x9fb3ff)); const a = rnd() * 6.28, b = Math.acos(2 * rnd() - 1), r = 3.5 + rnd() * 6; m.position.set(-2 + r * Math.sin(b) * Math.cos(a), 3 + r * Math.sin(b) * Math.sin(a), r * Math.cos(b)); g.add(m); }
      } });
    // 5. 核の中の染色体の糸（クロマチン、太さ 約 30 nm。単位 nm）
    layer({ key: 'chromatin', name: '核の中の DNA の糸', Lmin: -7.1, Lmax: -5.6, unit: 1e-9, desc: '核の中では、長い DNA が糸巻き（ヌクレオソーム）に巻かれ、さらに折りたたまれて入っています（太さ 約 30 nm）。ひとつの細胞の DNA をのばすと約 2 m にもなります。',
      build: g => {
        const pts = []; let p = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < 160; i++) { pts.push(p.clone()); p = p.add(new THREE.Vector3(gauss() * 160, gauss() * 160, gauss() * 120)); }
        pts.reverse(); for (let i = 0; i < 160; i++) { pts.push(pts[i].clone().multiplyScalar(-1)); }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(0, 200)), 1200, 15, 8, false), mat(0x8f6ad0)));
      } });
    // 6. 糸巻き（ヌクレオソーム、約 10 nm）と DNA
    layer({ key: 'nucleosome', name: 'DNA の糸巻き', Lmin: -8.2, Lmax: -6.8, unit: 1e-9, desc: 'ヌクレオソーム: ヒストンというたんぱく質の糸巻き（約 10 nm）に、DNA が約 2 回巻きついています。',
      build: g => {
        for (let i = -4; i <= 4; i++) {
          const c = new THREE.Vector3(i * 14, Math.sin(i) * 6, Math.cos(i * 1.3) * 5);
          const h = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 5.7, 24), mat(0xd9c27a)); h.position.copy(c); h.rotation.x = Math.PI / 2; g.add(h);
          const pts = []; for (let a = 0; a <= Math.PI * 4; a += 0.2) pts.push(new THREE.Vector3(c.x + Math.cos(a) * 6, c.y + Math.sin(a) * 6, c.z - 3 + a / (Math.PI * 4) * 6));
          g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 1, 6, false), mat(0x5aa0e0)));
        }
        // 寄っていく先（原点）が、真ん中の糸巻きに巻きついた DNA の上に来るようにずらす（v009: 糸巻きの中心だと二重らせんが隠れた）
        g.children.forEach(m => { m.position.x -= 6; m.position.z += 3; });   // 糸巻きも DNA も同じだけ（DNA の位置は形の中にあり、mesh の位置は 0）
      } });
    // 7. 二重らせん（太さ 2 nm、1 回転 3.4 nm）
    layer({ key: 'helix', name: 'DNA の二重らせん', Lmin: -9.1, Lmax: -7.7, unit: 1e-9, desc: 'DNA は 2 本の鎖がねじれた「二重らせん」（太さ 約 2 nm、1 回転で約 3.4 nm）。はしごの段は塩基の組（A-T と G-C）で、これが遺伝の情報です。',
      build: g => {
        const s1 = [], s2 = [], cols = [0xe05050, 0x50b050, 0x4a7fe0, 0xe0c040];
        for (let z = -20; z <= 20; z += 0.34) { const a = z / 3.4 * Math.PI * 2; s1.push(new THREE.Vector3(Math.cos(a), Math.sin(a), z)); s2.push(new THREE.Vector3(Math.cos(a + 2.4), Math.sin(a + 2.4), z));
          // はしごの段: 2 本の鎖の点を結ぶ（円柱は y 向きなので、xy 平面の向きに回す）
          const dx = Math.cos(a + 2.4) - Math.cos(a), dy = Math.sin(a + 2.4) - Math.sin(a), len = Math.hypot(dx, dy);
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 6), mat(cols[Math.floor(rnd() * 4)]));
          r.position.set((Math.cos(a) + Math.cos(a + 2.4)) / 2, (Math.sin(a) + Math.sin(a + 2.4)) / 2, z);
          r.rotation.z = Math.atan2(dy, dx) - Math.PI / 2; g.add(r); }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s1), 400, 0.18, 8), mat(0xdfe6f0)));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s2), 400, 0.18, 8), mat(0xdfe6f0)));
        g.rotation.x = Math.PI / 2;
      } });
    // 8. 分子と原子（単位 pm）。原点に炭素原子
    layer({ key: 'atoms', name: '分子と原子', Lmin: -10.2, Lmax: -8.8, unit: 1e-12, desc: '物はすべて原子でできています。灰色は炭素（約 140 pm）、赤は酸素、青は窒素、白は水素。まわりの赤白の 3 つ組は水の分子（約 300 pm）。',
      build: g => {
        const C = 0x555c66, O = 0xd23a3a, N = 0x3a62d2, H = 0xf2f2f2, P = 0xe0912a;
        const add = (x, y, z, c, r) => { const b = ball(r, c); b.position.set(x, y, z); g.add(b); };
        // 塩基らしい六角形の環（原点に炭素）
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(Math.cos(a) * 140 - 140, Math.sin(a) * 140, 0, i % 3 === 1 ? N : C, 70); }
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(Math.cos(a) * 250 - 140, Math.sin(a) * 250, 0, i % 2 ? H : O, i % 2 ? 40 : 66); }
        add(-600, 200, 80, P, 100);
        // 水の分子
        for (let i = 0; i < 40; i++) {
          const cx = gauss() * 2400, cy = gauss() * 2400, cz = 200 + rnd() * 500, a = rnd() * 6.28;
          add(cx, cy, cz, O, 66);
          add(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96, cz, H, 38);
          add(cx + Math.cos(a + 1.82) * 96, cy + Math.sin(a + 1.82) * 96, cz, H, 38);
        }
      } });
    // 9. 炭素原子の電子の雲（単位 pm）。点の濃さ = 電子が見つかる確率（1s と 2s・2p をかんたんに）
    layer({ key: 'atom', name: '炭素原子', Lmin: -12.3, Lmax: -9.8, unit: 1e-12, desc: '原子の外側は、電子が「雲」のように広がっている（点が濃いほど見つかりやすい）。中心の原子核はとても小さく、原子の大きさの約 10 万分の 1。原子の中はほとんど空っぽです。', links: [['量子の実験室', '../quantum/']],
      build: g => {
        const pos = [], col = [];
        for (let i = 0; i < 14000; i++) {
          const inner = i < 2500;
          const r = inner ? -Math.log(rnd() * rnd()) * 6 : (-Math.log(rnd() * rnd() * rnd()) * 18);
          const th = rnd() * 6.28, ph = Math.acos(2 * rnd() - 1);
          let x = r * Math.sin(ph) * Math.cos(th), y = r * Math.sin(ph) * Math.sin(th), z = r * Math.cos(ph);
          if (!inner && i % 3 === 0) { x *= 1.6; y *= 0.6; z *= 0.6; }   // 2p の向き（ダンベル形）をうっすら
          pos.push(x, y, z); col.push(inner ? 0.9 : 0.55, inner ? 1 : 0.8, 1);
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex('#9fc8ff') })));   // v009: 2px では暗すぎた
      } });
    // 10. 原子の中のすきま（原子核は点にしか見えない）
    layer({ key: 'gap', name: '原子の中のすきま', Lmin: -14.3, Lmax: -11.8, unit: 1e-15, desc: '電子の雲の内側は、ほとんど何もない空間。もし原子が東京ドームの大きさなら、原子核はまん中の 1 粒のビー玉くらいです。',
      build: g => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffb36b'), sizeAttenuation: false, transparent: true, depthWrite: false })); s.scale.set(0.07, 0.07, 1); g.add(s); } });
    // 11. 原子核（炭素 12: 陽子 6・中性子 6、単位 fm）。原点に陽子
    layer({ key: 'nucleus', name: '原子核', Lmin: -15.3, Lmax: -13.9, unit: 1e-15, desc: '炭素の原子核: 陽子（赤、＋の電気）6 個と中性子（青）6 個が、強い力でぎゅっと集まっている（さしわたし 約 5 fm）。',
      build: g => {
        const P = [[0.3, 0.2, 0]];   // 原点の近くの陽子（次の層「陽子の中」の殻と同じ位置）
        while (P.length < 12) { const v = [gauss() * 4, gauss() * 4, gauss() * 4]; if (Math.hypot(...v) < 2.2 && P.every(q => Math.hypot(q[0] - v[0], q[1] - v[1], q[2] - v[2]) > 1.3)) P.push(v); }
        // 原点の陽子以外は、さらに寄るとうすくする（v009: カメラが原子核の中に入り、ほかの陽子・中性子が画面をふさいだ）
        P.forEach((v, i) => { const b = ball(0.84, i % 2 ? 0x3c6ee0 : 0xe04040); b.position.set(...v); b.userData.fadeBelow = i ? [-14.5, -14.0] : [-14.75, -14.35]; g.add(b); });   // 原点の陽子も、中が見える層に入るときにうすく
      } });
    // 12. 陽子の中（クォーク 3 つとグルーオン）
    layer({ key: 'proton', name: '陽子の中', Lmin: -16.6, Lmax: -14.4, unit: 1e-15, desc: '陽子（半径 約 0.84 fm）の中には、クォークが 3 つ（アップ 2 つ・ダウン 1 つ）。グルーオン（ばね）がクォークどうしを強く結びつけています。色は「色荷」というクォークの性質の演出。',
      build: g => {
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.84, 40, 24), new THREE.MeshStandardMaterial({ color: 0xe04040, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
        shell.position.set(0.3, 0.2, 0); g.add(shell);
        const q = [[0, 0, 0, 0x3a7be0, 'd'], [0.55, 0.35, 0.1, 0xe04a4a, 'u'], [0.45, -0.2, -0.3, 0x46c060, 'u']];
        // クォークの玉は見せるための大きさ。寄ると光の点（次の層）に入れかえる（v009: 玉が画面いっぱいになった）
        q.forEach(([x, y, z, c]) => { const b = ball(0.06, c, { emissive: new THREE.Color(c), emissiveIntensity: 0.6 }); b.position.set(x, y, z); b.userData.fadeBelow = [-16.1, -15.7]; g.add(b); });
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
          const a = new THREE.Vector3(...q[i].slice(0, 3)), b = new THREE.Vector3(...q[j].slice(0, 3)), pts = [];
          for (let k = 0; k <= 40; k++) { const p = a.clone().lerp(b, k / 40); p.z += Math.sin(k * 1.2) * 0.04; p.y += Math.cos(k * 1.2) * 0.04; pts.push(p); }
          g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.012, 5), mat(0xffd25e, { emissive: new THREE.Color(0x553300) })));
        }
      } });
    // 13. クォーク（大きさは測れないほど小さい。光の点で）
    layer({ key: 'quark', name: 'クォーク', Lmin: -19.6, Lmax: -16.4, unit: 1e-18, desc: 'クォークには、今の実験で分かる大きさがありません（あっても 10^-18 m よりずっと小さい）。電子も同じで、「点」のような粒と考えられています。',
      build: g => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#6fa8ff'), sizeAttenuation: false, transparent: true, depthWrite: false })); s.scale.set(0.12, 0.12, 1); g.add(s); } });
    // 14. プランク長のあたり（想像）: 時間と空間そのものがゆらぐ「泡」
    layer({ key: 'planck', name: 'プランク長', Lmin: -36, Lmax: -33.4, unit: 1e-35, desc: 'プランク長（約 1.6×10^-35 m）。これより小さい世界では、空間や時間そのものがどうなっているか、今の物理では分かりません。泡のような姿は想像です。',
      build: g => {
        const pos = [];
        for (let i = 0; i < 3000; i++) pos.push(gauss() * 20, gauss() * 20, gauss() * 20);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, color: 0x8f7bff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex('#b8a8ff') })));
        g.userData.foam = geo;
      } });
    built = true;
    GV._micro = { layers, scene, camera, get L() { return L; }, set L(v) { L = Lgoal = v; } };   // デバッグ用の窓口（L を直接変えられる）
  }

  // 何もない区間（クォークとプランク長の間）の説明
  const DESERT = { name: 'わからない広がり', desc: '10^-19 m から 10^-34 m までは、まだ実験で確かめられていない長さです。ここに何があるのか（ないのか）は、これからの研究の課題です。' };

  function render() {
    if (GV.stage !== 'micro' || !built) return;
    L += (Lgoal - L) * 0.18;
    if (!GV.viewer.useDefaultRenderLoop) GV.viewer.clock.tick();
    const W = Math.pow(10, L);
    const dist = 0.5 / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
    camera.position.set(dist * Math.cos(pitch) * Math.cos(yaw), dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch));
    camera.up.set(0, 0, 1); camera.lookAt(0, 0, 0);
    camera.near = dist * 0.01; camera.far = dist * 100; camera.updateProjectionMatrix();
    let best = null, bestV = 0;
    const t = (performance.now() - t0) / 1000;
    for (const ly of layers) {
      const v = smooth(ly.Lmin - 0.3, ly.Lmin + 0.3, L) * (1 - smooth(ly.Lmax - 0.3, ly.Lmax + 0.3, L));
      ly.group.visible = v > 0.01;
      if (!ly.group.visible) continue;
      const sc = ly.unit / W;
      ly.group.scale.set(sc, sc, sc);
      // うすくなっているあいだは奥行きを書かない（書くと、うすい玉の内側にあるものが隠れる。v009: 陽子の中のクォークが見えなかった）
      ly.group.traverse(o => { if (!o.material) return; const op = (o.material.userData.base ?? 1) * v * (o.userData.fadeBelow ? smooth(o.userData.fadeBelow[0], o.userData.fadeBelow[1], L) : 1); o.material.opacity = op; o.material.depthWrite = o.material.userData.dw && op > 0.98; });
      if (ly.key === 'planck') { const p = ly.group.userData.foam.attributes.position; for (let i = 0; i < 60; i++) { const k = Math.floor(Math.random() * p.count); p.setXYZ(k, gauss() * 20, gauss() * 20, gauss() * 20); } p.needsUpdate = true; }
      if (ly.key === 'proton') ly.group.rotation.z = t * 0.3;
      if (v >= bestV) { bestV = v; best = ly; }   // 同じなら奥（後ろに並ぶ小さい方）の層の説明
    }
    renderer.render(scene, camera);
    showInfo(bestV > 0.3 ? best : DESERT);
    if (GV.onSpace) GV.onSpace(W);
  }

  let lastInfo = null;
  function showInfo(ly) {
    if (ly === lastInfo) return;
    lastInfo = ly;
    const links = (ly.links || []).map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}へ</a>`).join('');
    infoEl.innerHTML = `<b>${ly.name}</b> <span class="tag tag-fx">演出</span> <small>形は演出、大きさは本物</small><br>${ly.desc}${links ? '<div class="micro-links">' + links + '</div>' : ''}`;
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
    try { await loadThree(); } catch (e) { GV.err && GV.err(e); return; }
    if (!built) build();
    canvas.style.opacity = '0'; canvas.style.pointerEvents = '';
    GV.stage = 'micro';
    document.body.classList.add('in-micro');
    resize();
    L = Lgoal = L_START;
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
    Lgoal = L; canvas.style.pointerEvents = 'none';
    fadeTo(false, () => {
      if (GV.stage !== 'earth') return;
      document.body.classList.remove('in-micro');
      cancelAnimationFrame(raf); raf = 0;
      GV.updateScale && GV.updateScale();
    });
  };
  GV.microWidth = () => Math.pow(10, L);
  GV.microGoto = Lt => { if (GV.stage === 'micro') Lgoal = Math.max(L_MIN, Math.min(L_EXIT + 0.2, Lt)); };

  GV.initMicro = function () {
    const mc = document.getElementById('micro');
    const zoom = d => {
      Lgoal = Math.max(L_MIN, Lgoal + d);
      if (Lgoal > L_EXIT) GV.exitMicro();   // 手のひらより引いたら地図に戻る
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
    // 地図でいちばん寄った所（画面の幅 8 m 未満）から、さらにホイールで寄るとミクロへ
    const g = document.getElementById('globe');
    g.addEventListener('wheel', e => {
      if (GV.stage !== 'earth' || e.deltaY >= 0) return;
      if (GV.viewWidth() < 8) GV.enterMicro();
    }, { passive: true });
  };
})();
