# YouTube へのアップロードの記録（エラー）

upload-batch.ps1 が書く。1日の区切りは太平洋時間の0時（日本時間16時、冬は17時）。

| 日時（日本） | 動画 | その日に上げた本数（API） | エラー |
|---|---|---|---|
| 2026-10-11 09:15 | god-view-guide | 6 | 失敗: 動画を送れませんでした: The underlying connection was closed: An unexpected error occurred on a send. |
| 2026-10-11 09:16 | god-view-guide | 6 | （上の続き）実は上がっていた → BP7FtZfR2Kg。-Update -Full で仕上げた |
| 2026-10-11 09:23 | wifi-wave-guide | 8 | 失敗: 動画を送れませんでした: The underlying connection was closed: An unexpected error occurred on a send. |
| 2026-10-11 09:23 | wifi-wave-guide | 8 | （上の続き）実は上がっていた → vLXOfsPsrq8。-Update -Full で仕上げた |
| 2026-10-11 09:26 | mold-growth-guide | 10 | 動画は上がった（q9Hv3NKkYm4）が、字幕の一覧を取れませんでした: 403 quota exceeded → 英語の字幕なし。上限が戻ってから -Update |
| 2026-10-11 09:27 | mold-growth-short | 10 | 動画は上がった（FJnDw9MjCL0）が、字幕の一覧を取れませんでした: 403 quota exceeded → 英語の字幕なし。上限が戻ってから -Update |
| 2026-10-12 | pitch-physics-guide | 13 | 上がった（0bWwLctbsZ4）。10/24 20:00 予約・英語の字幕・サムネイル |
| 2026-10-12 | pitch-physics-short | 13 | 上がった（Oucc4xIPViY）。10/24 20:05 予約・英語の字幕・サムネイル |

## わかったこと（2026-10-11、太平洋時間 10/10 の日）
- チャンネルとしては 21本（API 18本＋Studio 3本）上げても、本数の上限（exceeded the number of videos）には当たらなかった。
- API の使用量の上限には 09:26（日本時間）に当たった。Google の表の値で数えて約 22,800 ポイントの時点（videos.insert を表どおり 1600 と数えると上限 10,000 を超えるので、実際の insert はもっと安い）。
- 上限に当たったあとも videos.insert（動画を上げる）は通り、字幕（captions）だけが 403 quota で断られた。だから、上限の近くで上げると字幕のない動画ができる。
- 600MB くらいの大きい動画は、送り終わったところで「The underlying connection was closed」が出ることがある（3回。動画はできていたが、**中身は途中までで処理が止まったまま**だった。2026-10-14 にわかった）。大きい動画は 32MB ずつ送る（Send-Resumable）。上げたら -Verify で「処理」と「長さ」を見る。

## 公開前の確認（RULES 8.4。公開の日に、その日の分）

| 日付 | 動画 | 結果 | 直したこと |
|---|---|---|---|
| 2026-10-11 | evolution-guide（h1r0MqMrNAY） | OK（-Verify・コマ・公開中のアプリ） | なし |
| 2026-10-11 | evolution-short（QWAG8kMWAn8） | **NG**: 31〜38秒（4290万〜15万年前）で地面が白い霧に埋まる | アプリの衝突の冬を直した（evolution v008f）→ 録りなおし（古いのは `evolution-short.before-winter.mp4`）。10/11 17:50 に差しかえ: 新しい cY1n0dAu948 を 20:05 で予約、古い QWAG8kMWAn8 は予約を外した（非公開のまま。消すのはユーザーが Studio で） |
| 2026-10-11 | mold-growth-guide・short（10/22 公開） | 英語の字幕を付けた（上限に当たって付かなかった分）→ -Verify -Date 2026-10-22 で OK | — |
| 2026-10-11 | body-dive-guide・short（10/12 公開） | UI/UX のブラッシュアップ（RULES 8.5）で body-dive v003q-ux。動画には削った「速さ」ボタンと前の右のパネルが映るが、ユーザーの判断で**録りなおさずそのまま出す** | — |
| 2026-10-11（前日） | body-dive-guide（Bb4pSYgpfx4、10/12） | OK（-Verify・コマ・公開中のアプリ） | なし |
| 2026-10-11（前日） | body-dive-short（y-jvQvZPn70、10/12） | 注意: 16〜18秒（胃→幽門）に胃の液面が平たいベージュの板・星形のぎざぎざで映る（アプリの描き方。いまのアプリで録っても同じ） | このまま出す（2026-10-11 ユーザー） |
| 2026-10-12 | 10/13〜10/22 の20本（説明動画・ショート） | OK: mp4 のコマ（説明動画10秒おき・ショート3秒おき）で、白・黒に飛ぶ・絵が消える・字幕のはみ出しなし。ライオン・目印・締めの画面あり。録ったあとに見た目が変わったアプリはない（量子・電波は css/js に分けただけ）→ **録りなおしなし**。音: journey の BGM の8本（46億年・体内ダイブ・いきもの・さなぎ・空気・進化の箱庭・カビ）は約 -35 LUFS で drone の動画（約 -21）より小さい。公開ずみの2本と同じなので不具合ではない | なし |
| 2026-10-12 | 音量そろえ（RULES 8.6） | journey の BGM の14本（46億年・体内ダイブ・いきもの・さなぎ・空気・進化の箱庭・カビ）と ピアノの説明動画を、映像はそのままで音だけ作りなおした（record-promo -AudioOnly。古いのは out/<名前>.before-loud.mp4）。check-loudness: 26本すべて -21.4〜-19.9 LUFS・ピーク -1.5 dBTP 以下で OK | YouTube の差しかえはユーザーの GO 待ち |
| 2026-10-12 | ピアノの2本を撮り直し | アプリから外した曲（運指の出どころが非営利だけ可）を、ショートは ハノン第1番・ニ長調の音階、説明動画は ハ長調の音階（両手）・ハノン第1番・ニ長調の音階に差しかえ。答え合わせの字幕を 95%（559音中533音）に。ショートのハノンの場面はカメラを引いた（両手が2オクターブ離れるため）。check-loudness: 2本とも -20.0 LUFS で OK | まだ YouTube に上げていない |
| 2026-10-12 10:35 | body-dive-guide | ? | 失敗: 動画を送れませんでした: The underlying connection was closed: An unexpected error occurred on a send. |
| 2026-10-12 10:35 | body-dive-guide | ? | （上の続き）実は上がっていた → C6h7u6C5p88。-Update -Full で仕上げた |
| 2026-10-12 10:47 | animal-senses-guide | ? | 失敗: 動画を送れませんでした: The underlying connection was closed: An unexpected error occurred on a send. |
| 2026-10-12 10:47 | animal-senses-guide | ? | （上の続き）実は上がっていた → FHNZ18v8kIQ。-Update -Full で仕上げた |
| 2026-10-12 18:42 | body-dive-guide | ? | 動画は上がった（CXfe6ztaSGU）が、字幕（en）を付けられませんでした: 403 The request cannot be completed because you have exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>. → 上限が戻ってから youtube-upload.ps1 -Update |
| 2026-10-13 07:50（当日） | black-hole-guide・short（QrKfvjFg1ts・yCJesqekVlI、10/13） | OK: -Verify（ショートは全部 OK、説明動画は予約 20:00・サムネイルまで OK、字幕の一覧だけ API の上限で読めず）・コマ（10秒・3秒おき）・音量 -20.8／-21.1 LUFS・公開中のアプリ（smoke ja/en OK、クリックで光の道すじ） | なし。説明動画の字幕は上限が戻る 16:00 以降に -Verify -Date 2026-10-13 で見る |
| 2026-10-13 07:50（前日） | animal-senses-guide・short（zUkmU8Q_4B8・KK_UQhoEloo、10/14） | OK: コマ（10秒・3秒おき）・音量 -20.0／-20.1 LUFS（音をそろえた版に差しかえずみ）・公開中のアプリ（smoke ja/en OK、カラスに切りかえ、コンソールのエラーなし）。録ったあとのアプリの変更は three.js を lib/ に置いただけ。-Verify は API の上限で読めず | なし。16:00 以降に -Verify -Date 2026-10-14 |
| 2026-10-13 16:26 | black-hole-guide（QrKfvjFg1ts） 字幕 | OK: -Verify -Date 2026-10-13（字幕 en あり・予約 10/13 20:00・サムネイル・長さ 2:36）。ショート（yCJesqekVlI）も OK | なし |
| 2026-10-13 16:26 | animal-senses-guide（zUkmU8Q_4B8） | OK: -Verify -Date 2026-10-14（予約 10/14 20:00・字幕 en・サムネイル・長さ 2:36） | なし |
| 2026-10-13 16:26 | animal-senses-short（KK_UQhoEloo） | OK: -Verify -Date 2026-10-14（予約 10/14 20:05・字幕 en・サムネイル・長さ 0:46） | なし |
| 2026-10-14 | 処理が止まった動画（ユーザーがチャンネルの一覧でぐるぐるに気づいた） | -Verify で全26本＋古い ID を調べた。immune-battle-guide（CmcYXIB0BzU）・god-view-guide（BP7FtZfR2Kg）・wifi-wave-guide（vLXOfsPsrq8）と、上げ直す前の古い body-dive-guide（C6h7u6C5p88）・animal-senses-guide（FHNZ18v8kIQ）が、長さ 0・uploaded／processing のまま2〜3日止まっていた。「接続が切れたが実は上がっていた」分は中身が途中までしか届いていなかった | GO をもらって3本を上げ直した（32MB ずつ送る今の Send-Resumable）→ xIVVbiMCsL0（10/17）・T_RpJJJP86w（10/20）・OF5BIJJbPPU（10/21）。予約・字幕 en・サムネイルとも -Verify OK。upload.json・POSTS.md の ID を書きかえた。壊れた3本は -Schedule で予約を外せなかった（処理が終わっていない動画は status を変えられないらしい）→ **5本ともユーザーが Studio で消す**（10/17 までに） |
| 2026-10-15（当日） | quantum-guide・short（S3gdGhRhGy4・rusEmkMXU_4、10/15） | OK: -Verify（予約 20:00／20:05・字幕 en・サムネイル・長さ 2:36／0:46）・音量 -20.9／-20.0 LUFS・公開中のアプリ（smoke quantum・_root の ja/en OK）。10/13 以降アプリに変更なし | なし |
| 2026-10-16 08:21 | animal-senses-short・guide（KK_UQhoEloo・zUkmU8Q_4B8） | 失敗: -Thumb で「ハエの目」のサムネイル（709d5c9）に差しかえようとしたが、API の上限（403 quota。10/15 の字幕4言語で使い切り） | **16:00 以降に** `youtube-upload.ps1 -Thumb -Meta _dev/promo/animal-senses-short.upload.json,_dev/promo/animal-senses-guide.upload.json`（GO はもらいずみ）→ -Verify |
