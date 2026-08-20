import { runMigrations } from "../lib/db/migrate.ts";
import { dbPath } from "../lib/db/client.ts";

const { applied } = runMigrations();
if (applied.length === 0) {
  console.log(`マイグレーションなし（最新）: ${dbPath()}`);
} else {
  console.log(`適用: ${applied.join(", ")} → ${dbPath()}`);
}
