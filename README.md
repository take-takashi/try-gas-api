# try-gas-api
GASでAPIを生やしてみる試み

## 概要

clasp + TypeScript で Google Apps Script の Web API を作る最小テンプレートです。

Web App は Google アカウントでアクセスしたユーザーのメールアドレスを取得し、許可リストに含まれるユーザーだけにレスポンスを返します。

## 前提

- ツール管理は mise に任せます。
- Apps Script の実行ユーザー設定は `USER_ACCESSING` を使います。
- Web App のアクセス設定は `ANYONE` です。実際には「Google アカウントを持つ全員」向けの公開になり、API 内部でメールアドレスを検証します。

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

## 許可メールアドレス

[src/main.ts](src/main.ts) の `ALLOWED_EMAILS` を編集します。

```ts
const ALLOWED_EMAILS = new Set([
  'allowed-user@example.com',
]);
```

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

未許可ユーザーの場合:

```json
{
  "ok": false,
  "error": "forbidden"
}
```

許可ユーザーの場合:

```json
{
  "ok": true,
  "user": "allowed-user@example.com",
  "data": {
    "method": "POST",
    "body": {}
  }
}
```

Apps Script の `ContentService` では任意の HTTP ステータスコードを返せないため、拒否時も JSON 本文で `forbidden` を返します。
