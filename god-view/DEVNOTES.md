# 神の視点マップ 開発メモ

最終更新: 2026-10-05

## 別セッションで続けるとき（まずここ）

- **いまの状態**: v002（段階B の1「PLATEAU の建物」）。日本全体から家1軒まで寄れる 3D の地球＋全国 447 区・市の建物の立体。**公開先は GitHub Pages**: https://sishiya.github.io/manabi-lab/god-view/ （push すると更新。RULES 8.1）。
- **次にやること**: 段階B の続き — (2) PLATEAU のない所（日本の外・地方）の建物を OSM の高さ情報から（OpenFreeMap のベクトルタイル）、(3) 地下を見る視点（地面を半透明に）。候補: PLATEAU の建物属性にある**洪水・高潮の想定浸水深**で建物を色分けする「災害の想定」層。PLAN.md 8章。
- **読む順**: `../RULES.md` → このメモ → `PLAN.md`（全体の構想と段階）→ 下の「ファイル構成」で関係するファイルだけ。
- **動かし方**: ユーザーは `god-view/start.bat` をダブルクリック（サーバーがなければ起動して http://localhost:8765/god-view/ を開く）。Claude は `.claude/launch.json` の `apps`。**file:// では動かない**（Cesium の Worker が CDN から読めない。開くと案内だけ出す）。
- **デバッグ用**: `window.__gv`（`width()` 画面の幅 m、`state()`、`terrain()` 標高タイルの読み込み数、`goto(lon,lat,h)`、`home()`、`run(n,dt)` 描画を n 回進める）。例外は `window.__gvErr`。
  - **Browser ペインが非表示だと描画ループが止まる** → `await __gv.run(60,120)` で進めてからスクリーンショット。スクリーンショットが「timed out」になったら、もう一度撮ると撮れることが多い。
- **区切りごとの手順**: `versions/<番号-名前>/` に index.html・css・js を丸ごとコピー → `launcher.html` にカード → このメモの「状態」 → 「確認のしかた」を通しで → 公開前チェック（RULES 7章）→ コミット（push はユーザー）。
- **ユーザーの好み・決まったこと**: 名前は「神の視点マップ」。最初は日本全体。地球を先に厚く。**API キーなしでできることから**。キーが要る段階になったら作業の前に知らせる（使うなら無料、できれば回数無制限のもの）。正確さ重視、実データ／推定／演出を区別して表示。

## 状態（履歴）

- 2026-10-05 企画（PLAN.md）。段階0: データ源の CORS と利用条件を確認し、CesiumJS に決定。
- 2026-10-05 v001-earth-map: 段階A。CesiumJS 1.146、背景4種・陰影・立体の地形・高さの強調・ワイヤフレーム・昼と夜・大気、地名検索、地点の住所と標高、スケール表示。
- 2026-10-05 v001b-start-bat: file:// で開くと地球が出ない問題 → `start.bat`（サーバー起動＋ブラウザ）と file:// のときの案内。
- 2026-10-05 v001c-licenses: 権利と利用条件の見直し（下の章）。出典を地図の上に常に表示（タイルごとの追加出典も）、検索と住所を Nominatim に一本化（間隔とキャッシュ）、EOX を CC BY-NC-SA 表記に、「このアプリについて」に非営利・ほかの地図サービスと無関係・出典の詳細。
- 2026-10-05 **GitHub Pages で公開**（リポジトリを Public に）。本番の URL で「確認のしかた」1〜6 を通して問題なし。操作説明の「住所（世界）」を修正。
- 2026-10-05 v002-plateau: 段階B の1。PLATEAU の建物（447 区・市、LOD1／LOD2、写真）、ジオイド補正、建物の属性、建物のワイヤフレーム、カメラからの光。索引は tools/build-plateau-index.ps1 で生成。

## ファイル構成

読み込み順は index.html の `<script>` の順（Cesium → sources → terrain → earth → data/plateau-bldg → buildings → scale → ui → main）。すべて `window.GV` に載せる。

| ファイル | 中身 | 主な名前 |
|---|---|---|
| `index.html` | 画面の骨組み、このアプリについて（注意・使っているもの） | `#globe` `#top` `#layers` `#point` `#scale` `#about` |
| `css/main.css` | 見た目。スマホ幅（〜640px）の配置 | `--real` `--est` `--fx`（印の色） |
| `js/sources.js` | **データ源の一覧**（URL・出典・範囲・ズーム）。新しいデータはまずここに足す | `GV.JAPAN` `GV.CREDIT` `GV.BASES` `GV.OVERLAYS` `GV.TERRAIN` `GV.API` `GV.TAGS` |
| `js/terrain.js` | 標高タイル → Cesium の地形 | `GV.makeTerrain()` `heightsFor()` `getHeights()` `decodeGsi()` `decodeTerrarium()` `GV.terrainStats` |
| `js/earth.js` | Viewer の作成、層・地形・表示の切り替え、カメラ移動 | `GV.state` `GV.initEarth()` `GV.applyBase/Overlays/Terrain/View()` `GV.home()` `GV.flyToLonLat()` |
| `data/plateau-bldg.js` | **自動生成**（手で直さない）。PLATEAU 建物の索引: 区・市ごとの範囲・ジオイド高・LOD1／LOD2 の URL。作り直しは `tools/build-plateau-index.ps1`（数分。カタログ API と国土地理院のジオイド高計算を使う） | `GV.PLATEAU_BLDG` `GV.PLATEAU_PREFIX` |
| `js/buildings.js` | 建物の立体（PLATEAU 3D Tiles）。見ている範囲の区・市だけ読む、ジオイド補正、クリックした建物の属性 | `GV.applyBuildings()` `GV.initBuildings()` `GV.pickBuilding()` `GV.bldgStatus` |
| `tools/build-plateau-index.ps1` | 上の索引を作るスクリプト（PowerShell 5.1 用に **BOM つき UTF-8** で保存） | |
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
- クリック → `globe.pick` → **住所は Nominatim の reverse**（`jpAddress()` で OSM の address を「都道府県＋市区町村＋町名」に並べる。東京都などは state がないので ISO3166-2 のコードから県名）、**標高は地理院の標高 API**（日本の範囲のみ）。クリックした地点の住所には近くの施設名をつけない（`placeTitle(r, false)`）。
- 検索: Nominatim だけ（施設名も住所も引ける）。**Nominatim へはすべて `nominatim()` を通す**: 1.1秒以上の間隔、同じ URL はキャッシュ（利用規約）。入力中の自動検索はしない。
- 地理院の地名検索・逆ジオコーダー・muni.js は v001c でやめた（「権利と利用条件」）。

### 建物（buildings.js、v002）
- 索引 `GV.PLATEAU_BLDG`（区・市ごと。政令市は区ごと）。カメラの高さ 25km 未満で、見えている範囲（＋カメラの真下）に重なる区・市を**カメラに近い順に6つ**表示。読み込んだものは10個まで覚え、それ以上は古い順に捨てる。
  - 近い順を「見える範囲の中心」から測ると、地平線近くまで見たときに中心がずっと遠くなり、自分のいる区が外れた（v002 作業中に発生）→ カメラの真下から測る。
- LOD は区・市ごとに LOD1（全建物、箱）か LOD2（屋根の形・壁の写真。LOD2 のデータがある所だけ。LOD2 のデータには LOD2 になっている建物だけが入るので、範囲の端で建物が抜けることがある）。LOD2 がない区・市は LOD1。
- **高さの補正**: PLATEAU の 3D Tiles の形は楕円体高、地形（地理院の標高）は標高 → 区・市の中心の**ジオイド高**（27.8〜47.1m、国土地理院のジオイド高計算で索引作成時に取得）だけ、その場所の鉛直方向に下げる（`modelMatrix`）。補正なしだと東京で約37m 浮く（確認済み）。区・市の中でのジオイド高の変化（数十cm）は無視。属性 `_zmin` は標高（補正の確認に使える）。
- 高さの強調（×2 以上）にすると、建物も Cesium が強調するが、ジオイド補正は強調前の値なので少しずれる。
- 光: 「昼と夜」オフのときは `DirectionalLight` をカメラの向き＋少し下向きに毎フレーム向ける（本当の太陽だと夕方・夜に建物が真っ暗になるため）。
- クリック: `scene.pick` が `Cesium3DTileFeature` なら属性（gml:name・bldg:usage・bldg:measuredHeight・bldg:storeysAboveGround／BelowGround）を地点の情報の上に出す。属性には洪水・高潮の想定浸水深（「…_浸水深」）もある。
- 出典は表示中だけ `creditDisplay.addStaticCredit` で出す。

### スケール
- 画面の幅 = 画面中央の地表までの距離 × 2·tan(横の画角/2)。地表に当たらないときは地球の中心までの距離 − 6371km。
- `GV.BANDS` は PLAN.md 4章の帯。`ready: true` の帯だけ明るく表示。

## データ源（段階0で確認、2026-10-05）

ブラウザから直接読めるか（CORS）を `curl -H "Origin: http://localhost:8765"` で確認。

| データ | URL（の元） | CORS | キー | 条件・メモ |
|---|---|---|---|---|
| 地理院タイル（std・pale・seamlessphoto・relief・hillshademap・dem_png・dem5a_png） | cyberjapandata.gsi.go.jp/xyz/… | ○ | 不要 | 出典「地理院タイル」を表示。シームレス写真は撮影時期が場所・ズームでちがい、つぎはぎが見える（富士山の山頂付近など）|
| 地理院 標高 API | cyberjapandata2.gsi.go.jp | ○ | 不要 | 「独自の地図表示サイトからアクセスしてよい」と明記。過度な負担は禁止 → クリック時だけ |
| 地理院 地名検索・逆ジオコーダー・muni.js | msearch / mreversegeocoder / maps.gsi.go.jp | ○ | 不要 | **使わない**（「主に地理院地図からの利用を想定」「予告なく変更」） |
| AWS Terrain Tiles（Terrarium） | s3.amazonaws.com/elevation-tiles-prod | ○ | 不要 | 世界の標高。出典を表示 |
| EOxCloudless（Sentinel-2 cloudless 2016） | tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857 | ○ | 不要 | **全年 CC BY-NC-SA 4.0**（EOX のライセンス表、2026-10 確認。「2016年は CC BY」は古い情報）。非営利なら可、商用は有料 |
| OpenStreetMap タイル | tile.openstreetmap.org | ○ | 不要 | 大量利用は禁止（利用規約）。公開して人が増えたら別の配信元を検討 |
| Nominatim（OSM 検索） | nominatim.openstreetmap.org | ○ | 不要 | 1秒1回まで、入力中の自動検索は禁止 → 送信時だけ |
| OpenFreeMap（ベクトルタイル、建物の高さ入り） | tiles.openfreemap.org/planet | ○ | 不要 | 段階B 候補（日本の外の建物） |
| PLATEAU カタログ | api.plateau.reearth.io/datacatalog/plateau-datasets | ○ | 不要 | 7776件。建物 1065、**地下埋設物 10（長岡市の水道・下水・ガス管など）**、地下街 13、道路・鉄道・植生など |
| PLATEAU 3D Tiles 本体 | assets.cms.plateau.reearth.io | ○ | 不要 | v002 で建物に使用。Range 要求にも対応（索引作りで先頭だけ読む） |
| 国土地理院 ジオイド高計算 | vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh | ×（アプリからは使わない） | 不要 | 索引作成のときだけ。続けて送ると 0 を返すことがある → 間隔をあけて再試行 |
| NASA GIBS | gibs.earthdata.nasa.gov | ○ | 不要 | 段階C（雲・夜の光など） |
| USGS 地震 | earthquake.usgs.gov/…/all_day.geojson | ○ | 不要 | 段階C |
| CelesTrak（衛星の軌道） | celestrak.org | ○ | 不要 | 段階C |
| Overpass API（OSM の検索） | overpass-api.de | × | 不要 | status は 406。使うときに改めて確認 |

- **キーが要りそうなもの（まだ使わない）**: 公共交通オープンデータセンター（電車・バスのリアルタイム。登録とキーが必要）。道路の混み具合のリアルタイムは無料の公開データがほぼない。

## 権利と利用条件（2026-10-05 調べ。新しいデータを足すときもこの表に足す）

**見た目が Google マップに似ていること**: 地図アプリの画面の構成（写真の地球、検索窓、層の切り替え、ホイールで寄る）は機能やアイデアで、著作権では守られない。問題になるのは、Google のデータ（地図・写真・3D）を使うこと、ロゴ・アイコン・名前・独自のデザインをまねること。このアプリは**どれも使っていない**（データはすべて公的機関・オープンデータ、画面は自作、名前も別）。気をつけること:
- Google のロゴ・赤いピンのアイコン・配色やボタンの形をそのまままねない。説明文で「Google マップのような」と宣伝しない（PLAN の「イメージ」は企画メモなので可）。
- 「このアプリについて」に「Google などの地図サービスとは関係がない」と書いてある。

**データごとの条件と、このアプリでの対応**:

| データ | 条件（要点） | 対応 |
|---|---|---|
| 地理院タイル | 国土地理院コンテンツ利用規約。std・pale は基本測量成果だが「ウェブでリアルタイムに読み込むなら出典の明示だけで申請不要」。写真・色別標高図・陰影・標高タイルは出典だけで可。ZL5〜8 の std／pale、写真の ZL2〜8・GRUS 範囲、色別標高図の海域は**追加の出典を併記** | `GV.CREDIT.gsi*` に指定の文言。地図の上に表示 |
| 地理院 標高 API | 外部サイトから使ってよい。過度な負担は禁止。予告なく変更・停止あり | クリックのときだけ |
| 地理院 地名検索・逆ジオコーダー | 主に地理院地図用。長期提供の保証なし | 使わない |
| OSM タイル | 出典を地図の上に見える形で（隠さない）。ふつうの閲覧は可、まとめてダウンロード・オフライン用は禁止。Referer を送る | Cesium の出典を `showOnScreen: true`。先読みはしない（Cesium は見えている範囲だけ読む）|
| Nominatim | 1秒1回まで、結果をキャッシュ、入力中の自動検索は禁止、出典を表示 | `nominatim()` で間隔とキャッシュ。検索と住所の下に出典 |
| EOxCloudless | CC BY-NC-SA 4.0（非営利のみ）。出典を見える所に（指定の文言）| 非営利の学習用として利用。**商用にするならこの層を差し替える** |
| Terrain Tiles | Mapzen と各データの出典（USGS・NOAA・Copernicus ほか） | 地図の上に要約、「このアプリについて」に一覧 |
| CesiumJS | Apache-2.0。CDN から読み込むだけ（改変・再配布なし） | 「このアプリについて」に表記 |
| PLATEAU（3D都市モデル） | 政府標準利用規約・CC BY 4.0 相当。出典の表示で、複製・加工・商用も可 | 表示中は地図の下に「3D都市モデル（Project PLATEAU）国土交通省」と高さの補正をしたこと |

- ブラウザは User-Agent を変えられないので、OSM／Nominatim には Referer（GitHub Pages の URL）でアプリを識別してもらう。`Referrer-Policy` を厳しくしない。
- 人がたくさん使うようになったら（OSM の「重い利用」に当たりそうなら）、地図タイルと検索の配信元を見直す。

## ハマったところ

- Browser ペインが非表示 → Cesium の描画ループが止まり、地球が黒いまま・タイルも読まれない。`__gv.run()` で手動描画。
- 非表示のペインでは読み込み時の `innerWidth` が 0 になることがある → 層のパネルの初期表示は「幅が 0 より大きく 800 未満のときだけ閉じる」。
- 地理院の地名検索は住所専用で「東京タワー」→「…東」のような結果になる → Nominatim を併用。
- index.html をダブルクリック（file://）すると「Refused to cross-origin redirects of the top-level worker script」で地球が出ない → start.bat から開く。

## 確認のしかた（変更のたびに通しで）

1. http://localhost:8765/god-view/ を開き `await __gv.run(60,120)` → `__gvErr` が空、日本全体が写真で出る。
2. 富士山（`__gv.viewer.camera.setView` で 138.73, 35.22, 高さ 9000m、下向き 25°）→ 立体の山。`__gv.terrain().gsi` が増えている。
3. 検索「東京タワー」→「東京タワー（東京都港区芝公園四丁目）」→ 選ぶと飛んで、右上に「東京都港区芝公園四丁目」「標高 18.5 m」。地図の下に、表示中の層の出典（地理院タイル・EOX・Terrain Tiles など）が出ている。
4. 背景を「地図」、ワイヤフレーム、高さ×3 → 表示が変わる。
5. スマホ幅（mobile）で、上のバー・地点の情報・スケールが重ならず、横スクロールなし。
6. 下のスケール表示: 寄ると「画面の幅」と「≒ ものさし」と 10^L が変わり、目盛りの黄色い線が動く。
7. 建物: 東京駅（139.7671, 35.6745、高さ 700m、下向き 35°）→ 屋根の形と写真つきのビル。パネルに「表示中: 東京都千代田区…」。地図の下に PLATEAU の出典。
8. 建物の高さ: 駅前広場（139.7615, 35.6800、高さ 120m、方位 70°、下向き 18°）で、丸の内駅舎と広場が地面に接している（浮いていない・埋まっていない）。
9. 建物をクリック（東京駅の北東のサピアタワー）→「サピアタワー／業務施設／167.2 m／地上34階・地下3階」。
10. 那覇（127.676, 26.205、600m）で LOD1＋ワイヤフレーム → 箱の建物が線で出る。建物「なし」で消える。

## 残っている課題

- 日本の外を地図にしたとき、文字が小さめ（OSM タイルを3D の地球に貼るため）。
- 地理院の写真は引いたとき（level 6 未満）は出さず、EOX の写真に統一している。境目で色が変わる。
- 海底地形なし。夜の街の明かり（NASA Black Marble）は段階C。
- ホイールで寄る速さは Cesium の初期設定のまま。宇宙・ミクロとつなぐとき（段階F・G）に、スケール値 L を直接動かす方式に変える。
