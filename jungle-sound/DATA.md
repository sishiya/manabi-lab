# 熱帯雨林の音 — 集めた数と録音（段階0、2026-11-14）

> ライセンスは **CC0／CC BY／CC BY-SA だけ**使う（no-NC）。録音はまだ1本もダウンロードしていない（ダウンロードはユーザーの OK のあと）。
> 「確認ずみ」= ページか API で自分で確かめた。「未確認」= まだ。

## 1. 虫の合唱の数（② なかままでの根拠）
**Do Nascimento, Pérez-Granados, Alencar & Beard 2024**「Time and habitat structure shape insect acoustic activity in the Amazon」Phil. Trans. R. Soc. B 379: 20230112（投稿版 RSTB-2023-0112 を読んだ。データは figshare DOI 10.6084/m9.figshare.24501310、ライセンス未確認）
- 場所: ブラジル・ロライマ州 Viruá 国立公園、8つの環境・141か所。録音機は高さ 1.5 m、10分ごとに1分、各所6日、44.1 kHz（→ 22 kHz より上の超音波は**録れていない**）。
- 人の耳と目で 1,152 ファイル（19.2 時間）を見て、**1,714 の音の型の注釈**（セミ・コオロギのなかま・キリギリスのなかま）。**種の名前はひとつも付いていない**（なかままで）。
  - 注意: 1,714 は「1分のファイルごとに付けた型の箱」の合計。ちがう種類が 1,714 あるという意味ではない。
- 高さの帯（Table 1、平均 ± SD、kHz）。**テラフィルメ（洪水にならない森）**:
  | なかま | 注釈数 | 下のはし | 上のはし |
  |---|---|---|---|
  | セミ | 77 | 3.19 ± 1.43 | 8.64 ± 2.84 |
  | コオロギのなかま | 330 | 6.15 ± 2.61 | 7.26 ± 2.53 |
  | キリギリスのなかま | 73 | 9.29 ± 1.58 | 17.29 ± 2.15 |
- 合唱の時刻（Table 2、各環境1か所・1日）: テラフィルメ 12:40 → 6:00（17時間20分）。いちばん長いのは島の森（18時間）、短いのは Várzea（7時間）。
- 夜明け前がいちばんにぎやか（音の均等さの指数 AEI が下がる）。夜は鳥がほとんどいない（1,152 ファイルのうち 3 本）。カエルは虫より低い高さで鳴く。

## 2. 種まで分かる声の、使える録音（① の候補）
GBIF の API で、ブラジルのアマゾン5州（アマゾナス・パラー・ロライマ・アクレ・ロンドニア・アマパー）の音の記録を数えた（2026-11-14）。
- アマゾナス州の音の記録 4,411 本のうち、**使えるのは 19 本**（BY-NC が 4,277 本）。5州合わせて使えるのは **鳥 59・哺乳類 9**（ほとんど iNaturalist）。**カエル・虫は 0**。
- そこで範囲をアマゾンのほかの国にも広げた（ブラジル・ペルー・エクアドル・コロンビア・ボリビア・ベネズエラ・ガイアナ・スリナム・仏領ギアナ）。

**よい候補**（DATA.md に残すのは選んだものだけ。全部の一覧は下の「調べ方」で作りなおせる）
| なかま | 種 | どこで | 録った人・出どころ | ライセンス |
|---|---|---|---|---|
| 鳥 | Lipaugus vociferans（ムジカザリドリ。「ピーハ」の大声） | ブラジル・アマゾン | iNaturalist 4本 | CC BY |
| 鳥 | Procnias albus（シロスズドリ。いちばん大きな声の鳥の1つ） | ブラジル・アマゾン | iNaturalist 5本 | CC BY |
| 鳥 | Ramphastos tucanus（オオハシ） | ブラジル・アマゾン | iNaturalist 5本 | CC BY／BY-SA |
| 鳥 | Nyctibius griseus（タチヨタカ。夜） | 同 | iNaturalist | CC BY |
| 鳥 | Crypturellus undulatus（シギダチョウのなかま。夕方） | 同 | iNaturalist | CC BY |
| 鳥 | Opisthocomus hoazin（ツメバケイ） | 同 | iNaturalist | CC BY |
| サル | Ateles paniscus（クモザル）・Saimiri macrodon（リスザル） | アマゾナス州 | iNaturalist（Thiago Bicudo） | CC BY |
| サル | Alouatta seniculus（ホエザル） | **コロンビア北部（アマゾンの外）** | iNaturalist | CC BY |
| カエル | Allobates femoralis・Trachycephalus resinifictrix・T. typhonius・Osteocephalus taurinus・Boana cinerascens ほか約 25 種 | ブラジルのアマゾン（例: パラー州 Paragominas） | Xeno-canto（M.S. Hoogmoed、Naturalis 経由） | 録音は CC BY（データの束は BY-NC。**録音ごとに Xeno-canto のページで要確認**） |
| カエル | Leptodactylus pentadactylus・Trachycephalus cunauaru・Allobates fratisenescus | エクアドルのアマゾン（スクンビオス・オレリャナ） | iNaturalist（Christoph Moning） | CC BY |
| 虫（コオロギのなかま） | Aclodes・Anaxipha・Neoacla など約 15 種 | エクアドルのアマゾン（San Pablo de Kantesiya、スクンビオス） | ZFMK DORSA（F. Nischk、1997 ほか） | 録音 CC BY-SA（データの束 CC BY 4.0） |

**見つからなかったもの**: ブラジルのアマゾンで録った、使える虫の録音・ホエザルの録音。セミとキリギリスのなかまの、種の名前つきの使える録音。

## 3. 本物の森の音（くらべる基準・③ の土台）
Freesound の **Sonoteca Uirapuru**（Beatriz Filizola、UFF・CNPq の支援、2025）。CC0。「Sonoteca Uirapuru」の名前を書いてほしい、と頼まれている。
- 826473: アナビリャナス国立公園（アマゾナス州ノボ・アイロン）。森の音・コオロギ・蚊・小枝。3分54秒、96 kHz。時刻の記載なし。
- 826495: ノボ・アイロン。午後の森・ムジカザリドリ・セミ。9分54秒。**遠くの音楽が入っている**（使うなら切る）。
- 826472: 同じ場所の森（ページ未確認）。
- 夜の録音・夜明けの合唱・雨は、この人の分には見つからなかった。ほかを探す。

## 5. 第一弾に使ったもの（ペルーの夜明け、2026-11-14 に確かめた）
- **Hopping, Kahl & Klinck 2022**「A collection of fully-annotated soundscape recordings from the Southwestern Amazon Basin」Zenodo 10.5281/zenodo.7079124、**CC BY 4.0**（Zenodo の API で確認）。
  - ペルー Madre de Dios、Inkaterra Reserva Amazonica（Puerto Maldonado の東約 20 km、2 km²）。2019年1月14日〜2月2日（雨季）。SWIFT（Cornell）、高さ約 1.5 m、48 kHz で録って 32 kHz の FLAC に。
  - 7か所×3日（1/16・1/20・1/31）× 5:00〜6:00（ペルー時間）= 21時間。注釈 16,482 個、鳥 132種＋「????」（種のわからない鳥）1,684 個。**鳥以外（虫・カエル・サル）には注釈がない**。
  - 1時間のうち鳥の注釈がある時間の割合は 57〜99%（夜明けは鳥がほとんど鳴きっぱなし）。
  - 2.4 GB の zip は落とさず、HTTP の範囲指定で必要な7本だけ取り出した（`tools/rzip.py`）。
- 同じマドレ・デ・ディオス州で GBIF の使える音の記録: 367 本のうち 68 本（鳥 67・サル 1）。カエル・虫の使える録音はなかった。
- ほかに見つけた使えそうなデータ: Symes ほか 2023「Neotropical forest soundscapes with call identifications for katydids」（パナマ Barro Colorado 島、林冠 24 m、夜、キリギリス 24 種＋種のわからない声、**CC0**、Zenodo 7591959 / Dryad 10.5061/dryad.zw3r2288b）。アマゾンではないので第一弾には使わない。

## 4. 調べがつかなかったこと・確かめること
- Xeno-canto は自動の読み込みを断る（ボット避け）ので、検索・ライセンスの確認はユーザーがブラウザで見る（回避はしない）。
- figshare（Viruá のデータ）のライセンス。
- 種ごとの鳴く時刻の出どころ（例: ホエザルは夜明け前に多い — Do Nascimento ほか 2021, Diversity 13: 566、Viruá。まだ本文を読んでいない）。
- 写真・シルエット（PhyloPic・Wikimedia Commons・iNaturalist の CC0／BY／BY-SA）。

## 調べ方（くり返せるように）
GBIF occurrence API: `https://api.gbif.org/v1/occurrence/search?mediaType=Sound&country=BR&stateProvince=Amazonas` ／ `taxonKey=131`（両生類）・`216`（昆虫）。ライセンスは記録の `license` ではなく、**録音ごとの `media[].license`** を見る（束が BY-NC でも録音が CC BY のことがある）。
