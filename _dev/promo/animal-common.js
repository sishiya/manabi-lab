// いきものの感じる世界の台本（animal-senses.html・animal-senses-guide.html）で共通の部分
// 場面 SC = [{ a, b, animal, time, night, poi（見どころの名前）, split, set(S)（ほかの設定）, keys: [{ a, b, k: 'KeyW' }], turn: [{ a, b, yaw, pitch }], ev: [{ t, run(w) }] }]
//   場面の始めに生き物・時刻・場所を決め、1コマ（1/30秒）ずつ __as.frame で進める。時刻は場面の中の秒
'use strict';
const AS_CSS = (cw, ch) => `#gl{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important}`;
const asScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
let asCur = null, asLast = -1;

function asSize(w, cw, ch) {   // 描く大きさを決める（dpr 1.5 なので、画素は CSS の 1.5 倍）
  const st = w.document.createElement('style'); st.textContent = AS_CSS(cw, ch); w.document.head.append(st);
  w.resizeRender();   // ResizeObserver を待たずに、すぐ大きさを合わせる
}
function asPlace(w, s) {
  const A = w.__as, S = A.S, a = w.eval('ANIMALS')[s.animal];   // const で宣言されているので window からは見えない
  const p = s.poi ? a.pois.find(q => q.name === s.poi) : a.start;
  if (!p) throw new Error('見どころがない: ' + s.animal + ' ' + s.poi);
  S.pos.set(...p.pos); S.yaw = p.yaw; S.pitch = p.pitch; S.tween = null;
  if (s.dy) S.pos.y += s.dy;
}
function asStartScene(w, s) {
  const A = w.__as, S = A.S;
  S.keys.clear();
  Object.assign(S, { uvOnly: false, split: !!s.split, flicker: false, sound: false, night: s.night || 'lit' });
  if (s.set) s.set(S);
  A.setTime(s.time || 'day');
  A.setAnimal(s.animal, false);
  asPlace(w, s);
  if (s.t0 != null) S.t = s.t0;
  if (s.set) s.set(S);
  A.setTime(s.time || 'day');   // パネルを作り直す
}
function asApply(w, s, lt0, lt) {
  const S = w.__as.S;
  for (const e of s.ev || []) if (e.t > lt0 && e.t <= lt) e.run(w);
  for (const k of s.keys || []) { if (lt >= k.a && lt < k.b) S.keys.add(k.k); else S.keys.delete(k.k); }
  for (const r of s.turn || []) {
    if (lt < r.a || lt0 >= r.b) continue;
    const u = ease((lt - r.a) / (r.b - r.a)), u0 = ease((Math.max(lt0, r.a) - r.a) / (r.b - r.a));
    S.yaw += (r.yaw || 0) * (u - u0); S.pitch += (r.pitch || 0) * (u - u0);
  }
}
function asRender(w, SC, t) {
  const s = asScAt(SC, t), lt = t - s.a, A = w.__as, dt = 1 / FPS;
  if (s !== asCur || t < asLast || t - asLast > 0.5) {
    asStartScene(w, s);
    let u0 = -1e-6;
    for (let u = 0; u < lt - dt / 2; u += dt) { asApply(w, s, u0, u); u0 = u; A.frame(1, dt); }
    asApply(w, s, u0, lt);
    asCur = s;
  } else asApply(w, s, asLast - s.a, lt);
  A.frame(1, dt);
  asLast = t;
}
