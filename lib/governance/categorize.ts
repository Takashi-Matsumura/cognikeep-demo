import { ulid } from "ulid";
import { getDb } from "../db/client.ts";
import { getTextLlm } from "../llm/index.ts";

// カテゴリ体系の AI 再設計（実装計画 §6-A）。
// 現行アプリのカテゴリ分類は引き継がず、全文書の内容から体系ごと
// 提案させる。「フォルダ分けでは届かなかった分類ができる」ことをそのまま
// デモの見せ場にする。

const FALLBACK_CATEGORY_NAME = "その他";

interface ProposedCategory {
  name: string;
  description?: string;
  children?: Array<{ name: string; description?: string }>;
}

interface ProposeCategoriesResult {
  categories: ProposedCategory[];
}

const PROPOSE_SCHEMA = {
  name: "category_taxonomy",
  schema: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        minItems: 3,
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            children: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                },
                required: ["name", "description"],
                additionalProperties: false,
              },
            },
          },
          required: ["name", "description", "children"],
          additionalProperties: false,
        },
      },
    },
    required: ["categories"],
    additionalProperties: false,
  },
} as const;

interface DocSummaryRow {
  id: string;
  title: string;
  docType: string;
  headingPaths: string | null; // GROUP_CONCAT
}

function summarizeDocuments(): DocSummaryRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT d.id as id, d.title as title, d.doc_type as docType,
              (SELECT GROUP_CONCAT(DISTINCT c.heading_path) FROM chunks c
                WHERE c.document_id = d.id AND c.heading_path IS NOT NULL) as headingPaths
       FROM documents d
       WHERE d.status != 'archived'
         AND d.current_version_id IS NOT NULL`,
    )
    .all() as unknown as DocSummaryRow[];
}

function buildDocumentListText(docs: DocSummaryRow[]): string {
  return docs
    .map((d) => {
      const headings = d.headingPaths ? d.headingPaths.split(",").slice(0, 5).join(" / ") : "";
      return `- ${d.title}（種別: ${d.docType}）${headings ? ` 見出し: ${headings}` : ""}`;
    })
    .join("\n");
}

/**
 * 全文書のタイトル・種別・見出しから、実務で使いやすい2階層のカテゴリ体系を
 * 1回の LLM 呼び出しで提案させ、categories テーブルに is_ai_proposed=1 で
 * 保存する。再実行すると既存の AI 提案カテゴリを置き換える
 * （人が手で作ったカテゴリ = is_ai_proposed=0 は保持する）。
 */
export async function proposeCategories(): Promise<{ proposedCount: number }> {
  const docs = summarizeDocuments();
  if (docs.length === 0) {
    throw new Error("カテゴリを提案する対象の文書がありません");
  }

  const llm = getTextLlm();
  const result = await llm.completeJson<ProposeCategoriesResult>({
    system:
      "あなたは社内文書の分類設計者です。与えられた文書一覧（タイトル・種別・見出し）の傾向から、" +
      "実務で使いやすい2階層のカテゴリ体系を提案してください。大分類は5〜10個程度、" +
      "各大分類に2〜5個の小分類を目安にしてください。フォルダ名の言い換えではなく、" +
      "実際の業務で探しやすい切り口（部門・目的・文書性質など）で設計してください。" +
      `最後に、どの小分類にも当てはまらない文書の受け皿として「${FALLBACK_CATEGORY_NAME}」を` +
      "大分類として必ず1つ含めてください（小分類は空でよい）。",
    prompt: `以下は社内文書 ${docs.length} 件の一覧です。\n\n${buildDocumentListText(docs)}`,
    schema: PROPOSE_SCHEMA,
    maxTokens: 6000,
  });

  if (!result.categories.some((c) => c.name === FALLBACK_CATEGORY_NAME)) {
    result.categories.push({ name: FALLBACK_CATEGORY_NAME, description: "他に当てはまらない文書" });
  }

  const db = getDb();

  db.exec("BEGIN");
  try {
    // 既存の AI 提案カテゴリのみ削除（手動作成分は残す）。
    // 該当カテゴリを参照している documents.category_id は自動的に NULL になる
    // （このプロジェクトの SQLite は外部キー制約に ON DELETE 指定がない列のため
    // 明示的にクリアする）。
    const aiProposedIds = db
      .prepare(`SELECT id FROM categories WHERE is_ai_proposed = 1`)
      .all() as Array<{ id: string }>;
    if (aiProposedIds.length > 0) {
      const placeholders = aiProposedIds.map(() => "?").join(",");
      db.prepare(`UPDATE documents SET category_id = NULL WHERE category_id IN (${placeholders})`).run(
        ...aiProposedIds.map((r) => r.id),
      );
      db.prepare(`DELETE FROM categories WHERE is_ai_proposed = 1`).run();
    }

    const insertCategory = db.prepare(
      `INSERT INTO categories (id, parent_id, name, path, sort_order, is_ai_proposed) VALUES (?,?,?,?,?,1)`,
    );

    let proposedCount = 0;
    result.categories.forEach((top, topIndex) => {
      const topId = ulid();
      insertCategory.run(topId, null, top.name, top.name, topIndex);
      proposedCount++;
      (top.children ?? []).forEach((child, childIndex) => {
        const childId = ulid();
        insertCategory.run(childId, topId, child.name, `${top.name} > ${child.name}`, childIndex);
        proposedCount++;
      });
    });

    db.exec("COMMIT");
    return { proposedCount };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

interface CategoryRow {
  id: string;
  path: string;
}

const CLASSIFY_SCHEMA = {
  name: "classification",
  schema: {
    type: "object",
    properties: {
      categoryPath: { type: "string" },
    },
    required: ["categoryPath"],
    additionalProperties: false,
  },
} as const;

/** 1文書をカテゴリ体系のどれか1つに分類する。該当が薄ければ「その他」系に倒れる想定。 */
export async function classifyDocument(documentId: string): Promise<string | null> {
  const db = getDb();
  const doc = db
    .prepare(
      `SELECT d.id as id, d.title as title, d.doc_type as docType,
              (SELECT GROUP_CONCAT(DISTINCT c.heading_path) FROM chunks c
                WHERE c.document_id = d.id AND c.heading_path IS NOT NULL) as headingPaths
       FROM documents d WHERE d.id = ?`,
    )
    .get(documentId) as DocSummaryRow | undefined;
  if (!doc) throw new Error(`document not found: ${documentId}`);

  const categories = db
    .prepare(`SELECT id, path FROM categories ORDER BY path`)
    .all() as unknown as CategoryRow[];
  if (categories.length === 0) return null;

  const categoryListText = categories.map((c) => `- ${c.path}`).join("\n");
  const headings = doc.headingPaths ? doc.headingPaths.split(",").slice(0, 8).join(" / ") : "";

  const llm = getTextLlm();
  const result = await llm.completeJson<{ categoryPath: string }>({
    system:
      "あなたは文書分類の担当者です。与えられたカテゴリ体系の中から、この文書に最も適切な" +
      `カテゴリを1つだけ選び、そのパスを正確に（一字一句違わず）返してください。` +
      `迷ったら「${FALLBACK_CATEGORY_NAME}」を選んでください。`,
    prompt: `# カテゴリ体系\n${categoryListText}\n\n# 分類対象の文書\nタイトル: ${doc.title}\n種別: ${doc.docType}\n見出し: ${headings || "(なし)"}`,
    schema: CLASSIFY_SCHEMA,
    maxTokens: 1500,
  });

  const matched = categories.find((c) => c.path === result.categoryPath.trim());
  const categoryId = matched?.id ?? null;
  db.prepare(`UPDATE documents SET category_id = ?, updated_at = ? WHERE id = ?`).run(
    categoryId,
    Date.now(),
    documentId,
  );
  return categoryId;
}

export function listUncategorizedDocumentIds(): string[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT id FROM documents WHERE status != 'archived' AND category_id IS NULL`)
      .all() as Array<{ id: string }>
  ).map((r) => r.id);
}
