// 波が育つまで — 「つぎへ」の案内（1段 = 見るもの1つ・光る枠・図の下に1〜2行）
'use strict';
window.WGguide = (() => {
  const H = 3600;
  // t: 風が吹きはじめてからの時間（秒。0 の段は再生、ほかは止めて見る）、U: 風速、hl: 光らせる所、cam: カメラ、play: 再生する
  const STEPS = [
    { t: 0, U: 10, hl: '#stage', cam: { pitch: 0.12, dist: 16 },
      text: L('風が吹く前の海は、鏡のように平ら。空がそのまま映っています。いまから風速 10 m/s の風が吹きはじめます。', 'Before the wind, the sea is flat as a mirror and reflects the sky. Now a 10 m/s wind starts to blow.') },
    { t: 10 * 60, hl: '#nums', cam: { pitch: 0.5, dist: 8 },
      text: L('風速 10 m/s の風が吹きはじめて10分。小さなさざ波が立ちます（波長 50 cm ほど）。', '10 minutes after a 10 m/s wind starts. Small ripples appear (about 50 cm long).') },
    { t: 3 * H, hl: '#nums', cam: { pitch: 0.12, dist: 18 },
      text: L('3時間。風に押されつづけて、波は高く・長くなりました。', '3 hours. Pushed by the wind all this time, the waves have become taller and longer.') },
    { t: 12 * H, hl: '#graphBox',
      text: L('グラフの山が左（長い波）へ動いていきます。風は、自分より遅い波を押して育てます。', 'The hill in the graph moves left (toward longer waves). The wind pushes and grows waves that are slower than itself.') },
    { t: 34 * H, hl: '#nums', cam: { pitch: 0.1, dist: 40 },
      text: L('30時間ほどで「発達しきった海」。いちばん多い波が風より速く走るようになり、もう育ちません。', 'After about 30 hours the sea is “fully developed”. The most common waves now run faster than the wind and stop growing.') },
    { t: 12 * H, hl: '#stage', buoy: true, section: false, cam: { pitch: 0.25, dist: 14 },
      text: L('ブイを浮かべました（海をタップでも）。波は進むのに、ブイはその場で円をえがくだけ。黄色い線が通った跡。', 'A buoy is floating (you can tap the sea too). The waves travel on, but the buoy just moves in circles. The yellow line is its track.') },
    { t: 12 * H, hl: '#stage', section: true,
      text: L('ブイの真下を切ってみると、水の粒も円をえがいています。深くなるほど円は小さく、波長の半分の深さではほとんど動きません。', 'Cut the sea open under the buoy: the water also moves in circles. The circles shrink with depth; at half a wavelength down the water hardly moves.') },
    { t: null, hl: '#windBox', section: false, play: true,
      text: L('風の速さ・見かた（海面から・自由に動く）・空を変えてみよう。時間のつまみで、いつにでも戻れます。', 'Try changing the wind, the view (at the surface, free move) and the sky. The time slider takes you back to any moment.') },
  ];
  let i = -1, hlEl = null;
  function show(k, api) {
    i = k; const s = STEPS[i];
    if (hlEl) hlEl.classList.remove('hl');
    hlEl = s.hl ? document.querySelector(s.hl) : null; if (hlEl) { hlEl.classList.add('hl');
      if (!hlEl.closest('#pin') && hlEl.scrollIntoView) hlEl.scrollIntoView({ behavior: 'smooth', block: 'end' }); }   // 下の列にあるときは見える所まで
    api.view('orbit');   // どの見かたにいても、案内は上からの見かたで
    if (i === 0) api.storm(false);   // はじめの段は風の波だけ
    api.caption(s.text, `${i + 1} / ${STEPS.length}`, i === STEPS.length - 1);   // 先に（つまみを自分で動かした状態を終わらせる）
    if (s.U != null) api.resetWind(s.U);
    if (s.t != null) api.setTime(s.t);
    if (s.cam) api.camTo(s.cam);
    if (s.buoy) api.addBuoy();
    if (s.section != null) api.section(s.section);
    if (s.play) api.play();   // 最後の段は再生して、自分でさわってもらう
  }
  function next(api) { if (i === STEPS.length - 1) { clear(); i = -1; api.finish(); return; } show(i + 1, api); }   // 最後の段の次は「案内をおわる」（はじめの画面へ）
  function clear() { if (hlEl) hlEl.classList.remove('hl'); hlEl = null; }
  return { next, show, clear, get index() { return i; }, STEPS };
})();
