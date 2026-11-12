import { describe, expect, it } from 'vitest';
import { decodeRecords, type ReplayRecord } from '../../match/src/replay/format';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff, type GameSocketFeed } from '../src/gameLobbyHost';
import { HudVoiceElement, voiceHudFrame } from '../src/hudVoice';
import type { WebSocketLike } from '../src/net/client';
import { PROTOCOL_VERSION, type ServerEvent } from '../src/net/protocol';
import { SeatClanBoard } from '../src/net/seatClans';
import { EVENT_CLASS } from '../src/replay/fold';
import { ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import { fixtureBytes, fixtureRecords, msOf } from './replayFixture';

/**
 * AD-13 (the clans' finish, wave 6b; web sprint 40's row, folded; research 275 §5): the room's `seatClans` -- each seat's
 * clan tag as the room told it, players' and watchers' alike (the bridge's `seated` -> `Room.tellClan`), one whole set
 * replacing the last -- kept by the page's board (`NetClient.clans`, `./net/seatClans`), handed to the game lobby's lists
 * and talker bar (`GameSocketHost`'s feed) and read by the round's speaker line (`voiceHudFrame`'s `clanOf`). Additive on
 * the wire, no version bump; a replay tolerates a recording with and without it. A fake socket stands in for the room
 * (R293); no browser.
 */

type Clans = Extract<ServerEvent, { type: 'seatClans' }>;
const clans = (seats: { id: number; clan: string }[]): ServerEvent => ({ type: 'seatClans', seats }) as Clans;

/** A feed the board listens on, as the net client's `on`. */
function feed() {
  const listeners = new Set<(ev: ServerEvent) => void>();
  return {
    on: (l: (ev: ServerEvent) => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    emit: (ev: ServerEvent | Record<string, unknown>) => { for (const l of listeners) l(ev as ServerEvent); },
  };
}

describe('the protocol: seatClans is additive (COLLABORATION, "Protocol N") -- no version bump, an older page passes it by', () => {
  it('the version stays 11; the event is the room\'s whole set: tagged seats only, a seat with no tag absent', () => {
    expect(PROTOCOL_VERSION).toBe(15);                           // PROTO-15's bump (V19.R10: the mover's rules); 14 ER-2's, 13 PLANT-AIM's, 12 SEP-POP's; this part unchanged
    expect(JSON.parse(JSON.stringify(clans([{ id: 1, clan: 'NSW' }])))).toEqual({ type: 'seatClans', seats: [{ id: 1, clan: 'NSW' }] });
  });
});

describe('SeatClanBoard: the page\'s copy of the room\'s told tags (tagged / untagged / no holder)', () => {
  it('a tagged seat answers its tag, an untagged seat and a seat no event names "" (a guest\'s, a bot\'s); each event replaces the board whole', () => {
    const f = feed();
    const b = new SeatClanBoard(f);
    expect(b.of(1)).toBe('');
    f.emit(clans([{ id: 1, clan: 'NSW' }, { id: 4, clan: 'SEA' }]));
    expect([b.of(1), b.of(4), b.of(2), b.of(99)]).toEqual(['NSW', 'SEA', '', '']);
    f.emit(clans([{ id: 4, clan: 'SEA' }]));                           // the room's next set: seat 1 has none now
    expect([b.of(1), b.of(4)]).toEqual(['', 'SEA']);
    expect([...b.all()]).toEqual([[4, 'SEA']]);
    f.emit({ type: 'seatTold', seats: [] });                           // another event changes nothing
    expect(b.of(4)).toBe('SEA');
  });

  it('a malformed entry is dropped (an id not an integer, a tag not a non-empty string); a malformed set empties the board', () => {
    const f = feed();
    const b = new SeatClanBoard(f);
    f.emit({ type: 'seatClans', seats: [{ id: 1.5, clan: 'X' }, { id: 2, clan: '' }, { id: 3, clan: 7 }, { id: 4, clan: 'OK' }, null] } as never);   // malformed on purpose: the wire is not trusted
    expect([...b.all()]).toEqual([[4, 'OK']]);
    f.emit({ type: 'seatClans', seats: 'no' } as never);
    expect(b.all().size).toBe(0);
  });

  it('all() is a copy; close() stops listening and keeps the last tags readable', () => {
    const f = feed();
    const b = new SeatClanBoard(f);
    f.emit(clans([{ id: 1, clan: 'NSW' }]));
    b.all().set(1, 'XXX');
    expect(b.of(1)).toBe('NSW');
    b.close();
    f.emit(clans([]));
    expect(b.of(1)).toBe('NSW');
  });
});

// ---- the page: the game socket's client (`GameSocketHost`, the lobby's and the match's one NetClient) ----

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const PINNED = pinnedMatchSocket('', LOC, false);
type Sock = WebSocketLike & { sent: string[] };
function rig() {
  const sockets: Sock[] = [];
  const fed: string[] = [];
  const handOffs: GameLobbyHandOff[] = [];
  let t = 0;
  const feedOf: GameSocketFeed = {
    welcomed: (id) => { fed.push(`welcomed ${id}`); }, gameLobby: () => undefined, roundStart: () => undefined, seatEnded: () => undefined, dropped: () => undefined,
    seatClans: (m) => { fed.push(`seatClans ${[...m].map(([id, c]) => `${id}:${c}`).join(',')}`); },
  };
  const host = new GameSocketHost({
    pinned: PINNED, ticket: () => 'tkt', holds: () => undefined, name: () => 'socomc', now: () => t,
    socket: () => { const s = { binaryType: '', readyState: 1, sent: [] as string[], send(d: string) { s.sent.push(d); }, close: () => undefined } as unknown as Sock; sockets.push(s); return s; },
    matchStart: (h) => { handOffs.push(h); },
  });
  host.attach(feedOf);
  const server = (ev: ServerEvent): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) }); };
  const welcome = (id = 8): void => server({ type: 'welcome', id, version: 11, map: 'MP2', tick: 0, role: 'spectator', team: null, queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 11, ghost: false } as unknown as ServerEvent);
  host.open(7);
  sockets.at(-1)!.onopen?.({});
  welcome();
  const closeWith = (code: number): void => { sockets.at(-1)!.onclose?.({ code, reason: '' }); };
  const advance = (ms: number): void => { for (let i = 0; i < 10; i++) { t += ms / 10; host.frame(); } };
  return { host, fed, handOffs, server, sockets, welcome, closeWith, advance };
}

describe('AD-13: the game lobby fed the room\'s told tags (C49, C94)', () => {
  it('each seatClans reaches the lobby as the client\'s board holds it, replaced whole', () => {
    const r = rig();
    r.server(clans([{ id: 1, clan: 'NSW' }, { id: 4, clan: 'SEA' }]));
    r.server(clans([{ id: 4, clan: 'SEA' }]));
    expect(r.fed).toEqual(['welcomed 8', 'seatClans 1:NSW,4:SEA', 'seatClans 4:SEA']);
  });

  it('tags told while the match holds the client: the lobby given the board at the way back (adopt), as SEAT-TOLD\'s', () => {
    const r = rig();
    r.host.handOff({ mediusWorldId: 7, gameName: 'test$~Alpha', mission: 'mp2', lateJoiner: false });
    r.server(clans([{ id: 9, clan: 'LTE' }]));                          // a late watcher seated in the round, heard by the match's client only
    expect(r.fed).toEqual(['welcomed 8']);
    const client = r.handOffs[0]!.client;
    expect(client.clans.of(9)).toBe('LTE');
    r.host.adopt(client);
    expect(r.fed).toEqual(['welcomed 8', 'seatClans 9:LTE']);
  });
});

describe('AD-13, the merge controller\'s conditions at the page: the set after the welcome kept, and a re-attach', () => {
  it('condition 1: the set the room sends right after the welcome is held by the client (not dropped) and fed to the lobby', () => {
    const r = rig();
    r.server(clans([{ id: 1, clan: 'NSW' }]));
    expect(r.fed).toEqual(['welcomed 8', 'seatClans 1:NSW']);
    r.host.handOff({ mediusWorldId: 7, gameName: 'test$~Alpha', mission: 'mp2', lateJoiner: false });
    expect(r.handOffs[0]!.client.clans.of(1)).toBe('NSW');               // the match's client holds what the lobby's heard
  });

  it('condition 2: a drop and the reopened socket -- the lobby keeps the last set it had (no empty set fed), then takes the room\'s set told at the new seat', () => {
    const r = rig();
    r.server(clans([{ id: 1, clan: 'NSW' }]));
    r.closeWith(1006);
    r.advance(100);
    r.advance(3000);                                                     // the backoff, then a new socket
    expect(r.sockets).toHaveLength(2);
    expect(r.fed).toEqual(['welcomed 8', 'seatClans 1:NSW']);            // nothing cleared the lobby's tags meanwhile
    r.sockets[1]!.onopen?.({});
    r.welcome(11);
    r.server(clans([{ id: 1, clan: 'NSW' }]));                           // the room's set at the new seat (server seatClans.test.ts)
    expect(r.fed).toEqual(['welcomed 8', 'seatClans 1:NSW', 'welcomed 11', 'seatClans 1:NSW']);
  });
});

describe('AD-13, the review\'s F1 at the page: an empty set clears the lobby\'s tags', () => {
  it('seats: [] after a set reaches the lobby as an empty board and empties the speaker line\'s tag, so no stale tag is drawn on a reused id', () => {
    const r = rig();
    r.server(clans([{ id: 1, clan: 'NSW' }]));
    r.server(clans([]));
    expect(r.fed).toEqual(['welcomed 8', 'seatClans 1:NSW', 'seatClans ']);
    r.host.handOff({ mediusWorldId: 7, gameName: 'test$~Alpha', mission: 'mp2', lateJoiner: false });
    const client = r.handOffs[0]!.client;
    expect(client.clans.of(1)).toBe('');
    const line = voiceHudFrame(new HudVoiceElement(), 1, {                // the speaker line's tag cleared with it
      voice: { channel: 10, holder: 1, talking: false }, self: { id: 8, team: null }, rows: [], spectators: 2,
      nameOf: (id) => (id === 1 ? 'Lima' : null), clanOf: (id) => client.clans.of(id), at: () => null, own: null,
    }).view.name;
    expect(line).toBe('Lima');
  });
});

describe('AD-13 C30: the round\'s speaker line from the client\'s board -- a tagged watcher to another spectator', () => {
  it('"[SEA] Papa" on a spectator\'s line from the live client\'s board; untagged and no holder: the name alone', () => {
    const r = rig();
    r.host.handOff({ mediusWorldId: 7, gameName: 'test$~Alpha', mission: 'mp2', lateJoiner: false });
    const client = r.handOffs[0]!.client;
    r.server(clans([{ id: 7, clan: 'SEA' }]));
    const line = (holder: number): string | null => voiceHudFrame(new HudVoiceElement(), 1, {
      voice: { channel: 10, holder, talking: false }, self: { id: 8, team: null }, rows: [], spectators: 3,
      nameOf: (id) => ({ 7: 'Papa', 9: 'Quinn' } as Record<number, string>)[id] ?? null, clanOf: (id) => client.clans.of(id), at: () => null, own: null,
    }).view.name;
    expect([line(7), line(9)]).toEqual(['[SEA] Papa', 'Quinn']);
  });
});

// ---- the replay: a recording with and without the event (`.s2r`, `./replay`) ----

/** `replayClient.test.ts`'s segment and client: the records through the format's own writer and reader. */
function segment(records: ReplayRecord[]): LoadedSegment {
  const { records: decoded, truncated } = decodeRecords(fixtureBytes(records));
  const h = decoded[0];
  if (h?.kind !== 'header') throw new Error('no header');
  return { header: h.header, records: decoded, truncated };
}
async function open(seg: LoadedSegment) {
  let now = 10_000;
  const c = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP2', now: () => now });
  const events: ServerEvent[] = [];
  c.on((ev) => { events.push(ev); });
  await c.ready;
  return { c, events, wait: (ms: number) => { now += ms; c.advance(); } };
}

describe('AD-13: the replay page and the .s2r readers tolerate seatClans (a recording with and without it)', () => {
  it('the fold\'s table names it transient: nothing in a replay draws it (the speaker line needs the floor, never recorded)', () => {
    expect(EVENT_CLASS.seatClans).toBe('transient');
    expect(EVENT_CLASS.voiceFloor).toBe('transient');
  });

  it('a recording holding one decodes and plays: the event reaches the page and the replay\'s board; a seek folds it not', async () => {
    const recs = fixtureRecords();
    const told = clans([{ id: 1, clan: 'NSW' }]);
    recs.splice(recs.findIndex((x) => x.kind === 'snap' && x.tick === 200), 0, { kind: 'event', tick: 200, event: told });
    const seg = segment(recs);
    expect(seg.records.some((x) => x.kind === 'event' && x.event.type === 'seatClans')).toBe(true);
    const r = await open(seg);
    r.wait(msOf(300));
    expect(r.events.filter((e) => e.type === 'seatClans')).toEqual([told]);
    expect(r.c.clans.of(1)).toBe('NSW');
    r.events.length = 0;
    r.c.seek(250);
    expect(r.events.filter((e) => e.type === 'seatClans')).toEqual([]);
  });

  it('a recording without one plays as before: the board empty', async () => {
    const r = await open(segment(fixtureRecords()));
    r.wait(msOf(300));
    expect(r.events.some((e) => e.type === 'seatClans')).toBe(false);
    expect(r.c.clans.all().size).toBe(0);
  });
});
