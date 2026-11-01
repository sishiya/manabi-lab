# ラボに使えそうな OSS・データ（下調べ）

調べた日: 2026-11-01（ユーザーが席を外しているあいだに Claude が調べた）。
ライセンス・★・最終更新は GitHub の API で確かめた。BodyParts3D は公式の利用許諾のページを読んだ。それ以外は検索の結果どまりなので、使う前に LICENSE をもう一度見る（RULES 6章。非商用だけのものは使わない）。

印: ◎ すぐ役に立ちそう／○ テーマが決まれば／△ 参考だけ／✕ 使わない

## 1. 物理の計算（シミュレーションの中身）

| | 名前 | ライセンス | 中身 | ラボでの使いどころ |
|---|---|---|---|---|
| ◎ | [MuJoCo](https://github.com/google-deepmind/mujoco)（公式の `wasm/`）／[zalo/mujoco_wasm](https://github.com/zalo/mujoco_wasm) | Apache-2.0／MIT | 関節と接触の物理。ロボット研究の定番。DeepMind が公式の WebAssembly を出している | **筋肉と骨の物理を自分で書かずにすむ**。下の MyoHand と組めば、ピアノ・タイピングの手、ヘビ、クモの跳躍を「力のつりあい」で解ける |
| ◎ | [MyoSuite／myo_sim](https://github.com/MyoHub/myo_sim) | Apache-2.0 | MuJoCo 用の筋骨格モデル。**MyoHand＝骨29・関節23・筋腱39**、腕・脚・胴も | piano-hand・typing-hand の「骨 → 皮ふ」の骨と筋を測られた値で。いまの手の検証の次の段に |
| ○ | [Rapier](https://github.com/dimforge/rapier.js)（Rust→wasm） | Apache-2.0 | 剛体。安定・速い | 物がぶつかる・積もる（ほこり・雑草のタネ・big-bang の岩） |
| ○ | [JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js) | MIT | 剛体（ゲーム「Horizon」のエンジン）。数が多くても速い・車・キャラ | 数千個の物を動かすとき |
| ○ | [threejs-particle-fluids](https://github.com/dgreenheck/threejs-particle-fluids) | MIT | WebGPU の粒の液体・やわらかい物・布・煙（three.js r184、WebGL の代わりなし） | 磁性流体・空気の流れ・波の次の版。iPhone の対応は要確認 |
| △ | [Tetrament](https://github.com/zalo/Tetrament) | MIT | WebGPU の有限要素法のやわらかい体 | 筋肉・内臓が変形する様子。★16 でまだ若い |

## 2. からだ・生きもの・分子のデータ

| | 名前 | ライセンス | 中身 | ラボでの使いどころ |
|---|---|---|---|---|
| ◎ | [BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)（ライフサイエンス統合データベースセンター） | **CC BY 4.0**（2025-02-27 に CC BY-SA から変わった。公式ページで確認） | 日本の成人男性の臓器・骨・筋 2,234 個の 3D（OBJ） | **体内ダイブ・尿の旅・血管の旅の本物の形**。表記は決まった文で |
| ◎ | [human-atlas](https://github.com/ashemag/human-atlas) | コード MIT・データ CC BY 4.0 | 上の BodyParts3D を three.js 用に軽くした見本（★4.4k） | 軽くする手順（meshoptimizer）をまねる |
| ○ | [Mol*](https://github.com/molstar/molstar) | MIT | タンパク質・ウイルスの立体（PDB のデータ） | phage・免疫・筋肉の分子のズーム |
| ○ | [3Dmol.js](https://github.com/3dmol/3Dmol.js) | BSD（GitHub では NOASSERTION と出る → 使う前に LICENSE を見る） | 軽い分子ビューア | 小さな分子（においの分子・薬） |
| ○ | [Smithsonian 3D](https://3d.si.edu/cc0) | CC0（ものごとに確認） | 博物館の 3D。**トリケラトプスの骨格**など。glTF あり | 恐竜（子どものころ好きだったもの、IDEAS） |
| ○ | [SimReady GLB](https://huggingface.co/datasets/codepawl/simready-glb) | CC BY 4.0 | （メモ済み）家具・機械 2,595 点、関節つき | 部屋もの・機械の分解 |
| △ | [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) | 著作権なし（NASA の利用の指針に従う・ロゴは使えない） | 探査機・ロケット | IDEAS 6「ロケットを作って飛ばす」 |

## 3. 音・声

| | 名前 | ライセンス | 中身 | ラボでの使いどころ |
|---|---|---|---|---|
| ◎ | [Pink Trombone](https://github.com/chromatone/pink-trombone)（Neil Thapen 2017） | MIT | 声帯＋声道の形から声を作る（Story 2005 の声道の断面積） | **vocal-folds（声帯のしくみ）の音**。舌・唇の形で母音が変わる |

## 4. 見せ方・録画

| | 名前 | ライセンス | 中身 | ラボでの使いどころ |
|---|---|---|---|---|
| ◎ | [Mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0（そのまま使うのは問題なし。ライブラリ自体を書きかえたらその部分は公開） | いま使っている mp4-muxer の作者の後継。MP4/WebM の読み書き | 紹介動画の台本（`_dev/promo/*.html`）を版上げ。teardown のようにコマごとに録る |
| ○ | [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer) | MIT | three.js の光線追跡（本物に近い光） | サムネイル・紹介動画の一枚絵。目のなかの光の道の外の光 |
| ○ | [Spark](https://github.com/sparkjsdev/spark)（World Labs） | MIT | 3D ガウシアンスプラット（写真から作った立体）を three.js に。スマホ可 | 本物の場所・標本を写真から。ただし紺色の線画の見た目と合うかは要相談 |
| △ | [Theatre.js](https://github.com/theatre-js/theatre) | Apache-2.0 | タイムラインの編集画面 | 2024-08 から更新が止まっている |

## 5. 生きものの数のモデル

| | 名前 | ライセンス | 中身 | ラボでの使いどころ |
|---|---|---|---|---|
| ○ | [Lenia](https://github.com/Chakazul/Lenia) | MIT | なめらかなライフゲーム（生きもののように動く模様） | 進化の箱庭・カビの次の題材。「生きものとは」 |

## ✕ 使わない（理由）

- [PhET](https://phet.colorado.edu/en/licensing/html) — 共通部品は MIT だが、各シミュレーションの中身は GPLv3。考え方を見るだけ。
- [Falstad circuitjs1](https://github.com/pfalstad/circuitjs1)（GPL-2.0）・[OpenRocket](https://openrocket.readthedocs.io/)（GPLv3・Java） — GPL なのでコードは写さない。発明の実験室・ロケットのとき「式の答え合わせ」に使うだけ。
- [Open-Meteo](https://open-meteo.com/en/terms) — 無料の API は**非商用だけ**。
- Open 3D Man・Z-Anatomy — CC BY-SA（改変を同じライセンスで出す決まり）。BodyParts3D（CC BY）で足りる。

## おすすめ（ひとつ選ぶなら）

1. **MuJoCo＋MyoHand** — 手の技術検証（piano-hand・typing-hand）を、筋と腱の物理で解き直せる。「物理を曲げない」にいちばん効く。まず公式の wasm で MyoHand が動くかだけ試す。
2. **BodyParts3D** — 体内ダイブ3本の臓器を、本物の形に。日本のデータで CC BY 4.0。
3. **Pink Trombone** — どこにも載せていない声帯のしくみに、本物の声を。
