import { config } from '../config/env.js';

export function convertUsdToLbp(usd: number): number {
  return Math.round(usd * config.settlement.lbpPerUsd);
}

export function formatLbp(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} LBP`;
}

export function formatDualCurrency(usd: number): string {
  return `$${usd.toFixed(2)} (≈ ${formatLbp(convertUsdToLbp(usd))})`;
}
