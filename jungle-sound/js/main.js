// 熱帯雨林の音 — メイン（再生と、デバッグ用の窓口）
'use strict';
window.__jusoErr = [];
window.addEventListener('error', e => window.__jusoErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const CLIP = 15, FADE = 0.3;
const S = { info: null, ctx: null, an: null, els: {}, gains: {}, now: null, stopAt: 0, abWhich: null };

// 音の道すじは最初に押したときに作る（ブラウザは押す前に音を出させない）
function graph() {
  if (S.ctx) return;
  S.ctx = Power.audio(new (window.AudioContext || window.webkitAudioContext)());
  S.an = S.ctx.createAnalyser(); S.an.fftSize = 1024; S.an.smoothingTimeConstant = 0.2;
  S.an.minDecibels = -125; S.an.maxDecibels = -65;   // 森の音は小さい（全体で -40 dBFS ほど）ので、止まっているときの図と同じくらいの明るさに
  S.an.connect(S.ctx.destination);
}
function el(name) {
  if (!S.els[name]) {
    const a = new Audio(`audio/${name}.m4a`); a.preload = 'auto';
    const gn = S.ctx.createGain();
    S.ctx.createMediaElementSource(a).connect(gn).connect(S.an);
    a.addEventListener('timeupdate', tick); a.addEventListener('ended', () => stop());
    S.els[name] = a; S.gains[name] = gn;
  }
  return S.els[name];
}
function fmt(t) { t = Math.max(0, Math.floor(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
// 15秒の区間の大きさ（1秒ごとの dB を力で平均）。聞きくらべは2つを同じ大きさにそろえる（大きさで当てられないように）
function level(name, at) {
  const L = S.info && S.info.loud[name]; if (!L) return -30;
  const p = L.slice(at, at + CLIP).reduce((s, d) => s + 10 ** (d / 10), 0) / CLIP; return 10 * Math.log10(p);
}

function play(name, from, len, gainDb = 0) {
  graph(); stop(true);
  const a = el(name), gn = S.gains[name].gain, t = S.ctx.currentTime, v = 10 ** (gainDb / 20);
  S.ctx.resume();
  gn.cancelScheduledValues(t);
  if (len) { gn.setValueAtTime(0, t); gn.linearRampToValueAtTime(v, t + FADE); } else gn.setValueAtTime(1, t);
  a.currentTime = from; S.now = { name }; S.stopAt = len ? from + len : 0;
  a.play().catch(e => { $('status').textContent = '再生できませんでした: ' + e.message; });
  Spectro.start(S.an); $('specNote').textContent = '図: いま鳴っている音（右から流れる。たて＝音の高さ、明るい＝強い）';
  ui();
}
function stop(quiet) {
  if (S.now) S.els[S.now.name].pause();
  S.now = null; S.abWhich = null; Spectro.stop();
  if (!quiet) ui();
}
function tick() {
  if (!S.now) return;
  const a = S.els[S.now.name];
  if (S.stopAt) {
    const left = S.stopAt - a.currentTime, gn = S.gains[S.now.name].gain;
    if (left <= FADE && !S.fading) { S.fading = true; gn.linearRampToValueAtTime(0, S.ctx.currentTime + Math.max(0.05, left)); }
    if (left <= 0) { S.fading = false; const w = S.abWhich; stop(); if (w) Compare.heardOne(w); return; }
  }
  $('status').textContent = S.abWhich ? `${S.abWhich} を再生中 ${fmt(a.currentTime - (S.stopAt - CLIP))} / 0:${CLIP}` : `重ねた森を再生中 ${fmt(a.currentTime)} / ${fmt(a.duration || 180)}`;
}
function ui() {
  const mixOn = S.now && !S.abWhich;
  $('playMix').textContent = mixOn ? '■ 止める' : '▶ 重ねた森を聞く（3分）';
  $('playMix').classList.toggle('on', !!mixOn);
  for (const w of ['A', 'B']) { $('play' + w).classList.toggle('on', S.abWhich === w); $('play' + w).textContent = S.abWhich === w ? `■ ${w} を止める` : `▶ ${w} を聞く`; }
  $('status').classList.toggle('on', !!S.now);
  if (!S.now) $('status').textContent = '止まっています';
  else tick();
}

$('playMix').onclick = () => (S.now && !S.abWhich ? stop() : play('mix1', S.els.mix1 && S.els.mix1.currentTime < 179 ? S.els.mix1.currentTime : 0, 0));
for (const w of ['A', 'B']) {
  $('play' + w).onclick = () => {
    if (S.abWhich === w) { stop(); Compare.heardOne(w); return; }
    const t = Compare.trial, other = w === 'A' ? 'B' : 'A';
    const me = level(Compare.src(w), t.at), them = level(Compare.src(other), t.at);
    S.fading = false; play(Compare.src(w), t.at, CLIP, Math.min(me, them) - me); S.abWhich = w; ui();
  };
  $('pick' + w).onclick = () => { stop(); Compare.answer(w); };
}
Power.on({ pause() { if (S.now) stop(); }, resume() {} });   // 離れたら止める（もどっても勝手に鳴らさない）
addEventListener('resize', () => Spectro.resize());

fetch('data/mix.json').then(r => r.json()).then(info => { S.info = info; Compare.render(info); })
  .catch(e => { $('metrics').textContent = '数を読みこめませんでした: ' + e.message; window.__jusoErr.push(String(e)); });
Compare.newTrial();
Spectro.still();

// デバッグ用: 状態を見る（RULES 5）
window.__juso = { S, Compare, level };
