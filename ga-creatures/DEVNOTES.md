# 進化の箱庭 開発メモ

最終更新: 2026-10-06

関節と筋肉でできた2次元の生きものを、遺伝的アルゴリズム（GA）で進化させるアプリ。企画は `PLAN.md`（`../IDEAS.md` のストック4から）。Canvas 2D、css/js に分割。外のデータは読まない。

## 別セッションで続けるとき（まずここ）
- **いまの状態**: v2（`versions/v002-grip`。足が地面をつかむ力、自動で進めるときの見え方）。段階A。2026-10-06 に入口「まなびラボ」の「いきもの」に載せた（サムネイル `thumbs/ga-creatures.jpg`、`tools/thumb.html` の `SETUP` は40世代進めて撮る）。GitHub Pages には push で公開される（push はユーザー）。Artifact には公開していない。
- **次にやること**: ユーザーの感想しだい。次の段階は `PLAN.md` の段階B（人が選んで育てる＝アストロノーカ風、系統樹、2つの環境の比較）。中身を変えたら入口 `../index.html` のカードの更新日も。
- **読む順**: `../RULES.md` → このファイル → 下の「ファイル構成」で関係するファイルだけ。
- **動かし方**: ユーザーはルートの `start.bat`。Claude は `.claude/launch.json` の `apps`〜`apps-4`（8765〜8768）の空いているもので `http://localhost:<port>/ga-creatures/`。
- **デバッグ用**: `window.__ga` — `POP`（集団・記録）、`RUN`、`VIEW`（見ている1匹）、`gens(n)`（n 世代を一気に）、`simRun(秒)`（見ている1匹を進める）、`setEnv(key)`、`restart(seed)`、`watchMember(i)`、`watchHistory(gen)`、`render()`、`err`（例外。`window.__gaErr`）。Browser ペインが裏だと rAF が止まるので、世代は `gens()`、見る方は `simRun()` で進める。`setEnv()` のあとは `evaluatePending(0); afterGeneration(); RUN.reeval=false` で評価し直す。
- **区切りごとに**: ① `versions/v0NN-名前/` に index.html・css・js を丸ごとコピー ② `launcher.html` にカード・表 ③ 下の「状態」 ④ 「確認のしかた」を通す ⑤ 公開前チェック → コミット（push はユーザー）。
- **ユーザーの好み**: 遺伝的アルゴリズムに昔から興味（アストロノーカ、自作のゲーム）。正確さ重視（物理の値・簡単にしたところを書く）。子ども向けすぎる絵はいや（図鑑・記録のような落ち着いた絵）。日本語。

## ファイル構成

| ファイル | 中身 | 主な名前 |
|---|---|---|
| `index.html` | 骨組み（doctype なし）と解説6つ。読み込み順: genome → physics → ga → draw → ui → main | `#view` `#watchbar` `#grid` `#prog` `#spec` `#tip` `#envs` `#statGrid` `#genome` `#pickGrid` `#histRange` `#selPop` `#selSel` `#rngRate` `#chkCross` `#inSeed` |
| `css/style.css` | 左上に走るようす、その下に一覧（左）とグラフ（右）、右にパネル 360px。縦長スマホは1列（`.mobile-only` の「自動で進める」を見る所に出す） | |
| `js/genome.js` | 乱数 `makeRng(seed)`（mulberry32）、遺伝子の範囲 `G`、`randomGenome()` `mutate()` `crossover()` `connected()` `cloneGenome()`、種 `speciesKey()`（関節の数-筋肉の数） | `NEXT_ID` `clamp` `wrap1` |
| `js/physics.js` | 環境 `ENVS`（flat・slope・ice・moon・water）、`makeSim()` `stepSim()` `runTrial()` `centerX()` | `DT` `TRIAL` `MASS` `ZETA` `WATER_CN` `WATER_CT` `WATER_START` |
| `js/ga.js` | 集団 `POP`、`resetPop()` `evaluatePending(deadline)` `recordGeneration()` `nextGeneration()` `resizePop()` | `tournament()` `makeChild()` |
| `js/draw.js` | 種の色 `SLOTS` `assignSlots()` `spColor()`、`drawCreature()`、`drawScene()`（環境ごとの `LOOK`、坂は回す、カメラ `cam` `camY`）、`drawGrid()`、`drawProgress()`、`drawSpecies()`、`drawGenome()` | `SLOT_COLORS` `QCOL` `spName()` |
| `js/ui.js` | `buildUI()` `bindUI()` `updatePanel()` `updatePick()`、ツールチップ `showTip()`、一覧のクリック `gridIndex()`、グラフの世代 `chartGen()` | `HOV` `GRID_GEOM` `PROG_GEOM` `fm()` |
| `js/main.js` | `RUN`（予定の世代 `queue`・`auto`・`reeval`）、`VIEW`、`watch()` `watchMember()` `watchHistory()` `setEnv()` `restart()` `afterGeneration()` `workGenerations()`（1コマ 24ms まで計算）`stepView()` `render()`、ループ、`window.__ga` | `HOLD` |

## しくみ

### 体と遺伝子（`genome.js`）
- 関節 3〜8 個（第0世代は 3〜6）。生まれたときの位置は 1m 四方の中。足の裏の摩擦係数 0.2〜1.2（v1 は 0.05〜1.0）。
- 筋肉: つなぐ2関節、縮んだ長さ `lo`・伸びた長さ `hi`（0.15〜1.6m）、ばね定数 `k`（150〜600N/m）、1周の中で縮み始める位置 `on`（0〜1）と長さ `dur`。体のリズム `period` 0.4〜2.0秒。
- 第0世代は、木の形につないでから筋肉を足す（ばらばらにならない）。
- 突然変異（`rate` = 1 がふつう）: 値を対数・正規分布で少し動かす。体の形の変化（関節を足す・消す 6%×rate、筋肉を足す・消す 9%×rate）。消してばらばらになるならやめる。
- 交叉: 親A の形を土台に、同じ番号の関節、同じ2点を結ぶ筋肉、周期を 50% で親B から。形のちがう親どうしでは、重なる部分だけまざる（簡単にしたところ）。

### 物理（`physics.js`）
- 1/120 秒きざみ、15秒（1800 ステップ）。関節 2kg。筋肉は減衰つきばね（減衰は臨界の 0.5）。縮む時間帯は `lo`、ほかは `hi` に向かう（瞬間に切りかえ）。
- 地面 y = 0。めりこんだら押し戻し、下向きの速さを消した分 × 摩擦係数 ＋ 地面をつかむ力 `gripOf(f)`（`GRIP` 200N × ((f−0.2)/1.0)²、1ステップ分の速さに直して `S.gr`）だけ横の速さを減らす（止まりきるなら 0）。はね返りなし。つかむ力は爪・ひづめが土にくいこむ分で、押しつける力に関係なく効く（v2 から）。氷・水の底では摩擦と同じ倍率をかける。
- 坂: 重力の向きを傾ける（`gx = −g sinθ`）。絵は回して見せる。10°（はじめ 15° にしたら 100 世代でも 4m しか進まず、10° にした）。
- 氷: 摩擦 0.1 倍。月: 1.62m/s²。水: 重力 0（中性浮力）、筋肉の両端で、棒に垂直な速さに 2乗の抵抗（40 N·s²/m³ × 長さの半分）、沿う向きに線形（2）。行きすぎないよう速さで頭打ち。底は摩擦 0.5 倍。底から 1.2m で始める。
- 空気の減衰 0.1/秒。速さが 60m/s を超えたら計算がこわれたとみなして 0 点。
- 点数 = 15秒後の重心の x − はじめの x。

### GA（`ga.js`）
- 上位半分: 上位 ceil(N/2) がそのまま残り、それぞれ子を1匹（交叉ありなら上位の中から相手をランダムに）。
- トーナメント: 上位2匹だけ残し、ほかはランダムな2匹の強いほうを親に（交叉ありなら親を2回選ぶ）。
- 環境・集団の数を変えると、いまの世代を評価し直して、記録のその世代を上書きする（`RUN.reeval`。世代の数は進めない）。
- 記録 `POP.history`: 世代ごとの いちばん・まんなか・下から1割（90% の位置）・種の数・1位の遺伝子のコピー。
- 速さの目安: 100匹 1世代 15〜35ms（PC）。

### 色（dataviz の決まり）
- 種の色は決まった順の8色（暗い背景用）。各世代で2匹以上いる多い種から空いている色を割りあて、その種がいなくなるまで同じ色。ほかは灰色。
- 距離のグラフは同じ青の濃さ3段（いちばん が明るい）、右はしに名前。ツールチップあり。環境を変えた世代に黄色の点線。

## ハマったところ
- `setEnv()` で `RUN.reeval` を立てると、評価し直しが終わったときに予定の世代を減らさない。集団の数を減らしただけ（評価し直しがない）ときに立てると、次の世代の分が数えられず1世代多く進んだ → 評価が必要なときだけ立てる。
- 水の中・月で、体が画面の上へ出ていった → カメラの高さ `camY` も追う（水は重心、陸は 1.6m より高く跳んだとき）。
- 互換モード（Artifact・Pages の doctype なし）では input の box-sizing が border-box になり、標準モードとシードの欄の幅がちがって設定欄がはみ出した → `.set` の select・input を border-box に、ラベルは折り返さない。
- 第0世代は世代が1つだけなので、グラフの横軸の目盛りが小数になった → 整数に。

## 確認のしかた（変更のたびに）
1. 読み込み直後にエラーなし（`__ga.err` が undefined）。第0世代が評価済みで、1位が走る。
2. 5つの環境で: `for (const e of ['flat','slope','ice','moon','water']) { __ga.restart(1); __ga.setEnv(e); evaluatePending(0); afterGeneration(); RUN.reeval=false; __ga.gens(30); }` → `__ga.err` が undefined。
3. 目安（100匹、上位半分、交叉あり、突然変異 1.0。`__ga.setEnv(e); __ga.restart(s); __ga.gens(40).best`）: 平地 シード1 で 37.70m、上り坂 シード1 で 22.69m、水の中 シード5 で 10.04m。
4. 自動で進める: 走っている1匹は15秒走り終えるまで切りかわらず、ラベルに「いまは第N世代。走り終えたら最新の1位へ」（`VIEW.later`）。走り終えるとそのときの1位に。ボタン: 「10世代」で世代が 10 進み「あと N 世代」が消える（`workGenerations()` を回すか rAF が動いているとき）。一覧の1マスを押すと `VIEW.mode` が 'pick'、ツールチップに順位・距離。歴代のスライダーで「第N世代の1位」。集団の数 50 で `POP.members.length` 50、世代は進まない。
5. 見た目（`resize_window` 1360×820）: 坂は傾いて見える、水は底と粒、月は星。グラフの環境の線とツールチップ。
6. 幅 375px で横スクロールなし（scrollWidth = 375）、「自動で進める」が見る所に出る。
7. 点滅なし（筋肉の色は縮むと明るくなるが、細い線だけで、画面の広い範囲ではない）。

## 状態
- 2026-10-06 v1（`versions/v001-first`）: 段階A。5つの環境、GA の設定（集団の数・選び方・突然変異・交叉・シード）、走るようす、世代の一覧、距離と種のグラフ、遺伝子の図、歴代の1位、解説6つ。
- 2026-10-06 v1b（`versions/v001b-entrance`）: 入口に追加。互換モード（doctype なし）と標準モードで全要素の位置を比べ、設定欄の幅がずれていた（ラベルの折り返し、数字の入力欄の box-sizing）のを直して、1360×820・375×812 とも差 0。

- 2026-10-06 v2（`versions/v002-grip`）: ユーザーの「一向に進化しない」「床がつるつる」を受けて。① 自動で進めると、世代ができるたび（数十ms ごと）に見ている1匹が最初からやり直しになり、止まって見えていた → 走り終えてから最新の1位へ。② 足が地面をつかむ力 `GRIP` を追加、摩擦係数を 0.2〜1.2 に。平地の1位のすべりやすい足は動くが、すべりにくい足（f > 0.8）が地面についている間にすべる割合は 85% → 0%。上り坂も 40世代で 4m → 23m。直す前は `versions/v001c-before-friction`。

## 今後の案
- 段階B・C は `PLAN.md`。
- 見ている1匹の「祖先をたどる」（親の番号から系統をたどる。いまは親の番号だけ表示）。
- 同じ画面に前の世代の1位を半透明で一緒に走らせる（くらべる）。
