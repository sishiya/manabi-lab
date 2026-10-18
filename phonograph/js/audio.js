// エジソンの蓄音機 — 音の出入り口（AudioContext・AudioWorklet・マイク）。計算は worklet.js、ここは渡すだけ
'use strict';
const Audio = {
  ctx: null, node: null, mic: null, micSrc: null, ready: false, starting: null, onSnap: null, err: '',
  async start() {
    if (this.ready) { if (this.ctx.state !== 'running') await this.ctx.resume(); return true; }
    if (this.starting) return this.starting;
    this.starting = (async () => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
        await this.ctx.audioWorklet.addModule('js/worklet.js');
        this.node = new AudioWorkletNode(this.ctx, 'phono', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        this.node.port.onmessage = e => { if (this.onSnap) this.onSnap(e.data); };
        this.node.connect(this.ctx.destination);
        if (this.ctx.state !== 'running') await this.ctx.resume();
        this.ready = true;
        for (const m of this.queue) this.node.port.postMessage(m); this.queue = [];
        return true;
      } catch (e) { this.err = String(e && e.message || e); window.__phErr.push('audio: ' + this.err); return false; }
    })();
    return this.starting;
  },
  queue: [],
  send(m) { if (this.ready) this.node.port.postMessage(m); else this.queue.push(m); },
  async useMic(on) {   // マイクは「マイク」を選んだときだけ開き、ほかを選んだら閉じる。録った音は残さない
    if (!on) { if (this.mic) { this.mic.getTracks().forEach(t => t.stop()); this.mic = null; } if (this.micSrc) { this.micSrc.disconnect(); this.micSrc = null; } return true; }
    if (this.mic) return true;
    if (!await this.start()) return false;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      this.micSrc = this.ctx.createMediaStreamSource(this.mic); this.micSrc.connect(this.node);
      return true;
    } catch (e) { this.err = String(e && e.message || e); return false; }
  },
};
