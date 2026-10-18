// レールガンのしくみ — メイン（ループ・カメラ・ズームとドラッグ・さわったときの説明・デバッグ用の窓口）
'use strict';
window.__raErr = [];
window.addEventListener('error', e => window.__raErr.push(String(e.message)));

(function () {
  const cv = document.getElementById('cv'), g = cv.getContext('2d');
  const tipEl = document.getElementById('tip'), stage = document.getElementById('stage');
  const S = SIM.S;
  const cam = { x: 3, s: 100, vy: 0.5, follow: false, off: 0 };
  let goal = null;        // つぎへで動かすカメラの行き先 { s, x | off, follow }
  const st = { phase: 0 };
  let W = 0, H = 0;

  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam.vy = W < 640 ? 0.3 : 0.36;
    if (UI.camMode) onCam(UI.camMode, true);
  }

  // カメラの3つの寄り方（意味のズーム）
  function camFor(mode) {
    const p = S.p, la = 2 * p.w;
    if (mode === 'all') { const s = Math.max(10, (W - 50) / (p.len + 1.6)); return { s, x: (W / 2 - 30) / s, follow: false }; }
    if (mode === 'arm') { const s = Math.max(W / 12, 34) / p.w; return { s, off: (W < 640 ? 0.25 : 0.12) * W / s, follow: true }; }
    const s = 300 / p.w; return { s, off: -la * 0.45, follow: true };   // micro: 電機子の中
  }
  function onCam(mode, now) {
    UI.camMode = mode;
    goal = camFor(mode);
    if (now) { Object.assign(cam, goal); if (goal.follow) cam.x = SIM.sample(S.t).x + goal.off; goal = null; }
  }

  function sLimits() { return [camFor('all').s * 0.6, 600 / S.p.w]; }
  function zoomAt(f, px) {
    const [a, b] = sLimits(), o = SIM.sample(S.t);
    const s2 = Math.max(a, Math.min(b, cam.s * f));
    const wx = cam.x + (px - W / 2) / cam.s;                 // 指の下の点をそのままに
    cam.x = wx - (px - W / 2) / s2; cam.s = s2;
    const l1 = DRAW.lv(cam.s * S.p.w).l1;
    cam.follow = l1 > 0.5; cam.off = cam.x - o.x;
    goal = null; UI.camMode = null; UI.free();
  }

  // 入力: ホイール・ピンチ・ドラッグ・さわって説明
  const pts = new Map(); let pinch = 0, moved = 0, downAt = null;
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left); }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; downAt = [e.clientX, e.clientY];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect();
    if (!pts.has(e.pointerId)) { showTip(e.clientX - r.left, e.clientY - r.top, false); return; }
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0) zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left);
      pinch = d; moved = 99; return;
    }
    const dx = e.clientX - prev[0];
    moved += Math.abs(dx) + Math.abs(e.clientY - prev[1]);
    if (moved > 6 && S.phase !== 'live') { cam.x -= dx / cam.s; cam.off -= dx / cam.s; goal = null; UI.camMode = null; tipEl.hidden = true; UI.free(); }
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = 0;
    if (moved <= 6 && downAt) { const r = cv.getBoundingClientRect(); tapAt(e.clientX - r.left, e.clientY - r.top); }
    downAt = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!tipHold) tipEl.hidden = true; });
  document.getElementById('zoom').addEventListener('click', e => {
    const z = e.target.dataset && e.target.dataset.z; if (!z) return;
    const o = SIM.sample(S.t), ax = W / 2 + (o.x - cam.x) * cam.s;
    zoomAt(z === 'in' ? 1.8 : 1 / 1.8, Math.max(0, Math.min(W, ax)));
  });

  // タップ: 箱なら放電、止め板の所なら置く／外す、ほかは説明（撃っているあいだは説明を出さない）
  function tapAt(x, y) {
    const k = DRAW.hitTest(x, y);
    if (k && k.startsWith('box')) { if (SIM.tap(+k.slice(3))) { tipEl.hidden = true; UI.onTap(); } return; }
    if (k === 'stop') { UI.toggleHold(); return; }
    if (S.phase !== 'live') showTip(x, y, true);
  }

  let tipHold = 0;
  function showTip(x, y, hold) {
    const k = DRAW.hitTest(x, y), txt = k ? UI.tip(k) : '';
    if (!txt) { if (!tipHold) tipEl.hidden = true; return; }
    tipEl.textContent = txt; tipEl.hidden = false;
    const tw = Math.min(290, W - 20);
    tipEl.style.left = Math.max(10, Math.min(W - tw - 10, x + 12)) + 'px';
    tipEl.style.top = Math.max(10, Math.min(H - tipEl.offsetHeight - 10, y + 14)) + 'px';
    if (hold) { tipHold = 1; clearTimeout(showTip.tm); showTip.tm = setTimeout(() => { tipHold = 0; tipEl.hidden = true; }, 4000); }
  }

  function step(dtWall) {
    if (!S.paused) {
      if (S.phase === 'live') SIM.advance(dtWall * S.speed * (SIM.fast() ? 20 : 1));
      else if (S.phase === 'after') SIM.advance(dtWall * S.speed);
      else if (S.replay) { S.t += dtWall * S.speed; if (S.t >= S.tEnd) { S.t = S.tEnd; S.replay = false; } }
    }
    const o = SIM.sample(S.t);
    st.phase += dtWall * (20 + 140 * Math.min(1.3, o.I / SIM.base().limit));
    if (goal) {
      const k = 1 - Math.exp(-dtWall * 5);
      cam.s *= Math.pow(goal.s / cam.s, k);
      cam.follow = goal.follow;
      const tx = goal.follow ? o.x + goal.off : goal.x;
      cam.x += (tx - cam.x) * k;
      if (goal.follow) cam.off = cam.x - o.x;
      if (Math.abs(Math.log(goal.s / cam.s)) < 0.002 && Math.abs(tx - cam.x) * cam.s < 0.5) { cam.s = goal.s; cam.x = tx; goal = null; }
    } else if (cam.follow) cam.x = o.x + cam.off;
    return o;
  }

  function draw(o) {
    st.inset = UI.inset; st.show = UI.show; st.focus = UI.focus; DRAW.scene(g, W, H, cam, o, st);
    if (UI.inset) { const sz = Math.min(200, W * 0.42); DRAW.inset(g, W - sz - 10, 56, sz, o); }
    if (UI.moreOpen()) GRAPH.draw(document.getElementById('graph'), S.t);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // 最初のコマは now が last より前のことがある
    const o = step(dt);
    UI.refresh();
    draw(o);
    requestAnimationFrame(loop);
  }

  UI.onCam = mode => onCam(mode, false);
  SIM.reset();
  window.addEventListener('resize', resize);
  resize();
  UI.build();
  onCam(UI.camMode || 'all', true);
  requestAnimationFrame(loop);

  // デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
  window.__ra = {
    S, cam, SIM, PHYS, PRESETS, onCam,
    simRun(sec, dt = 1 / 60) { let o; for (let t = 0; t < sec; t += dt) o = step(dt); UI.refresh(); draw(o || SIM.sample(S.t)); },
    at(tms) { S.replay = false; S.t = tms / 1e3; UI.refresh(); draw(step(0)); },
    tap: k => { SIM.tap(k); UI.onTap(); }, tapAt,
  };
})();
