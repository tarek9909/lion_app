/**
 * Customer-facing response for catalog/database misses.
 *
 * A miss is a normal conversational outcome: the customer gets an actionable
 * question instead of a dead-end or an invented fallback product.
 */
export const INTERACTIVE_NOT_FOUND_REPLY =
  "I couldn't find that within my current catalog. Do you want to choose another item or try a different name?";

export function isNotFoundError(errorCode?: string, errorMessage?: string): boolean {
  const code = String(errorCode || '').toUpperCase();
  const message = String(errorMessage || '').toLowerCase();

  return (
    [
      'PRODUCT_NOT_FOUND',
      'CART_ITEM_NOT_FOUND',
      'ADDRESS_NOT_FOUND',
      'NO_ORDER_FOUND',
      'CATALOG_NOT_FOUND',
      'VARIANT_NOT_FOUND',
    ].includes(code) ||
    (message.includes('not found') && !message.includes('tool')) ||
    message.includes('no matching product')
  );
}

export function resultHasNoCatalogMatches(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const value = result as Record<string, any>;
  return value.count === 0 || (Array.isArray(value.results) && value.results.length === 0);
}
