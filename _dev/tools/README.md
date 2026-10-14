# 道具（_dev/tools）

アプリ以外の作業を自動にする PowerShell のスクリプト。どれもリポジトリのルートで
`powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/<名前>.ps1 …` で動かす。
くわしい使い方は各スクリプトの頭に書いてある。全体の流れの図は `_dev/WORKFLOW.md`。

| スクリプト | すること | いつ |
|---|---|---|
| `check-public.ps1` | 公開前チェック（個人情報・秘密・画像の撮影情報）。pre-commit フックも同じものを走らせる | commit・公開の前に毎回（RULES 7章） |
| `check-content.ps1` | 内容のチェック（画面の必須・外のサイト・医療の言い切り・商標・素材のライセンス・危ないこと・AI の書き方・Zenn と DEV の記事）。止めずに候補を出す。語は `content-words.txt` | 公開・push・記事や SNS を出す前に毎回（RULES 7章 2b・7.1） |
| `smoke.ps1` | 全アプリの動作確認。ヘッドレスの Chrome で `thumb.html` の準備まで動かし、例外・読み込みの失敗・許可していない外への通信・ローカルの GA・英語に残った日本語を調べる。`-Base https://sishiya.github.io/manabi-lab` で公開版も | 変更のあと（各 DEVNOTES の「確認のしかた」と合わせて）、push のあと |
| `new-app.ps1` | 新しいアプリの雛形（PLAN・DEVNOTES・index.html・css/js・launcher・versions/v001-start）と、保管庫のカード・thumb.html の SETUP・make-thumbs の一覧・CLAUDE.md・README の表への追加 | 新しいアプリを始めるとき（PLAN.md の相談のあと） |
| `make-thumbs.ps1` | 入口・保管庫のサムネイル `assets/thumbs/<app>.jpg` を撮る | 画面が大きく変わったとき |
| `make-short-thumbs.ps1` | 紹介動画のサムネイル `_dev/promo/thumbs/<app>-short.jpg`（縦 1080×1920）と `<app>-guide.jpg`（横長の説明動画 1280×720）を mp4 のコマから作る。中身は `_dev/promo/short-thumbs.js`、デザインは `short-thumb.html`（ヘッドレスの Chrome で撮る）。付けるのは `youtube-upload.ps1 -Thumb` | ショートを録ったとき（RULES 8.7） |
| `make-upload.ps1` | 紹介動画の `upload.json` の下書き（入口の APPS とアプリの出どころから）。`-Check` で全部の upload.json が決まり（説明欄の形・チャプター・字数・< >・予約の時刻）に合っているか調べる | 動画を作ったとき・上げる前 |
| `record-promo.ps1` | 台本ページを開いて、確かめ用のコマ → 録画 → できた mp4 のコマを1枚に、まで一度に | 台本を書いたあと。`-AudioOnly` で映像はそのまま音だけ作りなおす |
| `replace-videos.ps1` | 予約ずみの動画を作りなおした mp4 に差しかえる（上げて同じ日時で予約 → 古い方の予約を外す。`-Prepare` で upload.json の videoId → oldVideoIds） | 動画を直したとき（ユーザーの GO のあと） |
| `check-loudness.ps1` | 紹介動画の mp4 の音量（LUFS・トゥルーピーク）を測って、範囲外を NG に（読むだけ） | 録画したら・上げる前に・公開前の確認で毎回（RULES 8.6） |
| `schedule-videos.ps1` | `_dev/promo/SCHEDULE.md` の順に予約日時（publishAt）を割りふる。`-Apply` で upload.json と SCHEDULE.md、`-Entrance` で入口の `video`、`-Upload` で YouTube の予約まで | 公開を始める日が決まったとき（`-Upload` はユーザーの GO のあと） |
| `youtube-upload.ps1` | YouTube へ上げる・英語・字幕・予約・一覧・`-Stats`（数を読むだけ） | ユーザーの GO のあと（`-Stats`・`-List` は読むだけ） |
| `x-post.ps1` | X の投稿の下ごしらえ（投稿ボタンはユーザー） | ショートを出すとき |
| `weekly-report.ps1` | 週のふり返り（Git で作ったもの・動作確認・動画の数・視聴時間と流入元・サイトのアクセス）→ `out/weekly-<日付>.md` | 週に1回 |
| `health.ps1` | 健康診断: 一時的なローカルのサーバーで smoke（全アプリ）＋ `check-links.mjs`（外へのリンク切れ）→ `out/health-last.md`。終わったら `backup-local.ps1` も。`-Register` で毎週日曜 10:00 に Windows のタスクスケジューラが回す（Claude を使わない＝トークンなし）。問題があったときだけセッションのはじめのフック（`-Hook`）が数行で知らせる | 自動（週1）。手でも |
| `check-links.mjs` | アプリの html・js の https:// のリンク（出どころなど）を調べる。NG は 404・410・ドメインが無いだけ（403 などは「注意」）→ `out/links-last.json` | health.ps1 から |
| `upkeep.mjs`（`node _dev/tools/upkeep.mjs`） | 片づけの点検（トークンなし）: Claude のセッションの記録から、この7日のトークンの多い順・文脈が 300k をこえたもの・同じ大きいファイル（30KB〜）を5回以上読んだもの・7日さわっていないもの／アプリごとの versions の数（10 本より多い）とランチャーから行けない版／800行か60KB をこえるファイル（versions・lib・HISTORY.md をのぞく）／毎回読まれる文書（CLAUDE.md・MEMORY.md・RULES.md）の大きさ → `out/upkeep-last.md`。注意があればフックが1行で知らせる。日曜 10:30 ごろに Claude の定期タスク「まなびラボの片づけ」が、7日さわっていないセッションをアーカイブし（削除はしない）、この結果を短く報告する（直すのは提案だけ） | health.ps1 から（週1）。手でも |
| `backup-local.ps1` | Git に入っていないもの（Claude のメモリ・*.local.*・.private-words.txt・out/）と git bundle を、リポジトリの外の写し先へ。秘密は `-IncludeSecrets` のときだけ（読まず・表示せず）。Git のフォルダの中には写さない。戻し方は `_dev/RECOVERY.md` | 写し先を決めたら health.ps1 のあと自動 |
| `seo.mjs`（`node _dev/tools/seo.mjs [--check]`） | 入口の `APPS` から、入口と入口のアプリの head の検索・リンクカード（説明文・OGP・hreflang）と `sitemap.xml`・`feed.xml`・`feed-en.xml`（RSS／Atom）を作りなおす（`_dev/REACH.md`） | `APPS` を書きかえたとき（RULES 8.1） |
| `rep.pl` | 文字列の置きかえ（I18N.md） | 英語対応 |
| `start.ps1` | ローカルでまなびラボを開く（`start.bat` から） | ユーザーが開くとき |
| `cdp.ps1` | Chrome を DevTools プロトコルで動かす共通の部品（smoke・record-promo が読みこむ） | — |

- 結果のファイルは `_dev/tools/out/`（Git に入れない。動画の数などは公開しない）。
- 数を読む許可（どれも読むだけ）: YouTube の視聴時間・流入元は `youtube-upload.ps1 -Auth`（yt-analytics.readonly を含む）。サイトのアクセスは GA4 のプロパティ ID（数字。GA の 管理 → プロパティの詳細）を `_dev/tools/analytics.local.txt`（Git に入れない）に1行書き、`youtube-upload.ps1 -Ga -Auth`（GA を持っている Google アカウントで。トークンは秘密のフォルダの `ga-token.dat` に暗号化）。Google Cloud のプロジェクトで「YouTube Analytics API」と「Google Analytics Data API」を有効にしておく。
- 日本語を書くスクリプト（.ps1）は **UTF-8 の BOM つき**で保存する（PowerShell 5.1 は BOM がないと日本語を化けさせる）。`start.ps1` だけは英語（ASCII）だけ。
- Bash ツールのコマンドの中で `\\` や `\s` を書くと `\` が消える。正規表現を含む書きかえは Edit ツールで（RULES 6章）。

## Claude Code の守り（`.claude/settings.json`・`.claude/hooks/guard.pl`）
- `git push` は止める。ユーザーがチャットで push を指示したときだけ、Claude はコマンドの先頭に `MANABI_PUSH_OK=1` をつけて push する（フックはそれだけ通す。2026-10-11〜。RULES 10章）。force push（`--force`・`-f`・`+ブランチ`）はいつも止める。
- YouTube の秘密のフォルダ・ファイル（`client_secret`・`youtube-token`、`youtube-upload.local.txt` に書いたフォルダ）を名指しするツールの呼び出しを止める。フォルダの場所はリポジトリに書かず、フックが実行のたびに `youtube-upload.local.txt` から読む。スクリプト（`youtube-upload.ps1`）が中で読むのは止めない。
- フックは Git の Bash の `perl` で動く（JSON::PP）。
