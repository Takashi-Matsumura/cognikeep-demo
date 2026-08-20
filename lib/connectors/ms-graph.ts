import type { SourceConnector, SyncPage, SourceItem } from "./types.ts";

/**
 * SharePoint / OneDrive コネクタの骨格（M1 では未実装）。
 *
 * M2 で実装する際の要点（実装計画 §5-B）:
 * - `GET /drives/{driveId}/items/{itemId}/delta` で差分取得し、
 *   末尾の @odata.deltaLink を connector_state.cursor に保存する
 * - 410 Gone（resyncRequired）を必ずハンドルする。deltaLink には公式な TTL がなく
 *   いつでも失効しうるため、cursor を破棄して全列挙し直す再同期パスが必須
 * - 削除は deleted facet で返る → documents.status = 'archived' に反映
 * - 版の判定は eTag + lastModifiedDateTime を document_versions.source_etag と比較
 * - 認証は委任（delegated）フローの Files.Read.All / Sites.Read.All を使う
 *   （管理者同意不要。本番では Sites.Selected + アプリ権限を推奨）
 */
export class MsGraphConnector implements SourceConnector {
  readonly id: "sharepoint" | "onedrive";
  readonly displayName: string;

  constructor(kind: "sharepoint" | "onedrive") {
    this.id = kind;
    this.displayName = kind === "sharepoint" ? "SharePoint" : "OneDrive";
  }

  async isConfigured(): Promise<boolean> {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async *listChanges(scopeKey: string, cursor: string | null): AsyncGenerator<SyncPage> {
    throw new Error(`${this.displayName} コネクタは未実装です（M2 で実装予定）`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchContent(item: SourceItem): Promise<ReadableStream<Uint8Array>> {
    throw new Error(`${this.displayName} コネクタは未実装です（M2 で実装予定）`);
  }
}
