import http from 'http';
import { app } from './app.js';
import { config, validateStartupConfig } from './config/env.js';
import { testDbConnection } from './database/db.js';
import { initWebSocketServer } from './services/websocket.js';
import { cartService } from './modules/carts/cart.service.js';
import { whatsappWorker } from './modules/conversations/whatsapp.worker.js';

const server = http.createServer(app);

// Mount WebSockets
initWebSocketServer(server);

async function startServer() {
  // 1. Validate startup configuration fail-fast (G-061)
  validateStartupConfig();

  // 2. Verify database connectivity
  const dbOk = await testDbConnection();
  if (!dbOk) {
    console.error('❌ Failed to connect to MySQL database. Exiting.');
    process.exit(1);
  }
  console.log(`✅ Connected to MySQL database "${config.db.database}" on ${config.db.host}:${config.db.port}`);
  cartService.startAbandonmentScheduler();
  whatsappWorker.start();

  server.listen(config.port, () => {
    console.log(`🦁 Lion Delivery API Server running at http://localhost:${config.port}`);
    console.log(`📡 WebSocket server running at ws://localhost:${config.port}/ws`);
    console.log(`🌍 Environment: ${config.nodeEnv} | WhatsApp: ${config.whatsapp.mode} | Media: ${config.media.mode}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
