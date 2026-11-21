import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../src/net/protocol';
import { gameValves } from '../src/gameValves';

describe('the game valves fed from the room', () => {
  // The bug of 2026-11-13: `RoomEvents.reset` (a match's close) emits a welcome that carries nothing; the feed threw on
  // it, and the close, whose reset it was, stopped part way (its sound left running).
  it("takes a reset's bare welcome without throwing: back to no room", () => {
    const set = new Map<string, number>();
    const feed = gameValves((n, v) => { set.set(n, v); });
    expect(() => feed({ type: 'welcome' } as Extract<ServerEvent, { type: 'welcome' }>)).not.toThrow();
    expect(set.get('player_team')).toBe(16);
    expect(set.get('mp_round_count')).toBe(0);
    expect(set.get('killcount')).toBe(0);
  });

  it("writes the round's clock, the wins and the winner under the game's own names and numbers", () => {
    const set = new Map<string, number>();
    const feed = gameValves((n, v) => { set.set(n, v); });
    feed({ type: 'roundStart', round: 3, seconds: 300, wins: { seal: 1, terrorist: 1 }, rounds: 11, epoch: 0, startTick: 0 });
    expect(set.get('mp_timer')).toBe(1);
    expect(set.get('mp_round_count')).toBe(2);
    expect(set.get('mp_max_rounds')).toBe(11);
    expect(set.get('mp_score00')).toBe(1);
    feed({ type: 'timeExpired' });
    expect(set.get('mp_timer')).toBe(0);
    feed({ type: 'eliminated', winner: 'terrorist' } as Extract<ServerEvent, { type: 'eliminated' }>);
    expect(set.get('mp_winner')).toBe(8);
  });
});
