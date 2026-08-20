import mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { LocalConversionResult } from "../types.ts";

// 日本語 Word は組み込みスタイル名が日本語（「見出し 1」等）。英語版の
// スタイル名も併記して両対応する。
const STYLE_MAP = [
  "p[style-name='見出し 1'] => h1:fresh",
  "p[style-name='見出し 2'] => h2:fresh",
  "p[style-name='見出し 3'] => h3:fresh",
  "p[style-name='見出し 4'] => h4:fresh",
  "p[style-name='表題'] => h1:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Title'] => h1:fresh",
];

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  service.use(gfm);
  // 太字・下線・色などの書式は捨てる方針（実装計画 §2-D）だが、
  // 取消線（改廃を示すことがある）だけは gfm プラグインが ~~ を残すので維持する
  return service;
}

export async function convertDocx(buffer: Buffer): Promise<LocalConversionResult> {
  const { value: html, messages } = await mammoth.convertToHtml(
    { buffer },
    { styleMap: STYLE_MAP },
  );
  const conversionWarnings = messages.filter((m) => m.type === "warning");
  if (conversionWarnings.length > 0) {
    console.warn(
      `[convert:docx] ${conversionWarnings.length} 件の警告: ${conversionWarnings
        .slice(0, 3)
        .map((m) => m.message)
        .join(" / ")}`,
    );
  }

  const turndown = createTurndown();
  const markdown = turndown.turndown(html).trim();

  const { value: rawText } = await mammoth.extractRawText({ buffer });

  return {
    markdown,
    pageTexts: [rawText],
    pageCount: null,
  };
}
