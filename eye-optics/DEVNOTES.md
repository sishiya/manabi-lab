# 目のなかの光の道 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: **v002-stageA**（段階A: 目の断面・光線の計算・調節・年齢・近視／遠視・メガネ・ひとみ・見え方・案内9段・説明）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。公開 URL（push 後）: https://sishiya.github.io/manabi-lab/eye-optics/
- 次にやること: ユーザーに見てもらって感想を聞く → 段階B（網膜の中・盲点をその場で試す）か C（残像。IDEAS 17）。PLAN.md。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps〜apps-6（.claude/launch.json）で http://localhost:<port>/eye-optics/ 。デバッグ用の窓口 `window.__eyop`（`simRun(秒)`・`tour(i)`・`set({d, age, len, glasses, light, showTop})`・`S`・`OPT`・`LAY`）、エラーは `window.__eyopErr`。
- 区切りごとの手順: versions/ にバックアップ → launcher.html → 「状態」に1行 → 「確認のしかた」と smoke.ps1 → 公開前チェック → commit。
- ユーザーの好み: つぎへボタン1つで進める案内、マウスをのせると説明（RULES・メモリ）。物理を曲げない。

## ファイル構成
読み込み順は optics → scene → draw → ui → main（後ろのファイルが前の関数を使う）。

| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 骨組み・このアプリについて（出どころ・簡単にしたところ） | |
| css/style.css | 見た目。719px 以下は案内・図・数字・見え方を縦に並べる | |
| js/optics.js | 目の模型と光線の計算（描画なし、Node でも動く） | `OPT`・`lensParams(A)`・`buildEye(A,dL,stopR)`・`traceRay`・`traceBundle`（扇と網膜のぼけ）・`paraxialFocus`・`solveAccommodation`・`refractiveError`・`farGlasses`・`nearGlasses`・`maxAccommodation`・`pupilDiameter`・`stopRadiusFor`・`retinaScale`・`goldenMin` |
| js/scene.js | 状態 `S`・選べる条件・`recompute`/`retarget`・部分の説明 `PARTS`・案内 `TOUR` | `AGES`・`LENGTHS`・`GLASSES`・`LIGHTS`・`fmtD`・`fmtDi` |
| js/draw.js | 断面・光線・物・メガネ・拡大鏡の描画、画面の配置 `LAY` | `layout`・`dToX`/`xToD`・`drawEye`・`drawBundle`・`drawLoupe`・`drawAll` |
| js/ui.js | ボタン・ドラッグ・説明の吹き出し・案内・数字・見え方（視力表） | `buildControls`・`setTour`・`hitTest`・`drawChart`・`updateView` |
| js/main.js | ループ（`step`→`compute`→`draw`）とデバッグ用の窓口 | `compute`（S.res を作る） |

## しくみ
- 座標は mm、z は角膜の頂点から奥へ、y は上。断面の1平面だけ。面は円すい曲線（sag の式）、交点はニュートン法、屈折はスネルの法則のベクトル形。
- 目の模型: Navarro 1985。角膜 R 7.72（k −0.26）/6.50、厚み 0.55、n 1.376／房水 1.3374／水晶体 n 1.42、前 R 10.2（k −3.1316）、後 R −6.0（k −1）、厚み 4.0／硝子体 1.336。調節 A（D）の式: 前房 3.05−0.05 ln(A+1)、前 R 10.2−1.75 ln(A+1)、後 R −6+0.2294 ln(A+1)、厚み 4+0.1 ln(A+1)、n 1.42+9e−5(10A+A²)。k は変えない。値は MathWorks の目の模型の例（Navarro の表を引用）と、式を引用した論文で照合した。
- 近軸の焦点で計算した目の長さは 24.0040 mm で、Navarro の値（24.00）と一致した（模型の入れまちがいがない確認）。`OPT.L0` は「ひとみ 3 mm で遠くがいちばんくっきりする長さ」23.924 mm にしている（球面収差で近軸の焦点より手前がくっきり）。
- 虹彩は水晶体の前面の 0.6 mm 手前。明るさ→見かけのひとみの直径（Crawford 1936、Watson & Yellott 2012 の書き方）→ 平行光をその高さで入れて虹彩の面での高さ＝あなの半径。
- 網膜は半径 12 mm の球（中心 L−12）。ぼけ: 扇の光線の網膜での高さを、ひとみの面での |高さ| で重みづけした二乗平均（円いひとみ全体の近似）→ 円板の直径 = 2√2 × rms。
- 調節は「網膜のぼけ最小」を 0〜最大（Hofstetter 平均 18.5−0.3×年齢）の中で黄金分割で探す。表示の調節 A は水晶体の式の A（目の屈折力の変化とほぼ同じだが同じではない）。
- 目の屈折: 角膜の位置のうすいレンズで遠くがいちばんくっきりする度。dL=+1 mm で −2.66 D、+2 mm で約 −5.1 D、−1 mm で +2.9 D。
- メガネ: 角膜の 12 mm 手前のうすいレンズ。遠く用＝遠くのぼけ最小の度、近く用＝40 cm を調節の半分でぼけ最小の度（遠く用より弱くしない）。どちらも 0.25 D きざみ、ひとみ 3 mm で決める。
- 見え方: 視力表の高さを 100 分（角度）として、ぼけの円の半径/2 を CSS の blur(σ) に。ランドルト環は外径 5/V 分・すきま 1/V 分。「ぼやける」の目安は ぼけの円 2 分。
- 目の外の距離は対数で縮めて描く（70 mm〜6 m、その先は「遠く」）。目の外の光線は物の印から引いた絵で、目の中だけが計算どおり。

## ハマったところ
- Bash の heredoc で `cat > file` の後ろに何も渡さないと止まる（標準入力待ち）。Node での確認は一時ファイルに書いてから `node` で。
- 近軸の焦点で調節・正視を決めると、球面収差のため遠くでもぼけが 28 µm と大きく出た → 「ぼけ最小」で決めるように直した。
- 狭い画面で数字・見え方を図の上に重ねると読めない → 719px 以下は縦に並べる（canvas は高さ 300px）。

## 確認のしかた（変更のたびに）
1. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps eye-optics`（例外・読み込みの失敗・外への通信）
2. 開いて `__eyopErr` が空。最初の画面: 3 m・25歳・ふつうで「くっきり見える」、ぼけ 4 µm ほど、調節 0.2 D ほど。
3. 「つぎへ」で9段を通す: 4段目で物が 20 cm へ動き調節が 5 D ほどまで上がる／5段目（60歳・30 cm）で「ぼやける: 水晶体がこれ以上ふくらめず…」と見え方がぼやける／6段目（近視）で「網膜の手前」、目の屈折 −2.75 D／7段目（メガネ −2.75 D）で「くっきり」／8段目（夜道）でひとみ 5.6 mm・ぼやける。
4. 物をドラッグして動く。部分にマウスをのせて説明が出る（`hitTest` が角膜・房水・虹彩・水晶体・毛様体・硝子体・網膜・中心窩・視神経・強膜・メガネ・物を返す）。
5. 幅 375px で横にはみ出さない（`document.documentElement.scrollWidth` が 375）、案内・図・数字・見え方が縦に並ぶ。

## 状態
- 2026-10-12 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-10-12 v002-stageA: 段階A。IDEAS 18 から Claude が選んで試作（ユーザーの依頼「IDEAS からよさげなアプリを試作して保管庫へ」）。
