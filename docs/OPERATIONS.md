# 起動・移行・バックアップ・復元

Linux Docker Engine + Composeで検証。Docker Desktopには組織/利用条件による有料条件がある。クラウド契約/有料API不要。直接Node起動はNode22以上を推奨。

## Compose

```sh
node scripts/configure.mjs
docker compose up --build -d --wait
docker compose exec -T app node scripts/seed.mjs
```

configureは暗号学的乱数で.envを新規作成し、既存ファイルは上書きしない。Nodeをホストへ入れない場合は.env.exampleを.envへコピーし、passwordを十分長いランダムな16進文字列に変える。.envはコミットしない。
seedは空DB専用。既存データがある時の拒否は正常。http://127.0.0.1:3000 を開く。停止は `docker compose down`。named volumeは保持される。データ削除となるdown -vは通常手順に含めない。ポート変更は.envのAGRIFLOW_PORTで指定する。

CloudでのHTTPSビルドは環境指定CAをBuildKit secret proxy_caで渡す。例: compose overrideのservices.app.build.secrets=[proxy_ca]、secrets.proxy_ca.fileにCODEX_PROXY_CERTのファイルパスを設定し `docker compose -f compose.yaml -f override.yaml build`。CAをイメージにCOPYしたりTLS検証を無効にしない。通常のネットワークなら追加設定不要。

## 既存JSONからDBへ（自動では行わない）

元JSONのバックアップを先に作る。旧アプリを停止してコピーし、コピーを読み取り専用で渡す。空DBを起動してから:

```sh
docker compose run --rm --no-deps -v "${PWD}/data:/import:ro" app node scripts/import-json.mjs /import/state.json
```

snapshot・参照・循環・候補/確定版を検証し、空DBのみtransactionでimport。失敗時は元JSONを変更せずrollbackする。非空DBへの追加入力や履歴マージは対象外。全importをやり直す時は新しい空DBを用意し、既存DBを削除しない。migration SQLは起動時にversionを確認して一度適用する。

## バックアップと復元

DBはホストに公開しない。POSIXシェルで:

```sh
mkdir -p data
docker compose exec -T db pg_dump -U agriflow -d agriflow -Fc > data/backup.dump
docker compose exec -T db createdb -U agriflow agriflow_restore
docker compose exec -T db pg_restore -U agriflow --no-owner -d agriflow_restore < data/backup.dump
docker compose exec -T db psql -U agriflow -d agriflow_restore -c 'SELECT count(*) FROM committed;'
```

backup.dumpが既にある場合は別名にし原本を保持する。Windowsはバイナリのリダイレクト挙動が異なるため、コンテナ内でdumpをファイルにしてdocker compose cpでコピーする。上記は既存DBを上書きせず、新しいDBへ復元する手順。件数だけでなく入力・候補・確定履歴の一致を確認してから、接続先切替を行う。復元先の接続文字列は秘密設定で管理する。

今回の自動復元検証:

```sh
npm run verify:recovery
```

起動中のComposeからdumpをdata/へ保存→app/dbコンテナを再作成（volume保持）→全state一致→一時的な新DBへrestore→全state一致を検証し、一時DBだけ削除する。サービスが短時間再起動するため操作中は実行しない。PUBLIC_ORIGINを変更した場合は同じ環境変数を指定。結果はdocs/testing/recovery.json。backupと.envはGit追跡外。

## テストと障害

`npm ci`、`npm run typecheck`、`npm test`。実DB試験は専用DBにCREATE DATABASE権限を持つDATABASE_URLを設定し `npm run test:integration`。テストは生成したagriflow_test_<pid>だけを作成/削除する。通常アプリにCREATE DATABASE権限が必須という意味ではない。
ブラウザ試験は `npx playwright install chromium` → `npm run test:e2e`。デフォルトはlocalhost:3138の専用サーバー。DATABASE_URLがあればDB版、なければ一時JSON版。外部対象をE2E_URLで指定する場合はE2E_ALLOW_RESET=1が必要で、**現在エンティティを削除して模擬データを作る**。専用の模擬DB以外に向けない。既存履歴は保持する。

DB接続失敗はhealth非200/起動失敗となる。`docker compose ps`、`docker compose logs --tail 50 app db`で状態を確認する。APIは安全なcode/messageのみ、内部失敗ログは固定eventのみ。JSON破損の自動修復はせず、バックアップ原本から別の保存先に復旧する。ディスク不足ではDB volumeを削除せず不要な自分のビルドキャッシュを整理する。ログ・バックアップに実データや秘密が含まれ得るため公開しない。
