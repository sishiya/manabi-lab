// 目のなかの光の道 — 目の模型と光線の計算（描画とは別。長さは mm）
// 座標: z は角膜の頂点を 0 として目の奥へ、y は上。断面（上下の1平面）だけで光線を追う。
// 目の模型: Navarro, Santamaría & Bescós 1985（JOSA A 2:1273）。A は調節の量（D）。
'use strict';

const OPT = {
  nAir: 1.0, nCornea: 1.376, nAqueous: 1.3374, nVitreous: 1.336,
  corneaT: 0.55,          // 角膜の厚み
  stopBeforeLens: 0.6,    // 虹彩（ひとみ）は水晶体の前面の 0.6 mm 手前（MathWorks の Navarro 模型の例と同じ置き方）
  retinaR: 12,            // 網膜は半径 12 mm の球で近似（実際はやや平たいだ円体。Atchison ほか 2005）
  glassesZ: -12,          // メガネは角膜の 12 mm 手前（ふつうのかけ方の目安）
  L0: 24.0,               // ふつうの目の長さ（角膜〜網膜）。起動時に「遠くにピントが合う長さ」へ計算し直す
};

// Navarro 1985 の調節の式（表4）。非球面の度合い k は調節で変えない（簡単にしたところ）
function lensParams(A) {
  const l = Math.log(A + 1);
  return {
    acd: 3.05 - 0.05 * l,                 // 角膜のうら〜水晶体の前面（前房）
    R3: 10.2 - 1.75 * l, k3: -3.1316,     // 水晶体の前面
    R4: -6.0 + 0.2294 * l, k4: -1.0,      // 水晶体のうしろの面
    t: 4.0 + 0.1 * l,                     // 水晶体の厚み
    n: 1.42 + 9e-5 * (10 * A + A * A),    // 水晶体の屈折率（一様とみなす）
  };
}

// 目をつくる: A＝調節（D）、dL＝目の長さのちがい（mm、＋で長い＝近視）、stopR＝ひとみ（虹彩のあな）の半径、
// cyl＝この断面で角膜の前の面が強い分（D）。乱視は 縦の断面と横の断面で cyl を変えて2回計算する（トーリック面の主経線の断面の光線は、面の対称性でその平面に留まる）
function buildEye(A, dL, stopR, cyl = 0) {
  const p = lensParams(A);
  const z2 = OPT.corneaT, z3 = z2 + p.acd, z4 = z3 + p.t;
  const surfs = [
    { name: 'cornea1', z: 0, c: 1 / 7.72 + cyl / ((OPT.nCornea - OPT.nAir) * 1000), k: -0.26, n1: OPT.nAir, n2: OPT.nCornea, semi: 6 },
    { name: 'cornea2', z: z2, c: 1 / 6.50, k: 0, n1: OPT.nCornea, n2: OPT.nAqueous, semi: 6 },
    { name: 'lens1', z: z3, c: 1 / p.R3, k: p.k3, n1: OPT.nAqueous, n2: p.n, semi: 5 },
    { name: 'lens2', z: z4, c: 1 / p.R4, k: p.k4, n1: p.n, n2: OPT.nVitreous, semi: 5 },
  ];
  const L = OPT.L0 + dL;
  return { A, dL, cyl, lens: p, surfs, stopZ: z3 - OPT.stopBeforeLens, stopR, L, retinaC: L - OPT.retinaR };
}

// 円すい曲線の面のたわみ（sag）と傾き
function sag(s, y) {
  const q = 1 - (1 + s.k) * s.c * s.c * y * y;
  if (q < 0) return NaN;
  return s.c * y * y / (1 + Math.sqrt(q));
}
function dsag(s, y) {
  const q = 1 - (1 + s.k) * s.c * s.c * y * y;
  if (q <= 0) return NaN;
  return s.c * y / Math.sqrt(q);
}

// 光線 r = {z, y, dz, dy}（向きは長さ1）。面との交点をニュートン法で求めて屈折させる
function hitSurface(r, s) {
  let t = (s.z - r.z) / r.dz;
  for (let i = 0; i < 12; i++) {
    const y = r.y + t * r.dy, zs = s.z + sag(s, y);
    if (!isFinite(zs)) return null;
    const f = r.z + t * r.dz - zs, fp = r.dz - dsag(s, y) * r.dy;
    const dt = f / fp; t -= dt;
    if (Math.abs(dt) < 1e-9) break;
  }
  const y = r.y + t * r.dy;
  if (Math.abs(y) > s.semi || !isFinite(t)) return null;
  return { t, z: r.z + t * r.dz, y };
}
function refract(r, s, P) {
  let nz = 1, ny = -dsag(s, P.y); const m = Math.hypot(nz, ny); nz /= m; ny /= m;
  const eta = s.n1 / s.n2, cosi = r.dz * nz + r.dy * ny;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;   // 全反射（目の中ではまず起きない）
  const a = Math.sqrt(k) - eta * cosi;
  let dz = eta * r.dz + a * nz, dy = eta * r.dy + a * ny; const d = Math.hypot(dz, dy);
  return { z: P.z, y: P.y, dz: dz / d, dy: dy / d };
}
function toZ(r, z) { const t = (z - r.z) / r.dz; return { z, y: r.y + t * r.dy }; }
// 網膜（球）との交点。奥の側の解
function hitRetina(r, eye) {
  const oz = r.z - eye.retinaC, oy = r.y, R = OPT.retinaR;
  const b = oz * r.dz + oy * r.dy, c = oz * oz + oy * oy - R * R, D = b * b - c;
  if (D < 0) return null;
  const t = -b + Math.sqrt(D);
  return { z: r.z + t * r.dz, y: r.y + t * r.dy };
}
// メガネ（うすいレンズ）: 角膜の手前の面で、高さに比例して向きを曲げる。P は D
function thinLens(r, z, P) {
  const p = toZ(r, z), s = r.dy / r.dz - p.y * P / 1000;
  const d = Math.hypot(1, s);
  return { z, y: p.y, dz: 1 / d, dy: s / d };
}

// 物の点から光線を出す。obj = {d: 角膜からの距離 mm（Infinity 可）, ang: 見る角度（ラジアン、上が＋）}
// h は角膜の頂点の面（z=0）でのねらいの高さ。glassesP: メガネの度（D、null でなし）
function launch(obj, h) {
  if (!isFinite(obj.d)) {
    const dy = -Math.sin(obj.ang), dz = Math.cos(obj.ang), z0 = -40;
    return { z: z0, y: h - dy / dz * (0 - z0), dz, dy };
  }
  const yo = obj.d * Math.tan(obj.ang), zo = -obj.d;
  let dz = 0 - zo, dy = h - yo; const m = Math.hypot(dz, dy);
  return { z: zo, y: yo, dz: dz / m, dy: dy / m };
}

// 1本の光線を追う。返り値: { pts:[{z,y}...], blocked:'iris'|'miss'|null, stopY, retina:{z,y} }
function traceRay(eye, obj, h, glassesP) {
  let r = launch(obj, h);
  const pts = [{ z: r.z, y: r.y }];
  if (glassesP != null) { r = thinLens(r, OPT.glassesZ, glassesP); pts.push({ z: r.z, y: r.y }); }
  let stopY = null;
  for (let i = 0; i < eye.surfs.length; i++) {
    const s = eye.surfs[i];
    if (i === 2) {   // 水晶体の前に虹彩
      const p = toZ(r, eye.stopZ); stopY = p.y;
      if (Math.abs(p.y) > eye.stopR) { pts.push(p); return { pts, blocked: 'iris', stopY }; }
    }
    const P = hitSurface(r, s);
    if (!P) return { pts, blocked: 'miss', stopY };
    pts.push({ z: P.z, y: P.y });
    r = refract(r, s, P);
    if (!r) return { pts, blocked: 'miss', stopY };
  }
  const R = hitRetina(r, eye);
  if (!R) return { pts, blocked: 'miss', stopY };
  pts.push(R);
  return { pts, blocked: null, stopY, retina: R, last: r };
}

// 虹彩の面での高さ（ひとみの中で光線がどこを通るか）
function stopHeight(eye, obj, h, glassesP) {
  let r = launch(obj, h);
  if (glassesP != null) r = thinLens(r, OPT.glassesZ, glassesP);
  for (let i = 0; i < 2; i++) {
    const P = hitSurface(r, eye.surfs[i]); if (!P) return NaN;
    r = refract(r, eye.surfs[i], P); if (!r) return NaN;
  }
  return toZ(r, eye.stopZ).y;
}
// 虹彩の面で高さ target を通る h を二分法で探す（h に対して単調にふえる）
function solveH(eye, obj, target, glassesP) {
  let lo = -5.8, hi = 5.8;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2, v = stopHeight(eye, obj, m, glassesP);
    if (!isFinite(v)) { if (Math.abs(lo) > Math.abs(hi)) lo = m; else hi = m; continue; }
    if (v < target) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// ひとみを通る光の束（扇）を追う。n 本。網膜のぼけ（二乗平均の半径から円板の直径に直した値）も返す
function traceBundle(eye, obj, glassesP, n) {
  const hLo = solveH(eye, obj, -eye.stopR * 0.999, glassesP), hHi = solveH(eye, obj, eye.stopR * 0.999, glassesP);
  const hC = solveH(eye, obj, 0, glassesP);
  const chief = traceRay(eye, obj, hC, glassesP);
  const rays = [];
  let sw = 0, sy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const h = hLo + (hHi - hLo) * i / (n - 1);
    const tr = traceRay(eye, obj, h, glassesP);
    rays.push(tr);
    if (tr.retina && chief.retina) {
      // 断面の扇を、ひとみの面積の重み（|高さ|）で数えると、円いひとみ全体の広がりに近くなる
      const w = Math.abs(tr.stopY) + 1e-6, y = tr.retina.y - chief.retina.y;
      sw += w; sy += w * y; syy += w * y * y;
    }
  }
  const rms = sw > 0 ? Math.sqrt(Math.max(0, syy / sw)) : NaN;
  // 円板にむらなく広がるとき、二乗平均の半径＝半径/√2 → 円板の直径 = 2√2 × rms
  return { rays, chief, blurD: 2 * Math.SQRT2 * rms, rms, hLo, hHi };
}

// 近軸（細い光線）で、像のできる位置 z（光軸と交わる所）を求める。物は obj、メガネ P
function paraxialFocus(eye, obj, glassesP) {
  let r = launch({ d: obj.d, ang: 0 }, 0.02);
  if (glassesP != null) r = thinLens(r, OPT.glassesZ, glassesP);
  for (const s of eye.surfs) {
    const P = hitSurface(r, s); if (!P) return NaN;
    r = refract(r, s, P); if (!r) return NaN;
  }
  return r.z - r.y * r.dz / r.dy;
}

// 1つの山（谷）の関数の最小を黄金分割で探す
function goldenMin(f, lo, hi, it = 32) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi, c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < it; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}
// 網膜のぼけ（二乗平均の半径 mm）。ピント合わせの目安
function blurRms(A, dL, obj, glassesP, stopR, cyl = 0) {
  const v = traceBundle(buildEye(A, dL, stopR, cyl), { d: obj.d, ang: 0 }, glassesP, 21).rms;
  return isFinite(v) ? v : 1e3;
}

// 調節の量 A を決める: 網膜のぼけがいちばん小さくなるように（0〜Amax の中で）。
// 像の位置（近軸）ではなくぼけの小ささで決めるのは、本物の目も「いちばんくっきり」をねらうため（球面収差があるので少しちがう）
// 乱視のとき（縦の cyl と横の cylH、縦横で別のメガネ glassesP・Ph）は、縦と横のぼけの二乗の平均がいちばん小さい所（最小錯乱円）をねらう
function solveAccommodation(dL, obj, glassesP, Amax, stopR, cyl = 0, Ph = glassesP, cylH = 0) {
  if (Amax <= 0) return 0;
  const two = cyl !== cylH || Ph !== glassesP;
  const f = two ? A => Math.sqrt((blurRms(A, dL, obj, glassesP, stopR, cyl) ** 2 + blurRms(A, dL, obj, Ph, stopR, cylH) ** 2) / 2)
    : A => blurRms(A, dL, obj, glassesP, stopR);
  const A = goldenMin(f, 0, Amax, 26);
  return f(0) <= f(A) ? 0 : (f(Amax) <= f(A) ? Amax : A);
}

// 目の屈折（D）: ゆるめた目でいちばんくっきり見える物のバージェンス（角膜の位置）。0＝正視、－＝近視、＋＝遠視
// 求め方: 角膜の位置にうすいレンズを置いたとして、遠くがいちばんくっきりする度を探す（その符号を返す）
function refractiveError(dL, stopR, cyl = 0) {
  const eye = buildEye(0, dL, stopR, cyl), save = OPT.glassesZ;
  OPT.glassesZ = -1e-3;
  const P = goldenMin(P => {
    const v = traceBundle(eye, { d: Infinity, ang: 0 }, P, 21).rms; return isFinite(v) ? v : 1e3;
  }, -20, 20, 40);
  OPT.glassesZ = save;
  return P;   // 角膜の位置で必要なレンズの度＝目の屈折（近視なら－）
}

// メガネの度を、ぼけがいちばん小さくなるように探して 0.25 D きざみにまるめる（実際のメガネと同じきざみ）
function bestGlasses(A, dL, obj, stopR, cyl = 0) {
  const P = goldenMin(P => blurRms(A, dL, obj, P, stopR, cyl), -20, 20, 40);
  return Math.round(P * 4) / 4 || 0;
}
// 遠く用: ゆるめた目で遠くがいちばんくっきり
// 乱視のときは縦と横で別々に決める（円柱レンズ: 縦と横で度がちがうレンズ）
function farGlasses(dL, stopR, cyl = 0) { return bestGlasses(0, dL, { d: Infinity }, stopR, cyl); }
// 近く用（老眼鏡）: 40 cm を、調節の半分の力でくっきり見られる度（このアプリの決め方）。遠く用より弱くはしない
function nearGlasses(dL, Amax, stopR, cyl = 0) {
  const far = farGlasses(dL, stopR, cyl), near = bestGlasses(Amax / 2, dL, { d: 400 }, stopR, cyl);
  return Math.max(far, near);
}

// 平均の調節力（Hofstetter 1950）
function maxAccommodation(age) { return Math.max(0, 18.5 - 0.30 * age); }
// 明るさ（cd/m²）からひとみの直径（mm）: Crawford 1936 の式（Watson & Yellott 2012 の書き方）
function pupilDiameter(Lcd) { return 5 - 2.2 * Math.tanh(0.6115 + 0.447 * Math.log10(Lcd)); }
// 見かけのひとみ（入射ひとみ）の直径から、虹彩のあなの半径へ: 平行光を その高さで入れ、虹彩の面での高さを測る
function stopRadiusFor(entranceD) {
  return Math.abs(stopHeight(buildEye(0, 0, 99), { d: Infinity, ang: 0 }, entranceD / 2, null));
}
// 網膜の上の長さ（mm）と見る角度（ラジアン）の比: 遠くからの細い光を少しかたむけて測る
function retinaScale(eye) {
  const u = 0.01, a = solveH(eye, { d: Infinity, ang: u }, 0, null);
  const tr = traceRay(eye, { d: Infinity, ang: u }, a, null);
  const b = traceRay(eye, { d: Infinity, ang: 0 }, 0, null);
  return tr.retina && b.retina ? Math.abs(tr.retina.y - b.retina.y) / u : 17;
}

// 起動時: ふつうの目（調節なし）が遠くにいちばんくっきり合う長さを L0 にする（ひとみ 3 mm で）。
// 近軸の焦点は Navarro の値 24.00 mm と一致する。球面収差があるので、いちばんくっきりする所はそれより少し手前
(function calibrate() {
  const zf = paraxialFocus(buildEye(0, 0, 99), { d: Infinity, ang: 0 }, null);
  if (isFinite(zf)) OPT.L0 = zf;
  OPT.L0par = OPT.L0;
  const sr = stopRadiusFor(3), base = OPT.L0;
  const best = goldenMin(x => { OPT.L0 = x; const v = traceBundle(buildEye(0, 0, sr), { d: Infinity, ang: 0 }, null, 21).rms; return isFinite(v) ? v : 1e3; }, base - 0.4, base + 0.1, 30);
  OPT.L0 = best;
})();
