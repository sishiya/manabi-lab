// ④ 積み重ね（スプライトスタッキング）の共通の部品
// スプライトスタッキング: 2D の輪切りを、下から順に少しずつ上へずらして重ねると、立体に見える描き方。
//   Stack.view … 向き（rot）と、見下ろす角度（tilt: 1＝真上、0.3＝ななめ）と、1枚あたりの高さ（lift, px）
//   Stack.at(v, x, y, z, s, cx, cy) … 世界の点 → 画面（x,y は輪切りの中、z は高さ）
//   Stack.slice(g, v, img, z, s, cx, cy, size) … 輪切りの絵（canvas）を高さ z に置く
//   Stack.drag(v) … 左右に引っぱると回る・上下で角度が変わる、を返す（pointer から呼ぶ）
'use strict';
const Stack = (() => {
  const view = (o = {}) => ({ rot: o.rot ?? 0.5, tilt: o.tilt ?? 0.45, auto: o.auto ?? 0.25, drag: null });
  function at(v, x, y, z, s, cx, cy) {
    const c = Math.cos(v.rot), sn = Math.sin(v.rot), xr = x * c - y * sn, yr = x * sn + y * c;
    return [cx + xr * s, cy + yr * s * v.tilt - z * s * Math.sqrt(1 - v.tilt * v.tilt)];
  }
  function slice(g, v, img, z, s, cx, cy, size, alpha = 1) {
    const [x, y] = at(v, 0, 0, z, s, cx, cy);
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.scale(1, v.tilt); g.rotate(v.rot);
    g.drawImage(img, -size * s / 2, -size * s / 2, size * s, size * s); g.restore();
  }
  function pointer(v, type, x, y) {
    if (type === 'down') { v.drag = [x, y]; v.auto = 0; return true; }
    if (type === 'drag' && v.drag) {
      v.rot += (x - v.drag[0]) * 0.01; v.tilt = Math.max(0.2, Math.min(1, v.tilt + (y - v.drag[1]) * 0.004)); v.drag = [x, y]; return true;
    }
    if (type === 'up') v.drag = null;
    return false;
  }
  function spin(v, dt) { v.rot += v.auto * dt; }
  return { view, at, slice, pointer, spin };
})();
