// ブラウン管のドット絵 — 仕切りとズーム・移動（マウス・指）
// 仕切りは取っ手（丸）だけで動かす。2本指でズーム、寄っているときの1本指・ドラッグは移動、ダブルタップ・ダブルクリックで全体へ。
'use strict';
(function () {
window.CRT_VIEW = function (stage, canvas, handle, onChange) {
  const V = { split: 0.5, z: 1, x: 0, y: 0, fitZ: 1, picW: 256, picH: 224 };
  const css = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });

  function fit() {
    const { w, h } = css();
    // 全体を見るときは、1ドットが画面のピクセルのちょうど整数倍になる大きさにする。
    // 半端な倍率だと走査線のすきまがモアレになりやすい（2倍以上で、15% より小さくならないときだけ）
    const dpr = canvas.width / Math.max(1, w), zd = Math.min(w / V.picW, h / V.picH) * 0.94 * dpr;
    V.fitZ = (zd >= 2 && Math.floor(zd) / zd > 0.85 ? Math.floor(zd) : zd) / dpr;   // 小さくなりすぎるときは半端のまま（1ピクセルに3点の平均でならす）
    V.z = V.fitZ;
    V.x = Math.round((w - V.picW * V.z) / 2 * dpr) / dpr; V.y = Math.round((h - V.picH * V.z) / 2 * dpr) / dpr;
    onChange();
  }
  function clamp() {
    const { w, h } = css();
    V.z = Math.max(V.fitZ, Math.min(V.fitZ * 60, V.z));
    const pw = V.picW * V.z, ph = V.picH * V.z;
    V.x = pw < w ? (w - pw) / 2 : Math.min(0, Math.max(w - pw, V.x));
    V.y = ph < h ? (h - ph) / 2 : Math.min(0, Math.max(h - ph, V.y));
  }
  function zoomAt(cx, cy, k) {
    const z0 = V.z; V.z *= k; clamp();
    const kk = V.z / z0; V.x = cx - (cx - V.x) * kk; V.y = cy - (cy - V.y) * kk;
    clamp(); onChange();
  }
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  // 仕切りの取っ手
  let dragSplit = null;
  handle.addEventListener('pointerdown', e => { dragSplit = e.pointerId; try { handle.setPointerCapture(e.pointerId); } catch (_) { /* すでに離れた指 */ } e.stopPropagation(); e.preventDefault(); stopHint(); });
  handle.addEventListener('pointermove', e => {
    if (dragSplit !== e.pointerId) return;
    V.split = Math.max(0, Math.min(1, local(e)[0] / css().w)); onChange();
  });
  const endSplit = e => { if (dragSplit === e.pointerId) dragSplit = null; };
  handle.addEventListener('pointerup', endSplit); handle.addEventListener('pointercancel', endSplit);
  handle.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (d) { V.split = Math.max(0, Math.min(1, V.split + d)); onChange(); e.preventDefault(); }
  });

  // 絵の上: 移動・ピンチ
  const pts = new Map(); let pinch = null, tap = null, lastTap = null;
  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* すでに離れた指 */ } pts.set(e.pointerId, local(e)); stopHint();
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: V.z };
    }
    if (pts.size === 1) tap = { t: performance.now(), x: e.clientX, y: e.clientY, multi: false };
    else if (tap) tap.multi = true;
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e), prev = pts.get(e.pointerId); pts.set(e.pointerId, p);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      zoomAt(cx, cy, (pinch.z * d / pinch.d) / V.z);
      V.x += (p[0] - prev[0]) / 2; V.y += (p[1] - prev[1]) / 2; clamp(); onChange();
    } else if (pts.size === 1) {
      V.x += p[0] - prev[0]; V.y += p[1] - prev[1]; clamp(); onChange();
    }
  });
  // ダブルタップ: 動かさずに短く2回たたいたときだけ（ピンチや移動のあとは数えない）
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (pts.size || !tap || e.pointerType === 'mouse') return;
    const now = performance.now(), still = !tap.multi && now - tap.t < 250 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10;
    if (still && lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { fit(); lastTap = null; }
    else lastTap = still ? { t: now, x: e.clientX, y: e.clientY } : null;
    tap = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('dblclick', fit);
  canvas.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  // はじめに仕切りを一度ゆらして、さわれることを知らせる（さわったら止める）
  let hintT = 0, hintOn = true;
  function stopHint() { if (hintOn) { hintOn = false; V.split = 0.5; onChange(); } }
  function hint(dt) {
    if (!hintOn) return false;
    hintT += dt;
    if (hintT > 2.4) { hintOn = false; V.split = 0.5; return true; }
    V.split = 0.5 + 0.12 * Math.sin(hintT / 2.4 * Math.PI * 2) * Math.sin(hintT / 2.4 * Math.PI);
    return true;
  }

  return {
    V, fit, clamp, hint, stopHint,
    // ＋−ボタンは、1ドットが整数ピクセルになる倍率へ（走査線がモアレにならない）
    zoomBy(k) {
      const { w, h } = css(), dpr = canvas.width / Math.max(1, w), zd = V.z * dpr;
      let nd = Math.round(zd * k);
      if (nd === Math.round(zd)) nd += k > 1 ? 1 : -1;
      zoomAt(w / 2, h / 2, Math.max(1, nd) / dpr / V.z);
      const vx = V.x * dpr, vy = V.y * dpr; V.x = Math.round(vx) / dpr; V.y = Math.round(vy) / dpr; onChange();
    },
    setPicture(w, h) { V.picW = w; V.picH = h; fit(); },
    // 寄るところ（絵の座標）と倍率（全体の何倍か）を決める
    focus(px, py, mult) { const { w, h } = css(); V.z = V.fitZ * mult; clamp(); V.x = w / 2 - px * V.z; V.y = h / 2 - py * V.z; clamp(); onChange(); }
  };
};
})();
