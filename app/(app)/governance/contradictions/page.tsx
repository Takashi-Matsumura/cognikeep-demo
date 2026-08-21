import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listOpenFindings, getFindingDocumentTitles } from "@/lib/db/queries/governance";
import { listRecentJobs } from "@/lib/db/queries/jobs";
import { runContradictionScanAction, resolveFindingAction, dismissFindingAction } from "@/app/actions/findings";
import { AutoRefresh } from "@/components/auto-refresh";

const SEVERITY_LABEL: Record<string, string> = { high: "重大", medium: "中", low: "軽微" };
const SEVERITY_VARIANT: Record<string, "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

interface Citation {
  documentId: string;
  page: number | null;
  headingPath: string | null;
  text: string;
}

export default async function ContradictionsPage() {
  const findings = listOpenFindings();
  const allDocIds = findings.flatMap((f) => JSON.parse(f.documentIds) as string[]);
  const titles = getFindingDocumentTitles(allDocIds);

  const activeScan = listRecentJobs(5).some(
    (j) => j.kind === "contradiction_scan" && (j.status === "queued" || j.status === "running"),
  );

  return (
    <div className="flex flex-col gap-6">
      {activeScan && <AutoRefresh intervalMs={2000} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">矛盾検知</h1>
        <p className="text-sm text-muted-foreground">
          文書間で記載内容が食い違っている疑いのある箇所を、ローカル LLM が根拠ページ付きで指摘します。
        </p>
      </div>

      <form action={runContradictionScanAction}>
        <Button type="submit" variant="secondary" disabled={activeScan}>
          {activeScan ? "スキャン実行中…" : "矛盾検知スキャンを実行"}
        </Button>
      </form>

      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">現在、矛盾の疑いのある候補はありません。</p>
      ) : (
        <div className="flex flex-col gap-3">
          {findings.map((f) => {
            const documentIds = JSON.parse(f.documentIds) as string[];
            const citations = f.citations ? (JSON.parse(f.citations) as Citation[]) : [];
            return (
              <Card key={f.id}>
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[f.severity] ?? "outline"}>
                        {SEVERITY_LABEL[f.severity] ?? f.severity}
                      </Badge>
                      {f.confidence != null && (
                        <span className="text-xs text-muted-foreground">
                          確信度 {f.confidence.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <form action={resolveFindingAction.bind(null, f.id)}>
                        <Button type="submit" variant="secondary" size="sm">
                          対応済みにする
                        </Button>
                      </form>
                      <form action={dismissFindingAction.bind(null, f.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          誤検知として却下
                        </Button>
                      </form>
                    </div>
                  </div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.summary}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {citations.map((c, i) => (
                      <div key={i} className="rounded border p-3 text-sm">
                        <Link href={`/documents/${c.documentId}`} className="font-medium hover:underline">
                          {titles.get(c.documentId) ?? documentIds[i]}
                        </Link>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {c.headingPath}
                          {c.page != null && ` · p.${c.page}`}
                        </div>
                        <p className="mt-1">{c.text}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
