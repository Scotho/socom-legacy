import { describe, expect, it } from 'vitest';
import { page, PagingRefusal } from '../src/agent/paging';
import { bytes, encodeBase64, LIMITS } from '@s2u/forge-agent-protocol';

type Page = { revision: number; section: string; items: unknown[]; total: number; nextCursor: string | null };
const refusal = (run: () => unknown): string => {
  try { run(); } catch (error) { if (error instanceof PagingRefusal) return error.code; throw error; }
  throw new Error('no refusal');
};
const cursor = (value: unknown): string => encodeBase64(new TextEncoder().encode(JSON.stringify(value)));

describe('revision-bound paging (browser adaptation)', () => {
  it('walks every item through cursors and ends with a null cursor', () => {
    const items = Array.from({ length: 250 }, (_, i) => [i, 0, 0]);
    const seen: unknown[] = [];
    let next: string | null | undefined;
    do {
      const result = page(items, next ? { cursor: next } : {}, 7, 'pieces') as Page;
      expect(result).toMatchObject({ revision: 7, section: 'pieces', total: 250 });
      expect(result.items.length).toBeLessThanOrEqual(100);
      seen.push(...result.items); next = result.nextCursor;
    } while (next);
    expect(seen).toEqual(items);
  });
  it('refuses a cursor from another revision as REVISION_CONFLICT', () => {
    const first = page(Array.from({ length: 150 }, () => 0), {}, 3, 'pieces') as Page;
    expect(refusal(() => page(Array.from({ length: 150 }, () => 0), { cursor: first.nextCursor }, 4, 'pieces'))).toBe('REVISION_CONFLICT');
  });
  it('refuses a cursor of another section or a malformed one', () => {
    expect(refusal(() => page([1, 2], { cursor: cursor({ revision: 1, offset: 1, section: 'spawns' }) }, 1, 'pieces'))).toBe('INVALID_CURSOR');
    expect(refusal(() => page([1, 2], { cursor: cursor({ revision: 1, offset: 5, section: 'pieces' }) }, 1, 'pieces'))).toBe('INVALID_CURSOR');
    expect(refusal(() => page([1, 2], { cursor: 'not base64!' }, 1, 'pieces'))).toBe('INVALID_CURSOR');
    expect(refusal(() => page([1, 2], { cursor: 12 }, 1, 'pieces'))).toBe('INVALID_ARGUMENT');
  });
  it('refuses a first item that alone exceeds the control envelope as ITEM_TOO_LARGE', () => {
    expect(refusal(() => page(['x'.repeat(LIMITS.controlBytes)], {}, 1, 'refs'))).toBe('ITEM_TOO_LARGE');
  });
  it('stops a page at the byte bound, exactly where the whole-page measurement would', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ i, text: 'y'.repeat(5000) }));
    const result = page(items, {}, 2, 'refs') as Page;
    const limit = LIMITS.controlBytes - 4096;
    expect(result.items.length).toBeGreaterThan(0); expect(result.items.length).toBeLessThan(40);
    expect(bytes({ items: result.items })).toBeLessThanOrEqual(limit);
    expect(bytes({ items: items.slice(0, result.items.length + 1) })).toBeGreaterThan(limit);
    expect(result.nextCursor).toBeTruthy();
  });
  it('measures each item once, not the accumulated page per item', () => {
    let calls = 0;
    const items = Array.from({ length: 100 }, (_, i) => ({ toJSON: () => { calls++; return i; } }));
    page(items, {}, 1, 'refs');
    expect(calls).toBe(100);
  });
});
