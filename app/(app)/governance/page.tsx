import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGovernanceSummary } from "@/lib/db/queries/governance";

export default async function GovernancePage() {
  const summary = getGovernanceSummary();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">統治</h1>
        <p className="text-sm text-muted-foreground">
          放置すれば負債に変わる文書を機械的に見つけ、トリアージするための画面です。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Link href="/governance/duplicates">
          <Card className="transition-colors hover:bg-secondary/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                重複・類似候補
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{summary.duplicateOpenCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                sha256 / 内容ハッシュ / SimHash による自動検知
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/governance/contradictions">
          <Card className="transition-colors hover:bg-secondary/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">矛盾候補</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{summary.openFindingsCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">ローカル LLM による検知</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/governance/stale">
          <Card className="transition-colors hover:bg-secondary/50">
            <CardHeader>
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
            <CardHeader>
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
    </div>
  );
}
