// ジオラマに見えるわけ — 本物の町（PLATEAU の 3D Tiles）を読む
//   tileset.json の木をたどり、見かけの粗さ（geometricError を画面の画素に直した値）が大きいタイルだけ子へ細かくする（REPLACE）。
//   子が読み終わるまでは親を見せる。中身は b3dm（ヘッダ＋表＋glb）→ glb を GLTFLoader（Draco 圧縮）で読む。
//   座標: glb は Y が上 → Z が上へ回し、CESIUM_RTC の中心（地球中心の座標 ECEF）を足し、原点の東・北・上（ENU）へ。
//   three の座標は x 東・y 上・z 南。高さは楕円体高 − ジオイド高 − 原点の標高（地理院の標高とそろう）。
//   考え方は CesiumJS（Apache-2.0）・3DTilesRendererJS（Apache-2.0）と同じ。コードは自前。
'use strict';
const RealTiles = (() => {
  const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F);
  function ecef(lon, lat, h) {   // 度・度・m → ECEF（m）
    const l = lon * Math.PI / 180, p = lat * Math.PI / 180, s = Math.sin(p), N = A / Math.sqrt(1 - E2 * s * s);
    return [(N + h) * Math.cos(p) * Math.cos(l), (N + h) * Math.cos(p) * Math.sin(l), (N * (1 - E2) + h) * s];
  }
  // 原点（lon0, lat0, h0＝楕円体高）の ECEF → three（x 東・y 上・z 南）の行列
  function frame(lon0, lat0, h0) {
    const l = lon0 * Math.PI / 180, p = lat0 * Math.PI / 180, sl = Math.sin(l), cl = Math.cos(l), sp = Math.sin(p), cp = Math.cos(p);
    const o = ecef(lon0, lat0, h0);
    const e = [-sl, cl, 0], n = [-sp * cl, -sp * sl, cp], u = [cp * cl, cp * sl, sp];
    const m = new THREE.Matrix4();
    // 行: x = e·(P−o)、y = u·(P−o)、z = −n·(P−o)
    m.set(e[0], e[1], e[2], -(e[0] * o[0] + e[1] * o[1] + e[2] * o[2]),
          u[0], u[1], u[2], -(u[0] * o[0] + u[1] * o[1] + u[2] * o[2]),
          -n[0], -n[1], -n[2], (n[0] * o[0] + n[1] * o[1] + n[2] * o[2]),
          0, 0, 0, 1);
    return m;
  }
  // 緯度経度 → three の x, z（原点のまわり数 km なら平面で十分）
  function local(lon0, lat0) {
    const k = Math.PI / 180, R = 6378137, c = Math.cos(lat0 * k);
    return (lon, lat) => [(lon - lon0) * k * R * c, -(lat - lat0) * k * R];
  }

  let gltf = null;
  function loader() {
    if (gltf) return gltf;
    const draco = new THREE.DRACOLoader(); draco.setDecoderPath('../lib/three@0.185.1/examples/jsm/libs/draco/gltf/'); draco.setDecoderConfig({ type: 'wasm' });
    gltf = new THREE.GLTFLoader(); gltf.setDRACOLoader(draco);
    return gltf;
  }
  const YUP = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  function drop() { this.array = new this.array.constructor(0); }
  // 1つのタイルの中で、同じ画像（質感）を使う部品を1つの形にまとめる（描く回数を減らす。PLATEAU は 1 タイル 4〜6 部品で画像は1枚）
  function mergeByMap(sceneObj) {
    sceneObj.updateMatrixWorld(true);
    const groups = new Map();
    sceneObj.traverse(m => { if (!m.isMesh) return; const key = m.material.map ? m.material.map.image : (m.geometry.attributes.color ? 'col' : 'plain'); (groups.get(key) || groups.set(key, []).get(key)).push(m); });
    const out = new THREE.Group();
    for (const list of groups.values()) {
      const parts = list.map(m => { let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrixWorld); return g; });
      const names = ['position', 'normal', 'uv', 'color'].filter(k => parts.every(g => g.attributes[k]));
      const geo = new THREE.BufferGeometry();
      for (const k of names) {
        const n = parts.reduce((a, g) => a + g.attributes[k].array.length, 0), size = parts[0].attributes[k].itemSize, arr = new Float32Array(n);
        let o = 0; for (const g of parts) { const src = g.attributes[k], A = src.array, q = src.normalized ? (A instanceof Uint8Array ? 1 / 255 : A instanceof Uint16Array ? 1 / 65535 : A instanceof Int16Array ? 1 / 32767 : A instanceof Int8Array ? 1 / 127 : 1) : 1; for (let i = 0; i < A.length; i++) arr[o++] = A[i] * q; }   // 0〜255 などの整数で入っている値（色など）は 0〜1 に
        geo.setAttribute(k, new THREE.BufferAttribute(arr, size));
      }
      parts.forEach(g => g.dispose());
      out.add(new THREE.Mesh(geo, list[0].material));
    }
    return out;
  }   // glTF の Y 上 → 3D Tiles の Z 上

  // url: tileset.json、o: { lon0, lat0, h0（原点の楕円体高）, radius（これより遠いタイルは読まない m）, sse（細かくする目安の画素）, onLoad, material(m, hasMap) }
  function create(scene, url, o) {
    const base = url.replace(/[^/]*$/, ''), M = frame(o.lon0, o.lat0, o.h0), toXZ = local(o.lon0, o.lat0);
    const group = new THREE.Group(); scene.add(group);
    let root = null, loading = 0, alive = true;
    const queue = [];
    fetch(url).then(r => r.json()).then(j => { root = prep(j.root); o.onLoad && o.onLoad(); });
    function prep(t) {
      const r = t.boundingVolume.region, d = 180 / Math.PI;
      const [x0, z0] = toXZ(r[0] * d, r[1] * d), [x1, z1] = toXZ(r[2] * d, r[3] * d);
      const n = { err: t.geometricError, uri: t.content && (t.content.uri || t.content.url), box: [Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)],
        h: [r[4] - o.h0, r[5] - o.h0], kids: (t.children || []).map(prep), obj: null, state: 0, used: 0 };
      return n;
    }
    // カメラからタイルの箱までの距離
    const dist = (n, c) => { const b = n.box, dx = Math.max(b[0] - c.x, 0, c.x - b[1]), dz = Math.max(b[2] - c.z, 0, c.z - b[3]), dy = Math.max(n.h[0] - c.y, 0, c.y - n.h[1]); return Math.hypot(dx, dy, dz); };
    const far = n => { const b = n.box; return Math.hypot(Math.max(b[0], 0, -b[1]), Math.max(b[2], 0, -b[3])) > o.radius; };   // 原点から radius より遠いタイルは使わない
    function load(n) {
      n.state = 1; loading++;
      fetch(base + n.uri).then(r => r.arrayBuffer()).then(buf => {
        const dv = new DataView(buf), ftj = dv.getUint32(12, true), ftb = dv.getUint32(16, true), btj = dv.getUint32(20, true), btb = dv.getUint32(24, true);
        const ft = ftj ? JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 28, ftj))) : {};
        const glb = buf.slice(28 + ftj + ftb + btj + btb);
        return new Promise((ok, ng) => loader().parse(glb, '', g => ok([g, ft]), ng));
      }).then(([g, ft]) => {
        loading--;
        if (!alive) return;
        const rtc = (g.parser.json.extensions && g.parser.json.extensions.CESIUM_RTC && g.parser.json.extensions.CESIUM_RTC.center) || ft.RTC_CENTER || [0, 0, 0];
        const T = new THREE.Matrix4().makeTranslation(rtc[0], rtc[1], rtc[2]);
        const obj = mergeByMap(g.scene); obj.matrixAutoUpdate = false;
        obj.matrix.copy(M).multiply(T).multiply(YUP); obj.updateMatrixWorld(true);
        obj.traverse(m => { if (m.isMesh) { if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals(); m.material = o.material(m.material, !!m.material.map, !!m.geometry.attributes.color); m.castShadow = m.receiveShadow = false; m.geometry.computeBoundingSphere(); m.frustumCulled = true;   // 写真の建物は影を作らない（写真に影が入っている。影の計算が重い）。画面の外の部品は描かない（範囲は配列を捨てる前に求める）
          const g = m.geometry; for (const k in g.attributes) g.attributes[k].onUpload(drop); if (g.index) g.index.onUpload(drop); } });   // GPU へ送ったら、JS の配列は捨てる（メモリ）
        n.obj = obj; n.state = 2; n.used = performance.now(); obj.visible = false; group.add(obj);   // 読み終えた時刻も「使った」にする（兄弟を待つあいだに捨てない）
        o.onLoad && o.onLoad();
      }).catch(e => { loading--; n.state = 3; console.warn('PLATEAU', n.uri, e); });
    }
    function unload(n) {
      group.remove(n.obj);
      n.obj.traverse(m => { if (m.isMesh) { m.geometry.dispose(); if (!m.material.userData.shared) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); } } });   // みなで使う材質は捨てない
      n.obj = null; n.state = 0;
    }
    // 見せるタイルを決める（毎コマでなく、カメラが動いたときと読み終わったとき）
    // 見せるタイルを決める（カメラが動いたときと読み終わったとき）
    //   ・細かくするのは「見かけの粗さ > o.sse 画素」、粗くもどすのは「< o.sse × 0.7」（境目でカメラが少し動くたびに入れかわらない）
    //   ・子へ進むのは、子がみな「描ける」とき。描ける＝自分が読めている、か、その子どもたちがみな描ける（孫まで見て、親にもどってちらつかない）
    function update(cam, H, fov) {
      if (!root) return false;
      const c = cam.position, k = H / (2 * Math.tan(fov / 2)), want = [], shown = new Set(), memo = new Map();
      const live = n => n.kids.filter(ch => !far(ch));
      const can = n => {
        if (memo.has(n)) return memo.get(n);
        let v = n.state >= 2 || (!n.uri && !n.kids.length);
        if (!v) { const ks = live(n); v = ks.length > 0 && ks.every(can); }
        memo.set(n, v); return v;
      };
      (function visit(n) {
        if (far(n)) return;
        const d = Math.max(1, dist(n, c)), sse = n.err * k / d, ks = live(n);
        n.ref = ks.length > 0 && (n.ref ? sse > o.sse * 0.7 : sse > o.sse);
        if (!n.ref && sse > o.sse * 0.6) for (const ch of ks) if (ch.uri && ch.state === 0) want.push([ch, d * 1.5]);   // もうすぐ細かくなるタイルの子は先に読む（切りかわりで待たない）
        if (n.ref) {
          for (const ch of ks) if (ch.uri && ch.state === 0) want.push([ch, d]);
          if (ks.every(can)) { ks.forEach(visit); return; }
        }
        if (n.state >= 2) { if (n.obj) shown.add(n); return; }
        if (n.uri && n.state === 0) want.push([n, d]);
        if (ks.length && ks.every(can)) ks.forEach(visit);   // 自分がまだでも、子どもたちが描けるならそれを見せる
      })(root);
      let changed = false; const now = performance.now(), held = [];
      (function all(n) { if (n.obj) { const v = shown.has(n); if (v) n.used = now; else held.push(n); if (n.obj.visible !== v) { n.obj.visible = v; changed = true; } } n.kids.forEach(all); })(root);
      // 読みためすぎたら、長く見ていないタイルから捨てる（メモリ。o.keep 個まで。見せている物は捨てない）
      const total = held.length + shown.size, keep = o.keep || 300;
      if (total > keep) { held.sort((a, b) => a.used - b.used); for (const n of held.slice(0, total - keep)) if (now - n.used > 20000) unload(n); }
      want.sort((a, b) => a[1] - b[1]);
      for (const [n] of want) { if (loading >= 6) break; if (n.state === 0) load(n); }
      return changed;
    }
    return { group, update, get loading() { return loading; }, get ready() { return !!root; }, dispose() { alive = false; } };
  }
  return { create, ecef, frame, local };
})();
