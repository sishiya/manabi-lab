# アプリ開発 フォルダ

人体の管を3Dで進むアプリのシリーズ。**最初に `DEVNOTES.md`（3アプリのまとめ）を読むこと。**

- `body-dive/` — 体内ダイブ（消化管・気道）。詳しい仕組みは `body-dive/DEVNOTES.md`。
- `urinary-dive/` — 亜種「尿の旅」。
- `blood-dive/` — 亜種「血管の旅」。
- `wifi-wave/` — 単独アプリ「電波の見える部屋」（WiFi の電波が家の中をどう伝わるかを2次元の電磁波シミュレーションで見る。WebGL2 直書き）。仕組み・確認手順・公開 URL は `wifi-wave/DEVNOTES.md`。
- `evolution/` — 別シリーズ「ヒトへの46億年」（地球と生命と人類の歴史を定点観測する3D）。企画は `evolution/PLAN.md`・`PLAN-future.md`、仕組みと確認手順は `evolution/DEVNOTES.md`（公開 URL もそこ）。**v005 から css/js に分割**: 直すときは DEVNOTES の「ファイル構成」を見て関係するファイルだけ読む。確認は `.claude/launch.json` の `apps`（http://localhost:8765/）で。
- `animal-senses/` — 別シリーズ「いきものの感じる世界」（同じ庭を人間・カラス・マムシなどの感覚で一人称で見る。紫外線・熱などを置き換えて表示）。css/js に分割。企画は `animal-senses/PLAN.md`、仕組みと確認手順は `animal-senses/DEVNOTES.md`。
- `immune-battle/` — 別シリーズ「免疫のたたかい」（ウイルス・細菌が入って増え、免疫に片づけられるまで。数のモデルに合わせて動くミクロの断面＋人体の小窓＋グラフと予測）。css/js に分割、Canvas 2D。企画は `immune-battle/PLAN.md`、仕組み・モデルの数値・確認手順は `immune-battle/DEVNOTES.md`。
- `quantum/` — 別シリーズ「量子の実験室」（二重スリット・トンネル効果・偏光板・量子もつれ・不確定性原理）。1ファイル完結。仕組みと確認手順・公開 URL は `quantum/DEVNOTES.md`。

## 進め方の約束（詳しくは `RULES.md`。どのアプリでも最初に読む）
- 企画書（`PLAN.md`）を先に作り、段階に分けて進める。
- 大きくなったら役割ごとにファイル分割し、DEVNOTES のファイル構成表を見て関係するファイルだけ読む。
- 手を入れる前と区切りごとに、`<app>/versions/<番号-名前>/` へ丸ごとバックアップを残す。節目の版は `<app>/launcher.html` に追加する。
- 区切りごとに `<app>/DEVNOTES.md` の「別セッションで続けるとき」と「状態」を更新する。
- 変更のたびに、`DEVNOTES.md` の「確認のしかた」の項目を通しで確認する（当たり判定の変更で合流部が塞がったことがある）。
- 3アプリはエンジンを複製しているので、共通部分の不具合を直すときは他のアプリにも同じ問題がないか見る。
- 公開は既存の Artifact URL へ同じファイルを再公開する。URL はルートの `PUBLISH.local.md`（Git に入れない）。ない PC では Artifact の一覧でタイトルから探す（`RULES.md` 8章）。
- **Artifact の公開と git の commit／push の前には毎回、公開前チェック（`RULES.md` 7章）を行う**: `tools/check-public.ps1` で個人情報・秘密情報を探し、目でも確かめ、結果をユーザーに伝える。見つかったら公開しない。このフォルダは Public リポジトリにしても困らない状態を保つ。
- 返事は日本語で。
