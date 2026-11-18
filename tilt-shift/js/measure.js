// ジオラマに見えるわけ — 目がどのくらいの大きさの模型と受けとるかの計算（Held ほか 2010）
// b = A·|1/z0 − 1/z|（b: ぼけの角度、A: 目のひとみの口径 4.6 mm）。町を s 倍に縮めた模型なら b = (A/s)·|1/Z0 − 1/Z|。
// 小さな絵（64×40）に距離を書き出して読みもどし、点ごとの b と |1/Z0 − 1/Z| を原点を通る直線で合わせて s を出す。
// 呼ぶのは設定やカメラが変わったときだけ（毎コマではない）。
'use strict';
const Measure = (() => {
  const GW = 64, GH = 40, A = 0.0046, ZMAX = 2500;
  let rt, mat, buf, Zs = new Float32Array(GW * GH);

  function init() {
    rt = new THREE.WebGLRenderTarget(GW, GH);
    mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    buf = new Uint8Array(GW * GH * 4);
  }
  // 距離の格子を読む（町の本当の距離。カメラが変わったときだけ）
  function readDepth(renderer, scene, camera) {
    const bg = scene.background, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    scene.background = null; scene.overrideMaterial = mat; renderer.setClearColor(0xffffff, 1);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, GW, GH, buf);
    renderer.setRenderTarget(null); scene.overrideMaterial = null; scene.background = bg; renderer.setClearColor(cc, ca);
    const n = camera.near, f = camera.far;
    for (let k = 0; k < GW * GH; k++) {
      Zs[k] = depthToDist(unpack(buf[4 * k], buf[4 * k + 1], buf[4 * k + 2], buf[4 * k + 3]), n, f);
    }
    return Zs;
  }
  // three.js r128 の packDepthToRGBA の逆（unpackRGBAToDepth と同じ: Σ byte/255 · (255/256)/F）
  function unpack(r, g, b, a) { return (r / 16777216 + g / 65536 + b / 256 + a) / 256; }
  function depthToDist(d, n, f) { return d >= 0.9999 ? Infinity : (n * f) / (f - (f - n) * d); }

  // 格子の点 (i,j) の絵の座標
  const uvOf = k => [((k % GW) + 0.5) / GW, (((k / GW) | 0) + 0.5) / GH];
  function zAt(u, v) { const i = Math.min(GW - 1, Math.max(0, (u * GW) | 0)), j = Math.min(GH - 1, Math.max(0, (v * GH) | 0)); return Zs[j * GW + i]; }

  // ピントの距離 z0（奥行きモード）: 帯の中心の点。空なら近くの地面
  function focusDist(P) {
    for (let dv = 0; dv < 0.5; dv += 1 / GH) { const z = zAt(0.5, P.pos - dv); if (z < ZMAX) return z; }
    return 600;
  }

  // 原点を通る直線 b = k·d に合わせる。合い方 = 1 − Σ(b − k·d)² / Σ(b − b の平均)²（ぼけの場所によるちがいを式がどれだけ説明するか）
  function fitAt(pts, Z0, toRad) {
    let sbd = 0, sdd = 0, sbb = 0, sb = 0;
    for (const p of pts) { const b = p.r * toRad, d = Math.abs(1 / Z0 - 1 / p.z); sbd += b * d; sdd += d * d; sbb += b * b; sb += b; }
    const n = pts.length, sst = sbb - sb * sb / n;   // b のばらつき
    if (!(sdd > 0) || !(sst > 0) || !(sbd > 0)) return null;
    const k = sbd / sdd;
    return { k, fit: Math.max(0, 1 - (sbb - k * sbd) / sst) };   // Σ(b−kd)² = Σb² − k·Σbd（k が最小二乗のとき）。b のばらつきのうち式で説明できる割合
  }
  // P: 今の設定（mode, R, pos, halfW, ang, aspect, z0, kf）、viewY: 絵を見るときのたての画角（ラジアン）
  function fit(P, viewY) {
    const pts = [];
    for (let k = 0; k < GW * GH; k++) {
      const z = Zs[k]; if (!(z < ZMAX)) continue;
      const [u, v] = uvOf(k);
      const r = P.mode === 1 ? Blur.cocBand(u, v, P) : P.mode === 2 ? Blur.cocDepth(z, P) : 0;
      if (P.mode === 2 && r >= Blur.CMAX * 0.999) continue;   // 描けるぼけの上限に張りついた所（とても近い所）は、ぼけが式どおりでないので外す
      pts.push({ z, r });
    }
    if (pts.length < 20) return { ok: false, why: 'sky' };
    const toRad = 2 * 2 * Math.tan(viewY / 2);   // 半径（高さの割合）→ 直径の角度
    if (Math.max(...pts.map(p => p.r)) * toRad < 1e-4) return { ok: true, blur: false, Z0: P.z0 };
    // Z0（ピントの距離）: 奥行きモードは決まっている。帯モードは、ぼけのない点の距離のうち、いちばんよく合うもの
    let best = null, Z0 = P.z0;
    const cands = P.mode === 2 ? [P.z0] : (() => {
      const sh = pts.filter(p => p.r < 1e-4).map(p => p.z).sort((a, b) => a - b);
      if (!sh.length) return [P.z0];
      return Array.from({ length: 21 }, (_, i) => sh[Math.min(sh.length - 1, Math.round(i / 20 * (sh.length - 1)))]);
    })();
    for (const c of cands) { const f = fitAt(pts, c, toRad); if (f && (!best || f.fit > best.fit)) { best = f; Z0 = c; } }
    if (!best || !isFinite(A / best.k)) return { ok: false, why: 'nofit' };
    const s = A / best.k;
    return { ok: true, blur: true, s, Z0, eye: s * Z0, corr: best.fit, n: pts.length };
  }
  function setZs(a) { Zs.set(a); }   // 写真の場面: 推定した奥行きから作った距離の格子（photo.js）
  return { init, readDepth, setZs, focusDist, fit, A, get Zs() { return Zs; } };
})();
