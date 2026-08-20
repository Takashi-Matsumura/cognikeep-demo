// ファイル配信時に安全に使ってよい Content-Type の許可リスト。
//
// セキュリティ上重要: クライアントが送ってくる `file.type`（Content-Type
// ヘッダ由来）は偽装可能。例えば `.pdf` と名乗る HTML ファイルに
// `Content-Type: text/html` を仕込んで、後で /api/files/[sha256] から
// `inline` 配信させると、同一オリジン上で任意スクリプトが実行される
// （保存型 XSS）。拡張子ベースの許可リストのみを信頼し、それ以外は
// 常に application/octet-stream として、ダウンロードとして扱う。

export const SAFE_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export function extensionOfFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isUploadableExtension(filename: string): boolean {
  return extensionOfFilename(filename) in SAFE_CONTENT_TYPE_BY_EXTENSION;
}

/** 配信時に使う安全な Content-Type。未知の拡張子は必ず application/octet-stream。 */
export function safeContentTypeForFilename(filename: string): string {
  return SAFE_CONTENT_TYPE_BY_EXTENSION[extensionOfFilename(filename)] ?? "application/octet-stream";
}
