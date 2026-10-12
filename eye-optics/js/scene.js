// 目のなかの光の道 — 状態・選べる条件・案内（つぎへ）・説明の文
'use strict';

// 選べる条件
const AGES = [8, 25, 45, 60];
const LENGTHS = [   // 目の長さのちがい（mm）。近視・遠視は目の長さだけ変える（軸性）
  { key: 'normal', label: L('ふつう', 'Normal'), dL: 0 },
  { key: 'myope', label: L('近視（1 mm 長い）', 'Nearsighted (1 mm longer)'), dL: 1.0 },
  { key: 'myope2', label: L('強い近視（2 mm）', 'Very nearsighted (2 mm)'), dL: 2.0 },
  { key: 'hyper', label: L('遠視（1 mm 短い）', 'Farsighted (1 mm shorter)'), dL: -1.0 },
];
const GLASSES = [
  { key: 'none', label: L('なし', 'None') },
  { key: 'far', label: L('遠く用', 'For distance') },
  { key: 'near', label: L('近く用（老眼鏡）', 'For reading') },
];
// 乱視: 角膜の前の面が、強い向きの断面でどれだけ強いか（D）と、その向き（ang: 横から反時計回りの角度）
const ASTIG_POWERS = [{ key: 0, label: L('なし', 'None') }, { key: 0.75, label: '0.75 D' }, { key: 1.5, label: '1.5 D' }, { key: 3, label: '3 D' }];
const ASTIG_AXES = [
  { key: 'v', label: L('縦', 'Vertical'), ang: 90 }, { key: 'h', label: L('横', 'Horizontal'), ang: 0 },
  { key: 'd45', label: L('斜め／', 'Diagonal /'), ang: 45 }, { key: 'd135', label: L('斜め＼', 'Diagonal \\'), ang: 135 },
];
const SECS = [{ key: 's', label: L('強い向きで切る', 'Cut along the strong direction') }, { key: 'w', label: L('弱い向きで切る', 'Cut along the weak direction') }];
const dirName = ang => ({ 90: L('縦', 'vertical'), 0: L('横', 'horizontal'), 180: L('横', 'horizontal'), 45: L('斜め／', 'diagonal /'), 135: L('斜め＼', 'diagonal \\') })[((ang % 180) + 180) % 180] || ang + '°';
const LIGHTS = [   // 明るさ（cd/m²）はおおよその例（推定）
  { key: 'sun', label: L('晴れた屋外', 'Sunny outdoors'), L: 3000 },
  { key: 'room', label: L('部屋の中', 'Indoors'), L: 100 },
  { key: 'dusk', label: L('夕方', 'Dusk'), L: 1 },
  { key: 'night', label: L('夜道', 'Night street'), L: 0.001 },
];
const D_MIN = 70, D_MAX = 6000;   // 物の距離（mm）。D_MAX より先は「遠く」（Infinity）
const TOP_ANG = 0.12;             // 物の上の端を見る角度（ラジアン、約7°）

const S = {
  t: 0,                       // シミュレーションの時刻（秒）。速さの切りかえで実時間とずれる
  d: 3000, age: 25, len: 'normal', glasses: 'none', light: 'room', showTop: false,
  astigP: 0, astigAx: 'v', sec: 's', chart: 'acuity',   // 乱視の強さ（D）・強い向き・図の断面（強い向き／弱い向き）・見え方の表（視力表／放射状の線）
  A: 0, At: 0,               // 調節（いま・ねらい）。いまの値は dynamics.js の遅れと速さで追いかける
  stopR: 1.36, stopRt: 1.36,  // 虹彩のあなの半径（いま・ねらい）
  acc: null, pup: null, seg: null, aEff: 0, pEff: 1.36,   // 遅れの箱（dynamics.js）
  cone: -1.4, rod: -1.4,      // 暗順応: 錐体・桿体のしきい値（log10 cd/m²。dynamics.js の darkStep）
  speed: 1,                   // 時間の速さ（1＝ふつう）
  P: null, Ps: null, Pw: null, // メガネの度（D）。P は図の断面の度、Ps・Pw は乱視の強い向き・弱い向き。null＝なし
  hl: null,                   // 案内で光らせる部分
  tour: 0, anim: null,        // 案内の番号、案内のときの動き
  ev: null,                   // いちばん新しい切りかえ { t, label }（「切りかえてから何秒」の表示）
  replay: null,               // ふりかえり中なら、見ている記録
  res: null,                  // 計算の結果（毎コマ）
};
const NEAR_D = 300, FAR_D = 5000;   // 見る先の切りかえ（近く 30 cm ⇄ 遠く 5 m）

const lenOf = () => LENGTHS.find(l => l.key === S.len);
const lightOf = () => LIGHTS.find(l => l.key === S.light);
function astigOf() {
  const ax = ASTIG_AXES.find(l => l.key === S.astigAx);
  return { P: S.astigP, on: S.astigP > 0, ang: ax.ang, strong: dirName(ax.ang), weak: dirName(ax.ang + 90) };
}
const fmtD = d => !isFinite(d) ? L('遠く', 'far') : d >= 1000 ? (d / 1000).toFixed(d < 2000 ? 1 : 0) + ' m' : Math.round(d / 10) + ' cm';
const fmtDi = v => (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + Math.abs(v).toFixed(2) + ' D';

// 条件が変わったら、ねらいの値（メガネ・ひとみ・調節）を計算し直す
function recompute() {
  const dL = lenOf().dL, Amax = maxAccommodation(S.age), a = astigOf();
  S.stopRt = stopRadiusFor(pupilDiameter(lightOf().L));
  const sr3 = stopRadiusFor(3);   // メガネの度は ひとみ 3 mm のときで決める（度は明るさで変えない）
  const gl = cyl => S.glasses === 'far' ? farGlasses(dL, sr3, cyl) : S.glasses === 'near' ? nearGlasses(dL, Amax, sr3, cyl) : null;
  S.Ps = gl(a.P); S.Pw = a.on ? gl(0) : S.Ps;   // 乱視のメガネは強い向きと弱い向きで別の度（円柱レンズ）
  S.P = S.sec === 'w' ? S.Pw : S.Ps;
  S.err = refractiveError(dL, sr3, a.P);        // 強い向き（乱視がなければ ふつうの屈折）
  S.errW = a.on ? refractiveError(dL, sr3, 0) : S.err;
  retarget();
}
// 物の距離だけ変わったとき（ドラッグ中）は調節のねらいだけ
function retarget() {
  const a = astigOf();
  S.At = solveAccommodation(lenOf().dL, { d: S.d }, S.Ps, maxAccommodation(S.age), S.stopRt, a.P, S.Pw, 0);
}

// 条件を変える（ボタン・案内・見る先の切りかえ）。変わったものは「時間の流れ」に印を残す
const EV_NAMES = {
  d: v => !isFinite(v) ? L('遠くを見る', 'Look far') : L(fmtD(v) + ' を見る', 'Look at ' + fmtD(v)),
  age: v => L(v + '歳', 'Age ' + v),
  len: v => LENGTHS.find(l => l.key === v).label.replace(/（.*）| \(.*\)/, ''),
  glasses: v => v === 'none' ? L('メガネをはずす', 'Glasses off') : L('メガネ ', 'Glasses: ') + GLASSES.find(l => l.key === v).label.replace(/（.*）/, ''),
  light: v => LIGHTS.find(l => l.key === v).label,
  astigP: v => v === 0 ? L('乱視なし', 'No astigmatism') : L(`乱視 ${v} D`, `Astigmatism ${v} D`),
  astigAx: v => L('乱視の向き ', 'Astigmatism: ') + ASTIG_AXES.find(l => l.key === v).label,
};
function applyCond(o) {
  if (S.replay) tlResume();
  const labels = [];
  for (const k in o) if (S[k] !== o[k] && EV_NAMES[k]) labels.push(EV_NAMES[k](o[k]));
  Object.assign(S, o);
  if (labels.length) markEvent(labels.join(L('・', ' · ')));
  recompute(); syncControls();
}

// 部分の説明（マウスをのせたとき）。関数は いまの値を入れる
const PARTS = {
  cornea: { name: L('角膜', 'Cornea'), text: () => L('目の表面の透明なまく。空気との境目で、光をいちばん大きく曲げる。この模型では前の面の半径 7.72 mm。', 'The clear window on the front of the eye. At its border with the air, it bends light the most. In this model its front surface has a radius of 7.72 mm. ') +
    (S.astigP === 0 ? '' : L(`いまは乱視: ${astigOf().strong}の向きの丸みが少しきつく（半径 ${(376 / (376 / 7.72 + S.astigP)).toFixed(2)} mm）、その向きだけ ${S.astigP} D 強く曲げる。`,
      `Astigmatism now: it is a little more curved in the ${astigOf().strong} direction (radius ${(376 / (376 / 7.72 + S.astigP)).toFixed(2)} mm), so it bends light ${S.astigP} D more in that direction only.`)) },
  aqueous: { name: L('房水（前房）', 'Aqueous humor (front chamber)'), text: () => L('角膜と水晶体のあいだを満たす水。目の形を保ち、角膜や水晶体に栄養をとどける。', 'The clear fluid between the cornea and the lens. It keeps the eye’s shape and feeds the cornea and lens.') },
  iris: { name: L('虹彩とひとみ', 'Iris and pupil'), text: () => L(`茶色の輪が虹彩、まん中のあながひとみ。明るさで大きさが変わる。いまの見かけの直径 ${pupilShown(S.stopR).toFixed(1)} mm。`, `The brown ring is the iris; the hole in the middle is the pupil. Its size changes with the light. Apparent diameter now: ${pupilShown(S.stopR).toFixed(1)} mm.`) },
  lens: { name: L('水晶体', 'Lens'), text: () => L(`ふくらみを変えてピントを合わせるレンズ。いまの調節 ${S.A.toFixed(1)} D（この年齢でできる最大 ${maxAccommodation(S.age).toFixed(1)} D）。`, `The lens that focuses by changing how round it is. Focusing now: ${S.A.toFixed(1)} D (the most possible at this age: ${maxAccommodation(S.age).toFixed(1)} D).`) },
  ciliary: { name: L('毛様体とチン小帯', 'Ciliary muscle and zonules'), text: () => L('水晶体のまわりの筋肉（毛様体）と、水晶体をつるす細い糸（チン小帯）。筋肉が縮むと糸がゆるみ、水晶体が自分の弾力でふくらむ。', 'The muscle around the lens (ciliary muscle) and the thin threads that hold the lens (zonules). When the muscle tightens, the threads loosen and the lens rounds up by its own springiness.') },
  vitreous: { name: L('硝子体', 'Vitreous body'), text: () => L('目の中をうめる透明なゼリー。光はここをまっすぐ進む。', 'The clear jelly that fills the eye. Light goes straight through it.') },
  retina: { name: L('網膜', 'Retina'), text: () => L('光を受けて神経の信号に変える膜。ここに像ができる。像は上下さかさま。', 'The layer that catches light and turns it into nerve signals. The image forms here, upside down.') },
  fovea: { name: L('中心窩', 'Fovea'), text: () => L('網膜のまん中のくぼみ。色を感じる細胞（錐体）がぎっしり並び、いちばんくっきり見える所。見たい物の光はここに集まる。', 'The small pit in the middle of the retina. Color-sensing cells (cones) are packed tightly here, so this is where we see sharpest. Light from what we look at lands here.') },
  nerve: { name: L('視神経（盲点）', 'Optic nerve (blind spot)'), text: () => L('網膜の信号を脳へ運ぶ束。出口には光を受ける細胞がないので、そこに来た光は見えない（盲点）。実際は中心窩より鼻の側にあり、この断面には入らないが、場所を示すために描いている。', 'The bundle that carries signals from the retina to the brain. Where it leaves the eye there are no light-sensing cells, so light landing there is not seen (the blind spot). It really lies toward the nose from the fovea, outside this slice; it is drawn here only to show where it is.') },
  sclera: { name: L('強膜', 'Sclera'), text: () => L('白目の部分。目の形を保つじょうぶな膜。', 'The white of the eye. A tough layer that keeps the eye’s shape.') },
  glasses: { name: L('メガネ', 'Glasses'), text: () => L(`メガネのレンズ（${fmtDi(S.P)}）。${S.P < 0 ? '凹レンズ: 光を少し広げてから目に入れる。' : S.P > 0 ? '凸レンズ: 光を少し集めてから目に入れる。' : '度なし。'}角膜の 12 mm 手前に置いている。`,
    `Glasses lens (${fmtDi(S.P)}). ${S.P < 0 ? 'A minus (concave) lens: it spreads light a little before it enters the eye.' : S.P > 0 ? 'A plus (convex) lens: it gathers light a little before it enters the eye.' : 'No power.'} Placed 12 mm in front of the cornea.`) },
  object: { name: L('物', 'Object'), text: () => L(`見ている物（${fmtD(S.d)}）。左右にドラッグして、近づけたり遠ざけたりできる。目の外の距離は縮めて描いている。`, `The thing you are looking at (${fmtD(S.d)}). Drag it left or right to move it closer or farther. Distances outside the eye are squeezed in the drawing.`) },
};

// 案内（画面の上の「つぎへ」ボタン1つで進む）。set で条件をそろえ、anim で物を動かす。
// settle: 目をすぐに合わせた状態から始める。win: グラフの長さ（秒）。go: [{at: 秒, ...条件}] その時刻（シミュレーションの時刻）に条件を変える
const TOUR = [
  { text: () => L('目を横から切った図です。左の矢印（物）から出た光が、目の中でどう曲がって網膜に届くかを、本物の目の寸法の模型で1本ずつ計算しています。',
      'This is the eye cut in half, seen from the side. Light from the arrow (the object) on the left bends inside the eye and reaches the retina. Each ray is calculated one by one with a model of a real eye’s sizes.'),
    set: { d: 3000, age: 25, len: 'normal', glasses: 'none', light: 'room', showTop: false, speed: 1, astigP: 0, astigAx: 'v', sec: 's', chart: 'acuity' }, settle: true, win: 6, hl: null },
  { text: () => L('光をいちばん大きく曲げるのは、目の表面の「角膜」。空気と角膜の境目で光の進む速さが大きく変わるからです。奥の「水晶体」はピントの細かい調整係。',
      'The part that bends light the most is the cornea on the front of the eye, because light’s speed changes a lot where air meets the cornea. The lens deeper inside does the fine focusing.'),
    hl: 'cornea' },
  { text: () => L('物の上の端から来た光（水色）は、網膜の下の側に集まります。網膜にうつる像は上下さかさま。それを脳が正しい向きとして受けとっています。',
      'Light from the top of the object (light blue) lands on the lower part of the retina. The image on the retina is upside down, and the brain takes it as the right way up.'),
    set: { showTop: true }, hl: 'retina' },
  { text: () => L('物を近づけると…水晶体がふくらんで、光を強く曲げます（調節）。「調節」の数字を見てください。物は自分でドラッグしても動かせます。',
      'Bring the object closer… the lens rounds up and bends light more strongly (accommodation). Watch the “Focusing” number. You can also drag the object yourself.'),
    set: { showTop: false }, anim: { from: 3000, to: 200, sec: 3 }, hl: 'lens' },
  { text: () => L('ピント合わせには時間がかかります。1/4 のスローで、遠く（5 m）から近く（30 cm）へ見る先を変えます。はじめの 0.3 秒ほどは何も起きず（遅れ）、そのあと水晶体がふくらみます。下のグラフで、ねらい（点線）を実際（実線）が遅れて追いかけます。',
      'Focusing takes time. In 1/4 slow motion, the eye switches from far (5 m) to near (30 cm). For the first 0.3 s nothing happens (the delay); then the lens rounds up. In the graph below, the actual value (solid line) chases the target (dotted line) a little late.'),
    set: { d: FAR_D, speed: 0.25 }, settle: true, go: [{ at: 0.5, d: NEAR_D }], hl: 'lens' },
  { text: () => L('60歳ごろには水晶体がかたくなり、ほとんどふくらまなくなります。近くの物の像が網膜のうしろにずれて、ぼけます（老眼）。「見え方」の視力表もぼやけました。',
      'By about age 60 the lens has stiffened and can hardly round up. The image of a near object falls behind the retina and blurs (presbyopia). The eye chart under “What you see” is blurry too.'),
    set: { age: 60, d: 300, speed: 1 }, settle: true, hl: 'lens' },
  { text: () => L(`こんどは25歳で、目が 1 mm だけ長い目。遠くの物の像が網膜の手前でできて、ぼけます（近視。この模型では ${fmtDi(S.err)} に当たる）。近くの物ならピントが合います。`,
      `Now a 25-year-old eye that is just 1 mm longer. The image of a far object forms in front of the retina and blurs (nearsightedness, ${fmtDi(S.err)} in this model). Near objects are still in focus.`),
    set: { age: 25, len: 'myope', d: Infinity }, settle: true, hl: 'retina' },
  { text: () => L(`凹レンズのメガネ（${fmtDi(farGlasses(1.0, stopRadiusFor(3)))}）で光を少し広げてから入れると、像が網膜まで届いて、くっきり見えます。`,
      `Glasses with a minus lens (${fmtDi(farGlasses(1.0, stopRadiusFor(3)))}) spread the light a little before it enters, so the image reaches the retina and looks sharp.`),
    set: { glasses: 'far' }, hl: 'glasses' },
  { text: () => L('メガネをはずして、晴れた屋外から急に夜道へ（はやおくり ×4）。ひとみは 20 秒ほどかけて、ゆっくり開いていきます（グラフの「ひとみ」）。開くほど光は多く入りますが、網膜がまだ暗さに慣れていないので、しばらくは何も見えません（暗さに慣れるのは、あとの段で）。',
      'Glasses off, and suddenly from sunny outdoors to a night street (fast-forward ×4). The pupil slowly opens over about 20 s (see “Pupil” in the graph). More light gets in, but the retina is not used to the dark yet, so for a while you see nothing (getting used to the dark comes in a later step).'),
    set: { glasses: 'none', light: 'sun', speed: 4 }, settle: true, win: 30, go: [{ at: 1, light: 'night' }], hl: 'iris' },
  { text: () => L('こんどは明るい部屋へ（スロー 1/4）。ひとみは 0.2 秒ほどの遅れのあと、1 秒ほどですばやく縮みます。開くのはゆっくり、縮むのはすばやい。明るい所で目を細めると見えやすいのも、同じしくみ。',
      'Now into a bright room (1/4 slow motion). After a delay of about 0.2 s, the pupil quickly shrinks in about 1 s. Opening is slow; shrinking is fast. Squinting in bright light helps you see for the same reason.'),
    set: { speed: 0.25 }, win: 6, go: [{ at: 0.4, light: 'room' }], hl: 'iris' },
  { text: () => L('暗さに慣れる（はやおくり ×60: 1秒で1分）。晴れた屋外から夜道へ。はじめは何も見えません。まず錐体（明るい所の細胞）が数分で慣れて頭打ちになり、7分ごろから桿体（暗い所の細胞）に切りかわって、30分ほどでいちばん敏感になります。グラフの「暗さ慣れ」の折れ目に注目。桿体だけで見るときは、見え方のまん中がぬけます（中心窩には桿体がない）。',
      'Getting used to the dark (fast-forward ×60: 1 s = 1 min). From sunny outdoors to a night street. At first you see nothing. The cones (bright-light cells) adjust within a few minutes and level off; around 7 min the rods (dim-light cells) take over, and after about 30 min the eye is most sensitive. Look for the kink in “Dark” in the graph. When only rods are seeing, the middle of the view goes missing (the fovea has no rods).'),
    set: { glasses: 'none', len: 'normal', light: 'sun', d: FAR_D, chart: 'acuity', speed: 60 }, settle: true, win: 2400, go: [{ at: 30, light: 'night' }], hl: 'retina' },
  { text: () => L('乱視: 角膜の丸みが、縦と横で少しちがう目。ここでは縦の向きが 1.5 D 強い（直乱視）。放射状の線の表を見ると、ある向きの線ははっきり、直角の向きの線はぼやけます。縦の断面では像が網膜の手前に、横の断面ではちょうど網膜の上にできます（下の「断面」で切りかえ）。乱視の強さと向き（斜めも）も下で選べます。',
      'Astigmatism: an eye whose cornea is curved a little differently up-and-down than side-to-side. Here the vertical direction is 1.5 D stronger. On the chart of lines, lines in one direction look sharp while those at right angles blur. In the vertical slice the image forms in front of the retina; in the horizontal slice, right on it (switch with “Slice” below). You can also choose the strength and direction (even diagonal) below.'),
    set: { glasses: 'none', light: 'room', len: 'normal', astigP: 1.5, astigAx: 'v', sec: 's', chart: 'fan', d: FAR_D, speed: 1 }, settle: true, win: 6, hl: 'cornea' },
  { text: () => L(`縦と横で度のちがうメガネ（円柱レンズ: ${astigOf().strong} ${fmtDi(S.Ps)}・${astigOf().weak} ${fmtDi(S.Pw)}）をかけると、縦も横も網膜に集まって、どの向きの線もくっきり見えます。`,
      `Glasses with different powers in the two directions (a cylinder lens: ${astigOf().strong} ${fmtDi(S.Ps)}, ${astigOf().weak} ${fmtDi(S.Pw)}) bring both directions onto the retina, so lines in every direction look sharp.`),
    set: { glasses: 'far' }, hl: 'glasses' },
  { text: () => L('ここからは自由に。矢印をドラッグしたり、下のボタンで年齢・目の長さ・乱視・メガネ・明るさを変えてみてください。グラフをさわると、その瞬間の目にもどれます。部分にマウスをのせる（スマホはさわる）と説明が出ます。',
      'Now explore freely. Drag the arrow, or use the buttons below to change age, eye length, astigmatism, glasses and light. Touch the graph to go back to that moment. Point at (or tap) a part of the eye to read about it.'),
    set: { speed: 1 }, hl: null },
];
