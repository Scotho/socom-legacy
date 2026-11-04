import { decodeBase64, encodeBase64, LIMITS } from '@s2u/forge-agent-protocol';

/** Browser adaptation: a refusal code the page targets return to the agent unchanged. */
export class PagingRefusal extends Error { constructor(readonly code: string) { super(code); } }

/** The envelope '{"items":[' + ']}' around the page's items; a comma separates each further item. */
const ENVELOPE_BYTES = '{"items":[]}'.length;
const encoder = new TextEncoder();
/** An array element's JSON size: undefined and functions serialize as null inside an array. */
const itemBytes = (item: unknown): number => encoder.encode(JSON.stringify(item) ?? 'null').length;

/**
 * Browser adaptation: revision-bound pagination keeps valid large layouts out of the control envelope.
 * Each item is measured once and a running total is kept, so a page costs O(n), not O(n^2).
 */
export function page(items: readonly unknown[], args: Record<string, unknown>, revision: number, section: string): unknown {
  let offset = 0;
  if (args['cursor'] !== undefined) {
    const raw = args['cursor'];
    if (typeof raw !== 'string' || !raw || raw.length > 256) throw new PagingRefusal('INVALID_ARGUMENT');
    let cursor: { revision?: unknown; offset?: unknown; section?: unknown };
    try { cursor = JSON.parse(new TextDecoder().decode(decodeBase64(raw, 256))); } catch { throw new PagingRefusal('INVALID_CURSOR'); }
    if (cursor.revision !== revision) throw new PagingRefusal('REVISION_CONFLICT');
    if (cursor.section !== section || !Number.isSafeInteger(cursor.offset) || Number(cursor.offset) < 0 || Number(cursor.offset) > items.length) throw new PagingRefusal('INVALID_CURSOR');
    offset = Number(cursor.offset);
  }
  const limit = LIMITS.controlBytes - 4096;
  const result: unknown[] = [];
  let total = ENVELOPE_BYTES;
  while (offset + result.length < items.length && result.length < 100) {
    const item = items[offset + result.length];
    const size = total + itemBytes(item) + (result.length ? 1 : 0);
    if (size > limit) {
      if (!result.length) throw new PagingRefusal('ITEM_TOO_LARGE');
      break;
    }
    total = size;
    result.push(item);
  }
  const next = offset + result.length;
  return { revision, section, items: result, total: items.length,
    nextCursor: next < items.length ? encodeBase64(encoder.encode(JSON.stringify({ revision, offset: next, section }))) : null };
}
