// 画面の操作と、毎フレームの更新。デバッグ用の窓口は window.__tyha（例外は window.__tyhaErr）
'use strict';
window.__tyhaErr = [];
window.addEventListener('error', e => window.__tyhaErr.push(String(e.message)));
const $ = id => document.getElementById(id);
const S = { mode: 'watch', live: false, plan: null, checks: null, text: null, t: 0, playing: false, speed: 1, lastNow: 0, prevT: 0 };
const OPT = { fingerMap: true, fingerNums: false, targets: false, ghost: false, bones: false, xray: false, muscles: false };
const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

// 音は sound.js（keySound）

function tStart() { return 0; }
function tEnd() { return S.plan ? S.plan.end + 1.2 : 1; }
function setTime(t) { S.t = Math.min(tEnd(), Math.max(tStart(), t)); S.prevT = S.t; }

// 文を選ぶ・速さを変える → 手の動きを計算し直す
// 計算は Worker で（寿限無のような長い文をゆっくり打つと 20 秒以上かかり、画面の側では止まってしまう）
async function setText(id) {
  const tx = TEXTS.find(x => x.id === id) || TEXTS[0];
  S.text = tx;
  const song = textToSong(tx), seq = S.textSeq = (S.textSeq || 0) + 1;
  const r = await workerPlan(song.notes, true);
  if (seq !== S.textSeq || S.mode !== 'watch') return; // そのあいだに別の文・モードにした
  S.plan = r.plan; S.plan.song = song;
  S.checks = r.checks;
  renderChecks();
  $('textSel').value = tx.id;
  setTime(tStart());
}
function renderChecks() {
  const R = S.checks, mark = { ok: '◯', warn: '△', ng: '✕' };
  const fmt = (c, r) => c.unit === '%' ? r.v.toFixed(1) : r.v < 10 ? r.v.toFixed(1) : Math.round(r.v);
  let worst = 'ok';
  $('chkTable').innerHTML = CHECKS.map(c => {
    const r = R[c.id];
    if (r.grade === 'ng' || (r.grade === 'warn' && worst === 'ok')) worst = r.grade;
    const where = r.at !== null && r.grade !== 'ok' ? `<small>${r.at.toFixed(2)} 秒${r.who ? '・' + r.who : ''}</small>` : '';
    return `<tr data-id="${c.id}" title="${c.tip}"><td class="g ${r.grade}">${mark[r.grade]}</td><td class="n">${c.name}${where}</td><td class="v">${fmt(c, r)} ${c.unit}</td></tr>`;
  }).join('');
  const miss = S.plan.notes.filter(n => n.miss).length;
  const sum = { ok: ['破綻なし', 'ok'], warn: ['ぎりぎりの所あり', 'warn'], ng: ['破綻あり', 'ng'] }[worst];
  $('chkSum').textContent = sum[0] + (miss ? `・押せなかったキー ${miss}` : ''); $('chkSum').className = 'ro-tag ' + (miss ? 'ng' : sum[1]);
}

// 打った文字の行: 打ちおえた文字は明るく、いま押しているキーは指の色
function renderTyped(t) {
  const rp = S.mode === 'replay';
  $('typedShow').textContent = rp ? '自分で打ったキー（キーの位置と時刻だけ。どこにも保存・送信しません）' : S.text.show;
  // 「再現する」では打った順のキー（最後の 60 個）。手の計算の結果（miss）は計算した音と時刻で合わせる
  const list = rp ? REC.notes.slice(-60).map(n => Object.assign({}, n, { f: KEYS[n.m].f, miss: S.plan && S.plan.notes.some(o => o.miss && o.m === n.m && Math.abs(o.t0 - n.t0) < 1e-6) })) : S.plan.notes;
  let html = '';
  for (const n of list) {
    const c = n.ch === ' ' ? '␣' : n.ch === '\n' ? '⏎' : n.ch;
    const cls = n.miss ? 'miss' : t >= n.t0 && t <= n.t1 + 0.05 ? 'on' : t > n.t1 ? 'done' : '';
    html += `<span class="${cls}"${cls === 'on' ? ` style="background:#${FCOL[n.f].toString(16).padStart(6, '0')}"` : ''}>${c}</span>`;
  }
  if (html !== S.lastTyped) { $('typedKeys').innerHTML = html; S.lastTyped = html; }
}

// 打つ間隔のグラフ（ながめる）: キーごとの棒（前のキーからの間隔）、色は組の種類、点線は平均、いま打っているキーは明るく
const KIND_COL = { alt: '#4dabf7', hand: '#8a93a3', finger: '#ffa94d', repeat: '#b197fc' };
const KIND_JA = { alt: '左右交互', hand: '同じ手', finger: '同じ指', repeat: '同じキー2回' };
function drawIki(cur) {
  const cv = $('ikiChart'); if (!cv || !S.plan || S.mode !== 'watch') return;
  const ns = S.plan.notes.filter(n => n.iki), w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  if (!ns.length) return;
  const mx = Math.max(...ns.map(n => n.iki)) * 1.05, mean = ns.reduce((s, n) => s + n.iki, 0) / ns.length, bw = w / ns.length;
  ns.forEach((n, i) => { const bh = (h - 14) * n.iki / mx; g.globalAlpha = cur < 0 || n === S.plan.notes[cur] ? 1 : 0.55; g.fillStyle = KIND_COL[n.kind] || '#888'; g.fillRect(i * bw + (bw > 3 ? 0.5 : 0), h - bh, Math.max(1, bw - (bw > 3 ? 1 : 0)), bh); });
  g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([4, 3]); const my = h - (h - 14) * mean / mx; g.beginPath(); g.moveTo(0, my); g.lineTo(w, my); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#a4acb8'; g.font = '11px sans-serif'; g.fillText('最長 ' + Math.round(Math.max(...ns.map(n => n.iki)) * 1000) + 'ms・平均 ' + Math.round(mean * 1000) + 'ms・最短 ' + Math.round(Math.min(...ns.map(n => n.iki)) * 1000) + 'ms', 2, 11);
}

function frame(now) {
  try {
    const dt = Math.min(0.1, (now - (S.lastNow || now)) / 1000);
    S.lastNow = now;
    if (S.playing && !S.live) {
      S.t += dt * S.speed;
      if (S.t >= tEnd()) { S.t = tEnd(); setPlaying(false); }
    }
    step();
  } catch (e) { window.__tyhaErr.push(String(e && e.message)); console.error(e); }
  requestAnimationFrame(frame);
}
function step() {
  if (S.mode === 'replay') recTick();
  if (!S.plan && S.mode !== 'replay') return; // 最初の計算がおわる前
  const plan = S.plan, t = S.t, notes = plan ? plan.notes : [];
  if (S.playing || S.live) for (const n of notes) { // 押した音と離した音
    if (n.miss) continue;
    if (n.t0 > S.prevT && n.t0 <= t) keySound(n.m, false, S.live ? 1 : S.speed);
    if (n.t1 > S.prevT && n.t1 <= t) keySound(n.m, true, S.live ? 1 : S.speed);
  }
  S.prevT = t;
  let disp = plan, poses;
  if (S.mode === 'replay') { // まだ打っていない手は、ホームポジションで休む
    const hands = [];
    poses = [];
    for (const side of [1, -1]) {
      const h = plan && plan.hands.find(x => x.side === side);
      if (h) { hands.push(h); poses.push(S.live ? livePose(h, t) : poseAt(h, t)); } else { const r = homeRest(side); hands.push(r.hand); poses.push(Object.assign({}, r.pose, { t })); }
    }
    disp = { hands, notes };
  } else poses = plan.hands.map(h => poseAt(h, t));
  resizeView();
  CAM.follow = $('optFollow').checked;
  updateCam(poses);
  renderPose(disp, poses, OPT);
  $('toolbar').hidden = $('hint').hidden = S.live; // 打っているあいだは再生の操作を隠す（画面のキーボードの場所をあける）
  if (!S.live && document.activeElement !== $('time')) $('time').value = Math.round(1000 * (t - tStart()) / (tEnd() - tStart()));
  $('clock').textContent = t.toFixed(2) + ' 秒';
  renderTyped(t);
  if (S.mode === 'watch') { let ci = -1; notes.forEach((n, i) => { if (n.t0 <= t + 1e-6) ci = i; }); if (ci !== S.ikiCur || S.ikiPlan !== plan) { S.ikiCur = ci; S.ikiPlan = plan; drawIki(ci); } }
  // 止めているときだけ、この瞬間の様子（どの指でどのキーか）
  if (S.live) $('hint').textContent = REC.notes.length ? `打ったキーを、${REC_LAG} 秒おくれて画面の手が打ちます。` : 'キーボードを打つか、下の画面のキーボードを押してください。';
  else if (!S.playing) {
    const now = notes.filter(n => t >= n.t0 - 0.02 && t <= n.t1 + 0.02);
    $('hint').innerHTML = now.length ? 'この瞬間 — ' + now.map(n => `<b>${noteName(n.m)}</b> を${HAND_OF(n.hand === 'R' ? 1 : -1)}${FINGERS[n.f].name}で${n.iki ? `（前のキーから ${Math.round(n.iki * 1000)}ms・${KIND_JA[n.kind] || ''}）` : ''}`).join('、')
      : 'ドラッグで向きを変え、ホイールや2本指のピンチで寄れます。時刻のつまみ・矢印キーで1コマずつ動かせます。';
  } else $('hint').textContent = '';
}
function setPlaying(on) {
  if (S.live) on = false;
  S.playing = on;
  $('btnPlay').textContent = on ? '⏸ 止める' : '▶ 再生';
  if (on && S.t >= tEnd() - 0.01) setTime(tStart());
  if (on && AC && AC.state === 'suspended') AC.resume();
}

// 手の見え方（ピアノを弾く手と同じ6つ）
const LOOKS = [['skin', '手: 皮ふ', {}], ['ghost', '手: 半透明', { ghost: true }], ['xray', '手: 皮ふを透かして骨', { xray: true }],
  ['xraymus', '手: 皮ふを透かして骨と筋肉', { xray: true, muscles: true }], ['muscles', '手: 骨と筋肉・腱・脂肪', { muscles: true }], ['bones', '手: 骨だけ', { bones: true }]];
function setLook(id) {
  const f = LOOKS.find(l => l[0] === id)[2];
  for (const k of ['ghost', 'xray', 'muscles', 'bones']) OPT[k] = !!f[k];
  $('handLook').value = id; $('lookLegend').hidden = !f.muscles;
}
function setView(name) {
  setCam(name);
  document.querySelectorAll('#views button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === name));
}

// 「つぎへ」1つで順に見る（タブやボタンを探さなくてよいように）。各段で文・速さ・見え方・カメラを決めて、再生する
const TOUR = [
  { msg: '人さし指を F と J（小さな出っぱりのあるキー）に置くのが「ホームポジション」。キーの色は、どの指で打つかの割り当てです。', text: 'home', kpm: 400, look: 'skin', view: 'top', map: true, speed: 1, at: 0.3, play: false },
  { msg: 'ゆっくり打ちます。指先の番号（1 親指 〜 5 小指）で、どの指が動くかを見てください。', text: 'tenki', kpm: 120, look: 'skin', view: 'tilt', map: true, nums: true, speed: 1, play: true },
  { msg: 'ふつうの速さ（1分に 400 キー）。打たない指もキーの上で休みながら、次のキーへ先回りしています。', text: 'tenki', kpm: 400, look: 'skin', view: 'tilt', map: false, speed: 1, play: true },
  { msg: '皮ふを透かして骨と筋肉。キーを押すたびに、指の骨と関節がどう曲がるかが見えます（筋肉・腱の模型は目安）。', text: 'fox', kpm: 400, look: 'xraymus', view: 'tilt', map: false, speed: 1, play: true },
  { msg: '自分で打ってみましょう。打ったキーを、1.5 秒おくれて画面の手が打ちます（指は標準の割り当て）。', end: true },
];
let tourI = -1;
function nextTour() {
  tourI = (tourI + 1) % TOUR.length;
  const s = TOUR[tourI];
  $('tourMsg').textContent = s.msg;
  $('btnNext').textContent = tourI === TOUR.length - 1 ? '最初から ↺' : 'つぎへ ▶';
  if (s.end) { setMode('replay'); setView('tilt'); setLook('skin'); return; }
  setMode('watch', true);
  setPlaying(false);
  KPM = s.kpm; $('kpmSel').value = String(KPM);
  busy('手の動きを計算しています…', async () => {
    await setText(s.text);
    setLook(s.look); setView(s.view);
    OPT.fingerMap = $('optFingerMap').checked = s.map;
    OPT.fingerNums = $('optFingerNums').checked = !!s.nums;
    S.speed = s.speed; $('speedSel').value = String(s.speed);
    if (s.at) setTime(s.at);
    if (s.play) setPlaying(true);
  });
}

// モード: ながめる（watch）・再現する（replay）。noCompute なら文の計算をしない（つぎへが続けて計算する）
function setMode(m, noCompute) {
  if (S.mode === m) return;
  setPlaying(false);
  S.mode = m; $('app').dataset.mode = m;
  document.querySelectorAll('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
  $('secWatch').hidden = m !== 'watch'; $('secReplay').hidden = $('recBox').hidden = m !== 'replay';
  if (m === 'replay') { // 「つぎへ」の説明も、最後の段（自分で打つ）に合わせる
    tourI = TOUR.length - 1; $('tourMsg').textContent = TOUR[tourI].msg; $('btnNext').textContent = '最初から ↺';
    recClear(); S.t = 0; S.prevT = 0; return;
  }
  S.live = false; REC.reqId++; $('checks').hidden = false;
  if (!noCompute) busy('手の動きを計算しています…', () => setText(S.text.id));
}

function initUI() {
  document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  $('btnRecClear').addEventListener('click', () => { recClear(); S.t = 0; S.prevT = 0; });
  $('btnRecPlay').addEventListener('click', recPlayAll);
  makeScreenKeyboard();
  $('timingSel').innerHTML = [['model', '打つ間隔: 運指で変えて、ゆらぎも（推定）'], ['pair', '打つ間隔: 運指で変える（ゆらぎなし）'], ['even', '打つ間隔: いつも同じ']].map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('timingSel').value = TIMING;
  $('timingSel').addEventListener('change', e => { setPlaying(false); TIMING = e.target.value; busy('手の動きを計算しています…', () => setText(S.text.id)); });
  setPlaying(false);
  $('textSel').innerHTML = TEXTS.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
  $('textSel').addEventListener('change', e => { setPlaying(false); busy('手の動きを計算しています…', () => setText(e.target.value)); });
  $('kpmSel').innerHTML = KPM_LIST.map(v => `<option value="${v}">打つ速さ: 1分に ${v} キー${v === KPM_RECORD ? '（世界記録の速さ）' : ''}</option>`).join('');
  $('kpmSel').value = String(KPM);
  $('kpmSel').addEventListener('change', e => { setPlaying(false); KPM = +e.target.value; busy('手の動きを計算しています…', () => setText(S.text.id)); });
  $('speedSel').innerHTML = SPEEDS.map(v => `<option value="${v}">再生 ×${v}</option>`).join('');
  $('speedSel').value = String(S.speed);
  $('speedSel').addEventListener('change', e => { S.speed = +e.target.value; });
  $('btnPlay').addEventListener('click', () => setPlaying(!S.playing));
  $('btnNext').addEventListener('click', nextTour);
  $('time').addEventListener('input', e => { setPlaying(false); setTime(tStart() + (tEnd() - tStart()) * e.target.value / 1000); });
  document.querySelectorAll('#views button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));
  $('handLook').innerHTML = LOOKS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('handLook').addEventListener('change', e => setLook(e.target.value));
  const opts = { optFingerMap: 'fingerMap', optFingerNums: 'fingerNums', optTargets: 'targets' };
  for (const id in opts) { OPT[opts[id]] = $(id).checked; $(id).addEventListener('change', e => { OPT[opts[id]] = e.target.checked; }); }
  $('sceneSel').innerHTML = Object.entries(SCENES).map(([k, s]) => `<option value="${k}">シーン: ${s.name}</option>`).join('');
  $('sceneSel').value = V.sceneId;
  $('sceneSel').addEventListener('change', e => applyScene(e.target.value));
  $('optFx').checked = V.fxLevel > 0;
  $('optFx').addEventListener('change', e => applyFx(e.target.checked ? 1 : 0));
  // キーボードの種類（2026-10-17〜、ユーザーの希望）: 並び・寸法が変わるので、キーの見た目・手の形・計算をすべて作りなおす
  $('kbSel').innerHTML = Object.entries(KB_TYPES).map(([k, t]) => `<option value="${k}">キーボード: ${t.name}</option>`).join('');
  $('kbSel').value = KB.id;
  $('kbSel').addEventListener('change', e => { setPlaying(false); busy('キーボードを作りなおしています…', async () => { useKeyboard(e.target.value); makeKeyboard(V.scene); makeScreenKeyboard(); REC.home = null; if (S.mode === 'replay') { recClear(); S.t = 0; } else await setText(S.text.id); }); });
  // 指の構え（ピアノを弾く手と同じ3つ。最初は中間）: 力を抜いた指の曲げと手首の高さが変わり、ホームポジションの形も作りなおす
  $('postureSel').innerHTML = [['curved', '指の構え: 立てる'], ['mid', '指の構え: 中間'], ['flat', '指の構え: 寝かせる']].map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('postureSel').value = POSTURE;
  $('postureSel').addEventListener('change', e => { setPlaying(false); busy('手の動きを計算しています…', async () => { POSTURE = e.target.value; HOME_TIP = null; REC.home = null; if (S.mode === 'replay') { recClear(); S.t = 0; } else await setText(S.text.id); }); });
  $('optFlex').checked = FLEX;
  $('optFlex').addEventListener('change', e => { setPlaying(false); busy('手の動きを計算しています…', async () => { applyFlex(e.target.checked); HOME_TIP = null; REC.home = null; if (S.mode === 'replay') { recClear(); S.t = 0; } else await setText(S.text.id); }); });
  $('handModel').innerHTML = Object.entries(HAND_MODELS).map(([k, m]) => `<option value="${k}">手のモデル: ${m.name}</option>`).join('');
  $('handModel').value = HAND.id;
  $('handModel').addEventListener('change', e => { setPlaying(false); busy('手を作りなおしています…', async () => { setHandModel(e.target.value); rebuildSkins(); REC.home = null; if (S.mode === 'replay') { recClear(); S.t = 0; } else await setText(S.text.id); }); });
  $('chkTable').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const r = S.checks[tr.dataset.id];
    if (r.at !== null) { setPlaying(false); setTime(r.at); }
  });
  document.addEventListener('keyup', e => onPhysKey(e, false));
  document.addEventListener('keydown', e => {
    if (onPhysKey(e, true)) return; // 「再現する」では、打ったキーを読む（スペース・矢印もふつうのキーとして）
    if (S.mode === 'replay' && S.live) return;
    if (e.target.tagName === 'SELECT' || (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range')) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!S.playing); }
    if (e.code === 'ArrowRight') { setPlaying(false); setTime(S.t + 1 / 30); }
    if (e.code === 'ArrowLeft') { setPlaying(false); setTime(S.t - 1 / 30); }
  });
}

window.__tyha = {
  S, OPT, REC, setTime, setText, nextTour, setMode, recKeyDown, recKeyUp, recPlayAll,
  poseAt: (t, hi) => poseAt(S.plan.hands[hi || 0], t),
  simRun(sec) { setTime(S.t + sec); step(); return S.t; },
  // すべての文・速さで検査（押せなかったキーの数も）
  checksAll(ids, kpms) { // 例 checksAll(['fox'], [300, 1080])。なしなら寿限無を除く文 × 120〜400 と 1080（全部だと何分もかかる）
    const out = {}, k0 = KPM;
    for (const kpm of kpms || [120, 200, 300, 400, 1080]) for (const tx of TEXTS.filter(x => ids ? ids.includes(x.id) : x.id !== 'jugemu')) {
      KPM = kpm; const p = buildPlan(textToSong(tx)), r = runChecks(p);
      out[tx.id + '@' + kpm] = { miss: p.notes.filter(n => n.miss).map(n => n.ch).join(''), ...Object.fromEntries(CHECKS.map(c => [c.id, +r[c.id].v.toFixed(1) + (r[c.id].at !== null ? '@' + r[c.id].at.toFixed(2) : '')])) };
    }
    KPM = k0; return out;
  },
  // 見た目の確認用: 決まった時刻のコマを並べた一覧を画面の上に出す（クリックで消える）
  sheet(times, cam, cols) {
    if (cam) setView(cam);
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
};

// 読みこみ中の表示: 重い計算の前に文言を変えて、画面に出てから計算する（タブが隠れていると requestAnimationFrame が止まるので、0.1 秒で先へ進む）
const paint = () => new Promise(r => { const t = setTimeout(r, 100); requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); r(); }, 0)); });
async function showLoading(msg) { $('loading').hidden = false; $('loadMsg').textContent = msg; await paint(); }
function hideLoading() { $('loading').hidden = true; }
async function busy(msg, fn) { await showLoading(msg); try { await fn(); } finally { hideLoading(); } }

async function boot() {
  try {
    await showLoading('手の皮ふを作っています…');
    initView($('view'));
    initUI();
    await showLoading('手の動きを計算しています…');
    tourI = -1;
    hideLoading();
    nextTour();
    requestAnimationFrame(frame);
  } catch (e) { window.__tyhaErr.push(String(e && e.message)); console.error(e); $('loadMsg').textContent = '読みこめませんでした: ' + e.message; }
}
boot();
