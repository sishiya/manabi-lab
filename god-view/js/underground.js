// underground.js — 地下を見る。地面を半透明にしてカメラが地下へ潜れるようにし、
// PLATEAU の地下街・下水道管・マンホール（3D Tiles、本当の深さ）と、水道管・ガス管など（平面の線 → 推定の深さで描く）を出す。
'use strict';

(function () {
  const GV = window.GV;
  const NEAR = 0.008;          // 範囲からこの度数（約 800m）以内に近づいたら読む
  const SHOW_BELOW = 8000;     // カメラの高さ（m）
  const PIPE_DEPTH = 1.2;      // 水道管などの深さ（推定）。道路の下の水道管の標準的な土かぶり（道路法施行令の 1.2m）
  const loaded = new Map();    // url -> { ts, item }
  const UNDER_COLOR = { sewer: '#b07a45', manhole: '#9aa3ad' };   // 地下街は写真のまま
  let pipes = null;            // { prims: [], loading, failed }
  let credit = null;

  GV.state.underground = false;
  GV.state.groundAlpha = 0.35;
  GV.underStatus = { items: [], pipes: 0 };

  const near = (bb, lon, lat) => lon > bb[0] - NEAR && lon < bb[2] + NEAR && lat > bb[1] - NEAR && lat < bb[3] + NEAR;

  function camLonLat() {
    const c = GV.viewer.camera.positionCartographic;
    return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude), c.height];
  }

  // ---- 地面の半透明・地下へのカメラ ----
  function applyGround() {
    const s = GV.state, sc = GV.viewer.scene, g = sc.globe;
    g.translucency.enabled = s.underground;
    g.translucency.frontFaceAlpha = s.groundAlpha;
    g.translucency.backFaceAlpha = Math.min(1, s.groundAlpha + 0.25);
    g.undergroundColor = Cesium.Color.fromCssColorString('#2a2018').withAlpha(0.9);
    sc.screenSpaceCameraController.enableCollisionDetection = !s.underground;
  }

  // ---- 3D Tiles（地下街・下水道管・マンホール） ----
  function geoidMatrix(item) {
    const lon = (item.bb[0] + item.bb[2]) / 2, lat = (item.bb[1] + item.bb[3]) / 2;
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(Cesium.Cartesian3.fromDegrees(lon, lat), new Cesium.Cartesian3());
    return Cesium.Matrix4.fromTranslation(Cesium.Cartesian3.multiplyByScalar(up, -item.geoid, up));
  }

  function loadTiles(item) {
    const url = GV.PLATEAU_PREFIX + item.url;
    if (loaded.has(url)) return;
    const rec = { ts: null, item };
    loaded.set(url, rec);
    Cesium.Cesium3DTileset.fromUrl(url, { maximumScreenSpaceError: 8 }).then(ts => {
      if (!loaded.has(url)) { ts.destroy(); return; }
      ts.modelMatrix = geoidMatrix(item);
      ts.show = false;
      ts.underItem = item;           // クリックしたときの種類の表示に使う
      if (UNDER_COLOR[item.kind]) ts.style = new Cesium.Cesium3DTileStyle({ color: "color('" + UNDER_COLOR[item.kind] + "')" });
      rec.ts = ts;
      GV.viewer.scene.primitives.add(ts);
      update();
    }).catch(e => { loaded.delete(url); GV.err && GV.err('PLATEAU 地下 ' + item.name + ': ' + e); });
  }

  // ---- 平面の管（ベクトルタイル）→ 推定の深さの線 ----
  const lon2x = (lon, n) => (lon + 180) / 360 * n;
  const lat2y = (lat, n) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n; };
  const x2lon = (x, n) => x / n * 360 - 180;
  const y2lat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;

  async function groundAt(lon, lat, cache) {
    const n = 2 ** 14, gx = lon2x(lon, n), gy = lat2y(lat, n), tx = Math.floor(gx), ty = Math.floor(gy);
    const key = tx + '/' + ty;
    if (!cache.has(key)) cache.set(key, GV.demTile(14, tx, ty));
    const dem = await cache.get(key);
    if (!dem) return 0;
    const px = Math.min(255, Math.floor((gx - tx) * 256)), py = Math.min(255, Math.floor((gy - ty) * 256));
    return dem[py * 256 + px];
  }

  async function loadPipes() {
    const P = GV.PLATEAU_PIPES, z = P.z, n = 2 ** z;
    pipes = { prims: [], loading: true, count: 0, byKind: {} };
    const x0 = Math.floor(lon2x(P.bb[0], n)), x1 = Math.floor(lon2x(P.bb[2], n));
    const y0 = Math.floor(lat2y(P.bb[3], n)), y1 = Math.floor(lat2y(P.bb[1], n));
    const demCache = new Map();
    for (const L of P.layers) {
      const instances = [];
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const url = GV.PLATEAU_PREFIX + L.url.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
        let buf;
        try { const r = await fetch(url); if (!r.ok) continue; buf = await r.arrayBuffer(); } catch (e) { continue; }
        const d = GV.decodeMVT(buf);
        const layer = d[L.layer] || Object.values(d)[0];
        if (!layer) continue;
        for (const f of layer.features) {
          if (f.type !== 2) continue;
          for (const line of f.geom) {
            if (line.length < 4) continue;
            const pts = [];
            for (let i = 0; i < line.length; i += 2) {
              const lon = x2lon(tx + line[i] / layer.extent, n), lat = y2lat(ty + line[i + 1] / layer.extent, n);
              pts.push(lon, lat, (await groundAt(lon, lat, demCache)) - PIPE_DEPTH);
            }
            instances.push(new Cesium.GeometryInstance({
              geometry: new Cesium.PolylineGeometry({ positions: Cesium.Cartesian3.fromDegreesArrayHeights(pts), width: 4, vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(L.color)) },
              id: { pipe: L.kind, name: L.name },
            }));
          }
        }
      }
      pipes.byKind[L.kind] = instances.length;
      pipes.count += instances.length;
      if (instances.length) {
        const prim = new Cesium.Primitive({ geometryInstances: instances, appearance: new Cesium.PolylineColorAppearance({ translucent: false }) });
        pipes.prims.push(prim);
        GV.viewer.scene.primitives.add(prim);
      }
    }
    pipes.loading = false;
    update();
  }

  function setCredit(on) {
    const cd = GV.viewer.creditDisplay;
    if (on && !credit) {
      credit = new Cesium.Credit('地下: <a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener">3D都市モデル（Project PLATEAU）国土交通省</a>（地下街・地下埋設物。水道管などの深さは推定）', true);
      cd.addStaticCredit(credit);
    } else if (!on && credit) { cd.removeStaticCredit(credit); credit = null; }
  }

  function update() {
    const s = GV.state;
    const [lon, lat, h] = camLonLat();
    const active = s.underground && h < SHOW_BELOW;
    const items = [];
    for (const item of GV.PLATEAU_UNDER || []) {
      if (active && near(item.bb, lon, lat)) { loadTiles(item); items.push(item.name); }
    }
    for (const [, rec] of loaded) if (rec.ts) rec.ts.show = active && near(rec.item.bb, lon, lat);
    const P = GV.PLATEAU_PIPES;
    const pipesOn = active && P && near(P.bb, lon, lat);
    if (pipesOn && !pipes) loadPipes();
    if (pipes) pipes.prims.forEach(p => { p.show = pipesOn; });
    GV.underStatus.items = items;
    GV.underStatus.pipes = pipesOn && pipes ? (pipes.loading ? -1 : pipes.count) : 0;
    setCredit(items.length > 0 || pipesOn);
    if (GV.onUnderground) GV.onUnderground();
    GV.viewer.scene.requestRender();
  }

  GV.applyUnderground = function () {
    applyGround(); update();
    if (GV.applyBuildings) GV.applyBuildings();         // 建物を半透明に／戻す
    if (GV.applyOsmBuildings) GV.applyOsmBuildings();   // OSM の建物を隠す／戻す
  };

  // 見どころへ飛ぶ（地下を見るをオンにして、見たい地点の地面を range m 離れて斜め上から）
  GV.UNDER_SPOTS = {
    tokyo: { label: '東京駅・八重洲の地下街', lon: 139.76965, lat: 35.68062, range: 420, heading: 320, pitch: -45 },
    nagaoka: { label: '長岡市の地下の管', lon: 138.7458, lat: 37.4272, range: 320, heading: 20, pitch: -40 },
  };
  GV.gotoUnder = async function (key) {
    const p = GV.UNDER_SPOTS[key];
    GV.state.underground = true;
    GV.applyUnderground();
    if (GV.onUnderground) GV.onUnderground(true);
    const g = await groundAt(p.lon, p.lat, new Map());
    const target = new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, g), 1);
    GV.viewer.camera.flyToBoundingSphere(target, {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(p.heading), Cesium.Math.toRadians(p.pitch), p.range),
      duration: 2.5,
    });
  };

  GV.initUnderground = function () {
    const v = GV.viewer;
    v.camera.moveEnd.addEventListener(update);
    v.camera.changed.addEventListener(update);
    applyGround();
    update();
  };
})();
