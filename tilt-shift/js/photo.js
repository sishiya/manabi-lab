// ジオラマに見えるわけ — 写真の場面を読む（写真・推定した奥行き・計算に使う距離の格子）
'use strict';
const Photo = (() => {
  const GW = 64, GH = 40, ZMAX = 2500, cache = {};
  const img = src => new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ng(new Error('読めない: ' + src)); i.src = src; });

  function load(sc) {
    if (cache[sc.id]) return cache[sc.id];
    return (cache[sc.id] = Promise.all([img(sc.img), img(sc.depth)]).then(([pi, di]) => {
      const tex = new THREE.Texture(pi); tex.needsUpdate = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
      const dtex = new THREE.Texture(di); dtex.needsUpdate = true;
      dtex.minFilter = dtex.magFilter = THREE.NearestFilter; dtex.generateMipmaps = false;   // R・G に分けた 16bit を混ぜないように
      // 奥行きを CPU でも読む（計算の格子と、2点の距離から α・β を決めるため）
      const c = document.createElement('canvas'); c.width = di.width; c.height = di.height;
      const g = c.getContext('2d'); g.drawImage(di, 0, 0);
      const px = g.getImageData(0, 0, di.width, di.height).data;
      const D = (u, v) => {   // u 左0→右1、v 下0→上1。まわり 5×5 の平均
        const cx = Math.round(u * (di.width - 1)), cy = Math.round((1 - v) * (di.height - 1)); let s = 0, n = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = Math.min(di.width - 1, Math.max(0, cx + dx)), y = Math.min(di.height - 1, Math.max(0, cy + dy)), k = 4 * (y * di.width + x);
          s += (px[k] * 256 + px[k + 1]) / 65535; n++;
        }
        return s / n;
      };
      // 距離の逆数 = α·D。D はいちばん遠い所（空・地平線）がほぼ 0 になるよう書き出してあるので β = 0（D = 0 は無限に遠い）と置き、
      // α を見当の2点から最小二乗で決める（β まで2点で決めると、見当の誤差で空が数百 m 先の物になってしまう）
      let sDz = 0, sDD = 0;
      for (const [u, v, z] of sc.anchors) { const d = D(u, v); sDz += d / z; sDD += d * d; }
      const alpha = sDz / sDD, beta = 0;
      const zs = new Float32Array(GW * GH);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const iz = alpha * D((i + 0.5) / GW, (j + 0.5) / GH) + beta;
        zs[j * GW + i] = iz > 1 / ZMAX ? 1 / iz : Infinity;   // 遠すぎる所（空・遠い山）は計算に使わない
      }
      return { tex, dtex, alpha, beta, zs };
    }));
  }
  return { load };
})();
