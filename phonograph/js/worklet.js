// エジソンの蓄音機 — AudioWorklet（音の計算はここで。機械の再生は溝からだけ計算する。
// 入れた音は「元の音」とくらべるために、このページが開いているあいだだけメモリに覚える。保存も送信もしない）
import './physics.js';
import './sources.js';
const { Phono } = globalThis.PhonoPhys, { Source } = globalThis.PhonoSrc;

class PhonoProc extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ph = new Phono(sampleRate);
    this.kind = 'mary'; this.src = new Source(sampleRate, 'mary'); this.dB = 105; this.gain = 8;
    this.pin = new Float32Array(128); this.pout = new Float32Array(128);
    this.half = 400; this.win = new Float32Array(2 * this.half + 1);
    this.ringN = 4096; this.rIn = new Float32Array(this.ringN); this.rOut = new Float32Array(this.ringN); this.ri = 0; this.qi = 0;
    this.recBuf = new Float32Array(Math.ceil(sampleRate * 21)); this.recN = 0; this.ssRec = 0;   // 元の音（いちばん新しい録音の、マウスピースの中の圧力）
    this.ssPlay = 0; this.nPlay = 0; this.orig = -1; this.gOrig = 0;
    this.blk = 0; this.ssIn = 0; this.ssOut = 0; this.nS = 0; this.splIn = 0; this.splOut = 0; this.clip = 0;
    this.port.onmessage = e => this.msg(e.data);
  }
  msg(d) {
    const ph = this.ph;
    switch (d.t) {
      case 'mode': ph.setMode(d.m); if (d.m === 'rec') { this.recN = 0; this.ssRec = 0; } if (d.m === 'play') { this.ssPlay = 0; this.nPlay = 0; } this.orig = -1; break;
      case 'orig':   // 元の音を鳴らす。大きさは、さっき機械で再生した音の大きさにそろえる（音色をくらべるため）
        if (d.on && this.recN > 0) { const rr = Math.sqrt(this.ssRec / this.recN), pr = this.nPlay > 0 ? Math.sqrt(this.ssPlay / this.nPlay) : 0.02; this.gOrig = rr > 0 ? pr / rr : 0; this.orig = 0; } else this.orig = -1;
        break;
      case 'crank': ph.setCrank(d.hand, d.om); break;
      case 'rewind': ph.rewind(); break;
      case 'reset': ph.resetFoil(); break;
      case 'src': if (d.kind !== this.kind || d.restart) { this.kind = d.kind; if (d.kind !== 'mic') this.src = new Source(sampleRate, d.kind); } break;
      case 'level': this.dB = d.dB; break;
      case 'gain': this.gain = d.g; break;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0][0], n = out.length, ph = this.ph, pin = this.pin, pout = this.pout, rec = ph.mode === 'rec';
    if (rec) {
      if (this.kind === 'mic') {
        const mic = inputs[0] && inputs[0][0], cal = 20e-6 * Math.pow(10, this.dB / 20) / 0.1;   // マイクの実効値 0.1 を「声の大きさ」の dB とみなす（推定）
        for (let i = 0; i < n; i++) pin[i] = mic ? mic[i] * cal : 0;
      } else this.src.fill(pin, n, this.dB);
    } else pin.fill(0);
    ph.process(pin, pout, n);
    let clip = 0;
    for (let i = 0; i < n; i++) {
      let y = rec ? 0 : pout[i] * this.gain;   // 録音中は鳴らさない（マイクに戻るため）
      if (this.orig >= 0) { y = this.orig < this.recN ? this.recBuf[this.orig++] * this.gOrig * this.gain : 0; if (this.orig >= this.recN) { this.orig = -1; this.port.postMessage({ t: 'origEnd' }); } }
      if (rec && this.recN < this.recBuf.length) { this.recBuf[this.recN++] = pin[i]; this.ssRec += pin[i] * pin[i]; }
      if (ph.mode === 'play') { this.ssPlay += pout[i] * pout[i]; this.nPlay++; }
      if (y > 1) { y = 1; clip = 1; } else if (y < -1) { y = -1; clip = 1; }
      out[i] = y;
      if (rec) { this.rIn[this.qi] = pin[i]; this.qi = (this.qi + 1) % this.ringN; } else { this.rOut[this.ri] = pout[i]; this.ri = (this.ri + 1) % this.ringN; }   // 入れた音は録音中だけ、出た音は録音中でないときだけ書く
      this.ssIn += pin[i] * pin[i]; this.ssOut += pout[i] * pout[i];
    }
    this.nS += n; if (clip) this.clip = 1;
    if (++this.blk % 12 === 0) {   // 約 30 回／秒、画面へ
      this.splIn = Math.sqrt(this.ssIn / this.nS); this.splOut = Math.sqrt(this.ssOut / this.nS); this.ssIn = this.ssOut = this.nS = 0;
      const q = Array.from(ph.q), win = ph.window(this.half, new Float32Array(this.win.length));
      const msg = { t: 'snap', x: ph.x, om: ph.om, z: ph.z0 + ph.wCenter(), z0: ph.z0, q, Fc: ph.Fc, contact: ph.contact, mode: ph.mode, atEnd: ph.atEnd,
        win, half: this.half, pIn: this.splIn, pOut: this.splOut, clip: this.clip };
      this.clip = 0;
      const tr = [win.buffer];
      if (this.blk % 36 === 0) {   // 約 10 回／秒: 波形と、箔をひろげた図の変わった行
        const a = new Float32Array(this.ringN), b = new Float32Array(this.ringN);
        for (let i = 0; i < this.ringN; i++) { a[i] = this.rIn[(this.qi + i) % this.ringN]; b[i] = this.rOut[(this.ri + i) % this.ringN]; }
        msg.wIn = a; msg.wOut = b; tr.push(a.buffer, b.buffer);
        const rows = ph.updateSegs(); if (rows.length) { msg.rows = rows; msg.seg = ph.seg.slice(); tr.push(msg.seg.buffer); }
      }
      this.port.postMessage(msg, tr);
    }
    return true;
  }
}
registerProcessor('phono', PhonoProc);
