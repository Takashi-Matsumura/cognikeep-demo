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

function enqueueConvertJob(db: ReturnType<typeof getDb>, versionId: string, now: number): string {
  const jobId = ulid();
  db.prepare(
    `INSERT INTO ingest_jobs (id, kind, payload, status, progress, created_at)
     VALUES (?, 'convert', ?, 'queued', 0, ?)`,
  ).run(jobId, JSON.stringify({ versionId }), now);
  return jobId;
}

function insertVersionRow(
  db: ReturnType<typeof getDb>,
  params: {
    versionId: string;
    documentId: string;
    versionNo: number;
    sha256: string;
    filename: string;
    mimeType: string;
    bytes: number;
    now: number;
  },
): void {
  db.prepare(
    `INSERT INTO document_versions
       (id, document_id, version_no, original_sha256, original_filename, original_mime, original_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.versionId,
    params.documentId,
    params.versionNo,
    params.sha256,
    params.filename,
    params.mimeType,
    params.bytes,
    params.now,
  );
}

/**
 * 手動アップロードされたファイルを新規文書として取り込む。
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

  insertVersionRow(db, { versionId, documentId, versionNo: 1, sha256, filename, mimeType, bytes: buffer.byteLength, now });

  db.prepare(`UPDATE documents SET current_version_id = ? WHERE id = ?`).run(versionId, documentId);

  const jobId = enqueueConvertJob(db, versionId, now);

  return { documentId, versionId, jobId, isDuplicate: false };
}

/**
 * 既存文書に新しい版を追加する（実装計画 §8 M2「版管理と版差分」）。
 *
 * ファイル名やパスではなく documentId（ULID）で紐づけるので、原本の
 * ファイル名が変わっても正しく同一文書の版として積まれる。
 */
export async function ingestNewVersion(
  documentId: string,
  filename: string,
  buffer: Buffer,
): Promise<IngestResult> {
  if (!isUploadableExtension(filename)) {
    throw new Error(
      `対応していない形式です: ${filename}（docx / xlsx / pdf のみアップロードできます）`,
    );
  }
  const mimeType = safeContentTypeForFilename(filename);

  const db = getDb();
  const document = db.prepare(`SELECT id FROM documents WHERE id = ?`).get(documentId) as
    | { id: string }
    | undefined;
  if (!document) {
    throw new Error(`文書が見つかりません: ${documentId}`);
  }

  const blobStore = getBlobStore();
  const { sha256 } = await blobStore.put(buffer);

  // 同一文書内で同一バイト列の版が既にあれば、新版を積まない
  const existingSameDoc = db
    .prepare(
      `SELECT id FROM document_versions WHERE document_id = ? AND original_sha256 = ? LIMIT 1`,
    )
    .get(documentId, sha256) as { id: string } | undefined;
  if (existingSameDoc) {
    return { documentId, versionId: existingSameDoc.id, jobId: null, isDuplicate: true };
  }

  const maxVersionRow = db
    .prepare(`SELECT MAX(version_no) as maxNo FROM document_versions WHERE document_id = ?`)
    .get(documentId) as { maxNo: number | null };
  const versionNo = (maxVersionRow.maxNo ?? 0) + 1;

  const now = Date.now();
  const versionId = ulid();

  insertVersionRow(db, { versionId, documentId, versionNo, sha256, filename, mimeType, bytes: buffer.byteLength, now });

  db.prepare(`UPDATE documents SET current_version_id = ?, updated_at = ?, status = 'active' WHERE id = ?`).run(
    versionId,
    now,
    documentId,
  );

  const jobId = enqueueConvertJob(db, versionId, now);

  return { documentId, versionId, jobId, isDuplicate: false };
}
