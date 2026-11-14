// 熱帯雨林の音 — スペクトログラム（音の高さ×時間。0〜16 kHz）。いま鳴っている直近の数秒が右から流れる。
// 時刻の移動は上の声の帯（js/lanes.js）でするので、ここは見るだけ（2026-11-14 ユーザー）。鳴っているあいだだけ描く。
'use strict';
window.Spectro = (() => {
  const cv = document.getElementById('spec'), g = cv.getContext('2d');
  const FMAX = 16000;
  let an = null, buf = null, raf = 0, w = 0, h = 0, col = null, playing = () => false;

  function resize() {
    const r = cv.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; g.fillStyle = '#0d1720'; g.fillRect(0, 0, w, h); }
    col = g.createImageData(1, h);
  }
  // 暗い緑 → 黄 → 白（音の強さ）
  function color(v) {
    const t = v / 255;
    return [Math.min(255, 40 + 420 * t * t), Math.min(255, 20 + 330 * t), Math.min(255, 18 + 120 * t * t * t)];
  }
  function frame() {
    raf = 0; if (Power.away || !an || !playing()) return;
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
  // サムネイル用: 3分ぜんぶの図（data/mix-spec.png。全部の声を ON にした音）を描く（tools/build_mix.py が作る本物の音の図）
  function still(done) {
    resize(); const im = new Image();
    im.onload = () => { g.drawImage(im, 0, 0, w, h); done && done(); }; im.src = 'data/mix-spec.png';
  }
  return {
    still,
    setup(isPlaying) { playing = isPlaying; resize(); },
    start(analyser) { an = analyser; buf = new Uint8Array(an.frequencyBinCount); resize(); if (!raf) raf = requestAnimationFrame(frame); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; },
    resize,
  };
})();
