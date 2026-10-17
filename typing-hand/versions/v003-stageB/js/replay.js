// 「再現する」モード（段階B〜）: 自分のキーボード（か画面のキーボード）で打ったキーの位置と、押した・離した時刻だけを読み、画面の手が打ち直す。
// 読むのは KeyboardEvent.code（キーの位置）と時刻だけ。打った文字（e.key）は読まない。どこにも保存・送信しない（localStorage にも入れない）。
// 打っているあいだは、手の動きの計算を裏（plan-worker.js）で行い、REC_LAG 秒おくれて手が追いかける。打ちおえたら「通して再生」で全体を計算する
'use strict';
const REC_LAG = 1.5;      // 追いかける表示のおくれ（秒）。手の先回り（LOOK 0.7 秒）と計算の時間（約 0.5 秒）より長く
const REC_WIN = 5;        // 追いかけるときに計算する範囲（いまから何秒前まで）
const REC_MAX_KEYS = 300; // ためておくキーの数（古いものから消す）
const REC = { notes: [], t0: 0, down: {}, dirty: false, busy: false, reqId: 0, home: null };
let PW = null;
try { PW = new Worker('js/plan-worker.js'); PW.onmessage = onPlanDone; PW.onerror = () => { PW = null; }; } catch (e) { PW = null; }

const recNow = () => (performance.now() - REC.t0) / 1000;
function recClear() {
  REC.notes = []; REC.down = {}; REC.dirty = false; REC.t0 = performance.now(); REC.reqId++; REC.busy = false;
  S.live = true; S.plan = null; S.checks = null; $('checks').hidden = true;
}
function recKeyDown(code) {
  const k = KEY_BY_CODE[code]; if (!k || !k.f) return false;
  if (REC.down[code]) return true; // 押しっぱなし（キーのくり返し）
  if (!S.live) { recClear(); } // 通して再生のあとに打ったら、新しく打ちはじめる
  if (!REC.notes.length) REC.t0 = performance.now() - 600; // 最初のキーを 0.6 秒に（手が構える時間）
  const t = recNow(), n = { m: k.m, t0: t, t1: t + 0.1, hand: k.side > 0 ? 'R' : 'L', given: k.f, vel: 80, ch: k.label || '␣', open: true };
  REC.notes.push(n); REC.down[code] = n;
  if (REC.notes.length > REC_MAX_KEYS) REC.notes.shift();
  REC.dirty = true;
  return true;
}
function recKeyUp(code) {
  const n = REC.down[code]; if (!n) return;
  delete REC.down[code];
  n.t1 = Math.max(n.t0 + 0.03, recNow()); n.open = false; REC.dirty = true;
}
// 計算に渡す音の一覧（押したままのキーは、いまか 0.1 秒後まで）
function recNotes(from) {
  const now = recNow();
  return REC.notes.filter(n => (n.open ? now : n.t1) >= from).map(n => ({ m: n.m, t0: n.t0, t1: n.open ? Math.max(n.t0 + 0.1, now) : n.t1, hand: n.hand, given: n.given, vel: n.vel, ch: n.ch }));
}
function requestPlan(notes, cb) {
  const id = ++REC.reqId;
  REC.busy = true; REC.cb = cb;
  if (PW) PW.postMessage({ id, notes, hand: HAND.id });
  else setTimeout(() => onPlanDone({ data: { id, plan: buildPlan({ notes }) } }), 0); // Worker が使えないときは画面の側で
}
function onPlanDone(e) {
  const { id, plan, error } = e.data;
  if (id !== REC.reqId) return; // 古い計算（そのあと消した・通して再生にした）
  REC.busy = false;
  if (error) { window.__tyhaErr.push('plan-worker: ' + error); return; }
  const cb = REC.cb; REC.cb = null; if (cb) cb(plan);
}
// 毎フレーム（追いかける表示のとき）: 打ったキーが変わっていて、計算中でなければ計算を頼む。表示する時刻は REC_LAG 秒前
function recTick() {
  if (!S.live) return;
  if (REC.dirty && !REC.busy && REC.notes.length) {
    REC.dirty = false;
    requestPlan(recNotes(recNow() - REC_LAG - REC_WIN), plan => { if (!S.live) return; REC.prev = S.plan; REC.swapAt = performance.now(); S.plan = plan; });
  }
  if (REC.notes.length) S.t = Math.max(0, recNow() - REC_LAG);
}
// 通して再生: 打ったものすべてを計算し、ふつうの再生（時刻のつまみ・検査）にする
function recPlayAll() {
  if (!REC.notes.length) return;
  const last = REC.notes[REC.notes.length - 1];
  for (const c in REC.down) recKeyUp(c);
  S.live = false; S.plan = null;
  showLoading('打ったキーから手の動きを計算しています…');
  requestPlan(recNotes(-1), plan => {
    S.plan = plan; S.checks = runChecks(plan); renderChecks(); $('checks').hidden = false;
    hideLoading(); setTime(Math.max(0, REC.notes[0].t0 - 0.5)); setPlaying(true);
  });
  return last;
}
// 片方の手がまだ打っていない（追いかける範囲にキーがない）ときは、ホームポジションで休む手を出す
function homeRest(side) {
  if (!REC.home) { const song = textToSong(TEXTS.find(x => x.id === 'home')); REC.home = buildPlan(song); }
  const h = REC.home.hands.find(x => x.side === side);
  return { hand: h, pose: poseAt(h, 0.3) };
}

// 画面のキーボード（スマホ・タブレット用。マウスでも押せる）
function makeScreenKeyboard() {
  const box = $('oskb'); box.innerHTML = '';
  for (let r = 0; r <= 4; r++) {
    const row = document.createElement('div'); row.className = 'oskb-row';
    for (const k of KEYS.filter(x => x.row === r)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'oskb-key' + (k.f ? ' f' + k.f : ' off'); b.style.flexGrow = k.w; b.textContent = k.code === 'Space' ? 'スペース' : k.label;
      b.dataset.code = k.code; b.tabIndex = -1;
      if (k.f) {
        b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* なくても続ける */ } b.classList.add('down'); recKeyDown(k.code); });
        const up = () => { b.classList.remove('down'); recKeyUp(k.code); };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      }
      row.appendChild(b);
    }
    box.appendChild(row);
  }
}
// 自分のキーボード: 「再現する」のときだけ。Ctrl・Alt・⌘ と一緒に押したキーは読まない（ブラウザの操作をじゃましない）
function onPhysKey(e, down) {
  if (S.mode !== 'replay' || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range')) return false;
  const k = KEY_BY_CODE[e.code]; if (!k || !k.f) return false;
  e.preventDefault(); // スペースでページが動く・Tab で移る・/ でページ内検索になる、などを止める
  if (down) { if (!e.repeat) recKeyDown(e.code); } else recKeyUp(e.code);
  return true;
}

// 計算が入れかわるとき、前の計算の姿勢から REC_BLEND 秒でなめらかに移る。新しく打ったキーへの先回り（LOOK 0.7 秒）が前の計算に入っていないと、
// 入れかわった瞬間に指先が最大 30mm 跳んだ（2026-10-17 に測った）ため
const REC_BLEND = 0.25;
function blendPose(pa, pb, k) {
  const L1 = (a, b) => a + (b - a) * k, L3 = (a, b) => [L1(a[0], b[0]), L1(a[1], b[1]), L1(a[2], b[2])];
  const W = pb.W.map((v, i) => typeof v === 'number' && typeof pa.W[i] === 'number' && i !== 4 ? L1(pa.W[i], v) : v);
  const fingers = pb.fingers.map((f, i) => !f ? f : Object.assign({}, f, { pts: f.pts.map((p, j) => L3(pa.fingers[i].pts[j], p)), target: L3(pa.fingers[i].target, f.target),
    ang: Object.assign({}, f.ang, { yaw: L1(pa.fingers[i].ang.yaw, f.ang.yaw), a1: L1(pa.fingers[i].ang.a1, f.ang.a1), a2: L1(pa.fingers[i].ang.a2, f.ang.a2) }) }));
  return Object.assign({}, pb, { W, fingers });
}
// 追いかける表示の姿勢（入れかわりのあいだは前の計算とまぜる）
function livePose(h, t) {
  const pb = poseAt(h, t);
  if (!REC.prev || !REC.swapAt) return pb;
  const k = (performance.now() - REC.swapAt) / 1000 / REC_BLEND;
  if (k >= 1) return pb;
  const ho = REC.prev.hands.find(x => x.side === h.side);
  return ho ? blendPose(poseAt(ho, t), pb, k * k * (3 - 2 * k)) : pb;
}
