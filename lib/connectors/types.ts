// コネクタ抽象化（実装計画 §5, §7）。
//
// 手動アップロードも SharePoint / OneDrive も同じ SourceItem を生成し、
// 以降の取り込みパイプライン（blob 保存 → 版判定 → 変換 → チャンク → 索引）を
// 完全に共通化する、という設計を型として固定する。
//
// M1 では local-upload のみ実装する（lib/ingest.ts が直接扱う、より単純な形で）。
// この型は主に、M2 で ms-graph コネクタを差し込む際に何を実装すればよいかを
// 示す設計ドキュメントとしての役割を持つ。

export interface SourceItem {
  /** コネクタ内で一意な ID。Graph の driveItem.id 等。パス/名前では追跡しない。 */
  externalId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: number;
  etag: string | null;
  webUrl: string | null;
  path: string | null;
  deleted?: boolean;
}

export interface SyncPage {
  items: SourceItem[];
  cursor: string | null;
  done: boolean;
}

export interface SourceConnector {
  readonly id: "local-upload" | "sharepoint" | "onedrive";
  readonly displayName: string;
  isConfigured(): Promise<boolean>;
  /** cursor が null なら全列挙、あれば差分。Graph は @odata.deltaLink をそのまま cursor に載せる想定。 */
  listChanges(scopeKey: string, cursor: string | null): AsyncGenerator<SyncPage>;
  fetchContent(item: SourceItem): Promise<ReadableStream<Uint8Array>>;
}
