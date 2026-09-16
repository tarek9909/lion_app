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

/** Explicit phrases that are safe to treat as a request to empty the active cart. */
export function isExplicitCartClearRequest(phrase: string): boolean {
  const normalized = normalizeConfirmationPhrase(phrase);
  return new Set([
    'clear cart',
    'empty cart',
    'clear',
    'empty',
    'delete cart',
    'delete all',
    'remove all',
    'fadde l cart',
    'fade l cart',
    'fadde cart',
    'ma7eyun kullun',
    'ma7eon kullon',
    'ma7e el cart',
    'mas7 el cart',
    'فضي السلة',
    'فضي الكارت',
    'امسح السلة',
    'امسح الكارت',
    'محيهن كلن',
    'محيهم كلهم',
  ]).has(normalized);
}

/** A request to start over must be confirmed when the current cart has items. */
export function isNewCartRequest(phrase: string): boolean {
  const normalized = normalizeConfirmationPhrase(phrase);
  return new Set([
    'new cart',
    'start new cart',
    'start over',
    'new order',
    'بلش طلب جديد',
    'سلة جديدة',
    'ballech talab jdid',
    'cart jdeed',
  ]).has(normalized);
}

/** Interprets a reply only while a clear-cart confirmation is already pending. */
export function getPendingCartClearDecision(phrase: string): 'CONFIRM' | 'DECLINE' | null {
  const normalized = normalizeConfirmationPhrase(phrase);
  if (!normalized) return null;

  // "No, delete it" means delete in the context of the pending question.
  if (
    isExplicitCartClearRequest(normalized) ||
    /\b(?:delete|remove|clear|empty)\s+(?:it|them|all|the cart)\b/u.test(normalized) ||
    ['yes', 'yes please', 'confirm', 'ok', 'okay', 'go ahead', 'akid', 'tamam', 'eh', 'ee', 'aywa', 'na3am', 'نعم', 'أكيد', 'تمام'].includes(normalized)
  ) {
    return 'CONFIRM';
  }

  if (
    ['no', 'nope', 'keep', 'keep it', 'keep cart', 'do not clear', "don't clear", 'cancel', 'la', 'la2', 'mesh', 'mish', 'لا', 'خليها'].includes(normalized)
  ) {
    return 'DECLINE';
  }

  return null;
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
