import matter from "gray-matter";

export interface ConversionInfo {
  engine: string;
  confidence: number;
  metrics: object;
  costUsd: number | null;
  convertedAt: number;
}

export interface OriginalInfo {
  filename: string;
  mime: string;
  bytes: number;
  sha256: string;
  pageCount: number | null;
}

export interface DocFrontmatter {
  docId: string;
  versionNo: number;
  source: { connector: string; externalId: string | null; webUrl: string | null };
  original: OriginalInfo;
  conversion: ConversionInfo;
  title: string;
  docType: string;
  owner: string | null;
  effectiveDate: string | null;
  reviewDue: string | null;
  tags: string[];
}

/** frontmatter オブジェクトから YAML frontmatter + Markdown 本文の完全なファイル内容を作る */
export function buildMarkdownFile(fm: DocFrontmatter, body: string): string {
  return matter.stringify(body, {
    cognikeep_version: 1,
    doc_id: fm.docId,
    version_no: fm.versionNo,
    source: fm.source,
    original: fm.original,
    conversion: fm.conversion,
    title: fm.title,
    doc_type: fm.docType,
    owner: fm.owner,
    effective_date: fm.effectiveDate,
    review_due: fm.reviewDue,
    tags: fm.tags,
  });
}

/** ファイル名から拡張子を除いた文字列を仮タイトルとして使う */
export function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}
