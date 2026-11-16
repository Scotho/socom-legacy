/**
 * Browser adaptation (product track, an instrument with no original; PR #790's piece 3): the bytes a worker reply
 * carries -- each unique backing buffer counted once, the reply walked without being kept. Moved verbatim from the
 * contributor's `xboxMemoryTrace.ts` (b9f0beb1d0 on `agent/xbox-live-memory`) with the two lines it needs; the recorder
 * and its panel are not carried. Since the review's L3/L4 (maintainers'): it runs on the page's thread for every worker
 * reply on every device, so its budget is named for the walk, not the Xbox, and a plain array is walked by index up to
 * the budget -- never listed whole by `for...in` first. A plain object's keys are still listed by the engine at
 * `for...in` (no lazy key walk exists); its walk stops at the budget. Nothing the game does changes.
 */
export const PAYLOAD_WALK_VISITS_ADAPTATION = 8192;
const count = (n: unknown): number | undefined => typeof n === 'number' && Number.isFinite(n) && n >= 0
  ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(n)) : undefined;

/** Count unique backing buffers in a reply, without retaining it. A capped walk reports a lower bound. */
export function bufferPayloadBytes(value: unknown, limit = PAYLOAD_WALK_VISITS_ADAPTATION): { bytes: number; truncated: boolean } {
  const cap = Math.max(1, Math.min(PAYLOAD_WALK_VISITS_ADAPTATION, count(limit) ?? PAYLOAD_WALK_VISITS_ADAPTATION));
  const todo: unknown[] = [value];
  const seen = new Set<object>(), buffers = new Set<ArrayBufferLike>();
  let bytes = 0, visits = 0, edges = 0, truncated = false;
  const add = (v: unknown): boolean => {
    if (++edges > cap) { truncated = true; return false; }
    if (typeof v === 'object' && v !== null) todo.push(v);
    return true;
  };
  // A getter could execute application code or expose a private value. Structured-clone replies need none.
  const own = (item: object, key: string | number): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(item, key);
    return descriptor && 'value' in descriptor ? descriptor.value : null;
  };
  while (todo.length && visits++ < cap) {
    const item = todo.pop();
    if (typeof item !== 'object' || item === null || seen.has(item)) continue;
    seen.add(item);
    try {
      const buffer = ArrayBuffer.isView(item) ? item.buffer : item instanceof ArrayBuffer ? item : null;
      if (buffer) {
        if (!buffers.has(buffer)) { buffers.add(buffer); bytes += buffer.byteLength; }
      } else if (item instanceof Map) {
        for (const [k, v] of item) { if (!add(k) || !add(v)) break; }
      } else if (item instanceof Set) {
        for (const v of item) if (!add(v)) break;
      } else if (Array.isArray(item)) {
        // Review L3: by index, at most the budget's edges -- one huge array costs no listing of its keys.
        const n = item.length;
        for (let i = 0; i < n; i++) if (!add(own(item, i))) break;
      } else {
        for (const key in item) {
          if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
          if (!add(own(item, key))) break;
        }
      }
    } catch { truncated = true; }
  }
  return { bytes, truncated: truncated || todo.length > 0 };
}
