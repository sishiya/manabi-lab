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
| `piano-hand/` | ピアノを弾く手 — 降ってくるノーツを3Dの両手が弾く。運指の自動計算の技術検証 |
| `pitch-physics/` | 変化球のしくみ — 速さ・向き・回転から空気の力を計算して投球の道すじを解く技術検証。ナックルが読めないわけも |
| `phage/` | 細菌にとりつくウイルス — T4 ファージが大腸菌にとりつき、増えて破れて出るまで。人のからだから分子までどこでも寄れる |
| `eye-optics/` | 目のなかの光の道 — 光が目の中で曲がって網膜に像を結ぶまでを光線1本ずつ計算。ピント・ひとみ・暗さに慣れる時間、老眼・近視・乱視とメガネ |
| `hair-removal/` | 脱毛のしくみ — 毛穴の断面にカミソリ・毛抜き・光を好きなときに使い、毛の周期と光の熱で毛穴の中に起きることを見る |

### 保管庫（`archive.html`。作りかけ・試作）

| フォルダ | アプリ |
|---|---|
| `tree-of-life/` | いのちの系統樹 |
| `weed-growth/` | 雑草がふえるまで |
| `house-dust/` | ほこりが積もるまで |
| `tiny-earth/` | ちいさな地球 |
| `passkey/` | パスキーのしくみ |
| `brain-response/` | 刺激が脳に届くまで |
| `ferrofluid/` | 磁性流体の実験皿 |
| `muscle-growth/` | 筋肉が育つまで |
| `illusions/` | 錯覚の美術館 |
| `extreme/` | 極限の世界に置いてみたら |
| `blood-dive/` | 血管の旅 |
| `urinary-dive/` | 尿の旅 |

- **公開中**: https://sishiya.github.io/manabi-lab/ （入口のページから全アプリを開けます。GitHub Pages）
- **紹介動画**: YouTube「しし屋」 https://www.youtube.com/@sishiya22 （入口のページの下からもリンク）
- **新着のお知らせ（RSS／Atom）**: https://sishiya.github.io/manabi-lab/feed.xml （英語は `feed-en.xml`）。入口のアプリの公開と更新が届きます。`sitemap.xml` と一緒に `_dev/tools/seo.mjs` が入口の `APPS` から作ります。
- 入口は日本語と英語を切り替えられます（右上の JP／EN。選んだ言語と並び順はブラウザに覚えます）。入口のアプリはすべて、中も英語に対応しています（2026-10-10〜。企画と作り方・英語の文を足すときの約束は `I18N.md`）。
- 入口（ルートの `index.html`）のサムネイルは `assets/thumbs/`（`_dev/tools/make-thumbs.ps1` で撮り直し）。各アプリにはファビコン（SVG を埋め込み）。
- 各アプリの `index.html` が最新版、`launcher.html` から節目の版を開けます（`versions/`）。ほかの版は Git の記録にあります（ランチャーの表の「Git」）。
- 仕組みや確認のしかたは各フォルダの `DEVNOTES.md`、進め方の共通ルールは `RULES.md`。ゲームに当たるアプリは姉妹サイト「あそびラボ」へ移す方針で、全アプリの判定は `GAMES.md`。
- アプリ以外の道具は `_dev/` にまとめています: `_dev/tools/`（公開前チェック・サムネイル撮影・起動・文字列の置きかえ `rep.pl`・YouTube へのアップロード `youtube-upload.ps1`・X への投稿の下ごしらえ `x-post.ps1`）、`_dev/promo/`（紹介動画づくり。ショート＝紹介、横長＝使い方の説明（`<app>-guide.html`）。英語の字幕データ（SRT）も作る）、`_dev/vtuber/`（しし屋のアイコンをカメラ・マイクで動かす VTuber の試作。`_dev/vtuber/README.md`）。公開する素材（入口のサムネイルなど）は `assets/`。

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

- **プログラムのコード**: MIT（`LICENSE`）
- **アプリの中身**（名前・文章・キャラクターや模型やステージのデザイン・画像・音・動画・企画書などの文書。コードの中に書かれていても）: CC BY-NC 4.0（`LICENSE-CONTENT`）。作者を表示すれば共有・改変してよく、授業や家庭での学習にも自由に使えます。営利目的には使えません。
- 2026-10-13 より前のコミットは、すべて MIT で公開していました。
- ほかの人のもの: 読み込むライブラリ（Three.js・mp4-muxer など MIT、CesiumJS など Apache-2.0）と Google Fonts の書体（SIL Open Font License）は、それぞれのライセンスに従います。よく使うライブラリは LICENSE といっしょに `lib/` に置いています（一覧は `lib/README.md`）。地図・写真・標高などのデータは各提供元の条件に従います（`god-view/DEVNOTES.md` の「データ源」）。`god-view/data/stars.js` は HYG Database から作ったもので CC BY-SA 4.0 です。`tiny-earth/data/etopo1deg.bin` は NOAA NCEI の ETOPO1（アメリカでは著作権なし・パブリックドメイン。出典: NOAA NCEI）を 1°ごとに間引いたものです。`tree-of-life/data/backbone.js` は Catalogue of Life（CC BY 4.0。Bánki ほか, doi:10.48580/dgz5n）・Open Tree of Life（CC0）・Wikidata（CC0）から作ったもので、それぞれの条件に従います（アプリの中で COL と Wikidata の API も読みます）。詳細に出す写真は Wikimedia Commons からその場で読むもので、作者と条件（CC0・パブリックドメイン・CC BY・CC BY-SA）を図ごとに出しています（このリポジトリのライセンスには入りません）。樹形図で動くシルエットは PhyloPic からその場で読むもので（NC の条件のものはのぞく）、作者と条件を詳細に出しています。
