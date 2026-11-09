# ローカルAPI契約

HTTP JSON。POSTはContent-Type: application/json。HostはPUBLIC_ORIGINのlocalhost/127.0.0.1のみ、外部Originは拒否。認証なしのローカル模擬データ用途。

| 経路 | 入力 | 成功 |
|---|---|---|
| GET /api/health | なし | 200 {status:"ok",storage:"postgres"または"json"}。DB readも確認 |
| GET /api/state | なし | 200 revision/farm/fields/workers/machines/operations/blocked/proposals/committed |
| POST /api/entities | {collection,action,data,id?} | 200 更新後の全state。collection=farm/fields/workers/machines/operations/blocked。farmはupdateのみ、他はcreate/update/delete |
| POST /api/proposals | {period:{start,end},limitMs?} | 200 保存済み候補。既定2000ms、1〜10000の整数。同期HTTP応答だが計算はworkerで実行 |
| POST /api/commit | {proposalId} | 200 新しい確定版。OPTIMAL/FEASIBLEのみ、revisionとversionが一致する場合だけ承認 |

作業: name/fieldId/duration/earliest/deadline/machineType/predecessors。durationは分ではなく30分slot数。資源のavailabilityは{start,end}配列、空配列は稼働なし。日時はUTC ISO、区間は半開。範囲・型・参照・先行循環・登録数上限を検証する。入力snapshotの正確な型はsrc/scheduler/model.ts。

候補: id/createdAt/baseRevision/baseVersion/period/snapshot/status/assignments/makespan/nodes/elapsedMs/termination。
確定版: 候補の内容＋version/committedAt。履歴は不変。ERRORは4つの計算結果に含めずHTTPエラーで区別する。

| HTTP | code例 | 意味 |
|---|---|---|
| 400 | INVALID_INPUT / INVALID_JSON | 不正な型/期間/参照/候補等 |
| 403 | FORBIDDEN_HOST / FORBIDDEN_ORIGIN | 接続先/接続元が許可外 |
| 404/405 | NOT_FOUND / METHOD_NOT_ALLOWED | 経路/操作が対象外 |
| 409 | STALE_PROPOSAL / COMPUTE_BUSY | 古い候補・承認競合、同一プロセス計算中 |
| 413/415 | BODY_TOO_LARGE / JSON_REQUIRED | 100000 bytes超/JSON以外 |
| 500 | INTERNAL_ERROR | DB・保存・内部異常。パス/スタック/接続文字列を返さない |
| 503 | COMPUTE_TIMEOUT | worker監視上限。探索のUNKNOWNとは別の実行失敗 |

エラー形は{code,message,error}。errorは旧UI互換のmessageと同じ安全な文字列。最適性は探索完了時のみ、UNKNOWNは解なしの証明ではない。計算中の入力変更は結果保存を409にする。APIのバージョン/ページング/公開用レート制限は未導入。
