# try-gas-api

GAS で API を生やしてみる試み

## 概要

clasp + TypeScript で Google Apps Script の Web API を作るプロジェクトです。

Google Spreadsheet を簡易的なデータストアとして利用し、システム開発におけるチケット管理を API から操作できるようにします。

現在の Web App は Google アカウントでアクセスしたユーザーとして実行されます。DB として使う Google Spreadsheet を開けるユーザーだけが API を利用できます。

## 前提

- ツール管理は mise に任せます。
- Apps Script の実行ユーザー設定は `USER_ACCESSING` を使います。
- Web App のアクセス設定は `ANYONE` です。実際には「Google アカウントを持つ全員」向けの公開になり、API 内部で Spreadsheet へのアクセス権を検証します。
- API 利用者には、DB として使う Spreadsheet を共有してください。
- `CLASP_SCRIPT_ID` と `SPREADSHEET_ID` は dotenvx で暗号化した `.env` で管理します。

## セットアップ

```sh
mise trust
mise install
mise run install
```

clasp にログインします。

```sh
mise run login
```

Apps Script プロジェクトを作成済みの場合は、dotenvx で暗号化した `.env` に `CLASP_SCRIPT_ID`、`SPREADSHEET_ID`、`CLASP_DEPLOYMENT_ID` を設定してください。

```env
CLASP_SCRIPT_ID=YOUR_SCRIPT_ID
SPREADSHEET_ID=YOUR_SPREADSHEET_ID
CLASP_DEPLOYMENT_ID=YOUR_DEPLOYMENT_ID
```

`.env` は暗号化して git 管理し、復号鍵を含む `.env.keys` は git 管理しません。

```sh
dotenvx set CLASP_SCRIPT_ID *****
dotenvx set SPREADSHEET_ID *****
dotenvx set CLASP_DEPLOYMENT_ID *****
```

新規作成する場合は、Apps Script 側でプロジェクトを作成して script ID を取得し、同じく `.env` に設定してください。初回デプロイで `CLASP_DEPLOYMENT_ID` がまだない場合は `mise run deploy-new` を実行し、発行された deployment ID を `.env` に追加してください。

`.clasp.json` は `.env` から生成されるローカルファイルです。

```sh
mise run generate-clasp-config
```

## DB Spreadsheet

`.env` の `SPREADSHEET_ID` に DB として使う Spreadsheet ID を設定します。

この Spreadsheet の共有権限が、そのまま API の認可リストになります。

- Spreadsheet を開けるユーザー: API 利用可能
- Spreadsheet を開けないユーザー: `forbidden`

API が Spreadsheet に書き込む場合、利用者には編集権限が必要です。直接 Spreadsheet を触れることも仕様として扱います。

## 認可方式の選択肢

現在は `src/appsscript.json` で `executeAs: USER_ACCESSING` を使い、Spreadsheet の共有権限を API の認可境界にしています。

この方式では、ブラウザで Google ログイン済みのユーザーは扱いやすい一方で、Codex や `curl` などの CLI からは Google ログイン画面にリダイレクトされることがあります。Codex から API 経由でチケット操作を行うには、今後の認可方式を選ぶ必要があります。

### 選択肢 1: Spreadsheet 共有権限を維持する

- `executeAs: USER_ACCESSING` を維持します。
- Spreadsheet を開けるユーザーだけが API を操作できます。
- Google の権限管理と整合しやすいです。
- Codex や素の `curl` からは扱いづらいです。

### 選択肢 2: プロジェクト専用 API token を導入する

- Web App をデプロイ実行者の権限で実行し、API token を知っている主体だけを許可します。
- Codex や外部ツールから `curl` で扱いやすくなります。
- Spreadsheet の共有者だけが操作できる、という制約は使わなくなります。
- token を持つ主体は Spreadsheet 操作権限相当を持つため、token の保管、ローテーション、漏えい時の再発行が必要です。

### 選択肢 3: Google OAuth を自前で検証する

- Codex 側で Google OAuth token を取得し、GAS 側で token を検証して許可ユーザーと照合します。
- Spreadsheet 共有権限に近い考え方を維持しやすいです。
- 実装と運用がかなり重くなります。
- GAS Web App は HTTP ステータスやヘッダー制御に制約があるため、一般的な Web API より扱いづらいです。

当面の課題として、Codex からのチケット操作を優先する場合は「プロジェクト専用 API token」を導入するか、Google OAuth 検証を行うかを検討します。

## 開発

型チェックとビルドを実行します。

```sh
mise run build
```

GAS に反映します。

```sh
mise run push
```

`push` はローカルの `dist` を正として `clasp push --force` を実行します。GAS エディタ上でソースを直接編集する運用は想定していません。

デプロイします。

```sh
mise run deploy
```

`deploy` は `.env` の `CLASP_DEPLOYMENT_ID` を使って既存デプロイを更新します。Web App URL は変わりません。

初回だけ新しいデプロイを作成する場合は次を使います。

```sh
mise run deploy-new
```

Apps Script エディタを開きます。

```sh
mise run open
```

## API

現在の MVP では、チケットの作成、検索、詳細取得、更新、コメント追記、ステータス変更に対応しています。

```txt
GET  /tickets
GET  /tickets/{ticketId}
POST /tickets
POST /tickets/{ticketId}
POST /tickets/{ticketId}/comments
POST /tickets/{ticketId}/status
```

Apps Script の `ContentService` では任意の HTTP ステータスコードを返せないため、成功・失敗は JSON 本文の `ok` と `error` で表現します。

Spreadsheet を開けないユーザーの場合:

```json
{
  "ok": false,
  "error": {
    "code": "forbidden",
    "message": "Spreadsheet を開けません"
  }
}
```

チケット一覧の例:

```json
{
  "ok": true,
  "data": {
    "tickets": []
  }
}
```
