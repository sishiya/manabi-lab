// 日本のあたりの標高を、アプリで読める小さな表にする（node で: node slime-maze/tools/build-elev.mjs）
//  元: NOAA ETOPO1（Ice Surface、1分角。米国の公的データでパブリックドメイン）を ERDDAP から 3分角ごとに取ったもの
//   curl -L -o slime-maze/tools/raw/etopo-japan-3min.csv "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude%5B(30):3:(46)%5D%5B(128):3:(146.5)%5D"
//   （約 3.6 MB。Git に入れない。2026-11-23 ユーザーの許可を得て取った）
//  出力: data/japan-elev.json … 0.1°ごと（約 10 km）、2×2 の平均。陸の高さを 25 m きざみの 1 バイト（海は 0）で base64
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const rows = fs.readFileSync(path.join(DIR, 'raw', 'etopo-japan-3min.csv'), 'utf8').trim().split('\n').slice(2);
const LAT0 = 30, LON0 = 128, D = 0.05, nLa = Math.round(16 / D) + 1, nLo = Math.round(18.5 / D) + 1, z = new Float32Array(nLa * nLo).fill(NaN);
for (const r of rows) { const [la, lo, a] = r.split(',').map(Number); z[Math.round((la - LAT0) / D) * nLo + Math.round((lo - LON0) / D)] = a; }
const STEP = 0.1, K = 2, mLa = Math.floor((nLa - 1) / K), mLo = Math.floor((nLo - 1) / K), UNIT = 25, out = new Uint8Array(mLa * mLo);
let max = 0;
for (let i = 0; i < mLa; i++) for (let j = 0; j < mLo; j++) {
  let s = 0, n = 0; for (let a = 0; a <= K; a++) for (let b = 0; b <= K; b++) { const v = z[(i * K + a) * nLo + j * K + b]; if (isFinite(v)) { s += Math.max(0, v); n++; } }
  const h = n ? s / n : 0; max = Math.max(max, h); out[i * mLo + j] = Math.min(255, Math.round(h / UNIT));
}
const res = { src: 'NOAA ETOPO1 (public domain), 3-arcmin from ERDDAP etopo180, 2x2 mean', lat0: LAT0 + STEP / 2, lon0: LON0 + STEP / 2, step: STEP, nLat: mLa, nLon: mLo, unitM: UNIT, b64: Buffer.from(out).toString('base64') };
fs.writeFileSync(path.join(DIR, '..', 'data', 'japan-elev.json'), JSON.stringify(res));
console.log(`japan-elev.json: ${mLa}×${mLo}、いちばん高い所（10 km の平均）${max.toFixed(0)} m、${(JSON.stringify(res).length / 1024).toFixed(0)} KB`);
