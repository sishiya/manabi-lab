// 波が育つまで — 時刻と天気から、太陽・月の向きと空のようす
// 太陽: 北緯 35°・春分（赤緯 0°）の時刻から。月は満月（太陽の反対）。世界の +x = 東、+z = 南、+y = 上。
// 夜の明るさは、目が暗さに慣れたくらいに見せている（本当の月の光は太陽の約 40 万分の 1）。
'use strict';
window.WGenv = (() => {
  const LAT = 35 * Math.PI / 180;
  const TIMES = { morning: 7, noon: 12, evening: 17.6, night: 22 };
  const WEATHER = {
    fine:   { cloud: 0.04, cdark: 1.0,  dim: 1.0,  disc: 1.0,  fogL: 9000, expo: 1.0 },   // 快晴
    clear:  { cloud: 0.38, cdark: 1.0,  dim: 1.0,  disc: 1.0,  fogL: 7000, expo: 1.0 },   // 晴れ（雲まじり）
    cloudy: { cloud: 0.95, cdark: 0.72, dim: 0.22, disc: 0.04, fogL: 5000, expo: 1.45 },
    rain:   { cloud: 1.0,  cdark: 0.45, dim: 0.1,  disc: 0.0,  fogL: 2200, expo: 1.8, rain: true },
    fog:    { cloud: 0.7,  cdark: 0.9,  dim: 0.35, disc: 0.25, fogL: 420,  expo: 1.25 },
  };
  function sunDir(clock) {
    const H = (clock - 12) * 15 * Math.PI / 180;
    const east = -Math.sin(H), north = -Math.sin(LAT) * Math.cos(H), up = Math.cos(LAT) * Math.cos(H);
    return [east, up, -north];
  }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // 太陽の高さ（度）から明るさの目安（見た目で決めた）
  function baseExpo(elDeg) {
    if (elDeg > 15) return 0.55;
    if (elDeg > 5) return 0.55 + (15 - elDeg) / 10 * 0.25;
    if (elDeg > 0) return 0.8 + (5 - elDeg) / 5 * 0.25;
    if (elDeg > -6) return 1.05 + (-elDeg) / 6 * 1.2;
    return 2.2;
  }
  function make(clock, weather) {
    const w = WEATHER[weather] || WEATHER.clear, L = sunDir(clock), Lm = L.map(v => -v), el = Math.asin(L[1]) * 180 / Math.PI;
    const night = 1 - smooth(-10, -3, el);                     // 0 = 昼、1 = 夜
    return { L, Lm, moonI: 1.4 * night, cloud: w.cloud, cdark: w.cdark, dim: w.dim, disc: w.disc, fogL: w.fogL,
      stars: night * (weather === 'clear' || weather === 'fine' ? 1 : weather === 'fog' ? 0 : 0.1), expo: baseExpo(el) * w.expo, rain: !!w.rain, el };
  }
  function clockText(c) { c = ((c % 24) + 24) % 24; const h = Math.floor(c), m = Math.floor((c - h) * 60); return h + ':' + String(m).padStart(2, '0'); }
  return { make, sunDir, TIMES, WEATHER, clockText };
})();
