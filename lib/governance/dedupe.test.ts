import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmpDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cognikeep-dedupe-")), "test.db");
process.env.COGNIKEEP_DB_PATH = tmpDbPath;

const { getDb } = await import("../db/client.ts");
const { runMigrations } = await import("../db/migrate.ts");
const { simhash48 } = await import("./simhash.ts");
const { runDedupeScanForVersion, findDuplicateCandidates } = await import("./dedupe.ts");

const REGULATION_TEXT =
  "# 出張旅費規程\n\n第3条 出張時の日当は2,500円とする。宿泊費は実費を精算する。交通費も同様に扱う。";

const REGULATION_TEXT_REVISED =
  "# 出張旅費規程\n\n第3条 出張時の日当は3,000円とする。宿泊費は実費を精算する。交通費も同様に扱う。";

const UNRELATED_TEXT =
  "# 情報セキュリティ方針\n\nパスワードは12文字以上とし、90日ごとに変更しなければならない。";

function insertDoc(id: string, title: string) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO documents (id, title, doc_type, status, connector, created_at, updated_at)
     VALUES (?, ?, 'other', 'active', 'local-upload', ?, ?)`,
  ).run(id, title, now, now);
}

function insertVersion(id: string, documentId: string, markdown: string) {
  const db = getDb();
  const now = Date.now();
  const contentHash = crypto.createHash("sha256").update(markdown).digest("hex");
  const simhash = simhash48(markdown);
  db.prepare(
    `INSERT INTO document_versions
       (id, document_id, version_no, original_sha256, original_filename, original_mime, original_bytes,
        markdown, content_hash, simhash, created_at)
     VALUES (?, ?, 1, ?, 'x.docx', 'application/octet-stream', 10, ?, ?, ?, ?)`,
  ).run(id, documentId, crypto.randomUUID(), markdown, contentHash, simhash, now);
  db.prepare(`UPDATE documents SET current_version_id = ? WHERE id = ?`).run(id, documentId);
}

function seed() {
  // doc-a: 出張旅費規程 オリジナル
  insertDoc("doc-a", "出張旅費規程");
  insertVersion("ver-a", "doc-a", REGULATION_TEXT);

  // doc-b: 全く同じ内容（別ファイルとしてアップロードされた想定） → content_hash 一致
  insertDoc("doc-b", "出張旅費規程（コピー）");
  insertVersion("ver-b", "doc-b", REGULATION_TEXT);

  // doc-c: 無関係の文書
  insertDoc("doc-c", "情報セキュリティ方針");
  insertVersion("ver-c", "doc-c", UNRELATED_TEXT);
}

before(() => {
  runMigrations();
  seed();
});

after(() => {
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

test("content_hash が一致する文書は exact_dup として検出される", () => {
  const candidates = findDuplicateCandidates("ver-b");
  const exact = candidates.find((c) => c.otherVersionId === "ver-a");
  assert.ok(exact, "doc-a との重複が検出されるはず");
  assert.equal(exact!.kind, "exact_dup");
  assert.equal(exact!.score, 1);
});

test("無関係な文書とは重複候補にならない", () => {
  const candidates = findDuplicateCandidates("ver-c");
  assert.equal(candidates.length, 0);
});

test("わずかに改訂された版は near_dup 候補として検出される", () => {
  insertDoc("doc-d", "出張旅費規程（改訂版）");
  insertVersion("ver-d", "doc-d", REGULATION_TEXT_REVISED);

  const candidates = findDuplicateCandidates("ver-d");
  const found = candidates.find((c) => c.otherVersionId === "ver-a" || c.otherVersionId === "ver-b");
  assert.ok(found, `近似重複が検出されるはず: ${JSON.stringify(candidates)}`);
  assert.notEqual(found!.kind, "exact_dup");
});

test("runDedupeScanForVersion は document_relations に保存する", () => {
  const db = getDb();
  runDedupeScanForVersion("ver-b");
  const rows = db
    .prepare(`SELECT kind, status FROM document_relations WHERE a_version_id = ? OR b_version_id = ?`)
    .all("ver-b", "ver-b") as Array<{ kind: string; status: string }>;
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.status === "open"));
});

test("同一ペアを2回スキャンしても行が重複しない（UPSERT）", () => {
  const db = getDb();
  runDedupeScanForVersion("ver-b");
  runDedupeScanForVersion("ver-b");
  const rows = db
    .prepare(
      `SELECT COUNT(*) as c FROM document_relations WHERE (a_version_id = ? OR b_version_id = ?) AND kind = 'exact_dup'`,
    )
    .get("ver-b", "ver-b") as { c: number };
  assert.equal(rows.c, 1);
});
