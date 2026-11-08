// 合成の声（確かめ用の「正解のわかる声」と、マイクなしで試す見本）。実在の人の声は使っていない
// しくみ: 声帯のパルス（KLGLOTT88 の形 + 傾き）＋息の雑音 → 直列の2次共振（フォルマント）
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function gauss(R) { return Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R()); }

export const VOWELS = {
  a: [800, 1200, 2500, 3500], i: [300, 2300, 3000, 3700], u: [350, 1300, 2300, 3400],
  e: [500, 1900, 2500, 3500], o: [500, 900, 2500, 3500],
};

class Res {
  constructor() { this.y1 = 0; this.y2 = 0; }
  run(x, F, B, sr) {
    const r = Math.exp(-Math.PI * B / sr), c = 2 * r * Math.cos(2 * Math.PI * F / sr), d = -r * r, g = 1 - c - d;
    const y = g * x + c * this.y1 + d * this.y2;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// p: { sr, dur, f0, oq(0..1), tilt(0..1), jitter(%σ), shimmer(%σ), noise(0..), vowel, scale, bw, seed, contour(t)→半音, syl:[{v,t0,t1}], srcOnly, vib:{rate,ext} }
export function synthVoice(p0) {
  const p = { sr: 48000, dur: 3, f0: 120, oq: 0.6, tilt: 0.3, jitter: 0.2, shimmer: 1.5, noise: 0.01, vowel: 'a', scale: 1, bw: [80, 90, 120, 150], seed: 11, ...p0 };
  const { sr } = p, n = Math.floor(p.dur * sr);
  const R = rng(p.seed);
  const per = new Float64Array(n), noi = new Float64Array(n);
  const periods = [], amps = [];
  let pos = 0, tilt = 0, ntilt = 0;
  // 周期ごとに声門の波を置く
  const contour = t => {
    let s = p.contour ? p.contour(t) : 0;
    if (p.vib) s += p.vib.ext * Math.sin(2 * Math.PI * p.vib.rate * t);
    return s;
  };
  const pulseAt = (u, oq) => { // KLGLOTT88 の流れの微分（u: 周期の割合）
    if (u >= oq) return 0;
    const v = u / oq;
    return (2 * v - 3 * v * v) * 27 / 8 * 0.5;
  };
  while (pos < n) {
    const t = pos / sr;
    const f = p.f0 * 2 ** (contour(t) / 12);
    const T = (1 / f) * (1 + (p.jitter / 100) * gauss(R));
    const amp = 1 + (p.shimmer / 100) * gauss(R);
    periods.push(T); amps.push(amp);
    const L = T * sr, end = Math.min(n, Math.ceil(pos + L));
    for (let i = Math.ceil(pos); i < end; i++) per[i] += amp * pulseAt((i - pos) / L, p.oq);
    pos += L;
  }
  const tiltA = p.tilt * 0.92;
  const lowpass = (v, st) => (1 - tiltA) * v + tiltA * st;
  for (let i = 0; i < n; i++) { tilt = lowpass(per[i], tilt); per[i] = tilt; noi[i] = p.noise * gauss(R); }
  void ntilt;

  const syl = p.syl || [{ v: p.vowel, t0: 0, t1: p.dur }];
  const gainAt = t => {
    for (const s of syl) if (t >= s.t0 && t < s.t1) return Math.min(1, (t - s.t0) / 0.025, (s.t1 - t) / 0.04);
    return 0;
  };
  const vowelAt = t => { for (const s of syl) if (t < s.t1) return VOWELS[s.v] || VOWELS.a; return VOWELS[syl[syl.length - 1].v] || VOWELS.a; };
  const run = src => {
    const out = new Float32Array(n), rs = [new Res(), new Res(), new Res(), new Res()];
    for (let i = 0; i < n; i++) {
      const t = i / sr, Fv = vowelAt(t), g = gainAt(t);
      let y = src[i] * g;
      if (!p.srcOnly) for (let k = 0; k < 4; k++) y = rs[k].run(y, Fv[k] * p.scale, p.bw[k], sr);
      out[i] = y;
    }
    return out;
  };
  const h = run(per), nn = run(noi), x = new Float32Array(n);
  let Eh = 0, En = 0, pk = 0;
  for (let i = 0; i < n; i++) { x[i] = h[i] + nn[i]; Eh += h[i] * h[i]; En += nn[i] * nn[i]; pk = Math.max(pk, Math.abs(x[i])); }
  const g = 0.5 / (pk || 1);
  for (let i = 0; i < n; i++) x[i] *= g;

  // 正解（作った周期と大きさから直接）。音が鳴るのは声帯が閉じる瞬間なので、周期は「閉じる瞬間どうしの間隔」で数える
  const closure = []; { let c = 0; for (const T of periods) { closure.push(c + p.oq * T); c += T; } }
  const gaps = []; for (let i = 1; i < closure.length; i++) gaps.push(closure[i] - closure[i - 1]);
  let dT = 0, sT = 0, dA = 0, sA = 0, dB = 0;
  for (let i = 1; i < gaps.length; i++) dT += Math.abs(gaps[i] - gaps[i - 1]);
  for (let i = 1; i < amps.length; i++) { dA += Math.abs(amps[i] - amps[i - 1]); dB += Math.abs(20 * Math.log10(amps[i] / amps[i - 1])); }
  for (const v of gaps) sT += v;
  for (const v of amps) sA += v;
  const m = amps.length - 1, F = vowelAt(0).map(v => v * p.scale);
  return {
    x, sr,
    truth: {
      f0: p.f0, F, B: p.bw.slice(),
      jitterLocal: 100 * (dT / (gaps.length - 1)) / (sT / gaps.length),
      shimmerLocal: 100 * (dA / m) / (sA / amps.length),
      shimmerDb: dB / m,
      hnr: 10 * Math.log10(Eh / (En || 1e-20)),
      syllables: syl.length,
    },
  };
}

// 画面の見本（設定した値。実在の人の声ではない）
const talk = () => { // あいうえお を区切って
  const out = []; let t = 0.2;
  for (const v of 'aiueoaoieu') { out.push({ v, t0: t, t1: t + 0.22 }); t += 0.3; }
  return { syl: out, dur: t + 0.2, contour: u => 3 * Math.sin(u * 2.2) - 1.2 * u };
};
export const PRESETS = {
  low:    { name: '低めの声',   f0: 110, oq: 0.55, tilt: 0.28, jitter: 0.25, shimmer: 2,  noise: 0.012, scale: 1 },
  high:   { name: '高めの声',   f0: 230, oq: 0.65, tilt: 0.3,  jitter: 0.2,  shimmer: 1.5, noise: 0.012, scale: 1.16 },
  breath: { name: '息まじり',   f0: 180, oq: 0.85, tilt: 0.6,  jitter: 0.4,  shimmer: 2.5, noise: 0.12,  scale: 1.1 },
  rough:  { name: 'ざらついた声', f0: 130, oq: 0.5, tilt: 0.25, jitter: 1.6,  shimmer: 9,  noise: 0.06,  scale: 1 },
};
export function presetVoice(id, mode, seed = 5) {
  const p = PRESETS[id] || PRESETS.low;
  if (mode === 'hold') return synthVoice({ ...p, dur: 3.2, vowel: 'a', seed });
  return synthVoice({ ...p, ...talk(), seed });
}
