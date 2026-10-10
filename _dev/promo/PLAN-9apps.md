# 紹介動画 9本ぶんの台本（下書き）

2026-10-10。入口に載っているアプリのうち、まだ動画のない9本（量子・電波・いきもの・免疫・神の視点・さなぎ・空気・進化の箱庭・カビ）。
ここで決めるのは中身だけ（場面・字幕・YouTube の文）。**録画はユーザーの指示があってから**。決まったら `<app>.html`・`<app>-guide.html`・`<out>.upload.json` に写す。

## 状態と、録画の始め方（引き継ぎ。2026-10-10）
**台本 18本と YouTube の文面 18本はできている。録画はまだ（ユーザーの指示を待つ）。録画したらストックし、YouTube には1日1本ずつ上げる。**

| アプリ | ショート | 説明動画 | 共通の部品 | upload.json |
|---|---|---|---|---|
| 量子の実験室 | `quantum.html?short` | `quantum-guide.html` | `quantum-common.js` | `quantum-short`・`quantum-guide` |
| 電波の見える部屋 | `wifi-wave.html?short` | `wifi-wave-guide.html` | `wifi-common.js` | `wifi-wave-short`・`-guide` |
| いきものの感じる世界 | `animal-senses.html?short` | `animal-senses-guide.html` | `animal-common.js` | 同じ形 |
| 免疫のたたかい | `immune-battle.html?short` | `immune-battle-guide.html` | `immune-common.js` | 同じ形 |
| さなぎの中で | `metamorphosis.html?short` | `metamorphosis-guide.html` | `metamorphosis-common.js` | 同じ形 |
| 空気の流れの見える部屋 | `air-flow.html?short` | `air-flow-guide.html` | `air-flow-common.js` | 同じ形 |
| 進化の箱庭 | `ga-creatures.html?short` | `ga-creatures-guide.html` | `ga-common.js` | 同じ形 |
| カビが育つまで | `mold-growth.html?short` | `mold-growth-guide.html` | `mold-common.js` | 同じ形 |
| 神の視点マップ | `god-view.html?short` | `god-view-guide.html` | `god-view-common.js` | 同じ形 |

録画の手順（1本ずつ）:
1. 確認用サーバー（`.claude/launch.json` の `apps`〜`apps-6` のうち空いているもの。2026-10-10 は 8765 が使えず、8768〜8770 は別のセッションが使っていたので `apps-3`＝8767）で `http://localhost:<port>/_dev/promo/<台本>` を開く。
2. ログに「字幕データを保存した」が出て、ボタンが「録画する」になるまで待つ（神の視点マップは十数秒）。
3. 要所を確かめるなら `await __peekSheet([秒…], 'peek-x')` → `out/peek-x.jpg` を見る（見終わったら消す）。
4. `__promoRecord()`（またはボタン）。終わると `out/<out>.mp4` に保存される。mp4 から数コマ取り出して確かめる（README の「作り方」6）。
5. 録れたら upload.json は用意してあるので、上げるのはユーザーの GO のあと（1日1本、`publishAt` で夜に予約）。上げたら `videoId` を書く。

録画で気をつけること:
- **神の視点マップ**は外のデータを読む。1コマごとに地図の読みこみを待つので（最大6秒）、155秒の説明動画は数十分〜1時間ほどかかる見込み。通信が安定しているときに。録ったあと、地図がぼやけたまま・建物が抜けたコマがないかを特に確かめる（確かめ用のコマは、とびとびに描くので読みこみ途中のことが多い。続けて描けばきれいになるのは東京駅の場面で確かめた）。地震・人工衛星・電車とバスは録った日のデータなので、`god-view-guide.upload.json` の説明欄の「2026年◯月◯日」を録った日に書きかえる。
- 神の視点マップのアプリ本体は、EOX の画像を NASA Blue Marble に置きかえ、天気（Open-Meteo）もやめた（god-view v012b、2026-10-10 に commit 済み）。録る前に `god-view/js/sources.js` の `GV.BASES.photo.world` が gibs.earthdata.nasa.gov のままか確かめる。
- 英語対応のアプリが増えたら（入口の `APPS` に `en:true`）、その upload.json の英語の説明を「App (switch to English with the EN button)」に、説明動画の台本の `guideSubs` の最後の引数を EN ボタンの文にそろえる（2026-10-10 時点で、免疫・神の視点マップだけがまだ日本語のみ）。
- 空気の流れ: 「24時間換気だけ」の換気回数はアプリの値で 0.67 回/時（字幕は「法律の目安は0.5回」なので矛盾しない）。
- カビ: 「表面は消えても、奥に残ったものがあるとまた生える」は塩素の効く深さのモデルのとおりか、録ったあとに説明動画の 1:08〜1:20 を見て確かめる。違って見えたら字幕を「乾かさないとまた生える」に寄せる（ショートはそう書いてある）。
- アプリの英語対応は別のセッションで進んでいる。動画は日本語で録る（台本は `?lang=ja` で開く・`inject` のときは言語の記憶を `ja` に見せる）。

下書きから変えたところ:
- いきもの（ショート）: 最後をハエ → ネコ（暗い所。左半分は人間）に。縦長だとハエの六角形がつぶれるため。
- 量子（説明動画）: トンネル効果を3つの字幕に分けた（壁を厚くする場面を足した）。
- 空気（英語名）: 入口に合わせて「Seeing Airflow at Home」。電波は「Seeing WiFi at Home」。
- 英語対応のアプリ（量子・電波・いきもの・さなぎ・空気・進化の箱庭・カビ）は、英語の説明・最後の字幕を「EN ボタンで英語に切りかえられる」に。英語のタイトルは100字まで（YouTube の上限）に短くした。

## 9本に共通の決まり（README「毎回まもること」のとおり）
- ショート `<app>.html?short`: 縦 2160×3840、本編 40秒＋しし屋の締め 5秒＝45秒。日本語の字幕は下寄りに焼きこみ。左上の小さい目印は入れない。
- 説明動画 `<app>-guide.html`: 横 3840×2160、本編 150秒＋締め 5秒＝155秒。日本語は**上**に焼きこみ、最初に「CC: English subtitles」。はじまり 0.3秒から左上に小さい目印。
- 英語は字幕データ（CC）と、英語のタイトル・説明（「アプリの文字はいまは日本語」と書く）。
- 最初のカットは入口のサムネイルに近い絵。生き物などの名前を画面に出す。
- 終わりの画面（`drawEnd`）に出どころ。説明欄にも。
- BGM はコードで合成した音だけ（`drone`＝暗い・宇宙、`journey`＝明るい和音）。作るたびに権利の確認をユーザーに伝える。
- 点滅に注意: 電波（波の表示）・いきもの（灯りのちらつきは切のまま）。
- 説明欄: 「アプリ: URL」と「しし屋 まなびラボ（ほかのアプリ）: URL」の間を1行あける。URL は `https://sishiya.github.io/manabi-lab/<app>/`。
- 予定のアップロードは非公開（`private`）。上げる・予約はユーザーの GO のあと。

---

## 1. 量子の実験室（quantum）　BGM: drone（root 65）

### ショート（40秒）「電子を1個ずつ飛ばすと、しまができる」
| 秒 | 絵 | 字幕（日） | 英語（CC） |
|---|---|---|---|
| 0.6–5.6 | 二重スリット。点が1つずつ当たりはじめる | **量子の実験室** / 電子を1個ずつ飛ばすと、何が起きる？ | Quantum Lab / What happens if you fire electrons one at a time? |
| 6–13 | 1個ずつ（ゆっくり） | 1個ずつ飛ばすと、点はばらばらに当たる / どこに当たるかは、毎回わからない | Fired one by one, they land at random spots / You can never tell where the next one will land |
| 13.5–21 | 1000個まとめて → しまが育つ | たくさん集めると、しま模様が現れる / 2つのスリットを通った波が、重なった跡 | Collect many and stripes appear / The mark of waves from both slits overlapping |
| 21.5–28 | 「通り道を調べる（検出器をつける）」→ スクリーンを消して打ち直し | どちらを通ったか調べると、しまが消える / なだらかな山が1つになる | Check which slit each one went through, and the stripes vanish / You get one smooth hump instead |
| 28.5–35 | トンネル効果: 波束が壁にぶつかり、一部が向こうへ | 壁を通り抜ける粒子もいる（トンネル効果） / 跳ね返るはずが、ある割合で向こう側へ | Some particles pass through a wall (quantum tunneling) / Part of the wave gets through instead of bouncing back |
| 35.2–40 | 終わりの画面 | 量子の実験室 / ブラウザで動かせます。5つの実験を手で試せます | Quantum Lab / Runs in your browser. Try five experiments yourself |

- 注意: 検出器ありは「2本の帯」ではなく「なだらかな山」（アプリの最初の設定。DEVNOTES の v1k）。字幕もそれに合わせた。

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 二重スリット | 量子の実験室 / 使い方と見どころ | Quantum Lab / How to use the app and what to look for |
| 0:07 | 二重スリット | 上のタブ「二重スリット」→「1000個まとめて」 | 上のタブで5つの実験を切りかえる / まずは二重スリット。「1000個まとめて」でしまが育つ | Switch between five experiments with the tabs / First, the double slit. "Fire 1000 at once" grows the stripes |
| | | 「装置」で「上だけ」→「2本」 | スリットを片方だけにすると、しまは出ない / 2本あけたときだけ、波が重なって打ち消し合う | With only one slit open, there are no stripes / Only with two slits do the waves overlap and cancel |
| | | 「通り道を調べる（検出器をつける）」 | 検出器で通り道を調べると、しまが消える / 見るだけで結果が変わる | Watch which slit they pass, and the stripes disappear / Just looking changes the result |
| | | 「スリットを広く・離す」 | スリットを広く離すと、2本の帯に分かれる / よく見る図は、2つの場合をまとめた説明用の絵 | Wide, far-apart slits give two bands / The familiar textbook picture combines two different cases |
| 0:42 | トンネル効果 | エネルギー・壁の厚さを動かして「もう一度発射」 | トンネル効果: 壁より低いエネルギーでも、一部が通り抜ける / 壁が厚いほど、通り抜ける割合はぐっと減る | Tunneling: even below the wall's height, part gets through / The thicker the wall, the smaller the share |
| | | 「いま測る（粒子を見つける）」 | 測ると、粒子はどちらか一方で見つかる / 星の核融合やフラッシュメモリにも関わるしくみ | Measure, and the particle is found on one side only / The same effect powers stars and flash memory |
| 1:07 | 3枚の偏光板 | 「直交の2枚」→「間に 45° を入れる」 | 向きが直角の2枚の偏光板は、光をほぼ通さない / 間に45°の板を入れると、約12.5%が通るようになる | Two crossed polarizers block almost all light / Add a 45° one in between and about 12.5% gets through |
| 1:27 | 量子もつれとベルテスト | 「500組まとめて」→「ベルテストを実行」（量子もつれ／隠れた変数） | 2つの光子の測定結果が、離れていてもそろう / ベルテスト: 量子は S≈2.83、「隠れた変数」では 2 をこえない | Two photons' results match even when far apart / Bell test: quantum gives S≈2.83; hidden variables can't beat 2 |
| | | | 実際の実験でも 2 をこえた（2022年ノーベル物理学賞） | Real experiments beat 2 as well (Nobel Prize in Physics 2022) |
| 1:55 | 不確定性原理 | 「位置を測る」→「運動量を測る」 | 位置を測ると波がせまくなり、運動量の広がりが大きくなる / 両方を同時に小さくはできない（Δx·Δp ≥ ħ/2） | Measuring position narrows the wave but widens momentum / You can't shrink both at once (Δx·Δp ≥ ħ/2) |
| 2:14 | 説明を読む | 右の「やってみよう」「なにが起きている？」 | 各実験に「やってみよう」と「なにが起きている？」 / 画面の下に、もとにした論文と教科書 | Each experiment has "Try this" and "What's happening?" / Sources are listed at the bottom of the page |
| 2:22 | 終わり | 終わりの画面 | 量子の実験室 / ブラウザで動かせます（パソコン・スマホ） | Quantum Lab / Runs in your browser (PC or phone). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「電子を1個ずつ飛ばすと、しま模様が現れる ― 二重スリット実験 #Shorts」／ "Fire Electrons One at a Time and Stripes Appear ― The Double-Slit Experiment #Shorts"
- 説明動画: 「量子の実験室 ― 使い方と見どころ（二重スリット・トンネル効果・偏光板・量子もつれ・不確定性原理）」／ "Quantum Lab ― App Guide: Double Slit, Tunneling, Polarizers, Entanglement and Uncertainty"
- 説明の1文目: 量子のふしぎな性質を、5つの実験を手で動かして確かめるブラウザのアプリ「量子の実験室」から。／ From "Quantum Lab", a browser app where you test the strange behavior of quantum particles with five hands-on experiments.
- タグ: 量子力学, 二重スリット, トンネル効果, 量子もつれ, 不確定性原理, 物理, まなびラボ, しし屋, quantum mechanics, double slit experiment, quantum tunneling, entanglement, Bell test
- 出どころ（終わりの画面）: Feynman ほか（1965）『The Feynman Lectures on Physics』第3巻、Tonomura ほか（1989）Am. J. Phys. 57 ほか
- 説明欄にはもう少し: Bell（1964）、CHSH（1969）、Aspect ほか（1982）、Heisenberg（1927）、Kennard（1927）。「寸法などは見やすく選んだ値」の一文。

---

## 2. 電波の見える部屋（wifi-wave）　BGM: drone（root 73）

### ショート（40秒）「WiFi の電波は、家の中をこう伝わる」
| 秒 | 絵 | 字幕（日） | 英語 |
|---|---|---|---|
| 0.6–5.6 | 2LDK、玄関のルーターから波が広がる（波の動き） | **電波の見える部屋** / WiFi の電波が、家の中をどう伝わるか | Seeing WiFi Waves / How WiFi actually travels through a home |
| 6–13 | 波が壁で弱まり、部屋に回りこむ | 壁を通るたびに弱まり、すき間から回りこむ / 電磁波の式を、0.75cm のマス目で計算している | Each wall weakens it, and it bends through gaps / Calculated from the equations of electromagnetism on a 0.75 cm grid |
| 13.5–21 | 「電波の強さ」に切りかえ。まだら模様 | 強さで見ると、まだら模様（干渉） / 数cm 動くだけで、強さが変わる | Viewed by strength, it's patchy (interference) / Move a few centimeters and the signal changes |
| 21.5–28 | ルーターをドラッグで部屋の真ん中へ | ルーターの場所を変えると、届き方が変わる / 玄関から家の真ん中へ | Move the router and the coverage changes / From the entrance to the middle of the home |
| 28.5–35 | 2.4 GHz → 5 GHz | 5 GHz は、壁の向こうで弱まりやすい / 2.4 GHz は遠くまで届き、5 GHz は速いが届きにくい | 5 GHz fades more behind walls / 2.4 GHz reaches farther; 5 GHz is faster but shorter-range |
| 35.2–40 | 終わり | 電波の見える部屋 / ブラウザで動かせます。壁を描いて試せます | Seeing WiFi Waves / Runs in your browser. Draw your own walls and test |

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 2LDK・波の動き | 電波の見える部屋 / 使い方と見どころ | Seeing WiFi Waves / How to use the app and what to look for |
| 0:07 | 波の動きと強さ | 表示「波の動き」→「電波の強さ」 | 真上から見た 2LDK。ルーターから出た波が進む / 「電波の強さ」でアンテナの本数の目安が分かる | A 2-bedroom flat seen from above, with waves leaving the router / "Signal strength" shows roughly how many bars you'd get |
| 0:30 | ルーターとスマホを動かす | ルーター・スマホをドラッグ。数字のカード | ルーターとスマホは、ドラッグで動かせる / スマホの場所の強さと、「壁がなければ」の値 | Drag the router and the phone / See the signal at the phone, and what it would be without walls |
| 0:52 | 2.4 GHz と 5 GHz | 周波数を切りかえ | 5 GHz は波長が約6cm、2.4 GHz は約12cm / 壁で弱まる量がちがう | 5 GHz has a ~6 cm wavelength, 2.4 GHz ~12 cm / Walls weaken them by different amounts |
| 1:10 | 壁の比べっこ | 「間取り・実験」→「壁の比べっこ」 | 7つの通路に1種類ずつ壁を置いて比べる / コンクリートは大きく弱め、金属は通さない | Seven lanes, each with one kind of wall / Concrete weakens it a lot; metal blocks it |
| 1:32 | すき間の実験 | 「すき間の実験」 | 金属の板のすき間から、電波は回りこむ（回折） / すき間が半波長より細いと、ほとんど通らない | Waves bend through gaps in a metal plate (diffraction) / Gaps narrower than half a wavelength let almost nothing through |
| 1:52 | 壁を描く | 「壁を描く」→ 材料を選んでドラッグ →「元に戻す」 | 材料を選んでドラッグすると、壁が描ける / 自分の家に近い間取りでも試せる | Pick a material and drag to draw a wall / Try a layout like your own home |
| 2:10 | 解説 | 右の「解説」 | 壁の材料の値は ITU-R の勧告から / 受信の強さの境目などは目安。体への影響を示すものではない | Wall material values come from ITU-R recommendations / Signal thresholds are rough guides, and nothing here is about health effects |
| 2:22 | 終わり | | 電波の見える部屋 / ブラウザで動かせます（パソコン・スマホ） | Seeing WiFi Waves / Runs in your browser (PC or phone). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「WiFi の電波は、家の中をこう伝わる ― 電磁波のシミュレーション #Shorts」／ "This Is How WiFi Travels Through Your Home ― An Electromagnetic Wave Simulation #Shorts"
- 説明動画: 「電波の見える部屋 ― 使い方と見どころ（ルーターの場所・2.4GHz と 5GHz・壁の比べっこ・すき間・壁を描く）」／ "Seeing WiFi Waves ― App Guide: Router Placement, 2.4 vs 5 GHz, Walls, Gaps and Drawing Your Own"
- 説明の1文目: WiFi の電波が家の中をどう伝わり、壁でどう弱まるかを、電磁波の式で計算して見るブラウザのアプリ「電波の見える部屋」から。／ From "Seeing WiFi Waves", a browser app that calculates how WiFi travels through a home and weakens at walls.
- タグ: WiFi, 電波, 電磁波, ルーター, シミュレーション, 物理, まなびラボ, しし屋, WiFi signal, router placement, electromagnetic waves, FDTD, simulation
- 出どころ: ITU-R P.2040-3（2023）、ITU-R P.525、IEEE 802.11、Taflove と Hagness（2005）、Gabriel（1996）。「人の体の値・受信の境目・ルーターの出力・壁の厚さは目安」。
- 注意: 波の表示の点滅は WCAG の基準より下（DEVNOTES の測定）。録画では速さを上げすぎない（1コマ8ステップまで）。

---

## 3. いきものの感じる世界（animal-senses）　BGM: journey（root 130.8）

### ショート（40秒）「同じ庭を、動物の目で見ると」
| 秒 | 絵 | 字幕（日） | 英語 |
|---|---|---|---|
| 0.6–5.6 | 人間・昼・庭（左上に「人間」） | **いきものの感じる世界** / 同じ庭を、いろいろな動物の感覚で | How Animals Sense the World / The same garden, through different animals' senses |
| 6–12 | カラス・昼・「ヒマワリ」（紫で重ねる） | **カラス**: 紫外線が見える / ヒマワリの花びらの先が、紫外線で光って見える | **Crow**: sees ultraviolet / The sunflower's petal tips glow in UV |
| 12.5–19 | マムシ・夜・「ネズミ」 | **マムシ**: まっくらでも、熱が見える / 鼻のくぼみ（ピット器官）で、ネズミの体温をとらえる | **Pit viper**: sees heat in total darkness / Its pit organs pick up a mouse's body heat |
| 19.5–26 | コウモリ・夜・「玄関の灯りのガ」 | **コウモリ**: こだまで見る / 声の返ってきた所だけが浮かび上がる | **Bat**: sees with echoes / Only what bounces its call back shows up |
| 26.5–33 | ハエ（六角形の全周） | **ハエ**: ほぼ全周が見え、時間がゆっくり / ハエたたきも、よけられる | **Fly**: sees almost all around, and time feels slow / It can dodge the swatter |
| 33.5–35 | ミツバチ（空の偏光） or ネコ・夜 | （字幕なし） | |
| 35.2–40 | 終わり | いきものの感じる世界 / ブラウザで動かせます。14の見え方を切りかえられます | How Animals Sense the World / Runs in your browser. Switch between 14 ways of seeing |

- 「見え方は研究をもとに置き換えたもの。本当にこう感じているかは分からない」を終わりの画面の小さい字に入れる。

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 人間・昼 | いきものの感じる世界 / 使い方と見どころ | How Animals Sense the World / How to use the app and what to look for |
| 0:07 | 動き方と見どころ | ドラッグで見回す・W で進む・右の「見どころ」 | ドラッグで見たい方を向き、W・矢印で歩く / 右の「見どころ」を押すと、その場所へ | Drag to look around; W or the arrows to walk / Tap a spot under "Highlights" to jump there |
| 0:25 | カラス: 紫外線 | カラス → 「ゴミ袋」「紫外線だけ」 | カラスは紫外線が見える（人には見えない光） / 黄色いゴミ袋は、紫外線で中身が見えにくい（推定） | Crows see ultraviolet, invisible to us / Yellow garbage bags hide their contents in UV (estimate) |
| 0:45 | マムシ: 熱 | マムシ・夜 → 「ネズミ」「窓の中の人」 | 熱はガラスを通らないので、窓の中の人は光らない / 熱の像はぼやけるが、目の像と重ねて見ている | Heat doesn't pass through glass, so the person inside doesn't glow / The heat image is blurry, but it's overlaid on what the eyes see |
| 1:03 | コウモリ: こだま | コウモリ → ガへ近づく（「こだまを聞く」は音を入れない） | ガに近づくと、鳴く間隔がどんどん短くなる / 捕まえた数が増えていく | Get close to a moth and the calls speed up / Your catch count goes up |
| 1:20 | ハエとミツバチ | ハエ（ハエたたき）→ ミツバチ「空を見上げる」 | ハエはほぼ全周が見え、時間がゆっくり流れる / ミツバチは空の偏光（光のゆれの向き）で方角を知る | A fly sees almost all around and time runs slow / Bees read the polarization of skylight to find direction |
| 1:40 | イヌ・ネコ・シャコ | イヌ「ボール」→ ネコ・夜 → シャコ | イヌには、赤いボールが芝生と同じような色に / ネコは暗い所で人の約5倍見える | To a dog, a red ball looks like the grass / Cats see about five times better than us in the dark |
| 2:00 | ヒトの見え方・道具 | 「比べる表示」で左が人間。近視・遠視（老眼 60歳）、サーモ | 「比べる表示」で、左半分を人間の見え方に / 近視・老眼・色覚・弱視も、サーモカメラも | "Compare" puts the human view on the left half / Also nearsight, age, color vision, low vision, and a thermal camera |
| 2:22 | 終わり | | いきものの感じる世界 / ブラウザで動かせます（パソコン・スマホ） | How Animals Sense the World / Runs in your browser (PC or phone). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「同じ庭を、カラス・マムシ・コウモリ・ハエの感覚で見ると #Shorts」／ "The Same Garden Through the Senses of a Crow, a Pit Viper, a Bat and a Fly #Shorts"
- 説明動画: 「いきものの感じる世界 ― 使い方と見どころ（紫外線・熱・こだま・複眼・偏光・ヒトの見え方）」／ "How Animals Sense the World ― App Guide: Ultraviolet, Heat, Echoes, Compound Eyes, Polarization and Human Vision"
- 説明の1文目: 同じ庭を、人間・カラス・マムシ・コウモリなどの感覚で一人称で見るブラウザのアプリ「いきものの感じる世界」から。人に見えない紫外線や熱は、見える色に置き換えて表示しています。／ From "How Animals Sense the World", a browser app that shows the same garden through the senses of humans, crows, pit vipers, bats and more. Ultraviolet and heat are shown as visible colors.
- タグ: 動物の見え方, 紫外線, ピット器官, エコーロケーション, 複眼, 色覚, まなびラボ, しし屋, animal vision, ultraviolet, pit viper, echolocation, compound eye
- 出どころ（終わりの画面）: Ödeen と Håstad（2003）、Gracheva ほか（2010）Nature、Griffin ほか（1960）ほか（アプリの「このアプリについて」→「おもな出どころ」）
- 注意: 「灯りのちらつきを見る」は切のまま（光過敏性発作への配慮）。見え方は推定で、診断には使えない、を説明欄に。

---

## 4. 免疫のたたかい（immune-battle）　BGM: drone（root 62）

### ショート（40秒）「インフルエンザが入ってから治るまで」
| 秒 | 絵 | 字幕（日） | 英語 |
|---|---|---|---|
| 0.6–5.6 | 鼻とのどの粘膜（インフルエンザ、健康な大人）。ウイルスが落ちてくる | **免疫のたたかい** / インフルエンザウイルスが、鼻に入ったら | The Immune Battle / When flu viruses land in your nose |
| 6–13 | ウイルスが細胞にくっつく→入る→出てくる（吹き出し①〜④） | ウイルスは細胞に入り、自分のコピーを作らせる / 1つの細胞から、何千個も出てくる | Viruses enter cells and make them copy the virus / Thousands come out of a single cell |
| 13.5–21 | 2〜3日目。数が爆発、熱（小窓） | 2日目に熱、3日目には数十億個に / 熱は、からだが戦っている合図 | Fever on day 2, billions of viruses by day 3 / Fever is a sign your body is fighting |
| 21.5–28 | 抗体（Y）・キラーT細胞が来る | 数日おくれて、抗体とキラーT細胞が来る / ウイルスをつかまえ、乗っ取られた細胞を壊す | A few days later, antibodies and killer T cells arrive / They catch the viruses and destroy hijacked cells |
| 28.5–35 | グラフ。8日目でウイルスが消える | 6日目に熱が下がり、8日目ごろウイルスが消える / 2回目は、記憶があるので軽くすむ | Fever breaks on day 6; the virus is gone around day 8 / Next time, memory makes it milder |
| 35.2–40 | 終わり | 免疫のたたかい / ブラウザで動かせます。ウイルス3つ・細菌3つ | The Immune Battle / Runs in your browser. Three viruses and three bacteria |

- 日数はアプリのモデル（健康な大人・10万個）の結果。学習用のモデルで、医療の判断には使えない、を終わりの画面と説明欄に。

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 鼻とのど | 免疫のたたかい / 使い方と見どころ | The Immune Battle / How to use the app and what to look for |
| 0:07 | 画面の見かた | 上の「いまの状況」・下のグラフ・小窓 | 大きな画面はミクロの断面、右上の小窓は体のどこか / 上に「いまの状況」、下に数のグラフ | The big view is a microscopic cross-section; the small window shows where in the body / "Current status" at the top, counts in the graph below |
| 0:28 | 入ってくるもの・からだ | 「入ってくるもの」「からだ」「数を調整する」 | ウイルス3つ（インフル・コロナ・ノロ）と細菌3つ / 子ども・高齢者・免疫が弱い人でくらべる | Three viruses (flu, COVID, norovirus) and three bacteria / Compare children, older people and weakened immunity |
| 0:48 | 時間とズーム | 速さ「＋」、ホイールで 細胞の中 → 頭 → 全身 | 時間は速くできる。ホイールで段階ごとに寄る・引く / 細胞の中から、頭の断面、全身まで | Speed up time. Scroll to zoom in steps / From inside a cell to a cross-section of the head to the whole body |
| 1:10 | くすり | インフル: 「オセルタミビル」 | くすりは、ウイルスが細胞から離れられなくする / 熱が出てすぐ始めると、熱の期間が約1日短くなる | The drug keeps new viruses stuck to the cell / Started soon after the fever, it shortens it by about a day |
| 1:30 | 細菌と抗生物質 | 黄色ブドウ球菌（皮膚の傷）→「セファレキシン」、耐性菌の切りかえ | 細菌には抗生物質。好中球が集まり、うみになる / 耐性菌（MRSA）には、同じくすりが効かない | Bacteria call for antibiotics. Neutrophils gather and form pus / The same drug doesn't work on resistant MRSA |
| 1:52 | 2回目・ワクチン | 「2回目の感染・ワクチン」 | 2回目は記憶の細胞がすぐ動き、軽くすむ / ワクチンは、本物が来る前に練習しておくしくみ | The second time, memory cells react fast and it's milder / A vaccine is practice before the real thing |
| 2:12 | ふしぎに答える | 右の「ふしぎに答える」 | 「なぜ高い熱が出るの？」などの答えも / 数値はよく知られた経過に合わせた目安 | Answers to questions like "Why do we get a high fever?" / Numbers are tuned to match well-known courses of illness |
| 2:22 | 終わり | | 免疫のたたかい / ブラウザで動かせます（パソコン・スマホ） | The Immune Battle / Runs in your browser (PC or phone). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「インフルエンザが鼻に入ってから治るまで、からだの中で起きること #Shorts」／ "What Happens Inside You From Catching the Flu to Getting Better #Shorts"
- 説明動画: 「免疫のたたかい ― 使い方と見どころ（ミクロの断面・ズーム・くすり・抗生物質・ワクチン）」／ "The Immune Battle ― App Guide: Microscopic View, Zoom, Medicines, Antibiotics and Vaccines"
- 説明の1文目: ウイルスや細菌がからだに入って増え、免疫に片づけられるまでを、ミクロの断面とグラフで見るブラウザのアプリ「免疫のたたかい」から。／ From "The Immune Battle", a browser app that shows viruses and bacteria entering the body, multiplying and being cleared by the immune system, in a microscopic view with graphs.
- タグ: 免疫, インフルエンザ, ウイルス, 細菌, 抗体, ワクチン, 抗生物質, まなびラボ, しし屋, immune system, influenza, antibodies, vaccine, antibiotics
- 出どころ: Baccam ほか（2006）J Virol、Elek（1957）、Teunis ほか（2008）J Med Virol、『Janeway's Immunobiology』など。「学習用のモデル。病気の診断や治療の判断には使えません」。
- 注意: 「おもな出どころ」は「このアプリについて」の中の「モデルの形と数値の参考」。

---

## 5. 神の視点マップ（god-view）　BGM: drone（root 55）

### ショート（40秒）「宇宙の果てから、クォークまで」
| 秒 | 絵 | 字幕（日） | 英語 |
|---|---|---|---|
| 0.6–5.6 | 東京駅のあたり、PLATEAU の建物（サムネイルと同じ） | **神の視点マップ** / ホイールひとつで、宇宙の果てから素粒子まで | God's-Eye Map / One scroll wheel, from the edge of the universe to subatomic particles |
| 6–14 | 引いていく: 街 → 日本 → 地球 | 本物の地形・航空写真・建物の地図 / 引いていくと、日本、そして地球 | A real map with terrain, aerial photos and buildings / Pull back to Japan, then the whole Earth |
| 14.5–21 | 太陽系 → 天の川銀河 → 宇宙の大規模構造 | さらに引くと、太陽系、天の川銀河 / 宇宙の果ては、約 10²⁷ m | Further out: the solar system, the Milky Way / The edge of the observable universe, about 10²⁷ m |
| 21.5–34 | 一気に寄る: 地面 → 岩・砂 → 原子 → 原子核 → クォーク | こんどは寄っていく。地面の岩、原子、原子核 / そしてクォーク、約 10⁻³⁵ m のプランク長まで | Now zoom in: rock in the ground, atoms, nuclei / Then quarks, down to the Planck length, about 10⁻³⁵ m |
| 34–35 | 画面の幅の数字（右上の目盛り） | | |
| 35.2–40 | 終わり | 神の視点マップ / ブラウザで動かせます。地球をちぎる実験も | God's-Eye Map / Runs in your browser. You can even tear a chunk out of the Earth |

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 東京の建物 | 神の視点マップ / 使い方と見どころ | God's-Eye Map / How to use the app and what to look for |
| 0:07 | 地図を動かす | ドラッグ・ホイール・右ドラッグで傾ける。地名検索 | ドラッグで動かし、ホイールで寄る・引く / 地名で探して、その場所へ飛べる | Drag to move, scroll to zoom / Search a place name to fly there |
| 0:27 | 建物と地下 | PLATEAU の建物 → 地面を透かして地下街 | 建物は国の3D都市モデル（PLATEAU） / 地面を透かすと、地下街や下水道管 | Buildings come from Japan's national 3D city models (PLATEAU) / Make the ground see-through to find underground malls and sewers |
| 0:50 | 生きている地球 | 夜の明かり・地震・人工衛星・電車とバス | 夜の明かり、過去7日の地震、人工衛星の位置 / 都営の電車とバスのいまの位置も | City lights at night, the past week's earthquakes, satellites / And where Toei trains and buses are right now |
| 1:12 | 宇宙へ | 引いて宇宙へ（目盛りの帯で移動） | 引いていくと宇宙へ。右の目盛りでも移れる / 惑星の位置は計算、銀河の形は観測にもとづく演出 | Pull back into space, or jump using the scale bar / Planet positions are calculated; galaxy shapes are based on observations |
| 1:30 | ミクロへ | 寄って岩・砂 → 原子 → 原子核 → クォーク | 地面に寄ると、その場所の岩・水・植物から原子へ / 原子核、クォーク、プランク長まで | Zoom into the ground: from local rock, water or plants down to atoms / Then nuclei, quarks and the Planck length |
| 1:50 | 地球をちぎる | 宇宙で「✋ 地球をちぎる」、断面・温度 | 地球を粒にして計算し、ちぎってみる / 穴はくずれて埋まり、圧力が抜けた岩が溶ける | The Earth is simulated as particles, and you tear a piece out / The hole collapses and fills, and rock melts as pressure drops |
| 2:08 | 海と湯気 | 海が流れこみ、湯気 | 海は穴へ流れこみ、熱い岩の上で湯気になる / 実データ・推定・演出は、札で分けてある | The ocean pours in and turns to steam on hot rock / Labels show what's real data, estimate or effect |
| 2:22 | 終わり | | 神の視点マップ / ブラウザで動かせます（パソコン向け） | God's-Eye Map / Runs in your browser (best on a PC). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「ホイールひとつで、宇宙の果てからクォークまで ― 本物の地図の3D地球 #Shorts」／ "From the Edge of the Universe to Quarks With One Scroll Wheel ― A 3D Earth Made From Real Map Data #Shorts"
- 説明動画: 「神の視点マップ ― 使い方と見どころ（本物の地図・建物と地下・生きている地球・宇宙・ミクロ・地球をちぎる）」／ "God's-Eye Map ― App Guide: Real Maps, Buildings and Underground, the Living Earth, Space, the Micro World and Tearing the Earth"
- 説明の1文目: 本物の地形・航空写真・建物・電車やバスの動きで見る3Dの地球。引けば宇宙の果てまで、寄れば原子や素粒子まで、ホイールひとつで動けるブラウザのアプリ「神の視点マップ」から。／ From "God's-Eye Map", a browser app with a 3D Earth built from real terrain, aerial photos, buildings and live trains and buses. One scroll wheel takes you out to the edge of the universe or in to atoms and subatomic particles.
- タグ: 3D地図, 地球, 宇宙, 原子, スケール, PLATEAU, まなびラボ, しし屋, 3D map, Powers of Ten, scale of the universe, CesiumJS, PLATEAU
- 出どころ・地図の出典（説明欄に全部）: 地理院タイル（国土地理院）、3D都市モデル（Project PLATEAU、国土交通省）、© OpenStreetMap contributors（OpenFreeMap © OpenMapTiles）、NASA GIBS、USGS、CelesTrak、東京都交通局・公共交通オープンデータセンター（CC BY 4.0）、HYG Database（CC BY-SA 4.0）、CesiumJS、地球の中: Dziewonski と Anderson（1981）ほか。
- 注意（**大事**）:
  - **EOX の画像（CC BY-NC-SA、非営利だけ可）は映さない**。アプリの「航空写真」と「色別標高図」は、日本の外（＝地球全体を見たとき）が EOX になる（`js/sources.js` の `GV.BASES`）。日本の中の街は地理院の写真でよいが、**地球まで引く場面は背景を「きのうの地球」（NASA GIBS、自由に使える）に切りかえて録る**。宇宙の場面の地球は NASA Blue Marble なので問題なし。
  - OSM の地図タイル（「地図」「淡色地図」の日本の外）は、録画で同じタイルを何度も読みこまないようにする（OSM のタイルの利用方針）。使うなら一度読みこんだら止めて描く。
  - 地図の下の出典表示は消さずに録る（地理院・OSM の条件）。終わりの画面にも主な出典を書く。
  - 地震・人工衛星・電車は「録った日の」データ。説明欄に「動画の中のデータは 2026年◯月◯日のもの」。
  - 外のデータを読むので、録画の前に通信が安定しているか確かめる。タイルが読み終わるのを待ってからコマを描く仕組みが要る（`__gv.terrain()`）。

---

## 6. さなぎの中で（metamorphosis）　BGM: journey（root 98、静かめ）

### ショート（40秒）「さなぎの中で、イモムシの体はどうなる？」
| 秒 | 絵 | 字幕（日） | 英語 |
|---|---|---|---|
| 0.6–5.6 | 透かして見る、蛹の1日目（サムネイル） | **さなぎの中で** / イモムシがガになるまで、体の中で何が起きる？ | Inside the Pupa / What happens inside as a caterpillar becomes a moth? |
| 6–13 | 幼虫（−5日）→ 前蛹 | タバコスズメガのイモムシ / 土にもぐり、さなぎになる準備 | A tobacco hornworm caterpillar / It burrows into the soil to get ready to pupate |
| 13.5–21 | 蛹の初め（壊れる器官、血球が集まる） | さなぎの中で、幼虫だけの器官は壊れる / 「全部どろどろ」は半分だけ正しい。神経や心臓は残って作りかえられる | Inside the pupa, organs only the caterpillar needs break down / "It all turns to soup" is only half true. Nerves and the heart stay and are rebuilt |
| 21.5–28 | 8日〜16日（飛ぶ筋肉・翅が灰色に） | 飛ぶ筋肉が育ち、翅に色がつく / 18日かけて、ガの体が組み上がる | Flight muscles grow and the wings get their color / Over 18 days, the moth's body is assembled |
| 28.5–35 | 羽化 → 翅を広げる | 18日目の夜、殻を割って出てくる / 1時間あまりで翅を広げきる（推定） | On the night of day 18, it breaks out of the case / It spreads its wings in a little over an hour (estimate) |
| 35.2–40 | 終わり | さなぎの中で / ブラウザで動かせます。研究の日付で時間を追えます | Inside the Pupa / Runs in your browser. Follow the changes day by day, based on research |

- 翅を広げる時間はアプリで「推定」（v3d）なので、字幕にも「（推定）」をつけた。「全部どろどろ」はアプリの「よくある誤解」の答えに合わせて「半分だけ正しい」。

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 透かして見る | さなぎの中で / 使い方と見どころ | Inside the Pupa / How to use the app and what to look for |
| 0:07 | 時間を動かす | 下の時間の帯をドラッグ・▶ | 下の帯で時間を動かす。▶ で自動再生 / 時間は、さなぎになった日からの日数 | Move through time with the bar below, or press ▶ / Time is counted in days from pupation |
| 0:27 | 幼虫と前蛹 | −5日（腸に葉・脂肪体・翅原基）→ −2日 | 幼虫の胸には、もう翅のもと（翅原基）がある / 土の中の部屋で、腸の内側がはがれていく | The caterpillar already has wing buds in its chest / In a chamber underground, the lining of its gut comes away |
| 0:50 | 壊れる・残る・新しく作られる | 1.5日、色の意味「壊れる」「残る」「新しく」 | 色で、壊れる器官・残る器官・新しく作られる器官 / 器官を押すと説明（確か・目安の札つき） | Colors mark organs that break down, stay or are newly built / Tap an organ for an explanation, labeled "certain" or "estimate" |
| 1:12 | ホルモンとスイッチの遺伝子 | 下のグラフ | エクジソンと幼若ホルモンの量が、変身の合図 / スイッチの遺伝子 Kr-h1・broad・E93 | Ecdysone and juvenile hormone levels signal the change / Switch genes: Kr-h1, broad and E93 |
| 1:32 | 3つの見かた | 透かして見る → 割って見る → 外から見る | 「割って見る」は、人の目で見た様子（色は本物に近く） / 「外から見る」は、蛹のどこが翅になるかが分かる | "Cut open" shows it as your eyes would see it, with near-real colors / "Outside" shows which part of the pupa becomes a wing |
| 1:55 | 羽化 | 18日 → 羽化 → 翅を広げる・たたむ | 殻のふたが開き、成虫がはい出す / 翅を広げたあと、屋根の形にたたむ | The front of the case opens and the adult crawls out / After spreading its wings, it folds them like a roof |
| 2:12 | 誤解と、まだ分からないこと | パネル「よくある誤解」「まだ分かっていないこと」 | 「よくある誤解」と「まだ分かっていないこと」も / 幼虫で覚えたことが成虫に残る、という研究も | Also: "common myths" and "what we still don't know" / Research suggests some caterpillar memories survive into the moth |
| 2:22 | 終わり | | さなぎの中で / ブラウザで動かせます（パソコン・スマホ） | Inside the Pupa / Runs in your browser (PC or phone). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「さなぎの中で、イモムシの体はどうなる？ ― 18日でガになるまで #Shorts」／ "What Happens Inside a Pupa? ― From Caterpillar to Moth in 18 Days #Shorts"
- 説明動画: 「さなぎの中で ― 使い方と見どころ（壊れる・残る・新しく作られる器官、ホルモン、3つの見かた、羽化）」／ "Inside the Pupa ― App Guide: Organs That Break Down, Stay or Form, Hormones, Three Views and Emergence"
- 説明の1文目: イモムシがさなぎになり、ガになるまでの体の中を、タバコスズメガの研究の日付で追うブラウザのアプリ「さなぎの中で」から。／ From "Inside the Pupa", a browser app that follows the inside of a caterpillar becoming a moth, using research timelines for the tobacco hornworm (Manduca sexta).
- タグ: 変態, さなぎ, イモムシ, 昆虫, タバコスズメガ, 完全変態, まなびラボ, しし屋, metamorphosis, pupa, caterpillar, Manduca sexta, insect
- 出どころ: Truman と Riddiford（1999）Nature、Jindra ほか（2013）、Tolbert ほか（1983）、Schwartz と Truman（1982）Science、Blackiston ほか（2008）PLOS ONE ほか15件。「模式図。色・形の一部は目安」。
- 注意: 生きものを割る絵は、模式図の「割って見る」だけ（本物の写真ではない）。むやみに長く映さない。

---

## 7. 空気の流れの見える部屋（air-flow）　BGM: journey（root 146.8、明るめ）

### ショート（40秒）「窓を2か所あけると、空気はこう入れかわる」
| 秒 | 絵 | 字幕（日） | 英語 |
|---|---|---|---|
| 0.6–5.6 | 2LDK、「24時間換気だけ」（空気の古さの色） | **空気の流れの見える部屋** / 家の空気は、どこがよどむ？ | Seeing the Air Flow / Where does the air go stale in your home? |
| 6–13 | 24時間換気だけ。古い空気（赤っぽい）がたまる | 24時間換気だけだと、空気は2時間ほどで入れかわる / 色は「空気の年齢」。外から入って何分たったか | With only the 24-hour ventilation, the air turns over in about 2 hours / Color shows "air age": minutes since it came in from outside |
| 13.5–21 | 「窓を1か所だけ」 | 窓を1か所あけても、風はあまり通らない | Opening just one window doesn't move much air |
| 21.5–28 | 「窓を2か所あける」。粒が流れる | 2か所あけると、風の通り道ができる / 数分で家じゅうが入れかわる | Open two, and the wind finds a path / The whole home turns over in minutes |
| 28.5–35 | 「サーキュレーター」 | サーキュレーターで、よどむ所に風を送る | A circulator fan pushes air into the stale corners |
| 35.2–40 | 終わり | 空気の流れの見える部屋 / ブラウザで動かせます。窓や換気扇を押して試せます | Seeing the Air Flow / Runs in your browser. Tap windows and fans to try |

- 「約2時間」「数分」はアプリの `houseStats()` の値を見てから決める（録画の前に数字を確かめる。24時間換気は法律で 0.5回/時＝2時間）。

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 窓を2か所あける | 空気の流れの見える部屋 / 使い方と見どころ | Seeing the Air Flow / How to use the app and what to look for |
| 0:07 | 空気の年齢 | 表示「空気の古さ」 | 色は「空気の年齢」: 外から入って何分たったか / 青は新しく、赤はよどんでいる | Color shows "air age": how long since it came in / Blue is fresh; red is stale |
| 0:27 | 窓・ドアを開け閉め | 「押して開け閉め」で窓を押す。数字のカード（換気回数） | 窓・ドア・換気扇は、押して開け閉め / 右上に換気回数（1時間に何回入れかわるか） | Tap windows, doors and fans to open or close them / Air changes per hour are shown at the top right |
| 0:50 | 場面 | 「場面」: 24時間換気だけ → 窓を1か所だけ → 窓を2か所あける | 24時間換気は、法律で1時間に0.5回 / 窓は2か所あけると、風が通る | By law, 24-hour ventilation is 0.5 air changes per hour / Two open windows let the wind through |
| 1:12 | 外の風 | 「外の風」の向きと強さ | 外の風の向きで、入る窓と出る窓が変わる / 風上の壁は押され、風下は引かれる | Wind direction changes which window air enters and leaves / The windward wall is pushed, the leeward wall pulled |
| 1:30 | 換気扇と給気口 | 「キッチンの換気扇」、給気口 | 換気扇を回すと、給気口や玄関のすき間から入ってくる / 給気口を閉めると、家の気圧が下がる | Run the kitchen fan and air comes in through vents and gaps / Close the vents and the pressure inside drops |
| 1:50 | 煙で見る | 「煙を出す」「部屋じゅうを煙で満たす」・グラフ | 煙を出すと、どこに流れるかが見える / 部屋じゅうを煙で満たして、消えるまでの時間をグラフで | Release smoke to see where it goes / Fill a room with smoke and graph how long it takes to clear |
| 2:08 | サーキュレーター | 「サーキュレーターを置く」・向き | サーキュレーターは置く場所と向きで効き方が変わる / 窓に向けて、外へ押し出すのがよい場面も | Where and how you point a circulator matters / Sometimes pointing it out a window works best |
| 2:22 | 終わり | | 空気の流れの見える部屋 / ブラウザで動かせます（パソコン・スマホ） | Seeing the Air Flow / Runs in your browser (PC or phone). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「窓を1か所と2か所、空気の入れかわりはこんなにちがう ― 換気のシミュレーション #Shorts」／ "One Open Window vs Two ― How Differently the Air Changes (Ventilation Simulation) #Shorts"
- 説明動画: 「空気の流れの見える部屋 ― 使い方と見どころ（空気の年齢・窓の開け方・外の風・換気扇・煙・サーキュレーター）」／ "Seeing the Air Flow ― App Guide: Air Age, Opening Windows, Wind, Fans, Smoke and Circulators"
- 説明の1文目: 窓・給気口・換気扇・外の風で、家の空気がどう入れかわり、どこがよどむのかを「空気の年齢」の色で見るブラウザのアプリ「空気の流れの見える部屋」から。／ From "Seeing the Air Flow", a browser app that shows how windows, vents, fans and outside wind replace the air in a home, and where it goes stale, using "air age" colors.
- タグ: 換気, 空気の流れ, 24時間換気, サーキュレーター, 窓, シミュレーション, まなびラボ, しし屋, ventilation, airflow, air age, circulator fan, simulation
- 出どころ: 建築基準法施行令 第20条の8、Sandberg（1981）、Etheridge と Sandberg（1996）、Swami と Chandra（1988）、Warren と Parkins（1985）。「学習用。すき間の量・換気扇の風量は目安」。
- 注意: 感染症の予防の効果などは言わない（アプリが言っていないこと）。

---

## 8. 進化の箱庭（ga-creatures）　BGM: journey（root 130.8）

### ショート（40秒）「でたらめな生きものが、歩き方を進化させる」
| 秒 | 絵 | 字幕（日） | 英語 |
|---|---|---|---|
| 0.6–5.6 | 1世代目: ばたばたするだけ | **進化の箱庭** / 関節と筋肉でできた、でたらめな生きもの | Evolution Sandbox / Random creatures made of joints and muscles |
| 6–13 | 1世代目のいろいろ（一覧） | 1世代目は、ほとんど前に進めない / 進んだ距離の長いものが、子を残す | Generation 1 can barely move forward / The ones that go farthest get to have offspring |
| 13.5–21 | 世代の一覧が流れる（自動で進める）、グラフが上がる | 子は親の遺伝子を受けつぎ、少しだけ変わる（突然変異） / これをくり返す（遺伝的アルゴリズム） | Offspring inherit their parents' genes with small changes (mutation) / Repeat (a genetic algorithm) |
| 21.5–30 | 40世代目の1位が走る（サムネイル） | 40世代で、走り方が生まれた / 誰も教えていない動き方 | By generation 40, a way of running has emerged / Nobody taught it how |
| 30.5–35 | 月面・水の中の1位 | 月や水の中では、ちがう体と動き方に | On the Moon or underwater, different bodies and moves evolve |
| 35.2–40 | 終わり | 進化の箱庭 / ブラウザで動かせます。平地・坂・氷・月・水の中 | Evolution Sandbox / Runs in your browser. Flat ground, slopes, ice, the Moon, underwater |

- 乱数のシードを決めて録る（毎回同じ進化になる）。良い進化になるシードを録画の前に探す。

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 1位の走り | 進化の箱庭 / 使い方と見どころ | Evolution Sandbox / How to use the app and what to look for |
| 0:07 | 画面の見かた | 左上の走るようす・世代の一覧・グラフ | 左上に1匹の走るようす、下に世代の全員 / 右のグラフは進んだ距離と種の割合 | Top left: one creature running; below: the whole generation / The graphs show distance and the share of each species |
| 0:28 | 世代を進める | 「1世代すすめる」「10世代」「自動で進める」 | 「10世代」「自動で進める」で、どんどん進化 / 一覧を押すと、その1匹の走りを見られる | "10 generations" or "Auto" to keep evolving / Click any creature in the list to watch it run |
| 0:52 | 遺伝子と種 | パネル「この生きものの遺伝子」、種の色 | 遺伝子は、関節の場所と筋肉の動き方 / 関節と筋肉の数で「種」を分け、色で見分ける | Genes set the joints' positions and how the muscles move / Species are grouped by numbers of joints and muscles, shown by color |
| 1:15 | 環境 | 「環境」: 上り坂・氷の上・月面・水の中 | 環境を変えると、ちがう体と動き方が勝つ / 月は重力が地球の約6分の1 | Change the environment and different bodies win / Gravity on the Moon is about one sixth of Earth's |
| 1:40 | 進化のしかた | 「集団の数」「選び方」「突然変異」「交叉」 | 集団の数・選び方・突然変異の多さを変えて試す / 突然変異が多すぎると、良い形がこわれる | Try different population sizes, selection and mutation rates / Too much mutation breaks good designs |
| 2:00 | 歴代の1位・シード | 「歴代の1位を見る」、シード「べつの種で」 | 歴代の1位で、進化の道のりをふり返る / 同じシードなら、同じ進化をもう一度 | Look back at past champions to see the path / The same seed replays the same evolution |
| 2:14 | 本物の進化とのちがい | 解説 | 筋肉の強さや摩擦は、見やすく決めたモデルの値 / 「本物の進化とのちがい」も解説に | Muscle strength and friction are model values chosen for clarity / See "How this differs from real evolution" |
| 2:22 | 終わり | | 進化の箱庭 / ブラウザで動かせます（パソコン・スマホ） | Evolution Sandbox / Runs in your browser (PC or phone). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「でたらめな生きものが、40世代で走り方を身につけるまで ― 遺伝的アルゴリズム #Shorts」／ "Random Creatures Learn to Run in 40 Generations ― A Genetic Algorithm #Shorts"
- 説明動画: 「進化の箱庭 ― 使い方と見どころ（世代を進める・遺伝子と種・坂・氷・月・水の中・進化のしかた）」／ "Evolution Sandbox ― App Guide: Generations, Genes and Species, Slopes, Ice, the Moon, Water and Evolution Settings"
- 説明の1文目: 関節と筋肉でできた2次元の生きものを、遺伝的アルゴリズムで進化させるブラウザのアプリ「進化の箱庭」から。／ From "Evolution Sandbox", a browser app that evolves 2D creatures made of joints and muscles with a genetic algorithm.
- タグ: 進化, 遺伝的アルゴリズム, 人工生命, シミュレーション, 自然選択, まなびラボ, しし屋, genetic algorithm, evolution simulator, artificial life, evolving creatures, natural selection
- 出どころ: Holland（1975）、Sims（1994）SIGGRAPH 94、carykh さんの進化シミュレーター、『アストロノーカ』（1998）。「筋肉の強さ・摩擦などはモデルの値」。

---

## 9. カビが育つまで（mold-growth）　BGM: journey（root 110）

### ショート（40秒）「お風呂のカビは、こうして広がる」
| 秒 | 絵 | 字幕（日） | 英語 |
|---|---|---|---|
| 0.6–5.6 | 4週目の浴室の壁（サムネイル）、目地に黒いカビ | **カビが育つまで** / お風呂の壁を、拡大して見ると | How Mold Grows / A close-up of a bathroom wall |
| 6–13 | 1日目から早送り。胞子が落ちる（「見えないものも見る」） | 空気から胞子が落ち、湿った所で芽を出す / 目地やゴムパッキンは、水と汚れがたまりやすい | Spores fall from the air and sprout where it's damp / Grout and rubber seals hold water and grime |
| 13.5–21 | 拡大（顕微鏡の見え方）: 菌糸の先がのびる | 菌糸の先が1本ずつのびて、枝分かれする / 胞子を作って、さらに広がる | Hyphae grow tip by tip and branch out / Then they make spores and spread further |
| 21.5–28 | 「塩素系カビ取り剤」でなぞる → 色が抜ける | カビ取り剤で、黒い色はすぐ消える / でも奥に残ると、また生えてくる | Bleach clears the black color right away / But roots left deep inside grow back |
| 28.5–35 | 毎日の習慣を変えて8週間（ためした記録） | 入浴後に水を切って乾かすと、生えにくい / 習慣を変えて、8週間をくらべる | Wiping and drying after a bath keeps it away / Compare eight weeks with different habits |
| 35.2–40 | 終わり | カビが育つまで / ブラウザで動かせます。道具を指で試せます | How Mold Grows / Runs in your browser. Try the tools with your finger |

- 「奥に残るとまた生える」がアプリのモデル（塩素の効く深さ）で本当に起きる場面かを、録画の前に確かめる。起きないなら字幕を「表面のカビは消える。乾かさないとまた生える」に。

### 説明動画（150秒）
| 時刻 | チャプター | 操作・絵 | 字幕（日） | 英語 |
|---|---|---|---|---|
| 0:00 | はじめに | 浴室の壁 | カビが育つまで / 使い方と見どころ | How Mold Grows / How to use the app and what to look for |
| 0:07 | カビの箱庭 | 全体。タイル・目地・ゴムパッキン・浴そうのふち、▶ | 浴室の壁の横10cm・縦6cmを拡大した「カビの箱庭」 / ▶ で時間が進む。毎晩21時に入浴 | A "mold garden": 10 × 6 cm of bathroom wall, enlarged / Press ▶ to run time. A bath every night at 9 pm |
| 0:28 | 見えないものを見る | 「見えないものも見る」「湿り気を見る」 | 「見えないものも見る」で、胞子や小さな菌糸も / 「湿り気を見る」で、ぬれている所 | "Show the invisible" reveals spores and tiny hyphae / "Show moisture" shows where it's wet |
| 0:48 | 寄って見る | ＋で拡大 → 顕微鏡の見え方 | 寄っていくと、顕微鏡の見え方に切りかわる / 菌糸の先がのび、胞子の柄が立つ | Zoom in and it switches to a microscope view / Hyphal tips extend and spore stalks rise |
| 1:08 | 道具を試す | 「ふき取る」「乾かす」→「塩素系カビ取り剤」→「防カビくん煙剤」 | 道具を選んで、指でなぞる / 乾かす・ふき取るでえさと水を減らし、カビ取り剤で殺す | Pick a tool and rub with your finger / Dry and wipe to cut food and water; use cleaners to kill it |
| 1:32 | いまの状況と発見カード | 右の「いまの状況」、発見カード | 右に、いまの状況（悪化・横ばい・よくなっている） / 何かが起きると「発見カード」 | On the right: current status (worse, steady, better) / "Discovery cards" pop up when something happens |
| 1:50 | 毎日の習慣で8週間 | 「毎日の習慣」→「8週間をはやおくりして記録」→「ためした記録」 | 換気扇・入浴後・掃除の習慣を選んで8週間 / 記録を並べて、どの習慣が効くかくらべる | Choose habits for the fan, after-bath care and cleaning, then run 8 weeks / Line up the records to compare which habits work |
| 2:10 | カビの図鑑 | 上のタブ「カビの図鑑」 | 「カビの図鑑」に、クロカビ・アオカビなど8種類 / 箱庭で見つけたカビには印がつく | The "Mold Guide" has 8 kinds, like black mold and blue mold / Ones you find in the garden get marked |
| 2:22 | 終わり | | カビが育つまで / ブラウザで動かせます（パソコン・スマホ） | How Mold Grows / Runs in your browser (PC or phone). The on-screen text is in Japanese for now |

### YouTube
- ショート: 「お風呂のカビは、こうして広がる ― 胞子が落ちてから8週間 #Shorts」／ "How Bathroom Mold Spreads ― From a Fallen Spore to Eight Weeks Later #Shorts"
- 説明動画: 「カビが育つまで ― 使い方と見どころ（カビの箱庭・顕微鏡の見え方・道具・毎日の習慣・カビの図鑑）」／ "How Mold Grows ― App Guide: The Mold Garden, Microscope View, Tools, Daily Habits and the Mold Guide"
- 説明の1文目: 浴室の壁を拡大した「カビの箱庭」で、胞子が芽を出し菌糸をのばして増えていく様子を見て、水・汚れ・カビ取り剤・防カビ剤を指で試すブラウザのアプリ「カビが育つまで」から。／ From "How Mold Grows", a browser app with a magnified "mold garden" of bathroom wall where spores sprout and spread, and you can try water, grime, cleaners and anti-mold sprays with your finger.
- タグ: カビ, お風呂, 掃除, カビ取り, 菌糸, 胞子, まなびラボ, しし屋, mold, bathroom mold, fungi, hyphae, spores
- 出どころ: Grant ほか（1989）、Sedlbauer（2001）、Hukka と Viitanen（1999）、Trinci（1969）、WHO（2009）ほか。**「塩素系は酸性のものと混ぜない。薬剤は製品の説明書に従う」**を終わりの画面と説明欄に（アプリと同じ注意）。

---

## ライセンスの確認（2026-10-10）
- 神の視点マップ以外の8本: 外から読むのはフォント（SIL OFL）と Three.js（MIT）だけ。画像・音・3D モデルのファイルはなく、絵はすべてコードで描いている。商品名も出てこない（くすりは成分名、カビ取り剤は「塩素系」など）。動画にしても、収益化しても問題なし。
- 神の視点マップ: EOX は映さない（上）。ほかは出典を出せば商用も可。ただし次の3つは録画の前に確かめる・避ける:
  - 地理院タイル（2026-10-10 に国土地理院の「承認申請 Q&A」と「地図の利用手続」のページで確かめた）:
    - **写真のタイルは測量成果ではない**（Q1-19）→ 測量法の申請は関係なく、コンテンツ利用規約（出典を書けば商用も可）だけ。**動画の街は「航空写真」で録る**。
    - 標準地図・淡色地図・標高などは測量成果。テレビ番組・動画・オンライン配信で「内容の補足として地図を画面に出す」のは申請不要（Q1-8）。ただし**地図が主な内容**のときは申請が要ることがあり（Q1-9・Q1-11）、広告などで利益を得るのは営利の扱い（Q5-4）。神の視点マップの紹介は地図が主な内容とも読めるので、**動画では使わない**。
    - 立体の地形: アプリは日本の中で地理院の標高タイルを読む。動画では台本の側で `GV.TERRAIN.gsi.min = 99` にして、世界の標高（Terrain Tiles、Mapzen）だけを使う（東京は平らなので見た目はほぼ同じ）。陰影（起伏）も出さない。
    - 出典「国土地理院」と、タイルの追加の出典（GRUS画像 © Axelspace など）は画面に出したまま録る。
    - それでも心配なら、録画の前に国土地理院の問い合わせフォームで「アプリの紹介動画（収益化の可能性あり）に、地理院タイルの写真を映してよいか」を聞く。
  - 天気（Open-Meteo）: データは CC BY 4.0 だが、無料の API は非営利の利用だけ。動画では天気の層を出さない。
  - 恒星（HYG Database、CC BY-SA 4.0）: 商用は可。出典を書く。SA が動画にかかる読み方もあるが、星の位置は事実のデータなので心配は小さい。気になるなら宇宙の場面を短く。
- 説明欄には、地図・データの出典を全部書く（PLATEAU・OSM／OpenFreeMap・NASA・USGS・CelesTrak・東京都交通局（CC BY 4.0）・Terrain Tiles・HYG）。

## 録画の前に決めること・確かめること（ユーザーに聞く）
1. **神の視点マップ**: 街は地理院の写真、地球全体は NASA の「きのうの地球」で録ってよいか（EOX の画像を避けるため）。地震・電車など「録った日のデータ」が入ってよいか。
2. 9本×2＝18本。**録画はまとめてストックし、YouTube には1日1本ずつ上げる**（2026-10-10 にユーザーが決めた）。順番はこれから決める。
3. ショートの題材（1本につき1つの見せ場）がこれでよいか。
4. 録画のときに、アプリに足すデバッグ用の入口（`window.__xx` の関数）が要るものがある（量子の検出器ボタン、カビの道具を時間に合わせて使う、など）。アプリのファイルは変えずに台本の側でボタンを押すのが基本。
