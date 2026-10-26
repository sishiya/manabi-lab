// ショートのサムネイル（1080×1920）の中身。描くのは short-thumb.html、作るのは _dev/tools/make-short-thumbs.ps1（RULES 8.7）
// t: ショートの mp4 から取るコマの秒。focus: 絵の中で見せたい点（0〜1、左上が 0,0）、zoom: 寄せる倍率（1 = 横いっぱい）
// kicker: 上の小さな一言、big: いちばん大きな言葉（数字や驚き）、sub: 下の言葉。c1・c2: big の色（上から下へ）
// wmask: false で横長の絵のふちをぼかさない（くらべる絵の札が消えないように）
// still: mp4 のコマのかわりに使う絵（2160×3840、stills/）。note: 右下の小さな注（※。絵の演出をことわる）
// 数字は動画・アプリで出している値だけ（想像で盛らない）
window.SHORT_THUMBS = {
  'evolution':     { name: 'ヒトへの46億年', t: 33, focus: [0.5, 0.33], zoom: 1.5, kicker: '溶けた地球 → 恐竜 → 人類', big: '46億年', sub: 'を40秒で', c1: '#fff3a0', c2: '#ffb21e' },
  'body-dive':     { name: '体内ダイブ', t: 3.4, focus: [0.5, 0.3], zoom: 1.15, kicker: 'カプセル内視鏡になって', big: '口から肛門', sub: 'まで旅してみた', c1: '#ffffff', c2: '#ffd36b' },
  'black-hole':    { name: 'ブラックホールの見え方', t: 20, focus: [0.5, 0.36], zoom: 1.35, kicker: '映画では省かれた、本当の姿', big: 'ブラックホール', sub: '本当は左が明るい', c1: '#fff6d8', c2: '#ffb347' },
  // 2026-10-16（10-19 にユーザーの指示でマムシから戻した。ショートにハエの場面はないが、説明動画にはある）: カラスの目（人の目とほぼ同じ絵で目立たなかった）→ ハエの目。ショートにハエの場面はないので、アプリの絵を stills/ に（4K で撮って真ん中を縦に切り出し）
  //   ハエ・昼・ふち あり、家の近く（pos [-4,1.3,-1.6]・yaw 0・pitch -0.15。花だんが U の字に曲がる）を 3840×2160 で撮り、真ん中 1944×2160 を 2160×2400 にして下を暗く。
  //   本当のことだけ: ふち（ハエには見えない目印）と全周を1枚に広げた曲がりは、note の ※ でことわる（アプリの凡例にも同じ注）。色は人の色のままなので、言葉は「細かさ」だけ
  'animal-senses': { name: 'いきものの感じる世界', t: 8, still: 'stills/animal-senses-fly.jpg', focus: [0.5, 0.3], zoom: 1, wzoom: 0.5, wfocus: [0.5, 0.316], kicker: '同じ庭なのに', big: 'ハエの目', sub: 'の細かさで見ると', note: '※ 六角形のふちは見やすさのための目印（ハエには見えません）。まわり約330°を1枚に広げた絵です', c1: '#fff3d0', c2: '#ffb84a' },
  'quantum':       { name: '量子の実験室', t: 17, focus: [0.5, 0.3], zoom: 1.6, kicker: '電子を1個ずつ飛ばすと', big: 'しま模様', sub: 'が現れる ― 二重スリット', c1: '#fff3a0', c2: '#ffc21e' },
  'metamorphosis': { name: 'さなぎの中で', t: 13, focus: [0.5, 0.36], zoom: 1.7, kicker: 'イモムシがガになるまで18日', big: 'さなぎの中', sub: 'はどうなってる？', c1: '#e0fbff', c2: '#43d3ff' },
  'immune-battle': { name: '免疫のたたかい', t: 21, focus: [0.5, 0.35], zoom: 1.6, kicker: 'インフルエンザのウイルスは3日目に', big: '数十億個', sub: 'それでも8日目ごろ消える', c1: '#ffe0ea', c2: '#ff5c8a' },
  'air-flow':      { name: '空気の流れの見える部屋', t: 26, focus: [0.5, 0.41], zoom: 1.6, kicker: '窓を2か所あけると、換気は', big: '58回/時', sub: '24時間換気だけなら 0.67回/時', c1: '#e0fbff', c2: '#3fd0ff' },
  'ga-creatures':  { name: '進化の箱庭', t: 26, focus: [0.64, 0.31], zoom: 3.6, kicker: 'でたらめな生きものが', big: '40世代', sub: 'で走り方を身につける', c1: '#e8ffe0', c2: '#5ee35e' },
  'god-view':      { name: '神の視点マップ', t: 12, focus: [0.5, 0.38], zoom: 1.5, wfocus: [0.5, 0.34], kicker: 'ホイールひとつで', big: '宇宙の果て', sub: 'からクォークまで', c1: '#e3f4ff', c2: '#5bb8ff' },
  'wifi-wave':     { name: '電波の見える部屋', t: 29, focus: [0.3, 0.3], zoom: 1.9, kicker: 'WiFi の電波を見える化', big: '5 GHz', sub: 'は壁の向こうで弱くなる', c1: '#fff0d0', c2: '#ff9a2e' },
  // 2026-10-22: 淡い壁に「8週間」で目を引かなかった → 同じ壁・同じ梅雨の8週間を2つの習慣でくらべる絵（mold-still.html で撮る。数はアプリの記録の表と同じ）
  'mold-growth':   { name: 'カビが育つまで', t: 29, still: 'stills/mold-growth-compare.jpg', focus: [0.5, 0], zoom: 1, wzoom: 0.56, wfocus: [0.5, 0.25], wmask: false, kicker: 'お風呂のカビに効く習慣', big: '換気＋水切り', sub: '8週間でカビが 1/100以下', note: '※ 梅雨の浴室の壁（横10cm）を計算した、学習用シミュレーションの推定です', c1: '#f0ffd8', c2: '#9be04a' },
  'piano-hand':    { name: 'ピアノを弾く手', t: 21.6, focus: [0.62, 0.62], zoom: 1.35, kicker: '皮ふの下では', big: '骨と筋肉', sub: 'がこう動いている', c1: '#ffe6e0', c2: '#ff6b5c' },
  'pitch-physics': { name: '変化球のしくみ', t: 31, focus: [0.5, 0.36], zoom: 1.45, wfocus: [0.5, 0.4], kicker: '同じねらいで投げても', big: 'ナックル', sub: '左右 38 cm・上下 47 cm ばらける', c1: '#fff6d8', c2: '#ffd166' },
  'phage':         { name: '細菌にとりつくウイルス', t: 12.15, focus: [0.5, 0.44], zoom: 1.7, wfocus: [0.5, 0.42], wzoom: 0.8, kicker: '細菌だけにとりつくウイルスは', big: '注射器', sub: 'のように DNA を入れる', c1: '#e0f2ff', c2: '#5bb8ff' },
  'hair-removal':  { name: '脱毛のしくみ', t: 28.5, focus: [0.5, 0.4], zoom: 1.5, kicker: '光脱毛の光は', big: '毛の黒い色', sub: 'に吸われて熱になる', c1: '#ffe6ee', c2: '#ff8fb1' },
  'wave-growth':   { name: '波が育つまで', t: 31, focus: [0.5, 0.42], zoom: 1.3, kicker: '凪の海に風が吹いて', big: '約30時間', sub: 'で育ちきる。高さ 3.1 m', c1: '#fff3d6', c2: '#ffc46b' }
};
