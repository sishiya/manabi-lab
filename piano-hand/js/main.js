// 画面の操作と、毎フレームの更新。デバッグ用の窓口は window.__ph（例外は window.__phErr）
'use strict';
const $ = id => document.getElementById(id);
const S = { plan: null, checks: null, t: -1, playing: false, speed: 1, lastNow: 0, prevT: -1 };
const OPT = { noteNums: true, fingerNums: false, targets: false, ghost: false, bones: false };

// 音（とても簡単な合成。鍵を押した瞬間に鳴らす）
let AC = null;
function playTone(m) {
  if (!$('chkSound').checked) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const f0 = 440 * Math.pow(2, (m - 69) / 12), now = AC.currentTime;
    const g = AC.createGain(); g.connect(AC.destination);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.16, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    [[1, 1], [2, 0.35], [3, 0.12]].forEach(([k, a]) => {
      const o = AC.createOscillator(), og = AC.createGain();
      o.type = 'sine'; o.frequency.value = f0 * k; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(now); o.stop(now + 1.7);
    });
  } catch (e) { /* 音が出せなくても続ける */ }
}

function tStart() { return -0.8; }
function tEnd() { return S.plan.end + 0.8; }

function loadSong(id) {
  const song = SONGS.find(s => s.id === id) || SONGS[0];
  S.plan = buildPlan(song);
  S.checks = runChecks(S.plan);
  setViewPlan(S.plan);
  $('songWhy').textContent = '確かめたいこと: ' + song.why + '（' + S.plan.notes.length + '音・' + song.bpm + ' bpm）';
  $('fgCost').textContent = S.plan.cost.toFixed(1);
  $('fgList').innerHTML = S.plan.notes.map((n, i) =>
    `<span data-i="${i}" style="border-color:#${FCOL[n.f].toString(16)}">${noteName(n.m)}<b>${n.f}</b></span>`).join('');
  renderChecks();
  setTime(tStart());
}

function fmt(c, r) {
  const v = r.v;
  return c.unit === '%' ? v.toFixed(1) : v >= 100 ? Math.round(v) : v.toFixed(1);
}
function renderChecks() {
  const R = S.checks, mark = { ok: '◯', warn: '△', ng: '✕' };
  let worst = 'ok';
  $('chkTable').innerHTML = CHECKS.map(c => {
    const r = R[c.id];
    if (r.grade === 'ng' || (r.grade === 'warn' && worst === 'ok')) worst = r.grade;
    const where = r.at !== null && r.grade !== 'ok' ? `<small>${r.at.toFixed(2)} 秒${r.who ? '・' + r.who : ''}</small>` : '';
    return `<tr data-id="${c.id}" title="${c.tip}"><td class="g ${r.grade}">${mark[r.grade]}</td><td class="n">${c.name}${where}</td><td class="v">${fmt(c, r)} ${c.unit}</td></tr>`;
  }).join('');
  const sum = { ok: ['破綻なし', 'ok'], warn: ['ぎりぎりの所あり', 'warn'], ng: ['破綻あり', 'ng'] }[worst];
  $('chkSum').textContent = sum[0]; $('chkSum').className = 'ro-tag ' + sum[1];
}

function setTime(t) {
  S.t = Math.min(tEnd(), Math.max(tStart(), t));
  S.prevT = S.t;
}

function frame(now) {
  try {
    const dt = Math.min(0.1, (now - (S.lastNow || now)) / 1000);
    S.lastNow = now;
    if (S.playing) {
      S.t += dt * S.speed;
      if (S.t >= tEnd()) { S.t = tEnd(); setPlaying(false); }
    }
    step();
  } catch (e) { window.__phErr = e; console.error(e); }
  requestAnimationFrame(frame);
}

function step() {
  const plan = S.plan, t = S.t;
  if (S.playing) for (const n of plan.notes) if (n.t0 > S.prevT && n.t0 <= t) playTone(n.m);
  S.prevT = t;
  const pose = poseAt(plan, t);
  resizeView();
  CAM.follow = $('optFollow').checked;
  updateCam(pose.W);
  renderPose(plan, pose, OPT);
  // 表示
  const span = tEnd() - tStart();
  if (document.activeElement !== $('time')) $('time').value = Math.round(1000 * (t - tStart()) / span);
  $('clock').textContent = t.toFixed(2) + ' 秒';
  let cur = -1;
  plan.notes.forEach((n, i) => { if (n.t0 <= t + 0.001) cur = i; });
  document.querySelectorAll('#fgList span').forEach((el, i) => el.classList.toggle('now', i === cur));
  const lims = [], far = [];
  for (let f = 1; f <= 5; f++) {
    const fp = pose.fingers[f];
    if (fp.press && fp.lim) lims.push(FINGERS[f].name);
    if (fp.press && fp.err > 2) far.push(FINGERS[f].name + ' ' + fp.err.toFixed(1) + 'mm');
  }
  const cl = clashOf(pose);
  const msgs = [];
  if (far.length) msgs.push('届かない: <b>' + far.join('、') + '</b>');
  if (lims.length) msgs.push('関節の限界: <b>' + lims.join('、') + '</b>');
  if (cl.pen > 2) msgs.push('めりこみ: <b>' + cl.who + ' ' + cl.pen.toFixed(1) + 'mm</b>');
  $('hint').innerHTML = msgs.length ? 'この瞬間 — ' + msgs.join(' ／ ') : 'ドラッグで向きを変え、ホイールで寄れます。時刻のつまみで1コマずつ見られます。';
}

function setPlaying(on) {
  S.playing = on;
  $('btnPlay').textContent = on ? '⏸ 止める' : '▶ 再生';
  if (on && S.t >= tEnd() - 0.01) setTime(tStart());
  if (on && AC && AC.state === 'suspended') AC.resume();
}

function initUI() {
  $('song').innerHTML = SONGS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  $('song').addEventListener('change', e => { setPlaying(false); loadSong(e.target.value); });
  $('btnPlay').addEventListener('click', () => setPlaying(!S.playing));
  $('time').addEventListener('input', e => setTime(tStart() + (tEnd() - tStart()) * e.target.value / 1000));
  document.querySelectorAll('#segSpeed button').forEach(b => b.addEventListener('click', () => {
    S.speed = +b.dataset.v;
    document.querySelectorAll('#segSpeed button').forEach(x => x.setAttribute('aria-pressed', x === b));
  }));
  document.querySelectorAll('#views button').forEach(b => b.addEventListener('click', () => {
    setCam(b.dataset.v);
    document.querySelectorAll('#views button').forEach(x => x.setAttribute('aria-pressed', x === b));
  }));
  const opts = { optNoteNums: 'noteNums', optFingerNums: 'fingerNums', optTargets: 'targets', optGhost: 'ghost', optBones: 'bones' };
  for (const id in opts) $(id).addEventListener('change', e => { OPT[opts[id]] = e.target.checked; });
  $('chkTable').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const r = S.checks[tr.dataset.id];
    if (r.at !== null) { setPlaying(false); setTime(r.at); }
  });
  $('fgList').addEventListener('click', e => {
    const sp = e.target.closest('span'); if (!sp) return;
    setPlaying(false); setTime(S.plan.notes[+sp.dataset.i].t0 - 0.05);
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!S.playing); }
    if (e.code === 'ArrowRight') setTime(S.t + 1 / 30);
    if (e.code === 'ArrowLeft') setTime(S.t - 1 / 30);
  });
}

window.__ph = {
  S, OPT, poseAt: t => poseAt(S.plan, t), setTime, loadSong,
  simRun(sec) { setTime(S.t + sec); step(); return S.t; },
  checksAll() { // すべての曲の検査の結果
    const out = {};
    for (const s of SONGS) { const p = buildPlan(s), r = runChecks(p); out[s.id] = { cost: +p.cost.toFixed(1), fingers: p.notes.map(n => n.f).join(''), ...Object.fromEntries(CHECKS.map(c => [c.id, +r[c.id].v.toFixed(1) + (r[c.id].at !== null ? '@' + r[c.id].at.toFixed(2) : '')])) }; }
    return out;
  },
};

try {
  initView($('view'));
  initUI();
  setCam('tilt');
  loadSong(SONGS[0].id);
  requestAnimationFrame(frame);
} catch (e) { window.__phErr = e; console.error(e); }
