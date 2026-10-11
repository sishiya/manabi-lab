# やりのこし（アプリ以外の作業）

アプリの中の「次にやること」は各 `<app>/DEVNOTES.md`。ここは道具・紹介動画・公開まわりの残り。終わったら消す（消した行は Git の記録に残る）。
最終更新: 2026-10-11

## 紹介動画（YouTube）
- [ ] **毎日の公開前の最終確認**（RULES 8.4、前日に）: 10/12〜10/22 の各日の2本を前の日に `youtube-upload.ps1 -Verify`・mp4 のコマ・公開中のアプリで。10/11 分はすみ（upload-log.md）。
  10/11 に -Verify で全日をざっと見たところ、10/12〜14 は OK、10/22 のカビ2本の英語の字幕も 10/11 に付けた。24本の予約日時は -List で表どおり。
- [ ] 古い46億年のショート QWAG8kMWAn8（予約を外した・非公開）を Studio で消す（ユーザーが消す、10/11）。
  ほかの日の動画にも、衝突（6600万年前）を早送りでまたぐ場面がないか（46億年の説明動画は止まって見せるので OK だった）。
- [ ] 入口のカードの「▶ 使い方の動画」は、**説明動画が公開されてから**足す（2026-10-11 ユーザー）。セッションのはじめのフックと週のふり返りが
  `_dev/tools/check-video-links.ps1` でつけ忘れを知らせる → `-Fix` → 公開前チェック → commit → ユーザーが push。公開: 10/11〜10/22 の毎日 20:00。
- [ ] ショートを X に出すか（`x-post.ps1`、投稿はユーザー）。まだ決めていない。
- [ ] 1日に上げられる本数の本当の上限はまだ不明（10/11 は 21本でも当たらなかった）。記録は `_dev/promo/upload-log.md`・`_dev/tools/out/yt-quota.csv`（`-Quota`）。
- [ ] 古い mp4 `_dev/promo/out/body-dive-guide.before-lion.mp4`・`evolution-guide.before-rerec.mp4` は、上げた動画を確かめたら消してよい（Git に入らない）。

## 週のふり返り（weekly-report.ps1）— ユーザーの準備待ち
- [ ] YouTube の視聴時間・どこから来たか: `youtube-upload.ps1 -Auth` のやり直し（チャンネル「しし屋」を選ぶ。分析を読む許可が足される）。
- [ ] サイトのアクセス（GA4）: Google Cloud で「YouTube Analytics API」「Google Analytics Data API」を有効に → GA のプロパティ ID（数字）を
  `_dev/tools/analytics.local.txt` に1行 → `youtube-upload.ps1 -Ga -Auth`（GA を持っているアカウント）。
- [ ] 準備ができたら `weekly-report.ps1` を通して中身を確かめる。

## 道具・そのほか
- [ ] ルートの `README.md` の道具の欄に、新しい道具（smoke・new-app・make-upload・record-promo・schedule-videos・upload-batch・weekly-report・check-video-links）の1行。
  並行セッションのコミット前の変更が README にあるので、そちらのコミットのあとで（道具の一覧は `_dev/tools/README.md`）。
- [ ] 8765番のローカルサーバーは古い `serve.ps1` のまま（字幕・コマの保存が 404）。起動しなおすか、道具は `-Port 8767` などで。
- [ ] スモークテストで mood-world が NG（作りかけ。並行セッション）。できたら `smoke.ps1 -Apps mood-world`。
- [ ] スモークテストの注意: god-view の英語の画面に「3D都市モデル（Project PLATEAU）国土交通省」が日本語のまま（出典の表記。英語にするか決める）。
