# 画面の奥の水槽 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: 段階A（水槽＋カメラの準備の案内）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。
- 次にやること: 本物のカメラで見え方の確かめ（ぶれの強さ `main.js` の `OneEuro` の値）。そのあと PLAN.md の段階B。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps〜apps-6（.claude/launch.json）で http://localhost:8765/tank-window/ 。デバッグ用の窓口 `window.__tawi`（`simRun(秒)`・`setEye(x,y,z)`・`calibrate`・`feed`）、エラーは `window.__tawiErr`。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へコピーしてカードに。RULES 3章）。
- ユーザーの好み: OSS があれば利用。カメラの置き方の指南を入れる（2026-11-09）。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 画面の骨組み。importmap で `lib/three@0.185.1` | |
| css/style.css | 見た目 | |
| js/eye.js | 計算だけ（画面にさわらない）。顔の点 → 目の位置、投影、1€ フィルタ | `faceSample`・`makeCalibration`・`eyeFrom`・`frustum`・`OneEuro` |
| js/track.js | カメラの開閉、MediaPipe の読みこみと毎コマの読みとり | `Tracker`（`start`・`stop`・`update`・`state`・`face`） |
| js/tank.js | 水槽の 3D。壁・目もり・砂・岩・水草・泡・投影 | `Tank`（`layout`・`step`・`render`・`setGrid`） |
| js/fish.js | 魚の形と泳ぎ（演出） | `Fishes` |
| js/guide.js | カメラの準備の案内 3 段階と、映りの判定 | `Guide`（`show`・`go`・`judge`・`tick`） |
| js/main.js | 状態 `S`・視点・描画ループ・下の操作バー | `S`・`feed`・`calibrate`・`paint`・`window.__tawi` |
| tools/verify.mjs | 計算の確かめ（node で実行） | |

読みこみ: `index.html` は `js/main.js` を module で読む。`assets/power.js` はその前に普通の script で読む。

## しくみ
- 単位は cm。画面の中心が原点、右 +x、上 +y、見る人の側 +z。画面は z=0、水槽は z<0。壁は画面のふちに合わせる。
- 画面の cm は `S.pxPerCm`（CSS px / cm）。案内の 1 段階目で決める。
- 目の位置は web-parallax（MIT）の式: 虹彩の間隔を 6.3 cm と仮定し、基準の距離 D0 と基準の間隔 p0 から `f = p0*D0/6.3`、`z = f*6.3/p`、`x = ((u0-.5)*D0 - (u-.5)*z)/f`。基準の瞬間の目を「窓の真ん中の正面」と決める（本当の目の高さとの差は残る。だから案内で目の高さを画面の真ん中へ寄せてもらう）。カメラの左右上下のずれは基準の項で打ち消すが、傾きは打ち消せない（15° 傾けて 15 cm 近づくと約 4 cm 上下にまざる。案内で「傾けない」と言う）。
- 基準をとるときの顔の向きは左右だけ見る（`YAW_CAL`）。画面の真ん中を見るとカメラに対して下を向くのがふつうで、15〜27 型で 11〜17° になる。
- 批判役の指摘（2026-11-09）で直したもの: カメラを開く途中の閉じる（`Tracker.gen`）、基準の前提の食い違い、スマホのカードの線、全画面と複数モニター、見失いの理由、言い過ぎの文、スマホの操作バー、毎秒 60 回まで・見えないときは描かない。
- 投影は `tank.render`: カメラは回さず、near の面の左右上下を `frustum` で非対称に。
- ぶれ取りは読みとりごとに 1€ フィルタ、読みとりのあいだは指数で追いかける。
- 全画面・ウインドウ移動は `stageCenter` の差で補正する。
- 砂の影は魚と岩の位置を uniform で渡し、シェーダーで暗くする（`SHADOWS` 個まで）。

## ハマったところ
- `screen.width` は隠れたペインで読みこむと 0 のことがある。はじめの `pxPerCm` には使わない。
- Browser ペインはソフトウェア描画で数コマ/秒になる。計測中のタイムアウトは長めに。
- 砂を盛り上げると、手前の下にすきまが見える → ガラスに接した砂の断面を足した。

## 確認のしかた（変更のたびに）
1. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps tank-window`（例外・読み込みの失敗・外への通信）
2. `node tank-window/tools/verify.mjs`
3. カメラなしで開き、マウスで奥の壁がずれ、画面のふちが動かないこと。幅 375px で横にはみ出さないこと。
4. カメラの代わり（`navigator.mediaDevices.getUserMedia` を `canvas.captureStream` に差しかえ、顔の写真を動かす）で案内を本物のクリックで通す。映像を 64px（幅の 10%）動かすと左右 −9.8 cm 程度。
5. 裏にしてカメラが閉じ（`tracker.stream` が null）、もどして開くこと。

## 状態
- 2026-11-09 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-11-09 段階A: 水槽、顔の読みとり、カメラの準備の案内。写真を動かして MediaPipe を通し、数値が予測どおりなことを確認。本物のカメラでの見え方はまだ。
