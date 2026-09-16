import { randomUUID } from 'node:crypto';
import { redis } from '../../database/redis.js';

/**
 * Distributed conversation turn lease with local process serialization.
 *
 * Requirements (Finding C & Section 6 Step 2):
 * - Distributed Redis lease: conversation:lock:{conversationId}
 * - Unique owner token per acquisition
 * - Short TTL with background heartbeat renewal
 * - Bounded acquisition timeout
 * - Ownership check on release via Lua script
 * - In-process serialization queue to avoid lock thrashing within a single worker
 */
const tails = new Map<number, Promise<void>>();

const RELEASE_LUA_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export async function withConversationTurnLock<T>(
  conversationId: number | null | undefined,
  work: () => Promise<T>,
  options?: { timeoutMs?: number; ttlSeconds?: number }
): Promise<T> {
  if (!conversationId) return work();

  const timeoutMs = options?.timeoutMs ?? 7000;
  const ttlSeconds = options?.ttlSeconds ?? 10;

  // 1. In-process queue to serialize turns within the same Node process
  const previous = tails.get(conversationId) || Promise.resolve();
  let localRelease: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    localRelease = resolve;
  });
  const queued = previous.then(() => current);
  tails.set(conversationId, queued);

  await previous;

  // 2. Distributed lease across processes / PM2 replicas via Redis
  const lockKey = `conversation:lock:${conversationId}`;
  const ownerToken = randomUUID();
  const startTime = Date.now();
  let acquired = false;

  while (Date.now() - startTime < timeoutMs) {
    acquired = await redis.setNx(lockKey, ownerToken, ttlSeconds);
    if (acquired) break;
    // Bounded backoff between 25ms and 75ms
    await new Promise((r) => setTimeout(r, 25 + Math.floor(Math.random() * 50)));
  }

  // Heartbeat interval to renew lock if long-running
  let heartbeatInterval: NodeJS.Timeout | null = null;
  if (acquired) {
    heartbeatInterval = setInterval(async () => {
      try {
        const client = redis.getClient();
        if (client && redis.isOnline()) {
          // Renew TTL if still owner
          await client.eval(
            `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end`,
            1,
            lockKey,
            ownerToken,
            ttlSeconds
          );
        }
      } catch {}
    }, Math.max(1000, (ttlSeconds * 1000) / 3));
  }

  try {
    return await work();
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (acquired) {
      try {
        await redis.eval(RELEASE_LUA_SCRIPT, 1, lockKey, ownerToken);
      } catch (err) {
        console.warn(`[TurnLock] Error releasing lock for conversation ${conversationId}:`, err);
      }
    }
    localRelease?.();
    if (tails.get(conversationId) === queued) tails.delete(conversationId);
  }
}

export async function acquireTurnLock(
  conversationId: number,
  ttlMsOrSeconds: number = 10000
): Promise<string | null> {
  const ttlSeconds = ttlMsOrSeconds > 100 ? Math.ceil(ttlMsOrSeconds / 1000) : ttlMsOrSeconds;
  const lockKey = `conversation:lock:${conversationId}`;
  const ownerToken = randomUUID();
  const acquired = await redis.setNx(lockKey, ownerToken, ttlSeconds);
  return acquired ? ownerToken : null;
}

export async function releaseTurnLock(conversationIdOrKey: number | string, ownerToken: string): Promise<boolean> {
  const lockKey = typeof conversationIdOrKey === 'number'
    ? `conversation:lock:${conversationIdOrKey}`
    : conversationIdOrKey;
  const res = await redis.eval(RELEASE_LUA_SCRIPT, 1, lockKey, ownerToken);
  return res === 1;
}

