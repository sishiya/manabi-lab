# 脱毛のしくみ 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: v002-cycle（段階A: 毛の周期・剃る・抜く・3列・グラフ・案内9段）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。
- 次にやること: PLAN.md の段階B（光＝ケノンの熱の物理）。`main.js` の `HOOKS.light(f, site, e)` に入れる。光の列の予定・前日に剃るところはもうできている。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: http://localhost:8765/hair-removal/ （サーバー apps。ほかのチャットが立てていれば `preview_start {url}` で開く）。デバッグ用の窓口 `window.__hare`（`applyGuide(i)`・`setTime(日)`・`set({site, pre})`・`counts()`・`simRun(秒)`）、エラーは `window.__hareErr`。node でもモデルだけ動く（data.js と model.js を eval。DOM を使わない）。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へコピーしてカードに。RULES 3章）。
- ユーザーの好み: 3列で同じ肌を比べる・すねだけ・光はユーザーが使っている家庭用の光脱毛器ケノン。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 骨組み。上に固定（#pin: 断面・時間・案内）、下にスクロール（グラフ・予定・このアプリについて） | |
| css/style.css | 見た目。600px 以下でスマホの並び | |
| js/data.js | 数値と出どころ・部分の説明 | `SITES`（周期の値3種）・`GEO`（深さ mm）・`SIM`・`LANES`・`PRESETS`・`PARTS`・`SOURCES` |
| js/model.js | 毛穴のモデル（DOM なし） | `newFollicle`・`stepF`・`shave`・`pluck`・`Runner`（`advanceTo(t, rec)`）・`simulate`・`countLane`・`tipH`・`rootDepth` |
| js/draw.js | 3列の断面を描く・説明の当たり判定 | `drawScene`・`drawFollicle`・`HITS`・`findHit` |
| js/graph.js | 表面から出ている毛の数のグラフ | `drawGraph`・`graphDayAt` |
| js/ui.js | 予定・周期の選択、案内の文、吹き出し | `GUIDE`・`buildControls`・`syncControls`・`showTip`・`$` |
| js/main.js | 状態 `S`・計算のよびだし・ループ・窓口 | `laneEvents`・`computeSeries`・`computeScene`・`HOOKS`・`applyGuide`・`window.__hare` |
読み込み順: data → model → draw → graph → ui → main（main が ui の `$` を使う）。

## しくみ
- 時間は日。スライダーは −7〜365 日（手入れは 0 日目から）。きざみ `SIM.dt`=0.25 日で決まった格子の上だけを進むので、`Runner` を続きから進めても 0 から計算しても同じ結果（再生中は続きから。日をもどすと作りなおす）。
- 0 日目より前に 500 日回して周期をばらばらにした状態（`startState`、部位ごとに1回だけ作って複製）。毛穴ごとに別の乱数（`mulberry32`）なので、手入れをしない毛穴は3列で同じ。
- 毛穴1つ: 期 `ph`（A 成長・C 退行・T 休止・R 抜いたあと待つ・X 作れない＝段階B）、毛球の深さ `bulb`、毛 `hairs[]`（`L`＝根もとから先までの長さ、`club`＝棍毛、`blunt`＝剃った切り口）。先の高さ = L − 根もとの深さ（`tipH`）。
  - 成長期: 毛球が 1.1 → 3.0 mm へ 10 日でおりる（推定）、毛は v mm/日でのびる。退行期 14 日で毛球が 1.1 mm へ上がる。休止期: 棍毛は止まる。次の成長期が始まると古い棍毛は 0〜25 日で落ちる（推定）。
  - 剃る: 表面から出た分を切る（`blunt`）。毛穴は変えない。休止期の毛は切ったまま止まる → 剃った次の日に見える毛は成長期の割合ぶんだけ。
  - 抜く: 表面から 0.5 mm 以上出ている毛を取る。いま育っている毛（休止期なら棍毛）が取れたら期 R（平均7日・ばらつき 0.5 の対数正規。推定）→ 新しい成長期。
- 周期の値は3種（`SITES`）。すねの値（成長期 16 週・休止期 24 週）は臨床試験の計画 NCT03945383 の文。太ももの値は Seago & Ebling 1985 の測定（PubMed 4015973 の要旨で確認）。のびる速さ: 太もも 0.13〜0.25 mm/日（Myers & Hamilton 1951、総説の引用）→ 0.2、男女比 1.22（Seago）。
- 光の列: 段階A では光の日の前日に剃るだけ（0 日目は同じ日に剃ってから）。予定は NCT03945383 の「2週ごと4回→4週ごと」。
- 図: 表面の上 2 mm・下 3.6 mm。毛穴のさやは見やすく太め。表面から上の毛は寝かせて描く（向きは演出）。

## ハマったところ
- Browser ペインが隠れていると canvas の大きさが 0 → `ellipse` の負の半径で例外。`drawScene`・`drawGraph` は小さすぎるときは描かない。
- ほかのチャットのサーバーが 5 つ立っていて `preview_start {name}` ができない → `preview_start {url: http://localhost:8765/hair-removal/}` で開く。
- `_dev/tools/thumb.html` に new-app.ps1 が SETUP を足せなかった（ほかのセッションの変更が入っている）。サムネイルを撮るときに手で足す。

## 確認のしかた（変更のたびに）
1. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps hair-removal`（例外・読み込みの失敗・外への通信）
2. 案内を 1→9 まで進め、各段で `__hareErr` が空、3列の見出しの数が文と合う（4段目: 剃るの列が約半分、抜くの列が 0〜数本。7段目: 抜くの列がほぼ全部）。
3. 再生 ▶ で最後まで進む。グラフをさわると日が移る。予定・周期の値を変えるとグラフが変わる。
4. 図の部分（毛球・毛乳頭・バルジ・皮脂腺・棍毛・剃った毛・帯）にマウスをのせると説明が出る。
5. 幅 375px: `scrollWidth` が 375、見出しが重ならない、図と時間と案内が上に固定。

## 状態
- 2026-10-12 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-10-12 v002-cycle: 段階A。毛の周期のモデル（Runner）・剃る・抜く・3列の断面・グラフ・予定・周期の値3種・案内9段・出どころ。
