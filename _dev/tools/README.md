# 道具（_dev/tools）

アプリ以外の作業を自動にする PowerShell のスクリプト。どれもリポジトリのルートで
`powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/<名前>.ps1 …` で動かす。
くわしい使い方は各スクリプトの頭に書いてある。全体の流れの図は `_dev/WORKFLOW.md`。

| スクリプト | すること | いつ |
|---|---|---|
| `check-public.ps1` | 公開前チェック（個人情報・秘密・画像の撮影情報）。pre-commit フックも同じものを走らせる | commit・公開の前に毎回（RULES 7章） |
| `smoke.ps1` | 全アプリの動作確認。ヘッドレスの Chrome で `thumb.html` の準備まで動かし、例外・読み込みの失敗・許可していない外への通信・ローカルの GA・英語に残った日本語を調べる。`-Base https://sishiya.github.io/manabi-lab` で公開版も | 変更のあと（各 DEVNOTES の「確認のしかた」と合わせて）、push のあと |
| `new-app.ps1` | 新しいアプリの雛形（PLAN・DEVNOTES・index.html・css/js・launcher・versions/v001-start）と、保管庫のカード・thumb.html の SETUP・make-thumbs の一覧・CLAUDE.md・README の表への追加 | 新しいアプリを始めるとき（PLAN.md の相談のあと） |
| `make-thumbs.ps1` | 入口・保管庫のサムネイル `assets/thumbs/<app>.jpg` を撮る | 画面が大きく変わったとき |
| `make-upload.ps1` | 紹介動画の `upload.json` の下書き（入口の APPS とアプリの出どころから）。`-Check` で全部の upload.json が決まり（説明欄の形・チャプター・字数・< >・予約の時刻）に合っているか調べる | 動画を作ったとき・上げる前 |
| `record-promo.ps1` | 台本ページを開いて、確かめ用のコマ → 録画 → できた mp4 のコマを1枚に、まで一度に | 台本を書いたあと |
| `schedule-videos.ps1` | `_dev/promo/SCHEDULE.md` の順に予約日時（publishAt）を割りふる。`-Apply` で upload.json と SCHEDULE.md、`-Entrance` で入口の `video`、`-Upload` で YouTube の予約まで | 公開を始める日が決まったとき（`-Upload` はユーザーの GO のあと） |
| `youtube-upload.ps1` | YouTube へ上げる・英語・字幕・予約・一覧・`-Stats`（数を読むだけ） | ユーザーの GO のあと（`-Stats`・`-List` は読むだけ） |
| `x-post.ps1` | X の投稿の下ごしらえ（投稿ボタンはユーザー） | ショートを出すとき |
| `weekly-report.ps1` | 週のふり返り（Git で作ったもの・動作確認・動画の数・視聴時間と流入元・サイトのアクセス）→ `out/weekly-<日付>.md` | 週に1回 |
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
