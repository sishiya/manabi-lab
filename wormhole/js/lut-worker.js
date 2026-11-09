// 再生の範囲の光の表（粗いもの）を裏で先に作る。1 枚できるごとに返す（lutcache.js が受ける）
'use strict';
self.window = self;
importScripts('metric.js?v=8', 'lut.js?v=8');

onmessage = e => {
  const { id, a, W, ls, have } = e.data, S = makeShape(a, W);
  for (let j = ls.length - 1; j >= 0; j--) {   // 再生は遠くから始まるので、遠い方から
    if (have[j]) continue;
    const data = new Float32Array(LUT_N * 2);
    buildLUT(S, -ls[j], data, true);
    postMessage({ id, j, data }, [data.buffer]);
  }
};
