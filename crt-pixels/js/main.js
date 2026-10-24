// ブラウン管のドット絵 — メイン（状態・画面の部品・描くタイミング・デバッグ用の窓口）
'use strict';
window.__crpiErr = [];
window.addEventListener('error', e => window.__crpiErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const cv = $('cv'), stage = $('stage');

// 画面の種類: マスクの形と、1ドットあたりの光る点の組（14型くらいを想定した推定）
const SCREENS = {
  shadow: { mask: 1, triads: 1.5 },
  slot:   { mask: 2, triads: 1.5 },
  grille: { mask: 3, triads: 2.6 }
};
const LINK_NOTE = {
  rgb: '赤・緑・青を別々の線で送る。信号のにじみはありません（モニターや一部のテレビ）。',
  svideo: '明るさと色を別の線で送る。色だけ横ににじみ、明るさはくっきり。',
  composite: '明るさと色を1本の線にまぜて送る（黄色い端子）。色がにじみ、こまかい模様は色とまちがえられ、チェック模様はまざります。',
  rf: 'アンテナの線でテレビに送る。ビデオ端子よりさらににじみ、雪のようなノイズがのります（ノイズは演出に近い）。'
};
// しくみ（効き目の大きい順）
const MECH = [
  { id: 'scan', name: '走査線', badge: '推定あり', text: '電子ビームが1行ずつ横になぞります。1行は太さのある光の帯で、行のあいだに暗いすきま。明るい行ほど帯が太ります（太り方は推定）。' },
  { id: 'signal', name: '信号のにじみ', badge: '規格＋推定', text: '下の「つなぎ方」のにじみ。切るとRGBと同じになります。色は細かく送れないので横ににじみ、細かい模様は色にまちがえられます。' },
  { id: 'mask', name: '赤緑青の光る点', badge: '推定', text: '画面は赤・緑・青の小さな光る点の集まり。寄ると1つずつ見えます。大きさは14型くらいのテレビを想定した推定です。' },
  { id: 'gamma', name: '明るさの曲がり', badge: '規格', text: 'ブラウン管は、暗いところがより暗く出ます（ガンマ約2.4。ITU-R BT.1886）。いまの画面は約2.2。' },
  { id: 'bloom', name: '光のにじみ', badge: '推定', text: '明るいところの光が前のガラスの中で散って、まわりがほんのり明るくなります。' },
  { id: 'curve', name: '画面のふくらみ', badge: '推定', text: 'ガラスの面が丸くふくらんでいて、はしが少し曲がって見えます。' }
];
const PICS = {
  falls: { cap: '滝の両はしは、水と岩のチェック模様。液晶ではそのまま見え、ブラウン管ではまざって半透明のしぶきに見えます。', focus: [104, 112, 7] },
  lion: { cap: '目の白い1ドット、ふちの中間の色、ディザの影。ブラウン管では、ドットのあいだがやわらかくつながります。', focus: [108, 104, 7] },
  patterns: { cap: '①白黒の1ドットじま（ビデオ端子だと色がつく）②2ドットじま ③白黒チェック（灰色にまざる）④赤青チェック（むらさきに）⑤横じま（信号では消えない）⑥ディザのグラデーション', focus: [20, 30, 8] },
  user: { cap: '自分の画像。この端末の中だけで計算しています。', focus: null }
};

const S = {
  pic: 'falls', screen: 'shadow', link: 'composite', inter: 0, frame: 'avg',
  on: { scan: true, signal: true, mask: true, gamma: true, bloom: true, curve: true },
  userPic: null, current: null, sigKey: ''
};

let R = null;
try { R = window.CRT_GL(cv); } catch (e) { window.__crpiErr.push('gl: ' + e.message); }
if (!R) { $('nogl').hidden = false; }

let dirty = true;
const view = window.CRT_VIEW(stage, cv, $('handle'), () => { dirty = true; });

function picture() { return S.pic === 'user' ? S.userPic : window.CRT_PICTURES.get(S.pic); }
function linkName() { return S.on.signal ? S.link : 'rgb'; }

// 信号の計算は重いので、絵・つなぎ方・コマが変わったときだけ
function updateSignal() {
  const pic = picture(); if (!pic || !R) return;
  const key = [S.pic, pic.w, pic.h, linkName(), S.frame].join('|');
  if (key === S.sigKey && S.current === pic) return;
  const t0 = performance.now();
  const fr = S.frame === 'avg' ? 'avg' : Number(S.frame);
  const sig = window.CRT_NTSC.decode(pic, linkName(), fr);
  if (S.current !== pic) { R.setPicture(pic); S.current = pic; view.setPicture(pic.w, pic.h); }
  R.setSignal(sig, pic.w * window.CRT_NTSC.OUT, pic.h);
  S.sigKey = key; S.sigMs = performance.now() - t0;
  dirty = true;
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  view.fit(); dirty = true;
}

function draw() {
  const V = view.V, w = cv.clientWidth;
  $('divider').style.left = (V.split * w) + 'px';
  const scr = SCREENS[S.screen], mult = V.z / V.fitZ;
  const cellCss = V.z / scr.triads;
  let hud = `×${mult.toFixed(1)}　`;
  const dprNow = cv.width / Math.max(1, w);
  if (S.on.scan && V.z * dprNow < 4.5) hud += '寄ると走査線が見えます';
  else if (S.on.mask && cellCss * dprNow < 8) hud += 'もっと寄ると光る点が見えます';
  else if (S.on.mask) hud += `1ドット＝光る点 ${scr.triads}組（推定）`;
  $('hud').innerHTML = hud;
  if (!R) return;
  const dpr = cv.width / Math.max(1, w);
  R.draw({
    view: [V.x * dpr, V.y * dpr, V.z * dpr], split: V.split * cv.width,
    scan: S.on.scan ? 1 : 0, inter: S.inter, mask: S.on.mask ? scr.mask : 0, triads: scr.triads,
    gamma: S.on.gamma ? 2.4 : 2.2, bloom: S.on.bloom ? 0.10 : 0, curve: S.on.curve ? 1 : 0,
    noise: (S.on.signal && S.link === 'rf') ? window.CRT_NTSC.LINKS.rf.noise : 0, seed: 1.7
  });
}

let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; // 最初のコマは now が last より前のことがある
  if (view.hint(dt)) dirty = true;
  if (dirty) { dirty = false; draw(); }
  requestAnimationFrame(loop);
}

// ---------- 画面の部品 ----------
function segment(id, attr, get, set) {
  const el = $(id);
  const paint = () => el.querySelectorAll(`[data-${attr}]`).forEach(b => b.classList.toggle('on', String(get()) === b.dataset[attr]));
  el.addEventListener('click', e => { const b = e.target.closest(`[data-${attr}]`); if (!b) return; set(b.dataset[attr]); paint(); refresh(); });
  return paint;
}
const paints = [
  segment('picSeg', 'pic', () => S.pic, v => { S.pic = v; }),
  segment('scrSeg', 'scr', () => S.screen, v => { S.screen = v; }),
  segment('linkSeg', 'link', () => S.link, v => { S.link = v; S.on.signal = true; }),
  segment('interSeg', 'inter', () => S.inter, v => { S.inter = Number(v); }),
  segment('frameSeg', 'frame', () => S.frame, v => { S.frame = v; })
];
function buildMech() {
  $('mech').innerHTML = MECH.map(m => `<li><label><input type="checkbox" data-m="${m.id}">${m.name}<span class="badge">${m.badge}</span></label><span></span>
    <button class="only" data-only="${m.id}">だけ</button><p>${m.text}</p></li>`).join('');
  $('mech').addEventListener('change', e => { const k = e.target.dataset.m; if (k) { S.on[k] = e.target.checked; refresh(); } });
  $('mech').addEventListener('click', e => {
    const k = e.target.dataset.only; if (!k) return;
    for (const m of MECH) S.on[m.id] = m.id === k;
    refresh();
  });
  $('allOn').addEventListener('click', () => { for (const m of MECH) S.on[m.id] = true; refresh(); });
}
function refresh() {
  paints.forEach(p => p());
  $('mech').querySelectorAll('input[data-m]').forEach(i => { i.checked = S.on[i.dataset.m]; });
  $('linkNote').textContent = LINK_NOTE[S.link] + (S.on.signal ? '' : '（いまは「信号のにじみ」を切っています）');
  $('cap').textContent = PICS[S.pic].cap;
  $('focusBtn').hidden = !PICS[S.pic].focus;
  updateSignal();
  dirty = true;
}

$('zoom').addEventListener('click', e => {
  const z = e.target.dataset.z; if (!z) return;
  if (z === 'fit') view.fit(); else view.zoomBy(z === 'in' ? 1.6 : 1 / 1.6);
});
$('focusBtn').addEventListener('click', () => {
  const f = PICS[S.pic].focus; if (!f) return;
  S.on.mask = true; view.focus(f[0], f[1], f[2]); view.V.split = 0.5; refresh();
  document.getElementById('pin').scrollIntoView({ block: 'start' });
});

// 自分の画像（ファイルを選ぶ・画面に落とす）
async function useFile(file) {
  try {
    const { pic, note } = await window.CRT_UPLOAD.load(file);
    S.userPic = pic; S.pic = 'user';
    $('fileNote').textContent = note + ' この端末の中だけで計算し、どこにも送りません。';
    refresh();
  } catch (e) { $('fileNote').textContent = e.message; }
}
$('file').addEventListener('change', e => { if (e.target.files[0]) useFile(e.target.files[0]); e.target.value = ''; });
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) useFile(e.dataTransfer.files[0]); });

cv.addEventListener('webglcontextlost', e => { e.preventDefault(); });
cv.addEventListener('webglcontextrestored', () => { R = window.CRT_GL(cv); S.current = null; S.sigKey = ''; updateSignal(); });

buildMech();
window.addEventListener('resize', resize);
resize(); refresh(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__crpi = {
  S, view, MECH, useFile,
  set(o) { const { on, ...rest } = o; Object.assign(S, rest); if (on) Object.assign(S.on, on); refresh(); draw(); },
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) view.hint(dt); draw(); }
};
