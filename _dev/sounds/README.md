# しし屋サウンドライブラリ（2026-10-19〜）

紹介動画・まなびラボ・あそびラボ・作業用に使う BGM／ジングル／効果音／環境音。
**Stable Audio 3 medium をこの PC の中で動かして作る**（Audio Studio MCP。クラウドなし・1回ごとの料金なし）。

## 置き場所
| もの | 場所 | Git |
|---|---|---|
| カタログ（文・種・長さ・用途） | `_dev/sounds/catalog.json` | 入れる |
| 作る道具・試聴ページのひな形 | `_dev/sounds/build.py`・`listen.template.html` | 入れる |
| 音のファイル | `..\sound-library\`（アプリ開発 のとなり。`bgm/ work/ jingle/ sfx/ ambience/`・`masters/`） | **入れない**（カタログから作り直せる） |
| 試聴ページ | `sound-library\listen.html`（ブラウザで開く。種類・用途で絞れる） | 入れない |
| 道具本体 | `%USERPROFILE%\tools\audio-studio-mcp`（torch は RTX 50 向けに cu128 へ変えてある。Python は `%USERPROFILE%\tools\uv-python`） | 入れない |

## 作る・足す
```
& $env:USERPROFILE\tools\audio-studio-mcp\.venv\Scripts\python.exe _dev\sounds\build.py
```
- もうある音はとばす。`catalog.json` に1件足して流せば、その分だけ作る。`--only id,id`・`--force`（作り直し）・`--index-only`（一覧だけ）。
- 種（seed）は `id` から決まる（`seed` を書けばそれ）。同じ文・種・設定なら同じ音になる。
- RTX 5070 で 3分の曲が約8秒、効果音は1秒ほど。最初だけモデルの読み込みに約40秒。
- 新しいセッションの Claude からは MCP の `audio-studio`（`generate_audio`・`edit_audio`・`process_audio`）でも作れる。気に入ったらカタログに書き写す。

## そろえ方
| 種類 | 長さ | 音量 | ほか |
|---|---|---|---|
| bgm | 90秒 ×2候補 | -20 LUFS | ループ（つなぎ 300ms） |
| work（作業用） | 180秒 | -20 LUFS | ループ（400ms） |
| jingle | 3〜6秒 ×2 | -18 LUFS | 終わりを 300ms フェード |
| sfx | 1〜5秒 ×2 | ピーク -3 dBFS | 前後の無音を切る・モノラル（足音・心音などはステレオ） |
| ambience | 30秒 | -24 LUFS | ループ（1500ms） |

-20 LUFS は紹介動画の範囲（RULES 8.6：-21.5〜-18.5）のまんなか。動画に入れたら、いつもどおり `check-loudness.ps1` で測る。
OGG は ffmpeg（libvorbis q6）で作る。道具の OGG 書き出しは、長いノイズ系の音で Windows だと落ちるため。

## ライセンスと使い方のきまり
- モデルは **Stability AI Community License**。作った音は使った人のもの。商用も可（年の売上 100万ドル未満の間）。作った音に「Powered by Stability AI」の表示義務はない（表示が要るのはモデルや派生物を配るとき）。作った音を、別の生成 AI の土台モデルの学習に使うのは禁止。
- **出どころは書く**（RULES 9章）：動画の概要欄・アプリの出どころに「BGM・効果音: Stable Audio 3（Stability AI）で生成」。
- **紹介動画に使う**：ライブラリから選んで、そのまま使ってよい。どの id を使ったかを upload-log か SCHEDULE に残す。
- **アプリの中で鳴らす**（Pages に音を置く）前に、`_dev/AI-MUSIC.md` 4章の手当てをする：README のライセンスに「AI で作った音は CC BY-NC の対象外」を足す・画面の出どころ・聞いて既存の曲に似ていないか。まだ一度もしていないので、最初の1本はユーザーに確かめてから。
- 学習データは許諾ずみと Stability AI は言うが、似たフレーズが出る心配はゼロではない。Content ID の申し立てに備え、`.json`（文・種・日時）を消さない。
