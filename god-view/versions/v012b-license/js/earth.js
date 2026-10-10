// earth.js — Cesium の地球を作り、背景の地図・重ねる層・地形・表示の切り替えを持つ。
'use strict';

(function () {
  const GV = window.GV;
  const J = GV.JAPAN;

  GV.state = {
    base: 'photo', overlays: { hillshade: false },
    terrain: true, exaggeration: 1, wireframe: false, lighting: false, atmosphere: true,
  };

  function provider(def) {
    const o = {
      url: def.url, maximumLevel: def.max,
      credit: new Cesium.Credit(GV.CREDIT[def.credit], true),   // true = 地図の上に常に表示
    };
    if (def.min) o.minimumLevel = def.min;
    if (def.japanOnly) o.rectangle = Cesium.Rectangle.fromDegrees(J.w, J.s, J.e, J.n);
    return new Cesium.UrlTemplateImageryProvider(o);
  }

  function layer(def, japan, extra) {
    const p = provider(Object.assign({}, def, { japanOnly: japan }));
    const opts = Object.assign({}, extra || {});
    if (japan && def.fromLevel) opts.minimumTerrainLevel = def.fromLevel;
    const l = new Cesium.ImageryLayer(p, opts);
    if (def.gray) l.saturation = 0;
    return l;
  }

  GV.initEarth = function (containerId) {
    Cesium.Ion.defaultAccessToken = '';
    const viewer = new Cesium.Viewer(containerId, {
      baseLayer: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      geocoder: false, baseLayerPicker: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      requestRenderMode: true, maximumRenderTimeChange: 60,
    });
    GV.viewer = viewer;
    const scene = viewer.scene;
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1a2e');
    scene.globe.maximumScreenSpaceError = 2;     // Cesium の初期値（1.5 より軽い。v005 で軽量化）
    scene.globe.tileCacheSize = 150;
    scene.screenSpaceCameraController.minimumZoomDistance = 3;
    scene.screenSpaceCameraController.maximumZoomDistance = 4.0e7;
    scene.globe.depthTestAgainstTerrain = true;
    viewer.clock.shouldAnimate = true;

    GV.applyBase();
    GV.applyOverlays();
    GV.applyTerrain();
    GV.initLight();
    GV.applyView();
    return viewer;
  };

  let baseLayers = [];
  GV.applyBase = function () {
    const ils = GV.viewer.imageryLayers;
    baseLayers.forEach(l => ils.remove(l, true));
    const b = GV.BASES[GV.state.base];
    baseLayers = [layer(b.world, false)];
    if (b.japan) baseLayers.push(layer(b.japan, true));   // 世界だけの背景（きのうの衛星写真など）もある
    baseLayers.forEach((l, i) => ils.add(l, i));
    GV.viewer.scene.requestRender();
  };

  const ovLayers = {};
  GV.applyOverlays = function () {
    const ils = GV.viewer.imageryLayers;
    for (const k in GV.OVERLAYS) {
      const on = GV.state.overlays[k];
      if (on && !ovLayers[k]) {
        const d = GV.OVERLAYS[k];
        ovLayers[k] = layer(d.japan, true, { alpha: d.alpha });
        ils.add(ovLayers[k]);
      } else if (!on && ovLayers[k]) {
        ils.remove(ovLayers[k], true); delete ovLayers[k];
      }
    }
    GV.viewer.scene.requestRender();
  };

  let terrainProvider = null;
  GV.applyTerrain = function () {
    const s = GV.state, sc = GV.viewer.scene;
    if (s.terrain) {
      terrainProvider = terrainProvider || GV.makeTerrain();
      if (GV.viewer.terrainProvider !== terrainProvider) GV.viewer.terrainProvider = terrainProvider;
    } else if (!(GV.viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider)) {
      GV.viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    }
    sc.verticalExaggeration = s.terrain ? s.exaggeration : 1;
    sc.requestRender();
  };

  const sunLight = new Cesium.SunLight();
  const headLight = new Cesium.DirectionalLight({ direction: new Cesium.Cartesian3(0, 0, -1), intensity: 2.2 });
  const tmpUp = new Cesium.Cartesian3();
  // 毎フレーム、カメラの向きに少し下向きを足した方向へ光を向ける
  function aimHeadLight(scene) {
    const cam = scene.camera;
    Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(cam.positionWC, tmpUp);
    const d = headLight.direction;
    Cesium.Cartesian3.multiplyByScalar(tmpUp, -0.6, d);
    Cesium.Cartesian3.add(d, cam.directionWC, d);
    Cesium.Cartesian3.normalize(d, d);
  }
  GV.initLight = function () { GV.viewer.scene.preRender.addEventListener(aimHeadLight); };

  GV.applyView = function () {
    const s = GV.state, sc = GV.viewer.scene, g = sc.globe;
    // ワイヤフレーム: Cesium の公開されていない設定（CesiumInspector と同じ）。版が変わったら要確認
    try { g._surface.tileProvider._debug.wireframe = s.wireframe; } catch (e) { GV.err && GV.err(e); }
    g.enableLighting = s.lighting;
    // 建物の光: 「昼と夜」のときは本当の太陽、そうでなければカメラの方から（少し上から）照らす
    sc.light = s.lighting ? sunLight : headLight;
    g.dynamicAtmosphereLighting = s.lighting;
    sc.skyAtmosphere.show = s.atmosphere;
    g.showGroundAtmosphere = s.atmosphere;
    sc.requestRender();
  };

  // 日本全体が見える位置
  GV.home = function (dur) {
    GV.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(137.0, 35.0, 3.6e6),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: dur == null ? 1.5 : dur,
    });
  };

  GV.flyToLonLat = function (lon, lat, height) {
    GV.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat - height * 0.75 / 111000, height * 0.75),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
      duration: 2.5,
    });
  };
})();
