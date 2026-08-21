import { getDb } from "../../db/client.ts";
import { runContradictionScan } from "../../governance/contradiction.ts";

export async function processContradictionScanJob(jobId: string): Promise<void> {
  const db = getDb();
  const result = await runContradictionScan(60, (done, total) => {
    db.prepare(`UPDATE ingest_jobs SET progress = ?, message = ? WHERE id = ?`).run(
      total > 0 ? done / total : 1,
      `${done}/${total} ペアを判定中`,
      jobId,
    );
  });
  db.prepare(`UPDATE ingest_jobs SET message = ? WHERE id = ?`).run(
    `候補${result.candidatesTotal}件中${result.judged}件を判定、矛盾${result.found}件を検出`,
    jobId,
  );
}
