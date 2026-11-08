// 1周ごとの印（ジッターとシマーのもと）。波形どうしを重ねて次の周期を探す（Praat の「cc」と同じ考え方を自分で実装）
// 定義は Praat のマニュアル Voice 2. Jitter / Voice 3. Shimmer / PointProcess: Get jitter (local)
import { frameTime } from './pitch.js';

const MAX_PERIOD_FACTOR = 1.3, MAX_AMP_FACTOR = 1.6; // となりどうしの比がこれをこえる組は数えない

function cubicPeak(a, b, c) { // 放物線の頂点のずれ
  const d = a - 2 * b + c;
  return d < -1e-12 ? 0.5 * (a - c) / d : 0;
}

// x の i 付近を長さ L で正規化相互相関
function ncc(x, i, j, L) {
  let ab = 0, aa = 0, bb = 0;
  for (let k = 0; k < L; k++) { const a = x[i + k] || 0, b = x[j + k] || 0; ab += a * b; aa += a * a; bb += b * b; }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

// ある声の区間の周期の印（秒の配列）と振幅。hi は高い標本化周波数の信号
export function pulsesInRun(hi, sr, trk, fa, fb) {
  const f0At = t => { // 時刻 → その時の周期
    const f = Math.max(fa, Math.min(fb - 1, Math.round((t - trk.winSec / 2) / trk.hop)));
    return trk.f0[f] > 0 ? trk.f0[f] : 0;
  };
  const t0 = frameTime(trk, fa), t1 = frameTime(trk, fb - 1);
  const f00 = f0At(t0);
  if (!f00) return { t: [], amp: [] };
  // はじめの印: 最初の1周の中でいちばん大きい山
  let i = Math.round(t0 * sr), best = -1, bi = i;
  const T0 = Math.round(sr / f00);
  for (let k = 0; k < T0; k++) { const v = Math.abs(hi[i + k] || 0); if (v > best) { best = v; bi = i + k; } }
  const sign = (hi[bi] || 0) >= 0 ? 1 : -1;
  // 相関で見つけた場所の近くの、同じ向きの頂点へ合わせる。相関の窓は前後の周期がまざって平均になるため、印は波形の頂点に置く
  const snap = (c, T) => {
    // いちばん高い山ではなく、いちばん近い山にする（響きのさざ波の高さが似ていると、高い山を選ぶと隣へとぶ）
    const v = k => sign * (hi[k] || 0), c0 = Math.round(c), reach = Math.ceil(0.12 * T);
    let k0 = c0, found = false;
    for (let d = 0; d <= reach && !found; d++) for (const k of d ? [c0 - d, c0 + d] : [c0]) if (v(k) > 0 && v(k) >= v(k - 1) && v(k) > v(k + 1)) { k0 = k; found = true; break; }
    return k0 + cubicPeak(v(k0 - 1), v(k0), v(k0 + 1));
  };
  let pos = snap(bi, T0);
  const marks = [pos];
  while (pos / sr < t1) {
    const f = f0At(pos / sr);
    if (!f) break;
    const T = sr / f, lo = Math.floor(T * 0.8), up = Math.ceil(T * 1.25), L = Math.round(T);
    const start = Math.round(pos - L / 2);
    const r = new Float64Array(up + 2);
    let bl = -1, bv = -Infinity;
    for (let lag = lo - 1; lag <= up + 1; lag++) r[lag] = ncc(hi, start, start + lag, L);
    for (let lag = lo; lag <= up; lag++) if (r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > bv) { bv = r[lag]; bl = lag; }
    if (bl < 0 || bv < 0.5) break;
    // 2段階: 1周ぶんの相関でおおよその次の周期 → 印のまわりだけの短い窓で細かく（長い窓のままだと前後の周期が平均される）
    const coarse = bl + cubicPeak(r[bl - 1], r[bl], r[bl + 1]);
    const W = Math.round(0.3 * T), st = Math.round(pos - W / 2), a = Math.round(coarse - 0.1 * T), b = Math.round(coarse + 0.1 * T);
    const q = new Float64Array(b + 2);
    let fl = Math.round(coarse), fv = -Infinity;
    for (let lag = a - 1; lag <= b + 1; lag++) q[lag] = ncc(hi, st, st + lag, W);
    for (let lag = a; lag <= b; lag++) if (q[lag] > fv && q[lag] >= q[lag - 1] && q[lag] >= q[lag + 1]) { fv = q[lag]; fl = lag; }
    pos += fv > -Infinity ? fl + cubicPeak(q[fl - 1], q[fl], q[fl + 1]) : coarse;
    marks.push(pos);
    if (marks.length > 20000) break;
  }
  // 振幅: 印の位置の山の高さ（放物線で頂点を補う）
  const amp = marks.map(m => {
    const o = Math.round(snap(m, sr / f00)), p = sign * (hi[o - 1] || 0), q = sign * (hi[o] || 0), s = sign * (hi[o + 1] || 0);
    return q - 0.25 * (p - s) * cubicPeak(p, q, s);
  });
  return { t: marks.map(p => p / sr), amp };
}

// 印の列からジッターとシマー。とびぬけた組（1.3 倍・1.6 倍をこえる）は Praat と同じく数えない
export function perturbation(pulses, floorHz, ceilHz) {
  const T = [], A = [];
  const pMin = 0.8 / ceilHz, pMax = 1.25 / floorHz;
  for (let i = 0; i + 1 < pulses.t.length; i++) { T.push(pulses.t[i + 1] - pulses.t[i]); A.push(pulses.amp[i]); }
  const okT = v => v >= pMin && v <= pMax;
  let sumT = 0, nT = 0;
  for (const v of T) if (okT(v)) { sumT += v; nT++; }
  if (nT < 10) return null;
  const meanT = sumT / nT;
  let dT = 0, nd = 0, rap = 0, nrap = 0;
  for (let i = 1; i < T.length; i++) {
    if (!okT(T[i]) || !okT(T[i - 1]) || Math.max(T[i] / T[i - 1], T[i - 1] / T[i]) > MAX_PERIOD_FACTOR) continue;
    dT += Math.abs(T[i] - T[i - 1]); nd++;
    if (i + 1 < T.length && okT(T[i + 1]) && Math.max(T[i + 1] / T[i], T[i] / T[i + 1]) <= MAX_PERIOD_FACTOR) { rap += Math.abs(T[i] - (T[i - 1] + T[i] + T[i + 1]) / 3); nrap++; }
  }
  let dA = 0, dBs = 0, na = 0, sumA = 0, nA = 0, apq3 = 0, nq = 0;
  for (let i = 0; i < A.length; i++) if (okT(T[i]) && A[i] > 0) { sumA += A[i]; nA++; }
  const meanA = sumA / (nA || 1);
  for (let i = 1; i < A.length; i++) {
    if (!(A[i] > 0 && A[i - 1] > 0) || !okT(T[i]) || !okT(T[i - 1]) || Math.max(A[i] / A[i - 1], A[i - 1] / A[i]) > MAX_AMP_FACTOR) continue;
    dA += Math.abs(A[i] - A[i - 1]); dBs += Math.abs(20 * Math.log10(A[i] / A[i - 1])); na++;
    if (i + 1 < A.length && A[i + 1] > 0 && Math.max(A[i + 1] / A[i], A[i] / A[i + 1]) <= MAX_AMP_FACTOR) { apq3 += Math.abs(A[i] - (A[i - 1] + A[i] + A[i + 1]) / 3); nq++; }
  }
  return {
    n: nT, meanT,
    jitterLocal: nd ? 100 * (dT / nd) / meanT : NaN,
    jitterRap: nrap ? 100 * (rap / nrap) / meanT : NaN,
    shimmerLocal: na ? 100 * (dA / na) / meanA : NaN,
    shimmerDb: na ? dBs / na : NaN,
    shimmerApq3: nq ? 100 * (apq3 / nq) / meanA : NaN,
    T, A,
  };
}
