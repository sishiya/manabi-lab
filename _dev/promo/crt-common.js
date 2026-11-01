// ブラウン管のドット絵（crt-pixels）の台本の共通の部品（2026-11-01）
// アプリの画面（#stage の WebGL2 の canvas）だけを画面いっぱいにして開き、場面の表 SC で 絵・つなぎ方・しくみ・画面の種類・寄り方・仕切りを決めて
// 1コマずつ描かせる（アプリの描画ループは止める。アプリは変わったときだけ描く作りなので、こちらで __crpi.simRun(0) を呼ぶ）。
// 仕切りの線・取っ手・「液晶／ブラウン管」の札はアプリでは DOM なので、こちらで描く（crDivider）
'use strict';
const CR_INJECT = {
  dpr: 2, raf: true,
  pre: "{ const st = document.createElement('style'); st.textContent = '#stage{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:50}#stage .tag,#divider,#hud,#zoom{display:none!important}'; (document.head || document.documentElement).appendChild(st); }",
};
const crReady = w => w.__crpi && w.__crpi.S && w.__crpi.S.current && w.document.getElementById('cv').width > 100;

// 場面の表 SC = [{ a, b, pic, link, screen, on, frame, inter, cam, split }]
//   pic: retro・falls・lion・patterns、link: rgb・svideo・composite・rf、screen: shadow・slot・grille
//   on: しくみの入り切り（書いたものだけ。ほかは入れる）、only: そのしくみだけ入れる（アプリの「だけ」）
//   cam: (u: 場面の中の秒) => { f: [絵の x, y], m: 全体の何倍か }（省くと全体）、split: (u) => 仕切りの位置 0〜1（省くと 0.5）
const CR_MECH = ['scan', 'signal', 'mask', 'gamma', 'bloom', 'curve'];
const crScene = (SC, t) => SC.find(s => t >= s.a && t < s.b) || SC[SC.length - 1];
let crKey = '';
function crState(sc) {
  const on = {};
  for (const k of CR_MECH) on[k] = sc.only ? k === sc.only : !(sc.on && sc.on[k] === false);
  return { pic: sc.pic || 'retro', link: sc.link || 'composite', screen: sc.screen || 'shadow', frame: sc.frame || 'avg', inter: sc.inter || 0, par: 'tv', on };
}
// ev: [[u, { link, only, screen, frame … }], …] 場面の中の u 秒から状態を変える（ボタンを押したところ）
const crAt = (sc, u) => Object.assign({}, sc, ...(sc.ev || []).filter(e => u >= e[0]).map(e => e[1]));
function crRender(w, SC, t) {
  const sc = crScene(SC, t), u = t - sc.a, A = w.__crpi, V = A.view.V;
  const st = crState(crAt(sc, u)), key = JSON.stringify(st);
  if (key !== crKey) { crKey = key; A.set(st); }
  const c = sc.cam ? sc.cam(u) : null;
  if (c && c.m > 1.0001) A.view.focus(c.f[0], c.f[1], c.m); else A.view.fit();
  V.split = sc.split ? sc.split(u) : 0.5;
  A.simRun(0);
}
// 寄り方の道具: 全体（m=1・まんなか）から f へ、時間 dur で寄る（倍率は対数で）。back で戻る
const CR_W = 256, CR_H = 224;
function camTo(f, m, dur, from = { f: [CR_W / 2, CR_H / 2], m: 1 }) {
  return u => { const k = ease(u / dur); return { f: [lerp(from.f[0], f[0], k), lerp(from.f[1], f[1], k)], m: Math.exp(lerp(Math.log(from.m), Math.log(m), k)) }; };
}
const camHold = (f, m) => () => ({ f, m });
// 仕切りの道具: a から b へ、t0 秒から dur 秒で動く
const splitMove = (a, b, t0, dur) => u => lerp(a, b, ease((u - t0) / dur));

// 仕切りの線・取っ手・札（アプリと同じ言葉）。labelY は札の高さ（説明動画は上の字幕の下、ショートは絵の上）
function crDivider(g, w, SC, t, labelY, f = 1) {
  const sc = crScene(SC, t), s = sc.split ? sc.split(t - sc.a) : 0.5, x = s * PW;
  g.save(); g.globalAlpha = f;
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, 0); g.lineTo(x, PH); g.stroke();
  // 取っ手（アプリの ◀▶ の丸）
  const hy = PH / 2;
  g.fillStyle = 'rgba(20,28,36,0.85)'; g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(x, hy, 26, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; setFont(g, 20, true); g.fillText('◀▶', x, hy + 1);
  // 札
  const tag = (txt, tx, align) => {
    setFont(g, isVert() ? 34 : 26, true);
    const tw = g.measureText(txt).width, pad = 14, h = isVert() ? 52 : 42, bx = align === 'right' ? tx - tw - pad * 2 : tx;
    g.fillStyle = 'rgba(10,16,22,0.72)'; g.beginPath(); g.roundRect(bx, labelY - h / 2, tw + pad * 2, h, 8); g.fill();
    g.fillStyle = '#e8f0f0'; g.textAlign = 'left'; g.fillText(txt, bx + pad, labelY + 1);
  };
  // 札が画面からはみ出す位置では出さない（縦長は札が長いので早めに）
  const lim = isVert() ? 0.4 : 0.22;
  if (s > lim) tag('液晶（ドットそのまま）', x - 16, 'right');
  if (s < 1 - lim * 0.5) tag('ブラウン管', x + 16, 'left');
  g.restore();
}
