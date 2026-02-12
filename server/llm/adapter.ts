import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../config/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function llmComplete(
  systemPrompt: string,
  userMessage: string,
  options: { maxTokens?: number; temperature?: number; claimId?: string; stage?: string } = {}
): Promise<LLMResponse> {
  const { maxTokens = 8192, temperature = 0.3, claimId, stage } = options;
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const latencyMs = Date.now() - start;
  const textBlock = response.content.find((b) => b.type === "text");

  const result: LLMResponse = {
    content: textBlock?.text ?? "",
    model: response.model,
    provider: "anthropic",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
  };

  if (claimId) {
    const costRate = response.model.includes("haiku") ? 0.00025 : response.model.includes("sonnet") ? 0.003 : 0.005;
    const costUsd = ((result.inputTokens + result.outputTokens) / 1000) * costRate;
    supabase
      .from("claim_llm_usage")
      .insert({
        claim_id: claimId,
        model: response.model,
        stage: stage || "chat_query",
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_usd: Math.round(costUsd * 10000) / 10000,
        latency_ms: latencyMs,
        called_at: new Date().toISOString(),
      })
      .then(() => {});
  }

  return result;
}

/** Alias for enhancement modules that expect callLLM */
export const callLLM = llmComplete;
