import { test } from "node:test";
import assert from "node:assert/strict";
import { findHits, buildSnippet, highlightText } from "./highlight.ts";
import { normalizeWithMap } from "./normalize.ts";

test("normalizeWithMap: 全角英数字が半角小文字に正規化され、原文位置が復元できる", () => {
  const { normalized, map } = normalizeWithMap("Ｐａｓｓｗｏｒｄは禁止");
  assert.equal(normalized, "passwordは禁止");
  const idx = normalized.indexOf("password");
  assert.equal(idx, 0);
  assert.equal(map[idx], 0);
  assert.equal(map[idx + "password".length], "Ｐａｓｓｗｏｒｄ".length);
});

test("normalizeWithMap: 文字数が変わる互換文字でもオフセットがズレない", () => {
  // ㍿ (株式会社の合字, 1コードポイント) は NFKC で4文字に展開される
  const { normalized, map } = normalizeWithMap("㍿CogniKeep");
  assert.equal(normalized, "株式会社cognikeep");
  const idx = normalized.indexOf("cognikeep");
  const orig = map[idx];
  assert.equal("㍿CogniKeep".slice(orig), "CogniKeep");
});

test("findHits: 2文字の日本語クエリが原文中の正しい位置を返す", () => {
  const text = "出張時の日当は2,500円とする。宿泊費は実費精算。";
  const hits = findHits(text, ["日当", "精算"]);
  assert.equal(hits.length, 2);
  assert.equal(text.slice(hits[0].start, hits[0].end), "日当");
  assert.equal(text.slice(hits[1].start, hits[1].end), "精算");
});

test("findHits: 全角表記でもヒットする", () => {
  const text = "社内システムの Ｐａｓｓｗｏｒｄ は12文字以上とする。";
  const hits = findHits(text, ["password"]);
  assert.equal(hits.length, 1);
  assert.equal(text.slice(hits[0].start, hits[0].end), "Ｐａｓｓｗｏｒｄ");
});

test("buildSnippet: ヒットが無ければ先頭からの抜粋を返す", () => {
  const snippets = buildSnippet("前文。".repeat(50), []);
  assert.equal(snippets.length, 1);
  assert.equal(snippets[0].charOffset, 0);
});

test("buildSnippet: ヒット部分が hit:true のセグメントとして分離される", () => {
  const text = "経費精算の申請は毎月末日までに提出すること。";
  const hits = findHits(text, ["申請", "提出"]);
  const snippets = buildSnippet(text, hits, { windowSize: 50, maxSnippets: 1 });
  assert.equal(snippets.length, 1);
  const joined = snippets[0].segments.map((s) => s.text).join("");
  assert.ok(joined.includes("申請"));
  const hitSegments = snippets[0].segments.filter((s) => s.hit);
  assert.ok(hitSegments.some((s) => s.text === "申請"));
});

test("highlightText: クエリ文字列からヒットとスニペットを一括生成する", () => {
  const text = "残業の申請は原則として10日前までに行う。緊急時はこの限りではない。";
  const snippets = highlightText(text, "残業 申請");
  const joined = snippets.map((s) => s.segments.map((seg) => seg.text).join("")).join("");
  assert.ok(joined.includes("残業"));
});
