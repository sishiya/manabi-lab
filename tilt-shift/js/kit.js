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
      sh.vertexShader = 'attribute float aBlind; varying float vBlind; varying vec3 vWP; varying vec3 vOP; varying vec3 vON; varying vec3 vSc; varying float vRndRaw;\n#define vRnd vRndRaw\n' +
        sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vOP = position; vON = objectNormal; vSc = vec3(1.0); vRnd = 0.5; vBlind = aBlind;
          vec4 kW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            kW = instanceMatrix * kW;
            vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vRnd = floor(fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233)) + instanceMatrix[3].y * 3.7) * 43758.5453) * 4096.0) / 4096.0;
          #endif
          vWP = (modelMatrix * kW).xyz;`);
      sh.fragmentShader = 'uniform float uTime; varying float vBlind; varying vec3 vWP; varying vec3 vOP; varying vec3 vON; varying vec3 vSc; varying float vRndRaw;\n' +
        // vRnd は補間で画素ごとにわずかにずれ、ハッシュ（sin×43758）に通すと粒になる → 1/4096 に丸めて、どの画素でも同じ値に
        '#define vRnd (floor(vRndRaw * 4096.0 + 0.5) / 4096.0)\n' +
        'float gRough = -1.0; float gMetal = -1.0; vec3 gNP = vec3(0.0); vec3 gEmis = vec3(0.0);\n' + NOISE + pre + '\n' +
        sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n{' + fn + '\n}')
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
    if (items.some(b => b.bl)) geo = m.geometry = geo.clone(), m.geometry.setAttribute('aBlind', new THREE.InstancedBufferAttribute(new Float32Array(items.map(b => b.bl || 0)), 1));   // 窓のない壁のビット
    m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
    m.frustumCulled = false;   // InstancedMesh の範囲は元の形（原点の小さな箱）で決まるので、切らない
    scene.add(m); return m;
  }
  function setInst(m, k, x, y, z, sx, sy, sz, ry = 0) {
    tmp.position.set(x, y, z); tmp.rotation.set(0, ry, 0); tmp.scale.set(sx, sy, sz); tmp.updateMatrix(); m.setMatrixAt(k, tmp.matrix);
  }

  // ---- 建物の壁と屋上 ----
  // style: 'office'（ガラスの壁）・'mansion'（ベランダの集合住宅）・'tile'（タイルの事務所）・'shop'（低い商店）・'house'（家の壁）・'brick'（れんがタイル）・'plain'
  //   ・窓は「へこみ」: 視線の向きから奥の面を求め、へこみの側面と上の陰を描く（遠くでも窓が面に貼った絵に見えないように）
  //   ・隣の建物とくっつく壁（instance の aBlind のビット: +x 1・−x 2・+z 4・−z 8）は窓のない壁
  //   ・マンションのベランダの床と手すり・屋上の機械やタンクは、本当の形（js/town.js）
  const ROOF = `
    float tone = fract(vRnd * 7.31);   // 屋上の防水の色は建物ごと（明るい灰が多い・ときどき緑がかった灰・こげ茶）
    vec3 rc = tone < 0.55 ? vec3(0.36 + tone * 0.25) : tone < 0.72 ? vec3(0.27, 0.31, 0.29) : tone < 0.86 ? vec3(0.3, 0.27, 0.24) : vec3(0.55, 0.55, 0.52);
    rc = mix(rc, diffuseColor.rgb * 0.5, 0.2);
    // 防水シートの継ぎ目（1 m ごと）と、ゆるい色むら
    float seam = 1.0 - 0.06 * (1.0 - smoothstep(0.0, 0.04, abs(fract(vWP.x + vRnd * 3.0) - 0.5) - 0.46));
    rc *= seam * (0.9 + 0.18 * kF(vWP * vec3(0.12, 0.0, 0.12) + vRnd * 13.0));
    float edge = min(vSc.x * (0.5 - abs(vOP.x)), vSc.z * (0.5 - abs(vOP.z)));
    rc *= 1.0 - 0.25 * smoothstep(0.62, 0.8, kF(vWP * 1.3 + 4.0)) * (1.0 - smoothstep(0.0, 3.0, edge)) ;   // 排水口へ向かう黒いすじは、ふち寄り
    rc *= mix(0.72, 1.0, smoothstep(0.2, 1.4, edge));     // パラペットのすぐ内側は陰
    diffuseColor.rgb = rc; gRough = 0.9;`;
  const FACADE_PRE = `
    // 窓のへこみ。p: 面の上の位置（横 along・高さ y）、cell: 窓1つ分の大きさ、r: 窓の範囲（横の始まり・終わり、高さの始まり・終わり、0〜1）
    // 返す: 0 壁 / 1 ガラス / 2 へこみの内側（側面・上）。lit: ガラスの上の陰（0〜1）
    float kWin(vec2 p, vec2 cell, vec4 r, float depth, vec3 tang, out float lit) {
      lit = 1.0;
      vec2 base = floor(p / cell) * cell, f = (p - base) / cell;
      if (f.x < r.x || f.x > r.y || f.y < r.z || f.y > r.w) return 0.0;
      vec3 V = normalize(cameraPosition - vWP), N = normalize(vON);
      float vn = max(0.15, dot(V, N));
      vec2 vt = vec2(dot(V, tang), V.y);
      vec2 f2 = (p - vt / vn * depth - base) / cell;
      lit = 1.0 - 0.45 * smoothstep(r.w - 0.25 * (r.w - r.z), r.w, f2.y);   // 上の枠の陰
      if (f2.x < r.x || f2.x > r.y || f2.y < r.z || f2.y > r.w) return 2.0;
      return 1.0;
    }
    // 窓ガラス: 部屋の中（暗い）＋カーテン・ブラインドのちがい（窓ごと）
    vec3 kGlass(float id, float rr) {
      float h = kH2(vec2(id, rr * 31.0));
      return vec3(0.05, 0.055, 0.06) * (0.7 + 0.8 * h) + (h > 0.72 ? vec3(0.16, 0.15, 0.13) : h > 0.55 ? vec3(0.06, 0.06, 0.07) : vec3(0.0));
    }
    // 1階の店（ガラス・ひさし・看板の色）
    void kShop(inout vec3 c, float along, float y, float rr, inout float rough, inout float metal) {
      float bay = floor(along / 5.5), fb = fract(along / 5.5);
      float h = kH2(vec2(bay, rr * 91.0));
      vec3 sign = h < 0.2 ? vec3(0.5, 0.07, 0.05) : h < 0.35 ? vec3(0.04, 0.15, 0.4) : h < 0.48 ? vec3(0.7, 0.5, 0.1) : h < 0.58 ? vec3(0.07, 0.28, 0.12) : h < 0.8 ? vec3(0.75) : vec3(0.12);
      float glass = step(0.06, fb) * step(fb, 0.94) * step(0.15, y) * step(y, 2.6);
      float shut = step(0.86, kH2(vec2(bay, rr * 13.0)));   // シャッターの閉まった店
      vec3 g = shut > 0.5 ? vec3(0.42, 0.42, 0.4) * (0.9 + 0.1 * step(0.5, fract(y * 8.0))) : vec3(0.03, 0.035, 0.04) + vec3(0.1, 0.09, 0.07) * kN(vec3(along * 2.0, y * 2.0, rr));
      c = mix(c * 0.8, g, glass);
      if (glass > 0.5 && shut < 0.5) { rough = 0.08; metal = 0.3; }
      float band = step(2.7, y) * step(y, 3.4);
      c = mix(c, sign * (0.85 + 0.3 * kN(vec3(along, y * 8.0, 1.0))), band * 0.9);
    }`;
  const WALL_START = `
    vec3 c = diffuseColor.rgb * 0.85; float rough = 0.85, metal = 0.0;
    bool xf = abs(vON.x) > 0.5;
    float along = xf ? vWP.z : vWP.x;
    vec3 tang = xf ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    float bit = vON.x > 0.5 ? 1.0 : vON.x < -0.5 ? 2.0 : vON.z > 0.5 ? 4.0 : 8.0;
    bool blind = mod(floor(floor(vBlind + 0.5) / bit + 0.01), 2.0) > 0.5;   // vBlind は補間で 3.9999 などにずれるので丸める
    bool front = (vSc.x >= vSc.z) ? vON.z > 0.5 : vON.x > 0.5;   // 長い辺の +z か +x がベランダの面
    along += vRnd * 37.0;
    float lit = 1.0;`;
  // 窓のない壁（となりとくっつく側）: パネルの目地と、ところどころの小窓・配管
  const BLIND = `
    c *= 0.86;   // 側面は塗り直されないので、正面より少しくすむ
    c *= 0.97 + 0.06 * step(0.985, fract(along / 1.8)) + 0.04 * step(0.98, fract(vWP.y / 2.9));
    // 階段やトイレの小窓（縦に1列。半分ほどの建物に）
    float col = fract(along / 9.7), fy = fract(vWP.y / 2.9);
    c = mix(c, vec3(0.1, 0.11, 0.12), step(0.45, vRnd) * step(0.47, col) * step(col, 0.52) * step(0.45, fy) * step(fy, 0.75) * step(3.5, vWP.y));
    c *= 1.0 - 0.15 * smoothstep(0.4, 0.75, kN(vec3(along * 0.9, vWP.y * 0.04, vRnd * 9.0)));   // 雨のすじ（側面は強め）
    float pipe = step(0.993, fract(along / 9.0 + vRnd));
    c = mix(c, c * 0.7, pipe);`;
  const WALL_END = `
    // 雨だれのすじ（上から下へ）・下ほど暗い・色むら
    float streak = kN(vec3(along * 1.4, vWP.y * 0.05, vRnd * 40.0)) * kN(vec3(along * 0.3, vWP.y * 0.02, vRnd * 7.0));
    c *= 1.0 - 0.18 * smoothstep(0.3, 0.6, streak);
    c *= mix(0.8, 1.0, smoothstep(0.0, 5.0, vWP.y));
    c *= 0.93 + 0.14 * kF(vWP * 0.04 + vRnd * 5.0);
    c *= mix(1.12, 1.0, smoothstep(0.2, 0.5, vSc.y * (0.5 - vOP.y + 0.5)));   // 屋上のふち（笠木）は明るい
    diffuseColor.rgb = c; gRough = rough; gMetal = metal;`;
  // 窓の結果 w（0 壁・1 ガラス・2 へこみの内側）を色にする
  const WIN_APPLY = (id) => `
    if (w > 1.5) c *= 0.55;
    else if (w > 0.5) { c = kGlass(${id}, vRnd) * lit; rough = 0.05; metal = 0.55; }`;
  const WALLS = {
    office: `
      float fl = fract(vWP.y / 3.9), cl = fract(along / 1.6);
      float cellId = floor(vWP.y / 3.9) * 37.0 + floor(along / 1.6);
      float mull = 1.0 - step(0.06, cl) * step(cl, 0.94) * step(0.06, fl) * step(fl, 0.94);
      float spandrel = step(0.72, fl);
      float n = kH2(vec2(cellId, vRnd * 17.0));
      vec3 glassC = c * (0.3 + 0.1 * n) + kGlass(cellId, vRnd) * 0.6;
      c = mix(glassC, c * 0.75, max(mull, spandrel * 0.9));
      rough = mix(0.03 + 0.06 * n, 0.5, max(mull, spandrel)); metal = mix(0.75, 0.2, max(mull, spandrel));
      gNP = vec3(kH2(vec2(cellId, 3.1)) - 0.5, 0.0, kH2(vec2(cellId, 7.7)) - 0.5) * 0.06;   // パネルごとに映りこみの向きが少しずれる
      if (vWP.y < 4.5) { c = vec3(0.03); rough = 0.12; }`,
    mansion: `
      float id = floor(along / 3.1) + floor(vWP.y / 2.9) * 13.0;
      if (front && vWP.y > 3.6) {
        // ベランダの奥: 床から天井までの掃き出し窓（手すりと床は本当の形）
        float w = kWin(vec2(along, vWP.y), vec2(3.1, 2.9), vec4(0.1, 0.9, 0.04, 0.8), 0.12, tang, lit);
        ${WIN_APPLY('id')}
        c *= 0.82;   // ベランダの奥は、上の床で少し暗い
      } else if (vWP.y > 3.6) {
        // 裏（共用の廊下側）: 玄関ドアと小さな窓
        float w = kWin(vec2(along, vWP.y), vec2(3.1, 2.9), vec4(0.55, 0.85, 0.42, 0.78), 0.2, tang, lit);
        ${WIN_APPLY('id')}
        float door = step(0.15, fract(along / 3.1)) * step(fract(along / 3.1), 0.38) * step(0.02, fract(vWP.y / 2.9)) * step(fract(vWP.y / 2.9), 0.74);
        c = mix(c, vec3(0.32, 0.27, 0.22) * (0.8 + 0.4 * kH2(vec2(id, 5.0))), door * 0.9);
      } else kShop(c, along, vWP.y, vRnd, rough, metal);`,
    tile: `
      float id = floor(vWP.y / 3.6) * 41.0 + floor(along / 3.0);
      c *= 0.95 + 0.1 * kH2(vec2(floor(along / 0.3), floor(vWP.y / 0.1)));   // タイルの目
      float w = kWin(vec2(along, vWP.y), vec2(3.0, 3.6), vec4(0.12, 0.88, 0.3, 0.82), 0.3, tang, lit);
      ${WIN_APPLY('id')}
      if (vWP.y < 3.6) kShop(c, along, vWP.y, vRnd, rough, metal);`,
    brick: `
      float id = floor(vWP.y / 3.3) * 41.0 + floor(along / 2.6);
      float row = floor(vWP.y / 0.075), joint = step(0.82, fract(vWP.y / 0.075)) + step(0.94, fract(along / 0.23 + 0.5 * mod(row, 2.0)));
      c *= (0.9 + 0.2 * kH2(vec2(floor(along / 0.23 + 0.5 * mod(row, 2.0)), row))) * (1.0 - 0.18 * min(1.0, joint));
      float w = kWin(vec2(along, vWP.y), vec2(2.6, 3.3), vec4(0.22, 0.78, 0.32, 0.8), 0.25, tang, lit);
      ${WIN_APPLY('id')}
      if (vWP.y < 3.3) kShop(c, along, vWP.y, vRnd, rough, metal);`,
    shop: `
      float id = floor(vWP.y / 3.2) * 41.0 + floor(along / 2.4);
      float w = step(3.4, vWP.y) * kWin(vec2(along, vWP.y), vec2(2.4, 3.2), vec4(0.2, 0.8, 0.35, 0.8), 0.15, tang, lit);
      ${WIN_APPLY('id')}
      if (vWP.y < 3.4) kShop(c, along, vWP.y, vRnd, rough, metal);`,
    house: `
      float id = floor(vWP.y / 2.8) * 41.0 + floor(along / 3.6);
      float w = kWin(vec2(along, vWP.y), vec2(3.6, 2.8), vec4(0.25, 0.7, 0.35, 0.78), 0.1, tang, lit);
      ${WIN_APPLY('id')}
      c *= 0.96 + 0.08 * step(0.5, fract(vWP.y / 0.18));   // 板の重ね目（サイディング）`,
    plain: `
      float id = floor(vWP.y / 3.0) * 41.0 + floor(along / 3.0);
      float w = kWin(vec2(along, vWP.y), vec2(3.0, 3.0), vec4(0.25, 0.75, 0.35, 0.8), 0.0, tang, lit);
      ${WIN_APPLY('id')}`,
  };
  function building(style) {
    return mat('wall-' + style, { roughness: 0.85, envMapIntensity: 0.45 }, `
      if (vON.y > 0.5) { ${ROOF} }
      else if (vON.y < -0.5) { diffuseColor.rgb *= 0.3; }
      else { ${WALL_START} if (blind && vWP.y > 0.0) { ${BLIND}
 } else { ${WALLS[style]}
 } ${WALL_END} }`, FACADE_PRE);
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
  // 寄棟の屋根（底 y=0・幅 1・長さ 1・高さ 1。棟は z の向きで、長さの半分）
  const hip = (() => {
    const g = new THREE.BufferGeometry(), e = 0.55, r = 0.25;
    const A = [-e, 0, -e], Bq = [e, 0, -e], Cq = [e, 0, e], Dq = [-e, 0, e], R0 = [0, 1, -r], R1 = [0, 1, r];
    const tri = [Dq, Cq, R1, Bq, A, R0, A, Dq, R1, A, R1, R0, Cq, Bq, R0, Cq, R0, R1];
    g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3)); g.computeVertexNormals();
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

  // ---- 木（あらかじめ作った樹形の型をならべる。型は高さ 1。幹・枝＋葉の房のかたまり） ----
  //   広葉樹: 幹が途中で 3〜4 本の枝に分かれ、その先と樹冠の外側に葉の房（小さな多面体）を 22 個。房の面の向きは樹冠全体の丸みと混ぜる（光がやわらかくまわる）
  //   針葉樹: ぎざぎざのふちの円すいを 6 段かさねる
  //   型は幅と高さの比ごとに用意し、木の r / h にいちばん近い型を、そのまま（縦横同じ倍率で）大きくする（引きのばすと面の向きが狂う）
  function mergeTone(parts) {
    const pos = [], nor = [], col = [];
    for (const [g0, tone] of parts) { const g = g0.index ? g0.toNonIndexed() : g0, P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(tone, tone, tone); } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  function broadType(w, seed) {
    let sd = seed; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const yb = 0.32 + R() * 0.1, cy = (yb + 1) / 2, vr = (1 - yb) / 2;   // 樹冠の下の高さ・中心・縦の半径（横の半径は w）
    const crown = [], wood = [];
    const tr = new THREE.CylinderGeometry(0.022, 0.034, yb + 0.12, 6); tr.translate(0, (yb + 0.12) / 2, 0); wood.push([tr, 1]);
    const nb = 3 + (R() < 0.5 ? 1 : 0);
    for (let i = 0; i < nb; i++) {   // 枝: 幹の上から外へ・上へ
      const a = i / nb * 6.283 + R() * 0.8, L = 0.45 * w + R() * 0.15 * w, up = 0.12 + R() * 0.12;
      const b = new THREE.CylinderGeometry(0.009, 0.018, 1, 5); b.translate(0, 0.5, 0);
      const len = Math.hypot(L, up); b.scale(1, len, 1);
      b.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, -a, -Math.atan2(L, up), 'YXZ')));
      b.translate(0, yb + 0.06, 0); wood.push([b, 1]);
    }
    const n = 26;
    for (let i = 0; i < n; i++) {   // 葉の房: 樹冠の外側寄りに（半径の 0.55〜1）。上ほど多い
      const u = R() * 2 - 1, ph = R() * 6.283, cu = Math.sqrt(1 - u * u), k = 0.55 + 0.45 * Math.sqrt(R());
      const ux = cu * Math.cos(ph), uy = Math.abs(u) * (u > -0.35 ? 1 : -0.6), uz = cu * Math.sin(ph);
      const px = ux * w * k, py = cy + uy * vr * k, pz = uz * w * k, s = (0.24 + R() * 0.14) * Math.min(w, vr) * 1.15;
      const g = new THREE.IcosahedronGeometry(1, 0); g.scale(s, s * 0.75, s);
      g.rotateY(R() * 6.283); g.translate(px, py, pz);
      // 面の向き: 房の向きと、樹冠の中心からの向きをまぜる
      const P = g.attributes.position, N = g.attributes.normal;
      for (let j = 0; j < P.count; j++) {
        const rx = P.getX(j) / w, ry = (P.getY(j) - cy) / vr, rz = P.getZ(j) / w, rl = Math.hypot(rx, ry, rz) || 1;
        const nx = N.getX(j) * 0.25 + rx / rl * 0.75, ny = N.getY(j) * 0.25 + ry / rl * 0.75, nz = N.getZ(j) * 0.25 + rz / rl * 0.75, nl = Math.hypot(nx, ny, nz);
        N.setXYZ(j, nx / nl, ny / nl, nz / nl);
      }
      crown.push([g, 0.75 + R() * 0.45]);   // 房ごとの明るさ（日の当たり方・葉の色のちがい）
    }
    return { crown: mergeTone(crown), wood: mergeTone(wood), w, cy, vr };
  }
  function coniferType(w, seed) {
    let sd = seed; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const crown = [], wood = [];
    const tr = new THREE.CylinderGeometry(0.012, 0.022, 0.5, 5); tr.translate(0, 0.25, 0); wood.push([tr, 1]);
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, y0 = 0.12 + t * 0.8, rr = w * (1 - t * 0.82) * (0.9 + R() * 0.2), hh = 0.28 - t * 0.1;
      const g = new THREE.ConeGeometry(rr, hh, 10, 1, true); g.translate(0, y0 + hh / 2, 0);
      const P = g.attributes.position;
      for (let j = 0; j < P.count; j++) if (P.getY(j) < y0 + 0.01) { const f = 0.75 + R() * 0.5; P.setX(j, P.getX(j) * f); P.setZ(j, P.getZ(j) * f); P.setY(j, P.getY(j) - R() * 0.03); }   // ふちをぎざぎざ・少したれる
      g.computeVertexNormals();
      crown.push([g, 0.8 + R() * 0.35]);
    }
    return { crown: mergeTone(crown), wood: mergeTone(wood), w, cy: 0.55, vr: 0.45 };
  }
  let TYPES = null;
  const treeTypes = () => TYPES || (TYPES = {
    broad: [0.22, 0.3, 0.38, 0.48, 0.6].map((w, i) => broadType(w, 101 + i * 37)),
    conifer: [0.14, 0.2].map((w, i) => coniferType(w, 503 + i * 41)),
  });
  const leafMat = () => mat('leaf', { roughness: 0.85, vertexColors: true }, `
    float n1 = kF(vWP * 1.6 + vRnd * 30.0), n2 = kN(vWP * 5.0);
    // 輪郭（面が横を向く所）では、葉のすき間を抜く（ふちがレースのように見える。真ん中はつまったまま）
    vec3 fN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));   // 本当の面の向き（なめらかにした向きではなく）
    float edgeV = abs(dot(fN, normalize(vViewPosition)));
    if (edgeV < 0.3 && kN(vWP * 3.2 + vRnd * 11.0) > 0.3 + edgeV * 1.6) discard;
    if (dot(normalize(vNormal), normalize(-vViewPosition)) < 0.0) diffuseColor.rgb *= 0.0 + 0.6;   // 奥を向く房（すき間から見える）は暗め、でも黒くしない
    diffuseColor.rgb *= mix(0.45, 1.12, smoothstep(0.38, 0.62, n1)) * (0.88 + 0.24 * n2);   // 葉のすき間の陰
    diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(-0.2, 0.6, vON.y));   // 下を向く面は暗い
    gNP = (vec3(kN(vWP * 3.0), kN(vWP * 3.0 + 7.0), kN(vWP * 3.0 + 13.0)) - 0.5) * 0.9;
    gRough = 0.85;`);
  const barkMat = () => mat('bark', { roughness: 0.95, color: '#3a2e24' }, `diffuseColor.rgb *= 0.8 + 0.3 * kN(vWP * vec3(6.0, 1.5, 6.0));`);
  // list: [{x, z, y?, h（高さ）, r（樹冠の半径）, type:'broad'|'conifer', c}]
  function trees(scene, list, o = {}) {
    const TT = treeTypes(), by = new Map();
    for (const t of list) {
      const con = t.type === 'conifer', set = con ? TT.conifer : TT.broad, ratio = t.r / t.h;
      let best = 0; set.forEach((v, i) => { if (Math.abs(v.w - ratio) < Math.abs(set[best].w - ratio)) best = i; });
      if (!con && rnd() < 0.35) best = Math.max(0, Math.min(set.length - 1, best + (rnd() < 0.5 ? -1 : 1)));   // 同じ比でも型をまぜる
      const key = (con ? 'c' : 'b') + best;
      if (!by.has(key)) by.set(key, { T: set[best], list: [] });
      const c = lin(t.c || pick(['#4d6b2c', '#55732f', '#435f2a', '#5d7b37', '#3f5b2c'])).multiplyScalar(0.8 + rnd() * 0.35);
      const s = t.h * (0.92 + rnd() * 0.16);
      by.get(key).list.push({ x: t.x, y: t.y || 0, z: t.z, sx: s, sy: s, sz: s, ry: rnd() * 6.283, c });
    }
    const lm = leafMat(), bm = barkMat();
    for (const { T, list: L } of by.values()) {
      inst(scene, T.crown, lm, L);
      if (!o.noTrunk) inst(scene, T.wood, bm, L.map(b => Object.assign({}, b, { c: null })), { cast: false });
    }
  }

  // ---- 人（脚2・胴・腕2・首と頭・髪。身長 約 1.7 m。歩くと脚と腕が振れる＝頂点シェーダで、人ごとの位相） ----
  const SHIRT = ['#e8e6e0', '#f2f2ee', '#22252b', '#1c2d4f', '#7d8794', '#a6342c', '#c9b04a', '#3d6c9e', '#d7b49e', '#56734a', '#d98a9a', '#2a2a2a', '#5a4a3e', '#8c8a84'];
  const PANTS = ['#1d2230', '#2a2c33', '#3b4150', '#6d6355', '#1a1a1c', '#8c8f96', '#33476e', '#c9c2b2', '#4a3a30'];
  // 部品: 0 左脚・1 右脚・2 胴・3 左腕・4 右腕・5 頭・6 髪。脚は腰（y 0.86）、腕は肩（y 1.38）が回転の中心
  const personGeo = (() => {
    const pos = [], nor = [], part = [];
    function add(g, p, taper) {
      g = g.toNonIndexed();
      const P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        if (taper) { const k = 1 + taper * (y > 0 ? 1 : -1); x *= k; z *= k; }
        pos.push(x, y, z); nor.push(N.getX(i), N.getY(i), N.getZ(i)); part.push(p);
      }
      return pos.length;
    }
    const tr = (g, x, y, z) => { g.translate(x, y, z); return g; };
    for (const [p, sx] of [[0, -0.095], [1, 0.095]]) add(tr(new THREE.BoxGeometry(0.15, 0.86, 0.17), sx, 0.43, 0), p, -0.12);   // 脚（下ほど細い）
    add(tr(new THREE.CylinderGeometry(0.2, 0.17, 0.56, 8), 0, 1.13, 0).scale(1, 1, 0.62), 2);   // 胴（肩が広い・前後に薄い）
    add(tr(new THREE.CylinderGeometry(0.15, 0.16, 0.12, 8), 0, 0.88, 0).scale(1, 1, 0.7), 2);   // 腰
    for (const [p, sx] of [[3, -0.235], [4, 0.235]]) add(tr(new THREE.CylinderGeometry(0.05, 0.04, 0.62, 5), sx, 1.08, 0), p);   // 腕
    add(tr(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 6), 0, 1.45, 0), 5);   // 首
    add(tr(new THREE.SphereGeometry(0.105, 8, 6).scale(0.9, 1.1, 1), 0, 1.58, 0), 5);   // 頭
    add(tr(new THREE.SphereGeometry(0.112, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.92, 1.1, 1.02), 0, 1.6, -0.01), 6);   // 髪（頭の上と後ろ）
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
    return g;
  })();
  const PERSON_V = `
    attribute float aPart; attribute vec2 aAnim; attribute vec3 aPants;
    varying float vPart; varying vec3 vPants; varying float vHair;
    // 部品ごとの回し方（x 軸まわり。前が +z）。aAnim = (歩きの位相, 振れの大きさ 0〜1)
    vec3 kPose(vec3 p, float part) {
      float s = sin(aAnim.x) * aAnim.y;
      float a = part < 0.5 ? s * 0.5 : part < 1.5 ? -s * 0.5 : part > 2.5 && part < 3.5 ? -s * 0.4 : part > 3.5 && part < 4.5 ? s * 0.4 : 0.0;
      float py = part < 1.5 ? 0.86 : 1.38;
      float c = cos(a), sn = sin(a);
      vec3 q = p; q.y -= py;
      q = vec3(q.x, c * q.y - sn * q.z, sn * q.y + c * q.z);
      q.y += py;
      q.y += abs(cos(aAnim.x)) * 0.035 * aAnim.y;   // 一歩ごとに体が少し上下する
      return q;
    }`;
  // list: [{x, z, y?, ry, shirt, pants, scale}]。返す: { set(k, x, z, ry, 位相, y, 振れ), lie(k, ...), done() }
  function people(scene, list) {
    const n = list.length; if (!n) return null;
    const m = mat('person', { roughness: 0.85 }, `
      float hh = fract(vRnd * 13.7);
      vec3 skin = mix(vec3(0.62, 0.42, 0.3), vec3(0.75, 0.55, 0.42), fract(vRnd * 5.3));
      vec3 hair = hh < 0.75 ? vec3(0.025, 0.02, 0.018) : hh < 0.88 ? vec3(0.12, 0.08, 0.05) : vec3(0.45, 0.44, 0.42);
      if (vPart < 1.5) { diffuseColor.rgb = vPants; if (vOP.y < 0.07) diffuseColor.rgb = vec3(0.04); }   // 靴
      else if (vPart > 2.5 && vPart < 4.5 && vOP.y < 0.86) diffuseColor.rgb = skin;   // 手
      else if (vPart > 4.5 && vPart < 5.5) diffuseColor.rgb = skin;
      else if (vPart > 5.5) diffuseColor.rgb = hair;
      diffuseColor.rgb *= 0.9 + 0.2 * smoothstep(0.0, 1.7, vOP.y);   // 下のほうは少し暗い（地面からの光が弱い）`);
    const ob = m.onBeforeCompile;
    m.customProgramCacheKey = () => 'kit-person';
    m.onBeforeCompile = sh => {
      ob(sh);
      sh.vertexShader = PERSON_V + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = kPose(position + objectNormal, aPart) - kPose(position, aPart);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = kPose(position, aPart); vPart = aPart; vPants = aPants;');
      sh.fragmentShader = 'varying float vPart; varying vec3 vPants;\n' + sh.fragmentShader;
    };
    const geo = personGeo.clone();
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2), pants = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    anim.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnim', anim); geo.setAttribute('aPants', pants);
    const mesh = new THREE.InstancedMesh(geo, m, n);
    list.forEach((p, k) => {
      mesh.setColorAt(k, lin(p.shirt || pick(SHIRT)));
      const c = lin(p.pants || pick(PANTS)); pants.setXYZ(k, c.r, c.g, c.b);
    });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
    const S = list.map(p => (p.scale || 1) * (0.92 + rnd() * 0.14));
    function set(k, x, z, ry = 0, ph = 0, y = 0, amp = ph ? 1 : 0) {
      const s = S[k];
      setInst(mesh, k, x, y, z, s, s, s, ry);
      anim.setXY(k, ph, amp);
    }
    function lie(k, x, z, ry, y = 0.12) {   // 寝ころぶ（浜）
      tmp.position.set(x, y, z); tmp.rotation.set(-Math.PI / 2, 0, ry); tmp.scale.setScalar(S[k]); tmp.updateMatrix();
      mesh.setMatrixAt(k, tmp.matrix); anim.setXY(k, 0, 0);
    }
    list.forEach((p, k) => p.lie ? lie(k, p.x, p.z, p.ry || 0, p.y) : set(k, p.x, p.z, p.ry || 0, 0, p.y || 0));
    const done = () => { mesh.instanceMatrix.needsUpdate = true; anim.needsUpdate = true; };
    done();
    return { set, lie, done, n };
  }

  // ---- 車（横から見た形を押し出し、角を丸める。車体＋タイヤ4本＋窓） ----
  function extrude(pts, w, bev = 0.06) {
    const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
    const g = new THREE.ExtrudeGeometry(s, { depth: w - 2 * bev, bevelEnabled: bev > 0, bevelSize: bev, bevelThickness: bev, bevelSegments: 1 });
    g.translate(0, 0, -(w - 2 * bev) / 2); g.rotateY(-Math.PI / 2);
    return g;   // 長さの向きが z（前が +z。進む向き ry と同じ）
  }
  // いくつかの形を1つにまとめる（aW: 0 車体・1 タイヤ）
  function merge(parts) {
    const pos = [], nor = [], w = [];
    for (const [g0, k] of parts) { const g = g0.index ? g0.toNonIndexed() : g0, P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); w.push(k); } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
    return g;
  }
  const CAR = {
    sedan: { body: [[-2.25, 0.3], [2.25, 0.3], [2.3, 0.72], [1.35, 0.86], [0.75, 1.38], [-0.95, 1.42], [-1.85, 0.98], [-2.28, 0.85]], glass: [[1.3, 0.84], [0.73, 1.34], [-0.93, 1.37], [-1.8, 0.96], [-1.8, 0.84]], w: 1.76, L: 4.6, r: 0.31, wx: 1.4 },
    kei: { body: [[-1.7, 0.28], [1.7, 0.28], [1.72, 0.8], [1.45, 0.95], [1.15, 1.62], [-1.6, 1.66], [-1.7, 1.5]], glass: [[1.4, 0.95], [1.12, 1.56], [-1.55, 1.6], [-1.62, 1.0]], w: 1.47, L: 3.4, r: 0.27, wx: 1.15 },
    van: { body: [[-2.4, 0.32], [2.4, 0.32], [2.45, 0.9], [2.0, 1.15], [1.6, 1.9], [-2.4, 1.95]], glass: [[1.95, 1.13], [1.57, 1.85], [-2.2, 1.88], [-2.2, 1.2]], w: 1.7, L: 4.8, r: 0.32, wx: 1.5 },
    truck: { body: [[-3.8, 0.55], [3.8, 0.55], [3.85, 1.2], [3.6, 2.4], [2.4, 2.45], [2.4, 3.1], [-3.8, 3.1]], glass: [[3.62, 1.65], [3.5, 2.35], [2.6, 2.38], [2.6, 1.65]], w: 2.3, L: 7.6, r: 0.48, wx: 2.6 },
    bus: { body: [[-5.5, 0.45], [5.5, 0.45], [5.55, 2.9], [5.3, 3.1], [-5.5, 3.1]], glass: [[5.5, 1.2], [5.45, 2.7], [-5.3, 2.7], [-5.3, 1.25]], w: 2.5, L: 11, r: 0.5, wx: 3.3 },
    ktruck: { body: [[-1.7, 0.35], [1.7, 0.35], [1.72, 1.0], [1.5, 1.85], [0.6, 1.88], [0.6, 0.95], [-1.7, 0.95]], glass: [[1.55, 1.15], [1.42, 1.78], [0.7, 1.8], [0.7, 1.15]], w: 1.47, L: 3.4, r: 0.27, wx: 1.15 },
  };
  const carGeo = {}, glassGeo = {};
  for (const k in CAR) {
    const C = CAR[k], parts = [[extrude(C.body, C.w), 0]];
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) { const wh = new THREE.CylinderGeometry(C.r, C.r, 0.22, 8, 1); wh.rotateZ(Math.PI / 2); wh.translate(sx * (C.w / 2 - 0.12), C.r, sz * C.wx); parts.push([wh, 1]); }
    carGeo[k] = merge(parts); glassGeo[k] = extrude(C.glass, C.w + 0.03, 0.03);
  }
  const PAINT = ['#f4f4f2', '#f4f4f2', '#f4f4f2', '#e9e9e6', '#c9ccd0', '#1b1b1e', '#1b1b1e', '#8e959c', '#8e959c', '#5a6068', '#8a1f1a', '#1d2f5c', '#d9cfb8', '#2f4a3a', '#6a7d93'];
  // 車体の塗装（つや）・タイヤ（黒いゴム＋銀のホイール）・前の白いライト・後ろの赤いランプ
  const paintMat = () => {
    const m = mat('paint', { roughness: 0.25, metalness: 0.45 }, `
      gRough = 0.2 + 0.12 * kN(vWP * 0.7);
      if (vW > 0.5) { diffuseColor.rgb = vec3(0.025); gRough = 0.85; gMetal = 0.0; }   // タイヤ
      else {
        if (vOP.y < 0.45) { diffuseColor.rgb *= 0.35; gRough = 0.7; }   // 下まわり・バンパーの下
        float side = smoothstep(0.25, 0.45, abs(vOP.x));
        if (vON.z > 0.6 && vOP.y > 0.5 && vOP.y < 0.85) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.85, 0.8), side);   // 前のライト
        if (vON.z < -0.6 && vOP.y > 0.6 && vOP.y < 1.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.02, 0.02), side);   // 後ろのランプ
      }`);
    const ob = m.onBeforeCompile;
    m.onBeforeCompile = sh => { ob(sh);
      sh.vertexShader = 'attribute float aW; varying float vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vW = aW;');
      sh.fragmentShader = 'varying float vW;\n' + sh.fragmentShader; };
    return m;
  };
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

  return { time, rnd, setSeed, pick, lin, ENV, mat, G, box, inst, setInst, building, gable, hip, roofTile, trees, people, cars, carLen, CAR, water,
    canvas, canvasTex, photoImg, groundPlane, farGround, PAINT, SHIRT };
})();
