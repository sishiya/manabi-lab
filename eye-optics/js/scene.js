// 目のなかの光の道 — 状態・選べる条件・案内（つぎへ）・説明の文
'use strict';

// 選べる条件
const AGES = [8, 25, 45, 60];
const LENGTHS = [   // 目の長さのちがい（mm）。近視・遠視は目の長さだけ変える（軸性）
  { key: 'normal', label: 'ふつう', dL: 0 },
  { key: 'myope', label: '近視（1 mm 長い）', dL: 1.0 },
  { key: 'myope2', label: '強い近視（2 mm）', dL: 2.0 },
  { key: 'hyper', label: '遠視（1 mm 短い）', dL: -1.0 },
];
const GLASSES = [
  { key: 'none', label: 'なし' },
  { key: 'far', label: '遠く用' },
  { key: 'near', label: '近く用（老眼鏡）' },
];
const LIGHTS = [   // 明るさ（cd/m²）はおおよその例（推定）
  { key: 'sun', label: '晴れた屋外', L: 3000 },
  { key: 'room', label: '部屋の中', L: 100 },
  { key: 'dusk', label: '夕方', L: 1 },
  { key: 'night', label: '夜道', L: 0.001 },
];
const D_MIN = 70, D_MAX = 6000;   // 物の距離（mm）。D_MAX より先は「遠く」（Infinity）
const TOP_ANG = 0.12;             // 物の上の端を見る角度（ラジアン、約7°）

const S = {
  t: 0,                       // シミュレーションの時刻（秒）。速さの切りかえで実時間とずれる
  d: 3000, age: 25, len: 'normal', glasses: 'none', light: 'room', showTop: false,
  A: 0, At: 0,               // 調節（いま・ねらい）。いまの値は dynamics.js の遅れと速さで追いかける
  stopR: 1.36, stopRt: 1.36,  // 虹彩のあなの半径（いま・ねらい）
  acc: null, pup: null, seg: null, aEff: 0, pEff: 1.36,   // 遅れの箱（dynamics.js）
  speed: 1,                   // 時間の速さ（1＝ふつう）
  P: null,                    // メガネの度（D）。null＝なし
  hl: null,                   // 案内で光らせる部分
  tour: 0, anim: null,        // 案内の番号、案内のときの動き
  ev: null,                   // いちばん新しい切りかえ { t, label }（「切りかえてから何秒」の表示）
  replay: null,               // ふりかえり中なら、見ている記録
  res: null,                  // 計算の結果（毎コマ）
};
const NEAR_D = 300, FAR_D = 5000;   // 見る先の切りかえ（近く 30 cm ⇄ 遠く 5 m）

const lenOf = () => LENGTHS.find(l => l.key === S.len);
const lightOf = () => LIGHTS.find(l => l.key === S.light);
const fmtD = d => !isFinite(d) ? '遠く' : d >= 1000 ? (d / 1000).toFixed(d < 2000 ? 1 : 0) + ' m' : Math.round(d / 10) + ' cm';
const fmtDi = v => (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + Math.abs(v).toFixed(2) + ' D';

// 条件が変わったら、ねらいの値（メガネ・ひとみ・調節）を計算し直す
function recompute() {
  const dL = lenOf().dL, Amax = maxAccommodation(S.age);
  S.stopRt = stopRadiusFor(pupilDiameter(lightOf().L));
  const sr3 = stopRadiusFor(3);   // メガネの度は ひとみ 3 mm のときで決める（度は明るさで変えない）
  S.P = S.glasses === 'far' ? farGlasses(dL, sr3) : S.glasses === 'near' ? nearGlasses(dL, Amax, sr3) : null;
  S.err = refractiveError(dL, sr3);
  retarget();
}
// 物の距離だけ変わったとき（ドラッグ中）は調節のねらいだけ
function retarget() {
  S.At = solveAccommodation(lenOf().dL, { d: S.d }, S.P, maxAccommodation(S.age), S.stopRt);
}

// 条件を変える（ボタン・案内・見る先の切りかえ）。変わったものは「時間の流れ」に印を残す
const EV_NAMES = {
  d: v => !isFinite(v) ? '遠くを見る' : fmtD(v) + ' を見る',
  age: v => v + '歳',
  len: v => LENGTHS.find(l => l.key === v).label.replace(/（.*）/, ''),
  glasses: v => v === 'none' ? 'メガネをはずす' : 'メガネ ' + GLASSES.find(l => l.key === v).label.replace(/（.*）/, ''),
  light: v => LIGHTS.find(l => l.key === v).label,
};
function applyCond(o) {
  if (S.replay) tlResume();
  const labels = [];
  for (const k in o) if (S[k] !== o[k] && EV_NAMES[k]) labels.push(EV_NAMES[k](o[k]));
  Object.assign(S, o);
  if (labels.length) markEvent(labels.join('・'));
  recompute(); syncControls();
}

// 部分の説明（マウスをのせたとき）。関数は いまの値を入れる
const PARTS = {
  cornea: { name: '角膜', text: () => '目の表面の透明なまく。空気との境目で、光をいちばん大きく曲げる。この模型では前の面の半径 7.72 mm。' },
  aqueous: { name: '房水（前房）', text: () => '角膜と水晶体のあいだを満たす水。目の形を保ち、角膜や水晶体に栄養をとどける。' },
  iris: { name: '虹彩とひとみ', text: () => `茶色の輪が虹彩、まん中のあながひとみ。明るさで大きさが変わる。いまの見かけの直径 ${pupilDiameter(lightOf().L).toFixed(1)} mm。` },
  lens: { name: '水晶体', text: () => `ふくらみを変えてピントを合わせるレンズ。いまの調節 ${S.A.toFixed(1)} D（この年齢でできる最大 ${maxAccommodation(S.age).toFixed(1)} D）。` },
  ciliary: { name: '毛様体とチン小帯', text: () => '水晶体のまわりの筋肉（毛様体）と、水晶体をつるす細い糸（チン小帯）。筋肉が縮むと糸がゆるみ、水晶体が自分の弾力でふくらむ。' },
  vitreous: { name: '硝子体', text: () => '目の中をうめる透明なゼリー。光はここをまっすぐ進む。' },
  retina: { name: '網膜', text: () => '光を受けて神経の信号に変える膜。ここに像ができる。像は上下さかさま。' },
  fovea: { name: '中心窩', text: () => '網膜のまん中のくぼみ。色を感じる細胞（錐体）がぎっしり並び、いちばんくっきり見える所。見たい物の光はここに集まる。' },
  nerve: { name: '視神経（盲点）', text: () => '網膜の信号を脳へ運ぶ束。出口には光を受ける細胞がないので、そこに来た光は見えない（盲点）。実際は中心窩より鼻の側にあり、この断面には入らないが、場所を示すために描いている。' },
  sclera: { name: '強膜', text: () => '白目の部分。目の形を保つじょうぶな膜。' },
  glasses: { name: 'メガネ', text: () => `メガネのレンズ（${fmtDi(S.P)}）。${S.P < 0 ? '凹レンズ: 光を少し広げてから目に入れる。' : S.P > 0 ? '凸レンズ: 光を少し集めてから目に入れる。' : '度なし。'}角膜の 12 mm 手前に置いている。` },
  object: { name: '物', text: () => `見ている物（${fmtD(S.d)}）。左右にドラッグして、近づけたり遠ざけたりできる。目の外の距離は縮めて描いている。` },
};

// 案内（画面の上の「つぎへ」ボタン1つで進む）。set で条件をそろえ、anim で物を動かす。
// settle: 目をすぐに合わせた状態から始める。win: グラフの長さ（秒）。go: [{at: 秒, ...条件}] その時刻（シミュレーションの時刻）に条件を変える
const TOUR = [
  { text: '目を横から切った図です。左の矢印（物）から出た光が、目の中でどう曲がって網膜に届くかを、本物の目の寸法の模型で1本ずつ計算しています。',
    set: { d: 3000, age: 25, len: 'normal', glasses: 'none', light: 'room', showTop: false, speed: 1 }, settle: true, win: 6, hl: null },
  { text: '光をいちばん大きく曲げるのは、目の表面の「角膜」。空気と角膜の境目で光の進む速さが大きく変わるからです。奥の「水晶体」はピントの細かい調整係。',
    hl: 'cornea' },
  { text: '物の上の端から来た光（水色）は、網膜の下の側に集まります。網膜にうつる像は上下さかさま。それを脳が正しい向きとして受けとっています。',
    set: { showTop: true }, hl: 'retina' },
  { text: '物を近づけると…水晶体がふくらんで、光を強く曲げます（調節）。「調節」の数字を見てください。物は自分でドラッグしても動かせます。',
    set: { showTop: false }, anim: { from: 3000, to: 200, sec: 3 }, hl: 'lens' },
  { text: 'ピント合わせには時間がかかります。1/4 のスローで、遠く（5 m）から近く（30 cm）へ見る先を変えます。はじめの 0.3 秒ほどは何も起きず（遅れ）、そのあと水晶体がふくらみます。下のグラフで、ねらい（点線）を実際（実線）が遅れて追いかけます。',
    set: { d: FAR_D, speed: 0.25 }, settle: true, go: [{ at: 0.5, d: NEAR_D }], hl: 'lens' },
  { text: '60歳ごろには水晶体がかたくなり、ほとんどふくらまなくなります。近くの物の像が網膜のうしろにずれて、ぼけます（老眼）。「見え方」の視力表もぼやけました。',
    set: { age: 60, d: 300, speed: 1 }, settle: true, hl: 'lens' },
  { text: () => `こんどは25歳で、目が 1 mm だけ長い目。遠くの物の像が網膜の手前でできて、ぼけます（近視。この模型では ${fmtDi(S.err)} に当たる）。近くの物ならピントが合います。`,
    set: { age: 25, len: 'myope', d: Infinity }, settle: true, hl: 'retina' },
  { text: () => `凹レンズのメガネ（${fmtDi(farGlasses(1.0, stopRadiusFor(3)))}）で光を少し広げてから入れると、像が網膜まで届いて、くっきり見えます。`,
    set: { glasses: 'far' }, hl: 'glasses' },
  { text: 'メガネをはずして、晴れた屋外から急に夜道へ（はやおくり ×4）。ひとみは 20 秒ほどかけて、ゆっくり開いていきます。開くにつれて、ピントのずれによるぼけの円が大きくなります。',
    set: { glasses: 'none', light: 'sun', speed: 4 }, settle: true, win: 30, go: [{ at: 1, light: 'night' }], hl: 'iris' },
  { text: 'こんどは明るい部屋へ（スロー 1/4）。ひとみは 0.2 秒ほどの遅れのあと、1 秒ほどですばやく縮みます。開くのはゆっくり、縮むのはすばやい。明るい所で目を細めると見えやすいのも、同じしくみ。',
    set: { speed: 0.25 }, win: 6, go: [{ at: 0.4, light: 'room' }], hl: 'iris' },
  { text: 'ここからは自由に。矢印をドラッグしたり、下のボタンで年齢・目の長さ・メガネ・明るさを変えてみてください。グラフをさわると、その瞬間の目にもどれます。部分にマウスをのせる（スマホはさわる）と説明が出ます。',
    set: { speed: 1 }, hl: null },
];
