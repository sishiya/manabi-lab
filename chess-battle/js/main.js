// 名局の戦場 — メイン（棋譜を読み、場面ごとに部隊を動かす。デバッグ用の窓口 window.__chba）
import { Chess } from '../../lib/chess.js@1.4.0/dist/esm/chess.js';
import { GAMES } from './games.js';
import { build } from './record.js';
import { createWorld, sqPos, SQ } from './world.js';
import { drawMini, setMaterial, buildSlider, buildMoves, markMove } from './ui.js';
window.__chbaErr = window.__chbaErr || [];
window.addEventListener('error', e => window.__chbaErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__chbaErr.push(String(e.reason)));

const THREE = window.THREE;
const $ = id => document.getElementById(id);
const game = GAMES[0];
const rec = build(game, Chess);
const W = createWorld($('cv'));
const controls = new THREE.OrbitControls(W.camera, $('cv'));
controls.enabled = false; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 8; controls.maxDistance = 120;

// S.ply = いま見えている局面（0 = 初め）。queue = これから動かす手
const S = { ply: 0, queue: [], playing: null, wait: 0, cam: 'auto', t: 0, look: new THREE.Vector3(), camGoal: new THREE.Vector3() };

$('gameTitle').textContent = `${game.title}（${game.date.slice(0, 5)}）`;
$('players').textContent = `白: ${game.white}　黒: ${game.black}。${game.place}。${game.how}。`;
for (const s of game.sources) {
  const li = document.createElement('li'), a = document.createElement('a');
  a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.text; li.appendChild(a); $('sources').appendChild(li);
}

function caption(p) {
  $('capMove').textContent = p ? `${p.num} ${p.san}${p.sac ? '!' : ''}` : '';
  $('capText').textContent = p ? p.note : `${game.title} — 白: ${game.white}／黒: ${game.black}。「つぎへ」で始まります。`;
  $('caption').classList.toggle('sac', !!(p && p.sac));
  $('caption').classList.toggle('mate', !!(p && p.mate));
}
function showPly(ply) {   // 見た目の文字・盤・帯を ply の局面に合わせる
  const p = rec.plies[ply - 1] || null;
  caption(p); drawMini($('mini'), rec.states[ply], p); setMaterial(rec.material[ply]); markMove(ply);
  const sc = sceneIndex(ply + 1);
  $('where').textContent = `${ply} / ${rec.plies.length} 手`;
  $('next').textContent = ply >= rec.plies.length ? 'はじめから' : 'つぎへ';
  $('prev').disabled = ply === 0 && !S.playing;
  return sc;
}
const sceneIndex = ply => rec.scenes.findIndex(s => s[0] <= ply && ply <= s[1]);

// スライダー・手の一覧・もどる: 動きを止めてその局面に置く
function seek(ply) {
  S.queue = []; S.playing = null; S.wait = 0;
  S.ply = Math.max(0, Math.min(rec.plies.length, ply));
  W.setState(rec.states[S.ply]); W.showMarks(rec.plies[S.ply - 1]); showPly(S.ply);
}
function next() {
  if (S.playing || S.queue.length) { seek(S.queue.length ? S.queue[S.queue.length - 1] : S.playing.ply); return; }   // 動いている途中なら場面の終わりまで飛ばす
  if (S.ply >= rec.plies.length) { seek(0); return; }
  const [a, b] = rec.scenes[sceneIndex(S.ply + 1)];
  for (let k = Math.max(a, S.ply + 1); k <= b; k++) S.queue.push(k);
  S.speed = S.queue.length > 1 ? 1.7 : 1;   // まとめた静かな手は早送り
}
function prev() {
  if (S.playing || S.queue.length) { seek(S.ply); return; }
  const i = sceneIndex(S.ply);
  seek(i <= 0 ? 0 : rec.scenes[i][0] - 1 === S.ply ? rec.scenes[i - 1][0] - 1 : rec.scenes[i][0] - 1);
}

function stepPlay(dt) {
  if (!S.playing && S.queue.length) {
    const k = S.queue.shift(), p = rec.plies[k - 1];
    S.playing = p; S.wait = W.playPly(p, rec.states[k - 1], rec.states[k], S.speed) + 0.25 / S.speed;
    S.ply = k; showPly(k);
  }
  W.step(dt);
  if (S.playing) { S.wait -= dt; if (S.wait <= 0) { S.playing = null; if (!S.queue.length) showPly(S.ply); } }
}

// カメラ: おまかせ＝動く部隊を追う（縦長は寄り）、真上＝ふつうの盤、自由＝ドラッグとピンチ
function stepCam(dt) {
  const c = W.camera, asp = c.aspect || 1;
  if (S.cam === 'free') { controls.update(); return; }
  if (S.cam === 'top') {
    const h = (8 * SQ + 6) / (2 * Math.tan(c.fov * Math.PI / 360) * Math.min(1, asp));
    const lift = asp < 1 ? 6 : 3;   // 下の説明の帯に盤の1段目が隠れないよう、盤を画面の少し上へ
    S.camGoal.set(0, h * 1.08, lift + 0.01); S.look.lerp(new THREE.Vector3(0, 0, lift), 1 - Math.exp(-dt * 6));
  } else {
    const mv = W.moving(), last = rec.plies[S.ply - 1];
    const tgt = mv ? mv.clone() : last ? sqPos(last.to) : new THREE.Vector3();
    const wide = !mv && !last;
    tgt.multiplyScalar(wide ? 0 : asp < 1 ? 0.8 : 0.5);   // 横長は盤の中央寄りに
    S.look.lerp(tgt, 1 - Math.exp(-dt * 2.2));
    // いつも白の側から見る（隅の盤と同じ向き。手番ごとに回りこむと向きがわからなくなる）
    const d = (wide ? 1.15 : asp < 1 ? 0.62 : 0.8) / Math.min(1, asp * 1.2);
    S.camGoal.set(S.look.x + 6 * Math.sin(S.t * 0.07), 26 * d, S.look.z + 30 * d);
  }
  c.position.lerp(S.camGoal, 1 - Math.exp(-dt * 2.0));
  if (S.cam === 'top') c.up.set(0, 0, -1); else c.up.set(0, 1, 0);   // 真上は画面の上が黒の側（真下を向くと上の向きが決まらないため）
  c.lookAt(S.look);
}
function setCam(mode) {
  S.cam = mode;
  for (const b of document.querySelectorAll('#cam button')) b.classList.toggle('on', b.dataset.cam === mode);
  controls.enabled = mode === 'free';
  if (mode === 'free') { controls.target.copy(S.look); controls.update(); }
}

$('next').addEventListener('click', next);
$('prev').addEventListener('click', prev);
for (const b of document.querySelectorAll('#cam button')) b.addEventListener('click', () => setCam(b.dataset.cam));
buildSlider(rec, seek); buildMoves(rec, seek);

function step(dt) { S.t += dt; stepPlay(dt); stepCam(dt); }
function resize() { W.resize(); drawMini($('mini'), rec.states[S.ply], rec.plies[S.ply - 1]); }
let last = performance.now();
function loop(now) { step(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now; /* 最初のコマは now が last より前のことがある */ W.render(); requestAnimationFrame(loop); }
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('cv'));
seek(0); S.look.set(0, 0, 0); W.camera.position.set(0, 40, 44);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__chba = { S, rec, W, seek, next, prev, setCam, simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); W.render(); } };
