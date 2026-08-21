import { searchChunks, getChunksByIds, type SearchHit, type SearchFilters } from "./fts.ts";
import { semanticSearch } from "./vector.ts";

// キーワード検索（BM25）とセマンティック検索（コサイン類似度）を
// Reciprocal Rank Fusion で統合する。
//
// BM25 とコサイン類似度は尺度が全く異なる（前者は無制限の負の実数、後者は
// -1〜1）ため、生スコアの加重和は無意味。RRF は順位だけを見るので
// 正規化やチューニングが要らず、PoC 向き。
//
//   score(d) = Σ_i  1 / (K + rank_i(d))     i ∈ {keyword, semantic}

const RRF_K = 60;

export interface HybridSearchHit extends SearchHit {
  rrfScore: number;
  matchedBy: Array<"keyword" | "semantic">;
}

/**
 * ハイブリッド検索。埋め込みサーバに到達できない場合はキーワード検索のみに
 * 自動的に縮退する（セマンティック検索は「あれば良い」機能であって、
 * 落ちても検索そのものは止めない）。
 */
export async function hybridSearch(
  queryText: string,
  filters: SearchFilters = {},
  limit = 30,
): Promise<HybridSearchHit[]> {
  const keywordHits = searchChunks(queryText, filters, 50);

  let semanticHits: Awaited<ReturnType<typeof semanticSearch>> = [];
  try {
    semanticHits = await semanticSearch(queryText, 50);
  } catch (err) {
    console.error(`[hybrid-search] セマンティック検索に失敗、キーワード検索のみで続行: ${(err as Error).message}`);
  }

  const rrfScores = new Map<number, number>();
  const matchedBy = new Map<number, Set<"keyword" | "semantic">>();

  keywordHits.forEach((hit, rank) => {
    rrfScores.set(hit.chunkId, (rrfScores.get(hit.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
    (matchedBy.get(hit.chunkId) ?? matchedBy.set(hit.chunkId, new Set()).get(hit.chunkId)!).add("keyword");
  });
  semanticHits.forEach((hit, rank) => {
    rrfScores.set(hit.chunkId, (rrfScores.get(hit.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
    (matchedBy.get(hit.chunkId) ?? matchedBy.set(hit.chunkId, new Set()).get(hit.chunkId)!).add("semantic");
  });

  // キーワード検索側に無かった（セマンティックのみでヒットした）チャンクのメタデータを補う
  const keywordChunkIds = new Set(keywordHits.map((h) => h.chunkId));
  const semanticOnlyIds = semanticHits.map((h) => h.chunkId).filter((id) => !keywordChunkIds.has(id));
  const semanticOnlyMeta = getChunksByIds(semanticOnlyIds);

  const byId = new Map<number, Omit<SearchHit, "score">>();
  for (const hit of keywordHits) byId.set(hit.chunkId, hit);
  for (const meta of semanticOnlyMeta) byId.set(meta.chunkId, meta);

  const merged: HybridSearchHit[] = [...rrfScores.entries()]
    .map(([chunkId, rrfScore]) => {
      const meta = byId.get(chunkId);
      if (!meta) return null;
      return {
        ...meta,
        score: rrfScore,
        rrfScore,
        matchedBy: [...(matchedBy.get(chunkId) ?? [])],
      };
    })
    .filter((h): h is HybridSearchHit => h !== null);

  merged.sort((a, b) => b.rrfScore - a.rrfScore);
  return merged.slice(0, limit);
}
