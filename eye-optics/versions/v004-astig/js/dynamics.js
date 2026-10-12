// 目のなかの光の道 — 時間の変化（ピント合わせ・ひとみが、遅れてから動く速さ）
// 時間は秒。ねらいの値が変わると、遅れ（latency）のあいだは何も起きず、そのあと指数関数で近づく。
'use strict';

const DYN = {
  // 調節（ピント合わせ）: Bharadwaj & Schor 2006（Vision Res 46:1019）
  accLatency: 0.30,                         // 遅れ「約 300 ms」（遠くへの切りかえで測った値。近くへも同じとした）
  accPV: amp => 1.58 * amp + 3.42,          // 近くへ（0 D から）: ピーク速度 D/s ＝ 1.58 × 動く量 ＋ 3.42（同論文の回帰式）
  disPV: start => 1.4355 * start + 1.1345,  // 遠くへ: ピーク速度は はじめの調節 で決まる（同論文の回帰式）
  // ひとみ: Mathôt 2018（光をつけて 0–0.2 s は動かず、0.2–1.5 s で最小へ。消すと 10–30 s でゆっくり戻る）、Gray ほか 2024
  pupLatency: 0.2,
  pupTauC: 0.35,   // 縮む時定数（秒）: 遅れのあと約 1 秒で 95%。上の経過に合わせた推定
  pupTauD: 6.0,    // 開く時定数（秒）: 約 18 秒で 95%。上の経過に合わせた推定
};

// 遅れの箱: ねらいが変わったら「いま＋遅れ」の時刻に効くように並べておく
function makeDelay(v) { return { q: [], eff: v, last: v }; }
function delayFeed(dl, t, v, lat) {
  if (Math.abs(v - dl.last) > 1e-6) { dl.q.push({ t: t + lat, v }); dl.last = v; }
  while (dl.q.length && dl.q[0].t <= t) dl.eff = dl.q.shift().v;
  return dl.eff;
}

// 時間を dt 進める。st = { A, stopR, acc: 遅れの箱, pup: 遅れの箱, seg }。At・stopRt は いまのねらい
function dynStep(st, t, dt, At, stopRt) {
  const aEff = delayFeed(st.acc, t, At, DYN.accLatency);
  // 指数関数の時定数は「ピーク速度 ＝ 動く量 ÷ 時定数」（指数関数で当てはめたときの決まり）から。ねらいが変わるたびに決め直す
  if (!st.seg || Math.abs(aEff - st.seg.to) > 0.005) {
    const amp = Math.abs(aEff - st.A), pv = aEff > st.A ? DYN.accPV(amp) : DYN.disPV(st.A);
    st.seg = { to: aEff, tau: Math.max(0.03, amp / pv) };
  }
  st.A += (aEff - st.A) * (1 - Math.exp(-dt / st.seg.tau));
  const pEff = delayFeed(st.pup, t, stopRt, DYN.pupLatency);
  const tau = pEff < st.stopR ? DYN.pupTauC : DYN.pupTauD;
  st.stopR += (pEff - st.stopR) * (1 - Math.exp(-dt / tau));
  st.aEff = aEff; st.pEff = pEff;
}
// すぐにねらいへ合わせる（はじめ・案内の最初）
function dynSettle(st, At, stopRt) {
  st.A = At; st.stopR = stopRt; st.acc = makeDelay(At); st.pup = makeDelay(stopRt); st.seg = null; st.aEff = At; st.pEff = stopRt;
}
