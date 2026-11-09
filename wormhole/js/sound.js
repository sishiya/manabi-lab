// 再生中の音（合成。初期はオフ）。宇宙に音はないので、映画のような演出（画面の「簡単にしたところ」に書いてある）。
// 低いうなり＋風のようなノイズが、のどの中で強く高くなり、着くと静かな和音だけが残る。音も位置 ℓ だけで決まる。
'use strict';
const SND = { on: false, ctx: null, master: null, drone: [], droneG: null, noiseF: null, noiseG: null, padG: null, idleSince: 0 };

function sndInit() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  const ctx = SND.ctx = Power.audio(new AC());
  const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
  const master = SND.master = ctx.createGain(); master.gain.value = 0; master.connect(comp);
  // 低いうなり（少しずらして重ね、ゆっくりうねらせる。スマホのスピーカーでも聞こえるよう倍音も）
  const droneG = SND.droneG = ctx.createGain(); droneG.gain.value = 0.2; droneG.connect(master);
  [[1, 'sine', 0.55], [1.012, 'sine', 0.5], [2, 'triangle', 0.22], [3.01, 'triangle', 0.1]].forEach(([k, type, g]) => {
    const o = ctx.createOscillator(), v = ctx.createGain(); o.type = type; o.frequency.value = 44 * k; v.gain.value = g;
    o.connect(v); v.connect(droneG); o.start(); SND.drone.push({ o, k });
  });
  // 風のようなノイズ
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = SND.noiseF = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.value = 200;
  const ng = SND.noiseG = ctx.createGain(); ng.gain.value = 0;
  src.connect(f); f.connect(ng); ng.connect(master); src.start();
  // 着いたときの和音
  const pad = SND.padG = ctx.createGain(); pad.gain.value = 0; pad.connect(master);
  [110, 164.81, 246.94, 329.63].forEach((hz, i) => {
    const o = ctx.createOscillator(), v = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz; v.gain.value = 0.3 / (1 + i * 0.5);
    o.connect(v); v.connect(pad); o.start();
  });
  return true;
}

function sndSet(on) {
  if (on && !SND.ctx && !sndInit()) return false;
  SND.on = on;
  if (on && SND.ctx.state !== 'running' && !Power.away) SND.ctx.resume();
  return true;
}

// 毎コマ呼ぶ（位置と速さから音を決める）
function sndUpdate(l, a, speed, playing, ending) {
  if (!SND.ctx) return;
  const ctx = SND.ctx, t = ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.12);
  const target = !SND.on ? 0 : playing ? 0.8 : ending ? 0.55 : 0;
  set(SND.master.gain, target);
  if (target === 0) {   // 鳴っていない間は止める（電池）
    if (!SND.idleSince) SND.idleSince = performance.now();
    else if (performance.now() - SND.idleSince > 1200 && ctx.state === 'running') ctx.suspend();
    return;
  }
  SND.idleSince = 0;
  if (ctx.state !== 'running' && !Power.away) ctx.resume();   // iPhone の 'interrupted' からも戻す
  const d = Math.abs(l) - a, tube = 1 - smoothstep(0, 1.6, d), arrive = l > 0 ? smoothstep(3.2, 5.6, d) : 0;
  SND.drone.forEach(x => set(x.o.frequency, (44 + 16 * tube) * x.k));
  set(SND.droneG.gain, (0.16 + 0.2 * tube) * (1 - 0.8 * arrive));
  set(SND.noiseF.frequency, 180 + 620 * tube + 260 * Math.min(1, speed / 2));
  set(SND.noiseG.gain, (0.05 + 0.2 * tube) * (1 - arrive));
  set(SND.padG.gain, 0.2 * arrive);
}
