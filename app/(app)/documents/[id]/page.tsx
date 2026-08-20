import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentWithCurrentVersion, listChunksForVersion } from "@/lib/db/queries/documents";
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

// アンカーコメント（&lt;!-- page:N --&gt; 等）は閲覧画面では不要なので取り除く
function stripAnchors(markdown: string): string {
  return markdown.replace(/^<!--\s*(page|sheet|slide):[^>]*-->\s*$/gm, "").trim();
}

export default async function DocumentDetailPage(props: PageProps<"/documents/[id]">) {
  const { id } = await props.params;
  const data = getDocumentWithCurrentVersion(id);
  if (!data) notFound();
  const { document, version } = data;
  const chunks = version ? listChunksForVersion(version.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/documents" className="text-sm text-muted-foreground hover:underline">
          ← 文書一覧
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{document.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{document.docType}</Badge>
          <ConversionBadge
            engine={version?.conversionEngine ?? null}
            confidence={version?.conversionConfidence ?? null}
          />
          {version && (
            <span className="text-xs text-muted-foreground">
              変換日時: {formatDate(version.convertedAt)}
            </span>
          )}
        </div>
      </div>

      {!version || !version.markdown ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            まだ変換が完了していません。しばらくしてから再読み込みしてください。
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          <Card>
            <CardContent className="prose prose-sm max-w-none py-6 dark:prose-invert prose-headings:scroll-mt-20">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {stripAnchors(version.markdown)}
              </ReactMarkdown>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">原本ファイル</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="truncate">{version.originalFilename}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(version.originalBytes)}
                  {version.pageCount != null && ` · ${version.pageCount} ページ`}
                </div>
                <a
                  href={`/api/files/${version.originalSha256}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  原本を開く
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">目次（{chunks.length} セクション）</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm">
                  {chunks.map((chunk) => (
                    <li key={chunk.id} className="truncate text-muted-foreground">
                      {chunk.headingPath ?? "（見出しなし）"}
                      {chunk.pageFrom != null && (
                        <span className="ml-1 text-xs">p.{chunk.pageFrom}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
