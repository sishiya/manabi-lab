// クモがハエをつかまえるまで — 計算（描画とは別。Node でも読める: tools/verify.js）
// 長さは mm、時間は s。数の出どころは DATA の src と PLAN.md 2章。
'use strict';
(function (root) {

const DATA = {
  // ゼブラハエトリ（Salticus scenicus、オス 8〜10mm）。Dill 1975, Can. J. Zool. 53:1284
  spider: {
    S: 7,              // 正面から見た大きさ（Dill が仮定した値）
    crouchS: 4.5,      // 低くかがんだときの大きさ（推定。Dill はかがむと小さく見えると書くが測っていない）
    crouchBelow: 26,   // かがむのは近づきの後半（推定。Dill の「後半でかがむ」から、図3の測った範囲の端に合わせた）
    orientDeg: 5.5,    // 横の目に映る動く物がこの角度をこえると向きを変える（Dill 1975）
    pounceD: 11.6,     // 跳びつく距離の平均（ハエの模型。Dill 1975）
    vFitMax: 26,       // 速さの式を測った範囲（9〜26mm。Dill 1975 図4）
    bodyLen: 9,
  },
  // 跳躍。Phidippus regius（15mm）。Nabawy ほか 2018, Sci. Rep. 8:7142（2体長の跳躍の値）
  jump: { v: 0.52 * 1000, prep: 0.0316 },
  // ハエの逃げ。ショウジョウバエ。Fotowat ほか 2009, J. Neurophysiol. 102:875（図2）
  fly: {
    wrDeg: 49,         // 翅を上げる見かけの大きさ（SD 4°）
    toDeg: 54,         // 飛び立つ見かけの大きさ（SD 5°）
    toDelay: 0.006,    // 54° から飛び立つ（脚が離れる）までの遅れ（SD 11ms）
    toSD: 0.011,
    lvMin: 0.005, lvMax: 0.080, // 測った近づき方の範囲（l/|v| = 5〜80ms）
    rateTh: 0.3,       // ふくらむ速さのしきい値（Dill 1975 図4 の仮定。ハエで測った数ではない）
    len: 7,            // イエバエの体長（目安）
    ommDeg: 3,         // イエバエの個眼の向きの間隔（目安。2〜4°とする資料があるが、書誌を確かめきれていない）
  },
};

// 見かけの大きさ（rad）。D は目からクモの前までの距離
function angSize(S, D) { return 2 * Math.atan(S / 2 / Math.max(D, 1e-6)); }
// ふくらむ速さ（rad/s）。Dill 1975 式6
function angRate(S, D, V) { return 4 * V * S / (4 * D * D + S * S); }

// 忍び寄る速さ（mm/s）
const V26 = 4.48 + 0.011 * 26 * 26; // 26mm での速さ（約 11.9mm/s）
function stalkV(P, D) {
  if (P.speed === 'dill') return D <= DATA.spider.vFitMax ? 4.48 + 0.011 * D * D : V26; // Dill 1975 図3。26mm より遠くは測っていないので一定（推定）
  if (P.speed === 'const') return V26;                                                   // Dill 図4 の比べる相手
  return P.fastV || 30;                                                                  // 急いで（自分で決めた速さ）
}

// 跳躍の放物線: 速さ v で、距離 R に届く低いほうの角度
function jumpAngle(R) {
  const g = 9810, s = g * R / (DATA.jump.v * DATA.jump.v);
  return s >= 1 ? Math.PI / 4 : 0.5 * Math.asin(s);
}

function newState(P) {
  const D0 = DATA.fly.len / 2 / Math.tan(DATA.spider.orientDeg / 2 * Math.PI / 180); // ハエが 5.5° に見える距離（約 73mm）
  return {
    t: 0, D: D0, D0, V: 0, h: 0,      // h: 跳んでいるときの高さ
    sp: 'stalk', spT: 0,              // stalk → prep → flight → contact／stop
    fl: 'rest',                       // rest → wing → air
    jump: null,
    ev: {},                           // できごとの時刻: pounce, contact, wr, to, size49, size54, rate
    th: 0, rate: 0, S: DATA.spider.S, lv: 0, outside: false,
  };
}

// 1歩すすめる（dt は小さく。main は 0.5ms）
function step(st, P, dt) {
  const sd = DATA.spider, ev = st.ev;
  st.t += dt;
  st.S = (P.crouch && st.sp === 'stalk' && st.D < sd.crouchBelow) ? sd.crouchS : sd.S;
  if (st.sp === 'stalk') {
    if (st.fl === 'air') { st.sp = 'stop'; st.V = 0; }
    else {
      st.V = stalkV(P, st.D);
      st.D -= st.V * dt;
      if (st.D <= sd.pounceD) { st.D = sd.pounceD; st.sp = 'prep'; st.spT = 0; ev.pounce = st.t; st.V = 0; }
    }
  } else if (st.sp === 'prep') {
    st.V = 0; st.spT += dt;
    if (st.spT >= DATA.jump.prep) {
      const a = jumpAngle(st.D);
      st.jump = { a, R: st.D, vx: DATA.jump.v * Math.cos(a), vy: DATA.jump.v * Math.sin(a), t0: st.t, D0: st.D };
      st.sp = 'flight';
    }
  } else if (st.sp === 'flight') {
    const j = st.jump, tau = st.t - j.t0;
    st.V = j.vx;
    st.D = Math.max(0, j.D0 - j.vx * tau);
    st.h = Math.max(0, j.vy * tau - 0.5 * 9810 * tau * tau);
    if (st.D <= 0) { st.sp = 'contact'; st.V = 0; st.h = 0; ev.contact = st.t; }
  } else { st.V = 0; }

  // ハエの目に映るクモ
  if (st.D > 0) {
    st.th = angSize(st.S, st.D);
    st.rate = st.V > 0 ? angRate(st.S, st.D, st.V) : 0;
    st.lv = st.V > 0 ? (st.S / 2) / st.V : Infinity;  // 近づき方の速さ l/|v|（s）
  }
  const deg = st.th * 180 / Math.PI;
  // 2つのモデルの「しきい値をこえた時刻」は、選んでいないほうも記録する（メーターで並べる）
  if (ev.size49 == null && deg >= DATA.fly.wrDeg) ev.size49 = st.t;
  if (ev.size54 == null && deg >= DATA.fly.toDeg) { ev.size54 = st.t; ev.lv54 = st.lv; }
  if (ev.rate == null && st.rate >= DATA.fly.rateTh) { ev.rate = st.t; ev.lvRate = st.lv; }

  // ハエのふるまい（選んだモデルだけ）
  if (st.fl !== 'air' && st.sp !== 'contact') {
    const trig = P.model === 'size' ? ev.size54 : ev.rate;
    const wr = P.model === 'size' ? ev.size49 : ev.rate;
    if (wr != null && st.fl === 'rest') { st.fl = 'wing'; ev.wr = st.t; }
    if (trig != null && st.t >= trig + DATA.fly.toDelay) { st.fl = 'air'; ev.to = st.t; }
  }
  // 測った近づき方の範囲（l/|v| 5〜80ms）の外か
  st.outside = isFinite(st.lv) && (st.lv > DATA.fly.lvMax || st.lv < DATA.fly.lvMin);
}

function done(st) {
  if (st.sp === 'contact') return st.t - st.ev.contact > 0.15;
  if (st.fl === 'air') return st.t - st.ev.to > 0.4;
  return false;
}

// 結果: 'caught'／'escaped'／'close'（差が測った数のばらつき SD 11ms より小さい）
function verdict(st) {
  const ev = st.ev;
  if (ev.to != null && ev.contact != null) {
    const m = ev.contact - ev.to;
    if (Math.abs(m) < DATA.fly.toSD) return { k: 'close', m };
    return { k: m > 0 ? 'escaped' : 'caught', m };
  }
  if (ev.to != null && st.sp !== 'flight' && st.sp !== 'prep') return { k: ev.pounce == null ? 'early' : 'escaped', m: null };
  if (ev.contact != null) return { k: 'caught', m: null };
  return null;
}

// 最後まで計算する（verify 用）
function run(P, dt = 0.0005, tMax = 30) {
  const st = newState(P);
  while (!done(st) && st.t < tMax) step(st, P, dt);
  return st;
}

const API = { DATA, angSize, angRate, stalkV, jumpAngle, newState, step, done, verdict, run, V26 };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.M = API;
})(typeof window !== 'undefined' ? window : globalThis);
