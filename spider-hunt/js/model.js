// クモがハエをつかまえるまで — 計算（描画とは別。Node でも読める: tools/verify.js）
// 長さは mm、時間は s。数の出どころは各行のコメントと PLAN.md 2章。
'use strict';
(function (root) {

const DATA = {
  // ゼブラハエトリ（Salticus scenicus、オス 8〜10mm）。Dill 1975, Can. J. Zool. 53:1284
  spider: {
    S: 7,              // 正面から見た大きさ（Dill が仮定した値）
    crouchS: 4.5,      // 低くかがんだときの大きさ（推定。Dill は近づきの後半で台に体をふせると書くが、大きさは測っていない）
    crouchBelow: 26,   // かがむのは近づきの後半（推定。図3の測った範囲の端に合わせた）
    orientDeg: 5.5,    // 横の目に映る動く物がこの角度をこえると向きを変える（Dill 1975）
    turnT: 0.25,       // 振り向くのにかかる時間（目安。体ごと素早く向きを変える: Land 1972 ほか。時間の数は確かめていない）
    pounceD: 11.6,     // 跳びつく距離の平均（ハエの模型。Dill 1975）
    vFitMax: 26,       // 速さの式を測った範囲（9〜26mm。Dill 1975 図4）
    bodyLen: 9,
    reach: 2,          // 跳ぶとき前脚を斜め前へ広げる（Dill 1975）。体の前のはしより前に届く長さ（目安）
    stride: 3,         // 歩幅（目安。体長の約1/3）
  },
  // 跳躍。Phidippus regius（15mm）。Nabawy ほか 2018, Sci. Rep. 8:7142（2体長の跳躍の値 0.52m/s）。
  // 踏み切り＝脚で台を押して体を速めているあいだ（体は前へ進む）。押す距離（stroke）は論文に数がなく、速さと時間からの逆算（8〜9mm、
  // P. regius 15mm）を体の大きさ 9mm に合わせて縮めた 5mm（推定）。一様に速めるとして、踏み切りの時間 = 2×stroke/v
  jump: { v: 0.52 * 1000, stroke: 5 },
};
DATA.jump.prep = 2 * DATA.jump.stroke / DATA.jump.v;
// 1回ごとにふる不確かさ。跳ぶ速さ・押す距離・前脚の届く長さは目安の幅、しきい値・遅れは論文の平均±SD
const UNC = { v: [420, 620], stroke: [3, 7], reach: [1, 3] };
function sampleParams(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  const U = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x % 1000003) / 1000003; };
  const G = () => { const u = Math.max(1e-9, U()), v = U(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const L = ([a, b]) => a + (b - a) * U();
  const v = L(UNC.v), stroke = L(UNC.stroke);
  return { v, stroke, tp: 2 * stroke / v, reach: L(UNC.reach),
    wrDeg: 49 + 4 * G(), toDeg: 54 + 5 * G(), dly: Math.max(0, 0.006 + 0.011 * G()), lat: Math.max(0.015, 0.025 + 0.002 * G()),
    latW: L([0.011, 0.058]), run: L([0.050, 0.075]) };
}

// 獲物（ハエトリグモが食べるもの）。足すときはここに1つ足し、spider-draw.js の drawPrey と、
// 逃げのきっかけ（kind: 'vision' 目で見て／'wind' 空気の流れで）を決める。
// 逃げ: ショウジョウバエの測定。Fotowat ほか 2009, J. Neurophysiol. 102:875（図2）
const FLY_ESCAPE = {
  kind: 'vision',
  wrDeg: 49,       // 翅を上げる見かけの大きさ（SD 4°）
  toDeg: 54,       // 飛び立つ見かけの大きさ（SD 5°）
  toDelay: 0.006,  // 54° から飛び立つ（脚が離れる）までの遅れ（SD 11ms）
  toSD: 0.011,
  minLat: 0.025,   // いちばん速い反応: 刺激が始まってから飛び立つまで 25ms（SD 2ms）。明かりを消したときの値で、ふくらむ刺激でも同じとしたのは推定（同じ Fotowat 2009）
  minSD: 0.002,
  lvMin: 0.005, lvMax: 0.080, // 測った近づき方の範囲（l/|v| = 5〜80ms）
  rateTh: 0.3,     // ふくらむ速さのしきい値（Dill 1975 図4 の仮定。ハエで測った数ではない）
};
const PREY = {
  housefly: {
    name: 'イエバエ', ready: true, draw: 'fly', borrowed: true, // 逃げの数はショウジョウバエから借りる
    len: 7, wid: 3, hgt: 3,  // 体長・幅・高さ（目安）
    pounceD: 11.6,           // ハエの模型（幅 7.1mm）への跳びつく距離（Dill 1975）
    eye: { ommDeg: 3, label: 'ハエの目' }, // 個眼の向きの間隔（目安。2〜4°とする資料があるが、書誌を確かめきれていない）
    escape: FLY_ESCAPE,
  },
  drosophila: {
    name: 'コバエ（ショウジョウバエ）', short: 'コバエ', ready: true, draw: 'fly',
    len: 2.5, wid: 1, hgt: 1, // 目安
    pounceD: 14.5,           // 2.1mm の玉への跳びつく距離（Dill 1975。ゼブラハエトリはショウジョウバエで飼われていた）
    eye: { ommDeg: 5, label: 'コバエの目' }, // 個眼の間隔（目安。イエバエより粗い）
    escape: FLY_ESCAPE,      // 測ったのがショウジョウバエそのもの
  },
  roach: {
    name: '小さなゴキブリ', short: 'ゴキブリ', ready: true, draw: 'roach', borrowed: true,
    len: 6, wid: 3, hgt: 1.8, // チャバネゴキブリの若い幼虫くらい（目安）
    pounceD: 11.6,           // ハエの模型と同じとした（推定）
    eye: { ommDeg: 3, label: 'ゴキブリの目' }, // 目安。逃げには目を使わない（Camhi ほか 1978）
    // 逃げ: 尾の毛（尾角）で空気の流れを感じる。ワモンゴキブリ（成虫）の測定を借りる。Camhi, Tom & Volman 1978, J. Comp. Physiol. 128:203
    escape: {
      kind: 'wind',
      // クモが体を押し出しはじめる（踏み切り）と空気が急に動く。ゆっくり一定の忍び寄りは空気の加速がほぼなく、気づかれにくい
      // （風の加速度で走り出す: Plummer & Camhi 1981 の二次資料。ゆっくりの接近が成功しやすい: Dangles ほか 2006）。風の強さそのものは計算しない
      accTh: 600,      // 走り出しを起こす空気の加速度 mm/s²（二次資料。目安）
      latency: 0.058,  // 風を受けてから動き出すまで（54〜58ms: Camhi ほか 1978。もっと短い 11ms という二次資料もある）
      latMin: 0.011,
      run: 0.050,      // 体の向きを変えはじめてから走り出すまで（50〜75ms のうち短いほう: Camhi ほか 1978）
      toSD: 0.015,     // ばらつき（目安。論文は平均だけ）
    },
  },
  silverfish: { name: 'シミ（紙魚）', ready: false }, // 準備中: 逃げのきっかけを測った研究が見つからない
};
const prey = P => PREY[P.prey] && PREY[P.prey].ready ? PREY[P.prey] : PREY.housefly;

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
function jumpAngle(R, v = DATA.jump.v) {
  const g = 9810, s = g * R / (v * v);
  return s >= 1 ? Math.PI / 4 : 0.5 * Math.asin(s);
}

function newState(P, seed = 1) {
  const D0 = prey(P).len / 2 / Math.tan(DATA.spider.orientDeg / 2 * Math.PI / 180); // 獲物が 5.5° に見える距離（イエバエで約 73mm）
  return {
    t: 0, D: D0, D0, V: 0, h: 0,      // h: 跳んでいるときの高さ
    sp: 'turn', spT: 0, yaw: 1,       // turn（振り向く）→ stalk → prep → flight → contact／stop。yaw: 1＝横向き、0＝獲物の方
    fl: 'rest',                       // rest → wing → air
    jump: null,
    ev: {},                           // できごとの時刻: stalk, pounce, contact, wr, to, toPlan（飛び立つ予定）, size49, size54, rate, wind
    th: 0, rate: 0, wind: 0, alert: 0, S: DATA.spider.S, lv: 0, outside: false,
    seed, prm: sampleParams(seed),    // この1回の数
  };
}

// 1歩すすめる（dt は小さく。main は 0.5ms）
function step(st, P, dt) {
  const sd = DATA.spider, ev = st.ev, es = prey(P).escape;
  st.t += dt;
  st.S = (P.crouch && st.sp === 'stalk' && st.D < sd.crouchBelow) || (P.crouch && st.sp === 'prep') ? sd.crouchS : sd.S;
  if (st.sp === 'turn') {
    st.V = 0; st.spT += dt; st.yaw = Math.max(0, 1 - st.spT / sd.turnT);
    if (st.spT >= sd.turnT) { st.sp = 'stalk'; st.yaw = 0; ev.stalk = st.t; }
  } else if (st.sp === 'stalk') {
    if (st.fl === 'air') { st.sp = 'stop'; st.V = 0; }
    else {
      st.V = stalkV(P, st.D);
      st.D -= st.V * dt;
      const pd = prey(P).pounceD;
      if (st.D <= pd) { st.D = pd; st.Dp = pd; st.sp = 'prep'; st.spT = 0; ev.pounce = st.t; st.V = 0; }
    }
  } else if (st.sp === 'prep') {
    // 踏み切り: 脚で押して一様に速める（体は前へ進む）
    const J = st.prm, acc = J.v * J.v / (2 * J.stroke);
    st.spT += dt; const tau = Math.min(st.spT, J.tp);
    st.D = st.Dp - 0.5 * acc * tau * tau; st.V = acc * tau;
    if (st.spT >= J.tp) {
      const a = jumpAngle(st.D, J.v);
      st.jump = { a, R: st.D, vx: J.v * Math.cos(a), vy: J.v * Math.sin(a), t0: st.t, D0: st.D };
      st.sp = 'flight';
    }
  } else if (st.sp === 'flight') {
    const j = st.jump, tau = st.t - j.t0;
    st.V = j.vx;
    st.D = Math.max(0, j.D0 - j.vx * tau);
    st.h = Math.max(0, j.vy * tau - 0.5 * 9810 * tau * tau);
    if (ev.reach == null && st.D <= st.prm.reach) ev.reach = st.t;                // 前脚が獲物にとどく
    if (st.D <= 0) { st.sp = 'contact'; st.V = 0; st.h = 0; ev.contact = st.t; }
  } else { st.V = 0; }

  // 獲物の目に映るクモ（振り向いているあいだは近づいていない）
  if (st.D > 0) {
    st.th = angSize(st.S, st.D);
    st.rate = st.V > 0 ? angRate(st.S, st.D, st.V) : 0;
    st.lv = st.V > 0 ? (st.S / 2) / st.V : Infinity;  // 近づき方の速さ l/|v|（s）
  }
  // クモの体の加速度（空気を急に動かすか）。踏み切り（体を押し出しはじめる）は急な加速とみなす
  // 遠くの動きの風は獲物まで届かないので、近く（体長の約2倍＝20mm 以内。目安）だけ数える。歩き出しの速さのとびは計算の都合なので数えない
  const near = st.D < 20;
  st.acc = !near ? 0 : st.sp === 'prep' ? Infinity : st.sp === 'stalk' && st.Vprev ? Math.abs(st.V - st.Vprev) / dt : 0;
  st.Vprev = st.sp === 'stalk' ? st.V : 0;
  const deg = st.th * 180 / Math.PI;
  if (es.kind === 'vision') {
    // 2つのモデルの「しきい値をこえた時刻」は、選んでいないほうも記録する
    if (ev.size49 == null && deg >= st.prm.wrDeg) ev.size49 = st.t;
    if (ev.size54 == null && deg >= st.prm.toDeg) { ev.size54 = st.t; ev.lv54 = st.lv; }
    if (ev.rate == null && st.rate >= es.rateTh) { ev.rate = st.t; ev.lvRate = st.lv; }
    st.alert = P.model === 'size' ? deg / st.prm.toDeg : st.rate / es.rateTh;   // 警戒度（しきい値で 1）
    const trig = P.model === 'size' ? ev.size54 : ev.rate, wr = P.model === 'size' ? ev.size49 : ev.rate;
    if (wr != null && ev.wr == null && st.sp !== 'contact') { ev.wr = st.t; }
    if (trig != null && ev.toPlan == null) {
      // 体が反応できるいちばん早い時刻: 急な変化が始まった時刻（跳んでいるあいだに気づいたなら跳び始め）＋ 25ms
      const onset = ev.pounce != null && trig >= ev.pounce ? ev.pounce : trig;   // 跳びはじめ（踏み切りの始まり）にそろえる
      const fit = trig + st.prm.dly, floor = onset + st.prm.lat;
      ev.toPlan = Math.max(fit, floor); ev.floorBound = floor >= fit; ev.trig = trig;
    }
  } else {
    if (ev.wind == null && st.acc >= es.accTh) ev.wind = st.t;
    st.alert = Math.min(2, st.acc / es.accTh);
    if (ev.wind != null && ev.toPlan == null) { ev.trig = ev.wind; ev.wrPlan = ev.wind + st.prm.latW; ev.toPlan = ev.wrPlan + st.prm.run; }
    if (ev.wrPlan != null && ev.wr == null && st.t >= ev.wrPlan && st.sp !== 'contact') ev.wr = st.t;   // 体の向きを変えはじめる
  }
  // 獲物のふるまい（とどかれたあとは動かない）
  if (st.fl !== 'air' && st.sp !== 'contact' && ev.reach == null) {
    if (ev.wr != null && st.fl === 'rest') st.fl = 'wing';
    if (ev.toPlan != null && st.t >= ev.toPlan) { st.fl = 'air'; ev.to = st.t; }
  }
  // 測った近づき方の範囲（l/|v| 5〜80ms）の外か（目で見る獲物だけ）
  st.outside = es.kind === 'vision' && isFinite(st.lv) && (st.lv > es.lvMax || st.lv < es.lvMin);
}

function done(st) {
  if (st.sp === 'contact') return st.t - st.ev.contact > 0.15;
  if (st.fl === 'air') return st.t - st.ev.to > 0.4;
  return false;
}

// 正規分布の累積（verify で使う）
function phi(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; }

// 跳躍の勝負を、不確かな数をふって何度も計算する（N 回）。返り値は つかまえた割合 と、とどく・逃げる時刻の中央値（跳びはじめから）
function race(P, st, N = 400) {
  const pr = prey(P), es = pr.escape, sd = DATA.spider, ev = st.ev;
  const pre = es.kind === 'vision' && ev.trig != null && ev.trig < ev.pounce; // 跳ぶ前にもう気づいていた
  let caught = 0;
  for (let n = 0; n < N; n++) {
    const q = sampleParams(1000 + n), acc = q.v * q.v / (2 * q.stroke), Sj = P.crouch ? sd.crouchS : sd.S;
    let tTo = Infinity, tCon = Infinity;
    if (es.kind === 'wind') tTo = q.latW + q.run;
    else if (pre) tTo = Math.max(ev.trig - ev.pounce + q.dly, ev.trig - ev.pounce + q.lat);
    let trig = null;
    for (let t = 0; t < 0.2; t += 0.0002) {
      let D, V, S;
      if (t < q.tp) { D = pr.pounceD - 0.5 * acc * t * t; V = acc * t; S = Sj; }
      else { D = pr.pounceD - q.stroke - q.v * (t - q.tp); V = q.v; S = sd.S; }
      if (D <= q.reach) { tCon = t; break; }
      if (es.kind === 'vision' && !pre && trig == null) {
        const hit = P.model === 'size' ? angSize(S, D) * 180 / Math.PI >= q.toDeg : angRate(S, D, V) >= es.rateTh;
        if (hit) { trig = t; tTo = Math.max(t + q.dly, q.lat); }
      }
    }
    if (tCon < tTo) caught++;
  }
  return { p: caught / N };
}

// 結果: k＝この1回の結果（'caught'／'escaped'／'early' 跳ぶ前に逃げた）、p＝何度もくり返したときに、つかまえる割合
// m＝前脚がとどく時刻 − 逃げはじめた時刻（この1回。正なら獲物が先）
function verdict(st, P) {
  const ev = st.ev;
  if (ev.to != null && ev.pounce == null) return { k: 'early', m: null, p: 0 };
  if (ev.pounce == null) return null;
  const key = JSON.stringify(P);
  if (!st._race || st._raceKey !== key) { st._race = race(P, st); st._raceKey = key; }
  const p = st._race.p;
  if (ev.reach != null && (ev.to == null || ev.reach < ev.to)) return { k: 'caught', m: ev.to != null ? ev.reach - ev.to : null, p };
  if (ev.to != null) return { k: 'escaped', m: ev.reach != null ? ev.reach - ev.to : null, p };
  return { k: null, m: null, p, pending: true };
}

// 最後まで計算する（verify 用）
function run(P, dt = 0.0005, tMax = 30, seed = 1) {
  const st = newState(P, seed);
  while (!done(st) && st.t < tMax) step(st, P, dt);
  return st;
}

const API = { DATA, PREY, prey, phi, race, UNC, sampleParams, angSize, angRate, stalkV, jumpAngle, newState, step, done, verdict, run, V26 };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.M = API;
})(typeof window !== 'undefined' ? window : globalThis);
