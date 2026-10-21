// 波が育つまで — カメラ（海の1点のまわりを回る。ドラッグで回す・ホイール／2本指で近づく）
'use strict';
window.WGcamera = (() => {
  function create(el) {
    const C = { yaw: 0.35, pitch: 0.12, dist: 16, target: [0, 0, 0], minY: 2, fovY: 52 * Math.PI / 180,
      DMIN: 3, DMAX: 900, PMIN: 0.02, PMAX: 1.45, free: false, eye: 3, dive: false };   // dive = 水の中（eye は負 = 水面より下）   // free = 前を見る（ミラーの惑星の 3D）。eye = 水面からの目の高さ
    const ptr = new Map(); let pinch0 = 0, moved = 0;
    // 近づく・遠ざかる（ホイールも 2 本指も同じ）: ふつう = 見る点からの距離、海面に浮かぶ = 目の高さ、水の中 = 深さ
    C.zoom = f => { if (C.dive) C.eye = -Math.min(60, Math.max(0.3, -C.eye * f)); else if (C.free) C.eye = Math.min(3000, Math.max(1.2, C.eye * f)); else C.dist = Math.min(C.DMAX, Math.max(C.DMIN, C.dist * f)); };
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => { ptr.set(e.pointerId, [e.clientX, e.clientY]); el.setPointerCapture(e.pointerId); moved = 0;
      if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    el.addEventListener('pointermove', e => {
      const p = ptr.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (ptr.size === 1) { C.yaw += dx * 0.005 * (C.free ? C.fovY : 1); C.pitch = Math.min(C.PMAX, Math.max(C.dive ? -1.5 : C.free ? -0.6 : C.PMIN, C.pitch + dy * 0.004 * (C.free ? C.fovY : 1))); }
      else if (ptr.size === 2 && pinch0 > 0) { const [a, b] = [...ptr.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        C.zoom(pinch0 / Math.max(d, 1)); pinch0 = Math.max(d, 1); }
    });
    const up = e => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); C.zoom(Math.exp(e.deltaY * 0.0013)); }, { passive: false });

    // 位置と向き。カメラは波の中に入らない（minY より下なら持ち上げ、海の1点を見続ける）
    C.basis = function () {
      const ch = Math.cos(C.pitch), fw = [Math.cos(C.yaw) * ch, -Math.sin(C.pitch), Math.sin(C.yaw) * ch];
      if (C.free) {   // 人のうしろ dist m・水面から eye m の高さで、まっすぐ前を見る
        const pos = [C.target[0] - Math.cos(C.yaw) * C.dist, Math.max(C.minY, C.target[1] + C.eye), C.target[2] - Math.sin(C.yaw) * C.dist];
        let cr = [-fw[2], 0, fw[0]]; const lr = Math.hypot(...cr); cr = cr.map(v => v / lr);
        const cu = [cr[1] * fw[2] - cr[2] * fw[1], cr[2] * fw[0] - cr[0] * fw[2], cr[0] * fw[1] - cr[1] * fw[0]];
        return { pos, cf: fw, cr, cu, fovY: C.fovY };
      }
      const pos = [C.target[0] - fw[0] * C.dist, C.target[1] - fw[1] * C.dist, C.target[2] - fw[2] * C.dist];
      if (pos[1] < C.minY) pos[1] = C.minY;
      let cf = [C.target[0] - pos[0], C.target[1] - pos[1], C.target[2] - pos[2]]; const l = Math.hypot(...cf); cf = cf.map(v => v / l);
      let cr = [cf[1] * 0 - cf[2] * 1, cf[2] * 0 - cf[0] * 0, cf[0] * 1 - cf[1] * 0]; const lr = Math.hypot(...cr); cr = cr.map(v => v / lr);
      const cu = [cr[1] * cf[2] - cr[2] * cf[1], cr[2] * cf[0] - cr[0] * cf[2], cr[0] * cf[1] - cr[1] * cf[0]];
      return { pos, cf, cr, cu, fovY: C.fovY };
    };
    C.wasDrag = () => moved > 6;
    return C;
  }
  return { create };
})();
