import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentStats } from "@/lib/db/queries/documents";
import { getJobCounts } from "@/lib/db/queries/jobs";
import { listDocumentsWithFreshness, getGovernanceSummary } from "@/lib/db/queries/governance";
import { docTypeLabel } from "@/lib/doc-type";
import { FreshnessBadge } from "@/components/freshness-badge";

function formatDate(ms: number | null): string {
  if (ms == null) return "-";
  return new Date(ms).toLocaleDateString("ja-JP");
}

export default async function DashboardPage() {
  const stats = getDocumentStats();
  const jobCounts = getJobCounts();
  const aiConverted = stats.byEngine.filter((e) => e.engine?.startsWith("local-llm:"));
  const aiConvertedCount = aiConverted.reduce((sum, e) => sum + e.count, 0);

  const freshness = listDocumentsWithFreshness();
  const summary = getGovernanceSummary();
  const dueSoon = freshness
    .filter((d) => d.reviewDueAt != null)
    .sort((a, b) => (a.reviewDueAt ?? 0) - (b.reviewDueAt ?? 0))
    .slice(0, 8);

  // カテゴリの代わりに文書種別 × 鮮度バンドのヒートマップ（M2 時点ではカテゴリ体系が未実装のため）
  const heatmap = new Map<string, { healthy: number; review: number; action: number }>();
  for (const d of freshness) {
    const row = heatmap.get(d.docType) ?? { healthy: 0, review: 0, action: 0 };
    row[d.band]++;
    heatmap.set(d.docType, row);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="text-sm text-muted-foreground">
          社内文書を Markdown 化して検索・閲覧できるようにする CogniKeep の状況です。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              登録文書数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.totalDocuments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI変換された文書
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{aiConvertedCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              これまで誰も検索できなかった文書
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              要確認（低信頼度）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.lowConfidenceCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">変換信頼度 &lt; 0.6</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              処理中のジョブ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {jobCounts.queued + jobCounts.running}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              失敗 {jobCounts.failed} 件
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Link href="/governance/duplicates">
          <Card className="transition-colors hover:bg-secondary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                重複・類似候補
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{summary.duplicateOpenCount}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/governance/contradictions">
          <Card className="transition-colors hover:bg-secondary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">矛盾候補</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{summary.openFindingsCount}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/governance/stale">
          <Card className="transition-colors hover:bg-secondary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                見直し期限超過
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{summary.overdueCount}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/governance/stale">
          <Card className="transition-colors hover:bg-secondary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                オーナー不在
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{summary.orphanCount}</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>文書種別 × 鮮度</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmap.size === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-2">
              {[...heatmap.entries()].map(([docType, row]) => {
                const total = row.healthy + row.review + row.action;
                return (
                  <div key={docType} className="flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0">{docTypeLabel(docType)}</span>
                    <div className="flex h-4 flex-1 overflow-hidden rounded">
                      {row.healthy > 0 && (
                        <div
                          className="bg-emerald-500/70"
                          style={{ width: `${(row.healthy / total) * 100}%` }}
                          title={`健全 ${row.healthy}`}
                        />
                      )}
                      {row.review > 0 && (
                        <div
                          className="bg-amber-500/70"
                          style={{ width: `${(row.review / total) * 100}%` }}
                          title={`要確認 ${row.review}`}
                        />
                      )}
                      {row.action > 0 && (
                        <div
                          className="bg-red-500/70"
                          style={{ width: `${(row.action / total) * 100}%` }}
                          title={`要対応 ${row.action}`}
                        />
                      )}
                    </div>
                    <span className="w-10 shrink-0 text-right text-muted-foreground">
                      {total}件
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>今月見直すべき文書</CardTitle>
        </CardHeader>
        <CardContent>
          {dueSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground">見直し期限が設定された文書がありません。</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dueSoon.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/documents/${d.id}`} className="truncate hover:underline">
                    {d.title}
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      期限 {formatDate(d.reviewDueAt)}
                      {d.isOverdue && `（${d.overdueDays}日超過）`}
                    </span>
                    <FreshnessBadge score={d.freshnessScore} band={d.band} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-sm text-muted-foreground">
      まだ文書が登録されていません。
      <Link href="/upload" className="text-primary underline underline-offset-2">
        アップロード
      </Link>
      から始めてください。
    </p>
  );
}
