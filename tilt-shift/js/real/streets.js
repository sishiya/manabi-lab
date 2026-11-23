// ジオラマに見えるわけ — 本物の町の地面を 3D で作る（OpenStreetMap の道・面＋地理院の空中写真は「大まかな色」と「木の位置」の手がかりだけ）
//   道: 線を 4 m ごとに区切った帯。帯の頂点に aRd = (横の位置 m, 長さ方向 m, 幅 m, 交差点までの距離 m)、aKind = 白線の種類。
//       白線は道の種類で（幅の広い道: 黄色の中央線2本・車線・外側線／2車線: 白の破線の中央線・外側線／細い道: 外側線だけ）。
//       交差点（3本以上の道が集まる点）の手前 2〜6 m に横断歩道、交差点の中は白線なし。
//   歩道: 通り（三次以上）の帯の下に、道より両側 3.5 m 広い舗装の帯。線路: 砂利の帯と2本のレール。
//   面: 芝・公園・運動場・学校の庭・墓地・林・水。木: 林と公園の中、通りの並木、空中写真で緑の所。
'use strict';
const RealStreets = (() => {
  const W = { motorway: 7.5, trunk: 16, primary: 16, secondary: 12, tertiary: 9, minor: 6, service: 4.5 };
  // 白線の種類: 0 なし・1 外側線だけ・2 2車線（白の破線の中央線）・3 広い道（黄色2本＋車線）・4 一方通行の広い道（車線の破線）
  const markOf = (L, w) => L.cls === 'service' ? 0 : L.cls === 'minor' ? 1 : L.oneway ? (w >= 7 ? 4 : 1) : w >= 12 ? 3 : 2;
  const SEG = 4;
  const AA_PRE = `
    // 細い線のちらつきをふせぐ: 画素の大きさ（fwidth）より細い線は、太さのかわりに薄さで出す
    float aaL(float d, float hw) { float f = fwidth(d) + 1e-4; float a = clamp((hw - d) / f + 0.5, 0.0, 1.0); return mix(a, 2.0 * hw / (2.0 * hw + f), smoothstep(hw, 4.0 * hw, f)); }
    float aaJ(float x, float k) { return (1.0 - smoothstep(0.05, 0.3, fwidth(x))) * k; }
`;

  // 線 → 帯の形。o: { width(L), y(x, z) → 高さ, lift（地面からの浮き）, kind(L) }
  function ribbons(lines, o, J) {
    const pos = [], rd = [], kd = [], idx = [];
    for (const L of lines) {
      const w = o.width(L); if (!w) continue;
      // 4 m ごとに区切り直す（交差点までの距離を頂点ごとに持つため）
      const P = [];
      for (let i = 0; i + 1 < L.pts.length; i++) {
        const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / SEG));
        for (let k = 0; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n, k === 0 && J.has(key(ax, az))]);
        if (i + 2 === L.pts.length) P.push([bx, bz, J.has(key(bx, bz))]);
      }
      if (P.length < 2) continue;
      const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const dj = P.map(() => 1e4);   // 交差点までの距離（線の上で、前後の近いほう）
      let last = -1e4; for (let i = 0; i < P.length; i++) { if (P[i][2]) last = s[i]; dj[i] = Math.min(dj[i], s[i] - last); }
      last = 1e9; for (let i = P.length - 1; i >= 0; i--) { if (P[i][2]) last = s[i]; dj[i] = Math.min(dj[i], last - s[i]); }
      const kind = o.kind ? o.kind(L, w) : 0, base = pos.length / 3;
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const nx = dz, nz = -dx;   // 進む向きの左
        for (const side of [-1, 1]) {
          const x = P[i][0] + nx * side * w / 2, z = P[i][1] + nz * side * w / 2;
          pos.push(x, o.y(x, z) + o.lift, z); rd.push(side * w / 2, s[i], w, Math.min(dj[i], 999)); kd.push(kind);
        }
        if (i) { const q = base + (i - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aRd', new THREE.Float32BufferAttribute(rd, 4));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kd, 1));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const key = (x, z) => Math.round(x) + ',' + Math.round(z);

  // 道の帯の材質（白線つき）
  function roadMat() {
    const m = Kit.mat('real-road', { roughness: 0.92 }, `
      float u = vRd.x, v = vRd.y, w = vRd.z, dj = vRd.w, K = floor(vKind + 0.5);
      // アスファルト: 暗い灰・日に焼けたむら・つぎはぎ・わだち
      vec3 c = vec3(0.1, 0.1, 0.098) * (0.85 + 0.3 * kF(vec3(vWP.x, 0.0, vWP.z) * 0.08));
      c *= 0.92 + 0.12 * kN(vec3(vWP.x, 0.0, vWP.z) * 1.7);
      float pch = step(0.72, kN(vec3(floor(v / 7.0), floor(u / 2.5), 3.0)));
      c *= mix(1.0, 0.8 + 0.25 * kN(vec3(v, u, 9.0) * 0.3), pch * 0.8);
      if (K >= 2.0) { float tr = abs(u) - w * 0.25; c *= 1.0 - 0.1 * smoothstep(0.9, 0.2, abs(abs(tr) - 0.9)); }
      vec3 white = vec3(0.5, 0.5, 0.48), yel = vec3(0.42, 0.34, 0.15);
      float wear = 0.75 + 0.25 * kN(vec3(v * 0.7, u * 3.0, 1.0));
      float line = 0.0; vec3 lc = white;
      if (dj > 7.0) {
        if (K >= 1.0 && K < 3.5 || K > 3.5) line = max(line, aaL(abs(abs(u) - (w * 0.5 - 0.35)), 0.075));   // 外側線
        if (K > 1.5 && K < 2.5) line = max(line, aaL(abs(u), 0.075) * step(fract(v / 10.0), 0.5));    // 中央の破線
        if (K > 2.5 && K < 3.5) { float y2 = aaL(abs(abs(u) - 0.25), 0.075); if (y2 > 0.5) { line = 1.0; lc = yel; }
          line = max(line, aaL(abs(abs(u) - w * 0.25), 0.075) * step(fract(v / 10.0), 0.5)); }      // 黄色の中央線と車線
        if (K > 3.5) line = max(line, aaL(abs(u), 0.075) * step(fract(v / 10.0), 0.5));
      } else if (K >= 2.0 && dj > 1.5) {
        line = step(dj, 5.8) * mix(step(fract((u + 50.0) / 0.9), 0.5), 0.5, smoothstep(0.2, 0.6, fwidth(u / 0.9)));   // 横断歩道（交差点の手前。遠くでは縞を平均に）
        line = max(line, aaL(abs(dj - 6.5), 0.2) * step(0.0, -u + 0.0) * 1.0);   // 停止線（左側の車線だけ）
      }
      c = mix(c, lc * wear, line * 0.92);
      diffuseColor.rgb = c; gRough = mix(0.92, 0.7, line);`, AA_PRE);
    wrap(m, 'attribute vec4 aRd; attribute float aKind; varying vec4 vRd; varying float vKind;', 'vRd = aRd; vKind = aKind;', 'varying vec4 vRd; varying float vKind;');
    return m;
  }
  function walkMat() {   // 歩道の舗装（30 cm の平板・目地・ところどころ点字ブロック）
    const m = Kit.mat('real-walk', { roughness: 0.9 }, `
      float u = vRd.x, v = vRd.y, w = vRd.z;
      vec2 q = vec2(u, v) / 0.3; float j = aaJ(q.x, step(0.92, fract(q.x))) + aaJ(q.y, step(0.92, fract(q.y)));
      vec3 c = vec3(0.32, 0.31, 0.29) * (0.88 + 0.2 * kH2(floor(q))) * (1.0 - 0.15 * min(1.0, j));
      c *= 0.85 + 0.25 * kF(vec3(vWP.x, 0.0, vWP.z) * 0.1);
      float tact = aaL(abs(abs(u) - (w * 0.5 - 1.6)), 0.15);
      c = mix(c, vec3(0.55, 0.42, 0.08), tact * 0.85);
      diffuseColor.rgb = c;`, AA_PRE);
    wrap(m, 'attribute vec4 aRd; varying vec4 vRd;', 'vRd = aRd;', 'varying vec4 vRd;');
    return m;
  }
  function railMat() {   // 線路: 砂利・まくら木・2本のレール（1本の線ごと。複線は線が2本ある）
    const m = Kit.mat('real-rail', { roughness: 0.9 }, `
      float u = vRd.x, v = vRd.y;
      vec3 c = vec3(0.17, 0.155, 0.14) * (0.8 + 0.4 * kN(vec3(vWP.x, 0.0, vWP.z) * 5.0));
      c = mix(c, vec3(0.13, 0.12, 0.11), step(abs(u), 1.25) * step(fract(v / 0.6), 0.35));
      float r = aaL(abs(abs(u) - 0.53), 0.04);
      c = mix(c, vec3(0.35, 0.33, 0.3), r); gMetal = r * 0.6; gRough = mix(0.9, 0.4, r);
      diffuseColor.rgb = c;`, AA_PRE);
    wrap(m, 'attribute vec4 aRd; varying vec4 vRd;', 'vRd = aRd;', 'varying vec4 vRd;');
    return m;
  }
  function wrap(m, attrs, assign, frag) {
    const ob = m.onBeforeCompile;
    m.onBeforeCompile = sh => { ob(sh); sh.vertexShader = attrs + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + assign); sh.fragmentShader = frag + '\n' + sh.fragmentShader; };
  }

  // 面を三角形に（穴つき）。y は高さ、lift は浮き
  function polyGeo(list, y, lift) {
    const pos = [];
    for (const p of list) {
      const outer = p.outer.map(([x, z]) => new THREE.Vector2(x, z)), holes = p.holes.map(h => h.map(([x, z]) => new THREE.Vector2(x, z)));
      let tris; try { tris = THREE.ShapeUtils.triangulateShape(outer, holes); } catch (e) { continue; }
      const all = outer.concat(...holes);
      for (const t of tris) for (const i of [t[0], t[2], t[1]]) { const v = all[i]; pos.push(v.x, y(v.x, v.y) + lift, v.y); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }
  const grassMat = () => Kit.mat('real-grass', { roughness: 0.95 }, `
    vec3 q = vec3(vWP.x, 0.0, vWP.z);
    vec3 c = mix(vec3(0.06, 0.1, 0.035), vec3(0.1, 0.13, 0.05), kF(q * 0.15));
    c *= 0.85 + 0.25 * kN(q * 2.5);
    c = mix(c, vec3(0.16, 0.13, 0.09), smoothstep(0.62, 0.8, kF(q * 0.05 + 3.0)) * 0.6);   // 踏まれて土が見える所
    diffuseColor.rgb = c;`);
  const dirtMat = () => Kit.mat('real-dirt', { roughness: 0.95 }, `
    vec3 q = vec3(vWP.x, 0.0, vWP.z); diffuseColor.rgb = vec3(0.24, 0.19, 0.13) * (0.85 + 0.3 * kF(q * 0.2));`);

  // まとめて作る。d: 線（polys つき）、y(x, z)、o: { radius, phone, photo（canvas。木の位置の手がかり）, span（photo の範囲 m） }
  function build(scene, d, y, o) {
    const R = o.radius, inR = L => L.pts.some(([x, z]) => Math.hypot(x, z) < R);
    const lines = d.filter(L => !L.tunnel && inR(L));
    // 交差点: 車の道の点で、3本以上の道が集まる所（線の途中の点も数える）
    const deg = new Map();
    for (const L of lines) if (W[L.cls] && L.cls !== 'service') L.pts.forEach((p, i) => { const k = key(p[0], p[1]); deg.set(k, (deg.get(k) || 0) + (i === 0 || i === L.pts.length - 1 ? 1 : 2)); });
    const J = new Set([...deg].filter(([, v]) => v >= 3).map(([k]) => k));
    const wOf = L => W[L.cls] ? (L.oneway && L.cls !== 'minor' && L.cls !== 'service' ? W[L.cls] * 0.55 : W[L.cls]) : 0;
    const out = [];
    // 重なりの順は、数 cm の浮きでは遠くで深さの精度が足りずちらつく → 深さのずらし（polygonOffset）で決める（layer が大きいほど上）
    const add = (g, m, recv = true, layer = 1) => { m.polygonOffset = true; m.polygonOffsetFactor = -layer; m.polygonOffsetUnits = -layer * 4; const me = new THREE.Mesh(g, m); me.receiveShadow = recv; scene.add(me); out.push(me); return me; };
    // 歩道（通りの下）→ 道 → 線路の順。浮きで重なりの順を決める
    add(ribbons(lines.filter(L => /trunk|primary|secondary|tertiary/.test(L.cls)), { width: L => wOf(L) + 7, y, lift: 0.04 }, J), walkMat(), true, 2);
    add(ribbons(lines.filter(L => /footway|pedestrian/.test(L.sub || '')), { width: L => L.sub === 'pedestrian' ? 8 : 3, y, lift: 0.05 }, J), walkMat(), true, 3);
    add(ribbons(lines.filter(L => W[L.cls]), { width: wOf, y, lift: 0.09, kind: markOf }, J), roadMat(), true, 5);
    add(ribbons(lines.filter(L => L.cls === 'rail' && /rail|subway/.test(L.sub || '')), { width: () => 3.2, y, lift: 0.07 }, J), railMat(), true, 6);
    // 面
    const P = (d.polys || []).filter(p => p.outer.some(([x, z]) => Math.hypot(x, z) < R));
    const green = P.filter(p => p.layer === 'landcover' && p.cls === 'grass' || p.layer === 'landuse' && /pitch|playground|cemetery|park/.test(p.cls) || p.layer === 'park');
    const wood = P.filter(p => p.layer === 'landcover' && p.cls === 'wood');
    const water = P.filter(p => p.layer === 'water');
    add(polyGeo(green.concat(wood), y, 0.06), grassMat(), true, 4);
    add(polyGeo(P.filter(p => p.layer === 'landuse' && /school|kindergarten|university|college/.test(p.cls)), y, 0.045), dirtMat(), true, 1);
    if (water.length) add(polyGeo(water, y, 0.08), Kit.water({ name: 'real', deep: '#20343a' }), false, 4);

    // ---- 木 ----
    const T = [], rnd = Kit.rnd, LEAF = ['#3f4a2c', '#4a5a35', '#38432a', '#525c3a', '#454f30', '#3a4230'];   // 町の木は暗いオリーブ色（ほこりをかぶる）
    const inside = (p, x, z) => { let c = false; const r = p.outer; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const fill = (p, per) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of p.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const n = Math.min(4000, (x1 - x0) * (z1 - z0) / per); for (let i = 0; i < n; i++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); if (inside(p, x, z)) T.push({ x, z, y: y(x, z), h: 7 + rnd() * 8, r: 2.5 + rnd() * 2.5, c: LEAF[(rnd() * LEAF.length) | 0] }); } };
    for (const p of wood) fill(p, 35);
    for (const p of green) if (p.layer === 'park' || p.sub === 'park') fill(p, 150);
    // 並木（広い通りの両側。歩道の車道より 1.5 m）
    for (const L of lines) if (/trunk|primary|secondary/.test(L.cls)) {
      const w = wOf(L), c = LEAF[(rnd() * LEAF.length) | 0], sc = 0.6 + rnd() * 0.8;
      for (let i = 0; i + 1 < L.pts.length; i++) { const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1], len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
        for (let s = rnd() * 10; s < len; s += 9 + rnd() * 5) for (const side of L.oneway ? [1] : [-1, 1]) { if (rnd() < 0.15) continue; const x = ax + dx * s + dz * side * (w / 2 + 1.5), z = az + dz * s - dx * side * (w / 2 + 1.5); T.push({ x, z, y: y(x, z), h: (7 + rnd() * 4) * sc, r: (2.2 + rnd() * 1.5) * sc, c }); } }
    }
    // 空中写真で緑の所（庭・植えこみ）。4 m ごとに色を見て、緑なら木を1本
    if (o.photo) {
      const N = 800, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'); g.drawImage(o.photo, 0, 0, N, N);
      const px = g.getImageData(0, 0, N, N).data, step = o.span / N;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * step - o.span / 2, z = (j + 0.5) * step - o.span / 2; if (Math.hypot(x, z) > R * 0.9) continue;
        const k = (j * N + i) * 4, r = px[k], gg = px[k + 1], b = px[k + 2];
        if (gg > r * 1.08 && gg > b * 1.04 && gg > 45 && gg < 170 && rnd() < 0.18) T.push({ x: x + (rnd() - 0.5) * step, z: z + (rnd() - 0.5) * step, y: y(x, z), h: 4 + rnd() * 5, r: 1.6 + rnd() * 1.6, c: LEAF[(rnd() * LEAF.length) | 0] });
      }
    }
    // 上限の本数までは、駅（原点）に近い木から（読みこみの順で並木が切られたり残ったりしない）
    T.sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z));
    if (T.length) Kit.trees(scene, T.slice(0, o.phone ? 2500 : 6000));   // 1本 約 600 三角形（影でもう1回）
    return { meshes: out, trees: T.length };
  }
  return { build, W };
})();
