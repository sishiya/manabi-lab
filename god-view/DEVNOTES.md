# 神の視点マップ 開発メモ

最終更新: 2026-10-05

## 別セッションで続けるとき（まずここ）

- **いまの状態**: v001（段階A「地球の地図」）。日本全体から家1軒まで寄れる 3D の地球。公開はまだ（Artifact にこだわらない方針。公開先は後で決める）。
- **次にやること**: 段階B「立体の街」（PLATEAU の建物 3D Tiles、日本の外は OSM の建物の高さ、ワイヤフレーム、地下を見る視点）。PLAN.md 8章。
- **読む順**: `../RULES.md` → このメモ → `PLAN.md`（全体の構想と段階）→ 下の「ファイル構成」で関係するファイルだけ。
- **動かし方**: `.claude/launch.json` の `apps` → http://localhost:8765/god-view/ 。file:// では動かない（分割版）。
- **デバッグ用**: `window.__gv`（`width()` 画面の幅 m、`state()`、`terrain()` 標高タイルの読み込み数、`goto(lon,lat,h)`、`home()`、`run(n,dt)` 描画を n 回進める）。例外は `window.__gvErr`。
  - **Browser ペインが非表示だと描画ループが止まる** → `await __gv.run(60,120)` で進めてからスクリーンショット。スクリーンショットが「timed out」になったら、もう一度撮ると撮れることが多い。
- **区切りごとの手順**: `versions/<番号-名前>/` に index.html・css・js を丸ごとコピー → `launcher.html` にカード → このメモの「状態」 → 「確認のしかた」を通しで → 公開前チェック（RULES 7章）→ コミット（push はユーザー）。
- **ユーザーの好み・決まったこと**: 名前は「神の視点マップ」。最初は日本全体。地球を先に厚く。**API キーなしでできることから**。キーが要る段階になったら作業の前に知らせる（使うなら無料、できれば回数無制限のもの）。正確さ重視、実データ／推定／演出を区別して表示。

## 状態（履歴）

- 2026-10-05 企画（PLAN.md）。段階0: データ源の CORS と利用条件を確認し、CesiumJS に決定。
- 2026-10-05 v001-earth-map: 段階A。CesiumJS 1.146、背景4種・陰影・立体の地形・高さの強調・ワイヤフレーム・昼と夜・大気、地名検索、地点の住所と標高、スケール表示。

## ファイル構成

読み込み順は index.html の `<script>` の順（Cesium → sources → terrain → earth → scale → ui → main）。すべて `window.GV` に載せる。

| ファイル | 中身 | 主な名前 |
|---|---|---|
| `index.html` | 画面の骨組み、このアプリについて（注意・使っているもの） | `#globe` `#top` `#layers` `#point` `#scale` `#about` |
| `css/main.css` | 見た目。スマホ幅（〜640px）の配置 | `--real` `--est` `--fx`（印の色） |
| `js/sources.js` | **データ源の一覧**（URL・出典・範囲・ズーム）。新しいデータはまずここに足す | `GV.JAPAN` `GV.CREDIT` `GV.BASES` `GV.OVERLAYS` `GV.TERRAIN` `GV.API` `GV.TAGS` |
| `js/terrain.js` | 標高タイル → Cesium の地形 | `GV.makeTerrain()` `heightsFor()` `getHeights()` `decodeGsi()` `decodeTerrarium()` `GV.terrainStats` |
| `js/earth.js` | Viewer の作成、層・地形・表示の切り替え、カメラ移動 | `GV.state` `GV.initEarth()` `GV.applyBase/Overlays/Terrain/View()` `GV.home()` `GV.flyToLonLat()` |
| `js/scale.js` | 画面の幅（m）、身近なものさし、宇宙〜素粒子の帯 | `GV.viewWidth()` `GV.RULERS` `GV.BANDS` `GV.nearestRuler()` `GV.fmtLen()` |
| `js/ui.js` | 層のパネル、検索、クリックした地点、スケール表示、パネル開閉 | `GV.initUI()` `GV.showPoint()` `updateScale()` |
| `js/main.js` | 起動、デバッグ窓口 | `window.__gv` `window.__gvErr` |

## しくみ

### 地球エンジン
- **CesiumJS 1.146.0**（Apache-2.0）を jsDelivr から読む（`CESIUM_BASE_URL` も jsDelivr）。Cesium ion は使わない（`Ion.defaultAccessToken = ''`、`baseLayer: false`）。
- `requestRenderMode: true`（止まっているときは描画しない）。設定を変えたら `scene.requestRender()` を呼ぶ。
- 画像の層: 背景は「世界用の下地」＋「日本の範囲に重ねる地理院タイル」の2枚。地理院の層は `minimumTerrainLevel`（`fromLevel`）より寄ったときだけ出す（引いたときは世界の写真に統一）。
- ワイヤフレームは Cesium の非公開設定 `globe._surface.tileProvider._debug.wireframe`（CesiumInspector と同じ）。**Cesium の版を上げたら動くか確かめる**。

### 地形（terrain.js）
- Cesium の `CustomHeightmapTerrainProvider`（経緯度タイル、65×65 点）。各点の経緯度を Web メルカトルのピクセルに直し、標高タイル（PNG、256×256）から双線形補間で拾う。
- ズームは `z = min(地形タイルの level, 14)`。それより細かい level は z14 のタイルを補間して使う（コールバックは必ず値を返す。undefined を返すと Cesium は「混んでいる」と見なして再要求する）。
- 日本の範囲で z6〜14 は**地理院 dem_png**（x = R·65536 + G·256 + B、2^23 は無効値→0m、2^23 超は負）。404 なら **AWS Terrain Tiles（Terrarium、h = R·256 + G + B/256 − 32768）**。
- **海は 0m にそろえる**（Terrarium の負の値を 0 に）。海底地形は出さない（後で「海の深さ」の層として検討）。
- `CustomHeightmapTerrainProvider` は法線を持たないので、地形に陰影はつかない → 「陰影（起伏）」の層で補う。
- 覚えておく標高タイルは 160 枚（1枚 256KB）。

### 地点の情報・検索
- クリック → `globe.pick` → 地理院の逆ジオコーダー（市区町村コード＋町名）＋ `muni.js`（コード → 都道府県・市区町村名。正規表現で読む、eval しない）＋地理院の標高 API。日本の範囲外は「日本の外」と出す。
- 検索: Nominatim（施設名・世界）と地理院の地名検索（日本の住所）を同時に送り、並べる。地理院は1文字だけ合う住所を返すので、OSM に結果があるときは文字列を含むものだけ残す。

### スケール
- 画面の幅 = 画面中央の地表までの距離 × 2·tan(横の画角/2)。地表に当たらないときは地球の中心までの距離 − 6371km。
- `GV.BANDS` は PLAN.md 4章の帯。`ready: true` の帯だけ明るく表示。

## データ源（段階0で確認、2026-10-05）

ブラウザから直接読めるか（CORS）を `curl -H "Origin: http://localhost:8765"` で確認。

| データ | URL（の元） | CORS | キー | 条件・メモ |
|---|---|---|---|---|
| 地理院タイル（std・pale・seamlessphoto・relief・hillshademap・dem_png・dem5a_png） | cyberjapandata.gsi.go.jp/xyz/… | ○ | 不要 | 出典「地理院タイル」を表示。シームレス写真は撮影時期が場所・ズームでちがい、つぎはぎが見える（富士山の山頂付近など）|
| 地理院 地名検索・逆ジオコーダー・標高 API・muni.js | msearch / mreversegeocoder / cyberjapandata2 / maps.gsi.go.jp | ○ | 不要 | 日本のみ |
| AWS Terrain Tiles（Terrarium） | s3.amazonaws.com/elevation-tiles-prod | ○ | 不要 | 世界の標高。出典を表示 |
| Sentinel-2 cloudless 2016（EOX） | tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857 | ○ | 不要 | CC BY 4.0（2016年版）。2018年以降の版は CC BY-NC-SA |
| OpenStreetMap タイル | tile.openstreetmap.org | ○ | 不要 | 大量利用は禁止（利用規約）。公開して人が増えたら別の配信元を検討 |
| Nominatim（OSM 検索） | nominatim.openstreetmap.org | ○ | 不要 | 1秒1回まで、入力中の自動検索は禁止 → 送信時だけ |
| OpenFreeMap（ベクトルタイル、建物の高さ入り） | tiles.openfreemap.org/planet | ○ | 不要 | 段階B 候補（日本の外の建物） |
| PLATEAU カタログ | api.plateau.reearth.io/datacatalog/plateau-datasets | ○ | 不要 | 7776件。建物 1065、**地下埋設物 10（長岡市の水道・下水・ガス管など）**、地下街 13、道路・鉄道・植生など |
| PLATEAU 3D Tiles 本体 | assets.cms.plateau.reearth.io | ○ | 不要 | 段階B・E |
| NASA GIBS | gibs.earthdata.nasa.gov | ○ | 不要 | 段階C（雲・夜の光など） |
| USGS 地震 | earthquake.usgs.gov/…/all_day.geojson | ○ | 不要 | 段階C |
| CelesTrak（衛星の軌道） | celestrak.org | ○ | 不要 | 段階C |
| Overpass API（OSM の検索） | overpass-api.de | × | 不要 | status は 406。使うときに改めて確認 |

- **キーが要りそうなもの（まだ使わない）**: 公共交通オープンデータセンター（電車・バスのリアルタイム。登録とキーが必要）。道路の混み具合のリアルタイムは無料の公開データがほぼない。

## ハマったところ

- Browser ペインが非表示 → Cesium の描画ループが止まり、地球が黒いまま・タイルも読まれない。`__gv.run()` で手動描画。
- 非表示のペインでは読み込み時の `innerWidth` が 0 になることがある → 層のパネルの初期表示は「幅が 0 より大きく 800 未満のときだけ閉じる」。
- 地理院の地名検索は住所専用で「東京タワー」→「…東」のような結果になる → Nominatim を併用。

## 確認のしかた（変更のたびに通しで）

1. http://localhost:8765/god-view/ を開き `await __gv.run(60,120)` → `__gvErr` が空、日本全体が写真で出る。
2. 富士山（`__gv.viewer.camera.setView` で 138.73, 35.22, 高さ 9000m、下向き 25°）→ 立体の山。`__gv.terrain().gsi` が増えている。
3. 検索「東京タワー」→ 一番上が OSM の東京タワー → 選ぶと飛んで、右上に「東京都港区芝公園四丁目」「標高 18.5 m」。
4. 背景を「地図」、ワイヤフレーム、高さ×3 → 表示が変わる。
5. スマホ幅（mobile）で、上のバー・地点の情報・スケールが重ならず、横スクロールなし。
6. 下のスケール表示: 寄ると「画面の幅」と「≒ ものさし」と 10^L が変わり、目盛りの黄色い線が動く。

## 残っている課題

- 日本の外を地図にしたとき、文字が小さめ（OSM タイルを3D の地球に貼るため）。
- 地理院の写真は引いたとき（level 6 未満）は出さず、EOX の写真に統一している。境目で色が変わる。
- 海底地形なし。夜の街の明かり（NASA Black Marble）は段階C。
- ホイールで寄る速さは Cesium の初期設定のまま。宇宙・ミクロとつなぐとき（段階F・G）に、スケール値 L を直接動かす方式に変える。
