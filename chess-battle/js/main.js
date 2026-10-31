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
const S = { ply: 0, queue: [], playing: null, minWait: 0, cam: 'auto', t: 0, look: new THREE.Vector3(), camGoal: new THREE.Vector3(), ready: false, auto: false, autoWait: 0 };
const PNAME = { p: 'ポーン（砲艇）', n: 'ナイト（潜水艦）', b: 'ビショップ（帆船）', r: 'ルーク（蒸気船）', q: 'クイーン（帆と蒸気の艦）', k: 'キング（旗艦）' };

$('gameTitle').textContent = `${game.title}（${game.date.slice(0, 5)}）`;
$('players').textContent = `白: ${game.white}　黒: ${game.black}。${game.place}。${game.how}。`;
$('speed').textContent = `船の動き ×${TIME}`;   // 波・煙・水しぶきは本当の速さ
for (const s of game.sources) {
  const li = document.createElement('li'), a = document.createElement('a');
  a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.text; li.appendChild(a); $('sources').appendChild(li);
}

let W = null, controls = null;
try {
  W = await createWorld($('cv'), (n, all) => { $('loading').textContent = `艦隊を集めています… ${n} / ${all}`; });
} catch (e) { window.__chbaErr.push('読みこみ: ' + e); $('loading').textContent = '船のモデルを読みこめませんでした。'; throw e; }
$('loading').hidden = true;
controls = new OrbitControls(W.camera, $('cv'));
controls.enabled = false; controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 8; controls.maxDistance = 1200;
const U = W.SQ / 8;   // カメラの距離の倍率（1マスの広さに合わせる。海戦は 1マス 40 m）

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
  S.queue = []; S.playing = null; W.setSlow(1); W.showNet(null); banner(null);
  S.ply = Math.max(0, Math.min(rec.plies.length, ply));
  const lastP = rec.plies[S.ply - 1];
  W.setState(rec.states[S.ply], rec.tension[S.ply], lastP && lastP.mate ? (lastP.color === 'w' ? 'b' : 'w') : null); showPly(S.ply);
}
function next() {
  if (S.playing || S.queue.length) { fastForward(); return; }   // 動いている途中なら、場面の終わりまで計算を早送り（置きなおすと船の向きが前へ戻ってしまう）
  if (S.ply >= rec.plies.length) { seek(0); return; }
  const [a, b] = rec.scenes[sceneIndex(S.ply + 1)];
  for (let k = Math.max(a, S.ply + 1); k <= b; k++) S.queue.push(k);
}
// 動いている途中の場面を、描かずに計算だけで終わりまで進める（船の向きと位置はつながったまま）
function fastForward() {
  for (let i = 0; i < 6000 && (S.playing || S.queue.length); i++) stepPlay(0.1);
  W.setSlow(1);
}
function prev() {   // ひとつ前の場面の初めへ（再生中なら、いまの場面の初めへ）
  if (S.playing || S.queue.length) { seek(rec.scenes[sceneIndex(S.ply)][0] - 1); return; }
  const i = sceneIndex(S.ply);
  seek(i <= 0 ? 0 : rec.scenes[i][0] - 1);
}

function stepPlay(dt) {
  if (!S.playing && S.queue.length) {
    const k = S.queue.shift(), p = rec.plies[k - 1];
    S.playing = p; S.minWait = 0.4; W.playPly(p, rec.tension[k], rec.states[k]);
    S.ply = k; showPly(k, true);
    // 見せ場: 捨て駒と詰みは、ゆっくり（船の動き ×2）・王をねらう線・大きな札
    W.showNet(p.sac || p.mate ? p.net : null, p.mate);
    if (p.sac || p.mate) W.setSlow(0.35);
    if (p.sac) banner('捨て駒！', `${PNAME[p.piece]}を差し出す。取られても、王をねらう道が開く`);
    else banner(null);
  }
  W.step(dt);
  if (S.playing) {
    S.minWait -= dt;
    if (S.minWait <= 0 && !W.busy()) {
      const p = S.playing; S.playing = null; if (!S.queue.length) showPly(S.ply);
      if (p.mate) banner('チェックメイト', '王の逃げ道（d7・d8・e7）はすべてねらわれ、f7・f8 は味方の船でふさがっている。白の勝ち', true);
      else W.setSlow(1);
    }
  }
  // 通して見る: 場面が終わったら少し間をおいて、つぎの場面へ
  if (S.auto && !S.playing && !S.queue.length) {
    S.autoWait -= dt;
    if (S.autoWait <= 0) { if (S.ply >= rec.plies.length) setAuto(false); else { next(); S.autoWait = 1.5; } }
  }
}

// カメラ: おまかせ＝動く部隊のうしろから地面の近くで追う（止まっているときは白の側から全体）、真上＝盤のように、自由＝ドラッグとピンチ
const fwd = new THREE.Vector3();
function stepCam(dt) {
  const c = W.camera, asp = c.aspect || 1, k = 1 / Math.min(1, asp * 1.15);
  if (S.cam === 'free') { controls.update(); return; }
  if (S.cam === 'top') {
    const h = (64 + 14) * U / (2 * Math.tan(c.fov * Math.PI / 360) * Math.min(1, asp));
    S.camGoal.set(0, h, 0.01); S.look.lerp(new THREE.Vector3(0, 0, (asp < 1 ? 6 : 3) * U), 1 - Math.exp(-dt * 4));
  } else {
    const f = W.focus(), lastP = rec.plies[S.ply - 1];
    S.idleT = f ? 0 : (S.idleT || 0) + dt;
    if (!f && lastP && lastP.mate && lastP.net) {   // 詰み: 王のまわりをゆっくり回り、王とねらう船が一度に入るように
      const kq = W.sqXZ(lastP.net.king), R = 26 * U * k, a = S.t * 0.06;
      S.look.lerp(new THREE.Vector3(kq.x, 2 * U, kq.z + 1.5 * U), 1 - Math.exp(-dt * 1.5));
      S.camGoal.set(kq.x + Math.sin(a) * R, 11 * U * k, kq.z + Math.cos(a) * R);
    } else if (f) {
      fwd.set(Math.sin(f.face), 0, Math.cos(f.face));
      const at = new THREE.Vector3(f.x, height(f.x, f.z), f.z);
      const tgt = at.clone().addScaledVector(fwd, (f.clash ? 0 : 5) * U); tgt.y += 1.4 * U;
      S.look.lerp(tgt, 1 - Math.exp(-dt * 2.5));
      // ぶつかり合いは横から低く、行軍はうしろから
      const side = f.clash ? new THREE.Vector3(fwd.z, 0, -fwd.x) : fwd.clone().negate();
      const goal = at.clone().addScaledVector(side, (f.clash ? 17 : 12) * k * U); goal.y += (f.clash ? 5 : 4) * k * U;
      goal.x += 5 * Math.sin(S.t * 0.15);
      S.camGoal.lerp(goal, 1 - Math.exp(-dt * 3));
    } else if (S.idleT > 4 || S.ply === 0) {   // 長く止まったときだけ白の側から全体へ引く（手ごとに引くと区切れて見える）
      S.look.lerp(new THREE.Vector3(0, U, -4 * U), 1 - Math.exp(-dt * 0.8));
      S.camGoal.set(Math.sin(S.t * 0.05) * 26 * U, 16 * k * U, 66 * k * U);
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
$('teamBtn').addEventListener('click', () => { const on = !$('teamBtn').classList.contains('on'); $('teamBtn').classList.toggle('on', on); W.setTeam(on); });
$('markBtn').addEventListener('click', () => { const on = !$('markBtn').classList.contains('on'); $('markBtn').classList.toggle('on', on); W.setMarkers(on); });
function setAuto(on) { S.auto = on; S.autoWait = 0.3; $('autoBtn').textContent = on ? '■ とめる' : '▶ 通して見る'; $('autoBtn').classList.toggle('on', on); if (on && S.ply >= rec.plies.length) seek(0); }
$('autoBtn').addEventListener('click', () => setAuto(!S.auto));
// 見せ場の札（画面の真ん中に大きく。数秒で消える）
let bannerT = 0;
function banner(title, sub, stay = false) {
  const b = $('banner');
  if (!title) { b.classList.remove('show'); return; }
  b.querySelector('b').textContent = title; b.querySelector('span').textContent = sub || '';
  b.classList.toggle('mate', title === 'チェックメイト'); b.classList.add('show'); bannerT = stay ? 1e9 : 5;
}
buildSlider(rec, seek); buildMoves(rec, seek);

function step(dt) { S.t += dt; stepPlay(dt); stepCam(dt); if (bannerT > 0 && (bannerT -= dt) <= 0) banner(null); }
function resize() { W.resize(); drawMini($('mini'), rec.states[S.ply], rec.plies[S.ply - 1]); }
let last = performance.now();
function loop(now) { step(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now; /* 最初のコマは now が last より前のことがある */ W.render(); requestAnimationFrame(loop); }
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('cv'));
seek(0); S.look.set(0, U, -4 * U); W.camera.position.set(0, 16 * U, 66 * U);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__chba = { S, rec, W, seek, next, prev, setCam, setAuto, fastForward, simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); W.render(); } };
