/**
 * In-process conversation serializer. The durable state version protects
 * recovery; this queue prevents concurrent WhatsApp/simulator turns in one
 * service instance from reading the same snapshot before either saves it.
 */
const tails = new Map<number, Promise<void>>();

export async function withConversationTurnLock<T>(conversationId: number | null | undefined, work: () => Promise<T>): Promise<T> {
  if (!conversationId) return work();
  const previous = tails.get(conversationId) || Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  tails.set(conversationId, queued);
  await previous;
  try {
    return await work();
  } finally {
    release?.();
    if (tails.get(conversationId) === queued) tails.delete(conversationId);
  }
}
