# タイピングする手 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態（2026-10-17）: **v002-stageA**（段階A「ながめる」モード）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。日本語だけ（`L()` は日本語を返すだけにしてある）。
- 次にやること: PLAN.md の段階B（「再現する」モード: 自分のキーボードで打ったキーの位置 `KeyboardEvent.code` と時刻だけを読んで、手が打ち直す。画面のキーボード。打つ間隔のモデル）。
- 読む順: PLAN.md → このファイルの「ファイル構成」「しくみ」→ 関係するファイルだけ。手の中身（骨・皮ふ・筋肉の模型・IK）は piano-hand と同じなので、くわしくは `piano-hand/DEVNOTES.md` の「しくみ」。
- 動かし方: サーバー apps（.claude/launch.json）で http://localhost:8765/typing-hand/ 。デバッグ用の窓口 `window.__tyha`（`simRun(秒)`・`setTime`・`setText(id)`・`nextTour()`・`checksAll()`・`sheet(times, cam)`）、エラーは `window.__tyhaErr`（配列）。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit（節目の版だけ versions/ へコピーしてカードに。RULES 3章）。
- **ユーザーの方針（2026-10-17）**: 指運びの参考データ（モーションキャプチャ）は商用不可（CC BY-NC など）なので使わない。**指の動きはコンピュータで計算したシミュレーションだと、画面の目立つ所にいつも出す**（`#simNote`）。紹介文・動画でも同じ。

## piano-hand からの流用
- 写した元: `piano-hand` の commit `a25440d`（2026-10-15、v050-thumbspring 以降）。体内ダイブの3本と同じく、写して別に育てる（共有しない）。piano-hand で手を直したら、こちらへも入れるかを考える。
- そのまま: `skin.js`・`skinview.js`・`skeleton.js`・`tissue.js`・`scene.js`・`tools/skin-check.js`（窓口の名前だけ `__tyha` に）。
- 少し変えた: `hand.js`（前半。休む指の形をホームポジションに）・`plan.js`（hand.js の後半。ホームへ引く重み・キーの距離・指だけで打つ）・`check.js`（言葉と、運指の答え合わせを外した）・`view.js`（鍵盤・ノーツ・光の粒を外し、机とキーボード）。変えた所には「タイピング:」の印。
- 新しく書いた: `keys.js`・`keyboard.js`・`fingering.js`・`texts.js`・`main.js`・`index.html`・css の終わりの部分。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 画面の骨組み（doctype なし）。説明・しくみ・出どころ | |
| css/style.css | 見た目（piano-hand の写し＋終わりに「タイピングする手」の分）。820px 以下・縦長は上下に重ねる | |
| js/keys.js | キーボード（JIS）の寸法・位置・標準の指の割り当て。手の計算から見た呼び方は鍵盤と同じ | `KB`, `KEYS`, `KEY_BY_CODE`, `keyX`, `keyTop`, `pressZ`, `keyDist`, `surfaceAt`, `surfaceZ`, `surfaceFloor`, `noteName` |
| js/texts.js | 「ながめる」の文と、文 → 押すキーの並び | `TEXTS`, `KPM`, `KPM_LIST`, `DWELL`, `textToSong` |
| js/fingering.js | 指はキーごとに決まり（`KEYS[m].f`）。plan.js が呼ぶ名前だけ | `planFingering`, `setSpanScale`, `parseSong` |
| js/hand.js | ③ 骨の寸法・FK・IK・手のモデル・指の構え・手首の座標・キーの押しこみ・**ホームポジションの形** | `FINGERS`, `fingerFK`, `fingerIK`, `setHandModel`, `HOME_CODES`, `homePoint`, `homeWrist`, `tipN`, `toWorld`/`toLocal`, `keyDown`, `pressDepth` |
| js/plan.js | ②④ 打つ計画（手首を解く・指先の目標・指の並び・関節の速さの上限）と毎コマの姿勢 | `buildPlan`, `solveWrist`（`HOME_PULL`）, `fingerTarget`, `keepOrder`, `poseAt`, `depressAt` |
| js/check.js | ⑤ 破綻の検査（1/120 秒ごと） | `CHECKS`, `runChecks`, `clashOf` |
| js/view.js | Three.js r128 の描画（机・キーボード・両手・指先の印）とカメラ | `initView`, `renderPose`, `CAMS`, `setCam`, `updateCam` |
| js/keyboard.js | キーの見た目（上がせまい台形・上面の文字・F と J の出っぱり・土台）と、沈み・色 | `makeKeyboard`, `setKeyState` |
| js/skin.js・skinview.js・skeleton.js・tissue.js・scene.js | piano-hand のまま（皮ふ・肌のシェーダー・骨格・筋肉の模型・シーン） | |
| js/main.js | 画面の操作・毎フレーム・カチッという音・つぎへ・`window.__tyha` | `setText`, `step`, `TOUR`, `nextTour`, `renderTyped` |
| tools/skin-check.js | 開発用（piano-hand のもの。画面からは読まない） | |

## しくみ
座標は mm。x は右、y は上、z は手前（打つ人の側）。ホームの段のキーの上面が y=0、中心が z=-50。F と J のまん中が x=0。

1. **キーボード**（`keys.js`）: キーの間隔 19.05mm（0.75 インチ）。段のずれは「1」1.5・Q 2.0・A 2.25・Z 2.75 キー分（左の端から）。押しこみ 4mm、上面 12.5mm 角、奥の段ほど 2mm ずつ高い（目安）。JIS の並び（半/全・^・¥・@・[・:・]・\・無変換・変換・かな、縦長の Enter、短いスペース）。キーとキーのすき間は、指先のはら（直径 13mm）が落ちないので、となりのキーの上面と同じとみる。
2. **指の割り当て**: `KEYS[m].f`（1 親指〜5 小指）と `side`。標準のタッチタイピングの割り当て。「6」は右手の人さし指、スペースは右手の親指（どちらも人によってちがう）。
3. **休む指の形 = ホームポジション**（`hand.js` の `computeHome`）: ピアノの力を抜いた形は指の間が約 24mm に開き、ホームの段より奥へはみ出したので、「人さし指が力を抜いた形のまま J に届く手首」から見た J K L ;（親指はスペースの右へ 22mm）を、休む指の形（手の座標）にした。左手はその鏡（ホームの段は左右対称）。打つキーへ手首を合わせるときもこの形を使う（`anchorAt`）。
4. **手首はホームへ引かれる**（`plan.js` の `HOME_PULL`=0.5、目安）: 押す指の重み（1）より小さいので、遠いキーへは手首が一部だけ動き、残りは指が伸びて届く。
5. **打つ**: 指だけで打つ（`STROKE='finger'`）。持ち上げの高さ・触れたまま押す割合は、ピアノの研究の値（Goebl & Palmer 2008、Dalla Bella & Palmer 2011）を目安としてそのまま使っている（タイピングで測った値ではない。画面の「しくみ」にも書いた）。
6. **文 → キー**（`texts.js`）: 一定の間隔（60/KPM 秒）、押さえる時間 0.09 秒（目安）。文の終わり・確定の前は 0.3 秒あける（目安）。日本語はローマ字入力＋スペースで変換＋Enter で確定。

## ハマったところ
- ピアノの「力を抜いた形」のままだと、休んでいる指がホームの段に乗らず、指がキーボードの奥（数字の段のあたり）へはみ出した。→ 休む指の形をホームポジションにした（しくみ 3）。
- view.js からノーツと光の粒を外したら、scene.js のほこりが使う `hash1`・`glowTexture` もなくなって止まった（戻した）。
- スマホの縦長の画面では、ななめのカメラでキーボードの左右が切れた → 縦長ほど引く（`1.15 / aspect`）。

## 確認のしかた（変更のたびに）
1. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps typing-hand`（例外・読み込みの失敗・外への通信）
2. 開いて `window.__tyhaErr` が空、コンソールにエラーがない。
3. `__tyha.checksAll()`（約 16 秒）: すべての文 × 速さで `miss`（押せなかったキー）が空。2026-10-17 の値: 届かない 最大 7.2mm（date@300）、関節の限界 最大 16%（小指がホームのキーでほぼのびきる）、指どうしのめりこみ 最大 1.1mm、左右の手 最大 3.9mm、指の関節の速さは 200 キー/分 から上限 1500 度/秒に当たる。これより理由なく悪くならない。
4. 「つぎへ」を5回押して、文・速さ・見え方・カメラが変わり、最後に「最初から ↺」。
5. 視点5つ（ななめ・真上・正面・横・一人称）で手とキーボードが見える。真上から、休んでいる指が A S D F・J K L ; に乗っている。
6. 幅 375px で横にはみ出さない。上（図・つぎへ・シミュレーションの一文・打つ文・再生）が動かず、設定だけスクロール。
7. 「シミュレーションです」の一文がいつも見えている（`#simNote`）。

## 状態
- 2026-10-17 v001-start: new-app.ps1 で雛形を作った（保管庫にカード）。
- 2026-10-17 v002-stageA: 段階A「ながめる」。piano-hand（a25440d）の手を写し、JIS のキーボード・標準の指の割り当て・休む指の形をホームポジションに・手首をホームへ引く。文5つ（ホームポジション・今日はいい天気ですね。・すもももも…・英語のパングラム・日付）× 打つ速さ4つ（120〜400 キー/分）で押せなかったキー 0。つぎへ5段、手の見え方6つ、指の割り当ての色、カチッという音。サムネイル assets/thumbs/typing-hand.jpg。
