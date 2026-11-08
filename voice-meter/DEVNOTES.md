# 声のものさし 開発メモ

## 別セッションで続けるとき（まずここ）
- いまの状態: v002-engine（試作。段階Aの主な部分）。保管庫（archive.html）に掲載。入口には載せない（RULES 8.1）。「手がすること」「時間の見せ方」は**ユーザーにまだ確かめていない**（寝ているあいだに作った）。
- 次にやること: ユーザーに触ってもらう。本物の人の声と Praat（`praat-parselmouth`）で突き合わせる（PLAN 段階B）。
- 読む順: PLAN.md → このファイルの「ファイル構成」→ 関係するファイルだけ。
- 動かし方: サーバー apps（.claude/launch.json）で http://localhost:8765/voice-meter/ 。デバッグ用の窓口 `window.__vome`（`S`・`select(id)`・`loadSample(id)`・`setMode(m)`）、エラーは `window.__vomeErr`。測定の確かめは `node voice-meter/tools/verify.mjs`（約45秒）。
- 区切りごとの手順: 「確認のしかた」と smoke.ps1 → 「状態」に1行 → launcher.html の表 → 公開前チェック → commit。
- **まなび → あそびの順**（RULES 8.3）: `js/engine/` だけが「あそびへ渡すパーツ」。DOM・WebAudio なし。ゲーム向けの変換はここに書かない。こえのこ（`../ゲーム/voice-pet/`）のコードや式を持ち込まない。
- ユーザーの好み: リアル路線。研究の定義にそろえる。

## ファイル構成
| ファイル | 中身 | 主な関数・変数 |
|---|---|---|
| index.html | 画面の骨組み。`../assets/power.js` を先に読む | |
| css/style.css | 見た目。900px 未満は図を上に固定 | |
| js/engine/analyze.js | 入口。声 → 数 | `analyzeVoice(x, sr, {mode})` → `{ok, value, trk, fm, per, pulses, pert, tempo, ltas…}` |
| js/engine/pitch.js | 高さと HNR | `trackPitch`・`hnrTrack`・`voicedRuns`・`frameTime` |
| js/engine/periods.js | 1周の印・ジッター・シマー | `pulsesInRun`・`perturbation` |
| js/engine/formant.js | Burg・F1〜F4 の経路探索・声の筒 | `trackFormants`・`vtlFromFormants` |
| js/engine/spectrum.js | H1*-H2*・帯の数・CPP | `harmonicsAt`・`bandsAt`・`cepstrumAt`・`cppOf`・`averageCep` |
| js/engine/dsp.js | FFT・変換・Burg・根 | |
| js/engine/synth.js | 正解のわかる合成の声・見本 | `synthVoice`・`presetVoice`・`PRESETS` |
| js/catalog.js | 数の一覧（名前・意味・測り方・図）と出どころ | `PARAMS`・`GROUPS`・`MAIN`・`SOURCES` |
| js/lens.js | 図（測り方の絵） | `LENS.*`・`drawLive` |
| js/record.js / capture-worklet.js | マイク（使うときだけ）と聞き返し | `startMic`・`stopMic`・`startPlay` |
| js/main.js | 画面の動き | `S`・`select`・`loadSample` |
| tools/verify.mjs | 合成の声で確かめる | |

ES モジュール（`type="module"`）。`main.js?v=` の先の import には `?v=` が付かないので、engine を変えたら確認は強制再読み込みで。

## しくみ
- 内部は 16kHz（5kHz までの帯を見るので足りる）。ジッターとシマーだけ元の細かさ（44.1kHz 以上）で測る。
- 高さ: Boersma 1993 の正規化自己相関＋経路探索（Praat の既定値 75〜600Hz、0.45・0.03・0.01・0.35・0.14）。HNR は 80ms の窓の r から。
- ジッターとシマーは「のばす」だけ（Praat のマニュアルが長くのばした母音に限ると書いている）。となりの比 1.3 倍・1.6 倍をこえる組は数えない（Praat の既定値として知られている数。マニュアルの該当ページでは数値を確かめられなかった）。
- フォルマント: 窓 50ms のガウス形、Burg 10 次、上限の周波数は 4500〜6500 を 500 刻みで試す（のばす声は F1・F2 のばらつき最小。話し声は隣のフレームとのゆれ最小）。
- H1*-H2*: 倍音の強さから F1〜F3 の共鳴の応答を引く。
- CPP: dB のパワーケプストラムを前後2フレームとケプストラム方向 ±3 点でならす。ソフトごとに値は変わる。

## ハマったところ
- 合成の声の「正解」のジッターが測定の2倍に見えた。音が鳴るのは声帯が閉じる瞬間で、閉じる位置は `周期の始まり＋oq×周期`。閉じる瞬間どうしの間隔で正解を数えると合う。エンジンの誤りではなかった。
- 1周の印を「1周ぶんの相関」だけで置くと前後の周期が平均され、頂点へ合わせると響きのさざ波の隣へとぶ。2段階（1周ぶん → 印のまわりの短い窓）にした。
- LPC の根に帯域幅 600〜900Hz の偽物ができ、F2 に選ばれていた（/o/）。500Hz 以上の広い根は 3kHz 未満から除く。
- ブラウザペインが隠れていると screenshot できない。Playwright（`../ゲーム/tools/playwright`）で確かめる。偽のマイク `--use-file-for-fake-audio-capture` で録音の道すじも通せる。

## 確かめた結果（2026-11-08・合成の声）
`tools/verify.mjs` すべて OK。F0 は 0.5% 以内。ジッターは許容 ±0.12 ポイント（σ 1〜2% で ±5% 以内）。シマーは ±1.2 ポイント。F1〜F3 は 10%（F3 は 8%）以内、280Hz の F1 だけ 14% まで広げた（倍音に引かれる限界。画面に注意を出す）。HNR は雑音が主のとき ±2dB。音節の数は 12/12。44.1k と 48k で値が同じ。Windows の音声合成の話し声（手元のみ）は 235Hz・HNR 15dB など、もっともらしい値。

**確かめていないこと**: 本物の人の声、Praat との一致、実機のスマホのマイク。eGeMAPS の全文（定義は二次資料）、日本語の母音の基準値（表が読めなかったので画面に出さない）。

## 批判役（2026-11-08）で決めたこと
採用: 最初は5個だけ／固定する図は1枚／マイクの自動処理を止める・止まらなければ出す／録る前に「外に出ない」・消すボタン／Praat 未確認を画面に／高い声の注意／話す速さは推定／数のそばに「大きいほど」の1行。
不採用: 「16kHz では 5kHz までの帯がゆがむ」→ ナイキスト 8kHz なので帯は足りる。話し声の HNR などを「母音らしい区間だけ」に → 段階B（声のある時間で測り、秒数は表示）。本物の声と Praat の突き合わせを段階Aに → ここでは Praat を入れられなかったので段階Bの最初に。

## 確認のしかた（変更のたびに）
1. `node voice-meter/tools/verify.mjs`（engine を変えたとき）
2. `powershell -NoProfile -ExecutionPolicy Bypass -File _dev/tools/smoke.ps1 -Apps voice-meter`
3. 幅 375px で: 開くと見本の高さが出る／カードを押すと図が変わる／横にはみ出さない／録音して結果が出る（`scrollWidth` が 375）
4. 録音中に裏へ → 止まって捨てる表示。もどしても再開しない。

## 状態
- 2026-11-08 v001-start: 雛形。
- 2026-11-08 v002-engine: 測定エンジン（`js/engine`）、合成の声の確かめ、録音、見本の声、38 の数のカードと測り方の図。保管庫に掲載。
