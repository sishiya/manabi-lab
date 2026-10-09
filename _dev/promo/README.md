# 紹介動画づくり（_dev/promo）

アプリを iframe で開いて1コマずつ描き、字幕・矢印・BGM（コードで合成）を重ねて、ブラウザだけで 4K の mp4 にする。
共通の仕組みは `promo.js`、アプリごとのページ（台本）は `<app>.html`・`<app>-guide.html`。

## すみわけ（2026-10-10 にユーザーが決めた）
| | ショート（`<app>.html?short`） | 横長（`<app>-guide.html`） |
|---|---|---|
| 役わり | 見つけてもらう。いちばん映える絵 | 使い方と見どころ。操作して見せる |
| 長さ | 30〜50秒、縦 2160×3840 | 2〜3分、横 3840×2160、チャプター付き |
| 日本語の字幕 | 焼きこみ（下寄り、`drawCaps(g, t, CAPS)`） | 焼きこみ（**上**、`drawCaps(g, t, CAPS, true)`）。下は英語の CC にあける |
| 英語 | 字幕データ（CC）＋英語のタイトル・説明 | 同じ。最初に「CC: English subtitles」を出す |

`<app>.html` は横長（`?short` なし）でも録れるが、横長は説明動画に置きかえる方針。

## 作り方
1. 手本を写す: ショートは `black-hole.html`、説明動画は `black-hole-guide.html`（3D の場面を切りかえていくアプリは `evolution-guide.html`。年代・視点・ボタンの状態を時刻の表 `EV` に書き、変わったときだけアプリに入れる。アプリの帯や図は `drawInset` で写す）。
2. 台本の字幕 `CAPS` に英語を並べて書く: `{ a, b, main, sub, en: [main, sub] }`。題名・終わりの画面ぶんも足して `subs: [...]` を `promoStart` にわたす（`capSubs(CAPS)` で変換）。数をアプリで計算して入れるときは `subs` を関数にして `setup` で決める（guide を見る）。
3. 説明動画の道具（`promo.js`）: `drawCursor`（矢印・クリックの輪・ドラッグ・ホイール）、`drawChip`／`btnRect`（アプリと同じ言葉のボタンの「札」。アプリと同じ側に置く。アプリの画面そのものに似せすぎない）、`drawInset`（アプリの中の図の canvas を重ねる）。
4. 確認用サーバー（`.claude/launch.json` の `apps`〜`apps-6`。使えないポートがあるので空いているものを）で `http://localhost:<port>/_dev/promo/<台本>.html` を開く。準備ができると字幕データ `out/<out>.ja.srt`・`.en.srt` が保存される。
5. コマを確かめる: `__promoPeek(秒)` のあと `out` の canvas を縮めて `fetch('out/peek-<秒>.jpg', { method: 'PUT', body })` で保存して見る（ペインのスクリーンショットは失敗しやすい）。見るのは要所の数枚でよい（トークンの節約）。見終わったら消す。
6. 録画: ボタン（または `__promoRecord()`）。150秒の 4K で1分ほど。できた mp4 から数コマ取り出して確かめる（`video` のシーク後は少し待ってから描く。すぐだと前のコマが写る）。

## YouTube に上げる（`_dev/tools/youtube-upload.ps1`）
- `<out>.upload.json` を作る: 説明欄は「アプリ: URL」の行と「しし屋 まなびラボ（ほかのアプリ）: URL」の行の間を1行あける（ショートも横長も。英語も同じ）。`file`・`thumbnail`・`privacy: private`・`title`・`description`（横長はチャプター `0:00 …`）・`tags`（日本語＋英語）・`localizations.en`（英語のタイトルと説明。「アプリの文字はいまは日本語」と書く）・`captions: { "en": "_dev/promo/out/<out>.en.srt" }`。日本語は焼きこんであるので CC は英語だけ。
- 上げる: `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Meta _dev/promo/<out>.upload.json`。表示された ID を JSON の `videoId` に書く。
- 上げたあとに英語・字幕を足す・直す: `-Update -Meta …`。チャンネルの動画の一覧: `-List`。
- **API の本数の上限で上げられないとき**: ユーザーが Studio で動画ファイルだけ上げる（「子ども向けではない」を選ぶ・非公開・予約はそこで）→ `-List` で ID を調べて JSON の `videoId` に書く → `-Update -Full -Meta …` で日本語と英語のタイトル・説明・タグ・字幕・サムネイルを入れる（上げたあとの更新は本数の上限に数えられない）。
- **上げる・予約投稿はユーザーの GO のあとで**。予約は `publishAt`（日本時間 `+09:00`、19〜22時ごろ）。差し替えは新しく上げて、古い方はユーザーが Studio で消す（Claude は消さない）。
- YouTube には1日に上げられる本数の上限がある（`exceeded the number of videos` が出たら日を改める）。
- 秘密（クライアントの秘密・トークン）はプロジェクトの外。スクリプトだけが読む。中身を読んだり画面に出したりしない。

## 毎回まもること
- BGM はコードで合成した音だけ。作るたびに、権利上問題ないかを確かめてユーザーに伝える。
- 最初のカットは入口のサムネイル（`assets/thumbs/<app>.jpg`）に近い見た目にする。生き物などの名前を画面に出すと好評。
- 性的な内容・R18 をまぜない（RULES 9章）。出どころは説明文と終わりの画面に書く。
- commit の前に公開前チェック（`_dev/tools/check-public.ps1`）。`out/` は Git に入れない。
