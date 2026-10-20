# 心地よい音・いやな音 企画書

2026-10-20 作成。IDEAS.md の「22 人にとって心地よい音をつくる」を広げたもの。
2026-10-20 ユーザーが案1（つまみ）で段階Aからと決めた。案2は段階C。段階A・B・C はできた（DEVNOTES の状態）。
快さの式の係数は原典で確かめられなかったので「Aures の考え方にならった推定」と画面に書いた（DEVNOTES）。

## ユーザーの依頼
心地よい音と不快な音、リラックスできる音と興奮する音の研究はあるか。あれば、その研究をもとに音を作り、体験できるアプリにしたい。

## 答え（研究はあるか）
ある。大きく2つの流れがあり、どちらも「音の測れる性質 → 人の感じ方」の関係を実験で測っている。
1. **心理音響**（音の物理量と感じ方）: 粗さ・鋭さ・大きさ・音色のととのい方（調和性）で「快・不快」がかなり説明できる。数式のモデルがある（Zwicker & Fastl の「感覚的な快さ」など）。
2. **感情の心理学**（快さ × 興奮の2つの軸）: Russell の円環モデル（1980）。音・音楽のどの特徴（テンポ・大きさ・高さ・明るさ）が「快－不快」「落ち着き－興奮」を動かすかの実験がたくさんある。

→ アプリでは、音を Web Audio でその場で合成し（録音・既存の曲・AI の曲は使わない）、**その音の性質を計算して**、研究のモデルで「快さ × 興奮」の地図のどこに来るかを**推定**して見せる。自分の感じ方も地図に置けて、研究の推定とくらべられる。

## ねらい
- 「いやな音」にも理由がある（黒板をひっかく音・悲鳴・近い2音のうなり）ことを、音を少しずつ変えながら体で分かる。
- 「リラックス」「興奮」はテンポ・大きさ・ゆらぎの量でかなり動くことを聞いて分かる。
- 研究で分かっていること／意見が分かれていること（1/f ゆらぎ・バイノーラルビートなど）を正直に分けて見せる。
- おまけ: 気に入った音は流しっぱなしの作業用 BGM になる（権利の心配がない）。

## 見る人の手がすること（作る前に確かめたいところ①）
案を2つ。どちらか、または両方。
- **案1 つまみで音をつくる（作る→地図に点が動く）**: 「粗さ」「鋭さ」「調和」「テンポ」「大きさ」「ゆらぎ（自然音らしさ）」のつまみ。動かすと音がなめらかに変わり、計算した値と、地図の上の推定の点が動く。
- **案2 地図をなぞる（地図→音ができる）**: 快さ × 興奮の地図の上を指でなぞると、その場所に合う音に変わる（研究の関係を逆にたどって、つまみを自動で決める）。指を止めたところで「なぜこう聞こえるか」が出る。
- どちらも「じぶんの感じ方」ボタン: 聞いた音を自分で地図に置くと、研究の推定の点と並ぶ（記録は画面の中だけ、保存しない）。
- 入口は「つぎへ」1つのツアー（1歩に新しいもの1つ）: ①ととのった1音 → ②2音を近づけるとうなる（粗さ）→ ③高い音域のキーキー（鋭さ・黒板の音域）→ ④速いうなり＝悲鳴の粗さ → ⑤テンポと大きさで興奮 → ⑥ゆっくりのゆらぎ・波や雨の音でリラックス → 自由に。

## 時間の見せ方（作る前に確かめたいところ②）
音は流れつづける（止めるボタンあり）。時間のスライダーは置かない。つまみ・地図の変化はその場で音に反映（急に変わらないよう 0.1〜0.3 秒でなめらかに）。

## 形（スマホも）
- 上に固定: 快さ × 興奮の地図（推定の点・自分の点）と、いまの音のスペクトル・波形の小窓。
- 下でスクロール: つまみ／ツアーの説明／計算した値（粗さ・鋭さ・大きさ）／出どころ。
- 幅 375px で、つまみは縦にならべる。ボタンの高さ 36px 以上。

## 音の中身（段階A）
- 合成: Web Audio（OscillatorNode・AudioWorklet で倍音と変調、ノイズはピンク・ブラウンを自前で）。自然音（雨・波・風）もノイズとフィルタとゆらぎで合成。
- 計算する値（同じ音のパラメータから計算。耳のモデルの簡単版）:
  - **粗さ**: 倍音どうしの組ごとに Plomp & Levelt の曲線（Sethares の式）＋振幅の変調（20〜300Hz、約70Hz で最大）。
  - **鋭さ**: Zwicker の式（DIN 45692）。高い音域にエネルギーが多いほど大きい。
  - **大きさ**: 等ラウドネス曲線（ISO 226）から近似のラウドネス。
  - **調和性**: 倍音が整数倍にそろっている度合い（McDermott ら 2010 が快さにいちばん効いたとしたもの）。
- 地図への推定:
  - 快さ: Zwicker & Fastl の「感覚的な快さ」の式（粗さ・鋭さ・大きさ・調和性から）。
  - 興奮: テンポ・大きさ・鋭さ・変調の速さ（Juslin & Laukka 2003 のまとめ、Bernardi ら 2006 の呼吸・心拍）。係数の一部は**推定**（研究は向きと大まかな大きさまで。画面に書く）。
- 安全: はじめは小さめ、急に鳴らさない、いやな音は短く・音量の上限を下げて「いやな音です」と先に出す。ヘッドホンをすすめる場合も音量に注意を出す。

## 段階
- A: 合成のエンジン＋計算する値＋地図（案1のつまみ）＋ツアー①〜④（快・不快）。
- B: 興奮・リラックス（テンポ・ゆらぎ・自然音）＋ツアー⑤⑥＋自分の感じ方。
- C: 案2（地図をなぞって音をつくる）・作業用 BGM の流しっぱなし。
- D（相談）: 英語対応・入口へ。

## やらないこと
- 録音した音・既存の曲・効果音素材・AI で作った音を使わない（ぜんぶその場で計算）。
- IADS（Bradley & Lang の感情の音のデータ集）の音は使わない（研究用だけの許諾。出どころとして名前を書くだけ）。
- 「この音で病気が治る」「集中力が上がる」などの言い切りをしない。
- 大きすぎる音・超低音・聞こえにくい高い音を長く鳴らさない。

## 簡単にするところ・推定（画面にも書く）
- 耳のモデルは簡単版（本物の聴覚モデルや製品の計測ソフトとは数字が少しずれる）。
- 快さ・興奮の点の位置は、研究の傾向から作った推定。人・文化・その日の気分で変わる（McDermott ら 2016: アマゾンの Tsimane' の人たちは不協和をいやがらなかった）。
- 根拠の強さを3段で出す: しっかり（粗さ・鋭さ・テンポ）／まちまち（自然音の回復・1/f ゆらぎ）／弱い・はっきりしない（バイノーラルビート）。

## 出どころ（候補。段階Aで本文を確かめてから画面へ）
- Plomp R., Levelt W. J. M. 1965「Tonal consonance and critical bandwidth」J. Acoust. Soc. Am. 38
- Sethares W. A. 1993「Local consonance and the relationship between timbre and scale」JASA 94（『Tuning, Timbre, Spectrum, Scale』）
- Zwicker E., Fastl H.『Psychoacoustics: Facts and Models』（感覚的な快さ・鋭さ・粗さ）、Aures W. 1985（感覚的な快さの式）
- McDermott J. H., Lehr A. J., Oxenham A. J. 2010「Individual differences reveal the basis of consonance」Current Biology 20
- McDermott J. H. ほか 2016「Indifference to dissonance in native Amazonians reveals cultural variation in music perception」Nature 535
- Halpern D. L., Blake R., Hillenbrand J. 1986「Psychoacoustics of a chilling sound」Perception & Psychophysics 39（黒板をひっかく音）
- Kumar S., Forster H. M., Bailey P., Griffiths T. D. 2008「Mapping unpleasantness of sounds to their auditory representation」JASA 124（2.5〜5.5kHz・ゆっくりの変調）
- Kumar S. ほか 2012「Features versus feelings: dissociable representations of the acoustic features and valence of aversive sounds」J. Neurosci. 32（扁桃体）
- Arnal L. H. ほか 2015「Human screams occupy a privileged niche in the communication soundscape」Current Biology 25（30〜150Hz の粗さ）
- Russell J. A. 1980「A circumplex model of affect」J. Pers. Soc. Psychol. 39
- Juslin P. N., Laukka P. 2003「Communication of emotions in vocal expression and music performance」Psychological Bulletin 129
- Bernardi L., Porta C., Sleight P. 2006「Cardiovascular, cerebrovascular, and respiratory changes induced by different types of music…」Heart 92
- Alvarsson J. J., Wiens S., Nilsson M. E. 2010「Stress recovery during exposure to nature sound and environmental noise」Int. J. Environ. Res. Public Health 7
- Cheung V. K. M. ほか 2019「Uncertainty and surprise jointly predict musical pleasure…」Current Biology 29（予想と意外さのバランス）
- Voss R. F., Clarke J. 1975「'1/f noise' in music and speech」Nature 258
- Garcia-Argibay M. ほか 2019 バイノーラルビートのメタ分析（Psychological Research 83）
- ISO 226:2003 等ラウドネス曲線、DIN 45692 鋭さ
