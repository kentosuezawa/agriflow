# ADR-0004: 提出版のPostgreSQL・Compose・worker実行

- 状態: /goalで承認された実装範囲における採用。製品要件v1.0承認ではない。
- 関連: Issue #6、PF-01/07/08/10/11、NFR-002/003/005/008/009

既存Node/TypeScriptエンジンを維持し、PostgreSQL17とpg8.16.3をローカルで使う。SQLiteは配布と単一利用者の運用が軽いが、今回のSQL・トランザクション・別プロセスDB・バックアップの学習証拠を作るためPostgreSQLを選ぶ。JSON版は互換用に残す。DBなし起動は従来のJSON版でありDB検証の代替ではない。

資源・作業・先行関係・不可時間は正規化しFK/CHECKで保護。候補/確定版は当時のsnapshotと結果をJSONBで不変保存する。履歴は追記し、現行資源が削除されても過去の表示はsnapshotを参照する。配列順序もordinalで保持する。履歴検索はversion索引、作成時刻索引を持つ。

トランザクションでfarm_state行をFOR UPDATEロックし、最新状態からmutation/承認を行う。古いrevision/baseVersionを拒否する。小規模PoCなので現在エンティティはトランザクション内で再挿入する。増分更新より実装は単純だが書込増幅があり、大規模には向かない。版競合だけでなく同時承認も直列化する。readはREPEATABLE READで複数表の一貫性を保つ。

計算はworker threadへ移し、HTTPイベントループを塞がない。同一プロセスの計算は1本、重複は409。結果保存時にも版を再確認する。workerの15秒監視は異常終了保護で、通常の探索2秒の厳密保証ではない。プロセス再起動後のジョブ再開は今回対象外。

Composeはapp/dbの2サービス、DBポートをホスト公開しない。appは非root・ホスト側127.0.0.1のみ公開。コンテナ内0.0.0.0は転送を受けるためAGRIFLOW_CONTAINER=1時だけ許可。Host/OriginはPUBLIC_ORIGINのlocalhost/127.0.0.1に限定し、CSPも維持。DB接続文字列や内部例外をAPI/ログへ出さない。公開認証/認可は未実装であり、本番公開しない。

Node/TypeScript/pg/Playwright/PostgreSQLとDocker Engine/Composeによるローカル実行に月額サービスは不要。Docker Desktopは利用者・組織で有償条件が異なるため一律無料とはしない。LinuxのDocker Engine/Composeで再現する。GitHub Actionsの公開リポジトリ標準runner利用を前提にし、有料runner/課金枠を追加しない。

イメージはメジャー系タグ、npm依存はlockfile固定。完全再現用digest固定・脆弱性更新は今後の改善。API4経路は維持し400/409/413/415/500/503の安全なエラーcodeを追加する。JSON原本への書込や自動移行はせず、明示CLIによる空DBへの一回importとbackup/restore手順を用意する。
