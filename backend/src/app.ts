import express from 'express';
import cors from 'cors';
import { verifyWebhook, handleWebhook, simulateWhatsAppMessage, getConversations } from './modules/conversations/conversation.controller.js';
import {
  getLiveOrders,
  getOrderById,
  merchantAcceptOrder,
  merchantRejectOrder,
  merchantReadyOrder,
  driverAcceptOrder,
  driverRejectOrder,
  driverPickupOrder,
  driverDeliverOrder,
  getDrivers,
} from './modules/orders/order.controller.js';
import { getRelayMessages, sendRelayMessage } from './modules/relay/relay.controller.js';
import { getOverviewAnalytics } from './modules/analytics/analytics.controller.js';
import { askManagementAI } from './modules/management-ai/management-ai.controller.js';
import { getMerchants, getProducts, searchProducts } from './modules/catalog/catalog.controller.js';
import {
  getDashboardContacts,
  getWhatsAppInboxConversations,
  getWhatsAppInboxMessages,
  sendWhatsAppInboxReply,
} from './modules/dashboard/dashboard.controller.js';
import { customerService } from './modules/customers/customer.service.js';
import { login } from './modules/auth/auth.controller.js';
import { authenticate, requireRoles } from './modules/auth/auth.middleware.js';
import { resetDemo } from './scripts/reset-demo.js';
import { sendSuccess, sendError } from './shared/response.js';
import { testDbConnection } from './database/db.js';
import { redis } from './database/redis.js';
import { validateBody, validateParams } from './shared/validation.js';
import {
  loginSchema,
  simulateMessageSchema,
  managementAiSchema,
  merchantAcceptSchema,
  merchantRejectSchema,
  merchantReadySchema,
  driverAcceptSchema,
  driverRejectSchema,
  driverDeliverSchema,
  relayMessageSchema,
  whatsappInboxReplySchema,
  idParamSchema,
  orderIdParamSchema,
} from './shared/schemas.js';

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const dashboardDist = path.resolve(process.cwd(), '../dashboard/dist');

export const app = express();

app.use(cors());
app.use((req, res, next) => {
  const reqId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = reqId;
  res.setHeader('x-request-id', reqId);
  next();
});
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Health endpoints verifying real MySQL and Redis connectivity (G-040)
app.get(['/health', '/api/health', '/api/v1/health'], async (req, res) => {
  const dbOk = await testDbConnection();
  const redisOk = await redis.ping();
  const allHealthy = dbOk && redisOk;
  const status = allHealthy ? 200 : 503;

  return res.status(status).json({
    status: allHealthy ? 'healthy' : 'degraded',
    service: 'lion-delivery-api',
    timestamp: new Date().toISOString(),
    components: {
      database: dbOk ? 'UP' : 'DOWN',
      redis: redisOk ? 'UP' : 'DOWN',
    },
  });
});

// Meta WhatsApp Webhook (with standard and api route aliases)
app.get(['/webhooks/whatsapp', '/api/whatsapp/webhook', '/api/v1/whatsapp/webhook'], verifyWebhook);
app.post(['/webhooks/whatsapp', '/api/whatsapp/webhook', '/api/v1/whatsapp/webhook'], handleWebhook);

// WhatsApp Simulator & Conversation Log (G-004 validated)
app.post('/api/conversations/message', validateBody(simulateMessageSchema), simulateWhatsAppMessage);
app.post('/api/v1/whatsapp/simulate', validateBody(simulateMessageSchema), simulateWhatsAppMessage);
app.get('/api/conversations', getConversations);
app.get('/api/v1/conversations', getConversations);
app.get('/api/conversations/:phone/history', getConversations);

// Auth (G-004 validated)
app.post('/api/auth/login', validateBody(loginSchema), login);
app.post('/api/v1/auth/login', validateBody(loginSchema), login);

// Internal dashboard contacts and live WhatsApp inbox
const dashboardRoles = requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER');
app.get(['/api/dashboard/contacts', '/api/v1/dashboard/contacts'], authenticate, dashboardRoles, getDashboardContacts);
app.get(['/api/whatsapp/inbox/conversations', '/api/v1/whatsapp/inbox/conversations'], authenticate, dashboardRoles, getWhatsAppInboxConversations);
app.get(['/api/whatsapp/inbox/conversations/:id', '/api/v1/whatsapp/inbox/conversations/:id'], authenticate, dashboardRoles, validateParams(idParamSchema), getWhatsAppInboxMessages);
app.get(['/api/whatsapp/inbox/conversations/:id/messages', '/api/v1/whatsapp/inbox/conversations/:id/messages'], authenticate, dashboardRoles, validateParams(idParamSchema), getWhatsAppInboxMessages);
app.post(['/api/whatsapp/inbox/conversations/:id/reply', '/api/v1/whatsapp/inbox/conversations/:id/reply'], authenticate, dashboardRoles, validateParams(idParamSchema), validateBody(whatsappInboxReplySchema), sendWhatsAppInboxReply);

// Catalog & Search (Public browse/search)
app.get('/api/catalog', getProducts);
app.get('/api/v1/catalog', getProducts);
app.get('/api/merchants', getMerchants);
app.get('/api/v1/merchants', getMerchants);
app.get('/api/products', getProducts);
app.get('/api/v1/products', getProducts);
app.get('/api/search/products', searchProducts);
app.get('/api/v1/search/products', searchProducts);

// =========================================================================
// Operational Routes - Protected by JWT Authentication & Roles (G-051)
// =========================================================================

// Orders & Live Operations
const orderRoles = requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER', 'MERCHANT', 'DRIVER');
app.get(['/api/orders', '/api/v1/orders', '/api/orders/live', '/api/v1/orders/live'], authenticate, orderRoles, getLiveOrders);
app.get(['/api/orders/:id', '/api/v1/orders/:id'], authenticate, orderRoles, validateParams(idParamSchema), getOrderById);

// Merchant Status Transitions
const merchantRoles = requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR', 'MERCHANT');
app.post(['/api/orders/:id/accept', '/api/v1/orders/:id/merchant-accept'], authenticate, merchantRoles, validateParams(idParamSchema), validateBody(merchantAcceptSchema), merchantAcceptOrder);
app.post(['/api/orders/:id/reject', '/api/v1/orders/:id/merchant-reject'], authenticate, merchantRoles, validateParams(idParamSchema), validateBody(merchantRejectSchema), merchantRejectOrder);
app.post(['/api/orders/:id/ready', '/api/v1/orders/:id/merchant-ready'], authenticate, merchantRoles, validateParams(idParamSchema), validateBody(merchantReadySchema), merchantReadyOrder);

// Driver Status Transitions
const driverRoles = requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER', 'DRIVER');
app.post(['/api/orders/:id/driver-accept', '/api/v1/orders/:id/driver-accept'], authenticate, driverRoles, validateParams(idParamSchema), validateBody(driverAcceptSchema), driverAcceptOrder);
app.post(['/api/orders/:id/driver-reject', '/api/v1/orders/:id/driver-reject'], authenticate, driverRoles, validateParams(idParamSchema), validateBody(driverRejectSchema), driverRejectOrder);
app.post(['/api/orders/:id/pickup', '/api/v1/orders/:id/picked-up'], authenticate, driverRoles, validateParams(idParamSchema), driverPickupOrder);
app.post(['/api/orders/:id/deliver', '/api/v1/orders/:id/delivered'], authenticate, driverRoles, validateParams(idParamSchema), validateBody(driverDeliverSchema), driverDeliverOrder);

// Drivers Fleet View
app.get(['/api/drivers', '/api/v1/drivers'], authenticate, requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER'), getDrivers);

// Private Masked Relay Messaging (G-004, G-052 validated)
const relayRoles = requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER', 'DRIVER', 'CUSTOMER');
app.get(['/api/relay/:orderId/messages', '/api/relay/:orderId', '/api/v1/relay/:orderId'], authenticate, relayRoles, validateParams(orderIdParamSchema), getRelayMessages);
app.post(['/api/relay/:orderId/messages', '/api/relay/:orderId', '/api/v1/relay/:orderId'], authenticate, relayRoles, validateParams(orderIdParamSchema), validateBody(relayMessageSchema), sendRelayMessage);

// Customers
app.get(['/api/customers', '/api/v1/customers'], authenticate, requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER'), async (req, res) => {
  try {
    const custs = await customerService.getAllCustomers();
    sendSuccess(res, custs);
  } catch (err: any) {
    sendError(res, err);
  }
});

// Analytics
app.get(['/api/analytics/dashboard', '/api/analytics/overview', '/api/v1/analytics/overview'], authenticate, requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR', 'DISPATCHER'), getOverviewAnalytics);

// Management AI
app.post(['/api/management-ai/ask', '/api/v1/management-ai/ask'], authenticate, requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR'), validateBody(managementAiSchema), askManagementAI);

// Demo Reset Endpoint
app.post(['/api/demo/reset', '/api/v1/demo/reset'], authenticate, requireRoles('SUPERADMIN', 'ADMIN', 'OPERATOR'), async (req, res) => {
  try {
    await resetDemo();
    sendSuccess(res, { message: 'Demo state reset successfully' });
  } catch (err: any) {
    sendError(res, err);
  }
});

// Static Dashboard SPA serving (G-063)
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });
}

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global API Error]:', err);
  sendError(res, err.message || 'Internal Server Error', 500);
});
