import http from 'http';
import WebSocket from 'ws';
import { app } from '../app.js';
import { initWebSocketServer, broadcastEvent } from '../services/websocket.js';
import { resetDemo } from './reset-demo.js';
import { signToken } from '../modules/auth/auth.service.js';

export async function runWebSocketTests(): Promise<boolean> {
  console.log('\n🧪 Starting WebSocket Real-Time Event Integration Tests (Step 3 & 10)...');
  await resetDemo();

  const server = http.createServer(app);
  initWebSocketServer(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

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

  const token = signToken({
    userId: 1,
    publicId: '00000000-0000-4000-8000-000000000001',
    email: 'ws-test@liondelivery.com',
    role: 'SUPERADMIN',
  });
  const wsClient = new WebSocket(wsUrl, ['lion-auth', token]);

  try {
    // 1. Connection establishment
    const connected = await new Promise<boolean>((resolve) => {
      wsClient.on('open', () => resolve(true));
      wsClient.on('error', () => resolve(false));
      setTimeout(() => resolve(false), 2000);
    });
    assert(connected, 'WebSocket client connects successfully to ws://127.0.0.1:port/ws');

    // 2. Event Envelope Verification (G-009: { type, payload, data, timestamp })
    const receivedEvent = await new Promise<any>((resolve) => {
      wsClient.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.type === 'ORDER_CREATED') resolve(parsed);
        } catch {
          // ignore non-json
        }
      });

      // Broadcast an event
      setTimeout(() => {
        broadcastEvent('ORDER_CREATED', {
          id: 999,
          order_number: 'ORD-2026-TEST',
          status: 'CONFIRMED',
          grand_total: 25.50,
        });
      }, 50);

      setTimeout(() => resolve(null), 2000);
    });

    assert(
      receivedEvent !== null &&
      receivedEvent.type === 'ORDER_CREATED' &&
      receivedEvent.payload?.order_number === 'ORD-2026-TEST' &&
      receivedEvent.data?.order_number === 'ORD-2026-TEST' &&
      Boolean(receivedEvent.timestamp),
      'WebSocket envelope satisfies dual-payload contract { type, payload, data, timestamp }',
      receivedEvent
    );

    // 3. Status update broadcast
    const updatedEvent = await new Promise<any>((resolve) => {
      wsClient.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.type === 'ORDER_UPDATED') resolve(parsed);
        } catch {
          // ignore
        }
      });

      setTimeout(() => {
        broadcastEvent('ORDER_UPDATED', {
          id: 999,
          order_number: 'ORD-2026-TEST',
          status: 'PREPARING',
        });
      }, 50);

      setTimeout(() => resolve(null), 2000);
    });

    assert(
      updatedEvent !== null &&
      updatedEvent.type === 'ORDER_UPDATED' &&
      updatedEvent.payload?.status === 'PREPARING',
      'WebSocket broadcasts ORDER_UPDATED with new status in real-time',
      updatedEvent
    );

  } finally {
    wsClient.close();
    server.close();
  }

  console.log(`\n🏁 WebSocket Test Results: ${passed} Passed, ${failed} Failed`);
  return failed === 0;
}

if (process.argv[1]?.endsWith('test-websocket.ts') || process.argv[1]?.endsWith('test-websocket.js')) {
  runWebSocketTests()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
