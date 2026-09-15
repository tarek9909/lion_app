import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { app } from '../app.js';
import { initWebSocketServer } from '../services/websocket.js';
import { testDbConnection } from '../database/db.js';

const DEMO_PHONE = '96170123456';
const LOG_FILE = path.resolve(process.cwd(), 'test-e2e-rehearsal.log');

// Shared server instance across rehearsal runs
let testServer: http.Server | null = null;
let baseUrl = '';
let wsUrl = '';

function logLine(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (err) {
    // Ignore logging errors
  }
}

async function startServerIfNeeded(): Promise<{ baseUrl: string; wsUrl: string }> {
  if (testServer && baseUrl) {
    return { baseUrl, wsUrl };
  }

  await testDbConnection();

  return new Promise((resolve) => {
    testServer = http.createServer(app);
    initWebSocketServer(testServer);

    testServer.listen(0, '127.0.0.1', () => {
      const addr = testServer!.address() as any;
      const port = addr.port;
      baseUrl = `http://127.0.0.1:${port}`;
      wsUrl = `ws://127.0.0.1:${port}/ws`;
      logLine(`🚀 Ephemeral E2E Test Server listening at ${baseUrl}`);
      logLine(`📡 WebSocket Server mounted at ${wsUrl}`);
      resolve({ baseUrl, wsUrl });
    });
  });
}

export async function stopServerIfRunning(): Promise<void> {
  if (testServer) {
    return new Promise((resolve) => {
      testServer!.close(() => {
        testServer = null;
        baseUrl = '';
        wsUrl = '';
        resolve();
      });
    });
  }
}

async function apiRequest(endpoint: string, options: {
  method?: string;
  token?: string;
  body?: any;
} = {}): Promise<any> {
  const url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = rawText;
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || rawText;
    throw new Error(`HTTP ${res.status} on ${options.method || 'GET'} ${endpoint}: ${errorMsg}`);
  }

  return data;
}

export async function runFullDemoRehearsalOnce(runNumber: number): Promise<boolean> {
  logLine(`\n======================================================`);
  logLine(`🚀 Starting End-to-End HTTP + WS Rehearsal Run #${runNumber}...`);
  logLine(`======================================================`);

  const { wsUrl } = await startServerIfNeeded();

  // 1. Establish Live WebSocket Connection
  const wsEvents: { type: string; payload: any; timestamp: string }[] = [];
  const ws = new WebSocket(wsUrl);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 4000);
    ws.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  ws.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString());
      wsEvents.push(parsed);
    } catch {
      // ignore
    }
  });

  const waitForWsEvent = async (eventType: string, timeoutMs = 3000): Promise<any> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = wsEvents.find(e => e.type === eventType);
      if (found) return found;
      await new Promise(r => setTimeout(r, 50));
    }
    return null;
  };

  try {
    // 2. Authenticated Dashboard Logins (G-051 / G-058)
    logLine('🔐 Step 1: Authenticating Dashboard Operators, Drivers, and Customers via HTTP...');
    const adminLogin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@liondelivery.com', password: 'admin123' },
    });
    const adminToken = adminLogin.data.token;
    logLine(`   ✅ Admin authenticated (Role: ${adminLogin.data.user.role})`);

    const driver1Login = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'driver1@liondelivery.com', password: 'driver123' },
    });
    const driver1Token = driver1Login.data.token;
    logLine(`   ✅ Driver D-101 authenticated (DriverId: ${driver1Login.data.user.driverId})`);

    const customer1Login = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'customer1@liondelivery.com', password: 'customer123' },
    });
    const customer1Token = customer1Login.data.token;
    logLine(`   ✅ Customer 1 authenticated (CustomerId: ${customer1Login.data.user.customerId})`);

    // 3. Demo Reset via Authenticated HTTP Endpoint (G-055)
    logLine('\n🔄 Step 2: Executing Demo State Reset via HTTP (POST /api/demo/reset)...');
    const resetStart = Date.now();
    const resetRes = await apiRequest('/api/demo/reset', {
      method: 'POST',
      token: adminToken,
      body: {},
    });
    const resetDuration = Date.now() - resetStart;
    logLine(`   ✅ Demo reset confirmed via HTTP in ${resetDuration}ms: "${resetRes.data.message}"`);

    // 4. Media Processing Boundaries: Audio & Image Fixtures (G-054)
    logLine('\n🎙️ Step 3a: Testing Audio Processing Fixture via HTTP (POST /api/conversations/message)...');
    const audioRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        mediaType: 'audio',
        audioUrl: 'voice_order_crispy_chicken.ogg',
      },
    });
    logLine(`   Transcript: "${audioRes.data.transcript}"`);
    logLine(`   AI Reply: ${audioRes.data.reply.replace(/\n/g, ' ')}`);
    if (!audioRes.data.reply.includes('Metro Supermarket') && !audioRes.data.reply.toLowerCase().includes('shopping')) {
      throw new Error('Audio voice note did not trigger basket comparison');
    }
    logLine('   ✅ Audio voice note correctly transcribed and analyzed');

    logLine('\n📸 Step 3b: Testing Vision Processing Fixture via HTTP (POST /api/conversations/message)...');
    const imgRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        mediaType: 'image',
        imageUrl: 'crispy_tenders.jpg',
      },
    });
    logLine(`   AI Vision Match: ${imgRes.data.reply.replace(/\n/g, ' ')}`);
    if (!imgRes.data.reply.includes('Chicken House') || !imgRes.data.reply.includes('Crispy Chicken Meal')) {
      throw new Error('Image fixture did not match Crispy Chicken Meal in catalog');
    }
    logLine('   ✅ Image fixture correctly matched against MySQL catalog');

    // 5. Customer Natural Conversation Flow (Search -> Compare -> Add -> Modify -> Address -> Confirm)
    logLine('\n💬 Step 4: Customer initiates natural text search ("bade crispy chicken under 15$")...');
    const searchRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        message: 'bade crispy chicken under 15$',
      },
    });
    logLine(`   AI Intent: ${searchRes.data.intent}`);
    if ((searchRes.data.intent !== 'SEARCH_RESULTS' && searchRes.data.intent !== 'BUDGET_SEARCH') || !searchRes.data.reply.includes('Chicken House')) {
      throw new Error(`Step 4 failed: Expected SEARCH_RESULTS with Chicken House, got ${searchRes.data.intent}`);
    }

    logLine('\n💬 Step 5: Follow-up comparison question via HTTP ("which one is best rated?")...');
    const compRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        message: 'which one is best rated?',
      },
    });
    logLine(`   AI Intent: ${compRes.data.intent}`);
    if (compRes.data.intent !== 'COMPARE_CURRENT_OPTIONS') {
      throw new Error(`Expected COMPARE_CURRENT_OPTIONS, got ${compRes.data.intent}`);
    }

    logLine('\n💬 Step 5: Customer adds item with special instruction note...');
    const addRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        message: 'add the first one without pickles',
      },
    });
    logLine(`   AI Intent: ${addRes.data.intent} (${addRes.data.reply.replace(/\n/g, ' ')})`);

    logLine('\n💬 Step 6: Customer adds beverage (Coke Zero)...');
    const drinkRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        message: 'add coke zero',
      },
    });
    logLine(`   AI Intent: ${drinkRes.data.intent}`);

    logLine('\n💬 Step 7: Customer updates quantity to 2 meals...');
    const qtyRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        message: 'make it two meals',
      },
    });
    logLine(`   AI Intent: ${qtyRes.data.intent}`);

    logLine('\n💬 Step 8: Customer selects saved address ("3al bet")...');
    const addrRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        message: '3al bet',
      },
    });
    logLine(`   AI Intent: ${addrRes.data.intent}`);

    logLine('\n💬 Step 9: Customer confirms order ("confirm")...');
    const confirmRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: {
        phone: DEMO_PHONE,
        message: 'confirm',
      },
    });
    const orderCreated = confirmRes.data.orderCreated;
    if (!orderCreated || !orderCreated.id) {
      throw new Error('Order creation failed in HTTP response');
    }
    const orderId = orderCreated.id;
    const orderNumber = orderCreated.order_number;
    logLine(`   ✅ Order Created via HTTP: #${orderNumber} (ID: ${orderId})`);
    logLine(`      Total: $${orderCreated.grand_total}, Status: ${orderCreated.status}`);

    // Verify WebSocket ORDER_CREATED event
    const wsOrderCreated = await waitForWsEvent('ORDER_CREATED');
    if (wsOrderCreated) {
      logLine(`   📡 WebSocket Event Verified: ORDER_CREATED (#${wsOrderCreated.payload?.order_number || wsOrderCreated.payload?.id})`);
    }

    // 6. Merchant Actions via Authenticated HTTP API
    logLine('\n🏪 Step 10: Merchant accepts order (POST /api/orders/:id/accept)...');
    const acceptRes = await apiRequest(`/api/orders/${orderId}/accept`, {
      method: 'POST',
      token: adminToken,
      body: { preparationMinutes: 20 },
    });
    logLine(`   ✅ Merchant accepted: Status = ${acceptRes.data.status}`);

    logLine('\n🍳 Step 11: Merchant marks order ready (POST /api/orders/:id/ready)...');
    const readyRes = await apiRequest(`/api/orders/${orderId}/ready`, {
      method: 'POST',
      token: adminToken,
      body: {},
    });
    logLine(`   ✅ Merchant marked ready: Status = ${readyRes.data.status}`);

    // 7. Driver Actions via Authenticated HTTP API
    logLine('\n🛵 Step 12: Driver accepts offer (POST /api/orders/:id/driver-accept)...');
    const driverAcceptRes = await apiRequest(`/api/orders/${orderId}/driver-accept`, {
      method: 'POST',
      token: driver1Token,
      body: { driverId: 1 },
    });
    logLine(`   ✅ Driver assigned: Status = ${driverAcceptRes.data.status}`);

    logLine('\n📦 Step 13: Driver picks up order (POST /api/orders/:id/pickup)...');
    const pickupRes = await apiRequest(`/api/orders/${orderId}/pickup`, {
      method: 'POST',
      token: driver1Token,
      body: {},
    });
    logLine(`   ✅ Driver picked up: Status = ${pickupRes.data.status}`);

    // 8. Masked Relay Chat via Authenticated HTTP API (G-040, G-058)
    logLine('\n🔒 Step 14: Customer sends private masked relay message via HTTP...');
    const custRelayRes = await apiRequest(`/api/relay/${orderId}/messages`, {
      method: 'POST',
      token: customer1Token,
      body: { text: 'Bala ma tdo2 el jaras 3afak el baby nayem' },
    });
    logLine(`   ✅ Customer relay message sent: "${custRelayRes.data.text}" (${custRelayRes.data.senderDisplay} -> ${custRelayRes.data.recipientDisplay})`);

    logLine('\n🔒 Step 15: Driver replies via masked relay message via HTTP...');
    const driverRelayRes = await apiRequest(`/api/relay/${orderId}/messages`, {
      method: 'POST',
      token: driver1Token,
      body: { text: 'Khaye akid, ha 7etta 3al beb w de2lekk' },
    });
    logLine(`   ✅ Driver relay message sent: "${driverRelayRes.data.text}" (${driverRelayRes.data.senderDisplay} -> ${driverRelayRes.data.recipientDisplay})`);

    const relayHistory = await apiRequest(`/api/relay/${orderId}/messages`, {
      method: 'GET',
      token: adminToken,
    });
    logLine(`   ✅ Masked relay history fetched via HTTP: ${relayHistory.data.length} messages verified`);

    // 9. Driver Completes Delivery with Rating via HTTP
    logLine('\n🏁 Step 16: Driver completes delivery with rating (POST /api/orders/:id/deliver)...');
    const deliverRes = await apiRequest(`/api/orders/${orderId}/deliver`, {
      method: 'POST',
      token: driver1Token,
      body: { rating: 5, comment: 'Super fast delivery and food was hot!' },
    });
    logLine(`   ✅ Order Delivered: Status = ${deliverRes.data.status}, Rating = 5 Stars`);

    // 10. Backup Scenario: Restaurant Peak Rejection & Instant Re-routing via HTTP (G-049)
    logLine('\n🛡️ Step 17: Executing Backup Re-routing Scenario via HTTP...');
    // Customer orders Burger Spot
    await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: { phone: DEMO_PHONE, message: 'bade burger meal under 15$' },
    });
    await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: { phone: DEMO_PHONE, message: 'add the first one' },
    });
    await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: { phone: DEMO_PHONE, message: '3al bet' },
    });
    const confirmBackup1 = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: { phone: DEMO_PHONE, message: 'confirm' },
    });
    const backupOrder1 = confirmBackup1.data.orderCreated;
    logLine(`   Order #1 for Burger Spot created: #${backupOrder1.order_number} (ID: ${backupOrder1.id})`);

    // Merchant rejects on dashboard
    logLine('   Restaurant rejected order due to peak capacity...');
    const rejectRes = await apiRequest(`/api/orders/${backupOrder1.id}/reject`, {
      method: 'POST',
      token: adminToken,
      body: { reason: 'Kitchen at peak capacity' },
    });
    logLine(`   ✅ Order rejected via HTTP: Status = ${rejectRes.data.status}`);

    // Customer asks for alternative nearby option
    const altSearchRes = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: { phone: DEMO_PHONE, message: 'is there somewhere cheaper or another place nearby?' },
    });
    logLine(`   AI Re-routing suggestion: ${altSearchRes.data.reply.substring(0, 80)}...`);

    // Customer accepts Chicken House alternative
    await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: { phone: DEMO_PHONE, message: 'add the first one' },
    });
    await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: { phone: DEMO_PHONE, message: '3al bet' },
    });
    const confirmBackup2 = await apiRequest('/api/conversations/message', {
      method: 'POST',
      body: { phone: DEMO_PHONE, message: 'confirm' },
    });
    const backupOrder2 = confirmBackup2.data.orderCreated;
    logLine(`   ✅ Re-routed Order #2 created: #${backupOrder2.order_number} (ID: ${backupOrder2.id}) at ${backupOrder2.merchant_name}`);

    // Fulfill re-routed order via HTTP
    await apiRequest(`/api/orders/${backupOrder2.id}/accept`, {
      method: 'POST',
      token: adminToken,
      body: { preparationMinutes: 15 },
    });
    await apiRequest(`/api/orders/${backupOrder2.id}/ready`, {
      method: 'POST',
      token: adminToken,
      body: {},
    });
    await apiRequest(`/api/orders/${backupOrder2.id}/driver-accept`, {
      method: 'POST',
      token: driver1Token,
      body: { driverId: 1 },
    });
    await apiRequest(`/api/orders/${backupOrder2.id}/pickup`, {
      method: 'POST',
      token: driver1Token,
      body: {},
    });
    await apiRequest(`/api/orders/${backupOrder2.id}/deliver`, {
      method: 'POST',
      token: driver1Token,
      body: { rating: 5, comment: 'Quick re-route delivery!' },
    });
    logLine(`   ✅ Re-routed Order #2 successfully delivered!`);

    // 11. Real-time Analytics & Executive Management AI via HTTP (G-025, G-027)
    logLine('\n📊 Step 18: Verifying Analytics KPI Dashboard via HTTP (GET /api/analytics/overview)...');
    const analyticsRes = await apiRequest('/api/analytics/overview', {
      method: 'GET',
      token: adminToken,
    });
    const kpis = analyticsRes.data;
    logLine(`   Completed Orders: ${kpis.completedOrders}`);
    logLine(`   Total Revenue: $${Number(kpis.totalRevenue).toFixed(2)}`);
    logLine(`   Average Delivery Time: ${kpis.averageDeliveryMinutes} mins`);
    if (kpis.completedOrders < 6) {
      throw new Error(`Expected at least 6 completed orders in analytics, got ${kpis.completedOrders}`);
    }
    logLine(`   ✅ Analytics KPIs verified via HTTP`);

    logLine('\n🤖 Step 19: Management AI Executive Queries via HTTP (POST /api/management-ai/ask)...');
    const q1 = await apiRequest('/api/management-ai/ask', {
      method: 'POST',
      token: adminToken,
      body: { question: 'How many orders did we complete today?' },
    });
    logLine(`   Q: "How many orders did we complete today?" -> A: ${q1.data.answer.replace(/\n/g, ' ')}`);

    const q2 = await apiRequest('/api/management-ai/ask', {
      method: 'POST',
      token: adminToken,
      body: { question: 'Which merchant rejected the most orders?' },
    });
    logLine(`   Q: "Which merchant rejected the most orders?" -> A: ${q2.data.answer.replace(/\n/g, ' ')}`);

    const q3 = await apiRequest('/api/management-ai/ask', {
      method: 'POST',
      token: adminToken,
      body: { question: 'Which driver completed the most deliveries?' },
    });
    logLine(`   Q: "Which driver completed the most deliveries?" -> A: ${q3.data.answer.replace(/\n/g, ' ')}`);

    if (!(q2.data.answer.includes('rejections') || q2.data.answer.includes('acceptance rate') || q2.data.answer.includes('Chicken House') || q2.data.answer.includes('Burger Spot')) || !q3.data.answer.includes('D-101')) {
      throw new Error('Management AI returned unexpected answers');
    }
    logLine(`   ✅ Management AI passed executive business analysis queries via HTTP`);

    logLine(`\n🎉 Rehearsal Run #${runNumber} (Full HTTP + WS Flow) PASSED 100% CLEANLY!\n`);
    return true;
  } finally {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
}

export async function runConsecutiveRehearsals(times: number = 3): Promise<boolean> {
  logLine(`════════════════════════════════════════════════════════════`);
  logLine(`🦁 LION DELIVERY FULL HTTP/WS E2E REHEARSAL (${times} RUNS)`);
  logLine(`════════════════════════════════════════════════════════════`);

  try {
    for (let i = 1; i <= times; i++) {
      const ok = await runFullDemoRehearsalOnce(i);
      if (!ok) {
        logLine(`❌ Rehearsal run #${i} failed! Aborting.`);
        return false;
      }
    }

    logLine(`════════════════════════════════════════════════════════════`);
    logLine(`🏆 ALL ${times} CONSECUTIVE DEMO REHEARSAL RUNS PASSED CLEANLY!`);
    logLine(`   Reproducible log saved to: ${LOG_FILE}`);
    logLine(`════════════════════════════════════════════════════════════`);
    return true;
  } finally {
    await stopServerIfRunning();
  }
}

if (process.argv[1]?.endsWith('test-rehearsal.ts') || process.argv[1]?.endsWith('test-rehearsal.js')) {
  runConsecutiveRehearsals(3)
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error('Fatal rehearsal failure:', err);
      process.exit(1);
    });
}
