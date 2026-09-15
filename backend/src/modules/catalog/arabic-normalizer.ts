/**
 * Multilingual Normalization Engine for Lion Delivery
 * Supports:
 * - Unicode NFKC normalization
 * - Arabic script normalization (alif, yaa, taa marbuta, tashkeel, tatweel)
 * - Lebanese Arabizi numeral transliteration (7->h, 3->a/e, 2->a/q, 5->kh, 8->gh)
 * - Common Lebanese food, grocery, and ordering vocabulary mapping
 */

export class MultilingualNormalizer {
  // Arabic diacritics / tashkeel range: \u064B - \u0652, plus shadda \u0651
  private static readonly TASHKEEL_REGEX = /[\u064B-\u0652\u0670]/g;
  private static readonly TATWEEL_REGEX = /\u0640/g;

  // Lebanese Arabizi common mappings
  private static readonly ARABIZI_PHONETICS: Array<[RegExp, string]> = [
    [/\b7elo\b|\b7ilu\b|\bhelo\b|\bhilou\b/gi, 'sweet dessert 7elo'],
    [/\bbatata\s+ma2liyeh\b|\bbatata\s+maeliyeh\b|\bbatata\s+makliyeh\b|\bbatata\b/gi, 'french fries potato batata'],
    [/\bkrispy\s+cheken\b|\bkrispi\s+chiken\b|\bcrispy\s+cheken\b|\bkrispy\s+chicken\b/gi, 'crispy chicken'],
    [/\barkhas\b|\bar5as\b|\barkhas shi\b/gi, 'cheapest arkhas'],
    [/\b3al bet\b|\baal bet\b|\b3albet\b/gi, 'home 3al bet'],
    [/\bbade\b|\bbaddi\b|\bbdde\b|\bbedde\b/gi, 'want'],
    [/\bbala kabbis\b|\bbla kabbis\b|\bbala kabis\b/gi, 'no pickles'],
    [/\btnein\b|\btnayn\b|\btnen\b/gi, '2'],
    [/\bkbir\b|\bkbeer\b/gi, 'large'],
    [/\bzgheer\b|\bzrir\b/gi, 'small'],
    [/\bta2kid\b|\btaakid\b|\bakeed\b|\bakid\b/gi, 'confirm akid'],
    [/\bwein el order\b|\bwayn el order\b|\bwein sar\b/gi, 'where is order status'],
  ];

  /**
   * Normalize Arabic text by removing diacritics, unifying letter forms
   */
  static normalizeArabic(text: string): string {
    if (!text) return '';

    let normalized = text.normalize('NFKC');

    // Remove tashkeel (diacritics) & tatweel
    normalized = normalized.replace(this.TASHKEEL_REGEX, '');
    normalized = normalized.replace(this.TATWEEL_REGEX, '');

    // Unify Alif variants: أ, إ, آ, ٱ -> ا
    normalized = normalized.replace(/[أإآٱ]/g, 'ا');

    // Unify Taa Marbuta: ة -> ه
    normalized = normalized.replace(/ة/g, 'ه');

    // Unify Yaa / Alif Maqsura: ى -> ي
    normalized = normalized.replace(/ى/g, 'ي');

    // Clean multiple spaces
    return normalized.trim().replace(/\s+/g, ' ');
  }

  /**
   * Normalize Lebanese Arabizi text into searchable query tokens
   */
  static normalizeArabizi(text: string): string {
    if (!text) return '';

    let normalized = text.toLowerCase().trim();

    // Map common Arabizi phrases
    for (const [pattern, replacement] of this.ARABIZI_PHONETICS) {
      normalized = normalized.replace(pattern, replacement);
    }

    // Common numeral conversions for remaining words:
    // 7 -> h (e.g. sa7an -> sahan)
    // 3 -> a (e.g. ma3 -> maa)
    // 5 -> kh (e.g. 5obz -> khobz)
    // 2 -> a (e.g. da2i2a -> daaiea)
    // 8 -> gh
    normalized = normalized
      .replace(/7/g, 'h')
      .replace(/3/g, 'a')
      .replace(/5/g, 'kh')
      .replace(/2/g, 'a')
      .replace(/8/g, 'gh');

    return normalized.trim().replace(/\s+/g, ' ');
  }

  /**
   * Master normalization returning both canonical search tokens and normalized query
   */
  static normalizeQuery(query: string): {
    original: string;
    normalizedArabic: string;
    normalizedArabizi: string;
    tokens: string[];
  } {
    const original = String(query || '').trim();
    const normalizedArabic = this.normalizeArabic(original);
    const normalizedArabizi = this.normalizeArabizi(original);

    // Extract unique searchable tokens (min length 2)
    const rawTokens = `${normalizedArabic} ${normalizedArabizi} ${original.toLowerCase()}`
      .split(/[\s,.;:!?+*&/\\#@()[\]{}|~`"']/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    const uniqueTokens = Array.from(new Set(rawTokens));

    return {
      original,
      normalizedArabic,
      normalizedArabizi,
      tokens: uniqueTokens,
    };
  }
}
