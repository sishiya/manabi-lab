# しし屋の見せ方を、まなびラボだけ → 全部のラボへ（案、2026-10-24）

あそびラボの動画が YouTube に入ったので、名前・バナー・説明文を「しし屋」（全体）にそろえる。
GA4 が「しし屋 ＞ しし屋シリーズ」になっているのと同じで、**しし屋が全体の名前、ラボはその中のシリーズ**という形にする。

## 1. 名前（どのサービスも同じ形に）

| | いま | 案1（おすすめ） | 案2 |
|---|---|---|---|
| YouTube | しし屋　まなびラボ | **しし屋** | しし屋｜まなびラボ・あそびラボ |
| X | しし屋　まなびラボ | **しし屋** | 同上 |
| Zenn | しし屋 まなびラボ | **しし屋** | 同上 |
| note | しし屋　まなびラボ | **しし屋** | 同上 |
| DEV | sishiya (しし屋) | そのまま | そのまま |

- 案1: くらしラボ・この先のラボが増えても直さなくてすむ。ラボの名前は説明文とバナーに書く。
- 案2: 検索で「まなびラボ」に当たりやすいまま。ただし名前が長くなり、ラボが増えるたびに直すことになる。
- ハンドル（@sishiya22・sishiya）は変えない（リンクが切れるので）。
- YouTube の名前の変更は 14 日に 2 回まで。**API では変えられない**ので Studio で（ほかのサービスも手で）。

## 2. バナー・ヘッダー

案A・B・C は `banner-A.svg`〜`banner-C.svg`（PNG も）。比べる絵は `compare.png`。
- A: しし屋が主役（ライオン＋大きな題）。下に3つのラボ。左は理科・右はゲームの絵
- B: 左半分まなびラボ・右半分あそびラボ、まん中にしし屋（くらしラボは下の小さな行だけ）
- C: いまの見た目のまま、題を「しし屋」にして、下に3つのラボ

決まったら X のヘッダー（1500×500）も同じ絵で作る。YouTube のバナーは API で上げられる（channelBanners.insert → channels.update、合わせて約 100 ポイント）。

## 3. 説明文

### YouTube（日本語）
```
しし屋は、ブラウザで動くアプリを作っています。無料・インストール不要で、スマホでも動きます。

▶ まなびラボ … ふだん見えない「しくみ」を、動かして見る理科のアプリ（体の中・電波・量子・ブラックホール・進化 など）
https://sishiya.github.io/manabi-lab/
▶ あそびラボ … ブラウザで遊べる小さなゲーム
https://sishiya.github.io/asobi-lab/
▶ くらしラボ … 「なぜ」が見える、くらしの道具
https://sishiya.github.io/kurashi-lab/

動画は、アプリの使い方と見どころ（横長）と、ショートの紹介です。物理は曲げずに計算し、出どころはアプリの画面に書いています。アプリは Claude（AI）と一緒に作っています。
```

### YouTube（英語。英語で見ている人に出る）
```
Sishiya makes apps that run in your browser: free, no install, and they work on phones too.

▶ Manabi Lab … science apps that let you move things and see how they work (inside the body, WiFi, quantum, black holes, evolution and more)
https://sishiya.github.io/manabi-lab/?lang=en
▶ Asobi Lab … small games you can play in the browser
https://sishiya.github.io/asobi-lab/
▶ Kurashi Lab … everyday tools that show the "why"

Videos are app guides (landscape) and short intros. The physics is computed honestly, and sources are shown in each app. Made together with Claude (AI).
```
キーワードに「あそびラボ」「ブラウザゲーム」を足す。説明文・英語・キーワードは API で変えられる（channels.update、50 ポイント）。

### X（160字まで、手で）
```
ブラウザで動くアプリを作っています🦁 まなびラボ＝しくみが見える理科のアプリ（体の中・電波・量子・進化…）、あそびラボ＝小さなゲーム、くらしラボ＝くらしの道具。無料・インストール不要
```
リンクの欄は1つだけ。いまは まなびラボ。全部のラボへの入口のページがないので、まずはそのまま（下の「あとで」）。

### Zenn（手で）
```
ブラウザで動く理科のシミュレーションとゲームを作っています（しし屋 まなびラボ・あそびラボ）。WebGL2・WebGPU・数値計算の話を書きます。Claude と一緒に作っています。
```

### note（手で）
```
ブラウザで動くアプリを作っている しし屋 です。まなびラボ（理科）・あそびラボ（ゲーム）・くらしラボ（道具）を、なぜ作ったかの話を書きます。
```

### DEV（手で）
```
I build small apps that run in the browser: science sims (Manabi Lab — black holes, the human gut, viruses, waves) and small games (Asobi Lab). Physics stays honest and sources are on screen. JP/EN. Made with AI (Claude).
```

## 4. 再生リスト（API で）

| リスト | いま | 案 |
|---|---|---|
| まなびラボ ― アプリの使い方と見どころ | あり | そのまま |
| まなびラボ ― ショート | あり | そのまま |
| **あそびラボ ― ゲームのあそびかた（通しで見る）** | なし | 新しく。あそびラボの説明動画＋ショートを1つに（まだ2本なので）。ふえたら2つに分ける |

`youtube-upload.ps1 -Playlist` は まなびラボの `_dev/promo` だけを見るので、`playlist-asobi.json` に「どのフォルダを見るか」（`../ゲーム/_dev/promo`）を書けるようにする（小さな直し）。
チャンネルのホームの棚（まなびラボ・あそびラボの2段）は Studio の「カスタマイズ」→「レイアウト」で（API の channelSections は、いまのホームの並べ方と合わないことがあるので、Studio のほうが確実）。

## 5. 動画のタイトル

- いまの題はそのまま（あそびラボの動画は「（あそびかた）」、説明欄にも「あそびラボのブラウザゲーム」とあり、区別はつく）。
- 公開ずみの題を変えると、検索や関連動画で育ちかけたものがリセットされることがあるので、全部に「【まなびラボ】」などを付けるのはおすすめしない。

## あとで（別の作業）
- しし屋の入口のページ（3つのラボへのリンクだけ）を作ると、X のリンクの欄・YouTube の説明を1つの URL にできる。
