// 名局の戦場 — メイン（棋譜を読み、場面ごとに部隊を動かす。デバッグ用の窓口 window.__chba）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Chess } from '../../lib/chess.js@1.4.0/dist/esm/chess.js';
import { GAMES } from './games.js';
import { build } from './record.js';
import { createWorld, TIME, height } from './world.js';
import { drawMini, setMaterial, buildSlider, buildMoves, markMove } from './ui.js';
window.__chbaErr = window.__chbaErr || [];
window.addEventListener('error', e => window.__chbaErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__chbaErr.push(String(e.reason)));

const $ = id => document.getElementById(id);
const game = GAMES[0];
const rec = build(game, Chess);

// S.ply = いま見えている局面（0 = 初め）。queue = これから動かす手
const S = { ply: 0, queue: [], playing: null, minWait: 0, cam: 'auto', t: 0, look: new THREE.Vector3(), camGoal: new THREE.Vector3(), ready: false };

$('gameTitle').textContent = `${game.title}（${game.date.slice(0, 5)}）`;
$('players').textContent = `白: ${game.white}　黒: ${game.black}。${game.place}。${game.how}。`;
$('speed').textContent = `×${TIME} 倍速`;
for (const s of game.sources) {
  const li = document.createElement('li'), a = document.createElement('a');
  a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.text; li.appendChild(a); $('sources').appendChild(li);
}

let W = null, controls = null;
try {
  W = await createWorld($('cv'));
} catch (e) { window.__chbaErr.push('読みこみ: ' + e); $('loading').textContent = '兵士のモデルを読みこめませんでした。'; throw e; }
$('loading').hidden = true;
controls = new OrbitControls(W.camera, $('cv'));
controls.enabled = false; controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 4; controls.maxDistance = 220;

function caption(p) {
  $('capMove').textContent = p ? `${p.num} ${p.san}${p.mark}` : '';
  $('capText').textContent = p ? p.note : `${game.title} — 白: ${game.white}／黒: ${game.black}。「つぎへ」で始まります。`;
  $('caption').classList.toggle('sac', !!(p && p.sac));
  $('caption').classList.toggle('mate', !!(p && p.mate));
}
function showPly(ply, moving = false) {   // 文字・隅の盤・帯を ply の局面に合わせる（動いているあいだ、隅の盤は動く前の局面に from→to を光らせる）
  const p = rec.plies[ply - 1] || null, st = moving ? ply - 1 : ply;
  caption(p); drawMini($('mini'), rec.states[st], p); setMaterial(rec.material[st]); markMove(ply); W.showMarks(p);
  const m = rec.material[st], d = m.w - m.b;
  $('matChip').textContent = `駒の点数 白 ${m.w} : 黒 ${m.b}` + (d < 0 ? `（白 ${d}）` : d > 0 ? `（白 +${d}）` : '');
  $('where').textContent = `${ply} / ${rec.plies.length} 手`;
  $('next').textContent = ply >= rec.plies.length ? 'はじめから' : 'つぎへ';
  $('prev').disabled = ply === 0 && !S.playing;
}
const sceneIndex = ply => rec.scenes.findIndex(s => s[0] <= ply && ply <= s[1]);

// スライダー・手の一覧・もどる: 動きを止めてその局面に置く
function seek(ply) {
  S.queue = []; S.playing = null;
  S.ply = Math.max(0, Math.min(rec.plies.length, ply));
  W.setState(rec.states[S.ply], rec.tension[S.ply]); showPly(S.ply);
}
function next() {
  if (S.playing || S.queue.length) { seek(S.queue.length ? S.queue[S.queue.length - 1] : S.playing.ply); return; }   // 動いている途中なら場面の終わりまで飛ばす
  if (S.ply >= rec.plies.length) { seek(0); return; }
  const [a, b] = rec.scenes[sceneIndex(S.ply + 1)];
  for (let k = Math.max(a, S.ply + 1); k <= b; k++) S.queue.push(k);
}
function prev() {   // ひとつ前の場面の初めへ（再生中なら、いまの場面の初めへ）
  if (S.playing || S.queue.length) { seek(rec.scenes[sceneIndex(S.ply)][0] - 1); return; }
  const i = sceneIndex(S.ply);
  seek(i <= 0 ? 0 : rec.scenes[i][0] - 1);
}

function stepPlay(dt) {
  if (!S.playing && S.queue.length) {
    const k = S.queue.shift(), p = rec.plies[k - 1];
    S.playing = p; S.minWait = 0.4; W.playPly(p, rec.tension[k]);
    S.ply = k; showPly(k, true);
  }
  W.step(dt);
  if (S.playing) { S.minWait -= dt; if (S.minWait <= 0 && !W.busy()) { S.playing = null; if (!S.queue.length) showPly(S.ply); } }
}

// カメラ: おまかせ＝動く部隊のうしろから地面の近くで追う（止まっているときは白の側から全体）、真上＝盤のように、自由＝ドラッグとピンチ
const fwd = new THREE.Vector3();
function stepCam(dt) {
  const c = W.camera, asp = c.aspect || 1, k = 1 / Math.min(1, asp * 1.15);
  if (S.cam === 'free') { controls.update(); return; }
  if (S.cam === 'top') {
    const h = (64 + 14) / (2 * Math.tan(c.fov * Math.PI / 360) * Math.min(1, asp));
    S.camGoal.set(0, h, 0.01); S.look.lerp(new THREE.Vector3(0, 0, asp < 1 ? 6 : 3), 1 - Math.exp(-dt * 4));
  } else {
    const f = W.focus();
    S.idleT = f ? 0 : (S.idleT || 0) + dt;
    if (f) {
      fwd.set(Math.sin(f.face), 0, Math.cos(f.face));
      const at = new THREE.Vector3(f.x, height(f.x, f.z), f.z);
      const tgt = at.clone().addScaledVector(fwd, f.clash ? 0 : 5); tgt.y += 1.4;
      S.look.lerp(tgt, 1 - Math.exp(-dt * 2.5));
      // ぶつかり合いは横から低く、行軍はうしろから
      const side = f.clash ? new THREE.Vector3(fwd.z, 0, -fwd.x) : fwd.clone().negate();
      const goal = at.clone().addScaledVector(side, (f.clash ? 17 : 14) * k); goal.y += (f.clash ? 6 : 6.5) * k;
      goal.x += 5 * Math.sin(S.t * 0.15);
      S.camGoal.lerp(goal, 1 - Math.exp(-dt * 3));
    } else if (S.idleT > 4 || S.ply === 0) {   // 長く止まったときだけ白の側から全体へ引く（手ごとに引くと区切れて見える）
      S.look.lerp(new THREE.Vector3(0, 1, -4), 1 - Math.exp(-dt * 0.8));
      S.camGoal.set(Math.sin(S.t * 0.05) * 26, 26 * k, 66 * k);
    }
  }
  c.position.lerp(S.camGoal, 1 - Math.exp(-dt * (S.cam === 'top' ? 4 : 1.6)));
  if (S.cam === 'top') c.up.set(0, 0, -1); else c.up.set(0, 1, 0);   // 真上は画面の上が黒の側
  c.lookAt(S.look);
}
function setCam(mode) {
  S.cam = mode;
  for (const b of document.querySelectorAll('#cam button[data-cam]')) b.classList.toggle('on', b.dataset.cam === mode);
  controls.enabled = mode === 'free';
  if (mode === 'free') { controls.target.copy(S.look); controls.update(); }
}

$('next').addEventListener('click', next);
$('prev').addEventListener('click', prev);
for (const b of document.querySelectorAll('#cam button[data-cam]')) b.addEventListener('click', () => setCam(b.dataset.cam));
$('gridBtn').addEventListener('click', () => { const on = !$('gridBtn').classList.contains('on'); $('gridBtn').classList.toggle('on', on); W.setGrid(on); });
buildSlider(rec, seek); buildMoves(rec, seek);

function step(dt) { S.t += dt; stepPlay(dt); stepCam(dt); }
function resize() { W.resize(); drawMini($('mini'), rec.states[S.ply], rec.plies[S.ply - 1]); }
let last = performance.now();
function loop(now) { step(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now; /* 最初のコマは now が last より前のことがある */ W.render(); requestAnimationFrame(loop); }
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('cv'));
seek(0); S.look.set(0, 1, -4); W.camera.position.set(0, 30, 70);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__chba = { S, rec, W, seek, next, prev, setCam, simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); W.render(); } };
