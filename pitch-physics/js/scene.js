// 変化球のしくみ — 状態・球種の例・部分の説明・案内
'use strict';

// 球種の例（右投げ）。速さ km/h・回転数 rpm・回転の向き dir（捕手から見て「手前の面が動く向き」の時計の角度°）・使える回転の割合 eff
// 値は MLB の平均的な値の目安（Statcast の記事・Driveline 2021）。変化の向きは、この回転から計算で決まる
const PITCHES = [
  { id: 'ff', name: 'フォーシーム', v0: 151, rpm: 2300, dir: 330, eff: 0.90, note: 'いわゆるストレート。逆回転（バックスピン）で、上向きの力を受けて「落ちにくい」' },
  { id: 'si', name: 'ツーシーム・シュート', v0: 150, rpm: 2150, dir: 300, eff: 0.90, note: '回転の軸がフォーシームより傾き、投げる腕の側へずれながら少し沈む' },
  { id: 'fc', name: 'カットボール', v0: 145, rpm: 2350, dir: 30, eff: 0.50, note: 'まっすぐに近い速さで、グラブの側へ少しだけずれる' },
  { id: 'sl', name: 'スライダー', v0: 138, rpm: 2400, dir: 80, eff: 0.30, note: '回転数は多いのに、使える回転は3割ほど。のこりはジャイロ回転で、曲げる力にならない' },
  { id: 'st', name: 'スイーパー', v0: 133, rpm: 2500, dir: 90, eff: 0.50, note: '横へ大きく曲がるスライダー（値の目安はとくに大まか）' },
  { id: 'cu', name: 'カーブ', v0: 129, rpm: 2500, dir: 145, eff: 0.55, note: '前向きの回転（トップスピン）で、下向きの力を受けて重力より速く落ちる' },
  { id: 'ch', name: 'チェンジアップ', v0: 135, rpm: 1750, dir: 285, eff: 0.85, note: '腕の振りはまっすぐと同じで遅い。回転も少なく、上向きの力が小さい' },
  { id: 'fs', name: 'フォーク・スプリット', v0: 137, rpm: 1400, dir: 290, eff: 0.75, note: '回転がとても少ない。上向きの力が小さいので、まっすぐより下を通る' },
  { id: 'gy', name: 'ジャイロボール', v0: 140, rpm: 2400, dir: 90, eff: 0.0, note: '回転の軸が進む向きと同じ（弾丸の回転）。たくさん回っていても曲がらない' },
  { id: 'kn', name: 'ナックル', v0: 115, rpm: 30, knuckle: true, axisDeg: 0, seam0: 20, note: 'ほとんど回らない。曲げるのは回転ではなく、縫い目にかかる横の力' },
  { id: 'no', name: '回転なし', v0: 145, rpm: 0, dir: 0, eff: 1, note: '回転がなければマグヌス力は 0。重力と空気の抵抗だけ' },
];

const RELEASE = { x0: -0.55, z0: 1.80, ext: 1.90 };   // 右投げのおおよその放す位置（捕手から見て左・高さ 1.8 m・投手板から 1.9 m 前）
const ZONE = { x: 0.2159, zLo: 0.46, zHi: 1.07, zMid: 0.765 };   // ストライクゾーン（幅 17 インチ。高さは打者で変わるので目安）

const S = {
  pitch: 'ff',
  P: null,                 // いまの投げ方（launch の入力）
  autoAim: true,
  t: 0, playing: false, speed: 1 / 20,
  show: { noAir: true, plain: true, forces: true },
  res: null, ghostNoAir: null, ghostPlain: null,
  many: null,              // ナックル10球
  tour: 0,
  hover: null,
};

function presetP(id) {
  const k = PITCHES.find(p => p.id === id);
  return Object.assign({ vAng: -1, hAng: 1.5, knuckle: false, seam0: 0, axisDeg: 0, dir: 0, eff: 1 }, RELEASE, k, { name: undefined, note: undefined, id: undefined });
}

// 計算しなおす（ねらい → 本番・比べる道すじ）
function recompute() {
  if (S.autoAim) Object.assign(S.P, aim(S.P, { x: 0, z: ZONE.zMid }));
  S.res = simulate(S.P);
  S.ghostNoAir = simulate(S.P, { air: false, magnus: false, seam: false });
  S.ghostPlain = simulate(S.P, { air: true, magnus: false, seam: false });
  S.mv = movement(S.res, S.ghostPlain);
  if (S.t > S.res.tPlate) S.t = S.res.tPlate;
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
  S.pitch = id; S.P = presetP(id); S.autoAim = true; S.many = null;
  if (!keepTime) S.t = 0;
  recompute();
}

// 部分の説明（マウスをのせると出る）
const PARTS = {
  path: '計算した道すじ。重力・空気の抵抗・回転の力（ナックルは縫い目の力も）を 1 ミリ秒ごとに足し合わせて、ボールの動きを解いています。',
  noAir: '空気がないとき（重力だけ）の道すじ。放物線になります。月の上で投げるとこうなります。',
  plain: '回転の力も縫い目の力もないとき（重力と空気の抵抗だけ）の道すじ。これとのずれが「変化量」です。',
  zone: 'ストライクゾーン（幅 43 cm。高さは打者の体で変わるので目安）。',
  ball: 'いまの時刻のボール。矢印は働いている力です。',
  grav: '重力 mg = 1.42 N。いつも真下。',
  drag: '空気の抵抗（抗力）。進む向きと逆向きで、速さの2乗に比例します。ボールはホームまでに 1 割ほど遅くなります。',
  magnus: '回転による力（マグヌス力）。回転のうち、進む向きに直角な成分だけが生みます。向きは「捕手から見て手前の面が動く向き」。',
  seam: '縫い目の力（ナックル）。縫い目の向きで、空気がボールからはがれる場所が左右でずれ、横向きの力になります。',
  plate: 'ホームベースの前の端。ここを通るときの位置と速さを計算しています。',
  rubber: '投手板。ボールは板より 1.9 m ほど前で手から放れます。',
  many: '同じねらいで、縫い目の向き（±20°）・ゆっくりした回転の量（毎分 0〜60 回）・回転軸の向きだけをばらつかせた10球（ばらつきの幅はこのアプリの仮定）。1球ずつの道すじはなめらかなのに、行き先はばらばらです。',
  axis: '回転軸（右手の親指の向き。指の曲がる向きに回る）。',
};

// 案内（「つぎへ」ボタン1つで進む）。go は状態を作る関数
const TOUR = [
  { text: 'ボールに働く力は3つ。<b>重力</b>・<b>空気の抵抗</b>・<b>回転による力</b>。球種の名前で曲がり方を決めず、放す速さ・向き・回転から、この力を 1 ミリ秒ごとに計算して道すじを解いています。下の時間のつまみを動かしてみよう。',
    go() { setPitch('ff'); S.show = { noAir: false, plain: false, forces: true }; S.t = 0.2; } },
  { text: 'もし空気がなかったら（<span class="k-noair">うすい線</span>）。重力だけなので放物線。151 km/h でも、ホームまでの 0.4 秒で 80 cm ほど落ちます。',
    go() { setPitch('no'); S.show = { noAir: true, plain: false, forces: true }; S.t = 0.2; } },
  { text: '空気があると、<b>抵抗</b>で遅くなります（ホームで約 1 割減）。でも回転がなければ、左右にも上にも曲がりません。',
    go() { setPitch('no'); S.show = { noAir: true, plain: false, forces: true }; S.t = S.res.tPlate; } },
  { text: '<b>フォーシーム</b>: 毎分 2300 回の逆回転。手前の面が上へ動く回転は、空気を下へ押しやり、反作用で<b>上向きの力（マグヌス力）</b>を受けます。回転なし（<span class="k-plain">点線</span>）より 40 cm ほど上を通る ＝「ホップするように見える」正体。',
    go() { setPitch('ff'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0.25; } },
  { text: '<b>スライダー</b>: 回転数はフォーシームより多いのに、曲がりは小さめ。回転軸が進む向きに近く（ジャイロ回転）、曲げるのに使える回転は 3 割ほどだから。下の「使える回転」を 100% にすると…？',
    go() { setPitch('sl'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0.25; } },
  { text: '<b>カーブ</b>: 手前の面が下へ動く回転（トップスピン）。マグヌス力が下向きで、重力に足されてよく落ちます。遅いので、ホームまでの時間も長い（0.47 秒）。',
    go() { setPitch('cu'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0.3; } },
  { text: '<b>ナックル</b>: ほとんど回らないので、マグヌス力はほぼ 0。かわりに<b>縫い目の向き</b>で、空気がはがれる場所が左右でずれ、横向きの力が生まれます（風洞の測定）。ゆっくり回ると、飛ぶ間に力の向きが入れかわります。',
    go() { setPitch('kn'); S.show = { noAir: false, plain: true, forces: true }; S.t = 0.3; } },
  { text: '同じねらいで、縫い目の向き・ゆっくりした回転の量と軸だけを、投手がそろえきれない程度にばらつかせた<b>10球</b>。ホームでの行き先がばらばら。でも1球ずつの道すじは<b>なめらか</b>です。試合の測定でも同じ（Nathan 2012）。ナックルが「揺れる」と感じるのは、<b>小さな差で行き先が大きく変わり、だれにも読めない</b>から、と考えられています。',
    go() { setPitch('kn'); S.show = { noAir: false, plain: false, forces: false }; throwMany(); S.t = S.res.tPlate; } },
  { text: '自由に試そう。下で球種を選び、速さ・回転数・回転の向き（右のボールをドラッグ）・使える回転を変えると、すぐに計算しなおします。',
    go() { setPitch('ff'); S.show = { noAir: true, plain: true, forces: true }; S.t = 0; } },
];
