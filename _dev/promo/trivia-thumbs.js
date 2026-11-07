// うんちくショートのサムネイル（1080×1920）の中身。描くのは trivia-thumb.html、作るのは _dev/tools/make-trivia-thumbs.ps1（RULES 8.7）
// t: 絵を取る秒（台本を ?short&thumbart=<t> で開き、字を消した絵だけを撮る）。crop: その絵のどこを使うか [x, y, 幅, 高さ]（1080×1920 の座標）
// title: 大きな題名（動画のはじめの問いと同じ言葉。\n で改行、[ ] は朱。1行7字くらいまでに分けると大きく出る）。line: 小さな一言（15字くらいまで）。動画の中の言葉・数字だけ
window.TRIVIA_THUMBS = {
  'tiny-earth-trivia1':    { t: 1.5, crop: [150, 220, 780, 880], title: '歩いたら、\n[人工衛星]。', line: '地球を半径1kmに縮めたら？' },
  'evolution-trivia1':     { t: 22, crop: [40, 300, 1040, 800], title: '恐竜が\n絶滅した日\n[季節は？]', line: '6600万年前、あの隕石の日' },
  'ga-creatures-trivia1':  { t: 1.5, crop: [120, 440, 840, 700], title: 'プログラムが\n[死んだふり]？', line: 'テストを見やぶったプログラム' },
  'tree-of-life-trivia1':  { t: 1.0, crop: [100, 440, 880, 480], title: 'ヒトに\n[近いのは？]', line: 'ヒトデとタコ、ヒトの親せきは？' },
  'metamorphosis-trivia1': { t: 1.2, crop: [50, 470, 760, 480], title: 'ドロドロに\nなっても\n[記憶は残る？]', line: 'イモムシの記憶、ガになっても？' },
  'extreme-trivia1':       { t: 1.5, crop: [180, 150, 820, 620], title: 'つぶれるから、\n[じゃない]。', line: '8,200 mより下に深海魚がいないわけ' },
  'god-view-trivia3':      { t: 12.5, crop: [180, 140, 720, 620], title: 'この30秒で\nあなたは\n[何km]動く？', line: 'すわっているだけ。それでも動いている' },
};
