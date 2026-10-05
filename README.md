# アプリ開発

ブラウザで動く学習用アプリのシリーズ。Claude（Claude Code）と一緒に作っています。

| フォルダ | アプリ |
|---|---|
| `body-dive/` | 体内ダイブ — 消化管・気道の中を3Dで進む |
| `urinary-dive/` | 尿の旅 |
| `blood-dive/` | 血管の旅 |
| `evolution/` | ヒトへの46億年 — 地球と生命と人類の歴史を定点観測する3D |
| `quantum/` | 量子の実験室 |
| `wifi-wave/` | 電波の見える部屋 |
| `animal-senses/` | いきものの感じる世界 |
| `immune-battle/` | 免疫のたたかい |
| `god-view/` | 神の視点マップ — 本物の地形・写真・地図の3D地球（GitHub Pages で公開: https://sishiya.github.io/manabi-lab/god-view/ ） |

- **公開中**: https://sishiya.github.io/manabi-lab/ （入口のページから全アプリを開けます。GitHub Pages）
- 入口（ルートの `index.html`）のサムネイルは `thumbs/`（`tools/make-thumbs.ps1` で撮り直し）。各アプリにはファビコン（SVG を埋め込み）。
- 各アプリの `index.html` が最新版、`launcher.html` から過去の版を開けます（`versions/`）。
- 仕組みや確認のしかたは各フォルダの `DEVNOTES.md`、進め方の共通ルールは `RULES.md`。

## ローカルで動かす（Windows）

分割ファイルのアプリは file:// では動かないので、小さなサーバーを使います。

```
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/serve.ps1 -Port 8765
```

http://localhost:8765/evolution/index.html などを開きます。

## はじめてクローンしたとき

```
git config core.hooksPath .githooks
git config core.quotepath false
```

1行目で、コミットの前に公開前チェック（`tools/check-public.ps1`）が自動で走ります。

## ライセンス

MIT（`LICENSE`）。実行時に読み込む Three.js（MIT）・CesiumJS（Apache-2.0）と Google Fonts の書体（SIL Open Font License）は、それぞれのライセンスに従います。地図・写真・標高などのデータは各提供元の条件に従います（`god-view/DEVNOTES.md` の「データ源」）。`god-view/data/stars.js` は HYG Database から作ったもので CC BY-SA 4.0 です。
