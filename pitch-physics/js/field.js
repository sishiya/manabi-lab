// 変化球のしくみ — 3D の手前の地面（ホームのまわりの土・白線・ホームベース・マウンド）
// 寸法は公認野球規則の図のおおよそ（土の円 直径 26 ft、バッターボックス 4 × 6 ft・ベースから 6 in、線の幅 3 in、マウンド 直径 18 ft・高さ 10 in）
'use strict';

function seededRnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

// 土の絵: やわらかいまだら・細かい粒（どちらもうすく）・ふちは芝へなめらかに消える
function dirtCanvas(px, rMeters, draw) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d'), rnd = seededRnd(29), s = px / (2 * rMeters);
  g.fillStyle = '#b5825a'; g.fillRect(0, 0, px, px);
  for (let i = 0; i < 70; i++) {          // 大きなまだら
    const x = rnd() * px, y = rnd() * px, r = (0.3 + rnd() * 0.9) * s, dk = rnd() < 0.5;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dk ? 'rgba(120,80,48,.16)' : 'rgba(214,170,128,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < px * 18; i++) {     // 細かい粒（ごくうすく）
    const v = rnd() < 0.5 ? 'rgba(90,60,35,.10)' : 'rgba(235,205,170,.10)';
    g.fillStyle = v; g.fillRect(rnd() * px, rnd() * px, 1.5, 1.5);
  }
  if (draw) draw(g, s, px);
  // ふちを芝へなめらかに（外側 6% で消える）
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(px / 2, px / 2, px / 2 * 0.90, px / 2, px / 2, px / 2);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, px, px);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}

function buildField(fg) {
  const IN = 0.0254, FT = 0.3048;
  // ---- ホームのまわりの土（直径 26 ft）。中心はホームベースのまん中 ----
  const R = 13 * FT, yc = PHY.plateY / 2 + 0.05;
  const tex = dirtCanvas(1536, R, (g, s, px) => {
    const X = x => px / 2 + x * s, Y = y => px / 2 - (y - yc) * s;   // 世界 (x, y) → 絵の上の位置（上 = 投手の側）
    // バッターが足を掘る所（少し暗い）
    for (const sx of [-1, 1]) {
      const cx = sx * (8.5 * IN + 6 * IN + 2 * FT), cy = PHY.plateY / 2;
      const gr = g.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), 1.1 * s);
      gr.addColorStop(0, 'rgba(110,72,44,.30)'); gr.addColorStop(1, 'rgba(110,72,44,0)');
      g.fillStyle = gr; g.fillRect(X(cx) - 1.2 * s, Y(cy) - 1.2 * s, 2.4 * s, 2.4 * s);
    }
    // 白線（幅 3 in）
    g.strokeStyle = 'rgba(246,244,236,.95)'; g.lineWidth = 3 * IN * s; g.lineJoin = 'miter';
    const boxIn = 8.5 * IN + 6 * IN, boxW = 4 * FT, boxL = 6 * FT, cy = PHY.plateY / 2;
    for (const sx of [-1, 1]) {
      const x0 = sx * boxIn, x1 = sx * (boxIn + boxW), y0 = cy - boxL / 2, y1 = cy + boxL / 2;
      g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y0)); g.lineTo(X(x1), Y(y1)); g.lineTo(X(x0), Y(y1)); g.closePath(); g.stroke();
      // ファウルライン（ボックスの前の外の角から、45° に外へ）
      g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x1 + sx * 3), Y(y1 + 3)); g.stroke();
      // キャッチャーズボックス（幅 43 in・後ろへ 8 ft）
      const cxw = sx * 21.5 * IN;
      g.beginPath(); g.moveTo(X(cxw), Y(y0)); g.lineTo(X(cxw), Y(y0 - 8 * FT + boxL / 2)); g.stroke();
    }
  });
  const home = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
  home.rotation.x = -Math.PI / 2; home.position.set(0, 0.004, -yc); home.renderOrder = -1; fg.add(home);
  // ---- ホームベース（白いゴム。厚み 2 cm、まわりに黒いふち）----
  const w = 8.5 * IN, sh = new THREE.Shape();
  sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, -w); sh.lineTo(0, -2 * w); sh.lineTo(-w, -w); sh.closePath();
  const plateG = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2 });
  const plate = new THREE.Mesh(plateG, new THREE.MeshLambertMaterial({ color: '#f6f6f2' }));
  plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.0, -PHY.plateY); fg.add(plate);
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: '#1e1e1e' }));
  edge.rotation.x = -Math.PI / 2; edge.scale.set(1.07, 1.07, 1); edge.position.set(0, 0.006, -PHY.plateY + 0.012); fg.add(edge);
  // ---- マウンド（直径 18 ft・高さ 10 in。中心は投手板の 18 in 前。上はゆるく平ら、まわりはなめらかに下がる）----
  const MR = 9 * FT, H = 10 * IN, prof = [];
  for (let i = 0; i <= 24; i++) {
    const r = i / 24 * MR, f = r < 0.5 ? 1 : Math.max(0, 1 - Math.pow((r - 0.5) / (MR - 0.5), 1.15));
    prof.push(new THREE.Vector2(Math.max(0.001, r), H * (0.5 - 0.5 * Math.cos(Math.PI * f))));
  }
  const lg = new THREE.LatheGeometry(prof.reverse(), 64);
  // 上から見た位置で絵を貼る
  const pos = lg.attributes.position, uv = lg.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * MR) + 0.5, -pos.getZ(i) / (2 * MR) + 0.5);
  const mtex = dirtCanvas(1024, MR, (g, s, px) => {
    // 踏み出す所（前）と投手板のまわりを少し暗く
    for (const [y, r] of [[-1.5, 0.7], [0.45, 0.6]]) {
      const cx = px / 2, cy = px / 2 - y * s, gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * s);
      gr.addColorStop(0, 'rgba(105,70,42,.32)'); gr.addColorStop(1, 'rgba(105,70,42,0)');
      g.fillStyle = gr; g.fillRect(cx - r * s, cy - r * s, 2 * r * s, 2 * r * s);
    }
  });
  const mound = new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ map: mtex, transparent: true }));
  mound.position.set(0, 0, -(PHY.rubberY - 18 * IN)); fg.add(mound);
  const rub = new THREE.Mesh(new THREE.BoxGeometry(24 * IN, 0.03, 6 * IN), new THREE.MeshLambertMaterial({ color: '#f6f6f2' }));
  rub.position.set(0, H + 0.005, -PHY.rubberY); fg.add(rub);
}
