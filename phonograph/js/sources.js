// エジソンの蓄音機 — 計算で作る入力（マウスピースの中の圧力 Pa）。マイクを使わない人・紹介動画・確かめ用。
// どれも「声の大きさ」（dB、20 µPa が基準）の実効値にそろえる。worklet・ページ・node のどこでも動く。
'use strict';
(function (root) {

// 2次の共振（フォルマント）。中心 f・帯域 b Hz
function Reson(fs, f, b) { const r = Math.exp(-Math.PI * b / fs), th = 2 * Math.PI * f / fs; this.a1 = 2 * r * Math.cos(th); this.a2 = -r * r; this.g = 1 - r; this.y1 = 0; this.y2 = 0; }
Reson.prototype.tick = function (x) { const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; };

// 「あー」の声: 声帯の息の脈（Rosenberg の形）を、口の響き（日本語の「あ」のおよその F1〜F3）に通す
const VOWEL_A = [[800, 80, 1], [1200, 90, 0.5], [2800, 140, 0.25]];
// メリーさんのひつじ（ミレドレミミミ　レレレ　ミソソ　ミレドレミミミ　ミレレミレド）。音の高さは 12 平均律、長さは拍
const MARY = [[64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [64, 1], [64, 2], [62, 1], [62, 1], [62, 2], [64, 1], [67, 1], [67, 2],
  [64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [64, 1], [64, 1], [64, 1], [62, 1], [62, 1], [64, 1], [62, 1], [60, 4]];

function Source(fs, kind) {
  this.fs = fs; this.kind = kind; this.t = 0; this.ph = 0; this.res = VOWEL_A.map(([f, b]) => new Reson(fs, f, b));
  this.norm = { vowel: 1, mary: 1, whistle: Math.SQRT2, sweep: Math.SQRT2, tone: Math.SQRT2 }[kind] || 1;
  this.rms = 1; this.acc = 0; this.cnt = 0;
  this.f0 = 440;   // 'tone' の高さ（確かめ用）
  if (kind === 'vowel' || kind === 'mary') { this.rms = this.measure(); }   // 声は実効値を前もって測って、そろえる
}
Source.prototype.glottal = function (f0) {   // Rosenberg の脈: 開く 40%・閉じる 16%・残りは閉じたまま
  this.ph += f0 / this.fs; if (this.ph >= 1) this.ph -= 1;
  const x = this.ph, tp = 0.4, tn = 0.16;
  const g = x < tp ? 0.5 * (1 - Math.cos(Math.PI * x / tp)) : x < tp + tn ? Math.cos(Math.PI * (x - tp) / (2 * tn)) : 0;
  const d = g - (this.gPrev || 0); this.gPrev = g; return d * this.fs / f0;   // 口から出るのは流れの変化（唇の放射）
};
Source.prototype.raw = function () {
  const t = this.t, fs = this.fs; this.t += 1 / fs;
  switch (this.kind) {
    case 'vowel': { const f0 = 130 * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * t)); const e = this.glottal(f0); let y = 0; for (let i = 0; i < 3; i++) y += VOWEL_A[i][2] * this.res[i].tick(e); return y * Math.min(1, t / 0.05); }
    case 'mary': {
      const beat = 0.42, total = MARY.reduce((s, m) => s + m[1], 0) * beat + 1.0, tt = t % total;
      let acc = 0, note = null, on = 0; for (const m of MARY) { if (tt < acc + m[1] * beat) { note = m; on = tt - acc; break; } acc += m[1] * beat; }
      if (!note) { this.glottal(130); for (const r of this.res) r.tick(0); return 0; }
      const f0 = 440 * Math.pow(2, (note[0] - 12 - 69) / 12) * (1 + 0.008 * Math.sin(2 * Math.PI * 5.5 * t));   // 1オクターブ下（男の人の声の高さ）
      const len = note[1] * beat, env = Math.min(1, on / 0.03, (len - on) / 0.06);
      const e = this.glottal(f0); let y = 0; for (let i = 0; i < 3; i++) y += VOWEL_A[i][2] * this.res[i].tick(e); return y * Math.max(0, env);
    }
    case 'whistle': { this.ph += 1400 * (1 + 0.02 * Math.sin(2 * Math.PI * 5 * t)) / fs; return Math.sin(2 * Math.PI * this.ph); }
    case 'sweep': { const T = 10, tt = t % T, f = 100 * Math.pow(80, tt / T); this.ph += f / fs; return Math.sin(2 * Math.PI * this.ph) * Math.min(1, tt / 0.05, (T - tt) / 0.05); }   // 100 Hz → 8 kHz を10秒で
    case 'tone': { this.ph += this.f0 / fs; return Math.sin(2 * Math.PI * this.ph); }
  }
  return 0;
};
Source.prototype.measure = function () {   // 3秒ぶんの実効値（作りなおして t を戻す）
  const n = Math.round(this.fs * 3); let s = 0; for (let i = 0; i < n; i++) { const y = this.raw(); s += y * y; }
  this.t = 0; this.ph = 0; this.gPrev = 0; this.res = VOWEL_A.map(([f, b]) => new Reson(this.fs, f, b));
  return Math.sqrt(s / n) * (this.kind === 'mary' ? 1.15 : 1);   // メリーは音のない間を少しのぞく
};
// dB: マウスピースの中の音の大きさ（実効値）。buf に Pa を書く
Source.prototype.fill = function (buf, n, dB) {
  const pr = 20e-6 * Math.pow(10, dB / 20), g = pr / this.rms * (this.kind === 'vowel' || this.kind === 'mary' ? 1 : this.norm);
  for (let i = 0; i < n; i++) buf[i] = this.raw() * g;
};
const api = { Source, MARY };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.PhonoSrc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
