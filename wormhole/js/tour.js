// 「▶ 通りぬける」の進み方。速さ・カメラの向き・字幕は、どれも位置 ℓ だけで決まる（途中で止めても、途中から再生しても同じ道）
'use strict';
const TOUR_END = 6.25;   // 出口からここまで進んで終わる（ρ）

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 進む速さ（ρ/秒）。口の前でゆっくり、トンネルの中で速く
function tourSpeed(l, a) {
  const d = Math.abs(l) - a;
  if (d > 0) return 0.24 + 1.4 * smoothstep(0, 5, d);
  return 0.24 + 1.9 * Math.sin(Math.PI * (l + a) / (2 * a));
}

// カメラの向き（yaw: 横、pitch: 上下、roll: 傾き。ラジアン）と視野の倍率
function tourCam(l, a) {
  const hold = a > 1 ? a * 0.5 : 0;
  const bump = smoothstep(-(a + 0.8), -hold, l) * (1 - smoothstep(hold, a + 0.8, l));
  const back = smoothstep(a + 1.5, a + 4.5, l);
  return { yaw: (a > 1 ? 0.62 : 1.4) * bump + Math.PI * back, pitch: -0.12 * bump, roll: 0.35 * bump, fov: 1 + 0.4 * bump };
}

function tourCaption(l, a) {
  const d = Math.abs(l) - a;
  if (a <= 1 && d < 0.3) return 'のどを通過。ちょうど真ん中で、空は半分ずつ2つの宇宙に分かれます。';
  if (l < 0 && d > 2.5) return '穴の奥に見えるのは、別の宇宙です。';
  if (l < 0 && d > 0) return a > 1 ? 'まもなくトンネルの入口です。' : 'のどに近づきます。穴が空に大きく広がります。';
  if (d <= 0) return '前はすべて向こうの宇宙。輪は、のどのまわりをぐるぐる回って届いた、同じ空のくり返しです。';
  if (d < 2) return '通りぬけました。前に広がるのは、向こうの宇宙です。';
  return 'ふり返ると、今度は穴の中に、もとの宇宙が見えます。';
}
