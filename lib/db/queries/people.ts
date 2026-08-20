import { ulid } from "ulid";
import { getDb } from "../client.ts";

export interface PersonRow {
  id: string;
  displayName: string;
  email: string | null;
  department: string | null;
}

export function listPeople(): PersonRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT id, display_name as displayName, email, department FROM people ORDER BY display_name`)
    .all() as unknown as PersonRow[];
}

/** 名前で人物を探し、無ければ作る。PoC では認証を持たないので、名前をキーにした簡易マスタとして扱う。 */
export function findOrCreatePersonByName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("オーナー名が空です");

  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM people WHERE display_name = ? LIMIT 1`)
    .get(trimmed) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = ulid();
  db.prepare(`INSERT INTO people (id, display_name) VALUES (?, ?)`).run(id, trimmed);
  return id;
}
