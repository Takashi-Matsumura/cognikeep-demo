import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "../../db/client.ts";
import { getBlobStore } from "../../storage/blob.ts";
import { convertLocally } from "../../convert/index.ts";
import { assessQuality } from "../../convert/quality.ts";
import { chunkMarkdown } from "../../convert/markdown.ts";
import { buildMarkdownFile, type DocFrontmatter } from "../../convert/frontmatter.ts";
import { tokenize } from "../../search/segment.ts";
import { indexChunk, removeChunksForVersionFromFts } from "../../search/fts.ts";
import { simhash48 } from "../../governance/simhash.ts";
import { runDedupeScanForVersion } from "../../governance/dedupe.ts";

interface VersionRow {
  id: string;
  document_id: string;
  version_no: number;
  original_sha256: string;
  original_filename: string;
  original_mime: string;
}

interface DocumentRow {
  id: string;
  title: string;
  doc_type: string;
  connector: string;
  external_id: string | null;
}

/**
 * convert ジョブの実処理: 原本 → ローカル変換 → 品質判定 → Markdown 保存 →
 * チャンク分割 → FTS 索引投入。M1 の時点では Claude フォールバックを呼ばない
 * （品質を測って conversion_confidence に記録するだけ）。
 */
export async function processConvertJob(versionId: string): Promise<void> {
  const db = getDb();

  const version = db
    .prepare(`SELECT * FROM document_versions WHERE id = ?`)
    .get(versionId) as VersionRow | undefined;
  if (!version) throw new Error(`document_version not found: ${versionId}`);

  const document = db
    .prepare(`SELECT * FROM documents WHERE id = ?`)
    .get(version.document_id) as DocumentRow | undefined;
  if (!document) throw new Error(`document not found: ${version.document_id}`);

  const buffer = await getBlobStore().get(version.original_sha256);
  const { result, engine } = await convertLocally(version.original_filename, buffer);
  const quality = assessQuality(result.pageTexts);

  const now = Date.now();
  const markdownBody = result.markdown;
  const contentHash = crypto.createHash("sha256").update(markdownBody).digest("hex");
  const simhash = simhash48(markdownBody);

  const frontmatter: DocFrontmatter = {
    docId: document.id,
    versionNo: version.version_no,
    source: {
      connector: document.connector,
      externalId: document.external_id,
      webUrl: null,
    },
    original: {
      filename: version.original_filename,
      mime: version.original_mime,
      bytes: buffer.byteLength,
      sha256: version.original_sha256,
      pageCount: result.pageCount,
    },
    conversion: {
      engine,
      confidence: quality.confidence,
      metrics: quality.metrics,
      costUsd: null,
      convertedAt: now,
    },
    title: document.title,
    docType: document.doc_type,
    owner: null,
    effectiveDate: null,
    reviewDue: null,
    tags: [],
  };

  db.prepare(
    `UPDATE document_versions
     SET markdown = ?, frontmatter = ?, page_count = ?, sheet_names = ?,
         conversion_engine = ?, conversion_confidence = ?, conversion_metrics = ?,
         converted_at = ?, content_hash = ?, simhash = ?
     WHERE id = ?`,
  ).run(
    markdownBody,
    JSON.stringify(frontmatter),
    result.pageCount,
    result.sheetNames ? JSON.stringify(result.sheetNames) : null,
    engine,
    quality.confidence,
    JSON.stringify(quality.metrics),
    now,
    contentHash,
    simhash,
    versionId,
  );

  // Markdown ミラー（デバッグ・MCP 配信用）
  const mdDir = path.join(process.cwd(), "storage", "md");
  fs.mkdirSync(mdDir, { recursive: true });
  fs.writeFileSync(path.join(mdDir, `${versionId}.md`), buildMarkdownFile(frontmatter, markdownBody));

  // 再処理（リトライ）時の重複を避けるため、既存チャンクを先に削除する
  removeChunksForVersionFromFts(versionId);
  db.prepare(`DELETE FROM chunks WHERE version_id = ?`).run(versionId);

  const chunks = chunkMarkdown(markdownBody);
  const insertChunk = db.prepare(`
    INSERT INTO chunks
      (version_id, document_id, ordinal, heading_path, heading_anchor, page_from, page_to, sheet_name, text, text_segmented, char_count)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);

  for (const chunk of chunks) {
    const info = insertChunk.run(
      versionId,
      document.id,
      chunk.ordinal,
      chunk.headingPath,
      chunk.headingAnchor,
      chunk.pageFrom,
      chunk.pageTo,
      chunk.sheetName,
      chunk.text,
      tokenize(chunk.text),
      chunk.text.length,
    );
    const chunkId = Number(info.lastInsertRowid);
    indexChunk({
      chunkId,
      title: document.title,
      headingPath: chunk.headingPath,
      body: chunk.text,
    });
  }

  // 重複・類似検知（実装計画 §6-C 段1〜3）。他文書の現行版とだけ比較する
  runDedupeScanForVersion(versionId);
}
