// buildings.js — 建物の立体（PLATEAU 3D Tiles、日本の都市）。
// 索引 GV.PLATEAU_BLDG（data/plateau-bldg.js）から、見ている範囲の区・市の tileset だけを読み、遠くなったら捨てる。
// PLATEAU の高さは楕円体高、地形（地理院の標高）は標高なので、区・市ごとのジオイド高だけ建物を下げる。
'use strict';

(function () {
  const GV = window.GV;
  const SHOW_BELOW = 25000;     // カメラの高さがこれより低いときだけ建物を出す（m）
  const MAX_ACTIVE = 4;         // 同時に表示する区・市の数（v005 で 6→4 に軽量化）
  const MAX_KEEP = 6;           // 読み込んだまま覚えておく数（それ以上は古いものから捨てる）
  const loaded = new Map();     // key(code|url) -> { ts, entry, used, ready }
  let credit = null;
  const ghostStyle = new Cesium.Cesium3DTileStyle({ color: "color('#cfe3ff', 0.18)" });

  GV.state.buildings = 'lod2';  // 'off' | 'lod1' | 'lod2'
  GV.state.bldgTexture = true;
  GV.bldgStatus = { active: [], loading: 0, failed: 0 };

  const E = r => ({ code: r[0], name: r[1], year: r[2], bb: r[3], geoid: r[4], l1: r[5], l2: r[6], l2n: r[7] });
  let INDEX = null;
  const index = () => INDEX || (INDEX = (GV.PLATEAU_BLDG || []).map(E));

  function urlFor(e) {
    const s = GV.state;
    let u = e.l1;
    if (s.buildings === 'lod2') u = (s.bldgTexture ? (e.l2 || e.l2n) : (e.l2n || e.l2)) || e.l1;
    return u ? GV.PLATEAU_PREFIX + u : null;
  }

  // 見えている範囲（度）。地平線が見えて計算できないときは画面中央のまわり
  function viewRect() {
    const v = GV.viewer, r = v.camera.computeViewRectangle(v.scene.globe.ellipsoid);
    if (r && r.east - r.west < 0.5 && r.north - r.south < 0.5) {
      const d = Cesium.Math.toDegrees;
      return [d(r.west), d(r.south), d(r.east), d(r.north)];
    }
    const c = v.camera.positionCartographic, lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
    const k = Math.max(0.02, c.height / 60000);
    return [lon - k, lat - k, lon + k, lat + k];
  }

  function load(e, url) {
    const key = e.code + '|' + url;
    if (loaded.has(key)) return loaded.get(key);
    const rec = { ts: null, entry: e, used: Date.now(), ready: false };
    loaded.set(key, rec);
    GV.bldgStatus.loading++;
    // cacheBytes: Cesium の初期値は 1 つの tileset ごとに 512MB までためるので、小さくする（軽量化）
    Cesium.Cesium3DTileset.fromUrl(url, { maximumScreenSpaceError: 16, cacheBytes: 96 * 1024 * 1024, maximumCacheOverflowBytes: 64 * 1024 * 1024 }).then(ts => {
      GV.bldgStatus.loading--;
      if (!loaded.has(key)) { ts.destroy(); return; }
      // ジオイド高の分だけ、その場所の鉛直方向に下げる
      const lon = (e.bb[0] + e.bb[2]) / 2, lat = (e.bb[1] + e.bb[3]) / 2;
      const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(Cesium.Cartesian3.fromDegrees(lon, lat), new Cesium.Cartesian3());
      Cesium.Cartesian3.multiplyByScalar(up, -(e.geoid || 0), up);
      ts.modelMatrix = Cesium.Matrix4.fromTranslation(up);
      ts.debugWireframe = GV.state.wireframe;
      ts.show = false;
      rec.ts = ts; rec.ready = true;
      GV.viewer.scene.primitives.add(ts);
      update();
    }).catch(err => {
      GV.bldgStatus.loading--; GV.bldgStatus.failed++;
      loaded.delete(key);
      GV.err && GV.err('PLATEAU ' + e.name + ': ' + err);
    });
    return rec;
  }

  function drop(key) {
    const rec = loaded.get(key);
    loaded.delete(key);
    if (rec && rec.ts) GV.viewer.scene.primitives.remove(rec.ts);  // remove は destroy もする
  }

  function setCredit(on) {
    const cd = GV.viewer.creditDisplay;
    if (on && !credit) {
      credit = new Cesium.Credit(L('建物: ', 'Buildings: ') + '<a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener">3D都市モデル（Project PLATEAU）国土交通省</a>' + L('（ジオイド高の分だけ高さを補正）', ' (heights corrected by the geoid height)'), true);
      cd.addStaticCredit(credit);
    } else if (!on && credit) {
      cd.removeStaticCredit(credit); credit = null;
    }
  }

  function update() {
    const s = GV.state, v = GV.viewer;
    const h = v.camera.positionCartographic.height;
    let active = [];
    if (s.buildings !== 'off' && h < SHOW_BELOW) {
      const [w, so, ea, n] = viewRect();
      // 近い順はカメラの真下から測る（地平線近くまで見ると、見える範囲の中心はずっと遠くになるため）
      const cc = v.camera.positionCartographic;
      const cx = Cesium.Math.toDegrees(cc.longitude), cy = Cesium.Math.toDegrees(cc.latitude);
      const W = Math.min(w, cx), S = Math.min(so, cy), EA = Math.max(ea, cx), N = Math.max(n, cy);  // 真下の区・市も必ず入れる
      active = index().filter(e => e.bb[2] > W && e.bb[0] < EA && e.bb[3] > S && e.bb[1] < N)
        .map(e => ({ e, d: Math.hypot(Math.max(e.bb[0] - cx, 0, cx - e.bb[2]), Math.max(e.bb[1] - cy, 0, cy - e.bb[3])) }))
        .sort((a, b) => a.d - b.d).slice(0, MAX_ACTIVE).map(x => x.e);
    }
    const want = new Set();
    for (const e of active) {
      const url = urlFor(e);
      if (!url) continue;
      const key = e.code + '|' + url;
      want.add(key);
      const rec = load(e, url);
      rec.used = Date.now();
    }
    for (const [key, rec] of loaded) {
      if (rec.ts) {
        rec.ts.show = want.has(key); rec.ts.debugWireframe = s.wireframe;
        // 地下を見るときは建物を半透明に（地下街や管が建物に隠れないように）
        const st = s.underground ? ghostStyle : null;
        if (rec.ts.style !== st) rec.ts.style = st;
      }
    }
    // 覚えすぎたら、表示していない古いものから捨てる
    if (loaded.size > MAX_KEEP) {
      [...loaded].filter(([k]) => !want.has(k)).sort((a, b) => a[1].used - b[1].used)
        .slice(0, loaded.size - MAX_KEEP).forEach(([k]) => drop(k));
    }
    GV.bldgStatus.active = active.map(e => e.name);
    setCredit(active.length > 0);
    if (GV.onBuildings) GV.onBuildings();
    v.scene.requestRender();
  }
  GV.applyBuildings = update;

  // 建物をクリックしたときの情報（PLATEAU の属性）
  GV.pickBuilding = function (pos) {
    const f = GV.viewer.scene.pick(pos);
    if (!(f instanceof Cesium.Cesium3DTileFeature)) return null;
    const get = k => { try { return f.getProperty(k); } catch (e) { return undefined; } };
    const ids = f.getPropertyIds ? f.getPropertyIds() : [];
    let attrs = get('attributes');
    if (typeof attrs === 'string') { try { attrs = JSON.parse(attrs); } catch (e) { attrs = null; } }
    const A = k => { const x = get(k); return x != null && x !== '' ? x : (attrs && attrs[k] != null ? attrs[k] : undefined); };
    return {
      name: A('gml:name') || A('名称'),
      usage: A('bldg:usage') || A('用途'),
      height: A('bldg:measuredHeight') || A('計測高さ'),
      above: A('bldg:storeysAboveGround') || A('地上階数'),
      below: A('bldg:storeysBelowGround') || A('地下階数'),
      year: A('bldg:yearOfConstruction') || A('建築年'),
      city: A('city_name'),
      under: f.tileset && f.tileset.underItem ? f.tileset.underItem : null,
      setYear: A('uro:year'),
      ids,
    };
  };

  GV.initBuildings = function () {
    const v = GV.viewer;
    v.camera.moveEnd.addEventListener(update);
    v.camera.changed.addEventListener(update);
    v.camera.percentageChanged = 0.2;
    update();
  };
})();
