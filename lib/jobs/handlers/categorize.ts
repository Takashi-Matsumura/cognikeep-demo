import { getDb } from "../../db/client.ts";
import {
  proposeCategories,
  classifyDocument,
  listUncategorizedDocumentIds,
} from "../../governance/categorize.ts";

export async function processCategorizeProposeJob(): Promise<void> {
  await proposeCategories();
}

export async function processCategorizeClassifyAllJob(jobId: string): Promise<void> {
  const ids = listUncategorizedDocumentIds();
  const db = getDb();
  const total = ids.length;
  let done = 0;

  db.prepare(`UPDATE ingest_jobs SET message = ? WHERE id = ?`).run(
    `0/${total} 件を分類中`,
    jobId,
  );

  for (const id of ids) {
    await classifyDocument(id);
    done++;
    db.prepare(`UPDATE ingest_jobs SET progress = ?, message = ? WHERE id = ?`).run(
      total > 0 ? done / total : 1,
      `${done}/${total} 件を分類中`,
      jobId,
    );
  }
}
