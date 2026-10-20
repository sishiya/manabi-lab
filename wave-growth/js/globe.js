// 波が育つまで — 地球儀（段階D）。陸の形（ETOPO1 を 1°ごと、data/etopo1deg.bin）・大円・うねりの前の面・タップで場所を選ぶ。
// 世界の座標: いる所が原点、+x = 東、+y = 上、+z = 南（env.js と同じ）。地球の中心は (0, −Re, 0)。
// 地球の座標（ECEF）: z = 北極、x = 経度 0°。
'use strict';
window.WGglobe = (() => {
  const Re = 6.371e6, D2R = Math.PI / 180;
  let elev = null;                      // Int16Array 181×360（緯度 −90→90、経度 −180→179）
  const G = { storm: { lat: 50, lon: -170 }, obs: { lat: 33, lon: 140 }, ready: false };
  function load() {
    return fetch('data/etopo1deg.bin').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => { elev = new Int16Array(b); G.ready = true; });
  }
  function height(lat, lon) {   // 4 点から（m）
    if (!elev) return -4000;
    const y = Math.min(179.999, Math.max(0, lat + 90)), x = ((lon + 180) % 360 + 360) % 360, i = Math.floor(y), j = Math.floor(x), fy = y - i, fx = x - j, j1 = (j + 1) % 360;
    const a = elev[i * 360 + j], b = elev[i * 360 + j1], c = elev[(i + 1) * 360 + j], d = elev[(i + 1) * 360 + j1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  const isSea = (lat, lon) => height(lat, lon) < 0;
  const ecef = (lat, lon) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
  const llOf = v => ({ lat: Math.asin(Math.max(-1, Math.min(1, v[2]))) / D2R, lon: Math.atan2(v[1], v[0]) / D2R });
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // いる所の東・上・北（ECEF）
  function frame() { const p = G.obs.lat * D2R, l = G.obs.lon * D2R;
    return { e: [-Math.sin(l), Math.cos(l), 0], u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)], n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)] }; }
  // ECEF の単位ベクトル → 世界の座標（地球の表面の点）
  function toWorld(v, h = 0) { const F = frame(), r = Re + h, p = [v[0] * r, v[1] * r, v[2] * r];
    return [dot(p, F.e), dot(p, F.u) - Re, -dot(p, F.n)]; }
  // 世界の向き → ECEF の向き（シェーダーに渡す 3×3、列 = 世界の x・y・z）
  function worldToEcef() { const F = frame(), n = F.n.map(v => -v); return [...F.e, ...F.u, ...n]; }
  // 大円: a から方位 az（北から時計まわり、ラジアン）へ角度 d 進んだ所
  function dest(a, az, d) { const p1 = a.lat * D2R, l1 = a.lon * D2R;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(az));
    const l2 = l1 + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / D2R, lon: ((l2 / D2R + 540) % 360) - 180 }; }
  function angDist(a, b) { return Math.acos(Math.max(-1, Math.min(1, dot(ecef(a.lat, a.lon), ecef(b.lat, b.lon))))); }
  function bearing(a, b) { const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)); }
  // 嵐から方位 az へ進んで、はじめて陸に当たる角度（嵐のまわり 1.5° と π まで）
  const blockCache = new Map();
  function blockAt(az) { const k = Math.round(az / D2R); if (blockCache.has(k)) return blockCache.get(k);
    let d = 1.5 * D2R; for (; d < Math.PI; d += 0.5 * D2R) { const p = dest(G.storm, k * D2R, d); if (!isSea(p.lat, p.lon)) break; }
    blockCache.set(k, d); return d; }
  function moved() { blockCache.clear(); }
  // 嵐 → いる所の道が海だけか（両はし 1° はのぞく）
  function pathClear() { const D = angDist(G.storm, G.obs), az = bearing(G.storm, G.obs);
    for (let d = 1 * D2R; d < D - 1 * D2R; d += 0.5 * D2R) { const p = dest(G.storm, az, d); if (!isSea(p.lat, p.lon)) return { clear: false, at: d * Re }; }
    return { clear: true }; }
  // いる所でのうねりの進む向き（世界の xz の角度）: 嵐から来る向きの反対
  function swellAngle() { const b = bearing(G.obs, G.storm), x = Math.sin(b), z = -Math.cos(b); return Math.atan2(-z, -x); }
  // 画面の点 → 地球の上の緯度・経度（光線を球に当てる。当たらなければ null）
  function pick(o, d) { const oc = [o[0], o[1] + Re, o[2]], b = dot(oc, d), c = o[0] * o[0] + o[2] * o[2] + o[1] * (o[1] + 2 * Re), D = b * b - c;
    if (D < 0) return null; const t = -b - Math.sqrt(D); if (t < 0) return null;
    const p = [oc[0] + d[0] * t, oc[1] + d[1] * t, oc[2] + d[2] * t].map(v => v / Re), F = frame();
    const v = [F.e[0] * p[0] + F.u[0] * p[1] - F.n[0] * p[2], F.e[1] * p[0] + F.u[1] * p[1] - F.n[1] * p[2], F.e[2] * p[0] + F.u[2] * p[1] - F.n[2] * p[2]];
    return llOf(v); }
  // 地球の上に線をかく（見える側だけ）。project(p) → 画面の [x, y] か null
  function drawOverlay(g, project, cam, fronts, labels) {
    const camE = [cam[0], cam[1] + Re, cam[2]], cl = Math.hypot(...camE);
    const vis = w => { const n = [w[0], w[1] + Re, w[2]], ln = Math.hypot(...n); return (n[0] * camE[0] + n[1] * camE[1] + n[2] * camE[2]) / (ln * cl) > Re / cl - 1e-4; };
    const line = (pts, col, wid) => { g.strokeStyle = col; g.lineWidth = wid; g.beginPath(); let on = false;
      for (const ll of pts) { if (!ll) { on = false; continue; } const w = toWorld(ecef(ll.lat, ll.lon), 2000); if (!vis(w)) { on = false; continue; }
        const q = project(w); if (!q) { on = false; continue; } on ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); on = true; } g.stroke(); };
    fronts.forEach(f => line(f.pts, f.col, 2));
    // 嵐 → いる所の大円
    const D = angDist(G.storm, G.obs), az = bearing(G.storm, G.obs), path = []; for (let k = 0; k <= 60; k++) path.push(dest(G.storm, az, D * k / 60));
    g.setLineDash([5, 5]); line(path, 'rgba(255,255,255,.6)', 1.2); g.setLineDash([]);
    for (const [ll, col, text] of labels) { const w = toWorld(ecef(ll.lat, ll.lon), 2000); if (!vis(w)) continue; const q = project(w); if (!q) continue;
      g.fillStyle = col; g.beginPath(); g.arc(q[0], q[1], 5, 0, 7); g.fill(); g.font = '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-body');
      g.textAlign = 'left'; const tw = g.measureText(text).width; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(q[0] + 8, q[1] - 13, tw + 8, 17); g.fillStyle = '#fff'; g.fillText(text, q[0] + 12, q[1]); }
  }
  // うねりの前の面（周期 T 秒、嵐の中心から角度 δ）。陸に当たった向きは切る
  function front(delta) { const pts = []; if (!(delta > 0) || delta >= Math.PI) return pts;
    for (let a = 0; a <= 360; a += 3) { const az = a * D2R; pts.push(delta < blockAt(az) ? dest(G.storm, az, delta) : null); } return pts; }
  function texture() { // 地球儀のシェーダー用（Float32、360×181）
    const f = new Float32Array(360 * 181); if (elev) for (let i = 0; i < f.length; i++) f[i] = elev[i]; return f; }
  return { Re, G, load, height, isSea, ecef, toWorld, worldToEcef, angDist, bearing, pathClear, swellAngle, pick, drawOverlay, front, moved, texture, frame };
})();
