// ちいさな地球 — 森（段階B）
//   自分の重さで曲がらない高さ: 太さ D の一様な柱が自重で曲がる長さ L = (7.837 EI/(ρgA))^(1/3) ＝ 0.788 (E D²/(ρg))^(1/3)
//     （Greenhill 1881。木への当てはめは McMahon 1973）。重力が弱いほど g^(-1/3) で高くなれる
//   水を吸い上げる: 重力のぶんの水の引っぱりは ρ_w g（地球で 0.0098 MPa/m）。地球の木の高さの限界 122〜130 m（Koch ほか 2004）は
//     この重力のぶんと管の摩擦のぶんで決まる。重力が弱いと重力のぶんはほぼなくなる（摩擦のぶんは測られていないので、新しい限界は出さない）
//   葉が落ちる速さ: 空気の抵抗と重さのつりあい v = √(2 m_a g /(ρ C_D))（m_a 葉の面積あたりの重さ 0.1 kg/m²、C_D 1。どちらも推定）
'use strict';
const FOREST = (() => {
  const E = 1.0e10, RHO = 800, D = 0.6;           // 生木のヤング率・密度・幹の太さ（どれも推定のおおよその値）
  const MA = 0.1, CDL = 1.0;                      // 葉の面積あたりの重さ kg/m²・抗力係数（推定）
  const st = { H: 30 };                           // 木の高さ（ためしに変えられる）
  function buckle(g, d = D) { return 0.788 * Math.cbrt(E * d * d / (RHO * g)); }
  function leafV(g) { return Math.sqrt(2 * MA * g / (PHYS.RHO_A * CDL)); }
  function facts(P, U) {
    const gE = 9.80665, hb = buckle(P.g), hbE = buckle(gE), v = leafV(P.g), vE = leafV(gE), tf = st.H / v;
    return { hb, hbE, v, vE, tf, drift: (U || 0) * tf, pw: PHYS.RHO_W * P.g / 1e6, pwE: PHYS.RHO_W * gE / 1e6 };
  }

  // ---------- 落ち葉の粒（星の時間で動く） ----------
  // 木の上の方（高さの 50〜95%）から離れ、落ちる速さ v で下がりながら、風（殻の中の空気の流れ）に運ばれる。地面に着いたら少しのあいだ残る
  let pts = null, L = null;
  const N = 2500;
  function init(planet) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
    pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true }));
    pts.frustumCulled = false; planet.add(pts);
    L = { p: new Float32Array(N * 3), y: new Float32Array(N), c: new Int32Array(N), life: new Float32Array(N), on: new Uint8Array(N), col: new Float32Array(N * 3), next: 0, rate: 0 };
  }
  // 木 trees（{p:[x,y,z], c, h} の配列）から n 枚
  function release(trees, n) {
    if (!L || !trees.length) return;
    for (let k = 0; k < n; k++) {
      const t = trees[Math.floor(Math.random() * trees.length)], j = L.next; L.next = (L.next + 1) % N;
      L.p.set(t.p, j * 3); L.c[j] = t.c; L.y[j] = t.h * (0.5 + 0.45 * Math.random()); L.on[j] = 1; L.life[j] = 0;
      const a = Math.random(); L.col.set(a < 0.4 ? [0.35, 0.6, 0.25] : a < 0.75 ? [0.85, 0.65, 0.2] : [0.8, 0.35, 0.15], j * 3);   // 緑・黄・赤
    }
  }
  // 星の時間 dt だけ進める
  function step(dt, O, trees, show, life) {
    if (!L) return;
    pts.visible = show;
    if (!show) return;
    const R = O.R, v = leafV(O.P.g), W = O.wind;
    // ふだんも少しずつ落ちる（見た目のための速さ: 木 1000 本あたり 1 時間に 20 枚）
    L.rate += dt * trees.length / 1000 * 20 / 3600;
    if (L.rate >= 1) { const n = Math.floor(L.rate); L.rate -= n; release(trees, Math.min(n, 200)); }
    for (let j = 0; j < N; j++) {
      if (!L.on[j]) continue;
      const i3 = j * 3;
      if (L.y[j] > 0) {
        const d = Math.min(dt, L.y[j] / v);
        L.y[j] -= v * d;
        // 風: 軸 a のまわり U·(a×p)。球の上を動かす
        let px = L.p[i3], py = L.p[i3 + 1], pz = L.p[i3 + 2];
        const wx = W.U * (W.ay * pz - W.az * py), wy = W.U * (W.az * px - W.ax * pz), wz = W.U * (W.ax * py - W.ay * px);
        px += wx * d / R; py += wy * d / R; pz += wz * d / R;
        const l = Math.sqrt(px * px + py * py + pz * pz); L.p[i3] = px / l; L.p[i3 + 1] = py / l; L.p[i3 + 2] = pz / l;
        if (W.U) L.c[j] = LIFE.cellNear(life, L.c[j], L.p[i3], L.p[i3 + 1], L.p[i3 + 2]);
      } else { L.life[j] += dt; if (L.life[j] > 6 * 3600) L.on[j] = 0; }   // 地面で 6 時間たったら消す
    }
  }
  function draw(O) {
    if (!L || !pts.visible) return;
    const pa = pts.geometry.attributes.position.array, ca = pts.geometry.attributes.color.array, R = O.R;
    for (let j = 0; j < N; j++) {
      const i3 = j * 3;
      if (!L.on[j]) { ca[i3] = ca[i3 + 1] = ca[i3 + 2] = 0; pa[i3] = pa[i3 + 1] = pa[i3 + 2] = 0; continue; }
      const r = VIEW.groundR(L.c[j], L.p[i3], L.p[i3 + 1], L.p[i3 + 2]) + Math.max(0, L.y[j]) / R + 0.0005;
      pa[i3] = L.p[i3] * r; pa[i3 + 1] = L.p[i3 + 1] * r; pa[i3 + 2] = L.p[i3 + 2] * r;
      const f = L.y[j] > 0 ? 1 : 0.6; ca[i3] = L.col[i3] * f; ca[i3 + 1] = L.col[i3 + 1] * f; ca[i3 + 2] = L.col[i3 + 2] * f;
    }
    pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true;
  }
  function clear() { if (L) L.on.fill(0); }
  return { st, D, buckle, leafV, facts, init, release, step, draw, clear };
})();
