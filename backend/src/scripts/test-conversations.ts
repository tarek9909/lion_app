import { aiService } from '../modules/ai/ai.service.js';
import { resetDemo } from './reset-demo.js';

interface TestCase {
  id: number;
  name: string;
  message: string;
  mediaType?: 'text' | 'image' | 'audio';
  expectedIntent: string;
  expectedContentSubstrings: string[];
}

const TEST_PHONE = '96170123456';

const testCases: TestCase[] = [
  {
    id: 1,
    name: 'Budget Search',
    message: 'bade crispy chicken under 15$',
    expectedIntent: 'SEARCH_RESULTS',
    expectedContentSubstrings: ['Crispy Chicken', '$10.50', 'Burger Spot', '$12.00'],
  },
  {
    id: 2,
    name: 'Context Memory & Comparison',
    message: 'which one is best rated?',
    expectedIntent: 'COMPARE_CURRENT_OPTIONS',
    expectedContentSubstrings: ['Chicken House', '4.8⭐'],
  },
  {
    id: 3,
    name: 'Selection & Notes',
    message: 'add the second one bas without pickles',
    expectedIntent: 'ADD_TO_CART',
    expectedContentSubstrings: ['Burger Spot', 'No pickles', 'Cart Subtotal'],
  },
  {
    id: 4,
    name: 'Product Modification',
    message: 'without pickles',
    expectedIntent: 'PRODUCT_MODIFICATION',
    expectedContentSubstrings: ['No pickles'],
  },
  {
    id: 5,
    name: 'Add Additional Product',
    message: 'add coke zero',
    expectedIntent: 'ADD_TO_CART',
    expectedContentSubstrings: ['Coke Zero', 'total'],
  },
  {
    id: 6,
    name: 'Quantity Correction',
    message: 'actually make it one meal',
    expectedIntent: 'UPDATE_QUANTITY',
    expectedContentSubstrings: ['1 meal', 'total'],
  },
  {
    id: 7,
    name: 'Ambiguity & Clarification Rule',
    message: 'large',
    expectedIntent: 'CLARIFICATION_REQUIRED',
    expectedContentSubstrings: ['Do you mean the Coke or the meal?'],
  },
  {
    id: 8,
    name: 'Arabizi Request',
    message: 'bade shi 7elo bas ma ykoun ghale',
    expectedIntent: 'SEARCH_DESSERTS',
    expectedContentSubstrings: ['Beirut Sweets', 'Crepe', 'Cake'],
  },
  {
    id: 9,
    name: 'Arabic Request',
    message: 'بدي شي حلو تحت ٣ دولار',
    expectedIntent: 'SEARCH_DESSERTS',
    expectedContentSubstrings: ['Beirut Sweets', '2.50'],
  },
  {
    id: 10,
    name: 'Mixed Language Request',
    message: 'anything chocolate bas under 3$',
    expectedIntent: 'SEARCH_DESSERTS',
    expectedContentSubstrings: ['Chocolate Cake', '2.50'],
  },
  {
    id: 11,
    name: 'Voice Note Ingestion',
    message: 'bade 2 coke zero w lays w shufle arkhass mahal',
    mediaType: 'audio',
    expectedIntent: 'BASKET_COMPARISON',
    expectedContentSubstrings: ['Metro Supermarket', 'Coke Zero', 'Lays', 'Majmou3 l basket kello'],
  },
  {
    id: 12,
    name: 'Image Understanding (Context bound)',
    message: 'do they have this?',
    mediaType: 'image',
    expectedIntent: 'IMAGE_SEARCH',
    expectedContentSubstrings: ['Crispy Chicken Meal', '$10.50'],
  },
  {
    id: 13,
    name: 'Merchant Comparison',
    message: 'is there somewhere cheaper?',
    expectedIntent: 'SEARCH_CHEAPER',
    expectedContentSubstrings: ['Chicken House', '$10.50'],
  },
  {
    id: 14,
    name: 'Saved Address Resolution',
    message: '3al bet',
    expectedIntent: 'ADDRESS_SELECTED',
    expectedContentSubstrings: ['Home', 'Molakhas el talab l nehe2e', 'confirm'],
  },
  {
    id: 15,
    name: 'Checkout Confirmation',
    message: 'confirm',
    expectedIntent: 'ORDER_CONFIRMED',
    expectedContentSubstrings: ['Order Confirmed', 'Order #ORD-2026-'],
  },
];

export async function runConversationTestPack(): Promise<boolean> {
  console.log('🧪 Starting Lion Delivery AI Conversation Test Pack (15 Scenarios)...');
  await resetDemo();

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    try {
      const result = await aiService.processCustomerMessage(TEST_PHONE, tc.message, tc.mediaType || 'text');

      const intentOk = result.intent === tc.expectedIntent;
      const contentOk = tc.expectedContentSubstrings.every(s =>
        result.replyText.toLowerCase().includes(s.toLowerCase())
      );

      if (intentOk && contentOk) {
        console.log(`  ✅ Test ${tc.id}: ${tc.name} [PASS]`);
        passed++;
      } else {
        console.error(`  ❌ Test ${tc.id}: ${tc.name} [FAIL]`);
        if (!intentOk) console.error(`     Expected intent: ${tc.expectedIntent}, got: ${result.intent}`);
        if (!contentOk) console.error(`     Reply missing expected content. Reply: ${result.replyText}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`  ❌ Test ${tc.id}: ${tc.name} [ERROR]:`, err.message);
      failed++;
    }
  }

  console.log(`\n🏁 Test Pack Results: ${passed} Passed, ${failed} Failed out of ${testCases.length}`);
  return failed === 0;
}

if (process.argv[1]?.endsWith('test-conversations.ts') || process.argv[1]?.endsWith('test-conversations.js')) {
  runConversationTestPack()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch(() => process.exit(1));
}
