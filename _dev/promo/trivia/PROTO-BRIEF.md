# うんちくショートの試作の決まり（サブエージェント向け、2026-11-03）

ユーザーが「全部試作」と言った。台本（`_dev/promo/trivia/<app>.md`）を、見て選べる動画にする。完成品ではなく「型と話を選ぶための試作」。

## 手本（まず読む）
- `_dev/promo/trivia-kit.js`（部品: TK.bg・TK.hook・TK.text/lines（`[ ]` で色）・TK.card・TK.count・TK.bars・TK.choices（当ててみて・考える時間の輪）・TK.clock（型C の時計）・TK.note・TK.subtitle・効果音 cues・triviaStart）
- `_dev/promo/tiny-earth-trivia1.html`（見本。Canvas だけで描いた 32 秒）
- 座標は 1080×1920。**画面の下 25%（y 1440〜）と右はし 120px は YouTube の表示がかかる**ので、大事なものを置かない。焼きこみ字幕は y≈1180、注は y≈1370（部品の既定）。絵の主役は y 150〜1100。

## 作るもの（1本ごと）
1. `_dev/promo/<app>-trivia<番号>.html`（番号は台本の番号。**同じ名前のファイルがもうあれば上書きしない**。次のあいている番号にして、proto の json にもとの台本番号を書く）。
2. 絵: **ふつうは Canvas だけ**（アプリを開かない）。台本に「アプリの録画」とあっても、同じことが簡単な図・計算のアニメで見せられるならそれでよい（アプリの説明はしないので）。アプリの録画がどうしても要るときだけ、その台本ページで promoStart を使う既存のショート（`_dev/promo/<app>.html`・`<app>-common.js`）を手本にする。写真・他人の絵・キャラは使わない。線の図・濃い紺の背景（いつもの作風）。
3. 字幕: 台本の「しゃべり／字幕」を subs に（ja と en）。しゃべり (2)（合成の声）の台本も、いまは字幕だけで作る（声はまだ入れていない。セリフはそのまま字幕にしておけば、あとで声を足せる）。フックの画面で大きな文字を出しているあいだは `noBurn: true`。
4. 出どころ・推定の注は画面に（TK.note。最後の数秒に出どころ）。台本の「推定・注意」・REVIEW.md の直しを守る。数字は台本のとおり（自分で変えない。まちがいに気づいたら直さず proto の json の notes に書く）。
5. 確かめ: リポジトリのルートで
   `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/record-promo.ps1 -Script <名前> -Short -NoRecord -Peek "1,5,..." -DebugPort <あなたの番号>`
   → `_dev/promo/out/peek-<名前>-short.jpg` を Read で見る。文字の重なり・はみ出し・下25%にかかっていないか・絵が小さすぎないか。直すのは2回まで。
6. 録画: 同じコマンドから `-NoRecord -Peek ...` を外して `-Check "1,10,20"`。できたら `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/check-loudness.ps1` で自分の分が OK か。
7. 見終わった peek-・check- の jpg は消す（mp4・srt は残す）。
8. `_dev/promo/trivia/proto/<app>.json` に1本ずつ: `{ "id": "<台本番号>", "page": "<名前>", "mp4": "out/<名前>-short.mp4", "type": "A", "title": "題名", "dur": 秒, "voice": "台本の (1)(2)(3)", "app_footage": false, "notes": "気づいたこと・確かめ残し" }`（配列）。

## してはいけないこと
- アプリのファイル・promo.js・promo-audio.js・trivia-kit.js・ほかの人の担当のファイルを変えない（部品が足りなければ自分のページの中に書く。共通にしたほうがよい部品は json の notes に提案として書く）。
- git commit・push・YouTube へのアップロードをしない。
- サーバーはポート 8765 がもう動いている（起動しない）。DebugPort は自分の番号だけ使う（ほかの人とぶつかると Chrome が混ざる）。
- 録画は1本ずつ順に（自分の中で同時に2本録らない）。

## 順番
担当の中で、REVIEW.md の上位15本・次点を先に。REVIEW.md の「捨てていいもの」に入っている番号は作らない。時間・文脈が足りなくなったら、そこでやめて、残りを報告する。

## 最後の返事（短く）
作った本数・ページ名、作れなかった・やめたものとその理由、共通の部品にしたほうがよいもの。
