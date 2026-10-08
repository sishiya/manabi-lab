# パスキーのしくみ 開発メモ

最終更新: 2026-10-08

パスワードの代わりに指紋・顔・PIN でログインする「パスキー」が、何を・どこにしまい、ログインで何が行き来し、なぜ偽サイト・データの流出・使い回しに強いのかを、自分で操作して確かめるアプリ。同じ攻撃をパスワードでも試してくらべる。**鍵の作成・署名・検証・ハッシュは本物**（Web Crypto API）。企画は `PLAN.md`。Canvas は使わず DOM と CSS、ライブラリなし。

## 別セッションで続けるとき（まずここ）
- **いまの状態**: v1（`versions/v001-first`、段階A）。入口・隠しアーカイブには**まだ載せていない**。Artifact にも公開していない。
- **次にやること**: ユーザーの感想しだい。載せるなら RULES 8.1（GA の1行・サムネイル・`tools/thumb.html` の `SETUP`・互換モードの確認）。段階B の案は `PLAN.md`（鍵の数学の小部屋、QR でほかの端末から、同期、本物の WebAuthn）。
- **読む順**: `../RULES.md` → このファイル → 下の「ファイル構成」で関係するファイルだけ。
- **動かし方**: `.claude/launch.json` の空いているサーバーで `http://localhost:<port>/passkey/`（2026-10-08 は `apps-4`＝8768）。**https か localhost でないと動かない**（`crypto.subtle` が secure context だけのため。file:// では止まり、画面にそう出す）。
- **デバッグ用**: `window.__pk` — `W`（世界: mode・origin・servers・phone・thief・session）、`ST`（表示の状態）、`EXP`（実験の関数）、`run(fn)`（流れを1つずつ。前の流れは止める）、`startExp(id)`、`resetAll()`、`auto(true)`（待ち・アニメーションを全部すぐ通す。確かめ用）、`DONE()`。例外は `window.__pkErr`。
- **区切りごとに**: ① `versions/v0NN-名前/` に index.html・css・js を丸ごとコピー ② `launcher.html` にカード・表 ③ 下の「状態」 ④ 「確認のしかた」を通す ⑤ 公開前チェック → コミット（push はユーザー）。
- **ユーザーの好み**: さわって試せて目の前で反応するもの（眺めるだけは合わない）。正確さ重視、出どころを画面に（確かめたものだけ）。

## ファイル構成

| ファイル | 中身 | 主な名前 |
|---|---|---|
| `index.html` | 骨組み（doctype なし）。読み込み順: crypto → model → stage → flows → ui → main。左＝モード `#segMode`・速さ `#segSpeed`・`#btnReset`、舞台 `#world`（`#aPhone` `#aBrowser` `#aServer` `#aThief`、線 `#wires`、小包 `#packets`）、説明 `#narr`、記録 `#log`、中身 `#insp`。右＝実験 `#exps`、見つけてみよう `#quests`、解説・出どころ `#srcList` | |
| `css/style.css` | PC は右パネル 370px。舞台は3列（1100px 以下で2列、560px 以下で1列）。820px 以下はパネルが下、説明 `#narr` は下に固定 | |
| `js/crypto.js` | Web Crypto の薄い包み: `rand` `hex` `b64url` `cat` `same` `sha256` `genKeyPair`（秘密鍵は extractable: false）`exportPub` `importPub` `sign` `verify` `pbkdf2`、authenticator data `makeAuthData` `parseAuthData`、`FLAG` | `enc` `dec` |
| `js/model.js` | 世界 `W`、サイト `SITES`（架空、.example）、`USER` `PASSWORDS` `PW_ITER` `GUESSES`、`resetWorld` `makeServer`。手順: `rpIdAllowed`（ブラウザの決まり）、`clientDataJSON`、`coseKey`、サーバー `newChallenge` `serverFinishRegistration` `serverVerifyAssertion`（§7.2 の確認9つ）`serverCheckPassword`、スマホ `credFor` `phoneMakeCredential` `phoneGetAssertion` | |
| `js/stage.js` | 表示の状態 `ST`、`renderPhone` `phoneUI` `touchFinger`（長押し）、`renderBrowser`（中のサイトのページ）、`renderServer` `showChecks`（確認を1つずつ）、`renderThief` `loot`、線 `drawWires` `anchor`、小包 `fly`（`pauseMid` で途中で止める）`move`（裏のタブでも止まらない）、`renderLog`、`narr` `ask` `want`（光らせて押されるのを待つ）、`waitable` `abortWaits` | `COL` `ACTOR` `NAME` |
| `js/flows.js` | 小包の中身 `F`、`registerFlow` `loginFlow`（偽サイトのときはわるものが本物のチャレンジをもらって頼む）`pwLoginFlow` `thiefPwLogin`、`ensurePasskey` `needPk` `calm`、実験 `EXP.basic/phish/leak/replay/tamper/lost/second` | |
| `js/ui.js` | 実験の一覧 `EXPS` `buildExps`（`TRIED`）、見つけてみよう `QUESTS` `quest`（localStorage `pk.done`）、出どころ `SRC`、中身 `showPacket`（書きかえモードはバイトを押すと1ビット反転）`editByte` `showKey`（秘密鍵の取り出しを本当にためす）`showKeysCompare`、`wirePage`（実験中でないときのページのボタン）、`syncControls` | |
| `js/main.js` | `run`（同時に1つ。新しいのが来たら前の待ちを abort）、`startExp`、アドレスバー `buildAddrMenu`、`resetAll`、`wire`、`init`、`window.__pk` | |

## しくみ

### 1. 登録（WebAuthn §7.1 を簡単に）
ブラウザ→サーバー「作りたい」→ サーバーがチャレンジ（32 バイト）と rp.id → ブラウザが rp.id とページの住所を確かめ、clientDataJSON（`type: webauthn.create`）を作る → スマホで指紋（長押し）→ 鍵の組を作り、秘密鍵を金庫へ → authenticatorData（rpIdHash・フラグ UP|UV|BE|BS|AT・回数 0・aaguid 0・鍵の ID・COSE の公開鍵）→ サーバーが type・チャレンジ・origin・rpIdHash・UP・UV を確かめて公開鍵を保存。attestation は none（署名なし）。

### 2. ログイン（§7.2）
チャレンジ → clientDataJSON（`webauthn.get`）→ スマホが rpId の鍵を探す → 指紋 → 回数 +1、authenticatorData（37 バイト）‖ SHA-256(clientDataJSON) に ECDSA P-256 で署名 → サーバーの確認9つ: 知っている鍵・type・チャレンジ・origin・rpIdHash・UP・UV・署名・回数。チャレンジは1回使ったら消す。

### 3. 実験
| 実験 | パスキー | パスワード |
|---|---|---|
| 偽サイト `donguri-bamk.example` | わるものが本物のチャレンジをもらい rp.id＝本物で頼む → `rpIdAllowed` で**ブラウザが止める**。続けて偽サイト自身の名前で頼む → スマホに鍵がない | 打ちこんだパスワードがわるものへ → 本物にログインされる |
| データの流出 | 盗めるのは公開鍵。わるものが自分の鍵で署名を作る → 署名 ✕ | ソルト＋ハッシュ。`GUESSES` 12個を本物の PBKDF2 でためす。弱い（donguri2024）は当たる、強いは当たらない |
| 使い回し | 記録した返事を次の日に → チャレンジ ✕・回数 ✕（署名は ✓） | 記録したパスワードで入られる |
| 書きかえ | 小包が途中で止まり、`#insp` でバイトを押すと1ビット反転 → 署名 ✕（チャレンジや origin の文字なら、その確認も ✕） | パスキーだけ |
| スマホを落とした | 指紋が合わない → PIN 5つ ✕ → `exportKey` を本当に呼んで断られる（InvalidAccessError） | パスキーだけ |
| 2つめのサイト `neko-shop.example` | 鍵が別（金庫で比べる）。ねこ商店の返事を銀行へ → 鍵・origin・rpIdHash・署名 ✕ | 同じパスワードがねこ商店にそのまま届き、銀行にも入られる |

- 2つのサイトの tanuki は**同じパスワード**（使い回しの実験のため）。`W.strength` を流出の実験で切りかえる。
- 署名は Web Crypto の r‖s 64 バイト（本物の WebAuthn は DER）。画面にも書いた。
- 回数は使うたびに +1（同期するパスキーでは 0 のままのことが多い、と画面に書いた）。

## ハマったところ
- Browser ペインが裏に回ると Web Animations が止まり、`finished` が来ないので流れが止まる → `move()` でタイマーと競争させ、時間が来たら `finish()`。
- 実験の途中で別の実験を押すと、前の流れが待ちのまま残る → `waitable()` で待ちを登録し、`run()` が `abortWaits()` で全部 reject（`ST.aborting` の間に作られた待ちもすぐ reject）。
- 書きかえた小包のバイトが、前の小包（スマホ→ブラウザ）にも反映された（同じ配列を共有）→ ブラウザ→サーバーの小包は `slice()` でコピーした `sent` を送る。

## 確認のしかた（変更のたびに）
1. 開いて `__pkErr` がないこと。コンソールで `__pk.auto(true)` のあと、パスキー・パスワードそれぞれで `EXP` の7つを `run` で回し、エラーがなく、サーバーの確認が次のとおり（2026-10-08）: パスキー basic 全部 ✓、leak は署名だけ ✕、replay はチャレンジと回数が ✕、tamper は署名 ✕、second は鍵・チャレンジ・origin・rpIdHash・署名・回数 ✕（回数はそのときの数しだい）。パスワード basic・phish・leak（弱い）・replay・second は ✓✓（わるものが入れる）。phish（パスキー）はブラウザで止まり、続きでスマホに鍵なし。
2. `auto(false)` で「1 ふつうにログイン」を手で: 「パスキーを作る」が光る → 押す → 小包が飛ぶ → 指紋を長押し → 金庫に鍵 → サーバーの確認 → 「パスキーでログイン」→ 全部 ✓。記録の小包を押すと `#insp` に色分けのバイト列とフラグ。
3. 「5 書きかえ」: 小包が止まり、バイトを押すと赤くなる → 「このまま送る」→ 署名 ✕。
4. 金庫の鍵を押すと「取り出せません（InvalidAccessError）」。
5. アドレスバーで偽サイトを選ぶと、住所の bamk が赤く、わるものの線が濃くなる。
6. スマホ（375×812）: 横にはみ出さない、説明が下に固定、実験を押すと舞台までスクロール。

## 状態
- 2026-10-08 v1（`versions/v001-first`）: 段階A。登録・ログイン（本物の ECDSA P-256・SHA-256・PBKDF2）、実験7つ×パスワード／パスキー、中身のバイト列と書きかえ、確認リスト、見つけてみよう9つ、解説・おもな出どころ9件。
