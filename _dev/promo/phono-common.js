// エジソンの蓄音機（phonograph）の台本の共通の部品（2026-11-03）
// アプリの図（#cv）だけを画面いっぱいにして開く。音と動きは、アプリと同じ物理（phonograph/js/physics.js・sources.js）を
// この台本のページで1回だけ計算して作る（phBuild）。同じ計算から、1コマごとの様子（筒の位置・針・振動板・溝）と、
// 録画の音（録音中は入れている歌、再生中は溝から計算した音、「元の歌」は入れた歌）を取る。BGM は入れない（音が主役）。
// アプリの描画ループと音（AudioWorklet）は使わない。様子をアプリの S に入れて __ph.draw() で1コマ描かせる。
'use strict';
const PH_INJECT = {
  dpr: 2, raf: true, top: true,
  pre: "window.__T = 0; performance.now = () => window.__T * 1000;"
    + "{ const st = document.createElement('style'); st.textContent = '#top,#tour,#controls,#graphs,.about,#hud,#zoom,#tip,#banner{display:none!important}#pin{position:fixed!important;inset:0!important;border:0!important}#cvwrap{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important}'; (document.head || document.documentElement).appendChild(st); }",
};
const phDraw = w => w.__D || (w.__D = w.eval('typeof Draw !== "undefined" ? Draw : null'));   // アプリの Draw は const なので window にない
const phReady = w => !!(w.__ph && w.UI && phDraw(w) && w.document.getElementById('cv').clientWidth > 100);
const rpmOm = r => r * 2 * Math.PI / 60;

// 時刻の表 SEG = [{ t, rec: true | play: true | up: true, motor: rpm | (u => rpm), tau, back: true, orig: [録音の何秒目から, 長さ] }]
//   rec: 新しい箔に録りはじめる（歌は頭から）、play: 針をおろしてなぞる、up: 針を上げる
//   motor: 筒を回す速さ（毎分の回転。関数なら、その行からの秒 u で決まる＝手で回す）、back: 針を上げてはじめまで逆に回す
//   orig: 蓄音機を通さずに、さっき入れた歌を鳴らす（アプリの「♪ 元の音」）
let PHS = null;   // 計算の結果 { frames, aud }
function phBuild(SEG, dur, opt = {}) {
  const fs = SR, P = window.PhonoPhys, ph = new P.Phono(fs), N = 128;
  let src = null, mode = 'up', rec = null, cur = null, origAt = -1, origEnd = 0, origFrom = 0;
  const nS = Math.ceil(dur * fs), aIn = new Float32Array(nS), aOut = new Float32Array(nS), aOrig = new Float32Array(nS), recBuf = new Float32Array(fs * 30);
  let recN = 0;
  const frames = [], pin = new Float32Array(N), pout = new Float32Array(N), win = new Float32Array(801);
  let segRef = null, ssI = 0, ssO = 0, nn = 0, si = 0;
  const sorted = SEG.slice().sort((a, b) => a.t - b.t);
  for (let i0 = 0; i0 < nS; i0 += N) {
    const t = i0 / fs;
    while (si < sorted.length && sorted[si].t <= t) {
      const e = sorted[si++]; cur = e;
      if (e.rec) { ph.resetFoil(); ph.rewind(); src = new PhonoSrc.Source(fs, opt.kind || 'mary'); recN = 0; mode = 'rec'; ph.setMode('rec'); }
      if (e.play) { mode = 'play'; ph.setMode('play'); }
      if (e.up || e.back) { mode = 'up'; ph.setMode('up'); }
      if (e.back) ph.setCrank(true, -rpmOm(e.backRpm || 300), 0.1);
      if (e.orig) { origFrom = Math.round(e.orig[0] * fs); origAt = i0; origEnd = i0 + Math.round(e.orig[1] * fs); }
      if (e.motor !== undefined && typeof e.motor !== 'function') ph.setCrank(true, rpmOm(e.motor), e.tau || 0.15);
    }
    if (cur && typeof cur.motor === 'function') ph.setCrank(true, rpmOm(cur.motor(t - cur.t)), cur.tau || 0.06);
    if (mode === 'rec') src.fill(pin, N, opt.dB || 105); else pin.fill(0);
    ph.process(pin, pout, N);
    for (let k = 0; k < N && i0 + k < nS; k++) {
      const i = i0 + k;
      if (mode === 'rec') { aIn[i] = pin[k]; if (recN < recBuf.length) recBuf[recN++] = pin[k]; }
      if (mode === 'play') aOut[i] = pout[k];
      if (origAt >= 0 && i >= origAt && i < origEnd) aOrig[i] = recBuf[origFrom + i - origAt] || 0;
      ssI += pin[k] * pin[k]; ssO += pout[k] * pout[k]; nn++;
    }
    // コマの境目で様子を残す
    const fNext = frames.length / FPS;
    if ((i0 + N) / fs >= fNext) {
      const rows = ph.updateSegs(); if (rows.length || !segRef) segRef = ph.seg.slice();
      const origOn = origAt >= 0 && i0 >= origAt && i0 < origEnd;
      frames.push({ x: ph.x, om: ph.om, z: ph.z0 + ph.wCenter(), z0: ph.z0, q: Array.from(ph.q), Fc: ph.Fc, contact: ph.contact, mode: ph.mode, atEnd: false,
        win: ph.window(400, new Float32Array(801)), half: 400, pIn: Math.sqrt(ssI / Math.max(1, nn)), pOut: Math.sqrt(ssO / Math.max(1, nn)), seg: segRef,
        src: mode === 'rec' || origOn ? (opt.kind || 'mary') : null, orig: origOn });
      ssI = ssO = nn = 0;
    }
  }
  // 音: 録音中の歌・元の歌と、溝から計算した音を、同じくらいの大きさにそろえて重ねる（アプリの「♪ 元の音」と同じ考え。全体の大きさは loudMix が -20 LUFS に）
  // 溝からの音は、ふつうの速さ（最初の再生の行。opt.ref で [秒, 秒] を指定できる）の大きさでそろえる（速く回した所は大きいまま＝物理のまま）
  const rmsOf = (a, i0 = 0, i1 = a.length) => { let s = 0, n = 0; for (let i = i0; i < i1; i++) { const v = a[i]; if (v !== 0) { s += v * v; n++; } } return n ? Math.sqrt(s / n) : 1; };
  const p0 = sorted.find(e => e.play), p1 = p0 && sorted.find(e => e.t > p0.t && (e.up || e.back || e.play)), ref = opt.ref || (p0 ? [p0.t + 0.3, p1 ? p1.t : dur] : [0, dur]);
  const gIn = 0.1 / rmsOf(aIn), gOut = 0.1 / rmsOf(aOut, Math.round(ref[0] * fs), Math.round(ref[1] * fs));
  const aud = new Float32Array(nS); for (let i = 0; i < nS; i++) aud[i] = (aIn[i] + aOrig[i]) * gIn + aOut[i] * gOut;
  // スピーカーの手前の音量の自動調整（アプリの worklet と同じ考え）: 速く回した所は物理では 10〜20 dB 大きくなる。全体の大きさをそろえると
  // ふつうの所が小さく聞こえなくなるので、ふつうの再生（実効値 0.1）の 2 倍（+6 dB）をこえる所だけ、すぐ下げて 0.3 秒でもどす
  let env = 0, gl = 1; const aE = 1 - Math.exp(-1 / (fs * 0.02)), rE = 1 - Math.exp(-1 / (fs * 0.3));
  for (let i = 0; i < nS; i++) { const v = aud[i] * aud[i]; env += (v - env) * (v > env ? aE : rE); const want = Math.min(1, 0.2 / Math.sqrt(env + 1e-12)); gl += (want - gl) * (want < gl ? 0.01 : 2e-5); aud[i] *= gl; }
  PHS = { frames, aud, dur };
  return PHS;
}
// music.extra: 計算した音を録画の音に入れる
const phExtra = async (ctx, out) => {
  const b = ctx.createBuffer(2, PHS.aud.length, SR); b.copyToChannel(PHS.aud, 0); b.copyToChannel(PHS.aud, 1);
  const s = ctx.createBufferSource(); s.buffer = b; s.connect(out); s.start(0);
};
const phFrame = t => PHS.frames[Math.max(0, Math.min(PHS.frames.length - 1, Math.round(t * FPS)))];
// 1コマ描く。zoom(t) はアプリの寄り（1〜1500）
function phRender(w, t, zoom, grab) {
  w.__T = t;
  const f = phFrame(t), S = w.__ph.S;
  Object.assign(S, f);
  const z = zoom ? zoom(t) : 1; w.UI.st.Z = w.UI.st.Zt = z; phDraw(w).grab = !!(grab && grab(t));
  w.__ph.draw();
}
// 図を置く: 画面いっぱいに切り取る（drawSrc と同じ）。PH_DY だけ上へずらす（縦長では下の字幕と機械が重ならないように）。あいた所は図の地の色
let PH_DY = 0;
function phDrawSource(g, w, OW, OH) {
  const cv = w.document.getElementById('cv'), k = Math.max(OW / cv.width, OH / cv.height), dw = cv.width * k, dh = cv.height * k;
  g.fillStyle = '#16140f'; g.fillRect(0, 0, OW, OH);
  g.drawImage(cv, (OW - dw) / 2, (OH - dh) / 2 - PH_DY * RES, dw, dh);
}
// アプリの図の座標（mm）→ 動画の座標（PW×PH）
function phToScreen(w, X, Y) {
  const cv = w.document.getElementById('cv'), d = cv.width / cv.clientWidth;
  const OW = PW * RES, OH = PH * RES, k = Math.max(OW / cv.width, OH / cv.height), ox = (OW - cv.width * k) / 2, oy = (OH - cv.height * k) / 2;
  return [(phDraw(w).sx(X) * d * k + ox) / RES, (phDraw(w).sy(Y) * d * k + oy) / RES - PH_DY];
}
// 手で回すところの矢印: 筒の上の点（軸から 0.75R、はじめの向き a0）が筒といっしょに動く道すじ。t0〜t1、step 秒ごと
function phHandKeys(w, t0, t1, zoom, a0 = 2.3, step = 0.1) {
  const keys = [], R = phDraw(w).R;
  for (let t = t0; t <= t1 + 1e-6; t += step) {
    phRender(w, t, zoom);
    const th = -phFrame(t).x * 1e3 / R + a0, [x, y] = phToScreen(w, 0.75 * R * Math.cos(th), 0.75 * R * Math.sin(th));
    keys.push({ t, x, y, drag: t < t1 - 1e-6 });
  }
  return keys;
}
// いまのようす（アプリの帯と同じ言葉）と回る速さの札。y は札の高さ
function phStatus(g, t, y, f = 1, left) {   // left: 左はしの x（省くと まんなか）
  const fr = phFrame(t);
  let txt = null, col = '#e8b860';
  if (fr.mode === 'rec') { txt = '● 録音中'; col = '#f08a6c'; }
  else if (fr.mode === 'play') { txt = '▶ 再生中（溝から計算した音）'; col = '#8fd0ff'; }
  else if (fr.orig) { txt = '♪ 元の歌（蓄音機を通さない音）'; col = '#e8b860'; }
  if (!txt || f <= 0) return;
  const rpm = Math.abs(fr.om) * 60 / (2 * Math.PI), sub = fr.orig ? '' : `毎分 ${rpm.toFixed(0)} 回転`;
  g.save(); g.globalAlpha = f; g.shadowBlur = 0;
  setFont(g, isVert() ? 40 : 32, true); const w1 = g.measureText(txt).width;
  setFont(g, isVert() ? 30 : 24, false); const w2 = sub ? g.measureText(sub).width + 30 : 0;
  const h = isVert() ? 66 : 54, wd = w1 + w2 + 44, x = left ?? (PW - wd) / 2;
  g.fillStyle = 'rgba(22,20,15,0.85)'; g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.roundRect(x, y - h / 2, wd, h, 12); g.fill(); g.stroke();
  g.textBaseline = 'middle'; g.textAlign = 'left';
  setFont(g, isVert() ? 40 : 32, true); g.fillStyle = col; g.fillText(txt, x + 22, y + 1);
  if (sub) { setFont(g, isVert() ? 30 : 24, false); g.fillStyle = '#e9e1cf'; g.fillText(sub, x + 22 + w1 + 30, y + 1); }
  g.restore();
}
