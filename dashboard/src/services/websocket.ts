type MessageHandler = (event: { type: string; payload: any; data?: any; timestamp?: string }) => void;
type ReconnectHandler = () => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectListeners: Set<ReconnectHandler> = new Set();
  private reconnectTimer: any = null;
  private isConnected: boolean = false;
  private hasConnectedBefore: boolean = false;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private recentEventKeys: Set<string> = new Set();

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.notifyConnectionState(true);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        if (this.hasConnectedBefore) {
          console.log('[WS] Reconnected! Triggering resynchronization...');
          this.reconnectListeners.forEach((cb) => {
            try {
              cb();
            } catch (err) {
              console.error('[WS] Reconnect listener error:', err);
            }
          });
        }
        this.hasConnectedBefore = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const payload = raw.payload !== undefined ? raw.payload : raw.data;
          const normalized = {
            type: raw.type,
            payload,
            data: payload,
            timestamp: raw.timestamp || new Date().toISOString(),
          };

          // Deduplicate events received within a short window
          const dedupeKey = `${normalized.type}:${JSON.stringify(payload?.id || payload?.order_number || payload?.phone || normalized.timestamp)}`;
          if (this.recentEventKeys.has(dedupeKey)) {
            return;
          }
          this.recentEventKeys.add(dedupeKey);
          if (this.recentEventKeys.size > 200) {
            const first = this.recentEventKeys.values().next().value;
            if (first) this.recentEventKeys.delete(first);
          }

          this.listeners.forEach((listener) => {
            try {
              listener(normalized);
            } catch (err) {
              console.error('[WS] Message listener error:', err);
            }
          });
        } catch (e) {
          console.error('[WS] Failed to parse message', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notifyConnectionState(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.notifyConnectionState(false);
      };
    } catch (e) {
      console.warn('[WS] Connection failed, will retry...', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 2500);
    }
  }

  private notifyConnectionState(connected: boolean) {
    this.connectionListeners.forEach((cb) => cb(connected));
  }

  subscribe(handler: MessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  onReconnect(handler: ReconnectHandler): () => void {
    this.reconnectListeners.add(handler);
    return () => {
      this.reconnectListeners.delete(handler);
    };
  }

  onConnectionChange(cb: (connected: boolean) => void): () => void {
    this.connectionListeners.add(cb);
    cb(this.isConnected);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }
}

export const wsClient = new WebSocketClient();
