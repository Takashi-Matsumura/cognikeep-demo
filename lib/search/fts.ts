import { getDb } from "../db/client.ts";
import { tokenize, buildMatchQuery } from "./segment.ts";

export interface ChunkFtsInput {
  chunkId: number;
  title: string;
  headingPath: string | null;
  body: string;
}

/** チャンクを FTS5 索引に投入する。索引時は必ずこの関数を通す（tokenize() を共有するため）。 */
export function indexChunk(input: ChunkFtsInput): void {
  getDb()
    .prepare(
      `INSERT INTO chunk_fts(rowid, title_seg, heading_seg, body_seg) VALUES (?, ?, ?, ?)`,
    )
    .run(
      input.chunkId,
      tokenize(input.title),
      tokenize(input.headingPath ?? ""),
      tokenize(input.body),
    );
}

/** contentless_delete=1 なので通常の DELETE がそのまま効く（3.53.1 で動作確認済み） */
export function removeChunkFromFts(chunkId: number): void {
  getDb().prepare(`DELETE FROM chunk_fts WHERE rowid = ?`).run(chunkId);
}

export function removeChunksForVersionFromFts(versionId: string): void {
  const db = getDb();
  const ids = db
    .prepare(`SELECT id FROM chunks WHERE version_id = ?`)
    .all(versionId) as Array<{ id: number }>;
  const del = db.prepare(`DELETE FROM chunk_fts WHERE rowid = ?`);
  for (const { id } of ids) del.run(id);
}

export interface SearchFilters {
  docType?: string[];
  categoryId?: string;
  ownerPersonId?: string;
  department?: string;
  freshnessMax?: number;
  conversionEngine?: string;
  updatedAfter?: number;
}

export interface SearchHit {
  chunkId: number;
  documentId: string;
  versionId: string;
  title: string;
  headingPath: string | null;
  headingAnchor: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  text: string;
  docType: string;
  freshnessScore: number | null;
  conversionEngine: string | null;
  score: number;
}

/**
 * 日本語キーワード検索。bm25 の列重みは title > heading > body。
 * FTS5 の bm25() は小さい（より負の）値ほど関連度が高いため ORDER BY は昇順。
 */
export function searchChunks(
  queryText: string,
  filters: SearchFilters = {},
  limit = 30,
): SearchHit[] {
  const db = getDb();
  const matchExpr = buildMatchQuery(queryText);
  if (!matchExpr) return [];

  const conditions: string[] = ["chunk_fts MATCH ?", "d.status != 'archived'"];
  const params: unknown[] = [matchExpr];

  if (filters.docType?.length) {
    conditions.push(`d.doc_type IN (${filters.docType.map(() => "?").join(",")})`);
    params.push(...filters.docType);
  }
  if (filters.categoryId) {
    conditions.push("d.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.ownerPersonId) {
    conditions.push("d.owner_person_id = ?");
    params.push(filters.ownerPersonId);
  }
  if (filters.department) {
    conditions.push("d.department = ?");
    params.push(filters.department);
  }
  if (filters.freshnessMax != null) {
    conditions.push("(d.freshness_score IS NULL OR d.freshness_score <= ?)");
    params.push(filters.freshnessMax);
  }
  if (filters.conversionEngine) {
    conditions.push("v.conversion_engine = ?");
    params.push(filters.conversionEngine);
  }
  if (filters.updatedAfter != null) {
    conditions.push("d.updated_at >= ?");
    params.push(filters.updatedAfter);
  }

  const sql = `
    SELECT
      c.id as chunkId, c.document_id as documentId, c.version_id as versionId,
      c.heading_path as headingPath, c.heading_anchor as headingAnchor,
      c.page_from as pageFrom, c.page_to as pageTo, c.text as text,
      d.title as title, d.doc_type as docType, d.freshness_score as freshnessScore,
      v.conversion_engine as conversionEngine,
      bm25(chunk_fts, 5.0, 3.0, 1.0) as score
    FROM chunk_fts
    JOIN chunks c ON c.id = chunk_fts.rowid
    JOIN documents d ON d.id = c.document_id
    JOIN document_versions v ON v.id = c.version_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY score
    LIMIT ?
  `;
  params.push(limit);

  return db.prepare(sql).all(...(params as [])) as unknown as SearchHit[];
}

export interface GroupedSearchResult {
  documentId: string;
  title: string;
  docType: string;
  freshnessScore: number | null;
  conversionEngine: string | null;
  bestScore: number;
  hits: SearchHit[];
  extraHitCount: number;
}

/** 検索結果を文書単位でグルーピングし、上位数件だけ残す（検索結果一覧の表示用） */
export function groupHitsByDocument(hits: SearchHit[], maxPerDoc = 2): GroupedSearchResult[] {
  const byDoc = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const list = byDoc.get(hit.documentId) ?? [];
    list.push(hit);
    byDoc.set(hit.documentId, list);
  }

  const grouped: GroupedSearchResult[] = [];
  for (const [documentId, docHits] of byDoc) {
    docHits.sort((a, b) => a.score - b.score);
    const shown = docHits.slice(0, maxPerDoc);
    grouped.push({
      documentId,
      title: docHits[0].title,
      docType: docHits[0].docType,
      freshnessScore: docHits[0].freshnessScore,
      conversionEngine: docHits[0].conversionEngine,
      bestScore: docHits[0].score,
      hits: shown,
      extraHitCount: docHits.length - shown.length,
    });
  }

  grouped.sort((a, b) => a.bestScore - b.bestScore);
  return grouped;
}
