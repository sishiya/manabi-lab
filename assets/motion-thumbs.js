// 動くサムネイル（入口 index.html・保管庫 archive.html で共通）。
// カードの静止画 <img class="thumb" src=".../<id>.jpg"> と同じ場所の <id>.mp4（640×360・4秒・1本 50KB ほど。_dev/tools/make-motion-thumbs.ps1）を重ねて再生する。
// 通信を使いすぎないよう、読みこむのは動かすときだけ: PC はマウスを乗せたカード、スマホは画面のまんなかで止まった1枚だけ。
// データセーバー・遅い回線・「動きを減らす」の設定では何もしない（静止画のまま）。mp4 がないカードも静止画のまま
(() => {
  const c = navigator.connection;
  const off = (c && (c.saveData || /2g|3g/.test(c.effectiveType || ''))) || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HOVER = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let cur = null;
  const imgOf = pic => pic && pic.querySelector('img.thumb');
  function play(pic) {
    if (pic === cur) return;
    if (cur) { const v = cur.querySelector('video'); if (v) { v.pause(); v.classList.remove('on'); } }
    cur = pic;
    if (!pic) return;
    let v = pic.querySelector('video');
    if (!v) {
      const img = imgOf(pic);
      v = document.createElement('video');
      v.className = 'thumb motion'; v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('aria-hidden', 'true');
      v.addEventListener('playing', () => { if (cur && cur.contains(v)) v.classList.add('on'); });   // 絵が出てから重ねる（ちらつかない）
      v.src = img.getAttribute('src').replace(/\.jpg$/, '.mp4');
      img.after(v);   // 「新作」などの札より下に
    }
    v.play().catch(() => {});
  }
  // スマホ: 画面に全部入っているカードのうち、まんなかにいちばん近い1枚
  function pick() {
    if (off || HOVER) return;
    let best = null, bd = Infinity;
    document.querySelectorAll('.pic').forEach(p => {
      if (!imgOf(p)) return;
      const r = p.getBoundingClientRect();
      if (r.height === 0 || r.top < 0 || r.bottom > innerHeight) return;
      const d = Math.abs(r.top + r.height / 2 - innerHeight / 2);
      if (d < bd) { bd = d; best = p; }
    });
    play(best);
  }
  window.MotionThumbs = { pick };
  if (off) return;
  const style = document.createElement('style');
  style.textContent = '.thumb.motion{position:absolute;inset:0;height:100%;opacity:0;transition:opacity .3s;pointer-events:none}.thumb.motion.on{opacity:1}';
  document.head.append(style);
  if (HOVER) {
    document.addEventListener('mouseover', e => { const card = e.target.closest && e.target.closest('.card'); const p = card && card.querySelector('.pic'); play(imgOf(p) ? p : null); });
    document.documentElement.addEventListener('mouseleave', () => play(null));
  } else {
    let st = 0;
    addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(pick, 250); }, { passive: true });   // スクロールが止まってから
    setTimeout(pick, 1500);   // 開いてすぐは画面の読みこみを先に
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) play(null); else pick(); });
})();
