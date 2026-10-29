// 帆船が風で進むしくみ — 力の表（tools/build-table.py が Python-VPP の式そのもので作った表）を引く
// 表: 風速 TWS（kt）× 本当の風の角度 TWA（°）× 船の速さ V（kt）ごとに、つりあいの中でいちばん前へ進む調整をしたときの
//   fnet 前へ進む力の余り（帆の駆動力 − 船体の抵抗, N）・lift／drag 帆の揚力／抗力（N）・heel 傾き（°）・leeway 横流れ（°）
//   keel キールと船体の横の力（N）・awa／aws 帆の高さの見かけの風（°, m/s）・ok（1 = 横の力もつりあう、0 = 遅くて横へ流される）
'use strict';
const KN = 0.5144;   // 1 ノット = 0.5144 m/s

function makeTable(meta, buffers) {
  const T = { meta, modes: {} };
  const nTws = meta.tws_kn.length, nTwa = meta.twa.length, nV = meta.v_kn.length, nC = meta.channels.length;
  for (const m of Object.keys(buffers)) T.modes[m] = { q: new Int16Array(buffers[m]), scale: meta.scale[m] };
  const idx = (arr, x) => {   // 等間隔の格子での位置（はしで止める）
    const d = arr[1] - arr[0], f = Math.max(0, Math.min(arr.length - 1 - 1e-9, (x - arr[0]) / d));
    const i = Math.floor(f); return [i, f - i];
  };
  // 3つの軸で線形に補間して、全部のチャンネルを返す
  T.lookup = function (mode, twsKn, twaDeg, vKn) {
    const M = T.modes[mode], out = {};
    const [i, fi] = idx(meta.tws_kn, twsKn), [j, fj] = idx(meta.twa, Math.abs(twaDeg)), [k, fk] = idx(meta.v_kn, Math.max(0, vKn));
    for (let c = 0; c < nC; c++) {
      let s = 0;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let e = 0; e < 2; e++) {
        const w = (a ? fi : 1 - fi) * (b ? fj : 1 - fj) * (e ? fk : 1 - fk);
        if (w === 0) continue;
        const ii = Math.min(nTws - 1, i + a), jj = Math.min(nTwa - 1, j + b), kk = Math.min(nV - 1, k + e);
        s += w * M.q[((ii * nTwa + jj) * nV + kk) * nC + c];
      }
      out[meta.channels[c]] = s * M.scale[c];
    }
    return out;
  };
  // つりあう速さ（前へ進む力の余りが + から − に変わる、いちばん速いところ）。進めない向きは 0
  T.steady = function (mode, twsKn, twaDeg) {
    const v = meta.v_kn; let best = 0;
    let f0 = T.lookup(mode, twsKn, twaDeg, v[0]).fnet;
    for (let k = 1; k < v.length; k++) {
      const f1 = T.lookup(mode, twsKn, twaDeg, v[k]).fnet;
      if (f0 > 0 && f1 <= 0) best = v[k - 1] + (v[k] - v[k - 1]) * f0 / (f0 - f1);
      f0 = f1;
    }
    return best;
  };
  return T;
}

async function loadTable(base) {
  const meta = await (await fetch(base + 'yd41.json')).json();
  const buffers = {};
  for (const m of ['orc', 'push']) buffers[m] = await (await fetch(base + 'yd41-' + m + '.bin')).arrayBuffer();
  return makeTable(meta, buffers);
}

if (typeof module !== 'undefined') module.exports = { makeTable, KN };
