// 雲ができるまで — 画面の組み立てと、Worker とのやりとり
'use strict';
window.__clgrErr = [];
window.addEventListener('error', e => window.__clgrErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const { SCENES } = globalThis.CS;
const cv = $('cv'), ov = $('ov'), view = globalThis.CV.make(cv, ov), worker = new Worker('js/sim-worker.js?v=1');
const S = { scene: SCENES[0], meta: null, frame: null, running: true, times: [], viewIdx: -1, dragging: false, tool: 'heat', prof: null, cl: null, t: 0, ctl: {} };

const LEGEND = [
  '白いところが雲です。下の灰色は雲の影、雨と雪は細い灰色で見えます。',
  '赤い所はのぼる風、青い所はおりる風です。',
  '赤い所は最初の空よりあたたかく、青い所は冷たい場所です（±4℃ まで色がつきます）。',
  '青の濃さは湿り具合（水蒸気）、水色は水滴、紫は氷の粒、青は雨、白は雪です。※ 色分けは見やすくするための目印です。',
];
const SL = {
  heat: { label: '地面の温度', min: -5, max: 5, step: 0.5, value: 0, fmt: v => (v > 0 ? '+' : '') + v + '℃' },
  humid: { label: '湿り具合', min: -20, max: 20, step: 2, value: 0, fmt: v => (v > 0 ? '+' : '') + v + '%' },
  wind: { label: '風の強さ', min: 0.5, max: 1.5, step: 0.1, value: 1, fmt: v => '×' + v.toFixed(1) },
};

function buildScenes() {
  const box = $('scenes');
  for (const s of SCENES) {
    const b = document.createElement('button');
    b.dataset.id = s.id; b.innerHTML = `<b>${s.name}</b><small>${s.tag}</small>`;
    b.onclick = () => select(s.id);
    box.appendChild(b);
  }
}
function select(id) {
  const s = S.scene = SCENES.find(x => x.id === id);
  document.querySelectorAll('#scenes button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  $('scName').textContent = s.name + '（' + s.tag + '）';
  $('scWhy').textContent = s.why; $('scCalc').textContent = s.calc; $('scFixed').textContent = s.given;
  $('scNote').textContent = s.note || ''; $('scNote').hidden = !s.note;
  const box = $('sliders'); box.innerHTML = ''; S.ctl = {};
  for (const k of s.sliders) {
    const d = SL[k], w = document.createElement('label');
    w.className = 'slider';
    w.innerHTML = `<span>${d.label}</span><output>${d.fmt(d.value)}</output><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.value}">`;
    const inp = w.querySelector('input'), out = w.querySelector('output');
    inp.oninput = () => {
      const v = +inp.value; out.textContent = d.fmt(v);
      worker.postMessage({ type: 'ctl', key: k, v: k === 'humid' ? v / 100 : v });
      setStatus(`${d.label}を ${d.fmt(v)} にしました。雲の変化を見てください。`, true);
    };
    box.appendChild(w);
  }
  $('legend').textContent = LEGEND[view ? view.mode : 0];
  setStatus('計算をはじめています…');
  worker.postMessage({ type: 'load', id });
}
let statusHold = 0;
function setStatus(t, hold) { $('status').textContent = t; statusHold = hold ? performance.now() + 2600 : 0; }
function fmtT(sec) {
  if (sec < 3600) return Math.floor(sec / 60) + '分';
  const h = Math.floor(sec / 3600), m = Math.floor((sec - h * 3600) / 60);
  return h + '時間' + (m ? m + '分' : '');
}
function setRead(cl, m) {
  const km = v => v === null || v === undefined ? '—' : (v >= 1000 ? (v / 1000).toFixed(2) + ' km' : Math.round(v) + ' m');
  $('reads').innerHTML = [['雲の底', km(cl.base)], ['雲のてっぺん', km(cl.top)], ['空に占める割合', cl.base === null ? '0%' : Math.round(cl.cover * 100) + '%'], ['地面の雨', m.rainRate > 0.005 ? m.rainRate.toFixed(1) + ' mm/時' : '0']].map(([a, b]) => `<div>${a}<b>${b}</b></div>`).join('');
}
worker.onmessage = e => {
  const m = e.data;
  if (m.type === 'meta') {
    S.meta = { ...m, cropCx: S.scene.cropCx, terrain: S.scene.terrain, viewDepth: S.scene.viewDepth };
    if (view) view.setMeta(S.meta);
  } else if (m.type === 'frame') {
    S.frame = m; S.t = m.t; S.times = m.times; S.viewIdx = m.viewIdx; S.running = m.running;
    if (m.prof) S.prof = m.prof;
    S.cl = m.cl;
    if (view) { view.setField(m.A, m.B, S.meta.nx, S.meta.nz); view.bands = m.bands || null; }
    needDraw = true;
    $('clName').textContent = m.cl.name;
    setRead(m.cl, m);
    if (!S.dragging) $('track').value = Math.round(m.t / S.meta.horizon * 1000);
    paintTrack();
    $('time').textContent = fmtT(m.t);
    $('play').textContent = m.running ? '⏸' : '▶';
    if (performance.now() > statusHold) {
      if (m.viewIdx >= 0) setStatus(`${fmtT(m.t)}の空を見ています。▶ を押すと、ここから計算しなおします。`);
      else if (!m.running && m.t >= S.meta.horizon - 1) setStatus('おしまいです。「この種類をはじめから」か、上のバーで前に戻れます。');
      else if (!m.running) setStatus('止めています。▶ で続きを計算します。');
      else setStatus(`計算中…（${Math.round(m.realSpeed)}倍の速さ）`);
    }
  } else if (m.type === 'error') { $('err').hidden = false; $('err').textContent = m.text; }
};
function paintTrack() {
  const v = S.times.length ? S.times[S.times.length - 1] / S.meta.horizon * 100 : 0;
  $('track').style.background = `linear-gradient(90deg,rgba(159,212,255,.5) ${v}%,rgba(255,255,255,.08) ${v}%)`;
}

// 再生ボタン・タイムバー
$('play').onclick = () => worker.postMessage({ type: S.running ? 'pause' : 'play' });
$('track').addEventListener('input', () => {
  S.dragging = true;
  const t = +$('track').value / 1000 * S.meta.horizon; let best = 0;
  S.times.forEach((x, i) => { if (Math.abs(x - t) < Math.abs(S.times[best] - t)) best = i; });
  worker.postMessage({ type: 'seek', i: best });
});
$('track').addEventListener('change', () => { S.dragging = false; });
$('reset').onclick = () => { select(S.scene.id); };

// 見え方・道具
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#modes button').forEach(x => x.classList.toggle('on', x === b));
  if (view) { view.mode = +b.dataset.m; needDraw = true; }
  $('legend').textContent = LEGEND[+b.dataset.m];
});
document.querySelectorAll('#tools button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tools button').forEach(x => x.classList.toggle('on', x === b));
  S.tool = b.dataset.t;
});

// 指でなぞる
const wrap = $('viewwrap');
function brushAt(e) { if (!view || !S.meta) return; const p = view.toWorld(e.clientX, e.clientY); worker.postMessage({ type: 'brush', b: { x: p.x, z: p.z, kind: S.tool } }); }
wrap.addEventListener('pointerdown', e => {
  wrap.setPointerCapture(e.pointerId); brushAt(e);
  setStatus({ heat: '空気をあたためています…', cool: '空気を冷やしています…', wet: '空気を湿らせています…' }[S.tool], true);
});
wrap.addEventListener('pointermove', e => { if (e.buttons || e.pressure > 0) brushAt(e); });
const brushEnd = () => worker.postMessage({ type: 'brush', b: null });
wrap.addEventListener('pointerup', brushEnd); wrap.addEventListener('pointercancel', brushEnd);

let needDraw = false;
function loop() {
  if (needDraw && view) { view.draw(); needDraw = false; }
  requestAnimationFrame(loop);
}
window.addEventListener('resize', () => { if (view) { view.layout(); needDraw = true; } });
setInterval(() => { if (S.prof) globalThis.CC.draw($('chart'), S.meta, S.prof, S.cl); }, 500);

cv.addEventListener('webglcontextlost', e => { e.preventDefault(); $('err').hidden = false; $('err').textContent = '画面の描画が止まりました。自動で読み直します…'; });
cv.addEventListener('webglcontextrestored', () => { location.hash = S.scene.id; location.reload(); });
if (!view) { $('err').hidden = false; $('err').textContent = 'このブラウザでは WebGL2 が使えないため、表示できません。'; }
buildScenes();
const hash = location.hash.replace('#', '');
select(SCENES.some(s => s.id === hash) ? hash : SCENES[0].id);
requestAnimationFrame(loop);

// デバッグ用
window.__clgr = { S, worker, select, view };
