// 日本語全文検索の要。
//
// FTS5 の trigram tokenizer は日本語で使い物にならない（実測: 「残業」「申請」
// 「規程」のような2文字語がすべて0件になる）。代わりに Intl.Segmenter で
// 分かち書きしてから FTS5 (tokenize='unicode61') に投入する。
//
// ★重要: 索引時と検索時で必ずこの1本の tokenize() だけを使うこと。
// 分割ロジックが索引側と検索側でズレると、検索が静かに（エラーなしで）壊れる。

const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

// Intl.Segmenter の isWordLike は助詞（「の」「は」等）も true を返す。
// これらは検索語として無意味な上、AND 連結の MATCH 式に混じると
// （そのチャンクにたまたま出現しないだけで）本来ヒットすべき文書を
// 取りこぼす原因になる。頻出する格助詞・活用断片だけを最小限に除外する。
const STOPWORDS = new Set([
  "の", "は", "が", "を", "に", "で", "と", "も", "や", "な", "ば", "し", "て",
  "から", "まで", "より", "へ",
  "さ", "れ", "ま", "た", "です", "ます", "した", "でし",
]);

/**
 * 分かち書きしてトークン配列を返す。句読点（isWordLike=false）と、
 * 検索語として無意味な頻出助詞・活用断片（STOPWORDS）を除外し、
 * 大文字小文字・全角半角の英数字表記ゆれを吸収するため小文字化する。
 */
export function tokenizeToArray(text: string): string[] {
  const tokens: string[] = [];
  for (const seg of segmenter.segment(text)) {
    if (!seg.isWordLike) continue;
    const token = seg.segment.toLowerCase();
    if (token.length === 0 || STOPWORDS.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

/**
 * FTS5 の unicode61 カラムに投入するための、スペース区切りの分かち書き文字列。
 * chunks.text_segmented / chunk_fts の索引時に使う。
 */
export function tokenize(text: string): string {
  return tokenizeToArray(text).join(" ");
}

/**
 * 検索クエリから FTS5 MATCH 式を組み立てる。各トークンをダブルクオートで囲み
 * AND 連結することで、FTS5 の予約語・記号（NOT, -, * など）を無害化しつつ
 * 全トークンを要求する。
 *
 * 一致するトークンが無ければ null（呼び出し側は「検索語が短すぎる」等を出す）。
 */
export function buildMatchQuery(query: string): string | null {
  const terms = tokenizeToArray(query);
  if (terms.length === 0) return null;
  const escaped = terms.map((t) => `"${t.replace(/"/g, '""')}"`);
  return escaped.join(" AND ");
}

// --- 起動時の自己診断 ---
//
// Intl.Segmenter は ICU の辞書分割に依存する。small-icu ビルドの Node
// （一部の Alpine イメージ等）だと日本語分割が劣化し、文全体が数トークンにしか
// ならず検索が静かに壊れる。起動時にこの既知の検証文で自己診断する。

const DIAGNOSTIC_TEXT =
  "当社の情報セキュリティ管理規程は令和6年4月1日に改訂されました";
const DIAGNOSTIC_MIN_TOKENS = 12;

export interface SegmenterDiagnosis {
  ok: boolean;
  tokenCount: number;
  sample: string[];
}

export function diagnoseSegmenter(): SegmenterDiagnosis {
  const sample = tokenizeToArray(DIAGNOSTIC_TEXT);
  return { ok: sample.length >= DIAGNOSTIC_MIN_TOKENS, tokenCount: sample.length, sample };
}

/**
 * 日本語分割が劣化している場合は例外を投げる。instrumentation.ts の起動処理から呼ぶ。
 */
export function assertSegmenterHealthy(): void {
  const result = diagnoseSegmenter();
  if (!result.ok) {
    throw new Error(
      `Intl.Segmenter の日本語分割が劣化しています（トークン数 ${result.tokenCount} ` +
        `< 期待値 ${DIAGNOSTIC_MIN_TOKENS}）。Node が small-icu ビルドの可能性があります。` +
        `full-icu を持つ Node ランタイムを使ってください。分割結果: ${JSON.stringify(result.sample)}`,
    );
  }
}
