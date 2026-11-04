// うんちくショートの決まったルックと BGM（2026-11-04 ユーザーが選んだ: 筆のルック＋Sneaky Snitch の E）。
// 台本ページで trivia-kit.js・trivia-plate.js・trivia-looks.js のあとに読む。字と地形の読みこみがすむまで triviaStart は待つ（TK.ready）
// 曲は Git の外 out/bgm/kevin-sneaky-snitch.ogg（incompetech.com、CC BY 4.0。戻し方は _dev/RECOVERY.md）
'use strict';
TK.STYLE = { look: 'brush', bgm: 'out/bgm/kevin-sneaky-snitch.ogg', credit: 'BGM: "Sneaky Snitch" Kevin MacLeod (incompetech.com) CC BY 4.0', mix: { hi: 0.21, lo: 0.13, eq: 4 } };   // mix: 声のあいだ 10 dB 下・すきま 6 dB 下
TK.ready = (async () => {
  const L = LOOK = window.LOOK = TL.LOOKS[TK.STYLE.look];
  if (L.head) await new Promise(r => { const d = document.createElement('div'); d.innerHTML = L.head; const link = d.firstChild; link.onload = link.onerror = r; document.head.appendChild(link); });
  const buf = await fetch('../../tiny-earth/data/etopo1deg.bin').then(r => r.arrayBuffer());   // 地球の地形（LOOK.planet が使う）
  TL.ELEV = new Int16Array(buf);
  if (L.fonts) await Promise.all(L.fonts.map(f => document.fonts.load(f)));
  if (L.apply) L.apply();
  TK.BGM_FILE = TK.STYLE.bgm; TK.BGM_CREDIT = TK.STYLE.credit; TK.BGM_MIX = TK.STYLE.mix;
})();
