# 名局の戦場 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: 段階A（骨組み）ができた。オペラ座の一局（1858）を、平らな大地の箱の部隊で場面ごとに動かす。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。
- 次にやること: 段階B（PLAN の「見せ方の芯」）。ユーザーは「コマをリアルに・移動もリアルに」「盤の上でチマチマ動かす見た目にしない＝頭の中の戦場」を選んだ（2026-10-31）。兵士の glb はできた（`assets/`、`tools/build-soldiers.py`）。つぎは ①1人を1枚の絵にまとめて描く回数を減らす（いま1人5回）②同じ部隊の動きの計算を分け合う ③馬の glb ④地形（マス目なし）に部隊を布陣して行軍・突撃・退く。速さは `tools/crowd-test.html?n=250&close=1` で測る（250人で1コマ約42ms だった）。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps（.claude/launch.json）で http://localhost:8765/chess-battle/ 。デバッグ用の窓口 `window.__chba`（`next()`・`prev()`・`seek(ply)`・`setCam('auto'|'free'|'top')`・`simRun(秒)`・`rec`・`S`）、エラーは `window.__chbaErr`。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へコピーしてカードに。RULES 3章）。
- ユーザーの好み: 見た目は「本物っぽい戦場」を選んだ（2026-10-31）。ただし以前 hair-removal で写実が合わなかったので、B で見本を見くらべて決める。題材はチェス・古い名局（権利の心配がないもの）。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 画面の骨組み。上に固定（戦場・隅の盤・カメラ・説明の帯・もどる／つぎへ）と、下にスクロール（点数の帯・スライダー・手の一覧・対応表・このアプリについて） | |
| css/style.css | 見た目（600px 以下でスマホの配置） | |
| js/games.js | 名局のデータ（棋譜・解説の文・見せ場・出どころ・verify の期待値） | `GAMES` |
| js/record.js | 棋譜 → 手の一覧・部隊の居場所・場面・駒の点数（DOM なし。verify からも使う） | `build`・`scenes`・`material`・`autoNote` |
| js/world.js | three.js の戦場（大地・マス・箱の部隊・旗・待機所・動き） | `createWorld`・`sqPos`・`playPly`・`setState`・`step` |
| js/ui.js | 隅の小さな盤・点数の帯・スライダーの印・手の一覧 | `drawMini`・`setMaterial`・`buildSlider`・`buildMoves`・`markMove` |
| js/main.js | つなぎ役（場面の再生・カメラ・窓口） | `S`・`next`・`prev`・`seek`・`stepCam`・`window.__chba` |
| tools/build-soldiers.py | Blender 5.2 で兵士の glb を作る（頭は体から・首から下は服・8つの動き・5000 三角形・テクスチャ 512px）。素材はリポジトリの外 `../3d-library/quaternius/`（CC0） | `blender -b -P chess-battle/tools/build-soldiers.py` |
| tools/crowd-test.html | 兵士を N 人並べて歩かせ速さを測る（公開しない道具） | `?n=250&anim=Walk_Loop&close=1` |
| assets/soldier-peasant.glb・soldier-ranger.glb | 兵士（農民・レンジャーの服）。動き: Idle_Loop・Walk_Loop・Jog_Fwd_Loop・Sprint_Loop・Sword_Idle・Sword_Attack・Hit_Chest・Sitting_Idle_Loop | |
| tools/verify.mjs | 棋譜の確かめ（手数・詰み・特別な手・最後の局面・部隊の追跡・場面のつながり） | `node chess-battle/tools/verify.mjs` |

読み込み: three.js r128 と OrbitControls はふつうの script（lib/three@0.128.0）、chess.js と自分の js は ES モジュール（lib/chess.js@1.4.0）。r128 を選んだのは、lib/ にあって examples/js（GLTFLoader もある）がふつうの script で使えるため。

## しくみ
- 部隊の id は初めの局面の駒から（`wNb`＝白の b のナイト、`wK`＝白のキング）。手ごとに from→to で動かし、取られた部隊は `sq=null`・`out`＝取られた順。キャスリングはルークも動かす。追跡が chess.js の局面と全手で同じことを verify で確かめる。
- 場面: 取る・チェック・キャスリング・見せ場（games.js の key・sac）は1手で1場面、静かな手は4手までまとめて早送り（1.7倍）。オペラ座の一局は 33手 → 22場面。
- マス → 3D: 1マス 4 単位、a〜h が x、1〜8 が z（白が手前の +z）。取られた部隊は白が盤の左の外、黒が右の外に縦に並ぶ。
- 取る場面: 動く部隊が相手のマスへ攻めこみ、取られた部隊は旗を下ろして待機所へ歩く（倒れない。PLAN の子ども向けの線引き）。
- カメラ: おまかせ＝いつも白の側から、動いている部隊を追う（縦長は寄り）。真上＝画面の上が黒（`up=(0,0,-1)`）。自由＝OrbitControls。
- 駒の点数は P1・N3・B3・R5・Q9（よく使われる目安）。オペラ座の一局の最後は白 15・黒 25（損しているのに勝つ）。

## ハマったところ
- 企画の段階で「キャスリングは 10手目」と書いていたが、棋譜では **12.O-O-O**（verify で確かめた）。手の番号は記憶で書かず verify で。
- おまかせのカメラを手番の側から見るようにしたら、手ごとに盤の向きが入れかわってわからなくなった → いつも白の側から。
- 真上のカメラは真下を向くと上の向きが決まらず、盤が回って見えた → 真上のときだけ `camera.up=(0,0,-1)`。
- 同じポート 8765 のサーバーがほかのセッションで動いていると preview_start が失敗する → そのまま navigate で開ける。

- Blender で兵士を作るとき: ①体のメッシュの名前は `SuperHero_Male`（データ名が `…Retopology…`）②見えない補助の形（Icosphere）が混ざっていて join が失敗する ③顔の表情の形（シェイプキー）があると Decimate を適用できない → それぞれ build-soldiers.py で処理ずみ。
- itch.io の無料ダウンロード: 内蔵ブラウザで「No thanks」→ Download。ページを移ると `~/Downloads` に `<uuid>.tmp` のまま残ることがある（中身は完全。unzip -t で確かめて名前を付ける）。

## 確認のしかた（変更のたびに）
1. `node chess-battle/tools/verify.mjs` がすべて OK。
2. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps chess-battle`（例外・読み込みの失敗・外への通信）
3. ブラウザで「つぎへ」を最後まで（`__chba.next(); __chba.simRun(6)` を 22回）→ `__chbaErr` が空、最後の説明が「チェックメイト」、点数が白 15・黒 25。
4. もどる・スライダー・手の一覧のボタンで飛べる。カメラ3つ（おまかせ・自由・真上）。真上で白が下。
5. 幅 375px: `scrollWidth` が 375、隅の盤・つぎへが上に固定、説明の帯に盤が隠れすぎない。

## 残っている課題
- 部隊が箱のまま（段階B）。縦長だと部隊が小さい。
- 演出（カメラのカット・スロー・音・捨て駒の前に王をねらう線）は段階C。
- サムネイル（_dev/tools/thumb.html の SETUP は new-app.ps1 が足せなかった。B で見た目が決まってから撮る）。

## 状態
- 2026-10-31 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-10-31 段階A: 企画（批判役の指摘10件を入れた）、chess.js 1.4.0 と OrbitControls を lib/ に、棋譜の確かめ verify.mjs（すべて OK）、箱の部隊・場面ごとのつぎへ・もどる・スライダー・手の一覧・隅の盤・点数の帯・カメラ3つ。
- 2026-10-31 段階Bのはじめ: 見せ方を「頭の中の戦場」に決めなおした（PLAN）。Quaternius の CC0 素材4つ（約424MB）をリポジトリの外へ。Blender で兵士の glb 2種（5000 三角形・8つの動き）、試験ページで250人が歩くのを確かめた（1コマ約42ms、これから軽くする）。アプリの画面はまだ段階Aのまま。
