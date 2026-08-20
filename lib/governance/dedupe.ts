import { ulid } from "ulid";
import { getDb } from "../db/client.ts";
import { shingles, hammingDistance48, jaccardSimilarity, containment } from "./simhash.ts";

// 重複・類似検知は「安い順」に判定する（実装計画 §6-C）。
//   段1  original_sha256 一致        → ingestLocalUpload が保存時点で吸収済み（新規重複なし）
//   段1' content_hash 一致           → 別形式でも中身が同じ（PDF と Word 等）
//   段2  SimHash ハミング距離が近い  → 近似重複・版違いの候補
//   段3  Jaccard / Containment       → 候補を near_dup / contained_in に分類
//   段4  Claude 判定                 → M3。ここでは候補を残すところまで

const HAMMING_CANDIDATE_THRESHOLD = 8; // 48bit 中 8bit 以内の違いなら候補とする
const CONTAINMENT_REVISION_THRESHOLD = 0.85; // 片方がほぼ包含されていれば「版違い」とみなす

export type RelationKind = "exact_dup" | "near_dup" | "contained_in";

export interface DuplicateCandidate {
  otherVersionId: string;
  otherDocumentId: string;
  kind: RelationKind;
  score: number;
  evidence: Record<string, unknown>;
}

interface VersionForCompare {
  id: string;
  document_id: string;
  content_hash: string | null;
  simhash: number | null;
  markdown: string | null;
}

/**
 * 新しく変換が終わった版について、他文書の「現行版」とだけ比較して
 * 重複・類似候補を探す。同一文書内の旧版とは比較しない（それは版差分の役割）。
 */
export function findDuplicateCandidates(newVersionId: string): DuplicateCandidate[] {
  const db = getDb();
  const newVersion = db
    .prepare(
      `SELECT id, document_id, content_hash, simhash, markdown FROM document_versions WHERE id = ?`,
    )
    .get(newVersionId) as unknown as VersionForCompare | undefined;
  if (!newVersion || !newVersion.markdown) return [];

  const others = db
    .prepare(
      `SELECT v.id, v.document_id, v.content_hash, v.simhash, v.markdown
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id AND d.current_version_id = v.id
       WHERE v.document_id != ? AND v.markdown IS NOT NULL AND d.status != 'archived'`,
    )
    .all(newVersion.document_id) as unknown as VersionForCompare[];

  if (others.length === 0) return [];

  const newShingleSet = new Set(shingles(newVersion.markdown));
  const candidates: DuplicateCandidate[] = [];

  for (const other of others) {
    if (newVersion.content_hash && other.content_hash === newVersion.content_hash) {
      candidates.push({
        otherVersionId: other.id,
        otherDocumentId: other.document_id,
        kind: "exact_dup",
        score: 1,
        evidence: { method: "content_hash" },
      });
      continue;
    }

    if (newVersion.simhash == null || other.simhash == null || !other.markdown) continue;

    const hamming = hammingDistance48(newVersion.simhash, other.simhash);
    if (hamming > HAMMING_CANDIDATE_THRESHOLD) continue;

    const otherShingleSet = new Set(shingles(other.markdown));
    const jaccard = jaccardSimilarity(newShingleSet, otherShingleSet);
    const cont = containment(newShingleSet, otherShingleSet);
    const kind: RelationKind = cont >= CONTAINMENT_REVISION_THRESHOLD ? "contained_in" : "near_dup";

    candidates.push({
      otherVersionId: other.id,
      otherDocumentId: other.document_id,
      kind,
      score: kind === "contained_in" ? cont : jaccard,
      evidence: { method: "simhash", hamming, jaccard, containment: cont },
    });
  }

  return candidates;
}

export function saveDuplicateRelations(versionId: string, candidates: DuplicateCandidate[]): void {
  if (candidates.length === 0) return;
  const db = getDb();
  const now = Date.now();

  const upsert = db.prepare(`
    INSERT INTO document_relations (id, a_version_id, b_version_id, kind, score, evidence, status, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
    ON CONFLICT(a_version_id, b_version_id, kind) DO UPDATE SET
      score = excluded.score, evidence = excluded.evidence, detected_at = excluded.detected_at
  `);

  for (const c of candidates) {
    // UNIQUE(a_version_id, b_version_id, kind) 制約に対して対称ペアを正規化する
    const [a, b] = [versionId, c.otherVersionId].sort();
    upsert.run(ulid(), a, b, c.kind, c.score, JSON.stringify(c.evidence), now);
  }
}

export function runDedupeScanForVersion(versionId: string): DuplicateCandidate[] {
  const candidates = findDuplicateCandidates(versionId);
  saveDuplicateRelations(versionId, candidates);
  return candidates;
}
