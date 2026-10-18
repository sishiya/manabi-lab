// 物理の確かめ（node tools/verify.js [all|plate|groove|speed|resp|trace|wear]）
// 板の式・溝の深さ（セントルイスのすず箔 0.05 mm）・速さと音の高さ・機械全体の特性・針の丸みのひずみ・すり減り
'use strict';
const { Phono } = require('../js/physics.js');
const { Source } = require('../js/sources.js');
const fs = 48000, which = process.argv[2] || 'all', on = k => which === 'all' || which === k;
const rpm = om => om * 60 / (2 * Math.PI), omOf = r => r * 2 * Math.PI / 60;

// 毎分 r 回転で sec 秒、src の音を録る（はじめに 0.3 秒回して速さを落ちつかせる）
function record(ph, src, dB, r, sec) {
  ph.setCrank(true, omOf(r)); ph.setMode('up'); run(ph, null, 0.3); ph.rewind(); ph.setMode('rec');
  const buf = new Float32Array(128); let n = Math.round(sec * fs);
  while (n > 0) { const m = Math.min(128, n); src.fill(buf, m, dB); ph.process(buf, null, m); n -= m; }
  ph.setMode('up'); run(ph, null, 0.1);
}
function run(ph, inp, sec) { const out = new Float32Array(Math.round(sec * fs)); for (let i = 0; i < out.length; i += 128) { const m = Math.min(128, out.length - i); ph.process(null, out.subarray(i, i + m), m); } return out; }
function play(ph, r, sec) { ph.setCrank(true, omOf(r)); ph.setMode('up'); ph.rewind(); ph.setMode('play'); const out = run(ph, null, sec); ph.setMode('up'); return out; }
function goertzel(x, f, a = 0, b = x.length) { const w = 2 * Math.PI * f / fs; let re = 0, im = 0; for (let i = a; i < b; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); } return 2 * Math.hypot(re, im) / (b - a); }
function rms(x, a = 0, b = x.length) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); }
const dB = p => (20 * Math.log10(p / 20e-6)).toFixed(1);
function grooveStats(ph, x0, x1) {   // 録った区間の溝: 平均の深さと、ふれの大きさ（実効値×√2）
  const a = Math.floor(x0 / ph.p.dx), b = Math.floor(x1 / ph.p.dx); let s = 0; for (let i = a; i < b; i++) s += ph.s[i]; const m = s / (b - a);
  let v = 0; for (let i = a; i < b; i++) v += (ph.s[i] - m) ** 2; return { mean: m, amp: Math.sqrt(v / (b - a)) * Math.SQRT2 };
}
function domFreq(x, a, b, f0, f1) { let best = 0, bf = 0; for (let f = f0; f <= f1; f += 2) { const g = goertzel(x, f, a, b); if (g > best) { best = g; bf = f; } } return bf; }

if (on('plate')) {
  const ph = new Phono(fs), pl = ph.plate;
  console.log('■ 振動板（ふちを留めた雲母の円板、半径 25 mm・厚み 0.1 mm）');
  const lit = [10.2158, 39.771, 89.104];
  pl.modes.forEach((m, i) => console.log(`  モード${i + 1}: λ²=${m.lam2.toFixed(3)}${lit[i] ? `（教科書 ${lit[i]}）` : ''}  ${m.f.toFixed(0)} Hz`));
  console.log(`  まん中を押すかたさ: モード5つの和 ${pl.kPoint.toFixed(0)} N/m、板の式 16πD/a² = ${pl.kPointExact.toFixed(0)} N/m（${((pl.kPoint / pl.kPointExact - 1) * 100).toFixed(1)}%）`);
  console.log(`  一様な圧力 1 Pa でのまん中の変位: モードの和 ${(pl.wPerPa * 1e9).toFixed(1)} nm、板の式 a⁴/64D = ${(pl.wPerPaExact * 1e9).toFixed(1)} nm`);
  console.log(`  箔: 曲げて流す力 ${(ph.foil.F0 * 1000).toFixed(1)} mN ＋ 深さ 1 µm ごとに ${(ph.foil.Kp * 1e-3).toFixed(2)} mN。0.05 mm を刻む力 ${(ph.foil.Fp(5e-5) * 1000).toFixed(0)} mN`);
}

if (on('groove')) {
  console.log('■ 溝の深さ（毎分60回転、3秒）。セントルイスのすず箔の測定: ふつうの溝の深さ 0.05 mm');
  for (const [kind, lv] of [['vowel', 110], ['vowel', 120], ['vowel', 130], ['tone', 120]]) {
    const ph = new Phono(fs), src = new Source(fs, kind); src.f0 = 500;
    record(ph, src, lv, 60, 3);
    const g = grooveStats(ph, 0.5 * ph.circ / 1, 2.5 * ph.circ);
    console.log(`  ${kind === 'tone' ? '500 Hz の音' : '声「あー」'} ${lv} dB: 溝の深さ ${(g.mean * 1e3).toFixed(4)} mm、ふれ ±${(g.amp * 1e6).toFixed(2)} µm`);
  }
  console.log('  ※ 深さの平均は「押しこみのねじ」を 0.05 mm になるように合わせたもの（答え合わせではない）。ふれの大きさは計算の結果。');
}

if (on('speed')) {
  console.log('■ 速さと音の高さ（400 Hz の音を毎分60回転で録る）');
  const ph = new Phono(fs), src = new Source(fs, 'tone'); src.f0 = 400; record(ph, src, 120, 60, 3);
  for (const r of [60, 120, 45]) {
    const out = play(ph, r, 1.6), a = Math.round(0.6 * fs), b = out.length;
    console.log(`  毎分${r}回転で再生: いちばん強い高さ ${domFreq(out, a, b, 100, 1200)} Hz（期待 ${400 * r / 60} Hz）  耳もと30 cm で ${dB(rms(out, a, b))} dB`);
  }
}

if (on('resp')) {
  console.log('■ 機械全体の特性（同じ大きさの音 120 dB を録って、同じ速さで再生。耳もと30 cm の大きさ）');
  const rows = [];
  for (const f of [100, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 4000, 6000, 8000]) {
    const ph = new Phono(fs), src = new Source(fs, 'tone'); src.f0 = f; record(ph, src, 120, 60, 1.5);
    const g = grooveStats(ph, 0.3 * ph.circ, 1.3 * ph.circ);
    const out = play(ph, 60, 1.6), a = Math.round(0.5 * fs), b = Math.round(1.5 * fs);
    rows.push([f, g.amp, goertzel(out, f, a, b) / Math.SQRT2]);
  }
  const ref = Math.max(...rows.map(r => r[2]));
  for (const [f, amp, p] of rows) console.log(`  ${String(f).padStart(5)} Hz: 溝のふれ ±${(amp * 1e6).toFixed(2).padStart(6)} µm  再生 ${dB(p).padStart(5)} dB（いちばん大きい所から ${(20 * Math.log10(p / ref)).toFixed(1).padStart(6)} dB）`);
}

if (on('trace')) {
  console.log('■ 針の丸み（半径 0.15 mm）とひずみ。SMPTE の縦の溝の論文の目安: 溝の曲がりの半径が針の半径の5倍より大きければ、ひずみは約1割以下');
  for (const [f, lv] of [[300, 125], [1000, 125], [2000, 125], [3000, 130], [4000, 130]]) {
    const ph = new Phono(fs), src = new Source(fs, 'tone'); src.f0 = f; record(ph, src, lv, 60, 1.5);
    const g = grooveStats(ph, 0.3 * ph.circ, 1.3 * ph.circ), v = ph.circ;   // 毎分60回転なら1秒で1周
    const k = (2 * Math.PI * f / v) ** 2 * g.amp, Rc = 1 / k;               // 正弦の溝のいちばん強い曲がり
    const out = play(ph, 60, 1.6), a = Math.round(0.5 * fs), b = Math.round(1.5 * fs);
    const h1 = goertzel(out, f, a, b); let hh = 0; for (let m = 2; m <= 5; m++) if (m * f < fs / 2) hh += goertzel(out, m * f, a, b) ** 2;
    console.log(`  ${f} Hz ${lv} dB: ふれ ±${(g.amp * 1e6).toFixed(2)} µm  曲がりの半径 ÷ 針の半径 = ${(Rc / ph.p.rTip).toFixed(1).padStart(6)}  ひずみ（2〜5倍音）${(Math.sqrt(hh) / h1 * 100).toFixed(1)}%`);
  }
  console.log('  ※ ひずみには、針の丸みのほかに、箔が「押せば凹むが戻らない」ことと振動板の共振の分も入る。');
}

if (on('wear')) {
  console.log('■ すり減り（声「あー」115 dB を録って、毎分60回転で5回再生）');
  const ph = new Phono(fs), src = new Source(fs, 'vowel'); record(ph, src, 115, 60, 3);
  let g = grooveStats(ph, 0.5 * ph.circ, 2.5 * ph.circ);
  console.log(`  録音のあと: 溝の深さ ${(g.mean * 1e3).toFixed(4)} mm  ふれ ±${(g.amp * 1e6).toFixed(2)} µm`);
  for (let k = 1; k <= 5; k++) {
    ph.wear = 0; let cont = 0, steps = 0;
    ph.setCrank(true, omOf(60)); ph.setMode('up'); ph.rewind(); ph.setMode('play');
    const out = new Float32Array(Math.round(3.1 * fs));
    for (let i = 0; i < out.length; i += 128) { ph.process(null, out.subarray(i, i + 128), Math.min(128, out.length - i)); if (i > 0.6 * fs) { steps++; if (ph.contact) cont++; } }
    ph.setMode('up');
    g = grooveStats(ph, 0.5 * ph.circ, 2.5 * ph.circ); const a = Math.round(0.6 * fs), b = Math.round(2.9 * fs);
    console.log(`  ${k}回目: 耳もと ${dB(rms(out, a, b))} dB  溝の深さ ${(g.mean * 1e3).toFixed(4)} mm  ふれ ±${(g.amp * 1e6).toFixed(2)} µm  つぶれた箔の断面積 ${(ph.wear * 1e6).toFixed(2)} mm²  針が溝にふれていた割合 ${(cont / steps * 100).toFixed(0)}%`);
  }
  console.log('  ※ 針は溝から何度も跳ねる（ふれていない時間がある）。跳ねて落ちる強い力で、溝の山がつぶれる。');
}
