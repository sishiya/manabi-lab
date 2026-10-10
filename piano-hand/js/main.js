// 画面の操作と、毎フレームの更新。デバッグ用の窓口は window.__ph（例外は window.__phErr）
'use strict';
const $ = id => document.getElementById(id);
const S = { plan: null, checks: null, t: -1, playing: false, speed: 1, lastNow: 0, prevT: -1, extra: [] };
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
  const song = SONGS.find(s => s.id === id) || S.extra.find(s => s.id === id) || SONGS[0];
  setSong(song);
}
function setSong(song) {
  S.song = song;
  // 「楽譜の運指を使う」を外すと、楽譜の運指はお手本（ref）にして、コンピュータの推定とくらべる
  if (!$('optGiven').checked && song.notes) song = Object.assign({}, song, { notes: song.notes.map(n => Object.assign({}, n, { given: 0, ref: n.given || n.ref })) });
  S.plan = buildPlan(song);
  const nx = S.plan.notes.filter(n => n.hand === 'X').length;
  S.checks = runChecks(S.plan);
  setViewPlan(S.plan);
  const hs = S.plan.hands.map(h => HAND_NAME(h.side) + ' ' + h.notes.length + '音').join('・');
  $('songWhy').textContent = (song.why ? '確かめたいこと: ' + song.why + '（' : '（') + hs + (song.bpm ? '・' + song.bpm + ' bpm' : '') + '）' + (song.note ? ' ' + song.note : '') + (nx ? '（手で弾かない音 ' + nx + '・灰色）' : '');
  $('fgCost').textContent = S.plan.cost.toFixed(1);
  $('fgList').innerHTML = S.plan.hands.map(h => '<p class="fg-hand">' + HAND_NAME(h.side) + '</p>' + h.notes.map(n =>
    `<span data-t="${n.t0}" style="border-color:#${FCOL[n.f].toString(16)}">${noteName(n.m)}<b>${n.f}</b>${n.given ? '<i>譜</i>' : ''}</span>`).join('')).join('');
  const fm = fingeringMatch(S.plan);
  const src = song.refR || song.refL ? '教本の運指' : '楽譜の運指';
  const hasGiven = (S.song.notes || []).some(n => n.given);
  $('fgRef').innerHTML = fm.length ? src + 'とくらべると: ' + fm.map(r => HAND_NAME(r.side) + ' <b>' + r.same + '/' + r.total + '</b> 一致' +
    (r.diff.length ? '<br>ちがう所（推定 → お手本）: ' + r.diff.slice(0, 12).map(n => '<span class="dif" data-t="' + n.t0 + '">' + noteName(n.m) + ' ' + n.f + '→' + n.ref + '</span>').join(' ') + (r.diff.length > 12 ? ' ほか ' + (r.diff.length - 12) : '') : '')).join('<br>') +
    '<br><small>ノーツの上の赤い丸「推定/お手本」がちがう音です。</small>'
    : hasGiven ? '楽譜の運指を使っています（外すと、コンピュータの推定とくらべられます）。' : 'この曲にはお手本の運指がありません（教本の運指つきの曲や、運指の書かれた MusicXML でくらべられます）。';
  renderChecks();
  setTime(tStart());
}

// 答え合わせをまとめて: 教本の運指のある曲ぜんぶで、推定の運指がどれだけ同じか
function runValidation() {
  let tot = 0, ok = 0;
  const rows = SONGS.filter(s => s.refR || s.refL).map(s => {
    const r = fingeringOnlyMatch(s);
    return '<tr><td>' + s.name + '</td>' + [1, -1].map(side => {
      const m = r.find(x => x.side === side);
      if (!m) return '<td>—</td>';
      tot += m.total; ok += m.same;
      const p = m.same / m.total;
      return '<td class="' + (p === 1 ? 'ok' : p >= 0.7 ? 'warn' : 'ng') + '">' + m.same + '/' + m.total + '</td>';
    }).join('') + '</tr>';
  });
  $('valOut').innerHTML = '<p class="cap">ぜんぶで <b>' + ok + '/' + tot + '</b>（' + Math.round(100 * ok / tot) + '%）が教本の運指と同じ。</p><table class="val"><tr><th>曲</th><th>右手</th><th>左手</th></tr>' + rows.join('') + '</table>';
}

function showHandInfo() {
  const mid = fingerFK(FINGERS[3], 0, 0, 0)[3];
  $('handInfo').innerHTML = '親指〜小指をいっぱいに開いた幅 <b>約 ' + (handSpan() / 10).toFixed(1) + 'cm</b>・手首〜中指の先 約 ' + ((-mid[2] + PAD) / 10).toFixed(1) +
    'cm。くらべる目安: ピアニストの平均は男性 22.6cm・女性 20.1cm（Boyle ほか 2015）。子どもと指の長さのちがいは目安です。運指の表（Parncutt ほか）は大人の手のものなので、小さい手では「届かない」が増えます。';
}

// 楽譜ファイル
const SAMPLES = [
  { file: 'elise-opening.mid', name: 'エリーゼのために 冒頭（MIDI・両手のトラック）' },
  { file: 'c-major-scale-fingered.musicxml', name: 'ハ長調の音階（MusicXML・両手・運指つき）' },
  { file: 'ode-to-joy-with-chords.mid', name: '歓喜の歌＋左手の和音（MIDI・トラック1つ）' },
];
async function openFile(file) {
  setPlaying(false);
  try { addSong(await songFromFile(file)); }
  catch (e) { alert('読めませんでした: ' + e.message); }
}
async function loadSample(fn) {
  try {
    const r = await fetch('samples/' + fn);
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    addSong(await songFromFile(new File([blob], fn)), 'sample:' + fn);
  } catch (e) { alert('サンプルを読めませんでした（ファイルとして開いたときは、サーバー経由で開いてください）: ' + e.message); }
}
function addSong(song, value) {
  if (!song.notes.some(n => n.hand === 'R' || n.hand === 'L')) throw new Error('弾ける音がありません');
  if (!value) {
    S.extra = S.extra.filter(s => s.id !== song.id); S.extra.push(song);
    let og = $('song').querySelector('optgroup[data-files]');
    if (!og) { og = document.createElement('optgroup'); og.label = '開いたファイル'; og.dataset.files = '1'; $('song').appendChild(og); }
    if (![...og.children].some(o => o.value === song.id)) { const o = document.createElement('option'); o.value = song.id; o.textContent = song.name; og.appendChild(o); }
    $('song').value = song.id;
  }
  setSong(song);
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
  const poses = plan.hands.map(h => poseAt(h, t));
  resizeView();
  CAM.follow = $('optFollow').checked;
  updateCam(poses);
  renderPose(plan, poses, OPT);
  // 表示
  const span = tEnd() - tStart();
  if (document.activeElement !== $('time')) $('time').value = Math.round(1000 * (t - tStart()) / span);
  $('clock').textContent = t.toFixed(2) + ' 秒';
  document.querySelectorAll('#fgList span').forEach(el => { const t0 = +el.dataset.t; el.classList.toggle('now', t0 <= t + 0.001 && t0 > t - 0.25); });
  const lims = [], far = [], msgs = [];
  poses.forEach((pose, hi) => {
    const hn = HAND_NAME(plan.hands[hi].side) + 'の';
    for (let f = 1; f <= 5; f++) {
      const fp = pose.fingers[f];
      if (fp.down && fp.lim) lims.push(hn + FINGERS[f].name);
      if (fp.down && fp.err > 2) far.push(hn + FINGERS[f].name + ' ' + fp.err.toFixed(1) + 'mm');
    }
    const cl = clashOf(pose);
    if (cl.pen > 2) msgs.push('めりこみ: <b>' + hn + cl.who + ' ' + cl.pen.toFixed(1) + 'mm</b>');
  });
  if (far.length) msgs.unshift('届かない: <b>' + far.join('、') + '</b>');
  if (lims.length) msgs.push('関節の限界: <b>' + lims.join('、') + '</b>');
  $('hint').innerHTML = msgs.length ? 'この瞬間 — ' + msgs.join(' ／ ') : 'ドラッグで向きを変え、ホイールで寄れます。時刻のつまみで1コマずつ見られます。';
}

function setPlaying(on) {
  S.playing = on;
  $('btnPlay').textContent = on ? '⏸ 止める' : '▶ 再生';
  if (on && S.t >= tEnd() - 0.01) setTime(tStart());
  if (on && AC && AC.state === 'suspended') AC.resume();
}

function initUI() {
  const opt = s => `<option value="${s.id}">${s.name}</option>`;
  $('song').innerHTML = '<optgroup label="検証用の曲">' + SONGS.filter(s => !s.val).map(opt).join('') + '</optgroup>' +
    '<optgroup label="教本の運指との答え合わせ（ハノン）">' + SONGS.filter(s => s.val).map(opt).join('') + '</optgroup>' +
    '<optgroup label="サンプルの楽譜ファイル（samples/）">' + SAMPLES.map(s => `<option value="sample:${s.file}">${s.name}</option>`).join('') + '</optgroup>';
  $('song').addEventListener('change', e => { setPlaying(false); const v = e.target.value; if (v.startsWith('sample:')) loadSample(v.slice(7)); else loadSong(v); });
  $('sceneSel').innerHTML = Object.entries(SCENES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  $('sceneSel').value = V.sceneId;
  $('fxSel').innerHTML = FX_LEVELS.map((f, i) => `<option value="${i}">エフェクト: ${f.name}</option>`).join('');
  $('fxSel').value = String(V.fxLevel);
  $('sceneSel').addEventListener('change', e => { applyScene(e.target.value); applyFx(SCENES[e.target.value].fx); $('fxSel').value = String(V.fxLevel); });
  $('fxSel').addEventListener('change', e => applyFx(+e.target.value));
  $('handModel').innerHTML = Object.entries(HAND_MODELS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
  $('handModel').addEventListener('change', e => { setPlaying(false); setHandModel(e.target.value); rebuildSkins(); showHandInfo(); if (S.song) setSong(S.song); });
  showHandInfo();
  $('fileIn').addEventListener('change', e => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
  $('optGiven').addEventListener('change', () => { if (S.song) setSong(S.song); });
  const fr = $('frame');
  fr.addEventListener('dragover', e => { e.preventDefault(); fr.classList.add('drop'); });
  fr.addEventListener('dragleave', () => fr.classList.remove('drop'));
  fr.addEventListener('drop', e => { e.preventDefault(); fr.classList.remove('drop'); if (e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]); });
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
  $('fgRef').addEventListener('click', e => { const d = e.target.closest('.dif'); if (d) { setPlaying(false); setTime(+d.dataset.t - 0.05); } });
  $('btnVal').addEventListener('click', runValidation);
  $('fgList').addEventListener('click', e => {
    const sp = e.target.closest('span'); if (!sp) return;
    setPlaying(false); setTime(+sp.dataset.t - 0.05);
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!S.playing); }
    if (e.code === 'ArrowRight') setTime(S.t + 1 / 30);
    if (e.code === 'ArrowLeft') setTime(S.t - 1 / 30);
  });
}

window.__ph = {
  S, OPT, poseAt: (t, hi) => poseAt(S.plan.hands[hi || 0], t), setTime, loadSong, setSong,
  simRun(sec) { setTime(S.t + sec); step(); return S.t; },
  // 見た目の確認用: 決まった時刻のコマを並べた一覧を画面の上に出す（クリックで消える）
  sheet(id, times, cam, cols) {
    if (id) loadSong(id);
    if (cam) setCam(cam);
    const cv = V.r.domElement, cw = cv.width / 2, ch = cv.height / 2;
    cols = cols || 2;
    const out = document.createElement('canvas'); out.width = cw * cols; out.height = ch * Math.ceil(times.length / cols);
    const g = out.getContext('2d');
    times.forEach((t, i) => {
      setTime(t); step();
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.drawImage(cv, x, y, cw, ch); g.fillStyle = '#ff0'; g.font = '20px sans-serif'; g.fillText(t.toFixed(2) + 's', x + 8, y + 24);
    });
    let el = document.getElementById('sheet');
    if (!el) { el = document.createElement('img'); el.id = 'sheet'; el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:99'; el.onclick = () => el.remove(); document.body.appendChild(el); }
    el.src = out.toDataURL('image/jpeg', 0.85);
  },
  checksAll() { // すべての曲の検査の結果
    const out = {};
    for (const s of SONGS) { const p = buildPlan(s), r = runChecks(p); out[s.id] = { cost: +p.cost.toFixed(1), fingers: p.hands.map(h => h.notes.map(n => n.f).join('')).join(' / '), match: fingeringMatch(p).map(m => m.same + '/' + m.total).join(' '), ...Object.fromEntries(CHECKS.map(c => [c.id, +r[c.id].v.toFixed(1) + (r[c.id].at !== null ? '@' + r[c.id].at.toFixed(2) : '')])) }; }
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
