import http from 'http';
import { app } from '../app.js';
import { resetDemo } from './reset-demo.js';
import { execute } from '../database/db.js';
import { geminiService } from '../modules/ai/gemini.service.js';
import { config } from '../config/env.js';

export async function runApiTests(): Promise<boolean> {
  console.log('\n🧪 Starting Lion Delivery HTTP API Integration Tests (Step 9 & 10)...');
  await resetDemo();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

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
    // 1. Health Check
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData: any = await healthRes.json();
    assert(
      healthRes.status === 200 &&
      healthData.status === 'healthy' &&
      healthData.components?.database === 'UP' &&
      healthData.components?.redis === 'UP',
      'GET /health reports UP database & redis with 200 OK',
      healthData
    );

    // 2. Correlation Header
    assert(
      Boolean(healthRes.headers.get('x-request-id')),
      'Response includes x-request-id correlation tracking header'
    );

    // 3. Auth Login - Valid Admin
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@liondelivery.com', password: 'admin123' }),
    });
    const loginData: any = await loginRes.json();
    assert(
      loginRes.status === 200 && loginData.data?.token && loginData.data?.user?.role === 'SUPERADMIN',
      'POST /api/auth/login authenticates seeded admin and returns JWT',
      loginData
    );

    const token = loginData.data?.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // 4. Auth Login - Invalid Password
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@liondelivery.com', password: 'wrong_password_123' }),
    });
    assert(
      badLoginRes.status === 401,
      'POST /api/auth/login rejects invalid credentials with 401 Unauthorized'
    );

    // 5. Request Validation (G-004) - Bad Schema
    const badSchemaRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const badSchemaData: any = await badSchemaRes.json();
    assert(
      badSchemaRes.status === 400 && badSchemaData.error?.message?.includes('Invalid request body'),
      'POST /api/auth/login enforces Zod validation schema (400 Bad Request)',
      badSchemaData
    );

    // 6. Security & RBAC Enforcement (G-051)
    const unauthOrders = await fetch(`${baseUrl}/api/orders`);
    const unauthAnalytics = await fetch(`${baseUrl}/api/analytics/overview`);
    const unauthRelay = await fetch(`${baseUrl}/api/relay/1/messages`);
    const unauthDrivers = await fetch(`${baseUrl}/api/drivers`);
    assert(
      unauthOrders.status === 401 &&
      unauthAnalytics.status === 401 &&
      unauthRelay.status === 401 &&
      unauthDrivers.status === 401,
      'Operational APIs reject unauthenticated access with 401 Unauthorized (G-051)'
    );

    // 7. Internal People Directory and Live WhatsApp Inbox
    const contactsRes = await fetch(`${baseUrl}/api/dashboard/contacts`, { headers: authHeaders });
    const contactsData: any = await contactsRes.json();
    const inboxRes = await fetch(`${baseUrl}/api/whatsapp/inbox/conversations`, { headers: authHeaders });
    const inboxData: any = await inboxRes.json();
    assert(
      contactsRes.status === 200 &&
      contactsData.data?.counts?.users >= 1 &&
      contactsData.data?.counts?.drivers >= 3 &&
      contactsData.data?.counts?.customers >= 2 &&
      Array.isArray(contactsData.data?.users) &&
      Array.isArray(contactsData.data?.drivers) &&
      Array.isArray(contactsData.data?.customers),
      'GET /api/dashboard/contacts returns internal user, driver, and customer counts and full contact records',
      contactsData
    );
    assert(
      inboxRes.status === 200 && Array.isArray(inboxData.data),
      'GET /api/whatsapp/inbox/conversations returns authenticated live inbox data',
      inboxData
    );

    // 8. Authenticated Live Orders
    const ordersRes = await fetch(`${baseUrl}/api/orders`, { headers: authHeaders });
    const ordersData: any = await ordersRes.json();
    assert(
      ordersRes.status === 200 && Array.isArray(ordersData.data) && ordersData.data.length >= 4,
      'GET /api/orders (authenticated) returns baseline orders array from MySQL',
      ordersData.data?.length
    );

    // 8. Catalog & Search (Public)
    const searchRes = await fetch(`${baseUrl}/api/search/products?q=crispy`);
    const searchData: any = await searchRes.json();
    assert(
      searchRes.status === 200 && Array.isArray(searchData.data) && searchData.data.length > 0,
      'GET /api/search/products returns filtered menu options with delivery fees'
    );

    // 9. Analytics Overview (Authenticated, G-056)
    const analyticsRes = await fetch(`${baseUrl}/api/analytics/overview`, { headers: authHeaders });
    const analyticsData: any = await analyticsRes.json();
    assert(
      analyticsRes.status === 200 &&
      analyticsData.data?.completedOrders >= 4 &&
      analyticsData.data?.totalRevenue > 0,
      'GET /api/analytics/overview computes live metrics directly from MySQL orders (G-056)'
    );

    // 10. Management AI (Authenticated, G-056)
    const askRes = await fetch(`${baseUrl}/api/management-ai/ask`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ question: 'How many orders did we complete today?' }),
    });
    const askData: any = await askRes.json();
    assert(
      askRes.status === 200 &&
      askData.data?.answer?.toLowerCase().includes('completed') &&
      askData.data?.metrics?.completed >= 4,
      'POST /api/management-ai/ask returns executive answers grounded in live MySQL state (G-056)'
    );

    // 11. Relay Chat Contract & Complete Actor Authorization (G-040, G-052, G-058)
    // 11a. Login specific actors
    const d1Login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'driver1@liondelivery.com', password: 'driver123' }),
    });
    const d1Data: any = await d1Login.json();
    const d1Token = d1Data.data?.token;

    const d2Login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'driver2@liondelivery.com', password: 'driver123' }),
    });
    const d2Data: any = await d2Login.json();
    const d2Token = d2Data.data?.token;

    const c1Login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer1@liondelivery.com', password: 'customer123' }),
    });
    const c1Data: any = await c1Login.json();
    const c1Token = c1Data.data?.token;

    const c2Login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer2@liondelivery.com', password: 'customer123' }),
    });
    const c2Data: any = await c2Login.json();
    const c2Token = c2Data.data?.token;

    // 11b. Valid Driver 1 and Customer 1 can access Order 1
    const d1SendRes = await fetch(`${baseUrl}/api/relay/1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${d1Token}` },
      body: JSON.stringify({ text: 'Arrived at restaurant', senderRole: 'CUSTOMER' }), // Forged senderRole in body!
    });
    const d1SendData: any = await d1SendRes.json();
    assert(
      d1SendRes.status === 200 && d1SendData.data?.senderRole === 'DRIVER',
      'Driver posting overrides forged senderRole in body with authenticated role DRIVER (G-040)'
    );

    const c1SendRes = await fetch(`${baseUrl}/api/relay/1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c1Token}` },
      body: JSON.stringify({ text: 'Please leave at the door', senderRole: 'DRIVER' }), // Forged senderRole in body!
    });
    const c1SendData: any = await c1SendRes.json();
    assert(
      c1SendRes.status === 200 && c1SendData.data?.senderRole === 'CUSTOMER',
      'Customer posting overrides forged senderRole in body with authenticated role CUSTOMER (G-040)'
    );

    // 11c. Unrelated Driver 2 attempting to read or write Order 1 is rejected (403 Forbidden)
    const d2GetRes = await fetch(`${baseUrl}/api/relay/1/messages`, {
      headers: { 'Authorization': `Bearer ${d2Token}` },
    });
    const d2PostRes = await fetch(`${baseUrl}/api/relay/1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${d2Token}` },
      body: JSON.stringify({ text: 'Intruder message' }),
    });
    assert(
      d2GetRes.status === 403 && d2PostRes.status === 403,
      'Unrelated Driver 2 is rejected with 403 Forbidden when reading or posting to Order 1 (G-040)'
    );

    // 11d. Unrelated Customer 2 attempting to read or write Order 1 is rejected (403 Forbidden)
    const c2GetRes = await fetch(`${baseUrl}/api/relay/1/messages`, {
      headers: { 'Authorization': `Bearer ${c2Token}` },
    });
    const c2PostRes = await fetch(`${baseUrl}/api/relay/1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c2Token}` },
      body: JSON.stringify({ text: 'Intruder customer message' }),
    });
    assert(
      c2GetRes.status === 403 && c2PostRes.status === 403,
      'Unrelated Customer 2 is rejected with 403 Forbidden when reading or posting to Order 1 (G-040)'
    );

    // 11e. Operator posts without impersonation -> derived as SYSTEM
    const opSendRes = await fetch(`${baseUrl}/api/relay/1/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: 'Order has been dispatched by support team' }),
    });
    const opSendData: any = await opSendRes.json();
    assert(
      opSendRes.status === 200 && opSendData.data?.senderRole === 'SYSTEM',
      'Operator posting defaults to SYSTEM role without impersonation (G-040)'
    );

    const relayGetRes = await fetch(`${baseUrl}/api/relay/1/messages`, { headers: authHeaders });
    const relayGetData: any = await relayGetRes.json();
    assert(
      relayGetRes.status === 200 &&
      Array.isArray(relayGetData.data) &&
      relayGetData.data.some((m: any) => m.text === 'Please leave at the door'),
      'GET /api/relay/1/messages retrieves persisted relay messages from MySQL (G-052)'
    );

    // 12. Merchant Ready & Driver Reject Lifecycle (G-058)
    await execute(`UPDATE orders SET status = 'PREPARING' WHERE id = 1`);
    const readyRes = await fetch(`${baseUrl}/api/orders/1/ready`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const readyData: any = await readyRes.json();
    assert(
      readyRes.status === 200 && readyData.data?.status === 'READY_FOR_PICKUP',
      'POST /api/orders/:id/ready advances merchant order lifecycle to READY_FOR_PICKUP (G-058)'
    );

    const rejectRes = await fetch(`${baseUrl}/api/orders/1/driver-reject`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ reason: 'Vehicle issue' }),
    });
    assert(
      rejectRes.status === 200,
      'POST /api/orders/:id/driver-reject triggers driver reassignment workflow (G-058)'
    );

    // 13. WhatsApp Simulator Endpoint. Customer behavior is Gemini-only, so
    // use a local Gemini function-call fixture rather than a Smart NLU fallback.
    const originalGeminiKey = config.ai.geminiApiKey;
    config.ai.geminiApiKey = 'test_api_gemini_key';
    let geminiRound = 0;
    geminiService.setFetchFn(async () => {
      geminiRound += 1;
      const part = geminiRound === 1
        ? { functionCall: { name: 'search_catalog', args: { query: 'crispy chicken', max_budget: 15 } } }
        : { text: 'La2et 3a Crispy Chicken options la elak.' };
      return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const simRes = await fetch(`${baseUrl}/api/conversations/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '96170123456', message: 'bade crispy chicken under 15$' }),
    });
    const simData: any = await simRes.json();
    assert(
      simRes.status === 200 &&
      simData.data?.intent === 'SEARCH_RESULTS' &&
      simData.data?.replyText?.includes('Crispy Chicken'),
      'POST /api/conversations/message processes conversational AI query with state persistence'
    );
    geminiService.resetFetchFn();
    config.ai.geminiApiKey = originalGeminiKey;

  } finally {
    server.close();
  }

  console.log(`\n🏁 HTTP API Test Results: ${passed} Passed, ${failed} Failed`);
  return failed === 0;
}

if (process.argv[1]?.endsWith('test-api.ts') || process.argv[1]?.endsWith('test-api.js')) {
  runApiTests()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
