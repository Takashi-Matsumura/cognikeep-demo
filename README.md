# CogniKeep

社内文書の「見える化」と「統治」を行う社内ナレッジ基盤。Next.js（App Router）上に構築され、アップロードされた文書を変換・索引化し、全文検索とローカル埋め込みによる意味検索、そしてカテゴリ体系・鮮度・重複・矛盾の管理機能を提供する。

外部 API に依存せず、LLM 推論・埋め込み生成はすべてローカルの llama.cpp サーバで完結する。

## 主な機能

- **アップロード・変換**: docx / xlsx / pdf を Markdown に変換して取り込む（旧形式や pptx は現状非対応）
- **全文検索**: 日本語対応の FTS による検索
- **意味検索**: ローカル埋め込みモデル（bge-m3）によるベクトル検索とハイブリッド検索
- **文書閲覧**: 変換後 Markdown と原本ファイルの両方を表示
- **カテゴリ**: AI によるカテゴリ体系の再設計・分類
- **統治（governance）**:
  - 鮮度スコアによる文書の陳腐化検知
  - SimHash によるほぼ重複文書の検知
  - AI による文書間の矛盾検知
- **ジョブ**: 変換・埋め込み・分類・矛盾検知などの非同期処理をワーカーで実行
- **コネクタ**: Microsoft Graph 連携（`lib/connectors/ms-graph.ts`）

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. ローカル LLM サーバの起動

CogniKeep は外部 API を使わず、常駐させた llama.cpp サーバ（OpenAI 互換モード、`--jinja` 等）に接続する。用途ごとに別サーバを想定している。

| 用途 | 既定 URL | 既定モデル |
| --- | --- | --- |
| テキスト推論（カテゴリ再設計・矛盾検知） | `http://localhost:8080` | `gemma-4-12b-it-Q4_K_M.gguf` |
| 画像理解（スキャン PDF の変換フォールバック） | `http://localhost:8084` | `Qwen3VL-8B-Instruct-Q4_K_M.gguf` |
| 埋め込み（意味検索） | `http://localhost:8082` | `bbvch-ai/bge-m3-GGUF`（1024次元） |

必要に応じて `.env.example` を `.env` にコピーし、接続先を変更する。

```bash
cp .env.example .env
```

### 3. データベースのマイグレーション

SQLite（`node:sqlite`、WAL モード）を使用する。DB ファイルは既定で `storage/cognikeep.db`。

```bash
npm run migrate
```

### 4. 開発サーバの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。

### 5. ジョブワーカーの起動

変換・埋め込み生成・分類・矛盾検知などはバックグラウンドジョブとして処理される。別ターミナルでワーカーを起動する。

```bash
npm run worker
```

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ起動 |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバ起動 |
| `npm run lint` | ESLint |
| `npm run test` | `lib/**` の単体テスト（`node --test`） |
| `npm run worker` | ジョブワーカー起動（ファイル監視付き） |
| `npm run migrate` | DB マイグレーション実行 |

## ディレクトリ構成

```
app/(app)/       ダッシュボード・検索・文書一覧・カテゴリ・統治・アップロード・ジョブの各画面
app/actions/     Server Actions（検索・カテゴリ・統治・レビュー）
app/api/         アップロード・原本ファイル配信 API
lib/convert/     docx / xlsx / pdf → Markdown 変換
lib/search/      全文検索・ベクトル検索・ハイブリッド検索
lib/governance/  鮮度スコア・重複検知（SimHash）・矛盾検知・カテゴリ分類
lib/llm/         llama.cpp クライアント（テキスト・埋め込み）
lib/jobs/        非同期ジョブワーカーとハンドラ
lib/db/          SQLite クライアント・マイグレーション
lib/connectors/  外部連携（Microsoft Graph）
lib/storage/     ファイル（Blob）ストレージ
scripts/         マイグレーション・ワーカー起動スクリプト
```

## 技術スタック

Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS v4 / shadcn / `node:sqlite` / llama.cpp（ローカル LLM・埋め込み）
