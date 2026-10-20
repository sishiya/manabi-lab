// 心地よい音・いやな音 — 音を鳴らす（Web Audio。録音・素材は使わず、成分の一覧からその場で合成）
// 安全: 押すまで鳴らさない／はじめは 0 から上げる／音量に上限（リミッター）
'use strict';
const Synth = (() => {
  let ctx = null, node = null, master = null, ready = false, on = false;
  let last = null;
  // 想定の大きさ（dB）→ 出力の RMS。端末の音量で本当の大きさは変わる（画面にも書く）
  const rmsOf = (L) => 0.12 * Math.pow(10, (L - 65) / 20);

  async function start() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.audioWorklet.addModule('js/worklet.js');
      node = new AudioWorkletNode(ctx, 'sofe-additive', { numberOfInputs: 0, outputChannelCount: [2] });
      const lim = ctx.createDynamicsCompressor();   // 大きくなりすぎないように（ほぼ鳴らない保険）
      lim.threshold.value = -8; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0;
      node.connect(lim); lim.connect(master); master.connect(ctx.destination);
      ready = true;
    }
    await ctx.resume();
    on = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(1, ctx.currentTime, 0.25);   // ゆっくり上げる
    if (last) send(last.parts, last.P);
  }
  function stop() {
    on = false;
    if (ready) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.08); }
  }
  // parts: Psycho.partialsOf の結果（s が枠の番号）
  function send(parts, P, xfade) {   // xfade: 高さの変わった枠を、すべらせずに切りかえる（BGM の和音）
    last = { parts, P };
    if (!ready) return;
    let pw = 0; for (const p of parts) pw += p.a * p.a;
    const norm = pw > 0 ? Math.SQRT2 * rmsOf(P.level) / Math.sqrt(pw) : 0;   // sin の RMS は振幅/√2
    const slots = [];
    let pn = 0;
    for (const p of parts) { if (p.g === 2) pn += p.a * p.a; else slots[p.s] = { f: p.f, a: p.a * norm, g: p.g }; }
    node.port.postMessage({ parts: slots, amRate: P.amRate, amDepth: P.amDepth, gain: 1, bpm: P.bpm || 0, wobble: P.wobble || 0,
      nature: pn > 0 ? P.nature : 'none', noiseRms: Math.sqrt(pn / 2) * norm, xfade: !!xfade });   // ノイズの RMS = 帯のパワーの合計の分（sin と同じ 1/2）
  }
  return { start, stop, send, get on() { return on; }, get ctx() { return ctx; } };
})();
window.Synth = Synth;
