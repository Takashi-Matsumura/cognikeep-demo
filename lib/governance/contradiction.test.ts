import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cognikeep-contradiction-")), "test.db");
process.env.COGNIKEEP_DB_PATH = tmpDbPath;

const { getDb } = await import("../db/client.ts");
const { runMigrations } = await import("../db/migrate.ts");
const { isLlmAvailable, LLM_ENDPOINTS } = await import("../llm/index.ts");
const { findContradictionCandidates, runContradictionScan } = await import("./contradiction.ts");

const textAvailable = await isLlmAvailable(LLM_ENDPOINTS.textUrl);

function insertDoc(id: string, title: string, chunks: Array<{ heading: string; text: string; page: number }>) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO documents (id, title, doc_type, status, connector, created_at, updated_at)
     VALUES (?, ?, 'regulation', 'active', 'local-upload', ?, ?)`,
  ).run(id, title, now, now);

  const versionId = `${id}-v1`;
  db.prepare(
    `INSERT INTO document_versions (id, document_id, version_no, original_sha256, original_filename, original_mime, original_bytes, created_at)
     VALUES (?, ?, 1, ?, 'x.docx', 'application/octet-stream', 10, ?)`,
  ).run(versionId, id, `${id}-sha`, now);
  db.prepare(`UPDATE documents SET current_version_id = ? WHERE id = ?`).run(versionId, id);

  chunks.forEach((c, i) => {
    db.prepare(
      `INSERT INTO chunks (version_id, document_id, ordinal, heading_path, page_from, text, text_segmented, char_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(versionId, id, i, c.heading, c.page, c.text, c.text, c.text.length);
  });
}

before(() => {
  runMigrations();

  // 明確に矛盾する2文書（出張日当の金額が違う）
  insertDoc("doc-a", "出張旅費規程", [
    {
      heading: "出張旅費規程 > 第3条 出張旅費",
      text: "出張時の日当は2,500円とする。宿泊費は実費を精算する。交通費は別途申請すること。",
      page: 3,
    },
  ]);
  insertDoc("doc-b", "出張手続マニュアル", [
    {
      heading: "出張手続マニュアル > 4. 日当の支給",
      text: "出張時の日当は3,000円を支給する。宿泊を伴う場合は宿泊費を実費精算する。",
      page: 4,
    },
  ]);

  // 無関係な文書（候補にすら上がらないはず）
  insertDoc("doc-c", "情報セキュリティ方針", [
    {
      heading: "情報セキュリティ方針 > パスワード管理",
      text: "パスワードは12文字以上とし、90日ごとに変更しなければならない。",
      page: 1,
    },
  ]);
});

after(() => {
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

test("findContradictionCandidates: 同じ話題（出張日当）を扱う別文書のチャンクが候補になる", () => {
  const candidates = findContradictionCandidates();
  const hit = candidates.find(
    (c) =>
      (c.a.documentId === "doc-a" && c.b.documentId === "doc-b") ||
      (c.a.documentId === "doc-b" && c.b.documentId === "doc-a"),
  );
  assert.ok(hit, `候補が見つかるはず: ${JSON.stringify(candidates.map((c) => [c.a.documentId, c.b.documentId]))}`);
});

test("findContradictionCandidates: 無関係な文書（doc-c）は候補にならない", () => {
  const candidates = findContradictionCandidates();
  const involvesC = candidates.some((c) => c.a.documentId === "doc-c" || c.b.documentId === "doc-c");
  assert.equal(involvesC, false);
});

test(
  "runContradictionScan: ローカル LLM が金額の矛盾を検出し findings に保存する",
  { skip: !textAvailable && "text llama.cpp サーバに接続できません" },
  async () => {
    const result = await runContradictionScan(10);
    assert.ok(result.judged > 0, "少なくとも1件は判定されるはず");

    const db = getDb();
    const findings = db
      .prepare(`SELECT title, severity, citations FROM findings WHERE kind = 'contradiction'`)
      .all() as Array<{ title: string; severity: string; citations: string }>;

    assert.ok(findings.length > 0, `矛盾が検出されるはず。judged=${result.judged} found=${result.found}`);
    const citations = JSON.parse(findings[0].citations);
    assert.equal(citations.length, 2);
    assert.ok(citations.every((c: { page: number | null }) => c.page != null));
  },
);
