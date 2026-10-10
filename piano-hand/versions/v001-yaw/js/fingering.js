// ① 運指: 隣りあう2音の指の組ごとの罰点（Parncutt ほか 1997 の右手の規則を簡略）を、動的計画法で最小に。
'use strict';
// 指の組 a<b の、下の指の音から上の指の音までの半音の数の目安:
// [できる最小, 楽な最小, ゆるんだ最小, ゆるんだ最大, 楽な最大, できる最大]（Parncutt ほか 1997 の表、右手）
const SPAN = {
  12: [-5, -3, 1, 5, 8, 10], 13: [-4, -2, 3, 7, 10, 12], 14: [-3, -1, 5, 9, 12, 14], 15: [-1, 1, 7, 10, 13, 15],
  23: [1, 1, 1, 2, 3, 5], 24: [1, 1, 3, 4, 5, 7], 25: [2, 2, 5, 6, 8, 10],
  34: [1, 1, 1, 2, 2, 4], 35: [1, 1, 3, 4, 5, 7], 45: [1, 1, 1, 2, 3, 5],
};

// 1つの音と指の罰点
function noteCost(m, f) {
  let c = 0;
  if (f === 4 || f === 5) c += 1;            // 弱い指
  if (isBlack(m) && f === 1) c += 1;          // 親指で黒鍵
  return c;
}

// 前の音 (m1,f1) → 次の音 (m2,f2) の罰点。gap は前の音を離してから次を押すまでの秒
function pairCost(m1, f1, m2, f2, gap) {
  let c = 0;
  if (f1 === f2) {
    c = m1 === m2 ? 0 : 30 + Math.abs(m2 - m1); // 同じ指で別の鍵は、音が切れて手ごと動かす（なめらかに弾けない）
  } else {
    let a = f1, b = f2, iv = m2 - m1;
    if (a > b) { [a, b] = [b, a]; iv = -iv; }
    const [mnP, mnC, mnR, mxR, mxC, mxP] = SPAN[a * 10 + b];
    const th = a === 1;
    if (iv > mxC) c += 2 * (iv - mxC);                 // 開きすぎ（楽な範囲の外）
    if (iv < mnC) c += 2 * (mnC - iv);
    if (iv < mnR) c += (th ? 2 : 1) * (mnR - iv);       // 狭すぎ（親指の組は2倍）
    if (iv > mxR) c += (th ? 1 : 2) * (iv - mxR);       // 広すぎ（親指以外の組は2倍）
    if (iv > mxP || iv < mnP) c += 3 * Math.max(iv - mxP, mnP - iv); // できる範囲の外（この検証で足した規則）
    if ((f1 === 3 && f2 === 4) || (f1 === 4 && f2 === 3)) c += 1; // 3と4の続き
    if (f1 === 3 && f2 === 4 && !isBlack(m1) && isBlack(m2)) c += 1;
    // 親指くぐり・指またぎ
    const pass = (f1 !== 1 && f2 === 1 && m2 > m1) || (f1 === 1 && f2 !== 1 && m2 < m1);
    if (pass) {
      const thumbM = f2 === 1 ? m2 : m1, otherM = f2 === 1 ? m1 : m2;
      if (isBlack(thumbM) === isBlack(otherM)) c += 1;
      else if (isBlack(thumbM) && !isBlack(otherM) && thumbM > otherM) c += 3;
    }
    if (f2 === 1 && isBlack(m2) && !isBlack(m1)) c += 2; // 白鍵から親指で黒鍵へ
    if (f1 === 1 && isBlack(m1) && !isBlack(m2)) c += 2;
    if (f2 === 5 && isBlack(m2) && !isBlack(m1)) c += 2; // 白鍵から小指で黒鍵へ
  }
  if (gap > 0.35) c *= 0.3; // 休みがあれば手を置き直せる
  return c;
}

// 続く3音の罰点（手の位置が変わる回数と大きさ、3・4・5の続き）。Parncutt ほか 1997 の3音の規則
function tripleCost(m1, f1, m2, f2, m3, f3, gap) {
  let c = 0;
  if (f1 === f3) {
    if (m1 !== m3) c += 1 + Math.abs(m3 - m1); // 同じ指が別の鍵へ = 手の位置が変わった
  } else {
    let a = f1, b = f3, iv = m3 - m1;
    if (a > b) { [a, b] = [b, a]; iv = -iv; }
    const [mnP, mnC, , , mxC, mxP] = SPAN[a * 10 + b];
    if (iv < mnC || iv > mxC) {
      const full = f2 === 1 && (m2 - m1) * (m3 - m2) > 0 && (iv > mxP || iv < mnP);
      c += full ? 2 : 1;                       // 手の位置の変化（全部・半分）
      c += iv < mnC ? mnC - iv : iv - mxC;     // 変化の大きさ
    }
  }
  if (f1 !== f2 && f2 !== f3 && f1 !== f3 && [f1, f2, f3].every(f => f >= 3)) c += 1; // 3・4・5の続き
  if (gap > 0.35) c *= 0.3;
  return c;
}

// notes: [{m,t0,t1}] → 各音に f（1〜5）を入れ、合計の罰点を返す。
// 3音の規則があるので、状態を「前の指・いまの指」の組にした動的計画法
function planFingering(notes) {
  const N = notes.length;
  if (!N) return 0;
  if (N === 1) { notes[0].f = 1; return noteCost(notes[0].m, 1); }
  const idx = (p, q) => p * 6 + q;
  const cost = [], from = [];
  for (let i = 0; i < N; i++) { cost.push(new Array(36).fill(Infinity)); from.push(new Array(36).fill(0)); }
  const g01 = notes[1].t0 - notes[0].t1;
  for (let p = 1; p <= 5; p++) for (let q = 1; q <= 5; q++)
    cost[1][idx(p, q)] = noteCost(notes[0].m, p) + noteCost(notes[1].m, q) + pairCost(notes[0].m, p, notes[1].m, q, g01);
  for (let i = 2; i < N; i++) {
    const a = notes[i - 2], b = notes[i - 1], n = notes[i];
    const gap = n.t0 - b.t1, gap3 = Math.max(gap, b.t0 - a.t1);
    for (let p = 1; p <= 5; p++) for (let q = 1; q <= 5; q++) {
      const base = pairCost(b.m, p, n.m, q, gap) + noteCost(n.m, q);
      for (let o = 1; o <= 5; o++) {
        const prev = cost[i - 1][idx(o, p)];
        if (prev === Infinity) continue;
        const c = prev + base + tripleCost(a.m, o, b.m, p, n.m, q, gap3);
        if (c < cost[i][idx(p, q)]) { cost[i][idx(p, q)] = c; from[i][idx(p, q)] = o; }
      }
    }
  }
  let bp = 1, bq = 1;
  for (let p = 1; p <= 5; p++) for (let q = 1; q <= 5; q++) if (cost[N - 1][idx(p, q)] < cost[N - 1][idx(bp, bq)]) { bp = p; bq = q; }
  const total = cost[N - 1][idx(bp, bq)];
  for (let i = N - 1; i >= 1; i--) {
    notes[i].f = bq; notes[i - 1].f = bp;
    const o = from[i][idx(bp, bq)];
    bq = bp; bp = o;
  }
  return total;
}
