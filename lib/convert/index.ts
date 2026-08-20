import path from "node:path";
import { convertDocx } from "./local/docx.ts";
import { convertXlsx } from "./local/xlsx.ts";
import { convertPdf } from "./local/pdf.ts";
import type { LocalConversionResult } from "./types.ts";

export type SupportedExtension = "docx" | "xlsx" | "pdf";

const CONVERTERS: Record<SupportedExtension, (buf: Buffer) => Promise<LocalConversionResult>> = {
  docx: convertDocx,
  xlsx: convertXlsx,
  pdf: convertPdf,
};

// M1 は pptx / 旧形式（doc, xls, ppt）は非対応（実装計画 §2-A）。
// pptx は officeparser もしくは自前 unzip 実装を M2 以降で追加する。
const UNSUPPORTED_HINT: Record<string, string> = {
  pptx: "PowerPoint (.pptx) は M2 で対応予定です",
  doc: "旧形式の Word (.doc) は非対応です。.docx に変換してから再アップロードしてください",
  xls: "旧形式の Excel (.xls) は非対応です。.xlsx に変換してから再アップロードしてください",
  ppt: "旧形式の PowerPoint (.ppt) は非対応です",
};

export function extensionOf(filename: string): string {
  return path.extname(filename).slice(1).toLowerCase();
}

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return ext in CONVERTERS;
}

export class UnsupportedFormatError extends Error {
  constructor(ext: string) {
    super(UNSUPPORTED_HINT[ext] ?? `未対応の形式です: .${ext}`);
    this.name = "UnsupportedFormatError";
  }
}

export async function convertLocally(
  filename: string,
  buffer: Buffer,
): Promise<{ result: LocalConversionResult; engine: string }> {
  const ext = extensionOf(filename);
  if (!isSupportedExtension(ext)) {
    throw new UnsupportedFormatError(ext);
  }
  const engineNames: Record<SupportedExtension, string> = {
    docx: "local:mammoth+turndown",
    xlsx: "local:exceljs",
    pdf: "local:unpdf",
  };
  const result = await CONVERTERS[ext](buffer);
  return { result, engine: engineNames[ext] };
}
