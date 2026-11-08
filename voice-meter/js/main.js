// 声のものさし — 画面（録る・見本の声・カード・時間）。計算は js/engine、図は js/lens.js
import { analyzeVoice } from './engine/analyze.js';
import { presetVoice, PRESETS } from './engine/synth.js';
import { hann, powerSpec, db } from './engine/dsp.js';
import { PARAMS, GROUPS, MAIN, byId, SOURCES } from './catalog.js';
import { LENS, drawLive, clear } from './lens.js';
import { startMic, stopMic, isRecording, startPlay, stopPlay, isPlaying, playTime } from './record.js';

window.__vomeErr = [];
window.addEventListener('error', e => window.__vomeErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__vomeErr.push(String(e.reason)));

const $ = id => document.getElementById(id);
const cv = $('cv'), g = cv.getContext('2d');
const MAX = { hold: 4, speech: 12 };
const WHY = {
  quiet: '声が小さくて測れませんでした。マイクの近くでもう一度どうぞ。',
  short: '短すぎて測れませんでした。もう少し長くどうぞ。',
  unvoiced: '声帯のふるえが見つかりませんでした（ささやき声や雑音だけのときも出ます）。',
};
const S = { mode: 'hold', R: null, sel: 'f0_med', t: 0, source: '', sample: null, live: null };

function setStatus(msg, bad) { const e = $('status'); e.textContent = msg; e.classList.toggle('bad', !!bad); e.hidden = !msg; }

function fit() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (r.width < 1 || r.height < 1) return;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (S.live) return;
  clear(g, w, h);
  if (!S.R) return;
  const p = byId[S.sel];
  LENS[p.lens](g, w, h, S.R, S.t, p);
  $('nowName').textContent = p.name;
  const v = S.R.value[p.id];
  $('nowVal').textContent = Number.isFinite(v) ? `${v.toFixed(p.dp)} ${p.unit}` : '—';
  $('nowSrc').textContent = S.source;
}

const axisPct = (p, v) => {
  const [a, b, kind] = p.axis, u = kind === 'log' ? Math.log(v / a) / Math.log(b / a) : (v - a) / (b - a);
  return Math.max(0, Math.min(100, u * 100));
};
const needs = p => ({ hold: '「あー」をのばして測れます', speech: 'ふつうに話して測れます' }[p.mode]);

function card(p) {
  const b = document.createElement('button');
  b.className = 'card'; b.type = 'button'; b.dataset.id = p.id;
  b.innerHTML = `<div class="head"><span class="name"></span><span class="tier ${p.tier}">${p.tier}</span><span class="v"></span></div><div class="bar"><i></i></div><p class="mean"></p><p class="how" hidden></p>`;
  b.querySelector('.name').textContent = p.name;
  b.querySelector('.mean').textContent = p.meaning;
  b.querySelector('.how').textContent = '測り方: ' + p.how;
  b.addEventListener('click', () => select(p.id));
  return b;
}
function buildCards() {
  const main = $('main'); main.textContent = '';
  MAIN.forEach(id => main.appendChild(card(byId[id])));
  const more = $('more'); more.textContent = '';
  for (const [g0, name, sub] of GROUPS) {
    const d = document.createElement('details'); d.className = 'more';
    d.innerHTML = `<summary>${name} <small>${sub}</small></summary>`;
    PARAMS.filter(p => p.g === g0 && !MAIN.includes(p.id)).forEach(p => d.appendChild(card(p)));
    more.appendChild(d);
  }
}
function fillCards() {
  document.querySelectorAll('.card').forEach(c => {
    const p = byId[c.dataset.id], v = S.R ? S.R.value[p.id] : NaN, ok = Number.isFinite(v);
    c.classList.toggle('na', !ok);
    c.querySelector('.v').innerHTML = ok ? `${v.toFixed(p.dp)}<small>${p.unit}</small>` : (S.R && p.mode !== 'both' && p.mode !== S.R.mode ? needs(p) : '測れませんでした');
    c.querySelector('.bar i').style.left = ok ? axisPct(p, v) + '%' : '-99px';
    c.classList.toggle('sel', p.id === S.sel);
    c.querySelector('.how').hidden = p.id !== S.sel;
  });
}
function select(id) {
  S.sel = id;
  fillCards();
  draw();
}

function setResult(R, source) {
  S.R = R; S.t = Math.min(0.5, R.dur / 2); S.source = source;
  const t = $('time'); t.max = R.dur; t.value = S.t;
  $('timebar').hidden = false;
  fillCards(); draw();
}
function setMode(m) {
  S.mode = m;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
  $('rec').textContent = '● 録音する（' + MAX[m] + '秒まで）';
}

function highNote(R) {
  return R.value.f0_med > 250 ? ' 高い声はフォルマントが近くの倍音に引かれやすく、F1 の誤差が大きくなります。' : '';
}
function loadSample(id) {
  stopPlay();
  setStatus('見本の声を計算しています…');
  document.querySelectorAll('.chips button').forEach(b => b.classList.toggle('cur', b.dataset.p === id));
  setTimeout(() => {
    const v = presetVoice(id, S.mode), R = analyzeVoice(v.x, v.sr, { mode: S.mode });
    S.sample = id;
    if (!R.ok) return setStatus(WHY[R.why], true);
    setResult(R, `見本（合成）: ${PRESETS[id].name}`);
    $('erase').hidden = true;
    setStatus(`合成した見本「${PRESETS[id].name}」を${S.mode === 'hold' ? 'のばす声' : '話し声'}で測りました。設定して作った声で、実在の人の声ではありません。${highNote(R)}`);
  }, 30);
}

// ----- 録音 -----
const LIVE_N = 1024, LIVE_COLS = 300, LIVE_ROWS = 128;
function liveCanvas() {
  const c = document.createElement('canvas'); c.width = LIVE_COLS; c.height = LIVE_ROWS;
  const x = c.getContext('2d'); x.fillStyle = '#0c141c'; x.fillRect(0, 0, LIVE_COLS, LIVE_ROWS);
  return { c, x, col: 0 };
}
async function startRec() {
  stopPlay();
  const chunks = []; let got = 0;
  try {
    setStatus('マイクの許可を待っています…');
    const info = await startMic(ch => { chunks.push(ch); got += ch.length; });
    S.live = { ...liveCanvas(), chunks, sr: info.sr, got: () => got, warn: info.warn, last: 0, win: hann(LIVE_N) };
    $('rec').classList.add('on'); $('rec').textContent = '■ 止めて測る';
    setStatus(S.mode === 'hold' ? '「あー」と同じ高さでのばしてください。' : 'ふつうに話してください。');
    requestAnimationFrame(liveLoop);
  } catch (e) {
    stopMic(); S.live = null;
    setStatus(e && e.name === 'NotAllowedError' ? 'マイクが許可されませんでした。下の「見本の声」で試せます。' : 'マイクを開けませんでした。下の「見本の声」で試せます。', true);
  }
}
function liveLoop() {
  const L = S.live;
  if (!L) return;
  const sec = L.got() / L.sr;
  if (sec >= MAX[S.mode]) return finishRec();
  const all = L.chunks;
  if (all.length) {
    // 新しいぶんだけ 1 列ずつ足す
    const want = Math.floor(sec / MAX[S.mode] * LIVE_COLS);
    if (want > L.col) {
      const buf = new Float32Array(LIVE_N); let need = LIVE_N, i = all.length - 1;
      while (need > 0 && i >= 0) { const c = all[i--], n = Math.min(need, c.length); buf.set(c.subarray(c.length - n), need - n); need -= n; }
      const p = powerSpec(buf, 0, L.win, LIVE_N), hz = L.sr / LIVE_N;
      for (; L.col < want; L.col++) for (let r = 0; r < LIVE_ROWS; r++) {
        const k = Math.max(1, Math.round((r + 0.5) / LIVE_ROWS * 5500 / hz)), v = Math.max(0, Math.min(1, (db(p[k]) + 40) / 70));
        L.x.fillStyle = `rgb(${14 + 210 * v * v | 0},${26 + 205 * v | 0},${40 + 120 * Math.sqrt(v) | 0})`;
        L.x.fillRect(L.col, LIVE_ROWS - 1 - r, 1, 1);
      }
    }
  }
  drawLive(g, cv.clientWidth, cv.clientHeight, L.c, sec, MAX[S.mode]);
  requestAnimationFrame(liveLoop);
}
function finishRec() {
  const L = S.live;
  if (!L) return;
  S.live = null;
  stopMic();
  $('rec').classList.remove('on'); setMode(S.mode);
  const n = L.got(), x = new Float32Array(n);
  let o = 0; for (const c of L.chunks) { x.set(c, o); o += c.length; }
  L.chunks.length = 0;
  setStatus('計算しています…');
  setTimeout(() => {
    const R = analyzeVoice(x, L.sr, { mode: S.mode });
    if (!R.ok) { draw(); return setStatus(WHY[R.why], true); }
    document.querySelectorAll('.chips button').forEach(b => b.classList.remove('cur'));
    setResult(R, 'あなたの声（' + (S.mode === 'hold' ? 'のばす' : '話す') + '）');
    $('erase').hidden = false;
    const warn = L.warn.length ? ` ※ この端末では ${L.warn.join('・')} を止められず、値がゆがんでいる可能性があります。` : '';
    setStatus(`測りました（声のある時間 ${R.voicedSec.toFixed(1)} 秒）。録音は保存していません。${highNote(R)}${warn}`);
  }, 30);
}

// ----- 画面を離れたら止める（RULES 9章） -----
Power.on({
  pause() {
    stopPlay(); $('play').textContent = '▶ 聞く';
    if (isRecording() || S.live) { S.live = null; stopMic(); $('rec').classList.remove('on'); setMode(S.mode); setStatus('画面を離れたので録音を止めて捨てました。', true); }
  },
});

// ----- 操作 -----
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { if (!S.live) { setMode(b.dataset.m); if (S.sample && $('erase').hidden) loadSample(S.sample); } }));
$('rec').addEventListener('click', () => (S.live ? finishRec() : startRec()));
document.querySelectorAll('.chips button').forEach(b => b.addEventListener('click', () => { if (!S.live) loadSample(b.dataset.p); }));
$('erase').addEventListener('click', () => { stopPlay(); S.R = null; $('erase').hidden = true; $('timebar').hidden = true; fillCards(); draw(); setStatus('録音を消しました。'); });
$('time').addEventListener('input', e => { S.t = +e.target.value; draw(); });

let dragging = false;
function dragTo(e) {
  if (!S.R) return;
  const r = cv.getBoundingClientRect(), u = (e.clientX - r.left - 44) / (r.width - 56);
  S.t = Math.max(0, Math.min(S.R.dur, u * S.R.dur));
  $('time').value = S.t;
  draw();
}
cv.addEventListener('pointerdown', e => { dragging = true; cv.setPointerCapture(e.pointerId); dragTo(e); });
cv.addEventListener('pointermove', e => { if (dragging) dragTo(e); });
const endDrag = () => { dragging = false; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

function playLoop() {
  if (!isPlaying()) return;
  S.t = Math.min(S.R.dur, playTime()); $('time').value = S.t; draw();
  requestAnimationFrame(playLoop);
}
$('play').addEventListener('click', () => {
  if (!S.R) return;
  if (isPlaying()) { stopPlay(); $('play').textContent = '▶ 聞く'; return; }
  const from = S.t >= S.R.dur - 0.05 ? 0 : S.t;
  startPlay(S.R.x, S.R.fs, from, () => { $('play').textContent = '▶ 聞く'; });
  $('play').textContent = '■ 止める';
  requestAnimationFrame(playLoop);
});
window.addEventListener('resize', fit);

// 出どころの一覧
{
  const ul = $('srcs');
  Object.values(SOURCES).forEach(s => { const li = document.createElement('li'); li.textContent = s; ul.appendChild(li); });
}

buildCards();
setMode('hold');
fit();
loadSample('low');
if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

window.__vome = { S, select, loadSample, draw, setMode };
