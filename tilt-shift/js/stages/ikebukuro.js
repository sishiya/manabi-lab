// 場面: 池袋（本物の町）。建物は PLATEAU（国土交通省の 3D 都市モデル。航空写真の質感つき LOD2）、地面は国土地理院の空中写真と標高
//   手本の写真（サンシャイン60 から西の池袋駅を見る）と同じ位置にカメラを置く。データはその場で配信元から読む（このサイトには置かない）
//   建物は形と属性（用途・階数・高さ）だけを使い、質感はこのアプリで描いて光と影を当てる（写真を貼ると、のっぺりして解像度が足りず、車や人と質感が合わない）
'use strict';
STAGES.push({
  id: 'ikebukuro', name: '池袋（本物の町）', short: '池袋', seed: 3, size: 900, haze: 0.0009, hazeTint: '#d3d2cc', real: true,
  note: '本物の建物の形と道で作った池袋。サンシャイン60 から駅を見る',
  credit: '建物: 3D都市モデル（Project PLATEAU）国土交通省／地面: 地理院タイル（シームレス空中写真・標高）／道: OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  // 原点は池袋駅の東口のあたり。カメラはサンシャイン60 の展望台（東へ約 600 m・高さ約 230 m）
  view: { x: 0, z: 0, y: 0, dist: 520, pitch: 25, yaw: 80, min: 120, max: 2500, range: 1500 },   // サンシャイン60 の西の窓の外（高さ約 225 m）
  sun: { el: 24, az: -20, power: 4.2, color: '#ffe2bc' }, hemi: 0.06,   // 午後の低い日（暖かい色）。空からの光は弱く、影の面との差を大きく
  async build(scene, ctx) {
    const LON0 = 139.7125, LAT0 = 35.7300, toXZ = RealTiles.local(LON0, LAT0);
    const P = 'https://assets.cms.plateau.reearth.io/assets/';
    const WARDS = [   // [名前, ジオイド高 m, LOD2（質感なし。形と属性だけ。質感はこのアプリで描く）の tileset]
      ['豊島区', 37.29, '00/c773a5-1b08-48bc-9f65-958952afd4db/13116_toshima-ku_pref_2025_citygml_1_op_bldg_3dtiles_13116_toshima-ku_lod2_no_texture/tileset.json'],
      ['新宿区', 37.11, '2f/d4f9a7-13ad-43cb-b984-033803199eab/13104_shinjuku-ku_pref_2025_citygml_1_op_bldg_3dtiles_13104_shinjuku-ku_lod2_no_texture/tileset.json'],
      ['文京区', 37.10, 'ed/58552b-52fc-484b-99c0-b1313e2d717d/13105_bunkyo-ku_pref_2025_citygml_1_op_bldg_3dtiles_13105_bunkyo-ku_lod2_no_texture/tileset.json'],
      ['北区', 37.50, '31/7809c7-4856-4b02-9667-43769ada845b/13117_kita-ku_pref_2025_citygml_1_op_bldg_3dtiles_13117_kita-ku_lod2_no_texture/tileset.json'],
      ['板橋区', 37.73, 'fa/9dd850-4b6b-4c55-b32e-081a5f23c8da/13119_itabashi-ku_pref_2025_citygml_1_op_bldg_3dtiles_13119_itabashi-ku_lod2_no_texture/tileset.json'],
    ];
    const K = 1.25;   // 写真の色を、そのまま近い明るさで出す係数（露出 0.62 と ACES のあと）

    const linesP = RealRoads.load(LON0, LAT0, 1600, toXZ);   // 道の線（地面と同時に読みはじめる）
    // ---- 地面: 標高（5 m メッシュ）と空中写真。近く 3.2 km は細かく、外 12 km は粗く ----
    const SPAN = 3200, OUTER = 12000;
    const [hgt, near, outer] = await Promise.all([
      RealGround.dem(LON0, LAT0, OUTER * 0.6),
      RealGround.photo(LON0, LAT0, SPAN, ctx.phone ? 17 : 18, ctx.phone ? 2048 : 4096, toXZ),   // 4096 で 0.8 m/画素（canvas 1枚 64 MB。8192 は 256 MB で重すぎた）
      RealGround.photo(LON0, LAT0, OUTER, 14, 2048, toXZ),
    ]);
    const k = 180 / Math.PI / 6378137, lonOf = x => LON0 + x * k / Math.cos(LAT0 * Math.PI / 180), latOf = z => LAT0 - z * k;
    const H0 = hgt(LON0, LAT0) || 30;   // 原点の標高（m）。three の y = 標高 − H0
    const groundMat = (cv) => { const t = Kit.canvasTex(cv); t.anisotropy = 16; return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(K, K, K) }); };
    function terrain(span, n, mat, y0 = 0) {
      const g = new THREE.PlaneGeometry(span, span, n, n); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), h = hgt(lonOf(x), latOf(z)); p.setY(i, (isNaN(h) ? H0 : h) - H0 + y0); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
    }
    // 近くの地面: 空中写真は大きくぼかした色の手がかりだけ（細かい所はコンクリートの目地とむら）。光と影を受ける
    const nearTex = Kit.canvasTex(near); nearTex.anisotropy = 4;
    const nearMat = Kit.mat('real-ground', { map: nearTex, roughness: 0.92 }, `
      vec3 hint = texture2D(map, vUv, 4.5).rgb;   // 写真をぼかした色（mip を上げて読む）
      float l = dot(hint, vec3(0.3, 0.55, 0.15));
      vec3 c = mix(vec3(0.15, 0.148, 0.142), hint * 0.6, 0.4) * (0.8 + 0.3 * clamp(l * 2.5, 0.0, 1.0));
      vec3 q = vec3(vWP.x, 0.0, vWP.z);
      c *= 0.88 + 0.22 * kF(q * 0.12);
      vec2 tl = q.xz / 1.5; c *= 1.0 - 0.08 * (1.0 - smoothstep(0.05, 0.3, fwidth(tl.x))) * (step(0.95, fract(tl.x)) + step(0.95, fract(tl.y)));   // コンクリートの目地
      diffuseColor.rgb = c;`);
    terrain(SPAN, ctx.phone ? 160 : 320, nearMat).receiveShadow = true;
    // 外の地面: 中は近くの地面の下へ少しさげる（重なりのちらつきをさける）
    terrain(OUTER, 200, groundMat(outer), -0.6);

    // ---- 建物（PLATEAU）。見える所だけ、近いほど細かい版を読む ----
    // PLATEAU の質感は少し青く暗い → 少し暖かく（写真の白をそろえる）
    const TINT = new THREE.Color(K * 1.1, K * 1.0, K * 0.86);
    // 質感のない建物（駅ビルの一部・遠くの粗い版）: 壁は窓の帯と汚れ、屋上はコンクリート（どの向きの面でも使えるよう、世界の法線から）
    //   影の側も、まわりの写真の壁くらいの明るさに（自分で光る分を少し）
    const plain = Kit.mat('plateau-plain', { color: new THREE.Color(0.5, 0.49, 0.46), emissive: new THREE.Color(0.1, 0.1, 0.095), roughness: 0.85, envMapIntensity: 0.5 }, `
      vec3 wn = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
      vec3 c = diffuseColor.rgb;
      if (abs(wn.y) < 0.4) {
        float along = vWP.x * (-wn.z) + vWP.z * wn.x;
        float fl = fract(vWP.y / 4.2), cl = fract(along / 3.2);
        float win = step(0.3, fl) * step(fl, 0.82) * step(0.1, cl) * step(cl, 0.9) * step(4.0, vWP.y);
        float id = floor(vWP.y / 4.2) * 37.0 + floor(along / 3.2);
        c = mix(c, vec3(0.06, 0.07, 0.08) + 0.06 * kH2(vec2(id, 3.0)), win * 0.9);
        c *= 1.0 - 0.15 * smoothstep(0.4, 0.75, kN(vec3(along * 1.2, vWP.y * 0.05, 3.0)));   // 雨のすじ
        if (win > 0.5) { gRough = 0.08; gMetal = 0.5; }
      } else { c *= 0.85 + 0.25 * kF(vWP * 0.08); }
      diffuseColor.rgb = c;`);
    plain.userData.shared = true;
    const BM = RealBldg.material();   // 本物の形の建物の質感（js/real/bldgmat.js）
    const tilesMat = (m, hasMap, hasCol) => {
      if (hasMap) { m.map.encoding = THREE.sRGBEncoding; m.map.anisotropy = 8; return new THREE.MeshBasicMaterial({ map: m.map, color: TINT, vertexColors: false }); }
      // 質感のない建物（駅ビルの一部・遠くの粗い版）: 頂点の色（ないときは明るい灰）に光を当てて、面の向きがわかるように
      return plain;
    };
    const sets = WARDS.map(([name, geoid, url]) => RealTiles.create(scene, P + url, { lon0: LON0, lat0: LAT0, h0: geoid + H0, radius: 2600, sse: ctx.phone ? 40 : 24, keep: ctx.phone ? 150 : 400, material: () => BM, batch: RealBldg.kind, shadow: true, onLoad: () => ctx.redraw && ctx.redraw() }));   // radius: 2.6 km より先はかすみで 94 % 以上かくれる → 読まない（地面の写真だけ）

    // ---- 車と人（OpenStreetMap の道。js/real/roads.js）----
    let lines = [];
    try { lines = await linesP; } catch (e) { console.warn('roads', e); }
    const yAt = (x, z) => { const h = hgt(lonOf(x), latOf(z)); return isNaN(h) ? 0 : h - H0; };
    const CARCLS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'];
    const GC = RealRoads.graph(lines, L => CARCLS.includes(L.cls) && L.cls !== 'motorway' && !L.tunnel && !L.bridge, 1500);   // 高架の首都高・橋の上は、地面の高さで描くと下の道と重なるので走らせない
    const GP = RealRoads.graph(lines.map(L => Object.assign({}, L, { oneway: 0 })), L => !L.tunnel && (CARCLS.includes(L.cls) || (L.cls === 'path' && /footway|pedestrian|path/.test(L.sub || ''))), 1100);
    const nodeY = G => G.P.map(([x, z]) => yAt(x, z));
    const YC = nodeY(GC), YP = nodeY(GP);
    const GAPS = { motorway: 60, trunk: 45, primary: 45, secondary: 70, tertiary: 110, minor: 320 };   // 車の間隔（1車線あたり m）。信号のない交差点で待つので、少なめに
    const lanesC = e => e.w >= 12 ? [1.75, 5.25] : e.w >= 9 ? [e.w / 4] : [e.w / 4];   // 左側通行: 進む向きの左へ。広い道は 2 車線
    const carsN = Math.round(GC.edges.reduce((a, e) => a + e.len * lanesC(e).length / (GAPS[e.cls] || 1e9), 0) * (ctx.phone ? 0.5 : 1));
    const MC = RealRoads.movers(GC, { n: carsN, lanes: lanesC, v: e => ({ motorway: 16, trunk: 13, primary: 12, secondary: 10, tertiary: 8, minor: 5 })[e.cls] || 5, weight: e => lanesC(e).length / (GAPS[e.cls] || 1e9), len: 4.6, gap: 2.5, follow: true, turnR: 7, yawRate: 1.5, vScale: r => 0.7 + 0.6 * r() }, Kit.rnd);
    const kinds = MC.list.map(() => { const r = Kit.rnd(); return r < 0.04 ? 'bus' : r < 0.1 ? 'truck' : r < 0.22 ? 'van' : r < 0.42 ? 'kei' : 'sedan'; });
    const C = MC.list.length ? Kit.cars(scene, kinds.map(kind => ({ kind }))) : null;
    const isWalk = e => e.cls === 'path';
    const lanesP = e => isWalk(e) ? [-1, 0, 1] : [e.w / 2 + 1.4, -(e.w / 2 + 1.4)];   // 歩行者の道はまん中あたり、通りは両側の歩道
    const MP = RealRoads.movers(GP, { n: ctx.phone ? 1000 : 2500, lanes: lanesP, v: () => 1.25, weight: e => { const [x, z] = GP.P[e.a]; return Math.exp(-Math.hypot(x, z) / 350) * (isWalk(e) ? 3 : e.cls === 'minor' ? 0.6 : 1); }, len: 0.5, gap: 0.3, follow: false, turnR: 2.5, yawRate: 3,
      // 歩く速さ: 平均 1.34 m/s・ばらつき 0.2 m/s の正規分布（Bohannon 1997 の大人の自然な速さ）。1 割はゆっくり（0.7〜0.9 m/s）
      vScale: r => { if (r() < 0.1) return (0.7 + 0.2 * r()) / 1.25; const g = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r()); return Math.min(1.9, Math.max(0.9, 1.34 + 0.2 * g)) / 1.25; } }, Kit.rnd);
    const ppl = MP.list.length ? Kit.people(scene, MP.list.map(() => ({ x: 0, z: 0 }))) : null;
    // 車と人の影を、写真の地面に落とす（地面の写真には光を当てないので、影だけを重ねる板）
    // 地面の 3D（道・歩道・線路・芝・林・水・木）。js/real/streets.js
    const ST = RealStreets.build(scene, lines, yAt, { radius: 1500, phone: ctx.phone, photo: near, span: SPAN });
    function place() {
      MC.list.forEach((it, i) => { const [x, z, ry] = MC.at(it); C.set(i, x, z, ry, YC[it.e.a] + (YC[it.e.b] - YC[it.e.a]) * it.s / it.e.len); });
      if (C) C.done();
      MP.list.forEach((it, i) => { const [x, z, ry] = MP.at(it); ppl.set(i, x, z, ry, it.ph, YP[it.e.a] + (YP[it.e.b] - YP[it.e.a]) * it.s / it.e.len, it.amp || 0.8); });
      if (ppl) ppl.done();
    }
    if (C || ppl) place();

    let t = 0;
    return {
      // カメラが動いた・タイルが読めたときに、見せるタイルを決め直す
      view(camera, H) { let ch = false; for (const s of sets) ch = s.update(camera, H, camera.fov * Math.PI / 180) || ch; return ch; },
      get loading() { return sets.reduce((a, s) => a + s.loading, 0); },
      step(dt) { t += dt; Kit.time.value = t; if (!C && !ppl) return false; MC.step(dt); MP.step(dt); place(); return true; },
      dispose() { sets.forEach(s => s.dispose()); },
      get movers() { return { MC, MP }; },   // 確かめ用
      get counts() { return { cars: MC.list.length, people: MP.list.length, lines: lines.length, trees: ST.trees }; },
    };
  },
});
