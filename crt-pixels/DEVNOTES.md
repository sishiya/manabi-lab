# ブラウン管のドット絵 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: v002-stageA（段階A）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。日本語だけ（入口へ移すときに英語）。
- 次にやること: ユーザーに見てもらう → PLAN.md の段階B（自分でドットを置く 16×16）か段階C（ビームのスローモーション）。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps（.claude/launch.json）で http://localhost:8765/crt-pixels/ 。デバッグ用の窓口 `window.__crpi`（`set({pic, screen, link, inter, frame, on:{scan,...}})`・`view.focus(x, y, 倍率)`・`useFile(File)`・`simRun(秒)`）、エラーは `window.__crpiErr`。
- 信号の計算の確かめ: `node crt-pixels/tools/verify.js`（一色・白黒じま・チェック・横じま・ドットクロール）。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へコピーしてカードに。RULES 3章）。
- ユーザーの好み: 自分の画像（権利のある絵も）を手元で試せること（2026-10-24。端末の中だけで計算し、送らない・保存しない）。

## ライセンスの整理（2026-10-24 確かめた）
- crt-lottes（Timothy Lottes）: ヘッダーに「PUBLIC DOMAIN CRT STYLED SCAN-LINE SHADER … Please take and use, change, or whatever.」（https://github.com/libretro/glsl-shaders/blob/master/crt/shaders/crt-lottes.glsl）。考え方（走査線のガウス・ブルーム・マスク・ふくらみの係数 0.031/0.041）を土台に、コードは書き直した。
- CRT-Royale・crt-geom・crt-easymode・crt-pi は GPL、nes_ntsc は LGPL、NESdev の例は CC BY-SA → **コードを使わない**。数（規格の値・1ドットの周期）だけ使う。
- 自分の画像: ブラウザの中で読むだけ（fetch・保存なし）。リポジトリには入らない。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 骨組み。上に固定（#pin: 見出し・画面・ひとこと）、下にスクロール（#panel） | `?v=` を上げる（RULES 8.1） |
| css/style.css | 見た目。#stage だけ touch-action:none | |
| js/pictures.js | 自作のドット絵3枚（256×224、コードで描く。ディザは Bayer 4×4） | `CRT_PICTURES.get(name)`・`falls`・`lion`・`patterns`・`LION`（16×16） |
| js/ntsc.js | 信号の計算（CPU。node でも動く） | `decode(pic, link, view)`・`decodeFrame`・`LINKS`・`boxWidth` |
| js/crt-gl.js | WebGL2 の1パスの画面（液晶／ブラウン管を仕切りで分ける） | `CRT_GL(canvas)` → `setPicture`・`setSignal`・`draw(v)`、シェーダーの `lineLight`・`mask` |
| js/view.js | 仕切り・ズーム・移動・はじめのゆらし | `CRT_VIEW` → `V`・`fit`・`focus`・`zoomBy`・`hint` |
| js/upload.js | 自分の画像を読む（拡大の倍率を見つけて戻す・大きすぎれば間引く） | `CRT_UPLOAD.load(file)`・`detectScale` |
| js/main.js | 状態・部品・描くタイミング（変わったときだけ描く） | `S`・`SCREENS`・`MECH`・`PICS`・`updateSignal`・`draw`・`window.__crpi` |
| tools/verify.js | ntsc.js の確かめ | |

読み込み順: pictures → ntsc → crt-gl → view → upload → main。

## しくみ
- **信号**（ntsc.js）: 1ドット＝8点（色副搬送波 1周期＝12点、1ドット＝2/3周期）。位相 = (点 + 4×行 + 8×コマ) mod 12（NESdev の一例）。YIQ は FCC の式。
  - ビデオ端子: 明るさ＝12点の箱平均（色の波がちょうど消える。くし形なし）。色＝のこり×cos/sin → ガウスのこし器（箱3回）。I・Q とも 0.6MHz（推定）。アンテナ線は 0.5MHz＋シェーダーでノイズ 0.06。
  - S端子: 明るさ 4.2MHz、I 1.3・Q 0.6MHz。RGB: そのまま。
  - 出力は1ドット4点の RGBA8（E'）。ドットクロールは2コマを平均（目に見える平均）か1コマ。自動では動かさない（30Hz の入れかわり＝点滅の決まりに近い。RULES 9章）。
- **画面**（crt-gl.js）: 1行ずつのガウスの帯（σ＝0.15〜0.28 行、明るさの平方根で太る＝推定）、帯の光の合計は行ごとに同じ（正規化）。480i は半行ずれた2本を半分ずつ。横はビームの点の広がり σ＝0.30 ドット。ガンマ 2.4 → 表示 1/2.2。マスクは絵の座標で（寄ると見える）、1組が 4〜8 デバイスピクセルで薄める。走査線も1行 2.5〜4.5 ピクセルで薄める（モアレよけ）。明るすぎる所は 0.8 から頭打ち。ブルームはミップマップの 4 段目。ふくらみは Lottes の 0.031/0.041。
- 光る点の組: 家庭のテレビ 1.5組／ドット、モニター 2.6組（14型くらいを想定した推定）。シャドウマスクは六角形のならび（となり 1/√3 組・行 1/2 組 → 1行に約3列）。

## ハマったところ
- GLSL ES の `flat` は予約語（変数名にするとシェーダーが通らず「WebGL2 が使えない」の文になる）。
- 白黒の1ドットじまのにせの色は、行ごとに色相が 120° 回るので面の平均では灰色。確かめは点ごとの色のこさで。
- Browser ペインが隠れているとスクリーンショットが古いままのことがある（もう一度撮る）。

## 確認のしかた（変更のたびに）
1. `node crt-pixels/tools/verify.js` が「すべて OK」
2. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps crt-pixels`（例外・読み込みの失敗・外への通信）
3. 開いて: 仕切りがはじめに一度ゆれる → 取っ手をドラッグで動く。絵3枚・画面3種・つなぎ方4種・しくみの入り切りと「だけ」で絵が変わる。`__crpiErr` が空
4. 「寄って光る点を見る」→ 光る点の六角形のならびが見える。マスクを切ると走査線のすきまが見える
5. 自分の画像: `__crpi.useFile(File)` か「自分の画像…」で、3倍に拡大した PNG が元のドットに戻る（note の文）
6. 幅 375px: `scrollWidth` が 375、画面が上に固定、HUD とボタンが重ならない

## 状態
- 2026-10-24 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-10-24 v002-stageA: 段階A。OSS とライセンスを調べ（crt-lottes＝パブリックドメインを土台に書き直し）、批判役の指摘16件を検討（PLAN に決めたこと）。信号の計算（CPU）・WebGL2 の画面・仕切りとズーム・自作の絵3枚・自分の画像（ユーザーの希望）。
