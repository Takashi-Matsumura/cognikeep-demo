import { getDb } from "../../db/client.ts";
import { getEmbeddingProvider, encodeEmbedding } from "../../llm/embeddings.ts";

const BATCH_SIZE = 16;

interface ChunkRow {
  id: number;
  text: string;
}

/** 既に変換済みだが embedding が未設定のチャンクをまとめて埋め込む（バックフィル）。 */
export async function processReembedAllJob(jobId: string): Promise<void> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ch.id as id, ch.text as text FROM chunks ch
       JOIN documents d ON d.id = ch.document_id
       WHERE ch.embedding IS NULL AND d.status != 'archived'`,
    )
    .all() as unknown as ChunkRow[];

  const total = rows.length;
  if (total === 0) {
    db.prepare(`UPDATE ingest_jobs SET message = ? WHERE id = ?`).run("対象なし", jobId);
    return;
  }

  const provider = getEmbeddingProvider();
  const updateEmbedding = db.prepare(`UPDATE chunks SET embedding = ? WHERE id = ?`);
  let done = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const vectors = await provider.embed(batch.map((r) => r.text));
    batch.forEach((r, j) => updateEmbedding.run(encodeEmbedding(vectors[j]), r.id));
    done += batch.length;
    db.prepare(`UPDATE ingest_jobs SET progress = ?, message = ? WHERE id = ?`).run(
      done / total,
      `${done}/${total} 件を埋め込み中`,
      jobId,
    );
  }
}
