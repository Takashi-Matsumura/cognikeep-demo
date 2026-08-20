import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listOpenRelations } from "@/lib/db/queries/governance";
import { dismissRelationAction, markRelationMergedAction } from "@/app/actions/relations";

const KIND_LABEL: Record<string, string> = {
  exact_dup: "完全重複",
  near_dup: "近似重複",
  contained_in: "版違いの疑い",
};

const KIND_VARIANT: Record<string, "destructive" | "default" | "secondary"> = {
  exact_dup: "destructive",
  near_dup: "default",
  contained_in: "secondary",
};

export default async function DuplicatesPage() {
  const relations = listOpenRelations();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">重複・類似トリアージ</h1>
        <p className="text-sm text-muted-foreground">
          {relations.length} 件の候補。sha256 完全一致 → 内容ハッシュ一致 → SimHash / Jaccard /
          包含率の順に安いコストで検出しています。
        </p>
      </div>

      {relations.length === 0 ? (
        <p className="text-sm text-muted-foreground">現在、重複・類似の候補はありません。</p>
      ) : (
        <div className="flex flex-col gap-3">
          {relations.map((rel) => {
            const evidence = rel.evidence ? JSON.parse(rel.evidence) : null;
            return (
              <Card key={rel.id}>
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={KIND_VARIANT[rel.kind] ?? "outline"}>
                        {KIND_LABEL[rel.kind] ?? rel.kind}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        score {rel.score.toFixed(2)}
                        {evidence?.hamming != null && ` / hamming ${evidence.hamming}`}
                        {evidence?.containment != null &&
                          ` / containment ${evidence.containment.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <form action={markRelationMergedAction.bind(null, rel.id)}>
                        <Button type="submit" variant="secondary" size="sm">
                          版としてマージ済みにする
                        </Button>
                      </form>
                      <form action={dismissRelationAction.bind(null, rel.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          誤検知として却下
                        </Button>
                      </form>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Link
                      href={`/documents/${rel.aDocumentId}`}
                      className="rounded border px-3 py-2 text-sm hover:bg-secondary/50"
                    >
                      {rel.aTitle}
                    </Link>
                    <Link
                      href={`/documents/${rel.bDocumentId}`}
                      className="rounded border px-3 py-2 text-sm hover:bg-secondary/50"
                    >
                      {rel.bTitle}
                    </Link>
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
