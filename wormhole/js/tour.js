// 「▶ 通りぬける」の進み方。速さ・カメラの向き・字幕は、どれも位置 ℓ だけで決まる（途中で止めても、途中から再生しても同じ道）
'use strict';
const TOUR_RC = 7.4;     // のどの中心からの距離 r がここまで来たら終わる（太陽が惑星のふちから出きる所。形によらず同じ場所）
let TOUR_END = 6.25;     // 出口からここまで進んで終わる（ρ）。形ごとに setTourEnd で決める
function setTourEnd(shape) {
  let lo = 0, hi = 40;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (radius(shape, shape.a + m) < TOUR_RC) lo = m; else hi = m; }
  TOUR_END = lo;
}

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 進む速さ（ρ/秒）。口の前でゆっくり、トンネルの中で速く
function tourSpeed(l, a) {
  const d = Math.abs(l) - a;
  if (d > 0 && l > 0) return 0.24 + 1.4 * smoothstep(0, 3.5, d) * (1 - smoothstep(3.5, TOUR_END, d));   // 出たあとは前へ進みつづけ、最後はゆるめて止まる
  if (d > 0) return 0.24 + 1.4 * smoothstep(0, 5, d);
  return 0.24 + 1.9 * Math.sin(Math.PI * (l + a) / (2 * a));
}

// カメラの向き（yaw: 横、pitch: 上下、roll: 傾き。ラジアン）と視野の倍率
function tourCam(l, a) {
  const hold = a > 1 ? a * 0.5 : 0;
  const bump = smoothstep(-(a + 0.8), -hold, l) * (1 - smoothstep(hold, a + 0.8, l));
  const arrive = smoothstep(a + 2.5, a + 5.5, l);   // 着いたら、惑星のふちの日の出のほうへ向く
  return { yaw: (a > 1 ? 0.62 : 1.4) * bump + 0.5 * arrive, pitch: -0.12 * bump + 0.04 * arrive, roll: 0.35 * bump, fov: 1 + 0.4 * bump };
}

function tourCaption(l, a) {
  const d = Math.abs(l) - a;
  if (a <= 1 && d < 0.3) return 'のどを通過。ちょうど真ん中で、空は半分ずつ2つの宇宙に分かれます。';
  if (l < 0 && d > 2.5) return '穴の奥に見えるのは、別の宇宙です。';
  if (l < 0 && d > 0) return a > 1 ? 'まもなくトンネルの入口です。' : 'のどに近づきます。穴が空に大きく広がります。';
  if (d <= 0 && l > 0 && d > -1.4 && a > 1) return 'まもなく出口。輪がひらいて、向こうの宇宙が広がります。';
  if (d <= 0) return '前はすべて向こうの宇宙。輪は、のどのまわりをぐるぐる回って届いた、同じ空のくり返しです。';
  if (d < 2) return '通りぬけました。前に広がるのは、向こうの宇宙です。';
  return 'ドラッグでふり返ると、通ってきた穴の中に、もとの宇宙が見えます。';
}
