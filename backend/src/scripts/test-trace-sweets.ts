import { geminiService } from '../modules/ai/gemini.service.js';
import { customerService } from '../modules/customers/customer.service.js';
import { loadConversationState } from '../modules/ai/state/ai-state.types.js';

async function main() {
  const phone = process.argv[2] || '96170629775';
  const customer = await customerService.findOrCreateByPhone(phone, 'Trace Test');
  const state = await loadConversationState(customer.id, 1);
  console.log('Initial State:', JSON.stringify(state));

  const result = await geminiService.processCustomerMessage(phone, 'Lek khals 3abele sweets', 'text', {
    conversationId: state.conversationId || 1,
    requestId: `trace-sweets-${Date.now()}`,
  });
  console.log('RESULT:\n', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
