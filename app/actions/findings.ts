"use server";

import { ulid } from "ulid";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";

function revalidateFindingsViews() {
  revalidatePath("/governance");
  revalidatePath("/governance/contradictions");
  revalidatePath("/jobs");
}

export async function runContradictionScanAction() {
  const db = getDb();
  db.prepare(
    `INSERT INTO ingest_jobs (id, kind, payload, status, progress, created_at) VALUES (?, 'contradiction_scan', '{}', 'queued', 0, ?)`,
  ).run(ulid(), Date.now());
  revalidateFindingsViews();
}

export async function resolveFindingAction(findingId: string) {
  const db = getDb();
  db.prepare(`UPDATE findings SET status = 'resolved', resolved_at = ? WHERE id = ?`).run(
    Date.now(),
    findingId,
  );
  revalidateFindingsViews();
}

export async function dismissFindingAction(findingId: string) {
  const db = getDb();
  db.prepare(`UPDATE findings SET status = 'false_positive', resolved_at = ? WHERE id = ?`).run(
    Date.now(),
    findingId,
  );
  revalidateFindingsViews();
}
