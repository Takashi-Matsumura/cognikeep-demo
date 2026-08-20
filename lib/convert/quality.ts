// ローカル変換で足りたかどうかを判定する品質ゲート。
//
// 閾値未満（confidence < 0.6）なら Claude へのフォールバックが必要、というのが
// M2 での使い方。M1 の時点ではフォールバックは実装せず、この値を測って
// UI に表示するだけに留める（実装計画 §8 M1 参照）。

export interface QualityMetrics {
  charsPerPage: number;
  blankPageRatio: number;
  garbledRatio: number;
  cjkRatio: number;
  brokenTableRatio: number;
  hasStructure: boolean;
  textLength: number;
}

export interface QualityResult {
  confidence: number;
  metrics: QualityMetrics;
}

const WEIGHTS = {
  charsPerPage: 0.3,
  blankPageRatio: 0.25,
  garbledRatio: 0.2,
  cjkRatio: 0.1,
  brokenTableRatio: 0.1,
  hasStructure: 0.05,
  tooShort: 0.3,
} as const;

const GARBLED_PATTERN = /�|\(cid:\d+\)/g;
const CJK_PATTERN = /[぀-ヿ㐀-鿿]/g;
const BROKEN_TABLE_LINE = /\S\s{3,}\S/;
const HEADING_PATTERN = /^#{1,6} /m;

/**
 * ローカル変換で得た本文（Markdown 化前の素朴な抽出結果）から品質を判定する。
 * pageTexts が無い（Office 系など）場合は1ページ扱いにする。
 */
export function assessQuality(pageTexts: string[]): QualityResult {
  const pages = pageTexts.length > 0 ? pageTexts : [""];
  const fullText = pages.join("\n");
  const textLength = fullText.length;

  const charsPerPage = textLength / pages.length;
  const blankPages = pages.filter((p) => p.trim().length < 20).length;
  const blankPageRatio = blankPages / pages.length;

  const garbledMatches = fullText.match(GARBLED_PATTERN)?.length ?? 0;
  const garbledRatio = textLength > 0 ? garbledMatches / textLength : 1;

  const cjkMatches = fullText.match(CJK_PATTERN)?.length ?? 0;
  const cjkRatio = textLength > 0 ? cjkMatches / textLength : 0;

  const lines = fullText.split("\n").filter((l) => l.trim().length > 0);
  const brokenTableLines = lines.filter((l) => BROKEN_TABLE_LINE.test(l)).length;
  const brokenTableRatio = lines.length > 0 ? brokenTableLines / lines.length : 0;

  const hasStructure = textLength <= 3000 || HEADING_PATTERN.test(fullText);

  const metrics: QualityMetrics = {
    charsPerPage,
    blankPageRatio,
    garbledRatio,
    cjkRatio,
    brokenTableRatio,
    hasStructure,
    textLength,
  };

  let penalty = 0;
  if (charsPerPage < 200) penalty += WEIGHTS.charsPerPage;
  if (blankPageRatio > 0.3) penalty += WEIGHTS.blankPageRatio;
  if (garbledRatio > 0.005) penalty += WEIGHTS.garbledRatio;
  if (cjkRatio < 0.1) penalty += WEIGHTS.cjkRatio;
  if (brokenTableRatio > 0.2) penalty += WEIGHTS.brokenTableRatio;
  if (!hasStructure) penalty += WEIGHTS.hasStructure;
  if (textLength < 100) penalty += WEIGHTS.tooShort;

  const confidence = Math.max(0, Math.min(1, 1 - penalty));
  return { confidence, metrics };
}

export const FALLBACK_THRESHOLD = 0.6;

export function needsFallback(confidence: number): boolean {
  return confidence < FALLBACK_THRESHOLD;
}
