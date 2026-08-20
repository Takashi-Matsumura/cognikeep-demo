import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFreshnessScore,
  freshnessBand,
  computeReviewDueAt,
  halfLifeDaysForDocType,
  reviewIntervalDaysForDocType,
} from "./freshness.ts";

test("経過日数0なら鮮度スコアはほぼ100（半減期モデルの初期値）", () => {
  const score = computeFreshnessScore({
    docType: "regulation",
    ageDays: 0,
    isOverdue: false,
    overdueDays: 0,
    hasOwner: true,
    hasSupersededHint: false,
    lowConversionConfidence: false,
  });
  assert.ok(score >= 99, `score=${score}`);
});

test("半減期ちょうどでスコアが半分になる", () => {
  const halfLife = halfLifeDaysForDocType("regulation");
  const score = computeFreshnessScore({
    docType: "regulation",
    ageDays: halfLife,
    isOverdue: false,
    overdueDays: 0,
    hasOwner: true,
    hasSupersededHint: false,
    lowConversionConfidence: false,
  });
  assert.ok(Math.abs(score - 50) < 1, `score=${score}`);
});

test("議事録は半減期無限大なので経過日数によらずベーススコアが減衰しない", () => {
  const score = computeFreshnessScore({
    docType: "minutes",
    ageDays: 100_000,
    isOverdue: false,
    overdueDays: 0,
    hasOwner: true,
    hasSupersededHint: false,
    lowConversionConfidence: false,
  });
  assert.equal(score, 100);
});

test("期限超過・オーナー不在・被代替・低信頼が重なるとスコアが大きく下がる", () => {
  const score = computeFreshnessScore({
    docType: "regulation",
    ageDays: 0,
    isOverdue: true,
    overdueDays: 200, // 上限180で頭打ち
    hasOwner: false,
    hasSupersededHint: true,
    lowConversionConfidence: true,
  });
  // 100 - (30 + 15 + 20 + 5) = 30
  assert.ok(Math.abs(score - 30) < 1, `score=${score}`);
});

test("スコアは0未満にならない", () => {
  const score = computeFreshnessScore({
    docType: "manual",
    ageDays: 100_000,
    isOverdue: true,
    overdueDays: 10_000,
    hasOwner: false,
    hasSupersededHint: true,
    lowConversionConfidence: true,
  });
  assert.equal(score, 0);
});

test("freshnessBand: 80以上healthy、50-79review、50未満action", () => {
  assert.equal(freshnessBand(100), "healthy");
  assert.equal(freshnessBand(80), "healthy");
  assert.equal(freshnessBand(79), "review");
  assert.equal(freshnessBand(50), "review");
  assert.equal(freshnessBand(49), "action");
  assert.equal(freshnessBand(0), "action");
});

test("computeReviewDueAt: 明示的な interval が優先される", () => {
  const versionCreatedAt = 1_700_000_000_000;
  const dueAt = computeReviewDueAt({
    docType: "other", // other の既定は null
    reviewIntervalDays: 30,
    lastReviewedAt: null,
    effectiveDate: null,
    versionCreatedAt,
  });
  assert.equal(dueAt, versionCreatedAt + 30 * 24 * 60 * 60 * 1000);
});

test("computeReviewDueAt: interval 未指定なら doc_type の既定値を使う", () => {
  const versionCreatedAt = 1_700_000_000_000;
  const dueAt = computeReviewDueAt({
    docType: "manual",
    reviewIntervalDays: null,
    lastReviewedAt: null,
    effectiveDate: null,
    versionCreatedAt,
  });
  const expectedInterval = reviewIntervalDaysForDocType("manual")!;
  assert.equal(dueAt, versionCreatedAt + expectedInterval * 24 * 60 * 60 * 1000);
});

test("computeReviewDueAt: 既定値も無い doc_type（議事録等）は null", () => {
  const dueAt = computeReviewDueAt({
    docType: "minutes",
    reviewIntervalDays: null,
    lastReviewedAt: null,
    effectiveDate: null,
    versionCreatedAt: Date.now(),
  });
  assert.equal(dueAt, null);
});

test("computeReviewDueAt: last_reviewed_at が effective_date より優先される", () => {
  const lastReviewedAt = 1_700_000_000_000;
  const effectiveDate = 1_600_000_000_000;
  const dueAt = computeReviewDueAt({
    docType: "regulation",
    reviewIntervalDays: 100,
    lastReviewedAt,
    effectiveDate,
    versionCreatedAt: 1_500_000_000_000,
  });
  assert.equal(dueAt, lastReviewedAt + 100 * 24 * 60 * 60 * 1000);
});
