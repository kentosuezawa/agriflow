# GitHub公開手順（GitHub上のリポジトリはまだ作成していません）

対象アカウント: `kentosuezawa` / 予定リポジトリ名: `agriflow`。

## 手順A: Gitのコマンドでまとめて公開
1. https://github.com/new にアクセスし、Ownerを `kentosuezawa`、Repository nameを `agriflow`、Publicを選ぶ。
2. **README・.gitignore・licenseをGitHub側で初期作成しない**（このZIPに既にある/ライセンス未決）。`Create repository`を押す。
3. 配布ZIPを展開し、その中の `agriflow` フォルダでターミナルを開く（WindowsならPowerShellでも可）。
4. 以下を順に実行する。事前にGitをインストールし、本人のGitHubアカウントで認証・Git著者情報の設定が必要。

```powershell
git init
git add .
git commit -m "docs: initial AgriFlow requirements draft v0.1"
git branch -M main
git remote add origin https://github.com/kentosuezawa/agriflow.git
git push -u origin main
```

`Author identity unknown` となる場合、GitHubのドキュメントに従いユーザー自身の `git config user.name` / `user.email` を設定する。認証トークンやパスワードをチャットに送らない。

## 手順B: リポジトリ作成後、接続済みGitHub経由でファイルを書き込む（手操作を最小化）
1. https://github.com/new にアクセスし、Ownerを `kentosuezawa`、Repository nameを `agriflow`、Publicを選ぶ。
2. **Add README をオン**にしてリポジトリを作成する（この方法では最初のコミットをGitHub側が作る）。
3. ChatGPTにリポジトリ作成完了を伝え、接続済みGitHub経由でドキュメントを投稿するよう依頼する。既存のGitHub READMEは内容・SHAを確認して更新する。
4. この方法を使う場合、手順Aの `git push` をそのまま並行して実行しない。履歴が別になるため、先に `git clone` をしてから作業する。

## 手順C: ブラウザでファイルをアップロード
新規リポジトリの `uploading an existing file` を使用する。ZIPは展開して中身をアップロードし、階層とファイル名を確認する。画面によりディレクトリの一括追加に制限があるため手順AまたはBが確実。

## 公開後に確認すること
- README、PRD、SRS、トレーサビリティが表示される。
- `v0.1-draft / 未承認 / 実装未着手` の表記を維持する。
- Issues・Projectsの作業管理は**未作成**。レビュー後に必要なものを起票する。
- 公開リポジトリは誰でも読める。実データとシークレットを入れない。
