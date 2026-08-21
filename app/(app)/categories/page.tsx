import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategoryTree, getCategoryStats, type CategoryTreeNode } from "@/lib/db/queries/categories";
import { proposeCategoriesAction, classifyAllAction } from "@/app/actions/categories";
import { AutoRefresh } from "@/components/auto-refresh";
import { listRecentJobs } from "@/lib/db/queries/jobs";

function CategoryNode({ node, depth }: { node: CategoryTreeNode; depth: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 20 }}>
        <span className="text-sm">{node.name}</span>
        {node.isAiProposed && (
          <Badge variant="outline" className="text-xs">
            AI提案
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">{node.documentCount} 件</span>
      </div>
      {node.children.map((child) => (
        <CategoryNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default async function CategoriesPage() {
  const tree = listCategoryTree();
  const stats = getCategoryStats();
  const activeJobs = listRecentJobs(10).some(
    (j) =>
      (j.kind === "categorize_propose" || j.kind === "categorize_classify_all") &&
      (j.status === "queued" || j.status === "running"),
  );

  return (
    <div className="flex flex-col gap-6">
      {activeJobs && <AutoRefresh intervalMs={2000} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">カテゴリ</h1>
        <p className="text-sm text-muted-foreground">
          現行の分類は引き継がず、AI に全文書の内容からカテゴリ体系を提案させます。
          ローカル LLM（{process.env.LLAMACPP_TEXT_MODEL ?? "gemma-4-12b-it"}）で処理するため、
          文書は一切外部に送信されません。
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <form action={proposeCategoriesAction}>
          <Button type="submit" variant="secondary">
            AI にカテゴリ体系を提案させる
          </Button>
        </form>
        <form action={classifyAllAction}>
          <Button type="submit" variant="outline" disabled={tree.length === 0}>
            未分類の文書を分類する（{stats.uncategorizedCount} 件）
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>カテゴリ体系（{stats.totalCategories} 件）</CardTitle>
        </CardHeader>
        <CardContent>
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              まだカテゴリがありません。「AI にカテゴリ体系を提案させる」から始めてください。
            </p>
          ) : (
            <div className="flex flex-col">
              {tree.map((node) => (
                <CategoryNode key={node.id} node={node} depth={0} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
