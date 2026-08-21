import { getDb } from "../db/client.ts";
import { getEmbeddingProvider, decodeEmbedding, cosineSimilarity } from "../llm/embeddings.ts";

export interface SemanticHit {
  chunkId: number;
  score: number;
}

interface EmbeddingRow {
  id: number;
  embedding: Uint8Array;
}

/**
 * クエリを埋め込み、全チャンクの埋め込みとのコサイン類似度で上位を返す。
 * `sqlite-vec` は導入しない — 数百〜数千件規模なら JS の総当たりで数十ms
 * で終わり、依存を増やす価値がない（実装計画 §1-C の判断を踏襲）。
 */
export async function semanticSearch(query: string, limit = 30): Promise<SemanticHit[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id as id, c.embedding as embedding
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.embedding IS NOT NULL AND d.status != 'archived'`,
    )
    .all() as unknown as EmbeddingRow[];

  if (rows.length === 0) return [];

  const provider = getEmbeddingProvider();
  const [queryVec] = await provider.embed([query]);

  const scored = rows.map((r) => ({
    chunkId: r.id,
    score: cosineSimilarity(queryVec, decodeEmbedding(r.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function countChunksWithoutEmbedding(): number {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM chunks ch
         JOIN documents d ON d.id = ch.document_id
         WHERE ch.embedding IS NULL AND d.status != 'archived'`,
      )
      .get() as { c: number }
  ).c;
}
