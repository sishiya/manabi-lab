// エジソンの蓄音機 — 計算で作る入力（マウスピースの中の圧力 Pa）。マイクを使わない人・紹介動画・確かめ用。
// どれも「声の大きさ」（dB、20 µPa が基準）の実効値にそろえる。worklet・ページ・node のどこでも動く。
// 声はフォルマント合成（声帯の息の脈 → 口の響き5つを直列に。Klatt 1980 の形）。歌詞の母音・子音で口の形を変える。
'use strict';
(function (root) {

// 2次の共振（Klatt の形。0 Hz での大きさが 1）。中心 f・帯域 b Hz。set でなめらかに動かせる
function Reson(fs) { this.fs = fs; this.a = 1; this.b = 0; this.c = 0; this.y1 = 0; this.y2 = 0; }
Reson.prototype.set = function (f, bw) { const T = 1 / this.fs, r = Math.exp(-Math.PI * bw * T); this.c = -r * r; this.b = 2 * r * Math.cos(2 * Math.PI * f * T); this.a = 1 - this.b - this.c; };
Reson.prototype.tick = function (x) { const y = this.a * x + this.b * this.y1 + this.c * this.y2; this.y2 = this.y1; this.y1 = y; return y; };

// 母音の口の響き F1〜F3（Hz、男の人の声のおよその値。Peterson & Barney 1952 などのおよその平均）
const VOW = { a: [750, 1200, 2600], i: [290, 2250, 2950], u: [350, 1250, 2350], e: [480, 1900, 2550], o: [480, 850, 2500],
  ae: [660, 1700, 2400], I: [400, 1950, 2550], '@': [520, 1300, 2450], V: [620, 1200, 2550], ou: [470, 900, 2450] };
// 子音: 声の部分（kind v=鳴る・n=鼻・x=鳴らない）、長さ s、口の響き（なければ母音のまま）、息の音の帯（中心・帯域）と強さ
const CON = {
  m: { v: 'n', d: 0.07, F: [250, 1000, 2300] }, n: { v: 'n', d: 0.06, F: [250, 1500, 2500] }, N: { v: 'n', d: 0.12, F: [250, 1300, 2400] },
  r: { v: 'v', d: 0.03, F: [350, 1400, 2200], amp: 0.45 }, l: { v: 'v', d: 0.06, F: [360, 1000, 2700], amp: 0.6 }, w: { v: 'v', d: 0.06, F: [300, 700, 2300], amp: 0.6 },
  s: { v: 'x', d: 0.09, nz: [6500, 2500, 0.5] }, sh: { v: 'x', d: 0.10, nz: [3200, 1800, 0.55] }, f: { v: 'x', d: 0.08, nz: [5000, 5000, 0.18] },
  h: { v: 'x', d: 0.06, nz: [0, 0, 0.35] },   // h は口の響きを通る息
  ts: { v: 'x', d: 0.09, stop: 0.035, nz: [6000, 2500, 0.5] }, t: { v: 'x', d: 0.05, stop: 0.04, nz: [4000, 3000, 0.4] },
  j: { v: 'v', d: 0.08, stop: 0.03, nz: [3000, 1800, 0.35], amp: 0.5 }, z: { v: 'v', d: 0.07, nz: [6000, 2500, 0.25], amp: 0.6 },
  Q: { v: 'x', d: 0.12, stop: 0.12 },   // 小さい「っ」（息を止める）
};
// メリーさんのひつじ（ミレドレミミミ　レレレ　ミソソ　ミレドレミミミ　ミレレミレド）。音の高さは 12 平均律、長さは拍
const MARY = [[64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [64, 1], [64, 2], [62, 1], [62, 1], [62, 2], [64, 1], [67, 1], [67, 2],
  [64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [64, 1], [64, 1], [64, 1], [62, 1], [62, 1], [64, 1], [62, 1], [60, 4]];
// 歌詞（1音に1つ。[頭の子音, 母音, 終わりの子音]）。Sarah Josepha Hale（1830）の英語の元の詞（パブリックドメイン。エジソンが1877年に吹きこんだ言葉）。
// 日本語の訳詞は著作権が残っているので使わない
const LYR = ['m ae', 'r i', 'h ae', '- @', 'l I', 't @ l', 'l ae m', 'l I', 't @ l', 'l ae m', 'l I', 't @ l', 'l ae m',
  'm ae', 'r i', 'h ae', '- @', 'l I', 't @ l', 'l ae m', '- I ts', 'f i s', 'w V z', 'w a', '- ae z', 's ou'];
const parseSyl = s => { const p = s.split(' '); return { on: p[0] === '-' ? null : CON[p[0]] ? p[0] : null, v: VOW[p[1]] ? p[1] : 'a', co: p[2] || null, Q: p[0] === 'Q' }; };

// 毎回同じになる乱数（息の音・ゆらぎ）
function Rng(seed) { this.s = seed >>> 0; }
Rng.prototype.next = function () { let t = (this.s += 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; };

function Source(fs, kind) {
  this.fs = fs; this.kind = kind;
  this.syl = LYR.map(parseSyl);
  this.norm = { vowel: 1, mary: 1, whistle: Math.SQRT2, sweep: Math.SQRT2, tone: Math.SQRT2 }[kind] || 1;
  this.f0 = 440;   // 'tone' の高さ（確かめ用）
  this.reset(); this.rms = 1;
  if (kind === 'vowel' || kind === 'mary' || kind === 'whistle') { this.rms = this.measure(); }   // 声・口笛は実効値を前もって測って、そろえる
}
Source.prototype.reset = function () {
  const fs = this.fs; this.t = 0; this.ph = 0; this.gPrev = 0; this.rng = new Rng(12345);
  this.res = [0, 1, 2, 3, 4].map(() => new Reson(fs)); this.nzR = new Reson(fs); this.hp1 = 0; this.hpx = 0;
  this.F = [750, 1200, 2600, 3300, 3750]; this.B = [80, 90, 120, 150, 200]; this.av = 0; this.an = 0; this.lf0 = Math.log(130); this.jit = 0; this.k = 0;
  this.nzF = 0;
  for (let i = 0; i < 5; i++) this.res[i].set(this.F[i], this.B[i]);
};
Source.prototype.glottal = function (f0) {   // Rosenberg の脈: 開く 40%・閉じる 16%・残りは閉じたまま
  this.ph += f0 / this.fs; if (this.ph >= 1) this.ph -= 1;
  const x = this.ph, tp = 0.4, tn = 0.16;
  const g = x < tp ? 0.5 * (1 - Math.cos(Math.PI * x / tp)) : x < tp + tn ? Math.cos(Math.PI * (x - tp) / (2 * tn)) : 0;
  const d = g - this.gPrev; this.gPrev = g; return d * this.fs / f0;   // 口から出るのは流れの変化（唇の放射）
};
// いまの時刻の口の形と声の大きさ: { f0, F[3], v（声の強さ）, n（息の強さ）, nz（息の帯）, nasal }
Source.prototype.target = function (t) {
  if (this.kind === 'vowel') return { f0: 130, F: VOW.a, v: Math.min(1, t / 0.08), n: 0, nasal: false, on: t };
  const beat = 0.42, total = MARY.reduce((s, m) => s + m[1], 0) * beat + 1.0, tt = t % total;
  let acc = 0, idx = -1; for (let i = 0; i < MARY.length; i++) { if (tt < acc + MARY[i][1] * beat) { idx = i; break; } acc += MARY[i][1] * beat; }
  if (idx < 0) return { f0: 110, F: VOW['@'], v: 0, n: 0, nasal: false, on: 1 };
  const note = MARY[idx], on = tt - acc, len = note[1] * beat, sy = this.syl[idx], nx = this.syl[idx + 1];
  const f0 = 440 * Math.pow(2, (note[0] - 12 - 69) / 12);   // 1オクターブ下（男の人の声の高さ）
  let F = VOW[sy.v], v = 1, n = 0, nz = null, nasal = false;
  // 頭の子音
  const c = sy.on && CON[sy.on];
  if (sy.Q) { if (on > len - 0.1) v = 0; }   // 「っ」は前の母音をのばして、最後に息を止める
  else if (c && on < c.d) {
    if (c.stop && on < c.stop) { v = 0; }                                  // 口を閉じる
    else {
      if (c.F) F = c.F;
      v = c.v === 'x' ? 0 : c.v === 'n' ? 0.4 : c.amp || 1; nasal = c.v === 'n';
      if (c.nz) { n = c.nz[2]; nz = c.nz; }
    }
  }
  // 終わりの子音（つぎの音の頭の子音も、少し前から始まる）
  const co = sy.co && CON[sy.co];
  if (co && on > len - co.d) { if (co.F) F = co.F; v = co.v === 'x' ? 0 : co.v === 'n' ? 0.45 : co.amp || 1; nasal = co.v === 'n'; if (co.nz) { n = co.nz[2]; nz = co.nz; } }
  else if (nx && nx.on && CON[nx.on].v === 'x' && on > len - 0.02 && idx < MARY.length - 1) v = 0;   // 鳴らない子音の前は声を止める
  if (on > len - 0.05 && idx === MARY.length - 1) v *= Math.max(0, (len - on) / 0.05);   // 歌の終わり
  return { f0, F, v, n, nz, nasal, on };
};
Source.prototype.voice = function () {
  const fs = this.fs, t = this.t, T = this.target(t), r = this.rng;
  // 口の形・大きさはなめらかに（口の響き 20 ms、声の大きさ 8 ms、音の高さ 30 ms で追いつく）
  if ((this.k++ & 15) === 0) {
    const a = 1 - Math.exp(-16 / fs / 0.02);
    for (let i = 0; i < 3; i++) this.F[i] += (T.F[i] - this.F[i]) * a;
    this.B[0] = T.nasal ? 100 : 80; this.B[1] = T.nasal ? 300 : 90;
    for (let i = 0; i < 5; i++) this.res[i].set(this.F[i], this.B[i]);
    if (T.nz && T.nz[0] && T.nz[0] !== this.nzF) { this.nzF = T.nz[0]; this.nzR.set(T.nz[0], T.nz[1]); }
    this.jit += (r.next() * 0.003 - this.jit) * 0.02;   // ゆっくりしたゆらぎ（±0.3% ほど）
  }
  this.av += (T.v - this.av) * (1 - Math.exp(-1 / fs / 0.008)); this.an += (T.n - this.an) * (1 - Math.exp(-1 / fs / 0.006));
  this.lf0 += (Math.log(T.f0) - this.lf0) * (1 - Math.exp(-1 / fs / 0.03));
  const vib = 0.012 * Math.min(1, Math.max(0, (T.on - 0.18) / 0.25)) * Math.sin(2 * Math.PI * 5.5 * t);   // ビブラート（伸ばした音だけ、少しおくれて）
  const f0 = Math.exp(this.lf0) * (1 + vib + this.jit);
  const e = this.glottal(f0), w = r.next();
  const open = this.ph < 0.56 ? 1 : 0.3;                              // 息の音は声帯が開いているときに強い
  let x = e * this.av * (1 + 0.04 * r.next()) + w * 0.06 * this.av * open;
  let fric = 0;
  if (this.an > 1e-4) { if (T.nz && T.nz[0]) fric = this.nzR.tick(w) * this.an * 6; else x += w * this.an * 1.2; }   // h は口の響きを通す
  let y = x; for (let i = 0; i < 5; i++) y = this.res[i].tick(y);
  y += fric;
  const hp = y - this.hpx + 0.995 * this.hp1; this.hpx = y; this.hp1 = hp;   // 息の直流分を除く
  this.t += 1 / fs;
  return hp;
};
Source.prototype.raw = function () {
  const t = this.t, fs = this.fs;
  switch (this.kind) {
    case 'vowel': case 'mary': return this.voice();
    case 'whistle': {   // 口笛: ほぼ純音に、少しの息の音とビブラート
      this.t += 1 / fs; this.ph += 1400 * (1 + 0.015 * Math.sin(2 * Math.PI * 5 * t)) / fs; if (this.ph >= 1) this.ph -= 1;
      if (!this.nzF) { this.nzF = 1; this.nzR.set(1400, 300); }
      return (Math.sin(2 * Math.PI * this.ph) + this.nzR.tick(this.rng.next()) * 0.6) * Math.min(1, t / 0.08);
    }
    case 'sweep': { this.t += 1 / fs; const T = 10, tt = t % T, f = 100 * Math.pow(80, tt / T); this.ph += f / fs; return Math.sin(2 * Math.PI * this.ph) * Math.min(1, tt / 0.05, (T - tt) / 0.05); }   // 100 Hz → 8 kHz を10秒で
    case 'tone': { this.t += 1 / fs; this.ph += this.f0 / fs; return Math.sin(2 * Math.PI * this.ph); }
  }
  this.t += 1 / fs; return 0;
};
Source.prototype.measure = function () {   // 実効値（声が鳴っている所だけ）。作りなおして t を戻す
  const n = Math.round(this.fs * (this.kind === 'mary' ? 3 : 2)); let s = 0, m = 0;
  for (let i = 0; i < n; i++) { const y = this.raw(); if (this.kind !== 'mary' || this.av > 0.5) { s += y * y; m++; } }
  this.reset();
  return Math.sqrt(s / Math.max(1, m));
};
// dB: マウスピースの中の音の大きさ（声が鳴っている所の実効値）。buf に Pa を書く
Source.prototype.fill = function (buf, n, dB) {
  const pr = 20e-6 * Math.pow(10, dB / 20), g = pr / this.rms * (this.kind === 'vowel' || this.kind === 'mary' || this.kind === 'whistle' ? 1 : this.norm);
  for (let i = 0; i < n; i++) buf[i] = this.raw() * g;
};
const api = { Source, MARY, LYR };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.PhonoSrc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
