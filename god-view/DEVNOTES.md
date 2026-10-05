# 神の視点マップ 開発メモ

最終更新: 2026-10-05

## 別セッションで続けるとき（まずここ）

- **いまの状態**: v008（段階F「宇宙へ」＋切り替えをなめらかに・直し）。地図（3D の地球・建物・地下・生きている地球・動く街）＋宇宙（地球と月〜太陽系〜恒星〜天の川銀河〜局所銀河群〜大規模構造〜観測できる宇宙）。**公開先は GitHub Pages**: https://sishiya.github.io/manabi-lab/god-view/ （push すると更新。RULES 8.1）。
- **次にやること**: 段階G「ミクロへ」（人 → 細胞 → 分子 → 原子 → 原子核 → 素粒子。宇宙と同じ L の仕組みで、地上の一点から寄る。ほかのアプリへの入口も）。候補:「災害の想定」層、OSM の建物の組み立てを Web Worker に（軽量化）。
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
- 2026-10-05 v002b-favicon: ファビコン（地球の SVG を埋め込み）。まなびラボ用のサムネイルは thumbs/god-view.jpg（RULES 8.1）。
- 2026-10-05 v003-osm-buildings: 段階B の2。PLATEAU のない所の建物（OpenFreeMap のベクトルタイル、`js/mvt.js` の自作解読器、`js/osmbuildings.js`）。パリ・函館・ニューヨークで確認。
- 2026-10-05 v004-underground: 段階B の3。地面の半透明化と地下へのカメラ、PLATEAU の地下街（7か所）・長岡市の下水道管とマンホール（3D）・水道管など（平面の線を推定の深さで）、見どころボタン、地下のものの名前と設置年。
- 2026-10-05 v005-living-earth: 段階C。時刻（スライダー ±24 時間・早送り）、夜の明かり（Black Marble、夜の側だけ）、背景「きのうの地球」（NASA の毎日の衛星写真）、地震（USGS）、人工衛星（CelesTrak＋satellite.js）、天気（Open-Meteo）。軽量化（下の「軽量化」）。
- 2026-10-05 v006-moving-city: 段階D。都営の電車・バスのいまの位置（`js/transit.js`、`data/toei.js` は `tools/build-toei-index.ps1` で生成）、車・人・鳥の演出（`js/agents.js`）。
- 2026-10-05 v007-space: 段階F。`js/space.js`（Three.js r128・astronomy-engine・`data/stars.js` を宇宙に出たときに読み込む）。地図との出入り、目盛りの帯で移動、出典の表示。
- 2026-10-05 v008-smooth: 地図⇔宇宙を重ねて入れかえ（大きさ・画角・明るさを合わせる、transitionend で終わりを判断、先読み）。地震の裏側を隠す（EllipsoidalOccluder）。地下で車・人・鳥が残る、宇宙で⌂が効かない、を修正。

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
| `js/mvt.js` | ベクトルタイル（Mapbox Vector Tile）の小さな解読器（外部ライブラリなし） | `GV.decodeMVT(buf, [層の名前])` |
| `data/plateau-under.js` | PLATEAU の地下データの一覧（手で作成。地下街7・長岡市の下水道管とマンホール・管のベクトルタイル3種） | `GV.PLATEAU_UNDER` `GV.PLATEAU_PIPES` |
| `js/underground.js` | 地下を見る: 地面の半透明・地下へのカメラ、地下の 3D Tiles、管の線、見どころへ飛ぶ | `GV.applyUnderground()` `GV.initUnderground()` `GV.gotoUnder(key)` `GV.UNDER_SPOTS` `GV.underStatus` |
| `js/life.js` | 段階C: 時刻の操作、夜の明かり、地震、人工衛星（satellite.js は使うときに CDN から読み込む） | `GV.applyLife()` `GV.initLife()` `GV.setTimeOffset(h)` `GV.setTimeSpeed(x)` `GV.lifeStatus` |
| `js/transit.js` | 都営の電車・バスのいまの位置（30秒ごと）。路線は駅を直線で結ぶ。`data/toei.js` は使うときに読み込む | `GV.applyTransit()` `GV.initTransit()` `GV.transitInfo(id)` `GV.transitStatus` |
| `data/toei.js` | **自動生成**（257KB）。都営バスのバス停 3690・都営の駅 149・路線 6 の座標。作り直しは `tools/build-toei-index.ps1` | `GV.TOEI` |
| `js/agents.js` | 車・人・鳥の演出。画面の中心 700m の OSM の道路・緑地から | `GV.applyAgents()` `GV.initAgents()` `GV.agentStatus` |
| `js/space.js` | 段階F の宇宙（Three.js）。L で大きさ、注目点の切り替え、天体・恒星・銀河・大規模構造、ラベル、地図との出入り | `GV.enterSpace(L)` `GV.exitSpace()` `GV.spaceGoto(L)` `GV.spaceWidth()` `GV.stage` |
| `data/stars.js` | **自動生成**（249KB、CC BY-SA 4.0）。HYG から明るさ 6 等まで・20 パーセク以内の恒星 6641 個。作り直しは `tools/build-stars.ps1` | `GV.STARS` |
| `js/osmbuildings.js` | PLATEAU のない所の建物（OSM）。z14 のタイルごとに屋根と壁を組み立てて1つの Primitive。クリックした建物の高さ | `GV.applyOsmBuildings()` `GV.initOsmBuildings()` `GV.pickOsmBuilding()` `GV.osmStatus` |
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

### OSM の建物（osmbuildings.js、v003）
- OpenFreeMap の TileJSON（`GV.OSMB.tilejson`）からタイルの URL を取る（URL に版の日付が入っていて変わるため、毎回 TileJSON から）。ズーム14、`building` 層。
- OpenFreeMap は**同じ高さの建物をまとめて1つの地物（多角形がたくさん）**にしている。輪の符号付き面積で「外側＋穴」に分ける（最初の輪の符号が外側）。高さは `render_height`／`render_min_height`（OSM の height・building:levels から。タグがなければ既定の推定値）、`hide_3d` は出さない。
- 形はタイル中心の ENU 座標（m）で組み立てる: 屋根は `Cesium.PolygonPipeline.triangulate`（earcut）、壁は辺ごとの四角を両面で。法線は外側の輪の回り方から外向きに。1タイル1つの `Primitive`（`asynchronous: false`、位置は DOUBLE、`modelMatrix` に ENU）。
- 地面の高さ: 同じ z14 の標高タイル（`GV.demTile`。地形と同じデータ）で、外側の輪の頂点の一番低い値。地形とずれない。
- 表示: カメラの高さ 6km 未満で、真下のまわりのタイル（1.5km 未満なら3×3、それ以上は5×5のうち近い9枚）。覚えるのは30枚。PLATEAU の区・市の範囲の中のタイルは出さない（建物「なし」のときは出す）。
- クリック: Primitive の id `{osmTile}` に当たったら、pickPosition の点がどの建物の輪の中かを調べて高さを出す。
- 重さ: 1タイルの組み立てで最大 0.25 秒ほど画面が止まる（パリ・ニューヨークで 3〜4万棟/9枚）。気になるなら Web Worker に移す。
- ワイヤフレームは OSM の建物には効かない（Primitive に仕組みがない）。

### 地下（underground.js、v004）
- 「地下を見る」: `globe.translucency`（表の濃さ＝「地面の濃さ」、裏は＋0.25）、`undergroundColor` は暗い茶色、`enableCollisionDetection = false` でカメラが地下へ。建物は PLATEAU を半透明のスタイル（`ghostStyle`、色 #cfe3ff・不透明度 0.18）に、OSM の建物は隠す（隠さないと地下街が見えない）。
- PLATEAU の地下データは少ない（2026-10 時点）: **地下街**（LOD4、写真つき）＝札幌・千代田・中央・新宿・台東・渋谷・豊島（千代田と中央は同じ範囲＝八重洲。両方読んでも重なりの不具合は見えなかった）。**地下埋設物**は長岡市だけ: 下水道管とマンホールは 3D Tiles（LOD3、本当の深さ）、水道管・ガス管・その他の管路・ハンドホールは**平面の線（ベクトルタイル、ズーム8〜18。深さ・太さのデータなし）**。
- 高さ: 地下の 3D Tiles も建物と同じくジオイド高だけ下げる（長岡 39.82m）。補正後、マンホールの上端が地面とほぼ一致することを確認。
- 水道管などは地面（標高タイル z14）から **1.2m 下に推定**して `PolylineGeometry`（幅4px、色: 水道 #3fa9ff・ガス #ffd23f・その他 #c58bff）。画面とクリックの表示で「推定」と明記。1.2m は道路法施行令の水道管の土かぶりの標準（現在は浅くできる規定もある）。
- 長岡市の管は**長岡駅前ではなく市の西部の丘（親沢町あたり、標高約110m）**の一角だけ。水道管が多いのは東経138.746°・北緯37.427°付近 → 見どころ「長岡市の地下の管」はそこ。下水道管・マンホールは細いので、近づかないと見えない（画面の幅 100m くらい）。
- 見どころ（`GV.UNDER_SPOTS`）: 見たい地点の地面の高さを標高タイルで取り、`flyToBoundingSphere` ＋ `HeadingPitchRange` で斜め上から。丘の上でも街なかでも同じ見え方になる。
- 読み込みは「地下を見る」がオンで、範囲から約 800m 以内・高さ 8km 未満のときだけ。
- クリック: 地下の 3D Tiles の地物は `f.tileset.underItem` で種類（地下街・下水道・マンホール）、属性 `uro:year` を「設置の年」として出す。管の線は Primitive の id `{pipe, name}`。

### 生きている地球（life.js、v005）
- 時刻: Cesium の `clock`。スライダーは「いま」から ±24 時間（`setTimeOffset`）、早送りは `clock.multiplier`（600＝1秒が10分、3600＝1秒が1時間）。昼と夜（`enableLighting`）・夜の明かり・衛星の位置がこの時刻で動く。
- 夜の明かり: GIBS の VIIRS Black Marble 2016 を `ImageryLayer({ dayAlpha: 0, nightAlpha: 1 })` で一番上に。昼と夜がオフだと夜の側が分からないので、オンにすると昼と夜も自動でオン。
- きのうの地球: GIBS の VIIRS_SNPP_CorrectedReflectance_TrueColor（きのうの UTC の日付、ズーム9まで）。背景の1つ（日本の地理院の層は重ねない）。
- 地震: USGS の 2.5_week.geojson を `PointPrimitiveCollection` で。色は深さ（30km 未満 赤・100 未満 橙・300 未満 黄・それより深い 青）、大きさは M。山に隠れないよう `disableDepthTestDistance` で奥行きの判定を切っているので、**地球の裏側の点は `EllipsoidalOccluder` で自分で隠す**（v008。描画の前にカメラが動いていれば計算。camera.changed は 20% 動かないと来ないので使わない）。
- 人工衛星: CelesTrak の stations と visual（重なりを除いて 173 機）の TLE を、satellite.js（`twoline2satrec`→`propagate`→`eciToGeodetic`）で 1 秒ごとに計算。ISS は黄色＋ラベル＋1周分（93分）の通り道（5分ごとに描き直し）。CelesTrak は同じグループの取得を2時間に1回までにしてほしいとのことなので、ページを開いてオンにしたときに1回だけ取る。
  - **ハマった**: 衛星の点を作り終える前に `clock.onTick` が位置を更新しようとして、Cesium の描画が止まった（「An error occurred while rendering」）→ 点のない衛星は飛ばす、onTick の中は try で包む。
- 天気: クリックした地点の Open-Meteo の current（気温・湿度・天気コード・風）。数値予報モデルの値なので「推定」の印。WMO の天気コードは日本語の表 `WMO` で。

### 軽量化（v005。ユーザーから「重くなってきた」）
- 画面の幅（`GV.viewWidth`、地表への pick）を毎フレーム測っていた → カメラが動いたとき・タイル読み込みが終わったときだけ、0.25 秒に1回まで。
- 地形の細かさ `maximumScreenSpaceError` 1.5 → 2（Cesium の初期値）、`tileCacheSize` 300 → 150。
- PLATEAU の建物: 同時に表示 6 → 4 区・市、覚えておく 10 → 6、`maximumScreenSpaceError` 12 → 16、`cacheBytes` 96MB（初期値は tileset ごとに 512MB）。地下の tileset も 64MB。
- OSM の建物: 覚えておく区画 30 → 14。
- 止まっているときは描き直さない: 実時間の昼夜は `maximumRenderTimeChange`（60 秒）に任せ、衛星は位置を更新した 1 秒ごとだけ `requestRender`。
- まだできること: OSM の建物の組み立てを Web Worker に、PLATEAU の写真なし（LOD2 テクスチャなし）を初期値にする、など。

### 動く街（transit.js・agents.js、v006）
- 電車・バス: 公共交通オープンデータセンターの**キー不要の公開 API**（`api-public.odpt.org/api/v4/`）。東京都交通局のデータは CC BY 4.0（CKAN のデータカタログで確認）。キーが要る `api.odpt.org` は使わない。JR・東京メトロ・私鉄はキーが要るので出していない。
  - `odpt:Bus`（都営バス、約490台、約30秒ごと更新、約450KB）: 位置は**緯度経度ではなく** `fromBusstopPole`／`toBusstopPole`＋`fromBusstopPoleTime` → バス停の座標（`data/toei.js`）の間を、出発からの経過時間 × 5m/秒（信号・渋滞をならした目安）で進める（最大 95%）。
  - `odpt:Train`（都営地下鉄・日暮里舎人ライナー・都電、約90本）: `fromStation`／`toStation`（`toStation` が空なら停車中）→ 駅の間を `dc:date` からの経過 ÷ 110 秒で進める。路線の色はデータの `odpt:color`、ないもの（都電荒川線・日暮里舎人ライナー）は見やすさのための色。
  - 路線の線は駅を直線で結んだもの（`GroundPolylinePrimitive`、地面に沿わせる）。線路の正確な形ではない。
  - 取得は「電車・バス」がオンで、東京都のあたり（高さ 150km 未満）を見ているときだけ。30秒ごと。
  - 地下鉄も地上の高さに点で出している（地下の深さのデータはない）。
- 車・人・鳥（演出）: OpenFreeMap のタイルの `transportation`（道路の種類 class／subclass、brunnel）・`park`・`landcover`（grass／wood）。トンネルは除く、橋は 8m 上げる。
  - **画面の中心（地面）から 700m** の道路だけ。最初はまわり 9 区画に散らしたら画面にほとんど入らなかった → 中心に集め、250m 動いたら作り直す。高さ 1.2km 未満、地下を見るときは出さない。
  - 数: 道路の長さ（km）× 種類の重み × 時間帯（日本時間の時刻ごとの表 `busy()`。朝夕の通勤時間が多く深夜は少ない）。車は ×20、人は ×40、上限 車600・人1200・鳥40。速さは道路の種類ごと（高速 22m/秒〜生活道路 6m/秒）、人は 1.0〜1.6m/秒。端まで来たら引き返す（交差点で曲がる処理はまだ）。車線・歩道の分だけ横にずらす。
  - 鳥は緑地の中心のまわりを高さ 25〜65m で回る。
  - 点（`PointPrimitiveCollection`）で、毎フレーム位置を更新（このときだけ描き直し続ける）。早送りしても 10 倍まで。地面の面とのずれで埋まらないよう 2.5m 上げる。

### 宇宙（space.js、v007）
- 地図（Cesium）の上に `#space`（Three.js の canvas）を重ね、`body.in-space` で切り替える。宇宙にいるあいだは `viewer.useDefaultRenderLoop = false` で地図の描画を止め（軽量化）、時計は宇宙側で `clock.tick()`。
- 出入り: 地図でカメラの高さ 3.3 万 km より上からさらにホイールで引く（スマホは 3.6 万 km より上でピンチ）→ 宇宙。宇宙で L が 7.45 より小さくなる（ホイールで寄る）→ 地図に戻り、宇宙で見ていた方向の真上 2.6 万 km から地球を見る。向きは地球固定 ↔ 赤道座標をグリニッジ恒星時で回して合わせる（歳差・章動は無視）。
- 目盛りの帯（準備のできたもの）を押すと `GV.gotoL`: 宇宙の帯は宇宙へ、街・地形・地球の帯は地図へ（いまの場所の真上、画面の幅がその大きさになる高さ）。
- **座標の持ち方**: すべて太陽を原点、赤道座標 J2000（astronomy-engine の EQJ）、メートル、float64。描くたびに (位置 − 注目点) ÷ W（画面の幅）にして Three.js へ（カメラは原点を W=1 で見る）。点の集まり（恒星・銀河・大規模構造・軌道）は、自分の単位（pc・kpc・Mpc・AU）のまま group に入れ、group の位置と縮尺だけ毎フレーム変える。これで 10^7〜10^27 m を 1 つの場面で扱える。`logarithmicDepthBuffer`。
- 注目点: L < 9.2 は地球、10.6 で太陽へ、18.6〜20.6 で太陽 → 銀河の中心、22.4〜23.6 で局所銀河群の中心（天の川とアンドロメダの間）へ（`smooth` でなめらかに）。
- 天体: 太陽・8 惑星・月は本当の半径の球。位置は astronomy-engine（`HelioVector`、`GeoMoon`）で Cesium の時計の時刻 → 時刻のスライダーで動く。小さくて見えないとき（半径が画面の 0.4% 未満）は光の点（Sprite）。地球の写真は GIBS の WMS（Blue Marble、2048×1024）、自転は恒星時。月の表面・惑星の色は演出。軌道はいまから 1 周分を 180 点で。
- 恒星: `data/stars.js`（HYG v4.1 の x,y,z パーセク・赤道座標）。明るさは見かけの等級、色は B-V。名前は明るい順に 40 個（`STAR_JA` で日本語）。
- 天の川銀河（演出）: 中心のふくらみ＋4 本の腕（ピッチ角 13°）＋円盤、6 万点。銀河座標の向きは銀河の中心（赤経 266.405°・赤緯 −28.936°）と北銀極（192.859°・27.128°）から。太陽から中心まで 8.2 kpc。腕は最初細すぎて線に見えた → 角度のばらつき ±0.55 rad・半径のばらつき 25% に。
- 局所銀河群: アンドロメダ（765 kpc）・さんかく座（840 kpc）・大小マゼラン雲（50・62 kpc）。位置は観測値、形は演出（マゼラン雲は不規則な塊）。マゼラン雲の名前は L 22.6 までで消す（天の川と重なる）。
- 大規模構造（演出）: ±450 Mpc の立方体に 260 の節（銀河団）と、近い 3 つの節を結ぶ糸（フィラメント）。おとめ座銀河団の方向・距離（16.5 Mpc）は観測値。
- 観測できる宇宙の果て: 半径 4.4×10^26 m（約 465 億光年）の球。表の面だけ描く加算合成のうすい球（最初は網の線にしたら、内側から線だらけで見えた）。L 26.55 から。宇宙の上限 L は 27.4（球の全体が見える）。
- **切り替えをなめらかに（v008）**: ユーザーから「パカッと切り替わりすぎ」。
  - 大きさ: 宇宙の W は「地球の中心の位置での画面の幅」なので、地図のカメラの地球中心からの距離 × 横の画角（`hfovK`）で L を決める（`LfromCesium`）。戻るときは逆に、高さ = W ÷ 横の画角 − 地球の半径。行って戻ると同じ高さになる。
  - 画角: Three.js の fov（縦）を Cesium の `frustum.fovy` に合わせる。
  - 明るさ: 地図の「昼と夜」がオフなら、宇宙でも入った直後は全面を明るく（環境光を強く）し、L 7.9〜8.8 で太陽の光の当たり方（夜の側）を出していく。
  - 重ね方: 宇宙の canvas を透明（CSS の初期値 opacity 0）で出し、1 枚描いてから 0.7 秒で不透明に。**終わりは transitionend で判断**して、そこで地図を隠す（`body.space-solid`）・地図の描画を止める。タイマーで判断したら、描画の遅い環境で、宇宙がまだ透明なうちに地図を隠して真っ黒になった。戻るときは地図を出してから宇宙を透明にし、終わったら片づける（そのあいだ宇宙の canvas は操作を受けない）。
  - 先読み: 地図で高さ 1.5 万 km より遠くから見ているとき（moveEnd）に、Three.js・astronomy-engine・星表を読み、場面を作り、シェーダーを準備（`renderer.compile`）しておく。
  - 地球の写真は届いてから貼る（届く前に貼ると真っ黒に描かれた）。それまでは海の色。
- ラベルは HTML（`#space-labels`）。重なるものは先に出したもの（大きな天体・明るい星）を残す。
- 出典は宇宙の画面の下（`#space-credit`）に。地図の出典（Cesium）は宇宙では隠れるため。
- ハマった: PowerShell の `.Replace` で `\n` と書くと改行にならず、そのまま文字で入る（JS が壊れる）。改行を含む置き換えは Edit ツールで（RULES 6章）。

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
| OpenFreeMap（ベクトルタイル、建物の高さ入り） | tiles.openfreemap.org/planet | ○ | 不要 | v003 で建物に使用。登録・キーなし、回数制限なし、商用可。出典「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」が必要 |
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
| OpenFreeMap（OSM の建物） | 回数制限なし・登録なし・商用可。出典が必要。元データは OSM（ODbL） | 表示中は地図の下に出典。「このアプリについて」にも |
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
11. OSM の建物: パリ（2.2945, 48.85、450m、方位 20°、下向き 25°）・函館（140.72, 41.757、500m）→ 白っぽい建物が並ぶ（パネルに「9 区画・3万棟」ほど）。地図の下に OpenFreeMap の出典。建物をクリックすると「高さ 約 ○ m」。
12. 東京駅（PLATEAU の区）では OSM の建物が 0 棟（二重にならない）。
13. 地下: パネルの「東京駅・八重洲の地下街へ」→ 半透明の地面の下に八重洲の地下街、建物は薄く。パネルに「表示中: 東京駅・八重洲…」。地下（139.7712, 35.6775、高さ −12m、方位 330°）に潜っても表示が壊れない。
14. 「長岡市の地下の管へ」→ 青（水道）・紫（その他）・黄（ガス）の線、パネルに「水道管・ガス管など 5328 本」。138.74611, 37.42658 の近く（画面の幅 70m）で灰色のマンホールと茶色の下水道管。クリックで「汚水マンホール／設置の年 1997」、管は「深さ 約1.2m（推定）」。
15. 「地下を見る」をオフ → 地面が不透明に戻り、建物の半透明も戻る。
16. 生きている地球: 地震・人工衛星・夜の明かりをオン、引いて地球全体 → 地震の点（300件ほど）、衛星（170機ほど）、黄色の ISS と通り道。時刻を +9 時間にすると日本が夜になり街の明かり。背景「きのうの地球」で雲の写った写真。
17. 東京駅あたりをクリック → 住所・標高に加えて「いまの天気: 晴れ・○℃…（推定）」。地震の点をクリック →「マグニチュード／深さ／時刻」。
18. 動く街: 「都営の電車・バス」をオン、東京（139.73, 35.62、高さ 22km）→ 緑のバス約490台、路線の色の電車約90本と路線の線。パネルに取得時刻。バス・電車をクリック →「都営バス 都07 …／次は …」「大江戸線（… 行き）○○ → ○○」。
19. 「車・人・鳥」をオン、新宿駅西口（139.6995, 35.6915 を 300m から）→ 車 600・人 1200・鳥 40 ほどが道路に沿って動く。クリックで「架空の人です」。
20. 宇宙へ: 地図をいちばん引いて（高さ 3.9 万 km）さらにホイールで引く → 宇宙の地球（地図と同じ向き、昼と夜も合う）。目盛りの「太陽系」→ 惑星と軌道、「恒星・銀河」→ 恒星の名前（シリウス・リゲルなど）と天の川銀河、「宇宙」→ 局所銀河群・大規模構造・観測できる宇宙の果て。画面の下に宇宙の出典。
21. 宇宙でホイールを手前に回し続ける → 地球の地図に戻る。目盛りの「街・地形」→ 地図のいまの場所へ。スマホ幅で横スクロールなし。
22. 切り替え: 地図を高さ 3.4 万 km まで引いて（先読みのため数秒待つ）さらに引く → 地球の大きさが変わらずに宇宙へ重なる（黒い画面が挟まらない）。戻ると高さ 3.4 万 km に戻る。
23. 地震を太平洋の上（-150, 20、高さ 2.2 万 km）から → 見えている面の点だけ（裏側の点が透けない）。

## 残っている課題

- 日本の外を地図にしたとき、文字が小さめ（OSM タイルを3D の地球に貼るため）。
- 地理院の写真は引いたとき（level 6 未満）は出さず、EOX の写真に統一している。境目で色が変わる。
- 海底地形なし。夜の街の明かり（NASA Black Marble）は段階C。
- ホイールで寄る速さは Cesium の初期設定のまま。宇宙・ミクロとつなぐとき（段階F・G）に、スケール値 L を直接動かす方式に変える。
