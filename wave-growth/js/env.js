// 波が育つまで — 時刻と雲の量から、太陽・月の向き・月の満ち欠けと空のようす
// 太陽・月は、きょうの日付・時刻・いる所（地球儀の「いる所」の緯度・経度）から計算する（世界の +x = 東、+z = 南、+y = 上）。
//   太陽: NOAA の簡単な式（誤差 0.01° ほど）。月: Meeus『Astronomical Algorithms』の主な 4 項＋地上から見たずれ（視差）（誤差 0.3° ほど）。
//   月の明るさ: 満ち欠けの角 α から Allen の式（等級 = −12.73 + 0.026|α| + 4×10⁻⁹ α⁴）。満月の光は太陽の約 40 万分の 1（2.5×10⁻⁶）。
// 夜の明るさは、目が暗さに慣れたくらいに見せる（夜は光をまとめて約 2.8 万倍。月の光・月で明るい空・星あかりを同じ倍率で）。
// 雲: 量 0〜1。日がさす量は、その時刻に太陽の前に雲があるかで決まる（シェーダーが空の絵の雲の濃さを太陽の向きで読む）。
'use strict';
window.WGenv = (() => {
  const D2R = Math.PI / 180, BOOST = 28000;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const zoneOf = lon => Math.round(lon / 15);                       // いる所の時刻 = 世界時 + 経度/15 時間（丸めた）
  // きょう（いる所の時刻で）の 0 時の世界時のミリ秒
  function day0(lon) { const z = zoneOf(lon), n = new Date(Date.now() + z * 3600e3); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - z * 3600e3; }
  // 赤経・赤緯 → 世界の向き（時角 H、緯度 φ）
  function toWorld(ra, dec, d, lat, lon) {
    const gmst = 280.46061837 + 360.98564736629 * d, H = (gmst + lon) * D2R - ra, p = lat * D2R;
    const east = -Math.cos(dec) * Math.sin(H), north = Math.sin(dec) * Math.cos(p) - Math.cos(dec) * Math.cos(H) * Math.sin(p), up = Math.sin(dec) * Math.sin(p) + Math.cos(dec) * Math.cos(H) * Math.cos(p);
    return [east, up, -north];
  }
  function sunMoon(ms, lat, lon) {
    const d = ms / 86400000 + 2440587.5 - 2451545.0, e = (23.439 - 3.6e-7 * d) * D2R;
    const g = (357.529 + 0.98560028 * d) * D2R, q = 280.459 + 0.98564736 * d, ls = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
    const sun = toWorld(Math.atan2(Math.cos(e) * Math.sin(ls), Math.cos(ls)), Math.asin(Math.sin(e) * Math.sin(ls)), d, lat, lon);
    const L0 = 218.316 + 13.176396 * d, Mm = (134.963 + 13.064993 * d) * D2R, F = (93.272 + 13.229350 * d) * D2R, D = (297.850 + 12.190749 * d) * D2R;
    const lm = (L0 + 6.289 * Math.sin(Mm) + 1.274 * Math.sin(2 * D - Mm) + 0.658 * Math.sin(2 * D) - 0.186 * Math.sin(g)) * D2R, bm = 5.128 * Math.sin(F) * D2R;
    const ra = Math.atan2(Math.sin(lm) * Math.cos(e) - Math.tan(bm) * Math.sin(e), Math.cos(lm)), dec = Math.asin(Math.sin(bm) * Math.cos(e) + Math.cos(bm) * Math.sin(e) * Math.sin(lm));
    let mo = toWorld(ra, dec, d, lat, lon);
    { const alt = Math.asin(mo[1]), a2 = alt - 0.95 * D2R * Math.cos(alt), h = Math.hypot(mo[0], mo[2]) || 1; mo = [mo[0] / h * Math.cos(a2), Math.sin(a2), mo[2] / h * Math.cos(a2)]; }   // 地上から見ると約 0.95° 低い
    const elong = (((lm - ls) / D2R) % 360 + 360) % 360;              // 太陽から東へ何度（0 = 新月、180 = 満月）
    return { sun, moon: mo, elong };
  }
  // 時刻（いる所、0 時からの時間。24 をこえると次の日）→ 世界時のミリ秒
  const msOf = (clock, lon) => day0(lon) + clock * 3600e3;   // day0 はいる所の 0 時（世界時のミリ秒）
  // その日の日の出・南中・日の入（10 分ごとに見て、高さ −0.833° をまたぐ所）
  function events(lat, lon) { let rise = 6, set = 18, noon = 12, best = -2, prev = null;
    for (let m = 0; m <= 1440; m += 10) { const c = m / 60, y = sunMoon(msOf(c, lon), lat, lon).sun[1], h = Math.asin(y) / D2R + 0.833;
      if (y > best) { best = y; noon = c; } if (prev != null) { if (prev < 0 && h >= 0) rise = c - 10 / 60 * h / (h - prev); if (prev >= 0 && h < 0) set = c - 10 / 60 * h / (h - prev); } prev = h; }
    return { rise, set, noon }; }
  function timeOf(k, lat, lon) { const ev = events(lat, lon);
    if (k === 'now') { const z = zoneOf(lon); return ((Date.now() + z * 3600e3) % 86400000) / 3600e3; }
    return k === 'morning' ? ev.rise + 1 : k === 'noon' ? ev.noon : k === 'evening' ? ev.set - 0.5 : ev.set + 2.5; }
  // 太陽の高さ（度）から明るさの目安（見た目で決めた）
  function baseExpo(elDeg) {
    if (elDeg > 15) return 0.55;
    if (elDeg > 5) return 0.55 + (15 - elDeg) / 10 * 0.25;
    if (elDeg > 0) return 0.8 + (5 - elDeg) / 5 * 0.25;
    if (elDeg > -6) return 1.05 + (-elDeg) / 6 * 1.2;
    return 2.2;
  }
  function make(clock, cloud, lat, lon) {
    const sm = sunMoon(msOf(clock, lon), lat, lon), L = sm.sun, Lm = sm.moon, el = Math.asin(L[1]) / D2R;
    const night = 1 - smooth(-10, -3, el), boost = Math.exp(night * Math.log(BOOST));   // 0 = 昼、1 = 夜（目が慣れる倍率）
    const a = Math.abs(180 - sm.elong);   // 満ち欠けの角（0 = 満月。地球から見た太陽と月の離れ方から）
    const pb = Math.pow(10, -0.4 * (0.026 * a + 4e-9 * Math.pow(a, 4)));                                // 満月にくらべた月の明るさ（Allen）
    const N = Math.min(1, Math.max(0, cloud)), moonUp = smooth(-1, 2, Math.asin(Lm[1]) / D2R);
    return { L, Lm, moonI: 20 * 2.5e-6 * pb * boost, boost, moonLit: (1 - Math.cos(sm.elong * D2R)) / 2, elong: sm.elong,
      cloud: 0.03 + 0.97 * N, cdark: 1 - 0.3 * N * N, dim: 1, disc: 1, fogL: 9000 - 4000 * N,
      stars: night * (1 - N) * (1 - 0.7 * moonUp * pb), glow: night * 0.035 * (1 - 0.5 * N),   // glow = 月のない夜の星あかり・大気の光（満月の夜の空の数 % の目安）
      expo: baseExpo(el) * (1 + 0.45 * N * N), el, phase: a };
  }
  const MOON_NAMES = [[1.5, L('新月', 'new moon')], [5.5, L('三日月のころ', 'crescent')], [9.5, L('上弦のころ', 'first quarter')], [13.5, L('満月の少し前', 'just before full')], [16.5, L('満月', 'full moon')], [20.5, L('満月の少しあと', 'just after full')], [24.5, L('下弦のころ', 'last quarter')], [28, L('有明の月', 'waning crescent')], [30, L('新月', 'new moon')]];
  function moonText(elong) { const age = elong / 360 * 29.53; return (MOON_NAMES.find(m => age < m[0]) || MOON_NAMES[0])[1] + L(`（月齢 ${age.toFixed(0)}）`, ` (day ${age.toFixed(0)})`); }
  function clockText(c, lon) { const day = Math.floor(c / 24), cc = c - day * 24, h = Math.floor(cc), m = Math.floor((cc - h) * 60);
    const dt = new Date(day0(lon) + zoneOf(lon) * 3600e3 + day * 86400e3);
    return L(`${dt.getUTCMonth() + 1}月${dt.getUTCDate()}日 ${h}:${String(m).padStart(2, '0')}`, `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getUTCMonth()]} ${dt.getUTCDate()} ${h}:${String(m).padStart(2, '0')}`); }
  return { make, sunMoon, events, timeOf, moonText, clockText, zoneOf };
})();
