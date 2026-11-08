# ワームホールを通りぬける 開発メモ

## 別セッションで続けるとき（まずここ）
- **いまの状態**: v1（段階A）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。日本語のみ（入口へ移すときに英語対応）。
- **次にやること**: ユーザーの感想しだい。案は PLAN の段階B（負のエネルギーを場所ごとに、光行差、空に距離）。
- **読む順**: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- **動かし方**: `.claude/launch.json` の空いているサーバー（8765 が使えないことがある。2026-11-08 は `apps-6`＝8770）で `http://localhost:<port>/wormhole/`。
- **デバッグ用** `window.__wo`: `S`（状態）、`setPos(u)`、`uToL`・`lToU`、`renderNow(fine=true)`（細かい表で描き切る）、`look(yaw,pitch)`、`pickDir([x,y,z])`（局所の向きの光をたどる）、`readPixel(x,y)`、`err`（＝`__woErr`）。
- **ペインが隠れているとき**: rAF が止まり大きさも 0。`resize_window` のあと `__wo.renderNow()`。
- **区切りごとの手順**: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へ。RULES 3章）。CSS・JS を変えたら index.html の `?v=` を上げる。
- **ユーザーの好み**: 見どころは「通りぬける見え方」、動かし方は「位置スライダー1本」（2026-11-08 に選んだ）。正確さ重視。

## ファイル構成
読み込み順: metric → lut → sky → render → funnel → ui → main。

| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 骨組み（doctype なし）・解説・出どころ | `#view` `#mark` `#funnelOver` `#pos` `#ticks` `#btnPlay` `#btnBack` `#hint` `#rayLine` `#presets` `#len` `#wid` `#segSky` `#funnelHome` |
| css/style.css | PC は右パネル、縦長スマホは景色＋スライダーを上に固定 | |
| js/metric.js | 時空の形と光（node でも動く） | `makeShape` `makeEllis` `radius` `dRadius` `force` `rkStep` `stepLen` `traceRay` `criticalPsi` |
| js/lut.js | ψ→Φ の表（2本）と引き方（node でも動く） | `buildLUT(S,l0,out,coarse)` `lookup` `LUT_N` `DELTA_MIN` |
| js/sky.js | 2つの宇宙の空・惑星（作りもの） | `makeSkyCanvas(kind,W)` `paintPlanet` `UNIVERSES` |
| js/render.js | WebGL2（シェーダー1本、画素ごとに表を引く・帯も描く） | `initRender` `uploadLUT` `drawView` `R` `FS` |
| js/funnel.js | ろうと図（2D） | `drawFunnel` `fnProject` `fnHeight` `FN` |
| js/ui.js | 読み取り・説明・目盛り・図の置き場所 | `placeFunnel` `updateReadouts` `updateHint` `updateTicks` `describeRay` |
| js/main.js | 状態・スライダーの対応・操作・ループ | `S` `PRESETS` `uToL` `lToU` `setShape` `setPos` `viewBasis` `halfTan` `dirAtPoint` `tracePick` `renderIfNeeded` `frame` |
| tools/verify.js | 物理の確かめ（`node wormhole/tools/verify.js`） | |

## しくみ
- 式は PLAN の「物理」。単位は ρ = 1。局所の座標は x = +ℓ、y・z = のどのまわりの球面の接線（z が上）。
- 球対称なので光は平面の中を進み、(ℓ, φ, p) と b = r sinψ で決まる。ψ は +ℓ の向きからの角度。
- `traceRay`: RK4。歩幅は「口の曲がりの幅 M + のどからの距離」と「1 歩で回る角度」で抑える。のどの円筒（|ℓ| < a）は p が変わらないので口まで厳密に飛ぶ。打ち切り（ℓ = a + max(200, 30 r₀)）の先はまっすぐとして asin(b/r) を足す。
- `buildLUT`: ℓ > 0 のカメラは鏡写し（ℓ→−ℓ、ψ→π−ψ）で ℓ ≤ 0 の表を使う。表は 0 = ψ < ψc（のどを通る）、1 = ψ > ψc（通らない）。刻みは境目からの角度の対数。`coarse` は動かしている間（8 本に1本）。止まって 180 ms で細かい表に。
- シェーダー: 画素の向き → ψ → 表を texelFetch で手補間 → Φ → 空の向き (cosΦ, sinΦ·t̂)。空は +x が絵の真ん中。float へ描かないので拡張はいらない。4 点 RGSS。mip の段は向きの微分から `textureLod`。
- 帯（ぐるり一周）: 同じシェーダーを下の領域に描く（`uPano` = 帯の高さ／幅）。まん中が +ℓ、左右の端が −ℓ。`dirAtPoint` で押した点の向きも同じ式。
- ろうと図: 面の上の位置は本当の r(ℓ)・φ。高さ `fnHeight` だけ模式（Dneg は細いのどだと埋めこみの高さがほぼ 0 で、2 枚が重なって見えるため）。

## ハマったところ
- 表を素直に作ると 1 回 243 ms。`rkStep` の配列とクロージャをやめ、atan を 1 回にまとめ、歩幅を広げ、動かしている間は間引いて 8〜16 ms（node）。
- 歩幅を広げたら保存量のずれが 6×10⁻⁶ に。画面では見えない大きさなので許容を 2×10⁻⁵ に。
- 8765 は Windows の予約で使えないことがある。

## 確認のしかた（変更のたびに）
1. `node wormhole/tools/verify.js`（Ellis の厳密解・保存量・表の誤差・境目・歩幅・割合。すべて OK）。
2. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps wormhole`。
3. 開いたとき: 穴の奥に橙の惑星、まわりに星のリング。帯に今見ている範囲の白い枠。`__wo.err` が空。
4. 穴の中を押す → 図に橙の道すじ、下の文「向こうの宇宙 から。のどを通ってきた光」。穴の外を押す → 青。
5. スライダーで ℓ > 0 へ → 「向こうの宇宙」、うしろを見ると穴の中に青い空と地球のような星。
6. ▶ で進み、押すと ⏸ に変わる。形の3つで「長いトンネル」に入口・出口の目盛り。方眼で青と橙。
7. 幅 375px: 景色・図・スライダーが上に固定、はみ出しなし（`scrollWidth` が 375）、ボタンの高さ 36px 以上。

## 状態
- 2026-11-08 v1: 段階A。式 16 の光の表（GPU で引く）、位置スライダー、2つの宇宙、ぐるり一周の帯、ろうと図、押した光の道すじ、形のプリセット、方眼。保管庫へ。

## 残っている課題
- 弱いスマホでの速さは未確認（表は node で細かい 60〜120 ms、動かしている間 8〜16 ms）。
- 穴の境目のすぐ内外は、光の行き先が 1 画素の中で何周もするので、ギザギザが少し残る。
