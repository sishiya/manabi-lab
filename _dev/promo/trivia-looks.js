// うんちくショートのルック見くらべ（2026-11-03）。trivia-plate.js のあとに読む。
// 入口ページ tiny-earth-look-<名前>.html が TL.run('tiny-earth-trivia1') を呼ぶと、元のページの台本をそのまま読み、
// 星（LOOK.planet）・人（PL.walker）・地や字幕や札（TK.*）・仕上げ（TK.finish）をそのルックに差しかえて録る。声は元のページのもの。
// 星の陸は本物の地形（ETOPO1 を1°ごと、NOAA、パブリックドメイン。tiny-earth/data/etopo1deg.bin）
'use strict';
const TL = {};
let LOOK = null;
const D2R = Math.PI / 180, TAU2 = Math.PI * 2;
TL.ELEV = null;
TL.elev = (lat, lon) => {
  const E = TL.ELEV, y = clamp(lat + 90, 0, 180), x = ((lon + 180) % 360 + 360) % 360, y0 = Math.min(179, Math.floor(y)), x0 = Math.floor(x) % 360, x1 = (x0 + 1) % 360, fy = y - y0, fx = x - Math.floor(x);
  return (E[y0 * 360 + x0] * (1 - fx) + E[y0 * 360 + x1] * fx) * (1 - fy) + (E[(y0 + 1) * 360 + x0] * (1 - fx) + E[(y0 + 1) * 360 + x1] * fx) * fy;
};
TL.LAT0 = 18 * D2R; TL.LON0 = 118 * D2R;   // 少し北から、アジアと太平洋を見る
TL.L = (() => { const v = [0.62, 0.42, 0.66], n = Math.hypot(...v); return v.map(x => x / n); })();   // 光は右上手前から
TL.proj = (lat, lon) => { const cl = Math.cos(lat), dl = lon - TL.LON0, s0 = Math.sin(TL.LAT0), c0 = Math.cos(TL.LAT0); return [cl * Math.sin(dl), c0 * Math.sin(lat) - s0 * cl * Math.cos(dl), s0 * Math.sin(lat) + c0 * cl * Math.cos(dl)]; };
TL.unproj = (nx, ny) => { const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), s0 = Math.sin(TL.LAT0), c0 = Math.cos(TL.LAT0); return [Math.asin(clamp(ny * c0 + nz * s0, -1, 1)) / D2R, (TL.LON0 + Math.atan2(nx, nz * c0 - ny * s0)) / D2R, nz]; };
TL.light = (nx, ny, nz) => Math.max(0, nx * TL.L[0] + ny * TL.L[1] + nz * TL.L[2]);
let tlSeed = 1; const tlRnd = () => (tlSeed = (tlSeed * 16807) % 2147483647) / 2147483647; const tlRs = a => (tlRnd() * 2 - 1) * a;

// ---- 星の絵は、半径 CR の大きさで1回だけ描いておき（画素ごとの計算が重いので）、毎コマは拡大・縮小して置く ----
TL.CR = 340;
TL._img = {};
TL.sphere = function (key, draw) {
  if (!TL._img[key]) {
    const n = Math.ceil(TL.CR * 2 * RES) + 4, c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'); x.translate(n / 2, n / 2); x.scale(RES, RES); draw(x, TL.CR); TL._img[key] = c;
  }
  return TL._img[key];
};
TL.place = (key, draw) => (g, cx, cy, r, f = 1) => {
  const img = TL.sphere(key, draw), k = r / TL.CR, s = img.width / RES * k;
  g.save(); g.globalAlpha *= f; g.drawImage(img, cx - s / 2, cy - s / 2, s, s); g.restore();
};
// 画素ごとの色（f(lat, lon, 光, nx, ny) → [r, g, b, a]）を、半径 R の円に描く（x は中心が原点）
TL.pixels = function (x, R, f) {
  const n = Math.ceil(R * 2 * RES), c = document.createElement('canvas'); c.width = c.height = n; const cx = c.getContext('2d'), im = cx.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const nx = (i + 0.5) / n * 2 - 1, ny = 1 - (j + 0.5) / n * 2; if (nx * nx + ny * ny > 1) continue;
    const [la, lo, nz] = TL.unproj(nx, ny), col = f(la, lo, TL.light(nx, ny, nz), nx, ny), k = (j * n + i) * 4;
    im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = col[3] ?? 255;
  }
  cx.putImageData(im, 0, 0); x.drawImage(c, -R, -R, R * 2, R * 2);
};
TL.mask = (R, test) => { const c = document.createElement('canvas'), n = Math.ceil(R * 2 * RES); c.width = c.height = n; const x = c.getContext('2d'); x.translate(n / 2, n / 2); x.scale(RES, RES); TL.pixels(x, R, (la, lo, s) => test(la, lo, s) ? [255, 255, 255, 255] : [0, 0, 0, 0]); return c; };
// layer(x) で描いたものを、mask の所だけ残して x に重ねる
TL.masked = function (x, R, mask, layer) {
  const n = mask.width, c = document.createElement('canvas'); c.width = c.height = n; const y = c.getContext('2d');
  y.translate(n / 2, n / 2); y.scale(RES, RES); layer(y); y.setTransform(1, 0, 0, 1, 0, 0); y.globalCompositeOperation = 'destination-in'; y.drawImage(mask, 0, 0);
  x.drawImage(c, -R, -R, R * 2, R * 2);
};
TL.lines = function (x, R, ang, gap, w, color, jit = 0) {   // 円の中に平行線
  x.save(); x.beginPath(); x.arc(0, 0, R, 0, TAU2); x.clip(); x.strokeStyle = color; x.lineWidth = w; x.lineCap = 'round';
  const ca = Math.cos(ang), sa = Math.sin(ang), L = R * 1.5;
  for (let d = -L; d <= L; d += gap) { x.beginPath(); x.moveTo(-ca * L - sa * d + tlRs(jit), -sa * L + ca * d + tlRs(jit)); x.quadraticCurveTo(-sa * d + tlRs(jit * 2), ca * d + tlRs(jit * 2), ca * L - sa * d + tlRs(jit), sa * L + ca * d + tlRs(jit)); x.stroke(); }
  x.restore();
};
TL.coast = function (x, R, w, color, jit = 0) {   // 高さ 0 m の線（1°の格子を四角ごとに）
  x.save(); x.strokeStyle = color; x.lineWidth = w; x.lineCap = 'round'; x.beginPath();
  const P = (la, lo) => { const [a, b, z] = TL.proj(la * D2R, lo * D2R); return z > 0 ? [a * R + tlRs(jit), -b * R + tlRs(jit)] : null; };
  for (let la = -89; la < 89; la++) for (let lo = -180; lo < 180; lo++) {
    const v = [TL.elev(la, lo), TL.elev(la, lo + 1), TL.elev(la + 1, lo + 1), TL.elev(la + 1, lo)], pts = [];
    [[0, 1, [la, lo], [la, lo + 1]], [1, 2, [la, lo + 1], [la + 1, lo + 1]], [2, 3, [la + 1, lo + 1], [la + 1, lo]], [3, 0, [la + 1, lo], [la, lo]]].forEach(([a, b, A, B]) => {
      if ((v[a] > 0) !== (v[b] > 0)) { const k = v[a] / (v[a] - v[b]); pts.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]); }
    });
    for (let q = 0; q + 1 < pts.length; q += 2) { const p1 = P(...pts[q]), p2 = P(...pts[q + 1]); if (p1 && p2) { x.moveTo(...p1); x.lineTo(...p2); } }
  }
  x.stroke(); x.restore();
};
TL.graticule = function (x, R, w, color, a) {
  x.save(); x.strokeStyle = color; x.globalAlpha *= a; x.lineWidth = w; x.beginPath();
  const run = pts => { let on = false; for (const [la, lo] of pts) { const [p, q, z] = TL.proj(la * D2R, lo * D2R); if (z > 0) { on ? x.lineTo(p * R, -q * R) : x.moveTo(p * R, -q * R); on = true; } else on = false; } };
  for (let la = -60; la <= 60; la += 30) run(Array.from({ length: 181 }, (_, i) => [la, -180 + i * 2]));
  for (let lo = -180; lo < 180; lo += 30) run(Array.from({ length: 91 }, (_, i) => [-90 + i * 2, lo]));
  x.stroke(); x.restore();
};
TL.ring = (x, R, w, color) => { x.save(); x.strokeStyle = color; x.lineWidth = w; x.beginPath(); x.arc(0, 0, R, 0, TAU2); x.stroke(); x.restore(); };
TL.sketchRing = (x, R, w, color, rough = 3) => { x.save(); x.strokeStyle = color; x.lineWidth = w; x.lineCap = 'round'; for (let p = 0; p < 2; p++) { const a0 = tlRnd() * TAU2, dr = tlRs(rough * 1.5); x.beginPath(); for (let i = 0; i <= 60; i++) { const a = a0 + i / 60 * (TAU2 + 0.25); x.lineTo(Math.cos(a) * (R + dr) + tlRs(rough * 0.4), Math.sin(a) * (R + dr) + tlRs(rough * 0.4)); } x.stroke(); } x.restore(); };
const land = (la, lo) => TL.elev(la, lo) > 0;

// ---- 人 ----
TL.silhouette = color => function (g, x, y, ang, ph, s) {   // 頭・胴・ひじ・ひざのある影絵（s は PL.walker と同じ大きさ）
  s *= 1.09; g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s); g.fillStyle = color(); g.strokeStyle = color(); g.lineCap = 'round'; g.lineJoin = 'round';
  const limb = (pts, w0, w1) => { for (let i = 0; i + 1 < pts.length; i++) { g.lineWidth = lerp(w0, w1, i / (pts.length - 1)); g.beginPath(); g.moveTo(...pts[i]); g.lineTo(...pts[i + 1]); g.stroke(); } };
  const sw = Math.sin(ph) * 0.55, foot = k => Math.sin(sw * k) * 46 - (sw * k < 0 ? 0 : 14);
  [-1, 1].forEach(k => { const a = sw * k; limb([[0, -92], [Math.sin(a) * 46, -48 + Math.abs(a) * 4], [foot(k), 0]], 24, 16); g.beginPath(); g.ellipse(foot(k) + 8, -2, 15, 7, 0, 0, TAU2); g.fill(); });
  g.beginPath(); g.moveTo(-17, -94); g.quadraticCurveTo(-20, -150, -14, -178); g.lineTo(14, -178); g.quadraticCurveTo(20, -150, 17, -94); g.closePath(); g.fill();
  [-1, 1].forEach(k => { const a = -sw * k; limb([[0, -170], [Math.sin(a) * 34, -132], [Math.sin(a) * 40 + 12, -98]], 15, 11); });
  g.lineWidth = 14; g.beginPath(); g.moveTo(0, -178); g.lineTo(0, -192); g.stroke(); g.beginPath(); g.ellipse(2, -212, 21, 24, 0.1, 0, TAU2); g.fill();
  g.restore();
};
TL.stick = function (g, x, y, ang, ph, s) {   // 前の白い棒の人（ページは前の大きさの 0.42 倍で呼ぶので戻す）
  g.save(); g.translate(x, y); g.rotate(ang); const z = s / 0.42; g.scale(z, z);
  g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; const sw = Math.sin(ph) * 0.5; g.beginPath();
  g.moveTo(0, -38); g.lineTo(Math.sin(sw) * 22, 0); g.moveTo(0, -38); g.lineTo(-Math.sin(sw) * 22, 0); g.moveTo(0, -38); g.lineTo(0, -80);
  g.moveTo(0, -70); g.lineTo(-Math.sin(sw) * 20, -48); g.moveTo(0, -70); g.lineTo(Math.sin(sw) * 20, -48); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -96, 14, 0, TAU2); g.fill(); g.restore();
};
TL.paperPerson = function (g, x, y, ang, ph, s) {   // 色紙を切った人
  s *= 1.15; g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  const piece = (pts, col) => { g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 8; g.shadowOffsetX = 3; g.shadowOffsetY = 5; g.fillStyle = col; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.fill(); g.restore(); };
  const sw = Math.sin(ph) * 0.4;
  piece([[-8, -100], [8, -100], [10 + sw * 40, 0], [-6 + sw * 40, 0]], '#2b2f4a'); piece([[-8, -100], [8, -100], [6 - sw * 40, 0], [-10 - sw * 40, 0]], '#2b2f4a');
  piece([[-24, -190], [24, -190], [28, -95], [-28, -95]], '#e8573e');
  g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 8; g.shadowOffsetY = 5; g.fillStyle = '#f2c9a0'; g.beginPath(); g.arc(0, -222, 30, 0, TAU2); g.fill(); g.restore();
  g.restore();
};

// ---- 地・字幕・札（ルックごと）----
const KYO = '"UD Digi Kyokasho NK", "UD デジタル 教科書体 NK", "Yu Gothic UI", sans-serif', BIZ = '"BIZ UDPGothic", "Yu Gothic UI", sans-serif';
TL.navy = function (font) {   // 前の紺の部品にもどす（PL.* の線は白に）
  Object.assign(TK, PL.ORIG); Object.assign(TK.C, PL.ORIG_C); TK.finish = null;
  PL.INK = '#ffffff'; PL.RED = '#ffcf4a'; PL.PATCH = 'rgba(20,34,72,0.88)'; PL.walker = TL.stick;
  if (font) window.setFont = (g, size, bold) => { g.font = (bold ? 'bold ' : '') + Math.round(size) + 'px ' + font; };
};
TL.bgCanvas = function (base, amount, extra) {   // 紙の地（1回だけ作る）
  const c = document.createElement('canvas'); c.width = PW * RES; c.height = PH * RES; const p = c.getContext('2d'); p.scale(RES, RES);
  p.fillStyle = base; p.fillRect(0, 0, PW, PH); tlSeed = 5;
  for (let i = 0; i < 90000; i++) { const v = tlRnd() < 0.5 ? 0 : 255; p.fillStyle = `rgba(${v},${v},${v},${tlRnd() * amount})`; p.fillRect(tlRnd() * PW, tlRnd() * PH, 1 + tlRnd() * 2.5, 1 + tlRnd() * 2.5); }
  if (extra) extra(p);
  return c;
};
TL.useBg = c => function (g) { g.drawImage(c, 0, 0, PW, PH); };
// 絵全体の画素に手を入れる（全体の大きさの画素で。1コマ数百ミリ秒かかる）
TL.pixelFinish = fn => function (g) { const c = g.canvas; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); const im = g.getImageData(0, 0, c.width, c.height); fn(im.data, c.width, c.height); g.putImageData(im, 0, 0); g.restore(); };
TL.noise = (() => { const n = 256, a = new Float32Array(n * n); tlSeed = 3; for (let i = 0; i < a.length; i++) a[i] = tlRnd(); return (x, y) => a[(y & 255) * 256 + (x & 255)]; })();
TL.mottle = (() => { const n = 64, a = new Float32Array(n * n); tlSeed = 11; for (let i = 0; i < a.length; i++) a[i] = tlRnd(); return (x, y) => { const fx = x / 90, fy = y / 90, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy, at = (p, q) => a[(q & 63) * 64 + (p & 63)]; return (at(ix, iy) * (1 - ux) + at(ix + 1, iy) * ux) * (1 - uy) + (at(ix, iy + 1) * (1 - ux) + at(ix + 1, iy + 1) * ux) * uy; }; })();
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// ---- ルックの一覧 ----
const plateWalker = TL.silhouette(() => PL.INK);
TL.LOOKS = {
  // ① 線彫り（緯線にそった線の太さで丸みと陸・海）
  line: { planet: TL.place('line', (x, R) => {
    TL.pixels(x, R, (la, lo) => land(la, lo) ? [156, 188, 120, 70] : [127, 176, 200, 60]);
    x.save(); x.beginPath(); x.arc(0, 0, R, 0, TAU2); x.clip(); x.strokeStyle = PL.INK; x.lineCap = 'round';
    for (let la = -88; la <= 88; la += 1.7) { let prev = null; for (let lo = -180; lo <= 180; lo += 1.2) { const [a, b, z] = TL.proj(la * D2R, lo * D2R); if (z <= 0) { prev = null; continue; } const p = [a * R, -b * R], s = TL.light(a, b, z), ld = land(la, lo); if (prev) { x.lineWidth = (ld ? 3.2 : 1.4) * (0.25 + (1 - s)) + (ld ? 0.6 : 0); x.beginPath(); x.moveTo(...prev); x.lineTo(...p); x.stroke(); } prev = p; } }
    x.restore(); TL.coast(x, R, 3.2, PL.INK); TL.ring(x, R, 9, PL.INK);
  }), apply() { PL.walker = plateWalker; } },
  // ② 点描
  dots: { planet: TL.place('dots', (x, R) => {
    TL.pixels(x, R, (la, lo) => land(la, lo) ? [190, 170, 120, 55] : [127, 176, 200, 45]);
    tlSeed = 7; x.fillStyle = PL.INK; const st = 4.2;
    for (let j = -R; j < R; j += st) for (let i = -R; i < R; i += st) {
      const px = i + tlRnd() * st, py = j + tlRnd() * st, nx = px / R, ny = -py / R; if (nx * nx + ny * ny > 0.995) continue;
      const [la, lo, nz] = TL.unproj(nx, ny), s = TL.light(nx, ny, nz), ld = land(la, lo), tone = ld ? 0.38 + 0.6 * (1 - s) : 0.05 + 0.5 * Math.pow(1 - s, 1.5);
      if (tlRnd() < tone) { x.beginPath(); x.arc(px, py, ld ? 1.9 : 1.5, 0, TAU2); x.fill(); }
    }
    TL.coast(x, R, 2.4, PL.INK); TL.ring(x, R, 5, PL.INK);
  }), apply() { PL.walker = plateWalker; } },
  // ③ 図鑑の1ページ（①＋経線・緯線＋図のわくと番号）
  page: { planet: TL.place('page', (x, R) => { TL.pixels(x, R, (la, lo) => land(la, lo) ? [156, 188, 120, 70] : [127, 176, 200, 60]);
    x.save(); x.beginPath(); x.arc(0, 0, R, 0, TAU2); x.clip(); x.strokeStyle = PL.INK; x.lineCap = 'round';
    for (let la = -88; la <= 88; la += 1.9) { let prev = null; for (let lo = -180; lo <= 180; lo += 1.3) { const [a, b, z] = TL.proj(la * D2R, lo * D2R); if (z <= 0) { prev = null; continue; } const p = [a * R, -b * R], s = TL.light(a, b, z), ld = land(la, lo); if (prev) { x.lineWidth = (ld ? 3 : 1.3) * (0.25 + (1 - s)) + (ld ? 0.5 : 0); x.beginPath(); x.moveTo(...prev); x.lineTo(...p); x.stroke(); } prev = p; } }
    x.restore(); TL.graticule(x, R, 1.6, PL.INK, 0.6); TL.coast(x, R, 3, PL.INK); TL.ring(x, R, 9, PL.INK);
  }), apply() {
    PL.walker = plateWalker;
    TK.bg = g => { PL.paper(g); g.save(); g.strokeStyle = PL.INK; g.lineWidth = 4; g.strokeRect(40, 150, PW - 80, 1060); g.lineWidth = 1.5; g.strokeRect(52, 162, PW - 104, 1036); g.restore();
      TK.text(g, '第 1 図', PW / 2, 118, 40, { font: PL.MIN }); TK.text(g, '半径 1 km の地球（地形は本物の地球を縮めたもの）', PW / 2, 1240, 32, { font: PL.MIN, bold: false }); };
  } },
  // ④ 古い地球儀（高さで色・起伏にかげ）
  globe: { planet: TL.place('globe', (x, R) => {
    const pal = h => h < -4000 ? [70, 120, 140] : h < -200 ? [104, 156, 170] : h < 0 ? [150, 192, 196] : h < 200 ? [150, 178, 112] : h < 800 ? [184, 186, 122] : h < 2000 ? [196, 162, 102] : [170, 128, 90];
    TL.pixels(x, R, (la, lo, s) => { const h = TL.elev(la, lo), dx = TL.elev(la, lo + 1) - TL.elev(la, lo - 1), dy = TL.elev(la + 1, lo) - TL.elev(la - 1, lo), hill = h > 0 ? clamp(1 - (dx * 0.6 - dy * 0.5) / 4000, 0.7, 1.25) : 1, k = (0.45 + 0.6 * s) * hill, c = pal(h); return [c[0] * k * 1.05, c[1] * k * 1.02, c[2] * k * 0.95, 255]; });
    x.save(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.35; x.fillStyle = '#e9d7a8'; x.beginPath(); x.arc(0, 0, R, 0, TAU2); x.fill(); x.restore();
    TL.graticule(x, R, 1.4, PL.INK, 0.45); TL.coast(x, R, 1.8, PL.INK); TL.ring(x, R, 8, PL.INK);
  }), apply() {   // ほかのページ: 手彩色を濃く、全体にニスの黄ばみ
    PL.walker = plateWalker; PL.STYLE.tintA = 1.8;
    TK.finish = function (g) { const c = g.canvas; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.22; g.fillStyle = '#d9b97a'; g.fillRect(0, 0, c.width, c.height); g.restore(); };
  } },
  // ⑤ 銅版画（細い線を3方向に重ねる。陸はさらに横線）
  copper: { planet: TL.place('copper', (x, R) => {
    TL.pixels(x, R, (la, lo) => land(la, lo) ? [176, 160, 120, 60] : [150, 170, 175, 40]);
    const shade = th => TL.mask(R, (la, lo, s) => 1 - s > th);
    TL.masked(x, R, shade(0.3), y => TL.lines(y, R, 0.55, 7, 1.3, PL.INK));
    TL.masked(x, R, shade(0.55), y => TL.lines(y, R, -0.5, 6.5, 1.3, PL.INK));
    TL.masked(x, R, shade(0.8), y => TL.lines(y, R, 1.3, 6, 1.4, PL.INK));
    TL.masked(x, R, TL.mask(R, land), y => TL.lines(y, R, 0.02, 4.5, 1.3, PL.INK));
    TL.coast(x, R, 2, PL.INK); TL.ring(x, R, 4, PL.INK);
  }), apply() { PL.walker = plateWalker; } },
  // ⑥ 理科ノート（方眼ノートに色えんぴつ。線は少しゆれる）
  note: { planet: TL.place('note', (x, R) => {
    tlSeed = 21;
    TL.pixels(x, R, (la, lo, s) => { const n = tlRnd() * 30; return land(la, lo) ? [160 + n, 205, 140, 150] : [150 + n, 190, 225, 110]; });
    TL.masked(x, R, TL.mask(R, (la, lo) => !land(la, lo)), y => TL.lines(y, R, -0.8, 12, 2.6, '#2f6fb3', 2.5));
    TL.masked(x, R, TL.mask(R, land), y => TL.lines(y, R, 0.6, 9, 2.6, '#3d9a5b', 2));
    TL.coast(x, R, 2.6, '#1f2a44', 1.2); TL.coast(x, R, 1.4, '#1f2a44', 1.6); TL.sketchRing(x, R, 5, '#1f2a44', 3);
  }), apply() {
    PL.INK = '#1f2a44'; PL.RED = '#d2453b'; PL.MIN = KYO; PL.PATCH = 'rgba(247,246,241,0.92)'; PL.walker = TL.silhouette(() => PL.INK);
    const bg = TL.bgCanvas('#f7f6f1', 0.05, p => { p.strokeStyle = 'rgba(80,140,200,0.22)'; p.lineWidth = 1.5; p.beginPath(); for (let a = 30; a < PW; a += 60) { p.moveTo(a, 0); p.lineTo(a, PH); } for (let b = 30; b < PH; b += 60) { p.moveTo(0, b); p.lineTo(PW, b); } p.stroke(); p.strokeStyle = 'rgba(220,80,80,0.5)'; p.lineWidth = 3; p.beginPath(); p.moveTo(110, 0); p.lineTo(110, PH); p.stroke(); });
    TK.bg = TL.useBg(bg);
    TK.subtitle = function (g, t, subs) {   // 付箋
      const s = subs.find(q => t >= q.a && t < q.b && !q.noBurn); if (!s) return;
      const y = PL.SUBY, n = String(s.ja).split('\n').length, hh = 60 + n * 38;
      g.save(); g.globalAlpha *= fade(t, s.a, s.b, 0.12); g.translate(PW / 2, y); g.rotate(-0.012);
      g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowBlur = 14; g.shadowOffsetY = 6; g.fillStyle = '#fff3a8'; g.fillRect(-490, -hh, 980, hh * 2); g.shadowColor = 'transparent';
      TK.lines(g, s.ja, 0, 0, 58, { font: KYO, lh: 1.25 }); g.restore();
    };
  } },
  // ⑦ 切り絵（色紙を重ねる）
  cut: { planet: TL.place('cut', (x, R) => {
    const sh = (fn, b = 18, ox = 6, oy = 10) => { x.save(); x.shadowColor = 'rgba(0,0,0,0.4)'; x.shadowBlur = b * RES; x.shadowOffsetX = ox * RES; x.shadowOffsetY = oy * RES; fn(); x.restore(); };
    tlSeed = 4; const jag = () => { x.beginPath(); for (let i = 0; i < 160; i++) { const a = i / 160 * TAU2; x.lineTo(Math.cos(a) * R + tlRs(2), Math.sin(a) * R + tlRs(2)); } x.closePath(); };
    sh(() => { x.fillStyle = '#2f8f9d'; jag(); x.fill(); });
    x.save(); jag(); x.clip(); x.fillStyle = '#226f7c'; x.beginPath(); x.arc(0, 0, R + 4, 0, TAU2); x.arc(R * 0.3, -R * 0.22, R * 1.02, 0, TAU2, true); x.fill(); x.restore();   // かげの紙
    const m = TL.mask(R, land), c = document.createElement('canvas'); c.width = c.height = m.width; const y = c.getContext('2d'); y.fillStyle = '#7cc46a'; y.fillRect(0, 0, c.width, c.height); y.globalCompositeOperation = 'destination-in'; y.drawImage(m, 0, 0);
    sh(() => x.drawImage(c, -R, -R, R * 2, R * 2), 6, 2, 4);
  }), apply() {
    PL.INK = '#f3efe2'; PL.RED = '#f4d35e'; PL.MIN = BIZ; PL.PATCH = 'rgba(45,62,107,0.92)'; PL.walker = TL.paperPerson;
    Object.assign(PL.STYLE, { hatch: false, flat: true, outline: false });
    TK.drawArt = function (g, t, draw) {   // 絵を別の層に描き、紙のきめをのせて、影を落として重ねる
      const c = g.canvas; if (!TL._art) { TL._art = document.createElement('canvas'); TL._art.width = c.width; TL._art.height = c.height; TL._grain = TL.bgCanvas('rgba(0,0,0,0)', 0.12); }
      const a = TL._art.getContext('2d'); a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, c.width, c.height); a.setTransform(RES, 0, 0, RES, 0, 0); a.globalAlpha = g.globalAlpha; draw(a, t);
      a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-atop'; a.drawImage(TL._grain, 0, 0); a.globalCompositeOperation = 'source-over';
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 14 * RES; g.shadowOffsetX = 5 * RES; g.shadowOffsetY = 9 * RES; g.drawImage(TL._art, 0, 0); g.restore();
    };
    const bg = TL.bgCanvas('#2d3e6b', 0.07, p => { tlSeed = 9; p.fillStyle = '#e9e2c8'; for (let i = 0; i < 60; i++) { p.beginPath(); p.arc(tlRnd() * PW, tlRnd() * PH, 3 + tlRnd() * 4, 0, TAU2); p.fill(); } });
    TK.bg = TL.useBg(bg);
    TK.subtitle = function (g, t, subs) {   // 白い紙のテープ
      const s = subs.find(q => t >= q.a && t < q.b && !q.noBurn); if (!s) return;
      const y = PL.SUBY, n = String(s.ja).split('\n').length, hh = 56 + n * 38;
      g.save(); g.globalAlpha *= fade(t, s.a, s.b, 0.12); g.translate(PW / 2, y); g.rotate(-0.01);
      g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 16; g.shadowOffsetX = 5; g.shadowOffsetY = 8; g.fillStyle = '#f3efe2'; g.fillRect(-500, -hh, 1000, hh * 2); g.shadowColor = 'transparent';
      TK.lines(g, s.ja, 0, 0, 56, { font: BIZ, color: '#2b2f4a', acc: '#c0392b', lh: 1.25 }); g.restore();
    };
  } },
  // ⑧ 水彩とペン
  water: { planet: TL.place('water', (x, R) => {
    tlSeed = 77;
    const blob = (rx, ry, color, layers, wob) => { const base = Array.from({ length: 24 }, (_, i) => [Math.cos(i / 24 * TAU2) * rx, Math.sin(i / 24 * TAU2) * ry]); const def = (pts, d) => pts.flatMap((p, i) => { const q = pts[(i + 1) % pts.length]; return [p, [(p[0] + q[0]) / 2 + tlRs(d), (p[1] + q[1]) / 2 + tlRs(d)]]; }); let b = def(def(base, wob), wob);
      for (let l = 0; l < layers; l++) { let p = def(def(def(b, wob * 0.5), wob * 0.5), wob * 0.5); x.fillStyle = color; x.globalAlpha = 0.05; x.beginPath(); p.forEach(([a, c], i) => i ? x.lineTo(a, c) : x.moveTo(a, c)); x.closePath(); x.fill(); } x.globalAlpha = 1; };
    blob(R * 1.02, R * 1.02, '#3d7cc9', 40, 26); blob(R * 0.75, R * 0.7, '#6fb0e8', 26, 30);
    const m = TL.mask(R, land), c = document.createElement('canvas'); c.width = c.height = m.width; const y = c.getContext('2d'); y.fillStyle = '#5aa865'; y.fillRect(0, 0, c.width, c.height); y.globalCompositeOperation = 'destination-in'; y.drawImage(m, 0, 0);
    x.save(); x.filter = 'blur(' + 2.5 * RES + 'px)'; for (let i = 0; i < 6; i++) { x.globalAlpha = 0.28; x.drawImage(c, -R + tlRs(3), -R + tlRs(3), R * 2, R * 2); } x.restore();
    TL.coast(x, R, 1.4, '#2b3340', 0.6); TL.sketchRing(x, R, 2.5, '#2b3340', 1.2);
  }), apply() {
    PL.INK = '#2b3340'; PL.RED = '#c0563a'; PL.MIN = KYO; PL.PATCH = 'rgba(251,250,246,0.9)'; PL.walker = TL.silhouette(() => PL.INK);
    TK.bg = TL.useBg(TL.bgCanvas('#fbfaf6', 0.05));
    TK.subtitle = function (g, t, subs) {   // 下にうすい水彩のにじみ
      const s = subs.find(q => t >= q.a && t < q.b && !q.noBurn); if (!s) return;
      g.save(); g.globalAlpha *= fade(t, s.a, s.b, 0.12);
      if (!TL._wash) { TL._wash = document.createElement('canvas'); TL._wash.width = 1100 * RES; TL._wash.height = 320 * RES; const w = TL._wash.getContext('2d'); w.scale(RES, RES); tlSeed = 31; for (let l = 0; l < 30; l++) { w.fillStyle = 'rgba(200,190,230,0.05)'; w.beginPath(); for (let i = 0; i < 30; i++) { const a = i / 30 * TAU2; w.lineTo(550 + Math.cos(a) * (500 + tlRs(30)), 160 + Math.sin(a) * (120 + tlRs(20))); } w.fill(); } }
      g.drawImage(TL._wash, PW / 2 - 550, PL.SUBY - 160, 1100, 320);
      TK.lines(g, s.ja, PW / 2, PL.SUBY, 56, { font: KYO, lh: 1.25 }); g.restore();
    };
  } },
  // ⑨ 前の紺（比べる用）
  navy: { planet: navyPlanet, apply() { TL.navy(); } },
  // ⑩ 学校のプリント（リソグラフ）: 紺の絵を、紙に2色のインクで刷ったように
  riso: { planet: null, apply() {
    PL.walker = plateWalker; LOOK.planet = TL.LOOKS.line.planet; PL.MIN = KYO;
    TK.finish = TL.pixelFinish((out, w, h) => {
      const px = out.slice();   // 版ずれで前の画素を読むので、書きかえる前の写しから読む
      const P = [246, 244, 238], I1 = [0, 120, 191], I2 = [255, 72, 176], f = 2 * Math.PI / (4.2 * RES), c1a = Math.cos(0.26), s1a = Math.sin(0.26), c2a = Math.cos(1.31), s2a = Math.sin(1.31), off = 2 * RES * 4 + w * RES * 4;
      const cov = (k) => { const d = 1 - lum(px[k], px[k + 1], px[k + 2]), mx = Math.max(px[k], px[k + 1], px[k + 2]), mn = Math.min(px[k], px[k + 1], px[k + 2]), sat = (mx - mn) / 255, warm = clamp((px[k] - px[k + 2]) / 90, 0, 1) * clamp(sat * 3, 0, 1);
        const a = clamp((d - 0.16) / 0.75, 0, 1) + sat * 0.35; return [clamp(a * (1 - warm * 0.9), 0, 1), clamp(a * warm * 1.2, 0, 1)]; };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, j = Math.max(0, i - off), a1 = cov(i)[0], a2 = cov(j)[1], gr = (TL.noise(x, y) - 0.5) * 0.1, mot = (TL.mottle(x, y) - 0.5) * 0.18;
        const t1 = (Math.cos((x * c1a + y * s1a) * f) + Math.cos((-x * s1a + y * c1a) * f)) * 0.25 + 0.5, t2 = (Math.cos((x * c2a + y * s2a) * f) + Math.cos((-x * s2a + y * c2a) * f)) * 0.25 + 0.5;
        const ink = (c, th) => c < 0.06 ? 0 : clamp(Math.min(1, c * 1.25) * (0.8 + 0.4 * (c > 0.5 ? 0.5 : 1 - th)) + gr, 0, 1) * (0.9 + mot);
        const k1 = ink(a1, t1), k2 = ink(a2, t2), pg = 1 + (TL.noise(x * 3, y * 7) - 0.5) * 0.05;
        for (let ch = 0; ch < 3; ch++) out[i + ch] = P[ch] * pg * (1 - k1 * (1 - I1[ch] / 255)) * (1 - k2 * (1 - I2[ch] / 255));
      }
    });
  } },
  // ⑪ 青焼き（設計図）
  cyan: { planet: navyPlanet, apply() {
    TL.navy(BIZ);
    TK.bg = function (g) { g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH); g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1.2; g.beginPath(); for (let a = 0; a <= PW; a += 36) { g.moveTo(a, 0); g.lineTo(a, PH); } for (let b = 0; b <= PH; b += 36) { g.moveTo(0, b); g.lineTo(PW, b); } g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2; g.beginPath(); for (let a = 0; a <= PW; a += 180) { g.moveTo(a, 0); g.lineTo(a, PH); } for (let b = 0; b <= PH; b += 180) { g.moveTo(0, b); g.lineTo(PW, b); } g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; g.strokeRect(40, 40, PW - 80, PH - 80); };
    TK.finish = TL.pixelFinish((px, w, h) => {
      const P = [20, 52, 110], I = [232, 241, 247];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, wm = clamp((px[i] - px[i + 2]) / 160, 0, 1), L = clamp(lum(px[i], px[i + 1], px[i + 2]) * 1.25 + wm * 0.15, 0, 1);
        const mot = TL.mottle(x, y) - 0.5, fib = TL.noise(x, y >> 1) - 0.5, k = clamp(Math.pow(L, 0.85) * (0.93 + (TL.noise(x + 77, y) - 0.5) * 0.12), 0, 1);
        for (let ch = 0; ch < 3; ch++) px[i + ch] = P[ch] * (1 + mot * 0.35 + fib * 0.08) * (1 - k) + I[ch] * k;
      }
    });
  } },
  // ⑫ 暗室（ほんのり光る）
  dark: { planet: navyPlanet, apply() {
    TL.navy(KYO);
    Object.assign(TK.C, { bg0: '#05080a', bg1: '#0b1214', acc: '#ffb54a', acc2: '#7fe0d0', sub: '#c9d8d2', line: 'rgba(170,220,200,0.07)', green: '#8be3a6', red: '#ff7a6a' });
    PL.RED = '#ffb54a'; PL.PATCH = 'rgba(8,14,16,0.85)';
    TK.bg = function (g) { const gr = g.createRadialGradient(PW / 2, PH * 0.4, 100, PW / 2, PH * 0.45, PH * 0.75); gr.addColorStop(0, '#0e1a1c'); gr.addColorStop(1, '#040607'); g.fillStyle = gr; g.fillRect(0, 0, PW, PH); g.fillStyle = 'rgba(170,220,200,0.13)'; for (let y = 45; y < PH; y += 90) for (let x = 45; x < PW; x += 90) { g.beginPath(); g.arc(x, y, 2.2, 0, TAU2); g.fill(); } };
    TK.finish = function (g) {   // 光る所をにじませて足す＋四すみを暗く
      const c = g.canvas; g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      if (!TL._tmp) { TL._tmp = document.createElement('canvas'); TL._tmp.width = c.width; TL._tmp.height = c.height; }
      const t = TL._tmp.getContext('2d'); t.clearRect(0, 0, c.width, c.height); t.drawImage(c, 0, 0);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.filter = `blur(${10 * RES}px) brightness(0.9)`; g.drawImage(TL._tmp, 0, 0); g.globalAlpha = 0.3; g.filter = `blur(${28 * RES}px)`; g.drawImage(TL._tmp, 0, 0);
      g.filter = 'none'; g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      const v = g.createRadialGradient(c.width / 2, c.height * 0.45, c.height * 0.3, c.width / 2, c.height * 0.5, c.height * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
      g.restore();
    };
  } },
};
function navyPlanet(g, cx, cy, r, f = 1) {   // 前の紺の星（グラデーションの丸と、緑の楕円）
  g.save(); g.globalAlpha *= f;
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); gr.addColorStop(0, '#5fa8ff'); gr.addColorStop(1, '#1d4fa3');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, TAU2); g.fill();
  g.fillStyle = 'rgba(89,227,154,0.75)'; [[-0.3, -0.2, 0.32], [0.35, 0.25, 0.25], [0.1, -0.55, 0.18]].forEach(([dx, dy, rr]) => { g.beginPath(); g.ellipse(cx + dx * r, cy + dy * r, rr * r, rr * r * 0.7, dx, 0, TAU2); g.fill(); });
  g.restore();
}

// 入口ページから呼ぶ: ルックを決め、元のページの台本を読んで動かす
TL.run = async function (base) {
  const id = (location.pathname.match(/look-([\w-]+)\.html/) || [])[1];
  LOOK = window.LOOK = TL.LOOKS[id];
  if (!LOOK) { document.body.textContent = 'ルックが見つからない: ' + id; return; }
  const [buf, html] = await Promise.all([fetch('../../tiny-earth/data/etopo1deg.bin').then(r => r.arrayBuffer()), fetch(base + '.html', { cache: 'no-store' }).then(r => r.text()), document.fonts.ready]);
  TL.ELEV = new Int16Array(buf);
  if (LOOK.apply) LOOK.apply();
  let code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();
  const out = location.pathname.split('/').pop().replace(/\.html$/, '');   // 入口ページの名前が、そのまま動画の名前
  code = code.replace(`out: '${base}'`, `out: '${out}', voiceOut: '${base}'`);
  new Function(code)();
};
