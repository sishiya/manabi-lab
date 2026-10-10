// カビが育つまでの台本（mold-growth.html・mold-growth-guide.html）で共通の部分
// 場面 SC = [{ a, b, pre（先に進める時間）, speed（1秒あたりの時間）, habits, set(w), ev: [{ t, run(w) }], brush: [{ a, b, tool, from: [x, y], to: [x, y] }]（mm） }]
// 箱庭は乱数を固定しているので、同じ習慣なら毎回同じ育ち方になる
'use strict';
const mkScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
let mkCur = null, mkLast = -1;
const MK_HABITS = { season: 'rainy', fan: 'none', after: 'none', clean: 'none' };
function mkSize(w, cw, ch) {
  const st = w.document.createElement('style');
  st.textContent = `#world{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important;max-width:none!important}`;
  w.document.head.append(st);
}
function mkStart(w, s) {
  const M = w.__mk;
  if (M.UI.page !== (s.page || 'sim')) M.showPage(s.page || 'sim');
  Object.assign(M.W.habits, MK_HABITS, s.habits || {});
  M.UI.rec = null; M.UI.records.length = 0;
  w.restart();
  Object.assign(M.VIEW, { hidden: false, moist: false, zoom: 1, cx: 50, cy: 30 });
  M.UI.tool = 'hand'; M.UI.down = false;
  if (s.pre) M.run(s.pre);
  Object.assign(M.UI, { playing: true, speed: s.speed || 24, acc: 0 });
  if (s.set) s.set(w);
}
// 指でなぞる道具: 時刻 lt に、from → to の間のその場所で道具を使う
function mkBrush(w, s, lt, dt) {
  const M = w.__mk;
  for (const b of s.brush || []) {
    if (lt < b.a || lt > b.b) continue;
    const k = (lt - b.a) / (b.b - b.a);
    M.UI.tool = b.tool;
    w.applyAt({ x: lerp(b.from[0], b.to[0], k), y: lerp(b.from[1], b.to[1], k) }, dt * 2, true);
  }
}
function mkRender(w, SC, t) {
  const s = mkScAt(SC, t), lt = t - s.a, dt = 1 / FPS, M = w.__mk;
  if (s !== mkCur || t < mkLast || t - mkLast > 0.5) {
    mkStart(w, s);
    let u0 = -1e-6;
    for (let u = 0; u < lt - dt / 2; u += dt) { for (const e of s.ev || []) if (e.t > u0 && e.t <= u) e.run(w); u0 = u; mkBrush(w, s, u, dt); w.tick(dt, u * 1000); }
    for (const e of s.ev || []) if (e.t > u0 && e.t <= lt) e.run(w);
    mkCur = s;
  } else for (const e of s.ev || []) if (e.t > mkLast - s.a && e.t <= lt) e.run(w);
  mkBrush(w, s, lt, dt);
  w.tick(dt, t * 1000);
  mkLast = t;
}
// 箱庭の中の点（mm）→ アプリの画面の点（拡大の中心に使う）
function mkZoomTo(w, xm, ym, f) {
  const V = w.__mk.VIEW, b = V.box; if (!b) return;
  w.zoomAt(b.x + xm * b.k, b.y + ym * b.k, f); w.syncZoom && w.syncZoom();
}
const mkText = (w, sel) => ((w.document.querySelector(sel) || {}).textContent || '').trim();
// ためした記録の表 → 行の文字
function mkRecords(w) {
  return [...w.document.querySelectorAll('#records tr')].slice(1).map(tr => [...tr.children].map(td => td.textContent.trim()).join('　'));
}
