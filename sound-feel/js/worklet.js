// 心地よい音・いやな音 — 音を作る AudioWorklet（足し算の合成＋ノイズ・自然の音）
// main から成分の一覧 {f, a, g}（g: 0=音, 1=キーキーの帯）と、ゆらし・拍・ゆらぎ・ノイズの設定を受けとり、1サンプルずつ作る。
// 値はなめらかに（約 60 ms）追いかけるので、つまみを動かしても「ぷつっ」と鳴らない。
// ノイズのフィルタは psycho.js の NOISE の式と同じ形（耳のモデルと聞こえる音をそろえる）。
'use strict';
const SLOTS = 64;
class Additive extends AudioWorkletProcessor {
  constructor() {
    super();
    this.f = new Float64Array(SLOTS); this.ft = new Float64Array(SLOTS);
    this.a = new Float64Array(SLOTS); this.at = new Float64Array(SLOTS);
    this.g = new Uint8Array(SLOTS); this.ph = new Float64Array(SLOTS);
    this.pf = new Float64Array(SLOTS); this.pa = new Float64Array(SLOTS); this.pend = new Uint8Array(SLOTS);   // 和音の切りかえ: 小さくしてから高さを変える
    this.amRate = 0; this.amDepth = 0; this.amRateT = 0; this.amDepthT = 0; this.amPh = 0;
    this.gain = 0; this.gainT = 0;
    // キーキーの帯のゆっくりした揺れ（1〜16 Hz。Kumar ほか 2008）: 2つの遅い乱れを足す
    this.w = [0, 0]; this.wt = [0, 0]; this.wn = 0;
    // 拍（テンポ）
    this.bpm = 0; this.beatPh = 0; this.env = 1;
    // ゆらぎ（高さと大きさのゆっくりした不規則な揺れ）: 速さのちがう3つの乱れを足す（1/f に近い形）
    this.wob = 0; this.wobT = 0; this.r = [0, 0, 0];
    // ノイズ
    this.nType = 'none'; this.nRms = 0; this.nRmsT = 0; this.ms = 1;
    this.pk = [0, 0, 0, 0, 0, 0, 0]; this.br = 0; this.f1 = [0, 0, 0, 0]; this.bq = [0, 0, 0, 0]; this.bqc = null;
    this.swell = 1; this.swPh = 0; this.swT = 9; this.windC = 450; this.windT = 450; this.drop = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.parts) {
        for (let i = 0; i < SLOTS; i++) {
          const p = m.parts[i];
          if (p) {
            if (this.at[i] === 0 && this.a[i] < 1e-5) { this.f[i] = p.f; this.ft[i] = p.f; this.ph[i] = Math.random(); }   // 鳴っていなかった枠は高さを飛ばしてよい
            if (m.xfade && Math.abs(p.f / this.ft[i] - 1) > 0.005 && this.a[i] > 1e-5) {   // すべらせずに、いったん消して次の高さで鳴らす
              this.pend[i] = 1; this.pf[i] = p.f; this.pa[i] = p.a; this.at[i] = 0; this.g[i] = p.g; continue;
            }
            this.pend[i] = 0; this.ft[i] = p.f; this.at[i] = p.a; this.g[i] = p.g;
          } else { this.at[i] = 0; this.pend[i] = 0; }
        }
      }
      if (m.amRate !== undefined) { this.amRateT = m.amRate; this.amDepthT = m.amDepth; }
      if (m.gain !== undefined) this.gainT = m.gain;
      if (m.bpm !== undefined) this.bpm = m.bpm;
      if (m.wobble !== undefined) this.wobT = m.wobble;
      if (m.nature !== undefined) {
        if (m.nature !== this.nType) { this.nType = m.nature; this.warm(); }
        this.nRmsT = m.noiseRms;
      }
    };
  }
  // ノイズの種類が変わったら、1秒ぶん空回しして平均の強さを測っておく（あとは走りながら測りなおす）
  warm() {
    let s = 0; const n = Math.round(sampleRate);
    for (let i = 0; i < n; i++) { const x = this.noise(1 / sampleRate); s += x * x; }
    this.ms = Math.max(1e-9, s / n);
  }
  white() { return Math.random() * 2 - 1; }
  pink() {   // Paul Kellet のピンクノイズのフィルタ
    const w = this.white(), b = this.pk;
    b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759; b[2] = 0.96900 * b[2] + w * 0.1538520;
    b[3] = 0.86650 * b[3] + w * 0.3104856; b[4] = 0.55000 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.0168980;
    const y = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362; b[6] = w * 0.115926; return y * 0.11;
  }
  onePoleLP(i, x, fc) { const k = 1 - Math.exp(-2 * Math.PI * fc / sampleRate); this.f1[i] += (x - this.f1[i]) * k; return this.f1[i]; }
  onePoleHP(i, x, fc) { return x - this.onePoleLP(i, x, fc); }
  bandpass(x, fc, q) {   // RBJ のバンドパス（ピーク 1）
    const w0 = 2 * Math.PI * fc / sampleRate, al = Math.sin(w0) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w0) / a0, a2 = (1 - al) / a0, s = this.bq;
    const y = b0 * x + b2 * s[1] - a1 * s[2] - a2 * s[3];
    s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y; return y;
  }
  noise(dt) {
    switch (this.nType) {
      case 'white': return this.white();
      case 'pink': return this.pink();
      case 'rain': {   // ピンクノイズを 1 kHz で2回ハイパス・9 kHz でローパス＋ときどきの雨つぶ（短い粒）
        let x = this.onePoleHP(1, this.onePoleHP(0, this.pink(), 1000), 1000);
        x = this.onePoleLP(2, x, 9000);
        if (Math.random() < 35 * dt) this.drop = 0.6 + Math.random();
        this.drop *= 0.996;
        return x + this.drop * this.white() * 0.08;
      }
      case 'wave': {   // ブラウンノイズを 700 Hz でローパス（40 Hz より下は切る）＋7〜11 秒のうねり
        this.br = 0.995 * this.br + 0.05 * this.white();
        let x = this.onePoleLP(0, this.onePoleHP(1, this.br, 40), 700);
        this.swPh += dt / this.swT;
        if (this.swPh >= 1) { this.swPh -= 1; this.swT = 7 + Math.random() * 4; }
        const c = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.swPh);
        return x * (0.25 + 1.2 * c * c);
      }
      case 'wind': {   // ピンクノイズのバンドパス（まん中 450 Hz の前後をゆっくりさまよう）
        if (Math.random() < dt * 0.5) this.windT = 280 + Math.random() * 420;
        this.windC += (this.windT - this.windC) * dt * 0.4;
        return this.bandpass(this.pink(), this.windC, 1.5);
      }
    }
    return 0;
  }
  process(inputs, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || null, n = L.length, dt = 1 / sampleRate;
    const k = 1 - Math.exp(-dt / 0.06), TAU = 2 * Math.PI;
    for (let s = 0; s < n; s++) {
      this.gain += (this.gainT - this.gain) * k;
      this.amRate += (this.amRateT - this.amRate) * k;
      this.amDepth += (this.amDepthT - this.amDepth) * k;
      this.wob += (this.wobT - this.wob) * k;
      this.nRms += (this.nRmsT - this.nRms) * k;
      if (++this.wn >= 2400) {   // 約 20 回/秒ごとに新しい目標（なめらかに追うので 1〜16 Hz あたりの揺れになる）
        this.wn = 0; this.wt[0] = Math.random(); this.wt[1] = Math.random();
      }
      this.w[0] += (this.wt[0] - this.w[0]) * 0.0012; this.w[1] += (this.wt[1] - this.w[1]) * 0.004;
      const sq = 0.45 + 0.35 * this.w[0] + 0.4 * this.w[1];
      // ゆらぎ: 3つの遅い乱れ（約 0.05・0.2・0.8 Hz）
      const r = this.r;
      r[0] += (-r[0] * 0.3 + this.white() * 1.5) * dt; r[1] += (-r[1] * 1.2 + this.white() * 3) * dt; r[2] += (-r[2] * 5 + this.white() * 6) * dt;
      const wv = (r[0] + r[1] + r[2]) * this.wob;
      const fmul = Math.pow(2, 25 * wv / 1200), amul = Math.max(0.2, 1 + 0.25 * wv);
      // 拍: 1拍ごとに立ち上がって、次の拍までに小さくなる
      if (this.bpm > 0) {
        this.beatPh += this.bpm / 60 * dt;
        if (this.beatPh >= 1) this.beatPh -= 1;
        const t = this.beatPh * 60 / this.bpm, tau = Math.min(0.35, 0.3 * 60 / this.bpm);
        this.env = Math.min(1, t / 0.012) * (0.08 + 0.92 * Math.exp(-t / tau));
      } else this.env += (1 - this.env) * k;
      let v = 0;
      for (let i = 0; i < SLOTS; i++) {
        this.a[i] += (this.at[i] - this.a[i]) * k;
        if (this.pend[i] && this.a[i] < this.pa[i] * 0.02 + 1e-6) { this.pend[i] = 0; this.f[i] = this.ft[i] = this.pf[i]; this.at[i] = this.pa[i]; }
        if (this.a[i] < 1e-6) continue;
        this.f[i] += (this.ft[i] - this.f[i]) * k;
        this.ph[i] += this.f[i] * fmul * dt; if (this.ph[i] > 1) this.ph[i] -= 1;
        v += this.a[i] * Math.sin(TAU * this.ph[i]) * (this.g[i] === 1 ? sq : 1);
      }
      this.amPh += this.amRate * dt; if (this.amPh > 1) this.amPh -= 1;
      const am = 1 - this.amDepth / 2 + (this.amDepth / 2) * Math.cos(TAU * this.amPh);
      let y = v * am * this.env * amul;
      if (this.nType !== 'none' && this.nRms > 1e-6) {
        const x = this.noise(dt);
        this.ms += (x * x - this.ms) * (dt / 20);   // 20 秒の平均で強さを測りなおす（波のうねりを消さないよう長めに）
        y += x / Math.sqrt(Math.max(1e-9, this.ms)) * this.nRms;
      }
      y *= this.gain;
      L[s] = y; if (R) R[s] = y;
    }
    return true;
  }
}
registerProcessor('sofe-additive', Additive);
