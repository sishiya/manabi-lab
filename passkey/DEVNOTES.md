# パスキーのしくみ 開発メモ

最終更新: 2026-10-08

パスワードの代わりの「パスキー」が、なぜ盗まれにくいのかを、**絵の舞台**（スマホの金庫・門番＝ブラウザ・家＝サイト・わるもの）で試してくらべるアプリ。同じ実験を「🗝 合言葉（パスワード）」と「🔑 パスキー」でやって、表に ◯✕ がたまる。**鍵の作成・サイン・確かめ・ハッシュは本物**（Web Crypto API）。企画は `PLAN.md`。DOM と CSS、ライブラリなし。

## 別セッションで続けるとき（まずここ）
- **いまの状態**: v3b（`versions/v003b-archive`。中身は v3 と同じで、GA の1行と表の行の高さの直し）。**隠しアーカイブ（`../archive.html`、保管庫）に掲載**（2026-10-08、サムネイル `thumbs/passkey.jpg`）。入口「まなびラボ」には載せていない。公開は GitHub Pages（push はユーザー）。URL は `https://sishiya.github.io/manabi-lab/passkey/`。Artifact には公開していない。
- **次にやること**: ユーザーの感想しだい。入口に移すときは RULES 8.1（入口の `APPS` に足す。サムネイルは `tools/thumb.html` の `SETUP` に、にせものサイトで止めた場面がある）。段階B の案は `PLAN.md`。
- **読む順**: `../RULES.md` → このファイル → 下の「ファイル構成」で関係するファイルだけ。
- **動かし方**: `.claude/launch.json` の空いているサーバーで `http://localhost:<port>/passkey/`（2026-10-08 は `apps-4`＝8768）。**https か localhost でないと動かない**（`crypto.subtle` が secure context だけ）。
- **デバッグ用**: `window.__pk` — `W`（世界）、`ST`（表示）、`RES`（表の結果）、`EXP`（実験。戻り値 'done'・'safe'・'hit'）、`run(fn)`、`startExp(id, mode)`、`resetAll()`、`auto(true)`（待ち・アニメーションを全部すぐ通す）。例外は `window.__pkErr`。
- **区切りごとに**: ① `versions/v0NN-名前/` に index.html・css・js を丸ごとコピー ② `launcher.html` にカード・表 ③ 下の「状態」 ④ 「確認のしかた」を通す ⑤ 公開前チェック → コミット（push はユーザー）。
- **ユーザーの好み**: さわって試せて目の前で反応するもの。**本物のログイン画面に似せない**（v1 で「実際の画面に近すぎてウイルスを仕込まれそうな危うさ」と言われた）。**文字は少なく**（1場面1行。くわしい話はたたむ）。**次に押す場所は、押すもののすぐ横に出す**（v2 で「説明が下にあっても目がいかない」と言われた）。正確さと出どころは画面に。

## ファイル構成

| ファイル | 中身 | 主な名前 |
|---|---|---|
| `index.html` | 骨組み（doctype なし）。読み込み順: crypto → model → stage → flows → ui → main。左＝モード `#segMode`・速さ・`#btnReset`、舞台 `#world`（`#aPhone`＝画面 `#phoneScreen`・👆 `#touch`・金庫 `#vault`、`#aGate`＝`#gate`、家 `#sites`、`#aThief`＝`#loot`、線 `#wires`、小包 `#packets`）、説明 `#narr`、たたんだ「くわしく」`#more`（記録 `#log`・中身 `#insp`）。右＝表 `#score`、しくみ4枚、たたんだ解説・出どころ `#srcList` | |
| `css/style.css` | 舞台は3列（1050px 以下で2列×2行）。家は屋根（clip-path の三角）＋壁。820px 以下はパネルが下、説明は下に固定 | |
| `js/crypto.js` | Web Crypto の包み: `rand` `hex` `b64url` `cat` `same` `sha256` `genKeyPair`（秘密鍵は extractable: false）`exportPub` `importPub` `sign` `verify` `pbkdf2` `makeAuthData` `parseAuthData` `FLAG` | `enc` `dec` |
| `js/model.js` | 世界 `W`、`SITES` `HOSTS`（架空、.example）、`USER` `PASSWORDS` `PW_ITER` `GUESSES`、`resetWorld` `makeServer`、`rpIdAllowed` `clientDataJSON` `coseKey`、サーバー `newChallenge` `serverFinishRegistration` `serverVerifyAssertion`（§7.2 の確認9つ）`serverCheckPassword`、スマホ `credFor` `phoneMakeCredential` `phoneGetAssertion` | |
| `js/stage.js` | `ST`、色の模様 `pat(bytes)`、`waitable` `abortWaits`、`renderPhone` `phoneUI` `touch`、`renderGate`（行き先・✋・ボタン `gMake` `gLogin`）、`renderSites` `showBadges`（家の下に印を1つずつ）、`renderThief` `loot`、`drawWires` `anchor` `elOf`、`fly` `move`、`renderLog`、`narr`、吹き出し `pointAt` `placeCallout` `clearPoint`（押すものの横に出し、ほかの舞台を `#world.focus` で暗く。押すものが画面外なら下の説明の欄を残す）、`want`（光らせて吹き出し）、`ask`（`#askBox`。画面の下寄りに固定） | `COL` `NAME` `tagOf` `CALL` |
| `js/flows.js` | 小包の中身 `F`、`goTo`、印のまとめ `pkBadges`（鍵・くじ・宛名・本人・サイン）`regBadges` `pwBadges`、`registerFlow` `loginFlow` `pwLoginFlow` `thiefPwLogin` `thiefPkTry`、`ensurePasskey` `calm`、実験 `EXP.*` | `BANK` `SHOP` `FAKE` |
| `js/ui.js` | 表 `EXPS` `RES` `buildScore`、出どころ `SRC`、「くわしく」`fieldHTML` `showPacket` `showKey`（秘密鍵の取り出しを本当にためす）、`wireGate`、`syncControls` | |
| `js/main.js` | `run` `stopRunning`（同時に1つ）、`startExp`（終わると結果を `#askBox` で見せる）、`pointNext`（表のまだのます目を「ここから／つぎはここ」で指す）、`resetAll`、`wire`、`init`、`window.__pk` | |

## しくみ

### 言いかえ（画面の言葉）
くじ＝チャレンジ、宛名＝rpId とページの origin、サイン＝署名、台帳＝サーバーのデータベース、合言葉＝パスワード、門番＝ブラウザ。家の下の印は WebAuthn の確認9つを5つにまとめたもの: 🔑鍵（credential ID）・🎲くじ（challenge と回数）・🏷宛名（type・origin・rpIdHash）・👆本人（UP・UV）・✍サイン（署名の検証）。合言葉は 👤名前・🗝合言葉。

### 色の模様 `pat()`
バイト列を 4×4 の色にしたもの（同じバイト列なら同じ絵）。台帳の公開鍵・合言葉のハッシュ、わるものの手に入れたもの、「くわしく」の各項目に出す。

### 登録・ログイン（WebAuthn §7.1・§7.2 を簡単に）
登録: 作りたい → 🎲くじ → くじ＋宛名をスマホへ → 👆 → 鍵の組（🔑は金庫、🔓はサイトへ）→ 印（くじ・宛名・本人）。ログイン: ログインしたい → 🎲くじ → 門番が宛名を確かめる（`rpIdAllowed`）→ スマホが宛名の鍵を探す → 👆 → authenticatorData ‖ SHA-256(clientDataJSON) に ECDSA P-256 でサイン → 印5つ。

### 実験
| 実験 | パスキー | 合言葉 |
|---|---|---|
| 🚪 ふつう | 作ってログイン（'done'） | 合言葉がそのまま届く（'done'） |
| 👹 にせもの `donguri-bamk` | わるものが本物のくじをもらい本物の宛名で頼む → 門番が ✋。続けて自分の宛名 → スマホに鍵がない | 取られて本物に入られる |
| 🗄 台帳 | 公開鍵だけ → わるものが自分の鍵でにせサイン → サイン ✕ | 弱い: `GUESSES` を本物の PBKDF2 で当てられる。強い: 当たらない（'safe'） |
| 👀 のぞき見 | 前のサインを次の日に → くじ ✕ | そのまま入られる |
| ✏️ 書きかえ | 止まった小包で「1文字かえる」（くじの1文字を1ビット反転）→ くじ・サイン ✕ | パスキーだけ |
| 📱 なくした | 指がちがう → 金庫をこじあける（`exportKey` が本当に断られる） | パスキーだけ |
| 🐟 2つめ `neko-shop` | 鍵が別。お店のサインを銀行へ → 鍵・くじ・宛名・サイン ✕ | 同じ合言葉で銀行にも入られる |

## ハマったところ
- Browser ペインが裏に回ると Web Animations が止まる → `move()` でタイマーと競争させる。
- 実験の途中で別の実験 → `waitable()` と `abortWaits()`、`ST.aborting` の間は新しい待ちもすぐ reject。
- 書きかえた小包が前の小包にも出た（配列の共有）→ 送る分は `slice()` した `sent`。
- `want(id)` で待っている間にボタンを描き直すと、押しても進まない → 待っている間は `renderGate` を呼ばない。

## 確認のしかた（変更のたびに）
1. 開いて `__pkErr` がない。`__pk.auto(true)` で、パスキー7つ・合言葉5つの `EXP` を `run` で回し、結果が次のとおり（2026-10-08）: パスキー basic done（印 ✓✓✓✓✓）、phish safe、leak safe（サインだけ ✕）、replay safe（くじ ✕）、tamper safe（くじ・サイン ✕）、lost safe、second safe（本人以外 ✕）。合言葉 basic done、phish・leak（弱い）・replay・second は hit。
2. 開くと表の「🚪 ふつう × 🔑」に「ここから」の吹き出し。押すと「🔑 作る」の横に吹き出し（ほかは暗い） → 押す → 小包 → 👆 が光る → 押す → 金庫に鍵・家に 🔓 の模様 → 「ログイン」→ 👆 → 印5つ ✓ → 下寄りの箱に「✓ できた」→ OK で表の次のます目に「つぎはここ」。
3. 「👹 × 🔑」で門番に ✋。「✏️」で「1文字かえる」→ はじかれる。
4. 金庫の鍵を押すと「くわしく」が開き「取り出せない」。
5. スマホ（375×812）: 横にはみ出さない、説明が下に固定、表を押すと舞台までスクロール。

## 状態
- 2026-10-08 v1（`versions/v001-first`）: 段階A。本物のログイン画面に近い作り（アドレスバー・入力欄・銀行のページ）、バイト列を直接書きかえる。
- 2026-10-08 v2（`versions/v002-concept`）: ユーザーの感想「実際の画面に近すぎて危うい」「文字が多すぎる」で作り直し。絵の舞台、1場面1行、色の模様、表で ◯✕、くわしい話はたたむ。見つけてみようはやめて表に。計算と出どころ（8件）はそのまま。
- 2026-10-08 v3（`versions/v003-guide`）: ユーザーの感想「つぎどこを押せばいいかわからない（説明が下にあっても目がいかない）」で、押すものの横に吹き出し＋ほかを暗く、質問・結果は下寄りの箱、終わると表のつぎのます目を「つぎはここ」で指す。吹き出しや箱が出ている間は下の説明の欄を隠す（同じ文が2回出ないように）。
- 2026-10-08 v3b（`versions/v003b-archive`）: 隠しアーカイブに掲載。GA の1行、サムネイル（`SETUP` の passkey）、互換モードの確認（1200×740・375×812 で全 199 要素の位置と大きさが標準モードと同じ、エラーなし）。互換モードでは表が body の行の高さを受けつがず行が 3px 低かったので、`.score` と表のボタンの line-height を px で決めた。
