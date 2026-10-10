// 空気の流れの見える部屋の台本（air-flow.html・air-flow-guide.html）で共通の部分
// 場面 SC = [{ a, b, scene（アプリの場面の key）, speed（1秒あたりのシミュレーションの秒。省くと場面の設定のまま）, pre（先に進める秒）, ev: [{ t, run(w) }] }]
'use strict';
const afScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
let afCur = null, afLast = -1;
function afSize(w, cw, ch) {
  const st = w.document.createElement('style');
  st.textContent = `#frame{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important}`;
  w.document.head.append(st); w.fit();
}
function afStart(w, s) {
  w.loadScene(s.scene);
  w.__af.S.mode = s.mode || 'age';   // 煙を出すと表示が「煙」に変わったままになるので、場面ごとに戻す
  if (s.speed) w.__af.S.speed = s.speed;
  if (s.pre) w.__af.advance(s.pre);
}
function afStep(w, dt) {
  const S = w.__af.S;
  w.step(dt * S.speed); w.moveParticles(dt * S.pSpeed);
}
function afRender(w, SC, t) {
  const s = afScAt(SC, t), lt = t - s.a, dt = 1 / FPS;
  if (s !== afCur || t < afLast || t - afLast > 0.5) {
    afStart(w, s);
    let u0 = -1e-6;
    for (let u = 0; u < lt - dt / 2; u += dt) { for (const e of s.ev || []) if (e.t > u0 && e.t <= u) e.run(w); u0 = u; afStep(w, dt); }
    for (const e of s.ev || []) if (e.t > u0 && e.t <= lt) e.run(w);
    afCur = s;
  } else for (const e of s.ev || []) if (e.t > afLast - s.a && e.t <= lt) e.run(w);
  afStep(w, dt);
  w.updateReadout();
  w.drawFrame(t * 1000, dt);
  afLast = t;
}
function afWind(w, deg, ms) { w.__af.S.wind = [deg, ms]; w.netChanged(); }
const afText = (w, sel) => ((w.document.querySelector(sel) || {}).textContent || '').trim();
