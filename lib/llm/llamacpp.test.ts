// 実際に常駐している llama.cpp サーバへの統合テスト。
// このマシン以外（CI 等）ではサーバが立っていないため、疎通確認できなければ
// スキップする（テスト全体を落とさない）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { LlamaCppProvider } from "./llamacpp.ts";
import { isLlmAvailable, LLM_ENDPOINTS } from "./index.ts";

const textAvailable = await isLlmAvailable(LLM_ENDPOINTS.textUrl);
const visionAvailable = await isLlmAvailable(LLM_ENDPOINTS.visionUrl);

test(
  "テキストモデル: completeText が reasoning なしで即座に応答する",
  { skip: !textAvailable && "text llama.cpp サーバに接続できません" },
  async () => {
    const provider = new LlamaCppProvider(LLM_ENDPOINTS.textUrl, "gemma-4-12b-it-Q4_K_M.gguf", true);
    const text = await provider.completeText({
      prompt: "日本語で一言だけ挨拶してください。",
      maxTokens: 300,
    });
    assert.ok(text.length > 0);
  },
);

test(
  "テキストモデル: completeJson は json_schema に沿った構造化データを返す",
  { skip: !textAvailable && "text llama.cpp サーバに接続できません" },
  async () => {
    const provider = new LlamaCppProvider(LLM_ENDPOINTS.textUrl, "gemma-4-12b-it-Q4_K_M.gguf", true);
    const result = await provider.completeJson<{ tags: string[] }>({
      prompt: "「経費精算規程」というタイトルの社内文書に付けるタグを3つ提案してください。",
      schema: {
        name: "tags",
        schema: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
          },
          required: ["tags"],
          additionalProperties: false,
        },
      },
      maxTokens: 800,
    });
    assert.equal(result.tags.length, 3);
    assert.ok(result.tags.every((t) => typeof t === "string" && t.length > 0));
  },
);

test(
  "ビジョンモデル: completeVision が画像中の日本語テキストを書き起こせる",
  { skip: !visionAvailable && "vision llama.cpp サーバに接続できません" },
  async () => {
    const provider = new LlamaCppProvider(
      LLM_ENDPOINTS.visionUrl,
      "Qwen3VL-8B-Instruct-Q4_K_M.gguf",
      false,
    );

    // 1x1 の白ピクセル PNG（実文書の代わりに疎通確認用の最小画像）
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const text = await provider.completeVision({
      prompt: "この画像に何が写っていますか？一言で答えてください。",
      images: [tinyPng],
      maxTokens: 200,
    });
    assert.ok(typeof text === "string");
  },
);
