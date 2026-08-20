// fts.ts の統合テスト。独立した一時 DB に対してマイグレーション → 索引投入 → 検索
// を通しで確認する。これが「索引時と検索時の分かち書きがズレていないか」の
// 最終的な回帰テストになる。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cognikeep-test-")), "test.db");
process.env.COGNIKEEP_DB_PATH = tmpDbPath;

const { getDb } = await import("../db/client.ts");
const { runMigrations } = await import("../db/migrate.ts");
const { indexChunk, searchChunks, groupHitsByDocument } = await import("./fts.ts");
const { tokenize } = await import("./segment.ts");

before(() => {
  runMigrations();
  seed();
});

after(() => {
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

function seed() {
  const db = getDb();
  const now = Date.now();

  db.prepare(
    `INSERT INTO documents (id, title, doc_type, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
  ).run("doc-1", "就業規則", "regulation", "active", now, now);
  db.prepare(
    `INSERT INTO documents (id, title, doc_type, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
  ).run("doc-2", "経費精算規程", "regulation", "active", now, now);

  db.prepare(
    `INSERT INTO document_versions (id, document_id, version_no, original_sha256, original_filename, original_mime, original_bytes, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  ).run("ver-1", "doc-1", 1, "a".repeat(64), "a.pdf", "application/pdf", 100, now);
  db.prepare(
    `INSERT INTO document_versions (id, document_id, version_no, original_sha256, original_filename, original_mime, original_bytes, conversion_engine, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run("ver-2", "doc-2", 1, "b".repeat(64), "b.pdf", "application/pdf", 100, "local:unpdf", now);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, version_id, document_id, ordinal, heading_path, text, text_segmented, char_count)
    VALUES (?,?,?,?,?,?,?,?)
  `);

  const chunks = [
    {
      id: 1,
      versionId: "ver-1",
      documentId: "doc-1",
      title: "就業規則",
      heading: "第32条 時間外労働",
      text: "第32条 時間外労働の申請は、事前に所属長へ7日前までに提出すること。",
    },
    {
      id: 2,
      versionId: "ver-2",
      documentId: "doc-2",
      title: "経費精算規程",
      heading: "3.2 出張旅費",
      text: "出張時の日当は2,500円とする。宿泊費は実費精算。",
    },
    {
      id: 3,
      versionId: "ver-2",
      documentId: "doc-2",
      title: "経費精算規程",
      heading: "3.1 交通費",
      text: "交通費の精算は毎月末日までに経理部へ提出する。",
    },
  ];

  for (const [i, c] of chunks.entries()) {
    insertChunk.run(
      c.id,
      c.versionId,
      c.documentId,
      i,
      c.heading,
      c.text,
      tokenize(c.text),
      c.text.length,
    );
    indexChunk({ chunkId: c.id, title: c.title, headingPath: c.heading, body: c.text });
  }
}

test("2文字の日本語クエリ「申請」がヒットする（trigram なら0件になるケース）", () => {
  const hits = searchChunks("申請");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].documentId, "doc-1");
});

test("2文字の日本語クエリ「提出」が複数文書からヒットする", () => {
  const hits = searchChunks("提出");
  assert.equal(hits.length, 2, "「就業規則」と「経費精算規程」の両方にヒットするはず");
  const docIds = hits.map((h) => h.documentId).sort();
  assert.deepEqual(docIds, ["doc-1", "doc-2"]);
});

test("2文字の日本語クエリ「精算」がヒットする（trigram なら0件になるケース）", () => {
  const hits = searchChunks("精算");
  assert.ok(hits.length >= 1);
  assert.ok(hits.every((h) => h.documentId === "doc-2"));
});

test("複合クエリ「日当 精算」は両方の語を含むチャンクのみ返す", () => {
  const hits = searchChunks("日当 精算");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].chunkId, 2);
});

test("該当しないクエリは0件", () => {
  const hits = searchChunks("在宅勤務手当");
  assert.equal(hits.length, 0);
});

test("groupHitsByDocument は文書単位でグルーピングする", () => {
  const hits = searchChunks("提出");
  const grouped = groupHitsByDocument(hits);
  assert.ok(grouped.length >= 2);
  for (const g of grouped) {
    assert.ok(g.hits.length > 0);
    assert.equal(typeof g.title, "string");
  }
});

test("フィルタ: doc_type で絞り込める", () => {
  const hits = searchChunks("申請", { docType: ["regulation"] });
  assert.ok(hits.length > 0);
  assert.ok(hits.every((h) => h.docType === "regulation"));
  const none = searchChunks("申請", { docType: ["manual"] });
  assert.equal(none.length, 0);
});
