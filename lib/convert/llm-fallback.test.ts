import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { isLlmAvailable, LLM_ENDPOINTS } from "../llm/index.ts";
import { convertPdfWithVisionLlm } from "./llm-fallback.ts";

const visionAvailable = await isLlmAvailable(LLM_ENDPOINTS.visionUrl);

async function makeTestPdf(pageTexts: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const text of pageTexts) {
    const page = doc.addPage([400, 150]);
    page.drawText(text, { x: 30, y: 80, size: 24, font });
  }
  return Buffer.from(await doc.save());
}

test(
  "convertPdfWithVisionLlm: 複数ページを1ページずつ画像化して書き起こし、page アンカーを挿入する",
  { skip: !visionAvailable && "vision llama.cpp サーバに接続できません" },
  async () => {
    const pdf = await makeTestPdf(["COGNIKEEP TEST PAGE ONE", "COGNIKEEP TEST PAGE TWO"]);
    const result = await convertPdfWithVisionLlm(pdf);

    assert.equal(result.pageCount, 2);
    assert.equal(result.pageTexts.length, 2);
    assert.match(result.markdown, /<!-- page:1 -->/);
    assert.match(result.markdown, /<!-- page:2 -->/);
    // OCR 結果の完全一致までは求めないが、明確に異なる特徴語が拾えているはず
    assert.match(result.pageTexts[0].toUpperCase(), /ONE/);
    assert.match(result.pageTexts[1].toUpperCase(), /TWO/);
  },
);

test(
  "convertPdfWithVisionLlm: maxPages を超えるページは処理しない",
  { skip: !visionAvailable && "vision llama.cpp サーバに接続できません" },
  async () => {
    const pdf = await makeTestPdf(["PAGE A", "PAGE B", "PAGE C"]);
    const result = await convertPdfWithVisionLlm(pdf, { maxPages: 1 });

    assert.equal(result.pageCount, 3, "総ページ数は正しく報告される");
    assert.equal(result.pageTexts.length, 1, "実際に処理したのは1ページのみ");
    assert.match(result.markdown, /unreadable/);
  },
);
