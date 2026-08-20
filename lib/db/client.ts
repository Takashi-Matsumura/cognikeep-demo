import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

declare global {
  var __cognikeepDb: DatabaseSync | undefined;
  var __cognikeepDbPath: string | undefined;
}

// 遅延評価: モジュール読み込み時ではなく初回接続時に環境変数を読む。
// これによりテストが import 前に COGNIKEEP_DB_PATH を差し替えられる
// （ESM の import は本文より先に評価されるため、モジュール直下で
// 環境変数を読むとテストからの上書きが間に合わない）。
function resolveDbPath(): string {
  const dbDir = path.join(process.cwd(), "storage");
  return process.env.COGNIKEEP_DB_PATH ?? path.join(dbDir, "cognikeep.db");
}

function createConnection(): DatabaseSync {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  globalThis.__cognikeepDbPath = dbPath;
  // WAL: ワーカーが書き込み中でも UI 側の読み取りをブロックしない。
  // busy_timeout: 書き込み衝突時にエラーにする前に少し待つ。
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
  `);
  return db;
}

/**
 * `node:sqlite` の DatabaseSync シングルトンを返す。
 *
 * Next.js dev（Turbopack）は HMR でモジュールを再評価するため、素朴に
 * モジュールトップレベルで `new DatabaseSync()` すると再評価のたびに
 * 別ファイルハンドルが多重生成される。globalThis にピン留めして防ぐ。
 */
export function getDb(): DatabaseSync {
  if (!globalThis.__cognikeepDb) {
    globalThis.__cognikeepDb = createConnection();
  }
  return globalThis.__cognikeepDb;
}

export function dbPath(): string {
  // getDb() を1度も呼んでいなければ接続を確立してから返す
  getDb();
  return globalThis.__cognikeepDbPath!;
}
