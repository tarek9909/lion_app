/**
 * Configurable Gemini Token Pricing Module
 * Google Gemini 3.8 Flash standard pricing through December 31, 2026:
 * - Input: $0.75 per 1,000,000 tokens ($0.00000075 / token)
 * - Output: $3.75 per 1,000,000 tokens ($0.00000375 / token)
 */

export interface GeminiPricingConfig {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export const DEFAULT_GEMINI_38_FLASH_PRICING: GeminiPricingConfig = {
  inputPerMillionUsd: 0.75,
  outputPerMillionUsd: 3.75,
};

/**
 * Calculates estimated cost for Gemini API tokens
 */
export function calculateGeminiCost(
  inputTokens: number,
  outputTokens: number,
  pricing: GeminiPricingConfig = DEFAULT_GEMINI_38_FLASH_PRICING
): number {
  const inputCost = (Math.max(0, inputTokens) / 1_000_000) * pricing.inputPerMillionUsd;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * pricing.outputPerMillionUsd;
  return Number((inputCost + outputCost).toFixed(8));
}
