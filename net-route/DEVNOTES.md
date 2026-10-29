# インターネットの経路 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: 段階A の試作（2026-10-29）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。
- 次にやること: 地球儀を見てもらい、段階B（PLAN.md）のどれに進むか決める。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps（.claude/launch.json。使用中なら apps-2〜）で http://localhost:8765/net-route/ 。デバッグ用の窓口 `window.__nero`（`simRun(秒)`・`runPage('dc'|'cdn')` で1回ぶんを一気に計算して内訳を返す）、エラーは `window.__neroErr`。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へコピーしてカードに。RULES 3章）。
- ユーザーの好み: （まだ反応なし）

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 骨組み・凡例・このアプリについて（出どころ） | |
| css/style.css | 見た目。図は上に固定（sticky）、900px 以上は図が左・操作が右 | |
| js/net.js | 点と線・長さ（大円距離×係数）・光の速さ・道えらび | `NODES` `LINKS` `NET` `greatCircleKm` `shortest` `nextHop` `toggleCut` `toggleJam` |
| js/sim.js | パケットの出来事の列、DNS→TCP→TLS→GET→データ（cwnd）、送り直し | `SIM` `openPage` `advance(T)` `deliver` `pump` `onCut` `breakdown` `PHASES` |
| js/draw.js | Canvas の図・パケットの位置・タップの当たり判定 | `VIEW` `layout` `P` `packetXY` `drawScene` `hitTest` |
| js/globe.js | 地球儀（正射図法）・海岸線の読みこみ・大円・当たり判定・寄る／回す | `GLOBE` `HOME_POS` `proj` `slerpLL` `drawGlobe` `hitTestGlobe` `flyTo` `GLOBE_VIEWS` `zoomBy` `panBy` |
| js/ui.js | ボタン・時間の遅さ・見かたの切りかえ・タップ／ドラッグ／ピンチ・説明・内訳 | `updateUI` `showInfo` `linkInfo` `packetInfo` |
| data/coast.json | 海岸線（Natural Earth。0.001度の差分の列） | `tools/build-coast.mjs <50m.geojson> <10m.geojson>` で作る（geojson は nvkelso/natural-earth-vector の geojson/） |
| js/main.js | ループ・デバッグの窓口 | `window.__nero` |

読み込み順: net → sim → draw → globe → ui → main（グローバル関数で呼び合う）。

## しくみ
- 時刻は `SIM.T`（ミリ秒）。画面の1秒で `SIM.msPerSec` ミリ秒進む（スライダー、1ミリ秒を 0.005〜0.5 秒）。
- パケットは `node`（中継で待つ）→ `forward` で次の線へ（送り出しは線の向きごとに `busy` で順番、時間＝ビット数÷帯域）→ `fly` → `arrive`（処理・混雑の待ちと捨て）をくり返す。各中継がその時点の `shortest`（光の時間＋処理で最短）で次を選ぶので、切ると次の中継から道がかわる。
- スマホ側は `SIM.wait`（待っている返事と期限）、サーバー側は `SIM.srv`（cwnd・ssthresh・未確認の番号と送った時刻）。時間切れで送り直す。
- 図はスマホ縦（幅 560 未満か縦長）で縦向きに入れかえる（`P(u, v)`）。
- 地球儀（`VIEW.mode === 'globe'`）: 同じ SIM を `drawGlobe` で描く。点の位置は net.js の lat/lon、家・プロバイダは `HOME_POS`（表示だけの仮の位置。長さは net.js の仮定の km のまま）。線・パケットは大円を slerp。寄りぐあい `GLOBE.zoom` が 30 未満では、IX に重なる点（`NEAR_IX`）を描かず、タップで東京へ寄る。

## 批判役（2026-10-29、段階A）と決めたこと
- 送り直しの待ちを2倍にしていない・時計が包みごと・cwnd を無視 → 直した（時計1つ、時間切れで backoff×2、まだのものは redo に入れて cwnd の中で送る）。両方の線を切っても10秒で5回だけ。
- RTO の式が RFC とちがう → 往復の3倍（RTTVAR＝往復の半分）・下限 0.2秒（Linux 風）にして、画面に「RFC は1秒」と書いた。往復は ACK ごとに 7/8 の重みで更新。
- 「ページ約0.5秒」は言い切り → 「HTML 1つ・60KB の例」、サーバーの処理・画像・上りの待ちを入れていない、HTTP/3 や再開の近道があることを「簡単にしたところ」に。
- 屈折率の出どころ → arXiv 2010.03098 の本文で 1.4675（1310nm、Corning）を確かめ、値もそれに合わせた。
- スマホの説明の切れ・家の中の線がタップできない → 説明を短く・高さ 64px、点の当たりを半径 11px に。
- 「真空をまっすぐなら」→「地球の表面にそっていちばん短い道を真空の光で」。DNS の待ち1秒（推定）を画面に。

## ハマったところ
- WiFi の順番待ちを包み1つずつに足すと、42個で約80ms ふえて東京のサーバーが遅すぎた → 線が空いているときだけ待つ（続く包みはまとめて送る）に。
- 8765 番はほかのセッションが使っていることがある → apps-4（8768）で確認した。

## 確認のしかた（変更のたびに）
1. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps net-route`（例外・読み込みの失敗・外への通信）
2. コンソールで `__nero.runPage('dc')` → total 約500ms・srtt 約104ms、`__nero.runPage('cdn')` → total 約40ms、`__neroErr` が空。
3. 「ページを開く」を本当に押して、①〜⑥の説明が順に出て、内訳の帯が伸びる。
4. 途中で海底ケーブルをタップ → ✕・赤い点線、道がハワイか志摩まわりにかわり、いずれそろう。中継をタップ → 混雑の輪、送り直し（オレンジのふち）が出る。
5. 動く四角をタップ → 中身と通った中継の数が動きながら変わる。
6. 幅 375px: 図が縦向き、横にはみ出さない（scrollWidth 375）、ボタンが押せる。
7. 「地球儀」→ 太平洋に日本とアメリカ西海岸、ページを開くと包みが大円にそって飛ぶ。東京の点をタップ → 東京へ寄って ルーター・プロバイダ・IX・東京DC が分かれる。なぞって回す（そのあと説明が出ない）、＋−・ホイールで寄る。375px でも文字が重ならない。

## 状態
- 2026-10-29 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-10-29 段階A の試作: 11点・12本のグラフ、光の速さと大円距離から遅れ、DNS・TCP・TLS 1.3・スロースタート・送り直し、切る・混ませる・中身を見る。東京→米西海岸 往復約104ms・ページ約0.5秒、東京DC 約0.04秒。
- 2026-10-29 地球儀で見る: 図と切りかえ。正射図法・大円・Natural Earth の海岸線（50m＋陸揚げ局まわり 10m）、回す・寄る・重なった点のタップで東京へ。
