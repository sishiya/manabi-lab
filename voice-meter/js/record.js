// マイク（使うときだけ開く）と、録った声の聞き返し。録音はメモリの中だけで、保存も送信もしない
let ctx = null;
export function audioCtx() {
  if (!ctx) ctx = Power.audio(new (window.AudioContext || window.webkitAudioContext)());
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

let rec = null;
export const isRecording = () => !!rec;

// onChunk(Float32Array) を呼びつづける。戻り値: { sr, warn }（マイクの自動処理が切れなかったときの名前）
export async function startMic(onChunk) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomic');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  const ac = audioCtx();
  await ac.audioWorklet.addModule('js/capture-worklet.js');
  const src = ac.createMediaStreamSource(stream), node = new AudioWorkletNode(ac, 'voice-capture');
  node.port.onmessage = e => onChunk(e.data);
  src.connect(node);
  rec = { stream, src, node };
  const s = stream.getAudioTracks()[0].getSettings ? stream.getAudioTracks()[0].getSettings() : {};
  const warn = [];
  if (s.echoCancellation) warn.push('エコー消し');
  if (s.noiseSuppression) warn.push('雑音消し');
  if (s.autoGainControl) warn.push('音量の自動調整');
  return { sr: ac.sampleRate, warn };
}

export function stopMic() {
  if (!rec) return;
  rec.node.port.onmessage = null;
  rec.src.disconnect(); rec.node.disconnect();
  rec.stream.getTracks().forEach(t => t.stop()); // OS の「使用中」の表示も消える
  rec = null;
}

let play = null;
export const isPlaying = () => !!play;
// from 秒から再生。onEnd はおわったとき。now() で再生中の時刻
export function startPlay(x, fs, from, onEnd) {
  stopPlay();
  const ac = audioCtx(), buf = ac.createBuffer(1, x.length, fs);
  buf.copyToChannel(x, 0);
  const n = ac.createBufferSource(), g = ac.createGain();
  g.gain.value = 0.9;
  n.buffer = buf; n.connect(g); g.connect(ac.destination);
  n.onended = () => { if (play && play.n === n) { play = null; onEnd(); } };
  n.start(0, from);
  play = { n, t0: ac.currentTime, from };
}
export const playTime = () => (play ? play.from + (ctx.currentTime - play.t0) : 0);
export function stopPlay() {
  if (!play) return;
  const { n } = play;
  play = null;
  n.onended = null;
  try { n.stop(); } catch (e) { /* もう止まっている */ }
}
