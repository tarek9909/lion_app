import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocketServer(server: HttpServer) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
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
