/** Model pricing per million tokens (USD) — updated April 2026 */

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheCreationPerMillion: number;
  cacheReadPerMillion: number;
  contextWindow: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4-6": {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.50,
    contextWindow: 200_000,
  },
  "claude-sonnet-4-6": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.30,
    contextWindow: 200_000,
  },
  "claude-haiku-4-5-20251001": {
    inputPerMillion: 0.80,
    outputPerMillion: 4,
    cacheCreationPerMillion: 1,
    cacheReadPerMillion: 0.08,
    contextWindow: 200_000,
  },
  // Legacy Anthropic
  "claude-sonnet-4-20250514": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.30,
    contextWindow: 200_000,
  },
  "claude-opus-4-20250514": {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.50,
    contextWindow: 200_000,
  },
  // OpenAI
  "gpt-4o": {
    inputPerMillion: 2.50,
    outputPerMillion: 10,
    cacheCreationPerMillion: 2.50,
    cacheReadPerMillion: 1.25,
    contextWindow: 128_000,
  },
  "gpt-4o-mini": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
    cacheCreationPerMillion: 0.15,
    cacheReadPerMillion: 0.075,
    contextWindow: 128_000,
  },
  "o1": {
    inputPerMillion: 15,
    outputPerMillion: 60,
    cacheCreationPerMillion: 15,
    cacheReadPerMillion: 7.50,
    contextWindow: 200_000,
  },
  // Google
  "gemini-2.5-pro": {
    inputPerMillion: 1.25,
    outputPerMillion: 10,
    cacheCreationPerMillion: 1.25,
    cacheReadPerMillion: 0.315,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
    cacheCreationPerMillion: 0.15,
    cacheReadPerMillion: 0.0375,
    contextWindow: 1_000_000,
  },
};

// Normalize model names (strip version suffixes for matching)
function normalizeModelName(model: string): string {
  // Try exact match first
  if (PRICING[model]) return model;

  // Try common patterns
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return key;
    }
  }

  // Try partial matches
  if (model.includes("opus")) return "claude-opus-4-6";
  if (model.includes("sonnet")) return "claude-sonnet-4-6";
  if (model.includes("haiku")) return "claude-haiku-4-5-20251001";
  if (model.includes("gpt-4o-mini")) return "gpt-4o-mini";
  if (model.includes("gpt-4o")) return "gpt-4o";
  if (model.includes("gemini") && model.includes("pro")) return "gemini-2.5-pro";
  if (model.includes("gemini") && model.includes("flash")) return "gemini-2.5-flash";

  return model;
}

export function getModelPricing(model: string): ModelPricing | null {
  const normalized = normalizeModelName(model);
  return PRICING[normalized] ?? null;
}

export function getContextWindow(model: string): number {
  const pricing = getModelPricing(model);
  return pricing?.contextWindow ?? 200_000; // default assumption
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number = 0,
  cacheReadTokens: number = 0
): number {
  const pricing = getModelPricing(model);
  if (!pricing) return 0;

  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion +
    (cacheCreationTokens / 1_000_000) * pricing.cacheCreationPerMillion +
    (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion
  );
}

export function getAllModels(): string[] {
  return Object.keys(PRICING);
}
