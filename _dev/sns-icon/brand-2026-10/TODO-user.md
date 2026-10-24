# しし屋にそろえる: ユーザーがやること（サービス別、2026-10-24）

名前はどこも **しし屋**、絵は案A。文はこのファイルからコピーして貼る。
API で済ませたもの（YouTube のバナー・説明・英語の説明・キーワード・あそびラボの再生リスト）は下の「済み」。

## YouTube（Studio）
- [ ] 名前を「しし屋　まなびラボ」→ **しし屋**（Studio → カスタマイズ → プロフィール → 名前。14日に2回まで。ハンドル @sishiya22 はそのまま）
- [ ] ホームの棚を2段に（カスタマイズ → レイアウト → セクションを追加 → 1つの再生リスト）
  - 上: 「まなびラボ ― アプリの使い方と見どころ」 https://www.youtube.com/playlist?list=PLPr9GEGpKWDg
  - 下: 「あそびラボ ― ゲームのあそびかた」 https://www.youtube.com/playlist?list=PLX8RLH1Gpbn8
- [ ] （あれば）プロフィールのリンク欄に まなびラボ・あそびラボ・くらしラボ の3つ
- 済み: バナー（案A）・説明（日本語・英語）・キーワード・あそびラボの再生リスト（恐竜かけっこ牧場 2本）

## X（@sishiya22）
- [ ] 名前 → **しし屋**
- [ ] ヘッダー → `header-x.png`（このフォルダ。1500×500）
- [ ] 自己紹介 →
```
ブラウザで動くアプリを作っています🦁 まなびラボ＝しくみが見える理科のアプリ（体の中・電波・量子・進化…）、あそびラボ＝小さなゲーム、くらしラボ＝くらしの道具。無料・インストール不要
```
- リンクの欄は今の まなびラボ のまま（しし屋の入口のページを作ったら差しかえ）

## Zenn（zenn.dev/sishiya）
- [ ] 表示名 → **しし屋**
- [ ] 自己紹介 →
```
ブラウザで動く理科のシミュレーションとゲームを作っています（しし屋 まなびラボ・あそびラボ）。WebGL2・WebGPU・数値計算の話を書きます。Claude と一緒に作っています。
```

## note（note.com/sishiya）
- [ ] 表示名 → **しし屋**
- [ ] 自己紹介 →
```
ブラウザで動くアプリを作っている しし屋 です。まなびラボ（理科）・あそびラボ（ゲーム）・くらしラボ（道具）を、なぜ作ったかの話を書きます。
```
- [ ] ヘッダーの画像 → `header-note.png`（このフォルダ。1280×670。note はまん中の細い帯しか見せないので、文字は1段にまとめた。切れ方の確かめは `note-check.html`）

## DEV（dev.to/sishiya）
- 名前「sishiya (しし屋)」はそのまま
- [ ] Bio →
```
I build small apps that run in the browser: science sims (Manabi Lab — black holes, the human gut, viruses, waves) and small games (Asobi Lab). Physics stays honest and sources are on screen. JP/EN. Made with AI (Claude).
```

## しし屋のトップ（https://sishiya.github.io/、2026-10-24 公開）
- 済み: リポジトリ `sishiya/sishiya.github.io` を作って push、公開を確かめた
- [ ] GitHub の Settings → Pages が「Deploy from a branch」・`main`・`/ (root)` か見る（公開はできているので、たぶんそうなっている）
- [ ] Search Console: プロパティを追加 →「URL プレフィックス」`https://sishiya.github.io/` → 確認は「Google アナリティクス」→ 通ったら「サイトマップ」に `sitemap.xml`
- [ ] X のウェブサイトの欄 → `https://sishiya.github.io/`（Zenn・note・DEV もウェブサイトの欄があれば）
- YouTube の説明文にトップのリンクを足すのは Claude が API で（頼まれたら）

## 終わったら
Claude に「名前を変えた」と言えば、文書（ARCHITECTURE.md のアカウントの表など）を「しし屋」に直す。
