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
      'wein', 'wen', '3al', '3albet', '3andon', 'hal', 'shi', '7elo', 'akid', 'akeed',
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
  return normalize(text).match(/[\p{L}]+(?:'[\p{L}]+)?/gu) || [];
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
  const strongWords = /\b(?:bade|baddi|badde|baddak|baddik|zidli|sawiya|sawiyon|kifak|kifik|shou|chou|wein|wen|3al|3albet|3andon|akid|akeed|ta2kid|ya3tik|ma2liyeh|mosa3adeh|a7san|arkhas|kabbis|mar7aba|tfaddal|bse3dak)\b/g;
  const encodedWords = /\b[a-z]*[2356789][a-z]+\b/g;
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

  // Arabizi markers are deliberately weighted above generic English words.
  if (arabizi >= 3) return 'arabizi';

  const best = scores[0];
  const second = scores[1];
  if (best && best.score > 0 && (!second || best.score > second.score || best.language === 'fr')) {
    return best.language;
  }

  return 'en';
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
      return 'فيني ساعدك بطلبك. شو بتحب تفتّش، تضيف، أو تتأكد منه؟';
    case 'arabizi':
      return 'Fini se3dak bi talabak. Shou baddak tfattesh, tzid, aw tet2akkad meno?';
    case 'mixed':
      return 'فيني ساعدك بطلبك. What would you like to search, add, or check?';
    case 'fr':
      return 'Je peux vous aider avec votre commande. Que souhaitez-vous rechercher, ajouter ou vérifier ?';
    case 'es':
      return 'Puedo ayudarte con tu pedido. ¿Qué quieres buscar, añadir o comprobar?';
    case 'de':
      return 'Ich helfe dir gerne bei deiner Bestellung. Was möchtest du suchen, hinzufügen oder prüfen?';
    case 'it':
      return 'Posso aiutarti con il tuo ordine. Cosa vuoi cercare, aggiungere o verificare?';
    case 'pt':
      return 'Posso ajudar com o seu pedido. O que você quer buscar, adicionar ou verificar?';
    case 'tr':
      return 'Siparişinize yardımcı olabilirim. Ne aramak, eklemek veya kontrol etmek istersiniz?';
    case 'ru':
      return 'Я помогу с вашим заказом. Что найти, добавить или проверить?';
    case 'he':
      return 'אני יכול לעזור בהזמנה שלך. מה לחפש, להוסיף או לבדוק?';
    case 'hi':
      return 'मैं आपके ऑर्डर में मदद कर सकता हूँ। आप क्या खोजना, जोड़ना या जाँचना चाहते हैं?';
    case 'zh':
      return '我可以帮您处理订单。您想搜索、添加或查看什么？';
    case 'ja':
      return 'ご注文をお手伝いします。何を検索、追加、確認しますか？';
    case 'ko':
      return '주문을 도와드릴게요. 무엇을 검색하거나 추가하거나 확인할까요?';
    case 'th':
      return 'ฉันช่วยจัดการคำสั่งซื้อของคุณได้ คุณต้องการค้นหา เพิ่ม หรือตรวจสอบอะไร?';
    default:
      return 'I can help with your order. What would you like to search for, add, or check?';
  }
}
