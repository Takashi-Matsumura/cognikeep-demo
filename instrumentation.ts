// Next.js が起動時に1度だけ呼ぶフック（v15 で stable、設定不要）。
// ここでマイグレーションを実行し、変換ジョブのワーカーを起動することで、
// 「npm run dev だけで動く」（Docker・別プロセス不要）という PoC の制約を満たす。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runMigrations } = await import("./lib/db/migrate.ts");
  const { assertSegmenterHealthy } = await import("./lib/search/segment.ts");
  const { startWorker } = await import("./lib/jobs/worker.ts");

  assertSegmenterHealthy();

  const { applied } = runMigrations();
  if (applied.length > 0) {
    console.log(`[migrate] 適用: ${applied.join(", ")}`);
  }

  // await しない: ワーカーは無限ループなので、ここで待つとサーバがリクエストを
  // 受け付けられなくなる（register() はサーバ起動完了前に完了する必要がある）。
  void startWorker();
}
