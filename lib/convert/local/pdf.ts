import { getDocumentProxy, extractText } from "unpdf";
import type { LocalConversionResult } from "../types.ts";

/**
 * テキスト層のある PDF をページ単位で抽出する。抽出した生テキストをそのまま
 * ページアンカー（&lt;!-- page:N --&gt;）付きの Markdown として並べる。
 * 見出し構造の復元は行わない（品質ゲートで低信頼になった場合は M2 で
 * Claude フォールバックが構造化まで担う）。
 */
export async function convertPdf(buffer: Buffer): Promise<LocalConversionResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const bodyParts: string[] = [];
  for (let i = 0; i < text.length; i++) {
    bodyParts.push(`<!-- page:${i + 1} -->`);
    bodyParts.push(text[i].trim());
  }

  return {
    markdown: bodyParts.join("\n\n"),
    pageTexts: text,
    pageCount: totalPages,
  };
}
