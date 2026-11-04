# うんちくショートの描きなおし（筆のルック）の作業メモ（2026-11-04）

89本のうんちくショートを、決まったルック（**筆**）と BGM（Sneaky Snitch）で録りなおす。主役の絵を、図鑑の版画の道具 `PL.*`（`_dev/promo/trivia-plate.js`）で描きなおす作業の決まり。
筆のルックは `PL.ink`・`PL.tint`・`PL.hatch`・字体を筆に置きかえる（`trivia-looks.js` の `TL.LOOKS.brush`）。なので **`PL.*` で描いた絵だけが筆の絵になる**。`g.fillStyle` で直接ぬった丸・四角はそのまま安っぽく残る。

## 見本（先に読む）
- `_dev/promo/trivia-plate.js` — 道具の全部（PL.paper/hatch/tint/ink、形の部品 circle/ellipse/rect/poly、sphere、leader、label、dots、walker、tree、watch。TK の札・数字・棒・選択肢・時計・注・字幕の置きかえ）
- `_dev/promo/tiny-earth-trivia1.html`（小さい見本）、`spider-hunt-trivia1.html`（生きものを道具で描いた見本）、`evolution-trivia1.html`、`black-hole-trivia2.html`
- `_dev/promo/trivia-looks.js` の `TL.LOOKS.brush`（筆に置きかえる所。読むだけ）

## 1ページの直し方
1. `<script src="trivia-kit.js"></script>` のあとに、この順で3行を入れる（見本と同じ）:
   ```html
   <script src="trivia-plate.js"></script>
   <script src="trivia-looks.js"></script>
   <script src="trivia-style.js"></script>
   ```
2. `draw(g, t)` の絵を `PL.*` で描きなおす。
   - **変えないもの**: `subs`（字幕の文・時刻）、`cues`、`DUR`、`triviaStart({...})` の中身、数字と事実、出どころの注。声はもう字幕に合わせて作ってあるので、字幕を変えると合わなくなる。
   - **絵の語り（何をいつ見せるか）は台本どおりにする**。見せ方を、版画の道具で描いた図に置きかえる。
3. 共通のファイル（trivia-kit.js・trivia-plate.js・trivia-looks.js・trivia-style.js・promo.js）は**さわらない**。道具が足りなければ、そのページの中に関数を書く（PL.* を組み合わせる）。
4. 確かめ（下）。強い重なりが 0 件になり、コマを目で見て問題がなくなるまで直す。
5. commit・push はしない（まとめて行う）。動画も録らない（あとでまとめて録る）。

## 絵の決まり（安っぽく見えない絵にするため）
- 形は `PL.tint`（うすい手彩色）＋ `PL.hatch`（光と反対がわのかげ）＋ `PL.ink`（墨の輪郭）の3つを重ねて描く。平らなべたぬりの丸・四角だけで済ませない。
- 情報を少し密に: 引き出し線（`PL.leader`）と小さなラベル（`PL.label`）、目盛り、細い補助線、形の中の構造（すじ・節・粒など）。ただし字は少なめに。
- 構図は少しまん中から外す。大きな数字の札をまん中に置くだけの画面にしない。
- 生きもの・機械・人は、ものの形を調べたうえで、それらしい輪郭で描く（丸の組み合わせにしない。`spider-hunt-trivia1.html` の描き方を見る）。
- 避けるもの: 光る丸、放射のグラデーション、角の丸い札、ネオン色、影つきの字。色は `PL.T` の手彩色と `PL.INK`・`PL.RED`。
- 画面の配置（1080×1920）: 左上 0〜200×0〜90 はロゴ（何も置かない）。字幕の帯は y = 1330 を中心に、1行で 1245〜1415、2行で 1206〜1454。注（`TK.note`）は 1490、クレジットは 1527 に自動で置かれる（下に紙を敷く）。**絵と見出しは y = 100〜1190 の中に収める**。帯の下に絵がもぐってもよいが、大事な所は隠さない。
- **字と絵を重ねない**（ユーザーがいちばん気にしている）。ラベルは線や形の上に置かず、すきまに置いて引き出し線でつなぐ。動く絵（人・軌道・矢印）が通る所にも字を置かない。動く絵と重なる時間が少しでもあれば、場所を変える。

## 確かめ方
サーバー `apps`（http://localhost:8765）は動いている。リポジトリのルートで、自分の組に割り当てた DebugPort を使う（ほかの組の Chrome と取りあわないため）:
```
powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/record-promo.ps1 -Script <ページ名> -Short -NoRecord -Overlap -Peek 2,6,10,14,18,22,26,30 -DebugPort <番号>
```
- `-Short` を必ずつける（ない横長で開くと座標がずれる）。
- 重なりの一覧が出て、見つけたコマに枠を描いた `_dev/promo/out/overlap-<ページ名>-short.jpg` ができる。`-Peek` の秒のコマは `_dev/promo/out/peek-<ページ名>-short.jpg`（4列）。どちらも Read で画像として見る。
- 種類: `line` 字の下に線・形がある／`cover` 字のあとに上から絵が描かれた／`text` 字どうしが重なる／`out` 画面からはみ出す（ここまで強い。0 件にする）。`tint` 色ぬりの上の字（札やカードの上ならよい）／`band` 字幕の帯の下に絵（弱い。目で見て決める）。
- peek は台本の場面ごとに秒を選ぶ（DUR の中で）。声で時間がのびることがあるので、最後の場面も見る。
- 見終わった jpg は消してよい（out/ は Git に入らない）。

## 終わったら返すこと
ページごとに1行: 何をどう描いたか、重なりの最後の結果（強い件数・弱い件数）、気になって残したこと。
