/**
 * Server-side checkout language and state guards shared by every customer AI
 * provider. Model output is never trusted as proof that a checkout is ready.
 */

export function normalizeConfirmationPhrase(phrase: string): string {
  return String(phrase || '')
    .toLowerCase()
    .replace(/[“”"'`!?.,،؛:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNegatedConfirmation(phrase: string): boolean {
  const normalized = String(phrase || '').toLowerCase().trim();
  return (
    normalized.includes("don't") ||
    normalized.includes('dont') ||
    normalized.includes('do not') ||
    normalized.includes('not') ||
    normalized.includes('cancel') ||
    normalized.includes('mesh') ||
    normalized.includes('mish') ||
    normalized.includes('la2') ||
    normalized === 'la' ||
    normalized.startsWith('la ') ||
    normalized.includes('لا') ||
    normalized.includes('مش')
  );
}

export function isHistoricalOrQuestionConfirmation(phrase: string): boolean {
  const normalized = String(phrase || '').toLowerCase().trim();
  return (
    normalized.includes('yesterday') ||
    normalized.includes('last time') ||
    normalized.includes('earlier') ||
    normalized.includes('before') ||
    normalized.includes('can i') ||
    normalized.includes('could i') ||
    normalized.includes('did i') ||
    normalized.includes('later') ||
    normalized.includes('maybe') ||
    String(phrase || '').includes('?') ||
    String(phrase || '').includes('؟')
  );
}

export function isExplicitConfirmation(phrase: string): boolean {
  if (!phrase || isNegatedConfirmation(phrase) || isHistoricalOrQuestionConfirmation(phrase)) {
    return false;
  }

  return new Set([
    'confirm',
    'confirm order',
    'yes',
    'yes confirm',
    'akid',
    'ta2kid',
    'tamam',
    'ta2kid order',
    'place order',
    'yalla confirm',
    'aywa',
    'أكيد',
    'تمام',
    'نعم',
    'أكد الطلب',
  ]).has(normalizeConfirmationPhrase(phrase));
}

export function isValidOrderConfirmationPhrase(phrase: string): boolean {
  return isExplicitConfirmation(phrase);
}

export function invalidateCheckout(state: any): void {
  state.awaitingConfirmation = false;
  state.checkoutFingerprint = null;
  if (state.stage === 'AWAITING_CONFIRMATION') {
    state.stage = 'EDITING_CART';
  }
}

