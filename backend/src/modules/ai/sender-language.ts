import { SupportedLanguage } from './contract/behavior.contract.js';

/**
 * Language policy for customer-facing AI turns.
 *
 * This is intentionally deterministic and explainable. It handles the
 * languages used by the demo without relying on a second network call, while
 * preserving a script-level fallback for languages the local provider cannot
 * translate itself. Gemini still receives the original message and is told to
 * mirror the sender's language exactly.
 */
export type SenderLanguage = SupportedLanguage;

type LanguageProfile = {
  language: SupportedLanguage;
  words: string[];
  phrases?: string[];
};

const LANGUAGE_PROFILES: LanguageProfile[] = [
  {
    language: 'arabizi',
    words: [
      'bade', 'baddi', 'badde', 'baddak', 'baddik', 'zid', 'zidli', 'sawiya', 'sawiyon',
      'wehde', 'wahad', 'we7de', 'tnein', 'tlete', 'kifak', 'kifik', 'shou', 'chou',
      'shu', 'wein', 'wen', '3al', '3albet', '3andon', '3andak', '3ndak', '3ndk', '3tene',
      'hal', 'shi', 'kaza', 'fadde', 'fade', 'ma7eyun', 'ma7eon', 'kullun', 'kullon', 'menu', 'menus', 'options', '7elo', 'akid', 'akeed',
      'ta2kid', 'tamam', 'kabbis', 'ma2liyeh', 'mosa3adeh', 'arkhas', 'a7san', 'la2ayt',
      'fini', 'bse3dak', 'tfaddal', 'merci', 'mar7aba', 'salam', 'ma', 'mesh', 'mish',
    ],
    phrases: ['ya3tik el 3afye', 'bala kabbis', 'bade shi', 'wein sar'],
  },
  {
    language: 'fr',
    words: [
      'bonjour', 'bonsoir', 'salut', 'merci', 's il', 'vous', 'pouvez', 'peux', 'je',
      'voudrais', 'veux', 'une', 'des', 'avec', 'sans', 'pour', 'dans', 'commande',
      'panier', 'livraison', 'adresse', 'restaurant', 'chercher', 'trouver', 'ajouter',
      'choisir', 'confirmer', 'où', 'quel', 'quelle', 'combien', 'maintenant', 'aussi',
      'moins', 'cher', 'français', 'frites', 'sucré', 'sucrée',
    ],
    phrases: ['s il vous plaît', 'je voudrais', 'combien coûte', 'où est', 'ajoute moi'],
  },
  {
    language: 'es',
    words: [
      'hola', 'buenas', 'gracias', 'por', 'favor', 'quiero', 'quisiera', 'una', 'unos',
      'para', 'con', 'sin', 'pedido', 'carrito', 'entrega', 'dirección', 'buscar',
      'añadir', 'agregar', 'elegir', 'confirmar', 'dónde', 'cuánto', 'barato', 'barata',
    ],
    phrases: ['por favor', 'dónde está', 'cuánto cuesta'],
  },
  {
    language: 'de',
    words: [
      'hallo', 'guten', 'danke', 'bitte', 'ich', 'möchte', 'will', 'eine', 'einen', 'mit',
      'ohne', 'bestellung', 'warenkorb', 'lieferung', 'adresse', 'suchen', 'hinzufügen',
      'auswählen', 'bestätigen', 'wo', 'wie', 'viel', 'günstig',
    ],
    phrases: ['guten tag', 'ich möchte', 'wie viel kostet'],
  },
  {
    language: 'it',
    words: [
      'ciao', 'buongiorno', 'grazie', 'per', 'favore', 'vorrei', 'voglio', 'una', 'con',
      'senza', 'ordine', 'carrello', 'consegna', 'indirizzo', 'cercare', 'aggiungere',
      'scegliere', 'confermare', 'dove', 'quanto', 'economico', 'dolce',
    ],
    phrases: ['per favore', 'quanto costa', 'dove si trova'],
  },
  {
    language: 'pt',
    words: [
      'olá', 'oi', 'obrigado', 'obrigada', 'por', 'favor', 'quero', 'gostaria', 'uma',
      'com', 'sem', 'pedido', 'carrinho', 'entrega', 'endereço', 'buscar', 'adicionar',
      'escolher', 'confirmar', 'onde', 'quanto', 'barato', 'doce',
    ],
    phrases: ['por favor', 'quanto custa', 'onde está'],
  },
  {
    language: 'tr',
    words: [
      'merhaba', 'selam', 'teşekkür', 'lütfen', 'istiyorum', 'bir', 'ile', 'olmadan',
      'sipariş', 'siparişinize', 'sepet', 'teslimat', 'adres', 'ara', 'aramak', 'ekle',
      'eklemek', 'seç', 'onayla', 'nerede', 'ne', 'ne kadar', 'ucuz', 'yardımcı',
      'kontrol', 'istersiniz',
    ],
    phrases: ['teşekkür ederim', 'ne kadar', 'lütfen ekle'],
  },
  {
    language: 'en',
    words: [
      'hello', 'hi', 'hey', 'please', 'can', 'could', 'would', 'want', 'need', 'show',
      'find', 'search', 'add', 'remove', 'order', 'cart', 'delivery', 'address', 'restaurant',
      'choose', 'select', 'confirm', 'where', 'what', 'which', 'how', 'much', 'under',
      'cheaper', 'cheap', 'with', 'without', 'from', 'your', 'my', 'the', 'and', 'for',
    ],
    phrases: ['how much', 'where is my order', 'place my order', 'do you have'],
  },
];

const PROFILE_WORDS = new Map(
  LANGUAGE_PROFILES.map((profile) => [profile.language, new Set(profile.words)]),
);

function normalize(text: string): string {
  return String(text || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[’']/g, "'")
    .trim();
}

function wordTokens(text: string): string[] {
  return normalize(text).match(/[\p{L}0-9]+(?:'[\p{L}0-9]+)?/gu) || [];
}

function hasScript(text: string, script: RegExp): boolean {
  return script.test(text);
}

function profileScore(text: string, profile: LanguageProfile): number {
  const normalized = normalize(text);
  const words = wordTokens(normalized);
  const known = PROFILE_WORDS.get(profile.language)!;
  let score = words.reduce((sum, word) => sum + (known.has(word) ? 1 : 0), 0);

  for (const phrase of profile.phrases || []) {
    if (normalized.includes(phrase)) score += 2;
  }

  return score;
}

function arabiziScore(text: string): number {
  const normalized = normalize(text);
  const strongWords = /\b(?:bade|baddi|badde|baddak|baddik|zidli|sawiya|sawiyon|kifak|kifik|shou|shu|chou|wein|wen|3al|3albet|3andon|3andak|3ndak|3ndk|3tene|kaza|fadde|fade|ma7eyun|ma7eon|kullun|kullon|akid|akeed|ta2kid|ya3tik|ma2liyeh|mosa3adeh|a7san|arkhas|kabbis|mar7aba|tfaddal|bse3dak|wrjene|warjine|farjine|fiyi|fina|mbala|ehh?|tamam|shukran|3enna|mat3am|ma7al|khalas|khlas|betlub|btolob|etlob|talab|b3den|ba3den|mbere7|bukra|bokra|hala2|hle2|hbb|habibi|mashkour|sahtein|barke|la2|wle|walaw|yhemmak|salem|salaam|teslam|3afyeh|tsallam|bte7eb|bte3mol|shou2|m3ak|m3allem|tfehamna|ma3lesh|bas|ktir|ktire|2asdak|2asdek)\b/g;
  const encodedWords = /\b[a-z]*[2356789][a-z0-9]*\b/g;
  const strongMatches = normalized.match(strongWords)?.length || 0;
  const encodedMatches = normalized.match(encodedWords)?.length || 0;
  return strongMatches * 3 + encodedMatches * 2;
}

/** Detects the language of the latest sender message, not the customer's stored preference. */
export function detectSenderLanguage(text: string): SenderLanguage {
  const clean = normalize(text);
  if (!clean) return 'other';

  const hasArabicScript = hasScript(clean, /[\u0600-\u06FF]/u);
  const hasLatin = hasScript(clean, /\p{Script=Latin}/u);
  if (hasArabicScript && hasLatin) return 'mixed';
  if (hasArabicScript) return 'ar';

  if (hasScript(clean, /\p{Script=Cyrillic}/u)) return 'ru';
  if (hasScript(clean, /\p{Script=Hebrew}/u)) return 'he';
  if (hasScript(clean, /\p{Script=Devanagari}/u)) return 'hi';
  if (hasScript(clean, /[\u3040-\u30FF]/u)) return 'ja';
  if (hasScript(clean, /[\u4E00-\u9FFF]/u)) return 'zh';
  if (hasScript(clean, /\uAC00-\uD7AF/u)) return 'ko';
  if (hasScript(clean, /[\u0E00-\u0E7F]/u)) return 'th';
  if (!hasLatin) return 'other';

  const arabizi = arabiziScore(clean);
  const scores = LANGUAGE_PROFILES
    .filter((profile) => profile.language !== 'arabizi')
    .map((profile) => ({ language: profile.language, score: profileScore(clean, profile) }))
    .sort((a, b) => b.score - a.score);

  // Arabizi markers (words or numerals like 2,3,5,7,8) are deliberately weighted above generic English words.
  if (arabizi >= 2) return 'arabizi';

  const best = scores[0];
  const second = scores[1];
  if (best && best.score > 0 && (!second || best.score > second.score || best.language === 'fr')) {
    return best.language;
  }

  return 'en';
}

/**
 * Keeps a conversation in its established language when the customer sends a
 * short contextual reply such as "yes", "view cart", "1", or "new cart".
 * A longer message with clear language content is still allowed to switch it.
 */
export function isContextualConversationFollowUp(text: string): boolean {
  const normalized = normalize(text).replace(/[!?.,]+/g, '').replace(/\s+/g, ' ');
  const tokenCount = wordTokens(normalized).length;
  return /^(?:yes|no|ok|okay|confirm|clear|empty|delete|keep|view cart|new cart|start over|1|2|3|4|5|no delete it|dont delete it|khalas|khalas betlub b3den|merci|shukran|bye|yalla bye|thanks|not now|later)$/iu.test(normalized) || tokenCount <= 3;
}

export function resolveConversationLanguage(text: string, previousLanguage?: SenderLanguage | null): SenderLanguage {
  const detected = detectSenderLanguage(text);
  const previous = previousLanguage && previousLanguage !== 'other' ? previousLanguage : null;
  if (!previous || detected === 'ar' || detected === 'ar_lb' || detected === 'arabizi' || detected === 'mixed') {
    return detected;
  }
  if (detected === 'other' || isContextualConversationFollowUp(text)) {
    return previous;
  }

  return detected;
}

/** Backward-compatible state value. Unknown/script-only languages are handled by Gemini as `other`. */
export function toStoredLanguage(language: SenderLanguage): SupportedLanguage {
  return language;
}

export function languageLabel(language: SenderLanguage): string {
  const labels: Record<SenderLanguage, string> = {
    en: 'English',
    ar: 'Arabic script',
    ar_lb: 'Lebanese Arabic script',
    arabizi: 'Lebanese Arabizi (Latin script)',
    mixed: 'the same natural mixed/code-switched style',
    fr: 'French',
    es: 'Spanish',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    tr: 'Turkish',
    ru: 'Russian',
    he: 'Hebrew',
    hi: 'Hindi',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    th: 'Thai',
    other: 'the sender language detected from the message',
  };
  return labels[language] || labels.other;
}

/** A conservative guard: only replace an answer when it is clearly in a different language. */
export function isResponseInSenderLanguage(senderLanguage: SenderLanguage, reply: string): boolean {
  const clean = normalize(reply);
  if (!clean) return false;

  if (senderLanguage === 'mixed') {
    return /[\u0600-\u06FF]/u.test(clean) && /\p{Script=Latin}/u.test(clean);
  }
  if (senderLanguage === 'ar' || senderLanguage === 'ar_lb') {
    return /[\u0600-\u06FF]/u.test(clean);
  }
  if (senderLanguage === 'arabizi') {
    return /\p{Script=Latin}/u.test(clean) && arabiziScore(clean) >= 3;
  }
  if (senderLanguage === 'other') return true;

  if (senderLanguage === 'ru') return /\p{Script=Cyrillic}/u.test(clean);
  if (senderLanguage === 'he') return /\p{Script=Hebrew}/u.test(clean);
  if (senderLanguage === 'hi') return /\p{Script=Devanagari}/u.test(clean);
  if (senderLanguage === 'zh') return /[\u4E00-\u9FFF]/u.test(clean);
  if (senderLanguage === 'ko') return /\uAC00-\uD7AF/u.test(clean);
  if (senderLanguage === 'th') return /[\u0E00-\u0E7F]/u.test(clean);

  return detectSenderLanguage(clean) === senderLanguage;
}

export function getLanguageSafeFallback(language: SenderLanguage): string {
  switch (language) {
    case 'ar':
    case 'ar_lb':
      return 'ما فهمت رسالتك بعد. بدك تطلب أكل، تشوف المنيو، تضيف صنف، تشوف السلة، أو تتابع طلب؟ مثلاً اكتب: «فرجيني المنيو» أو «بدي برغر».';
    case 'arabizi':
      return 'Ma fhemet 3layk. Baddak tetlob akel, tshouf l menu, tzid item, tshouf l cart, aw tetba3 talab? Fik t2elle: “warjine l menus” aw “bade burger”.';
    case 'mixed':
      return 'ما فهمت رسالتك بعد. Do you want to order food, see the menu, add an item, check your cart, or track an order?';
    case 'fr':
      return "Je n'ai pas compris. Voulez-vous commander, voir le menu, ajouter un article, consulter le panier ou suivre une commande ?";
    case 'es':
      return 'No he entendido. ¿Quieres pedir comida, ver el menú, añadir un artículo, consultar el carrito o seguir un pedido?';
    case 'de':
      return 'Ich habe das nicht verstanden. Möchtest du Essen bestellen, die Speisekarte sehen, etwas hinzufügen, den Warenkorb prüfen oder eine Bestellung verfolgen?';
    case 'it':
      return 'Non ho capito. Vuoi ordinare del cibo, vedere il menu, aggiungere un articolo, controllare il carrello o seguire un ordine?';
    case 'pt':
      return 'Não entendi. Você quer pedir comida, ver o menu, adicionar um item, consultar o carrinho ou acompanhar um pedido?';
    case 'tr':
      return 'Bunu anlamadım. Yemek siparişi vermek, menüyü görmek, ürün eklemek, sepeti kontrol etmek veya siparişi takip etmek mi istiyorsunuz?';
    case 'ru':
      return 'Я не понял сообщение. Вы хотите заказать еду, посмотреть меню, добавить блюдо, проверить корзину или отследить заказ?';
    case 'he':
      return 'לא הבנתי. האם תרצו להזמין אוכל, לראות את התפריט, להוסיף פריט, לבדוק את הסל או לעקוב אחרי הזמנה?';
    case 'hi':
      return 'मैं समझ नहीं पाया। क्या आप खाना ऑर्डर करना, मेनू देखना, कोई आइटम जोड़ना, कार्ट देखना या ऑर्डर ट्रैक करना चाहते हैं?';
    case 'zh':
      return '我没有理解您的消息。您想点餐、查看菜单、添加商品、查看购物车，还是跟踪订单？';
    case 'ja':
      return 'メッセージを理解できませんでした。料理を注文、メニューを見る、商品を追加、カートを確認、または注文を追跡しますか？';
    case 'ko':
      return '메시지를 이해하지 못했어요. 음식을 주문하거나, 메뉴를 보거나, 상품을 추가하거나, 장바구니 또는 주문을 확인할까요?';
    case 'th':
      return 'ฉันไม่เข้าใจข้อความ คุณต้องการสั่งอาหาร ดูเมนู เพิ่มสินค้า ตรวจสอบตะกร้า หรือติดตามคำสั่งซื้อใช่ไหม?';
    default:
      return 'I did not understand that yet. Do you want to order food, see the menu, add an item, check your cart, or track an order? For example, say “show me burgers” or “give me menus”.';
  }
}

/** Detects the repetitive generic answer that must be replaced by a real clarification. */
export function isGenericAssistanceReply(reply: string): boolean {
  const normalized = normalize(reply).replace(/[.!?,]+/g, '').replace(/\s+/g, ' ');
  return normalized.startsWith('i can help with your order what would you like to search for add or check')
    || normalized.startsWith('fini se3dak bi talabak shou baddak tfattesh tzid aw tet2akkad meno')
    || normalized.startsWith('فيني ساعدك بطلبك شو بتحب تفتش تضيف أو تتأكد منه');
}
