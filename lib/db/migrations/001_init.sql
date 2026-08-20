-- CogniKeep 初期スキーマ（M1）
--
-- 日時は epoch ミリ秒の INTEGER。JSON を持つ列は TEXT に格納し json_extract() で引く。
-- ID は ulid（時系列ソート可能な文字列）。

PRAGMA foreign_keys = ON;

-- ---------- マスタ ----------

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_ai_proposed INTEGER NOT NULL DEFAULT 0,
  UNIQUE(parent_id, name)
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  department TEXT
);

-- ---------- 文書 ----------

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  doc_type TEXT NOT NULL DEFAULT 'other',
    -- regulation | manual | contract | minutes | report | slide | sheet | other
  owner_person_id TEXT REFERENCES people(id),
  department TEXT,
  current_version_id TEXT,
    -- document_versions への参照。作成順序の都合上 FK は張らない（循環になるため）
  status TEXT NOT NULL DEFAULT 'active',
    -- active | superseded | archived
  effective_date INTEGER,
  review_interval_days INTEGER,
  review_due_at INTEGER,
  last_reviewed_at INTEGER,
  freshness_score REAL,
  connector TEXT NOT NULL DEFAULT 'local-upload',
    -- local-upload | sharepoint | onedrive
  external_id TEXT,
    -- 外部コネクタ上の一意 ID（Graph の driveItem.id 等）。ID で追跡し、パス/名前では追跡しない
  external_ref TEXT,
    -- JSON: {driveId, webUrl, path}
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX ix_documents_external ON documents(connector, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX ix_documents_review ON documents(review_due_at);
CREATE INDEX ix_documents_category ON documents(category_id, status);
CREATE INDEX ix_documents_status ON documents(status);

CREATE TABLE document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  original_sha256 TEXT NOT NULL,
    -- storage/blobs/<sha256[0:2]>/<sha256> のキー
  original_filename TEXT NOT NULL,
  original_mime TEXT NOT NULL,
  original_bytes INTEGER NOT NULL,
  page_count INTEGER,
  sheet_names TEXT,
    -- JSON配列
  markdown TEXT,
  frontmatter TEXT,
    -- JSON
  content_hash TEXT,
    -- 正規化後 Markdown 本文の sha256（内容の一致判定。異なる形式でも同一内容なら一致）
  simhash INTEGER,
    -- 64bit SimHash（重複検知用）。SQLite の INTEGER は 64bit 符号付きなのでそのまま格納
  conversion_engine TEXT,
    -- 'local:mammoth+turndown' | 'local:exceljs' | 'local:officeparser' | 'local:unpdf' | 'claude:claude-opus-5'
  conversion_confidence REAL,
  conversion_metrics TEXT,
    -- JSON: 品質ゲート8指標
  conversion_model TEXT,
  conversion_cost_usd REAL,
  external_sent INTEGER NOT NULL DEFAULT 0,
    -- 外部APIに送信したか（監査・UI表示用）
  converted_at INTEGER,
  source_etag TEXT,
  source_modified_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(document_id, version_no)
);

CREATE INDEX ix_versions_document ON document_versions(document_id);
CREATE INDEX ix_versions_sha ON document_versions(original_sha256);
CREATE INDEX ix_versions_content_hash ON document_versions(content_hash);

-- ---------- チャンク ----------

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
    -- INTEGER PRIMARY KEY = SQLite の rowid。chunk_fts の rowid と対応させるため明示的に INTEGER にする
  version_id TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  heading_path TEXT,
    -- "3. 経費精算 > 3.2 出張旅費"
  heading_anchor TEXT,
    -- "h-3-2"（検索結果からのアンカースクロール用）
  page_from INTEGER,
  page_to INTEGER,
  sheet_name TEXT,
  text TEXT NOT NULL,
    -- 原文。ハイライト・スニペット生成はこれに対して行う（FTS 索引列は分かち書き済みで別物）
  text_segmented TEXT NOT NULL,
    -- lib/search/segment.ts の tokenize() 出力
  char_count INTEGER NOT NULL,
  embedding BLOB
    -- M2 まで NULL。Float32Array を BLOB で格納
);

CREATE INDEX ix_chunks_version ON chunks(version_id, ordinal);
CREATE INDEX ix_chunks_document ON chunks(document_id);

-- FTS5: 分かち書き済み列を投入する。tokenize='unicode61' はホワイトスペース区切りの
-- トークンをそのままインデックスする（日本語の形態素解析は lib/search/segment.ts が
-- 索引前に行う）。content='' + contentless_delete=1 で本文を二重保持せず、
-- 通常の DELETE がそのまま効く（SQLite 3.43+、この環境の 3.53.1 で動作確認済み）。
CREATE VIRTUAL TABLE chunk_fts USING fts5(
  title_seg,
  heading_seg,
  body_seg,
  tokenize = 'unicode61 remove_diacritics 0',
  content = '',
  contentless_delete = 1
);

-- ---------- 統治 ----------

CREATE TABLE document_relations (
  id TEXT PRIMARY KEY,
  a_version_id TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  b_version_id TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
    -- exact_dup | near_dup | contained_in | similar | revision_of
  score REAL NOT NULL,
  evidence TEXT,
    -- JSON: {jaccard, containment, hamming, title_sim, judge}
  ai_verdict TEXT,
    -- JSON: Claude の classify_relation 結果
  status TEXT NOT NULL DEFAULT 'open',
    -- open | dismissed | merged
  detected_at INTEGER NOT NULL,
  UNIQUE(a_version_id, b_version_id, kind)
);

CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
    -- contradiction | stale | orphan | term_drift
  severity TEXT NOT NULL,
    -- high | medium | low
  title TEXT NOT NULL,
  summary TEXT,
  document_ids TEXT NOT NULL,
    -- JSON配列
  version_ids TEXT NOT NULL,
  detail TEXT,
    -- JSON: {claim_a, claim_b, kind, ...}
  citations TEXT,
    -- JSON: [{version_id, page, cited_text}]
  confidence REAL,
  model TEXT,
  cost_usd REAL,
  status TEXT NOT NULL DEFAULT 'open',
    -- open | acknowledged | resolved | false_positive
  detected_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX ix_findings_status ON findings(status, severity);

CREATE TABLE contradiction_pairs_checked (
  a_chunk_id INTEGER NOT NULL,
  b_chunk_id INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  result TEXT NOT NULL,
  PRIMARY KEY (a_chunk_id, b_chunk_id)
);

CREATE TABLE review_events (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES people(id),
  action TEXT NOT NULL,
    -- reviewed | extended | archived | owner_assigned
  note TEXT,
  at INTEGER NOT NULL
);

CREATE INDEX ix_review_events_document ON review_events(document_id);

-- ---------- 運用 ----------

CREATE TABLE ingest_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
    -- ingest | convert | reindex | dedupe_scan | contradiction_scan | sync
  payload TEXT NOT NULL,
    -- JSON
  status TEXT NOT NULL DEFAULT 'queued',
    -- queued | running | succeeded | failed
  progress REAL NOT NULL DEFAULT 0,
  message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);

CREATE INDEX ix_jobs_status ON ingest_jobs(status, created_at);

CREATE TABLE connector_state (
  id TEXT PRIMARY KEY,
  connector TEXT NOT NULL,
    -- local-upload | sharepoint | onedrive
  scope_key TEXT NOT NULL,
    -- 'driveId:itemId' 等
  cursor TEXT,
    -- Graph の @odata.deltaLink をそのまま格納
  config TEXT,
    -- JSON: {include_globs, exclude_globs, default_category_id}
  last_synced_at INTEGER,
  UNIQUE(connector, scope_key)
);
