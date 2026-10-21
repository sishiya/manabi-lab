// 波が育つまで — 浜を 3D で（浅い海）。浜への断面の計算（js/beach.js: 線形の浅水変形・McCowan・Miche）を、海岸と直角の向き x の 1 本の線にして、
// 3D の海の大きな水面（ocean.js の big）として足す。浅い所で山がとがるのはストークスの 2 次の波（有限の水深）。砕けたあとは高さ = 0.78 h、泡を出す。
// 世界の座標: カメラの立つ所（浜、岸から 12 m 陸の上）が原点。−x = 沖、+x = 陸。海岸は z の向きにまっすぐ（仮定）。
'use strict';
window.WGbeach3d = (() => {
  const N = 4096, G = 9.81;
  const B = { eta: new Float32Array(N), slope: new Float32Array(N), depth: new Float32Array(N), foam: new Float32Array(N), L: 1, R: 1e9, x0: 0, planeY: 0, noWrap: true };
  let M = null, key = '';
  // 浜の計算を、沖へのばした 1 本の線（N 本）にしなおす
  function build(H0, T, slope) {
    const b = window.WGbeach.build(H0, T, slope), w = 2 * Math.PI / T, X = b.X;   // b.xs: 0（沖・水深 h0）→ X（岸）
    const Lsea = Math.max(1500, 2.5 * X), Lland = 400, L = Lsea + Lland, dx = L / N, xShore = Lsea;   // 線の上の座標 s: 0 = 沖のはし、xShore = 岸
    const dep = new Float32Array(N), A = new Float32Array(N), ph = new Float32Array(N), kk = new Float32Array(N), brk = new Uint8Array(N);
    const k0 = w * w / G; let phase = 0;
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) * dx, xb = s - (xShore - X);   // 浜の計算の x（0 = 坂のはじまり）
      if (xb <= 0) { dep[i] = b.h0; A[i] = H0 / 2 * Math.min(1, s / (0.15 * Lsea)); kk[i] = window.WGbeach.kOf(w, b.h0); }   // 沖のはしの近くは波をなだらかに 0 に（その先はくり返さないため）
      else if (xb < X) { const j = Math.min(b.xs.length - 1, Math.round(xb / X * (b.xs.length - 1))); dep[i] = Math.max(0, b.hs[j]); A[i] = b.Hs[j] / 2; kk[i] = window.WGbeach.kOf(w, Math.max(dep[i], 0.02)); brk[i] = b.brk && j >= b.brk.i ? 1 : 0; }
      else { dep[i] = 0; A[i] = 0; kk[i] = kk[i - 1] || k0; }
      if (i) phase += kk[i] * dx; ph[i] = phase;
    }
    const land = new Float32Array(N); for (let i = 0; i < N; i++) { const s = (i + 0.5) * dx; land[i] = s > xShore ? (s - xShore) * slope : -dep[i]; }   // 底（陸）の高さ
    M = { w, L, dx, xShore, dep, A, ph, kk, brk, land, slope, X, brkInfo: b.brk }; B.L = L; B.x0 = xShore + 12;
    return M;
  }
  // 時刻 t の水面（水深 0 の所は水がない）
  function frame(st, t, slope) {
    const k2 = [st.Hm0.toFixed(3), st.Tp.toFixed(3), slope].join('/'); if (k2 !== key) { key = k2; build(st.Hm0, st.Tp, slope); }
    const { w, dep, A, ph, kk, brk } = M;
    for (let i = 0; i < N; i++) {
      const h = dep[i]; if (!(h > 0.01) || !(A[i] > 0)) { B.eta[i] = 0; B.depth[i] = Math.max(h, 0); B.foam[i] = 0; continue; }
      const th = ph[i] - w * t, kh = kk[i] * h, a = A[i];
      // ストークスの 2 次: η₂ = (k a²/4)·cosh(kh)(2 + cosh 2kh)/sinh³(kh)·cos 2θ（大きくなりすぎる浅い所は a/2 まで）
      const sh = Math.sinh(kh), a2 = Math.min(0.5 * a, kk[i] * a * a / 4 * Math.cosh(kh) * (2 + Math.cosh(2 * kh)) / (sh * sh * sh));
      B.eta[i] = a * Math.cos(th) + a2 * Math.cos(2 * th); B.depth[i] = h + B.eta[i];
      B.foam[i] = brk[i] ? 0.6 * Math.pow(Math.max(0, Math.cos(th - 0.5)), 6) + 0.05 : 0;   // 砕けたあと: 山の少しうしろに泡、あいだはうすく（見た目の目安）
    }
    for (let i = 0; i < N; i++) B.slope[i] = (B.eta[(i + 1) % N] - B.eta[(i - 1 + N) % N]) / (2 * M.dx);
    return B;
  }
  // 砂浜と海の底（物として描く。−x が沖）。頂点 [x,y,z, n, 色, つや・濡れやすさ]
  function sandMesh() {
    const v = [], { dx, xShore, land, slope } = M, nz = 1, Z = 3000;
    const put = (x, y, z, c) => v.push(x, y, z, 0, 1, 0, ...c, 0.2, 1, 0);   // 1 頂点 12 個（ocean.js の makeMesh。前は 11 個で、陸のほうの三角形がくずれていた）
    const step = 8;
    for (let i = 0; i + step < N; i += step) {
      const s0 = (i + 0.5) * dx, s1 = (i + step + 0.5) * dx, x0 = s0 - B.x0, x1 = s1 - B.x0, y0 = land[i], y1 = land[i + step];
      const c0 = y0 > 0.3 ? [0.82, 0.74, 0.58] : [0.62, 0.55, 0.42], c1 = y1 > 0.3 ? [0.82, 0.74, 0.58] : [0.62, 0.55, 0.42];   // 乾いた砂・ぬれた砂（見た目）
      for (const [x, y, z, c] of [[x0, y0, -Z, c0], [x1, y1, -Z, c1], [x1, y1, Z, c1], [x0, y0, -Z, c0], [x1, y1, Z, c1], [x0, y0, Z, c0]]) put(x, y, z, c);
    }
    return v;
  }
  const info = () => M;
  return { frame, sandMesh, info, B };
})();
