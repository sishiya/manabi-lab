# 外部ライブラリの一覧（lib/）

まなびラボが読み込む外のライブラリと、その置き場所。**よく使うものはこのフォルダに置き**（CDN が止まったり版が消えたりしても動くように）、1本のアプリだけ・大きいものは CDN のまま。
最終更新: 2026-10-12

## このフォルダに置いているもの

フォルダ名は npm のパッケージ名と版（`<名前>@<版>`）。中の並びも npm と同じにして、CDN の URL の `https://cdn.jsdelivr.net/npm/` を `<ここまでの相対パス>/lib/` に変えるだけで同じファイルを指すようにしている。中身は CDN から取ったものをそのまま（書きかえない）。

| ライブラリ | 版 | ライセンス | 使っているところ | 取ってきた元 |
|---|---|---|---|---|
| three.js（`build/three.min.js`） | r128（0.128.0） | MIT（`three@0.128.0/LICENSE`） | 体内ダイブ・尿の旅・血管の旅・ヒトへの46億年・いきものの感じる世界・磁性流体・ピアノを弾く手・神の視点マップ（`god-view/js/micro.js`・`space.js`） | cdnjs `three.js/r128/three.min.js`（jsDelivr の `three@0.128.0/build/three.min.js` と同じファイル。SHA-256 で確認） |
| three.js のおまけ（`examples/js/` のブルーム一式6本） | 0.128.0 | MIT（同上） | ピアノを弾く手 | jsDelivr `three@0.128.0/examples/js/…` |
| chess.js（`dist/esm/chess.js`。ES モジュール） | 1.4.0 | BSD-2-Clause（`chess.js@1.4.0/LICENSE`） | 名局の戦場（アプリと `chess-battle/tools/verify.mjs` の両方で読む） | jsDelivr `chess.js@1.4.0/dist/esm/chess.js`（2026-10-31） |
| three.js の OrbitControls・GLTFLoader・SkeletonUtils（`examples/js/controls/`・`loaders/`・`utils/`） | 0.128.0 | MIT（`three@0.128.0/LICENSE`） | 名局の戦場（自由カメラ・兵士の glb） | jsDelivr `three@0.128.0/examples/js/…`（2026-10-31） |
| three.js（`build/three.module.min.js`＋`three.core.min.js`、`examples/jsm/` の GLTFLoader・OrbitControls・SkeletonUtils・BufferGeometryUtils・SortUtils・postprocessing（EffectComposer・RenderPass・ShaderPass・OutputPass・UnrealBloomPass・Pass・MaskPass）・shaders（Copy・LuminosityHighPass・Output）。ES モジュール） | 0.185.1 | MIT（`three@0.185.1/LICENSE`） | 名局の戦場（段階Bの作りなおし。importmap で読む） | jsDelivr `three@0.185.1/…`（2026-10-31） |
| @three.ez/instanced-mesh（InstancedMesh2。`build/index.js`） | 0.3.16 | MIT（`LICENSE`） | 名局の戦場（兵を千人まとめて描く・骨の動き） | jsDelivr（2026-10-31）。three 0.159 以上がいる |
| bvh.js（`build/index.js`） | 0.0.13 | MIT（`LICENSE`） | InstancedMesh2 が読む | jsDelivr（2026-10-31） |
| mp4-muxer（`build/mp4-muxer.min.js`） | 5.1.3 | MIT（`mp4-muxer@5.1.3/LICENSE`） | 紹介動画の台本 `_dev/promo/*.html`（29本。mp4 を作りなおすのに必要） | jsDelivr `mp4-muxer@5.1.3/build/mp4-muxer.min.js` |

## CDN のままのもの（理由つき）

| ライブラリ | 版 | ライセンス | 使っているところ | CDN のままにしている理由 |
|---|---|---|---|---|
| CesiumJS | 1.146.0 | Apache-2.0 | 神の視点マップ | 1本だけ。Workers・Assets を含めると大きい（数十MB） |
| satellite.js | 5.0.0 | MIT | 神の視点マップ（人工衛星） | 1本だけ。使うときだけ読む |
| astronomy-engine | 2.1.19 | MIT | 神の視点マップ（宇宙から） | 1本だけ。使うときだけ読む |
| @mediapipe/tasks-vision | 0.10.14 | Apache-2.0 | `_dev/vtuber/`（紹介動画のライオン。公開しない道具） | wasm と顔のモデルが大きい・道具だけ |
| three.js | 0.160.0 | MIT | `mood-world/lab/`（作りかけ） | 試作。アプリになったら考える |
| Google Fonts（Zen Kaku Gothic New・Dela Gothic One・IBM Plex Mono など） | — | SIL OFL | 入口・各アプリ | 日本語のフォントは大きく、Google が文字ごとに分けて配っているため。読めなくても OS のフォントで表示される |

- ライセンスは各パッケージの `package.json` の `license` と LICENSE ファイルで確かめた（2026-10-12）。
- `versions/` の節目の版は、作ったときのまま CDN を読む（versions の中は書きかえない。RULES 3章）。

## 足すとき・版を上げるとき

1. ライセンスを確かめる（MIT・Apache-2.0・BSD など、配りなおしてよいもの）。LICENSE ファイルもいっしょに置く。
2. 2本以上のアプリで使うもの・道具の作りなおしに要るものは、ここに置く。1本だけで大きいものは CDN でよい（この表に書く）。
3. 版を上げるときは新しい版のフォルダを並べて足し、古いフォルダは使うところがなくなってから消す。版を上げたアプリは「確認のしかた」と smoke を通す。
4. アプリの画面の「使っているもの（ライブラリとライセンス）」の表記と、この表を同じにしておく。
