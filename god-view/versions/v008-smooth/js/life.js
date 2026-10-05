// life.js — 段階C「生きている地球」: 時刻の操作、夜の街の明かり、地震、人工衛星。
// （天気は ui.js のクリックした地点の情報で出す）
'use strict';

(function () {
  const GV = window.GV;
  const S = GV.state;
  S.nightLights = false;
  S.quakes = false;
  S.sats = false;
  S.timeSpeed = 1;          // 時間の進む速さ（1 = 実時間）
  GV.lifeStatus = { quakes: 0, sats: 0, satLoading: false };

  // ---------- 時刻 ----------
  const clock = () => GV.viewer.clock;
  GV.setTimeOffset = function (hours) {   // いまから何時間ずらすか
    clock().currentTime = Cesium.JulianDate.addSeconds(Cesium.JulianDate.now(), hours * 3600, new Cesium.JulianDate());
    GV.viewer.scene.requestRender();
  };
  GV.setTimeSpeed = function (x) { S.timeSpeed = x; clock().multiplier = x; clock().shouldAnimate = true; };
  GV.timeOffsetHours = () => Cesium.JulianDate.secondsDifference(clock().currentTime, Cesium.JulianDate.now()) / 3600;
  GV.timeText = function () {
    const d = Cesium.JulianDate.toDate(clock().currentTime);
    return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '（日本時間）';
  };

  // ---------- 夜の街の明かり（夜の側だけに出る） ----------
  let nightLayer = null;
  function applyNight() {
    const ils = GV.viewer.imageryLayers;
    if (S.nightLights && !nightLayer) {
      const d = GV.LIFE.night;
      nightLayer = new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
        url: d.url, maximumLevel: d.max, credit: new Cesium.Credit('夜の明かり: ' + GV.CREDIT[d.credit] + '（VIIRS Black Marble 2016）', true),
      }), { dayAlpha: 0, nightAlpha: 1 });
      ils.add(nightLayer);
    } else if (!S.nightLights && nightLayer) { ils.remove(nightLayer, true); nightLayer = null; }
    if (nightLayer) ils.raiseToTop(nightLayer);
  }

  // ---------- 地震（USGS、過去7日 M2.5 以上） ----------
  let quakePts = null, quakeData = null, quakeCredit = null;
  const depthColor = km => km < 30 ? '#ff5a3c' : km < 100 ? '#ffb43c' : km < 300 ? '#ffe55c' : '#6cc3ff';
  async function applyQuakes() {
    const prims = GV.viewer.scene.primitives, cd = GV.viewer.creditDisplay;
    if (!S.quakes) {
      if (quakePts) { prims.remove(quakePts); quakePts = null; }
      if (quakeCredit) { cd.removeStaticCredit(quakeCredit); quakeCredit = null; }
      GV.lifeStatus.quakes = 0; return;
    }
    if (quakePts) return;
    quakePts = prims.add(new Cesium.PointPrimitiveCollection());
    quakeCredit = new Cesium.Credit('地震: ' + GV.CREDIT.usgs + '（過去7日・M2.5以上）', true);
    cd.addStaticCredit(quakeCredit);
    try {
      quakeData = quakeData || await (await fetch(GV.LIFE.quakes)).json();
    } catch (e) { GV.err && GV.err('地震: ' + e); return; }
    if (!quakePts) return;
    for (const f of quakeData.features) {
      const [lon, lat, depth] = f.geometry.coordinates, m = f.properties.mag || 0;
      quakePts.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        pixelSize: 4 + Math.max(0, m - 2.5) * 5,
        color: Cesium.Color.fromCssColorString(depthColor(depth)).withAlpha(0.85),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.6), outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.6, 2e7, 0.7),
        id: { quake: true, mag: m, depth, place: f.properties.place, time: f.properties.time, url: f.properties.url },
      });
    }
    GV.lifeStatus.quakes = quakeData.features.length;
    hideFarQuakes();
    GV.onLife && GV.onLife();
    GV.viewer.scene.requestRender();
  }

  // ---------- 人工衛星（CelesTrak の TLE を satellite.js で計算） ----------
  let satPts = null, satLabels = null, issPath = null, sats = [], satCredit = null, satjsP = null;
  function loadSatJs() {
    return satjsP || (satjsP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = GV.LIFE.satjs; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }));
  }
  function satPos(rec, jd) {
    const d = Cesium.JulianDate.toDate(jd);
    const pv = window.satellite.propagate(rec, d);
    if (!pv.position) return null;
    const gd = window.satellite.eciToGeodetic(pv.position, window.satellite.gstime(d));
    return Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000);
  }
  async function applySats() {
    const prims = GV.viewer.scene.primitives, cd = GV.viewer.creditDisplay;
    if (!S.sats) {
      [satPts, satLabels, issPath].forEach(p => p && prims.remove(p));
      satPts = satLabels = issPath = null;
      if (satCredit) { cd.removeStaticCredit(satCredit); satCredit = null; }
      GV.lifeStatus.sats = 0; return;
    }
    if (satPts) return;
    satPts = prims.add(new Cesium.PointPrimitiveCollection());
    satLabels = prims.add(new Cesium.LabelCollection());
    satCredit = new Cesium.Credit('人工衛星: ' + GV.CREDIT.celestrak + '（位置は軌道要素からの計算）', true);
    cd.addStaticCredit(satCredit);
    GV.lifeStatus.satLoading = true; GV.onLife && GV.onLife();
    try {
      await loadSatJs();
      if (!sats.length) {
        const seen = new Set();
        for (const g of GV.LIFE.sats) {
          const txt = await (await fetch(GV.LIFE.tle(g.group))).text();
          const L = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          for (let i = 0; i + 2 < L.length + 1; i += 3) {
            if (!L[i + 2] || seen.has(L[i + 2].slice(2, 7))) continue;
            seen.add(L[i + 2].slice(2, 7));
            sats.push({ name: L[i], rec: window.satellite.twoline2satrec(L[i + 1], L[i + 2]), group: g.group });
          }
        }
      }
    } catch (e) { GV.err && GV.err('人工衛星: ' + e); }
    GV.lifeStatus.satLoading = false;
    if (!satPts) return;
    for (const s of sats) {
      const iss = /^ISS \(ZARYA\)/.test(s.name);
      s.pt = satPts.add({
        pixelSize: iss ? 10 : 5, color: iss ? Cesium.Color.fromCssColorString('#ffd25e') : Cesium.Color.fromCssColorString('#e8eef8'),
        outlineColor: Cesium.Color.BLACK, outlineWidth: 1, id: { sat: true, name: s.name },
      });
      if (iss || s.group === 'stations' && /CSS|TIANHE/.test(s.name)) {
        s.label = satLabels.add({
          text: iss ? '国際宇宙ステーション（ISS）' : '中国の宇宙ステーション', font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(10, -10), horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        });
      }
      if (iss) s.iss = true;
    }
    GV.lifeStatus.sats = sats.length;
    updateSats(true);
    GV.onLife && GV.onLife();
  }
  // ISS の軌道（いまから 1 周分＝約 92 分）
  function drawIssPath(jd) {
    const s = sats.find(x => x.iss);
    if (!s) return;
    const pts = [];
    for (let m = 0; m <= 93; m += 1) { const p = satPos(s.rec, Cesium.JulianDate.addMinutes(jd, m, new Cesium.JulianDate())); if (p) pts.push(p); }
    if (issPath) GV.viewer.scene.primitives.remove(issPath);
    issPath = GV.viewer.scene.primitives.add(new Cesium.PolylineCollection());
    issPath.add({ positions: pts, width: 1.5, material: Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#ffd25e').withAlpha(0.6) }) });
  }
  let lastSatT = null, lastPathT = null;
  function updateSats(force) {
    if (!satPts || !sats.length) return false;
    const jd = GV.viewer.clock.currentTime;
    if (!force && lastSatT && Math.abs(Cesium.JulianDate.secondsDifference(jd, lastSatT)) < 1) return false;
    lastSatT = Cesium.JulianDate.clone(jd);
    for (const s of sats) {
      if (!s.pt) continue;          // まだ点を作っていない（読み込みの途中）
      let p = null;
      try { p = satPos(s.rec, jd); } catch (e) { p = null; }
      s.pt.show = !!p;
      if (p) { s.pt.position = p; if (s.label) s.label.position = p; }
    }
    if (force || !lastPathT || Math.abs(Cesium.JulianDate.secondsDifference(jd, lastPathT)) > 300) { lastPathT = Cesium.JulianDate.clone(jd); drawIssPath(jd); }
    return true;
  }

  GV.applyLife = function () { applyNight(); applyQuakes(); applySats(); GV.onLife && GV.onLife(); GV.viewer.scene.requestRender(); };

  // 地球の裏側（カメラから見て地球の陰）の地震の点を隠す。点は山に隠れないよう奥行きの判定を切っているので、裏側は自分で隠す（v008）
  const occ = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, Cesium.Cartesian3.ZERO);
  function hideFarQuakes() {
    if (!quakePts) return;
    occ.cameraPosition = GV.viewer.camera.positionWC;
    for (let i = 0; i < quakePts.length; i++) { const p = quakePts.get(i); p.show = occ.isPointVisible(p.position); }
    GV.viewer.scene.requestRender();
  }

  GV.initLife = function () {
    // 描画の前に、カメラが前回から動いていれば隠し直す（camera.changed は 20% 動かないと来ないので、ゆっくり回すと遅れる）
    const lastCam = new Cesium.Cartesian3();
    GV.viewer.scene.preRender.addEventListener(() => {
      if (!quakePts) return;
      const c = GV.viewer.camera.positionWC;
      if (Cesium.Cartesian3.equalsEpsilon(c, lastCam, 0, 1)) return;
      Cesium.Cartesian3.clone(c, lastCam);
      occ.cameraPosition = c;
      for (let i = 0; i < quakePts.length; i++) { const p = quakePts.get(i); p.show = occ.isPointVisible(p.position); }
    });
    const v = GV.viewer;
    v.clock.shouldAnimate = true;
    // 時間が流れているあいだは描き直す（requestRenderMode でも衛星や昼夜が動くように）
    v.clock.onTick.addEventListener(() => {
      let moved = false;
      try { moved = updateSats(false); } catch (e) { GV.err && GV.err(e); }
      // 衛星が動いているときと、時間を早送りしているときだけ毎回描き直す（実時間の昼夜は maximumRenderTimeChange の 60 秒ごとで十分）
      if (moved || S.timeSpeed !== 1) v.scene.requestRender();
    });
    GV.applyLife();
  };
})();
