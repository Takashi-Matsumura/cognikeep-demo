import ExcelJS from "exceljs";
import type { LocalConversionResult } from "../types.ts";

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join("");
    }
    if ("text" in value && typeof value.text === "string") {
      // ハイパーリンク {text, hyperlink}
      return value.text;
    }
    if ("result" in value) {
      // 数式 {formula, result}
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ("error" in value) {
      return `#ERROR(${value.error})`;
    }
    return "";
  }
  return String(value).replace(/\r?\n/g, "<br>");
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/** 1シート分を GFM テーブルの Markdown に変換する。1行目をヘッダー行として扱う。 */
function sheetToMarkdown(worksheet: ExcelJS.Worksheet): { markdown: string; text: string } {
  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    // row.values は 1-indexed（index 0 は undefined）なので slice(1)
    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellToString);
    // 末尾の空セルを削る（結合セル等でずれた空文字列が続くのを避ける）
    while (values.length > 0 && values[values.length - 1] === "") values.pop();
    if (values.length > 0) rows.push(values);
  });

  if (rows.length === 0) {
    return { markdown: "*（データなし）*", text: "" };
  }

  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push("");
    return padded;
  };

  const [header, ...body] = rows;
  const lines: string[] = [];
  lines.push(`| ${pad(header).map(escapeTableCell).join(" | ")} |`);
  lines.push(`| ${pad(header).map(() => "---").join(" | ")} |`);
  for (const r of body) {
    lines.push(`| ${pad(r).map(escapeTableCell).join(" | ")} |`);
  }

  const text = rows.map((r) => r.join(" ")).join("\n");
  return { markdown: lines.join("\n"), text };
}

export async function convertXlsx(buffer: Buffer): Promise<LocalConversionResult> {
  const workbook = new ExcelJS.Workbook();
  // exceljs 自身の .d.ts が `declare interface Buffer extends ArrayBuffer {}` という
  // 独自の（グローバルの Node Buffer とは別の）Buffer 型をモジュール内に宣言しており、
  // 実在の Buffer 値と構造的に一致しない（maxByteLength 等の ArrayBuffer 専用プロパティを
  // 要求してくる）。exceljs 側の型定義の不備なので、ここだけ実行時には無害な any で回避する。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const bodyParts: string[] = [];
  const pageTexts: string[] = [];
  const sheetNames: string[] = [];

  workbook.eachSheet((worksheet) => {
    sheetNames.push(worksheet.name);
    bodyParts.push(`<!-- sheet:${worksheet.name} -->`);
    bodyParts.push(`## ${worksheet.name}`);
    const { markdown, text } = sheetToMarkdown(worksheet);
    bodyParts.push(markdown);
    pageTexts.push(text);
  });

  return {
    markdown: bodyParts.join("\n\n"),
    pageTexts,
    pageCount: null,
    sheetNames,
  };
}
