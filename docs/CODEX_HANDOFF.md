# 提出版実装の引き継ぎ（2026-11-09、最新）

- /goalのPF-01〜13に沿ってローカル提出版を実装。業務前提変更希望・製品v1.0・公開認証/ライセンス等は未解決。mainマージ/本番公開/既存PR closeはしていない。
- ブランチ: `feat/portfolio-experience`。#3→#4→[#7](https://github.com/kentosuezawa/agriflow/pull/7)→[#8](https://github.com/kentosuezawa/agriflow/pull/8)→このブランチの提出PR。先端ブランチは全変更を含む。baseのPR番号だけ見て古い状態を実行しない。
- 修正: 複数先行条件の保持、欠勤入力、タイムライン/一覧/JST、差分・古い候補無効、履歴。DB: PostgreSQL17、FK/CHECK、行ロックtransaction・追記履歴、JSON移行、worker計算、Compose。
- [提出版検証](testing/PORTFOLIO_RESULTS.md)、[運用](OPERATIONS.md)、[5分実演](DEMO.md)、[構成/ER](design/ARCHITECTURE.md)、[API](design/API.md)、[ADR-0004](adr/0004-postgres-compose.md)。
- 実行済み: unit30（計算28＋保存/移行2）/typecheck、Node22/PostgreSQLのintegration7、Compose対象Chromium7（うち4状態表示はmock）、Compose build/health/seed、app/db再作成とpg_dump→新DB復元の全state一致、20作業の5回測定。詳細と生値はtesting/。
- Node起動はDATABASE_URLがなければ従来JSON版。提出版はREADMEのCompose手順。`npm run test:integration`はDB必須で黙ってskipしない。E2Eは専用模擬DBだけに向ける。
- 次: 提出PR先端のCIと資料をレビューし、承認を得たPRだけ統合する。統合順は依存を確認。最終ブランチをcheckoutして全変更を試せる。業務前提の変更は別Issueで具体化する。

---

# 2026-11-09 追補: 最初の提出可能版の目標案

ユーザーは /goal の範囲にDB・Dockerを含め、まず成果物として提示できる水準を希望している。
[完成基準とそのまま使える /goal 指示文](PORTFOLIO_GOAL.md)を作成。PF-01〜13で画面・計画/再計画・承認/履歴・DB整合性・Docker・移行/復元・CI・README/実演の完了を定義した。
業務前提の変更希望はあるが変更内容は未提示。現行モデルを継続承認済みと扱わない。
これは目標/受入案の追加であり、DB・Docker・新画面の実装や製品要件v1.0承認を実施した記録ではない。
次に /goal を開始する際は本書とPORTFOLIO_GOALを読み、最新のPR状態を確認して作業を進める。既存P0の先行条件消失修正を優先する。

---

# 2026-11-09 監査・整理（最新。以下は過去記録）

- 要件はv0.1-draftのまま未承認。main 10733c2は文書のみ。Draft #2 c4db213をDraft #3 688fae9が履歴として包含（差分1コミット）。
- 今回の文書作業ブランチ: `docs/github-handoff-audit-20261109`、base: `feat/scheduler-phase1-poc`。PR URLはGitHubの同ブランチPRを確認。未統合ならmainだけを見て未実装と判断しない。
- [監査結果・要件対応・未承認判断](audit/2026-11-09.md)、[運用・学習ロードマップ・Cloud再開手順](DEVELOPMENT_WORKFLOW.md)、[ADR-0003提案](adr/0003-github-handoff-governance.md)。
- Linux Node 24.22.1: npm ci/test/typecheck/demo/benchmark成功、TAPで28件成功。#2は5件成功。既存#3のNode 22 Windows/Linux CI成功もAPIで確認。
- HTTP登録/計算/承認/再承認拒否/再起動、Chromium 390pxの読込/候補/履歴を確認。SC-004全体・全CRUD・保存失敗・公開保護は未検証。実農場価値は未検証。
- **次の1手:** FR-008のデータ保全修正。APIで2先行条件を登録した作業をUIで編集して保存すると1条件が消える（再現済み）。既存配列を損失なく保持し、回帰試験を付ける独立PRを作る。
- その後API/保存/SC-004の受入→P0 OQと要件差分レビュー→修正済み#3のCI確認→ユーザーのマージ承認。#2終了は#3統合後に承認を得て整理。
- mainマージ・本番デプロイ・要件v1.0承認は未実施。有料サービスなし。実装修正は本監査文書PRに含めていない。

---

# 2026-11-05 更新（以下の2026-10-29記録より優先）

ユーザーの明示指示でPhase 1実装・テスト改善とPhase 2設計を実施。要件v0.1-draftは未承認のまま。
作業ブランチは `feat/scheduler-phase1-poc`。既存MVP（Draft PR #2）を継承し、計算部分をTypeScriptに分離。
`npm ci` の後 `npm test` / `npm run typecheck` / `npm run demo` / `npm run benchmark` が利用可能。
詳細は[検証記録](testing/PHASE1_RESULTS.md)、[ADR](adr/0001-scheduler-phase1.md)、[Web基本設計](design/PHASE2_WEB.md)。
次はDraft PRのレビュー、P0要件判断、Phase 2設計のレビュー。新画面・クラウド・有料サービスは今回実装しない。

---

# Codex 引き継ぎ情報 — AgriFlow（2026-10-29の記録）

**更新:** 2026-10-29  
**状態:** Requirements v0.1-draft（要件定義書はGitHub登録済み、レビュー前）  
**リポジトリ:** https://github.com/kentosuezawa/agriflow  
**優先Issue:** https://github.com/kentosuezawa/agriflow/issues/1

## 1. これまで完了したこと
- GitHub公開リポジトリ `kentosuezawa/agriflow` を作成。
- 製品ビジョン `docs/product/VISION.md` を作成。
- 要求文書 `docs/product/PRD.md` と `docs/requirements/SRS.md` の初版を作成。
- ユースケース、受け入れテスト例、要求とテストの対応、未決事項、レビュー基準、参考資料、決定ログを作成。
- Issue #1「要件定義 v0.1 レビュー・未決事項の確定」を起票。
- **まだコード実装、実行テスト、技術選定、アプリ公開は行っていない。**

## 2. プロジェクトの方向性
AgriFlowは、農作業の資源割当・時間割・作業期限等の制約を扱い、候補計画と再計画を提示するシステムの構想。農業経営課題の解決効果は実ユーザー調査前の仮説であり、現時点では検証可能なMVPが主目的。2026-10-29時点の設計案は「単一農場・複数圃場・作業員・農機・作業」だが、規模やルールは未承認。

## 3. 利用者が明示した方針
- AgriFlowを要件定義から本格的な開発プロセスで管理したい。
- GitHubに意思決定・文書・コード・検証結果を残し、就活のポートフォリオにする。
- 外部サービスの月額費用を基本的に0円に抑えたい。
- 今後の技術実装はCodex中心で進めたい。
- チャットでのレビュー・仕様検討とCodexの実装作業を分けることができる。
- 明示的に頼まれない限り日付入り開発スケジュールを作成しない。

## 4. 未決定の事項
`docs/requirements/OPEN_QUESTIONS.md` に OQ-001〜OQ-014 を記録。優先度P0は：
- OQ-001 主な想定利用者
- OQ-002 対象作物・作業種別
- OQ-003 時間粒度・計画期間
- OQ-004 作業中断・分割
- OQ-005 必要人員数・機械台数
- OQ-006 期限を必須制約にするか
- OQ-007 最適化目的
- OQ-010 公開デモの認証・書込保護

採用技術（Next.js / FastAPI / PostgreSQL / OR-Toolsなど）も**未決定**。選定には根拠・代替案・無料構成の実現可能性が必要。

## 5. Codexで最初に行う作業
**コード実装ではなく、GitHub Issue #1に関する要件レビューを開始する。**
1. `AGENTS.md` と要求文書を読み、矛盾・曖昧・未検証の点を分類する。
2. OQ-001〜OQ-014のうち優先度P0を中心に、選択肢、判断基準、推奨案、想定リスクを整理する。
3. PRD/SRSの修正が必要なら、ユーザーがレビューしやすい差分（PR案）にする。
4. **ユーザーの承認前に「要件確定」「実装完了」「動作確認済み」としない。**

## 6. 要件定義が終わった後の次工程（まだ未承認）
- 要件レビューを通じた `v1.0` への更新。
- 基本設計とADR、概念ER図、API設計、最適化モデル案を作成。
- 小規模の最適化PoCで実現性確認。
- バックログ・受け入れテストの具体化、開発計画の策定。
- ユーザーの実装開始指示後、段階的な実装・テスト・公開。

## 7. 注意
- デモで使うのは権利・プライバシー問題のない模擬データを基本とする。
- 有料のクラウド、APIキー、課金が発生し得るサービスを無断で使わない。
- ローカルテストの結果と、クラウド上での実行結果は区別する。
- この引き継ぎ文書は現在のGitHub上の要件仕様の代替ではなく、入口となる案内である。
