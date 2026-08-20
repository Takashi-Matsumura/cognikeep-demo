import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDocumentWithCurrentVersion,
  listChunksForVersion,
  listVersionsForDocument,
} from "@/lib/db/queries/documents";
import { listDocumentsWithFreshness } from "@/lib/db/queries/governance";
import { ConversionBadge } from "@/components/conversion-badge";
import { FreshnessBadge } from "@/components/freshness-badge";
import { UploadNewVersion } from "@/components/upload-new-version";
import { DOC_TYPE_OPTIONS, docTypeLabel } from "@/lib/doc-type";
import {
  markReviewedAction,
  extendReviewAction,
  setOwnerAction,
  setDocTypeAction,
} from "@/app/actions/review";

function formatDate(ms: number | null): string {
  if (ms == null) return "-";
  return new Date(ms).toLocaleString("ja-JP");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// アンカーコメント（<!-- page:N --> 等）は閲覧画面では不要なので取り除く
function stripAnchors(markdown: string): string {
  return markdown.replace(/^<!--\s*(page|sheet|slide):[^>]*-->\s*$/gm, "").trim();
}

export default async function DocumentDetailPage(props: PageProps<"/documents/[id]">) {
  const { id } = await props.params;
  const data = getDocumentWithCurrentVersion(id);
  if (!data) notFound();
  const { document, version } = data;
  const chunks = version ? listChunksForVersion(version.id) : [];
  const versions = listVersionsForDocument(id);
  const freshness = listDocumentsWithFreshness().find((f) => f.id === id) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/documents" className="text-sm text-muted-foreground hover:underline">
          ← 文書一覧
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{document.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{docTypeLabel(document.docType)}</Badge>
          <ConversionBadge
            engine={version?.conversionEngine ?? null}
            confidence={version?.conversionConfidence ?? null}
          />
          {freshness && <FreshnessBadge score={freshness.freshnessScore} band={freshness.band} />}
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
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
                <CardTitle className="text-sm">
                  版（{versions.length} 件・現行 v{version.versionNo}）
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Link
                  href={`/documents/${id}/versions`}
                  className="text-sm text-primary underline underline-offset-2"
                >
                  版一覧・差分を見る →
                </Link>
                <UploadNewVersion documentId={id} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">統治</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">見直し期限</span>
                  <span>
                    {formatDate(freshness?.reviewDueAt ?? null)}
                    {freshness?.isOverdue && (
                      <span className="ml-1 text-destructive">
                        （{freshness.overdueDays}日超過）
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    最終見直し: {formatDate(document.lastReviewedAt)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={markReviewedAction.bind(null, id)}>
                    <Button type="submit" size="sm" variant="secondary">
                      見直し完了にする
                    </Button>
                  </form>
                </div>

                <form action={extendReviewAction.bind(null, id)} className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="days" className="text-xs text-muted-foreground">
                      期限を延長（日数）
                    </label>
                    <Input id="days" name="days" type="number" min={1} defaultValue={90} className="h-8 w-24" />
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    延長
                  </Button>
                </form>

                <form action={setOwnerAction.bind(null, id)} className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="ownerName" className="text-xs text-muted-foreground">
                      オーナー
                    </label>
                    <Input
                      id="ownerName"
                      name="ownerName"
                      defaultValue={document.ownerName ?? ""}
                      placeholder="担当者名"
                      className="h-8 w-32"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    設定
                  </Button>
                </form>

                <form action={setDocTypeAction.bind(null, id)} className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="docType" className="text-xs text-muted-foreground">
                      種別
                    </label>
                    <select
                      id="docType"
                      name="docType"
                      defaultValue={document.docType}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {DOC_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    変更
                  </Button>
                </form>
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
