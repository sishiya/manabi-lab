# 毎日やること（紹介動画・記事の公開の日）

2026-10-15〜。日付ごとの予定は `SCHEDULE.md`（動画の表と Zenn の記事の表）。ここは「毎日の手順」だけ。
外に出すこと（予約・公開・投稿）は、**どれもユーザーの GO のあと**（RULES 10章）。

## その日の朝〜昼（Claude が声をかける）
1. **今日の分の確認**: `SCHEDULE.md` で、今日の動画（説明 20:00・ショート 20:05、YouTube は予約ずみ）と今日の記事を見る。
2. **今日の記事の GO をもらう**（まだなら）→ Zenn: `published: true` と `published_at: "<今日> 20:10"` を**同時に**書いて commit → push。
   - 下書きに `published_at` を書かない（Zenn のデプロイ全体が止まる）。
   - Zenn には公開の数の上限がある。まとめて出さず、1本ずつ。push のあとデプロイ履歴か記事の URL（`https://zenn.dev/sishiya/articles/<slug>`）で確かめる。
3. **明日の分の前日の最終確認**（RULES 8.4、手順は `RULES-video.md`）: 明日の動画（`youtube-upload.ps1 -Verify`）と、**明日の記事を読み直す**（数字がアプリの DEVNOTES と合うか）。
4. **2日後の分の UI/UX のブラッシュアップ**（RULES 8.5）。

## 夜（20:00 の公開のあと）
5. **DEV（英語）を公開**: `powershell -NoProfile -ExecutionPolicy Bypass -File ../zenn/tools/devto.ps1 -Slug <slug> -Publish`（DEV には予約がないので当日に。作るのは5分に1本まで）。
6. **入口に「▶ 使い方の動画」**: `_dev/tools/check-video-links.ps1 -Fix` → 公開前チェック → commit（push はユーザー）。
7. **X の投稿**（ユーザー。文案は Claude、`x-post.ps1`）。
8. `SCHEDULE.md` の表の「状態」を直して commit。

## 残っている追いつき（2026-10-15 時点）
- Zenn: いきもの・量子がまだ（上限のため1本ずつ）。順は 46億年（済）→ 体内ダイブ → いきもの → 量子 → さなぎ（10/16 予約）。
- DEV: さなぎ（10/16）から先は当日に公開。
