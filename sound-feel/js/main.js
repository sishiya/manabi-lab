// 心地よい音・いやな音 — メイン（状態・つまみ→計算→音と描画・ツアー・デバッグ用の窓口）
// 読み込み順: psycho.js → synth.js → draw.js → ui.js → main.js
'use strict';
window.__sofeErr = [];
window.addEventListener('error', e => window.__sofeErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__sofeErr.push(String(e.reason)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const P = Object.assign({}, UI.BASE);
const S = { res: null, curve: null, trail: [], dv: 0, da: 0, hl: 'map', step: 0, P, dirty: true, mine: [], placing: false, layout: null };

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.dirty = true;
}
// つまみが動いた → 計算し直して音に送る（音色・高さ・大きさが変わったら音程の曲線も）
const CURVE_KEYS = ['f0', 'bright', 'stretch', 'level'];
function recompute(k) {
  S.res = Psycho.analyze(P);
  if (!S.curve || !k || CURVE_KEYS.includes(k)) S.curve = Psycho.roughCurve(P);
  Synth.send(S.res.parts, P);
  UI.showVals(S.res);
  S.dirty = true;
}
function step(dt) {
  // 点はなめらかに追いかけ、跡を残す
  const k = 1 - Math.exp(-dt / 0.15);
  const tv = S.res.valence, ta = S.res.arousal;
  const moved = Math.abs(tv - S.dv) + Math.abs(ta - S.da) > 1e-3;
  S.dv += (tv - S.dv) * k; S.da += (ta - S.da) * k;
  if (moved) {
    const l = S.trail[S.trail.length - 1];
    if (!l || Math.hypot(l[0] - S.dv, l[1] - S.da) > 0.01) { S.trail.push([S.dv, S.da]); if (S.trail.length > 80) S.trail.shift(); }
    S.dirty = true;
  }
}
function draw() { Draw.all(g, cv.clientWidth, cv.clientHeight, S); S.dirty = false; }

// ---- タブとツアー ----
const $text = document.getElementById('tourText'), $next = document.getElementById('next'), $tabs = document.getElementById('tabs');
UI.TOUR.forEach((T, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = T.tab; b.setAttribute('role', 'tab');
  b.addEventListener('click', () => { if (!Synth.on && i > 0) togglePlay(); goStep(i); });   // タブを押したら音も出す（押した操作の中で鳴らす）
  $tabs.appendChild(b);
});
function goStep(i) {
  const T = UI.TOUR[i];
  S.step = i;
  if (T.set) Object.assign(P, UI.BASE, T.set);   // 自由に（set なし）は、いまの音のまま
  UI.sync(P); UI.show(T.keys, T.fresh);
  $me.classList.toggle('new', !!T.fresh && T.fresh.includes('me'));
  $me.hidden = i === 0;
  S.hl = T.hl;
  [...$tabs.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
  $tabs.children[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $text.textContent = T.t;
  $next.textContent = T.btn || 'つぎへ ▶';
  setPlacing(false);
  recompute();
}
$next.addEventListener('click', () => {
  if (S.step === 0 && !Synth.on) togglePlay();
  goStep(S.step + 1 >= UI.TOUR.length ? 1 : S.step + 1);
});

// ---- じぶんの感じ方を地図に置く（記録はこの画面の中だけ。保存しない） ----
const $me = document.getElementById('me'), $clear = document.getElementById('clearMe');
function setPlacing(on) {
  S.placing = on; S.dirty = true;
  $me.setAttribute('aria-pressed', String(on));
  $me.textContent = on ? '地図をタップして置く（やめる）' : '● じぶんの感じ方を置く';
  cv.style.cursor = on ? 'crosshair' : 'default';
}
$me.addEventListener('click', () => setPlacing(!S.placing));
$clear.addEventListener('click', () => { S.mine = []; $clear.hidden = true; S.dirty = true; });
cv.addEventListener('pointerdown', (e) => {
  if (!S.placing || !S.layout) return;
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, m = S.layout.map;
  const v = (x - m.cx) / (m.rx * 0.92), a = -(y - m.cy) / (m.ry * 0.92);
  if (Math.abs(v) > 1.15 || Math.abs(a) > 1.15) return;   // 地図の外
  S.mine.push({ est: [S.res.valence, S.res.arousal], me: [Math.max(-1, Math.min(1, v)), Math.max(-1, Math.min(1, a))], n: S.mine.length + 1 });
  if (S.mine.length > 8) S.mine.shift();
  $clear.hidden = false;
  setPlacing(false);
});

// ---- 音を出す・止める ----
const $play = document.getElementById('play');
async function togglePlay() {
  try {
    if (Synth.on) Synth.stop(); else await Synth.start();
  } catch (e) { window.__sofeErr.push('audio: ' + e.message); }
  $play.textContent = Synth.on ? '■ 止める' : '▶ 音を出す';
  $play.setAttribute('aria-pressed', String(Synth.on));
}
$play.addEventListener('click', togglePlay);
document.addEventListener('visibilitychange', () => { if (document.hidden && Synth.on) togglePlay(); });   // 見ていないタブで鳴りつづけない

UI.build(P, recompute);
UI.buildVals();
goStep(0);
S.dv = S.res.valence; S.da = S.res.arousal;

let last = performance.now();
function loop(now) { requestAnimationFrame(loop); step(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now; /* 最初のコマは now が last より前のことがある */ if (S.dirty) draw(); }
window.addEventListener('resize', resize);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・つまみを入れる・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__sofe = {
  S, P, goStep, setPlacing,
  set(o) { Object.assign(P, o); UI.sync(P); recompute(); return { N: S.res.N, S: S.res.S, R: S.res.R, v: S.res.valence, a: S.res.arousal }; },
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); draw(); },
};
