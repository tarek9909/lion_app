import { resetDemo } from './reset-demo.js';
import { query, execute } from '../database/db.js';
import { customerService } from '../modules/customers/customer.service.js';
import { cartService } from '../modules/carts/cart.service.js';
import { orderService } from '../modules/orders/order.service.js';
import { mediaService } from '../modules/media/media.service.js';
import { aiService } from '../modules/ai/ai.service.js';
import { managementAIService } from '../modules/management-ai/management-ai.service.js';
import { config } from '../config/env.js';
import { convertUsdToLbp } from '../shared/money.js';
import { v4 as uuidv4 } from 'uuid';

export async function runDemoGapTests(): Promise<boolean> {
  console.log('\n🧪 Starting DG-001–DG-008 regression suite...');
  await resetDemo();

  let passed = 0;
  let failed = 0;
  const assert = (condition: boolean, name: string, detail?: unknown) => {
    if (condition) {
      console.log(`  ✅ ${name} [PASS]`);
      passed += 1;
    } else {
      console.error(`  ❌ ${name} [FAIL]`, detail || '');
      failed += 1;
    }
  };

  try {
    assert(
      config.settlement.lbpPerUsd === 89500 && convertUsdToLbp(14.50) === 1297750,
      'DG-001 converts checkout totals using the seeded LBP exchange rate'
    );

    const customer = await customerService.findOrCreateByPhone('96170123456');
    const duplicate = await execute(`
      INSERT INTO customer_addresses
        (public_id, customer_id, label, formatted_address, area_name, landmark, is_default, status)
      VALUES (?, ?, 'Home', 'Nejmeh Square Building', 'Nejmeh Square', 'Near the clock tower', 0, 'ACTIVE')
    `, [uuidv4(), customer.id]);
    const resolution = await customerService.resolveAddressCandidates(customer.id, 'home');
    assert(resolution.ambiguous && resolution.candidates.length === 2, 'DG-002 asks for clarification when Home labels collide');
    assert((await customerService.resolveAddressByPhrase(customer.id, 'home')) === null, 'DG-002 legacy resolver refuses to guess');
    await execute(`DELETE FROM customer_addresses WHERE id = ?`, [(duplicate as any).insertId]);

    const cart = await cartService.getOrCreateActiveCart(customer.id);
    const [product] = await query<any[]>(`
      SELECT mp.id FROM merchant_products mp
      JOIN merchant_branches mb ON mb.id = mp.merchant_branch_id
      JOIN merchants m ON m.id = mb.merchant_id
      WHERE m.name = 'Chicken House' LIMIT 1
    `);
    await cartService.addItem(cart.id, product.id, 1);
    const address = await customerService.resolveAddressByPhrase(customer.id, 'home');
    const order = await orderService.createOrderFromCart(customer.id, address!.id, null, `demo_gap_${Date.now()}`);
    await execute(`UPDATE drivers SET availability_status = 'BUSY'`);
    const waiting = await orderService.merchantAccept(order.id, 20);
    const alerts = await query<any[]>(`SELECT * FROM operational_alerts WHERE order_id = ? AND alert_type = 'NO_DRIVERS_AVAILABLE'`, [order.id]);
    assert(waiting.status === 'WAITING_FOR_DRIVER' && alerts.length > 0, 'DG-003 escalates when the entire driver pool is exhausted');

    const driverLocations = await query<any[]>(`
      SELECT d.display_code, dl.latitude, dl.longitude
      FROM drivers d
      JOIN driver_locations dl ON dl.driver_id = d.id
      WHERE dl.id = (SELECT latest.id FROM driver_locations latest WHERE latest.driver_id = d.id ORDER BY latest.recorded_at DESC, latest.id DESC LIMIT 1)
    `);
    assert(driverLocations.length === 3 && driverLocations.every((d) => d.latitude != null && d.longitude != null), 'DG-004 exposes seeded GPS positions for the fleet view');

    const unknown = await managementAIService.askQuestion('What is the weather today?');
    const sales = await managementAIService.askQuestion('Which merchant has the highest sales?');
    assert(unknown.intent === 'UNKNOWN_QUERY' && unknown.answer.includes('grounded operational questions'), 'DG-006 does not fabricate answers for out-of-domain copilot questions');
    assert(sales.intent === 'TOP_MERCHANT_SALES', 'DG-006 supports controlled merchant-sales aggregation wording');

    await resetDemo();
    const reminderCustomer = await customerService.findOrCreateByPhone('96170123456');
    const reminderCart = await cartService.getOrCreateActiveCart(reminderCustomer.id);
    await cartService.addItem(reminderCart.id, product.id, 1);
    await execute(`UPDATE carts SET updated_at = CURRENT_TIMESTAMP(3) - INTERVAL 31 MINUTE WHERE id = ?`, [reminderCart.id]);
    const firstReminder = await cartService.sendAbandonmentReminders();
    const secondReminder = await cartService.sendAbandonmentReminders();
    assert(firstReminder === 1 && secondReminder === 0, 'DG-007 sends one cart-abandonment reminder per inactivity window');

    const image = await mediaService.processImageMessage('ambiguous_food_fixture.jpg', undefined, 'ambiguous multiple matches');
    const imageReply = await aiService.processCustomerMessage(
      '96170123456',
      `[IMAGE_CANDIDATES] ${(image.candidates || []).map((candidate: any, index: number) => `${index + 1}: ${candidate.productName}`).join(' | ')}`,
      'image'
    );
    assert(image.confidence >= 0.60 && image.confidence <= 0.85 && (image.candidates || []).length > 1, 'DG-008 image analysis returns multiple candidates at ambiguous confidence');
    assert(
      (imageReply.replyText.includes('Which one') || imageReply.replyText.includes('Ayya we7de')) &&
        imageReply.replyText.includes('1.') &&
        !imageReply.replyText.includes('*') &&
        !imageReply.replyText.includes('#'),
      'DG-008 asks the customer to choose among numbered image matches in the sender language'
    );

    console.log(`\n🏁 DG-001–DG-008 Results: ${passed} Passed, ${failed} Failed`);
    return failed === 0;
  } finally {
    await resetDemo();
  }
}

if (process.argv[1]?.endsWith('test-demo-gaps.ts') || process.argv[1]?.endsWith('test-demo-gaps.js')) {
  runDemoGapTests()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
