// ジオラマに見えるわけ — 場面の一覧（つくった 3D の町と、本物の写真）
// 写真の奥行きは Depth Anything V2 Small（Apache-2.0）で推定した「距離の逆数の相対値」（tools/depth.py）。
// 相対値なので、距離の逆数 = α·D と置き（D はいちばん遠い所が 0）、α を写真の中の2点の距離（anchors。地図と写真から見当をつけた推定）で決める。
// Held の式に効くのは距離の逆数の差なので、α の見当がずれると「何分の1」の数が同じ割合でずれる（合い方は変わらない）。
//   anchors: [[u, v, 距離 m], [u, v, 距離 m]]（u は左 0→右 1、v は下 0→上 1）
'use strict';
const SCENES = [
  { id: 'shirakawa', kind: 'photo', name: '山あいの村', short: '村',
    img: 'assets/photo/shirakawa.jpg', depth: 'assets/photo/shirakawa-d.png', thumb: 'assets/photo/shirakawa-t.jpg',
    anchors: [[0.5, 0.06, 280], [0.5, 0.55, 650]],
    credit: { who: 'lumoplank', lic: 'CC0', title: 'Shirakawa-go - Shirakawa161.jpg', url: 'https://commons.wikimedia.org/wiki/File:Shirakawa-go_-_Shirakawa161.jpg' },
    note: '岐阜県・白川郷（展望台から）' },
  { id: 'suzuka', kind: 'photo', name: '地方の町と川', short: '町',
    img: 'assets/photo/suzuka.jpg', depth: 'assets/photo/suzuka-d.png', thumb: 'assets/photo/suzuka-t.jpg',
    anchors: [[0.5, 0.06, 90], [0.5, 0.45, 700]],
    credit: { who: 'carloshonda', lic: 'CC BY 3.0', title: '150315-0641 Suzuka, 54, Centro - panoramio.jpg', url: 'https://commons.wikimedia.org/wiki/File:150315-0641_Suzuka,_54,_Centro_-_panoramio.jpg' },
    note: '三重県鈴鹿市（高い所から）' },
  { id: 'bay', kind: 'photo', name: '入り江と船', short: '海',
    img: 'assets/photo/bay.jpg', depth: 'assets/photo/bay-d.png', thumb: 'assets/photo/bay-t.jpg',
    anchors: [[0.15, 0.08, 160], [0.62, 0.42, 420]],
    credit: { who: 'dronepicr', lic: 'CC BY 2.0', title: 'Porat beach on Bisevo island, Croatia, a view from above (48693984742).jpg', url: 'https://commons.wikimedia.org/wiki/File:Porat_beach_on_Bisevo_island,_Croatia,_a_view_from_above_(48693984742).jpg' },
    note: 'クロアチア・ビシェヴォ島（丘の上から）' },
  { id: 'railway', kind: 'photo', name: '線路と列車', short: '列車',
    img: 'assets/photo/railway.jpg', depth: 'assets/photo/railway-d.png', thumb: 'assets/photo/railway-t.jpg',
    anchors: [[0.8, 0.15, 25], [0.15, 0.72, 130]],
    credit: { who: 'Igor123121', lic: 'CC BY 4.0', title: 'Railway line No. 109, Wieliczka Park railway station area, Wieliczka City, Poland', url: 'https://commons.wikimedia.org/wiki/File:Railway_line_No._109.,._Wieliczka_Park_railway_station_area,_Wieliczka_City,_Poland.jpg' },
    note: 'ポーランド・ヴィエリチカ（高い所から）' },
  { id: 'tokyo', kind: 'photo', name: '大きな町のビル', short: 'ビル',
    img: 'assets/photo/tokyo.jpg', depth: 'assets/photo/tokyo-d.png', thumb: 'assets/photo/tokyo-t.jpg',
    anchors: [[0.62, 0.25, 50], [0.25, 0.5, 160]],
    credit: { who: 'Syced', lic: 'CC0', title: 'View from City Tower Ebisu.jpg', url: 'https://commons.wikimedia.org/wiki/File:View_from_City_Tower_Ebisu.jpg' },
    note: '東京・恵比寿（高い建物から）。手前のビルが近い' },
  { id: 'fields', kind: 'photo', name: '畑と小さな町', short: '畑',
    img: 'assets/photo/fields.jpg', depth: 'assets/photo/fields-d.png', thumb: 'assets/photo/fields-t.jpg',
    anchors: [[0.5, 0.05, 500], [0.6, 0.55, 1600]],
    credit: { who: 'Karelj', lic: 'パブリックドメイン', title: 'Kvasiny from air K1-1.jpg', url: 'https://commons.wikimedia.org/wiki/File:Kvasiny_from_air_K1-1.jpg' },
    note: 'チェコ・クヴァシニ（空から）' },
  { id: 'town', kind: '3d', name: 'つくった町（3D）', short: '3D の町', thumb: 'assets/photo/town-thumb.jpg',
    note: '角度・動きを変えられる。CG なので、写真ほど本物には見えない' },
];
