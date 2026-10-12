// 変化球のしくみ — 状態・球種の例・部分の説明・案内
'use strict';

// 球種の例（右投げ）。速さ km/h・回転数 rpm・回転の向き dir（捕手から見て「手前の面が動く向き」の時計の角度°）・使える回転の割合 eff
// 値は MLB の平均的な値の目安（Statcast の記事・Driveline 2021）。変化の向きは、この回転から計算で決まる
// 左投げは、捕手から見て左右を入れかえる（放す位置 x・回転の向き・回転軸。mirrorP）
const PITCHES = [
  { id: 'ff', name: 'フォーシーム', v0: 151, rpm: 2300, dir: 330, eff: 0.90, grip: '4S', note: 'いわゆるストレート。逆回転（バックスピン）で、上向きの力を受けて「落ちにくい」' },
  { id: 'si', name: 'ツーシーム・シュート', v0: 150, rpm: 2150, dir: 330, eff: 0.85, grip: '2S', note: '回転の向きはまっすぐとほぼ同じ。2つの縫い目の握りで後ろの流れがずれ、投げる腕の側へ曲がりながら少し沈む' },
  { id: 'fc', name: 'カットボール', v0: 145, rpm: 2350, dir: 30, eff: 0.50, note: 'まっすぐに近い速さで、グラブの側へ少しだけずれる' },
  { id: 'sl', name: 'スライダー', v0: 138, rpm: 2400, dir: 80, eff: 0.30, note: '回転数は多いのに、使える回転は3割ほど。のこりはジャイロ回転で、曲げる力にならない' },
  { id: 'st', name: 'スイーパー', v0: 133, rpm: 2500, dir: 90, eff: 0.50, note: '横へ大きく曲がるスライダー（値の目安はとくに大まか）' },
  { id: 'cu', name: 'カーブ', v0: 129, rpm: 2500, dir: 145, eff: 0.55, note: '前向きの回転（トップスピン）で、下向きの力を受けて重力より速く落ちる' },
  { id: 'ch', name: 'チェンジアップ', v0: 135, rpm: 1750, dir: 320, eff: 0.88, grip: '2S', note: '腕の振りはまっすぐと同じで遅い。回転も少なく、上向きの力が小さい' },
  { id: 'fs', name: 'フォーク・スプリット', v0: 137, rpm: 1400, dir: 290, eff: 0.75, note: '回転がとても少ない。上向きの力が小さいので、まっすぐより下を通る' },
  { id: 'gy', name: 'ジャイロボール', v0: 140, rpm: 2400, dir: 90, eff: 0.0, note: '回転の軸が進む向きと同じ（弾丸の回転）。たくさん回っていても曲がらない' },
  { id: 'kn', name: 'ナックル', v0: 115, rpm: 30, knuckle: true, axisDeg: 0, seam0: 20, grip: '2S', note: 'ほとんど回らない。曲げるのは回転ではなく、縫い目にかかる横の力' },
  { id: 'no', name: '回転なし', v0: 145, rpm: 0, dir: 0, eff: 1, note: '回転がなければマグヌス力は 0。重力と空気の抵抗だけ' },
];

const RELEASE = { x0: -0.55, z0: 1.80, ext: 1.90 };   // 右投げのおおよその放す位置（捕手から見て左・高さ 1.8 m・投手板から 1.9 m 前）
// ストライクゾーン（幅 17 インチ）。高さは打者で変わる: 規則では「ひざの下のくぼみ」から「肩の上とズボンの上の中間」まで（構えた姿勢で）。
// ここでは身長 H に比べた目安 下 0.255H・上 0.575H（H = 185 cm で 0.47〜1.06 m。よく目安に使われる 1.5〜3.5 ft ＝ 0.46〜1.07 m に近い）
const ZONE = { x: 0.2159, zLo: 0.47, zHi: 1.06, zMid: 0.765 };
function setZoneFor(Hcm) {
  const H = Hcm / 100;
  ZONE.zLo = 0.255 * H; ZONE.zHi = 0.575 * H; ZONE.zMid = (ZONE.zLo + ZONE.zHi) / 2;
  if (typeof TARGET !== 'undefined') TARGET.z = ZONE.zMid;
  if (typeof BAT !== 'undefined') BAT.eye.z = 0.81 * H;   // 構えたときの目の高さ（目安）
}

const S = {
  pitch: 'ff',
  P: null,                 // いまの投げ方（launch の入力）
  aimMode: 'plain',        // ねらい方: plain = 回転の力がなければまん中に届く向き、line = まん中へまっすぐ向ける、fit = この球がまん中に届くよう合わせる、manual = 角度のつまみ
  hand: 'R',               // 'R' 右投げ・'L' 左投げ
  view: '3d', cam: 'catcher',
  pitcher: 'std',          // 投手の例（pitchers.js）
  arm: 45,                 // 腕の角度（度）。投手の例の値から変えると、放す位置と回転の向きが変わる
  overlay: false, overlayAim: 'center', multi: null,   // 球種を重ねて見る（center = みんなゾーンのまん中へ、same = いまの球と同じ向きに放す）
  env: { tC: 20, elev: 0, p: 1013, rh: 50, ws: 0, wd: 0 }, envId: 'std',   // 段階C: 空気と風
  batSide: 'R', batH: 185, swingMs: 150, delayMs: 150,   // 段階E: 打者（右打者・スイングの時間・決めてから振り始めるまで）
  t: 0, playing: false, speed: 1 / 5,
  show: { noAir: true, plain: true, forces: true, std: true },
  res: null, ghostNoAir: null, ghostPlain: null,
  many: null,              // ナックル10球
  tour: 0,
  hover: null,
};

function presetP(id) {
  const ars = arsenal(S.pitcher), k = ars.find(p => p.id === id) || ars[0];
  const pr = pitcherOf(S.pitcher), rel = releaseFor(S.arm);
  const P = Object.assign({ vAng: -1, hAng: 1.5, knuckle: false, seam0: 0, axisDeg: 0, dir: 0, eff: 1, grip: null }, pr.release, k, { name: undefined, note: undefined, id: undefined });
  // 腕の角度を投手の例から変えたとき: 放す位置は表から、回転の向きは同じだけ回す（回転の向きは腕の角度でほぼ決まる。Nathan 2023）
  if (S.arm !== pr.arm) { P.x0 = -rel.x; P.z0 = rel.z; if (!P.knuckle) P.dir = ((P.dir + S.arm - pr.arm) % 360 + 360) % 360; }
  return S.hand === 'L' ? mirrorP(P) : P;
}
// 空気と風を計算の入力（PHY.env）にする
function isStdEnv() { const e = S.env; return e.tC === 20 && e.elev === 0 && e.p === 1013 && e.rh === 50 && e.ws === 0; }
function applyEnv() {
  const e = S.env;
  PHY.env = { rho: airDensity(e.tC, e.elev, e.p, e.rh), wind: windVec(e.ws, e.wd) };
}
function setEnv(id) {
  const k = ENVS.find(q => q.id === id); if (!k) return;
  S.envId = id; S.env = { tC: k.tC, elev: k.elev, p: k.p, rh: k.rh, ws: k.ws, wd: k.wd };
  applyEnv(); S.many = null; recompute();
}
function setPitcher(id) {
  const pr = pitcherOf(id);
  S.pitcher = pr.id; S.hand = pr.hand; S.arm = pr.arm;
  setPitch(arsenal(pr.id)[0].id);
}
// 左右の入れかえ（捕手から見た鏡うつし）: 放す位置・左右の角度・回転の向き・ナックルの回転軸
function mirrorP(P) {
  P.x0 = -P.x0; P.hAng = -P.hAng;
  P.dir = (360 - P.dir) % 360;
  P.axisDeg = (180 - P.axisDeg) % 180;
  return P;
}
// 腕の角度を変える（いまの球の放す位置と回転の向きを、同じだけ動かす）
function setArm(a) {
  const d = a - S.arm, rel = releaseFor(a), sg = S.hand === 'R' ? 1 : -1;
  S.arm = a;
  S.P.x0 = -sg * rel.x; S.P.z0 = rel.z;
  if (!S.P.knuckle) S.P.dir = ((S.P.dir + sg * d) % 360 + 360) % 360;
  S.many = null; recompute();
}
function setHand(h) {
  if (h === S.hand) return;
  S.hand = h; mirrorP(S.P); S.many = null; recompute();
}
// 腕の側（右投げは捕手から見て左 = −x）
const armSign = () => S.hand === 'R' ? -1 : 1;

// 計算しなおす（ねらい → 本番・比べる道すじ）
// ねらい方に合わせて放す角度を決める
const TARGET = { x: 0, z: ZONE.zMid };   // ねらった点（「回転がなければ通る点」の印。ドラッグで動かせる）
// ねらった点を動かす: 「回転がなければここを通る」向きに放しなおす
function setTarget(x, z) {
  TARGET.x = Math.max(-0.9, Math.min(0.9, x)); TARGET.z = Math.max(0.1, Math.min(2.0, z));
  S.aimMode = 'plain'; S.many = null; recompute();
}
function aimP(P, mode) {
  if (mode === 'fit') Object.assign(P, aim(P, TARGET));
  else if (mode === 'plain') Object.assign(P, aim(P, TARGET, { air: true, magnus: false, seam: false }));
  else if (mode === 'line') {
    const d = PHY.rubberY - P.ext - PHY.plateY;
    P.vAng = Math.atan2(TARGET.z - P.z0, d) * 180 / Math.PI; P.hAng = Math.atan2(TARGET.x - P.x0, d) * 180 / Math.PI;
  }
  return P;
}
function recompute() {
  aimP(S.P, S.aimMode);
  S.res = simulate(S.P);
  S.ghostNoAir = simulate(S.P, { air: false, magnus: false, seam: false });
  S.ghostPlain = simulate(S.P, { air: true, magnus: false, seam: false });
  S.mv = movement(S.res, S.ghostPlain);
  // ふつうの空気（20 ℃・海面・無風）で同じように放したとき
  S.ghostStd = isStdEnv() ? null : simulate(S.P, undefined, STD_ENV);
  // 段階F: 小さな効果のそれぞれを外したら、ホームでの位置が何 mm 変わるか。揚力の係数の式を変えたら何 cm 変わるか
  S.fine = {};
  for (const k of ['decay', 'buoy', 'added', 'coriolis']) {
    const fx = Object.assign({}, PHY.fx); fx[k] = !fx[k];
    const r2 = simulate(S.P, { air: true, magnus: true, seam: true, fx });
    S.fine[k] = Math.hypot(r2.pPlate[0] - S.res.pPlate[0], r2.pPlate[2] - S.res.pPlate[2]) * 1000;
  }
  { const keep = PHY.clModel; PHY.clModel = keep === 'nathan' ? 'sawicki' : 'nathan';
    const r2 = simulate(S.P); PHY.clModel = keep;
    S.clAlt = { dx: (r2.pPlate[0] - S.res.pPlate[0]) * 100, dz: (r2.pPlate[2] - S.res.pPlate[2]) * 100 }; }
  // 球種を重ねる: その投手のほかの球種も、同じ投げる手・同じ空気で
  S.multi = null;
  if (S.overlay) {
    S.multi = arsenal(S.pitcher).filter(k => k.id !== S.pitch).map(k => {
      const Q = presetP(k.id);
      if (S.overlayAim === 'same') { Q.vAng = S.P.vAng; Q.hAng = S.P.hAng; }
      else aimP(Q, S.aimMode === 'manual' ? 'plain' : S.aimMode);
      return { id: k.id, name: k.name, col: PCOL[k.id], res: simulate(Q) };
    });
  }
  if (S.t > tEnd()) S.t = tEnd();
}
// 時間のつまみの終わり（重ねた球・10球のうちいちばん遅くホームに着く時刻）
function tEnd() {
  let t = S.res.tStop;
  for (const m of S.multi || []) t = Math.max(t, m.res.tStop);
  for (const r of S.many || []) t = Math.max(t, r.tStop);
  return t;
}

// ナックル10球: 同じねらいで、縫い目の向き ±20°・回転数 0〜2倍・回転軸の向き ±90° の中でばらつかせる（決まった乱数。幅はこのアプリの仮定）
function throwMany() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  S.many = [];
  for (let i = 0; i < 10; i++) {
    const Q = Object.assign({}, S.P, {
      seam0: S.P.seam0 + (rnd() * 2 - 1) * 20,
      rpm: Math.max(0, S.P.rpm * (1 + (rnd() * 2 - 1))),
      axisDeg: S.P.axisDeg + (rnd() * 2 - 1) * 90,
    });
    S.many.push(simulate(Q));
  }
}

function setPitch(id, keepTime) {
  S.pitch = id; S.P = presetP(id); if (S.aimMode === 'manual') S.aimMode = 'plain'; S.many = null;
  if (!keepTime) S.t = 0;
  recompute();
}

// 部分の説明（マウスをのせると出る）
const PARTS = {
  path: '計算した道すじ。重力・空気の抵抗・回転の力（ナックルは縫い目の力も）を 1 ミリ秒ごとに足し合わせて、ボールの動きを解いています。',
  noAir: '空気がないとき（重力だけ）の道すじ。放物線になります。月の上で投げるとこうなります。',
  plain: '回転の力も縫い目の力もないとき（重力と空気の抵抗だけ）の道すじ。これとのずれが「変化量」です。',
  decide: '振ると決める最後の点（緑の輪）。ここから先の変化を見てから決めても、スイングが間に合わない（決めてから振り始めるまで・スイングの時間は下のつまみ）。',
  track: '目で追えなくなる点（白の輪）。打者の目から見たボールの動きが 70°/秒をこえ、目で滑らかに追えなくなる（Bahill & LaRitz 1984）。',
  plainMark: '回転がなければ通る点（白い輪）。ドラッグすると、ここへ回転の力なしで届く向きに放しなおします。実際の球は、回転と縫い目の力のぶんだけずれた所を通ります。',
  realMark: 'ボールが実際にホームを通った点。白い輪からのずれが、回転と縫い目による変化です。',
  target: 'ねらった点（ゾーンのまん中）。「ねらい方」で、この点へどう向けて放すかを変えられます。',
  zone: 'ストライクゾーン（幅 43 cm。高さは打者の体で変わるので目安）。',
  ball: 'いまの時刻のボール。矢印は働いている力です。',
  grav: '重力 mg = 1.42 N。いつも真下。',
  drag: '空気の抵抗（抗力）。進む向きと逆向きで、速さの2乗に比例します。ボールはホームまでに 1 割ほど遅くなります。',
  magnus: '回転による力（マグヌス力）。回転のうち、進む向きに直角な成分だけが生みます。向きは「捕手から見て手前の面が動く向き」。',
  seam: '縫い目の力。ナックルでは縫い目の向きで空気がはがれる場所が左右でずれ、横向きの力になります（風洞の測定）。まっすぐ・ツーシーム・チェンジアップでは、握りの縫い目で後ろの流れがずれる力（Seam-Shifted Wake。大きさは MLB の測定の平均に合わせた目安）。',
  plate: 'ホームベースの前の端。ここを通るときの位置と速さを計算しています。',
  rubber: '投手板。ボールは板より 1.9 m ほど前で手から放れます。',
  many: '同じねらいで、縫い目の向き（±20°）・ゆっくりした回転の量（毎分 0〜60 回）・回転軸の向きだけをばらつかせた10球（ばらつきの幅はこのアプリの仮定）。1球ずつの道すじはなめらかなのに、行き先はばらばらです。',
  axis: '回転軸（右手の親指の向き。指の曲がる向きに回る）。',
};

// 3D のカメラを切りかえる（3D が使えないときは何もしない）
function camTo(id) { if (typeof V3 !== 'undefined' && V3.ok) setCam(id); else S.cam = id; }

// 案内（「つぎへ」ボタン1つで進む）。go は状態を作る関数
const TOUR = [
  { text: 'ボールに働く力は3つ。<b>重力</b>・<b>空気の抵抗</b>・<b>回転による力</b>。球種の名前で曲がり方を決めず、放す速さ・向き・回転から、この力を 1 ミリ秒ごとに計算して道すじを解いています。下の時間のつまみを動かしてみよう。3D の図はドラッグで回せます。',
    go() { setPitch('ff'); S.show = { noAir: false, plain: false, forces: true }; S.t = 0; camTo('catcher'); } },
  { text: 'もし空気がなかったら（<span class="k-noair">うすい線</span>）。重力だけなので放物線。151 km/h でも、ホームまでの 0.4 秒で 80 cm ほど落ちます。',
    go() { setPitch('no'); S.show = { noAir: true, plain: false, forces: true }; S.t = 0; } },
  { text: '空気があると、<b>抵抗</b>で遅くなります（ホームで約 1 割減）。でも回転がなければ、左右にも上にも曲がりません。',
    go() { setPitch('no'); S.show = { noAir: true, plain: false, forces: true }; S.t = 0; } },
  { text: '<b>フォーシーム</b>: 毎分 2300 回の逆回転。手前の面が上へ動く回転は、空気を下へ押しやり、反作用で<b>上向きの力（マグヌス力）</b>を受けます。回転なし（<span class="k-plain">点線</span>）より 45 cm ほど上を通る ＝「ホップするように見える」正体。',
    go() { setPitch('ff'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; camTo('ball'); } },
  { text: '<b>ねらった点</b>（十字）: いまは「回転の力がなければまん中に届く向き」に放しています。だから<b>まん中からのずれ ＝ 回転と縫い目による変化</b>。まっすぐは上へ 46 cm、ゾーンの上をこえます。下の「ねらい方」で「まん中へまっすぐ向けて放す」にすると、重力で落ちるぶんもずれに入ります。',
    go() { setPitch('ff'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; camTo('catcher'); } },
  { text: '<b>空気の流れの断面</b>の図: ボールといっしょに動いて見ると、空気は左から右へ流れていきます。逆回転で上の面は空気といっしょに動くので、空気がボールから<b>はがれる所</b>が上だけ後ろへずれ、後ろの流れ（伴流）が下へ曲がります。空気を下へ押しやった反作用で、ボールは上へ押される。これがマグヌス力です。3D は「ボールの後ろ」から。',
    go() { setPitch('ff'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; camTo('ball'); } },
  { text: '<b>スライダー</b>: 回転数はフォーシームより多いのに、曲がりは小さめ。回転軸が進む向きに近く（ジャイロ回転）、曲げるのに使える回転は 3 割ほどだから。下の「使える回転」を 100% にすると…？',
    go() { setPitch('sl'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; } },
  { text: '<b>カーブ</b>: 手前の面が下へ動く回転（トップスピン）。マグヌス力が下向きで、重力に足されてよく落ちます。遅いので、ホームまでの時間も長い（0.47 秒）。',
    go() { setPitch('cu'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; } },
  { text: '<b>ナックル</b>: ほとんど回らないので、マグヌス力はほぼ 0。かわりに<b>縫い目の向き</b>で、空気がはがれる場所が左右でずれ、横向きの力が生まれます。いまは多くのナックルの投手と同じ<b>2つの縫い目</b>の握りで、力は風洞の測定（Morrissey 2009）の値です。ゆっくり回ると、飛ぶ間に力の向きと大きさが入れかわります。「縫い目の向き」で4つの縫い目（Watts &amp; Sawyer 1975）にも変えられます。',
    go() { setPitch('kn'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; camTo('pitcher'); } },
  { text: '同じねらいで、縫い目の向き・ゆっくりした回転の量と軸だけを、投手がそろえきれない程度にばらつかせた<b>10球</b>。ホームでの行き先がばらばら。でも1球ずつの道すじは<b>なめらか</b>です。試合の測定でも同じ（Nathan 2012）。ナックルが「揺れる」と感じるのは、<b>小さな差で行き先が大きく変わり、だれにも読めない</b>から、と考えられています。',
    go() { setPitch('kn'); S.show = { noAir: false, plain: false, forces: false }; throwMany(); S.t = 0; camTo('catcher'); } },
  { text: '<b>ツーシーム</b>: 回転の向きはまっすぐとほぼ同じなのに（MLB の測定。Nathan 2023）、投げる腕の側へ大きく曲がります。2つの縫い目で握ると、少しのジャイロ回転で<b>片側にいつも縫い目が来て</b>、その側だけ空気のはがれ方が変わり、後ろの流れがずれます（縫い目のずれた伴流）。<span style="color:#5ce0a0">緑の矢印</span>がその力です。',
    go() { setPitch('si'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; camTo('ball'); } },
  { text: '<b>腕の角度</b>: 同じ投手でも、腕を横から振ると放す位置が低く外になり、回転の向きも横に寝ます（回転の向きは腕の角度でほぼ決まる。Nathan 2023）。架空のサイドスローの投手。下の「腕の角度」のつまみを動かすと、人形と道すじがいっしょに変わります。',
    go() { setPitcher('side'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; camTo('pitcher'); } },
  { text: '<b>空気と風</b>: 標高 1600 m の球場では空気が 18% うすく、空気の抵抗もマグヌス力も 18% 小さくなります。フォーシームの変化は上へ 46 → 38 cm。<span class="k-std">水色の線</span>は、ふつうの空気（20 ℃・海面）で同じように放したときです。',
    go() { setPitch('ff'); setEnv('high'); S.show = { noAir: false, plain: false, forces: true, std: true }; S.t = 0; camTo('ball'); } },
  { text: '<b>向かい風</b> 8 m/s: 空気に対する速さが増えるので、抵抗もマグヌス力も大きくなり、よく曲がります（追い風では逆）。力を決めるのは、地面に対する速さではなく<b>空気に対する速さ</b>です。',
    go() { setPitch('ff'); setEnv('head'); S.show = { noAir: false, plain: true, forces: true, std: true }; S.t = 0; camTo('ball'); } },
  { text: '<b>球種を重ねる</b>: 架空の本格派の投手が、4つの球種をまっすぐと<b>同じ向きに</b>放したとき。遅い球ほどホームまでの時間が長く、重力で落ちるぶんが増えるので、カーブは地面まで落ちてしまいます。だから投手は球種ごとに放す向きを変えています（下の「それぞれゾーンのまん中をねらう」に変えてみよう）。',
    go() { S.overlay = true; S.overlayAim = 'same'; setPitcher('power'); S.show = { noAir: false, plain: false, forces: false, std: false }; S.t = 0; camTo('pitcher'); } },
  { text: '<b>打者の目</b>: スイングに 0.15 秒、決めてから振り始めるまでに 0.15 秒かかるとすると、振ると決める最後の時刻は放してから約 0.1 秒（<span style="color:#7fd68a">緑の輪</span>、ホームの約 12 m 手前）。そのときまっすぐは、回転の力なしの道すじから 4 cm しかずれていません。変化の 9 割以上は、決めたあとに起こります。<b>白の輪</b>から先は、目で滑らかに追えない速さ（70°/秒）になります。',
    go() { setPitch('ff'); S.show = { noAir: false, plain: true, forces: false }; S.t = 0; camTo('batter'); } },
  { text: '<b>決める時刻の球種のちがい</b>: 架空の本格派の4球種を、それぞれ「回転の力がなければまん中に届く向き」に放したとき。下の帯の緑が終わる時刻（振ると決める最後）には、打者の目から見て球種どうしは<b>ボール半分ほど</b>（0.17°）しかはなれていないのに、ホームでは最大 <b>1 m</b> はなれます。時間のつまみを緑の終わりに合わせて、打者の目で見くらべてみよう。',
    go() { S.overlay = true; S.overlayAim = 'center'; setPitcher('power'); S.show = { noAir: false, plain: false, forces: false, std: false }; S.t = 0; camTo('batter'); } },
  { text: '<b>本物に近づける</b>: 回転が少しずつ減ること・空気の浮力・まわりの空気もいっしょに動くこと（付加質量）・地球の自転（コリオリの力）も計算に入れています。どれも、ホームでの位置を 1〜2 mm 動かすだけ。答えをいちばん大きく左右するのは、空気の力の係数（測定から作った式）の不確かさで、揚力の式を別の測定のものに変えると 1 cm ほど変わります（下の「本物に近づける」）。',
    go() { setPitch('ff'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0; camTo('ball'); } },
  { text: '自由に試そう。下で投げる手・球種を選び、速さ・回転数・回転の向き（右のボールをドラッグ）・使える回転を変えると、すぐに計算しなおします。',
    go() { setPitch('ff'); S.show = { noAir: true, plain: true, forces: true }; S.t = 0; camTo('catcher'); } },
];
