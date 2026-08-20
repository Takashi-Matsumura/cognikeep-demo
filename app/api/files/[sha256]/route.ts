import { getBlobStore } from "@/lib/storage/blob";
import { getDb } from "@/lib/db/client";
import { safeContentTypeForFilename, isUploadableExtension } from "@/lib/files/mime";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/files/[sha256]">,
) {
  const { sha256 } = await ctx.params;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT original_filename FROM document_versions WHERE original_sha256 = ? LIMIT 1`,
    )
    .get(sha256) as { original_filename: string } | undefined;

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const blobStore = getBlobStore();
  if (!(await blobStore.has(sha256))) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await blobStore.get(sha256);

  // クライアントが送ってきた Content-Type（original_mime）は偽装可能なので信頼しない。
  // 自前の拡張子ベース許可リストからのみ Content-Type を決める。許可リスト外の
  // ファイル（原則ここには来ないはずだが、念のため）は常に添付ファイル扱い・
  // application/octet-stream にし、inline 表示させない。
  const safe = isUploadableExtension(row.original_filename);
  const disposition = safe ? "inline" : "attachment";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": safeContentTypeForFilename(row.original_filename),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
