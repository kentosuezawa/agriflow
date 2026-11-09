# 提出版の受け入れ・検証記録

2026-11-09 UTC。対象はfeat/portfolio-experience（PR #3/#4/#7/#8を継承する全変更ブランチ）。製品要件v1.0承認・本番運用・実農場の価値確認とは別。

## 実施した検証

- 計算の既存28テスト（内部81小規模oracle比較を含む）＋seed原本保持/改変履歴拒否の2テスト、計30件とstrict型検査が成功。Node22の既存CIも確認。
- PostgreSQL17/Node22統合7件成功: JSON/snapshot/履歴一致、非空DB拒否、FK違反rollback、同時承認1件、SC-004、承認保存失敗rollback、安全なHTTPエラー、登録上限。
- 全変更のComposeアプリ＋DBに対するChromium7件成功: 390px/1440pxの欠勤→再計画→未承認履歴不変→差分→承認→履歴/リロード、複数先行条件の名称編集保持、4状態の表示。
  最後の4状態表示試験はAPI stateをモックしたUI単体受入。計算4状態の正確性はエンジン試験で検証している。全7件が実計算E2Eという意味ではない。
- ブラウザフローでは日時入力の複数フォーカス区間をTabで通ってEnter生成、pageerrorなし、ページ全体の意図しない横溢れなし。タイムラインと表は領域内横スクロール。
- Dockerクリーンビルド、app/db health、空DB seed成功。ホスト公開はappの127.0.0.1:3000のみ、DBのホストport割当なし。非root app。
- コンテナ再作成とpg_dump復元の結果は[recovery.json](recovery.json)、性能の全生値は[performance.json](performance.json)。再現コマンドは[運用手順](../OPERATIONS.md)。
- git diff --check、主要JSのnode --check成功。

環境: Linux6.18.57、AMD EPYC9V74・論理3CPU・総メモリ10,452,459,520bytes。ホストNode24.22.1/npm11.9.0、DB/計算/ComposeのNode22.23.4、PostgreSQL17-bookworm、Docker29.9.2、Compose2.40.3、Playwright1.58.2＋システムChromium。依存はpackage-lock固定。イメージdigestはdocker inspectで取得可能なメジャータグ参照であり完全固定ではない。

## 性能と制限

20作業/5圃場/3人/2台/7日/30分、探索2秒/300000ノード上限、5回連続・明示ウォームアップなし。
探索wallは2000.57〜2002.54ms、全回FEASIBLE/time-limit、全回独立制約検査true。最適性は未証明。
worker＋PostgreSQLの候補API全体は2063.94〜2145.99ms、計算開始100ms後のstate APIは7.47〜19.46msで200。
Cloud共有ホストの少数標本であり、負荷を隔離したSLA/統計的p95保証ではない。RSSは前後値でピークではない。公開環境・ネットワーク・別PCの性能を保証しない。

## PF受入表

| ID | 実装と確認 | 根拠 |
|---|---|---|
| PF-01 | クリーンCompose build/up/health | Dockerfile/compose、Node22、運用手順。Cloud固有CAをsecret使用 |
| PF-02 | 空DB seedと非空拒否、初回ガイド | scripts/seed.mjs、integration、画面onboarding |
| PF-03 | CRUD/上限/先行条件保全 | core/DB/API、e2e/predecessors、integration、既存テスト |
| PF-04 | タイムライン/一覧/JST | e2e/portfolio、実画面画像 |
| PF-05 | 欠勤/差分/承認/履歴 | e2e/portfolio、integrationのSC-004、既存coreの古い候補拒否 |
| PF-06 | 4状態/異常/内部秘匿 | engine、e2e/states（mock）、API integration |
| PF-07 | FK・transaction・同時承認・不変履歴 | migration、PostgresRepository、integration |
| PF-08 | JSON/snapshot同値・非空拒否・失敗rollback・再作成/restore | integration、verify:recovery、recovery.json |
| PF-09 | 390/1440px・Tab/Enter・空/処理中/エラー | e2e/portfolio、focus-visible、実画像。実スマホ未検証 |
| PF-10 | unit/typecheck/API/DB/E2EのCI | .github/workflows/test.yml、下記CI参照 |
| PF-11 | 5回の計算/DB付きAPI応答測定 | scripts/measure.mjs、performance.json |
| PF-12 | README/画像/台本/構成/ER/API/ADR/運用 | 各docs、READMEの資料表 |
| PF-13 | 小さなPR・依存順・引き継ぎ | #7→#8→提出版PR、AGENTS/HANDOFF/TRACEABILITY |

## GitHub上の証拠

- #8 headの[CI run 42681846139](https://github.com/kentosuezawa/agriflow/actions/runs/42681846139): Ubuntu/Windowsのtypecheck/test、UbuntuのPostgreSQL integration/Chromiumジョブがsuccess。これは#8時点の6統合/1ブラウザ試験。
- 提出版先端のCI runとSHAは、この文書の追補および提出PR本文に記録する。ローカル結果を将来のCI成功として扱わない。

## 課題として残すこと

実農場の要件変更希望の具体化、OQ-001〜014、要件v1.0承認、ライセンス選定、公開認証/認可/セキュリティ、別PC・実スマホ・Docker Desktop、ピークメモリと大規模性能、DB増分更新/履歴ページング、復元先への本運用切替・自動監視は未実施。今回の提出目標を満たす証拠と、製品として未確認の事項を分ける。
