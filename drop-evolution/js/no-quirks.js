// あそびラボ（asobi-lab）の assets/no-quirks.js を写したもの（2026-11-02 まなびラボへ移したとき）。
// あそびラボの各ゲームで共通: no-quirks.css でおさえきれない くせ を、絵（canvas）の上でだけ止める（2026-10-25）。
// - iOS Safari の指2本の拡大（touch-action を見ないことがある）
// - 長押し・右クリックのメニュー（ゲームの右クリックの操作と重なる）
// - ダブルクリック・続けてのクリックで字がえらばれる（ゲームの画面はどこでも。入力欄は別）
(() => {
  const onCanvas = (e) => e.target instanceof Element && e.target.closest('canvas');
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => { if (onCanvas(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (onCanvas(e)) e.preventDefault(); });
  document.addEventListener('mousedown', (e) => { if (e.detail > 1 && !(e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]'))) e.preventDefault(); });
})();
