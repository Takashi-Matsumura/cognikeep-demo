import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./client.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export interface MigrationResult {
  applied: string[];
}

/**
 * lib/db/migrations/*.sql を番号順に適用する自前ランナー。
 * 千件規模の PoC には ORM のマイグレーション機構は過剰なので、
 * schema_migrations テーブルで適用済みを記録するだけの単純な仕組みにする。
 *
 * ロールバック（down マイグレーション）は実装しない。PoC の割り切り —
 * 壊れたら storage/cognikeep.db を消して再取り込みする。
 */
export function runMigrations(): MigrationResult {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const alreadyApplied = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    if (alreadyApplied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        Date.now(),
      );
      db.exec("COMMIT");
      applied.push(file);
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(
        `マイグレーション ${file} の適用に失敗しました: ${(err as Error).message}`,
      );
    }
  }
  return { applied };
}
