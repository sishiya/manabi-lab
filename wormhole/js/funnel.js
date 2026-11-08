// ろうと図（2D キャンバス）。ワームホールの面を、もとの宇宙（下）と向こうの宇宙（上）の2枚のろうとで描く。
// 面の上の位置 (ℓ, φ) は本当の r(ℓ) を使う。高さは模式（見やすさのため。解説にも書く）。
'use strict';

const FN = { rim: 9, tilt: 0.34, colA: [127, 212, 255], colB: [255, 178, 110] };

function fnHeight(S, l) {
  const cyl = Math.min(Math.abs(l), S.a), r = radius(S, l);
  const z = Math.min(1.5, cyl * 0.32) + 2.1 * Math.pow(Math.max(0, 1 - 1 / r), 0.7);
  return (l < 0 ? -1 : 1) * z;
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function fnProject(S, l, phi, W, H) {
  const r = radius(S, l), z = fnHeight(S, l), s = W * 0.46 / FN.rim;
  // φ = 0（カメラの向き）が手前
  return [W / 2 + s * r * Math.sin(phi), H / 2 - s * z * 1.15 + s * r * Math.cos(phi) * FN.tilt];
}

// 道すじ path = [[ℓ, φ], …]。camL = カメラの位置。end = 終わりの宇宙の符号
function drawFunnel(cv, S, camL, ray) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 300, ch = cv.clientHeight || 220;
  if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);

  // のどの輪と、ろうとの輪・すじ
  let lRim = 0.1;   // r が rim になる ℓ
  while (radius(S, lRim) < FN.rim && lRim < 200) lRim += 0.1;
  const rings = [];
  for (let i = 0; i <= 14; i++) rings.push(i / 14);
  const drawRing = (l, col, a, w) => {
    g.beginPath();
    for (let i = 0; i <= 64; i++) { const p = fnProject(S, l, i / 64 * TAU, cw, ch); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
    g.strokeStyle = rgba(col, a); g.lineWidth = w; g.stroke();
  };
  for (const sgn of [-1, 1]) {
    const col = sgn < 0 ? FN.colA : FN.colB;
    for (const t of rings) {
      const l = sgn * (S.a + (lRim - S.a) * Math.pow(t, 1.8));
      drawRing(l, col, 0.14 + 0.18 * (1 - t), 1);
    }
    for (let k = 0; k < 16; k++) {
      const ph = k / 16 * TAU;
      g.beginPath();
      for (let i = 0; i <= 26; i++) {
        const l = sgn * lRim * Math.pow(i / 26, 1.6), p = fnProject(S, l, ph, cw, ch);
        i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
      }
      g.strokeStyle = rgba(col, 0.1); g.lineWidth = 1; g.stroke();
    }
  }
  drawRing(0, [255, 255, 255], 0.75, 1.6);
  if (S.a > 0.05) { drawRing(-S.a, [255, 255, 255], 0.35, 1); drawRing(S.a, [255, 255, 255], 0.35, 1); }

  const small = cw < 220;   // スマホで景色に重ねているときは、字を減らす
  g.font = `${small ? 10 : 12}px 'Zen Kaku Gothic New','Yu Gothic',sans-serif`;
  g.fillStyle = rgba(FN.colB, 0.95); g.textAlign = 'left'; g.fillText(small ? '向こう' : '向こうの宇宙', 6, small ? 12 : 16);
  g.fillStyle = rgba(FN.colA, 0.95); g.fillText(small ? 'もと' : 'もとの宇宙', 6, ch - 6);
  if (!small) { g.fillStyle = 'rgba(255,255,255,.75)'; g.textAlign = 'right'; const tp = fnProject(S, 0, Math.PI / 2, cw, ch); g.fillText('のど', tp[0] + 30, tp[1] + 4); }

  // 光の道すじ
  if (ray && ray.path) {
    const col = ray.side > 0 ? FN.colB : FN.colA;
    g.beginPath();
    let down = false, out = false;
    for (const [l, phi] of ray.path) {
      if (radius(S, l) > FN.rim * 1.04) { down = false; out = true; continue; }
      const p = fnProject(S, l, phi, cw, ch);
      if (down) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); down = true; }
    }
    void out;
    g.strokeStyle = '#fff'; g.lineWidth = 3.4; g.globalAlpha = 0.28; g.stroke();
    g.strokeStyle = rgba(col, 1); g.lineWidth = 2; g.globalAlpha = 1; g.stroke();
  }

  // カメラ
  const camOff = radius(S, camL) > FN.rim;
  const clampedL = camOff ? Math.sign(camL) * lRim : camL, cp = fnProject(S, clampedL, 0, cw, ch);
  g.beginPath(); g.arc(cp[0], cp[1], 5.5, 0, TAU); g.fillStyle = '#fff'; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#0b1224'; g.stroke();
  if (!small) { g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(camOff ? 'カメラ（もっと遠く）' : 'カメラ', cp[0] + 10, cp[1] + 4); }
}
