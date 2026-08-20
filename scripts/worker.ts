// スタンドアロンでワーカーを動かすためのスクリプト。
// 通常は instrumentation.ts が `npm run dev` 起動時に自動でワーカーを
// 立ち上げるため不要だが、Next サーバと切り離してデバッグしたい場合に使う。
import { runMigrations } from "../lib/db/migrate.ts";
import { startWorker } from "../lib/jobs/worker.ts";

runMigrations();
await startWorker();
