import { ulid } from "ulid";
import { getDb } from "../client.ts";
import { findOrCreatePersonByName } from "./people.ts";

const DAY_MS = 1000 * 60 * 60 * 24;

export function markReviewed(documentId: string, note?: string): void {
  const db = getDb();
  const now = Date.now();
  // review_due_at は null に戻し、次回参照時に doc_type の既定間隔から
  // last_reviewed_at を起点として再計算させる（明示延長がされていた場合はリセットされる）
  db.prepare(
    `UPDATE documents SET last_reviewed_at = ?, review_due_at = NULL, updated_at = ? WHERE id = ?`,
  ).run(now, now, documentId);
  insertReviewEvent(documentId, "reviewed", note ?? null, now);
}

export function extendReview(documentId: string, days: number): void {
  const db = getDb();
  const now = Date.now();
  const dueAt = now + days * DAY_MS;
  db.prepare(`UPDATE documents SET review_due_at = ?, updated_at = ? WHERE id = ?`).run(
    dueAt,
    now,
    documentId,
  );
  insertReviewEvent(documentId, "extended", `${days}日延長`, now);
}

export function setOwnerByName(documentId: string, displayName: string): void {
  const personId = findOrCreatePersonByName(displayName);
  const db = getDb();
  const now = Date.now();
  db.prepare(`UPDATE documents SET owner_person_id = ?, updated_at = ? WHERE id = ?`).run(
    personId,
    now,
    documentId,
  );
  insertReviewEvent(documentId, "owner_assigned", displayName, now);
}

export function setDocType(documentId: string, docType: string): void {
  const db = getDb();
  db.prepare(`UPDATE documents SET doc_type = ?, updated_at = ? WHERE id = ?`).run(
    docType,
    Date.now(),
    documentId,
  );
}

export function setEffectiveDate(documentId: string, effectiveDate: number | null): void {
  const db = getDb();
  db.prepare(`UPDATE documents SET effective_date = ?, updated_at = ? WHERE id = ?`).run(
    effectiveDate,
    Date.now(),
    documentId,
  );
}

export function archiveDocument(documentId: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`UPDATE documents SET status = 'archived', updated_at = ? WHERE id = ?`).run(
    now,
    documentId,
  );
  insertReviewEvent(documentId, "archived", null, now);
}

function insertReviewEvent(documentId: string, action: string, note: string | null, at: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO review_events (id, document_id, action, note, at) VALUES (?, ?, ?, ?, ?)`,
  ).run(ulid(), documentId, action, note, at);
}
