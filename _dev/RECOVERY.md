# PC が壊れたとき（戻し方）

アプリ・道具・台本・文書は **Git（GitHub の `sishiya/manabi-lab`）** に全部ある。PC にしかないものと、その戻し方をここにまとめる。
最終更新: 2026-10-12

## ふだんの予防線
- **こまめに push する**（push していないコミットは PC にしかない）。push はユーザーが行う（RULES 10章）。
- **`_dev/tools/backup-local.ps1`** が、Git に入っていないもの（下の表の「写す」）と Git の全部の記録（`git bundle`。push していないコミットも入る）を、リポジトリの外の写し先へ写す。写し先を一度決めれば、週1回の健康診断（`health.ps1`）のあとに自動で写す。
  - 写し先は **Git のフォルダの外**（中なら止まる）。OneDrive・外付けのディスクなど、PC とは別のところ。
  - YouTube の秘密は、`-IncludeSecrets` をつけたときだけ写す（中身は読まず・表示しない）。写すなら、自分だけが読める・暗号化されたところに。写さなくても、下の手順で作りなおせる。

## PC にしかないもの

| もの | 場所 | 写す？ | なくなったら |
|---|---|---|---|
| 紹介動画の mp4・字幕（srt）・サムネイル（jpg） | `_dev/promo/out/` | 写さない（9GB） | Git の台本から作りなおせる: `record-promo.ps1`（mp4・srt。BGM はコードで合成）、`make-short-thumbs.ps1`・`make-thumbs.ps1`（サムネイル）。上げたものは YouTube にある。手順は `_dev/promo/README.md` |
| Claude のメモリ | `~/.claude/projects/<このフォルダ>/memory/` | 写す | 写しから戻す。なくても、大事なことは RULES・各 DEVNOTES にある（RULES 10章） |
| 自分の語（公開前チェック用） | `.private-words.txt` | 写す | 写しから戻すか、作りなおす（RULES 7章） |
| 道具の設定 | `_dev/tools/*.local.txt`（YouTube の秘密の場所・GA のプロパティ ID・バックアップの写し先） | 写す | 写しから戻す。GA のプロパティ ID は GA の管理画面で見られる |
| 道具の記録 | `_dev/tools/out/`（YouTube の数の履歴・quota・健康診断） | 写す | なくても困らない（週のふり返りの「増えた数」が1回分出ないだけ） |
| Claude の手元の設定 | `.claude/settings.local.json` | 写す（あれば） | なくても動く |
| YouTube の秘密（OAuth のクライアントとトークン） | `youtube-upload.local.txt` が指すフォルダ | `-IncludeSecrets` のときだけ | Google Cloud Console で OAuth クライアント（デスクトップ）の JSON を取りなおして同じフォルダに置き、`youtube-upload.ps1 -Auth`（チャンネル「しし屋」を選ぶ）。GA も読むなら `-Ga -Auth` |
| 古いメモ | `PUBLISH.local.md`（以前の Artifact の URL） | 写す | 要らない（Artifact は使わない） |

## 新しい PC で戻す順
1. Git・GitHub Desktop・Claude デスクトップ・Node.js・Google Chrome（smoke・録画・サムネイル）・ffmpeg（録画・音量）を入れる。Perl は Git for Windows についてくる（`.claude/hooks/guard.pl` が使う）。
2. GitHub からクローン（GitHub がだめなら写しの `git clone manabi-lab.bundle manabi-lab`）→ RULES 10章の設定（`core.hooksPath .githooks`・`core.quotepath false`・作者の名前とアドレス）。
3. 写しの `repo/` の中身を、リポジトリの同じ場所に戻す。`claude-memory/` を `~/.claude/projects/<このフォルダ>/memory/` に戻す（フォルダ名はパスの記号を `-` にしたもの）。
4. 写した写し先をもう一度覚えさせる: `backup-local.ps1 -Dest "<写し先>"`。健康診断の登録: `health.ps1 -Register`。
5. YouTube を使うなら秘密を戻す（または上の表の手順で作りなおす）。`start.bat` でまなびラボが開くか、`smoke.ps1` が通るかを見る。
