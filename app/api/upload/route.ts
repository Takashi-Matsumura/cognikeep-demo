import { ingestLocalUpload, ingestNewVersion } from "@/lib/ingest";

// Server Action のリクエストボディは既定 1MB 上限（multipart 込み）。
// PDF は数MB〜数十MB あるので、Route Handler で標準 Web API の FormData を扱う。
export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const documentId = formData.get("documentId");

  if (files.length === 0) {
    return Response.json({ error: "ファイルが指定されていません" }, { status: 400 });
  }

  // documentId が指定されている場合は「既存文書への新版アップロード」。
  // 対象が一意なのでファイルは1件のみ受け付ける。
  if (typeof documentId === "string" && documentId) {
    const file = files[0];
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await ingestNewVersion(documentId, file.name, buffer);
      return Response.json({
        results: [
          {
            filename: file.name,
            ok: true as const,
            documentId: result.documentId,
            versionId: result.versionId,
            jobId: result.jobId,
            isDuplicate: result.isDuplicate,
          },
        ],
      });
    } catch (err) {
      return Response.json({
        results: [
          {
            filename: file.name,
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          },
        ],
      });
    }
  }

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await ingestLocalUpload(file.name, buffer);
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
