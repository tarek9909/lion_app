/**
 * Privacy-safe Redaction Utilities for Lion Delivery AI Telemetry
 *
 * Removes or masks:
 * - Phone numbers (Lebanese & international)
 * - GPS coordinates
 * - Provider message IDs
 * - API keys, tokens, and secrets
 * - Full sensitive street / apartment / building addresses and landmarks
 * - Customer personal identifiable names
 */

export interface RedactionResult {
  redactedText: string;
  redactionsCount: number;
  redactedTypes: string[];
}

export class PiiRedactor {
  // Matches Lebanese and international phone numbers (e.g. +96170123456, 961 70 123456, 03123456, 70-123456)
  private static readonly PHONE_REGEX =
    /(?:\+?961[\s.-]?(?:3|70|71|76|78|79|81)[\s.-]?\d{3}[\s.-]?\d{3})|(?:\b(?:03|70|71|76|78|79|81)[\s.-]?\d{3}[\s.-]?\d{3}\b)|(?:\b\+?[1-9]\d{1,14}\b(?=\s*(?:phone|tel|call|wa|whatsapp|mobile)))/gi;

  // Matches GPS coordinates (e.g. Lat 33.5635, Lng 35.3720 or 33.5635, 35.3720)
  private static readonly GPS_REGEX =
    /(?:(?:lat(?:itude)?\s*[:=]?\s*[-+]?\d{1,3}\.\d+[\s,;]+(?:lng|long|longitude)?\s*[:=]?\s*[-+]?\d{1,3}\.\d+)|(?:[-+]?\d{1,2}\.\d{4,8}[\s,]+[-+]?\d{1,3}\.\d{4,8}))/gi;

  // Matches Meta WhatsApp provider IDs (e.g. wamid.HBgL..., wamid.RECEIPT_...)
  private static readonly PROVIDER_ID_REGEX =
    /\bwamid\.[A-Za-z0-9_\-+/=]+\b/gi;

  // Matches API keys, tokens, and secrets (Google AI Studio, OpenAI, Bearer tokens)
  private static readonly SECRETS_REGEX =
    /(?:AIza[0-9A-Za-z-_]{30,45})|(?:sk-[a-zA-Z0-9]{20,})|(?:Bearer\s+[A-Za-z0-9._~+/-]+=*)|(?:(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[A-Za-z0-9._~+/-]{8,}['"]?)/gi;

  // Matches detailed address markers in English and Arabic
  // e.g. "building Al-Safir, 2nd floor, apartment 4", "بناية الزهور طابق ٣ شقة ٥ قرب القلعة"
  private static readonly ADDRESS_DETAIL_REGEX =
    /(?:(?:(?:floor|apartment|apt|building|bldg|villa|street|str|ave|avenue|suite|block|طابق|شقة|بناية|عمارة|شارع|قرب|مقابل|خلف|مجمع)\s*[:#]?\s*[\w\u0600-\u06FF-]+)|(?:\d+(?:st|nd|rd|th)?\s+(?:floor|fl|apt|apartment|block)))(?:[\s,]+(?:(?:(?:floor|apartment|apt|building|bldg|villa|street|str|ave|avenue|suite|block|طابق|شقة|بناية|عمارة|شارع|قرب|مقابل|خلف|مجمع)\s*[:#]?\s*[\w\u0600-\u06FF-]+)|(?:\d+(?:st|nd|rd|th)?\s+(?:floor|fl|apt|apartment|block))|[\w\u0600-\u06FF-]+))*/gi;

  // Matches common personal first names in free text in English and Arabic
  private static readonly PERSONAL_NAMES_REGEX =
    /(?<=^|[\s,.:;!?])(?:Karim|Kareem|Ahmad|Ahmed|Sarah|Sara|Tarek|Tariq|Jad|Maya|Nour|Noor|Ali|Mohamad|Mohammad|Mohammed|Muhammad|Omar|Layla|Leila|Zeina|Zina|Hassan|Hussein|Rami|Fadi|Ziad|Hadi|Rania|Dina|Lara|Youssef|Joseph|George|Elie|Charbel|كريم|احمد|أحمد|سارة|ساره|طارق|جاد|مايا|نور|علي|محمد|محمود|عمر|ليلى|ليلا|زينة|زينه|حسن|حسين|رامي|فادي|زياد|هادي|رانيا|دينا|لارا|يوسف|جورج|ايلي|إيلي|شربل)(?=$|[\s,.:;!?])/gi;

  // Matches customer name introductions in free text (e.g. "my name is Karim", "esmi Karim", "ana Karim")
  private static readonly NAME_INTRO_REGEX =
    /(?<=^|[\s,.:;!?])(?:my name is|i am|i'm|this is|contact|customer|mr\.?|mrs\.?|dr\.?|اسمي|أنا|انا|الزبون|العميل)\s+([A-Z][a-z]+|[\u0600-\u06FF]+)(?=$|[\s,.:;!?])/gi;

  /**
   * Redacts sensitive personal information and secrets from text.
   */
  static redact(input: string | null | undefined): RedactionResult {
    if (!input) {
      return { redactedText: '', redactionsCount: 0, redactedTypes: [] };
    }

    let text = String(input);
    let count = 0;
    const types = new Set<string>();

    // 1. Secrets and tokens
    text = text.replace(this.SECRETS_REGEX, () => {
      count++;
      types.add('SECRET');
      return '[REDACTED_SECRET]';
    });

    // 2. Provider message IDs
    text = text.replace(this.PROVIDER_ID_REGEX, () => {
      count++;
      types.add('PROVIDER_ID');
      return '[REDACTED_PROVIDER_ID]';
    });

    // 3. GPS Coordinates
    text = text.replace(this.GPS_REGEX, () => {
      count++;
      types.add('GPS_COORDINATES');
      return '[REDACTED_GPS]';
    });

    // 4. Phone numbers
    text = text.replace(this.PHONE_REGEX, () => {
      count++;
      types.add('PHONE_NUMBER');
      return '[REDACTED_PHONE]';
    });

    // 5. Detailed street / building / apartment addresses (G-032, audit finding 3.2)
    text = text.replace(this.ADDRESS_DETAIL_REGEX, () => {
      count++;
      types.add('ADDRESS_DETAILS');
      return '[REDACTED_ADDRESS]';
    });

    // 6. Free-text customer names (e.g. "Karim", "Ahmad", "my name is Karim")
    text = text.replace(this.NAME_INTRO_REGEX, () => {
      count++;
      types.add('CUSTOMER_NAME');
      return '[REDACTED_NAME]';
    });
    text = text.replace(this.PERSONAL_NAMES_REGEX, () => {
      count++;
      types.add('CUSTOMER_NAME');
      return '[REDACTED_NAME]';
    });

    return {
      redactedText: text,
      redactionsCount: count,
      redactedTypes: Array.from(types),
    };
  }

  /**
   * Helper that returns redacted string directly.
   */
  static redactText(input: string | null | undefined): string {
    return this.redact(input).redactedText;
  }

  /**
   * Safely redacts an object deeply, masking sensitive fields including phone,
   * secrets, GPS, full addresses, building/apartment details, and identifiable names.
   */
  static redactObject<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
      if (typeof obj === 'string') {
        return this.redactText(obj) as unknown as T;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as unknown as T;
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Secrets & credentials
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('auth')
      ) {
        result[key] = '[REDACTED_SECRET]';
      }
      // Phone numbers
      else if (lowerKey.includes('phone') || lowerKey.includes('whatsapp') || lowerKey.includes('mobile')) {
        result[key] = '[REDACTED_PHONE]';
      }
      // GPS coordinates
      else if (
        lowerKey.includes('latitude') ||
        lowerKey.includes('longitude') ||
        lowerKey === 'lat' ||
        lowerKey === 'lng'
      ) {
        result[key] = '[REDACTED_GPS]';
      }
      // Identifiable customer names
      else if (
        lowerKey === 'display_name' ||
        lowerKey === 'customer_name' ||
        lowerKey === 'full_name' ||
        lowerKey === 'full_name_private' ||
        lowerKey === 'recipient_name'
      ) {
        result[key] = '[REDACTED_NAME]';
      }
      // Full addresses & nested address fields
      else if (
        lowerKey === 'address' ||
        lowerKey === 'full_address' ||
        lowerKey === 'street' ||
        lowerKey === 'building' ||
        lowerKey === 'floor' ||
        lowerKey === 'apartment' ||
        lowerKey === 'apt' ||
        lowerKey === 'landmark' ||
        lowerKey === 'address_details' ||
        lowerKey === 'delivery_address' ||
        lowerKey === 'address_text'
      ) {
        if (typeof value === 'object' && value !== null) {
          result[key] = this.redactObject(value);
        } else {
          result[key] = '[REDACTED_ADDRESS]';
        }
      }
      // Meta provider message IDs
      else if (
        lowerKey === 'provider_message_id' ||
        lowerKey === 'wamid' ||
        lowerKey === 'provider_event_id'
      ) {
        result[key] = '[REDACTED_PROVIDER_ID]';
      }
      // Recursively sanitize strings and sub-objects
      else if (typeof value === 'string') {
        result[key] = this.redactText(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactObject(value);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }
}
