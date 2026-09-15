import { sanitizeCustomerOutput } from './customer-output.js';

/**
 * Backward-compatible product-miss text used by the existing Gemini flow.
 * It is intentionally limited to catalog/product misses; address and order
 * failures must use their own structured categories below.
 */
export const INTERACTIVE_NOT_FOUND_REPLY =
  "I couldn't find that within my current catalog. Do you want to choose another item or try a different name?";

export type CustomerResponseCategory =
  | 'PRODUCT_MISS'
  | 'CART_ITEM_MISS'
  | 'VARIANT_MISS'
  | 'ADDRESS_MISS'
  | 'ADDRESS_VALIDATION'
  | 'NO_ACTIVE_ORDER'
  | 'ORDER_NUMBER_MISS'
  | 'CLARIFICATION'
  | 'MULTI_ORDER_PLAN';

export type CustomerResponseLanguage =
  | 'en'
  | 'arabizi'
  | 'ar'
  | 'ar_lb'
  | 'mixed'
  | 'fr'
  | (string & {});

export interface CustomerResponseFacts {
  /** A verified requested product, cart item, or variant name. */
  itemName?: string | null;
  /** A verified saved-address label. */
  addressLabel?: string | null;
  /** A verified order number supplied by the customer. */
  orderNumber?: string | null;
  /** Verified choices, never guessed substitutions. */
  verifiedOptions?: readonly string[] | null;
  /** Verified merchant names for a separate-order plan. */
  merchantNames?: readonly string[] | null;
}

export interface CustomerErrorDispatchInput {
  errorCode?: string | null;
  errorMessage?: string | null;
  result?: unknown;
  language?: CustomerResponseLanguage | null;
  facts?: CustomerResponseFacts;
}

export interface CustomerErrorDispatchResult {
  category: CustomerResponseCategory;
  text: string;
}

type RendererLanguage = 'en' | 'arabizi' | 'ar' | 'fr';
type Renderer = (facts: CustomerResponseFacts) => string;

const ERROR_CATEGORY_BY_CODE: Readonly<Record<string, CustomerResponseCategory>> = {
  PRODUCT_NOT_FOUND: 'PRODUCT_MISS',
  CATALOG_NOT_FOUND: 'PRODUCT_MISS',
  NO_CATALOG_MATCHES: 'PRODUCT_MISS',
  PRODUCT_UNAVAILABLE: 'PRODUCT_MISS',
  CART_ITEM_NOT_FOUND: 'CART_ITEM_MISS',
  AMBIGUOUS_CART_ITEM: 'CART_ITEM_MISS',
  VARIANT_NOT_FOUND: 'VARIANT_MISS',
  VARIANT_UNAVAILABLE: 'VARIANT_MISS',
  VARIANT_UPDATE_FAILED: 'VARIANT_MISS',
  ADDRESS_NOT_FOUND: 'ADDRESS_MISS',
  SAVED_ADDRESS_NOT_FOUND: 'ADDRESS_MISS',
  ADDRESS_VALIDATION_FAILED: 'ADDRESS_VALIDATION',
  ADDRESS_UNVALIDATED: 'ADDRESS_VALIDATION',
  ADDRESS_UNSERVICEABLE: 'ADDRESS_VALIDATION',
  ADDRESS_INVALID: 'ADDRESS_VALIDATION',
  NO_ORDER_FOUND: 'NO_ACTIVE_ORDER',
  NO_ACTIVE_ORDER: 'NO_ACTIVE_ORDER',
  ORDER_NUMBER_NOT_FOUND: 'ORDER_NUMBER_MISS',
  ORDER_ID_NOT_FOUND: 'ORDER_NUMBER_MISS',
  UNCLEAR_MESSAGE: 'CLARIFICATION',
  UNINTELLIGIBLE_MESSAGE: 'CLARIFICATION',
  CLARIFICATION_REQUIRED: 'CLARIFICATION',
  CROSS_MERCHANT_REQUEST: 'MULTI_ORDER_PLAN',
  MULTI_ORDER_REQUEST: 'MULTI_ORDER_PLAN',
  MULTI_ORDER_PLAN: 'MULTI_ORDER_PLAN',
};

function cleanFact(value: unknown): string {
  return sanitizeCustomerOutput(value).replace(/\n+/g, ' ').trim();
}

function factList(values: readonly string[] | null | undefined): string[] {
  return (values || []).map(cleanFact).filter(Boolean);
}

function optionsSuffix(facts: CustomerResponseFacts): string {
  const options = factList(facts.verifiedOptions);
  return options.length > 0 ? `\n\n${options.map((option) => `- ${option}`).join('\n')}` : '';
}

function merchantPhrase(facts: CustomerResponseFacts, conjunction: string): string {
  const merchants = factList(facts.merchantNames);
  if (merchants.length === 0) return '';
  if (merchants.length === 1) return merchants[0];
  if (merchants.length === 2) return `${merchants[0]}${conjunction}${merchants[1]}`;
  return `${merchants.slice(0, -1).join(', ')},${conjunction}${merchants[merchants.length - 1]}`;
}

function rendererLanguage(language?: CustomerResponseLanguage | null): RendererLanguage {
  switch (String(language || 'en').toLowerCase()) {
    case 'arabizi':
      return 'arabizi';
    case 'ar':
    case 'ar_lb':
    case 'mixed':
      return 'ar';
    case 'fr':
      return 'fr';
    default:
      return 'en';
  }
}

function renderArabicResponse(category: CustomerResponseCategory, facts: CustomerResponseFacts): string {
  const item = cleanFact(facts.itemName);
  const address = cleanFact(facts.addressLabel);
  const choices = factList(facts.verifiedOptions);
  const alternatives = choices.length ? `\n\n- ${choices.join('\n- ')}` : '';
  switch (category) {
    case 'PRODUCT_MISS': return (item ? `لم أجد ${item}. هل تريد تجربة اسم آخر أو رؤية البدائل المتاحة؟` : 'لم أجد هذا الصنف. هل تريد تجربة اسم آخر أو رؤية البدائل المتاحة؟') + alternatives;
    case 'CART_ITEM_MISS': return item ? `${item} ليس في سلتك الحالية. هل تريد رؤية السلة؟` : 'هذا الصنف ليس في سلتك الحالية. هل تريد رؤية السلة؟';
    case 'VARIANT_MISS': return (item ? `الخيار المطلوب لـ ${item} غير متاح. أي خيار متاح تريد؟` : 'هذا الحجم أو النكهة غير متاح. أي خيار متاح تريد؟') + alternatives;
    case 'ADDRESS_MISS': return address ? `لم أجد العنوان المحفوظ ${address}. هل تريد إضافة عنوان أو إرسال موقع؟` : 'لم أجد هذا العنوان المحفوظ. هل تريد إضافة عنوان أو إرسال موقع؟';
    case 'ADDRESS_VALIDATION': return 'لم أتمكن من تأكيد هذا العنوان. أرسل موقعاً أو معلماً قريباً.';
    case 'NO_ACTIVE_ORDER': return 'ليس لديك طلب نشط الآن. هل تريد بدء طلب جديد؟';
    case 'ORDER_NUMBER_MISS': return 'لم أجد رقم الطلب. تحقق من الرقم أو اطلب آخر طلباتك.';
    case 'CLARIFICATION': return 'لم أفهم طلبك. هل تريد طلب طعام أو إضافة صنف أو إرسال عنوان أو متابعة طلب؟';
    case 'MULTI_ORDER_PLAN': return 'يمكنني إنشاء طلبين منفصلين. هل تريد إرسالهما إلى العنوان نفسه؟';
  }
}

const ENGLISH_RENDERERS: Readonly<Record<CustomerResponseCategory, Renderer>> = {
  PRODUCT_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    const base = itemName
      ? `I could not find ${itemName}. Would you like to try another name or see available alternatives?`
      : INTERACTIVE_NOT_FOUND_REPLY;
    return `${base}${optionsSuffix(facts)}`;
  },
  CART_ITEM_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    return itemName
      ? `${itemName} is not in your current cart. Would you like to see the cart?`
      : 'That item is not in your current cart. Would you like to see the cart?';
  },
  VARIANT_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    const base = itemName
      ? `The requested option for ${itemName} is not available. Which verified option would you like?`
      : 'That size or flavor is not available. Which verified option would you like?';
    return `${base}${optionsSuffix(facts)}`;
  },
  ADDRESS_MISS: (facts) => {
    const addressLabel = cleanFact(facts.addressLabel);
    return addressLabel
      ? `I could not find the saved address ${addressLabel}. Would you like to add it or send a location pin?`
      : 'I could not find that saved address. Would you like to add it or send a location pin?';
  },
  ADDRESS_VALIDATION: () =>
    'I could not confirm this address. Please send a location pin or a nearby landmark.',
  NO_ACTIVE_ORDER: () =>
    'You do not have an active order right now. Would you like to start a new order?',
  ORDER_NUMBER_MISS: (facts) => {
    const orderNumber = cleanFact(facts.orderNumber);
    return orderNumber
      ? `I could not find order ${orderNumber}. Please check the number or ask to see your recent orders.`
      : 'I could not find that order number. Please check it or ask to see your recent orders.';
  },
  CLARIFICATION: () =>
    'I did not understand that. What would you like to do: order food, add an item, send a delivery address, or check an order?',
  MULTI_ORDER_PLAN: (facts) => {
    const merchants = merchantPhrase(facts, ' and ');
    return merchants
      ? `I can make separate orders from ${merchants}. Should both go to the same address?`
      : 'I can make separate orders. Should both go to the same address?';
  },
};

const ARABIZI_RENDERERS: Readonly<Record<CustomerResponseCategory, Renderer>> = {
  PRODUCT_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    const base = itemName
      ? `Ma la2ayt ${itemName}. Baddak tjarrib esem tene aw tshouf l options l mawjoude?`
      : 'Ma la2ayt hal shi bi catalog l 7ale. Baddak tkhtar shi tene aw tjarrib esem tene?';
    return `${base}${optionsSuffix(facts)}`;
  },
  CART_ITEM_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    return itemName
      ? `${itemName} mish bi cart taba3ak l 7ale. Baddak tshouf l cart?`
      : 'Hal item mish bi cart taba3ak l 7ale. Baddak tshouf l cart?';
  },
  VARIANT_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    const base = itemName
      ? `Hal option la ${itemName} mish mawjoude. Ayya option met2akkad menno baddak?`
      : 'Hal size aw flavor mish mawjoude. Ayya option met2akkad menno baddak?';
    return `${base}${optionsSuffix(facts)}`;
  },
  ADDRESS_MISS: (facts) => {
    const addressLabel = cleanFact(facts.addressLabel);
    return addressLabel
      ? `Ma la2ayt l 3enwen l ma7fouz ${addressLabel}. Baddak tzid 3enwen aw teb3at location pin?`
      : 'Ma la2ayt hal 3enwen l ma7fouz. Baddak tzid 3enwen aw teb3at location pin?';
  },
  ADDRESS_VALIDATION: () =>
    'Ma 2dert 2akked hal 3enwen. Fik teb3at location pin aw t2elle 2reb ma3lam?',
  NO_ACTIVE_ORDER: () =>
    'Ma 3andak talab neche6 halla2. Baddak tballech talab jdid?',
  ORDER_NUMBER_MISS: (facts) => {
    const orderNumber = cleanFact(facts.orderNumber);
    return orderNumber
      ? `Ma la2ayt talab ${orderNumber}. Fik tet2akkad men l ra2em aw t2elle farjine talabatak l 2akhire?`
      : 'Ma la2ayt ra2em hal talab. Fik tet2akkad menno aw t2elle farjine talabatak l 2akhire?';
  },
  CLARIFICATION: () =>
    'Ma fhemet 3layk. Shou baddak ta3mel: tetlob akel, tzid item, teb3at 3enwen, aw tetba3 talab?',
  MULTI_ORDER_PLAN: (facts) => {
    const merchants = merchantPhrase(facts, ' w ');
    return merchants
      ? `Fini e3mel talabayn mfassalin men ${merchants}. Baddak yrou7o la nafs l 3enwen?`
      : 'Fini e3mel talabayn mfassalin. Baddak yrou7o la nafs l 3enwen?';
  },
};

const ARABIC_RENDERERS: Readonly<Record<CustomerResponseCategory, Renderer>> = {
  PRODUCT_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    const base = itemName
      ? `لم أجد ${itemName}. هل تريد تجربة اسم آخر أو رؤية الخيارات المتاحة؟`
      : 'لم أجد هذا الصنف في القائمة الحالية. هل تريد تجربة اسم آخر أو رؤية الخيارات المتاحة؟';
    return `${base}${optionsSuffix(facts)}`;
  },
  CART_ITEM_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    return itemName
      ? `${itemName} ليس في سلتك الحالية. هل تريد رؤية السلة؟`
      : 'هذا الصنف ليس في سلتك الحالية. هل تريد رؤية السلة؟';
  },
  VARIANT_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    const base = itemName
      ? `الخيار المطلوب لـ ${itemName} غير متاح. أي خيار متاح تريد؟`
      : 'هذا الحجم أو النكهة غير متاح. أي خيار متاح تريد؟';
    return `${base}${optionsSuffix(facts)}`;
  },
  ADDRESS_MISS: (facts) => {
    const addressLabel = cleanFact(facts.addressLabel);
    return addressLabel
      ? `لم أجد العنوان المحفوظ ${addressLabel}. هل تريد إضافة عنوان أو إرسال موقعك؟`
      : 'لم أجد هذا العنوان المحفوظ. هل تريد إضافة عنوان أو إرسال موقعك؟';
  },
  ADDRESS_VALIDATION: () =>
    'لم أتمكن من تأكيد هذا العنوان. أرسل موقعك أو معلماً قريباً من فضلك.',
  NO_ACTIVE_ORDER: () =>
    'ليس لديك طلب نشط حالياً. هل تريد بدء طلب جديد؟',
  ORDER_NUMBER_MISS: (facts) => {
    const orderNumber = cleanFact(facts.orderNumber);
    return orderNumber
      ? `لم أجد الطلب ${orderNumber}. تأكد من الرقم أو اطلب عرض طلباتك الأخيرة.`
      : 'لم أجد رقم الطلب هذا. تأكد منه أو اطلب عرض طلباتك الأخيرة.';
  },
  CLARIFICATION: () =>
    'لم أفهم رسالتك. ماذا تريد أن تفعل: تطلب طعاماً، تضيف صنفاً، ترسل عنواناً، أو تتابع طلباً؟',
  MULTI_ORDER_PLAN: (facts) => {
    const merchants = merchantPhrase(facts, ' و ');
    return merchants
      ? `يمكنني إنشاء طلبين منفصلين من ${merchants}. هل تريد إرسالهما إلى العنوان نفسه؟`
      : 'يمكنني إنشاء طلبين منفصلين. هل تريد إرسالهما إلى العنوان نفسه؟';
  },
};

const FRENCH_RENDERERS: Readonly<Record<CustomerResponseCategory, Renderer>> = {
  PRODUCT_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    const base = itemName
      ? `Je n'ai pas trouvé ${itemName}. Voulez-vous essayer un autre nom ou voir les options disponibles ?`
      : "Je n'ai pas trouvé cet article dans le catalogue actuel. Voulez-vous essayer un autre nom ou voir les options disponibles ?";
    return `${base}${optionsSuffix(facts)}`;
  },
  CART_ITEM_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    return itemName
      ? `${itemName} n'est pas dans votre panier actuel. Voulez-vous voir le panier ?`
      : "Cet article n'est pas dans votre panier actuel. Voulez-vous voir le panier ?";
  },
  VARIANT_MISS: (facts) => {
    const itemName = cleanFact(facts.itemName);
    const base = itemName
      ? `Cette option pour ${itemName} n'est pas disponible. Quelle option vérifiée voulez-vous ?`
      : "Cette taille ou cette saveur n'est pas disponible. Quelle option vérifiée voulez-vous ?";
    return `${base}${optionsSuffix(facts)}`;
  },
  ADDRESS_MISS: (facts) => {
    const addressLabel = cleanFact(facts.addressLabel);
    return addressLabel
      ? `Je n'ai pas trouvé l'adresse enregistrée ${addressLabel}. Voulez-vous l'ajouter ou envoyer votre position ?`
      : "Je n'ai pas trouvé cette adresse enregistrée. Voulez-vous l'ajouter ou envoyer votre position ?";
  },
  ADDRESS_VALIDATION: () =>
    "Je n'ai pas pu confirmer cette adresse. Envoyez votre position ou un point de repère proche, s'il vous plaît.",
  NO_ACTIVE_ORDER: () =>
    "Vous n'avez pas de commande active pour le moment. Voulez-vous commencer une nouvelle commande ?",
  ORDER_NUMBER_MISS: (facts) => {
    const orderNumber = cleanFact(facts.orderNumber);
    return orderNumber
      ? `Je n'ai pas trouvé la commande ${orderNumber}. Vérifiez le numéro ou demandez vos commandes récentes.`
      : "Je n'ai pas trouvé ce numéro de commande. Vérifiez-le ou demandez vos commandes récentes.";
  },
  CLARIFICATION: () =>
    "Je n'ai pas compris. Que voulez-vous faire : commander, ajouter un article, envoyer une adresse ou suivre une commande ?",
  MULTI_ORDER_PLAN: (facts) => {
    const merchants = merchantPhrase(facts, ' et ');
    return merchants
      ? `Je peux créer des commandes séparées chez ${merchants}. Les deux doivent-elles aller à la même adresse ?`
      : 'Je peux créer des commandes séparées. Les deux doivent-elles aller à la même adresse ?';
  },
};

const RENDERERS: Readonly<Record<RendererLanguage, Readonly<Record<CustomerResponseCategory, Renderer>>>> = {
  en: ENGLISH_RENDERERS,
  arabizi: ARABIZI_RENDERERS,
  ar: ARABIC_RENDERERS,
  fr: FRENCH_RENDERERS,
};

function normalizeErrorCode(errorCode?: string | null): string {
  return String(errorCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function resultErrorText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const record = result as Record<string, unknown>;
  return [record.error, record.errorMessage, record.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

function inferCategoryFromMessage(errorMessage?: string | null): CustomerResponseCategory | undefined {
  const message = String(errorMessage || '').toLowerCase();
  if (!message) return undefined;

  if (/\b(no active|no current)\s+(?:or\s+past\s+)?orders?\b|\bno active orders?\b/u.test(message)) {
    return 'NO_ACTIVE_ORDER';
  }
  if (/(?:order\s*(?:number|id|code)|(?:number|id|code)\s+for\s+(?:the\s+)?order).*(?:not found|cannot find|could not find)|(?:not found|cannot find|could not find).*order\s*(?:number|id|code)/u.test(message)) {
    return 'ORDER_NUMBER_MISS';
  }
  if (/\b(?:address|location)\b.*(?:cannot|could not|unable to|failed to)\s*(?:confirm|validate)|\b(?:unserviceable|unvalidated)\b.*\b(?:address|location)\b/u.test(message)) {
    return 'ADDRESS_VALIDATION';
  }
  if (/\b(?:saved\s+)?address\b.*(?:not found|missing)|(?:not found|missing).*\b(?:saved\s+)?address\b/u.test(message)) {
    return 'ADDRESS_MISS';
  }
  if (/\b(?:cart|basket)\b.*(?:not found|missing|does not contain)|(?:not found|missing|not in).*\b(?:cart|basket)\b/u.test(message)) {
    return 'CART_ITEM_MISS';
  }
  if (/\b(?:variant|size|flavou?r|option)\b.*(?:not found|unavailable|missing)|(?:not found|unavailable|missing).*\b(?:variant|size|flavou?r|option)\b/u.test(message)) {
    return 'VARIANT_MISS';
  }
  if (/\b(?:unclear|unintelligible|did not understand|didn't understand)\b/u.test(message)) {
    return 'CLARIFICATION';
  }
  if (/\b(?:cross[- ]merchant|multiple merchants|multi[- ]order|separate orders?)\b/u.test(message)) {
    return 'MULTI_ORDER_PLAN';
  }
  if (/\b(?:catalog|product|item)\b.*(?:not found|no match|unavailable)|(?:no matching product|no catalog matches)/u.test(message)) {
    return 'PRODUCT_MISS';
  }
  return undefined;
}

/**
 * Classifies a known tool outcome before customer text is generated. It never
 * turns an unqualified human-readable “not found” phrase into a product miss.
 */
export function getCustomerResponseCategory(
  errorCode?: string | null,
  errorMessage?: string | null,
  result?: unknown,
): CustomerResponseCategory | undefined {
  const category = ERROR_CATEGORY_BY_CODE[normalizeErrorCode(errorCode)];
  if (category) return category;

  if (resultHasNoCatalogMatches(result)) return 'PRODUCT_MISS';

  return inferCategoryFromMessage(`${String(errorMessage || '')} ${resultErrorText(result)}`.trim());
}

/** Alias with a verb for controller/tool-result call sites. */
export const classifyCustomerResponse = getCustomerResponseCategory;

/**
 * Produces category-specific customer text in the sender's language/script.
 * Facts are inserted only when supplied by verified tool output.
 */
export function renderCustomerResponse(
  category: CustomerResponseCategory,
  language: CustomerResponseLanguage = 'en',
  facts: CustomerResponseFacts = {},
): string {
  const selectedLanguage = rendererLanguage(language);
  return sanitizeCustomerOutput(selectedLanguage === 'ar'
    ? renderArabicResponse(category, facts)
    : RENDERERS[selectedLanguage][category](facts));
}

/**
 * One typed boundary for tool-error handling. A caller can keep Gemini in
 * charge of language understanding while deterministic code preserves the
 * true backend outcome category.
 */
export function dispatchCustomerError(
  input: CustomerErrorDispatchInput,
): CustomerErrorDispatchResult | undefined {
  const category = getCustomerResponseCategory(input.errorCode, input.errorMessage, input.result);
  if (!category) return undefined;

  return {
    category,
    text: renderCustomerResponse(category, input.language || 'en', input.facts),
  };
}

/**
 * Legacy Gemini compatibility: only product/catalog misses may trigger the
 * old interactive product-miss override. Address/order/cart outcomes are not
 * catalog misses and therefore return false here.
 */
export function isNotFoundError(errorCode?: string, errorMessage?: string): boolean {
  return getCustomerResponseCategory(errorCode, errorMessage) === 'PRODUCT_MISS';
}

/** True only for a search-catalog shaped empty result. */
export function resultHasNoCatalogMatches(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const value = result as Record<string, unknown>;
  return Number(value.count) === 0 && Array.isArray(value.results) && value.results.length === 0;
}
