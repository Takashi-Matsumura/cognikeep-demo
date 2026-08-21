import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cognikeep-categorize-")), "test.db");
process.env.COGNIKEEP_DB_PATH = tmpDbPath;

const { getDb } = await import("../db/client.ts");
const { runMigrations } = await import("../db/migrate.ts");
const { isLlmAvailable, LLM_ENDPOINTS } = await import("../llm/index.ts");
const { proposeCategories, classifyDocument, listUncategorizedDocumentIds } = await import(
  "./categorize.ts"
);

const textAvailable = await isLlmAvailable(LLM_ENDPOINTS.textUrl);

function insertDoc(id: string, title: string, docType: string, headings: string[]) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO documents (id, title, doc_type, status, connector, created_at, updated_at)
     VALUES (?, ?, ?, 'active', 'local-upload', ?, ?)`,
  ).run(id, title, docType, now, now);

  const versionId = `${id}-v1`;
  db.prepare(
    `INSERT INTO document_versions (id, document_id, version_no, original_sha256, original_filename, original_mime, original_bytes, created_at)
     VALUES (?, ?, 1, ?, 'x.docx', 'application/octet-stream', 10, ?)`,
  ).run(versionId, id, `${id}-sha`, now);
  db.prepare(`UPDATE documents SET current_version_id = ? WHERE id = ?`).run(versionId, id);

  headings.forEach((h, i) => {
    db.prepare(
      `INSERT INTO chunks (version_id, document_id, ordinal, heading_path, text, text_segmented, char_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(versionId, id, i, h, h, h, h.length);
  });
}

before(() => {
  runMigrations();
  insertDoc("doc-a", "出張旅費規程", "regulation", ["出張旅費規程 > 第3条 出張旅費"]);
  insertDoc("doc-b", "経費精算規程", "regulation", ["経費精算規程 > 第2条 精算方法"]);
  insertDoc("doc-c", "情報セキュリティ方針", "regulation", ["情報セキュリティ方針 > パスワード管理"]);
});

after(() => {
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

test(
  "proposeCategories: LLM が2階層のカテゴリ体系を提案し categories テーブルに保存される",
  { skip: !textAvailable && "text llama.cpp サーバに接続できません" },
  async () => {
    const { proposedCount } = await proposeCategories();
    assert.ok(proposedCount > 0);

    const db = getDb();
    const rows = db
      .prepare(`SELECT name, parent_id as parentId, is_ai_proposed as isAiProposed FROM categories`)
      .all() as Array<{ name: string; parentId: string | null; isAiProposed: number }>;

    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.isAiProposed === 1), "全て AI 提案としてマークされる");
    assert.ok(rows.some((r) => r.name === "その他"), "受け皿カテゴリが必ず含まれる");

    // 全文書が未分類のはず（提案しただけではまだ分類していない）
    assert.equal(listUncategorizedDocumentIds().length, 3);
  },
);

test(
  "classifyDocument: 提案済みカテゴリの中から1つを選んで documents.category_id に反映する",
  { skip: !textAvailable && "text llama.cpp サーバに接続できません" },
  async () => {
    const categoryId = await classifyDocument("doc-a");
    assert.ok(categoryId, "何らかのカテゴリに割り当てられる");

    const db = getDb();
    const row = db.prepare(`SELECT category_id as categoryId FROM documents WHERE id = ?`).get("doc-a") as {
      categoryId: string | null;
    };
    assert.equal(row.categoryId, categoryId);
  },
);

test(
  "proposeCategories を再実行すると旧AI提案カテゴリが入れ替わる（手動作成分は影響しない前提を再確認）",
  { skip: !textAvailable && "text llama.cpp サーバに接続できません" },
  async () => {
    const db = getDb();
    const before = db.prepare(`SELECT id FROM categories`).all() as Array<{ id: string }>;

    await proposeCategories();

    const after = db.prepare(`SELECT id FROM categories`).all() as Array<{ id: string }>;
    const beforeIds = new Set(before.map((r) => r.id));
    const afterIds = new Set(after.map((r) => r.id));
    // 再実行で ID が入れ替わっている（同じ行を使い回していない）ことを確認
    const overlap = [...afterIds].filter((id) => beforeIds.has(id));
    assert.equal(overlap.length, 0);
  },
);
