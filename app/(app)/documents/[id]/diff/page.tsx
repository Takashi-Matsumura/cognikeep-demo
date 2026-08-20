import Link from "next/link";
import { notFound } from "next/navigation";
import { diffLines } from "diff";
import { Card, CardContent } from "@/components/ui/card";
import { getDocumentWithCurrentVersion, getVersionById, listVersionsForDocument } from "@/lib/db/queries/documents";

function stripAnchors(markdown: string): string {
  return markdown.replace(/^<!--\s*(page|sheet|slide):[^>]*-->\s*$/gm, "").trim();
}

export default async function DiffPage(props: PageProps<"/documents/[id]/diff">) {
  const { id } = await props.params;
  const { from, to } = await props.searchParams;

  const data = getDocumentWithCurrentVersion(id);
  if (!data) notFound();

  const fromId = typeof from === "string" ? from : null;
  const toId = typeof to === "string" ? to : null;

  const versions = listVersionsForDocument(id);
  const fromVersion = fromId ? getVersionById(fromId) : null;
  const toVersion = toId ? getVersionById(toId) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/documents/${id}/versions`} className="text-sm text-muted-foreground hover:underline">
          ← 版一覧
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">版差分</h1>
      </div>

      {!fromVersion || !toVersion ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-6 text-sm text-muted-foreground">
            <p>比較する2つの版を選んでください。</p>
            <ul className="flex flex-col gap-1">
              {versions.map((v) => (
                <li key={v.id}>
                  v{v.versionNo} — {v.originalFilename}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : !fromVersion.markdown || !toVersion.markdown ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            まだ変換が完了していない版が含まれています。
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            v{fromVersion.versionNo}（{fromVersion.originalFilename}） → v{toVersion.versionNo}
            （{toVersion.originalFilename}）
          </p>
          <DiffView oldText={stripAnchors(fromVersion.markdown)} newText={stripAnchors(toVersion.markdown)} />
        </>
      )}
    </div>
  );
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const changes = diffLines(oldText, newText);

  return (
    <Card>
      <CardContent className="overflow-x-auto py-4">
        <pre className="font-mono text-xs leading-relaxed">
          {changes.map((part, i) => {
            const lines = part.value.replace(/\n$/, "").split("\n");
            const prefix = part.added ? "+" : part.removed ? "-" : " ";
            const className = part.added
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : part.removed
                ? "bg-red-500/15 text-red-700 dark:text-red-400"
                : "text-muted-foreground";
            return (
              <div key={i} className={className}>
                {lines.map((line, j) => (
                  <div key={j}>
                    {prefix} {line}
                  </div>
                ))}
              </div>
            );
          })}
        </pre>
      </CardContent>
    </Card>
  );
}
