// ちいさな地球 — 生きものの描画（種類ごとに箱を組んだ形の InstancedMesh）。見やすく DRAW 倍の大きさで描く（画面に書く）
'use strict';
const LVIEW = (() => {
  let DRAW = 20;   // そばで見るときは 1（本当の大きさ）
  let meshes = [], L = null;
  // 形: [幅, 高さ, 奥行き, x, y, z, 色の倍率]（体の長さ 1、+z が前、+y が上、足もとが原点）
  const SHAPE = {
    deer: [[0.24, 0.3, 0.6, 0, 0.55, 0, 1], [0.14, 0.14, 0.22, 0, 0.8, 0.36, 1.05], [0.06, 0.4, 0.06, 0.08, 0.2, 0.22, 0.8], [0.06, 0.4, 0.06, -0.08, 0.2, 0.22, 0.8], [0.06, 0.4, 0.06, 0.08, 0.2, -0.22, 0.8], [0.06, 0.4, 0.06, -0.08, 0.2, -0.22, 0.8], [0.03, 0.16, 0.03, 0.05, 0.95, 0.4, 0.7], [0.03, 0.16, 0.03, -0.05, 0.95, 0.4, 0.7]],
    rabbit: [[0.4, 0.38, 0.6, 0, 0.22, 0, 1], [0.3, 0.28, 0.3, 0, 0.42, 0.32, 1.03], [0.07, 0.3, 0.05, 0.07, 0.68, 0.3, 1.05], [0.07, 0.3, 0.05, -0.07, 0.68, 0.3, 1.05], [0.15, 0.15, 0.12, 0, 0.25, -0.34, 1.1]],
    bird: [[0.3, 0.3, 0.7, 0, 0.3, 0, 1], [1.3, 0.04, 0.35, 0, 0.36, 0, 0.85], [0.18, 0.18, 0.2, 0, 0.42, 0.38, 1.05], [0.25, 0.04, 0.25, 0, 0.32, -0.42, 0.85]],
    fish: [[0.16, 0.3, 0.8, 0, 0, 0, 1], [0.04, 0.26, 0.2, 0, 0, -0.48, 0.85], [0.03, 0.12, 0.2, 0, 0.18, 0, 0.9]],
    bigfish: [[0.22, 0.32, 0.8, 0, 0, 0, 1], [0.04, 0.4, 0.22, 0, 0, -0.5, 0.8], [0.03, 0.16, 0.24, 0, 0.2, -0.05, 0.85]],
  };
  function geom(id, col) {
    const pos = [], nor = [], cc = [];
    for (const [w, h, d, x, y, z, f] of SHAPE[id]) {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z);
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      for (let i = 0; i < p.length / 3; i++) cc.push(col[0] * f, col[1] * f, col[2] * f);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    return g;
  }
  function init(life) {
    L = life;
    meshes = LIFE.SP.map(sp => {
      const m = new THREE.InstancedMesh(geom(sp.id, sp.col), new THREE.MeshLambertMaterial({ vertexColors: true }), sp.n);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sp.n * 3).fill(1), 3);
      m.count = 0; m.frustumCulled = false; VIEW.planet.add(m); return m;
    });
  }
  const mt = new THREE.Matrix4(), up = new THREE.Vector3(), fw = new THREE.Vector3(), rt = new THREE.Vector3(), pos = new THREE.Vector3();
  // 毎コマ: 生きものの位置・向き・生き死に（正直モードでは honest の結果）
  function update(hon) {
    if (!L || !L.counts) return;
    const R = L.O.R, rF = VIEW.rFloor, rT = VIEW.rTop, idx = meshes.map(() => 0);
    const show = L.on && DRAW * 0.4 / R > 2e-5;
    meshes.forEach(m => { m.visible = show; });
    if (!show) return;
    L.agents.forEach((a, k) => {
      const s = a.s, m = meshes[s], sp = a.sp, j = idx[s]++;
      const h = hon ? hon.out[k] : a;
      const alive = hon ? h.alive : a.alive;
      up.set(a.p[0], a.p[1], a.p[2]);
      let r;
      if (a.air && a.X) {      // 空中: 本当の高さ（強調しない）
        const rr = Math.hypot(a.X[0], a.X[1], a.X[2]); up.set(a.X[0] / rr, a.X[1] / rr, a.X[2] / rr);
        r = rF[a.c] + Math.max(0, rr - R - Math.max(0, L.O.z[a.c])) / R;
      } else if (sp.kind === 'sea') r = alive ? 0.5 * (rF[a.c] + rT[a.c]) : rF[a.c];
      else if (a.flyLeft > 0) r = VIEW.groundR(a.c, a.p[0], a.p[1], a.p[2]) + 20 / R;
      else r = VIEW.groundR(a.c, a.p[0], a.p[1], a.p[2]);
      if (hon && h.up) r += h.up / R;
      fw.set(a.h[0], a.h[1], a.h[2]);
      rt.crossVectors(up, fw).normalize(); fw.crossVectors(rt, up).normalize();
      const sc = sp.len * DRAW / R;
      if (alive) mt.makeBasis(rt, up, fw); else mt.makeBasis(up.clone().negate(), rt, fw);   // 死んだら横だおし
      mt.scale(pos.set(sc, sc, sc));
      pos.copy(up).multiplyScalar(r); mt.setPosition(pos);
      m.setMatrixAt(j, mt);
      const g = alive ? 1 : 0.45; m.instanceColor.setXYZ(j, g, g, alive ? 1 : 0.5);
    });
    meshes.forEach((m, s) => { m.count = idx[s]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
  }
  return { init, update, get DRAW() { return DRAW; }, set DRAW(v) { DRAW = v; } };
})();
