import { getDb } from "../client.ts";

export interface CategoryTreeNode {
  id: string;
  name: string;
  path: string;
  isAiProposed: boolean;
  documentCount: number;
  children: CategoryTreeNode[];
}

interface CategoryRow {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
  isAiProposed: number;
  documentCount: number;
}

export function listCategoryTree(): CategoryTreeNode[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id as id, c.parent_id as parentId, c.name as name, c.path as path,
              c.sort_order as sortOrder, c.is_ai_proposed as isAiProposed,
              (SELECT COUNT(*) FROM documents d WHERE d.category_id = c.id AND d.status != 'archived') as documentCount
       FROM categories c
       ORDER BY c.sort_order`,
    )
    .all() as unknown as CategoryRow[];

  const byId = new Map<string, CategoryTreeNode>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      path: r.path,
      isAiProposed: !!r.isAiProposed,
      documentCount: r.documentCount,
      children: [],
    });
  }
  const roots: CategoryTreeNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parentId && byId.has(r.parentId)) {
      byId.get(r.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function getCategoryStats(): { totalCategories: number; uncategorizedCount: number } {
  const db = getDb();
  const totalCategories = (
    db.prepare(`SELECT COUNT(*) as c FROM categories`).get() as { c: number }
  ).c;
  const uncategorizedCount = (
    db
      .prepare(`SELECT COUNT(*) as c FROM documents WHERE status != 'archived' AND category_id IS NULL`)
      .get() as { c: number }
  ).c;
  return { totalCategories, uncategorizedCount };
}
