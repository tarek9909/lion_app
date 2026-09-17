import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import { AuthTokenPayload, verifyToken } from '../modules/auth/auth.service.js';

let wss: WebSocketServer | null = null;
type AuthenticatedWebSocket = WebSocket & { authUser?: AuthTokenPayload };
const clients = new Set<AuthenticatedWebSocket>();

function getWebSocketToken(request: IncomingMessage): string | null {
  const header = request.headers['sec-websocket-protocol'];
  const protocols = (Array.isArray(header) ? header.join(',') : header || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!protocols.includes('lion-auth')) return null;
  return protocols.find((value) => value !== 'lion-auth') || null;
}

export function initWebSocketServer(server: HttpServer) {
  wss = new WebSocketServer({
    server,
    path: '/ws',
    // Browser WebSocket APIs cannot set Authorization headers. Keep the JWT
    // in the WebSocket subprotocol header rather than placing it in a URL.
    handleProtocols: (protocols) => protocols.has('lion-auth') ? 'lion-auth' : false,
    verifyClient: (info, done) => {
      const token = getWebSocketToken(info.req);
      const user = token ? verifyToken(token) : null;
      if (!user) {
        done(false, 401, 'Unauthorized');
        return;
      }
      (info.req as IncomingMessage & { wsUser?: AuthTokenPayload }).wsUser = user;
      done(true);
    },
  });

  wss.on('connection', (ws: AuthenticatedWebSocket, request) => {
    const user = (request as IncomingMessage & { wsUser?: AuthTokenPayload }).wsUser;
    if (!user) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    ws.authUser = user;
    clients.add(ws);
    // Send initial handshake
    ws.send(JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() }));

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.warn('[WebSocket] Client error:', err.message);
      clients.delete(ws);
    });
  });

  console.log('[WebSocket] Live event server mounted on /ws');
}

export function broadcastEvent(eventType: string, payload: any) {
  const message = JSON.stringify({
    type: eventType,
    payload,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.warn('[WebSocket] Send failure:', err);
      }
    }
  }
}
