import type {
  LlmProvider,
  VisionLlmProvider,
  TextCompletionParams,
  JsonCompletionParams,
  VisionCompletionParams,
} from "./types.ts";
import { LlmError } from "./types.ts";

const DEFAULT_MAX_TOKENS = 4000;

interface ChatMessage {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

interface ChatCompletionResponse {
  choices: Array<{
    finish_reason: string;
    message: { role: string; content: string; reasoning_content?: string };
  }>;
  usage: { completion_tokens: number; prompt_tokens: number; total_tokens: number };
}

/**
 * llama.cpp サーバ（llama-server）向けクライアント。OpenAI 互換の
 * /v1/chat/completions を素の fetch で叩く。専用 SDK は使わない
 * （エンドポイントが1つだけなので薄いラッパで十分）。
 *
 * 実測でわかった重要な癖:
 * - Gemma 系はデフォルトで長大な reasoning_content を吐き、そのぶん
 *   max_tokens を消費して肝心の content が空のまま finish_reason:"length"
 *   になることがある。`chat_template_kwargs: { enable_thinking: false }`
 *   で reasoning を止められる（実測: 応答が3トークンまで短縮）。
 * - `response_format: { type: "json_schema", json_schema: { strict: true, ... } }`
 *   はスキーマ通りの JSON を確実に返す（実測確認済み）。
 */
export class LlamaCppProvider implements LlmProvider, VisionLlmProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  /** ビジョンモデル（Qwen3VL 等）は thinking パラメータ自体を受け付けないことがあるため分ける */
  private readonly supportsThinkingToggle: boolean;

  constructor(baseUrl: string, model: string, supportsThinkingToggle: boolean = true) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.supportsThinkingToggle = supportsThinkingToggle;
  }

  private async chatCompletion(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, ...body }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LlmError(`llama.cpp サーバがエラーを返しました (${res.status}): ${text}`, this.baseUrl);
    }
    return (await res.json()) as ChatCompletionResponse;
  }

  private buildMessages(system: string | undefined, userContent: ChatMessage["content"]): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: userContent });
    return messages;
  }

  async completeText({ system, prompt, maxTokens }: TextCompletionParams): Promise<string> {
    const data = await this.chatCompletion({
      messages: this.buildMessages(system, prompt),
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(this.supportsThinkingToggle ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    });
    return this.extractContent(data);
  }

  async completeJson<T>({ system, prompt, schema, maxTokens }: JsonCompletionParams): Promise<T> {
    const data = await this.chatCompletion({
      messages: this.buildMessages(system, prompt),
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(this.supportsThinkingToggle ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      response_format: {
        type: "json_schema",
        json_schema: { name: schema.name, strict: true, schema: schema.schema },
      },
    });
    const content = this.extractContent(data);
    try {
      return JSON.parse(content) as T;
    } catch (err) {
      throw new LlmError(
        `LLM の JSON 出力が壊れています: ${(err as Error).message} / content=${content.slice(0, 500)}`,
        this.baseUrl,
      );
    }
  }

  async completeVision({ system, prompt, images, maxTokens }: VisionCompletionParams): Promise<string> {
    const content: ChatMessage["content"] = [
      { type: "text", text: prompt },
      ...images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/png;base64,${img.toString("base64")}` },
      })),
    ];
    const data = await this.chatCompletion({
      messages: this.buildMessages(system, content),
      max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
    });
    return this.extractContent(data);
  }

  private extractContent(data: ChatCompletionResponse): string {
    const choice = data.choices[0];
    if (!choice) throw new LlmError("LLM から choices が返りませんでした", this.baseUrl);
    if (choice.finish_reason === "length" && !choice.message.content) {
      throw new LlmError(
        "reasoning だけで max_tokens を使い切り、本文が生成されませんでした。maxTokens を増やしてください。",
        this.baseUrl,
      );
    }
    return choice.message.content;
  }
}
