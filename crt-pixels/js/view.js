// ブラウン管のドット絵 — 仕切りとズーム・移動（マウス・指）
// 仕切りは取っ手（丸）だけで動かす。2本指でズーム、寄っているときの1本指・ドラッグは移動、ダブルタップ・ダブルクリックで全体へ。
'use strict';
(function () {
window.CRT_VIEW = function (stage, canvas, handle, onChange) {
  const V = { split: 0.5, z: 1, x: 0, y: 0, fitZ: 1, picW: 256, picH: 224 };
  const css = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });

  function fit() {
    const { w, h } = css();
    V.fitZ = Math.min(w / V.picW, h / V.picH) * 0.94;
    V.z = V.fitZ; V.x = (w - V.picW * V.z) / 2; V.y = (h - V.picH * V.z) / 2;
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
  handle.addEventListener('pointerdown', e => { dragSplit = e.pointerId; handle.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault(); stopHint(); });
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
  const pts = new Map(); let pinch = null, lastTap = 0;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); stopHint();
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: V.z };
    }
    const now = performance.now();
    if (e.pointerType !== 'mouse' && pts.size === 1 && now - lastTap < 300) fit();
    lastTap = now;
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
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
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
    zoomBy(k) { const { w, h } = css(); zoomAt(w / 2, h / 2, k); },
    setPicture(w, h) { V.picW = w; V.picH = h; fit(); },
    // 寄るところ（絵の座標）と倍率（全体の何倍か）を決める
    focus(px, py, mult) { const { w, h } = css(); V.z = V.fitZ * mult; clamp(); V.x = w / 2 - px * V.z; V.y = h / 2 - py * V.z; clamp(); onChange(); }
  };
};
})();
