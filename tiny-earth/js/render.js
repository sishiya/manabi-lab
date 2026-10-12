// ちいさな地球 — 描画（three.js r128）。星の半径を 1 として描く。
'use strict';
const VIEW = (() => {
  let hemi, halo, vapor, rTop, wCol, wWet, wVal, wColD, rTopD, wLast = 0, wSnap = true, renderer, scene, camera, planet, landV, waterV, treeMesh, shell, sun, cv;
  let C, rFloor;          // ボクセルのマス目・柱の床（陸の上の面）の半径
  let M, TR, O;           // 網・地形・海
  const st = { light: 'day', honest: null, ex: 100, az: 0.6, el: 0.35, alt: 2.2, treeShown: 0, treeReal: 0 };
  const tmp = new THREE.Vector3();
  const swayU = { uTime: { value: 0 }, uAmp: { value: 0 }, uS: { value: 1 } };

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
    wCol = new Float32Array(M.N * 3); wColD = new Float32Array(M.N * 3); rTopD = new Float32Array(M.N); wWet = new Uint8Array(M.N); wVal = new Float32Array(M.N);
    // ボクセルふうの陸と海（マス目を柱にする）
    C = VOXEL.cells(M); rFloor = new Float32Array(M.N);
    landV = new THREE.Mesh(VOXEL.columns(M, C), new THREE.MeshLambertMaterial({ vertexColors: true }));
    waterV = new THREE.Mesh(VOXEL.columns(M, C), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 25, specular: 0x1a2630 }));
    planet.add(landV); planet.add(waterV);
    // 毎コマ全部の頂点から包み球を計算すると重いので、固定の球にして画面外の判定もしない
    for (const m of [landV, waterV]) { m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3); m.frustumCulled = false; }
    // 殻（空気をとじこめる仮定）: うすい網目の球。外すと、電波がとぎれた映像のように「ジジジッ」と3回みだれ（横に裂ける・色ずれ・走査線・砂あらし）、
    //   最後は古いテレビを消したときのように横一本につぶれて消える（2.5 秒）。
    //   明るさのチカチカはしない（毎秒3〜30回の点滅は使わない。RULES 9章）: みだれは位置のずれと色で出し、殻のこさは変えない。みだれるのは 1 秒に 1〜2 回
    shell = new THREE.Mesh(shellGeom(), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      uniforms: { uProg: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        uniform float uProg, uTime;
        attribute vec3 aBary;
        varying vec3 vBary; varying vec3 vN; varying vec3 vV; varying float vB; varying float vBand; varying float vSlot; varying float vC;
        float h(float x){ return fract(sin(x) * 43758.5453); }
        float burst(float t){ return step(0.05, t) * step(t, 0.4) + step(0.9, t) * step(t, 1.25) + step(1.75, t) * step(t, 2.25); }
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          vec4 cp = projectionMatrix * mv;
          vec4 cc = projectionMatrix * modelViewMatrix * vec4(0., 0., 0., 1.);   // 殻の中心（画面の上）
          vec2 ndc = cp.xy / cp.w, cen = cc.xy / cc.w;
          float t = uProg, b = burst(t);
          float band = floor(ndc.y * 26.), slot = floor(uTime * 18.);
          // 横に裂ける: 画面の横の帯ごとに、ところどころ左右へずれる（位置が動くだけで明るさは変えない）
          float tear = (h(band * 7.13 + slot * 1.31) - .5) * step(0.5, h(band * 3.7 + slot * 0.91));
          ndc.x += tear * 0.16 * b;
          // 最後: 横一本につぶれて消える
          float c = clamp((t - 2.25) / 0.25, 0., 1.);
          ndc.y = cen.y + (ndc.y - cen.y) * (1. - 0.985 * c);
          ndc.x = cen.x + (ndc.x - cen.x) * (1. + 0.15 * c);
          cp.xy = ndc * cp.w;
          gl_Position = cp;
          vBary = aBary; vB = b; vBand = band; vSlot = slot; vC = c;
          vN = normalize(normalMatrix * normalize(position)); vV = normalize(-mv.xyz);
        }`,
      fragmentShader: `
        varying vec3 vBary; varying vec3 vN; varying vec3 vV; varying float vB; varying float vBand; varying float vSlot; varying float vC;
        float h(float x){ return fract(sin(x) * 43758.5453); }
        void main(){
          float edge = 1. - smoothstep(0., 0.07, min(min(vBary.x, vBary.y), vBary.z));
          float f = pow(1. - abs(dot(vN, vV)), 3.);
          vec3 col = vec3(0.55, 0.85, 1.0);
          // 色ずれ: みだれているあいだ、帯ごとにマゼンタかシアンへ寄る
          float k = h(vBand * 5.31 + vSlot * 2.17);
          col = mix(col, k > .5 ? vec3(1., .4, .85) : vec3(.35, 1., .9), 0.6 * vB);
          // 走査線（止まった横じま）と、こまかい砂あらし（1 ピクセルずつ。広い所が同時に明るくならない）
          float scan = 0.8 + 0.2 * step(0.5, fract(gl_FragCoord.y * 0.25));
          float snow = h(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233)) + vSlot * 3.7);
          float a = (0.01 + 0.08 * f + edge * (0.12 * f + 0.2 * vB)) * scan + 0.06 * vB * snow * (0.3 + f);
          gl_FragColor = vec4(col, a * (1. - vC * 0.6));
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
    FX.initAir(planet, M);   // 空気の粒（殻を外すと流れ出す）
    // 湯気の粒（正直モード）: 沸いている水・氷の面から立ちのぼって散る。数はマスの蒸発の速さに合わせる（動きは見た目だけ）
    const NV = 3000;
    vapor = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    vapor.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
    vapor.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
    vapor.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5); vapor.frustumCulled = false;
    vapor.userData = { age: new Float32Array(NV).fill(9), life: new Float32Array(NV), vel: new Float32Array(NV), dir: new Float32Array(NV * 3), r0: new Float32Array(NV), next: 0, last: 0 };
    planet.add(vapor);
    rTop = new Float32Array(M.N);
    // 木（ボクセル: 箱の幹と葉）。1本ずつ色を少し変える
    treeMesh = new THREE.InstancedMesh(treeGeom('voxel'), new THREE.MeshLambertMaterial({ vertexColors: true }), 16000);
    treeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16000 * 3).fill(1), 3);
    // 風でゆれる: 高さの2乗に比例して、風下へ（ゆらぎつき）。ゆれの大きさは見た目（重力ではほとんど変わらない）
    treeMesh.material.onBeforeCompile = sh => {
      sh.uniforms.uTime = swayU.uTime; sh.uniforms.uAmp = swayU.uAmp; sh.uniforms.uS = swayU.uS;
      sh.vertexShader = `attribute vec4 aW; attribute float aTrunk;
uniform float uTime, uAmp, uS;
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  // 高さ uS 倍: 幹（0〜0.4）は 0〜0.4＋(uS−1) へのばし、葉はその上へずらすだけ（大きさはそのまま）
  transformed.y = aTrunk > 0.5 ? position.y * (0.4 + uS - 1.) / 0.4 : position.y + (uS - 1.);
  float yy = clamp(transformed.y / uS, 0., 1.);
  transformed += aW.xyz * uAmp * yy * yy * (0.65 + 0.35 * sin(uTime * 2.2 + aW.w));`);
    };
    treeMesh.count = 0; planet.add(treeMesh);
    setTreeGeom();
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
  // 高さ 1・根元が原点・+y が上の木（ボクセル: 箱の幹と葉2段）。部品 [形, 色, 中心の高さ, 横の倍率, 縦の倍率] を1つにまとめる
  function treeGeom() {
    const trunk = [0.42, 0.30, 0.19], leaf = [0.30, 0.55, 0.28], leaf2 = [0.36, 0.62, 0.30];
    const parts = [[new THREE.BoxGeometry(1, 1, 1), trunk, 0.2, 0.14, 0.4], [new THREE.BoxGeometry(1, 1, 1), leaf, 0.56, 0.62, 0.46], [new THREE.BoxGeometry(1, 1, 1), leaf2, 0.88, 0.38, 0.24]];
    const pos = [], nor = [], col = [], trk = [];
    for (const [g0, c, y, sx, sy] of parts) {
      const g = g0.toNonIndexed(); g.scale(sx, sy, sx); g.translate(0, y, 0); g.computeVertexNormals();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      for (let i = 0; i < p.length / 3; i++) { col.push(...c); trk.push(c === trunk ? 1 : 0); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('aTrunk', new THREE.Float32BufferAttribute(trk, 1));   // 1＝幹（高くするとき、のばすのは幹だけ）
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  function setTreeGeom() {
    treeMesh.geometry.dispose(); treeMesh.geometry = treeGeom();
    treeMesh.geometry.setAttribute('aW', new THREE.InstancedBufferAttribute(swayA, 4));
  }

  // 大きさ・強調を変えたら陸と木を作りなおす
  function rebuildLand() {
    const ex = st.ex, p = M.pos, rBase = 1 - ex * 12000 / PHYS.RE;
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
      VOXEL.setCol(landV.geometry, M, C, i, rFloor[i], rBase);
      VOXEL.setColor(landV.geometry, C, i, c, e >= 0 ? mix(c, [0.36, 0.26, 0.17], 0.6) : mix(c, [0.1, 0.1, 0.12], 0.4));
    }
    const lv = landV.geometry.attributes; lv.position.needsUpdate = true; lv.color.needsUpdate = true;
    placeTrees();
    wSnap = true;   // 大きさ・強調・見た目が変わったら、なめらかにせずすぐ合わせる
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // 木: 本当の大きさ（30 m）。数が多すぎるときは間引いて置く
  function placeTrees() {
    const R = O.R, hU = PHYS.TREE_H / R, ex = st.ex, H = FOREST.st.H, tU = H / R;
    const bent = H > FOREST.buckle(O.P.g);          // 自分の重さで曲がる高さをこえた（幹の太さ 60 cm のまま高くしたとき）
    st.trees = []; treeQ = []; swayU.uS.value = H / PHYS.TREE_H;
    let fa = 0; for (let i = 0; i < M.N; i++) if (TR.forest[i]) fa += M.area[i];
    st.treeReal = fa * R * R * 0.04;                 // 森 1 ha に 400 本（目安）
    if (Math.max(hU, tU) < 2e-4) { treeMesh.count = 0; st.treeShown = 0; return; }   // 小さすぎて見えない
    let want = Math.min(treeMesh.instanceMatrix.count, Math.round(st.treeReal));
    const cells = []; for (let i = 0; i < M.N; i++) if (TR.forest[i]) cells.push(i);
    let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), sc = new THREE.Vector3(), tint = new THREE.Color();
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
      if (bent) q.multiply(q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.0 + 0.35 * rnd()));   // 曲がって倒れかけた形
      const f = 0.85 + 0.3 * rnd(), hh = hU * f;
      sc.set(hh, hh, hh);   // 30 m の木の大きさ。高くするときは、シェーダーで幹だけのばす（uS）
      treeQ.push(q.clone());
      st.trees.push({ p: [n.x, n.y, n.z], c: i, h: bent ? H * f * 0.3 : H * f });
      const base = groundR(i);   // 描いている地面の高さ（マスの床）
      mtx.compose(n.clone().multiplyScalar(base - hh * 0.03), q, sc);
      treeMesh.setMatrixAt(k, mtx);
      const v = rnd(); tint.setRGB(0.8 + 0.35 * v, 0.85 + 0.3 * rnd(), 0.75 + 0.2 * (1 - v));   // 1本ずつ少しちがう緑
      treeMesh.setColorAt(k, tint);
      k++;
    }
    want = k;
    treeMesh.count = want; st.treeShown = want; st.treeBent = bent;
    treeMesh.instanceMatrix.needsUpdate = true;
    if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
    swayDir();
  }
  // ゆれる向き: 木ごとに、その場所の風の向き（軸 a のまわり U·(a×p)）を木の向きにもどしたもの＋ゆれのずれ（見た目）
  let treeQ = [];
  const swayA = new Float32Array(16000 * 4);
  function swayDir() {
    const W = O.wind, v = new THREE.Vector3(), qi = new THREE.Quaternion();
    for (let k = 0; k < treeQ.length; k++) {
      const p = st.trees[k].p;
      v.set(W.ay * p[2] - W.az * p[1], W.az * p[0] - W.ax * p[2], W.ax * p[1] - W.ay * p[0]);
      const l = v.length(); if (l > 1e-6) v.multiplyScalar(1 / l);
      v.applyQuaternion(qi.copy(treeQ[k]).invert());
      swayA[k * 4] = v.x * l; swayA[k * 4 + 1] = v.y * l; swayA[k * 4 + 2] = v.z * l; swayA[k * 4 + 3] = (k * 2.399) % 6.283;
    }
    const at = treeMesh.geometry.getAttribute('aW'); if (at) at.needsUpdate = true;
  }

  // 海の形と色（毎コマ）。水面の高さ rTop・色 wCol・ぬれているか wWet を出してから、見えている方の形に書く
  function updateWater() {
    const R = O.R, ex = st.ex, H0 = O.P.H0;
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
    // マスの色と水面の高さを、時間をかけてなめらかにつなぐ（0.3 秒ほどでなじむ。水→沸騰→氷→なくなる、が一気に切りかわらないように）
    const now = performance.now(), k = wSnap ? 1 : 1 - Math.exp(-Math.min(0.2, (now - wLast) / 1000) / 0.3);
    wLast = now; wSnap = false;
    for (let i = 0; i < M.N * 3; i++) wColD[i] += (wCol[i] - wColD[i]) * k;
    for (let i = 0; i < M.N; i++) rTopD[i] += (rTop[i] - rTopD[i]) * k;
    writeWater();
  }
  // 水の柱: 床（段々の地面）から水面まで。乾いたマスは床の少し下へ隠す（高さ 0 の柱の上の面が床と重なって見えないように）
  function writeWater() {
    for (let i = 0; i < M.N; i++) wVal[i] = wWet[i] || rTopD[i] > rFloor[i] + 1e-5 ? Math.max(rFloor[i] - 1e-4, rTopD[i]) : rFloor[i] - 1e-4;
    for (let i = 0; i < M.N; i++) {
      VOXEL.setCol(waterV.geometry, M, C, i, wVal[i], wVal[i] > rFloor[i] ? rFloor[i] : wVal[i]);
      VOXEL.setColorRGB(waterV.geometry, C, i, wColD[i * 3], wColD[i * 3 + 1], wColD[i * 3 + 2], 0.85);
    }
    const wv = waterV.geometry.attributes; wv.position.needsUpdate = true; wv.color.needsUpdate = true;
  }

  // カメラ: 星のまわりをまわる（星と一緒に自転する）。近づくと地平線の方を向く
  function placeCamera() {
    // そばで見る: CLOSE が目の位置・向き（星の座標、半径 1 の単位）を決める
    if (st.closeCam) {
      const c = st.closeCam(), q = planet.quaternion;
      camera.position.copy(c.pos).applyQuaternion(q);
      camera.up.copy(c.up).applyQuaternion(q);
      camera.lookAt(camera.position.clone().add(c.dir.clone().applyQuaternion(q)));
      camera.near = 0.05 / O.R; camera.far = 60; camera.updateProjectionMatrix();
      return;
    }
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
      if (st.closeLook) { st.closeLook(dx / cv.clientHeight, dy / cv.clientHeight); return; }   // そばで見る: 見まわす
      const k = 2.6 * Math.min(1, st.alt + 0.002) / cv.clientHeight;   // 近いほどゆっくり
      st.az -= dx * k; st.el = Math.max(-1.45, Math.min(1.45, st.el + dy * k));
    });
    const up = e => {
      if (pts.has(e.pointerId) && pts.size === 1 && moved < 6 && onTap) onTap(e);
      pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => pts.delete(e.pointerId));
    cv.addEventListener('wheel', e => { e.preventDefault(); if (st.closeLook) return; setAlt(st.alt * Math.exp(e.deltaY * 0.0015)); }, { passive: false });
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
    if (post) { const v = renderer.getDrawingBufferSize(new THREE.Vector2()); post.rt.setSize(v.x, v.y); }
  }
  // 殻を外したときの画面全体のみだれ（電波がとぎれた映像）。みだれる 3 回のあいだだけ、いったん絵を作ってから、ずらして写す
  //   横の帯ごとに左右へ裂ける・赤と青の色ずれ・走査線・こまかい砂あらし。画面全体の明るさはほとんど変えない（点滅にしない。RULES 9章）
  let post = null;
  function makePost() {
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(v.x, v.y);
    const mat = new THREE.ShaderMaterial({
      uniforms: { tD: { value: rt.texture }, uB: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `
        uniform sampler2D tD; uniform float uB, uTime; varying vec2 vUv;
        float h(float x){ return fract(sin(x) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          float band = floor(uv.y * 48.), slot = floor(uTime * 18.);
          uv.x += (h(band * 7.13 + slot * 1.31) - .5) * step(0.55, h(band * 3.7 + slot * 0.91)) * 0.09 * uB;   // 横に裂ける
          float sp = 0.006 * uB;
          vec3 c = vec3(texture2D(tD, uv + vec2(sp, 0.)).r, texture2D(tD, uv).g, texture2D(tD, uv - vec2(sp, 0.)).b);   // 色ずれ
          c *= 1. - 0.18 * uB * step(0.5, fract(gl_FragCoord.y * 0.25));                                        // 走査線
          float snow = h(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233)) + slot * 3.7);
          c = mix(c, vec3(snow * 0.6), 0.12 * uB);                                                                  // 砂あらし（1 ピクセルずつ）
          gl_FragColor = vec4(c, 1.);
        }`,
      depthTest: false, depthWrite: false,
    });
    const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    post = { rt, mat, sc, cam: new THREE.Camera() };
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
  // 水を落としたしるし: 上から水のかたまりが落ちてきて（0.7 秒）、着いたところでしぶきがはじける（FX）。本当の時間で動く見た目だけ
  const fx = [];
  function dropFx(c, width, onLand) {
    const n = new THREE.Vector3(M.pos[c * 3], M.pos[c * 3 + 1], M.pos[c * 3 + 2]);
    const r0 = Math.max(rTop[c] || 1, rFloor[c] || 1), w = Math.max(0.01, width / O.R);
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshPhongMaterial({ color: 0x5ec8ff, transparent: true, opacity: 0.85, shininess: 80 }));
    blob.scale.setScalar(w * 0.45); planet.add(blob);
    fx.push({ n, r0, w, blob, t0: performance.now(), onLand });
  }
  function updateFx() {
    const now = performance.now();
    for (let k = fx.length - 1; k >= 0; k--) {
      const f = fx[k], t = (now - f.t0) / 1000;
      if (t < 0.7) { const e = t / 0.7; f.blob.position.copy(f.n).multiplyScalar(f.r0 + f.w * 0.45 + 0.35 * (1 - e * e)); continue; }
      // 着いた: ここで海に水を足す（海の計算・動物がおどろく）。かたまりを消して、しぶき
      if (f.onLand) f.onLand();
      FX.splashAt(planet, f.n, f.r0, f.w);
      planet.remove(f.blob); f.blob.geometry.dispose(); f.blob.material.dispose(); fx.splice(k, 1);
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
    const prog = removed ? (now - su.start) / 1000 : 0;   // 殻を外してからの本当の時間（秒）
    shell.material.uniforms.uProg.value = prog; shell.material.uniforms.uTime.value = now / 1000;
    shell.visible = prog < 2.5 && (camera.position.length() > 1.3 || removed);
    // 大気: 殻の中の空気（残っている割合 airM）。外したあとは広がりながらうすれる（大きさ・こさは見た目だけ）
    const am = hs && hs.removed ? Math.max(0, Math.min(1, hs.airM)) : 1;
    halo.visible = am > 0.003 && camera.position.length() > 1.3;
    // かさは大きさを変えず、その場でうすれる。広がっていく様子は空気の粒（FX）が流れ出して見せる
    halo.material.uniforms.uDen.value = Math.sqrt(am); halo.material.uniforms.uSpread.value = 0;
    // 空気の粒が出ていく割合: 星のまわりから出た空気の割合と、地面の気圧の下がり方（地表から空気が離れていく）の大きい方
    const loss = hs && hs.removed ? Math.max(1 - am, 1 - Math.pow(Math.max(0, Math.min(1, hs.airP)), 0.25)) : 0;
    FX.updateAir(loss, camera, planet, renderer.getPixelRatio());
    FX.updateSplash(planet);
    // 風でゆれる大きさ（見た目）: 風の速さの2乗（風の力）に比例。空気がなければゆれない
    const airOK = !(hs && hs.removed && hs.airP < 0.01);
    swayU.uTime.value = now / 1000; swayU.uAmp.value = airOK ? Math.min(0.12, 0.08 * (O.wind.U / 15) ** 2) : 0;
    // 森: 空気がなくなると葉の水が抜けて枯れる（色の変わる速さは見た目だけ）
    const br = hs ? hs.brown : 0;
    treeMesh.material.color.setRGB(1 + 0.7 * br, 1 - 0.3 * br, 1 - 0.6 * br);   // 緑 → 茶色
    // みだれる 3 回（0.05〜0.4・0.9〜1.25・1.75〜2.25 秒）のあいだだけ、画面全体をみだす
    const gb = prog > 0 && ((prog > 0.05 && prog < 0.4) || (prog > 0.9 && prog < 1.25) || (prog > 1.75 && prog < 2.25)) ? 1 : 0;
    if (gb) {
      if (!post) makePost();
      post.mat.uniforms.uB.value = gb; post.mat.uniforms.uTime.value = now / 1000;
      renderer.setRenderTarget(post.rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(post.sc, post.cam);
    } else renderer.render(scene, camera);
  }
  // 描いている地面の高さ（マス c の床。ボクセルなのでマスの中は平ら。向き p は使わない）
  function groundR(c) { return rFloor[c]; }
  return { swayDir, groundR, get planet() { return planet; }, get rFloor() { return rFloor; }, get rTop() { return rTop; }, get mesh() { return M; }, init, dropFx, rebuildLand, updateWater, render, resize, pick, setAlt, screenUpInPlanet, screenRightInPlanet, st,
    set onTap(f) { onTap = f; }, get camera() { return camera; }, get vapor() { return vapor; } };
})();
