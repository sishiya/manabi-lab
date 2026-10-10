// agents.js — 段階D「動く街」の2: 車・人・鳥の演出（シティーズ・スカイライン風）。
// OSM の道路（OpenFreeMap のベクトルタイル、建物と同じタイル）の上を、架空の車と人が動く。公園・緑地の上には鳥。
// 全員「演出」: 実在の人や車ではない。数は道路の長さと時間帯（日本時間）から決める。
'use strict';

(function () {
  const GV = window.GV;
  const S = GV.state;
  const Z = 14;
  const SHOW_BELOW = 1200;     // カメラの高さ（m）
  const MAX = { car: 600, person: 1200, bird: 40 };
  const CAR_ROADS = { motorway: 3, trunk: 2.5, primary: 2, secondary: 1.6, tertiary: 1.2, minor: 0.6, service: 0.3 };   // 1km あたりの台数の目安（昼）
  const WALK_ROADS = { path: 1.6, minor: 0.8, service: 0.5, pedestrian: 2.5, tertiary: 0.6, secondary: 0.6, primary: 0.5 };
  const SPEED = { motorway: 22, trunk: 15, primary: 12, secondary: 11, tertiary: 9, minor: 6, service: 4 };   // m/秒（流れをならした値）
  const CAR_COLORS = ['#f2f2f2', '#2b2b2b', '#c0c4c8', '#3a5a9a', '#b8312f', '#e0e0d8', '#6b6f73'];
  const PERSON_COLORS = ['#ffb347', '#7fb3ff', '#ff7f9f', '#a0e080', '#f5f5f5', '#c9a2ff'];

  S.agents = false;
  GV.agentStatus = { car: 0, person: 0, bird: 0 };
  let pts = null, agents = [], building = false;

  const n = 2 ** Z;
  const x2lon = x => x / n * 360 - 180;
  const y2lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const lon2x = lon => (lon + 180) / 360 * n;
  const lat2y = lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n; };
  const rnd = a => a[Math.floor(Math.random() * a.length)];

  // 時間帯の多さ（日本時間の時刻 → 0.1〜1.3）。通勤の時間は多く、深夜は少ない
  function busy(kind) {
    const h = (Cesium.JulianDate.toDate(GV.viewer.clock.currentTime).getUTCHours() + 9) % 24;
    const day = [0.12, 0.08, 0.06, 0.06, 0.1, 0.25, 0.55, 1.0, 1.2, 0.9, 0.8, 0.85, 0.95, 0.9, 0.85, 0.9, 1.0, 1.2, 1.15, 0.9, 0.7, 0.5, 0.35, 0.2][h];
    return kind === 'person' ? Math.min(1.3, day * (h >= 22 || h < 5 ? 0.6 : 1)) : day;
  }

  // タイルの道路 → 経緯度の線（m 単位の長さつき）
  function lines(layer, tx, ty, dem) {
    const out = [], ext = layer.extent;
    for (const f of layer.features) {
      if (f.type !== 2 || f.props.brunnel === 'tunnel') continue;
      const cls = f.props.class, sub = f.props.subclass;
      const carW = CAR_ROADS[cls] || 0;
      const walkW = cls === 'path' ? (sub === 'steps' || sub === 'platform' || sub === 'corridor' ? 0.6 : WALK_ROADS.path) : (WALK_ROADS[sub] || WALK_ROADS[cls] || 0);
      if (!carW && !walkW) continue;
      for (const g of f.geom) {
        if (g.length < 4) continue;
        const p = [];
        let len = 0;
        for (let i = 0; i < g.length; i += 2) {
          const gx = g[i] / ext, gy = g[i + 1] / ext;
          const lon = x2lon(tx + gx), lat = y2lat(ty + gy);
          const px = Math.min(255, Math.max(0, Math.floor(gx * 256))), py = Math.min(255, Math.max(0, Math.floor(gy * 256)));
          const h = dem ? dem[py * 256 + px] : 0;
          if (p.length) { const q = p[p.length - 1]; len += Math.hypot((lon - q[0]) * 111320 * Math.cos(lat * Math.PI / 180), (lat - q[1]) * 110540); }
          p.push([lon, lat, h, len]);
        }
        if (len < 15) continue;
        out.push({ cls, sub, carW, walkW, p, len, bridge: f.props.brunnel === 'bridge' });
      }
    }
    return out;
  }

  // 線の上の距離 s の点
  function at(L, s) {
    const p = L.p;
    let i = 1;
    while (i < p.length - 1 && p[i][3] < s) i++;
    const a = p[i - 1], b = p[i], f = (s - a[3]) / Math.max(1e-6, b[3] - a[3]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  function pickWeighted(arr, w) {
    let t = 0;
    for (const x of arr) t += w(x);
    let r = Math.random() * t;
    for (const x of arr) { r -= w(x); if (r <= 0) return x; }
    return arr[arr.length - 1];
  }

  const R = 700;               // 画面の中心からこの半径（m）だけに出す（v006: 9区画に散らすと画面にほとんど入らなかった）
  const near = (p, c) => Math.hypot((p[0] - c[0]) * 111320 * Math.cos(c[1] * Math.PI / 180), (p[1] - c[1]) * 110540) < R;

  async function build(lon0, lat0) {
    const c0 = [lon0, lat0];
    building = true;
    try {
      const tpl = await GV.ofmTemplate();
      const all = [], green = [];
      const tiles = [];
      const dLon = R / (111320 * Math.cos(lat0 * Math.PI / 180)), dLat = R / 110540;
      for (let ty = Math.floor(lat2y(lat0 + dLat)); ty <= Math.floor(lat2y(lat0 - dLat)); ty++)
        for (let tx = Math.floor(lon2x(lon0 - dLon)); tx <= Math.floor(lon2x(lon0 + dLon)); tx++) tiles.push([tx, ty]);
      await Promise.all(tiles.map(async ([tx, ty]) => {
        const [buf, dem] = await Promise.all([
          fetch(tpl.replace('{z}', Z).replace('{x}', tx).replace('{y}', ty)).then(r => r.ok ? r.arrayBuffer() : null),
          GV.demTile(Z, tx, ty),
        ]);
        if (!buf) return;
        const d = GV.decodeMVT(buf, ['transportation', 'park', 'landcover']);
        if (d.transportation) all.push(...lines(d.transportation, tx, ty, dem).filter(L => L.p.some(p => near(p, c0))));
        // 緑地の中心（鳥の群れの場所）: 公園と、草地・森の面の最初の点のまわり
        for (const k of ['park', 'landcover']) {
          if (!d[k]) continue;
          for (const f of d[k].features) {
            if (f.type !== 3 || (k === 'landcover' && !/grass|wood|park/.test(f.props.class || ''))) continue;
            const g = f.geom[0];
            if (!g || g.length < 6) continue;
            let sx = 0, sy = 0, m = 0;
            for (let i = 0; i < g.length; i += 2) { sx += g[i]; sy += g[i + 1]; m++; }
            const gp = [x2lon(tx + sx / m / d[k].extent), y2lat(ty + sy / m / d[k].extent), dem ? dem[128 * 256 + 128] : 0];
            if (near(gp, c0)) green.push(gp);
          }
        }
      }));
      // 数を決める（道路 1km あたりの目安 × 時間帯）
      const carLen = all.reduce((a, L) => a + L.len * L.carW, 0) / 1000, walkLen = all.reduce((a, L) => a + L.len * L.walkW, 0) / 1000;
      const nCar = Math.min(MAX.car, Math.round(carLen * 20 * busy('car')));
      const nPer = Math.min(MAX.person, Math.round(walkLen * 40 * busy('person')));
      const nBird = Math.min(MAX.bird, green.length ? 10 + green.length * 3 : 0);
      const carL = all.filter(L => L.carW), walkL = all.filter(L => L.walkW);
      const list = [];
      for (let i = 0; i < nCar && carL.length; i++) {
        const L = pickWeighted(carL, L => L.len * L.carW);
        const v = (SPEED[L.cls] || 8) * (0.7 + Math.random() * 0.5);
        list.push({ kind: 'car', L, s: Math.random() * L.len, v: Math.random() < 0.5 ? v : -v, color: rnd(CAR_COLORS), lane: (Math.random() < 0.5 ? 1 : -1) * 2.5 });
      }
      for (let i = 0; i < nPer && walkL.length; i++) {
        const L = pickWeighted(walkL, L => L.len * L.walkW);
        const v = 1.0 + Math.random() * 0.6;
        list.push({ kind: 'person', L, s: Math.random() * L.len, v: Math.random() < 0.5 ? v : -v, color: rnd(PERSON_COLORS), lane: (Math.random() < 0.5 ? 1 : -1) * (L.carW ? 5 : 1) });
      }
      for (let i = 0; i < nBird; i++) {
        const c = rnd(green);
        list.push({ kind: 'bird', c, r: 30 + Math.random() * 90, a: Math.random() * Math.PI * 2, w: (Math.random() < 0.5 ? 1 : -1) * (0.15 + Math.random() * 0.2), h: 25 + Math.random() * 40 });
      }
      makePoints(list);
    } catch (e) { GV.err && GV.err('演出: ' + e); }
    building = false;
  }

  function makePoints(list) {
    if (pts) GV.viewer.scene.primitives.remove(pts);
    pts = GV.viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const cnt = { car: 0, person: 0, bird: 0 };
    for (const a of list) {
      cnt[a.kind]++;
      a.pt = pts.add({
        pixelSize: a.kind === 'car' ? 6 : a.kind === 'person' ? 4 : 4,
        color: Cesium.Color.fromCssColorString(a.kind === 'bird' ? '#222222' : a.color),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.5), outlineWidth: a.kind === 'car' ? 1 : 0,
        scaleByDistance: new Cesium.NearFarScalar(80, 2.2, 1200, 0.7),
        id: { agent: a.kind },
      });
    }
    agents = list;
    GV.agentStatus = cnt;
    step(0);
    GV.onAgents && GV.onAgents();
  }

  const tmp = new Cesium.Cartesian3();
  function step(dt) {
    for (const a of agents) {
      let lon, lat, h;
      if (a.kind === 'bird') {
        a.a += a.w * dt;
        const k = Math.cos(a.c[1] * Math.PI / 180);
        lon = a.c[0] + Math.cos(a.a) * a.r / (111320 * k); lat = a.c[1] + Math.sin(a.a) * a.r / 110540; h = a.c[2] + a.h + Math.sin(a.a * 3) * 3;
      } else {
        a.s += a.v * dt;
        if (a.s < 0 || a.s > a.L.len) { a.v = -a.v; a.s = Math.max(0, Math.min(a.L.len, a.s)); }   // 端まで来たら引き返す
        const p = at(a.L, a.s), q = at(a.L, Math.min(a.L.len, a.s + 1));
        // 進む向きに対して横にずらす（車線・歩道）
        const k = Math.cos(p[1] * Math.PI / 180);
        const ex = (q[0] - p[0]) * 111320 * k, ey = (q[1] - p[1]) * 110540, el = Math.hypot(ex, ey) || 1;
        const side = a.lane * Math.sign(a.v || 1);
        lon = p[0] + (ey / el) * side / (111320 * k); lat = p[1] - (ex / el) * side / 110540;
        h = p[2] + 2.5 + (a.L.bridge ? 8 : 0);   // 地形の面とのずれで埋まらないよう少し上げる
      }
      a.pt.position = Cesium.Cartesian3.fromDegrees(lon, lat, h, undefined, tmp);
    }
  }

  function clear() {
    if (pts) { GV.viewer.scene.primitives.remove(pts); pts = null; }
    agents = [];
    GV.agentStatus = { car: 0, person: 0, bird: 0 };
    GV.onAgents && GV.onAgents();
  }

  // 画面の中心が地面のどこか（地面に当たらなければカメラの真下）
  let center = null;
  function viewCenter() {
    const v = GV.viewer, cv = v.scene.canvas;
    const ray = v.camera.getPickRay(new Cesium.Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
    const hit = ray && v.scene.globe.pick(ray, v.scene);
    const c = hit ? Cesium.Cartographic.fromCartesian(hit) : v.camera.positionCartographic;
    return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)];
  }
  function update() {
    const c = GV.viewer.camera.positionCartographic;
    if (!S.agents || S.underground || c.height > SHOW_BELOW) { if (pts) clear(); center = null; return; }
    if (building) return;
    const p = viewCenter();
    if (center && Math.hypot((p[0] - center[0]) * 111320 * Math.cos(p[1] * Math.PI / 180), (p[1] - center[1]) * 110540) < 250) return;
    center = p;
    build(p[0], p[1]);
  }
  GV.applyAgents = function () { center = null; if (!S.agents) clear(); update(); };

  GV.initAgents = function () {
    const v = GV.viewer;
    v.camera.moveEnd.addEventListener(update);
    let last = performance.now();
    v.clock.onTick.addEventListener(() => {
      const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (!pts || !agents.length) return;
      step(dt * Math.min(GV.state.timeSpeed, 10));   // 早送りしても速くなりすぎないように
      v.scene.requestRender();
    });
  };
})();
