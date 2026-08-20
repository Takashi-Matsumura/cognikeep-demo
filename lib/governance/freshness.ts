// 鮮度スコア — 半減期モデル（実装計画 §6-B）。
//
// 「規程は2年で価値が半分になる」という説明ができる半減期モデルは、
// 単純な経過日数だけの一次減衰より直感的で経営層に説明しやすい。

const DAY_MS = 1000 * 60 * 60 * 24;

// 半減期（日）。議事録・報告書は Infinity（時間で価値が減らない記録物として扱う）
const HALF_LIFE_DAYS: Record<string, number> = {
  regulation: 730,
  contract: 730,
  manual: 365,
  report: 1095,
  minutes: Infinity,
  slide: 540,
  sheet: 540,
  other: 540,
};

// 見直し間隔の既定日数（documents.review_interval_days が未設定のときのフォールバック）
const REVIEW_INTERVAL_DEFAULT_DAYS: Record<string, number | null> = {
  regulation: 365,
  contract: 365,
  manual: 180,
  report: null,
  minutes: null,
  slide: null,
  sheet: null,
  other: null,
};

export function halfLifeDaysForDocType(docType: string): number {
  return HALF_LIFE_DAYS[docType] ?? HALF_LIFE_DAYS.other;
}

export function reviewIntervalDaysForDocType(docType: string): number | null {
  return REVIEW_INTERVAL_DEFAULT_DAYS[docType] ?? null;
}

export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / DAY_MS));
}

export interface FreshnessInput {
  docType: string;
  /** COALESCE(last_reviewed_at, effective_date, version.created_at) から現在までの経過日数 */
  ageDays: number;
  isOverdue: boolean;
  overdueDays: number;
  hasOwner: boolean;
  hasSupersededHint: boolean;
  /** ローカル変換のみで低信頼のまま（Claude フォールバックもされていない）なら軽いペナルティ */
  lowConversionConfidence: boolean;
}

const PENALTY = {
  overdueMax: 30,
  overdueMaxDays: 180,
  orphan: 15,
  superseded: 20,
  lowConfidence: 5,
} as const;

export function computeFreshnessScore(input: FreshnessInput): number {
  const halfLife = halfLifeDaysForDocType(input.docType);
  const base = halfLife === Infinity ? 100 : 100 * Math.pow(0.5, input.ageDays / halfLife);

  let penalty = 0;
  if (input.isOverdue) {
    penalty += PENALTY.overdueMax * Math.min(1, input.overdueDays / PENALTY.overdueMaxDays);
  }
  if (!input.hasOwner) penalty += PENALTY.orphan;
  if (input.hasSupersededHint) penalty += PENALTY.superseded;
  if (input.lowConversionConfidence) penalty += PENALTY.lowConfidence;

  return Math.max(0, Math.min(100, base - penalty));
}

export type FreshnessBand = "healthy" | "review" | "action";

export function freshnessBand(score: number): FreshnessBand {
  if (score >= 80) return "healthy";
  if (score >= 50) return "review";
  return "action";
}

export const FRESHNESS_BAND_LABEL: Record<FreshnessBand, string> = {
  healthy: "健全",
  review: "要確認",
  action: "要対応",
};

/**
 * review_due_at が明示されていない場合のフォールバック計算。
 * documents.review_interval_days が null なら doc_type の既定値を使う。
 * 既定値も null（議事録・報告書等）なら期限なし（null）。
 */
export function computeReviewDueAt(params: {
  docType: string;
  reviewIntervalDays: number | null;
  lastReviewedAt: number | null;
  effectiveDate: number | null;
  versionCreatedAt: number;
}): number | null {
  const interval = params.reviewIntervalDays ?? reviewIntervalDaysForDocType(params.docType);
  if (interval == null) return null;
  const baseline = params.lastReviewedAt ?? params.effectiveDate ?? params.versionCreatedAt;
  return baseline + interval * DAY_MS;
}
