import { expect, type Page } from '@playwright/test';
import type { FrontEndWindowHook } from '../src/frontEnd';

/**
 * The briefing room's GAMELIST focused on the row of the game named `name` (an e2e instrument, no behaviour): the list's
 * rows are sorted by the game's state, then by name (`../../ui/src/screens/briefingRoomCommands` `drawGames`), so a room
 * still holding an earlier test's game (a fight game its CPUs keep alive) can list that one first -- BTL-3's late page
 * joined 'btfight...' instead of the host's 'btjoin...' (2026-11-08). A row's first caption is the game's drawn name
 * (`drawnGameName`). The row is waited for through one of the room's refreshes (30 s), then walked to by UP / DOWN.
 */
export async function focusGameRow(p: Page, name: string): Promise<void> {
  const rowOf = () => p.evaluate((n) => {
    const parts = (window as Window & { __frontEnd?: FrontEndWindowHook }).__frontEnd?.session.parts.current;
    const list = parts?.widgets.get('GAMELIST') as unknown as { items?: { captions: string[] }[]; focus?: number } | undefined;
    if (!list?.items || list.focus === undefined) return null;
    return { at: list.items.findIndex((i) => i.captions[0] === n), focus: list.focus, rows: list.items.map((i) => i.captions[0] ?? '') };
  }, name);
  await expect.poll(async () => (await rowOf())?.at ?? -1, { timeout: 35_000, message: `the game ${name} in GAMELIST` }).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < 32; i++) {
    const r = await rowOf();
    if (!r || r.at < 0 || r.focus === r.at) break;
    await p.keyboard.press(r.focus < r.at ? 'ArrowDown' : 'ArrowUp');
    await p.waitForTimeout(350);
  }
  const r = await rowOf();
  expect(r && r.at >= 0 && r.focus === r.at, `GAMELIST's focus on ${name} (rows ${JSON.stringify(r?.rows)}, focus ${r?.focus})`).toBe(true);
}
