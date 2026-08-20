import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listRecentJobs } from "@/lib/db/queries/jobs";
import { AutoRefresh } from "@/components/auto-refresh";

const STATUS_LABEL: Record<string, string> = {
  queued: "待機中",
  running: "処理中",
  succeeded: "完了",
  failed: "失敗",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  running: "default",
  succeeded: "secondary",
  failed: "destructive",
};

function formatDate(ms: number | null): string {
  if (ms == null) return "-";
  return new Date(ms).toLocaleString("ja-JP");
}

export default async function JobsPage() {
  const jobs = listRecentJobs(100);
  const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");

  return (
    <div className="flex flex-col gap-6">
      {hasActive && <AutoRefresh intervalMs={2000} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ジョブ</h1>
        <p className="text-sm text-muted-foreground">
          取り込み・変換ジョブの進行状況です{hasActive && "（自動更新中）"}
        </p>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだジョブがありません。</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>種別</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>試行回数</TableHead>
              <TableHead>作成日時</TableHead>
              <TableHead>完了日時</TableHead>
              <TableHead>エラー</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>{job.kind}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[job.status] ?? "outline"}>
                    {STATUS_LABEL[job.status] ?? job.status}
                  </Badge>
                </TableCell>
                <TableCell>{job.attempts}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(job.createdAt)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(job.finishedAt)}
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs text-destructive">
                  {job.error}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
