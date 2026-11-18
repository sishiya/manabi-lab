# ジオラマに見えるわけ 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: v004-scenes（本物の写真6枚＋3D の町の二本立て）。最初は「村」の写真で開く。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。英語なし。
- 次にやること: ユーザーに見てもらう。案: 写真の場面を足す（手順は下の「写真の場面の足し方」）、3D の町を角度の実験用に軽く整える（blur.js の SSAO・FXAA は入れた。川・森・山並みは書きかけで捨てた）、動画の場面（PLAN 段階C）。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps〜apps-6（.claude/launch.json）で http://localhost:8765/tilt-shift/ 。デバッグ用の窓口 `window.__tish`（`set({mode:1, ang:90, pitch:5})` で設定して計算の結果を返す・`fit`・`P`・`simRun(秒)`）、エラーは `window.__tishErr`。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へ。RULES 3章）。
- ユーザーの依頼: 「ティルトシフトがなぜジオラマ風に見えるのか、パラメータを変えながら見える見えないを試せるアプリ」。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 骨組み。絵と結果（#view、スマホでは上に固定）、つまみ（#panel）、なぜ？（#why）、出どころ（#about） | |
| css/style.css | 見た目。960px 以上で左右2列 | `.judge-btn`（記録＝塗り）・`.seg`/`.presets`（切りかえ＝枠） |
| js/city.js | 自前の 3D の町（26×26 区画・外壁は写真のテクスチャを世界の座標で貼る・屋上の機械・木・車 900 台＋駐車場）。地面は canvas に写真の模様で描く。空は HDRI。単位 m | `City.build(scene, {renderer, groundSize}, onReady)` → `{step(dt)}`・`FACADES`・`ENV` |
| assets/tex/*.jpg・sky_1k.hdr | ambientCG（CC0）の外壁4・道・歩道・芝・コンクリートを 512px に。空は Poly Haven kloofendal 1k（CC0）。元は `../3d-library/` | |
| tools/shot.mjs | 手元だけ: 絵を 1268×847 で撮る（Playwright はあそびラボのもの） | `node tilt-shift/tools/shot.mjs <出力> 名前='{"scene":"railway","mode":0}'` |
| tools/find-photos.py | 手元だけ: Wikimedia Commons で写真の候補を探す（CC0・PD・CC BY だけ） | `python tilt-shift/tools/find-photos.py <出力> "検索語" …` |
| tools/depth.py | 手元だけ: 写真を 3:2 に切り取り、奥行きを推定（Depth Anything V2 Small）して `assets/photo/<名前>.jpg`・`-d.png`（16bit を R・G、半分の大きさ）・`-t.jpg`（見本）を書く | 使い方はファイルの頭 |
| js/scenes.js | 場面の一覧（写真6枚＋3D の町）。写真ごとに距離の見当の2点 `anchors`・出どころ `credit` | `SCENES` |
| js/photo.js | 写真の場面を読む。写真と奥行きの絵、距離の格子、α（距離の逆数 = α·D） | `Photo.load(sc)` |
| assets/photo/ | 写真6枚（Wikimedia Commons、CC0・PD・CC BY）と推定した奥行き、場面ボタンの見本、3D の町の見本 `town-thumb.jpg` | |
| js/blur.js | 後処理（3D: SSAO → ぼけと色 → FXAA。写真: ぼけと色だけ）。CPU 用に同じ式 | `Blur.create`・`render(scene, camera, P, photo)`・`cocBand`・`cocDepth`・`RAMP`・`CMAX` |
| js/measure.js | 距離の格子 64×40（3D は読みもどし、写真は `setZs`）と、Held の式の当てはめ | `Measure.readDepth`・`setZs`・`focusDist`・`fit` |
| js/ui.js | 場面のボタン・つまみ・ためしてみる6つ・結果の文・記録・目印の線・出どころの1行 | `UI.init`・`showResult`・`showCredit`・`drawGuide`・`PRESETS` |
| js/main.js | three.js の用意・カメラ・場面の切りかえ・ループ（コマ落とし。写真は変わったときだけ描く）・窓口 | `S`（設定。`S.scene`）・`derive`・`advance`・`window.__tish` |

読み込み順: three.min.js（../lib r128）→ RGBELoader → scenes → city → photo → blur → measure → ui → main。power.js は head。

## しくみ
- ぼけの半径 r は「絵の高さを1とした割合」。帯: 線（角度 ang、中心は法線方向に pos−0.5）からの距離 dd が halfW をこえたら RAMP=0.35 かけて R まで直線で増える。奥行き: r = kf·|1/z0 − 1/z|、kf = 2·z0·R（ピントの2倍の距離で r = R）、上限 `CMAX` 0.09（計算では上限に張りついた点を外す）。
- シェーダーは円の中に黄金角で 64 点。帯は全部同じ重み。奥行きは「前にあって、ぼけが中心まで届かない点」だけ外す。
- 写真: 色は pow 2.2 で光の量にしてぼかし、1/2.2 でもどすだけ（トーンマッピング・FXAA・周辺減光・粒子なし。ぼけなしなら元の写真と同じ）。距離の逆数 = α·D（β = 0。D は推定の奥行き、いちばん遠い所が 0）。α は `anchors` の2点（見当をつけた距離）から最小二乗。
- 計算（Held ほか 2010）: b = A·|1/z0 − 1/z|、A = 4.6 mm。b（直径の角度）= 2r · 2tan(fov/2)（絵を撮ったときと同じ画角で見る仮定、中心付近の近似）。d = |1/Z0 − 1/Z| として原点を通る直線 b = k·d に合わせ、s = A/k、目からの距離 = s·Z0。Z0 は帯モードではぼけのない点の距離の中央値、奥行きモードはピントの距離。2500 m より遠い点（空・町の外）は使わない。
- 「つじつま」= b と d の相関（このアプリの目安。Held は相関ではなく、ぼけと奥行きが合うかどうかで効き方が変わると示した）。判定: 相関 <0.5 合わない／s ≥ 0.05 実物／相関 <0.8 少し模型っぽい／ほか模型に見えやすい。
- 距離の格子は MeshDepthMaterial（RGBADepthPacking）で 64×40 に描いて readRenderTargetPixels。設定・大きさが変わったときだけ（毎コマではない）。
- 色: 町は光の量（リニア、HalfFloat の絵）で描き、blur.js でぼかしてから露出 `S.exp`・ACES の近似・ガンマ 2.2・彩度の順。instance の色は `convertSRGBToLinear` を忘れない。
- 外壁: `facadeMaterial` の onBeforeCompile で、壁は世界の座標 ÷ 写真1枚の m（`FACADES` の w・h）、屋上はコンクリートの写真×建物ごとの色。しっくいの壁（F=4）は窓を式で描く。
- 時間: simT（町）と shownT（絵）。コマ落としは 町の時間 spd/fps ごとにだけ車を動かして描く。止めているあいだは requestAnimationFrame も止める。

## 写真の場面の足し方
1. `tools/find-photos.py` で候補（CC0・PD・CC BY。SA・NC は使わない）。人の顔が分かる写真は使わない。ユーザーに見せて選んでもらう。
2. 元の画像は続けて取ると 429 になる。API の `iiurlwidth=1920` の縮小版（thumb.wikimedia.org）を取る。
3. 環境変数 `HF_HOME`（%USERPROFILE%/tools/depth-anything-v2/hf）と `HF_HUB_OFFLINE=1` で `tools/depth.py <元> assets/photo/<名前> 1500 <たての位置>`。
4. `js/scenes.js` に1件。`anchors` は推定の奥行きの絵で近い所・遠い所を選び、地図と写真から距離の見当（D が近いほど大きいことを確かめる）。
5. `tools/shot.mjs` で OFF／ON、`__tish.set` で帯・たて・奥行きの合い方を見る。

## ハマったところ
- ぼけを集めるとき「その点のぼけが中心まで届く点だけ足す」と、帯のようにぼけが場所で変わる所で外側の点ばかり足され、絵が外へずれて拡大して見えた（3D の町でも起きていた）→ 帯は同じ重み、奥行きは前の点だけ外す。
- 写真の距離の逆数を α·D + β として β まで2点で決めると、見当の誤差で空が数百 m 先の物になり、計算がくずれた → β = 0。
- Wikimedia の元の画像は続けて取ると 429。縮小版（1920px）で取る。
- onBeforeCompile の文が同じ材質は three.js が同じシェーダーを使い回す（窓の式が一部の壁で消えた）→ `customProgramCacheKey` を材質ごとに。
- 影の範囲（sun.shadow.camera）を変えたら `updateProjectionMatrix()`。行末にコメントを足したとき `sun.castShadow = true` がコメントに入って影が消えた。
- r128 の fragment は map_fragment → color_fragment の順。屋上の色は color_fragment のあとで上書き（instance の色に引きずられないように）。
- 太陽が高くカメラの後ろ寄りだと、影が建物の向こうに隠れて見えない → 低め・横から少し向こう。
- 隠れたタブで frame の大きさが 0 → aspect 0 で計算が「空ばかり」になる。resize で 0 を飛ばす。
- 相関 0.6975 を四捨五入すると 70% なのに判定は「合わない」になった → % は切り捨てで出す。

## 確認のしかた（変更のたびに）
1. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps tilt-shift`
2. 場面の7つを本物のクリックで切りかえ、写真が出て、絵の下に出どころの1行。ためしてみるの6つも押す。目安（帯・ぼけ1%）: 村 ≈1/1,200・78%、町 ≈1/370・93%、列車 ≈1/98・83%、畑 ≈1/2,300・93%、ビル 5%「合わない」、3D ≈1/4,200・87%。帯をたてにすると全部 0%。奥行きのぼけはほぼ 100%。
2b. ぼけを入れても絵がずれない・拡大しない（OFF と ON を重ねてくらべる）。
3. 「ジオラマに見える／見えない」を押すと、ボタンの下に「記録 n 件」、下の記録に1行。記録を押すと設定がもどる。
4. 止める → 動かない・描き直さない。動かす → 続きから。コマ落としで車がカクカク。
5. 幅 393px（iPhone 16）と 375px で、絵と結果が上に固定、横にはみ出さない。
6. 裏にして、もどすと続きから（音・Worker・タイマーなし）。

## 状態
- 2026-11-18 v004-scenes: ユーザー「OFF にするとリアルな現実の風景なのに、ON にすると途端にジオラマ」「いろいろなシチュエーションで」。批判役（見た目）が「3D を直してもゲームの町止まり。写真が主・3D は角度の実験用の二本立て」をすすめ、ユーザーが二本立てを選んだ。Wikimedia Commons の写真6枚（村・町と川・入り江・列車・ビル・畑。ユーザーが選んだ）＋Depth Anything V2 Small の推定の奥行き。ぼけで絵がずれる不具合を直した。3D の後処理に SSAO と FXAA。
- 2026-11-16 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-11-17 v003-photo: ユーザー「モデルがチープすぎるのでフォトリアルに」。3つの案（3D の作り直し／本物の写真＋奥行きの推定／PLATEAU）からユーザーが 3D の作り直しを選んだ。CC0 の写真のテクスチャ・HDRI の空・光の量で描いて最後にトーンマッピング・影・足もとの暗がり・屋上の機械・車の窓・駐車場。町を 26×26 区画に。
- 2026-11-17 v002-diorama: 段階A。3D の町・帯／奥行きのぼけ・色・コマ落とし・早回し・Held の式の計算・見える／見えないの記録・ためしてみる6つ。
