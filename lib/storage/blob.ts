import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * 原本ファイルの保管インタフェース。content-addressed（sha256 がキー）にすることで
 * 完全一致の重複検知が保存時点でタダで手に入る。
 *
 * PoC ではローカル FS 実装のみ。後から S3 / Cloudflare R2 に差し替えられるよう
 * インタフェースを切っておく。
 */
export interface BlobStore {
  /** バイト列を保存し、sha256（キー）とバイト数を返す。既存なら書き込みをスキップする */
  put(data: Buffer): Promise<{ sha256: string; bytes: number; isNew: boolean }>;
  /** 保存済みバイト列を読み出す */
  get(sha256: string): Promise<Buffer>;
  /** 保存済みかどうか */
  has(sha256: string): Promise<boolean>;
  /** ダウンロード用の相対 URL（API Route Handler で配信する想定） */
  url(sha256: string): string;
}

function blobPath(baseDir: string, sha256: string): string {
  // <sha256[0:2]>/<sha256[2:4]>/<sha256> にディレクトリを分散し、
  // 数千件規模でも1ディレクトリに大量のファイルが溜まらないようにする
  return path.join(baseDir, sha256.slice(0, 2), sha256.slice(2, 4), sha256);
}

export class LocalBlobStore implements BlobStore {
  constructor(private readonly baseDir: string) {}

  async put(data: Buffer): Promise<{ sha256: string; bytes: number; isNew: boolean }> {
    const sha256 = crypto.createHash("sha256").update(data).digest("hex");
    const filePath = blobPath(this.baseDir, sha256);
    const isNew = !fs.existsSync(filePath);
    if (isNew) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, data);
    }
    return { sha256, bytes: data.byteLength, isNew };
  }

  async get(sha256: string): Promise<Buffer> {
    return fs.promises.readFile(blobPath(this.baseDir, sha256));
  }

  async has(sha256: string): Promise<boolean> {
    return fs.existsSync(blobPath(this.baseDir, sha256));
  }

  url(sha256: string): string {
    return `/api/files/${sha256}`;
  }
}

let store: BlobStore | undefined;

export function getBlobStore(): BlobStore {
  if (!store) {
    const baseDir = path.join(process.cwd(), "storage", "blobs");
    store = new LocalBlobStore(baseDir);
  }
  return store;
}
