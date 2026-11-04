// test/replayFixture.ts -- PT-18's fixture segment (web sprint 35; research 244), built with the format's own writer
import {
  encodeRecord, REPLAY_FORMAT_VERSION, ReplayWriter, type ReplayHeader, type ReplayPlayer, type ReplayRecord,
} from '../../match/src/replay/format';
import { PROTOCOL_VERSION, SNAPSHOT_HZ, TICK_HZ, type BodyState, type ServerEvent } from '../src/net/protocol';

/** A body at `x` (the feet's x), the rest at rest: the snapshots carry player 1 at x = tick, player 2 at x = -tick. */
export const body = (id: number, x: number): BodyState => ({
  id, feet: [x, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 64, stance: 0, landing: 0, jumps: 0, ground: 1,
  groundForward: 0, groundRight: 0, groundCls: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: -1, turnRate: 0, trav: 0, travFrame: 0, travRootY: NaN, travBlend: 0, travBlendWeight: 0,
  peek: 0, weapon: 255, slot: 0,
});

export const header = (over: Partial<ReplayHeader> = {}): ReplayHeader => ({
  format: REPLAY_FORMAT_VERSION, protocol: PROTOCOL_VERSION, build: { commit: 'abc1234', dirty: false, branch: 'agent/playtest', branchCreated: null },
  map: 'MP2', rules: 'classic', gameType: null, tickHz: TICK_HZ, snapshotHz: SNAPSHOT_HZ, kind: 'solo', serverName: null,
  startedAt: '2026-10-08T00:00:00.000Z', session: { id: '20261008-1a2b', segment: 0 }, ...over,
});

export const ALPHA: ReplayPlayer = { id: 1, name: 'Alpha', team: 'seal', role: 'player', char: 0 };
export const BRAVO: ReplayPlayer = { id: 2, name: 'Bravo', team: 'terrorist', role: 'player', char: 0 };
/** The brief's events: at ticks 100, 200 and 400 -- a `votes` whose count is its tick, so a test can tell them apart. */
export const EVENT_TICKS = [100, 200, 400] as const;

/**
 * The brief's segment (PT-18 step 1): two players, Bravo leaving at tick 300 (a `players` record), the events at
 * 100/200/400, a snapshot every 2 ticks from 0 to 500, an `end` at 500. Within a tick: the roster, the event, the
 * snapshot -- the order the room's step makes them in.
 */
export function fixtureRecords(h: ReplayHeader = header()): ReplayRecord[] {
  const out: ReplayRecord[] = [{ kind: 'header', header: h }];
  for (let tick = 0; tick <= 500; tick++) {
    if (tick === 0) out.push({ kind: 'players', tick, players: [ALPHA, BRAVO] });
    if (tick === 300) out.push({ kind: 'players', tick, players: [ALPHA] });
    if ((EVENT_TICKS as readonly number[]).includes(tick)) out.push({ kind: 'event', tick, event: { type: 'votes', count: tick } });
    if (tick % 2 === 0) out.push({ kind: 'snap', tick, bodies: tick < 300 ? [body(1, tick), body(2, -tick)] : [body(1, tick)] });
  }
  out.push({ kind: 'end', tick: 500, reason: 'closed' });
  return out;
}

/** RV2-01: an `event` record carrying the wire's `ServerEvent` at `tick`. */
export const eventRecord = (tick: number, event: ServerEvent): ReplayRecord => ({ kind: 'event', tick, event });

/** RV2-01: a `roundStart` of `round` (of `rounds`) at `tick`; the clock and score fields are test values, not the game's. */
export const roundStartRecord = (tick: number, round: number, rounds = 5): ReplayRecord => eventRecord(tick, {
  type: 'roundStart', round, seconds: 600, wins: { seal: 0, terrorist: 0 }, rounds, epoch: 0, startTick: tick,
});

/** RV2-01: a `roundOver` of `round` at `tick`, the SEALs its winner (a test value). */
export const roundOverRecord = (tick: number, round: number): ReplayRecord => eventRecord(tick, {
  type: 'roundOver', round, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: [],
});

/** The segment's bytes through `ReplayWriter` (one flush), as the recorder writes them. */
export function fixtureBytes(records: readonly ReplayRecord[] = fixtureRecords()): Uint8Array {
  const chunks: Uint8Array[] = [];
  const w = new ReplayWriter((b) => chunks.push(b));
  for (const r of records) w.write(r);
  w.flush();
  return concat(chunks);
}

/** The bytes of `records` cut inside the record at index `at` (its first `keep` bytes kept): a live segment's prefix. */
export function cutBytes(records: readonly ReplayRecord[], at: number, keep = 7): Uint8Array {
  const whole = records.slice(0, at).map((r) => encodeRecord(r));
  return concat([...whole, encodeRecord(records[at]!).subarray(0, keep)]);
}

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

/** gzip by the platform's own `CompressionStream` (Node 22 has it, as the browser does: W35.R1's path). */
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes as BodyInit).body!.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A `fetch` that answers `body` (status 200) or `status` alone. */
export function fakeFetch(body: Uint8Array | null, status = 200): typeof fetch {
  return (async () => new Response(body ? (body as BodyInit) : null, { status })) as typeof fetch;
}

/** The milliseconds of `ticks` at the header's rate (1x). */
export const msOf = (ticks: number): number => (ticks * 1000) / TICK_HZ;
