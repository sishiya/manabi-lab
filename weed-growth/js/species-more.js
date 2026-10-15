// 雑草がふえるまで — タネでふえるほかの雑草（タンポポ・スベリヒユ・カタバミ）。エノコログサ（data.js）と同じ計算を、値と形をかえて使う。
// 「推定」と書いたものは測られた値ではなく、測られた値（横に書いた）に合う大きさにした目安。
'use strict';
// エノコログサにも、ほかの種と同じ見出しの値を足しておく
Object.assign(SPECIES.foxtail, {
  life: 'annual', shape: 'grass', root: 'fib', disp: { type: 'drop' },
  words: { head: '穂', headed: '穂が出た（花が咲く）', heads: '穂のある株', ripe: '熟したタネ', flowerJump: ['穂の花・実', '小穂'], seedName: 'タネ' },
});

Object.assign(SPECIES, {
  // タンポポ（セイヨウタンポポ）: 何年も生きる。綿毛で風に乗る。抜いても根が残るとまた出る
  dandelion: {
    kind: 'seed', world: 'seed', name: 'タンポポ（セイヨウタンポポ）', short: 'タンポポ', sci: 'Taraxacum officinale',
    life: 'perennial', shape: 'rosette', root: 'tap',
    words: { head: '花', headed: '花が咲いた', heads: '花・綿毛のある株', ripe: '綿毛のタネ', flowerJump: ['花・綿毛', '花のつくり・綿毛'], seedName: 'タネ（実）' },
    seedMass: 0.0006, seedLen: 0.003, seedWid: 0.0009,   // 実（そう果）の長さ 3mm（UC IPM）。重さは推定
    tb: 5, germRate: 0.02, germT: 12,                     // 春と秋に芽を出す（推定）
    depthBest: [0, 0.008], depthMax: 0.03, surfaceFactor: 1, emBase: 20, emPerCm: 30,   // 浅いほど出る（推定）
    coldRelease: 0.02, baseRelease: 0.01, reDormant: 0.002,   // 休眠は浅い（推定）
    decay: 0.4, predation: 0.01, burial: 0.006,          // 土の中では長生きしない（推定）
    gb: 5, rgr: 0.1, topt: 22, wmax: 15, lar: 0.012, hmax: 0.08,   // 葉は地面に広がる（ロゼット）
    flowerWin: [[90, 150], [260, 310]], wFlower: 0.6, flowerT: 8,  // 花はおもに 4〜5月、ところにより秋にも（Ohio State Univ. weed guide）。株が育ってから（推定の重さ）
    matureCd: 140, shed: 0.35, reproFrac: 0.06,          // 花から綿毛まで（推定）。綿毛になると数日で飛ぶ。大きな株で1年に 3,000〜5,000粒（1株 1年に 3,000〜23,000粒: Ohio State）
    frostT: -99, thin: 0.1, kext: 0.6,
    rootDia: 0.007, leafW: 0.03,                          // 太い直根（UC IPM: 太く深い直根）。太さは推定
    disp: { type: 'wind', mean: 1.5 },                    // 風で飛ぶ距離の平均（推定。まれにずっと遠くまで）
    pullRegrow: 0.5,                                      // 抜いても根の切れはしが残ると、また出る（根の切れはしから再生: Ohio State）。割合は推定
  },
  // スベリヒユ: 夏の一年草。地面をはう。抜いて置いておくと、そのままタネが熟したり、根づいたりする
  purslane: {
    kind: 'seed', world: 'seed', name: 'スベリヒユ', short: 'スベリヒユ', sci: 'Portulaca oleracea',
    life: 'annual', shape: 'mat', root: 'fib',
    words: { head: '花', headed: '花が咲いた', heads: '花・実のある株', ripe: '熟したタネ', flowerJump: ['花・実', 'ふたが取れる実'], seedName: 'タネ' },
    seedMass: 0.00013, seedLen: 0.0008, seedWid: 0.0007, // 小さな黒いタネ（大きさ・重さは推定）
    tb: 15, germRate: 0.015, germT: 15,                   // 暖かいときに芽を出す（UF/IFAS）。温度は推定
    depthBest: [0, 0.008], depthMax: 0.02, surfaceFactor: 0.8, emBase: 20, emPerCm: 30,
    coldRelease: 0.02, baseRelease: 0.002, reDormant: 0.004,
    decay: 0.06, predation: 0.008, burial: 0.006,        // 土の中で 15年ほど生きる（UF/IFAS）。減る速さは推定
    gb: 12, rgr: 0.25, topt: 32, wmax: 25, lar: 0.008, hmax: 0.06,
    headLong: 230, headShort: 180, dayLong: 14, dayShort: 12.5,   // 芽が出て 3〜6週で、もう生きたタネができる（UF/IFAS）
    matureCd: 100, shed: 0.15, reproFrac: 0.2, senesceCd: 2500,   // 広いところの1本で数万粒（よい条件で 24万粒まで: UF/IFAS）。割合は推定
    frostT: 10, thin: 0.3, kext: 0.8,                    // 寒さに弱い。地面をおおうので、こみあうと下の芽は育たない（推定）
    rootDia: 0.0008, leafW: 0.007,
    disp: { type: 'drop', sigma: 0.04 },                  // 実のふたが取れて、株のまわりにこぼれる（UF/IFAS: ふたがはずれてカップが残る）
    pullLeft: 0.25,                                       // 抜いて置いておくと、根づいたり花やタネをつけたりする（UF/IFAS）。根づく割合は推定
  },
  // カタバミ: 何年も生きる。熟した実がはじけて、タネを 3m 以上とばす
  oxalis: {
    kind: 'seed', world: 'seed', name: 'カタバミ', short: 'カタバミ', sci: 'Oxalis corniculata',
    life: 'perennial', shape: 'creep', root: 'tap',
    words: { head: '花', headed: '花が咲いた', heads: '花・実のある株', ripe: 'はじける実', flowerJump: ['花・実', 'はじける実'], seedName: 'タネ' },
    seedMass: 0.00015, seedLen: 0.0016, seedWid: 0.0011,  // タネは 1.6mm、平たく、横にすじ（UC IPM）。重さは推定
    tb: 8, germRate: 0.015, germT: 14,
    depthBest: [0, 0.008], depthMax: 0.03, surfaceFactor: 0.8, emBase: 20, emPerCm: 30,
    coldRelease: 0.02, baseRelease: 0.003, reDormant: 0.003,
    decay: 0.15, predation: 0.008, burial: 0.006,
    gb: 8, rgr: 0.12, topt: 25, wmax: 8, lar: 0.015, hmax: 0.08,
    flowerWin: [[60, 330]], wFlower: 0.08, flowerT: 12,  // 花はほとんど一年中（UC IPM）。寒い日はお休み（推定）
    matureCd: 150, shed: 0.5, reproFrac: 0.02,           // 大きな株で1年に 1〜2万粒（推定）
    frostT: -99, thin: 0.12, kext: 0.6,
    rootDia: 0.0015, leafW: 0.006,
    disp: { type: 'ballistic', max: 3.0, near: 0.7 },     // 実がはじけて 3m 以上とぶ（UC IPM）。いちばん多いのは株のすぐ近く（Rezvani ら 2010）。割合は推定
    pullRegrow: 0.3,                                      // 残った茎からまた出る（推定）
  },
});
