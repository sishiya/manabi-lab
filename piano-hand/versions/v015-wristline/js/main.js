// 画面の操作と、毎フレームの更新。デバッグ用の窓口は window.__ph（例外は window.__phErr）
'use strict';
const $ = id => document.getElementById(id);
const S = { plan: null, checks: null, t: -1, playing: false, speed: 1, lastNow: 0, prevT: -1, extra: [] };
const OPT = { noteNums: true, fingerNums: false, targets: false, ghost: false, bones: false };

// 音（とても簡単な合成。鍵を押した瞬間に鳴らす）
let AC = null, MASTER = null;
// 音量のつまみ（0〜1。聞こえ方に合わせて2乗）
const VOL = () => { const v = +($("vol") ? $("vol").value : 70) / 100; return v * v * 1.6; };
// len は音が止まるまでの秒（鍵を離すか、ペダルを上げるまで）。ピアノの音のように自然に弱まり、止まるときは 0.1 秒ほどで消える
function playTone(m, len) {
  if (!$('chkSound').checked) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const f0 = 440 * Math.pow(2, (m - 69) / 12), now = AC.currentTime;
    const decay = 0.6 + Math.max(0, 108 - m) / 60 * 2.0; // 低い音ほど長くのびる（目安）
    const L = Math.max(0.08, Math.min(len || 1, 8));
    if (!MASTER) { MASTER = AC.createGain(); MASTER.connect(AC.destination); } // 全体の音量（つまみ）
    MASTER.gain.value = VOL();
    const g = AC.createGain(); g.connect(MASTER);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
    g.gain.setTargetAtTime(0, now + 0.01, decay);
    g.gain.setTargetAtTime(0, now + L, 0.06);
    [[1, 1], [2, 0.35], [3, 0.12]].forEach(([k, a]) => {
      const o = AC.createOscillator(), og = AC.createGain();
      o.type = 'sine'; o.frequency.value = f0 * k; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(now); o.stop(now + L + 0.5);
    });
  } catch (e) { /* 音が出せなくても続ける */ }
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
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
  const hs = S.plan.hands.map(h => HAND_NAME(h.side) + ' ' + h.notes.length + L('音', ' notes')).join(L('・', ', '));
  $('songWhy').textContent = (song.why ? L('確かめたいこと: ', 'What it tests: ') + song.why + L('（', ' (') : L('（', '(')) + hs + (song.bpm ? L('・', ', ') + song.bpm + ' bpm' : '') + L('）', ')') + (song.note ? ' ' + song.note : '') + (nx ? L('（手で弾かない音 ' + nx + '・灰色）', ' (' + nx + ' notes not played by hand, in gray)') : '');
  $('fgCost').textContent = S.plan.cost.toFixed(1);
  $('fgList').innerHTML = S.plan.hands.map(h => '<p class="fg-hand">' + HAND_NAME(h.side) + '</p>' + h.notes.map(n =>
    `<span data-t="${n.t0}" style="border-color:#${FCOL[n.f].toString(16)}">${noteName(n.m)}<b>${n.f}</b>${n.given ? L('<i>譜</i>', '<i title="from the score">S</i>') : ''}</span>`).join('')).join('');
  const fm = fingeringMatch(S.plan);
  const src = song.refR || song.refL ? L('教本の運指', 'the textbook fingering') : L('楽譜の運指', "the score's fingering");
  const hasGiven = (S.song.notes || []).some(n => n.given);
  $('fgRef').innerHTML = fm.length ? L(src + 'とくらべると: ', 'Compared with ' + src + ': ') + fm.map(r => HAND_NAME(r.side) + ' <b>' + r.same + '/' + r.total + '</b>' + L(' 一致', ' match') +
    (r.diff.length ? L('<br>ちがう所（推定 → お手本）: ', '<br>Differences (estimate → answer): ') + r.diff.slice(0, 12).map(n => '<span class="dif" data-t="' + n.t0 + '">' + noteName(n.m) + ' ' + n.f + '→' + n.ref + '</span>').join(' ') + (r.diff.length > 12 ? L(' ほか ', ' and ') + (r.diff.length - 12) + L('', ' more') : '') : '')).join('<br>') +
    L('<br><small>ノーツの上の赤い丸「推定/お手本」がちがう音です。</small>', '<br><small>A red circle "estimate/answer" on a note marks a difference.</small>')
    : hasGiven ? L('楽譜の運指を使っています（外すと、コンピュータの推定とくらべられます）。', "Using the score's fingering (turn it off to compare with the computer's estimate).") : L('この曲にはお手本の運指がありません（教本の運指つきの曲や、運指の書かれた MusicXML でくらべられます）。', 'This piece has no answer-key fingering (you can compare with the textbook pieces, or a MusicXML score that has fingering).');
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
  $('valOut').innerHTML = L('<p class="cap">ぜんぶで <b>' + ok + '/' + tot + '</b>（' + Math.round(100 * ok / tot) + '%）が教本の運指と同じ。</p>', '<p class="cap">In total <b>' + ok + '/' + tot + '</b> (' + Math.round(100 * ok / tot) + '%) match the textbook fingering.</p>') + '<table class="val"><tr><th>' + L('曲', 'Piece') + '</th><th>' + L('右手', 'Right') + '</th><th>' + L('左手', 'Left') + '</th></tr>' + rows.join('') + '</table>';
}

function showHandInfo() {
  const mid = fingerFK(FINGERS[3], 0, 0, 0)[3];
  const sp = (handSpan() / 10).toFixed(1), ln = ((-mid[2] + PAD) / 10).toFixed(1);
  $('handInfo').innerHTML = L('親指〜小指をいっぱいに開いた幅 <b>約 ' + sp + 'cm</b>・手首〜中指の先 約 ' + ln +
    'cm。くらべる目安: ピアニストの平均は男性 22.6cm・女性 20.1cm（Boyle ほか 2015）。子どもと指の長さのちがいは目安です。運指の表（Parncutt ほか）は大人の手のものなので、小さい手では「届かない」が増えます。',
    'Full spread from thumb to little finger <b>about ' + sp + ' cm</b>, wrist to middle fingertip about ' + ln +
    ' cm. For comparison: pianists average 22.6 cm (men) and 20.1 cm (women) (Boyle et al. 2015). The child and finger-length models are rough guides. The fingering table (Parncutt et al.) is for adult hands, so smaller hands get more "can\'t reach".');
}

// 楽譜ファイル
const SAMPLES = [
  { file: 'elise-opening.mid', name: L('エリーゼのために 冒頭（MIDI・両手のトラック）', 'Für Elise, opening (MIDI, a track per hand)') },
  { file: 'c-major-scale-fingered.musicxml', name: L('ハ長調の音階（MusicXML・両手・運指つき）', 'C major scale (MusicXML, both hands, with fingering)') },
  { file: 'ode-to-joy-with-chords.mid', name: L('歓喜の歌＋左手の和音（MIDI・トラック1つ）', 'Ode to Joy + left-hand chords (MIDI, one track)') },
];
async function openFile(file) {
  setPlaying(false);
  try { addSong(await songFromFile(file)); }
  catch (e) { alert(L('読めませんでした: ', 'Could not read it: ') + e.message); }
}
async function loadSample(fn) {
  try {
    const r = await fetch('samples/' + fn);
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    addSong(await songFromFile(new File([blob], fn)), 'sample:' + fn);
  } catch (e) { alert(L('サンプルを読めませんでした（ファイルとして開いたときは、サーバー経由で開いてください）: ', 'Could not read the sample (if you opened this page as a file, open it through a server): ') + e.message); }
}
function addSong(song, value) {
  if (!song.notes.some(n => n.hand === 'R' || n.hand === 'L')) throw new Error(L('弾ける音がありません', 'No playable notes'));
  if (!value) {
    S.extra = S.extra.filter(s => s.id !== song.id); S.extra.push(song);
    let og = $('song').querySelector('optgroup[data-files]');
    if (!og) { og = document.createElement('optgroup'); og.label = L('開いたファイル', 'Opened files'); og.dataset.files = '1'; $('song').appendChild(og); }
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
    const where = r.at !== null && r.grade !== 'ok' ? `<small>${r.at.toFixed(2)} ${L('秒', 's')}${r.who ? L('・', ', ') + r.who : ''}</small>` : '';
    return `<tr data-id="${c.id}" title="${c.tip}"><td class="g ${r.grade}">${mark[r.grade]}</td><td class="n">${c.name}${where}</td><td class="v">${fmt(c, r)} ${c.unit}</td></tr>`;
  }).join('');
  const sum = { ok: [L('破綻なし', 'No breakdowns'), 'ok'], warn: [L('ぎりぎりの所あり', 'Some close calls'), 'warn'], ng: [L('破綻あり', 'Breakdowns found'), 'ng'] }[worst];
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
  if (S.playing) for (const n of plan.notes) if (n.t0 > S.prevT && n.t0 <= t) playTone(n.m, ((n.ts || n.t1) - n.t0) / S.speed);
  const pd = (plan.pedal || []).some(([a, c]) => t >= a && t < c);
  if (pd !== S.pedalOn) { S.pedalOn = pd; $('pedalInd').classList.toggle('on', pd); }
  $('pedalInd').hidden = !(plan.pedal && plan.pedal.length);
  S.prevT = t;
  const poses = plan.hands.map(h => poseAt(h, t));
  resizeView();
  CAM.follow = $('optFollow').checked;
  updateCam(poses);
  renderPose(plan, poses, OPT);
  // 表示
  const span = tEnd() - tStart();
  if (document.activeElement !== $('time')) $('time').value = Math.round(1000 * (t - tStart()) / span);
  $('clock').textContent = t.toFixed(2) + L(' 秒', ' s');
  document.querySelectorAll('#fgList span').forEach(el => { const t0 = +el.dataset.t; el.classList.toggle('now', t0 <= t + 0.001 && t0 > t - 0.25); });
  const lims = [], far = [], msgs = [];
  poses.forEach((pose, hi) => {
    const hn = HAND_OF(plan.hands[hi].side);
    for (let f = 1; f <= 5; f++) {
      const fp = pose.fingers[f];
      if (fp.down && fp.lim) lims.push(hn + FINGERS[f].name);
      if (fp.down && fp.err > 2) far.push(hn + FINGERS[f].name + ' ' + fp.err.toFixed(1) + 'mm');
    }
    const cl = clashOf(pose);
    if (cl.pen > 2) msgs.push(L('めりこみ: ', 'Overlap: ') + '<b>' + hn + cl.who + ' ' + cl.pen.toFixed(1) + 'mm</b>');
  });
  if (far.length) msgs.unshift(L('届かない: ', "Can't reach: ") + '<b>' + far.join(L('、', ', ')) + '</b>');
  if (lims.length) msgs.push(L('関節の限界: ', 'Joint limit: ') + '<b>' + lims.join(L('、', ', ')) + '</b>');
  // 再生中は「この瞬間」の知らせを出さない（一瞬で切りかわって読めず、行数が変わって画面ががたついた）。止めたとき・1コマずつのときに出す
  $('hint').innerHTML = msgs.length && !S.playing ? L('この瞬間 — ', 'Right now — ') + msgs.join(L(' ／ ', ' / ')) : L('ドラッグで向きを変え、ホイールや2本指のピンチで寄れます（一人称では体を前後に）。時刻のつまみ・矢印キーで1コマずつ、[ ] キーで速さを変えられます。', "Drag to turn the view, use the wheel or a two-finger pinch to zoom (in POV, the pianist's view, it leans you forward and back). Step frame by frame with the time slider or arrow keys, and change the speed with the [ and ] keys.");
}

function setPlaying(on) {
  S.playing = on;
  $('btnPlay').textContent = on ? L('⏸ 止める', '⏸ Pause') : L('▶ 再生', '▶ Play');
  if (on && S.t >= tEnd() - 0.01) setTime(tStart());
  if (on && AC && AC.state === 'suspended') AC.resume();
}

function initUI() {
  // 言語・題名・読み上げ用の名前（I18N.md）
  document.title = L('ピアノを弾く手', 'Hands at the Piano');
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.l === LANG); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
  $('view').setAttribute('aria-label', L('鍵盤と、弾いている両手の3D。ドラッグで向きを変え、ホイールや2本指のピンチで寄れます', 'A 3D keyboard and two hands playing. Drag to turn the view, use the wheel or a two-finger pinch to zoom'));
  $('views').setAttribute('aria-label', L('見る向き', 'View'));
  $('pedalInd').title = L('音をのばすペダル（ダンパーペダル）を踏んでいる間は光る', 'Lights up while the sustain (damper) pedal is down');
  $('speedSel').setAttribute('aria-label', L('速さ', 'Speed')); $('speedSel').title = L('速さ（キーの [ と ] でも変えられます）', 'Speed (you can also use the [ and ] keys)');
  $('time').setAttribute('aria-label', L('時刻', 'Time'));
  $('vol').setAttribute('aria-label', L('音量', 'Volume')); $('vol').title = L('音量', 'Volume');
  [['song', '曲', 'Piece'], ['sceneSel', 'シーン', 'Scene'], ['fxSel', 'エフェクトの強さ', 'Effect strength'], ['handModel', '手のモデル', 'Hand model']].forEach(([id, ja, en]) => $(id).setAttribute('aria-label', L(ja, en)));
  setPlaying(false);
  const opt = s => `<option value="${s.id}">${s.name}</option>`;
  $('song').innerHTML = '<optgroup label="' + L('検証用の曲', 'Test pieces') + '">' + SONGS.filter(s => !s.val).map(opt).join('') + '</optgroup>' +
    '<optgroup label="' + L('教本の運指との答え合わせ（ハノン）', 'Check against textbook fingering (Hanon)') + '">' + SONGS.filter(s => s.val).map(opt).join('') + '</optgroup>' +
    '<optgroup label="' + L('サンプルの楽譜ファイル（samples/）', 'Sample score files (samples/)') + '">' + SAMPLES.map(s => `<option value="sample:${s.file}">${s.name}</option>`).join('') + '</optgroup>';
  $('song').addEventListener('change', e => { setPlaying(false); const v = e.target.value; busy(L('運指と手の動きを計算しています…', 'Working out fingering and hand motion…'), () => v.startsWith('sample:') ? loadSample(v.slice(7)) : loadSong(v)); });
  $('sceneSel').innerHTML = Object.entries(SCENES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  $('sceneSel').value = V.sceneId;
  $('fxSel').innerHTML = FX_LEVELS.map((f, i) => `<option value="${i}">${L('エフェクト: ', 'Effects: ')}${f.name}</option>`).join('');
  $('fxSel').value = String(V.fxLevel);
  $('sceneSel').addEventListener('change', e => { applyScene(e.target.value); applyFx(SCENES[e.target.value].fx); $('fxSel').value = String(V.fxLevel); });
  $('fxSel').addEventListener('change', e => applyFx(+e.target.value));
  $('handModel').innerHTML = Object.entries(HAND_MODELS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
  $('handModel').value = HAND.id;
  $('handModel').addEventListener('change', e => { setPlaying(false); busy(L('手を作りなおしています…', 'Rebuilding the hands…'), () => { setHandModel(e.target.value); rebuildSkins(); showHandInfo(); if (S.song) setSong(S.song); }); });
  showHandInfo();
  $('fileIn').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) busy(L('楽譜を読んで計算しています…', 'Reading the score and calculating…'), () => openFile(f)); });
  $('vol').addEventListener('input', () => { if (MASTER) MASTER.gain.value = VOL(); });
  $('optGiven').addEventListener('change', () => { if (S.song) busy(L('運指を計算しています…', 'Working out fingering…'), () => setSong(S.song)); });
  const fr = $('frame');
  fr.addEventListener('dragover', e => { e.preventDefault(); fr.classList.add('drop'); });
  fr.addEventListener('dragleave', () => fr.classList.remove('drop'));
  fr.addEventListener('drop', e => { e.preventDefault(); fr.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (f) busy(L('楽譜を読んで計算しています…', 'Reading the score and calculating…'), () => openFile(f)); });
  $('btnPlay').addEventListener('click', () => setPlaying(!S.playing));
  $('time').addEventListener('input', e => setTime(tStart() + (tEnd() - tStart()) * e.target.value / 1000));
  // 速さ: 選択欄と、キーの [ ] で1段ずつ
  $('speedSel').innerHTML = SPEEDS.map(v => '<option value="' + v + '"' + (v === 1 ? ' selected' : '') + '>' + L('速さ ×', 'Speed ×') + v + '</option>').join('');
  $('speedSel').addEventListener('change', e => { S.speed = +e.target.value; });
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
    if (e.key === '[' || e.key === ']') { const i = SPEEDS.indexOf(S.speed), j = Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === ']' ? 1 : -1))); S.speed = SPEEDS[j]; $('speedSel').value = String(S.speed); }
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

// 読みこみ中の表示: 重い計算の前に文言を変えて、画面に出てから計算する
// （タブが隠れていると requestAnimationFrame が止まるので、0.1 秒で先へ進む）
const paint = () => new Promise(r => { const t = setTimeout(r, 100); requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); r(); }, 0)); });
async function showLoading(msg) { $('loading').hidden = false; $('loadMsg').textContent = msg; await paint(); }
function hideLoading() { $('loading').hidden = true; }
// 画面の操作から重い計算をするとき（曲・手のモデル・楽譜を変える）は、表示を出してから
async function busy(msg, fn) { await showLoading(msg); try { await fn(); } finally { hideLoading(); } }

async function boot() {
  try {
    await showLoading(L('手の皮ふを作っています…', 'Building the skin of the hands…'));
    initView($('view'));
    initUI();
    setCam('tilt');
    await showLoading(L('運指と手の動きを計算しています…', 'Working out fingering and hand motion…'));
    loadSong(SONGS[0].id);
    hideLoading();
    requestAnimationFrame(frame);
  } catch (e) { window.__phErr = e; console.error(e); $('loadMsg').textContent = L('読みこめませんでした: ', 'Could not load: ') + e.message; }
}
boot();
