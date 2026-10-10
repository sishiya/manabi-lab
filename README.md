# アプリ開発

ブラウザで動く学習用アプリのシリーズ。Claude（Claude Code）と一緒に作っています。

### 入口（`index.html`）に並ぶアプリ

| フォルダ | アプリ |
|---|---|
| `body-dive/` | 体内ダイブ — 消化管・気道の中を3Dで進む |
| `evolution/` | ヒトへの46億年 — 地球と生命と人類の歴史を定点観測する3D |
| `quantum/` | 量子の実験室 — 二重スリット・トンネル効果・偏光板・量子もつれ・不確定性原理 |
| `wifi-wave/` | 電波の見える部屋 — WiFi の電波が家の中をどう伝わるか |
| `animal-senses/` | いきものの感じる世界 — 同じ庭を人間・カラス・マムシなどの感覚で見る |
| `immune-battle/` | 免疫のたたかい — ウイルス・細菌が入って増え、免疫に片づけられるまで |
| `god-view/` | 神の視点マップ — 宇宙から地球・街・原子まで。本物の地形・写真・地図の3D地球 |
| `metamorphosis/` | さなぎの中で — イモムシがさなぎになりガになるまでの体の中（タバコスズメガ） |
| `air-flow/` | 空気の流れの見える部屋 — 窓・換気扇で空気がどう入れかわり、どこがよどむか |
| `ga-creatures/` | 進化の箱庭 — 関節と筋肉の生きものを遺伝的アルゴリズムで進化させる |
| `mold-growth/` | カビが育つまで — 浴室の壁のカビの箱庭で、掃除や習慣を試す |
| `black-hole/` | ブラックホールの見え方 — 映画「インターステラー」のブラックホールを光の道すじから計算 |

### 保管庫（`archive.html`。作りかけ・試作）

| フォルダ | アプリ |
|---|---|
| `passkey/` | パスキーのしくみ |
| `brain-response/` | 刺激が脳に届くまで |
| `resistance/` | 退治するほど手ごわくなる |
| `ferrofluid/` | 磁性流体の実験皿 |
| `muscle-growth/` | 筋肉が育つまで |
| `illusions/` | 錯覚の美術館 |
| `extreme/` | 極限の世界に置いてみたら |
| `blood-dive/` | 血管の旅 |
| `urinary-dive/` | 尿の旅 |

- **公開中**: https://sishiya.github.io/manabi-lab/ （入口のページから全アプリを開けます。GitHub Pages）
- 入口は日本語と英語を切り替えられます（右上の JP／EN。選んだ言語と並び順はブラウザに覚えます）。アプリの中の英語対応は順に進めています（入口の12本のうち10本。残りは immune-battle・god-view。企画と作り方・引き継ぎは `I18N.md`）。
- 入口（ルートの `index.html`）のサムネイルは `assets/thumbs/`（`_dev/tools/make-thumbs.ps1` で撮り直し）。各アプリにはファビコン（SVG を埋め込み）。
- 各アプリの `index.html` が最新版、`launcher.html` から過去の版を開けます（`versions/`）。
- 仕組みや確認のしかたは各フォルダの `DEVNOTES.md`、進め方の共通ルールは `RULES.md`。
- アプリ以外の道具は `_dev/` にまとめています: `_dev/tools/`（公開前チェック・サムネイル撮影・起動・文字列の置きかえ `rep.pl`・YouTube へのアップロード `youtube-upload.ps1`・X への投稿の下ごしらえ `x-post.ps1`）、`_dev/promo/`（紹介動画づくり。ショート＝紹介、横長＝使い方の説明（`<app>-guide.html`）。英語の字幕データ（SRT）も作る）。公開する素材（入口のサムネイルなど）は `assets/`。

## ローカルで動かす（Windows）

分割ファイルのアプリは file:// では動かないので、小さなサーバーを使います。

いちばん簡単なのは、このフォルダの **`start.bat` をダブルクリック**すること（サーバーを起動して、入口のページをブラウザで開きます。8765 が使えないときは別のポートを使います。`start.bat god-view` のようにフォルダ名を付けると、そのアプリを直接開きます）。手で起動するなら:

```
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/serve.ps1 -Port 8765
```

http://localhost:8765/evolution/index.html などを開きます。

## はじめてクローンしたとき

```
git config core.hooksPath .githooks
git config core.quotepath false
```

1行目で、コミットの前に公開前チェック（`_dev/tools/check-public.ps1`）が自動で走ります。

## ライセンス

MIT（`LICENSE`）。実行時に読み込む Three.js（MIT）・CesiumJS（Apache-2.0）と Google Fonts の書体（SIL Open Font License）は、それぞれのライセンスに従います。地図・写真・標高などのデータは各提供元の条件に従います（`god-view/DEVNOTES.md` の「データ源」）。`god-view/data/stars.js` は HYG Database から作ったもので CC BY-SA 4.0 です。
