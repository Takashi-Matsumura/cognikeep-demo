// AI 変換フォールバック・カテゴリ再設計・矛盾検知が使う LLM を抽象化する。
//
// Claude API ではなく、ユーザー環境に常駐している llama.cpp サーバ
// （テキスト用・画像用の2台）を利用する。将来 Claude などの外部 API に
// 差し替えたくなった場合も、この2つのインタフェースだけを実装すればよい。

export interface JsonSchemaSpec {
  /** スキーマ名（llama.cpp の response_format.json_schema.name） */
  name: string;
  schema: object;
}

export interface TextCompletionParams {
  system?: string;
  prompt: string;
  maxTokens?: number;
}

export interface JsonCompletionParams extends TextCompletionParams {
  schema: JsonSchemaSpec;
}

export interface VisionCompletionParams {
  system?: string;
  prompt: string;
  /** ページ画像等。PNG/JPEG のバイト列 */
  images: Buffer[];
  maxTokens?: number;
}

export interface LlmProvider {
  completeText(params: TextCompletionParams): Promise<string>;
  completeJson<T>(params: JsonCompletionParams): Promise<T>;
}

export interface VisionLlmProvider {
  completeVision(params: VisionCompletionParams): Promise<string>;
}

export class LlmError extends Error {
  readonly endpoint: string;

  constructor(message: string, endpoint: string) {
    super(message);
    this.name = "LlmError";
    this.endpoint = endpoint;
  }
}
