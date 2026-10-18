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
    if (!spec.wIn) { txt(g, '回すと、ここに波と成分が出ます', 10, 10, col.dim); return; }
    const hw = Math.round(h * 0.42), n = Math.round(fs * 0.03), a0 = N - n;
    const tr = (x, y0, hh, c, lab) => {
      let mx = 0; for (let i = a0; i < N; i++) mx = Math.max(mx, Math.abs(x[i]));
      g.strokeStyle = col.line; g.beginPath(); g.moveTo(0, y0 + hh / 2); g.lineTo(w, y0 + hh / 2); g.stroke();
      g.beginPath(); for (let i = a0; i < N; i++) { const X = (i - a0) / n * w, Y = y0 + hh / 2 - (mx > 0 ? x[i] / mx : 0) * hh * 0.45; i === a0 ? g.moveTo(X, Y) : g.lineTo(X, Y); }
      g.strokeStyle = c; g.lineWidth = 1.3; g.stroke();
      txt(g, lab + '（いちばん大きい所 ' + fmtPa(mx) + '）', 8, y0 + 2, c);
    };
    tr(spec.wIn, 0, hw / 2, col.voice, '入れた音（最後に録ったとき）: マウスピースの中の圧力');
    tr(spec.wOut, hw / 2, hw / 2, col.play, '出た音（いま・最後に聴いたとき）: 耳もと 30 cm の圧力');
    txt(g, '30 ミリ秒', w - 8, hw - 16, col.dim, 'right');
    // 成分（横は対数 50 Hz〜10 kHz、たては dB）
    const y0 = hw + 10, hh = h - y0 - 18, fx = f => Math.log(f / 50) / Math.log(200) * w, lo = 0, hi = 130, fy = d => y0 + hh * (1 - (d - lo) / (hi - lo));
    g.strokeStyle = col.line; g.lineWidth = 1;
    for (const f of [100, 200, 500, 1000, 2000, 5000, 10000]) { g.beginPath(); g.moveTo(fx(f), y0); g.lineTo(fx(f), y0 + hh); g.stroke(); txt(g, f >= 1000 ? f / 1000 + 'k' : String(f), fx(f), y0 + hh + 2, col.dim, 'center'); }
    for (const d of [40, 80, 120]) { g.beginPath(); g.moveTo(0, fy(d)); g.lineTo(w, fy(d)); g.stroke(); txt(g, d + ' dB', 4, fy(d) + 1, col.dim); }
    const line = (s, c) => { g.beginPath(); let st = false; for (let k = 2; k < N / 2; k++) { const f = k * fs / N; if (f < 50 || f > 10000) continue; const X = fx(f), Y = Math.max(y0, Math.min(y0 + hh, fy(s[k]))); st ? g.lineTo(X, Y) : (g.moveTo(X, Y), st = true); } g.strokeStyle = c; g.lineWidth = 1.3; g.stroke(); };
    line(spec.in, col.voice); line(spec.out, col.play);
    txt(g, '成分（Hz ごとの大きさ）', w - 8, y0 + 2, col.muted, 'right');
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
    txt(g, '1周目', 2, nR * rh + 2, col.dim); txt(g, nR + '周目（下）', w - 2, nR * rh + 2, col.dim, 'right');
  }
  return { setWaves, waves, foil, fmtPa };
})();
