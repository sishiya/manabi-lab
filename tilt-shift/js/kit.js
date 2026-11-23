// ジオラマに見えるわけ — 場面の共通の部品（単位 m）
//  ・材質: 世界の座標のノイズで、色むら・汚れ・雨だれ・凹凸を足す（遠目で「一色の面」に見えないように）
//  ・人・車・木・水・地面の絵。どれも InstancedMesh でまとめて描く
// 色は光の量（リニア）で計算し、トーンマッピングは blur.js でまとめて行う。instance の色は convertSRGBToLinear を忘れない。
'use strict';
const Kit = (() => {
  const time = { value: 0 };        // 水の波・旗などが使う時間（秒）
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const setSeed = s => { seed = s; };
  const pick = a => a[(rnd() * a.length) | 0];
  const lin = c => new THREE.Color(c).convertSRGBToLinear();
  const ENV = 0.5;

  // ---- GLSL のノイズ（値ノイズ＋重ね合わせ）。コードは自前 ----
  const NOISE = `
    float kH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float kN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(kH(i), kH(i + vec3(1,0,0)), f.x), mix(kH(i + vec3(0,1,0)), kH(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(kH(i + vec3(0,0,1)), kH(i + vec3(1,0,1)), f.x), mix(kH(i + vec3(0,1,1)), kH(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float kF(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * kN(p); p *= 2.03; a *= 0.5; } return s; }
    float kH2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // セルのノイズ（Worley）: いちばん近い点からのずれ（xy）と、点ごとの 0〜1（z）。木の樹冠のつぶつぶに使う
    vec3 kW(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0; vec2 best = vec2(0.0); float id = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = vec2(kH2(i + g), kH2(i + g + 17.3)) * 0.8 + 0.1; vec2 r = g + o - f; float d = dot(r, r); if (d < d1) { d1 = d; best = r; id = kH2(i + g + 5.1); } }
      return vec3(-best, id); }`;

  // 材質を作る。fn は GLSL（diffuseColor.rgb を変え、gRough・gMetal・gNP（世界の向きの法線のずれ）・gEmis を決められる）
  // 使える値: vWP（世界の位置）・vOP（物の中の位置。箱なら -0.5〜0.5）・vON（物の中の法線）・vSc（instance の大きさ）・vRnd（instance ごとの 0〜1）・uTime
  const made = new Set();
  function mat(name, p, fn = '', pre = '') {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: '#ffffff', roughness: 0.9, metalness: 0, envMapIntensity: ENV }, p));
    m.customProgramCacheKey = () => 'kit-' + name;   // onBeforeCompile の文がちがっても three.js が使い回さないように
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vOP; varying vec3 vON; varying vec3 vSc; varying float vRnd;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vOP = position; vON = objectNormal; vSc = vec3(1.0); vRnd = 0.5;
          vec4 kW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            kW = instanceMatrix * kW;
            vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vRnd = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233)) + instanceMatrix[3].y * 3.7) * 43758.5453);
          #endif
          vWP = (modelMatrix * kW).xyz;`);
      sh.fragmentShader = 'uniform float uTime; varying vec3 vWP; varying vec3 vOP; varying vec3 vON; varying vec3 vSc; varying float vRnd;\n' +
        'float gRough = -1.0; float gMetal = -1.0; vec3 gNP = vec3(0.0); vec3 gEmis = vec3(0.0);\n' + NOISE + pre + '\n' +
        sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n{' + fn + '}')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (gRough >= 0.0) roughnessFactor = gRough;')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (gMetal >= 0.0) metalnessFactor = gMetal;')
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (viewMatrix * vec4(gNP, 0.0)).xyz);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmis;');
    };
    made.add(name);
    return m;
  }

  // よく使う GLSL の部品
  const G = {
    // 森を上から見た樹冠（直径 cell m のつぶ。まるい盛り上がりの陰と、木ごとの色のちがい）。k は効きの強さ
    canopy: (cell = 7, k = 1) => `{ vec3 w = kW(vWP.xz / ${cell.toFixed(1)}), w2 = kW(vWP.xz / ${(cell * 0.45).toFixed(2)} + 3.7);
        float dd = length(w.xy) * 1.35, dome = sqrt(max(0.0, 1.0 - dd * dd));
        float sh = mix(1.0, 0.28 + 0.85 * dome * (0.75 + 0.25 * sqrt(max(0.0, 1.0 - dot(w2.xy, w2.xy) * 1.8))), ${k.toFixed(2)});
        diffuseColor.rgb *= sh * (0.78 + 0.44 * w.z);
        gNP += vec3(w.x, 0.0, w.y) * 2.2 * ${k.toFixed(2)}; }`,
    // 世界の座標の色むら（大きいむら＋細かいざらつき）。k は強さ
    grime: (k = 1) => `{ float g1 = kF(vWP * 0.07 + vRnd * 9.0), g2 = kN(vWP * 1.7);
        diffuseColor.rgb *= 1.0 - ${(0.22 * k).toFixed(3)} * smoothstep(0.35, 0.75, g1) + ${(0.08 * k).toFixed(3)} * (g2 - 0.5); }`,
    // 地面の色むら（世界の xz）
    ground: (k = 1, s = 1) => `{ vec3 q = vec3(vWP.x, 0.0, vWP.z) * ${s.toFixed(3)};
        float a = kF(q * 0.02), b = kF(q * 0.15 + 3.1), c = kN(q * 2.3);
        diffuseColor.rgb *= 1.0 + ${(0.35 * k).toFixed(3)} * (a - 0.5) + ${(0.22 * k).toFixed(3)} * (b - 0.5) + ${(0.12 * k).toFixed(3)} * (c - 0.5); }`,
  };

  // ---- 箱（1×1×1、底が y=0）を並べる ----
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  // items: [{x,y,z, sx,sy,sz, ry, c}]
  function inst(scene, geo, material, items, o = {}) {
    if (!items.length) return null;
    const m = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((b, k) => {
      tmp.position.set(b.x, b.y || 0, b.z); tmp.rotation.set(b.rx || 0, b.ry || 0, b.rz || 0); tmp.scale.set(b.sx, b.sy, b.sz); tmp.updateMatrix();
      m.setMatrixAt(k, tmp.matrix); m.setColorAt(k, b.c ? (b.c.isColor ? b.c : lin(b.c)) : col.setRGB(1, 1, 1));
    });
    m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
    m.frustumCulled = false;   // InstancedMesh の範囲は元の形（原点の小さな箱）で決まるので、切らない
    scene.add(m); return m;
  }
  function setInst(m, k, x, y, z, sx, sy, sz, ry = 0) {
    tmp.position.set(x, y, z); tmp.rotation.set(0, ry, 0); tmp.scale.set(sx, sy, sz); tmp.updateMatrix(); m.setMatrixAt(k, tmp.matrix);
  }

  // ---- 建物の壁と屋上 ----
  // style: 'office'（ガラスの壁）・'mansion'（ベランダの集合住宅）・'tile'（タイルの事務所）・'shop'（低い商店）・'house'（家の壁）
  //   屋上（上向きの面）はどれもコンクリートのしみ。1階は店のガラスとひさし（mansion・tile・shop）
  const ROOF = `
    float tone = fract(vRnd * 7.31);   // 屋上の防水の色は建物ごと（灰・こげ茶・緑がかった灰・明るい灰）
    vec3 rc = tone < 0.5 ? vec3(0.16 + tone * 0.2) : tone < 0.7 ? vec3(0.17, 0.15, 0.13) : tone < 0.85 ? vec3(0.15, 0.18, 0.17) : vec3(0.32, 0.32, 0.3);
    rc = mix(rc, diffuseColor.rgb * 0.3, 0.25) * 0.85;
    rc *= 0.8 + 0.4 * kN(vec3(floor(vWP.x / 1.0), floor(vWP.z / 1.0), vRnd * 3.0) * 0.37);   // 防水シートの継ぎ目
    float st = kF(vWP * vec3(0.25, 0.0, 0.25) + vRnd * 13.0);
    rc *= 0.7 + 0.5 * st;
    rc *= 1.0 - 0.25 * smoothstep(0.55, 0.7, kF(vWP * 0.6 + 4.0));   // 水たまりのあと・黒いしみ rc *= 0.92 + 0.16 * kN(vWP * 2.0);
    float edge = min(vSc.x * (0.5 - abs(vOP.x)), vSc.z * (0.5 - abs(vOP.z)));
    rc *= mix(1.25, 1.0, smoothstep(0.2, 0.5, edge));   // ふちの立ち上がりの上は明るい
    rc *= mix(0.7, 1.0, smoothstep(0.4, 1.6, edge));     // そのすぐ内側は陰
    diffuseColor.rgb = rc; gRough = 0.92;`;
  const FACADE_PRE = `
    // 1階の店（ガラス・ひさし・看板の色）
    void kShop(inout vec3 c, float along, float y, float rr, inout float rough, inout float metal) {
      float bay = floor(along / 5.5), fb = fract(along / 5.5);
      float h = kH2(vec2(bay, rr * 91.0));
      vec3 sign = h < 0.25 ? vec3(0.55, 0.08, 0.06) : h < 0.45 ? vec3(0.05, 0.18, 0.45) : h < 0.6 ? vec3(0.75, 0.55, 0.12) : h < 0.75 ? vec3(0.08, 0.3, 0.12) : vec3(0.6);
      float glass = step(0.08, fb) * step(fb, 0.92) * step(0.15, y) * step(y, 2.6);
      c = mix(c * 0.8, vec3(0.025, 0.03, 0.035) + 0.04 * kN(vec3(along * 3.0, y * 3.0, rr)), glass);
      if (glass > 0.5) { rough = 0.1; metal = 0.2; }
      float band = step(2.7, y) * step(y, 3.4);
      c = mix(c, sign * (0.8 + 0.4 * kN(vec3(along, y * 8.0, 1.0))), band * 0.9);
    }`;
  const WALL_START = `
    vec3 c = diffuseColor.rgb * 0.8; float rough = 0.85, metal = 0.0;
    float along = abs(vON.x) > 0.5 ? vWP.z : vWP.x;
    along += vRnd * 37.0;`;
  const WALL_END = `
    // 雨だれのすじ（上から下へ。窓の下のふちから）・下ほど暗い・色むら
    float streak = kN(vec3(along * 1.4, vWP.y * 0.05, vRnd * 40.0)) * kN(vec3(along * 0.3, vWP.y * 0.02, vRnd * 7.0));
    c *= 1.0 - 0.28 * smoothstep(0.25, 0.6, streak);
    c *= mix(0.72, 1.0, smoothstep(0.0, 6.0, vWP.y));
    c *= 0.9 + 0.2 * kF(vWP * 0.05 + vRnd * 5.0);
    c *= mix(1.15, 1.0, smoothstep(0.25, 0.6, vSc.y * (1.0 - vOP.y)));   // 屋上のふち（笠木）は明るい
    diffuseColor.rgb = c; gRough = rough; gMetal = metal;`;
  const WALLS = {
    office: `
      float fl = fract(vWP.y / 3.9), cl = fract(along / 1.6);
      float cellId = floor(vWP.y / 3.9) * 37.0 + floor(along / 1.6);
      float mull = 1.0 - step(0.05, cl) * step(cl, 0.95) * step(0.06, fl) * step(fl, 0.94);
      float spandrel = step(0.74, fl);
      float n = kH2(vec2(cellId, vRnd * 17.0));
      vec3 glassC = c * (0.22 + 0.14 * n);
      c = mix(glassC, c * 0.55, max(mull, spandrel * 0.85));
      rough = mix(0.03 + 0.1 * n, 0.5, max(mull, spandrel)); metal = mix(0.85, 0.2, max(mull, spandrel));
      // ガラスのゆがみ（パネルごとに映りこみの向きが少しずれる）
      gNP = vec3(kH2(vec2(cellId, 3.1)) - 0.5, 0.0, kH2(vec2(cellId, 7.7)) - 0.5) * 0.08;
      if (vWP.y < 4.5) { c = vec3(0.03); rough = 0.12; }`,
    mansion: `
      float fl = fract(vWP.y / 2.9), unit = fract(along / 6.2), uid = floor(along / 6.2) + floor(vWP.y / 2.9) * 13.0;
      bool front = vON.z > 0.5 || vON.x > 0.5;   // ベランダの面
      if (front && vWP.y > 3.6) {
        float rail = step(0.0, fl) * step(fl, 0.38);                // 手すりの壁（明るい）
        float slab = step(0.92, fl);                                 // 床の厚み
        float win = step(0.42, fl) * step(fl, 0.9) * step(0.1, unit) * step(unit, 0.9);
        float h = kH2(vec2(uid, vRnd * 31.0));
        vec3 inside = vec3(0.14, 0.15, 0.16) + (h < 0.3 ? vec3(0.12, 0.1, 0.08) : vec3(0.0));   // カーテンのある部屋
        c = mix(c, inside, win); if (win > 0.5) { rough = 0.04 + 0.1 * h; metal = 0.7; }
        c = mix(c, c * 0.45, step(0.38, fl) * step(fl, 0.46));      // 手すりの下の陰
        c = mix(c, c * 1.12, rail);
        // 洗濯物・ふとん（ところどころ）
        float lw = step(0.15, fl) * step(fl, 0.36) * step(0.62, h) * step(0.2, unit) * step(unit, 0.55 + 0.3 * h);
        vec3 cloth = h < 0.75 ? vec3(0.8, 0.78, 0.72) : h < 0.85 ? vec3(0.25, 0.35, 0.6) : vec3(0.75, 0.45, 0.4);
        c = mix(c, cloth * (0.8 + 0.3 * kN(vec3(along * 9.0, vWP.y * 9.0, 1.0))), lw);
        c *= 1.0 - 0.15 * slab;
        c *= mix(0.86, 1.0, step(0.04, unit) * step(unit, 0.96));   // 部屋のしきり
      } else if (vWP.y > 3.6) {
        float win = step(0.45, fl) * step(fl, 0.8) * step(0.35, unit) * step(unit, 0.62);
        c = mix(c, vec3(0.15, 0.16, 0.17), win * 0.9); if (win > 0.5) { rough = 0.06; metal = 0.7; }
      } else kShop(c, along, vWP.y, vRnd, rough, metal);`,
    tile: `
      float fl = fract(vWP.y / 3.6), cl = fract(along / 3.0);
      float win = step(0.32, fl) * step(fl, 0.8) * step(0.22, cl) * step(cl, 0.78);
      float id = floor(vWP.y / 3.6) * 41.0 + floor(along / 3.0);
      c *= 0.96 + 0.08 * kH2(vec2(floor(along / 0.3), floor(vWP.y / 0.1)));   // タイルの目
      float hh = kH2(vec2(id, vRnd));
      vec3 g = vec3(0.15, 0.16, 0.17) * (0.7 + 0.6 * hh) + (hh > 0.8 ? vec3(0.12, 0.11, 0.09) : vec3(0.0));   // ブラインドの下りた窓
      c = mix(c, g, win); if (win > 0.5) { rough = 0.04 + 0.12 * hh; metal = 0.7; }
      c *= 1.0 - 0.3 * step(0.82, fl) * step(fl, 0.86) * step(0.18, cl) * step(cl, 0.82);   // 窓の上の陰
      if (vWP.y < 3.6) kShop(c, along, vWP.y, vRnd, rough, metal);`,
    shop: `
      float fl = fract(vWP.y / 3.2), cl = fract(along / 2.4);
      float win = step(0.35, fl) * step(fl, 0.8) * step(0.2, cl) * step(cl, 0.8) * step(3.4, vWP.y);
      c = mix(c, vec3(0.15, 0.16, 0.17), win * 0.9); if (win > 0.5) { rough = 0.06; metal = 0.7; }
      if (vWP.y < 3.4) kShop(c, along, vWP.y, vRnd, rough, metal);`,
    house: `
      float fl = fract(vWP.y / 2.8), cl = fract(along / 3.6);
      float win = step(0.35, fl) * step(fl, 0.78) * step(0.25, cl) * step(cl, 0.7);
      c = mix(c, vec3(0.15, 0.16, 0.17), win); if (win > 0.5) { rough = 0.06; metal = 0.7; }
      c *= 0.95 + 0.1 * step(0.5, fract(vWP.y / 0.18));   // 板の重ね目（サイディング）`,
    plain: '',
  };
  function building(style) {
    return mat('wall-' + style, { roughness: 0.85, envMapIntensity: 0.9 }, `
      if (vON.y > 0.5) { ${ROOF} }
      else if (vON.y < -0.5) { diffuseColor.rgb *= 0.3; }
      else { ${WALL_START} ${WALLS[style]} ${WALL_END} }`, FACADE_PRE);
  }

  // 切妻の屋根（三角柱。底 y=0・幅 1・長さ 1・高さ 1。棟は z の向き）
  const gable = (() => {
    const g = new THREE.BufferGeometry();
    const v = [-0.55, 0, -0.55, 0.55, 0, -0.55, 0, 1, -0.55, -0.55, 0, 0.55, 0.55, 0, 0.55, 0, 1, 0.55];
    const idx = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4];
    const pos = [], P = i => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
    for (const i of idx) pos.push(...P(i));
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  })();
  const roofTile = () => mat('rooftile', { roughness: 0.6 }, `
    float along = abs(vON.x) > 0.3 ? vWP.z : vWP.x;
    float row = fract((vWP.y * 3.2)), colm = fract(along * 3.4 + floor(vWP.y * 3.2) * 0.5);
    diffuseColor.rgb *= 0.82 + 0.25 * smoothstep(0.0, 0.85, row);
    diffuseColor.rgb *= 0.94 + 0.08 * step(0.1, colm);
    diffuseColor.rgb *= 0.85 + 0.3 * kF(vWP * 0.3 + vRnd * 7.0);
    if (abs(vON.z) > 0.9 && abs(vON.y) < 0.1) diffuseColor.rgb = vec3(0.5, 0.48, 0.44) * (0.8 + 0.3 * kN(vWP * 2.0));   // 妻の壁
    gRough = 0.55 + 0.3 * kN(vWP * 0.8);`);

  // ---- 木（いくつかのかたまり。葉のすき間の陰を、ノイズで色と向きにする） ----
  const lump = new THREE.IcosahedronGeometry(1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 7, 2, true); cone.translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1, 5); trunk.translate(0, 0.5, 0);
  const leafMat = () => mat('leaf', { roughness: 0.85 }, `
    float n1 = kF(vWP * 1.4 + vRnd * 30.0), n2 = kN(vWP * 4.5);
    float hole = smoothstep(0.42, 0.62, n1);
    diffuseColor.rgb *= mix(0.32, 1.15, hole) * (0.85 + 0.3 * n2);
    diffuseColor.rgb *= mix(0.55, 1.0, clamp((vOP.y + 0.6) * 0.9, 0.0, 1.0));   // 下側は暗い
    gNP = (vec3(kN(vWP * 3.0), kN(vWP * 3.0 + 7.0), kN(vWP * 3.0 + 13.0)) - 0.5) * 1.6;
    gRough = 0.8;`);
  // list: [{x, z, y?, h（高さ）, r（樹冠の半径）, type:'broad'|'conifer', c}]
  function trees(scene, list, o = {}) {
    const L = [], C = [], T = [];
    for (const t of list) {
      const y = t.y || 0, h = t.h, r = t.r, c = lin(t.c || pick(['#4d6b2c', '#55732f', '#435f2a', '#5d7b37', '#3f5b2c'])).multiplyScalar(0.8 + rnd() * 0.35);
      if (t.type === 'conifer') {
        C.push({ x: t.x, y: y + h * 0.18, z: t.z, sx: r, sy: h * 0.86, sz: r, ry: rnd() * 6, c });
      } else {
        const n = o.lumps || (r > 2 ? 4 : 3);
        for (let i = 0; i < n; i++) {
          const a = rnd() * 6.28, d = i === 0 ? 0 : r * (0.35 + rnd() * 0.3), rr = r * (i === 0 ? 0.85 : 0.55 + rnd() * 0.25);
          L.push({ x: t.x + Math.cos(a) * d, y: y + h - r * 0.9 + (i === 0 ? 0 : (rnd() - 0.3) * r * 0.6), z: t.z + Math.sin(a) * d, sx: rr, sy: rr * (0.8 + rnd() * 0.25), sz: rr, ry: rnd() * 6, c });
        }
      }
      if (!o.noTrunk) T.push({ x: t.x, y, z: t.z, sx: r * 0.35, sy: h * (t.type === 'conifer' ? 0.3 : 0.7), sz: r * 0.35, c: '#4a3b2c' });
    }
    const m = leafMat();
    inst(scene, lump, m, L); inst(scene, cone, m, C);
    if (T.length) inst(scene, trunk, mat('trunk', { roughness: 0.95 }), T, { cast: false });
  }

  // ---- 人（脚・胴・頭。止まっている人も歩く人も） ----
  const SHIRT = ['#e8e6e0', '#f2f2ee', '#22252b', '#1c2d4f', '#7d8794', '#a6342c', '#e2c64b', '#3d6c9e', '#d7b49e', '#56734a', '#ef8ea4', '#2a2a2a'];
  const PANTS = ['#1d2230', '#2a2c33', '#3b4150', '#6d6355', '#1a1a1c', '#8c8f96', '#33476e'];
  const legsG = new THREE.BoxGeometry(0.32, 0.82, 0.2); legsG.translate(0, 0.41, 0);
  const bodyG = new THREE.BoxGeometry(0.42, 0.62, 0.24); bodyG.translate(0, 1.13, 0);
  const headG = new THREE.SphereGeometry(0.115, 6, 4); headG.translate(0, 1.58, 0);
  // list: [{x, z, y?, ry, shirt, pants, scale}]。返す: { set(k, x, z, ry, bob) }
  function people(scene, list) {
    const n = list.length; if (!n) return null;
    const m = mat('cloth', { roughness: 0.9 });
    const legs = new THREE.InstancedMesh(legsG, m, n), body = new THREE.InstancedMesh(bodyG, m, n), head = new THREE.InstancedMesh(headG, m, n);
    list.forEach((p, k) => {
      legs.setColorAt(k, lin(p.pants || pick(PANTS)));
      body.setColorAt(k, lin(p.shirt || pick(SHIRT)));
      head.setColorAt(k, lin(rnd() < 0.75 ? pick(['#16120f', '#2b221b', '#3a2e25']) : pick(['#c99b7c', '#8a8a8a', '#e6e6e6'])));
    });
    for (const x of [legs, body, head]) { x.castShadow = true; x.receiveShadow = false; x.frustumCulled = false; scene.add(x); }
    const S = list.map(p => p.scale || 1);
    function set(k, x, z, ry = 0, bob = 0, y = 0) {
      const s = S[k];
      setInst(legs, k, x, y, z, s, s * (1 - Math.abs(bob) * 0.04), s, ry);
      setInst(body, k, x, y + bob * 0.03, z, s, s, s, ry);
      setInst(head, k, x, y + bob * 0.03, z, s, s, s, ry);
    }
    function lie(k, x, z, ry, y = 0.12) {   // 寝ころぶ（浜）
      tmp.position.set(x, y, z); tmp.rotation.set(-Math.PI / 2, 0, ry); tmp.scale.setScalar(S[k]); tmp.updateMatrix();
      legs.setMatrixAt(k, tmp.matrix); body.setMatrixAt(k, tmp.matrix); head.setMatrixAt(k, tmp.matrix);
    }
    list.forEach((p, k) => p.lie ? lie(k, p.x, p.z, p.ry || 0, p.y) : set(k, p.x, p.z, p.ry || 0, 0, p.y || 0));
    const done = () => { for (const x of [legs, body, head]) x.instanceMatrix.needsUpdate = true; };
    done();
    return { set, lie, done, n };
  }

  // ---- 車（横から見た形を押し出す。車体＋窓） ----
  function extrude(pts, w) {
    const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    return g;   // 長さの向きが z
  }
  const CAR = {
    sedan: { body: [[-2.25, 0.28], [2.25, 0.28], [2.3, 0.72], [1.35, 0.86], [0.75, 1.38], [-0.95, 1.42], [-1.85, 0.98], [-2.28, 0.85]], glass: [[1.3, 0.84], [0.73, 1.34], [-0.93, 1.37], [-1.8, 0.96], [-1.8, 0.84]], w: 1.76, L: 4.6 },
    kei: { body: [[-1.7, 0.28], [1.7, 0.28], [1.72, 0.8], [1.45, 0.95], [1.15, 1.62], [-1.6, 1.66], [-1.7, 1.5]], glass: [[1.4, 0.95], [1.12, 1.56], [-1.55, 1.6], [-1.62, 1.0]], w: 1.47, L: 3.4 },
    van: { body: [[-2.4, 0.3], [2.4, 0.3], [2.45, 0.9], [2.0, 1.15], [1.6, 1.9], [-2.4, 1.95]], glass: [[1.95, 1.13], [1.57, 1.85], [-2.2, 1.88], [-2.2, 1.2]], w: 1.7, L: 4.8 },
    truck: { body: [[-3.8, 0.4], [3.8, 0.4], [3.85, 1.2], [3.6, 2.4], [2.4, 2.45], [2.4, 3.1], [-3.8, 3.1]], glass: [[3.62, 1.65], [3.5, 2.35], [2.6, 2.38], [2.6, 1.65]], w: 2.3, L: 7.6 },
    bus: { body: [[-5.5, 0.35], [5.5, 0.35], [5.55, 2.9], [5.3, 3.1], [-5.5, 3.1]], glass: [[5.5, 1.2], [5.45, 2.7], [-5.3, 2.7], [-5.3, 1.25]], w: 2.5, L: 11 },
    ktruck: { body: [[-1.7, 0.35], [1.7, 0.35], [1.72, 1.0], [1.5, 1.85], [0.6, 1.88], [0.6, 0.95], [-1.7, 0.95]], glass: [[1.55, 1.15], [1.42, 1.78], [0.7, 1.8], [0.7, 1.15]], w: 1.47, L: 3.4 },
  };
  const carGeo = {}, glassGeo = {};
  for (const k in CAR) { carGeo[k] = extrude(CAR[k].body, CAR[k].w); glassGeo[k] = extrude(CAR[k].glass, CAR[k].w + 0.03); }
  const wheelG = new THREE.BoxGeometry(1, 1, 1);
  const PAINT = ['#f4f4f2', '#f4f4f2', '#e9e9e6', '#1b1b1e', '#1b1b1e', '#8e959c', '#8e959c', '#5a6068', '#b8231b', '#1d2f5c', '#d9cfb8', '#2f4a3a', '#6a7d93'];
  const paintMat = () => mat('paint', { roughness: 0.25, metalness: 0.45 }, `gRough = 0.22 + 0.15 * kN(vWP * 0.7); if (vWP.y < 0.55) { diffuseColor.rgb = vec3(0.02); gRough = 0.8; gMetal = 0.0; }`);
  const glassMat = () => mat('carglass', { color: '#0b0d10', roughness: 0.05, metalness: 0.6 });
  // list: [{kind, c}]。返す: { set(k, x, z, ry, y) }
  function cars(scene, list) {
    const out = { set: null, n: list.length, meshes: [] };
    const byKind = {}; list.forEach((c, k) => { (byKind[c.kind] = byKind[c.kind] || []).push(k); });
    const where = new Array(list.length);
    const pm = paintMat(), gm = glassMat();
    for (const kind in byKind) {
      const ks = byKind[kind], b = new THREE.InstancedMesh(carGeo[kind], pm, ks.length), g = new THREE.InstancedMesh(glassGeo[kind], gm, ks.length);
      ks.forEach((k, i) => { where[k] = [b, g, i]; b.setColorAt(i, lin(list[k].c || pick(PAINT))); g.setColorAt(i, col.setRGB(1, 1, 1)); });
      b.castShadow = true; b.receiveShadow = true; g.castShadow = false; b.frustumCulled = g.frustumCulled = false;
      scene.add(b, g); out.meshes.push(b, g);
    }
    out.set = (k, x, z, ry, y = 0) => {
      const [b, g, i] = where[k];
      tmp.position.set(x, y, z); tmp.rotation.set(0, ry, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
      b.setMatrixAt(i, tmp.matrix); g.setMatrixAt(i, tmp.matrix);
    };
    out.done = () => { for (const m of out.meshes) m.instanceMatrix.needsUpdate = true; };
    return out;
  }
  const carLen = k => CAR[k].L;

  // ---- 水（空を映す。細かい波は法線のずれで、時間とともに動く） ----
  function water(p = {}) {
    const deep = p.deep || '#16323a';
    return mat('water-' + (p.name || 'a'), { color: deep, roughness: 0.06, metalness: 0.0, envMapIntensity: p.env ?? 0.45 }, `
      vec2 q = vWP.xz;
      float t = uTime * ${(p.speed || 1).toFixed(2)};
      vec3 n = vec3(0.0);
      n.x += (kN(vec3(q * 0.11 + vec2(t * 0.09, 0.0), t * 0.05)) - 0.5) * 0.7 + (kN(vec3(q * 0.6 - vec2(0.0, t * 0.3), t * 0.2)) - 0.5) * 0.35;
      n.z += (kN(vec3(q * 0.11 + vec2(0.0, t * 0.07), 9.0 + t * 0.05)) - 0.5) * 0.7 + (kN(vec3(q * 0.6 + vec2(t * 0.25, 0.0), 5.0 + t * 0.2)) - 0.5) * 0.35;
      gNP = n * ${(p.chop || 0.5).toFixed(2)};
      diffuseColor.rgb *= 0.85 + 0.3 * kF(vec3(q * 0.01, 0.0));
      gRough = 0.05 + 0.08 * kN(vec3(q * 0.02, 1.0));
      ${p.extra || ''}`, p.pre || '');
  }

  // ---- 地面の絵（canvas） ----
  function canvas(S) { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }
  function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 16; return t; }
  // ほとんどのテクスチャは手で描く。ambientCG の写真（CC0）は assets/tex から
  const texCache = {};
  function photoImg(name) {
    if (!texCache[name]) texCache[name] = new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = 'assets/tex/' + name + '.jpg'; });
    return texCache[name];
  }
  // 地面（平らな板）。map は canvas、span は一辺 m
  function groundPlane(scene, span, tex, k = 1, x = 0, z = 0) {
    const m = mat('ground', { map: tex, roughness: 0.95 }, G.ground(k));
    const g = new THREE.Mesh(new THREE.PlaneGeometry(span, span), m);
    g.rotation.x = -Math.PI / 2; g.position.set(x, 0, z); g.receiveShadow = true; scene.add(g); return g;
  }
  // 遠くの地面（地平線までのばして、かすみで消す）
  function farGround(scene, color, y = -0.08) {
    const m = mat('far', { color: lin(color), roughness: 1 }, `
      vec3 q = vec3(vWP.x, 0.0, vWP.z);
      float a = kF(q * 0.002), b = kF(q * 0.012 + 4.0), c = kN(q * 0.08);
      diffuseColor.rgb *= 0.7 + 0.5 * a + 0.25 * (b - 0.5) + 0.1 * (c - 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.95, 0.75), smoothstep(0.4, 0.7, b));`);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), m);
    g.rotation.x = -Math.PI / 2; g.position.y = y; g.receiveShadow = true; scene.add(g); return g;
  }

  return { time, rnd, setSeed, pick, lin, ENV, mat, G, box, inst, setInst, building, gable, roofTile, trees, people, cars, carLen, CAR, water,
    canvas, canvasTex, photoImg, groundPlane, farGround, PAINT, SHIRT };
})();
