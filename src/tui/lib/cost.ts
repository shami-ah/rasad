const PRICING: Record<string, [number, number]> = {
  opus: [15, 75],
  sonnet: [3, 15],
  haiku: [0.8, 4],
};

export interface CostResult {
  estimatedCost: number;
  sonnetEquivalentCost: number;
  projectedCost: number;
  costPerMinute: number;
}

export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  sessionDurationMs: number,
): CostResult {
  let inputRate = 15;
  let outputRate = 75;
  for (const [key, [ir, or]] of Object.entries(PRICING)) {
    if (model.includes(key)) {
      inputRate = ir;
      outputRate = or;
      break;
    }
  }

  const estimatedCost =
    (inputTokens / 1_000_000) * inputRate +
    (outputTokens / 1_000_000) * outputRate +
    (cacheReadTokens / 1_000_000) * (inputRate / 10);

  const sonnetEquivalentCost =
    (inputTokens / 1_000_000) * 3 +
    (outputTokens / 1_000_000) * 15 +
    (cacheReadTokens / 1_000_000) * 0.3;

  const durationMinutes = sessionDurationMs / 60_000;
  const costPerMinute = durationMinutes > 0 ? estimatedCost / durationMinutes : 0;
  const projectedCost = estimatedCost + costPerMinute * Math.max(10, durationMinutes * 0.5);

  return { estimatedCost, sonnetEquivalentCost, projectedCost, costPerMinute };
}
