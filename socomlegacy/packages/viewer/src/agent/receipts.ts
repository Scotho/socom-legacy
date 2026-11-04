import type { AgentResult } from '@s2u/forge-agent-protocol';

/**
 * LATER 420 (browser adaptation): one mutation-receipt store for both page targets, the Forge editor's
 * (`./forgeTarget`) and the solo test room's (`./testroomTarget`), which kept their own copies and drifted (the room's
 * ran a duplicate sent while the first was in flight a second time, and did not count in-flight requests).
 *
 * A request is keyed `<session>:<request id>` and fingerprinted by its operation, arguments and expected revision:
 * - the same request again answers the first result (a copy), never running twice;
 * - the same id with another fingerprint is refused `REQUEST_ID_REUSED`;
 * - a duplicate sent while the first runs waits for it and answers its result;
 * - in-flight requests count against the limit (`RECEIPT_LIMIT`);
 * - `clear()` (a revoke) forgets every receipt, and a result that lands after it, or for an aborted request, is
 *   answered but not kept.
 */
export interface ReceiptStore {
  run(key: string, fingerprint: string, perform: () => Promise<AgentResult>, signal?: AbortSignal): Promise<AgentResult | { refused: string }>;
  /** The kept result for `request.receipt`, or null. */
  get(key: string): AgentResult | null;
  clear(): void;
}

export function createReceiptStore(limit: number): ReceiptStore {
  const kept = new Map<string, { fingerprint: string; result: AgentResult }>();
  const pending = new Map<string, { fingerprint: string; result: Promise<AgentResult> }>();
  let generation = 0;
  return {
    async run(key, fingerprint, perform, signal) {
      const prior = kept.get(key);
      if (prior) return prior.fingerprint === fingerprint ? structuredClone(prior.result) : { refused: 'REQUEST_ID_REUSED' };
      const waiting = pending.get(key);
      if (waiting) return waiting.fingerprint === fingerprint ? structuredClone(await waiting.result) : { refused: 'REQUEST_ID_REUSED' };
      if (kept.size + pending.size >= limit) return { refused: 'RECEIPT_LIMIT' };
      const mine = generation;
      const result = perform();
      pending.set(key, { fingerprint, result });
      try {
        const value = await result;
        if (mine === generation && !signal?.aborted) kept.set(key, { fingerprint, result: structuredClone(value) });
        return value;
      } finally { if (mine === generation) pending.delete(key); }
    },
    get: (key) => structuredClone(kept.get(key)?.result ?? null),
    clear() { generation++; kept.clear(); pending.clear(); },
  };
}
