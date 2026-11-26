// ④-C 積み重ね × 透ける光 — クラゲを半透明の輪切りにして積み、うしろの光が1枚通るたびに少しずつ吸われるように描く
// 1枚ごとに「通す割合」T（赤・緑・青べつ）を掛け算で重ねる（canvas の multiply）。
//   n 枚通ると Tⁿ ＝ 光が通った厚さに対して指数で弱まる（ランベルト・ベールの法則）。厚い所ほど色が濃くなる。
// ふつうのスタッキングは、上の輪切りが下を隠す（光は前から）。ここでは光がうしろから来て、全部の輪切りを通る。
// クラゲの形と色、吸う割合は見た目で決めた架空の値。かさが縮む動きも演出。
'use strict';
(() => {
  const NZ = 34, HB = 0.75;   // 枚数・かさの高さ（半径 1 に対して）
  let t = 0, normal = false;
  const v = Stack.view({ rot: 0.2, tilt: 0.55, auto: 0.15 });
  let fit = { s: 1, cx: 0, cy: 0 };
  const JELLY = [0.955, 0.975, 0.99], GONAD = [0.9, 0.74, 0.86], CANAL = [0.93, 0.85, 0.8];
  const rgb = T => `rgb(${Math.round(T[0] * 255)},${Math.round(T[1] * 255)},${Math.round(T[2] * 255)})`;

  function resize(w, h) { const s = Math.min(w / 3.0, h / 3.2); fit = { s, cx: w / 2, cy: h * 0.45 }; }
  function step(dt) { t += dt; Stack.spin(v, dt); return true; }

  // 高さ z の輪切りの外と内の半径（かさの中は空洞）。pulse でかさが縮む
  function radii(z, pulse) {
    const k = 1 - 0.14 * pulse * (1 - z / HB);
    const ro = Math.sqrt(Math.max(0, 1 - (z / HB) ** 2)) * k;
    const ri = z < HB * 0.72 ? 0.86 * Math.sqrt(Math.max(0, 1 - (z / (HB * 0.72)) ** 2)) * k : 0;
    return [ro, ri];
  }

  function draw(g, w, h) {
    // うしろの光（水の中から明るい水面を見上げる）
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#f2fbff'); bg.addColorStop(0.55, '#a9d6ea'); bg.addColorStop(1, '#2f6f96');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 6; i++) { const x = w * (0.1 + i * 0.17) + Math.sin(t * 0.4 + i) * 20; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x - 30, h); g.lineTo(x - 70, h); g.fill(); }
    const pulse = Math.max(0, Math.sin(t * 1.6)) ** 2, s = fit.s;
    const op = normal ? 'source-over' : 'multiply';
    // 触手と口のうで（かさの下にたれる。線も同じ掛け算で）
    g.save(); g.globalCompositeOperation = op; g.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, [ro] = radii(0, pulse);
      g.strokeStyle = normal ? 'rgba(220,170,200,0.9)' : rgb([0.86, 0.8, 0.9]); g.lineWidth = 1.6; g.beginPath();
      for (let k = 0; k <= 12; k++) {
        const z = -k * 0.12, sw = Math.sin(t * 1.2 + k * 0.5 + i) * 0.05 * k;
        const [x, y] = Stack.at(v, Math.cos(a) * ro * (1 - k * 0.01) + sw, Math.sin(a) * ro * (1 - k * 0.01), z, s, fit.cx, fit.cy);
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4; g.strokeStyle = normal ? 'rgba(230,150,190,0.9)' : rgb([0.8, 0.62, 0.78]); g.lineWidth = 5; g.beginPath();
      for (let k = 0; k <= 8; k++) { const z = 0.1 - k * 0.11, sw = Math.sin(t * 0.9 + k * 0.4 + i) * 0.04 * k; const [x, y] = Stack.at(v, Math.cos(a) * 0.12 + sw, Math.sin(a) * 0.12, z, s, fit.cx, fit.cy); k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    // かさの輪切り（下から上へ）
    for (let k = 0; k < NZ; k++) {
      const z = k / (NZ - 1) * HB, [ro, ri] = radii(z, pulse); if (ro <= 0.01) continue;
      const [x, y] = Stack.at(v, 0, 0, z, s, fit.cx, fit.cy);
      g.save(); g.translate(x, y); g.scale(1, v.tilt); g.rotate(v.rot);
      g.beginPath(); g.arc(0, 0, ro * s, 0, Math.PI * 2); if (ri > 0) g.arc(0, 0, ri * s, 0, Math.PI * 2, true);
      g.fillStyle = normal ? `rgb(${170 + k * 2},${200 + k},${230})` : rgb(JELLY); g.fill('evenodd');
      if (normal) { g.strokeStyle = 'rgba(60,90,120,0.5)'; g.lineWidth = 1; g.stroke(); }
      // 生殖腺（4つの馬蹄形）と水管
      if (z > HB * 0.45 && z < HB * 0.78) {
        g.fillStyle = normal ? 'rgb(230,140,190)' : rgb(GONAD);
        const gw = Math.sin(Math.PI * (z - HB * 0.45) / (HB * 0.33));   // 真ん中ほど太い
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, cx = Math.cos(a) * 0.32 * s, cy = Math.sin(a) * 0.32 * s; g.beginPath(); g.arc(cx, cy, (0.13 + 0.05 * gw) * s, a + 0.9, a + 2 * Math.PI - 0.9); g.arc(cx, cy, (0.13 - 0.05 * gw) * s, a + 2 * Math.PI - 0.9, a + 0.9, true); g.fill(); }
      }
      if (ri > 0 && k % 3 === 0) {
        g.strokeStyle = normal ? 'rgba(200,120,90,0.6)' : rgb(CANAL); g.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(a) * ri * s, Math.sin(a) * ri * s); g.lineTo(Math.cos(a) * ro * s, Math.sin(a) * ro * s); g.stroke(); }
      }
      g.restore();
    }
    g.restore();
    RI.hud(normal ? 'ふつうのスタッキング: 光は前から、上の輪切りが下を隠す' : `${NZ} 枚の輪切りを、うしろの光が通るたびに少しずつ吸う（厚い所ほど色が濃い）`);
  }

  RI.add({
    id: 'stack-glass', group: 'stack-time', label: '透ける光（クラゲ）',
    lead: 'クラゲを<b>半透明の輪切り</b>にして積みました。うしろの光が<b>1枚通るたびに少しずつ吸われる</b>ので、厚い所ほど色が濃くなります。',
    how: `<p>ふつうのスタッキングは、上の輪切りが下の輪切りを隠します（光が前から当たる絵）。ここでは光がうしろから来て、全部の輪切りを通りぬけます。1枚通るごとに、赤・緑・青をそれぞれ決まった割合だけ通します。n 枚通ると割合の n 乗になり、光が通った厚さに対して指数で弱まります。これは、光が物を通るときの吸収の法則（ランベルト・ベールの法則）と同じ形です。</p>
      <p>かさのふちや生殖腺（4つの馬蹄形）のように、光が長く通る所ほど色が濃く見えます。</p>
      <p>簡単にしているところ: クラゲの形・色・通す割合は見た目で決めた架空の値です。光の散らばり（にごり）や、屈折で曲がることは入れていません。かさが縮む動きは演出です。</p>`,
    resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうのスタッキング（光は前から）', normal, x => { normal = x; });
    },
    step, draw,
    pointer(type, x, y) { Stack.pointer(v, type, x, y); },
  });
})();
