# 露出の導線（不特定多数に見つけてもらう道すじ）の企画（2026-10-12）

## いまの公開までのルート
1. アプリを作る → 公開前チェック（RULES 7章）→ commit → ユーザーが頼んだときだけ push → **GitHub Pages** に出る（`https://sishiya.github.io/manabi-lab/`）。
2. 新しいアプリは **保管庫**（`archive.html`、noindex）→ ユーザーの指示で **入口**（`index.html` の `APPS`、13本）へ。
3. **YouTube「しし屋」@sishiya22**: 入口の12本の説明動画（横長）＋ショートを 10/11〜10/22 の毎日 20:00 に予約ずみ（`_dev/promo/SCHEDULE.md`）。説明欄にアプリの URL。公開後に入口のカードへ「▶ 使い方の動画」。
4. **X @sishiya22**: `x-post.ps1` で下ごしらえまで（投稿はユーザー）。出すかはまだ決めていない。
5. 数のふり返り: GA4（入口・アプリ）、`weekly-report.ps1`（YouTube と GA の読む許可はユーザーの準備待ち）。

→ 人が来る道は **YouTube だけ**。検索・SNS でリンクを貼られたときの受け皿がない。

## 調べてわかった弱いところ（2026-10-12）
- **検索に出ていない**: `site:sishiya.github.io manabi-lab` で1件も出ない。Search Console に登録しておらず、sitemap もない。
- **説明文・リンクカードがない**: 入口も13本のアプリも `<title>` だけ。meta description・OGP（og:title／og:image など）・twitter:card がない。X・LINE・Discord・はてな などに URL を貼ってもカードが出ず、文字の URL だけになる（X の返信に貼るアプリの URL も同じ）。
- **言語が URL で分かれていない**: 同じ URL を JS でブラウザの言語に切りかえている。Google は言語ごとに別の URL＋hreflang を勧めている（同じ URL で中身を変えると、全部の言語を拾えないことがある）。`?lang=ja|en` はすでに使えるので、hreflang で知らせるだけで足りる。

## 候補と見立て
| # | 導線 | 効き目 | 手間・リスク | だれが |
|---|---|---|---|---|
| A | **検索・リンクカードの土台**（入口と13本に description・OGP・twitter:card・hreflang、`sitemap.xml`、入口用の画像） | 大。ほかの全部（X・YouTube の説明欄・口コミ）の受け皿になる | 小。画面は変わらない | Claude |
| B | **Google Search Console に登録**して sitemap を送る | 大。インデックスの速さと、どの言葉で見られているかが分かる | 小。Google アカウントでの確認が要る | ユーザー（Claude はタグ・ファイルを置く） |
| C | **X にショートを出す**（`x-post.ps1` はある） | 中。動画の公開日と合わせると YouTube との相乗り | 小。毎日の手作業 | ユーザー |
| D | **技術記事**（Zenn か Qiita: 例「ブラウザで Kerr ブラックホールを光線追跡」「ブラウザだけで 4K の紹介動画を録る」） | 中〜大。エンジニア層に届き、はてなブックマークにも乗りやすい。被リンクで検索にも効く | 中。下書きは Claude、投稿はユーザーのアカウント | 両方 |
| E | **英語圏**: Hacker News「Show HN」（登録なしで試せる自作物が対象。ブラックホール・神の視点マップ向き）、Reddit r/InternetIsBeautiful（厳しく選別、AI 生成物のきまりを検討中） | 当たれば大、外れればゼロ | 中。英語のやりとり。1回きり | ユーザー（文案は Claude） |
| F | **YouTube の中**: 再生リスト「まなびラボ 使い方」、説明欄の入口リンク | 小〜中。関連動画からの回遊 | 小。API で可能だが外向きの変更 | ユーザーの OK 後に Claude。**2026-10-12 再生リストを作った**（`youtube-upload.ps1 -Playlist`、`_dev/promo/README.md`） |
| G | 学校・先生向け（理科の先生のリンク集・研究会） | 中。長く使われる | 大。連絡はメールなど外向き。対象の調べ直しが要る | 後で |
| H | GitHub のリポジトリの説明・トピック（`education`・`webgl`・`simulation` など） | 小 | 小。`gh` の認証が要る | ユーザー |

## 進め方
- **段階1（Claude）**: A。**2026-10-12 済み**（各アプリの `versions/<版>-seo`、smoke は全部 OK。push 前）。`_dev/tools/seo.mjs` が入口の `APPS` から、入口と各アプリの `index.html` のしるしの間（`<!-- seo -->`〜`<!-- /seo -->`）と `sitemap.xml` を作りなおす（説明文の出どころを `APPS` の1か所にする）。入口へ移したアプリはこれを走らせる（RULES 8.1）。
- **段階2（ユーザー）**: B（登録のしかたは下）、H。
- **段階3**: C・D・E・F はユーザーが選んだものから。文案は Claude が書き、投稿・送信はユーザー。
- 効き目は GA4 の「参照元」と Search Console で、2〜4週間後に見る。

## Search Console の登録（ユーザー）
1. https://search.google.com/search-console →「プロパティを追加」→ **URL プレフィックス** に `https://sishiya.github.io/manabi-lab/`。
2. 確認の方法は「HTML タグ」→ 出てきた `<meta name="google-site-verification" content="…">` の **content の値** を Claude に渡す（入口の `index.html` に入れて commit → push → 「確認」）。GA4 と同じアカウントなら「Google アナリティクス」の方法でも確認できることがある。
3. 確認できたら「サイトマップ」に `sitemap.xml` を送る。
- robots.txt はドメインの一番上（`sishiya.github.io/robots.txt`）にしか置けないので使わない（なくても全部クロールされる）。

## 注意
- 保管庫（noindex）とそのアプリは sitemap に入れない。
- OGP の画像は入口のサムネイル（640×360）。入口は `assets/og.jpg`（サムネイルを並べた 1200×630）。
- リンクカードは JS を動かさずに読まれるので、説明は日本語の1つだけ（英語の入口から貼っても日本語のカード）。
