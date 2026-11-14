// 熱帯雨林の音 — 流れるスペクトログラム（いま鳴っている音の高さ。0〜16 kHz）
// 鳴っているあいだだけ描く（止めたら描き直さない。RULES 9章「変化のない画面は描き直さない」）
'use strict';
window.Spectro = (() => {
  const cv = document.getElementById('spec'), g = cv.getContext('2d');
  const FMAX = 16000;
  let an = null, buf = null, raf = 0, w = 0, h = 0, col = null;

  function resize() {
    const r = cv.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; g.fillStyle = '#081210'; g.fillRect(0, 0, w, h); }
    col = g.createImageData(1, h);
  }
  // 暗い緑 → 黄 → 白（音の強さ）
  function color(v) {
    const t = v / 255;
    return [Math.min(255, 40 + 420 * t * t), Math.min(255, 20 + 330 * t), Math.min(255, 18 + 120 * t * t * t)];
  }
  function frame() {
    raf = 0;
    if (!an || Power.away) return;
    an.getByteFrequencyData(buf);
    const nyq = an.context.sampleRate / 2, top = Math.min(buf.length - 1, Math.floor(buf.length * FMAX / nyq));
    g.drawImage(cv, -2, 0);                                  // 左へ2画素ずらして、右はしに新しい列
    for (let y = 0; y < h; y++) {
      const v = buf[Math.round((1 - y / (h - 1)) * top)], [r, gg, b] = color(v), i = y * 4;
      col.data[i] = r; col.data[i + 1] = gg; col.data[i + 2] = b; col.data[i + 3] = 255;
    }
    g.putImageData(col, w - 2, 0); g.putImageData(col, w - 1, 0);
    raf = requestAnimationFrame(frame);
  }
  // 再生していないときは、重ねた森の3分ぜんぶの図（tools/build_mix.py が作る）を出しておく
  function still() {
    resize();
    const im = new Image();
    im.onload = () => { if (!raf) g.drawImage(im, 0, 0, w, h); };
    im.src = 'data/mix-spec.png';
  }
  return {
    still,
    start(analyser) { an = analyser; buf = new Uint8Array(an.frequencyBinCount); resize(); if (!raf) raf = requestAnimationFrame(frame); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; },
    resize,
  };
})();
