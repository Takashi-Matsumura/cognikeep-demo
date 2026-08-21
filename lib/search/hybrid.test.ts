// hybrid.ts / vector.ts の統合テスト。埋め込みサーバに接続できない環境では
// 自動スキップする。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cognikeep-hybrid-")), "test.db");
process.env.COGNIKEEP_DB_PATH = tmpDbPath;

const { getDb } = await import("../db/client.ts");
const { runMigrations } = await import("../db/migrate.ts");
const { tokenize } = await import("./segment.ts");
const { indexChunk } = await import("./fts.ts");
const { hybridSearch } = await import("./hybrid.ts");
const { semanticSearch, countChunksWithoutEmbedding } = await import("./vector.ts");
const { getEmbeddingProvider, encodeEmbedding } = await import("../llm/embeddings.ts");
const { isLlmAvailable } = await import("../llm/index.ts");

const EMBED_URL = process.env.LLAMACPP_EMBED_URL ?? "http://localhost:8082";
const embedAvailable = await isLlmAvailable(EMBED_URL);

function insertDoc(id: string, title: string, docType = "regulation") {
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
  return versionId;
}

let nextChunkId = 1;
async function insertChunkWithEmbedding(
  documentId: string,
  versionId: string,
  title: string,
  headingPath: string,
  text: string,
) {
  const db = getDb();
  const id = nextChunkId++;
  db.prepare(
    `INSERT INTO chunks (id, version_id, document_id, ordinal, heading_path, text, text_segmented, char_count)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
  ).run(id, versionId, documentId, headingPath, text, tokenize(text), text.length);
  indexChunk({ chunkId: id, title, headingPath, body: text });

  if (embedAvailable) {
    const provider = getEmbeddingProvider();
    const [vec] = await provider.embed([text]);
    db.prepare(`UPDATE chunks SET embedding = ? WHERE id = ?`).run(encodeEmbedding(vec), id);
  }
  return id;
}

before(async () => {
  runMigrations();

  const v1 = insertDoc("doc-a", "出張旅費規程");
  await insertChunkWithEmbedding(
    "doc-a",
    v1,
    "出張旅費規程",
    "出張旅費規程 > 第3条",
    "出張の際に発生する飛行機代や新幹線代などの交通費は、事前申請の上で実費を精算する。",
  );

  const v2 = insertDoc("doc-b", "情報セキュリティ方針");
  await insertChunkWithEmbedding(
    "doc-b",
    v2,
    "情報セキュリティ方針",
    "情報セキュリティ方針 > パスワード管理",
    "パスワードは12文字以上とし、90日ごとに変更しなければならない。",
  );
});

after(() => {
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

test(
  "semanticSearch: クエリと同じ単語を含まなくても意味的に近いチャンクを見つける",
  { skip: !embedAvailable && "embedding llama.cpp サーバに接続できません" },
  async () => {
    // 「交通費」という単語を一切使わず、意味だけが近い言い回しで問い合わせる
    const hits = await semanticSearch("旅費の払い戻しはどう申請する？", 5);
    assert.ok(hits.length > 0);
    assert.equal(hits[0].chunkId, 1, "出張旅費規程のチャンクが最上位に来るはず");
  },
);

test(
  "semanticSearch: 明確に無関係なクエリはスコアが低い",
  { skip: !embedAvailable && "embedding llama.cpp サーバに接続できません" },
  async () => {
    const travelHits = await semanticSearch("交通費の精算方法", 5);
    const securityHits = await semanticSearch("パスワードの変更ルール", 5);
    const travelTop = travelHits.find((h) => h.chunkId === 1)!;
    const securityTop = securityHits.find((h) => h.chunkId === 2)!;
    assert.ok(travelTop.score > 0.3, `travel score too low: ${travelTop.score}`);
    assert.ok(securityTop.score > 0.3, `security score too low: ${securityTop.score}`);
  },
);

test(
  "hybridSearch: キーワード一致と意味的一致の両方をマージして返す",
  { skip: !embedAvailable && "embedding llama.cpp サーバに接続できません" },
  async () => {
    const hits = await hybridSearch("出張旅費の払い戻し申請");
    assert.ok(hits.length > 0);
    const top = hits[0];
    assert.equal(top.documentId, "doc-a");
    assert.ok(top.matchedBy.length > 0);
  },
);

test("hybridSearch: 埋め込みサーバが無くても（あってもキーワード一致は必ず反映される）", async () => {
  const hits = await hybridSearch("パスワード");
  assert.ok(hits.length > 0);
  const keywordHit = hits.find((h) => h.documentId === "doc-b");
  assert.ok(keywordHit, "キーワード一致した doc-b が結果に含まれるはず");
  assert.ok(keywordHit!.matchedBy.includes("keyword"));
});

test("countChunksWithoutEmbedding: 埋め込み未設定チャンクの件数を返す", () => {
  const count = countChunksWithoutEmbedding();
  assert.ok(count >= 0);
  assert.ok(Number.isInteger(count));
});
