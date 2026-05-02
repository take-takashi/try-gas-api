# AGENTS.md

このリポジトリで作業するエージェント向けのルールです。回答は日本語で行ってください。

## 作業場所

- コード変更、検証、コミット作成などの実作業は、必ず git worktree 上で行ってください。
- 追加の worktree は、必ずリポジトリ直下の `.worktree/` 以下に作成してください。
- worktree 名は作業内容が分かる短い名前にしてください。例: `.worktree/fix-auth`、`.worktree/add-endpoint`
- リポジトリ本体のルートでは、原則として調査、設定確認、worktree 作成だけを行ってください。
- `.worktree/` はローカル作業用ディレクトリであり、コミット対象にしません。

例:

```sh
git worktree add .worktree/<branch-name> -b <branch-name>
```

既存ブランチを使う場合:

```sh
git worktree add .worktree/<branch-name> <branch-name>
```

## プロジェクト概要

- このプロジェクトは clasp + TypeScript で Google Apps Script の Web API を開発します。
- GAS エディタ上でソースを直接編集する運用は想定していません。
- TypeScript のソースは `src/`、GAS に push する生成物は `dist/` に置きます。
- `dist/` はビルド成果物として扱い、通常は `src/` とビルド設定を正としてください。
- `src/appsscript.json` はビルド時に `dist/appsscript.json` へコピーされます。

## セットアップとコマンド

ツール管理は mise を使います。

```sh
mise trust
mise install
mise run install
```

主なコマンド:

```sh
mise run check
mise run build
mise run push
mise run deploy
mise run deploy-new
mise run open
```

- 変更後は、少なくとも `mise run check` を実行してください。
- GAS に反映する必要がある場合は `mise run push` を使ってください。
- 既存 Web App デプロイを更新する場合は `mise run deploy` を使ってください。
- 初回または新規デプロイが必要な場合のみ `mise run deploy-new` を使ってください。

## 環境変数と秘匿情報

- `CLASP_SCRIPT_ID`、`SPREADSHEET_ID`、`CLASP_DEPLOYMENT_ID` は dotenvx で暗号化した `.env` で管理します。
- `.env.keys` は復号鍵を含むためコミットしないでください。
- `.clasp.json` は `.env` から生成されるローカルファイルです。直接コミットしないでください。
- Spreadsheet ID、Deployment ID、Script ID、アクセストークンなどの実値を回答やログに不用意に出さないでください。

`.clasp.json` を生成する場合:

```sh
mise run generate-clasp-config
```

## Google Apps Script 開発ルール

- GAS のランタイムは V8 を前提にしてください。
- Web App の入口関数である `doGet`、`doPost` は GAS から呼ばれるグローバル関数として維持してください。
- Apps Script の `ContentService` では任意の HTTP ステータスコードを返せないため、エラーは JSON 本文で表現してください。
- Spreadsheet へのアクセス権が API の認可境界になります。認可や権限まわりを変更する場合は README の仕様と整合させてください。
- Apps Script 固有 API は `@types/google-apps-script` の型に合わせて実装してください。
- ブラウザ、Node.js、GAS の実行環境差に注意し、GAS 側で使えない API をアプリ本体に持ち込まないでください。

## ビルド方針

- `src/main.ts` を `scripts/build.mjs` で bundle し、`dist/Code.js` を生成します。
- `SPREADSHEET_ID` はビルド時に `__SPREADSHEET_ID__` として埋め込まれます。
- 環境変数が必要なコマンドは、既存の mise タスクを優先して使ってください。
- ビルド設定を変更した場合は、`mise run build` で `dist/` の出力を確認してください。

## 変更時の確認

- TypeScript の変更後: `mise run check`
- ビルドや GAS 反映に関わる変更後: `mise run build`
- clasp 設定やデプロイに関わる変更後: `mise run generate-clasp-config`、必要に応じて `mise run push` または `mise run deploy`

検証できなかった項目がある場合は、最終報告で明示してください。
