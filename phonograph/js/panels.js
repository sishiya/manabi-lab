// エジソンの蓄音機 — 下の図: 入れた音と出た音（波・成分）、箔をひろげた図
'use strict';
const Panels = (() => {
  const col = Draw.col, N = 4096;
  function fft(re, im) {   // その場で書きかえる基数2の FFT
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  function spectrum(x) {   // dB（20 µPa 基準のおよその目安。ハン窓）
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    fft(re, im); const out = new Float32Array(N / 2);
    for (let k = 0; k < N / 2; k++) out[k] = 20 * Math.log10(Math.max(1e-9, Math.hypot(re[k], im[k]) * 2 / (N * 0.5) / Math.SQRT2) / 20e-6);
    return out;
  }
  const spec = { in: null, out: null };
  function setWaves(a, b) { spec.in = spectrum(a); spec.out = spectrum(b); spec.wIn = a; spec.wOut = b; }
  function prep(cv) { const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); } const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return [g, r.width, r.height]; }
  function txt(g, s, x, y, c, al) { g.fillStyle = c; g.font = '12px "Zen Kaku Gothic New",sans-serif'; g.textAlign = al || 'left'; g.textBaseline = 'top'; g.fillText(s, x, y); }
  function waves(cv, fs) {
    const [g, w, h] = prep(cv); g.clearRect(0, 0, w, h);
    if (!spec.wIn) { txt(g, L('回すと、ここに波と成分が出ます', 'Turn the drum to see the waves and their parts here'), 10, 10, col.dim); return; }
    // 上から: 見出し → 入れた音の波 → 見出し → 出た音の波 → 見出し → 成分。文字は線と重ならないよう、それぞれの行に置く
    const LH = 16, th = Math.max(34, Math.round(h * 0.15)), n = Math.round(fs * 0.03), a0 = N - n, narrow = w < 480;
    const tr = (x, y0, c, lab) => {
      let mx = 0; for (let i = a0; i < N; i++) mx = Math.max(mx, Math.abs(x[i]));
      txt(g, lab + L('　いちばん大きい所 ' + fmtPa(mx), '  peak ' + fmtPa(mx)), 4, y0 + 1, c);
      const yc = y0 + LH + th / 2;
      g.strokeStyle = col.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yc); g.lineTo(w, yc); g.stroke();
      g.beginPath(); for (let i = a0; i < N; i++) { const X = (i - a0) / n * w, Y = yc - (mx > 0 ? x[i] / mx : 0) * th * 0.46; i === a0 ? g.moveTo(X, Y) : g.lineTo(X, Y); }
      g.strokeStyle = c; g.lineWidth = 1.3; g.stroke();
      return y0 + LH + th;
    };
    if (!narrow) txt(g, L('← 横は 30 ミリ秒 →', '← 30 ms across →'), w - 4, 1, col.dim, 'right');
    let y = tr(spec.wIn, 0, col.voice, narrow ? L('入れた音（マウスピースの中）', 'Sound in (mouthpiece)') : L('入れた音（最後に録ったとき）: マウスピースの中の圧力', 'Sound in (last recording): pressure in the mouthpiece'));
    y = tr(spec.wOut, y + 4, col.play, narrow ? L('出た音（耳もと 30 cm）', 'Sound out (at 30 cm)') : L('出た音（いま・最後に聴いたとき）: 耳もと 30 cm の圧力', 'Sound out (now or last playback): pressure at 30 cm'));
    // 成分（横は対数 50 Hz〜10 kHz、たては dB）。入れた音はうすく塗り、出た音は線で（重なっても両方見える）
    const yL = y + 6; txt(g, L('成分（Hz ごとの大きさ）', 'Parts (loudness at each Hz)'), 4, yL, col.muted);
    g.font = '12px "Zen Kaku Gothic New",sans-serif'; const lIn = L('入れた音', 'in'), lOut = L('出た音', 'out'), wOut = g.measureText(lOut).width, wIn = g.measureText(lIn).width;
    let lx = w - 4 - wOut; txt(g, lOut, lx, yL, col.play); lx -= 16; g.fillStyle = col.play; g.fillRect(lx, yL + 7, 12, 2);
    lx -= 12 + wIn; txt(g, lIn, lx, yL, col.voice); lx -= 16; g.fillStyle = col.voice; g.globalAlpha = 0.35; g.fillRect(lx, yL + 4, 12, 8); g.globalAlpha = 1;
    const y0 = yL + LH + 2, hh = h - y0 - 16, fx = f => Math.log(f / 50) / Math.log(200) * w, lo = 0, hi = 130, fy = d => y0 + hh * (1 - (d - lo) / (hi - lo));
    g.strokeStyle = col.line; g.lineWidth = 1;
    for (const f of [100, 200, 500, 1000, 2000, 5000, 10000]) { g.beginPath(); g.moveTo(fx(f), y0); g.lineTo(fx(f), y0 + hh); g.stroke(); txt(g, f >= 1000 ? f / 1000 + 'k' : String(f), Math.min(w - 8, fx(f)), y0 + hh + 2, col.dim, 'center'); }
    for (const d of [40, 80, 120]) { g.beginPath(); g.moveTo(0, fy(d)); g.lineTo(w, fy(d)); g.stroke(); txt(g, d + ' dB', 4, fy(d) + 1, col.dim); }
    const path = s => { const pts = []; for (let k = 2; k < N / 2; k++) { const f = k * fs / N; if (f < 50 || f > 10000) continue; pts.push([fx(f), Math.max(y0, Math.min(y0 + hh, fy(s[k])))]); } return pts; };
    const pin = path(spec.in); g.beginPath(); g.moveTo(pin[0][0], y0 + hh); for (const [X, Y] of pin) g.lineTo(X, Y); g.lineTo(pin[pin.length - 1][0], y0 + hh); g.closePath();
    g.fillStyle = col.voice; g.globalAlpha = 0.28; g.fill(); g.globalAlpha = 1;
    g.beginPath(); path(spec.out).forEach(([X, Y], i) => i ? g.lineTo(X, Y) : g.moveTo(X, Y)); g.strokeStyle = col.play; g.lineWidth = 1.6; g.stroke();
  }
  function fmtPa(p) { return p >= 1 ? p.toFixed(1) + ' Pa' : p >= 0.001 ? (p * 1000).toFixed(1) + ' mPa' : (p * 1e6).toFixed(0) + ' µPa'; }
  function foil(cv, S) {   // 箔をひろげた図: たてが周（1周目が上）、横が筒のまわり
    const [g, w, h] = prep(cv); g.clearRect(0, 0, w, h);
    const nR = PhonoPhys.P.nRev, sn = 256, rh = (h - 18) / nR;
    g.fillStyle = 'rgba(207,214,220,.08)'; g.fillRect(0, 0, w, nR * rh);
    if (S.seg) for (let r = 0; r < nR; r++) for (let k = 0; k < sn; k++) {
      const v = S.seg[r * sn + k]; if (v < 1e-6) continue;
      g.fillStyle = col.acc; g.globalAlpha = Math.max(0.2, Math.min(1, v / 25e-6)); g.fillRect(k / sn * w, r * rh, w / sn + 0.5, Math.max(1, rh - 0.6));
    }
    g.globalAlpha = 1;
    const circ = 2 * Math.PI * PhonoPhys.P.R, rr = S.x / circ, row = Math.floor(rr), fx = (rr - row) * w;
    g.fillStyle = col.ink; g.fillRect(fx - 1, row * rh - 2, 3, rh + 4);
    txt(g, L('1周目', 'Turn 1'), 2, nR * rh + 2, col.dim); txt(g, L(nR + '周目（下）', 'Turn ' + nR + ' (bottom)'), w - 2, nR * rh + 2, col.dim, 'right');
  }
  return { setWaves, waves, foil, fmtPa };
})();
