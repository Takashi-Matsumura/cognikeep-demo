import { getDb } from "../client.ts";
import {
  computeFreshnessScore,
  computeReviewDueAt,
  daysBetween,
  freshnessBand,
  type FreshnessBand,
} from "../../governance/freshness.ts";

interface RawDocumentRow {
  id: string;
  title: string;
  docType: string;
  categoryId: string | null;
  ownerPersonId: string | null;
  ownerName: string | null;
  effectiveDate: number | null;
  reviewIntervalDays: number | null;
  reviewDueAtRaw: number | null;
  lastReviewedAt: number | null;
  currentVersionId: string;
  versionCreatedAt: number;
  conversionConfidence: number | null;
}

export interface DocumentFreshnessRow {
  id: string;
  title: string;
  docType: string;
  ownerPersonId: string | null;
  ownerName: string | null;
  reviewDueAt: number | null;
  lastReviewedAt: number | null;
  effectiveDate: number | null;
  conversionConfidence: number | null;
  freshnessScore: number;
  band: FreshnessBand;
  isOverdue: boolean;
  overdueDays: number;
  hasSupersededHint: boolean;
}

/**
 * 全アクティブ文書の鮮度スコアを計算する。documents.freshness_score には
 * 永続化しない（"今" を基準にした計算なので、参照のたびに計算する方が
 * 常に正確で、夜間バッチの仕組みを持ち込む必要もない。PoC の規模なら
 * コストも無視できる）。
 */
export function listDocumentsWithFreshness(now: number = Date.now()): DocumentFreshnessRow[] {
  const db = getDb();

  const docs = db
    .prepare(
      `SELECT d.id as id, d.title as title, d.doc_type as docType, d.category_id as categoryId,
              d.owner_person_id as ownerPersonId, p.display_name as ownerName,
              d.effective_date as effectiveDate, d.review_interval_days as reviewIntervalDays,
              d.review_due_at as reviewDueAtRaw, d.last_reviewed_at as lastReviewedAt,
              d.current_version_id as currentVersionId,
              v.created_at as versionCreatedAt, v.conversion_confidence as conversionConfidence
       FROM documents d
       LEFT JOIN people p ON p.id = d.owner_person_id
       JOIN document_versions v ON v.id = d.current_version_id
       WHERE d.status != 'archived'`,
    )
    .all() as unknown as RawDocumentRow[];

  // superseded_hint: このドキュメントの現行版が、別文書との open な
  // contained_in / near_dup 関係の「古い側」であれば true
  const relations = db
    .prepare(
      `SELECT va.document_id as aDoc, vb.document_id as bDoc,
              va.created_at as aCreatedAt, vb.created_at as bCreatedAt
       FROM document_relations r
       JOIN document_versions va ON va.id = r.a_version_id
       JOIN document_versions vb ON vb.id = r.b_version_id
       WHERE r.kind IN ('contained_in', 'near_dup') AND r.status = 'open'`,
    )
    .all() as Array<{ aDoc: string; bDoc: string; aCreatedAt: number; bCreatedAt: number }>;

  const supersededDocIds = new Set<string>();
  for (const rel of relations) {
    if (rel.aDoc === rel.bDoc) continue;
    if (rel.aCreatedAt < rel.bCreatedAt) supersededDocIds.add(rel.aDoc);
    else if (rel.bCreatedAt < rel.aCreatedAt) supersededDocIds.add(rel.bDoc);
  }

  return docs.map((d) => {
    const reviewDueAt =
      d.reviewDueAtRaw ??
      computeReviewDueAt({
        docType: d.docType,
        reviewIntervalDays: d.reviewIntervalDays,
        lastReviewedAt: d.lastReviewedAt,
        effectiveDate: d.effectiveDate,
        versionCreatedAt: d.versionCreatedAt,
      });

    const isOverdue = reviewDueAt != null && now > reviewDueAt;
    const overdueDays = isOverdue ? daysBetween(reviewDueAt!, now) : 0;
    const ageBaseline = d.lastReviewedAt ?? d.effectiveDate ?? d.versionCreatedAt;
    const ageDays = daysBetween(ageBaseline, now);
    const hasSupersededHint = supersededDocIds.has(d.id);
    const lowConversionConfidence = d.conversionConfidence != null && d.conversionConfidence < 0.6;

    const freshnessScore = computeFreshnessScore({
      docType: d.docType,
      ageDays,
      isOverdue,
      overdueDays,
      hasOwner: d.ownerPersonId != null,
      hasSupersededHint,
      lowConversionConfidence,
    });

    return {
      id: d.id,
      title: d.title,
      docType: d.docType,
      ownerPersonId: d.ownerPersonId,
      ownerName: d.ownerName,
      reviewDueAt,
      lastReviewedAt: d.lastReviewedAt,
      effectiveDate: d.effectiveDate,
      conversionConfidence: d.conversionConfidence,
      freshnessScore,
      band: freshnessBand(freshnessScore),
      isOverdue,
      overdueDays,
      hasSupersededHint,
    };
  });
}

export interface GovernanceSummary {
  duplicateOpenCount: number;
  overdueCount: number;
  orphanCount: number;
  openFindingsCount: number;
}

export function getGovernanceSummary(): GovernanceSummary {
  const db = getDb();
  const duplicateOpenCount = (
    db.prepare(`SELECT COUNT(*) as c FROM document_relations WHERE status = 'open'`).get() as {
      c: number;
    }
  ).c;
  const orphanCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM documents WHERE status != 'archived' AND owner_person_id IS NULL`,
      )
      .get() as { c: number }
  ).c;
  const openFindingsCount = (
    db.prepare(`SELECT COUNT(*) as c FROM findings WHERE status = 'open'`).get() as { c: number }
  ).c;
  const overdueCount = listDocumentsWithFreshness().filter((r) => r.isOverdue).length;

  return { duplicateOpenCount, overdueCount, orphanCount, openFindingsCount };
}

export interface RelationRow {
  id: string;
  kind: string;
  score: number;
  evidence: string | null;
  status: string;
  detectedAt: number;
  aVersionId: string;
  bVersionId: string;
  aDocumentId: string;
  bDocumentId: string;
  aTitle: string;
  bTitle: string;
}

export function listOpenRelations(): RelationRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.id as id, r.kind as kind, r.score as score, r.evidence as evidence,
              r.status as status, r.detected_at as detectedAt,
              r.a_version_id as aVersionId, r.b_version_id as bVersionId,
              va.document_id as aDocumentId, vb.document_id as bDocumentId,
              da.title as aTitle, dbb.title as bTitle
       FROM document_relations r
       JOIN document_versions va ON va.id = r.a_version_id
       JOIN document_versions vb ON vb.id = r.b_version_id
       JOIN documents da ON da.id = va.document_id
       JOIN documents dbb ON dbb.id = vb.document_id
       WHERE r.status = 'open'
       ORDER BY r.detected_at DESC`,
    )
    .all() as unknown as RelationRow[];
}

export function updateRelationStatus(id: string, status: "dismissed" | "merged" | "open"): void {
  getDb().prepare(`UPDATE document_relations SET status = ? WHERE id = ?`).run(status, id);
}

export interface FindingRow {
  id: string;
  kind: string;
  severity: string;
  title: string;
  summary: string | null;
  documentIds: string; // JSON配列
  detail: string | null; // JSON
  citations: string | null; // JSON
  confidence: number | null;
  status: string;
  detectedAt: number;
}

export function listOpenFindings(): FindingRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, kind, severity, title, summary, document_ids as documentIds,
              detail, citations, confidence, status, detected_at as detectedAt
       FROM findings WHERE status = 'open' ORDER BY
         CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, detected_at DESC`,
    )
    .all() as unknown as FindingRow[];
}

export function getFindingDocumentTitles(documentIds: string[]): Map<string, string> {
  if (documentIds.length === 0) return new Map();
  const db = getDb();
  const placeholders = documentIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id, title FROM documents WHERE id IN (${placeholders})`)
    .all(...documentIds) as Array<{ id: string; title: string }>;
  return new Map(rows.map((r) => [r.id, r.title]));
}
