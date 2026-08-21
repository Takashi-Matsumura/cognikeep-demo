// ローカル埋め込みプロバイダ（bge-m3、この環境の常駐 llama.cpp サーバ）。
//
// BGE-M3 は BGE 旧世代と異なり、検索クエリ側に特別な instruction プレフィックス
// を付けなくても dense retrieval に使える設計なので、文書側・クエリ側とも
// 同じ embed() をそのまま使う（公式ドキュメント上の推奨に準拠）。

export interface EmbeddingProvider {
  readonly dims: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

interface EmbeddingsResponse {
  data: Array<{ index: number; embedding: number[] }>;
}

class LlamaCppEmbeddingProvider implements EmbeddingProvider {
  readonly dims: number;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string, model: string, dims: number) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.dims = dims;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`埋め込みサーバがエラーを返しました (${res.status}): ${text}`);
    }
    const data = (await res.json()) as EmbeddingsResponse;
    return [...data.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => Float32Array.from(d.embedding));
  }
}

const EMBED_URL = process.env.LLAMACPP_EMBED_URL ?? "http://localhost:8082";
const EMBED_MODEL = process.env.LLAMACPP_EMBED_MODEL ?? "bbvch-ai/bge-m3-GGUF";
const EMBED_DIMS = Number(process.env.LLAMACPP_EMBED_DIMS ?? 1024);

let provider: EmbeddingProvider | undefined;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!provider) {
    provider = new LlamaCppEmbeddingProvider(EMBED_URL, EMBED_MODEL, EMBED_DIMS);
  }
  return provider;
}

export const EMBED_ENDPOINT = EMBED_URL;

/** Float32Array <-> BLOB（node:sqlite の BLOB 列に格納する形式）の相互変換 */
export function encodeEmbedding(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function decodeEmbedding(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
