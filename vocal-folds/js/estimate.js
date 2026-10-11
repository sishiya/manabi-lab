// 声の特徴 → 模型の設定（推定）。js/table.js の表から、特徴がいちばん近い設定を k 個さがす（近いものさがし）。
// 推定の値 = 近い k 個の重みつき平均、確かさ = k 個の値のちらばり（せまいほど確か）。
// 大きさ（マイクの感度と距離で変わる）は使わない。だから肺の圧はほぼわからないはず — それも結果として見せる。
(function (root) {
'use strict';
const FEAT = [ // 名前、表の列、重み
  { key: 'lf0', w: 3 }, { key: 'cpp', w: 1 }, { key: 'h1h2', w: 1 }, { key: 'hnr', w: 1 },
];
const PARAMS = ['act', 'ata', 'PL', 'x01'];

function prep(table, sex) {
  const C = table.cols, idx = n => C.indexOf(n);
  const rows = table.rows[sex].map(r => ({
    act: r[idx('act')], ata: r[idx('ata')], PL: r[idx('PL')], x01: r[idx('x01')],
    f0: r[idx('f0')], voiced: r[idx('voiced')], hnr: r[idx('hnr')], cpp: r[idx('cpp')], h1h2: r[idx('h1h2')], closed: r[idx('closed')],
  }));
  for (const r of rows) r.lf0 = r.f0 ? Math.log2(r.f0) : null;
  const voicedRows = rows.filter(r => r.f0 && r.voiced >= 0.5 && r.cpp != null && r.h1h2 != null && r.hnr != null);
  const sd = {};
  for (const f of FEAT) {
    const v = voicedRows.map(r => r[f.key]); const m = v.reduce((a, b) => a + b, 0) / v.length;
    sd[f.key] = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length) || 1;
  }
  return { rows, voicedRows, sd, grid: table.grid };
}

function estimate(T, feat, k) {
  k = k || 10;
  if (!feat || feat.silent) return { ok: false, reason: 'silent' };
  if (!(feat.voiced >= 0.3) || !feat.f0) {
    // 声帯が震えていない（ささやき・息だけ）。表の中の「震えていない」設定の割合だけ見せる
    const un = T.rows.filter(r => !r.f0 || r.voiced < 0.3);
    return { ok: true, vibrating: false, nUnvoiced: un.length, nAll: T.rows.length };
  }
  const q = { lf0: Math.log2(feat.f0), cpp: feat.cpp, h1h2: feat.h1h2, hnr: feat.hnr };
  const scored = [];
  for (const r of T.voicedRows) {
    let d = 0;
    for (const f of FEAT) { if (q[f.key] == null) continue; const z = (r[f.key] - q[f.key]) / T.sd[f.key]; d += f.w * z * z; }
    scored.push({ r, d: Math.sqrt(d) });
  }
  scored.sort((a, b) => a.d - b.d);
  const nn = scored.slice(0, k);
  const out = { ok: true, vibrating: true, nearest: nn[0].r, dist: nn[0].d, neighbors: nn.map(s => s.r), params: {} };
  const wsum = nn.reduce((a, s) => a + 1 / (s.d + 0.05), 0);
  for (const p of PARAMS) {
    const vals = nn.map(s => s.r[p]); const g = T.grid[p];
    const span = g[g.length - 1] - g[0];
    const mean = nn.reduce((a, s) => a + s.r[p] / (s.d + 0.05), 0) / wsum;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const width = span ? (hi - lo) / span : 0;
    out.params[p] = { mean, lo, hi, width, conf: width <= 0.2 ? 'high' : width <= 0.5 ? 'mid' : 'low' };
  }
  // 閉じている時間の割合（模型の中の値。近い設定の平均）
  out.closed = nn.reduce((a, s) => a + (s.r.closed || 0) / (s.d + 0.05), 0) / wsum;
  return out;
}

const api = { prep, estimate, PARAMS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VoiceEstimate = api;
})(typeof self !== 'undefined' ? self : this);
