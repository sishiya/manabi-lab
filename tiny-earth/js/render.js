// ちいさな地球 — 描画（three.js r128）。星の半径を 1 として描く。
'use strict';
const VIEW = (() => {
  let hemi, halo, vapor, rTop, wCol, wWet, wVal, lCol, lCls, renderer, scene, camera, planet, landV, waterV, treeMesh, shell, sun, cv;
  let C, rFloor;          // ボクセルのマス目・柱の床（陸の上の面）の半径
  let M, TR, O;           // 網・地形・海
  const st = { light: 'cycle', honest: null, style: 'voxel', ex: 100, az: 0.6, el: 0.35, alt: 2.2, treeShown: 0, treeReal: 0 };
  const tmp = new THREE.Vector3();

  function init(canvas, mesh, terrain, ocean) {
    cv = canvas; M = mesh; TR = terrain; O = ocean;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02060c);
    camera = new THREE.PerspectiveCamera(45, 1, 1e-6, 50);
    sun = new THREE.DirectionalLight(0xfff4e0, 1.25); sun.position.set(5, 2, 3); scene.add(sun);
    hemi = new THREE.HemisphereLight(0x9cc8ff, 0x20242a, 0.42); scene.add(hemi);
    stars();
    planet = new THREE.Group(); scene.add(planet);
    wCol = new Float32Array(M.N * 3); wWet = new Uint8Array(M.N); wVal = new Float32Array(M.N); lCol = new Float32Array(M.N * 3); lCls = new Uint8Array(M.N);
    // ボクセルふうの陸と海（マス目を柱にする）
    C = VOXEL.cells(M); rFloor = new Float32Array(M.N);
    landV = new THREE.Mesh(VOXEL.columns(M, C), new THREE.MeshLambertMaterial({ vertexColors: true }));
    waterV = new THREE.Mesh(VOXEL.columns(M, C), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 25, specular: 0x1a2630 }));
    planet.add(landV); planet.add(waterV);
    // 毎コマ全部の頂点から包み球を計算すると重いので、固定の球にして画面外の判定もしない
    for (const m of [landV, waterV]) { m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3); m.frustumCulled = false; }
    // 殻（空気をとじこめる仮定）: 三角形のタイルの集まり。外すと、データが壊れるように（横ずれ・色ずれ）外へはじけて消える
    //   明るさのチカチカはしない（毎秒3〜30回の点滅は使わない。RULES 9章）。乱れは位置と色のずれだけ
    shell = new THREE.Mesh(shellGeom(), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      uniforms: { uProg: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        uniform float uProg, uTime;
        attribute vec3 aCenter; attribute float aSeed; attribute vec3 aBary;
        varying vec3 vBary; varying float vQ; varying float vSeed; varying vec3 vN; varying vec3 vV;
        float h(float x){ return fract(sin(x) * 43758.5453); }
        void main(){
          float q = clamp((uProg - aSeed * 0.55) / 0.45, 0., 1.);
          vec3 p = position;
          float g = step(0.001, q) * (1. - q);
          float k = floor(uTime * 6. + aSeed * 37.);
          p += (vec3(h(k * 12.99 + aSeed * 78.), h(k * 39.35 + aSeed * 11.), h(k * 7.77 + aSeed * 3.1)) - .5) * 0.07 * g;
          p = aCenter + (p - aCenter) * (1. - q * 0.9);
          p += normalize(aCenter) * q * q * 1.3;
          vQ = q; vSeed = aSeed; vBary = aBary;
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          vN = normalize(normalMatrix * normalize(aCenter)); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vBary; varying float vQ; varying float vSeed; varying vec3 vN; varying vec3 vV;
        void main(){
          float edge = 1. - smoothstep(0., 0.07, min(min(vBary.x, vBary.y), vBary.z));
          float f = pow(1. - abs(dot(vN, vV)), 3.);
          vec3 col = vec3(0.55, 0.85, 1.0);
          float on = step(0.001, vQ);
          col = mix(col, fract(vSeed * 7.13) > .5 ? vec3(1., .35, .9) : vec3(.3, 1., .95), 0.65 * on);
          float scan = 0.82 + 0.18 * step(0.5, fract(gl_FragCoord.y * 0.25));   // 止まった走査線
          float a = (0.01 + 0.08 * f + edge * (0.12 * f + 0.35 * on)) * (1. - vQ) * scan;   // 殻は網目だけ（ふちのかさは大気が受け持つ）。ふだんは星のふち（横から見える所）だけうっすら
          gl_FragColor = vec4(col, a);
        }`,
    }));
    shell.renderOrder = 10; shell.userData = { start: 0, was: false };
    scene.add(shell);
    // 大気: ふだんから、ふちに行くほど濃くなるうすい青（真ん中はほぼ透明）。殻を外すと、残っている空気の割合に合わせて広がりながら消える
    halo = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uDen: { value: 1 }, uSpread: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 p = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix*p; }',
      fragmentShader: `
        uniform float uDen, uSpread; varying vec3 vN; varying vec3 vV;
        void main(){
          float f = 1. - abs(dot(vN, vV));
          float rim = pow(f, mix(2.2, 1.2, uSpread));            // 広がるほど、ふちの濃さがぼやける
          vec3 col = mix(vec3(0.45, 0.75, 1.0), vec3(0.75, 0.85, 1.0), uSpread);
          gl_FragColor = vec4(col, uDen * (0.015 + 0.55 * rim));
        }`,
    }));
    halo.renderOrder = 9; halo.scale.setScalar(1.25); scene.add(halo);
    // 湯気の粒（正直モード）: 沸いている水・氷の面から立ちのぼって散る。数はマスの蒸発の速さに合わせる（動きは見た目だけ）
    const NV = 3000;
    vapor = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    vapor.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
    vapor.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
    vapor.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5); vapor.frustumCulled = false;
    vapor.userData = { age: new Float32Array(NV).fill(9), life: new Float32Array(NV), vel: new Float32Array(NV), dir: new Float32Array(NV * 3), r0: new Float32Array(NV), next: 0, last: 0 };
    planet.add(vapor);
    rTop = new Float32Array(M.N);
    // 木（ボクセル: 箱の幹と葉 ／ なめらかボクセル: 丸い葉）。1本ずつ色を少し変える
    treeMesh = new THREE.InstancedMesh(treeGeom('voxel'), new THREE.MeshLambertMaterial({ vertexColors: true }), 16000);
    treeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16000 * 3).fill(1), 3);
    treeMesh.count = 0; planet.add(treeMesh);
    setStyle(st.style);
    controls();
  }
  // 殻のタイル: 正二十面体を3回割った三角形（1280枚）。三角形ごとに中心・乱数・重心座標
  function shellGeom() {
    const g = new THREE.IcosahedronGeometry(1.25, 3).toNonIndexed(), p = g.attributes.position.array, n = p.length / 9;
    const cen = new Float32Array(p.length), seed = new Float32Array(p.length / 3), bary = new Float32Array(p.length);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < n; t++) {
      const cx = (p[t * 9] + p[t * 9 + 3] + p[t * 9 + 6]) / 3, cy = (p[t * 9 + 1] + p[t * 9 + 4] + p[t * 9 + 7]) / 3, cz = (p[t * 9 + 2] + p[t * 9 + 5] + p[t * 9 + 8]) / 3, sd = r();
      for (let v = 0; v < 3; v++) { cen.set([cx, cy, cz], (t * 3 + v) * 3); seed[t * 3 + v] = sd; bary.set(v === 0 ? [1, 0, 0] : v === 1 ? [0, 1, 0] : [0, 0, 1], (t * 3 + v) * 3); }
    }
    g.setAttribute('aCenter', new THREE.BufferAttribute(cen, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aBary', new THREE.BufferAttribute(bary, 3));
    return g;
  }
  function stars() {
    const n = 1500, p = new Float32Array(n * 3);
    let s = 3;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const z = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - z * z);
      p.set([q * Math.cos(a) * 40, z * 40, q * Math.sin(a) * 40], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb4c8, size: 1.3, sizeAttenuation: false })));
  }
  // 高さ 1・根元が原点・+y が上の木。部品 [形, 色, 中心の高さ, 横の倍率, 縦の倍率] を1つにまとめる
  function treeGeom(style) {
    const trunk = [0.42, 0.30, 0.19], leaf = [0.30, 0.55, 0.28], leaf2 = [0.36, 0.62, 0.30];
    const parts = style === 'voxel'
      ? [[new THREE.BoxGeometry(1, 1, 1), trunk, 0.2, 0.14, 0.4], [new THREE.BoxGeometry(1, 1, 1), leaf, 0.56, 0.62, 0.46], [new THREE.BoxGeometry(1, 1, 1), leaf2, 0.88, 0.38, 0.24]]
      : [[new THREE.CylinderGeometry(0.5, 0.6, 1, 7), trunk, 0.2, 0.12, 0.4], [new THREE.IcosahedronGeometry(0.5, 1), leaf, 0.6, 0.66, 0.72], [new THREE.IcosahedronGeometry(0.5, 1), leaf2, 0.84, 0.4, 0.34]];
    const pos = [], nor = [], col = [];
    for (const [g0, c, y, sx, sy] of parts) {
      const g = g0.toNonIndexed(); g.scale(sx, sy, sx); g.translate(0, y, 0); g.computeVertexNormals();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      for (let i = 0; i < p.length / 3; i++) col.push(...c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  function setStyle(style) {
    st.style = style;
    const vox = style === 'voxel';
    treeMesh.geometry.dispose(); treeMesh.geometry = treeGeom(style);
  }

  // 大きさ・強調を変えたら陸と木を作りなおす
  function rebuildLand() {
    const ex = st.ex, p = M.pos, vox = st.style === 'voxel', rBase = 1 - ex * 12000 / PHYS.RE;
    for (let i = 0; i < M.N; i++) {
      const e = TR.elev[i];
      let c;
      if (e < 0) c = mix([0.55, 0.50, 0.40], [0.22, 0.24, 0.28], Math.min(1, -e / 5000));     // 海の底
      else if (TR.forest[i]) c = [0.14, 0.30, 0.15];
      else if (e < 60) c = [0.78, 0.72, 0.52];                                                // 浜
      else c = mix([0.42, 0.52, 0.28], [0.55, 0.50, 0.45], Math.min(1, e / 3000));          // 草地〜岩
      if (Math.abs(p[i * 3 + 1]) > 0.93 && e > 0) c = [0.88, 0.9, 0.93];                      // 極の雪
      // ボクセル: 見た目だけ段々に（陸は 400 m ごとに切り上げ、海の底は 1000 m ごとに切り下げ。地球の大きさのときの高さで。計算はなめらかな高さ）
      const de = e >= 0 ? 400 * (1 + Math.floor(e / 400)) : 1000 * Math.floor(e / 1000);
      rFloor[i] = 1 + ex * de / PHYS.RE;
      if (vox) VOXEL.setCol(landV.geometry, M, C, i, rFloor[i], rBase);
      VOXEL.setColor(landV.geometry, C, i, c, e >= 0 ? mix(c, [0.36, 0.26, 0.17], 0.6) : mix(c, [0.1, 0.1, 0.12], 0.4));
      lCol[i * 3] = c[0]; lCol[i * 3 + 1] = c[1]; lCol[i * 3 + 2] = c[2]; lCls[i] = e >= 0 ? 1 : 0;   // 陸＝1・海の底＝0（色をまぜない）
    }
    // なめらかボクセル: 角の高さを、角で出会う3マスの床の平均に（段々の間が坂でつながる）。陰影のため上の面の法線も坂に合わせる
    if (vox) VOXEL.resetNormals(landV.geometry, M, C);
    else { for (let i = 0; i < M.N; i++) VOXEL.setColSmooth(landV.geometry, M, C, i, rFloor, rBase); VOXEL.topNormals(landV.geometry, M, C); VOXEL.smoothColors(landV.geometry, M, C, lCol, lCls, 0.7); }
    const lv = landV.geometry.attributes; lv.position.needsUpdate = true; lv.color.needsUpdate = true;
    placeTrees();
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // 木: 本当の大きさ（30 m）。数が多すぎるときは間引いて置く
  function placeTrees() {
    const R = O.R, hU = PHYS.TREE_H / R, ex = st.ex;
    let fa = 0; for (let i = 0; i < M.N; i++) if (TR.forest[i]) fa += M.area[i];
    st.treeReal = fa * R * R * 0.04;                 // 森 1 ha に 400 本（目安）
    if (hU < 2e-4) { treeMesh.count = 0; st.treeShown = 0; return; }   // 小さすぎて見えない
    let want = Math.min(treeMesh.instanceMatrix.count, Math.round(st.treeReal));
    const cells = []; for (let i = 0; i < M.N; i++) if (TR.forest[i]) cells.push(i);
    let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), sc = new THREE.Vector3(), tint = new THREE.Color();
    const vox = st.style === 'voxel';
    // 樹冠が重ならないように置く: ランダムに置きながら、近くの木（空間を箱に分けて探す）と
    // 樹冠の幅（葉の幅 0.62×高さ）ぶん以上はなれているものだけ残す。森のマスの中（中心から 0.45 マス以内）にだけ置く
    const gap = 0.62 * hU * 1.15 * 1.05, gap2 = gap * gap, box = new Map(), pts = [];
    const key = (x, y, z) => Math.floor(x / gap) + ',' + Math.floor(y / gap) + ',' + Math.floor(z / gap);
    const far = (x, y, z) => {
      const bx = Math.floor(x / gap), by = Math.floor(y / gap), bz = Math.floor(z / gap);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const l = box.get((bx + dx) + ',' + (by + dy) + ',' + (bz + dz)); if (!l) continue;
        for (const j of l) { const ex2 = pts[j * 3] - x, ey2 = pts[j * 3 + 1] - y, ez2 = pts[j * 3 + 2] - z; if (ex2 * ex2 + ey2 * ey2 + ez2 * ez2 < gap2) return false; }
      }
      return true;
    };
    const rad = M.Lavg * 0.45, t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    let k = 0;
    for (let tries = 0; tries < want * 8 && k < want; tries++) {
      const i = cells[Math.floor(rnd() * cells.length)];
      const px = M.pos[i * 3], py = M.pos[i * 3 + 1], pz = M.pos[i * 3 + 2];
      t1.set(-pz, 0, px); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize(); t2.set(py * t1.z - pz * t1.y, pz * t1.x - px * t1.z, px * t1.y - py * t1.x);
      const ra = rad * Math.sqrt(rnd()), an = rnd() * 6.283;
      n.set(px + ra * (Math.cos(an) * t1.x + Math.sin(an) * t2.x), py + ra * (Math.cos(an) * t1.y + Math.sin(an) * t2.y), pz + ra * (Math.cos(an) * t1.z + Math.sin(an) * t2.z)).normalize();
      if (!far(n.x, n.y, n.z)) continue;
      pts.push(n.x, n.y, n.z); const kk = key(n.x, n.y, n.z); (box.get(kk) || box.set(kk, []).get(kk)).push(k);
      q.setFromUnitVectors(up, n).multiply(q2.setFromAxisAngle(up, rnd() * 6.283));
      const hh = hU * (0.85 + 0.3 * rnd());
      sc.set(hh, hh, hh);
      const base = groundR(i, n.x, n.y, n.z);   // 描いている地面の高さ（なめらかボクセルの坂でもめりこまない）
      mtx.compose(n.clone().multiplyScalar(base - hh * 0.03), q, sc);
      treeMesh.setMatrixAt(k, mtx);
      const v = rnd(); tint.setRGB(0.8 + 0.35 * v, 0.85 + 0.3 * rnd(), 0.75 + 0.2 * (1 - v));   // 1本ずつ少しちがう緑
      treeMesh.setColorAt(k, tint);
      k++;
    }
    want = k;
    treeMesh.count = want; st.treeShown = want;
    treeMesh.instanceMatrix.needsUpdate = true;
    if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
  }

  // 海の形と色（毎コマ）。水面の高さ rTop・色 wCol・ぬれているか wWet を出してから、見えている方の形に書く
  function updateWater() {
    const R = O.R, ex = st.ex, H0 = O.P.H0, vox = st.style === 'voxel';
    const hs = st.honest, tt = performance.now() / 1000;
    for (let i = 0; i < M.N; i++) {
      // 正直モード: 水＋氷の厚さ（氷は水より 1.09 倍かさばる）
      const h = hs ? hs.liq[i] + hs.ice[i] * 1.09 : O.h[i], wet = TR.elev[i] >= 0 ? h > 0.02 * H0 : h > O.hdry;   // 陸の上のうすい膜は描かない
      wWet[i] = wet ? 1 : 0;
      rTop[i] = Math.max(rFloor[i], 1 + ex * (O.z[i] + h) / R);
      // 色: 深さ（浅い＝明るい）＋ もとの海面からの高さ（高い＝白っぽく、低い＝暗く）
      //   深さはうすく（浅い所だけ少し明るい）、高さの変化を主に（±0.5×平均の深さでいっぱい）
      const d = Math.min(1, h / (0.6 * H0)), a = (O.z[i] + h) / H0;
      let c = mix([0.25, 0.62, 0.70], [0.07, 0.30, 0.55], d);
      if (TR.elev[i] >= 0 && wet) c = mix(c, [0.55, 0.75, 0.85], 0.4);          // 陸にあふれた水
      if (hs) {
        // 沸いている水: 白くにごる（ゆっくり、場所ごとに少しずつちがう。点滅にならない速さ）。氷: 白っぽい青
        if (hs.boil[i]) c = mix(c, [0.62, 0.70, 0.72], 0.55 + 0.15 * Math.sin(tt * 1.3 + i * 2.39));   // 沸騰: 灰色がかったにごり（氷の白と見分ける）
        // 氷があれば表面は氷（下に水が残っていても上から見えるのは氷のふた）
        if (hs.ice[i] > 0 && !hs.boil[i]) c = mix(c, [0.90, 0.95, 1.0], 0.9);   // 白は氷だけに使う
      } else if (a > 0) c = mix(c, [0.35, 0.92, 0.88], Math.min(0.85, a * 1.8));   // もとの海面より高い: 明るい水色（白は氷に使うので使わない）
      else c = mix(c, [0.0, 0.04, 0.16], Math.min(0.85, -a * 1.8));
      wCol[i * 3] = c[0]; wCol[i * 3 + 1] = c[1]; wCol[i * 3 + 2] = c[2];
    }
    writeWater(vox);
  }
  // 水の柱: 床（段々の地面）から水面まで。乾いたマスは床の少し下へ隠す（高さ 0 の柱の上の面が床と重なって見えないように）
  // なめらかボクセルでは、角の高さをとなりの水面との平均にして、水面をなめらかにつなぐ
  function writeWater(vox) {
    for (let i = 0; i < M.N; i++) wVal[i] = wWet[i] ? rTop[i] : rFloor[i] - 1e-4;
    for (let i = 0; i < M.N; i++) {
      if (vox) VOXEL.setCol(waterV.geometry, M, C, i, wVal[i], wWet[i] ? rFloor[i] : wVal[i]);
      else VOXEL.setColSmooth(waterV.geometry, M, C, i, wVal, rFloor[i] - 1e-4, wWet);
      VOXEL.setColorRGB(waterV.geometry, C, i, wCol[i * 3], wCol[i * 3 + 1], wCol[i * 3 + 2], 0.85);
    }
    if (!vox) { VOXEL.topNormals(waterV.geometry, M, C); VOXEL.smoothColors(waterV.geometry, M, C, wCol, wWet, 0.85); }
    else if (waterV.userData.smooth) VOXEL.resetNormals(waterV.geometry, M, C);
    waterV.userData.smooth = !vox;
    const wv = waterV.geometry.attributes; wv.position.needsUpdate = true; wv.color.needsUpdate = true;
  }

  // カメラ: 星のまわりをまわる（星と一緒に自転する）。近づくと地平線の方を向く
  function placeCamera() {
    const ce = Math.cos(st.el), dp = new THREE.Vector3(ce * Math.sin(st.az), Math.sin(st.el), ce * Math.cos(st.az));
    const i = nearest(dp.x, dp.y, dp.z), surf = 1 + st.ex * Math.max(O.z[i], O.z[i] + O.h[i]) / O.R;
    const d = dp.clone().applyQuaternion(planet.quaternion);
    camera.position.copy(d).multiplyScalar(surf + st.alt);
    const t = Math.min(1, Math.max(0, Math.log10(st.alt / 2) / Math.log10(0.03 / 2)));   // alt 2→0、0.03→1
    const north = new THREE.Vector3(0, 1, 0).sub(d.clone().multiplyScalar(d.y)).normalize();
    if (!isFinite(north.x)) north.set(1, 0, 0);
    // 見る向き: 遠いときは星の中心、近いときは少し下向きに地平線の方（向きどうしを混ぜる）
    const toC = camera.position.clone().negate().normalize();
    const toH = north.clone().multiplyScalar(Math.cos(0.12)).addScaledVector(d, -Math.sin(0.12));
    const k = t * t * (3 - 2 * t), dir = toC.multiplyScalar(1 - k).addScaledVector(toH, k).normalize();
    camera.up.copy(k > 0.5 ? d : north);
    camera.lookAt(camera.position.clone().add(dir));
    camera.near = Math.max(1e-7, st.alt * 0.02); camera.far = 60; camera.updateProjectionMatrix();
  }
  function nearest(x, y, z) {
    let best = -2, bi = 0; const p = M.pos;
    for (let i = 0; i < M.N; i++) { const s = p[i * 3] * x + p[i * 3 + 1] * y + p[i * 3 + 2] * z; if (s > best) { best = s; bi = i; } }
    return bi;
  }

  // 指・マウス: ドラッグでまわす、ホイール・2本指で寄る、タップで onTap
  let onTap = null;
  function controls() {
    const pts = new Map(); let moved = 0, pinch0 = 0, alt0 = 0;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); alt0 = st.alt; } });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const [x0, y0] = pts.get(e.pointerId), dx = e.clientX - x0, dy = e.clientY - y0;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0 > 0) setAlt(alt0 * pinch0 / d); return; }
      const k = 2.6 * Math.min(1, st.alt + 0.002) / cv.clientHeight;   // 近いほどゆっくり
      st.az -= dx * k; st.el = Math.max(-1.45, Math.min(1.45, st.el + dy * k));
    });
    const up = e => {
      if (pts.has(e.pointerId) && pts.size === 1 && moved < 6 && onTap) onTap(e);
      pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => pts.delete(e.pointerId));
    cv.addEventListener('wheel', e => { e.preventDefault(); setAlt(st.alt * Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  }
  function setAlt(a) { st.alt = Math.max(2 / O.R, Math.min(6, a)); }

  // タップした所の点（星の座標の番号）。海・陸に当たらなければ -1
  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = cv.getBoundingClientRect();
    ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
    const hit = ray.intersectObjects([waterV, landV])[0];
    if (!hit) return -1;
    tmp.copy(hit.point).applyQuaternion(planet.quaternion.clone().invert()).normalize();
    return nearest(tmp.x, tmp.y, tmp.z);
  }
  // 画面の右向き（星の座標）: 風の向きを決めるのに使う。風は軸 a のまわりをまわる → a = 画面の上向き
  function screenUpInPlanet() {
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(planet.quaternion.clone().invert());
    return v.normalize();
  }
  function screenRightInPlanet() {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).applyQuaternion(planet.quaternion.clone().invert()).normalize();
  }

  function resize() {
    const w = cv.clientWidth, h = cv.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  function updateVapor() {
    const u = vapor.userData, hs = st.honest, now = performance.now() / 1000, dt = Math.min(0.1, u.last ? now - u.last : 0);
    u.last = now;
    const pa = vapor.geometry.attributes.position.array, ca = vapor.geometry.attributes.color.array, NV = u.age.length;
    vapor.visible = !!(hs && hs.removed);
    if (!vapor.visible) return;
    // 生まれる: ランダムなマスを選び、蒸発の速さ（1e-6〜1 kg/m²/s を対数で 0〜1）の確率で
    // 1コマに生む数は「入れ物の数 × dt ÷ 平均の寿命」まで（多すぎると、生まれてすぐ上書きされて見えない）
    let budget = Math.ceil(NV * dt / 2.25);
    for (let k = 0; k < 4000 && budget > 0; k++) {
      const i = Math.floor(Math.random() * M.N), f = hs.flux[i];
      if (!(f > 0) || Math.random() > Math.min(1, Math.log10(f / 1e-6) / 6) * 0.8) continue;
      const j = u.next; u.next = (u.next + 1) % NV; budget--;
      const jx = (Math.random() - 0.5) * M.Lavg, jy = (Math.random() - 0.5) * M.Lavg, jz = (Math.random() - 0.5) * M.Lavg;
      let dx = M.pos[i * 3] + jx, dy = M.pos[i * 3 + 1] + jy, dz = M.pos[i * 3 + 2] + jz; const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      u.dir[j * 3] = dx / l; u.dir[j * 3 + 1] = dy / l; u.dir[j * 3 + 2] = dz / l;
      u.r0[j] = rTop[i]; u.age[j] = 0; u.life[j] = 1.5 + Math.random() * 1.5; u.vel[j] = hs.boil[i] ? 0.22 : 0.09;
    }
    for (let j = 0; j < NV; j++) {
      u.age[j] += dt;
      const a = u.age[j] / u.life[j];
      if (a >= 1) { ca[j * 3] = ca[j * 3 + 1] = ca[j * 3 + 2] = 0; continue; }
      const r = u.r0[j] + u.vel[j] * u.age[j];
      pa[j * 3] = u.dir[j * 3] * r; pa[j * 3 + 1] = u.dir[j * 3 + 1] * r; pa[j * 3 + 2] = u.dir[j * 3 + 2] * r;
      const b = 0.75 * (1 - a) * Math.min(1, a * 6);          // ふわっと出て、うすれて消える
      ca[j * 3] = b * 0.8; ca[j * 3 + 1] = b * 0.92; ca[j * 3 + 2] = b;   // 少し青みのある白
    }
    vapor.geometry.attributes.position.needsUpdate = true; vapor.geometry.attributes.color.needsUpdate = true;
  }
  // 水を落としたしるし: 上から水のかたまりが落ちてきて（0.7 秒）、着いた所に波の輪が2つ広がる（1.6 秒）。本当の時間で動く見た目だけ
  const fx = [];
  function dropFx(c, width) {
    const n = new THREE.Vector3(M.pos[c * 3], M.pos[c * 3 + 1], M.pos[c * 3 + 2]);
    const r0 = Math.max(rTop[c] || 1, rFloor[c] || 1), w = Math.max(0.01, width / O.R);
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshPhongMaterial({ color: 0x5ec8ff, transparent: true, opacity: 0.85, shininess: 80 }));
    blob.scale.setScalar(w * 0.45); planet.add(blob);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const rings = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      m.renderOrder = 11;   // 落とした水のふくらみ（高さの強調つき）に隠れないように
      m.quaternion.copy(q); m.position.copy(n).multiplyScalar(r0 + 2 * O.P.H0 * st.ex / O.R + 0.002); m.visible = false; planet.add(m); return m;
    });
    fx.push({ n, r0, w, blob, rings, t0: performance.now() });
  }
  function updateFx() {
    const now = performance.now();
    for (let k = fx.length - 1; k >= 0; k--) {
      const f = fx[k], t = (now - f.t0) / 1000;
      if (t < 0.7) { const e = t / 0.7; f.blob.position.copy(f.n).multiplyScalar(f.r0 + f.w * 0.45 + 0.35 * (1 - e * e)); f.blob.visible = true; }
      else f.blob.visible = false;
      f.rings.forEach((m, i) => {
        const u = (t - 0.7 - i * 0.35) / 1.6;
        m.visible = u > 0 && u < 1;
        if (m.visible) { m.scale.setScalar(f.w * (0.6 + 3.2 * u)); m.material.opacity = 0.75 * (1 - u); }
      });
      if (t > 0.7 + 0.35 + 1.6) { [f.blob, ...f.rings].forEach(m => { planet.remove(m); m.geometry.dispose(); m.material.dispose(); }); fx.splice(k, 1); }
    }
  }
  function render(spin) {
    updateVapor(); updateFx();
    planet.rotation.y = spin;
    placeCamera();
    // 光: めぐる＝太陽は止まっていて星が自転する／いつも昼＝見ている側の少し左上から／いつも夜＝見ている側の反対から（見た目だけ）
    const cp = camera.position.clone().normalize();
    if (st.light === 'day') { sun.position.copy(cp).multiplyScalar(5).add(new THREE.Vector3(-1.5, 2, 0).applyQuaternion(camera.quaternion)); sun.intensity = 1.25; hemi.intensity = 0.42; }
    else if (st.light === 'night') { sun.position.copy(cp).multiplyScalar(-5).add(new THREE.Vector3(0, 1.2, 0).applyQuaternion(camera.quaternion)); sun.intensity = 1.0; hemi.intensity = 0.16; }
    else { sun.position.set(5, 2, 3); sun.intensity = 1.25; hemi.intensity = 0.42; }
    const hs = st.honest;
    // 殻: 正直モードで外したあとは消す。かわりに、逃げていく空気をうすい球で（大きさ・こさは見た目だけ）
    // 殻: 外した瞬間から 2.5 秒（本当の時間）で、こわれて消える
    const now = performance.now(), su = shell.userData, removed = !!(hs && hs.removed);
    if (removed && !su.was) { su.start = now; const gl = document.getElementById('glitch'); if (gl) { gl.hidden = false; gl.classList.remove('run'); void gl.offsetWidth; gl.classList.add('run'); setTimeout(() => { gl.hidden = true; }, 2600); } }
    su.was = removed;
    const prog = removed ? (now - su.start) / 2500 * 1.4 : 0;
    shell.material.uniforms.uProg.value = prog; shell.material.uniforms.uTime.value = now / 1000;
    shell.visible = prog < 1.4 && (camera.position.length() > 1.3 || removed);
    // 大気: 殻の中の空気（残っている割合 airM）。外したあとは広がりながらうすれる（大きさ・こさは見た目だけ）
    const am = hs && hs.removed ? Math.max(0, Math.min(1, hs.airM)) : 1;
    halo.visible = am > 0.003 && camera.position.length() > 1.3;
    halo.scale.setScalar(1.25 * (1 + 2.5 * (1 - am)));
    halo.material.uniforms.uDen.value = Math.sqrt(am); halo.material.uniforms.uSpread.value = 1 - am;
    // 森: 空気がなくなると葉の水が抜けて枯れる（色の変わる速さは見た目だけ）
    const br = hs ? hs.brown : 0;
    treeMesh.material.color.setRGB(1 + 0.7 * br, 1 - 0.3 * br, 1 - 0.6 * br);   // 緑 → 茶色
    renderer.render(scene, camera);
  }
  // 描いている地面の高さ（マス c の中の向き p で）。ボクセルは床の高さ、なめらかボクセルは扇形の三角形の中で補間（生きもの・木が坂にめりこまないように）
  function groundR(c, px, py, pz) {
    if (st.style === 'voxel' || !rFloor[c]) return rFloor[c];
    const c0 = C.cs[c], k = C.cs[c + 1] - c0, cf = C.cf, tri = M.tri;
    const ox = M.pos[c * 3], oy = M.pos[c * 3 + 1], oz = M.pos[c * 3 + 2];
    const hc = (f) => (rFloor[tri[f * 3]] + rFloor[tri[f * 3 + 1]] + rFloor[tri[f * 3 + 2]]) / 3;
    for (let j = 0; j < k; j++) {
      const a = (c0 + j) * 3, b = (c0 + (j + 1) % k) * 3;
      // 中心 o・角 A・角 B の平面で、p の重心座標
      const ax = cf[a] - ox, ay = cf[a + 1] - oy, az = cf[a + 2] - oz, bx = cf[b] - ox, by = cf[b + 1] - oy, bz = cf[b + 2] - oz, qx = px - ox, qy = py - oy, qz = pz - oz;
      const d00 = ax * ax + ay * ay + az * az, d01 = ax * bx + ay * by + az * bz, d11 = bx * bx + by * by + bz * bz, d20 = qx * ax + qy * ay + qz * az, d21 = qx * bx + qy * by + qz * bz;
      const den = d00 * d11 - d01 * d01; if (!den) continue;
      const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den;
      if (v >= -1e-3 && w >= -1e-3 && v + w <= 1.001) return (1 - v - w) * rFloor[c] + v * hc(C.ct[c0 + j]) + w * hc(C.ct[c0 + (j + 1) % k]);
    }
    return rFloor[c];
  }
  return { groundR, get planet() { return planet; }, get rFloor() { return rFloor; }, get rTop() { return rTop; }, get mesh() { return M; }, init, dropFx, setStyle, rebuildLand, updateWater, render, resize, pick, setAlt, screenUpInPlanet, screenRightInPlanet, st,
    set onTap(f) { onTap = f; }, get camera() { return camera; }, get vapor() { return vapor; } };
})();
