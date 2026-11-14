// 熱帯雨林の音 — メイン（再生と、デバッグ用の窓口）
// 森（第二弾。js/forest.js が声ごとに重ねて鳴らす）と、聞きくらべ（第一弾。audio/mix1〜3・ref1 をそのまま流す）は同じ音の道すじを使う
'use strict';
window.__jusoErr = [];
window.addEventListener('error', e => window.__jusoErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__jusoErr.push(String(e.reason)));

const $ = id => document.getElementById(id);
const CLIP = 15, FADE = 0.3;
const S = { info: null, ctx: null, an: null, els: {}, gains: {}, now: null, stopAt: 0, abWhich: null, forest: false };

// 音の道すじは最初に押したときに作る（ブラウザは押す前に音を出させない）
async function graph() {
  if (!S.ctx) {
    S.ctx = Power.audio(new (window.AudioContext || window.webkitAudioContext)());
    S.an = S.ctx.createAnalyser(); S.an.fftSize = 1024; S.an.smoothingTimeConstant = 0.2;
    S.an.minDecibels = -125; S.an.maxDecibels = -65;   // 森の音は小さい（全体で -40 dBFS ほど）ので、止まっているときの図と同じくらいの明るさに
    S.an.connect(S.ctx.destination);
  }
  await Forest.init(S.ctx, S.an);
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

// ---- 森 ----
let clock = 0;
const showTime = () => { if (!S.now) $('status').textContent = `${fmt(Forest.time)} / 3:00`; };   // 止まっているかは ▶／■ のボタンで分かる
async function playForest() {
  await graph(); stop(true); S.ctx.resume();
  Forest.start(); S.forest = true; Spectro.start(S.an); Lanes.start();
  clock = setInterval(showTime, 250);
  ui();
}
function stopForest() {
  if (!S.forest) return;
  Forest.stop(); S.forest = false; clearInterval(clock); Spectro.stop(); Lanes.stop();
}
// 時刻を変える（声の帯・「次の声へ」から）。どこへ移動したかを消えずに残す
function seek(t, snapped) {
  Forest.seek(t); showTime(); Lanes.draw();
  $('seekMsg').textContent = `${fmt(t)} へ移動しました` + (snapped ? `（${List.short(snapped)}の声の1秒前）` : '');
}
List.seekHook = seek;

// ---- 聞きくらべ（第一弾）----
async function play(name, from, len, gainDb = 0) {
  await graph(); stop(true);
  const a = el(name), gn = S.gains[name].gain, t = S.ctx.currentTime, v = 10 ** (gainDb / 20);
  S.ctx.resume();
  gn.cancelScheduledValues(t);
  if (len) { gn.setValueAtTime(0, t); gn.linearRampToValueAtTime(v, t + FADE); } else gn.setValueAtTime(1, t);
  a.currentTime = from; S.now = { name }; S.stopAt = len ? from + len : 0;
  a.play().catch(e => { $('status').textContent = '再生できませんでした: ' + e.message; });
  Spectro.start(S.an);
  ui();
}
function stop(quiet) {
  stopForest();
  if (S.now) S.els[S.now.name].pause();
  S.now = null; S.abWhich = null; if (!S.forest) Spectro.stop();
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
  $('status').textContent = `${S.abWhich} を再生中 ${fmt(a.currentTime - (S.stopAt - CLIP))} / 0:${CLIP}`;
}
function ui() {
  $('playForest').innerHTML = S.forest ? '■ 止める' : '▶ <span class="hide-sm">森を</span>聞く';   // スマホでは「▶ 聞く」（固定した所を1行に）
  $('playForest').classList.toggle('on', S.forest);
  for (const w of ['A', 'B']) { $('play' + w).classList.toggle('on', S.abWhich === w); $('play' + w).textContent = S.abWhich === w ? `■ ${w} を止める` : `▶ ${w} を聞く`; }
  $('status').classList.toggle('on', !!(S.now || S.forest));
  if (S.now) tick(); else showTime();
}

$('playForest').onclick = () => (S.forest ? stop() : playForest().catch(e => { $('status').textContent = '鳴らせませんでした: ' + e.message; window.__jusoErr.push(String(e)); }));
for (const w of ['A', 'B']) {
  $('play' + w).onclick = async () => {
    if (S.abWhich === w) { stop(); Compare.heardOne(w); return; }
    const t = Compare.trial, other = w === 'A' ? 'B' : 'A';
    const me = level(Compare.src(w), t.at), them = level(Compare.src(other), t.at);
    S.fading = false; await play(Compare.src(w), t.at, CLIP, Math.min(me, them) - me); S.abWhich = w; ui();
  };
  $('pick' + w).onclick = () => { stop(); Compare.answer(w); };
}
Power.on({ pause() { if (S.now || S.forest) stop(); }, resume() {} });   // 離れたら止める（もどっても勝手に鳴らさない）
addEventListener('resize', () => { Spectro.resize(); Lanes.resize(); });
$('specFold').onclick = () => {
  const open = $('specBox').hidden; $('specBox').hidden = !open;
  $('specFold').textContent = open ? '図 ▴' : '図 ▾'; $('specFold').setAttribute('aria-expanded', open);
  $('specFold').setAttribute('aria-label', open ? '図をたたむ' : '図を開く');
  if (open) Spectro.resize();
};
Spectro.setup(() => S.forest || !!S.now);

// 本物らしさのくらべ（第一弾）は開発中だけ: 手元（localhost）で開いたときだけ出す。公開の画面では「生成した音との比べ」と勘違いされやすいため（2026-11-14 ユーザー）
if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) $('devCompare').hidden = false;
fetch('data/mix.json').then(r => r.json()).then(info => { S.info = info; Compare.render(info); })
  .catch(e => { $('metrics').textContent = '数を読みこめませんでした: ' + e.message; window.__jusoErr.push(String(e)); });
Promise.all([Forest.prefetch(), fetch('data/species.json').then(r => r.json())])
  .then(([forest, species]) => {
    List.build(forest, species, () => Lanes.dirty());
    Lanes.setup(forest, List.order, {
      seek, select: code => List.select(code),
      preview: t => { $('seekMsg').textContent = `→ ${fmt(t)}（指をはなすと、ここへ移動）`; },
    });
    Lanes.stop(); Spectro.resize();
    $('playForest').disabled = false; ui();
  })
  .catch(e => { $('playForest').textContent = '読みこめませんでした'; window.__jusoErr.push(String(e)); });
Compare.newTrial();

// デバッグ用: 状態を見る（RULES 5）
window.__juso = { S, Compare, Forest, List, Lanes, level, seek };
