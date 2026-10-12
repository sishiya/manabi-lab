# やりのこし（アプリ以外の作業）

アプリの中の「次にやること」は各 `<app>/DEVNOTES.md`。ここは道具・紹介動画・公開まわりの残り。終わったら消す（消した行は Git の記録に残る）。
最終更新: 2026-10-12

## 紹介動画（YouTube）
- [ ] **音量をそろえた動画への差しかえ（2026-10-12〜。残り8本）**: 音を作りなおした mp4（`out/` の `<名前>.mp4`。古いのは `.before-loud.mp4`）を上げて同じ日時で予約し、古い方の予約を外す。
  - すみ（10/12）: 体内ダイブ 2本（新 C6h7u6C5p88・zxDr4OZsspU）、いきもの 2本（新 FHNZ18v8kIQ・KK_UQhoEloo）。古い4本は予約を外した。
  - **まだ（API の1日の上限のため）**: さなぎ（10/16）・空気の流れ（10/18）・進化の箱庭（10/19）・カビ（10/22）の説明動画とショート。upload.json は準備ずみ（`oldVideoIds`）。
    続きは1行（GO はもらってある）: `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/replace-videos.ps1 -Apps metamorphosis,air-flow,ga-creatures,mold-growth`
    → 上限で止まったら日本時間16時すぎに同じコマンド。**さなぎ（10/16）は 10/15 の前日確認までに**。上がらなかった動画は古い方（音が小さい版）がそのまま公開される。
  - 46億年の2本は公開ずみなので差しかえない（2026-10-12 ユーザー）。
  - [ ] 差しかえた古い動画を Studio で消す（ユーザー）: Bb4pSYgpfx4・y-jvQvZPn70・fTvY3UHVNYg・h8TCh3ey6xs（＋残り8本の古い ID は各 upload.json の `oldVideoIds`）。
- [ ] **ピアノの台本が外した曲を使っている**（2026-10-12）: `piano-hand.html` の ode・chords2、`piano-hand-guide.html` の ode・twinkle・arp は、運指の出どころ（Baylor、非営利のみ）を理由にアプリから外した曲。撮り直すときは残っている曲（エリーゼ・音階・ハノン・ショパン風・超絶技巧の練習曲）に差しかえる。公開済みの動画はそのままでよい（推定の運指で撮ったもの）。
- [ ] **毎日の公開前の最終確認**（RULES 8.4、前日に）: 10/12〜10/22 の各日の2本を前の日に `youtube-upload.ps1 -Verify`・mp4 のコマ・公開中のアプリで。10/11 分はすみ（upload-log.md）。
  10/11 に -Verify で全日をざっと見たところ、10/12〜14 は OK、10/22 のカビ2本の英語の字幕も 10/11 に付けた。24本の予約日時は -List で表どおり。
- [ ] 古い46億年のショート QWAG8kMWAn8（予約を外した・非公開）を Studio で消す（ユーザーが消す、10/11）。
  ほかの日の動画のコマは 10/12 に全部見た（崩れなし。upload-log.md）。各日の -Verify と公開中のアプリは前の日に。
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
- [ ] **リンク切れ**（2026-10-12 の健康診断）: god-view の出どころ `https://www.earthdata.nasa.gov/data/tools/gibs` が 404。NASA GIBS の今のページを探して直す。
- [ ] **バックアップの写し先を決める**（ユーザー）: OneDrive・外付けなど。決まったら `backup-local.ps1 -Dest "<写し先>"` を1回（以後は健康診断のあと自動）。YouTube の秘密もふくめるか（`-IncludeSecrets`）も。`_dev/RECOVERY.md`
- [ ] **録画を速くする**（2026-10-10 に調べただけ、未着手）: ① ペインや後ろのタブで録ると `promo.js` の `sleep()`（setTimeout）が間引かれて遅い → 待ちを `dequeue` イベント・`MessageChannel` に ② BGM を全部合成してから映像を始めている（長さの2乗に近く増え、〜1分）→ 並行に ③ 書き出し器に `prefer-hardware`（RTX 5070 の NVENC）④ god-view は地図の読みこみ待ちがほとんど → 先に温める。まず `?bench=300` のような計測モードで、1コマの内訳を測ってから。直したら同じ秒のコマを前とくらべる。
- [ ] `record-promo.ps1` はプロフィール名 `manabi-record`・ポート 9336 が固定で、終わるときにその名前の Chrome をまとめて止める → **2本を同時に録ると、先に終わった方がもう1本を止める**。台本ごとに分ける。
- [ ] 文書を軽くする（2026-10-12 の提案、未着手）: `_dev/promo/PLAN-9apps.md`（69KB）は引き継ぎの部分だけ残して台本の下書きを別ファイルへ。`IDEAS.md`（30KB）の作ったテーマは1行にして細かい案は各 `PLAN.md` へ。道具の出力は「NG と注意だけ＋最後の1行」にそろえる（smoke はすみ）。
- [ ] ルートの `README.md` の道具の欄に、新しい道具（smoke・new-app・make-upload・record-promo・schedule-videos・upload-batch・weekly-report・check-video-links）の1行。
  並行セッションのコミット前の変更が README にあるので、そちらのコミットのあとで（道具の一覧は `_dev/tools/README.md`）。
- [ ] 8765番のローカルサーバーは古い `serve.ps1` のまま（字幕・コマの保存が 404）。起動しなおすか、道具は `-Port 8767` などで。
- [ ] スモークテストで mood-world が NG（作りかけ。並行セッション）。できたら `smoke.ps1 -Apps mood-world`。
- [ ] スモークテストの注意: god-view の英語の画面に「3D都市モデル（Project PLATEAU）国土交通省」が日本語のまま（出典の表記。英語にするか決める）。
