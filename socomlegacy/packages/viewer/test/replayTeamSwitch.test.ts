// test/replayTeamSwitch.test.ts -- REPLAY-TEAM-SWAP (product track: the replay tool, REPLAY_ADAPTATION; the scope
// `SCOPE-replay-team-swap.md`, 2026-11-09): a seek's roster after a player's SWITCH TEAMS. A recording made before the room
// wrote a roster record at a re-seat holds only the broadcast `left` then `joined` (the room's `switchTeam`); the seek's
// roster (`ReplayClient.rosterAt`) applies those after the last roster record, so the welcome a seek tells names the side
// the player switched to. A recording the room makes now carries a roster record at the switch too, and reads the same.
import { describe, expect, it } from 'vitest';
import { decodeRecords, type ReplayRecord } from '../../match/src/replay/format';
import type { ServerEvent } from '../src/net/protocol';
import { ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import { ALPHA, BRAVO, body, fixtureBytes, header } from './replayFixture';

const SWITCH = 150;

/** Night Stalker (MP7): Alpha a SEAL at the open, SWITCH TEAMS at `SWITCH` to the Terrorists; snapshots every 2 ticks to 400. */
function records(withRoster: boolean): ReplayRecord[] {
  const out: ReplayRecord[] = [{ kind: 'header', header: header({ map: 'MP7', kind: 'dedicated', session: null }) }];
  for (let tick = 0; tick <= 400; tick++) {
    if (tick === 0) out.push({ kind: 'players', tick, players: [{ ...ALPHA, char: 3 }, BRAVO] });
    if (tick === SWITCH) {
      out.push({ kind: 'event', tick, event: { type: 'left', id: ALPHA.id } });
      out.push({ kind: 'event', tick, event: { type: 'joined', id: ALPHA.id, name: ALPHA.name, team: 'terrorist' } });
      if (withRoster) out.push({ kind: 'players', tick, players: [{ ...ALPHA, team: 'terrorist', char: 3 }, BRAVO] });
    }
    if (tick % 2 === 0) out.push({ kind: 'snap', tick, bodies: [body(1, tick), body(2, -tick)] });
  }
  out.push({ kind: 'end', tick: 400, reason: 'closed' });
  return out;
}

async function open(withRoster: boolean) {
  const { records: rs, truncated } = decodeRecords(fixtureBytes(records(withRoster)));
  const h = rs[0];
  if (h?.kind !== 'header') throw new Error('no header');
  const seg: LoadedSegment = { header: h.header, records: rs, truncated };
  const c = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP7', now: () => 0, autoplay: false });
  const events: ServerEvent[] = [];
  c.on((ev) => events.push(ev));
  await c.ready;
  const welcomeSide = (): string | null | undefined => {
    const w = events.filter((e): e is Extract<ServerEvent, { type: 'welcome' }> => e.type === 'welcome').at(-1);
    return w?.players.find((p) => p.id === ALPHA.id)?.team;
  };
  return { c, events, welcomeSide };
}

describe('a seek past SWITCH TEAMS names the switched side (MP7)', () => {
  for (const withRoster of [false, true]) {
    it(`${withRoster ? 'a roster record at the switch' : 'only the broadcast left and joined (a recording made before the fix)'}: the welcome's players say terrorist past it, seal before`, async () => {
      const r = await open(withRoster);
      expect(r.welcomeSide()).toBe('seal');
      r.c.seek(300);
      expect(r.welcomeSide()).toBe('terrorist');
      expect(r.c.roster().find((p) => p.id === ALPHA.id)).toMatchObject({ team: 'terrorist', char: 3 });
      r.c.seek(100);
      expect(r.welcomeSide()).toBe('seal');
      r.c.seek(SWITCH);
      expect(r.welcomeSide()).toBe('terrorist');
    });
  }
});
