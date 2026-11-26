// ④-A 積み重ね × 時間 — 輪切りを「高さ」ではなく「時刻」で積む
// 1枚＝ある時刻の太陽系を真上から見た絵。それを古い順に下から積むと、惑星の軌道が「らせん」の彫刻になる。
// 内側の惑星ほど速く回るので、らせんのまきが細かい（ケプラーの第3法則 T = a^1.5）。だ円の軌道はまきの間かくがむらになる（第2法則）。
// 惑星の値: 長半径 a（天文単位）と離心率 e は理科年表などの値を丸めたもの。彗星は架空（a = 1.3、e = 0.65）。
'use strict';
(() => {
  const BODIES = [
    { name: '水星', a: 0.387, e: 0.206, ph: 0.1, col: [190, 180, 170], r: 2.2 },
    { name: '金星', a: 0.723, e: 0.007, ph: 0.5, col: [240, 210, 150], r: 3 },
    { name: '地球', a: 1.0, e: 0.017, ph: 0.25, col: [110, 170, 255], r: 3.2 },
    { name: '火星', a: 1.524, e: 0.093, ph: 0.8, col: [240, 120, 80], r: 2.6 },
    { name: '彗星（架空）', a: 1.3, e: 0.65, ph: 0.55, col: [170, 240, 230], r: 2.2 },
  ];
  const NS = 150, HZ = 2.6;   // 積む枚数・積んだ高さ（天文単位と同じ目もり）
  let t = 0, span = 2, speed = 0.25, normal = false, paused = false;
  const v = Stack.view({ rot: 0.4, tilt: 0.42, auto: 0.12 });
  let fit = { s: 1, cx: 0, cy: 0 };

  function pos(b, tt) {   // ケプラーの方程式 E − e sinE = M をニュートン法で
    const T = Math.pow(b.a, 1.5), M = 2 * Math.PI * (tt / T + b.ph);
    let E = M; for (let i = 0; i < 6; i++) E -= (E - b.e * Math.sin(E) - M) / (1 - b.e * Math.cos(E));
    return [b.a * (Math.cos(E) - b.e), b.a * Math.sqrt(1 - b.e * b.e) * Math.sin(E)];
  }
  function resize(w, h) { const s = Math.min(w / 4.4, h / 5.2); fit = { s, cx: w / 2, cy: h * 0.72 }; }

  function step(dt) { if (!paused) t += dt * speed; Stack.spin(v, dt); return !paused || v.auto > 0 || !!v.drag; }

  function draw(g, w, h) {
    const bg = g.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#0d1626'); bg.addColorStop(1, '#03060b'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const vv = normal ? { rot: v.rot, tilt: 1 } : v, P = (x, y, z) => Stack.at(vv, x, y, z, fit.s, fit.cx, normal ? h / 2 : fit.cy);
    // いちばん下（いちばん古い時刻）に軌道の輪
    g.strokeStyle = 'rgba(163,180,191,0.25)'; g.lineWidth = 1;
    for (const b of BODIES) { g.beginPath(); for (let k = 0; k <= 96; k++) { const tt = k / 96 * Math.pow(b.a, 1.5); const [x, y] = pos(b, tt); const [sx, sy] = P(x, y, 0); k ? g.lineTo(sx, sy) : g.moveTo(sx, sy); } g.stroke(); }
    if (normal) {   // ふつうの描き方: いまの1枚だけ
      const [sx, sy] = P(0, 0, 0); g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(sx, sy, 7, 0, Math.PI * 2); g.fill();
      for (const b of BODIES) { const [x, y] = pos(b, t), [px, py] = P(x, y, 0); g.fillStyle = `rgb(${b.col})`; g.beginPath(); g.arc(px, py, b.r * 1.6, 0, Math.PI * 2); g.fill(); }
      RI.hud('ふつうの描き方: いまの1枚だけ（真上から）'); return;
    }
    // 輪切りを下（古い）から上（いま）へ積む
    for (let k = 0; k < NS; k++) {
      const f = k / (NS - 1), tt = t - span * (1 - f), z = f * HZ, al = 0.15 + 0.85 * f;
      const [sx, sy] = P(0, 0, z); g.fillStyle = `rgba(255,211,106,${0.5 * al})`; g.beginPath(); g.arc(sx, sy, 5, 0, Math.PI * 2); g.fill();
      for (const b of BODIES) {
        const [x, y] = pos(b, tt), [px, py] = P(x, y, z);
        g.fillStyle = `rgba(${b.col},${al})`; g.beginPath(); g.arc(px, py, b.r * (k === NS - 1 ? 1.8 : 1), 0, Math.PI * 2); g.fill();
      }
    }
    // いちばん上（いま）に名前
    g.font = "500 12px 'Zen Kaku Gothic New', sans-serif"; g.textAlign = 'left';
    for (const b of BODIES) { const [x, y] = pos(b, t), [px, py] = P(x, y, HZ); g.fillStyle = `rgba(${b.col},0.95)`; g.fillText(b.name, px + 7, py - 6); }
    const [tx, ty] = P(0, 0, HZ); g.fillStyle = 'rgba(232,240,244,0.7)'; g.textAlign = 'center'; g.fillText('いま', tx, ty - 16);
    const [bx, by] = P(0, 0, 0); g.fillText(`${span} 年前`, bx, by + 22);
    RI.hud(`下から上へ ${span} 年ぶんを ${NS} 枚積んでいます（左右に引っぱると回る・上下で角度）`);
  }

  RI.add({
    id: 'stack-time', group: 'stack-time', label: '時間を積む（惑星）',
    lead: '太陽系を真上から見た絵を、<b>時刻の順に下から積みました</b>。惑星の通り道が<b>らせん</b>になります。',
    how: `<p>スプライトスタッキングは、ふつう物の「高さ」ごとの輪切りを重ねます。ここでは輪切りを「時刻」に置きかえ、1枚に1つの時刻の太陽系を描いて、古い順に下から積みました。</p>
      <p>内側の惑星ほど速く回るので、らせんのまきが細かくなります（ケプラーの第3法則: 周期は長半径の 1.5 乗に比例）。だ円の軌道を回る彗星は、太陽に近い所で速くなるので、らせんの間かくがむらになります（第2法則）。</p>
      <p>簡単にしているところ: 軌道は同じ平面に並べ、向きはそろえていません。惑星の長半径と離心率は丸めた値で、彗星は架空です。点の大きさは目印で、本当の大きさの比ではありません。</p>`,
    resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（いまの1枚）', normal, x => { normal = x; });
      RI.toggle(b, '一時停止', paused, x => { paused = x; });
      RI.slider(root, { label: '積む長さ', min: 0.5, max: 4, step: 0.5, value: span, fmt: x => `${x} 年`, oninput: x => { span = x; } });
      RI.slider(root, { label: '時間の速さ', min: 0, max: 1, step: 0.05, value: speed, fmt: x => `1秒で ${x} 年`, oninput: x => { speed = x; } });
    },
    step, draw,
    pointer(type, x, y) { Stack.pointer(v, type, x, y); },
  });
})();
