import { LlamaCppProvider } from "./llamacpp.ts";
import type { LlmProvider, VisionLlmProvider } from "./types.ts";

// この環境で常駐している llama.cpp サーバのデフォルト値（実測で確認済み）。
// 環境変数で上書きできるようにしておく。
const TEXT_URL = process.env.LLAMACPP_TEXT_URL ?? "http://localhost:8080";
const TEXT_MODEL = process.env.LLAMACPP_TEXT_MODEL ?? "gemma-4-12b-it-Q4_K_M.gguf";
const VISION_URL = process.env.LLAMACPP_VISION_URL ?? "http://localhost:8084";
const VISION_MODEL = process.env.LLAMACPP_VISION_MODEL ?? "Qwen3VL-8B-Instruct-Q4_K_M.gguf";

let textProvider: LlmProvider | undefined;
let visionProvider: VisionLlmProvider | undefined;

export function getTextLlm(): LlmProvider {
  if (!textProvider) {
    textProvider = new LlamaCppProvider(TEXT_URL, TEXT_MODEL, true);
  }
  return textProvider;
}

export function getVisionLlm(): VisionLlmProvider {
  if (!visionProvider) {
    // Qwen3VL は chat_template_kwargs.enable_thinking を受け付けないため無効化
    visionProvider = new LlamaCppProvider(VISION_URL, VISION_MODEL, false);
  }
  return visionProvider;
}

export async function isLlmAvailable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export const LLM_ENDPOINTS = { textUrl: TEXT_URL, visionUrl: VISION_URL } as const;

export type { LlmProvider, VisionLlmProvider } from "./types.ts";
export { LlmError } from "./types.ts";
