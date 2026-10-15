# いのちの系統樹 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: v003-zukan（図鑑風・やわらかい枝とアニメ・図）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。日本語だけ。
- 次にやること: ユーザーに見てもらって感想を聞く → PLAN.md の「段階B以降」から選ぶ（年代の目盛り・写真・綱より下も系統の形に、など）。
- 読む順: PLAN.md（「調べたこと」に情報量と利用条件）→ このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps（.claude/launch.json）で http://localhost:8765/tree-of-life/ 。デバッグ用の窓口 `window.__trofli`（`find(学名か和名)`・`press(学名)`・`reveal(COL id)`・`T`・`V`・`UI`）、エラーは `window.__trofliErr`。
- データを作りなおす: `node tree-of-life/tools/build-backbone.mjs`（途中の結果は `tools/cache/`、Git に入れない。COL の新しい版にするときは cache を消す）。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へコピーしてカードに。RULES 3章）。
- ユーザーの好み: 全部の生きものを網羅したい・クリックで詳細・検索・種や目がひと目で（2026-10-15 の依頼）。**見ているだけで楽しい・気持ちいい**樹形図（やわらかい線、開くと出てくる・閉じると親へきゅぽんと吸いこまれる）。ただし**アニメはくどくしない**（0.3秒ほど・弾みは小さく）。全体は**図鑑風**（生成りの紙・明朝・図と分類の表）。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 画面の骨組み・このアプリについて（出どころ・通信） | `#pin`（上に固定: 検索・凡例・樹形図）、`#side`（詳細・説明） |
| css/style.css | 図鑑風の見た目（紙・明朝・図・分類の表）。900px 未満は上を固定してスクロール、以上は左右 | |
| data/backbone.js | 界〜綱の樹形図（作った道具の出力。手で直さない） | `TOL_META`、`TOL_ROWS`（1行 = [親, 学名, 和名, 階級, COL id, 種の数, Wikidata id, しるし]） |
| js/api.js | 外のデータ（COL・Wikidata・Commons・英語版 Wikipedia の代表の図）。同じ URL は2度読まない、Wikidata SPARQL は1本ずつ | `API.children`・`taxon`・`classification`・`suggest`・`exact`・`jaNames`・`searchJa`・`wdInfo`・`leadImage`・`images`（条件で選ぶ） |
| js/tree.js | 木のデータ・階級の名前と色・その場で読む・検索の場所まで開く | `RANK_JA`・`RANK_GROUP`・`GROUPS`、`T.nodes`・`open`・`loadKids`・`reveal`・`localSearch` |
| js/view.js | Canvas の配置と描画（やわらかい曲線の枝・出てくる／吸いこまれるアニメ）・当たり判定・拡大 | `V.layout`・`draw`・`step`・`leaving`・`shift`・`pop`・`settle`・`tick`・`hit`・`fit`・`focus`・`cam` |
| js/ui.js | 詳細の欄（図鑑の1ページ: 図・説明・分類の表・しらべ・メモ）・検索の欄・凡例 | `UI.show`・`plate`・`MAJOR`・`NO_IMAGE`・`refresh`・`onPick` |
| js/main.js | 押す・ドラッグ・ピンチ・ボタン、はじめの表示、デバッグ窓口 | `press`・`reach`・`window.__trofli` |
| tools/build-backbone.mjs | data/backbone.js を作る道具（node） | |

読み込み順: data/backbone.js → api.js → tree.js → view.js → ui.js → main.js。

## しくみ
- **上のほう**（約650のまとまり）: COL の最新版（API `dataset/3LR`）の界〜綱を全部集める → Open Tree の `tnrs/match_names` で同じ学名を探す → `tree_of_life/induced_subtree` で枝分かれの形 → Open Tree で見つからないものは COL の親の下へ。
  - COL の門のすぐ下に属などがならぶもの（所属のはっきりしない属。子嚢菌門に約2千）は入れず、しるし 1（開いたら COL から読む）。
  - COL の Animalia = Open Tree の Metazoa、Plantae = Archaeplastida（`ALIAS`。Archaeplastida は合成系統樹で分かれていて使えなかった）。
  - COL だけのまとまりで子の一部が別の場所へ行ったもの（植物界・細菌の門など）は「（一部）」、種の数は残りの合計。
  - 名前のないふしで子が1つのものはまとめる。'h2007-2' のような Open Tree の作業用の名前・'Craniata (subphylum in Deuterostomia)' のかっこは消す。種が0のまとまり（COL の枠だけ）は入れない。
- **綱より下**: 開いたときに `tree/{id}/children`（100件ずつ、残りは「あと N 件」）。種の数の多い順。和名は Wikidata SPARQL（P225 = 学名）で80件ずつ。
- **検索**: 日本語 → Wikidata `wbsearchentities`（学名 P225 のある項目だけ）→ COL で学名ぴったり。ローマ字 → COL `nameusage/suggest`。選ぶと `classification` で道すじを取り、木にある祖先から下を順に読んで開く（1ページ目にいないときはその1つだけ足す）。
- **描き方**: 葉を上から1行（26px）、親は子の真ん中。名前のあるふしは名前の幅だけ右へ（開いていれば名前は線の上）。名前のないふしは小さな点で、いつも開いている。点の大きさは種の数の log。色は段（界・門・綱・目・科・属・種・枝）。
- **枝とアニメ**（2026-10-15 v003）: 枝は分かれ目から子へのベジェ曲線、太さは種の数の log（`branchW`）。見た目の位置 ax/ay/ajx は決めた位置 x/y/jx へ指数で近づく（`step`、時定数 約0.09秒）。新しく見えたふしは親の分かれ目から出てきて、うすい所から濃くなる。閉じると子は `leaving` に入り、0.3秒で親へ加速しながら吸いこまれ（t³）、着いたら親の点が小さく弾む（`pulse`）。開いたときも小さく弾む（`pop`）。押した名前は動かさず、まわりは今の見た目の場所から新しい場所へすべる（main.js の `stay` が `V.shift` とカメラを同じだけずらす）。
- **図**（2026-10-15 v003）: Wikidata の P18（写真）→ なければ英語版 Wikipedia の記事の代表の図（`pageimages`、pilicense=free）→ Commons の `imageinfo` で作者・条件を読み、CC0・パブリックドメイン・CC BY・CC BY-SA だけ出す（NC・ND・GFDL だけ・不明は出さない）。人とチンパンジーなどの写真は出さない（`NO_IMAGE`）、ファイル名・説明・カテゴリに裸・性器・交尾・死体などの語があるものも出さない（RULES 9）。作者の HTML は DOMParser で文字だけにする。
- 押す: 選ぶ＋閉じていれば開く・選んでいて開いていれば閉じる。押した名前が画面の同じ場所に残るように cam を合わせ、子が右の外なら左へ寄せる（`reach`）。

## ハマったところ
- Open Tree の induced_subtree は、合成系統樹にない ott_id があると 400 と `unknown` の一覧を返す → のぞいてやりなおす（`pruned_ott_id` がほとんど。所属のはっきりしない属）。
- 最初は CSS が効く前で canvas の大きさが 0 → `ResizeObserver` で、だれも動かしていない間は全体を入れなおす。押した・検索したあとは入れなおさない（`touched`）。
- 和名があとから届くので、詳細の欄を出しなおす（`UI.refresh`）。あとから届く説明・リンクは、出しなおしたら古いほうを捨てる（`token`）。
- Browser ペインがかくれている間は canvas の大きさが 0 になり、ResizeObserver も requestAnimationFrame も止まる → 描く前に `measure()`、アニメは `__trofli.V.tick()` で1コマずつ進めて確かめる・`settle()` で一気に。
- 検索で Wikidata の1件目が亜属・別名（「シマウマ」→ Hippotigris）のことがある → COL で別名なら受け入れられた名前（ウマ属）へ。
- Browser ペインの mobile の表示は 1.25 倍に縮めて映すので、JS で作った PointerEvent の座標がずれる（本物の指では問題なし）。確かめるときは `__trofli.press(学名)`。

## 確認のしかた（変更のたびに）
1. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps tree-of-life`（例外・読み込みの失敗・外への通信。COL・Wikidata は許可ずみ）
2. はじめの表示: 根もと・真核生物が開いて、名前が読める大きさ。`__trofliErr` が空。
3. `__trofli.press('Animalia')` → `press('Bilateria')`: 開いて、押した名前が動かない。もう一度で閉じる。
4. 綱を開く（例 `press('Mammalia')`）: COL から目が出て、少しして和名がつく。
5. アニメ: `press('Animalia')` → `V.settle()` → もう一度 `press('Animalia')` して `V.tick()` をくり返す: `leaving` が 0.3秒ほどで 0 になり、親の `pulse` が立つ。`__trofliErr` が空。
6. 図: `press('Mammalia')` で図（作者・条件・Commons へのリンク）。`Homo sapiens` では図を出さない。
7. 検索「ライオン」→ 選ぶ → ヒョウ属の下まで開いて、詳細に道すじ・Wikipedia のリンク（1組だけ）。学名「Panthera leo」でも。「シイタケ」でも。
8. 幅 375px: 上に樹形図が固定、詳細は下でスクロール、横にはみ出さない（`scrollWidth` 375）。

## 状態
- 2026-10-15 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-10-15 v002-stage-a: 情報量と利用条件を調べて PLAN.md に。界〜綱の樹形図（COL26.9 × Open Tree 16.1、645 ふし・38KB）、綱より下は COL からその場で、和名は Wikidata、検索（和名・学名）、詳細の欄、スマホ対応。
- 2026-10-15 v003-zukan: ユーザーの声で、図鑑風の見た目（生成りの紙・明朝・分類の表）、やわらかい曲線の枝（太さ＝種の数）、開くと出てくる・閉じると親へ吸いこまれるアニメ（くどくしない）、詳細に図（Wikimedia Commons。条件の合うものだけ、作者・条件つき）。検索で別名・亜属から受け入れられた名前へ。
