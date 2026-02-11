import Anthropic from "@anthropic-ai/sdk";

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
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<LLMResponse> {
  const { maxTokens = 8192, temperature = 0.3 } = options;
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

  return {
    content: textBlock?.text ?? "",
    model: response.model,
    provider: "anthropic",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
  };
}
