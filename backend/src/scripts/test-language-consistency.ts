import {
  detectSenderLanguage,
  getLanguageSafeFallback,
  isResponseInSenderLanguage,
} from '../modules/ai/sender-language.js';
import { localizeReplyText } from '../modules/ai/response-localizer.js';
import { getGeminiSystemPrompt } from '../modules/ai/prompts/gemini.system-prompt.js';
import { INTERACTIVE_NOT_FOUND_REPLY } from '../modules/ai/interactive-not-found.js';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Language consistency assertion failed: ${message}`);
  console.log(`  PASS ${message}`);
}

const CLARIFICATION_REPLY =
  "I didn't quite understand that. Could you clarify what you'd like, for example: search for a product, add an item, or check your cart?";

export function runLanguageConsistencyTests(): void {
  console.log('\nTesting sender-language detection and response consistency...');

  const cases: Array<[string, string]> = [
    ['English', 'Can you add a burger please?'],
    ['Arabic script', 'بدي برغر لو سمحت'],
    ['Lebanese Arabizi', 'bade crispy chicken 3al bet'],
    ['Mixed Arabic and English', 'بدي crispy chicken مع extra garlic'],
    ['French', 'Bonjour, je voudrais un burger s il vous plaît'],
    ['Spanish', 'Hola, quiero un burger por favor'],
    ['German', 'Hallo, ich möchte einen burger bitte'],
    ['Italian', 'Ciao, vorrei un burger per favore'],
    ['Portuguese', 'Olá, quero um burger por favor'],
    ['Turkish', 'Merhaba, bir burger istiyorum lütfen'],
    ['Russian script', 'Привет, я хочу бургер'],
    ['Hebrew script', 'שלום, אני רוצה המבורגר'],
  ];

  for (const [label, message] of cases) {
    const language = detectSenderLanguage(message);
    const safeReply = getLanguageSafeFallback(language);
    assert(isResponseInSenderLanguage(language, safeReply), `${label} gets a same-language safe reply (${language})`);
  }

  const detected = cases.map(([, message]) => detectSenderLanguage(message));
  assert(detected[0] === 'en', 'English is detected as en');
  assert(detected[1] === 'ar', 'Arabic script is detected as ar');
  assert(detected[2] === 'arabizi', 'Arabizi is detected as arabizi');
  assert(detected[3] === 'mixed', 'Code-switched Arabic/English is detected as mixed');
  assert(detected[4] === 'fr', 'French is detected as fr');

  for (const language of ['ar', 'arabizi', 'fr'] as const) {
    const clarification = localizeReplyText(CLARIFICATION_REPLY, language);
    const notFound = localizeReplyText(INTERACTIVE_NOT_FOUND_REPLY, language);
    assert(isResponseInSenderLanguage(language, clarification), `${language} clarification stays in sender language`);
    assert(isResponseInSenderLanguage(language, notFound), `${language} catalog miss stays in sender language`);
  }

  const prompt = getGeminiSystemPrompt(undefined, 'fr');
  assert(prompt.includes('detected as French'), 'Gemini prompt receives the current sender language');
  assert(prompt.includes('answer in French'), 'Gemini prompt mandates French output');
  assert(prompt.includes('Never send a default English reply'), 'Gemini prompt forbids English drift');

  console.log('Language consistency tests passed.');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/test-language-consistency.ts')) {
  try {
    runLanguageConsistencyTests();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

