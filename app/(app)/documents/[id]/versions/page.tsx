import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDocumentWithCurrentVersion, listVersionsForDocument } from "@/lib/db/queries/documents";
import { ConversionBadge } from "@/components/conversion-badge";

function formatDate(ms: number | null): string {
  if (ms == null) return "-";
  return new Date(ms).toLocaleString("ja-JP");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function VersionsPage(props: PageProps<"/documents/[id]/versions">) {
  const { id } = await props.params;
  const data = getDocumentWithCurrentVersion(id);
  if (!data) notFound();
  const versions = listVersionsForDocument(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/documents/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {data.document.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">版一覧</h1>
        <p className="text-sm text-muted-foreground">{versions.length} 件</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>版</TableHead>
            <TableHead>ファイル名</TableHead>
            <TableHead>サイズ</TableHead>
            <TableHead>変換</TableHead>
            <TableHead>取り込み日時</TableHead>
            <TableHead>差分</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((v, i) => {
            const previous = versions[i + 1]; // version_no 降順なので次の要素が1つ古い版
            return (
              <TableRow key={v.id}>
                <TableCell className="font-medium">
                  v{v.versionNo}
                  {v.isCurrent && (
                    <Badge variant="secondary" className="ml-2">
                      現行
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-xs truncate">{v.originalFilename}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatBytes(v.originalBytes)}
                </TableCell>
                <TableCell>
                  <ConversionBadge engine={v.conversionEngine} confidence={v.conversionConfidence} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(v.createdAt)}
                </TableCell>
                <TableCell>
                  {previous ? (
                    <Link
                      href={`/documents/${id}/diff?from=${previous.id}&to=${v.id}`}
                      className="text-sm text-primary underline underline-offset-2"
                    >
                      v{previous.versionNo} → v{v.versionNo}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">初版</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
