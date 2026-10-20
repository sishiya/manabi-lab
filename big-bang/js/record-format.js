// ビッグバンから惑星まで — 記録の形（tools/record.html が書き、replay.js が読む）
// 再生のコマ: 生きている岩 1 つ 6 バイト（x, y: int16 で 1e-4 AU きざみ ±3.27 AU／重さ: uint8 の対数／温度: uint8 で 20 K きざみ）
// 分かれる用の完全な記録: 生きている岩 1 つ 32 バイト（f32: x, y, z, vx, vy, vz, 重さ, 比エネルギー）
import { radiusAU, tempOfE } from './physics.js';

export const XY = 1e-4, MCODE = 42.5, MLOG0 = -10, TSTEP = 20;
export const mOfCode = c => Math.pow(10, c / MCODE + MLOG0);

export function encodeFrame(B, n, t) {
  let k = 0, big = 0; for (let i = 0; i < n; i++) if (B[i * 16 + 3] > 0) k++;
  const bytes = new Uint8Array(k * 6), dv = new DataView(bytes.buffer); let o = 0;
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  for (let i = 0; i < n; i++) { const p = i * 16, m = B[p + 3]; if (m <= 0) continue;
    big = Math.max(big, m);
    dv.setInt16(o, cl(Math.round(B[p] / XY), -32767, 32767), true); dv.setInt16(o + 2, cl(Math.round(B[p + 1] / XY), -32767, 32767), true);
    bytes[o + 4] = cl(Math.round((Math.log10(m) - MLOG0) * MCODE), 0, 255);
    bytes[o + 5] = cl(Math.round(tempOfE(B[p + 12]) / TSTEP), 0, 255); o += 6; }
  return { t, n: k, big, bytes };
}
export function decodeFrame(buf, off, k) {
  const dv = new DataView(buf, off, k * 6), x = new Float32Array(k), y = new Float32Array(k), m = new Float32Array(k), T = new Float32Array(k);
  for (let i = 0, o = 0; i < k; i++, o += 6) { x[i] = dv.getInt16(o, true) * XY; y[i] = dv.getInt16(o + 2, true) * XY; m[i] = mOfCode(dv.getUint8(o + 4)); T[i] = dv.getUint8(o + 5) * TSTEP; }
  return { x, y, m, T, k };
}
export function encodeFull(B, n, t) {
  let k = 0; for (let i = 0; i < n; i++) if (B[i * 16 + 3] > 0) k++;
  const f = new Float32Array(k * 8); let o = 0;
  for (let i = 0; i < n; i++) { const p = i * 16; if (B[p + 3] <= 0) continue;
    f[o] = B[p]; f[o + 1] = B[p + 1]; f[o + 2] = B[p + 2]; f[o + 3] = B[p + 4]; f[o + 4] = B[p + 5]; f[o + 5] = B[p + 6]; f[o + 6] = B[p + 3]; f[o + 7] = B[p + 12]; o += 8; }
  return { t, n: k, bytes: new Uint8Array(f.buffer) };
}
// 生きている岩だけを前につめて、席を n2 個にする（記録の途中で、岩がへったら計算を軽くする）
export function compactBodies(B, n, n2) {
  const out = new Float32Array(n2 * 16); let k = 0;
  for (let i = 0; i < n && k < n2; i++) if (B[i * 16 + 3] > 0) { out.set(B.subarray(i * 16, i * 16 + 16), k * 16); out[k * 16 + 14] = k; k++; }
  return out;
}
// 完全な記録 → GPU に入れる形（16 個ずつ、席は n 個。のこりは空き）
export function fullToBodies(buf, off, k, n) {
  const f = new Float32Array(buf.slice(off, off + k * 32)), B = new Float32Array(n * 16);
  for (let i = 0; i < Math.min(k, n); i++) { const s = i * 8, p = i * 16;
    B[p] = f[s]; B[p + 1] = f[s + 1]; B[p + 2] = f[s + 2]; B[p + 3] = f[s + 6];
    B[p + 4] = f[s + 3]; B[p + 5] = f[s + 4]; B[p + 6] = f[s + 5]; B[p + 7] = radiusAU(f[s + 6]); B[p + 12] = f[s + 7]; B[p + 14] = i; }
  return B;
}
