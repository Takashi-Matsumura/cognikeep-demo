import { test } from "node:test";
import assert from "node:assert/strict";
import { simhash48, hammingDistance48, jaccardSimilarity, containment, shingles } from "./simhash.ts";

test("同一テキストの SimHash は完全一致（ハミング距離0）", () => {
  const text = "出張時の日当は2,500円とする。宿泊費は実費を精算する。";
  const a = simhash48(text);
  const b = simhash48(text);
  assert.equal(a, b);
  assert.equal(hammingDistance48(a, b), 0);
});

test("大きく異なるテキストはハミング距離が離れる", () => {
  const a = simhash48("出張時の日当は2,500円とする。宿泊費は実費を精算する。");
  const b = simhash48("情報セキュリティ方針。パスワードは12文字以上とし、90日ごとに変更する。");
  assert.ok(hammingDistance48(a, b) > 10, `距離が近すぎる: ${hammingDistance48(a, b)}`);
});

test("わずかな表記ゆれ（1箇所だけ違う）は近いハミング距離になる", () => {
  const a = simhash48(
    "出張旅費規程 第3条 出張時の日当は2,500円とする。宿泊費は実費を精算する。交通費も同様とする。",
  );
  const b = simhash48(
    "出張旅費規程 第3条 出張時の日当は3,000円とする。宿泊費は実費を精算する。交通費も同様とする。",
  );
  const distance = hammingDistance48(a, b);
  assert.ok(distance < 15, `似ているはずなのに距離が大きい: ${distance}`);
});

test("48bit の範囲に収まり、JS の安全な整数として扱える", () => {
  const h = simhash48("テストテキストです。".repeat(50));
  assert.ok(Number.isSafeInteger(h));
  assert.ok(h >= 0 && h < 2 ** 48);
});

test("空文字列は0を返す", () => {
  assert.equal(simhash48(""), 0);
});

test("shingles: 3-gram が正しく作られる", () => {
  const grams = shingles("残業の申請は7日前まで");
  assert.ok(grams.length > 0);
  assert.ok(grams.every((g) => g.split(" ").length <= 3));
});

test("jaccardSimilarity: 完全一致で1、無関係で0に近い", () => {
  const a = new Set(["a", "b", "c"]);
  assert.equal(jaccardSimilarity(a, new Set(["a", "b", "c"])), 1);
  assert.equal(jaccardSimilarity(a, new Set(["x", "y", "z"])), 0);
});

test("containment: 片方がもう片方に完全包含されると1になる", () => {
  const small = new Set(["a", "b"]);
  const large = new Set(["a", "b", "c", "d", "e"]);
  assert.equal(containment(small, large), 1);
  // Jaccard は同じ組み合わせでは1にならない（サイズが違うため）
  assert.ok(jaccardSimilarity(small, large) < 1);
});
