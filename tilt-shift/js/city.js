// ジオラマに見えるわけ — 町（自前の 3D。単位はメートル）。建物・屋上の機械・木・地面・走る車・止まった車
// 素材: 外壁・道・地面は ambientCG（CC0）の写真のテクスチャ、空は Poly Haven の HDRI（CC0）。assets/ に 512px で置く
// 色は「光の量（リニア）」で計算し、最後のトーンマッピングは blur.js でまとめて行う（ぼけを光の量で混ぜるため）
'use strict';
const City = (() => {
  const N = 26, ROAD = 12, WALK = 3, P = 72;  // 区画の数・車道の幅・歩道の幅・区画の間隔（道の中心から中心）
  const HALF = N * P / 2;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const roadC = i => -HALF + i * P;           // i = 0..N の道の中心
  const parks = new Set(['3,9', '4,9', '10,3', '7,6', '15,14', '16,14', '18,4', '5,17', '12,19']);
  const lots = new Set(['1,4', '8,11', '12,7', '5,2', '17,9', '14,2', '2,14', '19,18']);   // 駐車場
  const pond = '13,12';
  const TEX = 'assets/tex/';
  const ENV = 0.45;   // 空からの光（HDRI）の強さ。太陽とのつりあい
  // 外壁の写真1枚が何 m にあたるか（窓の数と、1階 3.5 m・窓の間隔 3〜3.3 m から決めた）
  const FACADES = [
    { f: 'Facade008', w: 20, h: 24.5, rough: 0.85, metal: 0 },   // れんが色と窓
    { f: 'Facade018A', w: 20, h: 21, rough: 0.6, metal: 0.1 },
    { f: 'Facade019A', w: 21, h: 28, rough: 0.6, metal: 0.1 },
    { f: 'Facade020A', w: 21, h: 28, rough: 0.6, metal: 0.1 },
    { f: null, w: 0, h: 0, rough: 0.85, metal: 0 },               // タイル・しっくいの壁（窓は式で）
  ];
  const PLASTER = ['#e9e2d0', '#d8d2c4', '#efe6d2', '#d6c3ad', '#e4d3b6', '#f1efe8', '#cfd3cf', '#d9c7a7'];
  const CARS = ['#b8231b', '#f4f4f2', '#f4f4f2', '#1d2f5c', '#d9a419', '#1b1b1e', '#1b1b1e', '#8e959c', '#8e959c', '#2f6e45', '#e9e9e6', '#4b5d78'];

  const loader = new THREE.TextureLoader();
  function tex(name, onLoad) {
    const t = loader.load(TEX + name + '.jpg', onLoad);
    t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  }
  const img = name => new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = TEX + name + '.jpg'; });

  // 地面の絵（道・歩道・駐車場・公園・池・建物の足もとの影）。写真のテクスチャを模様にして canvas に描く
  async function groundTexture(size, footprints) {
    const [asp, pav, grass, conc] = await Promise.all(['Asphalt026C', 'PavingStones128', 'Grass004', 'Concrete034'].map(img));
    const S = size, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), span = N * P + 2 * ROAD, k = S / span, X = v => (v + span / 2) * k;
    const pat = (im, meters, tint) => {
      const p = g.createPattern(im, 'repeat'); const sc = meters * k / im.width;
      p.setTransform && p.setTransform(new DOMMatrix([sc, 0, 0, sc, 0, 0]));
      return p;
    };
    const fillPat = (p, x, y, w, h, alpha = 1) => { g.globalAlpha = alpha; g.fillStyle = p; g.fillRect(x, y, w, h); g.globalAlpha = 1; };
    fillPat(pat(asp, 7), 0, 0, S, S);                                          // 車道
    g.fillStyle = 'rgba(40,42,46,0.25)'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const key = i + ',' + j, x0 = roadC(i) + ROAD / 2, z0 = roadC(j) + ROAD / 2, w = P - ROAD;
      fillPat(pat(pav, 3), X(x0), X(z0), w * k, w * k);                       // 歩道
      const ix = X(x0 + WALK), iz = X(z0 + WALK), iw = (w - 2 * WALK) * k;
      if (key === pond) { g.fillStyle = '#1f3a44'; g.fillRect(ix, iz, iw, iw); g.fillStyle = 'rgba(160,190,200,.08)'; g.fillRect(ix, iz, iw, iw * 0.3); continue; }
      if (parks.has(key)) { fillPat(pat(grass, 4), ix, iz, iw, iw); g.fillStyle = 'rgba(70,90,30,.18)'; g.fillRect(ix, iz, iw, iw);
        g.strokeStyle = '#b9ae96'; g.lineWidth = 2.2 * k; g.beginPath(); g.moveTo(ix, iz + iw * 0.2); g.bezierCurveTo(ix + iw * 0.4, iz + iw * 0.5, ix + iw * 0.6, iz + iw * 0.3, ix + iw, iz + iw * 0.8); g.stroke(); continue; }
      fillPat(pat(conc, 5), ix, iz, iw, iw);                                   // 敷地（コンクリート）
      g.fillStyle = 'rgba(120,112,100,.25)'; g.fillRect(ix, iz, iw, iw);
      if (lots.has(key)) {                                                     // 駐車場の白線
        g.fillStyle = 'rgba(52,54,58,.85)'; g.fillRect(ix + 2 * k, iz + 2 * k, iw - 4 * k, iw - 4 * k);
        g.strokeStyle = 'rgba(235,235,230,.85)'; g.lineWidth = 0.15 * k;
        for (let r = 0; r < 3; r++) for (let s = 0; s * 2.5 < w - 2 * WALK - 6; s++) {
          const x = ix + (3 + s * 2.5) * k, y = iz + (4 + r * 16) * k; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 5 * k); g.stroke();
        }
      }
    }
    // 建物の足もとの暗がり（光がまわりこまない所。本物の写真でも見える）
    g.save(); g.fillStyle = 'rgba(0,0,0,.55)'; g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 4 * k;
    for (const b of footprints) g.fillRect(X(b.x - b.sx / 2), X(b.z - b.sz / 2), b.sx * k, b.sz * k);
    g.restore();
    // 車線・横断歩道・停止線
    g.strokeStyle = 'rgba(240,240,232,.9)'; g.lineWidth = Math.max(1, 0.15 * k); g.setLineDash([5 * k, 5 * k]);
    for (let i = 0; i <= N; i++) {
      const r = X(roadC(i));
      g.beginPath(); g.moveTo(r, 0); g.lineTo(r, S); g.stroke(); g.beginPath(); g.moveTo(0, r); g.lineTo(S, r); g.stroke();
    }
    g.setLineDash([]); g.fillStyle = 'rgba(240,240,232,.9)';
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const cx = roadC(i), cz = roadC(j), e = ROAD / 2;
      for (let s = -e + 0.5; s < e; s += 1.0) {
        g.fillRect(X(cx + s), X(cz - e - 4), 0.5 * k, 4 * k); g.fillRect(X(cx + s), X(cz + e), 0.5 * k, 4 * k);
        g.fillRect(X(cx - e - 4), X(cz + s), 4 * k, 0.5 * k); g.fillRect(X(cx + e), X(cz + s), 4 * k, 0.5 * k);
      }
      g.fillRect(X(cx - e - 5.5), X(cz), 0.4 * k, e * k); g.fillRect(X(cx + e + 5.1), X(cz - e), 0.4 * k, e * k);
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 16; return { tex: t, span };
  }

  // 外壁: 世界の座標で写真を貼る（建物の大きさがちがっても窓の大きさがそろう）。屋上はコンクリートの写真
  function facadeMaterial(F, roofTex, plasterTex) {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: F.rough, metalness: F.metal, map: F.f ? tex(F.f) : plasterTex, envMapIntensity: ENV });
    m.customProgramCacheKey = () => 'facade-' + (F.f || 'plaster');   // onBeforeCompile の文が同じだと、three.js が最初の1つのシェーダーを使い回すため
    m.onBeforeCompile = sh => {
      sh.uniforms.tRoof = { value: roofTex }; sh.uniforms.uTile = { value: new THREE.Vector2(F.w || 3, F.h || 3.4) };
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vON; varying float vOff;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 tsW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          tsW = instanceMatrix * tsW;
          vOff = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #endif
        vWP = (modelMatrix * tsW).xyz; vON = objectNormal;`);
      sh.fragmentShader = 'uniform sampler2D tRoof; uniform vec2 uTile; varying vec3 vWP; varying vec3 vON; varying float vOff;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `
        float along = abs(vON.x) > 0.5 ? vWP.z : vWP.x;
        vec4 texelColor; vec3 roofCol = vec3(0.0); float isRoof = 0.0;
        if (abs(vON.y) > 0.5) {
          texelColor = texture2D(tRoof, vWP.xz / 9.0 + vOff * 7.0);
          float tone = fract(vOff * 7.31);                              // 屋上の色は建物ごとに（灰・こげ茶・緑の防水）
          vec3 roofTint = tone < 0.55 ? vec3(0.13 + tone * 0.3) : tone < 0.75 ? vec3(0.2, 0.16, 0.13) : tone < 0.9 ? vec3(0.13, 0.19, 0.16) : vec3(0.36, 0.35, 0.33);
          texelColor.rgb = pow(texelColor.rgb, vec3(2.2));
          roofCol = roofTint * texelColor.rgb; isRoof = 1.0;
        } else {
          texelColor = mapTexelToLinear(texture2D(map, vec2(along / uTile.x + vOff * 5.0, vWP.y / uTile.y)));
          ${F.f ? '' : `
          float fl = fract(vWP.y / 3.4), cl = fract(along / 3.0 + vOff);
          float win = step(0.32, fl) * step(fl, 0.8) * step(0.16, cl) * step(cl, 0.84) * step(3.2, vWP.y);
          float slab = smoothstep(0.0, 0.06, fl) * smoothstep(0.32, 0.25, fl) * step(3.2, vWP.y);   // 階ごとの床の帯
          texelColor.rgb *= 1.0 - 0.18 * slab;
          texelColor.rgb = mix(texelColor.rgb * 1.1, vec3(0.03, 0.04, 0.055), win * 0.85);`}
          texelColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 9.0, vWP.y));   // 地面の近くは暗い
        }
        diffuseColor *= texelColor;`).replace('#include <color_fragment>', `#include <color_fragment>
        if (isRoof > 0.5) diffuseColor.rgb = roofCol;   // 屋上は壁の色に引きずられない`);
    };
    return m;
  }

  function build(scene, opt, onReady) {
    const d = new THREE.Object3D(), col = new THREE.Color();
    const roofTex = tex('Concrete034'), plasterTex = tex('Concrete034');

    // 建物（背の高いものは、低い台の上に塔）
    const boxes = [], foot = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const key = i + ',' + j; if (parks.has(key) || lots.has(key) || key === pond) continue;
      const x0 = roadC(i) + ROAD / 2 + WALK + 1, z0 = roadC(j) + ROAD / 2 + WALK + 1, w = P - ROAD - 2 * WALK - 2;
      const cx = (i + 0.5) / N - 0.5, cz = (j + 0.5) / N - 0.5, center = Math.max(0, 1 - Math.hypot(cx, cz) * 2.4);
      const split = rnd() < 0.6 ? 2 : (rnd() < 0.5 ? 3 : 1);
      for (let a = 0; a < split; a++) for (let b = 0; b < split; b++) {
        if (split === 3 && rnd() < 0.15) continue;                          // ところどころ空き地
        const cw = w / split, gap = split > 1 ? 3 : 0;
        let h = 7 + 28 * Math.pow(rnd(), 2.2) + 70 * center * Math.pow(rnd(), 1.5);
        const sx = cw - gap - rnd() * 5, sz = cw - gap - rnd() * 5, x = x0 + cw * (a + 0.5), z = z0 + cw * (b + 0.5);
        const F = h > 45 ? 1 + ((rnd() * 3) | 0) : h > 20 ? (rnd() < 0.55 ? 4 : (rnd() * 4) | 0) : 4;
        const c = F === 4 ? PLASTER[(rnd() * PLASTER.length) | 0] : '#ffffff';
        if (h > 45 && sx > 18) {                                            // 台＋塔
          boxes.push({ x, z, sx, sz, y: 0, h: 10 + rnd() * 8, F: 4, c: PLASTER[(rnd() * PLASTER.length) | 0] });
          boxes.push({ x: x + (rnd() - 0.5) * 4, z: z + (rnd() - 0.5) * 4, sx: sx * 0.62, sz: sz * 0.62, y: 0, h, F, c });
        } else boxes.push({ x, z, sx, sz, y: 0, h, F, c });
        foot.push({ x, z, sx, sz });
      }
    }
    const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
    FACADES.forEach((F, fi) => {
      const list = boxes.filter(b => b.F === fi); if (!list.length) return;
      const mesh = new THREE.InstancedMesh(bGeo, facadeMaterial(F, roofTex, plasterTex), list.length);
      list.forEach((b, k) => {
        d.position.set(b.x, b.y, b.z); d.scale.set(b.sx, b.h, b.sz); d.rotation.set(0, 0, 0); d.updateMatrix();
        mesh.setMatrixAt(k, d.matrix); mesh.setColorAt(k, col.set(b.c).convertSRGBToLinear().multiplyScalar(0.9 + rnd() * 0.15));
      });
      mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
    });

    // 屋上の機械（室外機・エレベーターの機械室・水槽）とふちの立ち上がり
    const roof = [];
    for (const b of boxes) {
      const top = b.y + b.h, n = 1 + ((rnd() * 4) | 0);
      for (let q = 0; q < n; q++) {
        const big = q === 0 && b.h > 15, w = big ? 5 + rnd() * 3 : 1.2 + rnd() * 2, dd = big ? 4 + rnd() * 3 : 1.2 + rnd() * 2, hh = big ? 3 + rnd() * 2 : 1 + rnd();
        roof.push([b.x + (rnd() - 0.5) * (b.sx - w - 2), top, b.z + (rnd() - 0.5) * (b.sz - dd - 2), w, hh, dd]);
      }
      const t = 0.4, ph = 1.1;   // パラペット
      roof.push([b.x, top, b.z - b.sz / 2 + t / 2, b.sx, ph, t], [b.x, top, b.z + b.sz / 2 - t / 2, b.sx, ph, t],
        [b.x - b.sx / 2 + t / 2, top, b.z, t, ph, b.sz], [b.x + b.sx / 2 - t / 2, top, b.z, t, ph, b.sz]);
    }
    const rMesh = new THREE.InstancedMesh(bGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, envMapIntensity: ENV }), roof.length);
    roof.forEach(([x, y, z, sx, sy, sz], k) => { d.position.set(x, y, z); d.scale.set(sx, sy, sz); d.updateMatrix(); rMesh.setMatrixAt(k, d.matrix); rMesh.setColorAt(k, col.setHSL(0.1, 0.04, 0.45 + rnd() * 0.3).convertSRGBToLinear()); });
    rMesh.castShadow = rMesh.receiveShadow = true; scene.add(rMesh);

    // 地面（読み込みを待って貼る）・町の外
    const span = N * P + 2 * ROAD;
    const groundMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, envMapIntensity: ENV });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshStandardMaterial({ color: new THREE.Color('#6f7a5c').convertSRGBToLinear(), roughness: 1, envMapIntensity: ENV }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true; scene.add(outer);

    // 木: でこぼこの樹冠（形をずらした球）。公園と並木
    const trees = [];
    for (const key of parks) {
      const [i, j] = key.split(',').map(Number), x0 = roadC(i) + ROAD / 2 + WALK, z0 = roadC(j) + ROAD / 2 + WALK, w = P - ROAD - 2 * WALK;
      for (let n = 0; n < 60; n++) trees.push([x0 + 3 + rnd() * (w - 6), z0 + 3 + rnd() * (w - 6), 2.2 + rnd() * 2.6]);
    }
    for (let i = 0; i <= N; i += 2) for (let s = -HALF + 6; s < HALF; s += 9) {
      const m = (((s + HALF) % P) + P) % P; if (m < 12 || m > P - 12) continue;
      trees.push([roadC(i) + ROAD / 2 + 1.4, s, 1.6 + rnd() * 0.8]); trees.push([s + 4, roadC(i) - ROAD / 2 - 1.4, 1.6 + rnd() * 0.8]);
    }
    const tGeo = new THREE.IcosahedronGeometry(1, 2), pos = tGeo.attributes.position;
    for (let v = 0; v < pos.count; v++) { const f = 0.8 + 0.35 * Math.abs(Math.sin(pos.getX(v) * 5.1 + pos.getZ(v) * 3.7) * Math.cos(pos.getY(v) * 4.3)); pos.setXYZ(v, pos.getX(v) * f, pos.getY(v) * f, pos.getZ(v) * f); }
    tGeo.computeVertexNormals();
    const tMesh = new THREE.InstancedMesh(tGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, envMapIntensity: ENV }), trees.length);
    trees.forEach(([x, z, r], k) => { d.position.set(x, r * 1.7, z); d.rotation.set(0, rnd() * 6, 0); d.scale.set(r, r * 0.95, r); d.updateMatrix(); tMesh.setMatrixAt(k, d.matrix); tMesh.setColorAt(k, col.setHSL(0.22 + rnd() * 0.07, 0.4, 0.2 + rnd() * 0.08).convertSRGBToLinear()); });
    tMesh.castShadow = tMesh.receiveShadow = true; scene.add(tMesh);

    // 車（車体＋屋根と窓）。走る車は車線を軸にそって進む（交差点では止まらない）。止まった車は道ばたと駐車場
    const cars = [];
    for (let n = 0; n < 900; n++) {
      const bus = rnd() < 0.06, truck = !bus && rnd() < 0.1, alongX = rnd() < 0.5, line = (rnd() * (N + 1)) | 0, dir = rnd() < 0.5 ? 1 : -1;
      cars.push({ kind: bus ? 2 : truck ? 1 : 0, alongX, off: roadC(line) + (rnd() < 0.3 ? 4.4 : 1.7) * dir, dir, s: (rnd() * 2 - 1) * HALF, v: (bus ? 9 : 10) + rnd() * 6, c: bus ? '#e9eef0' : truck ? '#f2f2ee' : CARS[(rnd() * CARS.length) | 0] });
    }
    for (const key of lots) {
      const [i, j] = key.split(',').map(Number), ix = roadC(i) + ROAD / 2 + WALK, iz = roadC(j) + ROAD / 2 + WALK;
      for (let r = 0; r < 3; r++) for (let s = 0; s * 2.5 < P - ROAD - 2 * WALK - 6; s++) if (rnd() < 0.7)
        cars.push({ kind: 0, alongX: false, off: ix + 3 + s * 2.5 + 1.25, dir: 1, s: iz + 6.5 + r * 16, v: 0, c: CARS[(rnd() * CARS.length) | 0] });
    }
    const DIM = [[4.4, 1.75, 0.75, 0.55], [7.5, 2.3, 2.6, 0.0], [11, 2.5, 2.9, 0.0]];   // 長さ・幅・車体の高さ・屋根の高さ
    const carGeo = new THREE.BoxGeometry(1, 1, 1); carGeo.translate(0, 0.5, 0);
    const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.35, envMapIntensity: ENV });
    const cabinMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.35, envMapIntensity: ENV });
    cabinMat.customProgramCacheKey = () => 'cabin';
    cabinMat.onBeforeCompile = sh => {   // 屋根は車の色、まわりは窓ガラス
      sh.vertexShader = 'varying vec3 vON;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vON = objectNormal;');
      sh.fragmentShader = 'varying vec3 vON;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n if (abs(vON.y) < 0.5) diffuseColor.rgb = vec3(0.02, 0.025, 0.03);');
    };
    const body = new THREE.InstancedMesh(carGeo, paint, cars.length), cabin = new THREE.InstancedMesh(carGeo, cabinMat, cars.length);
    cars.forEach((c, k) => { col.set(c.c).convertSRGBToLinear(); body.setColorAt(k, col); cabin.setColorAt(k, col); });
    body.castShadow = cabin.castShadow = true; scene.add(body, cabin);
    function placeCars() {
      cars.forEach((c, k) => {
        const [L, W, H, R] = DIM[c.kind];
        const px = c.alongX ? c.s : c.off, pz = c.alongX ? c.off : c.s;
        d.rotation.set(0, c.alongX ? 0 : Math.PI / 2, 0);
        d.position.set(px, 0.2, pz); d.scale.set(L, H, W); d.updateMatrix(); body.setMatrixAt(k, d.matrix);
        if (R > 0) { d.position.set(px - (c.alongX ? 0.2 * c.dir : 0), 0.2 + H, pz - (c.alongX ? 0 : 0.2 * c.dir)); d.scale.set(L * 0.52, R, W * 0.9); }
        else { d.position.set(px, 0.2 + H, pz); d.scale.set(L * 0.98, 0.05, W * 0.96); }
        d.updateMatrix(); cabin.setMatrixAt(k, d.matrix);
      });
      body.instanceMatrix.needsUpdate = cabin.instanceMatrix.needsUpdate = true;
    }
    function step(dt) {
      for (const c of cars) { if (!c.v) continue; c.s += c.v * c.dir * dt; if (c.s > HALF) c.s -= 2 * HALF; if (c.s < -HALF) c.s += 2 * HALF; }
      placeCars();
    }
    placeCars();

    // 空（HDRI）と、まわりの光
    const pmrem = new THREE.PMREMGenerator(opt.renderer);
    const waits = [
      groundTexture(opt.groundSize, foot).then(r => { groundMat.map = r.tex; groundMat.needsUpdate = true; }),
      new Promise(ok => new THREE.RGBELoader().setDataType(THREE.HalfFloatType).load('assets/sky_1k.hdr', hdr => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = pmrem.fromEquirectangular(hdr).texture; scene.background = hdr; ok();
      }, undefined, () => ok())),
    ];
    Promise.all(waits).then(onReady, e => { console.error(e); onReady(); });
    return { step, HALF, cars };
  }
  return { build };
})();
