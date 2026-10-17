// 画面の操作と、毎フレームの更新。デバッグ用の窓口は window.__tyha（例外は window.__tyhaErr）
'use strict';
window.__tyhaErr = [];
window.addEventListener('error', e => window.__tyhaErr.push(String(e.message)));
const $ = id => document.getElementById(id);
const S = { plan: null, checks: null, text: null, t: 0, playing: false, speed: 1, lastNow: 0, prevT: 0 };
const OPT = { fingerMap: true, fingerNums: false, targets: false, ghost: false, bones: false, xray: false, muscles: false };
const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

// 音: キーを押した瞬間の「カタッ」（短い雑音をフィルターに通す。ブラウザの中で合成し、外の音の素材は読まない）
let AC = null, NOISE = null;
function click(m) {
  if (!$('chkSound').checked) return;
  if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); NOISE = AC.createBuffer(1, AC.sampleRate * 0.05, AC.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (AC.sampleRate * 0.006)); }
  const now = AC.currentTime, src = AC.createBufferSource(), bp = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = NOISE; bp.type = 'bandpass'; bp.frequency.value = KEYS[m].w > 2 ? 900 : 2200 + 300 * Math.sin(m * 7.1); bp.Q.value = 1.4;
  g.gain.value = 0.5; src.connect(bp); bp.connect(g); g.connect(AC.destination); src.start(now);
}

function tStart() { return 0; }
function tEnd() { return S.plan.end + 1.2; }
function setTime(t) { S.t = Math.min(tEnd(), Math.max(tStart(), t)); S.prevT = S.t; }

// 文を選ぶ・速さを変える → 手の動きを計算し直す
function setText(id) {
  const tx = TEXTS.find(x => x.id === id) || TEXTS[0];
  S.text = tx;
  const song = textToSong(tx);
  S.plan = buildPlan(song);
  S.checks = runChecks(S.plan);
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
  $('typedShow').textContent = S.text.show;
  let html = '';
  for (const n of S.plan.notes) {
    const c = n.ch === ' ' ? '␣' : n.ch === '\n' ? '⏎' : n.ch;
    const cls = n.miss ? 'miss' : t >= n.t0 && t <= n.t1 + 0.05 ? 'on' : t > n.t1 ? 'done' : '';
    html += `<span class="${cls}"${cls === 'on' ? ` style="background:#${FCOL[n.f].toString(16).padStart(6, '0')}"` : ''}>${c}</span>`;
  }
  if (html !== S.lastTyped) { $('typedKeys').innerHTML = html; S.lastTyped = html; }
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
  } catch (e) { window.__tyhaErr.push(String(e && e.message)); console.error(e); }
  requestAnimationFrame(frame);
}
function step() {
  if (!S.plan) return; // 最初の計算がおわる前
  const plan = S.plan, t = S.t;
  if (S.playing) for (const n of plan.notes) if (n.t0 > S.prevT && n.t0 <= t && !n.miss) click(n.m);
  S.prevT = t;
  const poses = plan.hands.map(h => poseAt(h, t));
  resizeView();
  CAM.follow = $('optFollow').checked;
  updateCam(poses);
  renderPose(plan, poses, OPT);
  if (document.activeElement !== $('time')) $('time').value = Math.round(1000 * (t - tStart()) / (tEnd() - tStart()));
  $('clock').textContent = t.toFixed(2) + ' 秒';
  renderTyped(t);
  // 止めているときだけ、この瞬間の様子（どの指でどのキーか）
  if (!S.playing) {
    const now = plan.notes.filter(n => t >= n.t0 - 0.02 && t <= n.t1 + 0.02);
    $('hint').innerHTML = now.length ? 'この瞬間 — ' + now.map(n => `<b>${noteName(n.m)}</b> を${HAND_OF(n.hand === 'R' ? 1 : -1)}${FINGERS[n.f].name}で`).join('、')
      : 'ドラッグで向きを変え、ホイールや2本指のピンチで寄れます。時刻のつまみ・矢印キーで1コマずつ動かせます。';
  } else $('hint').textContent = '';
}
function setPlaying(on) {
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
  { msg: '人さし指を F と J（小さな出っぱりのあるキー）に置くのが「ホームポジション」。キーの色は、どの指で打つかの割り当てです。', text: 'home', kpm: 120, look: 'skin', view: 'top', map: true, speed: 0.5, at: 0.3, play: false },
  { msg: 'ゆっくり打ちます。指先の番号（1 親指 〜 5 小指）で、どの指が動くかを見てください。', text: 'tenki', kpm: 120, look: 'skin', view: 'tilt', map: true, nums: true, speed: 0.5, play: true },
  { msg: 'ふつうの速さ（1分に 300 キー）。打たない指もキーの上で休みながら、次のキーへ先回りしています。', text: 'tenki', kpm: 300, look: 'skin', view: 'tilt', map: false, speed: 1, play: true },
  { msg: '皮ふを透かして骨と筋肉。キーを押すたびに、指の骨と関節がどう曲がるかが見えます（筋肉・腱の模型は目安）。', text: 'fox', kpm: 300, look: 'xraymus', view: 'tilt', map: false, speed: 0.5, play: true },
  { msg: '自分で文や速さを選び、向きを変えて見てください（自分で打ったキーを手が打つモードは、次の段階で作ります）。', end: true },
];
let tourI = -1;
function nextTour() {
  tourI = (tourI + 1) % TOUR.length;
  const s = TOUR[tourI];
  $('tourMsg').textContent = s.msg;
  $('btnNext').textContent = tourI === TOUR.length - 1 ? '最初から ↺' : 'つぎへ ▶';
  if (s.end) return;
  setPlaying(false);
  KPM = s.kpm; $('kpmSel').value = String(KPM);
  busy('手の動きを計算しています…', () => {
    setText(s.text);
    setLook(s.look); setView(s.view);
    OPT.fingerMap = $('optFingerMap').checked = s.map;
    OPT.fingerNums = $('optFingerNums').checked = !!s.nums;
    S.speed = s.speed; $('speedSel').value = String(s.speed);
    if (s.at) setTime(s.at);
    if (s.play) setPlaying(true);
  });
}

function initUI() {
  setPlaying(false);
  $('textSel').innerHTML = TEXTS.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
  $('textSel').addEventListener('change', e => { setPlaying(false); busy('手の動きを計算しています…', () => setText(e.target.value)); });
  $('kpmSel').innerHTML = KPM_LIST.map(v => `<option value="${v}">打つ速さ: 1分に ${v} キー</option>`).join('');
  $('kpmSel').value = String(KPM);
  $('kpmSel').addEventListener('change', e => { setPlaying(false); KPM = +e.target.value; busy('手の動きを計算しています…', () => setText(S.text.id)); });
  $('speedSel').innerHTML = SPEEDS.map(v => `<option value="${v}">再生 ×${v}</option>`).join('');
  $('speedSel').value = '1';
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
  $('handModel').innerHTML = Object.entries(HAND_MODELS).map(([k, m]) => `<option value="${k}">手のモデル: ${m.name}</option>`).join('');
  $('handModel').value = HAND.id;
  $('handModel').addEventListener('change', e => { setPlaying(false); busy('手を作りなおしています…', () => { setHandModel(e.target.value); rebuildSkins(); setText(S.text.id); }); });
  $('chkTable').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const r = S.checks[tr.dataset.id];
    if (r.at !== null) { setPlaying(false); setTime(r.at); }
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT' || (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range')) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!S.playing); }
    if (e.code === 'ArrowRight') { setPlaying(false); setTime(S.t + 1 / 30); }
    if (e.code === 'ArrowLeft') { setPlaying(false); setTime(S.t - 1 / 30); }
  });
}

window.__tyha = {
  S, OPT, setTime, setText, nextTour,
  poseAt: (t, hi) => poseAt(S.plan.hands[hi || 0], t),
  simRun(sec) { setTime(S.t + sec); step(); return S.t; },
  // すべての文・速さで検査（押せなかったキーの数も）
  checksAll() {
    const out = {}, k0 = KPM;
    for (const kpm of KPM_LIST) for (const tx of TEXTS) {
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
