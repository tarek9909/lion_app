/**
 * Final presentation boundary for text sent to a customer.
 *
 * This deliberately changes presentation only. It does not translate, infer,
 * redact, or otherwise alter the business facts supplied by the caller.
 */

const LION_EMOJI = /\u{1F981}\uFE0F?/gu;
const KEYCAP_EMOJI = /([0-9*#])\uFE0F?\u20E3/gu;
const FLAG_EMOJI = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
const DECORATIVE_EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}])?)*?/gu;
const EMOJI_JOINERS_AND_VARIANTS = /[\u200D\uFE0E\uFE0F]/gu;

/**
 * Returns customer-safe plain text.
 *
 * The contract prohibits Markdown markers and decorative emoji on every
 * customer-facing WhatsApp path. Newlines and ordinary hyphen lists remain
 * intact so verified facts such as item names, prices, addresses, and order
 * identifiers stay readable.
 */
export function sanitizeCustomerOutput(value: unknown): string {
  const source = value === null || value === undefined ? '' : String(value);

  return source
    .normalize('NFC')
    // Keep the underlying number in a keycap emoji (for example 1 keycap),
    // then remove the forbidden Markdown marker below if it was # or *.
    .replace(KEYCAP_EMOJI, '$1')
    .replace(LION_EMOJI, '')
    .replace(FLAG_EMOJI, '')
    .replace(DECORATIVE_EMOJI, '')
    .replace(EMOJI_JOINERS_AND_VARIANTS, '')
    .replace(/[*#]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Alias for call sites that name replies rather than generic output. */
export const sanitizeCustomerReply = sanitizeCustomerOutput;

/** Useful for regression checks at boundaries without modifying the text. */
export function hasForbiddenCustomerPresentation(value: unknown): boolean {
  const source = value === null || value === undefined ? '' : String(value);
  LION_EMOJI.lastIndex = 0;
  FLAG_EMOJI.lastIndex = 0;
  DECORATIVE_EMOJI.lastIndex = 0;
  return (
    /[*#]/u.test(source) ||
    LION_EMOJI.test(source) ||
    FLAG_EMOJI.test(source) ||
    DECORATIVE_EMOJI.test(source)
  );
}
