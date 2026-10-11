# YouTube へのアップロードの記録（エラー）

upload-batch.ps1 が書く。1日の区切りは太平洋時間の0時（日本時間16時、冬は17時）。

| 日時（日本） | 動画 | その日に上げた本数（API） | エラー |
|---|---|---|---|
| 2026-10-11 09:15 | god-view-guide | 6 | 失敗: 動画を送れませんでした: The underlying connection was closed: An unexpected error occurred on a send. |
| 2026-10-11 09:16 | god-view-guide | 6 | （上の続き）実は上がっていた → BP7FtZfR2Kg。-Update -Full で仕上げた |
| 2026-10-11 09:23 | wifi-wave-guide | 8 | 失敗: 動画を送れませんでした: The underlying connection was closed: An unexpected error occurred on a send. |
| 2026-10-11 09:23 | wifi-wave-guide | 8 | （上の続き）実は上がっていた → vLXOfsPsrq8。-Update -Full で仕上げた |
| 2026-10-11 09:26 | mold-growth-guide | 10 | 動画は上がった（q9Hv3NKkYm4）が、字幕の一覧を取れませんでした: 403 quota exceeded → 英語の字幕なし。上限が戻ってから -Update |
| 2026-10-11 09:27 | mold-growth-short | 10 | 動画は上がった（FJnDw9MjCL0）が、字幕の一覧を取れませんでした: 403 quota exceeded → 英語の字幕なし。上限が戻ってから -Update |

## わかったこと（2026-10-11、太平洋時間 10/10 の日）
- チャンネルとしては 21本（API 18本＋Studio 3本）上げても、本数の上限（exceeded the number of videos）には当たらなかった。
- API の使用量の上限には 09:26（日本時間）に当たった。Google の表の値で数えて約 22,800 ポイントの時点（videos.insert を表どおり 1600 と数えると上限 10,000 を超えるので、実際の insert はもっと安い）。
- 上限に当たったあとも videos.insert（動画を上げる）は通り、字幕（captions）だけが 403 quota で断られた。だから、上限の近くで上げると字幕のない動画ができる。
- 600MB くらいの大きい動画は、送り終わったところで「The underlying connection was closed」が出ることがある（3回。どれも実は上がっていた）。

## 公開前の確認（RULES 8.4。公開の日に、その日の分）

| 日付 | 動画 | 結果 | 直したこと |
|---|---|---|---|
| 2026-10-11 | evolution-guide（h1r0MqMrNAY） | OK（-Verify・コマ・公開中のアプリ） | なし |
| 2026-10-11 | evolution-short（QWAG8kMWAn8） | **NG**: 31〜38秒（4290万〜15万年前）で地面が白い霧に埋まる | アプリの衝突の冬を直した（evolution v008f）→ 録りなおし（古いのは `evolution-short.before-winter.mp4`）。10/11 17:50 に差しかえ: 新しい cY1n0dAu948 を 20:05 で予約、古い QWAG8kMWAn8 は予約を外した（非公開のまま。消すのはユーザーが Studio で） |
| 2026-10-11 | mold-growth-guide・short（10/22 公開） | 英語の字幕を付けた（上限に当たって付かなかった分）→ -Verify -Date 2026-10-22 で OK | — |
| 2026-10-11（前日） | body-dive-guide（Bb4pSYgpfx4、10/12） | OK（-Verify・コマ・公開中のアプリ） | なし |
| 2026-10-11（前日） | body-dive-short（y-jvQvZPn70、10/12） | 注意: 16〜18秒（胃→幽門）に胃の液面が平たいベージュの板・星形のぎざぎざで映る（アプリの描き方。いまのアプリで録っても同じ） | このまま出す（2026-10-11 ユーザー） |
