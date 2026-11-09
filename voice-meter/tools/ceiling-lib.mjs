// ceiling-check.mjs の部品: なめらかに母音がかわる合成の話し声と、上限を選ぶ基準の候補

// 検査用の信号なので、値は「作った正解」。特定の研究の表ではない（F5 まで置く）
const V = { a: [750, 1200, 2500, 3500, 4500], i: [300, 2200, 2900, 3600, 4500], u: [350, 1300, 2300, 3400, 4500], e: [480, 1850, 2500, 3500, 4500], o: [480, 850, 2500, 3500, 4500] };
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

// real: 本物の声に近づける（高い音が弱い・母音のあいだに弱い有声子音・録音の雑音）。子音のコマは正解を null にして誤差に入れない
export function makeTalk({ scale, f0, seed, noise = 0.004, real = false }) {
  const sr = 16000, R = rng(seed), bw = [70, 100, 150, 200, 250];
  // 3 句。1 句は 7 母音を 150〜260ms でつなぐ。句のあいだは 0.2 秒の無音
  const keys = Object.keys(V), segs = []; let t = 0.15;
  const phrases = [];
  for (let p = 0; p < 3; p++) {
    const s0 = t;
    for (let i = 0; i < 7; i++) { const d = 0.15 + R() * 0.11; segs.push({ v: V[keys[Math.floor(R() * 5)]], t0: t, t1: t + d }); t += d; }
    phrases.push([s0, t]); t += 0.2;
  }
  const dur = t + 0.1, n = Math.floor(dur * sr), x = new Float32Array(n);
  const inPhrase = u => phrases.find(([a, b]) => u >= a && u < b);
  // 母音の頭 60ms を子音にする（句の最初の母音は除く）
  const consIdx = u => {
    if (!real) return -1;
    const i = segs.findIndex(s => u < s.t1);
    return i > 0 && inPhrase(u) === inPhrase(segs[i - 1].t0) && u < segs[i].t0 + 0.06 ? i : -1;
  };
  const consF = segs.map(() => [220 + R() * 100, 900 + R() * 1200, 2000 + R() * 900, 3300 + R() * 500, 4500]);
  const shape = u => {
    if (!inPhrase(u)) return null;
    const i = segs.findIndex(s => u < s.t1), s = segs[i], nx = segs[i + 1];
    // 母音の後ろ 40ms で次の母音へ（同じ句の中だけ）
    const tail = s.t1 - 0.04;
    let w = 0;
    if (nx && inPhrase(u) === inPhrase(nx.t0) && u > tail) { const q = (u - tail) / 0.04 / 2; w = 0.5 - 0.5 * Math.cos(Math.PI * q); }
    const pv = segs[i - 1];
    if (pv && inPhrase(u) === inPhrase(pv.t0) && u < s.t0 + 0.04) {
      const q = 0.5 + (u - s.t0) / 0.04 / 2, c = 0.5 - 0.5 * Math.cos(Math.PI * q);
      return s.v.map((f, k) => scale * (pv.v[k] * (1 - c) + f * c));
    }
    return s.v.map((f, k) => scale * (f * (1 - w) + (nx ? nx.v[k] : f) * w));
  };
  const truthAt = u => (consIdx(u) >= 0 || (real && consIdx(u - 0.02) >= 0) ? null : shape(u));
  const st = [0, 1, 2, 3, 4].map(() => [0, 0]);
  let phase = 0, tilt = 0, tilt2 = 0;
  for (let i = 0; i < n; i++) {
    const u = i / sr, ph = inPhrase(u);
    if (!ph) { st.forEach(q => { q[0] *= 0.95; q[1] *= 0.95; }); x[i] = (R() - 0.5) * noise * 0.2; continue; }
    const pos = (u - ph[0]) / (ph[1] - ph[0]), f = f0 * 2 ** ((3 * Math.sin(pos * 3 + seed) - 2 * pos) / 12);
    phase += f / sr;
    if (phase >= 1) phase -= 1;
    const oq = 0.6, v = phase / oq, src = phase < oq ? (2 * v - 3 * v * v) * 1.7 : 0;
    tilt = 0.75 * tilt + 0.25 * src;
    tilt2 = 0.7 * tilt2 + 0.3 * tilt;
    const ci = consIdx(u);
    const env = Math.min(1, (u - ph[0]) / 0.03, (ph[1] - u) / 0.04) * (ci >= 0 ? 0.12 : 1);
    let y = ((real ? tilt2 : tilt) + (R() - 0.5) * noise) * env;
    const F = ci >= 0 ? consF[ci].map((q, k) => (k < 4 ? q * scale : 4500 * scale)) : shape(u) || V.a;
    for (let k = 0; k < 5; k++) {
      const r = Math.exp(-Math.PI * bw[k] / sr), c = 2 * r * Math.cos(2 * Math.PI * F[k] / sr), d = -r * r, g = 1 - c - d;
      const o = g * y + c * st[k][0] + d * st[k][1];
      st[k][1] = st[k][0]; st[k][0] = o; y = o;
    }
    x[i] = y;
  }
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < n; i++) x[i] = x[i] * 0.5 / pk + (real ? (R() - 0.5) * 0.002 : 0);
  return { x, sr, truthAt };
}

// 候補の基準（小さいほど良い）。a = analyzeCeiling の結果
const finite = a => Array.from(a).filter(Number.isFinite);
function adj(a, ks, log) {
  let s = 0, n = 0;
  for (const k of ks) for (let f = 1; f < a.F[k].length; f++) {
    const p = a.F[k][f - 1], q = a.F[k][f];
    if (Number.isFinite(p) && Number.isFinite(q)) { s += log ? Math.abs(Math.log(q / p)) : Math.abs(q - p); n++; }
  }
  return n ? s / n : Infinity;
}
// 短い区間ごとに 2 次式をあてはめ、はずれの大きさ（Hz または対数）を測る（Fast Track の「なめらかさ」の考え方を区間に切ったもの）
function polyResidual(a, trk, runs, ks, chunkFrames, log) {
  let s = 0, n = 0;
  for (const [ra, rb] of runs) for (let c = ra; c + chunkFrames <= rb; c += Math.floor(chunkFrames / 2)) for (const k of ks) {
    const y = [];
    for (let f = 0; f < chunkFrames; f++) { const v = a.F[k][c + f]; if (Number.isFinite(v)) y.push([f / chunkFrames - 0.5, log ? Math.log(v) : v]); }
    if (y.length < chunkFrames * 0.8) continue;
    // 正規方程式（1, x, x²）
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    for (const [px, py] of y) { const p = [1, px, px * px]; for (let i = 0; i < 3; i++) { b[i] += p[i] * py; for (let j = 0; j < 3; j++) A[i][j] += p[i] * p[j]; } }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const m = A[j][i] / A[i][i]; for (let l = i; l < 3; l++) A[j][l] -= m * A[i][l]; b[j] -= m * b[i]; }
    const co = [0, 0, 0];
    for (let i = 2; i >= 0; i--) { let v = b[i]; for (let j = i + 1; j < 3; j++) v -= A[i][j] * co[j]; co[i] = v / A[i][i]; }
    for (const [px, py] of y) { s += Math.abs(py - (co[0] + co[1] * px + co[2] * px * px)); n++; }
  }
  return n ? s / n : Infinity;
}
const meanBw = (a, ks) => { let s = 0, n = 0; for (const k of ks) for (const v of finite(a.B[k])) { s += v; n++; } return n ? s / n : Infinity; };

// となりのコマとの差の中央値（子音のところの大きな飛びに引っぱられない）
function adjQ(a, ks, q) {
  const d = [];
  for (const k of ks) for (let f = 1; f < a.F[k].length; f++) {
    const u = a.F[k][f - 1], v = a.F[k][f];
    if (Number.isFinite(u) && Number.isFinite(v)) d.push(Math.abs(Math.log(v / u)));
  }
  d.sort((x, y) => x - y);
  return d.length ? d[Math.floor(d.length * q)] : Infinity;
}

function medGuard(a, all, ratio) {
  const m = Math.min(...all.map(q => adj(q, [0, 1, 2], true)));
  return adj(a, [0, 1, 2], true) > ratio * m ? Infinity : adjQ(a, [0, 1, 2], 0.5);
}

export const CRITERIA = {
  now: a => adj(a, [0, 1], true),
  adjMed: a => adjQ(a, [0, 1, 2], 0.5),
  adjP90: a => adjQ(a, [0, 1, 2], 0.9),
  // 中央値で選ぶが、平均のゆれが最小の 1.5 倍をこえる上限は選ばない（高すぎる上限では F3 が飛ぶ）
  medGuard15: (a, t, r, all) => medGuard(a, all, 1.5),
  medGuard12: (a, t, r, all) => medGuard(a, all, 1.2),
  medCap55: a => (a.ceiling > 5500 ? Infinity : adjQ(a, [0, 1, 2], 0.5)),
  adj123: a => adj(a, [0, 1, 2], true),
  hz123: a => adj(a, [0, 1, 2], false),
  poly123: (a, t, r) => polyResidual(a, t, r, [0, 1, 2], 10, false),
  poly1234: (a, t, r) => polyResidual(a, t, r, [0, 1, 2, 3], 10, false),
  polyLog: (a, t, r) => polyResidual(a, t, r, [0, 1, 2], 10, true),
  poly20: (a, t, r) => polyResidual(a, t, r, [0, 1, 2], 20, false),
  bw123: a => meanBw(a, [0, 1, 2]),
};
