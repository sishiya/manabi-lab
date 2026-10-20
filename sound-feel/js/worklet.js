// 心地よい音・いやな音 — 音を作る AudioWorklet（足し算の合成）
// main から成分の一覧 {f, a, g}（g: 0=音, 1=キーキーの帯）と、ゆらしの速さ・深さ・音量を受けとり、
// 1サンプルずつ sin を足す。値はなめらかに（約 60 ms）追いかけるので、つまみを動かしても「ぷつっ」と鳴らない。
'use strict';
const SLOTS = 64;
class Additive extends AudioWorkletProcessor {
  constructor() {
    super();
    this.f = new Float64Array(SLOTS); this.ft = new Float64Array(SLOTS);
    this.a = new Float64Array(SLOTS); this.at = new Float64Array(SLOTS);
    this.g = new Uint8Array(SLOTS); this.ph = new Float64Array(SLOTS);
    this.amRate = 0; this.amDepth = 0; this.amRateT = 0; this.amDepthT = 0; this.amPh = 0;
    this.gain = 0; this.gainT = 0;
    // キーキーの帯のゆっくりした揺れ（1〜16 Hz。Kumar ほか 2008）: 2つの遅い乱れを足す
    this.w = [0, 0]; this.wt = [0, 0]; this.wn = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.parts) {
        for (let i = 0; i < SLOTS; i++) {
          const p = m.parts[i];
          if (p) {
            if (this.at[i] === 0 && this.a[i] < 1e-5) { this.f[i] = p.f; this.ph[i] = Math.random(); }   // 鳴っていなかった枠は高さを飛ばしてよい
            this.ft[i] = p.f; this.at[i] = p.a; this.g[i] = p.g;
          } else this.at[i] = 0;
        }
      }
      if (m.amRate !== undefined) { this.amRateT = m.amRate; this.amDepthT = m.amDepth; }
      if (m.gain !== undefined) this.gainT = m.gain;
    };
  }
  process(inputs, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || null, n = L.length, dt = 1 / sampleRate;
    const k = 1 - Math.exp(-dt / 0.06), TAU = 2 * Math.PI;
    for (let s = 0; s < n; s++) {
      this.gain += (this.gainT - this.gain) * k;
      this.amRate += (this.amRateT - this.amRate) * k;
      this.amDepth += (this.amDepthT - this.amDepth) * k;
      if (++this.wn >= 2400) {   // 約 20 回/秒ごとに新しい目標（なめらかに追うので 1〜16 Hz あたりの揺れになる）
        this.wn = 0; this.wt[0] = Math.random(); this.wt[1] = Math.random();
      }
      this.w[0] += (this.wt[0] - this.w[0]) * 0.0012; this.w[1] += (this.wt[1] - this.w[1]) * 0.004;
      const wob = 0.45 + 0.35 * this.w[0] + 0.4 * this.w[1];
      let v = 0;
      for (let i = 0; i < SLOTS; i++) {
        this.a[i] += (this.at[i] - this.a[i]) * k;
        if (this.a[i] < 1e-6) continue;
        this.f[i] += (this.ft[i] - this.f[i]) * k;
        this.ph[i] += this.f[i] * dt; if (this.ph[i] > 1) this.ph[i] -= 1;
        v += this.a[i] * Math.sin(TAU * this.ph[i]) * (this.g[i] === 1 ? wob : 1);
      }
      this.amPh += this.amRate * dt; if (this.amPh > 1) this.amPh -= 1;
      const env = 1 - this.amDepth / 2 + (this.amDepth / 2) * Math.cos(TAU * this.amPh);
      const y = v * env * this.gain;
      L[s] = y; if (R) R[s] = y;
    }
    return true;
  }
}
registerProcessor('sofe-additive', Additive);
