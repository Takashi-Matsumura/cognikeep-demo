import { ulid } from "ulid";
import { getDb } from "../db/client.ts";
import { getTextLlm } from "../llm/index.ts";
import { shingles, jaccardSimilarity } from "./simhash.ts";

// 矛盾検知（実装計画 §6-D）。全文書総当たりは非現実的なので3段で候補を絞る。
//   段1: 「主張シグナル」（数値・期間・日付・条件語）を含むチャンクだけに絞り、
//        別文書間の shingle Jaccard で「同じ話題を扱っていそうな」候補ペアを作る
//        （embeddings がまだ無いための代替。将来 embeddings が入れば置き換え可能）
//   段2: 候補を Jaccard 降順でハードキャップ（暴走防止）
//   段3: ローカル LLM に構造化判定させる

const JACCARD_CANDIDATE_THRESHOLD = 0.12;
const DEFAULT_MAX_CANDIDATES = 60;

const SIGNAL_PATTERNS: Record<string, RegExp> = {
  numeric: /[0-9０-９,，]+\s*(円|万円|%|％|件|名|人|回)/,
  temporal: /[0-9０-９]+\s*(日|週間|か月|ヶ月|年|営業日)\s*(以内|前|以降|まで)?/,
  date: /(令和|平成|R|H)?[0-9０-９]+年[0-9０-９]+月[0-9０-９]+日/,
  condition: /(以上|以下|未満|超|を除く|に限る|必須|禁止|できない|しなければならない|することができる|原則)/,
};

function hasSignal(text: string): boolean {
  return Object.values(SIGNAL_PATTERNS).some((re) => re.test(text));
}

interface ChunkForScan {
  id: number;
  documentId: string;
  documentTitle: string;
  docType: string;
  versionId: string;
  headingPath: string | null;
  pageFrom: number | null;
  text: string;
}

export interface ContradictionCandidate {
  a: ChunkForScan;
  b: ChunkForScan;
  jaccard: number;
}

function fetchSignalChunks(): ChunkForScan[] {
  const db = getDb();
  const chunks = db
    .prepare(
      `SELECT c.id as id, c.document_id as documentId, d.title as documentTitle, d.doc_type as docType,
              c.version_id as versionId, c.heading_path as headingPath, c.page_from as pageFrom, c.text as text
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE d.status != 'archived'`,
    )
    .all() as unknown as ChunkForScan[];
  return chunks.filter((c) => hasSignal(c.text));
}

/** 段1〜2: 候補ペアを Jaccard 降順で作り、上限件数に絞る */
export function findContradictionCandidates(
  maxCandidates: number = DEFAULT_MAX_CANDIDATES,
): ContradictionCandidate[] {
  const chunks = fetchSignalChunks();
  const shingleSets = chunks.map((c) => new Set(shingles(c.text, 3)));

  const candidates: ContradictionCandidate[] = [];
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      if (chunks[i].documentId === chunks[j].documentId) continue; // 同一文書内は対象外
      const jaccard = jaccardSimilarity(shingleSets[i], shingleSets[j]);
      if (jaccard >= JACCARD_CANDIDATE_THRESHOLD) {
        candidates.push({ a: chunks[i], b: chunks[j], jaccard });
      }
    }
  }

  candidates.sort((x, y) => y.jaccard - x.jaccard);
  return candidates.slice(0, maxCandidates);
}

function alreadyChecked(chunkAId: number, chunkBId: number): boolean {
  const db = getDb();
  const [x, y] = chunkAId < chunkBId ? [chunkAId, chunkBId] : [chunkBId, chunkAId];
  return !!db
    .prepare(`SELECT 1 FROM contradiction_pairs_checked WHERE a_chunk_id = ? AND b_chunk_id = ?`)
    .get(x, y);
}

function markChecked(chunkAId: number, chunkBId: number, result: string): void {
  const db = getDb();
  const [x, y] = chunkAId < chunkBId ? [chunkAId, chunkBId] : [chunkBId, chunkAId];
  db.prepare(
    `INSERT OR REPLACE INTO contradiction_pairs_checked (a_chunk_id, b_chunk_id, checked_at, result)
     VALUES (?, ?, ?, ?)`,
  ).run(x, y, Date.now(), result);
}

const VERDICT_SCHEMA = {
  name: "contradiction_verdict",
  schema: {
    type: "object",
    properties: {
      hasContradiction: { type: "boolean" },
      kind: { type: "string", enum: ["numeric", "temporal", "policy", "scope", "definition", "none"] },
      severity: { type: "string", enum: ["high", "medium", "low"] },
      claimA: { type: "string" },
      claimB: { type: "string" },
      explanation: { type: "string" },
      confidence: { type: "number" },
    },
    required: ["hasContradiction", "kind", "severity", "claimA", "claimB", "explanation", "confidence"],
    additionalProperties: false,
  },
} as const;

interface Verdict {
  hasContradiction: boolean;
  kind: string;
  severity: "high" | "medium" | "low";
  claimA: string;
  claimB: string;
  explanation: string;
  confidence: number;
}

const SYSTEM_PROMPT =
  "あなたは社内規程の整合性監査人です。2つの文書抜粋を比較し、実務上、担当者がどちらに従えばよいか" +
  "判断できなくなる矛盾のみを報告してください。\n" +
  "以下は矛盾ではありません:\n" +
  "- 表現・詳細度の違い\n" +
  "- 適用範囲や対象者が異なる（例: 正社員向けと契約社員向け）\n" +
  "- 一方が他方の下位規定として具体化しているだけ\n" +
  "- 発効日が異なり明らかに新旧関係にある\n" +
  "判断できない場合は hasContradiction=false とし、推測で報告しないでください。";

async function judgeCandidate(candidate: ContradictionCandidate): Promise<Verdict> {
  const llm = getTextLlm();
  const prompt = `# 文書A: ${candidate.a.documentTitle}（${candidate.a.headingPath ?? ""}）
${candidate.a.text}

# 文書B: ${candidate.b.documentTitle}（${candidate.b.headingPath ?? ""}）
${candidate.b.text}`;

  return llm.completeJson<Verdict>({
    system: SYSTEM_PROMPT,
    prompt,
    schema: VERDICT_SCHEMA,
    maxTokens: 3000,
  });
}

function saveFinding(candidate: ContradictionCandidate, verdict: Verdict): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO findings
       (id, kind, severity, title, summary, document_ids, version_ids, detail, citations, confidence, model, cost_usd, status, detected_at)
     VALUES (?, 'contradiction', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'open', ?)`,
  ).run(
    ulid(),
    verdict.severity,
    `${candidate.a.documentTitle} と ${candidate.b.documentTitle} の記載に矛盾の疑い`,
    verdict.explanation,
    JSON.stringify([candidate.a.documentId, candidate.b.documentId]),
    JSON.stringify([candidate.a.versionId, candidate.b.versionId]),
    JSON.stringify({ kind: verdict.kind, claimA: verdict.claimA, claimB: verdict.claimB }),
    JSON.stringify([
      {
        documentId: candidate.a.documentId,
        versionId: candidate.a.versionId,
        page: candidate.a.pageFrom,
        headingPath: candidate.a.headingPath,
        text: verdict.claimA,
      },
      {
        documentId: candidate.b.documentId,
        versionId: candidate.b.versionId,
        page: candidate.b.pageFrom,
        headingPath: candidate.b.headingPath,
        text: verdict.claimB,
      },
    ]),
    verdict.confidence,
    "local-llm:gemma-4-12b",
    Date.now(),
  );
}

export interface ContradictionScanResult {
  candidatesTotal: number;
  judged: number;
  found: number;
}

/**
 * 矛盾検知スキャン本体。候補を作り、既検査ペアをスキップしつつローカル LLM で
 * 判定し、矛盾と判定されたものだけ findings に保存する。
 */
export async function runContradictionScan(
  maxCandidates: number = DEFAULT_MAX_CANDIDATES,
  onProgress?: (done: number, total: number) => void,
): Promise<ContradictionScanResult> {
  const candidates = findContradictionCandidates(maxCandidates).filter(
    (c) => !alreadyChecked(c.a.id, c.b.id),
  );

  let judged = 0;
  let found = 0;

  for (const candidate of candidates) {
    try {
      const verdict = await judgeCandidate(candidate);
      judged++;
      if (verdict.hasContradiction && verdict.confidence >= 0.5) {
        saveFinding(candidate, verdict);
        found++;
        markChecked(candidate.a.id, candidate.b.id, "contradiction");
      } else {
        markChecked(candidate.a.id, candidate.b.id, "no_contradiction");
      }
    } catch (err) {
      console.error(`[contradiction] 判定失敗 (chunk ${candidate.a.id} vs ${candidate.b.id}): ${(err as Error).message}`);
    }
    onProgress?.(judged, candidates.length);
  }

  return { candidatesTotal: candidates.length, judged, found };
}
