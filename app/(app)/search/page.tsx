import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hybridSearch, type HybridSearchHit } from "@/lib/search/hybrid";
import { groupHitsByDocument } from "@/lib/search/fts";
import { highlightText } from "@/lib/search/highlight";
import { countChunksWithoutEmbedding } from "@/lib/search/vector";
import { ConversionBadge } from "@/components/conversion-badge";
import { reembedAllAction } from "@/app/actions/search";
import { AutoRefresh } from "@/components/auto-refresh";
import { listRecentJobs } from "@/lib/db/queries/jobs";

function Highlighted({ text, query }: { text: string; query: string }) {
  const snippets = highlightText(text, query, { windowSize: 140, maxSnippets: 1 });
  const snippet = snippets[0];
  if (!snippet) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {snippet.charOffset > 0 && "…"}
      {snippet.segments.map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
      …
    </p>
  );
}

const MATCH_LABEL: Record<HybridSearchHit["matchedBy"][number], string> = {
  keyword: "キーワード一致",
  semantic: "意味的に類似",
};

export default async function SearchPage(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";

  const hits = query ? await hybridSearch(query, {}, 50) : [];
  const grouped = groupHitsByDocument(hits, 2, "desc");

  const unembeddedCount = countChunksWithoutEmbedding();
  const reembedActive = listRecentJobs(5).some(
    (j) => j.kind === "reembed_all" && (j.status === "queued" || j.status === "running"),
  );

  return (
    <div className="flex flex-col gap-6">
      {reembedActive && <AutoRefresh intervalMs={2000} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">検索</h1>
        {query && (
          <p className="text-sm text-muted-foreground">
            「{query}」の検索結果: {grouped.length} 文書 / {hits.length} 箇所（キーワード + 意味検索）
          </p>
        )}
      </div>

      {unembeddedCount > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-sm text-muted-foreground">
              {unembeddedCount} 件のチャンクがまだ埋め込まれていません（意味検索の対象外）。
            </p>
            <form action={reembedAllAction}>
              <Button type="submit" variant="outline" size="sm" disabled={reembedActive}>
                {reembedActive ? "埋め込み中…" : "埋め込みを実行"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!query ? (
        <p className="text-sm text-muted-foreground">
          上部の検索ボックスに日本語のキーワードを入力してください。
        </p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">該当する文書が見つかりませんでした。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((doc) => (
            <Card key={doc.documentId}>
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/documents/${doc.documentId}?q=${encodeURIComponent(query)}`}
                    className="font-medium hover:underline"
                  >
                    {doc.title}
                  </Link>
                  <Badge variant="outline">{doc.docType}</Badge>
                  <ConversionBadge engine={doc.conversionEngine} confidence={null} />
                </div>
                <div className="flex flex-col gap-2">
                  {doc.hits.map((hit) => (
                    <div key={hit.chunkId} className="border-l-2 pl-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {hit.headingPath && <span>{hit.headingPath}</span>}
                        {hit.pageFrom != null && <span>p.{hit.pageFrom}</span>}
                        {(hit as HybridSearchHit).matchedBy?.map((m) => (
                          <Badge key={m} variant="secondary" className="text-[10px]">
                            {MATCH_LABEL[m]}
                          </Badge>
                        ))}
                      </div>
                      <Highlighted text={hit.text} query={query} />
                    </div>
                  ))}
                  {doc.extraHitCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      他 {doc.extraHitCount} 箇所
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
