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

// Text exported through older database/UI paths was occasionally decoded as
// Windows-1252 instead of UTF-8, producing customer-visible strings such as
// "Iâ€™m" and "ØªÙ…". Repair only clear mojibake signatures; valid Arabic,
// French, and Arabizi text is left untouched.
const WINDOWS_1252_BYTES = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);
const MOJIBAKE_SIGNATURE = /(?:Ã.|Â.|â[€\u0080-\u009f]|Ø.|Ù.|ð.)/u;

function repairMojibake(value: string): string {
  let repaired = value;
  // A second pass handles text that has been incorrectly decoded twice.
  for (let pass = 0; pass < 2 && MOJIBAKE_SIGNATURE.test(repaired); pass += 1) {
    const bytes: number[] = [];
    let encodable = true;
    for (const char of repaired) {
      const codePoint = char.codePointAt(0)!;
      if (codePoint <= 0xff) bytes.push(codePoint);
      else if (WINDOWS_1252_BYTES.has(codePoint)) bytes.push(WINDOWS_1252_BYTES.get(codePoint)!);
      else {
        encodable = false;
        break;
      }
    }
    if (!encodable) break;
    const decoded = Buffer.from(bytes).toString('utf8');
    if (decoded.includes('\uFFFD') || decoded === repaired) break;
    repaired = decoded;
  }
  return repaired;
}

/**
 * Returns customer-safe plain text.
 *
 * The contract prohibits Markdown markers and decorative emoji on every
 * customer-facing WhatsApp path. Newlines and ordinary hyphen lists remain
 * intact so verified facts such as item names, prices, addresses, and order
 * identifiers stay readable.
 */
export function sanitizeCustomerOutput(value: unknown): string {
  const source = repairMojibake(value === null || value === undefined ? '' : String(value));

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
