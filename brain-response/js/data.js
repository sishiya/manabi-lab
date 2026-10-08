/* data.js — species (brain outlines, region positions) and the source list.
   Brain coordinates are per hemisphere, seen from its own side: u = 0 front … 1 back, v = 0 top … 1 bottom.
   The left hemisphere is drawn on the left of the screen facing left, the right one mirrored (an opened book). */

const SRC = {
  schmolesky98: { a: 'Schmolesky ほか 1998', t: 'Signal timing across the macaque visual system（J Neurophysiol 79）', u: 'https://doi.org/10.1152/jn.1998.79.6.3272' },
  thiru26: { a: 'Thirunavukkarasu ほか 2026', t: 'Laminar architecture of visual and auditory responses in the supplementary eye field of macaques（Cerebral Cortex）。Schmolesky 1998 の中央値（V1 65 ms・MT/MST 73 ms・FEF 73 ms）を引用', u: 'https://doi.org/10.1093/cercor/bhag064' },
  foxe02: { a: 'Foxe & Simpson 2002', t: 'Flow of activation from V1 to frontal cortex in humans（Exp Brain Res 142）', u: 'https://doi.org/10.1007/s00221-001-0906-7' },
  odom16: { a: 'Odom ほか 2016', t: 'ISCEV standard for clinical visual evoked potentials: 2016 update（Doc Ophthalmol）', u: 'https://doi.org/10.1007/s10633-016-9553-y' },
  bentin96: { a: 'Bentin ほか 1996', t: 'Electrophysiological studies of face perception in humans（J Cogn Neurosci 8）', u: 'https://doi.org/10.1162/jocn.1996.8.6.551' },
  kanwisher97: { a: 'Kanwisher ほか 1997', t: 'The fusiform face area（J Neurosci 17）', u: 'https://doi.org/10.1523/JNEUROSCI.17-11-04302.1997' },
  tsao06: { a: 'Tsao ほか 2006', t: 'A cortical region consisting entirely of face-selective cells（Science 311）', u: 'https://doi.org/10.1126/science.1119983' },
  horton91: { a: 'Horton & Hoyt 1991', t: 'The representation of the visual field in human striate cortex（Arch Ophthalmol 109）', u: 'https://doi.org/10.1001/archopht.1991.01080060080030' },
  kara93: { a: 'Kara 1993', t: 'Processing of transient stimuli by the visual system of the rat（ケープタウン大学 修士論文）', u: 'https://open.uct.ac.za/items/68b31c4d-b4aa-4bcc-912d-b31c27fe55f1' },
  sotelo26: { a: 'Sotelo Muñoz ほか 2026', t: 'Reference values of auditory brainstem responses（成人 50 人、80 dB）', u: 'https://alicia.concytec.gob.pe/vufind/Record/INSNS-Rev_02af09d6280ebbc95957290879f76d97' },
  liegeois94: { a: 'Liégeois-Chauvel ほか 1994', t: 'Evoked potentials recorded from the auditory cortex in man（EEG Clin Neurophysiol 92）', u: 'https://doi.org/10.1016/0168-5597(94)90064-7' },
  formisano03: { a: 'Formisano ほか 2003', t: 'Mirror-symmetric tonotopic maps in human primary auditory cortex（Neuron 40）', u: 'https://doi.org/10.1016/s0896-6273(03)00669-x' },
  sally88: { a: 'Sally & Kelly 1988', t: 'Organization of auditory cortex in the albino rat: sound frequency（J Neurophysiol 59）', u: 'https://doi.org/10.1152/jn.1988.59.5.1627' },
  quirk95: { a: 'Quirk ほか 1995', t: 'Fear conditioning enhances short-latency auditory responses of lateral amygdala neurons（Neuron 15）', u: 'https://doi.org/10.1016/0896-6273(95)90092-6' },
  cruccu08: { a: 'Cruccu ほか 2008', t: 'Recommendations for the clinical use of somatosensory-evoked potentials（Clin Neurophysiol 119）', u: 'https://doi.org/10.1016/j.clinph.2008.03.016' },
  penfield37: { a: 'Penfield & Boldrey 1937', t: 'Somatic motor and sensory representation in the cerebral cortex of man（Brain 60）', u: 'https://doi.org/10.1093/brain/60.4.389' },
  nelson80: { a: 'Nelson ほか 1980', t: 'Representations of the body surface in postcentral parietal cortex of Macaca fascicularis（J Comp Neurol 192）', u: 'https://doi.org/10.1002/cne.901920402' },
  brecht02: { a: 'Brecht & Sakmann 2002', t: 'Dynamic representation of whisker deflection … layer 4 rat somatosensory cortex（J Physiol 543）', u: 'https://doi.org/10.1113/jphysiol.2002.018465' },
  armstrong92: { a: 'Armstrong-James ほか 1992', t: 'Flow of excitation within rat barrel cortex on striking a single vibrissa（J Neurophysiol 68）', u: 'https://doi.org/10.1152/jn.1992.68.4.1345' },
  vdl73: { a: 'Van der Loos & Woolsey 1973', t: 'Somatosensory cortex: structural alterations following early injury to sense organs（Science 179）', u: 'https://doi.org/10.1126/science.179.4071.395' },
  chapin84: { a: 'Chapin & Lin 1984', t: 'Mapping the body representation in the SI cortex of anesthetized and awake rats（J Comp Neurol 229）', u: 'https://doi.org/10.1002/cne.902290206' },
  garcia03: { a: 'Garcia-Larrea ほか 2003', t: 'Brain generators of laser-evoked potentials（Neurophysiol Clin 33）', u: 'https://doi.org/10.1016/j.neucli.2003.10.008' },
  azevedo16: { a: 'Azevedo ほか 2016', t: 'Activation of C-fiber nociceptors by low-power diode laser（Arq Neuropsiquiatr 74）', u: 'https://doi.org/10.1590/0004-282X20160018' },
  halliday72: { a: 'Halliday ほか 1972', t: 'Delayed visual evoked response in optic neuritis（Lancet）', u: 'https://doi.org/10.1016/s0140-6736(72)91155-5' },
  halliday73: { a: 'Halliday ほか 1973', t: 'Visual evoked response in diagnosis of multiple sclerosis（BMJ）', u: 'https://europepmc.org/article/PMC/PMC1587677' },
  sadato96: { a: 'Sadato ほか 1996', t: 'Activation of the primary visual cortex by Braille reading in blind subjects（Nature 380）', u: 'https://doi.org/10.1038/380526a0' },
  roberts10: { a: 'Roberts ほか 2010', t: 'MEG detection of delayed auditory evoked responses in autism spectrum disorders（Autism Res 3）', u: 'https://doi.org/10.1002/aur.111' },
  bramon04: { a: 'Bramon ほか 2004', t: 'Meta-analysis of the P300 and P50 waveforms in schizophrenia（Schizophr Res 70）', u: 'https://doi.org/10.1016/j.schres.2004.01.004' },
  gracely02: { a: 'Gracely ほか 2002', t: 'Functional magnetic resonance imaging evidence of augmented pain processing in fibromyalgia（Arthritis Rheum 46）', u: 'https://doi.org/10.1002/art.10225' },
  kandel13: { a: 'Kandel ほか 2013', t: 'Principles of Neural Science 第5版（McGraw-Hill）。感覚の道すじ・視床での中継・左右の交差・体の地図' }
};

/* evidence levels shown next to every station */
const EV = {
  measured: { tag: '研究の値', cls: 'ev-m', desc: '論文に書かれた数値そのもの' },
  range:    { tag: '研究の幅', cls: 'ev-r', desc: '論文が範囲で示したもの' },
  order:    { tag: '順番だけ', cls: 'ev-o', desc: '反応する順番は研究のとおり。時刻はおよそ（前後の値のあいだに置いた）' },
  place:    { tag: '場所だけ', cls: 'ev-p', desc: '反応する場所はわかっているが、時刻は確かめられなかった（再生では道すじの順に光らせている）' }
};

/* ---- outlines ---- */
const HUMAN_SHAPE = {
  cerebrum: [[0.0,0.42],[0.02,0.26],[0.10,0.12],[0.24,0.03],[0.42,0.0],[0.60,0.01],[0.76,0.07],[0.89,0.18],[0.97,0.32],[1.0,0.46],[0.98,0.58],[0.92,0.66],[0.82,0.70],[0.70,0.75],[0.56,0.78],[0.44,0.76],[0.34,0.70],[0.29,0.62],[0.24,0.60],[0.12,0.58],[0.04,0.53]],
  cerebellum: { u: 0.80, v: 0.79, ru: 0.14, rv: 0.085 },
  stem: [[0.55,0.60],[0.665,0.60],[0.655,0.80],[0.645,1.0],[0.575,1.0],[0.565,0.80]],
  sulci: [
    [[0.53,0.01],[0.50,0.18],[0.47,0.31],[0.43,0.47]],              // central sulcus
    [[0.30,0.60],[0.42,0.54],[0.56,0.50],[0.66,0.44],[0.71,0.37]],  // Sylvian fissure
    [[0.38,0.68],[0.55,0.645],[0.70,0.60],[0.79,0.52]],             // superior temporal sulcus
    [[0.47,0.01],[0.445,0.18],[0.40,0.42]],                         // precentral
    [[0.585,0.02],[0.555,0.20],[0.515,0.43]],                       // postcentral
    [[0.08,0.22],[0.24,0.13],[0.40,0.11]],                          // superior frontal
    [[0.08,0.40],[0.22,0.36],[0.36,0.40]],                          // inferior frontal
    [[0.59,0.22],[0.71,0.30],[0.86,0.35]]                           // intraparietal
  ],
  extra: []
};
const MACAQUE_SHAPE = {
  cerebrum: [[0.0,0.52],[0.03,0.36],[0.12,0.20],[0.28,0.08],[0.46,0.03],[0.64,0.04],[0.80,0.10],[0.92,0.22],[0.99,0.38],[1.0,0.52],[0.96,0.64],[0.86,0.70],[0.72,0.74],[0.58,0.77],[0.46,0.74],[0.38,0.66],[0.30,0.62],[0.18,0.62],[0.06,0.60]],
  cerebellum: { u: 0.80, v: 0.80, ru: 0.13, rv: 0.08 },
  stem: [[0.53,0.60],[0.64,0.60],[0.635,0.80],[0.625,1.0],[0.555,1.0],[0.545,0.80]],
  sulci: [
    [[0.50,0.04],[0.46,0.20],[0.41,0.42]],                          // central
    [[0.30,0.11],[0.27,0.27],[0.20,0.30],[0.24,0.44]],              // arcuate
    [[0.05,0.42],[0.20,0.37]],                                      // principal
    [[0.32,0.62],[0.48,0.55],[0.62,0.47]],                          // Sylvian (lateral)
    [[0.40,0.70],[0.58,0.63],[0.72,0.52],[0.76,0.38]],              // superior temporal
    [[0.52,0.15],[0.63,0.24],[0.75,0.30]],                          // intraparietal
    [[0.85,0.13],[0.81,0.33],[0.83,0.56]]                           // lunate
  ],
  extra: []
};
const RAT_SHAPE = {
  cerebrum: [[0.12,0.40],[0.16,0.24],[0.28,0.12],[0.45,0.06],[0.62,0.06],[0.76,0.10],[0.84,0.20],[0.86,0.36],[0.82,0.52],[0.72,0.62],[0.58,0.68],[0.42,0.68],[0.28,0.62],[0.18,0.54]],
  cerebellum: { u: 0.905, v: 0.47, ru: 0.07, rv: 0.16 },
  stem: [[0.60,0.62],[0.84,0.58],[0.995,0.64],[0.995,0.80],[0.84,0.80],[0.62,0.76]],
  sulci: [ [[0.18,0.56],[0.40,0.61],[0.62,0.61],[0.80,0.54]] ],      // rhinal fissure
  extra: [ { kind: 'ellipse', u: 0.06, v: 0.42, ru: 0.07, rv: 0.09, name: '嗅球' } ]
};

/* ---- regions ----  deep: inside (drawn dashed, seen through the cortex)  stem: brainstem nuclei */
const R = (name, u, v, r, o) => Object.assign({ name, u, v, r }, o || {});

const HUMAN_REG = {
  thal: R('視床', 0.56, 0.50, 0.065, { deep: 1 }),
  LGN: R('外側膝状体（視床）', 0.615, 0.545, 0.022, { deep: 1, short: 'LGN' }),
  MGN: R('内側膝状体（視床）', 0.595, 0.575, 0.022, { deep: 1, short: 'MGN' }),
  VPL: R('視床の体性感覚の中継核', 0.55, 0.505, 0.022, { deep: 1, short: 'VPL' }),
  V1: R('一次視覚野 V1', 0.965, 0.50, 0.045, { short: 'V1' }),
  V2: R('二次視覚野 V2', 0.915, 0.37, 0.04, { short: 'V2' }),
  PPC: R('頭頂葉（背側の流れ）', 0.74, 0.24, 0.05),
  V4: R('腹側の流れ（下面）', 0.85, 0.68, 0.04, { deep: 1 }),
  FFA: R('紡錘状回の顔領域（下面）', 0.70, 0.735, 0.04, { deep: 1, short: 'FFA' }),
  FEF: R('前頭眼野', 0.35, 0.22, 0.035, { short: 'FEF' }),
  PFC: R('前頭前野', 0.17, 0.30, 0.06),
  S1: R('一次体性感覚野 S1', 0.49, 0.25, 0.035, { short: 'S1', strip: [[0.555,0.04],[0.455,0.46]] }),
  S2: R('頭頂弁蓋・二次体性感覚野 S2', 0.48, 0.475, 0.035, { short: 'S2' }),
  INS: R('島', 0.42, 0.52, 0.04, { deep: 1 }),
  ACC: R('前帯状皮質（内側）', 0.31, 0.33, 0.045, { deep: 1, short: 'ACC' }),
  A1: R('一次聴覚野（ヘシュル回）', 0.535, 0.535, 0.03, { deep: 1, short: 'A1' }),
  HGL: R('ヘシュル回の外側（二次聴覚野）', 0.49, 0.565, 0.028, { deep: 1 }),
  STG: R('上側頭回', 0.60, 0.61, 0.045),
  AMY: R('扁桃体', 0.38, 0.665, 0.03, { deep: 1 }),
  IC: R('下丘（中脳）', 0.625, 0.70, 0.02, { stem: 1 }),
  SOC: R('蝸牛神経核・上オリーブ', 0.615, 0.80, 0.022, { stem: 1 }),
  MED: R('延髄', 0.605, 0.88, 0.02, { stem: 1 }),
  CORD: R('頸髄', 0.61, 0.97, 0.02, { stem: 1 })
};
const MACAQUE_REG = {
  thal: R('視床', 0.53, 0.50, 0.06, { deep: 1 }),
  LGNm: R('外側膝状体の大細胞層（M）', 0.585, 0.53, 0.02, { deep: 1, short: 'LGN-M' }),
  LGNp: R('外側膝状体の小細胞層（P）', 0.60, 0.56, 0.02, { deep: 1, short: 'LGN-P' }),
  MGN: R('内側膝状体（視床）', 0.57, 0.58, 0.02, { deep: 1, short: 'MGN' }),
  VPL: R('視床の体性感覚の中継核', 0.52, 0.50, 0.02, { deep: 1, short: 'VPL' }),
  V1: R('一次視覚野 V1', 0.93, 0.46, 0.055, { short: 'V1' }),
  V2: R('二次視覚野 V2', 0.83, 0.20, 0.035, { short: 'V2' }),
  V3: R('V3', 0.83, 0.62, 0.03, { short: 'V3' }),
  V4: R('V4', 0.77, 0.47, 0.035, { short: 'V4' }),
  MT: R('MT・MST（上側頭溝の中）', 0.72, 0.39, 0.03, { deep: 1, short: 'MT' }),
  PPC: R('頭頂葉', 0.64, 0.21, 0.04),
  FEF: R('前頭眼野', 0.245, 0.33, 0.03, { short: 'FEF' }),
  FACE: R('顔パッチ（上側頭溝）', 0.58, 0.63, 0.03, { deep: 1 }),
  S1: R('一次体性感覚野 S1', 0.47, 0.25, 0.03, { short: 'S1', strip: [[0.525,0.06],[0.435,0.44]] }),
  A1: R('一次聴覚野', 0.50, 0.555, 0.028, { deep: 1, short: 'A1' }),
  STG: R('上側頭回', 0.55, 0.64, 0.04),
  IC: R('下丘（中脳）', 0.595, 0.70, 0.02, { stem: 1 }),
  SOC: R('蝸牛神経核・上オリーブ', 0.59, 0.80, 0.02, { stem: 1 }),
  MED: R('延髄', 0.585, 0.88, 0.02, { stem: 1 }),
  CORD: R('脊髄', 0.59, 0.97, 0.02, { stem: 1 })
};
const RAT_REG = {
  thal: R('視床', 0.56, 0.42, 0.07, { deep: 1 }),
  LGN: R('外側膝状体（視床）', 0.63, 0.39, 0.022, { deep: 1, short: 'LGN' }),
  MGN: R('内側膝状体（視床）', 0.66, 0.46, 0.022, { deep: 1, short: 'MGN' }),
  VPM: R('視床の後内側腹側核（ひげの中継）', 0.55, 0.45, 0.022, { deep: 1, short: 'VPM' }),
  VPL: R('視床の後外側腹側核（足の中継）', 0.53, 0.40, 0.022, { deep: 1, short: 'VPL' }),
  V1: R('一次視覚野 V1', 0.74, 0.18, 0.05, { short: 'V1' }),
  BF: R('たる皮質（ひげの体性感覚野）', 0.52, 0.31, 0.07, { short: 'たる' }),
  FL: R('前足の体性感覚野', 0.40, 0.19, 0.04),
  HL: R('後ろ足の体性感覚野', 0.47, 0.10, 0.035),
  A1: R('一次聴覚野', 0.71, 0.47, 0.04, { short: 'A1' }),
  LA: R('扁桃体外側核', 0.55, 0.63, 0.03, { deep: 1, short: 'LA' }),
  IC: R('下丘（中脳）', 0.85, 0.27, 0.022, { stem: 1 }),
  PRV: R('三叉神経の感覚核（脳幹）', 0.86, 0.70, 0.022, { stem: 1 }),
  SOC: R('蝸牛神経核・上オリーブ', 0.89, 0.66, 0.022, { stem: 1 }),
  MED: R('延髄', 0.93, 0.72, 0.02, { stem: 1 }),
  CORD: R('脊髄', 0.985, 0.72, 0.02, { stem: 1 })
};

const SPECIES = {
  human:   { name: 'ヒト', shape: HUMAN_SHAPE, reg: HUMAN_REG, tint: '#f0b8a8' },
  macaque: { name: 'サル（マカク）', shape: MACAQUE_SHAPE, reg: MACAQUE_REG, tint: '#e8c39c' },
  rat:     { name: 'ラット', shape: RAT_SHAPE, reg: RAT_REG, tint: '#e3bfc9' }
};

/* stimuli and which species have them */
const STIMS = {
  light: { name: '光', icon: '光', desc: '視野のどこかに、短く光を出す' },
  face:  { name: '顔', icon: '顔', desc: '目の前に顔の写真を出す' },
  sound: { name: '音', icon: '音', desc: '片方の耳に短い音' },
  touch: { name: '触る', icon: '触', desc: '体のどこかに短い刺激（皮膚・神経の電気刺激）' },
  pain:  { name: '熱い痛み', icon: '熱', desc: '手の甲に、短い熱のレーザー' },
  click: { name: 'カチッ2回', icon: '2', desc: '0.5秒あけて、同じ音を2回' }
};
/* why a species lacks a stimulus (shown instead of inventing it) */
const MISSING = {
  'rat:face': 'ラットで顔に反応する場所は、このアプリでは確かめた研究がないので入れていません。',
  'macaque:pain': 'サルの痛みの反応の時刻は、確かめた数値がないので入れていません。',
  'rat:pain': 'ラットの痛みの反応の時刻は、確かめた数値がないので入れていません（足をひっこめるまでの時間は測られていますが、脳の反応の時刻とは別のものです）。',
  'macaque:click': 'カチッ2回（P50）は、ヒトの頭の表面の波のデータです。',
  'rat:click': 'カチッ2回（P50）は、ヒトの頭の表面の波のデータです。'
};

/* conditions: human ones change measured things; rat has one learned condition */
const CONDS = {
  none:   { name: '典型（病気・特性なし）', sp: ['human','macaque','rat'] },
  ms:     { name: '多発性硬化症', sp: ['human'], stim: ['light','face'] },
  blind:  { name: '早くから目が見えない人', sp: ['human'], stim: ['touch','light'] },
  asd:    { name: '自閉スペクトラム（子ども）', sp: ['human'], stim: ['sound'] },
  scz:    { name: '統合失調症', sp: ['human'], stim: ['click'] },
  fm:     { name: '線維筋痛症', sp: ['human'], stim: ['pain'] },
  fear:   { name: 'こわい音の記憶（恐怖条件づけ）', sp: ['rat'], stim: ['sound'] }
};
