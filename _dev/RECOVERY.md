# PC が壊れたとき（戻し方）

アプリ・道具・台本・文書は **Git（GitHub の `sishiya/manabi-lab`）** に全部ある。PC にしかないものと、その戻し方をここにまとめる。
最終更新: 2026-10-12

## ふだんの予防線
- **こまめに push する**（push していないコミットは PC にしかない）。push はユーザーが行う（RULES 10章）。
- **いまの方針（2026-10-12 ユーザー）: PC が壊れたら、Git から作りなおして乗りきる。** Git に入っていないもののバックアップは保留（写し先を決めていないので、`backup-local.ps1` は健康診断のあとも何もしない）。下の表の「なくなったら」の手順で作りなおす。
  - 保留の理由: 写すものにプライベートな情報（自分の語・メモリ）がふくまれ、Google ドライブ パソコン版を入れるとドライブ全体がこの PC の Claude から読めるようになるため。再開するなら、公開鍵で暗号化して（秘密鍵は PC の外だけ）手で上げる案（`_dev/TODO.md`）。
  - `_dev/tools/backup-local.ps1` は残してある（`-Dest` で写し先を決めると、Git に入っていないもの＋git bundle を写す。秘密は `-IncludeSecrets` のときだけ。Git のフォルダの中には写さない。いまは暗号化しない）。

## PC にしかないもの

| もの | 場所 | 写す？（保留中） | なくなったら |
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
4. 健康診断の登録: `health.ps1 -Register`。（バックアップを再開していれば、写し先も `backup-local.ps1 -Dest "<写し先>"` で覚えさせる）
5. YouTube を使うなら秘密を戻す（または上の表の手順で作りなおす）。`start.bat` でまなびラボが開くか、`smoke.ps1` が通るかを見る。
