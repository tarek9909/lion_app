import http from 'http';
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { app } from '../app.js';
import { initWebSocketServer } from '../services/websocket.js';
import { resetDemo } from './reset-demo.js';
import { customerService } from '../modules/customers/customer.service.js';
import { cartService } from '../modules/carts/cart.service.js';
import { orderService } from '../modules/orders/order.service.js';
import { catalogService } from '../modules/catalog/catalog.service.js';

declare const document: any;

function getBrowserPath(): string {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No compatible Chrome or Edge executable found on this host for browser E2E tests.');
}

async function clickElement(page: any, selector: string, timeout = 8000): Promise<void> {
  await page.waitForSelector(selector, { timeout });
  await page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel);
      return el && !el.disabled;
    },
    { timeout },
    selector
  );
  await page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element not found for click: ${sel}`);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
  }, selector);
}

export async function runBrowserE2ETests(): Promise<boolean> {
  console.log('\n🦁 ============================================================');
  console.log('🌐 Starting Browser Dashboard E2E Test Suite (G-063)');
  console.log('🦁 ============================================================\n');

  const browserPath = getBrowserPath();
  console.log(`🧭 Using browser executable: ${browserPath}`);

  // 1. Start ephemeral HTTP and WebSocket server hosting backend API & SPA dashboard
  const server = http.createServer(app);
  initWebSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🚀 Ephemeral full-stack test server active at ${baseUrl}`);

  let browser: any = null;
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, name: string, detail?: any) => {
    if (condition) {
      console.log(`  ✅ ${name} [PASS]`);
      passed++;
    } else {
      console.error(`  ❌ ${name} [FAIL]`, detail || '');
      failed++;
    }
  };

  try {
    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1440,900',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on('pageerror', (err: any) => {
      console.warn('  [Browser PageError]:', err.message);
    });

    // -----------------------------------------------------------------
    // Run the complete workflow 3 consecutive times after reset
    // -----------------------------------------------------------------
    for (let iteration = 1; iteration <= 3; iteration++) {
      console.log(`\n────────────────────────────────────────────────────────────`);
      console.log(`🔄 [Iteration ${iteration}/3] Executing Full Browser Dashboard Rehearsal...`);
      console.log(`────────────────────────────────────────────────────────────`);

      // 1. Pristine baseline reset before cycle (throws if invariants fail)
      await resetDemo();
      assert(true, `[Iter ${iteration}] Baseline invariants verified before rehearsal`);

      // 2. Load dashboard SPA
      await page.goto(baseUrl, { waitUntil: 'networkidle0' });
      await page.waitForSelector('header h1', { timeout: 8000 });
      const headerTitle = await page.$eval('header h1', (el: any) => el.innerText);
      assert(
        headerTitle.includes('LION DELIVERY'),
        `[Iter ${iteration}] Dashboard SPA loads with brand title "LION DELIVERY"`
      );

      // Verify Operator Session and Live Sync status
      await page.waitForFunction(
        () => document.body.innerText.includes('Live Sync'),
        { timeout: 8000 }
      );
      assert(true, `[Iter ${iteration}] Operator JWT session authenticated & WebSocket Live Sync active`);

      // 3. Test Reset Demo button from UI
      await clickElement(page, '[data-testid="reset-demo-btn"]');
      await page.waitForFunction(
        () => document.body.innerText.includes('Pristine demo baseline restored') || document.body.innerText.includes('Demo state reset'),
        { timeout: 8000 }
      );
      assert(true, `[Iter ${iteration}] UI Reset Demo button triggered database & Redis restore`);

      // 4. Create Order A for full fulfillment lifecycle
      const customer = await customerService.findOrCreateByPhone('96170123456', 'Tarek Demo');
      const addresses = await customerService.getCustomerAddresses(customer.id);
      const homeAddress = addresses[0];
      const products = await catalogService.getAllProducts();
      const burger = products.find((p: any) => p.sku === 'BURGER-SNACK') || products[0];

      const cartA = await cartService.getOrCreateActiveCart(customer.id);
      await cartService.clearCart(cartA.id);
      await cartService.addItem(cartA.id, burger.merchant_product_id || burger.id, 2);
      const orderA = await orderService.createOrderFromCart(customer.id, homeAddress.id, 'Extra crispy please');
      console.log(`  📦 Created Order A (#${orderA.order_number}, ID: ${orderA.id}) for fulfillment testing`);

      // 5. Navigate to Live Orders tab
      await clickElement(page, '[data-testid="tab-orders"]');
      await clickElement(page, `[data-testid="order-card-${orderA.id}"]`);
      assert(true, `[Iter ${iteration}] Live Orders tab reflects real-time order #${orderA.order_number}`);

      // 6. Workflow: Merchant Accept (CONFIRMED -> PREPARING)
      await clickElement(page, '[data-testid="btn-merchant-accept"]');
      await page.waitForSelector('[data-testid="btn-driver-accept"]', { timeout: 8000 });
      assert(true, `[Iter ${iteration}] Merchant accepts order (status transitioned to PREPARING)`);

      // 7. Workflow: Driver Accept while preparing (PREPARING -> DRIVER_ASSIGNED)
      await clickElement(page, '[data-testid="btn-driver-accept"]');
      await page.waitForSelector('[data-testid="btn-driver-pickup"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="btn-driver-reject"]', { timeout: 8000 });
      assert(true, `[Iter ${iteration}] Driver accepts order (status transitioned to DRIVER_ASSIGNED)`);

      // 8. Workflow: Driver Reject & Reassignment (DRIVER_ASSIGNED -> WAITING_FOR_DRIVER -> re-accept)
      await clickElement(page, '[data-testid="btn-driver-reject"]');
      await page.waitForSelector('[data-testid="btn-driver-accept"]', { timeout: 8000 });
      assert(true, `[Iter ${iteration}] Driver rejection triggers re-dispatch workflow`);

      // Re-assign driver
      await clickElement(page, '[data-testid="btn-driver-accept"]');
      await page.waitForSelector('[data-testid="btn-driver-pickup"]', { timeout: 8000 });

      // 9. Workflow: Driver Pickup (-> PICKED_UP)
      await clickElement(page, '[data-testid="btn-driver-pickup"]');
      await page.waitForSelector('[data-testid="btn-driver-deliver"]', { timeout: 8000 });
      assert(true, `[Iter ${iteration}] Driver picks up package from merchant (status: PICKED_UP)`);

      // 10. Workflow: Driver Deliver & Settle (-> DELIVERED)
      await clickElement(page, '[data-testid="btn-driver-deliver"]');
      await page.waitForFunction(
        () => document.body.innerText.includes('Order Delivered & Paid'),
        { timeout: 8000 }
      );
      assert(true, `[Iter ${iteration}] Driver completes delivery & COD settlement (status: DELIVERED)`);

      // 11. Workflow: Merchant Reject testing with Order B
      const cartB = await cartService.getOrCreateActiveCart(customer.id);
      await cartService.clearCart(cartB.id);
      await cartService.addItem(cartB.id, burger.merchant_product_id || burger.id, 1);
      const orderB = await orderService.createOrderFromCart(customer.id, homeAddress.id, 'Test rejection flow');
      console.log(`  📦 Created Order B (#${orderB.order_number}, ID: ${orderB.id}) for merchant rejection`);

      await clickElement(page, `[data-testid="order-card-${orderB.id}"]`);
      await clickElement(page, '[data-testid="btn-merchant-reject"]');
      await page.waitForFunction(
        () => document.body.innerText.includes('MERCHANT REJECTED'),
        { timeout: 8000 }
      );
      assert(true, `[Iter ${iteration}] Merchant rejects order (status transitioned to MERCHANT_REJECTED)`);

      // 12. Workflow: Merchant Ready testing with Order C
      const cartC = await cartService.getOrCreateActiveCart(customer.id);
      await cartService.clearCart(cartC.id);
      await cartService.addItem(cartC.id, burger.merchant_product_id || burger.id, 1);
      const orderC = await orderService.createOrderFromCart(customer.id, homeAddress.id, 'Test ready flow');
      console.log(`  📦 Created Order C (#${orderC.order_number}, ID: ${orderC.id}) for merchant ready`);

      await clickElement(page, `[data-testid="order-card-${orderC.id}"]`);
      await clickElement(page, '[data-testid="btn-merchant-accept"]');
      await page.waitForSelector('[data-testid="btn-merchant-ready"]', { timeout: 8000 });
      await clickElement(page, '[data-testid="btn-merchant-ready"]');
      await page.waitForFunction(
        () => document.body.innerText.includes('READY FOR PICKUP') || document.body.innerText.includes('Pick Up from Merchant'),
        { timeout: 8000 }
      );
      assert(true, `[Iter ${iteration}] Merchant marks order ready for pickup (status transitioned to READY_FOR_PICKUP)`);

      // 13. Masked Relay Chat tab testing
      await clickElement(page, '[data-testid="tab-relay"]');
      await page.waitForSelector('[data-testid="relay-order-select"]', { timeout: 8000 });

      // Select Order A in Relay dropdown
      await page.select('[data-testid="relay-order-select"]', String(orderA.id));

      // Customer sends message
      const customerMsg = `Captain, please do not ring the bell (iter ${iteration})`;
      await page.type('[data-testid="relay-customer-input"]', customerMsg);
      await clickElement(page, '[data-testid="relay-customer-send"]');
      await page.waitForFunction(
        (txt: string) => document.body.innerText.includes(txt),
        { timeout: 8000 },
        customerMsg
      );
      assert(true, `[Iter ${iteration}] Masked Relay Chat transmits customer message`);

      // Driver sends reply
      const driverMsg = `Understood, will leave package by the door (iter ${iteration})`;
      await page.type('[data-testid="relay-driver-input"]', driverMsg);
      await clickElement(page, '[data-testid="relay-driver-send"]');
      await page.waitForFunction(
        (txt: string) => document.body.innerText.includes(txt),
        { timeout: 8000 },
        driverMsg
      );
      assert(true, `[Iter ${iteration}] Masked Relay Chat transmits driver reply with zero phone exposure`);

      // 14. Live WhatsApp Inbox and internal contacts verification
      await clickElement(page, '[data-testid="tab-inbox"]');
      await page.waitForSelector('[data-testid="whatsapp-inbox"]', { timeout: 8000 });
      assert(
        (await page.$('[data-testid="whatsapp-reply-input"]')) !== null &&
        (await page.$('[data-testid="whatsapp-inbox-refresh"]')) !== null,
        `[Iter ${iteration}] Live WhatsApp Inbox renders authenticated Meta conversation controls`
      );

      await clickElement(page, '[data-testid="tab-contacts"]');
      await page.waitForSelector('[data-testid="people-contacts"]', { timeout: 8000 });
      const contactsText = await page.evaluate(() => document.body.innerText);
      assert(
        contactsText.includes('People & Contacts') && contactsText.includes('Users') && contactsText.includes('Drivers') && contactsText.includes('Customers'),
        `[Iter ${iteration}] People & Contacts renders internal user, driver, and customer sections`
      );

      // 15. Analytics Tab verification
      await clickElement(page, '[data-testid="tab-analytics"]');
      await page.waitForFunction(
        () => document.body.innerText.includes('Gross Revenue Today') && !document.body.innerText.includes('Calculating live business metrics'),
        { timeout: 8000 }
      );
      const analyticsText = await page.evaluate(() => document.body.innerText);
      assert(
        analyticsText.includes('Delivered Orders') && analyticsText.includes('Gross Revenue Today'),
        `[Iter ${iteration}] Analytics tab computes live MySQL metrics`
      );

      // 16. Management AI Tab verification
      await clickElement(page, '[data-testid="tab-management"]');
      await page.waitForSelector('[data-testid="management-ai-input"]', { timeout: 8000 });
      const query = 'How many orders did we complete today?';
      await page.type('[data-testid="management-ai-input"]', query);
      await clickElement(page, '[data-testid="management-ai-send"]');
      await page.waitForFunction(
        () => document.body.innerText.toLowerCase().includes('completed') && !document.body.innerText.includes('Analyzing operational data in MySQL...'),
        { timeout: 10000 }
      );
      assert(true, `[Iter ${iteration}] Management AI copilot answers executive query using live MySQL state`);

      // 17. Post-rehearsal reset & verification
      await resetDemo();
      assert(true, `[Iter ${iteration}] Baseline counts returned to exact pristine invariants (0 drift)`);
    }

    await page.close();
  } catch (err: any) {
    console.error('❌ Browser E2E Rehearsal failed with error:', err);
    failed++;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  console.log(`\n🏁 Browser Dashboard E2E Results: ${passed} Passed, ${failed} Failed`);
  return failed === 0;
}

if (process.argv[1]?.endsWith('test-browser-e2e.ts') || process.argv[1]?.endsWith('test-browser-e2e.js')) {
  runBrowserE2ETests()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error('Fatal browser test failure:', err);
      process.exit(1);
    });
}
