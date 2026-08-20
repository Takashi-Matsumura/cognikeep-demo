import { ulid } from "ulid";
import { getDb } from "./db/client.ts";
import { getBlobStore } from "./storage/blob.ts";
import { titleFromFilename } from "./convert/frontmatter.ts";
import { isUploadableExtension, safeContentTypeForFilename } from "./files/mime.ts";

export interface IngestResult {
  documentId: string;
  versionId: string;
  jobId: string | null;
  isDuplicate: boolean;
}

/**
 * 手動アップロードされたファイルを取り込む。
 *
 * SharePoint 等のコネクタ（lib/connectors/types.ts の SourceConnector）が
 * 実装された際は、この関数相当のロジックを「SourceItem を受け取る」形に
 * 一般化する。M1 では実装がこれ1本しかないため、抽象化のための間接層を
 * 追加する前に、まず具体を通す。
 *
 * content-addressed な blob store のおかげで、同一バイト列の再アップロードは
 * sha256 で検知でき、無駄な変換ジョブを積まずに既存文書を指すだけで済む
 * （完全重複検知の第1段。実装計画 §6-C）。
 *
 * セキュリティ: 対応拡張子（docx/xlsx/pdf）以外は保存前に拒否する。
 * クライアントが送ってくる MIME（file.type）は偽装可能なので信頼せず、
 * サーバ側の許可リストから Content-Type を導出して DB に記録する
 * （/api/files/[sha256] の配信時も同じ許可リストのみを参照する）。
 */
export async function ingestLocalUpload(filename: string, buffer: Buffer): Promise<IngestResult> {
  if (!isUploadableExtension(filename)) {
    throw new Error(
      `対応していない形式です: ${filename}（docx / xlsx / pdf のみアップロードできます）`,
    );
  }
  const mimeType = safeContentTypeForFilename(filename);

  const blobStore = getBlobStore();
  const { sha256 } = await blobStore.put(buffer);

  const db = getDb();
  const existing = db
    .prepare(`SELECT id, document_id FROM document_versions WHERE original_sha256 = ? LIMIT 1`)
    .get(sha256) as { id: string; document_id: string } | undefined;

  if (existing) {
    return {
      documentId: existing.document_id,
      versionId: existing.id,
      jobId: null,
      isDuplicate: true,
    };
  }

  const now = Date.now();
  const documentId = ulid();
  const versionId = ulid();

  db.prepare(
    `INSERT INTO documents (id, title, doc_type, status, connector, created_at, updated_at)
     VALUES (?, ?, 'other', 'active', 'local-upload', ?, ?)`,
  ).run(documentId, titleFromFilename(filename), now, now);

  db.prepare(
    `INSERT INTO document_versions
       (id, document_id, version_no, original_sha256, original_filename, original_mime, original_bytes, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(versionId, documentId, sha256, filename, mimeType, buffer.byteLength, now);

  db.prepare(`UPDATE documents SET current_version_id = ? WHERE id = ?`).run(
    versionId,
    documentId,
  );

  const jobId = ulid();
  db.prepare(
    `INSERT INTO ingest_jobs (id, kind, payload, status, progress, created_at)
     VALUES (?, 'convert', ?, 'queued', 0, ?)`,
  ).run(jobId, JSON.stringify({ versionId }), now);

  return { documentId, versionId, jobId, isDuplicate: false };
}
