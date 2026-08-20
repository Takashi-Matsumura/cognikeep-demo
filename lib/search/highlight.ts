import { tokenizeToArray } from "./segment.ts";
import { normalizeWithMap } from "./normalize.ts";

export interface Hit {
  start: number;
  end: number;
  term: string;
}

/** クエリのトークンが原文のどこに出現するかを、原文の文字インデックスで返す */
export function findHits(text: string, queryTerms: string[]): Hit[] {
  if (queryTerms.length === 0) return [];
  const { normalized, map } = normalizeWithMap(text);
  const hits: Hit[] = [];

  for (const term of queryTerms) {
    const normTerm = term.normalize("NFKC").toLowerCase();
    if (!normTerm) continue;
    let fromIndex = 0;
    while (fromIndex <= normalized.length) {
      const idx = normalized.indexOf(normTerm, fromIndex);
      if (idx === -1) break;
      hits.push({
        start: map[idx],
        end: map[idx + normTerm.length],
        term,
      });
      fromIndex = idx + normTerm.length;
    }
  }

  return mergeOverlapping(hits.sort((a, b) => a.start - b.start || a.end - b.end));
}

/** 重なり合うヒットを1つにまとめる（&lt;mark&gt; の入れ子を避ける） */
function mergeOverlapping(sorted: Hit[]): Hit[] {
  const merged: Hit[] = [];
  for (const hit of sorted) {
    const last = merged[merged.length - 1];
    if (last && hit.start <= last.end) {
      last.end = Math.max(last.end, hit.end);
    } else {
      merged.push({ ...hit });
    }
  }
  return merged;
}

export interface SnippetSegment {
  text: string;
  hit: boolean;
}

export interface Snippet {
  segments: SnippetSegment[];
  /** このスニペットが原文中で開始する位置（文書内ジャンプ用） */
  charOffset: number;
}

export interface BuildSnippetOptions {
  windowSize?: number;
  maxSnippets?: number;
}

/**
 * ヒット位置の密度が高い区間を優先してスニペットを抜き出す。
 * FTS5 の snippet() は分かち書き済み列にしか使えないため、この関数が代替する。
 */
export function buildSnippet(
  text: string,
  hits: Hit[],
  opts: BuildSnippetOptions = {},
): Snippet[] {
  const windowSize = opts.windowSize ?? 160;
  const maxSnippets = opts.maxSnippets ?? 2;

  if (hits.length === 0) {
    // ヒットが無ければ先頭からの抜粋を1つ返す
    const text0 = text.slice(0, windowSize);
    return [{ segments: [{ text: text0, hit: false }], charOffset: 0 }];
  }

  // 候補窓: 各ヒットを中心に windowSize の窓を作り、
  // 「窓に含まれる別トークンの種類数」→「ヒット文字数の合計」→「先頭に近い」の順で採用する
  const candidates = hits.map((hit) => {
    const center = Math.floor((hit.start + hit.end) / 2);
    const start = Math.max(0, center - Math.floor(windowSize / 2));
    const end = Math.min(text.length, start + windowSize);
    const covered = hits.filter((h) => h.start < end && h.end > start);
    const distinctTerms = new Set(covered.map((h) => h.term)).size;
    const coveredChars = covered.reduce((sum, h) => sum + (h.end - h.start), 0);
    return { start, end, distinctTerms, coveredChars, covered };
  });

  candidates.sort(
    (a, b) => b.distinctTerms - a.distinctTerms || b.coveredChars - a.coveredChars || a.start - b.start,
  );

  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length >= maxSnippets) break;
    // 既存の採用窓と大きく重なるものはスキップ
    const overlapsExisting = chosen.some((s) => c.start < s.end && c.end > s.start);
    if (overlapsExisting) continue;
    chosen.push(c);
  }
  chosen.sort((a, b) => a.start - b.start);

  return chosen.map((c) => {
    const segments: SnippetSegment[] = [];
    let cursor = c.start;
    for (const hit of c.covered.sort((a, b) => a.start - b.start)) {
      const hs = Math.max(hit.start, c.start);
      const he = Math.min(hit.end, c.end);
      if (hs > cursor) segments.push({ text: text.slice(cursor, hs), hit: false });
      if (he > hs) segments.push({ text: text.slice(hs, he), hit: true });
      cursor = Math.max(cursor, he);
    }
    if (cursor < c.end) segments.push({ text: text.slice(cursor, c.end), hit: false });
    return { segments, charOffset: c.start };
  });
}

/** 検索クエリ文字列からヒット箇所とスニペットをまとめて作る便利関数 */
export function highlightText(
  text: string,
  query: string,
  opts?: BuildSnippetOptions,
): Snippet[] {
  const terms = tokenizeToArray(query);
  const hits = findHits(text, terms);
  return buildSnippet(text, hits, opts);
}
