// あそびラボの今の音（ビフォー）を録る。capture_server.py が /__rec.js として配る。
// ゲームのページを開いたらすぐ import('/__rec.js') する（AudioContext を作る前に）。
// 出口（destination）につながる音を、横の MediaStreamDestination にも流して MediaRecorder で録り、/save に送る。
const orig = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (dest, ...a) {
  const r = orig.call(this, dest, ...a);
  if (dest instanceof AudioDestinationNode) {
    const c = dest.context;
    if (!c.__tap) c.__tap = c.createMediaStreamDestination();
    orig.call(this, c.__tap);
  }
  return r;
};
const AC = window.AudioContext;
window.__ctxs = [];
window.AudioContext = window.webkitAudioContext = class extends AC {
  constructor(...a) { super(...a); window.__ctxs.push(this); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// name: <game>__<sound>、ms: 録る長さ、trigger: 鳴らす関数
window.__rec = async (name, ms, trigger) => {
  const c = window.__ctxs[window.__ctxs.length - 1];
  if (!c) throw new Error('AudioContext がまだない');
  if (c.state !== 'running') await c.resume();
  if (!c.__tap) c.__tap = c.createMediaStreamDestination();
  const mr = new MediaRecorder(c.__tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  const parts = [];
  mr.ondataavailable = (e) => parts.push(e.data);
  const done = new Promise((r) => (mr.onstop = r));
  mr.start();
  await sleep(150);
  try { await trigger(); } catch (e) { console.warn(name, e); }
  await sleep(ms);
  mr.stop();
  await done;
  const res = await fetch('/save?name=' + name, { method: 'POST', body: new Blob(parts, { type: 'audio/webm' }) });
  return `${name}:${await res.text()}`;
};

// 効果音をまとめて: list = [[音の名前, 録る ms, 鳴らす関数], ...]
window.__recAll = async (game, list) => {
  const out = [];
  for (const [n, ms, fn] of list) { out.push(await window.__rec(`${game}__${n}`, ms, fn)); await sleep(300); }
  return out;
};
