// Markdown 本文（ページ/シートアンカー付き）を見出し境界優先でチャンクに分割する。
//
// アンカー規約（実装計画 §2-D）:
//   <!-- page:N -->   ページ境界（1-indexed）
//   <!-- sheet:NAME --> シート境界
//   <!-- slide:N -->  スライド境界（ページ番号として扱う）

export interface MarkdownChunk {
  ordinal: number;
  headingPath: string | null;
  headingAnchor: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  sheetName: string | null;
  text: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const PAGE_ANCHOR_RE = /^<!--\s*page:(\d+)\s*-->$/;
const SHEET_ANCHOR_RE = /^<!--\s*sheet:(.+?)\s*-->$/;
const SLIDE_ANCHOR_RE = /^<!--\s*slide:(\d+)\s*-->$/;

function slugify(heading: string, index: number): string {
  const base = heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `h-${index}-${base || "section"}`;
}

interface AnnotatedLine {
  text: string;
  headingPath: string | null;
  headingAnchor: string | null;
  page: number | null;
  sheet: string | null;
}

function annotateLines(markdown: string): AnnotatedLine[] {
  const lines = markdown.split("\n");
  const headingStack: Array<{ level: number; text: string }> = [];
  let currentPage: number | null = null;
  let currentSheet: string | null = null;
  let currentHeadingAnchor: string | null = null;
  let headingIndex = 0;

  const annotated: AnnotatedLine[] = [];

  for (const line of lines) {
    const headingMatch = line.match(HEADING_RE);
    const pageMatch = line.match(PAGE_ANCHOR_RE);
    const sheetMatch = line.match(SHEET_ANCHOR_RE);
    const slideMatch = line.match(SLIDE_ANCHOR_RE);

    if (pageMatch) {
      currentPage = Number(pageMatch[1]);
      continue;
    }
    if (slideMatch) {
      currentPage = Number(slideMatch[1]);
      continue;
    }
    if (sheetMatch) {
      currentSheet = sheetMatch[1];
      continue;
    }
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      headingIndex++;
      currentHeadingAnchor = slugify(text, headingIndex);
      // 見出し行自体もチャンク本文に含める（構造が見えた方が可読）
    }

    annotated.push({
      text: line,
      headingPath: headingStack.length ? headingStack.map((h) => h.text).join(" > ") : null,
      headingAnchor: currentHeadingAnchor,
      page: currentPage,
      sheet: currentSheet,
    });
  }

  return annotated;
}

export interface ChunkOptions {
  targetSize?: number;
  overlap?: number;
}

/**
 * 改行を含まない長い段落（1行が targetSize を超える）を、文単位（「。」区切り）で
 * 詰め直して複数の擬似行に分割する。単一の文がそれでも長すぎる場合のみ
 * 文字数で強制的に割る。メタ情報（見出し・ページ等）は元の行から引き継ぐ。
 */
function splitLongLine(line: AnnotatedLine, targetSize: number): AnnotatedLine[] {
  if (line.text.length <= targetSize) return [line];

  const sentences = line.text.split(/(?<=。)/);
  const pieces: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf.length > 0 && buf.length + s.length > targetSize) {
      pieces.push(buf);
      buf = "";
    }
    if (s.length > targetSize) {
      if (buf.length > 0) {
        pieces.push(buf);
        buf = "";
      }
      for (let i = 0; i < s.length; i += targetSize) pieces.push(s.slice(i, i + targetSize));
    } else {
      buf += s;
    }
  }
  if (buf.length > 0) pieces.push(buf);

  return pieces.map((text) => ({ ...line, text }));
}

/**
 * 見出し境界を優先しつつ、targetSize（文字数目安）でチャンク分割する。
 * 見出しが変わったら強制的に区切る。同一見出し内でサイズ超過により分割した
 * 場合のみ、末尾 overlap 文字を次のチャンクの先頭に引き継ぐ。
 */
export function chunkMarkdown(markdown: string, opts: ChunkOptions = {}): MarkdownChunk[] {
  const targetSize = opts.targetSize ?? 700;
  const overlap = opts.overlap ?? 100;

  const annotated = annotateLines(markdown);
  const chunks: MarkdownChunk[] = [];

  let bufferLines: AnnotatedLine[] = [];
  let bufferChars = 0;
  let carryText = "";

  function currentMeta(lines: AnnotatedLine[]) {
    const pages = lines.map((l) => l.page).filter((p): p is number => p !== null);
    return {
      headingPath: lines.find((l) => l.headingPath)?.headingPath ?? null,
      headingAnchor: lines.find((l) => l.headingAnchor)?.headingAnchor ?? null,
      sheetName: lines.find((l) => l.sheet)?.sheet ?? null,
      pageFrom: pages.length ? Math.min(...pages) : null,
      pageTo: pages.length ? Math.max(...pages) : null,
    };
  }

  function flush(withOverlap: boolean) {
    if (bufferLines.length === 0) return;
    const meta = currentMeta(bufferLines);
    const text = (carryText ? carryText + "\n" : "") + bufferLines.map((l) => l.text).join("\n");
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      chunks.push({
        ordinal: chunks.length,
        ...meta,
        text: trimmed,
      });
    }
    carryText = withOverlap ? trimmed.slice(-overlap) : "";
    bufferLines = [];
    bufferChars = 0;
  }

  let prevHeadingPath: string | null | undefined;

  for (const rawLine of annotated) {
    for (const line of splitLongLine(rawLine, targetSize)) {
      const headingChanged = prevHeadingPath !== undefined && line.headingPath !== prevHeadingPath;
      if (headingChanged && bufferLines.length > 0) {
        flush(false); // 見出し境界での区切りはオーバーラップしない
      }
      prevHeadingPath = line.headingPath;

      bufferLines.push(line);
      bufferChars += line.text.length + 1;

      if (bufferChars >= targetSize) {
        flush(true); // サイズ超過での区切りはオーバーラップする
      }
    }
  }
  flush(false);

  return chunks.map((c, i) => ({ ...c, ordinal: i }));
}
