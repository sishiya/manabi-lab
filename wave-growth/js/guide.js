// 波が育つまで — 「つぎへ」の案内（1段 = 見るもの1つ・光る枠・図の下に1〜2行）
'use strict';
window.WGguide = (() => {
  const H = 3600;
  // t: 風が吹きはじめてからの時間（秒）、U: 風速（あれば記録を作りなおす）、hl: 光らせる所、cam: カメラ
  const STEPS = [
    { t: 0, U: 10, hl: '#stage', cam: { pitch: 0.14, dist: 30 },
      text: '風が吹く前の海は、鏡のように平ら。空がそのまま映っています。' },
    { t: 10 * 60, hl: '#nums', cam: { pitch: 0.5, dist: 8 },
      text: '風速 10 m/s の風が吹きはじめて10分。小さなさざ波が立ちます（波長 50 cm ほど）。' },
    { t: 3 * H, hl: '#nums', cam: { pitch: 0.14, dist: 30 },
      text: '3時間。風に押されつづけて、波は高く・長くなりました。' },
    { t: 12 * H, hl: '#graphBox',
      text: 'グラフの山が左（長い波）へ動いていきます。風は、自分より遅い波を押して育てます。' },
    { t: 34 * H, hl: '#nums', cam: { pitch: 0.1, dist: 60 },
      text: '30時間ほどで「発達しきった海」。いちばん多い波が風より速く走るようになり、もう育ちません。' },
    { t: null, hl: '#windBox',
      text: '風の強さを変えてみよう。ドラッグでカメラを回せます。時間のつまみで、いつにでも戻れます。' },
  ];
  let i = -1, hlEl = null;
  function show(k, api) {
    i = k; const s = STEPS[i];
    if (hlEl) hlEl.classList.remove('hl');
    hlEl = s.hl ? document.querySelector(s.hl) : null; if (hlEl) { hlEl.classList.add('hl');
      if (!hlEl.closest('#pin') && hlEl.scrollIntoView) hlEl.scrollIntoView({ behavior: 'smooth', block: 'end' }); }   // 下の列にあるときは見える所まで
    api.caption(s.text, `${i + 1} / ${STEPS.length}`);   // 先に（つまみを自分で動かした状態を終わらせる）
    if (s.U != null) api.resetWind(s.U);
    if (s.t != null) api.setTime(s.t);
    if (s.cam) api.camTo(s.cam);
  }
  function next(api) { show(i + 1 < STEPS.length ? i + 1 : 0, api); }
  function clear() { if (hlEl) hlEl.classList.remove('hl'); hlEl = null; }
  return { next, show, clear, get index() { return i; }, STEPS };
})();
