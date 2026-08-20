import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDocumentsWithFreshness } from "@/lib/db/queries/governance";
import { FreshnessBadge } from "@/components/freshness-badge";
import { docTypeLabel } from "@/lib/doc-type";

function formatDate(ms: number | null): string {
  if (ms == null) return "-";
  return new Date(ms).toLocaleDateString("ja-JP");
}

export default async function StalePage() {
  const freshness = listDocumentsWithFreshness();
  const overdue = freshness.filter((d) => d.isOverdue).sort((a, b) => b.overdueDays - a.overdueDays);
  const orphans = freshness.filter((d) => d.ownerPersonId == null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">期限切れ・オーナー不在</h1>
        <p className="text-sm text-muted-foreground">
          見直し期限を過ぎている文書と、責任者が設定されていない文書の一覧です。
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">見直し期限超過（{overdue.length} 件）</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-muted-foreground">超過している文書はありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>タイトル</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>オーナー</TableHead>
                <TableHead>期限</TableHead>
                <TableHead>超過日数</TableHead>
                <TableHead>鮮度</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdue.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <Link href={`/documents/${d.id}`} className="hover:underline">
                      {d.title}
                    </Link>
                  </TableCell>
                  <TableCell>{docTypeLabel(d.docType)}</TableCell>
                  <TableCell>{d.ownerName ?? "未設定"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(d.reviewDueAt)}
                  </TableCell>
                  <TableCell>{d.overdueDays} 日</TableCell>
                  <TableCell>
                    <FreshnessBadge score={d.freshnessScore} band={d.band} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">オーナー不在（{orphans.length} 件）</h2>
        {orphans.length === 0 ? (
          <p className="text-sm text-muted-foreground">オーナー不在の文書はありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>タイトル</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>鮮度</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orphans.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <Link href={`/documents/${d.id}`} className="hover:underline">
                      {d.title}
                    </Link>
                  </TableCell>
                  <TableCell>{docTypeLabel(d.docType)}</TableCell>
                  <TableCell>
                    <FreshnessBadge score={d.freshnessScore} band={d.band} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
