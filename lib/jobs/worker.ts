import { getDb } from "../db/client.ts";
import { processConvertJob } from "./handlers/convert.ts";
import { processCategorizeProposeJob, processCategorizeClassifyAllJob } from "./handlers/categorize.ts";
import { processContradictionScanJob } from "./handlers/contradiction.ts";

interface JobRow {
  id: string;
  kind: string;
  payload: string;
  attempts: number;
}

const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3;

declare global {
  var __cognikeepWorkerRunning: boolean | undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processNextJob(): Promise<boolean> {
  const db = getDb();
  const job = db
    .prepare(
      `SELECT id, kind, payload, attempts FROM ingest_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1`,
    )
    .get() as JobRow | undefined;
  if (!job) return false;

  db.prepare(`UPDATE ingest_jobs SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ?`).run(
    Date.now(),
    job.id,
  );

  try {
    const payload = JSON.parse(job.payload) as { versionId?: string };
    switch (job.kind) {
      case "convert": {
        if (!payload.versionId) throw new Error("payload.versionId が欠落しています");
        await processConvertJob(payload.versionId);
        break;
      }
      case "categorize_propose": {
        await processCategorizeProposeJob();
        break;
      }
      case "categorize_classify_all": {
        await processCategorizeClassifyAllJob(job.id);
        break;
      }
      case "contradiction_scan": {
        await processContradictionScanJob(job.id);
        break;
      }
      default:
        throw new Error(`未知のジョブ種別: ${job.kind}`);
    }
    // message はハンドラが最終サマリを残していることがあるので上書きしない
    db.prepare(`UPDATE ingest_jobs SET status = 'succeeded', progress = 1, finished_at = ? WHERE id = ?`).run(
      Date.now(),
      job.id,
    );
    console.log(`[worker] job ${job.id} (${job.kind}) succeeded`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;
    const status = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
    db.prepare(`UPDATE ingest_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?`).run(
      status,
      message,
      status === "failed" ? Date.now() : null,
      job.id,
    );
    console.error(`[worker] job ${job.id} (${job.kind}) 失敗 (${attempts}/${MAX_ATTEMPTS}): ${message}`);
  }
  return true;
}

/**
 * ingest_jobs を1秒間隔でポーリングして直列処理するインプロセスワーカー。
 * Redis / BullMQ 等のジョブ基盤は導入しない（実装計画 §9 やらないこと）—
 * 千件規模の PoC にはこの単純さで十分。
 *
 * instrumentation.ts の register() から `void startWorker()` として起動され、
 * `npm run dev` だけでバックグラウンド処理が動く。
 */
export async function startWorker(): Promise<void> {
  if (globalThis.__cognikeepWorkerRunning) return;
  globalThis.__cognikeepWorkerRunning = true;
  console.log("[worker] started");

  for (;;) {
    const processed = await processNextJob();
    if (!processed) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
}
