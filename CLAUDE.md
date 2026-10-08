# アプリ開発 フォルダ

人体の管を3Dで進むアプリのシリーズ。**最初に `DEVNOTES.md`（3アプリのまとめ）を読むこと。**

- `body-dive/` — 体内ダイブ（消化管・気道）。詳しい仕組みは `body-dive/DEVNOTES.md`。
- `urinary-dive/` — 亜種「尿の旅」。隠しアーカイブ（`archive.html`）に掲載。
- `blood-dive/` — 亜種「血管の旅」。隠しアーカイブ（`archive.html`）に掲載。
- `wifi-wave/` — 単独アプリ「電波の見える部屋」（WiFi の電波が家の中をどう伝わるかを2次元の電磁波シミュレーションで見る。WebGL2 直書き）。仕組み・確認手順・公開 URL は `wifi-wave/DEVNOTES.md`。
- `evolution/` — 別シリーズ「ヒトへの46億年」（地球と生命と人類の歴史を定点観測する3D）。企画は `evolution/PLAN.md`・`PLAN-future.md`、仕組みと確認手順は `evolution/DEVNOTES.md`（公開 URL もそこ）。**v005 から css/js に分割**: 直すときは DEVNOTES の「ファイル構成」を見て関係するファイルだけ読む。確認は `.claude/launch.json` の `apps`（http://localhost:8765/）で。
- `animal-senses/` — 別シリーズ「いきものの感じる世界」（同じ庭を人間・カラス・マムシなどの感覚で一人称で見る。紫外線・熱などを置き換えて表示）。css/js に分割。企画は `animal-senses/PLAN.md`、仕組みと確認手順は `animal-senses/DEVNOTES.md`。
- `immune-battle/` — 別シリーズ「免疫のたたかい」（ウイルス・細菌が入って増え、免疫に片づけられるまで。数のモデルに合わせて動くミクロの断面＋人体の小窓＋グラフと予測）。css/js に分割、Canvas 2D。企画は `immune-battle/PLAN.md`、仕組み・モデルの数値・確認手順は `immune-battle/DEVNOTES.md`。
- `god-view/` — 別シリーズ「神の視点マップ」（宇宙から地球・街・人・原子までホイールで寄れる。地球は実データの地図・地形・建物。CesiumJS、API キーなしのデータから）。css/js に分割。企画は `god-view/PLAN.md`、仕組み・データ源・確認手順は `god-view/DEVNOTES.md`。確認は `apps`（http://localhost:8765/god-view/）で。**公開は GitHub Pages**（push で更新、RULES 8.1）。
- `illusions/` — 別シリーズ「錯覚の美術館」（世界の錯視・錯聴を見て、測って、しくみを知る。Canvas 2D）。css/js に分割。企画は `illusions/PLAN.md`、展示の書き方・確認手順は `illusions/DEVNOTES.md`。確認は `apps`（http://localhost:8765/illusions/）で。
- `metamorphosis/` — 別シリーズ「さなぎの中で」（タバコスズメガのイモムシが蛹になりガになるまで。時間は研究の日付、体の中で壊れる・残る・新しく作られる器官を、横から透かした模式図で時間を追って見る。ホルモンとスイッチの遺伝子のグラフつき。Canvas 2D）。css/js に分割。企画は `metamorphosis/PLAN.md`、仕組み・確認手順は `metamorphosis/DEVNOTES.md`。確認は `apps`（http://localhost:8765/metamorphosis/）で。
- `air-flow/` — 単独アプリ「空気の流れの見える部屋」（2LDK で、窓・給気口・換気扇・風・サーキュレーターによって空気がどう入れかわり、どこがよどむかを空気齢の色で見る。換気回路網＋2次元の流れ＋空気齢の計算。Canvas 2D）。css/js に分割。企画は `air-flow/PLAN.md`、仕組み・確認手順は `air-flow/DEVNOTES.md`。確認は `apps`（http://localhost:8765/air-flow/）で。
- `extreme/` — 単独アプリ「極限の世界に置いてみたら」（宇宙 400km からマリアナ海溝の底まで1本のものさしで、人・風船・ポテトチップスの袋・マシュマロ・魚・クマムシなどを運び、気圧・水圧で縮む・ふくらむ・沸く・生きられるかを見る。Canvas 2D）。css/js に分割。企画は `extreme/PLAN.md`、仕組み・確認手順は `extreme/DEVNOTES.md`。確認は `apps`（http://localhost:8765/extreme/）で。
- `ga-creatures/` — 単独アプリ「進化の箱庭」（関節と筋肉でできた2次元の生きものを遺伝的アルゴリズムで進化させる。平地・坂・氷・月・水の中。Canvas 2D）。css/js に分割。企画は `ga-creatures/PLAN.md`、仕組み・確認手順は `ga-creatures/DEVNOTES.md`。確認は `apps`（http://localhost:8765/ga-creatures/）で。
- `muscle-growth/` — 単独アプリ「筋肉が育つまで」（筋トレで筋肉がどう傷つき・治り・太くなるか。力こぶの筋線維1本の縦と横の断面＋1時間きざみの数のモデルのグラフ。やり方・セット数・週の回数・経験・年齢・たんぱく質・睡眠を選んで比べる。Canvas 2D）。css/js に分割。企画は `muscle-growth/PLAN.md`、仕組み・モデルの数値・確認手順は `muscle-growth/DEVNOTES.md`。確認は `apps`（http://localhost:8765/muscle-growth/）で。
- `mold-growth/` — 単独アプリ「カビが育つまで」（浴室の壁の一部を拡大した「カビの箱庭」。空気から落ちた胞子が発芽し、菌糸の先が1本ずつのびて胞子を作って増える。水・汚れ・塩素系・アルコール・防カビ剤などを指で試し、毎日の習慣で8週間を比べる。ルーペ・湿り気の地図・発見カード・いまの状況・カビの図鑑（8種類）。Canvas 2D。入口に掲載。v1 の数のモデル版は試作として versions に残す）。css/js に分割。企画は `mold-growth/PLAN.md`、仕組み・モデルの数値・確認手順は `mold-growth/DEVNOTES.md`。確認は `apps`（http://localhost:8765/mold-growth/）で。
- `ferrofluid/` — 単独アプリ「磁性流体の実験皿」（ガラスの皿の磁性流体の下で磁石を動かし、トゲ＝ローゼンスヴァイク不安定がなぜ・どこに・どのくらいの高さで立つかを見る。研究の液 APG512a の実測値に合わせた液の山＋スウィフト・ホーエンベルグ方程式。Three.js）。css/js に分割。企画は `ferrofluid/PLAN.md`、仕組み・合わせた係数・確認手順は `ferrofluid/DEVNOTES.md`。確認は `apps`〜`apps-6`（http://localhost:8770/ferrofluid/ など）で。隠しアーカイブ（`archive.html`）に掲載。
- `black-hole/` — 単独アプリ「ブラックホールの見え方」（映画「インターステラー」のブラックホールを、回るブラックホールのまわりの光の道すじを GPU で1ピクセルずつ計算して描く。クリックした点の光が通ってきた道すじの図、映画版／本当の見え方、回転の速さ。WebGL2 直書き）。css/js に分割。企画は `black-hole/PLAN.md`、式・確認手順は `black-hole/DEVNOTES.md`。確認は `apps`〜`apps-6`（http://localhost:8770/black-hole/ など）で。入口に掲載。
- `resistance/` — 単独アプリ「退治するほど手ごわくなる」（台所の虫＝チャバネゴキブリがモデルを、叩く・スプレー・毒エサで退治すると、生き残りが子を残して警戒心・危険の察知・殺虫剤に強い・糖ぎらいの遺伝子が世代ごとに変わる。進化を自分の手ごたえで見る。虫の見た目を選べる（まる・デフォルメ・リアル寄り）。Canvas 2D）。css/js に分割。企画は `resistance/PLAN.md`、仕組み・数値・確認手順は `resistance/DEVNOTES.md`。確認は `apps`〜`apps-6`（http://localhost:8769/resistance/ など）で。隠しアーカイブ（`archive.html`）に掲載。
- `brain-response/` — 単独アプリ「刺激が脳に届くまで」（光・顔・音・触る・熱い痛み・カチッ2回の刺激が、脳のどこに何ミリ秒後に届くかを、研究で測られた時刻と場所だけで再生。ヒト・サル・ラットの切り替え、根拠の印（研究の値・幅・順番だけ・場所だけ）、ヒトで違いが測られた病気・特性5つ。想像で埋めないのが約束。Canvas 2D）。css/js に分割。企画と確かめた出どころは `brain-response/PLAN.md`、仕組み・確認手順は `brain-response/DEVNOTES.md`。確認は `apps`〜`apps-6`（http://localhost:8769/brain-response/ など）で。隠しアーカイブ（`archive.html`）に掲載。
- `quantum/` — 別シリーズ「量子の実験室」（二重スリット・トンネル効果・偏光板・量子もつれ・不確定性原理）。1ファイル完結。仕組みと確認手順・公開 URL は `quantum/DEVNOTES.md`。
- `archive.html` — 隠しアーカイブ（入口の下の小さい注記からだけリンク。作りかけ・出来がいまひとつのアプリ。いまは urinary-dive・blood-dive・extreme・illusions・muscle-growth・ferrofluid・resistance・brain-response）。入口とアーカイブの出し入れは `RULES.md` 8.1。
- `IDEAS.md` — まだ作っていないテーマのストックと、ユーザーの好みの傾向。新しいアプリを考えるときに読む。

## 進め方の約束（詳しくは `RULES.md`。どのアプリでも最初に読む）
- 企画書（`PLAN.md`）を先に作り、段階に分けて進める。
- 大きくなったら役割ごとにファイル分割し、DEVNOTES のファイル構成表を見て関係するファイルだけ読む。
- 手を入れる前と区切りごとに、`<app>/versions/<番号-名前>/` へ丸ごとバックアップを残す。節目の版は `<app>/launcher.html` に追加する。
- 区切りごとに `<app>/DEVNOTES.md` の「別セッションで続けるとき」と「状態」を更新する。
- 変更のたびに、`DEVNOTES.md` の「確認のしかた」の項目を通しで確認する（当たり判定の変更で合流部が塞がったことがある）。
- 3アプリはエンジンを複製しているので、共通部分の不具合を直すときは他のアプリにも同じ問題がないか見る。
- 公開は既存の Artifact URL へ同じファイルを再公開する（外のデータを読む god-view だけは GitHub Pages。push で公開されるので push 前のチェックが公開前チェック）。URL はルートの `PUBLISH.local.md`（Git に入れない）。ない PC では Artifact の一覧でタイトルから探す（`RULES.md` 8章）。
- **Artifact の公開と git の commit／push の前には毎回、公開前チェック（`RULES.md` 7章）を行う**: `tools/check-public.ps1` で個人情報・秘密情報を探し、目でも確かめ、結果をユーザーに伝える。見つかったら公開しない。このフォルダは Public リポジトリにしても困らない状態を保つ。
- 返事は日本語で。
