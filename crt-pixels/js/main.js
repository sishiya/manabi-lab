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
  rgb: L('赤・緑・青を別々の線で送る。信号のにじみはありません（モニターや一部のテレビ）。', 'Red, green and blue go on separate wires. No signal blur (monitors and some TVs).'),
  svideo: L('明るさと色を別の線で送る。色だけ横ににじみ、明るさはくっきり。', 'Brightness and color go on separate wires. Only the color blurs sideways; brightness stays sharp.'),
  composite: L('明るさと色を1本の線にまぜて送る（黄色い端子）。色がにじみ、こまかい模様は色とまちがえられ、チェック模様はまざります。', 'Brightness and color are mixed into one wire (the yellow plug). Color blurs, fine patterns are mistaken for color, and checkerboards blend.'),
  rf: L('アンテナの線でテレビに送る。ビデオ端子よりさらににじみ、雪のようなノイズがのります（ノイズは演出に近い）。', 'Sent through the antenna cable. Even blurrier than composite, with snow-like noise (the noise is closer to a visual effect).')
};
// しくみ（効き目の大きい順）
const MECH = [
  { id: 'scan', name: L('走査線', 'Scan lines'), badge: L('推定あり', 'partly estimated'), text: L('電子ビームが1行ずつ横になぞります。1行は太さのある光の帯で、行のあいだに暗いすきま。明るい行ほど帯が太ります（太り方は推定）。', 'The electron beam traces the screen one line at a time. Each line is a band of light with thickness, with dark gaps between lines. Brighter lines get thicker (how much is estimated).') },
  { id: 'signal', name: L('信号のにじみ', 'Signal blur'), badge: L('規格＋推定', 'standard + estimate'), text: L('下の「つなぎ方」のにじみ。切るとRGBと同じになります。色は細かく送れないので横ににじみ、細かい模様は色にまちがえられます。', 'The blur from the “Connection” below. Turning it off is the same as RGB. Color cannot be sent in fine detail, so it smears sideways, and fine patterns are mistaken for color.') },
  { id: 'mask', name: L('赤緑青の光る点', 'Red, green and blue dots'), badge: L('推定', 'estimate'), text: L('画面は赤・緑・青の小さな光る点の集まり。寄ると1つずつ見えます。大きさは14型くらいのテレビを想定した推定です。', 'The screen is made of tiny glowing red, green and blue dots. Zoom in to see them one by one. Their size is an estimate for a TV of about 14 inches.') },
  { id: 'gamma', name: L('明るさの曲がり', 'Brightness curve'), badge: L('規格', 'standard'), text: L('ブラウン管は、暗いところがより暗く出ます（ガンマ約2.4。ITU-R BT.1886）。いまの画面は約2.2。', 'A CRT shows dark areas even darker (gamma about 2.4, ITU-R BT.1886). Screens today use about 2.2.') },
  { id: 'bloom', name: L('光のにじみ', 'Glow'), badge: L('推定', 'estimate'), text: L('明るいところの光が前のガラスの中で散って、まわりがほんのり明るくなります。', 'Light from bright areas scatters inside the front glass, so the surroundings glow softly.') },
  { id: 'curve', name: L('画面のふくらみ', 'Curved glass'), badge: L('推定', 'estimate'), text: L('ガラスの面が丸くふくらんでいて、はしが少し曲がって見えます。', 'The glass bulges outward, so the edges look slightly bent.') }
];
const PICS = {
  retro: { cap: L('当時の家庭用ゲーム機ふうの画面（自作）。細い文字や輪郭は、ビデオ端子だと色がにじみ、夕焼けの帯のさかいのチェック模様はまざって見えます。', 'A screen in the style of home game consoles of the time (drawn for this app). Thin letters and outlines smear into color over composite, and the checkerboard where the sunset bands meet blends together.'), focus: [127, 172] },
  falls: { cap: L('滝の両はしは、水と岩のチェック模様。液晶ではそのまま見え、ブラウン管ではまざって半透明のしぶきに見えます。', 'Both edges of the waterfall are a checkerboard of water and rock. On the LCD you see the checkerboard; on the CRT it blends into see-through spray.'), focus: [104, 112] },
  lion: { cap: L('目の白い1ドット、ふちの中間の色、ディザの影。ブラウン管では、ドットのあいだがやわらかくつながります。', 'The single white pixel in the eye, in-between colors on the edges, dithered shading. On the CRT the pixels join together softly.'), focus: [110, 106] },
  patterns: { cap: L('①白黒の1ドットじま（ビデオ端子だと色がつく）②2ドットじま ③白黒チェック（灰色にまざる）④赤青チェック（むらさきに）⑤横じま（信号では消えない）⑥ディザのグラデーション', '1 one-pixel black/white stripes (turn colored on composite) 2 two-pixel stripes 3 black/white checkerboard (blends to gray) 4 red/blue checkerboard (turns purple) 5 horizontal stripes (the signal cannot blur them) 6 dithered gradient'), focus: [20, 30] },
  user: { cap: L('自分の画像。この端末の中だけで計算しています。', 'Your own image. It is processed only on this device.'), focus: null }
};
const FILE_NOTE = L('自分の画像（PNG など）はこの端末の中だけで計算し、どこにも送りません。拡大したスクリーンショットは元のドットに戻します。', 'Your own image (PNG etc.) is processed only on this device and never sent anywhere. Enlarged screenshots are shrunk back to their original pixels.');

const S = {
  pic: 'retro', screen: 'shadow', link: 'composite', inter: 0, frame: 'avg', par: 'tv',
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
const parValue = () => (S.par === 'tv' ? 8 / 7 : 1);   // 1ドットの横÷たて（当時のテレビは 8:7。NESdev Wiki「Overscan」）

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

// 上に固定した画面の下に、フォーカスやページ内の移動でボタンが隠れないように
// （左右2列のときは、画面は横にあるので要らない）。固定部分の大きさが変わるたびに測る
function padPin() {
  const pin = $('pin'), side = pin.offsetWidth < window.innerWidth * 0.9;
  document.documentElement.style.scrollPaddingTop = side ? '0px' : (pin.offsetHeight + 8) + 'px';
}
if (window.ResizeObserver) new ResizeObserver(padPin).observe($('pin'));

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  padPin();
  view.fit(); dirty = true;
}

function draw() {
  const V = view.V, w = cv.clientWidth;
  $('divider').style.left = (V.split * w) + 'px';
  $('zoom').querySelector('[data-z="dots"]').setAttribute('aria-pressed', String(dotsShown()));
  const scr = SCREENS[S.screen], mult = V.z / V.fitZ;
  const cellCss = V.z / scr.triads;
  let hud = `×${mult.toFixed(1)}  `;
  const dprNow = cv.width / Math.max(1, w);
  const rowPx = V.z * dprNow * (S.inter ? 0.5 : 1);   // シェーダーと同じ境目（1行 2.3 ピクセルより細いと、ならしている）
  if (S.on.scan && rowPx < 2.3) hud += L('寄ると走査線が見えます', 'Zoom in to see the scan lines');
  else if (S.on.mask && cellCss * dprNow < 3.5) hud += L('光る点は画面のピクセルに合わせた近似（寄ると本物の大きさ）', 'Dots matched to screen pixels (zoom in for real size)');
  else if (S.on.mask) hud += L(`1ドット＝光る点 ${(scr.triads * parValue()).toFixed(1)}組（推定）`, `1 pixel = ${(scr.triads * parValue()).toFixed(1)} sets of dots (estimate)`);
  $('hud').innerHTML = hud;
  if (!R) return;
  const dpr = cv.width / Math.max(1, w);
  R.draw({
    view: [V.x * dpr, V.y * dpr, V.z * dpr], split: V.split * cv.width,
    scan: S.on.scan ? 1 : 0, inter: S.inter, mask: S.on.mask ? scr.mask : 0, triads: scr.triads,
    par: parValue(), gamma: S.on.gamma ? 2.4 : 2.2, bloom: S.on.bloom ? 0.28 : 0, curve: S.on.curve ? 1 : 0,
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
  segment('frameSeg', 'frame', () => S.frame, v => { S.frame = v; }),
  segment('parSeg', 'par', () => S.par, v => { S.par = v; view.setPar(parValue()); }),
  segment('dotSeg', 'dot', () => S.userK, v => { setUserK(v); })
];
function buildMech() {
  $('mech').innerHTML = MECH.map(m => `<li><label><input type="checkbox" data-m="${m.id}" aria-label="${m.name}">${m.name}<span class="badge">${m.badge}</span></label><span></span>
    <button class="only" data-only="${m.id}">${L('だけ', 'Only')}</button><p>${m.text}</p></li>`).join('');
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
  $('linkNote').textContent = LINK_NOTE[S.link] + (S.on.signal ? '' : L('（いまは「信号のにじみ」を切っています）', ' (Signal blur is off right now.)'));
  $('cap').textContent = PICS[S.pic].cap;
  $('dotRow').hidden = !(S.pic === 'user' && S.userRaw);
  if (S.pic === 'user' && S.userNote) $('fileNote').textContent = S.userNote + L(' この端末の中だけで計算し、どこにも送りません。', ' Processed only on this device; never sent anywhere.');
  updateSignal();
  dirty = true;
}

// 画面の右下のボタン: 光る点まで寄る（もう一度で全体へ）・＋・−・全体
// （文字は <span lang> の中にあるので、押した要素からボタンまでさかのぼる）
const DOTS_PX = 15;   // 「光る点」で寄る大きさ: 1ドット＝15 デバイスピクセル（光る点の1組が 8 ピクセルをこえて、はっきり見える）
function dotsShown() { return view.V.z * (cv.width / Math.max(1, cv.clientWidth)) >= DOTS_PX * 0.8; }
$('zoom').addEventListener('click', e => {
  const b = e.target.closest('[data-z]'); if (!b) return;
  const z = b.dataset.z;
  if (z === 'fit') view.fit();
  else if (z === 'dots') {
    if (dotsShown()) { view.fit(); return; }
    const pic = picture(); if (!pic) return;
    const f = PICS[S.pic].focus || [pic.w / 2, pic.h / 2];
    const dpr = cv.width / Math.max(1, cv.clientWidth);
    S.on.mask = true; refresh();
    view.focus(f[0], f[1], DOTS_PX / dpr / view.V.fitZ); view.V.split = 0.5;
  } else view.zoomBy(z === 'in' ? 1.6 : 1 / 1.6);
});

// 自分の画像（ファイルを選ぶ・画面に落とす）
async function useFile(file) {
  try {
    const r = await window.CRT_UPLOAD.load(file);
    S.userRaw = r.raw; S.userK = 'auto'; S.userAutoK = r.k;
    S.userPic = r.pic; S.pic = 'user'; S.userNote = r.note;
    refresh();
  } catch (e) { $('fileNote').textContent = e.message; }
}
// 自分の画像の「元の1ドット＝何ピクセル」（写真とならべた画像などは自動で見つけられないので、手で選ぶ）
function setUserK(v) {
  if (!S.userRaw) return;
  S.userK = v;
  const r = window.CRT_UPLOAD.build(S.userRaw, v === 'auto' ? 0 : Number(v));
  S.userPic = r.pic; S.userNote = r.note;
}
$('file').addEventListener('change', e => { if (e.target.files[0]) useFile(e.target.files[0]); e.target.value = ''; });
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) useFile(e.dataTransfer.files[0]); });

cv.addEventListener('webglcontextlost', e => { e.preventDefault(); });
cv.addEventListener('webglcontextrestored', () => { R = window.CRT_GL(cv); S.current = null; S.sigKey = ''; updateSignal(); });

// 言語: 見出し・ボタンの説明（I18N.md）
document.title = L('ブラウン管のドット絵', 'Pixel Art on a CRT');
cv.setAttribute('aria-label', L('ドット絵を液晶とブラウン管で見くらべる画面', 'Screen comparing pixel art on an LCD and a CRT'));
$('handle').setAttribute('aria-label', L('仕切りを左右に動かす（矢印キーでも）', 'Move the divider left or right (arrow keys work too)'));
[['dots', L('光る点まで寄る（もう一度で全体へ）', 'Zoom in to the glowing dots (again to show all)')], ['in', L('寄る', 'Zoom in')], ['out', L('離れる', 'Zoom out')], ['fit', L('全体を見る', 'Show all')]].forEach(([z, t]) => $('zoom').querySelector(`[data-z="${z}"]`).setAttribute('aria-label', t));
$('fileNote').textContent = FILE_NOTE;
document.querySelectorAll('#langsw button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });

buildMech();
window.addEventListener('resize', resize);
// 窓の大きさが同じでも、並び（PC の2列・スマホの縦）が変わると画面の大きさが変わるので、それも見る
if (window.ResizeObserver) {
  let lastWH = '';
  new ResizeObserver(() => { const k = stage.clientWidth + 'x' + stage.clientHeight; if (k !== lastWH) { lastWH = k; resize(); } }).observe(stage);
}
resize(); refresh(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__crpi = {
  S, view, MECH, useFile,
  set(o) { const { on, ...rest } = o; Object.assign(S, rest); if (on) Object.assign(S.on, on); refresh(); draw(); },
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) view.hint(dt); draw(); }
};
