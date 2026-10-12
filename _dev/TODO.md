# やりのこし（アプリ以外の作業）

アプリの中の「次にやること」は各 `<app>/DEVNOTES.md`。ここは道具・紹介動画・公開まわりの残り。終わったら消す（消した行は Git の記録に残る）。
最終更新: 2026-10-12

## 紹介動画（YouTube）
- [x] **音量をそろえた動画への差しかえ（2026-10-12）**: さなぎ・空気の流れ・進化の箱庭・カビ・いきものの説明動画とショートを差しかえた。
  体内ダイブの説明動画は、最初に上げた C6h7u6C5p88 が処理で止まったので、18:41 に上げなおした CXfe6ztaSGU を 10/12 20:00 に予約（古い Bb4pSYgpfx4 の予約は外した）。46億年は公開ずみなので差しかえない。
  - [ ] **CXfe6ztaSGU（体内ダイブの説明動画）に英語の字幕がない**（上げたとき API の1日の上限に当たった）。10/13 の16時（日本時間）すぎに
    `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Update -Meta _dev/promo/body-dive-guide.upload.json` で付ける。
  - 処理で止まった2本は「接続が切れた」が出た 550〜600MB の動画（1回の PUT で送っていた）。youtube-upload.ps1 を 32MB ずつ送り、切れたら続きから送る形に直した（10/12）。
  - [ ] 新しく上げた9本（-List の 10/14〜10/22）の処理が終わったかを、各日の前日確認（-Verify）で見る。
  - [ ] 差しかえた古い動画・止まった動画を Studio で消す（ユーザー）: C6h7u6C5p88・FHNZ18v8kIQ（処理で止まった）、y-jvQvZPn70・fTvY3UHVNYg・h8TCh3ey6xs・_SpVbv1EVAM・9yB61JTpk6Q・UojA-4KWDxY・BUNj9IxFrP8・kscSWupNRdI・oCRqEFwwQVQ・q9Hv3NKkYm4・FJnDw9MjCL0（古い版。予約は外してある）。Bb4pSYgpfx4（体内ダイブの古い説明動画。予約は外した）も消してよい。
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
- [ ] **（保留・2026-10-12 ユーザー）Git に入っていないもののバックアップ**: いまは「PC が壊れたら Git から作りなおす」。再開するなら案: gpg の公開鍵で暗号化して（秘密鍵は PC の外だけ＝Claude も開けない）、Google ドライブにはブラウザで手で上げる（パソコン版は入れない＝ドライブ全体が Claude から読めるようになるため）。`backup-local.ps1` を暗号化に対応させ、写し先をフックの禁止リストに。`_dev/RECOVERY.md`
- [ ] **録画を速くする**（2026-10-10 に調べただけ、未着手）: ① ペインや後ろのタブで録ると `promo.js` の `sleep()`（setTimeout）が間引かれて遅い → 待ちを `dequeue` イベント・`MessageChannel` に ② BGM を全部合成してから映像を始めている（長さの2乗に近く増え、〜1分）→ 並行に ③ 書き出し器に `prefer-hardware`（RTX 5070 の NVENC）④ god-view は地図の読みこみ待ちがほとんど → 先に温める。まず `?bench=300` のような計測モードで、1コマの内訳を測ってから。直したら同じ秒のコマを前とくらべる。
- [ ] `record-promo.ps1` はプロフィール名 `manabi-record`・ポート 9336 が固定で、終わるときにその名前の Chrome をまとめて止める → **2本を同時に録ると、先に終わった方がもう1本を止める**。台本ごとに分ける。
- [ ] 文書を軽くする（2026-10-12 の提案。RULES.md・PLAN-9apps.md・god-view の DEVNOTES はすんだ。残り: `piano-hand/js/hand.js` を役割ごとに分ける（別セッションが piano-hand を作業中だったので見送り））。`IDEAS.md`（30KB）の作ったテーマは1行にして細かい案は各 `PLAN.md` へ。道具の出力は「NG と注意だけ＋最後の1行」にそろえる（smoke はすみ）。
- [ ] ルートの `README.md` の道具の欄に、新しい道具（smoke・new-app・make-upload・record-promo・schedule-videos・upload-batch・weekly-report・check-video-links）の1行。
  並行セッションのコミット前の変更が README にあるので、そちらのコミットのあとで（道具の一覧は `_dev/tools/README.md`）。
- [ ] 8765番のローカルサーバーは古い `serve.ps1` のまま（字幕・コマの保存が 404）。起動しなおすか、道具は `-Port 8767` などで。
- [ ] スモークテストで mood-world が NG（作りかけ。並行セッション）。できたら `smoke.ps1 -Apps mood-world`。
- [ ] スモークテストの注意: god-view の英語の画面に「3D都市モデル（Project PLATEAU）国土交通省」が日本語のまま（出典の表記。英語にするか決める）。
