import { getBlobStore } from "@/lib/storage/blob";
import { getDb } from "@/lib/db/client";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/files/[sha256]">,
) {
  const { sha256 } = await ctx.params;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT original_mime, original_filename FROM document_versions WHERE original_sha256 = ? LIMIT 1`,
    )
    .get(sha256) as { original_mime: string; original_filename: string } | undefined;

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const blobStore = getBlobStore();
  if (!(await blobStore.has(sha256))) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await blobStore.get(sha256);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": row.original_mime || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
