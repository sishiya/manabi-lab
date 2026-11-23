# ジオラマに見えるわけ 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: v005-full3d（2026-11-23）。完全 3D の場面6つ（町・駅・港・競技場・海・田んぼ）。写真と動画の 3D の場面、「見える／見えない」の記録は外した（ユーザーの指示）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。英語なし。
- 次にやること（案）: 批判役（見た目・スマホの重さ）に見てもらう。田んぼの区画が整いすぎ・港の水の色・海の家の屋根。スマホ実機での重さ（田んぼ・町が重い）。場面を足すなら遊園地（観覧車）・高速道路のジャンクション・スキー場。
- 読む順: PLAN.md の「段階E」→ このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps〜apps-6（.claude/launch.json）で http://localhost:8765/tilt-shift/ 。デバッグ用の窓口 `window.__tish`（`set({stage:'port', mode:1, pitch:20})` で設定して計算の結果を返す・`fit`・`P`・`stage`・`simRun(秒)`）、エラーは `window.__tishErr`。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へ。RULES 3章）。
- ユーザーの依頼: 「ティルトシフトがなぜジオラマ風に見えるのか試せるアプリ」→ 2026-11-23「完全 3D でバリエーションを。遠目でリアルかな？と考えるくらいに。公開するアプリとして作り込んで」。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 骨組み。絵と結果（#view、スマホでは上に固定）、つまみ（#panel）、なぜ？（#why）、出どころ（#about） | |
| css/style.css | 見た目。960px 以上で左右2列 | `.seg`/`.presets`（切りかえ＝枠） |
| js/kit.js | 場面の共通の部品。材質（世界の座標のノイズで色むら・汚れ・雨だれ・凹凸）、建物の壁5種（ガラス・ベランダの集合住宅・タイル・商店・家）と屋上、切妻屋根、木、人、車（横から見た形を押し出す）、水、地面 | `Kit.mat(name, 材質, GLSL, 前置き)`・`building(style)`・`trees`・`people`・`cars`・`water`・`G.canopy`（森の樹冠） |
| js/town.js | 家並み（区画を細長い敷地に分けて建物を置く）と、地面の絵（道・歩道・横断歩道・公園・駐車場・庭） | `Town.create()` → `split`・`building`・`kindOf`・`finish`、`Town.paint(o)`・`farHouses` |
| js/traffic.js | 道すじ（折れ線）の上を前との間をあけて進む物。赤信号・駅で止まる | `Traffic.lane`・`add`・`step`・`at` |
| js/world.js | 場面の入れ物（空の HDRI・太陽・かすみ・作りなおし）。かすみは距離の1乗の指数（fog_fragment を差しかえ）、色は空の写真の地平線の平均 | `STAGES`・`World.load(id, renderer, opt)` |
| js/stages/*.js | 場面: city（町なかの交差点）・rail（線路と駅）・port（コンテナの港）・stadium（サッカー場）・beach（夏の海水浴場）・village（田んぼの村） | `STAGES.push({ id, view, sun, build })` |
| js/controls.js | 絵をさわってカメラ（1本指で回す・つまむ／ホイールで寄る・2本指／右ドラッグでずらす） | `Controls.init` |
| js/blur.js | 後処理（SSAO → ぼけと色 → FXAA）。CPU 用に同じ式 | `Blur.create`・`render(scene, camera, P)`・`cocBand`・`cocDepth` |
| js/measure.js | 距離の格子 64×40 の読みもどしと、Held の式の当てはめ | `Measure.readDepth`・`focusDist`・`fit`・`zmax` |
| js/ui.js | 場面のボタン・つまみ・ためしてみる6つ・結果の文・目印の線 | `UI.init`・`showResult`・`drawGuide`・`PRESETS` |
| js/main.js | three.js の用意・カメラ・場面の切りかえ・ループ（コマ落とし）・窓口 | `S`（設定。`S.stage`）・`derive`・`measure`・`window.__tish` |
| assets/tex/*.jpg・sky_1k.hdr | ambientCG（CC0）の道・歩道・芝・コンクリート。空は Poly Haven kloofendal 1k（CC0） | |
| assets/thumb/*.jpg | 場面ボタンの見本（288×192。shot.mjs で撮って切り取り） | |
| tools/shot.mjs | 手元だけ: 絵を撮る。`--gpu` で GPU（速い）。設定の `run` で時間を進める | `node tilt-shift/tools/shot.mjs <出力> --gpu a='{"stage":"rail","mode":0,"run":20}'` |
| tools/eval.mjs | 手元だけ: ページで JS の式を評価する（デバッグ） | |

読み込み順: three.min.js（../lib r128）→ RGBELoader → kit → traffic → town → world → stages/* → blur → measure → controls → ui → main。power.js は head。

## しくみ
- ぼけ・計算は以前と同じ（帯: 線からの距離で RAMP=0.35 かけて R まで。奥行き: r = kf·|1/z0 − 1/z|。Held の式 b = A·|1/z0 − 1/z| を 64×40 の点に当てはめて s）。距離の格子はカメラが止まって 150 ms たってから読む（動かしているあいだは前の結果）。遠い点（max(2500, 近さ×3.5) m より先）は使わない。
- 「ポリゴンに見えるわけ」と、その手当て（PLAN 段階E に7つ）: 敷地を細長く分ける・壁は式で（窓に空を映す・雨だれ・下ほど暗い・1階の店）・屋上の防水の色と汚れ・地面の色むら・空気のかすみ・樹冠のつぶ（Worley）・小物（人・電柱・室外機）。
- 色: 光の量（リニア）で描き、blur.js でぼかしてから露出 `S.exp`（0.62）・ACES の近似・ガンマ。instance の色は `convertSRGBToLinear`（Kit.lin）。
- InstancedMesh は範囲が元の形（原点の小さな箱）で決まるので、`frustumCulled = false`（忘れると原点が画面の外で全部消える）。
- 田んぼの村: 谷の床は1枚の板に canvas の種類の絵（R=種類・G=田ごとのちがい・B=穴）を Nearest で貼り、式で描く。川と土手は別の帯の形、板は B で穴をあける。

## ハマったところ
- ぼけを集めるとき「その点のぼけが中心まで届く点だけ足す」と絵が外へずれて拡大して見えた → 帯は同じ重み、奥行きは前の点だけ外す。
- onBeforeCompile の文が同じ材質は three.js が同じシェーダーを使い回す → `customProgramCacheKey` を材質ごとに（Kit.mat は名前で）。
- 影の範囲（sun.shadow.camera）を変えたら `updateProjectionMatrix()`。
- r128 の fragment は map_fragment → color_fragment の順。Kit.mat の GLSL は color_fragment のあと。
- 隠れたタブで frame の大きさが 0 → resize で 0 を飛ばす。
- 相関 0.6975 を四捨五入すると 70% なのに判定は「合わない」→ % は切り捨て。
- 「絵を見る大きさ」のボタン群と絵の入れ物が同じ id（view）で、絵の上のボタンを押すと計算の値が NaN になった → ボタン群は `viewDeg`。
- 水は空の映りこみが強すぎて水色になった → `envMapIntensity` 0.45・暗い色。
- Bash の heredoc に長い python を書くと「unexpected EOF」で止まることがある → Write でファイルにしてから実行。

## 確認のしかた（変更のたびに）
1. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps tilt-shift`
2. 場面の6つを本物のクリックで切りかえ、絵が出て結果の文が出る（「作っています…」が消える）。目安（帯・ぼけ1%・最初の位置・パソコン 25°）: 町 ≈1/2,200・91%、駅 ≈1/1,450・93%、港 ≈1/1,750・93%、競技場 ≈1/1,350・91%、海 ≈1/1,150・94%、田んぼ ≈1/1,850・87%。帯をたてにすると「合わない」。
3. 絵をドラッグ → 向きが変わる。ホイール／つまむ → 寄る。「もとの位置」でもどる。つまみの「見下ろす角度・向き・はなれる」もいっしょに動く。
4. 止める → 動かない・requestAnimationFrame が止まる。動かす → 続きから。コマ落としで車がカクカク。
5. 幅 393px（iPhone 16）と 375px で、絵と結果が上に固定、横にはみ出さない（scrollWidth − innerWidth = 0）。
6. 裏にして、もどすと続きから（音・Worker・タイマーなし）。

## 状態
- 2026-11-23 v005-full3d: ユーザー「静止画と疑似3Dではやりたいことができない。完全 3D でバリエーションを。遠目でリアルかな？と考えるくらいに。見える／見えないは外して公開するアプリとして」。写真6枚・動画の 3D・記録を外し、場面6つを作った。共通の部品 kit.js・town.js・traffic.js。カメラは指・マウスで。いまの町がポリゴンに見えるわけを7つに分けて PLAN に書いた。「絵を見る大きさ」は「なぜ？」の中へ。
- 2026-11-19 段階C2: 港の町の 3D（動画から。Spark）を場面に足した（v005 で外した）。
- 2026-11-18 v004-scenes: 本物の写真6枚＋3D の町の二本立て（v005 で外した）。
- 2026-11-17 v003-photo: 3D の町を写真のテクスチャ・HDRI・影で作り直した。
- 2026-11-17 v002-diorama: 段階A。3D の町・帯／奥行きのぼけ・計算・記録・ためしてみる。
- 2026-11-16 v001-start: new-app.ps1 で雛形を作った。
