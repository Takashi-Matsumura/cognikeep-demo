import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  tokenizeToArray,
  buildMatchQuery,
  diagnoseSegmenter,
} from "./segment.ts";

test("2文字の日本語検索語がトークン化される（trigram なら全滅するケース）", () => {
  for (const word of ["残業", "申請", "規則", "経費", "労働"]) {
    const tokens = tokenizeToArray(word);
    assert.deepEqual(tokens, [word.toLowerCase()], `"${word}" は1トークンであるべき`);
  }
});

test("助詞・句読点・活用断片はストップワードとして除外される", () => {
  const tokens = tokenizeToArray(
    "当社の情報セキュリティ管理規程は令和6年4月1日に改訂されました。",
  );
  assert.ok(tokens.includes("情報"));
  assert.ok(tokens.includes("セキュリティ"));
  assert.ok(tokens.includes("規程"));
  assert.ok(!tokens.includes("の"), "助詞「の」は除外される");
  assert.ok(!tokens.includes("は"), "助詞「は」は除外される");
  assert.ok(!tokens.includes("した"), "活用断片「した」は除外される");
  assert.ok(!tokens.includes("。"), "句読点は isWordLike=false で除外される");
});

test("型番・略語は分割されすぎない（英数字は連続トークンになる）", () => {
  const tokens = tokenizeToArray("東京都の京都事務所 ISO27001 Rev.3");
  assert.ok(tokens.includes("iso27001"), "型番が1トークンで残る");
  assert.ok(tokens.includes("京都"), "「京都」と「東京都」が区別される");
  assert.ok(tokens.includes("東京"));
});

test("英数字は小文字化される", () => {
  const tokens = tokenizeToArray("Password は禁止");
  assert.ok(tokens.includes("password"));
});

test("tokenize はスペース区切り文字列を返す", () => {
  assert.equal(tokenize("残業申請"), "残業 申請");
});

test("buildMatchQuery は各トークンをダブルクオートで囲み AND 連結する", () => {
  assert.equal(buildMatchQuery("残業申請"), '"残業" AND "申請"');
});

test("buildMatchQuery はクエリに混入した記号を無害化する（FTS5 予約語対策）", () => {
  // ダブルクオートは句読点扱いで Intl.Segmenter がそもそも除去するため
  // トークンに混入しない。MATCH 式に FTS5 の構文記号がそのまま漏れないことを確認する。
  const q = buildMatchQuery('"インジェクション" OR 1=1 --');
  assert.ok(q !== null);
  assert.ok(!q!.includes('"OR"'), "OR のような FTS5 演算子が素通りしていないか");
  assert.equal(q, '"インジェクション" AND "or" AND "1" AND "1"');
});

test("buildMatchQuery はトークンが無ければ null を返す", () => {
  assert.equal(buildMatchQuery("。、！？"), null);
});

test("diagnoseSegmenter はこの実行環境で健全と判定する", () => {
  const result = diagnoseSegmenter();
  assert.ok(result.ok, `ICU の日本語分割が劣化しています: ${JSON.stringify(result)}`);
});
