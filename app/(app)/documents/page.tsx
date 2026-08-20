import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDocuments } from "@/lib/db/queries/documents";
import { listDocumentsWithFreshness } from "@/lib/db/queries/governance";
import { ConversionBadge } from "@/components/conversion-badge";
import { FreshnessBadge } from "@/components/freshness-badge";
import { docTypeLabel } from "@/lib/doc-type";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DocumentsPage() {
  const documents = listDocuments();
  const freshnessById = new Map(listDocumentsWithFreshness().map((f) => [f.id, f]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">文書一覧</h1>
        <p className="text-sm text-muted-foreground">{documents.length} 件</p>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          まだ文書がありません。<Link href="/upload" className="text-primary underline underline-offset-2">アップロード</Link>してください。
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead>種別</TableHead>
              <TableHead>変換</TableHead>
              <TableHead>鮮度</TableHead>
              <TableHead>チャンク数</TableHead>
              <TableHead>更新日時</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const freshness = freshnessById.get(doc.id);
              return (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <Link href={`/documents/${doc.id}`} className="hover:underline">
                      {doc.title}
                    </Link>
                    {doc.originalFilename && (
                      <div className="text-xs text-muted-foreground">{doc.originalFilename}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{docTypeLabel(doc.docType)}</Badge>
                  </TableCell>
                  <TableCell>
                    <ConversionBadge
                      engine={doc.conversionEngine}
                      confidence={doc.conversionConfidence}
                    />
                  </TableCell>
                  <TableCell>
                    {freshness && (
                      <FreshnessBadge score={freshness.freshnessScore} band={freshness.band} />
                    )}
                  </TableCell>
                  <TableCell>{doc.chunkCount}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(doc.updatedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
