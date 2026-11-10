import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from '@playwright/test';
import { focusGameRow } from '../e2e/gameRow';

/**
 * The e2e join by name (product track, the e2e harness -- no page's game behaviour changes): `../e2e/gameRow.ts`
 * `focusGameRow`, which `joinGame(p, name)` (`../e2e/menuMatch.ts`, `../e2e/frontEndWalk.ts`) runs before CROSS. On the
 * release tree's host browser view (2026-11-08) BTL-3's late page pressed CROSS on GAMELIST's first row and joined test
 * 19's leftover 'btfight...' game (sorted before the host's 'btjoin...') -- 15 CPUs where 14 were owed. Held here on a
 * stand-in page: its `evaluate` runs the read against a stubbed `window`, its keyboard moves the list's focus as the
 * listbox's UP / DOWN do.
 */

interface List { items: { captions: string[] }[]; focus: number }
const g = globalThis as unknown as { window?: unknown };

function standIn(names: string[], focus = 0): { page: Page; list: List; presses: string[] } {
  const list: List = { items: names.map((n) => ({ captions: [n, '1', '16'] })), focus };
  const presses: string[] = [];
  g.window = { __frontEnd: { session: { parts: { current: { widgets: { get: (n: string) => (n === 'GAMELIST' ? list : undefined) } } } } } };
  const page = {
    evaluate: async <A, R>(fn: (a: A) => R, arg: A) => fn(arg),
    keyboard: { press: async (k: string) => {
      presses.push(k);
      if (k === 'ArrowDown') list.focus = Math.min(list.focus + 1, list.items.length - 1);
      if (k === 'ArrowUp') list.focus = Math.max(list.focus - 1, 0);
    } },
    waitForTimeout: async () => undefined,
  } as unknown as Page;
  return { page, list, presses };
}

afterEach(() => { delete g.window; });

describe('focusGameRow: GAMELIST focused on the named game', () => {
  it('walks down past a leftover game listed first (BTL-3: btfight before btjoin)', async () => {
    const s = standIn(['btfight23155', 'btjoin23155']);
    await focusGameRow(s.page, 'btjoin23155');
    expect(s.list.focus).toBe(1);
    expect(s.presses).toEqual(['ArrowDown']);
  });

  it('walks up when the focus sits below the row', async () => {
    const s = standIn(['a1', 'b2', 'c3', 'd4'], 3);
    await focusGameRow(s.page, 'b2');
    expect(s.list.focus).toBe(1);
    expect(s.presses).toEqual(['ArrowUp', 'ArrowUp']);
  });

  it('presses nothing when the room\'s one game is focused', async () => {
    const s = standIn(['g1']);
    await focusGameRow(s.page, 'g1');
    expect(s.presses).toEqual([]);
  });

  it('matches the whole drawn name, not a prefix', async () => {
    const s = standIn(['btjoin231550', 'btjoin23155']);
    await focusGameRow(s.page, 'btjoin23155');
    expect(s.list.focus).toBe(1);
  });
});
