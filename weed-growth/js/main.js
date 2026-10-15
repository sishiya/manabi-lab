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
    advance(dt); viewTick(dt); fxTick(dt); pullFxTick(dt);
    frame(); updateReadout(); drawTimeline();
  } catch (e) { window.__wegrErr.push(String(e && e.stack || e)); }
  requestAnimationFrame(loop);
}

// 道具: 押した所から、ドラッグでなぞった所へ（1回のドラッグ = 1つのストローク）
let STROKE = null;
function paintStart(px, py) { STROKE = newStroke(TOOL); paintSeg(px, py, px, py); }
function paintSeg(ax, ay, bx, by) {
  if (!STROKE) return;
  const a = toWorld(ax, ay), b = toWorld(bx, by), hw = TOOL_W / 2;
  const x0 = Math.max(0, Math.min(a.x, b.x) - hw), x1 = Math.min(BED_W, Math.max(a.x, b.x) + hw);
  if (TOOL === 'pull') {   // 押した所はいちばん近い株。なぞると、通った線から 10px（1.2cm 以上）以内の株を次々に
    if (ax === bx && ay === by) { const w = toWorld(ax, ay); pullAt(w.x, Math.max(0, w.y), STROKE); }
    else {
      STROKE.tol = Math.max(0.012, 10 / VIEW.s);
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
      for (let i = 1; i <= n; i++) { const w = toWorld(ax + (bx - ax) * i / n, ay + (by - ay) * i / n); pullAt(w.x, Math.max(0, w.y), STROKE); }
    }
  }
  if (x1 < x0) return;
  if (TOOL === 'mow') mow(x0, x1, 0.05, STROKE);
  if (TOOL === 'till') till(x0, x1, 0.15, STROKE);
  if (TOOL === 'cover') cover(x0, x1, !S.sheet[clamp(Math.floor(a.x / DXC), 0, NX - 1)], STROKE);
  computeLight(); updateReadout(true);
}
function paintEnd() { endStroke(STROKE); STROKE = null; UI.lastTl = 0; updateReadout(true); }
let tipTimer = 0;
function onHover(px, py, touch) {
  HOVER = px < 0 ? null : { px, py };
  showTip(px, py, px < 0 ? null : describeAt(px, py));
  clearTimeout(tipTimer);
  if (touch) tipTimer = setTimeout(() => showTip(0, 0, null), 3500);
}

window.addEventListener('resize', () => { resizeView(); UI.lastTl = 0; });
restartSim('garden');
buildUI(); resizeView(); syncPlay();
setupInput({ tap: () => {}, hover: onHover, isPaint: () => TOOL !== 'look', paintStart, paint: paintSeg, paintEnd });
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__wegr = {
  S, H, VIEW, SP, counts, restart: restartSim, pullAt, mow, till, cover, jump, aimAt, resetView, describeAt, restoreSnap, snapIndexAt,
  run(days, h = 1) { const n = Math.round(days / h); for (let i = 0; i < n; i++) stepModel(h); frame(); updateReadout(true); drawTimeline(true); return counts(); },
  draw() { frame(); updateReadout(true); drawTimeline(true); },
  set(k, v) { if (k === 'speed') UI.speed = v; else if (k === 'play') { UI.playing = v; syncPlay(); } else S.opts[k] = v; },
  tool(t, w) { TOOL = t; if (w) TOOL_W = w; },
  stroke(pts) { paintStart(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) paintSeg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); paintEnd(); },   // 画面の px の点の列でドラッグをまねる
};
