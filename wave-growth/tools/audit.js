// 波が育つまで — 物理の計算の確かめ直し（node wave-growth/tools/audit.js）
// 各計算を「出どころの式・例題・表の値」とくらべる。合わない所は NG、出どころどうしでちがう所は「注」。
'use strict';
global.window = {};
const W = require('../js/growth.js'); window.WGgrowth = W;
require('../js/beach.js'); require('../js/swell.js');
const B = window.WGbeach, SW = window.WGswell, G = 9.81;
let ng = 0;
const row = (name, got, want, tol, src) => { const ok = Math.abs(got - want) <= tol * Math.max(Math.abs(want), 1e-9); if (!ok) ng++;
  console.log(`${ok ? 'OK ' : 'NG '} ${name}: ${(+got).toPrecision(4)}（くらべる値 ${(+want).toPrecision(4)}・許す差 ${(tol * 100).toFixed(0)}%）  ← ${src}`); };
const note = s => console.log('注  ' + s);

console.log('■ 1. 風が波を育てる（CEM EM 1110-2-1100 Part II-2）');
{ const r = W.fromFetch(15, 10e3); console.log(`   式どおり 15 m/s・10 km: ${r.Hm0.toFixed(2)} m・${r.Tp.toFixed(2)} s（例題は 1.0 m・2.7 s）`);
  const q = W.fromFetch(15 * 1.2, 10e3); row('例題 II-2-7 の高さ（16 km より短い吹送距離の風速 1.2 倍をかけて）', q.Hm0, 1.0, 0.1, 'CEM 例題 II-2-7（図は 1.2 倍の補正をふくむと考えられる）'); row('例題 II-2-7 の周期（同じ）', q.Tp, 2.7, 0.15, 'CEM 例題 II-2-7（約 2.7 s、図から読んだ値）'); }
note('このアプリの風は広い海の上の風なので、短い吹送距離の 1.2 倍の補正はかけない。');
{ const r = W.fromFetch(25, 20e3); row('例題 II-2-8 25 m/s・20 km の高さ', r.Hm0, 2.1, 0.1, 'CEM 例題 II-2-8（2.1 m）'); row('例題 II-2-8 の周期', r.Tp, 4.0, 0.1, 'CEM 例題 II-2-8（4.0 s）'); }
{ const us = W.ustar(15), chi = G * 10e3 / us / us, t38 = us / G * Math.pow(chi / 5.23e-3, 2 / 3) / 3600, t35 = 77.23 * Math.pow(10e3, 0.67) / (Math.pow(15, 0.34) * Math.pow(G, 0.33)) / 3600;
  note(`15 m/s・10 km が距離で決まるまでの時間: 式 II-2-38（この計算）${t38.toFixed(2)} 時間、式 II-2-35 ${t35.toFixed(2)} 時間（CEM の中の 2 つの式で 2 割ちがう）。例題の「約 1.25 時間」は、どの図から読んだかが本文からはわからない。`); }
{ const f = W.fullyDev(10), us = W.ustar(10); row('発達しきった海 gHm0/u*²', G * f.Hm0 / us / us, 211.5, 1e-6, 'CEM 式 II-2-37'); }
note('発達しきった海の高さは、CEM（10 m/s で 3.1 m）と Pierson–Moskowitz（0.21 U19.5²/g ≒ 2.4 m）で 3 割ほどちがう。この計算は CEM を使っている。');

console.log('\n■ 2. 波の分布（JONSWAP の形・向きの広がり）');
{ let s = 0; const df = 0.0005; for (let f = df / 2; f < 5; f += df) s += W.Sf(f, 2, 7) * df; row('分布の面積 = Hm0²/16', s, 0.25, 0.002, '定義'); }
{ let mx = 0, fm = 0; for (let f = 0.05; f < 1; f += 0.0005) { const v = W.Sf(f, 2, 7); if (v > mx) { mx = v; fm = f; } } row('分布の山の周波数 = 1/Tp', fm, 1 / 7, 0.01, '定義'); }
{ let a = 0; const n = 20000; for (let i = 0; i < n; i++) a += W.spread(-Math.PI + (i + .5) * 2 * Math.PI / n, 10) * 2 * Math.PI / n; row('向きの広がりの面積（s=10）', a, 1, 1e-6, '定義'); }

console.log('\n■ 3. 短い波（Elfouhaily ほか 1997）と海面の傾き（Cox & Munk 1954）');
for (const [U, h] of [[5, 24], [10, 30], [15, 50]]) { const r = W.fromDuration(U, h * 3600), SK = W.makeSpecK(r.Hm0, r.Tp, 0, 10, U); let v = 0; const n = 2500, k0 = 0.003, k1 = 2000;
  for (let i = 0; i < n; i++) { const k = k0 * Math.pow(k1 / k0, (i + .5) / n), dk = k * Math.log(k1 / k0) / n; let S = 0; for (let j = 0; j < 48; j++) { const a = j / 48 * 2 * Math.PI; S += SK(k * Math.cos(a), k * Math.sin(a)) * k * 2 * Math.PI / 48; } v += k * k * S * dk; }
  row(`風速 ${U} m/s の海面の傾きの分散`, v, 0.003 + 5.12e-3 * U, 0.4, 'Cox & Munk 1954 のきれいな海面（ばらつき ±0.004、高さ 12.5 m の風速）'); }

console.log('\n■ 4. 深い海・浅い海の波（線形の波）');
{ const w = 2 * Math.PI / 8, h = 10, k = B.kOf(w, h), L0 = G * 64 / (2 * Math.PI), Lf = L0 * Math.pow(Math.tanh(Math.pow(w * w * h / G, 0.75)), 2 / 3);
  row('周期 8 s・水深 10 m の波長', 2 * Math.PI / k, Lf, 0.02, 'Fenton & McKee (1990) の近似式（±1%）'); }
{ let mn = 9, hm = 0; const T = 10, w = 2 * Math.PI / T, L0 = G * T * T / (2 * Math.PI), cg0 = G / (2 * w);
  for (let r = 0.02; r < 0.5; r += 0.0005) { const h = r * L0, k = B.kOf(w, h), kh = k * h, c = w / k, cg = c / 2 * (1 + 2 * kh / Math.sinh(2 * kh)), Ks = Math.sqrt(cg0 / cg); if (Ks < mn) { mn = Ks; hm = r; } }
  row('浅くなるときの波の高さの比のいちばん小さい値', mn, 0.913, 0.01, '線形の波の教科書の値（h/L0 ≒ 0.15 で 0.913）'); row('そのときの h/L0', hm, 0.15, 0.1, '同じ'); }
note('砕ける高さ: 水深の 0.78 倍（McCowan 1894）と Miche (1944) の急さの限界の早いほう。本当は坂と波の形でかわる（Goda 2010）。');
{ const k = 0.1, a = 1, kh = 50, r = k * a * a / 4 * Math.cosh(kh) * (2 + Math.cosh(2 * kh)) / Math.pow(Math.sinh(kh), 3); row('ストークス 2 次の深い海の極限 = k a²/2', r, k * a * a / 2, 1e-6, 'ストークスの波（深い海）'); }

console.log('\n■ 4b. 水深のある海（TMA: Bouws ほか 1985・分散）');
{ const w = 2 * Math.PI / 8, h = 10, k = W.kOfDepth(w, h), L0 = G * 64 / (2 * Math.PI), Lf = L0 * Math.pow(Math.tanh(Math.pow(w * w * h / G, 0.75)), 2 / 3);
  row('kOfDepth: 周期 8 s・水深 10 m の波長', 2 * Math.PI / k, Lf, 0.02, 'Fenton & McKee (1990) の近似式'); }
row('φ のつながり（ω_h = 1）', W.tmaPhi(Math.sqrt(G / 4), 4), 0.5, 1e-6, 'Kitaigorodskii の係数（ω_h ≤ 1 で ω_h²/2）');
row('φ のつながり（ω_h = 2）', W.tmaPhi(2 * Math.sqrt(G / 4), 4), 1, 1e-6, '同じ（2 より上は 1 = 深い海）');
{ const r = W.fromDuration(10, 30 * 3600); row('水深 1000 m では深い海と同じ高さ', W.tmaRatio(r.Hm0, r.Tp, 1000), 1, 0.005, '定義'); }
{ const r = W.fromDuration(10, 30 * 3600), q = W.tmaRatio(r.Hm0, r.Tp, 3) * r.Hm0 / 3, ok = q > 0.3 && q <= 0.55; if (!ok) ng++;
  console.log(`${ok ? 'OK ' : 'NG '} 水深 3 m の高さ ÷ 水深（10 m/s・30 時間）: ${q.toFixed(2)}（0.3〜0.55 なら OK）  ← Nelson (1994): 平らな底の上で波の高さ ÷ 水深は 0.55 をこえない`); }
note('浅い海で波が「育つ速さ」そのものは、深い海の式（CEM）のまま。TMA で分布の形と上限だけを水深に合わせている。');

console.log('\n■ 5. 流される速さ（ストークスドリフト）・うねり');
{ const f0 = 0.1, a = 0.5, mono = 2 * Math.PI * f0 * Math.pow(2 * Math.PI * f0, 2) / G * a * a, kenyon = 16 * Math.PI ** 3 / G * f0 ** 3 * (a * a / 2);
  row('Kenyon の式が波 1 つの ω k a² になる', kenyon, mono, 1e-9, 'Kenyon 1969（波 1 つのときの形）'); }
row('周期 20 s の波の群れが 1 万 km 進む日数', 10000e3 / SW.cg(1 / 20) / 86400, 10000e3 / (G * 20 / (4 * Math.PI)) / 86400, 1e-9, '深い海の群速度 g/(4πf)');
note('うねりは、長い旅で少しずつ弱まる分を入れていない（Snodgrass ほか 1966 は「あまり弱まらない」と報告）。');

console.log('\n■ 6. 白波・光');
row('白波の割合 10 m/s', 3.84e-6 * Math.pow(10, 3.41), 0.0099, 0.02, 'Monahan & O\'Muircheartaigh 1980（約 1%）');
row('水の真上からの照り返し（フレネル）', Math.pow((1.333 - 1) / (1.333 + 1), 2), 0.020, 0.02, '屈折率 1.333');
row('スネルの窓の半分の角度（°）', Math.asin(1 / 1.333) * 180 / Math.PI, 48.6, 0.005, '屈折率 1.333');
row('赤い光（650 nm）の吸収 /m', 0.35, 0.34, 0.05, 'Pope & Fry 1997 の純水（0.34 /m）');
note('緑 0.07・青 0.03 /m は純水（0.057・0.009）に海の中の粒やとけたものの分を足した目安。きれいな外洋（Jerlov IA 型、490 nm で 0.035〜0.040 /m）と矛盾しない。');
note('コースティクス: 光は水面で (1 − 1/1.33)×傾き だけ曲がる（小さい傾き）。深さ D で集まる明るさ 1/|J|。ぼやけ・光芒の強さは目安。');

console.log(ng ? `\nNG ${ng} 件` : '\nすべて OK');
process.exit(ng ? 1 : 0);
