// 変化球のしくみ（pitch-physics）の台本の共通の部品
// アプリの 3D の図（#views）だけを画面いっぱいにして開き、場面の表 SC で「案内の段・球種・カメラ・時刻」を決めて1コマずつ描かせる。
// 右の欄（断面の図・ボールの拡大・数字）と時間割の帯は、画面の外に同じ大きさで置いたまま描かせて、drawInset で重ねる。
// 3D の名札（.mk）は HTML なので canvas に写らない。位置と文字をアプリから読んで、こちらで描く（ppLabels）
'use strict';
const PP_CSS = '#top,#tour,#dock,#controls,#about,#tip{display:none!important}'
  + '#stage{display:block!important;padding:0!important}'
  + '#views{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;min-height:0!important;border-radius:0!important;margin:0!important;z-index:50}'
  + '#gl{border-radius:0!important}'
  + '#aside{position:fixed!important;left:-4000px!important;top:0!important;width:420px!important;max-height:none!important;overflow:visible!important;display:flex!important;flex-direction:column}'
  + '#stripBox{position:fixed!important;left:-4000px!important;top:1200px!important;width:1100px!important;display:block!important}'
  + '#vtabs,#cams,#legendBtn,#legend,#refToggle,#hint3d,#windBadge{display:none!important}'
  + '.mk{visibility:hidden!important}';
const PP_INJECT = { dpr: 2, raf: true, top: true, pre: "{ const st = document.createElement('style'); st.textContent = '" + PP_CSS + "'; document.head.appendChild(st); }" };
const ppReady = w => !!(w.__piph && w.__piph.V3 && w.__piph.V3.ok && w.__piph.S.res);
const ppEval = (w, s) => w.eval(s);

// 場面の表 SC = [{ a, b, tour, go(w, P), cam, speed, delay, hold, time(u, T), ev: [{ t, run(w, P) }], orbit(u) }]
//   tour: 案内の段（0 から）。go: そのあとに状態を変える。cam: カメラ（アプリの CAMS の名前）
//   時刻: 既定は「delay 秒待って speed 倍で投げ、終わったら hold 秒止めて、また投げる」のくり返し。time(u, T) で決めることもできる（u は場面の中の秒、T は時間のつまみの終わり）
//   orbit(u): カメラの向きを { yaw, pitch, dist } で動かす（ドラッグで回すのと同じ。なめらかに）
let ppCur = null, ppT = -1;
const ppScene = (SC, t) => SC.find(s => t >= s.a && t < s.b) || SC[SC.length - 1];
function ppLoop(u, T, speed, hold) {
  const run = T / speed, per = run + hold;
  if (u < 0) return 0;
  const k = u % per;
  return Math.min(T, k * speed);
}
function ppRender(w, SC, t) {
  const sc = ppScene(SC, t), P = w.__piph;
  if (ppCur !== sc || t < ppT) {   // 場面が変わった（とびとびのコマで前へ戻ったときも作りなおす）
    ppCur = sc;
    if (sc.tour != null) P.tour(sc.tour);
    if (sc.go) sc.go(w, P);
    if (sc.cam) P.cam(sc.cam);
    if (sc.ev) runEvents(w, sc.ev.map(e => ({ t: sc.a + e.t, run: ww => e.run(ww, P) })), -1, t);
  } else if (sc.ev) runEvents(w, sc.ev.map(e => ({ t: sc.a + e.t, run: ww => e.run(ww, P) })), ppT, t);
  ppT = t;
  if (sc.per) sc.per(t - sc.a, w, P);   // 場面の中で毎コマ変えるもの（回転の向きなど）
  const T = ppEval(w, 'tEnd()'), u = t - sc.a;
  P.S.playing = false;
  P.S.t = sc.time ? sc.time(u, T) : ppLoop(u - (sc.delay != null ? sc.delay : 0.6), T, sc.speed || 0.2, sc.hold != null ? sc.hold : 1.4);
  if (sc.orbit) { const o = sc.orbit(u), V3 = P.V3; Object.assign(V3.orbit, o); Object.assign(V3.goal, o); }
  w.document.getElementById('time').value = P.S.t;
  ppEval(w, 'updateNums(); updateGuides3d();');   // 名札とガイドの位置は、カメラと時刻が決まってから
  appStep(w, 1);
}
// 3D の名札（.mk）をこちらで描く（アプリと同じ位置・同じ文字。うすい暗色の丸い札）
function ppLabels(g, w, f = 1) {
  if (f <= 0 || (ppCur && ppCur.labels === false)) return;
  for (const id of ['mkPlain', 'mkReal']) {
    const e = w.document.getElementById(id);
    if (!e || e.hidden || !e.textContent) continue;
    const r = e.getBoundingClientRect(), faint = e.classList.contains('faint');
    const s = e.textContent, size = PW < PH ? 30 : 24;
    setFont(g, size, true);
    const tw = g.measureText(s).width, pad = 14, h = size + 16;
    let x = r.left, y = r.top + r.height / 2 - h / 2;
    x = Math.max(12, Math.min(PW - tw - pad * 2 - 12, x));
    g.save(); g.shadowBlur = 0; g.globalAlpha = f * (faint ? 0.75 : 1);
    g.fillStyle = 'rgba(8,14,12,.62)'; g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(x, y, tw + pad * 2, h, h / 2); g.fill(); g.stroke();
    g.fillStyle = id === 'mkReal' ? '#ffd166' : '#f2f5f7'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(s, x + pad, y + h / 2 + 1);
    g.restore();
  }
}
// 右の欄の数字の表から1行読む（例: ppNum(w, '変化量（50 ft から）')）
function ppNum(w, label) {
  for (const tr of w.document.querySelectorAll('#nums tr')) { const th = tr.querySelector('th'), td = tr.querySelector('td'); if (th && td && th.textContent.trim() === label) return td.textContent.trim(); }
  return '';
}
// アプリの計算で数を出す（字幕の数はアプリで計算してから入れる）
function ppFacts(w) {
  const P = w.__piph, F = {};
  P.tour(3); const r = P.S.res;
  F.ffT = r.tPlate;
  F.ffUp = Math.round((r.pPlate[2] - ppEval(w, 'S.ghostPlain ? S.ghostPlain.pPlate[2] : NaN')) * 100);
  P.tour(9); const xs = P.S.many.map(q => q.pPlate[0]), zs = P.S.many.map(q => q.pPlate[2]);
  F.knX = Math.round((Math.max(...xs) - Math.min(...xs)) * 100); F.knZ = Math.round((Math.max(...zs) - Math.min(...zs)) * 100);
  P.tour(16); const I = ppEval(w, 'batterInfo()');
  F.tDecide = I.tDecide; F.sepBalls = I.sepD / I.ballD; F.sepT = Math.round(I.sepT * 100); F.pct = Math.round(I.devD / I.devT * 100);
  P.tour(15); const I2 = ppEval(w, 'batterInfo()'); F.devD = Math.round(I2.devD * 100); F.devT = Math.round(I2.devT * 100); F.pctFF = Math.round(I2.devD / I2.devT * 100); F.tDecideFF = I2.tDecide;
  const mvLen = () => Math.round(Math.hypot(P.S.mv.dx, P.S.mv.dz) * 100);
  P.tour(3); F.ffRel = Math.round(P.S.mv.dz * 100);
  P.tour(6); F.sl0 = mvLen(); P.set({ eff: 1 }); F.sl1 = mvLen();
  P.tour(12); F.altRel = Math.round(P.S.mv.dz * 100); F.altPct = Math.round(P.S.res.st.rho / ppEval(w, 'STD_ENV.rho') * 100);
  P.tour(13); F.headRel = Math.round(P.S.mv.dz * 100);
  P.tour(0);
  return F;
}
// 小さな札（いまのカメラ・球種などを左上に）
function ppTag(g, s, x, y, f, size) {
  if (f <= 0) return;
  size = size || (PW < PH ? 34 : 28);
  setFont(g, size, true);
  const tw = g.measureText(s).width, pad = 18, h = size + 20;
  g.save(); g.shadowBlur = 0; g.globalAlpha = f;
  g.fillStyle = 'rgba(8,14,12,.6)'; g.beginPath(); g.roundRect(x, y, tw + pad * 2, h, h / 2); g.fill();
  g.fillStyle = '#ffd166'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(s, x + pad, y + h / 2 + 1);
  g.restore();
}
