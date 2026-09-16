import Redis from 'ioredis';
import { config } from '../config/env.js';

let redisClient: Redis | null = null;
let isConnected = false;

try {
  redisClient = new Redis(config.redis.url, {
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 100, 1000);
    },
  });

  redisClient.on('connect', () => {
    isConnected = true;
    console.log('[Redis] Connected successfully');
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    console.warn('[Redis] Connection warning (running in in-memory fallback mode):', err.message);
  });
} catch (err) {
  console.warn('[Redis] Client initialization skipped, using in-memory state');
}

// In-memory fallback map if Redis is temporarily offline
const memoryFallback = new Map<string, { value: string; expiresAt?: number }>();

export const redis = {
  async get(key: string): Promise<string | null> {
    if (redisClient && isConnected) {
      try {
        return await redisClient.get(key);
      } catch {
        const entry = memoryFallback.get(key);
        if (!entry) return null;
        if (entry.expiresAt && entry.expiresAt <= Date.now()) {
          memoryFallback.delete(key);
          return null;
        }
        return entry.value;
      }
    }
    const entry = memoryFallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      memoryFallback.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key: string, value: string, expirySeconds?: number): Promise<void> {
    if (redisClient && isConnected) {
      try {
        if (expirySeconds) {
          await redisClient.set(key, value, 'EX', expirySeconds);
        } else {
          await redisClient.set(key, value);
        }
        return;
      } catch {
        // Fallback
      }
    }
    memoryFallback.set(key, {
      value,
      expiresAt: expirySeconds ? Date.now() + expirySeconds * 1000 : undefined,
    });
  },

  async del(key: string): Promise<void> {
    if (redisClient && isConnected) {
      try {
        await redisClient.del(key);
      } catch {
        // Fallback
      }
    }
    memoryFallback.delete(key);
  },

  async flushAll(): Promise<void> {
    memoryFallback.clear();
    if (redisClient && isConnected) {
      try {
        await redisClient.flushall();
      } catch {
        // Fallback
      }
    }
  },

  async selectDb(dbIndex: number): Promise<void> {
    if (redisClient && isConnected) {
      try {
        await redisClient.select(dbIndex);
      } catch {}
    }
  },

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (redisClient && isConnected) {
      try {
        const res = await redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch {
        // fallback
      }
    }
    const entry = memoryFallback.get(key);
    if (!entry || (entry.expiresAt && entry.expiresAt <= Date.now())) {
      memoryFallback.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    }
    return false;
  },

  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<any> {
    if (redisClient && isConnected) {
      try {
        return await (redisClient as any).eval(script, numKeys, ...args);
      } catch {
        // fallback
      }
    }
    return null;
  },

  getClient(): Redis | null {
    return redisClient;
  },

  isOnline(): boolean {
    return isConnected && redisClient !== null;
  },

  async ping(): Promise<boolean> {
    if (redisClient && isConnected) {
      try {
        const res = await redisClient.ping();
        return res === 'PONG';
      } catch {
        return false;
      }
    }
    return false;
  }
};

