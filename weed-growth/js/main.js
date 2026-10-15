// 雑草がふえるまで — メインループ・道具の実行・デバッグ用の窓口
'use strict';
window.__wegrErr = window.__wegrErr || [];
window.addEventListener('error', e => window.__wegrErr.push(String(e.message)));

const LOOP = { acc: 0, last: performance.now(), slow: false };
function stepSize() { return UI.speed <= 1 ? 0.25 : UI.speed <= 7 ? 0.5 : 1; }
function advance(realDt) {
  if (!UI.playing || S.day >= MAX_DAYS) return;
  const h = stepSize(), t0 = performance.now();
  LOOP.acc += UI.speed * realDt;
  while (LOOP.acc >= h) {
    stepModel(h); LOOP.acc -= h;
    if (performance.now() - t0 > 24) { LOOP.acc = Math.min(LOOP.acc, h); LOOP.slow = true; break; }   // 重いときは、ゆっくりになる
  }
  if (S.day >= MAX_DAYS) { UI.playing = false; syncPlay(); }
}
function frame() {
  g.clearRect(0, 0, VIEW.w, VIEW.h);
  drawScene(); drawLabels();
}
function loop(now) {
  const dt = Math.max(0, Math.min(0.1, (now - LOOP.last) / 1000)); LOOP.last = now;
  try {
    advance(dt); viewTick(dt); fxTick(dt);
    frame(); updateReadout(); drawTimeline();
  } catch (e) { window.__wegrErr.push(String(e && e.stack || e)); }
  requestAnimationFrame(loop);
}

// 道具: タップした場所で
function onTap(px, py) {
  const w = toWorld(px, py);
  if (TOOL === 'look') return;
  const x0 = Math.max(0, w.x - TOOL_W / 2), x1 = Math.min(BED_W, w.x + TOOL_W / 2);
  if (TOOL === 'pull') { if (!pullAt(w.x, Math.max(0, w.y))) $('jumpMsg').textContent = ''; }
  if (TOOL === 'mow') mow(x0, x1, 0.05);
  if (TOOL === 'till') till(x0, x1, 0.15);
  if (TOOL === 'cover') { const on = !S.sheet[Math.max(0, Math.min(NX - 1, Math.floor(w.x / DXC)))]; cover(x0, x1, on); }
  computeLight(); updateReadout(true); UI.lastTl = 0;
}
let tipTimer = 0;
function onHover(px, py, touch) {
  HOVER = px < 0 ? null : { px, py };
  showTip(px, py, px < 0 ? null : describeAt(px, py));
  clearTimeout(tipTimer);
  if (touch) tipTimer = setTimeout(() => showTip(0, 0, null), 3500);
}

window.addEventListener('resize', () => { resizeView(); UI.lastTl = 0; });
restartSim('garden');
buildUI(); resizeView(); setupInput(onTap, onHover); syncPlay();
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__wegr = {
  S, H, VIEW, SP, counts, restart: restartSim, pullAt, mow, till, cover, jump, aimAt, resetView, describeAt, restoreSnap, snapIndexAt,
  run(days, h = 1) { const n = Math.round(days / h); for (let i = 0; i < n; i++) stepModel(h); frame(); updateReadout(true); drawTimeline(true); return counts(); },
  draw() { frame(); updateReadout(true); drawTimeline(true); },
  set(k, v) { if (k === 'speed') UI.speed = v; else if (k === 'play') { UI.playing = v; syncPlay(); } else S.opts[k] = v; },
  tool(t, w) { TOOL = t; if (w) TOOL_W = w; }, tap: onTap,
};
