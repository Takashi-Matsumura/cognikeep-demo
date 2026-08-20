import { ingestLocalUpload } from "@/lib/ingest";

// Server Action のリクエストボディは既定 1MB 上限（multipart 込み）。
// PDF は数MB〜数十MB あるので、Route Handler で標準 Web API の FormData を扱う。
export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "ファイルが指定されていません" }, { status: 400 });
  }

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await ingestLocalUpload(
          file.name,
          file.type || "application/octet-stream",
          buffer,
        );
        return {
          filename: file.name,
          ok: true as const,
          documentId: result.documentId,
          versionId: result.versionId,
          jobId: result.jobId,
          isDuplicate: result.isDuplicate,
        };
      } catch (err) {
        return {
          filename: file.name,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return Response.json({ results });
}
