// 細菌にとりつくウイルスの台本（phage.html・phage-guide.html）で共通の部分
// 時間はアプリの u（0〜1、Story.events() の時刻）。KEYS = [[動画の秒, u]] の間はなめらかに動かす。同じ秒を2つ並べると、そこで u がとぶ（シークと同じ）
// カメラはアプリのおまかせカメラ（見どころが変わると寄る）。1コマずつ View.stepCam で進めるので、とびとびの時刻は 0 秒から進めなおす（描かずに）
// 見た目 LOOKS = [[動画の秒, 本物に近い true/false]]
'use strict';
function phSize(w, cw, ch) {
  const st = w.document.createElement('style');
  st.textContent = `#cv{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important;max-width:none!important;z-index:5}`;
  w.document.head.append(st);
  const P = w.__ph;
  P.View.setDprCap(2); P.View.resize();
}
function phUAt(KEYS, t) {
  let i = KEYS.findIndex(k => k[0] > t); if (i < 0) return KEYS[KEYS.length - 1][1]; if (i === 0) return KEYS[0][1];
  const [a, ua] = KEYS[i - 1], [b, ub] = KEYS[i];
  return lerp(ua, ub, clamp((t - a) / (b - a), 0, 1));
}
// とんだ直後の 1.5 秒は、シークバーを動かしたときと同じ速いカメラ（camK 4）
function phJumpAge(KEYS, t) { let age = 99; for (let i = 1; i < KEYS.length; i++) if (KEYS[i][0] === KEYS[i - 1][0] && KEYS[i][0] <= t) age = t - KEYS[i][0]; return age; }
let phLast = -1, phFix = 0;
function phStep(w, KEYS, t, dt) {
  const P = w.__ph, u = phUAt(KEYS, t), st = P.Story.at(u);
  P.UI.state.u = u;
  P.UI.update(st);
  if (phJumpAge(KEYS, t) < 1.5) P.View.camK = 4;
  P.View.stepCam(dt);
  return st;
}
function phRender(w, KEYS, LOOKS, t) {
  const P = w.__ph, dt = 1 / FPS;
  let real = false; for (const [a, r] of LOOKS || []) if (t >= a) real = r;
  if (P.View.real !== real) { P.View.real = real; w.document.querySelector('.viewWrap').classList.toggle('real', real); }
  let st;
  if (t < phLast || t - phLast > dt * 1.5) {
    // はじめから進めなおす（アプリの最初のカメラ: たくさんの細菌が見える大きさ）
    P.View.look(0, -2.2e8, 3.6e9, true);
    for (let s = 0; s < t - dt / 2; s += dt) phStep(w, KEYS, s, dt);
  }
  st = phStep(w, KEYS, t, dt);
  // ヘッドレスの録画では、canvas の変換が dpr 1 にもどって左上の 1/4 にしか描かれないことがあった（説明動画の1回目）。描く前に毎回そろえる
  const cv = w.document.getElementById('cv'), cg = cv.getContext('2d'), r = cv.getBoundingClientRect();
  if (cv.width !== Math.round(r.width * 2) || cg.getTransform().a !== 2) { phFix = (phFix || 0) + 1; P.View.resize(); }
  P.Scene.draw(st);
  P.View.drawLoupe(() => { P.Scene.draw(st); });
  phLast = t;
  return st;
}
// アプリの canvas を写す（「本物に近い」はアプリでは CSS の filter なので、ここで同じ filter をかける）
function phDraw(g, w, x, y, cw, ch) {
  g.fillStyle = '#05080f'; g.fillRect(0, 0, PW * RES, PH * RES);
  if (w.__ph.View.real) g.filter = 'grayscale(1) contrast(1.25) brightness(1.05)';
  g.drawImage(qs(w, '#cv'), x, y, cw, ch);
  g.filter = 'none';
}
// いまの見どころ（アプリの左下のカード）と、区間の名前・時刻（アプリの時間の札）
function phNow(w) {
  const d = w.document, c = d.getElementById('nowCard'), b = c.querySelector('b'), k = c.querySelector('.kind');
  return { title: b ? b.textContent : '', kind: k ? k.textContent : '', label: d.getElementById('tlabel').textContent };
}
// 細菌の中の数（アプリの右の欄）→ 行の文字
function phCounts(w) {
  return [...w.document.querySelectorAll('#counts dt')].map(dt => dt.textContent + '　' + dt.nextElementSibling.textContent);
}
