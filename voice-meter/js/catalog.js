// 測る数の一覧（画面に出す名前・意味・測り方・図の種類）。計算そのものは js/engine にある
// tier: 測定／推定／マイクしだい。mode: both・hold（のばす声だけ）・speech（話し声だけ）
export const GROUPS = [
  ['pitch', '高さ', '声帯が1秒に何回ふるえるか'],
  ['source', '声帯の鳴り方', 'ふるえのそろい方と閉じ方'],
  ['filter', '響き', 'のどから口までの筒でできる山'],
  ['color', '音色', '低い音と高い音のエネルギーの配分'],
  ['time', '話し方', '音節と間の時間'],
  ['level', '大きさ', 'マイクの中での相対の値'],
];

export const MAIN = ['f0_med', 'f0_range', 'F1', 'hnr', 'h1h2'];

const P = (id, g, name, unit, dp, tier, mode, axis, lens, meaning, how, src) => ({ id, g, name, unit, dp, tier, mode, axis, lens, meaning, how, src });

export const PARAMS = [
  P('f0_med', 'pitch', '声の高さ', 'Hz', 0, '測定', 'both', [60, 500, 'log'], 'f0', '大きいほど高い声。', '自己相関で1周の長さを見つけ、声のある時間の中央値を取ります。', 'boersma'),
  P('f0_p20', 'pitch', '低いほうの高さ（20%）', 'Hz', 0, '測定', 'both', [60, 500, 'log'], 'f0', 'ふだんの低いほうの高さ。', '声のある時間の高さを並べて下から20%の値。', 'gemaps'),
  P('f0_p80', 'pitch', '高いほうの高さ（80%）', 'Hz', 0, '測定', 'both', [60, 500, 'log'], 'f0', 'ふだんの高いほうの高さ。', '声のある時間の高さを並べて下から80%の値。', 'gemaps'),
  P('f0_range', 'pitch', '高さの幅', '半音', 1, '測定', 'both', [0, 16], 'f0', '大きいほど上がり下がりが大きい。のばした声では小さくなります。', '20%と80%の高さの差を半音で数えます。', 'gemaps'),
  P('f0_sd', 'pitch', '高さのばらつき', '半音', 1, '測定', 'both', [0, 8], 'f0', '大きいほど抑揚がある。', '高さ（半音）の標準偏差。', 'gemaps'),
  P('f0_rise', 'pitch', '上がる速さ', '半音/秒', 0, '測定', 'both', [0, 60], 'f0', '大きいほど高さがすばやく上がる。', '高さが上がっている所の、1秒あたりの半音の変化の平均。', 'gemaps'),
  P('f0_fall', 'pitch', '下がる速さ', '半音/秒', 0, '測定', 'both', [0, 60], 'f0', '大きいほど高さがすばやく下がる。', '高さが下がっている所の、1秒あたりの半音の変化の平均。', 'gemaps'),
  P('vib_rate', 'pitch', 'ビブラートの速さ', '回/秒', 1, '測定', 'both', [3, 9], 'f0', '声の高さが周期的にゆれる回数。ゆれがなければ出ません。', 'いちばん長い声の区間で、3〜9回/秒のゆれの強さを調べます。', 'self'),
  P('vib_ext', 'pitch', 'ゆれの幅', '半音', 2, '測定', 'both', [0, 2], 'f0', '大きいほど高さのゆれが大きい。', '上のゆれの片側の幅。', 'self'),

  P('hnr', 'source', '声のすみ具合（HNR）', 'dB', 1, '測定', 'both', [0, 35], 'track', '大きいほど周期的な音が多く、小さいほど雑音やみだれが多い。', '自己相関の山の高さ r から 10·log₁₀(r/(1−r))。', 'boersma'),
  P('cpp', 'source', '周期の目立ち方（CPP）', 'dB', 1, '測定', 'both', [5, 40], 'cep', '大きいほど周期がはっきりしている。ソフトごとに値がかわります。', 'ケプストラムの山と回帰直線の差。前後のフレームで平均します。', 'hillenbrand'),
  P('h1h2', 'source', '声帯の閉じ方の目安（H1*−H2*）', 'dB', 1, '推定', 'both', [-12, 20], 'harm', '大きいほど息っぽい、小さいほど強く閉じる傾向があります。', '1番目と2番目の倍音の強さの差。フォルマントの影響を計算で除きます。', 'iseli'),
  P('h1a3', 'source', '高い倍音の弱まり（H1*−A3*）', 'dB', 1, '推定', 'both', [-10, 45], 'harm', '大きいほど高い音が弱い、やわらかい声です。', '1番目の倍音と、F3 付近で一番強い倍音の差。フォルマントの影響を除きます。', 'iseli'),
  P('jit_loc', 'source', '周期のゆらぎ（ジッター）', '%', 2, 'マイクしだい', 'hold', [0, 3], 'wave-t', '大きいほど1周ごとの長さがそろっていない。', 'となりあう周期の差の平均 ÷ 周期の平均。', 'praat'),
  P('jit_rap', 'source', 'ジッター（3点）', '%', 2, 'マイクしだい', 'hold', [0, 2], 'wave-t', '前後3周の平均からのずれ。', '周期と前後を合わせた3周の平均との差の平均 ÷ 周期の平均。', 'praat'),
  P('shim_loc', 'source', '大きさのゆらぎ（シマー）', '%', 1, 'マイクしだい', 'hold', [0, 15], 'wave-a', '大きいほど1周ごとの大きさがそろっていない。', 'となりあう周期の山の高さの差の平均 ÷ 高さの平均。', 'praat'),
  P('shim_db', 'source', 'シマー（dB）', 'dB', 2, 'マイクしだい', 'hold', [0, 1.5], 'wave-a', '上と同じものを dB で。', 'となりあう周期の山の高さの比の dB の絶対値の平均。', 'praat'),
  P('shim_apq3', 'source', 'シマー（3点）', '%', 1, 'マイクしだい', 'hold', [0, 12], 'wave-a', '前後3周の平均からのずれ。', '山の高さと前後を合わせた3周の平均との差の平均 ÷ 高さの平均。', 'praat'),

  P('F1', 'filter', '第1フォルマント（F1）', 'Hz', 0, '測定', 'both', [200, 1100], 'vowel', '大きいほど口を大きく開けた響き。', 'Burg の方法で声の山を見つけ、声のある時間の中央値を取ります。', 'praatF'),
  P('F2', 'filter', '第2フォルマント（F2）', 'Hz', 0, '測定', 'both', [600, 2800], 'vowel', '大きいほど舌が前にある響き。', 'F1 と同じ計算の2番目の山。', 'praatF'),
  P('F3', 'filter', '第3フォルマント（F3）', 'Hz', 0, '測定', 'both', [1800, 3600], 'formant', '声の個人差が出やすい山の一つ。', 'F1 と同じ計算の3番目の山。', 'praatF'),
  P('F4', 'filter', '第4フォルマント（F4）', 'Hz', 0, 'マイクしだい', 'both', [2800, 4800], 'formant', 'マイクの性能で変わりやすい高い山。', 'F1 と同じ計算の4番目の山。', 'praatF'),
  P('B1', 'filter', 'F1 の帯域幅', 'Hz', 0, 'マイクしだい', 'both', [20, 400], 'formant', '山の広がり。大きいほどぼやけた山。', '計算した山の幅。', 'praatF'),
  P('B2', 'filter', 'F2 の帯域幅', 'Hz', 0, 'マイクしだい', 'both', [20, 400], 'formant', '山の広がり。', '計算した山の幅。', 'praatF'),
  P('B3', 'filter', 'F3 の帯域幅', 'Hz', 0, 'マイクしだい', 'both', [20, 500], 'formant', '山の広がり。', '計算した山の幅。', 'praatF'),
  P('dF', 'filter', 'フォルマントの間隔', 'Hz', 0, '推定', 'both', [800, 1600], 'tube', '大きいほど声の筒が短い。', 'F1〜F4 を一様な管の並びとみなして回帰します。', 'tube'),
  P('vtl', 'filter', '声の筒の長さ', 'cm', 1, '推定', 'both', [9, 21], 'tube', '声帯から唇までの長さの換算。一様な管とみなした値です。', 'L = 音速 ÷（2 × 間隔）。音速は 350 m/秒として計算。', 'tube'),

  P('alpha', 'color', 'アルファ比', 'dB', 1, '測定', 'both', [-5, 40], 'band-alpha', '大きいほど 1kHz より下に音が集まっている。', '50〜1000Hz と 1〜5kHz のエネルギーの比。', 'gemaps'),
  P('hamm', 'color', 'ハマーバーグ指数', 'dB', 1, '測定', 'both', [0, 50], 'band-hamm', '大きいほど高い帯の山が弱い。', '0〜2kHz の一番高い山と 2〜5kHz の一番高い山の差。', 'gemaps'),
  P('slope0', 'color', '低域の傾き', 'dB/kHz', 0, '測定', 'both', [-40, 60], 'band-slope0', '0〜500Hz の間のスペクトルの傾き。', '0〜500Hz の対数スペクトルに直線を当てはめます。', 'gemaps'),
  P('slope1', 'color', '中域の傾き', 'dB/kHz', 0, '測定', 'both', [-50, 20], 'band-slope1', '500〜1500Hz の間のスペクトルの傾き。', '500〜1500Hz の対数スペクトルに直線を当てはめます。', 'gemaps'),
  P('centroid', 'color', 'スペクトルの重心', 'Hz', 0, '測定', 'both', [150, 2000, 'log'], 'band-cent', '大きいほど明るい音色。', 'パワーで重みをつけた周波数の平均。', 'self'),

  P('rate', 'time', '話す速さ', '音節/秒', 1, '推定', 'speech', [1, 9], 'env', '間も含めた1秒あたりの音節の数。日本語のモーラ数とは少しちがいます。', '音量の山のうち前後にへこみがあり声のあるものを音節と数えます。', 'dejong'),
  P('art', 'time', '調音の速さ', '音節/秒', 1, '推定', 'speech', [1, 10], 'env', '間をのぞいた1秒あたりの音節の数。', '上の音節の数 ÷（話した時間 − 間）。', 'dejong'),
  P('pause_n', 'time', '間の数', '回', 0, '測定', 'speech', [0, 8], 'env', '0.3秒以上の静かな所の数。', '音量がしきいより下の時間を数えます。', 'dejong'),
  P('pause_mean', 'time', '間の長さ', '秒', 2, '測定', 'speech', [0, 2], 'env', '間の平均の長さ。', '上の間の平均。', 'dejong'),
  P('voiced_pct', 'time', '声のある割合', '%', 0, '測定', 'speech', [0, 100], 'env', '話している時間のうち声帯が鳴っている割合。', '声ありのフレームの時間 ÷ 話した時間。', 'self'),

  P('lv_range', 'level', '大きさの幅', 'dB', 1, 'マイクしだい', 'both', [0, 25], 'env', '大きいほど強弱がある。絶対の音量は測れません。', '声のある時間の音量の20%と80%の差。', 'gemaps'),
];

export const byId = Object.fromEntries(PARAMS.map(p => [p.id, p]));

export const SOURCES = {
  praat: 'Boersma, P. & Weenink, D. Praat のマニュアル（Voice 2. Jitter・Voice 3. Shimmer・PointProcess: Get jitter (local)）',
  praatF: 'Praat のマニュアル（Sound: To Formant (burg)）。上限の周波数の選び方は Escudero, Boersma, Rauber & Bion (2009) JASA 126: 1379–1393 の考え方',
  boersma: 'Boersma, P. (1993) Accurate short-term analysis of the fundamental frequency and the harmonics-to-noise ratio of a sampled sound. IFA Proceedings 17: 97–110',
  gemaps: 'Eyben, F. ほか (2016) The Geneva Minimalistic Acoustic Parameter Set (GeMAPS). IEEE Trans. Affective Computing（全文は未確認。定義はこの論文を説明した資料で確かめた）',
  hillenbrand: 'Hillenbrand, J. & Houde, R. A. (1996) Acoustic correlates of breathy vocal quality. JSHR 39: 311–321',
  iseli: 'Iseli & Alwan (2004) ICASSP ／ Iseli, Shue & Alwan (2007) JASA（補正は共鳴の周波数応答から自分で導いた）',
  dejong: 'de Jong, N. H. & Wempe, T. (2009) Praat script to detect syllable nuclei and measure speech rate automatically. Behavior Research Methods 41(2): 385–390',
  tube: '一様な管の共鳴（音響音声学の教科書の式）。話し声の母音をならした値',
  self: 'このアプリの計算（定義はそのまま画面の説明のとおり）',
};
