// 熱帯雨林の音 — スペクトログラム（音の高さ×時間。0〜16 kHz）
// 2つの見せ方: 「いまの音」= 右から流れる直近の数秒（鳴っているあいだだけ描く）／「3分ぜんぶ」= 全部の声を ON にした3分の図（tools/build_mix.py が作る）に、
// 再生位置の線・くり返す区間・選んだ声の箱（注釈の高さ）を重ねる。3分ぜんぶの図は押すとその時刻へ移動。
'use strict';
window.Spectro = (() => {
  const cv = document.getElementById('spec'), g = cv.getContext('2d');
  const FMAX = 16000;
  let an = null, buf = null, raf = 0, w = 0, h = 0, col = null, mode = 'full', img = null, hooks = {};

  function resize() {
    const r = cv.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; g.fillStyle = '#081210'; g.fillRect(0, 0, w, h); }
    col = g.createImageData(1, h);
    if (mode === 'full') drawFull();
  }
  // 暗い緑 → 黄 → 白（音の強さ）
  function color(v) {
    const t = v / 255;
    return [Math.min(255, 40 + 420 * t * t), Math.min(255, 20 + 330 * t), Math.min(255, 18 + 120 * t * t * t)];
  }
  function frameLive() {
    an.getByteFrequencyData(buf);
    const nyq = an.context.sampleRate / 2, top = Math.min(buf.length - 1, Math.floor(buf.length * FMAX / nyq));
    g.drawImage(cv, -2, 0);                                  // 左へ2画素ずらして、右はしに新しい列
    for (let y = 0; y < h; y++) {
      const v = buf[Math.round((1 - y / (h - 1)) * top)], [r, gg, b] = color(v), i = y * 4;
      col.data[i] = r; col.data[i + 1] = gg; col.data[i + 2] = b; col.data[i + 3] = 255;
    }
    g.putImageData(col, w - 2, 0); g.putImageData(col, w - 1, 0);
  }
  function drawFull() {
    if (!img || !img.complete || !Forest.data) return;
    const L = Forest.data.length_s, X = t => t / L * w, Y = f => h * (1 - Math.min(f, FMAX) / FMAX);
    g.drawImage(img, 0, 0, w, h);
    const ab = Forest.loopAB;
    if (ab) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(X(ab[0]), 0, X(ab[1]) - X(ab[0]), h); }
    if (List.sel && List.sel !== 'bed') {                    // 選んだ声の箱（注釈の高さ）
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      for (const e of List.events(List.sel)) g.strokeRect(X(e[1]), Y(e[5] * 1.2), Math.max(3, X(e[3])), Y(e[4] / 1.2) - Y(e[5] * 1.2));
    }
    g.fillStyle = '#fff'; g.fillRect(X(Forest.time) - 1, 0, 2, h);
  }
  function frame() {
    raf = 0; if (Power.away) return;
    if (mode === 'live') { if (!an || !Forest.playing && !hooks.abPlaying()) return; frameLive(); }
    else { drawFull(); if (!Forest.playing) return; }
    raf = requestAnimationFrame(frame);
  }
  function setMode(m) {
    mode = m; g.fillStyle = '#081210'; g.fillRect(0, 0, w, h);
    document.querySelectorAll('[data-spec]').forEach(b => { const on = b.dataset.spec === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    document.getElementById('specNote').textContent = m === 'live'
      ? 'いまの音（直近の数秒）。たて＝高さ、明るい＝強い'
      : '3分ぜんぶ（全部 ON の音）。押すとその時刻へ';
    if (m === 'full') drawFull(); else if (raf === 0 && an && (Forest.playing || hooks.abPlaying())) raf = requestAnimationFrame(frame);
    cv.style.cursor = m === 'full' ? 'pointer' : 'default';
  }
  cv.addEventListener('click', e => {
    if (mode !== 'full' || !Forest.data) return;
    const r = cv.getBoundingClientRect(); let t = (e.clientX - r.left) / r.width * Forest.data.length_s, snapped = null;
    if (List.sel && List.sel !== 'bed') {                    // 選んだ声の近く（±3秒）なら、その声の1秒前へ寄せる
      let best = null; for (const x of List.events(List.sel)) { const d = Math.abs(x[1] - t); if (d < 3 && (!best || d < best.d)) best = { d, x }; }
      if (best) { t = Math.max(0, best.x[1] - 1); snapped = List.sel; }
    }
    hooks.seek(t, snapped);
  });
  return {
    setup(h) { hooks = h; img = new Image(); img.onload = () => { resize(); drawFull(); }; img.src = 'data/mix-spec.png'; setMode('full'); },
    start(analyser) { an = analyser; buf = new Uint8Array(an.frequencyBinCount); resize(); if (!raf) raf = requestAnimationFrame(frame); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (mode === 'full') drawFull(); },
    redraw() { if (mode === 'full') drawFull(); },
    setMode, resize, get mode() { return mode; },
  };
})();
