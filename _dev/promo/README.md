# 紹介動画づくり（_dev/promo）

アプリを iframe で開いて1コマずつ描き、字幕・矢印・BGM（コードで合成）を重ねて、ブラウザだけで 4K の mp4 にする。
共通の仕組みは `promo.js`（音は `promo-audio.js`。台本ページで promo.js のあとに読みこむ）、アプリごとのページ（台本）は `<app>.html`・`<app>-guide.html`。
YouTube に出す順番（ジャンル・サムネイルの色味が連日で重ならないように並べた案）は `SCHEDULE.md`。

## すみわけ（2026-10-10 にユーザーが決めた）
| | ショート（`<app>.html?short`） | 横長（`<app>-guide.html`） |
|---|---|---|
| 役わり | 見つけてもらう。いちばん映える絵 | 使い方と見どころ。操作して見せる |
| 長さ | 30〜50秒、縦 2160×3840 | 2〜3分、横 3840×2160、チャプター付き |
| 日本語の字幕 | 焼きこみ（下寄り、`drawCaps(g, t, CAPS)`） | 焼きこみ（**上**、`drawCaps(g, t, CAPS, true)`）。下は英語の CC にあける |
| 英語 | 字幕データ（CC）＋英語のタイトル・説明 | 同じ。最初に「CC: English subtitles」を出す |

`<app>.html` は横長（`?short` なし）でも録れるが、横長は説明動画に置きかえる方針。

### うんちく動画（不定期のショート。2026-10-26 にユーザーと決めた）
上の2本（1アプリ＝ショート＋説明動画）は**そのまま**。それとは別に、アプリにまつわるうんちくのショートを**不定期**で出す。決まった曜日はなし（毎日の公開作業をふやさない）。
- 中身: アプリの説明ではなく「知ってた？」の話1つ。**アプリで確かめられる話**を選ぶ（場面はアプリの録画。確かめられない話は選ばない）。
- 形（30〜40秒、縦 2160×3840。`drawShortChrome`／`shortSubs` は同じものを使う）: 問い（0〜2秒、字幕で大きく）→ アプリで見せる → 数字を1つ（ふだんのものとくらべる）→ 「アプリで自分で確かめられます」→ 締め（しし屋の目印・ジングル）。
- 題名は `【うんちく】` で始める（英語は `Did you know?`）。#Shorts を付ける。
- 正しさ: 出どころのある話だけ。出どころは画面の終わりと説明欄に。推定・モデルの値は「推定」「モデルでは」と書く。数字はアプリで測った値を使い、台本に測った条件を書いておく。
- ファイル名: 台本 `<app>-trivia<番号>.html`（`?short` で録る）、`<app>-trivia<番号>.upload.json`、サムネイル `thumbs/<app>-trivia<番号>.jpg`。`*-short`・`*-guide` の名前にしないので、ショートの再生リスト・入口の動画リンクの道具には入らない。
- 音量・サムネイル・目印・英語の字幕・前日の確認は、ほかの動画と同じ決まり（下の「毎回まもること」）。上げる・予約はユーザーの GO のあと。
- BGM はおとライブラリ（Stable Audio 3）の曲も使える: `music: { style: 'file', file: 'out/bgm/<id>.ogg' }`（曲は `../sound-library/bgm/` から `out/bgm/` に写す。Git に入れない）。台本に `?bgm=<id>` で切りかえを付けておくと、`__promoAudio()` で音だけ作って聴きくらべられる。説明欄に「BGM: Stable Audio 3（Stability AI）で生成」。うんちく用に `promo_trivia_clock`・`promo_trivia_pop` を作った（2026-10-26）。
- 再生リスト「まなびラボ ― うんちく」: 1本目を上げるときに `playlist-trivia.json`（`match: "*-trivia*.upload.json"`）を足す。**先に置くと、毎晩の予約タスク（`-Playlist`）が空のリストを公開で作ってしまう**ので、ユーザーの GO まで置かない。
- 予定と題材の候補は `SCHEDULE.md` の「うんちく動画」。

## 作り方
1. 手本を写す: ショートは `black-hole.html`、説明動画は `black-hole-guide.html`（3D の場面を切りかえていくアプリは `evolution-guide.html`。年代・視点・ボタンの状態を時刻の表 `EV` に書き、変わったときだけアプリに入れる。アプリの帯や図は `drawInset` で写す）。シミュレーションが長いアプリは `body-dive-guide.html`（場面ごとにアプリをやり直し、`simRun` で描かずにその場面まで進める。乱数は決めておく）。字幕が録画しながら決まる台本（`body-dive.html` の場所の説明）は `subsAfterRecord: true` で、録り終えてから字幕データを保存しなおす。
2. 台本の字幕 `CAPS` に英語を並べて書く: `{ a, b, main, sub, en: [main, sub] }`。題名・終わりの画面ぶんも足して `subs: [...]` を `promoStart` にわたす（`capSubs(CAPS)` で変換）。数をアプリで計算して入れるときは `subs` を関数にして `setup` で決める（guide を見る）。
3. 説明動画の道具（`promo.js`）: `drawCursor`（矢印・クリックの輪・ドラッグ・ホイール）、`drawChip`／`btnRect`（アプリと同じ言葉のボタンの「札」。アプリと同じ側に置く。アプリの画面そのものに似せすぎない）、`drawInset`（アプリの中の図の canvas を重ねる）。
4. 確認用サーバー（`.claude/launch.json` の `apps`〜`apps-6`。使えないポートがあるので空いているものを）で `http://localhost:<port>/_dev/promo/<台本>.html` を開く。準備ができると字幕データ `out/<out>.ja.srt`・`.en.srt` が保存される。
5. コマを確かめる: `__promoPeek(秒)` のあと `out` の canvas を縮めて `fetch('out/peek-<秒>.jpg', { method: 'PUT', body })` で保存して見る（ペインのスクリーンショットは失敗しやすい）。見るのは要所の数枚でよい（トークンの節約）。見終わったら消す。
6. 録画: ボタン（または `__promoRecord()`）。150秒の 4K で1分ほど。できた mp4 から数コマ取り出して確かめる（`video` のシーク後は少し待ってから描く。すぐだと前のコマが写る）。
   - 4〜6 を一度に: `_dev/tools/record-promo.ps1 -Script <台本> [-Short] [-Peek 3,30,60]`（ヘッドレスの Chrome で、確かめ用のコマ → 録画 → できた mp4 のコマを `out/check-<out>.jpg` に1枚 → 台本ページのログ。2026-10-10〜）。

### 台本の共通の道具（`promo.js`、2026-10-10 に足した）
- 決まった部分: 説明動画は `drawGuideChrome(g, t, END, 名前, 出どころ)`＋`guideSubs(END, 日, 英, CAPS)`、ショートは `drawShortChrome(g, t, 名前, 一言, 終わりの一言, 出どころ)`＋`shortSubs(…)`（`SHORT_END` = 40）。題名・CC の案内・終わりの画面・しし屋の目印（はじまりと締め）がまとめて入る。
- 札と文字: `drawPanel(g, x, y, w, 見出し, [行…], 濃さ, 色)`（アプリのパネルの中身を写す）、`drawName(g, t, a, b, 名前, 一言)`（生き物などの名前）。
- アプリを外から動かす: `clickEl(w, sel)`、`setInput(w, sel, 値)`（スライダー・チェックボックスに input と change を送る）、`runEvents(w, 表, t0, t)`。
- 日本語で録る: アプリは `?lang=ja`（`langJa`）で開く。`inject` で開くときは、言語の記憶 `manabi-lang` をその iframe の中だけ `ja` に見せる。`inject.pre` で台本ごとの差しかえ（アプリより先に動く）。
- 確かめ用のコマ: `__peekSheet([秒…], 'peek-名前')` で何コマかを縮めて1枚に並べ、`out/peek-名前.jpg` に保存する（見終わったら消す）。
- アプリごとの部品は `<app>-common.js`（`quantum-common.js`・`wifi-common.js`・`animal-common.js`・`immune-common.js`・`metamorphosis-common.js`・`air-flow-common.js`・`ga-common.js`・`mold-common.js`・`god-view-common.js`・`piano-common.js`・`pitch-common.js`・`wave-common.js`・`phage-common.js`・`hair-common.js`・`mesy-common.js`・`tol-common.js`）。場面の表 `SC` と、とびとびの時刻（確かめ用のコマ）でも同じ絵になる進め方が入っている。
- **ピアノを弾く手は BGM のかわりにピアノの音**（`piano-common.js`、2026-10-11）: アプリと同じ合成（`VOICES.piano`）で、画面の手が押す音を録画の音に入れる（`music.extra(ctx, 出口)` は台本ごとの音を足す口。`style: 'none'`）。3D の canvas だけを全画面にして開き、アプリの時計（performance.now）をこちらの時刻にする。縦長の一人称は手が画面の外に出るので使わない。
- **`inject.top`**（2026-10-12〜）: `<head>` がなく `<header>` があるアプリでは、ふつうの差しかえが `<header>` の後ろ（body の中）に入り、それより前の相対パスの css が読めない。`inject: { top: true }` で先頭に入れる（変化球のしくみ）。録画ずみの台本は見た目を変えないよう、そのまま。
- **神の視点マップだけは `inject` を使わない**: srcdoc で開くと Cesium の Worker（地形）が動かず、地図が出ない。普通に開いてから `requestAnimationFrame` を差しかえる（`gvInstallRaf`）。地図は1コマごとに読みこみを待つので、録画は通信が安定しているときに・時間がかかる（150秒で数十分の見込み）。「地球をちぎる」の描画ループは差しかえた requestAnimationFrame に乗らないことがあるので、1コマごとに `GV._tear.render()` で描かせる。粒の計算（Worker）は実時間で進むので、1コマのあいだだけ動かして止める。

### ライオン版（案内役のしし屋のライオンが右下に出る。説明動画の標準、2026-10-10）
- 見本は `evolution-guide.html`（46億年の説明動画。2026-10-10 にライオン版を正にした）。部品は `promo.js` の `lionSetup`（表情・しゃべり・出入りの時刻）・`lionOpen`・`drawLion`。ライオンは `_dev/vtuber/index.html?ext&clean&bg=clear` を裏の iframe で開き、`__lion.frame(t, dt, 姿勢と表情の値)` で1コマずつ描かせて重ねる（値は MediaPipe の表情の名前。`_dev/vtuber/README.md`）。
- しゃべり: 字幕ごとに cue `{ t, type: 'babble', n, seed, voice }` を `music.cues` に足すと（`lionSetup` が作る）、声の代わりの合成音が鳴り（`babbleSound`）、口は `babbleMouth(cues, t)` で同じ音の並びに合う。合成音なので権利の心配なし。
- 表情は台本ごとの時刻の表 `exp: [[秒, 名前], …]`（名前は `LION_XP`: calm・smile・wow・shock・sad・cold・think・sleepy・proud）。見る向きはマウスの矢印、しゃべるときはこちら。クリックでうなずく。右下をあけるため、右の札とタイムライン・図を左へ寄せる。

## YouTube に上げる（`_dev/tools/youtube-upload.ps1`）
- `<out>.upload.json` を作る: 説明欄は「アプリ: URL」の行と「しし屋 まなびラボ（ほかのアプリ）: URL」の行の間を1行あける（ショートも横長も。英語も同じ）。`file`・`thumbnail`・`privacy: private`・`title`・`description`（横長はチャプター `0:00 …`）・`tags`（日本語＋英語）・`localizations.en`（英語のタイトルと説明。「アプリの文字はいまは日本語」と書く）・`captions: { "en": "_dev/promo/out/<out>.en.srt" }`。日本語は焼きこんであるので CC は英語＋翻訳（下）。
- 字幕の翻訳（2026-10-15〜、スペイン語 `es`・ポルトガル語 `pt`・繁体字中国語 `zh-TW`・韓国語 `ko`）: 英語の字幕と同じ数・順で `_dev/promo/subs/<言語>.json` に `"<名前>": ["1行目 // 2行目", …]` を足す（アプリのボタンの日本語の名前は （次の出来事） のように残す）→ `node _dev/tools/build-subs.mjs`（英語の時刻を写して `subs/<名前>.<言語>.srt` を作り、upload.json の captions にも足す）→ `youtube-upload.ps1 -Captions -Lang es,pt,zh-TW,ko -Meta …`（まだない言語だけ送る。1本 400 ポイント）。
  - 下書きは `_dev/tools/make-upload.ps1 -App <app>`（入口の APPS とアプリの出どころから。TODO を埋める）。上げる前に `make-upload.ps1 -Check` で、説明欄の形・チャプター（0:00 から、**1つ10秒以上**。短いと YouTube がチャプターを出さない）・字数・< >・予約の時刻を確かめる。
  - 予約日時は `_dev/tools/schedule-videos.ps1 -Start <日付>`（`SCHEDULE.md` の順に、説明動画 20:00・ショート 20:05）。`-Apply` で書き、GO のあと `-Upload` で YouTube の予約まで。
- 上げる: `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Meta _dev/promo/<out>.upload.json`。表示された ID を JSON の `videoId` に書く。
- 上げたあとに英語・字幕を足す・直す: `-Update -Meta …`。チャンネルの動画の一覧: `-List`。公開前の最終確認（読むだけ）: `-Verify [-Date 日付]`（RULES 8.4）。
- 再生リスト「まなびラボ ― アプリの使い方と見どころ（通しで見る）」（公開、https://www.youtube.com/playlist?list=PLPr9GEGpKWDg 、2026-10-12 ユーザーの指示で作った）: `-Playlist`。設定は `playlist.json`（名前・説明・英語・どの upload.json を入れるか）。ショートは「まなびラボ ― ショート（通しで見る）」（https://www.youtube.com/playlist?list=PLYifG6DSkuLM 、設定は `playlist-shorts.json`）。`-Playlist` は `playlist*.json` を全部合わせる。毎晩 20:20 ごろの予約タスク（manabi-playlist-sync、Claude のアプリが開いているとき）が走らせる。**公開ずみ**の説明動画だけを公開の順に足す（予約中は足さない）ので、**動画が公開された日（20:00 のあと）に毎回走らせる**。何度走らせてもよい。`-DryRun` で足すものだけ見る。
- **API の本数の上限で上げられないとき**: ユーザーが Studio で動画ファイルだけ上げる（「子ども向けではない」を選ぶ・非公開・予約はそこで）→ `-List` で ID を調べて JSON の `videoId` に書く → `-Update -Full -Meta …` で日本語と英語のタイトル・説明・タグ・字幕・サムネイルを入れる（上げたあとの更新は本数の上限に数えられない）。
- **上げる・予約投稿はユーザーの GO のあとで**。予約は `publishAt`（日本時間 `+09:00`、19〜22時ごろ）。差し替えは新しく上げて、古い方はユーザーが Studio で消す（Claude は消さない）。
- YouTube には1日に上げられる本数の上限がある（`exceeded the number of videos` が出たら日を改める）。2026-10-11 は API で8本＋Studio で3本（合わせて11本）上げても当たらなかった。API の使用量は `youtube-upload.ps1 -Quota`（記録は `_dev/tools/out/yt-quota.csv`。1日は太平洋時間の0時＝日本時間16時に切りかわる）。
- 大きい動画（600MB ほど）で「The underlying connection was closed」が出ても、実は上がっていることがある。すぐ上げなおさず、`-List` で確かめる（上がっていたら ID を書いて `-Update -Full` で字幕・サムネイルを付ける）。
- 秘密（クライアントの秘密・トークン）はプロジェクトの外。スクリプトだけが読む。中身を読んだり画面に出したりしない。

## X（@sishiya22）に出す（`_dev/tools/x-post.ps1`、半自動）
- API は使わない（2026年から有料。URL 入りの投稿は1回 $0.2 ほど）。下ごしらえだけスクリプトで作り、**投稿ボタンはユーザーが押す**。
- 出すのは**ショート**（無料のアカウントの動画は 2分20秒・512MB まで。説明動画は入らない）。YouTube のリンクではなく、動画を X に直接上げる。
- **本文に URL を入れず、アプリの URL は自分の投稿への返信に**書く（外へのリンクがあると表示が減るとされる）。
- 手順: `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/x-post.ps1 -Meta _dev/promo/<app>-short.upload.json` → 本文がクリップボードに入り、動画のフォルダと X の投稿画面が開く → 貼る・動画をドラッグ・投稿 → `-Reply` を付けて同じコマンド → 返信に貼る。文は `out/<名前>.x.txt` にも残る。
- 本文はタイトル（#Shorts を除く）＋ハッシュタグ＋英語のタイトルから自動で作る。変えたいときは upload.json に `"x": { "text": "…", "en": "…", "reply": "…" }`。字数（日本語は1字を2と数えて 280 まで）と動画の長さはスクリプトが確かめる。
- 出すのはユーザーの GO のあとで。時間は YouTube と同じく夜（19〜22時）がよい。

## 毎回まもること
- **説明動画（横長）は、案内役のライオンつきで作る**（2026-10-10 にユーザーが決めた。「これから作る動画はこの形に」）。見本は `evolution-guide.html`、部品は `promo.js` の `lionSetup`・`lionOpen`・`drawLion`（上の「ライオン版」）。右下（x 1530〜、y 620〜）はライオンの場所なので、札・図・名前札はそこにかけない。表情の時刻 `exp` は出来事に合わせて台本ごとに書く。声は C もごもご が標準（`lionSetup` で `voice` を省くとこれ。2026-10-10 にユーザーが5種類から選んだ。見くらべは `babble-test.html`）。しゃべっている間は表情の口の形より口パクを優先（目と眉の表情は残す）。ショートに入れるかは未定。
- **しし屋の目印を入れる**（2026-10-10 にユーザーが決めた。見本は `ident-test.html`）:
  - はじまり: 本編が主役。左上に小さくアイコン＋名前が出て約3秒ではける（`drawIdentMini(g, t, 0.3)`、音なし）。**ショートにも入れる**（最後まで見ない人にも覚えてもらうため。2026-10-10 ユーザー）。大きさは横長と同じ（1.4 倍にしたら「主役は題名。隅に見えて色の残像が残ればいい」と言われて戻した）。左上にアプリの文字（年代・場所の名前など）を出す台本は、目印がはけてから（`IDENT_MINI + 0.3` 秒から）出す。
  - 締め: `END = DUR - IDENT_CLOSE`。本編の終わりで BGM を消し（`music.stopAt: END`）、締めの画面（`drawIdent(g, t, END)`）と音の目印（`cues: [{ t: END, type: 'jingle' }]`）。ショートにも入れる。本編の字幕と終わりの画面（`drawEnd`）は END までに終える。
  - 絵は元アイコン（`_dev/sns-icon/a-lion-glasses.svg`）と同じ形・色。音は「ぽろろろんっ」（基音 260〜800 Hz、倍音は短く、2.5 kHz より上は切る）。変えるときは全部の動画で同じに。
- **音量をそろえる**（RULES 8.6、2026-10-12〜）: 音は `promo-audio.js`（`makeAudio`）が BGM を -20 LUFS にそろえてから声・目印を足し、ピークだけ下げる（`LOUD`）。録画のログに「音量: 全体 … LUFS」が出る。録画したら・上げる前に `_dev/tools/check-loudness.ps1`。映像はそのままで音だけ作りなおすときは `record-promo.ps1 -Script <台本> [-Short] -AudioOnly`（古い mp4 は `<out>.before-loud.mp4`）。
- BGM はコードで合成した音だけ。作るたびに、権利上問題ないかを確かめてユーザーに伝える。
- **サムネイルを必ず付ける**（RULES 8.7、2026-10-12〜）: 横長は `thumbs/<app>-guide.jpg`、ショートは `thumbs/<app>-short.jpg`（同じ道具で両方できる）（`short-thumbs.js` に1行足して `_dev/tools/make-short-thumbs.ps1 -Apps <app>`）。upload.json の `thumbnail` に書く。あとから付けるのは `youtube-upload.ps1 -Thumb -Meta a.upload.json,b.upload.json`。
- 最初のカットは入口のサムネイル（`assets/thumbs/<app>.jpg`）に近い見た目にする。生き物などの名前を画面に出すと好評。
- 性的な内容・R18 をまぜない（RULES 9章）。出どころは説明文と終わりの画面に書く。
- **公開の前日に、翌日公開の分を最終確認・デバッグする**（RULES 8.4。`youtube-upload.ps1 -Verify`・mp4 のコマ・公開中のアプリ。結果は `upload-log.md` の「公開前の確認」）。
- commit の前に公開前チェック（`_dev/tools/check-public.ps1`）。`out/` は Git に入れない。
- **脱毛のしくみ**（`hair-common.js`、2026-10-27）: アプリの描画ループは使わず、場面の表 `SC` から日 `S.t`・手入れの記録 `S.events`・道具・マウスの位置を決めて `__hare.draw()` を呼ぶ（`performance.now` は動画の時刻に差しかえ）。説明動画は `{ carry: true }` で前の場面の手入れを引きつぐ（1つの肌で続ける）、`reset: true` の場面から新しい肌。アプリに `<head>` がないので `inject.top`。アプリには小さく描かせて拡大（`ZOOM`。ショートは幅 600 より狭いとスマホの絵になる）。説明動画は上の字幕の帯 `TOP` の下に断面を置く（断面の上のはしの札と光の結果の箱が字幕に重ならないように）。数は `hrProbe(t)` で確かめてから字幕に書く。
- **メトロノームがそろうまで**（`mesy-common.js`、2026-10-28）: う2 の台本と同じく、アプリの描画ループは止めて、場面の表 `SEG`（`reset` で新しく始める・`rate` は1秒あたり計算の秒・`pokes` でつつく）から計算の時刻を決めて `SIM.advance`・`__mesy.draw` を呼ぶ。もどるときはつながりのはじめから計算しなおす。カチの音は等倍の場面だけ（`msTicks`）。「そろうまで」は はじめて 0.95 をこえる時刻ではなく、行ったり来たりがおさまってそろったままになる時刻（`msSettle`。2台は 17 秒でいちどそろうが、行きすぎて 35 秒まで ずれが行き来する）。つついたあとは板がすべっていく（指の力が外から入る）ので、説明動画はそのあと始めなおす。
- **いのちの系統樹**（`tol-common.js`、2026-10-29）: アプリは通信（COL・Wikidata・PhyloPic・Commons）を待ちながら動くので、`inject.pre` で `performance.now`・`setTimeout`・`Math.random`（決まった乱数）を差しかえ、`__tolStep(ms)` で動画の時刻だけ進める。出来事の表 `ACT`（押す・`reveal`・3D）のあとは、`fetch` と絵の読みこみの数 `__pend` が 0 になるまで時刻を止めて待つ（通信の遅さは動画に出ない）。もどる時刻（確かめ用のコマのあとの録画）は iframe を開きなおして、はじめから進めなおす。アプリに `<head>` がないので `inject.top`。2D の canvas は透明（紙の色は CSS）なので、下に `tolPaper(w)` を敷く。裏の iframe では ResizeObserver が届かないことがあり、`tolSize` で測りなおす。外の絵は `crossOrigin='anonymous'` で読む（そのままだと canvas が汚れて録画に写せない）。PhyloPic のシルエットは読めるものと読めないもの（はじめの哺乳類の目）がある。詳細の欄は DOM なので、説明動画では右上のカードをこちらで描く（写真は Commons を CORS で読み、作者・条件の行も写す）。
- **細菌にとりつくウイルス**（`phage-common.js`、2026-10-25）: アプリの描画ループは使わず、時刻 u を `KEYS` で決めて `UI.update`・`View.stepCam`・`Scene.draw` をこちらで呼ぶ（カメラはアプリのおまかせ）。とびとびの時刻は 0 秒からカメラだけ進めなおす。ヘッドレスの録画で canvas の変換が dpr 1 にもどり左上の 1/4 にしか描かれないことがあったので、描く前に毎回そろえる。確かめ用のコマ（`__peekSheet`）でも同じずれが出るので、絵は mp4 のコマで見る。
