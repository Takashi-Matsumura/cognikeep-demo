"use server";

import { ulid } from "ulid";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";

export async function reembedAllAction() {
  const db = getDb();
  db.prepare(
    `INSERT INTO ingest_jobs (id, kind, payload, status, progress, created_at) VALUES (?, 'reembed_all', '{}', 'queued', 0, ?)`,
  ).run(ulid(), Date.now());
  revalidatePath("/search");
  revalidatePath("/jobs");
}
