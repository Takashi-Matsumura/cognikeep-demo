import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown } from "./markdown.ts";

test("見出しごとにチャンクが分かれ、heading_path が引き継がれる", () => {
  const md = [
    "# 出張旅費規程",
    "<!-- page:1 -->",
    "本規程は出張旅費について定める。",
    "## 3.1 交通費",
    "<!-- page:1 -->",
    "交通費は実費精算とする。",
    "<!-- page:2 -->",
    "## 3.2 出張旅費",
    "出張時の日当は2,500円とする。",
  ].join("\n");

  const chunks = chunkMarkdown(md, { targetSize: 10_000 });
  assert.ok(chunks.length >= 2);
  const c31 = chunks.find((c) => c.text.includes("交通費は実費精算"));
  assert.ok(c31);
  assert.equal(c31!.headingPath, "出張旅費規程 > 3.1 交通費");
  assert.equal(c31!.pageFrom, 1);

  const c32 = chunks.find((c) => c.text.includes("日当は2,500円"));
  assert.ok(c32);
  assert.equal(c32!.headingPath, "出張旅費規程 > 3.2 出張旅費");
  assert.equal(c32!.pageFrom, 2);
});

test("小さいターゲットサイズだと同一見出し内でも分割される", () => {
  const longBody = "本文テキストです。".repeat(50); // 500文字
  const md = `# 規程\n<!-- page:1 -->\n${longBody}`;
  const chunks = chunkMarkdown(md, { targetSize: 200, overlap: 20 });
  assert.ok(chunks.length >= 2, `分割されるはず: ${chunks.length}`);
  // 同一見出し内なので headingPath は全チャンクで同じ
  assert.ok(chunks.every((c) => c.headingPath === "規程"));
});

test("オーバーラップが同一見出し内の分割にのみ適用される", () => {
  const longBody = "あ".repeat(300);
  const md = `# 規程\n${longBody}`;
  const chunks = chunkMarkdown(md, { targetSize: 100, overlap: 20 });
  assert.ok(chunks.length >= 2);
  // 2つ目以降のチャンクの先頭が、直前チャンクの末尾と重なっているはず
  const c0end = chunks[0].text.slice(-20);
  const c1start = chunks[1].text.slice(0, 20);
  assert.equal(c0end, c1start);
});

test("シート/スライドアンカーもページ相当として拾える", () => {
  const md = ["# 見積書", "<!-- sheet:見積 -->", "## 見積", "合計金額は100万円。"].join("\n");
  const chunks = chunkMarkdown(md, { targetSize: 10_000 });
  assert.ok(chunks.some((c) => c.sheetName === "見積"));
});

test("チャンクが0件のときは空配列", () => {
  assert.deepEqual(chunkMarkdown("", {}), []);
});
