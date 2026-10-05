// osmbuildings.js — PLATEAU のない所の建物（OpenStreetMap の建物を、OpenFreeMap のベクトルタイルから立体に）。
// ズーム14のタイル1枚（約1〜2km 四方）ごとに、屋根と壁の三角形を組み立てて1つの Primitive にする。
// 地面の高さは同じタイルの標高タイル（terrain.js と同じデータ）から。PLATEAU を表示している区・市の中では出さない。
'use strict';

(function () {
  const GV = window.GV;
  const Z = 14;
  const SHOW_BELOW = 6000;    // カメラの高さがこれより低いときだけ（m）
  const MAX_TILES = 9;        // 同時に表示するタイル数
  const KEEP = 14;            // 覚えておくタイル数（v005 で 30→14 に軽量化）
  const COLOR = Cesium.Color.fromCssColorString('#ddd6c8');
  const tiles = new Map();    // key 'x/y' -> { prim, blds, used, loading }
  let template = null, credit = null;

  GV.state.osmBuildings = true;
  GV.osmStatus = { shown: 0, loading: 0, buildings: 0, failed: 0 };

  async function tileTemplate() {
    if (template) return template;
    const tj = await (await fetch(GV.OSMB.tilejson)).json();
    template = tj.tiles[0];
    return template;
  }

  const n = 2 ** Z;
  const lon2x = lon => (lon + 180) / 360 * n;
  const lat2y = lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n; };
  const x2lon = x => x / n * 360 - 180;
  const y2lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;

  // 面の符号付き面積（タイル座標。外側の輪と穴で符号が逆になる）
  function area(r) { let a = 0; for (let i = 0; i + 3 < r.length; i += 2) a += r[i] * r[i + 3] - r[i + 2] * r[i + 1]; return a / 2; }

  // タイルの建物 → 三角形（ENU のローカル座標、m）。blds にはクリック用の輪と高さを残す
  function buildGeometry(tx, ty, layer, dem) {
    const ext = layer.extent;
    const lon0 = x2lon(tx + 0.5), lat0 = y2lat(ty + 0.5);
    const center = Cesium.Cartesian3.fromDegrees(lon0, lat0, 0);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
    const tmp = new Cesium.Cartesian3();
    const toLocal = (gx, gy) => {   // タイル座標 → ローカル (e, n)
      const p = Cesium.Cartesian3.fromDegrees(x2lon(tx + gx / ext), y2lat(ty + gy / ext), 0, undefined, tmp);
      const q = Cesium.Matrix4.multiplyByPoint(inv, p, new Cesium.Cartesian3());
      return [q.x, q.y, q.z];
    };
    const ground = (gx, gy) => {     // 標高タイル（256×256）から最寄りの画素
      if (!dem) return 0;
      const px = Math.max(0, Math.min(255, Math.floor(gx / ext * 256))), py = Math.max(0, Math.min(255, Math.floor(gy / ext * 256)));
      return dem[py * 256 + px];
    };

    const pos = [], nor = [], idx = [], blds = [];
    for (const f of layer.features) {
      if (f.type !== 3 || f.props.hide_3d) continue;
      const top = +f.props.render_height || 0, bottom = +f.props.render_min_height || 0;
      if (top <= bottom) continue;
      // 輪を「外側＋穴」のまとまりに分ける（最初の輪の符号が外側）
      const polys = [];
      let outerSign = 0;
      for (const ring of f.geom) {
        if (ring.length < 8) continue;
        const a = area(ring);
        if (!a) continue;
        if (!outerSign) outerSign = Math.sign(a);
        if (Math.sign(a) === outerSign || !polys.length) polys.push([ring]);
        else polys[polys.length - 1].push(ring);
      }
      for (const poly of polys) {
        // 地面: 外側の輪の頂点で一番低い所（斜面で浮かないように）
        let g = Infinity;
        const outer = poly[0];
        for (let i = 0; i < outer.length; i += 2) g = Math.min(g, ground(outer[i], outer[i + 1]));
        if (!isFinite(g)) g = 0;
        const z0 = g + bottom, z1 = g + top;
        // 屋根: 輪をローカル座標にして三角形分割（最後の点は最初と同じなので落とす）
        const flat = [], holes = [], loc = [];
        for (let r = 0; r < poly.length; r++) {
          if (r) holes.push(flat.length / 2);
          const ring = poly[r], L = [];
          for (let i = 0; i + 2 < ring.length; i += 2) { const p = toLocal(ring[i], ring[i + 1]); flat.push(p[0], p[1]); L.push(p); }
          loc.push(L);
        }
        let tri;
        try { tri = Cesium.PolygonPipeline.triangulate(flat.map((v, i) => i % 2 ? null : new Cesium.Cartesian2(v, flat[i + 1])).filter(Boolean), holes); }
        catch (e) { continue; }
        const base = pos.length / 3;
        for (let i = 0; i < flat.length; i += 2) { pos.push(flat[i], flat[i + 1], z1); nor.push(0, 0, 1); }
        for (const t of tri) idx.push(base + t);
        // 壁: 輪の辺ごとに四角（2三角形）。法線は建物の外向き:
        // 外側の輪が左回り（ローカル座標で面積が正）なら辺の右側が外。穴の輪は逆回りなので同じ式で穴の側（＝建物の外）を向く
        let la = 0;
        { const L = loc[0]; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; la += a[0] * b[1] - b[0] * a[1]; } }
        const sgn = la >= 0 ? 1 : -1;
        for (let r = 0; r < loc.length; r++) {
          const L = loc[r];
          for (let i = 0; i < L.length; i++) {
            const a = L[i], b = L[(i + 1) % L.length];
            const ex = b[0] - a[0], ey = b[1] - a[1];
            const len = Math.hypot(ex, ey);
            if (len < 0.05) continue;
            const nx = sgn * ey / len, ny = -sgn * ex / len;
            const v = pos.length / 3;
            pos.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1, a[0], a[1], z1);
            for (let k = 0; k < 4; k++) nor.push(nx, ny, 0);
            idx.push(v, v + 1, v + 2, v, v + 2, v + 3, v, v + 2, v + 1, v, v + 3, v + 2);   // 両面（輪の向きが混ざっても見えるように）
          }
        }
        blds.push({ ring: outer.slice(), ext, h: top - bottom, ground: g });
      }
    }
    if (!idx.length) return { prim: null, blds };
    const geom = new Cesium.Geometry({
      attributes: {
        position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(pos) }),
        normal: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: new Float32Array(nor) }),
      },
      indices: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromVertices(pos),
    });
    const prim = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: geom,
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(COLOR) },
        id: { osmTile: tx + '/' + ty },
      }),
      appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
      modelMatrix: enu,
      asynchronous: false,
      compressVertices: false,
    });
    return { prim, blds };
  }

  async function load(tx, ty) {
    const key = tx + '/' + ty;
    const rec = { prim: null, blds: [], used: Date.now(), loading: true, tx, ty };
    tiles.set(key, rec);
    GV.osmStatus.loading++;
    try {
      const url = (await tileTemplate()).replace('{z}', Z).replace('{x}', tx).replace('{y}', ty);
      const [buf, dem] = await Promise.all([fetch(url).then(r => r.ok ? r.arrayBuffer() : null), GV.demTile(Z, tx, ty)]);
      if (!tiles.has(key)) return;
      const layer = buf && GV.decodeMVT(buf, ['building']).building;
      if (layer) {
        const g = buildGeometry(tx, ty, layer, dem);
        rec.blds = g.blds;
        if (g.prim) { rec.prim = g.prim; GV.viewer.scene.primitives.add(g.prim); }
      }
    } catch (e) {
      GV.osmStatus.failed++;
      GV.err && GV.err('OSM 建物 ' + key + ': ' + e);
    } finally {
      rec.loading = false;
      GV.osmStatus.loading--;
      update();
    }
  }

  function drop(key) {
    const rec = tiles.get(key);
    tiles.delete(key);
    if (rec && rec.prim) GV.viewer.scene.primitives.remove(rec.prim);
  }

  // PLATEAU を表示している区・市の中か（その場合は OSM を出さない）
  function coveredByPlateau(lon, lat) {
    if (GV.state.buildings === 'off' || !GV.PLATEAU_BLDG) return false;
    return GV.PLATEAU_BLDG.some(r => lon > r[3][0] && lon < r[3][2] && lat > r[3][1] && lat < r[3][3]);
  }

  function setCredit(on) {
    const cd = GV.viewer.creditDisplay;
    if (on && !credit) { credit = new Cesium.Credit('建物: ' + GV.CREDIT.openfreemap + '（高さはタグからの推定を含む）', true); cd.addStaticCredit(credit); }
    else if (!on && credit) { cd.removeStaticCredit(credit); credit = null; }
  }

  function update() {
    const v = GV.viewer, s = GV.state;
    const c = v.camera.positionCartographic;
    const want = new Set();
    if (s.osmBuildings && !s.underground && c.height < SHOW_BELOW) {   // 地下を見るときは OSM の建物は出さない
      const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
      // カメラの真下と、見ている方向のまわりのタイル（近い順）
      const cx = lon2x(lon), cy = lat2y(lat);
      const r = c.height < 1500 ? 1 : 2;
      const cand = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = Math.floor(cx) + dx, ty = Math.floor(cy) + dy;
        if (coveredByPlateau(x2lon(tx + 0.5), y2lat(ty + 0.5))) continue;
        cand.push({ tx, ty, d: Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) });
      }
      cand.sort((a, b) => a.d - b.d).slice(0, MAX_TILES).forEach(t => {
        const key = t.tx + '/' + t.ty;
        want.add(key);
        if (!tiles.has(key)) load(t.tx, t.ty);
        else tiles.get(key).used = Date.now();
      });
    }
    let shown = 0, nb = 0;
    for (const [key, rec] of tiles) {
      const on = want.has(key);
      if (rec.prim) { rec.prim.show = on; if (on) { shown++; nb += rec.blds.length; } }
    }
    if (tiles.size > KEEP) {
      [...tiles].filter(([k, r]) => !want.has(k) && !r.loading).sort((a, b) => a[1].used - b[1].used)
        .slice(0, tiles.size - KEEP).forEach(([k]) => drop(k));
    }
    GV.osmStatus.shown = shown; GV.osmStatus.buildings = nb;
    setCredit(shown > 0);
    if (GV.onBuildings) GV.onBuildings();
    v.scene.requestRender();
  }
  GV.applyOsmBuildings = update;

  // クリックした地点の OSM の建物（輪の中にあるか）
  GV.pickOsmBuilding = function (lon, lat) {
    const fx = lon2x(lon), fy = lat2y(lat), tx = Math.floor(fx), ty = Math.floor(fy);
    const rec = tiles.get(tx + '/' + ty);
    if (!rec || !rec.prim || !rec.prim.show) return null;
    for (const b of rec.blds) {
      const px = (fx - tx) * b.ext, py = (fy - ty) * b.ext, r = b.ring;
      let inside = false;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        if ((r[i + 1] > py) !== (r[j + 1] > py) && px < (r[j] - r[i]) * (py - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) inside = !inside;
      }
      if (inside) return { osm: true, height: b.h };
    }
    return null;
  };

  GV.initOsmBuildings = function () {
    const v = GV.viewer;
    v.camera.moveEnd.addEventListener(update);
    v.camera.changed.addEventListener(update);
    update();
  };
})();
