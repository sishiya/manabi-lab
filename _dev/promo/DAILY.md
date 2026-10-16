# 毎日やること（紹介動画・記事の公開の日）

2026-10-15〜。日付ごとの予定は `SCHEDULE.md`（動画の表と Zenn の記事の表）。ここは「毎日の手順」だけ。
外に出すこと（予約・公開・投稿）は、**どれもユーザーの GO のあと**（RULES 10章）。出す前に毎回 `check-content.ps1`（記事・SNS の文も）。

## その日の朝〜昼（Claude が声をかける）
1. **今日の分の確認**: `SCHEDULE.md` で、今日の動画（説明 20:00・ショート 20:05、YouTube は予約ずみ）と今日の記事を見る。
2. **Zenn の記事**（2026-10-16〜）: 動画より遅れてよいので、順番どおり1日1本。毎朝 9:30 ごろスケジュールの作業 `zenn-daily-publish` が次の1本を出して push する（ユーザーが 10/16 に頼んだ）。その結果（出たか・上限で止まったか）を確かめてユーザーに伝える。順と日付は `SCHEDULE.md`。
3. **明日の分の前日の最終確認**（RULES 8.4、手順は `RULES-video.md`）: 明日の動画（`youtube-upload.ps1 -Verify`）と、**明日の記事を読み直す**（数字がアプリの DEVNOTES と合うか）。
4. **2日後の分の UI/UX のブラッシュアップ**（RULES 8.5）。

## 夜（20:00 の公開のあと）
5. **DEV（英語）を公開**: `powershell -NoProfile -ExecutionPolicy Bypass -File ../zenn/tools/devto.ps1 -Slug <slug> -Publish`（DEV には予約がないので当日に。作るのは5分に1本まで）。
6. **入口に「▶ 使い方の動画」**: `_dev/tools/check-video-links.ps1 -Fix` → 公開前チェック → commit（push はユーザー）。
7. **X の投稿**（ユーザー。文案は Claude、`x-post.ps1`）。
8. `SCHEDULE.md` の表の「状態」を直して commit。

## 残っている追いつき（2026-10-15 時点）
- **Zenn の上限（2026-10-16 わかった。FAQ https://zenn.dev/faq/rate-limit）**: 記事は「直近24時間の投稿数（予約中も数に入る）」で判定、数は非公開。10/16 は 8:58 に体内ダイブが出た直後のいきものが止まった → **いまは 24時間に1本**と見る。止まった記事は published: true のまま、24時間たってから中身の変わらない commit（再デプロイ）を push すると出る。
- Zenn: いきもの・量子がまだ（上限のため1本ずつ）。順は 46億年（済）→ 体内ダイブ → いきもの → 量子 → さなぎ（10/16 予約）。
- DEV: さなぎ（10/16）から先は当日に公開。
- **字幕 4 言語（es・pt・zh-TW・ko）の続き**（2026-10-15〜、ユーザーの依頼）: 字幕は1本 400 ポイントなので1日 23 本ほど。API の上限が戻る **16:00（日本時間）より後**に、次を毎日1回（もうある言語はとばすので、何度走らせてもよい）。全部ついたらこの行を消す。10/15 は 46億年・体内ダイブ・ブラックホール（説明）まで済み。予約中の動画の `-Verify` は、つく前は 4 言語が NG に出る（その日の 16 時以降に付ければよい）。
  `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/youtube-upload.ps1 -Captions -Lang es,pt,zh-TW,ko -Meta _dev/promo/metamorphosis-guide.upload.json,_dev/promo/metamorphosis-short.upload.json,_dev/promo/immune-battle-guide.upload.json,_dev/promo/immune-battle-short.upload.json,_dev/promo/air-flow-guide.upload.json,_dev/promo/air-flow-short.upload.json,_dev/promo/ga-creatures-guide.upload.json,_dev/promo/ga-creatures-short.upload.json,_dev/promo/god-view-guide.upload.json,_dev/promo/god-view-short.upload.json,_dev/promo/wifi-wave-guide.upload.json,_dev/promo/wifi-wave-short.upload.json,_dev/promo/mold-growth-guide.upload.json,_dev/promo/mold-growth-short.upload.json,_dev/promo/pitch-physics-guide.upload.json,_dev/promo/pitch-physics-short.upload.json,_dev/promo/black-hole-short.upload.json,_dev/promo/animal-senses-guide.upload.json,_dev/promo/animal-senses-short.upload.json,_dev/promo/quantum-guide.upload.json,_dev/promo/quantum-short.upload.json`
