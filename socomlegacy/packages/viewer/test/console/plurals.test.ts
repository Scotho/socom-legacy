import { describe, expect, it } from 'vitest';
import { roomsHtml } from '../../src/console/render/rooms';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, createState, homeItems, serverItems, type Adapters } from '../../src/console/state';

/**
 * The launcher's counts read as English at one (the merge controller's product-track call, 2026-10-21): with the
 * server split's rooms listed (SA-54) one universe's single room is the normal case, so Home's Browse rooms and Server
 * rows, the Server screen's status and the Browse rooms footer say "1 room" and "1 player", never "1 rooms" or
 * "1 players". The launcher's own lines (OT.R28); the original's screens are untouched. Generated values only.
 */
function withTotals(t: { rooms: number; players: number }): Adapters {
  const A = sampleAdapters();
  return { ...A, rooms: { ...A.rooms, totals: () => t }, server: { ...A.server, totals: () => t } };
}
const lines = (A: Adapters): string[] => {
  const S = createState(A);
  const subs = CATS.flatMap((c) => homeItems(c.id, S, A).map((i) => i.sub));
  const foot = /<[^>]*class="[^"]*cx-[^"]*foot[^"]*"[^>]*>([^<]*)</.exec(roomsHtml(S, A))?.[1] ?? roomsHtml(S, A);
  return [...subs, ...serverItems(A).map((i) => i.sub), foot].filter((x) => /\broom|\bplayer/.test(x));
};

describe('the launcher\'s counts', () => {
  it('at one: "1 room" and "1 player" on Home, the Server screen and the Browse rooms footer', () => {
    const got = lines(withTotals({ rooms: 1, players: 1 }));
    expect(got.length, 'the four lines').toBeGreaterThanOrEqual(4);
    for (const l of got) {
      expect(l).not.toMatch(/\b1 rooms\b/);
      expect(l).not.toMatch(/\b1 players\b/);
    }
    expect(got).toContain('1 room open · 1 player online');
    expect(got.some((l) => l.includes('1 room · 1 player · updated'))).toBe(true);
  });

  // The review's F4: a briefing room's row is announced with its games, "1 game" at one.
  it('a briefing room with one game is announced "1 game", never "1 games"', () => {
    const A = sampleAdapters();
    const base = A.rooms.list()[0]!;
    const rooms = { ...A.rooms, list: () => [{ ...base, kind: 'room' as const, games: 1 }, { ...base, id: `${base.id}-2`, kind: 'room' as const, games: 2 }] };
    const html = roomsHtml(createState({ ...A, rooms }), { ...A, rooms });
    expect(html).toContain(', 1 game,');
    expect(html).toContain(', 2 games,');
    expect(html).not.toMatch(/\b1 games\b/);
  });

  it('otherwise plural, as before: "0 rooms", "2 players"', () => {
    const got = lines(withTotals({ rooms: 2, players: 0 }));
    expect(got).toContain('2 rooms open · 0 players online');
    expect(got.some((l) => l.includes('2 rooms · 0 players · updated'))).toBe(true);
  });
});
