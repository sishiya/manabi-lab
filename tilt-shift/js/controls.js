// ジオラマに見えるわけ — 絵をさわってカメラを動かす
//  1本指・左ドラッグ: 回す（横＝向き、たて＝見下ろす角度）／ホイール・2本指でつまむ: 寄る・離れる
//  2本指で動かす・右ドラッグ・Shift＋ドラッグ: 見る場所をずらす
'use strict';
const Controls = (() => {
  function init(el, S, lim, onMove) {
    const pts = new Map(); let last = null, mode = 0;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function pan(dx, dy) {   // 画面の動きを地面の動きに（近さに比例）
      const L = lim(), k = S.dist * 0.0016, yr = S.yaw * Math.PI / 180;
      const fx = -Math.sin(yr), fz = -Math.cos(yr), rx = Math.cos(yr), rz = -Math.sin(yr);
      const sp = 1 / Math.max(0.35, Math.sin(S.pitch * Math.PI / 180));
      S.tx -= (rx * dx - fx * dy * sp) * k; S.tz -= (rz * dx - fz * dy * sp) * k;
      const r = Math.hypot(S.tx - L.x, S.tz - L.z); if (r > L.range) { S.tx = L.x + (S.tx - L.x) * L.range / r; S.tz = L.z + (S.tz - L.z) * L.range / r; }
    }
    function zoom(f) { const L = lim(); S.dist = clamp(S.dist * f, L.min, L.max); }
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      mode = pts.size >= 2 ? 2 : (e.button === 2 || e.shiftKey) ? 1 : 0; last = null;
    });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const P = [...pts.values()];
      if (mode === 2 && P.length >= 2) {
        const cx = (P[0][0] + P[1][0]) / 2, cy = (P[0][1] + P[1][1]) / 2, d = Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1]);
        if (last) { zoom(last.d / Math.max(10, d)); pan(cx - last.x, cy - last.y); onMove(); }
        last = { x: cx, y: cy, d }; return;
      }
      const [x, y] = P[0];
      if (last) {
        const dx = x - last.x, dy = y - last.y;
        if (mode === 1) pan(dx, dy);
        else { S.yaw = ((S.yaw - dx * 0.3) % 360 + 540) % 360 - 180; S.pitch = clamp(S.pitch + dy * 0.2, 4, 85); }
        onMove();
      }
      last = { x, y };
    });
    const up = e => { pts.delete(e.pointerId); last = null; if (pts.size < 2 && mode === 2) mode = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); onMove(); }, { passive: false });
  }
  return { init };
})();
