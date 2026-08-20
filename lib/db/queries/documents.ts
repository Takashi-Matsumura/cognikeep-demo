import { getDb } from "../client.ts";

export interface DocumentListRow {
  id: string;
  title: string;
  docType: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  conversionEngine: string | null;
  conversionConfidence: number | null;
  originalFilename: string | null;
  originalMime: string | null;
  chunkCount: number;
}

export function listDocuments(): DocumentListRow[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        d.id as id, d.title as title, d.doc_type as docType, d.status as status,
        d.created_at as createdAt, d.updated_at as updatedAt,
        v.conversion_engine as conversionEngine, v.conversion_confidence as conversionConfidence,
        v.original_filename as originalFilename, v.original_mime as originalMime,
        (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) as chunkCount
      FROM documents d
      LEFT JOIN document_versions v ON v.id = d.current_version_id
      WHERE d.status != 'archived'
      ORDER BY d.created_at DESC
    `,
    )
    .all() as unknown as DocumentListRow[];
}

export interface DocumentDetailRow {
  id: string;
  title: string;
  docType: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  currentVersionId: string | null;
}

export interface VersionDetailRow {
  id: string;
  versionNo: number;
  markdown: string | null;
  frontmatter: string | null;
  pageCount: number | null;
  sheetNames: string | null;
  originalSha256: string;
  originalFilename: string;
  originalMime: string;
  originalBytes: number;
  conversionEngine: string | null;
  conversionConfidence: number | null;
  conversionMetrics: string | null;
  convertedAt: number | null;
}

export function getDocumentWithCurrentVersion(
  id: string,
): { document: DocumentDetailRow; version: VersionDetailRow | null } | null {
  const db = getDb();
  const document = db
    .prepare(
      `SELECT id, title, doc_type as docType, status, created_at as createdAt,
              updated_at as updatedAt, current_version_id as currentVersionId
       FROM documents WHERE id = ?`,
    )
    .get(id) as DocumentDetailRow | undefined;
  if (!document) return null;

  const version = document.currentVersionId
    ? ((db
        .prepare(
          `SELECT id, version_no as versionNo, markdown, frontmatter, page_count as pageCount,
                  sheet_names as sheetNames, original_sha256 as originalSha256,
                  original_filename as originalFilename, original_mime as originalMime,
                  original_bytes as originalBytes, conversion_engine as conversionEngine,
                  conversion_confidence as conversionConfidence, conversion_metrics as conversionMetrics,
                  converted_at as convertedAt
           FROM document_versions WHERE id = ?`,
        )
        .get(document.currentVersionId) as VersionDetailRow | undefined) ?? null)
    : null;

  return { document, version };
}

export interface ChunkRow {
  id: number;
  ordinal: number;
  headingPath: string | null;
  headingAnchor: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  text: string;
}

export function listChunksForVersion(versionId: string): ChunkRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, ordinal, heading_path as headingPath, heading_anchor as headingAnchor,
              page_from as pageFrom, page_to as pageTo, text
       FROM chunks WHERE version_id = ? ORDER BY ordinal`,
    )
    .all(versionId) as unknown as ChunkRow[];
}

export interface DocumentStats {
  totalDocuments: number;
  byDocType: Array<{ docType: string; count: number }>;
  byEngine: Array<{ engine: string | null; count: number }>;
  lowConfidenceCount: number;
}

export function getDocumentStats(): DocumentStats {
  const db = getDb();
  const totalDocuments = (
    db.prepare(`SELECT COUNT(*) as c FROM documents WHERE status != 'archived'`).get() as {
      c: number;
    }
  ).c;

  const byDocType = db
    .prepare(
      `SELECT doc_type as docType, COUNT(*) as count FROM documents
       WHERE status != 'archived' GROUP BY doc_type ORDER BY count DESC`,
    )
    .all() as Array<{ docType: string; count: number }>;

  const byEngine = db
    .prepare(
      `SELECT v.conversion_engine as engine, COUNT(*) as count
       FROM documents d LEFT JOIN document_versions v ON v.id = d.current_version_id
       WHERE d.status != 'archived' GROUP BY v.conversion_engine`,
    )
    .all() as Array<{ engine: string | null; count: number }>;

  const lowConfidenceCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM documents d
         JOIN document_versions v ON v.id = d.current_version_id
         WHERE d.status != 'archived' AND v.conversion_confidence < 0.6`,
      )
      .get() as { c: number }
  ).c;

  return { totalDocuments, byDocType, byEngine, lowConfidenceCount };
}
