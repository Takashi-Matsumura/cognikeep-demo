import { test } from "node:test";
import assert from "node:assert/strict";
import { assessQuality, needsFallback } from "./quality.ts";

test("十分なテキスト量・日本語比率の文書は高信頼度になる", () => {
  const goodPage =
    "第1条 本規程は当社の就業に関する基本事項を定めるものである。".repeat(10);
  const result = assessQuality(["# 第1章\n" + goodPage, "## 第2章\n" + goodPage]);
  assert.ok(result.confidence >= 0.6, `confidence=${result.confidence}`);
  assert.ok(!needsFallback(result.confidence));
});

test("スキャン PDF（文字収率が極端に低い）は低信頼度になりフォールバック対象になる", () => {
  const result = assessQuality(["", "", "少し", ""]);
  assert.ok(needsFallback(result.confidence), `confidence=${result.confidence}`);
});

test("文字化け（cid 参照）が多いと信頼度が下がる", () => {
  const garbled = "(cid:12)(cid:34)(cid:56)".repeat(100);
  const clean = "本文テキストです。".repeat(100);
  const resultGarbled = assessQuality([garbled]);
  const resultClean = assessQuality([clean]);
  assert.ok(resultGarbled.confidence < resultClean.confidence);
});

test("空文字列は最低信頼度に近い", () => {
  const result = assessQuality([""]);
  assert.equal(result.metrics.textLength, 0);
  assert.ok(needsFallback(result.confidence));
});
