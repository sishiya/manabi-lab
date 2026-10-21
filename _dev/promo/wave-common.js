// 波が育つまでの台本（wave-growth.html・wave-growth-guide.html）で共通の部分
// アプリは inject.raf で1コマずつ進める。時間 S.t・風・海の時計 S.simT・カメラはこちらで毎コマ決める（確かめ用のとびとびのコマでも同じ絵）
//   海（#cv）は出力と同じ大きさで描かせ、アプリの「重いと画素を下げる」は録画では使わない
'use strict';
const WG_H = 3600, WG_TMAX = 72 * WG_H;
const wgTime = frac => WG_TMAX * frac * frac;               // 時間のつまみ（平方根の目盛り）の位置 0〜1 → 秒（アプリと同じ）
const wgFrac = t => Math.sqrt(t / WG_TMAX);
const wgLogT = (t0, t1, k) => Math.exp(lerp(Math.log(t0), Math.log(t1), ease(k)));   // 時間をなめらかに（対数で）
let wgSunYaw = 0;
function wgSetup(w, OW, OH) {
  const d = w.document, st = d.createElement('style');
  st.textContent = '#stage{position:fixed!important;left:0;top:0;width:100vw!important;height:100vh!important;z-index:50}';
  d.head.appendChild(st);
  const cv = qs(w, '#cv');
  w.resize = () => { cv.width = OW; cv.height = OH; };
  w.resize();
  const L = w.eval('E.make(S.clock, S.cloud, obsLL().lat, obsLL().lon).L');   // 朝の太陽の向き（アプリと同じく、きょうの日付で）
  wgSunYaw = Math.atan2(L[2], L[0]);
  w.__wagr.S.play = false;
}
// 1コマ: o = { t: 風が吹きはじめてからの秒, U: 風速, sim: 海の時計, cam: { yaw, pitch, dist } or null, fov: 度 }
let wgKey = '';
function wgFrame(w, o) {
  const A = w.__wagr, S = A.S, cam = A.cam;
  S.play = false;
  const key = o.t.toFixed(1) + '/' + o.U;
  if (key !== wgKey) { S.t = o.t; S.sched = [{ t: 0, U: o.U }]; A.update(); wgKey = key; }
  w.eval('lastSea.at = -1e9; camAnim = null; slow = 0');
  if (o.cam) for (const k in o.cam) cam[k] = o.cam[k];
  if (o.fov) cam.fovY = o.fov * Math.PI / 180;
  S.simT = o.sim - 1 / FPS;
  appStep(w, 1);
}
// 海（と画面の文字の canvas、断面）を出力いっぱいに
function wgDraw(g, w, OW, OH, withOv = true) {
  g.fillStyle = '#000'; g.fillRect(0, 0, OW, OH);
  const cv = qs(w, '#cv'), ov = qs(w, '#ov'), sec = qs(w, '#sec');
  if (sec && !sec.hidden && sec.width) {   // 断面の図は、上の字幕にかからないよう少し小さく下へ（右下はライオン）
    const k = OW / PW; g.fillStyle = '#0b1622'; g.fillRect(0, 0, OW, OH);
    const dw = 1460 * k, dh = dw * sec.height / sec.width; g.drawImage(sec, 40 * k, OH - dh - 40 * k, dw, dh); return; }
  g.drawImage(cv, 0, 0, OW, OH);
  if (withOv && ov.width && ov.height) g.drawImage(ov, 0, 0, OW, OH);
}
const wgText = (w, sel) => ((qs(w, sel) || {}).textContent || '').trim();
// アプリの数字（画面の下の欄）
const wgNums = w => ({ H: wgText(w, '#nH'), T: wgText(w, '#nT'), L: wgText(w, '#nL'), C: wgText(w, '#nC'), S: wgText(w, '#nS'), time: wgText(w, '#tLabel'), wind: wgText(w, '#wLabel') });
// つまみの札（アプリのつまみと同じ言葉）。frac = つまみの位置 0〜1。knob(p, frac) でつまみの位置（矢印の行き先）
const wgKnob = (p, frac) => ({ x: p.x + 22 + (p.w - 44) * frac, y: p.y + 98 });
function wgSlider(g, p, label, frac, f) {
  if (f <= 0) return;
  g.shadowBlur = 0; g.globalAlpha = f;
  g.fillStyle = 'rgba(14,16,24,0.9)'; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(p.x, p.y, p.w, 140, 16); g.fill(); g.stroke();
  g.textBaseline = 'middle';
  setFont(g, 26, true); g.fillStyle = '#b9bfcc'; g.textAlign = 'left'; g.fillText(p.title, p.x + 22, p.y + 34);
  setFont(g, 32, true); g.fillStyle = '#fff'; g.textAlign = 'right'; g.fillText(label, p.x + p.w - 22, p.y + 34);
  const k = wgKnob(p, frac);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.roundRect(p.x + 22, k.y - 4, p.w - 44, 8, 4); g.fill();
  g.fillStyle = '#ffb35c'; g.beginPath(); g.roundRect(p.x + 22, k.y - 4, (p.w - 44) * frac, 8, 4); g.fill();
  g.beginPath(); g.arc(k.x, k.y, 16, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
}
// グラフ（どの長さの波が、どれだけあるか）: アプリの描き方（WGgraph.draw）で、録画用の canvas に描かせる
let wgGraphCv = null;
function wgGraph(w) {
  if (!wgGraphCv) { wgGraphCv = w.document.createElement('canvas'); wgGraphCv.style.cssText = 'position:fixed;left:0;top:0;width:580px;height:270px;z-index:-1'; w.document.body.appendChild(wgGraphCv); }
  const S = w.__wagr.S; w.WGgraph.draw(wgGraphCv, Object.assign({ U: S.sched[0].U }, S.st), S.sched, Math.min(S.t, WG_TMAX));
  return wgGraphCv;
}
