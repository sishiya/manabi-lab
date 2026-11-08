// 画面を離れたら止める（使う人の電池と発熱。RULES 9章。2026-11-08 ユーザー「ユーザの電池を無駄に消費するようなことはサケたい」）
// requestAnimationFrame はブラウザが止めてくれるが、マイク・カメラ・AudioContext・Worker・setInterval・fetch は止まらない
//   Power.on({ pause() {…}, resume() {…} }) … 離れたとき・もどったときに呼ぶ
//   Power.audio(ctx) … AudioContext を離れているあいだ止める（もどしたら、離れる前に動いていたものだけ再開）
//   Power.away … いま離れているか
// 読みこみ: <head> で <script src="../assets/power.js?v=1"></script>（defer にしない。アプリのスクリプトより先に）
window.Power = (() => {
  const list = [];
  let away = document.hidden;
  const set = h => { if (h === away) return; away = h; for (const f of list) try { (h ? f.pause : f.resume)?.(); } catch (e) { console.error(e); } };
  document.addEventListener('visibilitychange', () => set(document.hidden));
  addEventListener('pagehide', () => set(true)); // iPhone は閉じるときに visibilitychange が来ないことがある
  addEventListener('pageshow', () => set(document.hidden));
  const on = f => { list.push(f); if (away) f.pause?.(); };
  const audio = ctx => { let was = false; on({ pause() { was = ctx.state === 'running'; if (was) ctx.suspend(); }, resume() { if (was) ctx.resume(); } }); return ctx; };
  return { on, audio, get away() { return away; } };
})();
