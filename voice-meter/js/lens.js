// 図（選んだ数の「測り方」を見せる）。どれも Canvas 2D。draw(g, w, h, R, t, param) の形
import { harmonicsAt, cepstrumAt, cppOf, averageCep, smoothCep } from './engine/spectrum.js';
import { powerSpec, hann, db, median } from './engine/dsp.js';
import { frameTime } from './engine/pitch.js';

const C = { line: 'rgba(170,210,235,.16)', text: '#a3b4bf', ink: '#e8f0f4', acc: '#7fd6c2', warm: '#ffc95a', red: '#ff8d7a', blue: '#8fbcff', dim: '#55697a' };
const PAD = { l: 44, r: 12, t: 12, b: 24 };
const FONT = '11px "IBM Plex Mono",Consolas,monospace';

function frame(w, h) { return { x0: PAD.l, x1: w - PAD.r, y0: PAD.t, y1: h - PAD.b, w: w - PAD.l - PAD.r, h: h - PAD.t - PAD.b }; }
function text(g, s, x, y, col = C.text, align = 'left') { g.fillStyle = col; g.font = FONT; g.textAlign = align; g.fillText(s, x, y); }
function yAxis(g, f, ticks, map, fmt = v => v) {
  g.strokeStyle = C.line; g.lineWidth = 1;
  for (const v of ticks) { const y = map(v); g.beginPath(); g.moveTo(f.x0, y); g.lineTo(f.x1, y); g.stroke(); text(g, fmt(v), f.x0 - 5, y + 4, C.text, 'right'); }
}
function timeAxis(g, f, R) {
  const step = R.dur > 8 ? 2 : 1;
  for (let s = 0; s <= R.dur; s += step) text(g, s + 's', f.x0 + s / R.dur * f.w, f.y1 + 16, C.text, 'center');
}
function playhead(g, f, R, t) {
  const x = f.x0 + t / R.dur * f.w;
  g.strokeStyle = C.warm; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, f.y0); g.lineTo(x, f.y1); g.stroke();
}
const frameAt = (R, t) => Math.max(0, Math.min(R.trk.n - 1, Math.round((t - R.trk.winSec / 2) / R.trk.hop)));
function nearestVoiced(R, t) {
  const f = frameAt(R, t);
  for (let d = 0; d < R.trk.n; d++) { if (R.trk.f0[f + d] > 0) return f + d; if (R.trk.f0[f - d] > 0) return f - d; }
  return -1;
}
function message(g, w, h, s) { text(g, s, w / 2, h / 2, C.text, 'center'); }

// スペクトログラムを1度だけ絵にしておく
function specImage(R) {
  if (R._spec) return R._spec;
  const N = 400, nfft = 512, step = 2, top = 176, win = hann(N), cols = Math.floor(R.trk.n / step);
  const hop = Math.round(R.trk.hop * R.fs), data = new Float32Array(cols * top);
  let mx = -Infinity;
  for (let c = 0; c < cols; c++) {
    const s = c * step * hop + Math.round((R.trk.winSec * R.fs - N) / 2), p = powerSpec(R.x, s, win, nfft);
    for (let k = 0; k < top; k++) { const d = db(p[k + 1]); data[c * top + k] = d; if (d > mx) mx = d; }
  }
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, cols); cv.height = top;
  const g = cv.getContext('2d'), im = g.createImageData(cv.width, top);
  for (let c = 0; c < cols; c++) for (let k = 0; k < top; k++) {
    const v = Math.max(0, Math.min(1, (data[c * top + k] - mx + 68) / 68)), i = ((top - 1 - k) * cols + c) * 4;
    im.data[i] = 14 + 210 * v * v; im.data[i + 1] = 26 + 205 * v; im.data[i + 2] = 40 + 120 * Math.sqrt(v); im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return (R._spec = cv);
}

export const LENS = {
  formant(g, w, h, R, t) {
    const f = frame(w, h), H = 5500, y = v => f.y1 - v / H * f.h;
    g.imageSmoothingEnabled = true;
    g.drawImage(specImage(R), f.x0, f.y0, f.w, f.h);
    yAxis(g, f, [1000, 2000, 3000, 4000, 5000], y, v => v / 1000 + 'k');
    const col = [C.warm, C.acc, C.blue, '#d6b3ff'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = col[i];
      for (let n = 0; n < R.trk.n; n += 2) { const v = R.fm.F[i][n]; if (Number.isFinite(v)) g.fillRect(f.x0 + frameTime(R.trk, n) / R.dur * f.w - 1, y(v) - 1, 2, 2); }
      text(g, 'F' + (i + 1), f.x1 - 34 + i * 0, f.y0 + 12 + i * 13, col[i]);
    }
    timeAxis(g, f, R); playhead(g, f, R, t);
  },
  f0(g, w, h, R, t) {
    const f = frame(w, h), lo = Math.log(55), hi = Math.log(620), y = v => f.y1 - (Math.log(v) - lo) / (hi - lo) * f.h;
    yAxis(g, f, [100, 200, 400], y);
    const V = R.value;
    let lastLabel = Infinity; // 線が近いときは字を重ねない（高さのそろった「のばす声」）
    [[V.f0_p20, C.dim], [V.f0_p80, C.dim], [V.f0_med, C.acc]].forEach(([v, col]) => {
      if (!Number.isFinite(v)) return;
      g.strokeStyle = col; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(f.x0, y(v)); g.lineTo(f.x1, y(v)); g.stroke(); g.setLineDash([]);
    });
    [[V.f0_med, '中央', C.acc], [V.f0_p80, '80%', C.text], [V.f0_p20, '20%', C.text]].forEach(([v, s, col], i) => {
      if (!Number.isFinite(v)) return;
      if (i && Math.abs(y(v) - y(V.f0_med)) < 14) return;
      if (Math.abs(y(v) - lastLabel) < 14) return;
      text(g, s, f.x1, y(v) - 3, col, 'right'); lastLabel = y(v);
    });
    g.strokeStyle = C.warm; g.lineWidth = 2; g.beginPath();
    let up = true;
    for (let n = 0; n < R.trk.n; n++) {
      const v = R.trk.f0[n];
      if (!(v > 0)) { up = true; continue; }
      const x = f.x0 + frameTime(R.trk, n) / R.dur * f.w;
      up ? g.moveTo(x, y(v)) : g.lineTo(x, y(v)); up = false;
    }
    g.stroke(); g.lineWidth = 1;
    timeAxis(g, f, R); playhead(g, f, R, t);
    const n = frameAt(R, t), v = R.trk.f0[n];
    text(g, v > 0 ? `${t.toFixed(2)}s  ${Math.round(v)} Hz` : `${t.toFixed(2)}s  声なし`, f.x0 + 6, f.y0 + 13, C.ink);
  },
  track(g, w, h, R, t, p) {
    const f = frame(w, h), a = R.per[p.id] || R.hnr, [lo, hi] = p.axis, y = v => f.y1 - (v - lo) / (hi - lo) * f.h;
    yAxis(g, f, [lo, (lo + hi) / 2, hi], y);
    const med = median(a);
    if (Number.isFinite(med)) { g.strokeStyle = C.acc; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(f.x0, y(med)); g.lineTo(f.x1, y(med)); g.stroke(); g.setLineDash([]); text(g, '中央値', f.x1, y(med) - 3, C.acc, 'right'); }
    g.fillStyle = C.warm;
    for (let n = 0; n < R.trk.n; n++) if (Number.isFinite(a[n])) g.fillRect(f.x0 + frameTime(R.trk, n) / R.dur * f.w - 1, Math.max(f.y0, Math.min(f.y1, y(a[n]))) - 1, 2, 2);
    timeAxis(g, f, R); playhead(g, f, R, t);
  },
  vowel(g, w, h, R, t) {
    const f = frame(w, h), X = v => f.x1 - (v - 500) / (3000 - 500) * f.w, Y = v => f.y0 + (v - 200) / (1100 - 200) * f.h;
    g.strokeStyle = C.line;
    for (const v of [1000, 1500, 2000, 2500]) { g.beginPath(); g.moveTo(X(v), f.y0); g.lineTo(X(v), f.y1); g.stroke(); text(g, v, X(v), f.y1 + 16, C.text, 'center'); }
    yAxis(g, f, [400, 600, 800, 1000], Y);
    g.fillStyle = 'rgba(127,214,194,.32)';
    for (let n = 0; n < R.trk.n; n += 2) { const a = R.fm.F[0][n], b = R.fm.F[1][n]; if (Number.isFinite(a) && Number.isFinite(b)) { g.beginPath(); g.arc(X(b), Y(a), 2.2, 0, 7); g.fill(); } }
    const n = nearestVoiced(R, t);
    if (n >= 0 && Number.isFinite(R.fm.F[0][n]) && Number.isFinite(R.fm.F[1][n])) { g.strokeStyle = C.warm; g.lineWidth = 2; g.beginPath(); g.arc(X(R.fm.F[1][n]), Y(R.fm.F[0][n]), 7, 0, 7); g.stroke(); g.lineWidth = 1; }
    text(g, '← F2 大（舌が前）', f.x0 + 4, f.y0 + 12, C.text);
    text(g, 'F1（下ほど口が広い）', f.x1, f.y1 - 6, C.text, 'right');
  },
  wave(g, w, h, R, t, p) {
    if (!R.pert) return message(g, w, h, '「あー」をのばすと測れます');
    const f = frame(w, h), n = nearestVoiced(R, t), T = 1 / (R.trk.f0[n] || 150), span = 5 * T, t0 = Math.max(0, Math.min(R.dur - span, t - span / 2));
    const top = f.y0, wh = f.h * 0.56, mid = top + wh / 2;
    let pk = 1e-6; const a = Math.floor(t0 * R.fs), b = Math.ceil((t0 + span) * R.fs);
    for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(R.x[i] || 0));
    g.strokeStyle = C.ink; g.beginPath();
    for (let i = a; i < b; i++) { const x = f.x0 + (i / R.fs - t0) / span * f.w, y = mid - (R.x[i] || 0) / pk * wh * 0.46; i === a ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = C.warm;
    for (const run of R.pulses) for (let i = 0; i < run.t.length; i++) {
      const m = run.t[i]; if (m < t0 || m > t0 + span) continue;
      const x = f.x0 + (m - t0) / span * f.w;
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + wh); g.stroke();
      const next = run.t[i + 1];
      if (next && next < t0 + span) text(g, ((next - m) * 1000).toFixed(2), x + (next - m) / span * f.w / 2, top + 12, C.warm, 'center');
    }
    text(g, 'ms（1周の長さ）', f.x0, top + wh + 12, C.text);
    // 下: 周期または振幅の列
    const isA = p.lens === 'wave-a', s = isA ? R.pert.A : R.pert.T, y0 = top + wh + 18, y1 = f.y1, M = s.reduce((x, y) => x + y, 0) / s.length;
    const range = 3 * Math.max(...s.map(v => Math.abs(v - M))) || 1, Y = v => (y0 + y1) / 2 - (v - M) / range * (y1 - y0) * 1.4;
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(f.x0, (y0 + y1) / 2); g.lineTo(f.x1, (y0 + y1) / 2); g.stroke();
    g.strokeStyle = C.acc; g.beginPath();
    s.forEach((v, i) => { const x = f.x0 + i / (s.length - 1) * f.w; i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); });
    g.stroke();
    text(g, isA ? '1周ごとの山の高さ（平均を中心に）' : '1周ごとの長さ（平均を中心に）', f.x1, f.y1 + 16, C.text, 'right');
  },
  harm(g, w, h, R, t, p) {
    const f = frame(w, h), n = nearestVoiced(R, t);
    if (n < 0) return message(g, w, h, '声のある所がありません');
    const c = frameTime(R.trk, n) * R.fs, Fs = [0, 1, 2, 3].map(i => R.fm.F[i][n]), Bs = [0, 1, 2].map(i => R.fm.B[i][n]);
    const q = harmonicsAt(R.x, R.fs, c, R.trk.f0[n], Fs, Bs), maxHz = p.id === 'h1h2' ? 1200 : 4500, top = Math.round(maxHz / q.binHz);
    let mx = -Infinity; for (let k = 1; k < top; k++) mx = Math.max(mx, db(q.spec[k]));
    const X = v => f.x0 + v / maxHz * f.w, Y = v => f.y0 + (mx - v) / 70 * f.h;
    yAxis(g, f, [mx, mx - 35, mx - 70], Y, v => Math.round(v - mx));
    for (let v = 1000; v < maxHz; v += 1000) text(g, v / 1000 + 'k', X(v), f.y1 + 16, C.text, 'center');
    g.strokeStyle = C.ink; g.beginPath();
    for (let k = 1; k < top; k++) { const x = X(k * q.binHz), y = Y(db(q.spec[k])); k === 1 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    const mark = (a, s, col) => { if (!a) return; g.fillStyle = col; g.beginPath(); g.arc(X(a.f), Y(a.dB), 4, 0, 7); g.fill(); text(g, s, X(a.f) + 6, Y(a.dB) - 5, col); };
    mark(q.H1, 'H1', C.warm); mark(q.H2, 'H2', C.acc); if (p.id !== 'h1h2') mark(q.A3, 'A3', C.blue);
    const v = p.id === 'h1h2' ? q.h1h2c : q.h1a3c;
    text(g, `${frameTime(R.trk, n).toFixed(2)}s  ${p.id === 'h1h2' ? 'H1−H2' : 'H1−A3'}（補正前 ${(q.H1.dB - (p.id === 'h1h2' ? q.H2.dB : q.A3 ? q.A3.dB : NaN)).toFixed(1)}） 補正後 ${Number.isFinite(v) ? v.toFixed(1) : '—'} dB`, f.x1, f.y0 + 12, C.ink, 'right');
  },
  band(g, w, h, R, t, p) {
    const f = frame(w, h), a = R.ltas, hz = 16000 / 512, maxHz = 5500, top = Math.round(maxHz / hz);
    let mx = -Infinity; for (let k = 1; k < top; k++) mx = Math.max(mx, a[k]);
    const X = v => f.x0 + v / maxHz * f.w, Y = v => f.y0 + (mx - v) / 70 * f.h;
    const shade = (x0, x1, col, s) => { g.fillStyle = col; g.fillRect(X(x0), f.y0, X(x1) - X(x0), f.h); text(g, s, (X(x0) + X(x1)) / 2, f.y0 + 14, C.ink, 'center'); };
    if (p.lens === 'band-alpha') { shade(50, 1000, 'rgba(255,201,90,.2)', '50〜1000'); shade(1000, 5000, 'rgba(127,214,194,.14)', '1〜5k'); }
    if (p.lens === 'band-hamm') { shade(0, 2000, 'rgba(255,201,90,.2)', '0〜2k'); shade(2000, 5000, 'rgba(127,214,194,.14)', '2〜5k'); }
    if (p.lens === 'band-slope0') shade(0, 500, 'rgba(255,201,90,.2)', '0〜500');
    if (p.lens === 'band-slope1') shade(500, 1500, 'rgba(255,201,90,.2)', '500〜1500');
    yAxis(g, f, [mx, mx - 35, mx - 70], Y, v => Math.round(v - mx));
    for (let v = 1000; v <= 5000; v += 1000) text(g, v / 1000 + 'k', X(v), f.y1 + 16, C.text, 'center');
    g.strokeStyle = C.ink; g.beginPath();
    for (let k = 1; k < top; k++) { const x = X(k * hz), y = Y(a[k]); k === 1 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    if (p.lens === 'band-cent' && Number.isFinite(R.value.centroid)) { const x = X(R.value.centroid); g.strokeStyle = C.warm; g.beginPath(); g.moveTo(x, f.y0); g.lineTo(x, f.y1); g.stroke(); text(g, '重心', x + 5, f.y0 + 14, C.warm); }
    if (p.lens === 'band-hamm') for (const [a0, b0, col] of [[0, 2000, C.warm], [2000, 5000, C.acc]]) { let m = -Infinity, mk = 1; for (let k = 1; k < top; k++) { const fr = k * hz; if (fr >= a0 && fr < b0 && a[k] > m) { m = a[k]; mk = k; } } g.fillStyle = col; g.beginPath(); g.arc(X(mk * hz), Y(m), 4, 0, 7); g.fill(); }
    text(g, '声のある時間を平均したスペクトル', f.x1, f.y0 + 32, C.text, 'right');
  },
  cep(g, w, h, R, t) {
    const f = frame(w, h), n = nearestVoiced(R, t);
    if (n < 0) return message(g, w, h, '声のある所がありません');
    const lin = averageCep(i => (R.trk.f0[i] > 0 ? cepstrumAt(R.x, R.fs, frameTime(R.trk, i) * R.fs) : null), n), r = cppOf(lin, R.fs, R.trk.floor, R.trk.ceil);
    const d = smoothCep(lin), maxQ = Math.round(0.02 * R.fs), toMs = q => q / R.fs * 1000;
    let lo = Infinity, hi = -Infinity;
    for (let q = r.q0; q <= maxQ; q++) { lo = Math.min(lo, d[q]); hi = Math.max(hi, d[q]); }
    const X = q => f.x0 + (toMs(q) - 1) / 19 * f.w, Y = v => f.y1 - (v - lo) / (hi - lo + 1e-6) * f.h;
    for (const ms of [5, 10, 15, 20]) text(g, ms + 'ms', X(ms / 1000 * R.fs), f.y1 + 16, C.text, 'center');
    g.strokeStyle = C.ink; g.beginPath();
    for (let q = r.q0; q <= maxQ; q++) q === r.q0 ? g.moveTo(X(q), Y(d[q])) : g.lineTo(X(q), Y(d[q]));
    g.stroke();
    g.strokeStyle = C.acc; g.beginPath(); g.moveTo(X(r.q0), Y(r.slope * r.q0 + r.ic)); g.lineTo(X(maxQ), Y(r.slope * maxQ + r.ic)); g.stroke();
    if (r.q <= maxQ) {
      const y0 = Y(r.slope * r.q + r.ic), y1 = Y(d[r.q]);
      g.strokeStyle = C.warm; g.lineWidth = 2; g.beginPath(); g.moveTo(X(r.q), y0); g.lineTo(X(r.q), y1); g.stroke(); g.lineWidth = 1;
      text(g, `この瞬間の CPP ${r.cpp.toFixed(1)} dB`, Math.min(X(r.q) + 8, f.x1 - 140), y1 + 12, C.warm);
    }
    text(g, '緑＝回帰直線 ／ 黄＝山の高さ', f.x1, f.y1 - 6, C.text, 'right');
  },
  tube(g, w, h, R) {
    const f = frame(w, h), L = R.value.vtl, dF = R.value.dF;
    if (!Number.isFinite(L)) return message(g, w, h, 'フォルマントが足りず測れませんでした');
    const X = v => f.x0 + (v - 0) / 24 * f.w, y = f.y0 + f.h * 0.28, th = f.h * 0.2;
    g.strokeStyle = C.acc; g.lineWidth = 2;
    g.strokeRect(X(0), y, X(L) - X(0), th); g.lineWidth = 1;
    text(g, '声帯', X(0), y - 6, C.text); text(g, '唇', X(L), y - 6, C.text, 'center');
    text(g, `${L.toFixed(1)} cm（一様な管とみなした長さ）`, X(0), y + th + 18, C.ink);
    for (let c = 0; c <= 24; c += 4) text(g, c + 'cm', X(c), f.y1 + 16, C.text, 'center');
    const y2 = f.y0 + f.h * 0.82;
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(f.x0, y2); g.lineTo(f.x1, y2); g.stroke();
    const col = [C.warm, C.acc, C.blue, '#d6b3ff'], Xf = v => f.x0 + v / 5000 * f.w;
    ['F1', 'F2', 'F3', 'F4'].forEach((k, i) => { const v = R.value[k]; if (Number.isFinite(v)) { g.fillStyle = col[i]; g.fillRect(Xf(v) - 1, y2 - 13, 2, 26); text(g, k, Xf(v), y2 - 17, col[i], 'center'); } });
    text(g, `間隔 ${Math.round(dF)} Hz`, f.x1, y2 + 22, C.text, 'right');
  },
  env(g, w, h, R, t) {
    const f = frame(w, h), a = R.tempo.smooth, top = Math.max(...a), Y = v => f.y0 + (top - v) / 45 * f.h, X = n => f.x0 + frameTime(R.trk, n) / R.dur * f.w;
    yAxis(g, f, [top, top - 20, top - 40], Y, v => Math.round(v - top));
    g.strokeStyle = C.dim; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(f.x0, Y(R.tempo.threshold)); g.lineTo(f.x1, Y(R.tempo.threshold)); g.stroke(); g.setLineDash([]);
    text(g, 'しきい', f.x1, Y(R.tempo.threshold) - 3, C.text, 'right');
    g.strokeStyle = C.ink; g.beginPath();
    for (let n = 0; n < a.length; n++) n ? g.lineTo(X(n), Math.min(f.y1, Y(a[n]))) : g.moveTo(X(n), Math.min(f.y1, Y(a[n])));
    g.stroke();
    g.fillStyle = C.warm;
    for (const n of R.tempo.nuclei) { g.beginPath(); g.arc(X(n), Y(a[n]), 4, 0, 7); g.fill(); }
    text(g, `音節の中心 ${R.tempo.nuclei.length} 個`, f.x0 + 6, f.y0 + 13, C.warm);
    timeAxis(g, f, R); playhead(g, f, R, t);
  },
};
LENS['wave-t'] = LENS.wave; LENS['wave-a'] = LENS.wave;
for (const k of ['band-alpha', 'band-hamm', 'band-slope0', 'band-slope1', 'band-cent']) LENS[k] = LENS.band;

// 録音中の図（流れるスペクトログラム）
export function drawLive(g, w, h, img, sec, max) {
  g.fillStyle = '#0c141c'; g.fillRect(0, 0, w, h);
  const f = frame(w, h);
  g.imageSmoothingEnabled = true;
  g.drawImage(img, f.x0, f.y0, f.w, f.h);
  text(g, `録音中 ${sec.toFixed(1)} / ${max} 秒`, f.x0 + 6, f.y0 + 14, C.warm);
}

export function clear(g, w, h) { g.fillStyle = '#0c141c'; g.fillRect(0, 0, w, h); }
