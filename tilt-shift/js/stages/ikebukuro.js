// 場面: 池袋（本物の町）。建物は PLATEAU（国土交通省の 3D 都市モデル。航空写真の質感つき LOD2）、地面は国土地理院の空中写真と標高
//   手本の写真（サンシャイン60 から西の池袋駅を見る）と同じ位置にカメラを置く。データはその場で配信元から読む（このサイトには置かない）
//   建物と地面の色は写真そのもの（写したときの日の光と影が入っている）なので、光を当てずにそのまま出す（明るさだけ合わせる）
'use strict';
STAGES.push({
  id: 'ikebukuro', name: '池袋（本物の町）', short: '池袋', seed: 3, size: 900, haze: 0.0009, hazeTint: '#d3d2cc', real: true,
  note: '本物の建物と航空写真で作った池袋。サンシャイン60 から駅を見る',
  credit: '建物: 3D都市モデル（Project PLATEAU）国土交通省／地面: 地理院タイル（シームレス空中写真・標高）',
  // 原点は池袋駅の東口のあたり。カメラはサンシャイン60 の展望台（東へ約 600 m・高さ約 230 m）
  view: { x: 0, z: 0, y: 0, dist: 520, pitch: 25, yaw: 80, min: 120, max: 2500, range: 1500 },   // サンシャイン60 の西の窓の外（高さ約 225 m）
  sun: { el: 40, az: -30, power: 3.0 },
  async build(scene, ctx) {
    const LON0 = 139.7125, LAT0 = 35.7300, toXZ = RealTiles.local(LON0, LAT0);
    const P = 'https://assets.cms.plateau.reearth.io/assets/';
    const WARDS = [   // [名前, ジオイド高 m, LOD2（質感つき）の tileset]
      ['豊島区', 37.29, 'a6/85dfbe-994a-4da4-90fc-ec7f4661d469/13116_toshima-ku_pref_2025_citygml_1_op_bldg_3dtiles_13116_toshima-ku_lod2/tileset.json'],
      ['新宿区', 37.11, '00/bed0bd-f882-4cde-b942-21d0f8d2ddc2/13104_shinjuku-ku_pref_2025_citygml_1_op_bldg_3dtiles_13104_shinjuku-ku_lod2/tileset.json'],
      ['文京区', 37.10, 'c6/c5c89a-859d-4dce-8e25-04e02a39b270/13105_bunkyo-ku_pref_2025_citygml_1_op_bldg_3dtiles_13105_bunkyo-ku_lod2/tileset.json'],
      ['北区', 37.50, 'fc/e0156d-7dbe-45a0-a379-0d62ae2348d8/13117_kita-ku_pref_2025_citygml_1_op_bldg_3dtiles_13117_kita-ku_lod2/tileset.json'],
      ['板橋区', 37.73, '17/6b90ce-370e-4787-9c83-4c7905d0d82a/13119_itabashi-ku_pref_2025_citygml_1_op_bldg_3dtiles_13119_itabashi-ku_lod2/tileset.json'],
    ];
    const K = 1.25;   // 写真の色を、そのまま近い明るさで出す係数（露出 0.62 と ACES のあと）

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
    terrain(SPAN, ctx.phone ? 160 : 320, groundMat(near));
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
    const tilesMat = (m, hasMap, hasCol) => {
      if (hasMap) { m.map.encoding = THREE.sRGBEncoding; m.map.anisotropy = 8; return new THREE.MeshBasicMaterial({ map: m.map, color: TINT, vertexColors: false }); }
      // 質感のない建物（駅ビルの一部・遠くの粗い版）: 頂点の色（ないときは明るい灰）に光を当てて、面の向きがわかるように
      return plain;
    };
    const sets = WARDS.map(([name, geoid, url]) => RealTiles.create(scene, P + url, { lon0: LON0, lat0: LAT0, h0: geoid + H0, radius: 2600, sse: ctx.phone ? 40 : 24, keep: ctx.phone ? 150 : 400, material: tilesMat, onLoad: () => ctx.redraw && ctx.redraw() }));   // radius: 2.6 km より先はかすみで 94 % 以上かくれる → 読まない（地面の写真だけ）

    let t = 0;
    return {
      // カメラが動いた・タイルが読めたときに、見せるタイルを決め直す
      view(camera, H) { let ch = false; for (const s of sets) ch = s.update(camera, H, camera.fov * Math.PI / 180) || ch; return ch; },
      get loading() { return sets.reduce((a, s) => a + s.loading, 0); },
      step(dt) { t += dt; Kit.time.value = t; return false; },   // 動く物がないので、描き直さない（電池）
      dispose() { sets.forEach(s => s.dispose()); },
    };
  },
});
