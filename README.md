# try-gas-api
GASでAPIを生やしてみる試み

## 概要

clasp + TypeScript で Google Apps Script の Web API を作る最小テンプレートです。

Web App は Google アカウントでアクセスしたユーザーとして実行されます。DB として使う Google Spreadsheet を開けるユーザーだけが API を利用できます。

## 前提

- ツール管理は mise に任せます。
- Apps Script の実行ユーザー設定は `USER_ACCESSING` を使います。
- Web App のアクセス設定は `ANYONE` です。実際には「Google アカウントを持つ全員」向けの公開になり、API 内部で Spreadsheet へのアクセス権を検証します。
- API 利用者には、DB として使う Spreadsheet を共有してください。

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

Apps Script プロジェクトを作成済みの場合は、`.clasp.example.json` を `.clasp.json` にコピーして `scriptId` を設定してください。

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "dist"
}
```

新規作成する場合は、Apps Script 側でプロジェクトを作成して script ID を取得し、同じく `.clasp.json` を作成してください。

## DB Spreadsheet

[src/main.ts](src/main.ts) の `SPREADSHEET_ID` を編集します。

```ts
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
```

この Spreadsheet の共有権限が、そのまま API の認可リストになります。

- Spreadsheet を開けるユーザー: API 利用可能
- Spreadsheet を開けないユーザー: `forbidden`

API が Spreadsheet に書き込む場合、利用者には編集権限が必要です。直接 Spreadsheet を触れることも仕様として扱います。

## 開発

型チェックとビルドを実行します。

```sh
mise run build
```

GAS に反映します。

```sh
mise run push
```

デプロイします。

```sh
mise run deploy
```

Apps Script エディタを開きます。

```sh
mise run open
```

## API

`GET` と `POST` に対応しています。

Spreadsheet を開けないユーザーの場合:

```json
{
  "ok": false,
  "error": "forbidden"
}
```

Spreadsheet を開けるユーザーの場合:

```json
{
  "ok": true,
  "user": "alice@example.com",
  "spreadsheet": {
    "id": "YOUR_SPREADSHEET_ID",
    "name": "Ticket DB"
  },
  "data": {
    "method": "POST",
    "body": {}
  }
}
```

Apps Script の `ContentService` では任意の HTTP ステータスコードを返せないため、拒否時も JSON 本文で `forbidden` を返します。
