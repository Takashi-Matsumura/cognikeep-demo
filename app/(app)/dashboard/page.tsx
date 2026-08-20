import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentStats } from "@/lib/db/queries/documents";
import { getJobCounts } from "@/lib/db/queries/jobs";

const DOC_TYPE_LABEL: Record<string, string> = {
  regulation: "規程",
  manual: "手順書",
  contract: "契約",
  minutes: "議事録",
  report: "報告書",
  slide: "スライド",
  sheet: "表計算",
  other: "その他",
};

export default async function DashboardPage() {
  const stats = getDocumentStats();
  const jobCounts = getJobCounts();
  const aiConverted = stats.byEngine.filter((e) => e.engine?.startsWith("claude:"));
  const aiConvertedCount = aiConverted.reduce((sum, e) => sum + e.count, 0);

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

      <Card>
        <CardHeader>
          <CardTitle>文書種別の内訳</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byDocType.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-2">
              {stats.byDocType.map((row) => (
                <li key={row.docType} className="flex items-center justify-between text-sm">
                  <span>{DOC_TYPE_LABEL[row.docType] ?? row.docType}</span>
                  <span className="font-medium">{row.count} 件</span>
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
