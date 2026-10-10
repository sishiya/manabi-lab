// transit.js — 段階D「動く街」の1: 都営バス・都営地下鉄などのリアルタイムの位置（公共交通オープンデータセンター、キー不要）。
// バスは「出たバス停 → 次のバス停」、電車は「出た駅 → 次の駅」しかデータがないので、その間の位置は経過時間から推定して動かす。
// バス停・駅の座標は data/toei.js（使うときに読み込む）。
'use strict';

(function () {
  const GV = window.GV;
  const S = GV.state;
  const API = 'https://api-public.odpt.org/api/v4/';
  const AREA = [138.9, 35.45, 140.05, 35.95];   // 都営の路線・バスのある範囲（ざっと東京都）
  const POLL = 30000;                            // 取り直す間隔（ms）。バスの位置の更新は約30秒ごと
  const SHOW_BELOW = 150000;                     // カメラの高さ（m）
  const BUS_SPEED = 5;                           // バス停の間の進み方の目安（m/秒 ≒ 時速18km。信号や渋滞をならした値）
  const TRAIN_SEG = 110;                         // 駅の間の所要の目安（秒）
  // データに色がない路線の色（見やすさのため）
  const FALLBACK_COLOR = { Arakawa: '#e8789b', NipporiToneri: '#e85298' };

  S.transit = false;
  GV.transitStatus = { buses: 0, trains: 0, loading: false, time: '' };
  let dataP = null, timer = null, buses = [], trains = [], pts = null, lines = null, credit = null, lastFetch = 0;

  function loadData() {
    return dataP || (dataP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'data/toei.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }));
  }
  const inArea = () => {
    const c = GV.viewer.camera.positionCartographic;
    const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
    return c.height < SHOW_BELOW && lon > AREA[0] - 0.3 && lon < AREA[2] + 0.3 && lat > AREA[1] - 0.3 && lat < AREA[3] + 0.3;
  };
  const dist = (a, b) => { const k = Math.cos(a[1] * Math.PI / 180); return Math.hypot((b[0] - a[0]) * 111320 * k, (b[1] - a[1]) * 110540); };
  const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

  // 路線（駅を直線で結ぶ。線路の正確な形ではない）
  function drawLines() {
    if (lines) return;
    const T = GV.TOEI, instances = [];
    for (const [id, r] of Object.entries(T.railways)) {
      const p = r.order.map(s => T.stations[s]).filter(Boolean);
      if (p.length < 2) continue;
      const color = Cesium.Color.fromCssColorString(FALLBACK_COLOR[id] || r.color).withAlpha(0.75);
      instances.push(new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({ positions: Cesium.Cartesian3.fromDegreesArray(p.flatMap(x => [x[0], x[1]])), width: 4 }),
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
        id: { railway: r.title },
      }));
    }
    lines = GV.viewer.scene.groundPrimitives.add(new Cesium.GroundPolylinePrimitive({ geometryInstances: instances, appearance: new Cesium.PolylineColorAppearance() }));
  }

  async function fetchAll() {
    if (!S.transit || !inArea()) return;
    lastFetch = Date.now();
    GV.transitStatus.loading = true; GV.onTransit && GV.onTransit();
    try {
      const [b, t] = await Promise.all([
        fetch(API + 'odpt:Bus?odpt:operator=odpt.Operator:Toei').then(r => r.json()),
        fetch(API + 'odpt:Train?odpt:operator=odpt.Operator:Toei').then(r => r.json()),
      ]);
      const T = GV.TOEI, st = id => id && T.stops[id.replace('odpt.BusstopPole:Toei.', '')];
      buses = b.map(x => {
        const from = st(x['odpt:fromBusstopPole']), to = st(x['odpt:toBusstopPole']);
        if (!from) return null;
        return { from, to: to || from, t0: Date.parse(x['odpt:fromBusstopPoleTime'] || x['dc:date']), note: x['odpt:note'] || '', num: x['odpt:busNumber'] };
      }).filter(Boolean);
      const sta = id => id && T.stations[id.replace('odpt.Station:Toei.', '')];
      trains = t.map(x => {
        const from = sta(x['odpt:fromStation']), to = sta(x['odpt:toStation']);
        if (!from) return null;
        const rw = (x['odpt:railway'] || '').replace('odpt.Railway:Toei.', ''), R = T.railways[rw] || {};
        const dest = sta((x['odpt:destinationStation'] || [])[0]);
        return { from, to: to || from, moving: !!to, t0: Date.parse(x['dc:date']), line: R.title || rw, color: FALLBACK_COLOR[rw] || R.color || '#ffffff', dest: dest ? dest[2] : '', delay: x['odpt:delay'] || 0 };
      }).filter(Boolean);
      GV.transitStatus.time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      rebuildPoints();
    } catch (e) { GV.err && GV.err('電車・バス: ' + e); }
    GV.transitStatus.loading = false;
    GV.transitStatus.buses = buses.length; GV.transitStatus.trains = trains.length;
    GV.onTransit && GV.onTransit();
  }

  function rebuildPoints() {
    if (pts) GV.viewer.scene.primitives.remove(pts);
    pts = GV.viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const common = { disableDepthTestDistance: Number.POSITIVE_INFINITY, outlineColor: Cesium.Color.WHITE, scaleByDistance: new Cesium.NearFarScalar(1500, 1.6, 1.5e5, 0.6) };
    for (const b of buses) b.pt = pts.add(Object.assign({ pixelSize: 6, outlineWidth: 1, color: Cesium.Color.fromCssColorString('#2fbf71'), id: { bus: b } }, common));
    for (const t of trains) t.pt = pts.add(Object.assign({ pixelSize: 10, outlineWidth: 2, color: Cesium.Color.fromCssColorString(t.color), id: { train: t } }, common));
    move(true);
  }

  // 位置をいまの時刻で進める（バス停・駅の間を推定）
  let lastMove = 0;
  function move(force) {
    if (!pts) return false;
    const now = Date.now();
    if (!force && now - lastMove < 1000) return false;
    lastMove = now;
    for (const b of buses) {
      const d = Math.max(30, dist(b.from, b.to));
      const f = Math.max(0, Math.min(0.95, (now - b.t0) / 1000 * BUS_SPEED / d));
      const p = lerp(b.from, b.to, f);
      b.pt.position = Cesium.Cartesian3.fromDegrees(p[0], p[1], 20);
    }
    for (const t of trains) {
      const f = t.moving ? Math.max(0.05, Math.min(0.95, (now - t.t0) / 1000 / TRAIN_SEG)) : 0;
      const p = lerp(t.from, t.to, f);
      t.pt.position = Cesium.Cartesian3.fromDegrees(p[0], p[1], 25);
    }
    return true;
  }

  function setCredit(on) {
    const cd = GV.viewer.creditDisplay;
    if (on && !credit) {
      credit = new Cesium.Credit(L('電車・バス: ', 'Trains and buses: ') + '<a href="https://ckan.odpt.org/organization/toei" target="_blank" rel="noopener">東京都交通局・公共交通オープンデータセンター</a>' + L('（CC BY 4.0。駅・バス停の間の位置は推定）', ' (CC BY 4.0; positions between stations and stops are estimated)'), true);
      cd.addStaticCredit(credit);
    } else if (!on && credit) { cd.removeStaticCredit(credit); credit = null; }
  }

  GV.applyTransit = async function () {
    const v = GV.viewer;
    if (!S.transit) {
      clearInterval(timer); timer = null;
      if (pts) { v.scene.primitives.remove(pts); pts = null; }
      if (lines) { v.scene.groundPrimitives.remove(lines); lines = null; }
      setCredit(false); buses = []; trains = [];
      GV.transitStatus.buses = GV.transitStatus.trains = 0;
      GV.onTransit && GV.onTransit();
      return;
    }
    setCredit(true);
    GV.transitStatus.loading = true; GV.onTransit && GV.onTransit();
    try { await loadData(); } catch (e) { GV.err && GV.err('toei.js: ' + e); return; }
    drawLines();
    fetchAll();
    if (!timer) timer = setInterval(() => { if (Date.now() - lastFetch >= POLL - 500) fetchAll(); }, POLL);
  };

  GV.initTransit = function () {
    const v = GV.viewer;
    v.clock.onTick.addEventListener(() => { if (S.transit && move(false)) v.scene.requestRender(); });
    // 東京から離れて戻ってきたとき、古ければすぐ取り直す
    v.camera.moveEnd.addEventListener(() => { if (S.transit && Date.now() - lastFetch > POLL && inArea()) fetchAll(); });
  };

  // クリックしたときの説明
  GV.transitInfo = function (id) {
    if (id.bus) return { title: L('都営バス ', 'Toei Bus ') + id.bus.note, sub: L(`車両 ${id.bus.num || '—'}・次は ${id.bus.to[2]}`, `Vehicle ${id.bus.num || '—'} · next: ${id.bus.to[2]}`) };
    if (id.train) return { title: `${id.train.line}${id.train.dest ? L('（' + id.train.dest + ' 行き）', ' (for ' + id.train.dest + ')') : ''}`, sub: (id.train.moving ? `${id.train.from[2]} → ${id.train.to[2]}` : L(`${id.train.from[2]} に停車中`, `Stopped at ${id.train.from[2]}`)) + (id.train.delay ? L(`・約 ${Math.round(id.train.delay / 60)} 分遅れ`, ` · about ${Math.round(id.train.delay / 60)} min late`) : '') };
    if (id.railway) return { title: id.railway, sub: L('路線（駅を直線で結んだ線。線路の正確な形ではない）', 'Line (stations joined by straight lines, not the exact shape of the track)') };
    return null;
  };
})();
