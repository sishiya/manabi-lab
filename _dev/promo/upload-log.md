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
