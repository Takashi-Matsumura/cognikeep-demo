"use server";

import { ulid } from "ulid";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";

function enqueueJob(kind: string, payload: object = {}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO ingest_jobs (id, kind, payload, status, progress, created_at) VALUES (?, ?, ?, 'queued', 0, ?)`,
  ).run(ulid(), kind, JSON.stringify(payload), Date.now());
}

export async function proposeCategoriesAction() {
  enqueueJob("categorize_propose");
  revalidatePath("/categories");
  revalidatePath("/jobs");
}

export async function classifyAllAction() {
  enqueueJob("categorize_classify_all");
  revalidatePath("/categories");
  revalidatePath("/jobs");
}
