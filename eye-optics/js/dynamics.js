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

// ── 暗順応（暗さに慣れる）。分の単位 ──
// しきい値（見える最小の明るさ、log10 cd/m²）を、錐体 c と桿体 r の2つで持つ。見えるのは低いほう（敏感なほう）。
// 数字: Patryas ほか 2013（強い光のあと: 切りかわり 約7分、桿体の下がる速さ S2 0.23 log/分（45歳以上 0.19、10年で 0.01 おそく）、
// 終わり S3 0.05 log/分、30分後 −4.4）、Bakdalieh ほか 2025（錐体は 5〜10 分で頭打ち）、Hecht ほか 1937（弱い光のあとは桿体だけ）
const DARK = {
  rodAbs: -4.6,      // 桿体のいちばん低いしきい値（30分後 −4.4 と S3 から。推定）
  conePlateau: -1.4, // 錐体の頭打ちの高さ（切りかわり 7分と S2 から逆算。推定）
  coneTau: 1.5,      // 錐体が下がる時定数（分）: 5〜10 分で頭打ちに合わせた推定
  coneWeber: -2.0,   // 明るい所の錐体のしきい値 ＝ 明るさ × 1%（ウェーバーの法則の目安。推定）
  S3: 0.05, S3range: 0.6,   // 終わりの 0.6 log はゆっくり S3（推定）
  lightTau: 3,       // 明るくなったときは数秒で合わせる（秒。推定）
  S2: age => Math.max(0.12, 0.23 - 0.001 * Math.max(0, age - 30)),
  // その明るさにいるときの桿体のしきい値（rodAbs からの高さ）。強い光ほど高く、あとで下がるのに時間がかかる（推定の直線。
  // 晴れた屋外 3000 cd/m² で約 4.8 → 7分で錐体の頭打ちに追いつく。部屋 100 cd/m² では約 3.3 で、はじめから錐体より低い＝桿体だけ）
  rodLight: L => Math.max(0, 1.2 + 1.03 * Math.log10(L)),
};
const coneLight = L => Math.max(DARK.conePlateau, Math.log10(L) + DARK.coneWeber);
function darkSettle(st, L) { st.cone = coneLight(L); st.rod = DARK.rodAbs + DARK.rodLight(L); }
// dt は秒
function darkStep(st, dt, L, age) {
  const m = dt / 60, cT = coneLight(L), rT = DARK.rodAbs + DARK.rodLight(L);
  if (st.cone > cT) st.cone = cT + (st.cone - cT) * Math.exp(-m / DARK.coneTau);
  else st.cone += (cT - st.cone) * (1 - Math.exp(-dt / DARK.lightTau));
  if (st.rod > rT) {
    const above = st.rod - DARK.rodAbs, slope = above > DARK.S3range ? DARK.S2(age) : DARK.S3;
    st.rod = Math.max(rT, st.rod - slope * m);
  } else st.rod += (rT - st.rod) * (1 - Math.exp(-dt / DARK.lightTau));
}
// いまの明るさ L で、だれが見ているか: 'cone'（錐体）・'rod'（桿体だけ）・'none'（見えない）と、明るさがしきい値をどれだけ上回るか（log）
function darkSee(st, L) {
  const l = Math.log10(L), mc = l - st.cone, mr = l - st.rod;
  if (mc > 0.3) return { who: 'cone', margin: mc };
  if (mr > 0) return { who: 'rod', margin: Math.max(mr, mc) };
  return { who: 'none', margin: Math.max(mr, mc) };
}
