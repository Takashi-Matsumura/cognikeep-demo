import { getDb } from "../client.ts";

export interface JobRow {
  id: string;
  kind: string;
  status: string;
  progress: number;
  message: string | null;
  error: string | null;
  attempts: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  payload: string;
}

export function listRecentJobs(limit = 50): JobRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, kind, status, progress, message, error, attempts,
              created_at as createdAt, started_at as startedAt, finished_at as finishedAt, payload
       FROM ingest_jobs ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as JobRow[];
}

export interface JobCounts {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
}

export function getJobCounts(): JobCounts {
  const db = getDb();
  const rows = db
    .prepare(`SELECT status, COUNT(*) as count FROM ingest_jobs GROUP BY status`)
    .all() as Array<{ status: string; count: number }>;
  const counts: JobCounts = { queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const row of rows) {
    if (row.status in counts) counts[row.status as keyof JobCounts] = row.count;
  }
  return counts;
}
