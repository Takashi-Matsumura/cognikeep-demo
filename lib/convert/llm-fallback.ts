import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { getVisionLlm } from "../llm/index.ts";
import type { LocalConversionResult } from "./types.ts";

// PDF ページを画像化 → ローカルの画像対応 LLM（Qwen3VL 想定）に読ませて
// Markdown化する。ローカル変換の品質ゲートで低信頼になった PDF（主にスキャン
// PDF）の最終手段。Claude 等の外部 API には一切送らないため、社内文書が
// 外に出ない（実装計画で懸念されていた「外部送信」の問題がそもそも発生しない）。

const SYSTEM_PROMPT = `あなたは日本語の社内文書を Markdown に書き起こす専門家です。
- 原文の語句を改変・要約・補完しない。読み取れない箇所は <!-- unreadable --> と書く
- 見出しは元の文書の階層に合わせて # から ###### で表現する
- 表は GFM テーブルで表現する。セル内改行は <br>
- 太字・下線・文字色などの書式は無視してよい。取消線だけは ~~...~~ で残す（改廃を示すことがあるため）
- 図・写真そのものは説明せず無視してよい
- Markdown 本文のみを出力すること。前置き・説明・コードフェンスは付けない`;

// 暴走防止のハードキャップ。これを超える PDF は先頭 MAX_PAGES ページのみ処理する
const MAX_PAGES = 60;

export interface VisionConversionOptions {
  maxPages?: number;
}

export async function convertPdfWithVisionLlm(
  buffer: Buffer,
  opts: VisionConversionOptions = {},
): Promise<LocalConversionResult> {
  const vision = getVisionLlm();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const totalPages = pdf.numPages;
  const pagesToProcess = Math.min(totalPages, opts.maxPages ?? MAX_PAGES);

  const bodyParts: string[] = [];
  const pageTexts: string[] = [];

  for (let pageNo = 1; pageNo <= pagesToProcess; pageNo++) {
    const imageBuffer = await renderPageAsImage(pdf, pageNo, {
      scale: 2.0,
      canvasImport: () => import("@napi-rs/canvas"),
    });

    const markdown = await vision.completeVision({
      system: SYSTEM_PROMPT,
      prompt: `これは全${pagesToProcess}ページ中${pageNo}ページ目の画像です。この内容を Markdown として書き起こしてください。`,
      images: [Buffer.from(imageBuffer)],
      maxTokens: 4000,
    });

    const trimmed = markdown.trim();
    bodyParts.push(`<!-- page:${pageNo} -->`);
    bodyParts.push(trimmed);
    pageTexts.push(trimmed);
  }

  if (pagesToProcess < totalPages) {
    bodyParts.push(
      `\n<!-- unreadable: 全${totalPages}ページ中${pagesToProcess}ページのみ処理しました -->`,
    );
  }

  return {
    markdown: bodyParts.join("\n\n"),
    pageTexts,
    pageCount: totalPages,
  };
}
