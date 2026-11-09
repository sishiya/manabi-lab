// フォルマント: Burg 法の LPC の根 → 経路探索で F1〜F4 に割りあてる
// 設定は Praat の To Formant (burg) のマニュアル（5 個・窓の実効 25ms＝全長 50ms のガウス形・50Hz からの +6dB/oct 強調）
// 上限の周波数は話者ごとに候補を試して一番ゆれない値を選ぶ（Escudero ほか 2009 の考え方。候補の刻みは簡単にしている）
import { resample, gaussian, burg, polyRoots, std, median } from './dsp.js';

export const CEILINGS = [4500, 5000, 5500, 6000, 6500];
const NF = 4, MAX_CAND = 6;

function candidatesAt(y, center, win, sr, ceiling) {
  const N = win.length, s0 = Math.round(center - N / 2);
  if (s0 < 0 || s0 + N >= y.length) return [];
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = y[s0 + i] * win[i];
  const a = burg(w, 10), roots = polyRoots(a), out = [];
  for (const z of roots) {
    if (z.im <= 0) continue;
    const mag = Math.hypot(z.re, z.im);
    if (mag <= 0 || mag >= 1.2) continue;
    const f = Math.atan2(z.im, z.re) * sr / (2 * Math.PI), b = -Math.log(mag) * sr / Math.PI;
    if (f > 50 && f < ceiling - 50 && b > 0) out.push({ f, b });
  }
  out.sort((p, q) => p.f - q.f);
  // 帯域幅がとても広い根は共鳴ではなくスペクトル全体の傾きを表す。F2 と F3 の間にできて F2 に誤って選ばれるので除く（残りが足りるとき）
  const narrow = out.filter(q => q.b < 500 || q.f > 3000);
  const use = narrow.length >= 3 ? narrow : out;
  return use.length > MAX_CAND ? use.slice().sort((p, q) => p.b - q.b).slice(0, MAX_CAND).sort((p, q) => p.f - q.f) : use;
}

// 候補から 4 つ（足りなければあるだけ）を順に選ぶ組
function combos(n) {
  const k = Math.min(NF, n), out = [], cur = [];
  (function rec(s) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = s; i < n; i++) { cur.push(i); rec(i + 1); cur.pop(); }
  })(0);
  return out;
}

function trackRun(cands, ceiling) {
  const refs = [1, 3, 5, 7].map(i => i * ceiling / 10);
  const lists = cands.map(c => combos(c.length)), score = [], back = [];
  const local = (c, cb) => {
    let v = 0;
    cb.forEach((ci, i) => { v += Math.abs(c[ci].f - refs[i]) / 1000 + c[ci].b / c[ci].f; });
    return v + (NF - cb.length) * 3; // 足りない分の罰
  };
  for (let t = 0; t < cands.length; t++) {
    const L = lists[t], s = new Float64Array(L.length), b = new Int32Array(L.length);
    for (let j = 0; j < L.length; j++) {
      const lc = local(cands[t], L[j]);
      if (t === 0) { s[j] = lc; continue; }
      let best = Infinity, bi = 0;
      lists[t - 1].forEach((pv, k) => {
        let v = score[t - 1][k];
        for (let i = 0; i < Math.min(pv.length, L[j].length); i++) v += Math.abs(Math.log2(cands[t][L[j][i]].f / cands[t - 1][pv[i]].f));
        if (v < best) { best = v; bi = k; }
      });
      s[j] = best + lc; b[j] = bi;
    }
    score.push(s); back.push(b);
  }
  const n = cands.length, out = new Array(n);
  let j = 0, m = Infinity;
  if (!n || !score[n - 1].length) return { path: [], cost: Infinity };
  score[n - 1].forEach((v, i) => { if (v < m) { m = v; j = i; } });
  for (let t = n - 1; t >= 0; t--) {
    out[t] = lists[t][j] ? lists[t][j].map(i => cands[t][i]) : [];
    j = back[t][j];
  }
  return { path: out, cost: m / n };
}

export function analyzeCeiling(x, fs, trk, runs, ceiling) {
  const sr = 2 * ceiling, y = resample(x, fs, sr);
  const a = Math.exp(-2 * Math.PI * 50 / sr);
  for (let i = y.length - 1; i > 0; i--) y[i] -= a * y[i - 1];
  const win = gaussian(Math.round(0.05 * sr));
  const F = NF_ARRAY(trk.n), B = NF_ARRAY(trk.n);
  for (const [s, e] of runs) {
    const cands = [], idx = [];
    for (let f = s; f < e; f++) {
      const c = candidatesAt(y, (f * trk.hop + trk.winSec / 2) * sr, win, sr, ceiling);
      if (c.length) { cands.push(c); idx.push(f); }
    }
    const { path } = trackRun(cands, ceiling);
    path.forEach((p, t) => p.forEach((q, i) => { F[i][idx[t]] = q.f; B[i][idx[t]] = q.b; }));
  }
  return { F, B, ceiling };
}
const NF_ARRAY = n => [0, 1, 2, 3].map(() => new Float64Array(n).fill(NaN));

// F1〜F3 の、となりのフレームとの変化の大きさ（対数）
function frameJumps(F) {
  const d = [];
  for (let k = 0; k < 3; k++) for (let f = 1; f < F[k].length; f++) if (Number.isFinite(F[k][f - 1]) && Number.isFinite(F[k][f])) d.push(Math.abs(Math.log(F[k][f] / F[k][f - 1])));
  return d;
}

// 話し声: となりのフレームとの変化の中央値が最小の上限を選ぶ（平均だと子音のところの飛びに引かれて低い上限へ偏る。tools/ceiling-check.mjs）。
// ただし平均の変化が一番小さい上限の 1.2 倍をこえる上限は選ばない（高すぎる上限では F3 が別の山へ飛び、誤差が桁ちがいになる）
function pickForSpeech(rs) {
  const J = rs.map(r => frameJumps(r.F)), M = J.map(d => (d.length ? d.reduce((a, b) => a + b, 0) / d.length : Infinity)), lim = 1.2 * Math.min(...M);
  let bi = 0, bs = Infinity;
  J.forEach((d, i) => { if (M[i] > lim || !d.length) return; const s = median(d); if (s < bs) { bs = s; bi = i; } });
  return rs[bi];
}

// runs: 声のある区間。one が true（同じ母音をのばした声）は F1・F2 のばらつき最小（Escudero の基準）で、
// 話し声は母音がかわるので pickForSpeech で上限を選ぶ
export function trackFormants(x, fs, trk, runs, one) {
  const rs = CEILINGS.map(c => analyzeCeiling(x, fs, trk, runs, c));
  if (!one) return pickForSpeech(rs);
  const f0Med = median(Array.from(trk.f0).filter(v => v > 0));
  let best = null, bs = Infinity, any = null, as = Infinity;
  for (const r of rs) {
    const s = std(Array.from(r.F[0]).filter(Number.isFinite).map(Math.log)) + std(Array.from(r.F[1]).filter(Number.isFinite).map(Math.log));
    if (!Number.isFinite(s)) continue;
    if (s < as) { as = s; any = r; }
    // のばす声では、ばらつきが小さくても F1 が基本周波数に張りついた上限や、F2 が母音の範囲をこえた上限は選ばない（本物の声で起きた）
    if (median(r.F[0]) < 1.25 * f0Med || median(r.F[1]) > 3500) continue;
    if (s < bs) { bs = s; best = r; }
  }
  return best || any;
}

// 一様な管とみなした声の筒の長さ（cm）: F_i = (i − 1/2)·ΔF の回帰、L = c / (2ΔF)。c = 35000 cm/s（あたたかく湿った空気）
export function vtlFromFormants(Fs) {
  let sn = 0, sd = 0;
  Fs.forEach((f, i) => { if (Number.isFinite(f)) { const k = i + 0.5; sn += f * k; sd += k * k; } });
  if (!sd) return { dF: NaN, L: NaN };
  const dF = sn / sd;
  return { dF, L: 35000 / (2 * dF) };
}
