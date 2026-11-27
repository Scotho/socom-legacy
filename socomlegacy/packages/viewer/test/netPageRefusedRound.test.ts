// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import { COMBAT_REPORT_RING, NetClient, REFUSED_REASONS_MAX, REFUSED_WHY_MAX_CHARS, type WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { buildReport, createTracker } from '../src/playtestReport';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * LATER 876 (the owner's B2/S6/S7, 2026-11-22; the network's bookkeeping, no counterpart in the original): the room tells
 * the page a round it refused (`{ type: 'roundRefused', request: 'fire', seq, why }`). The page gives nothing back (the round
 * stays spent, S6: the original spends every round it fires, `FUN_005be9a0`, `FUN_005c5340`; no server refuses one, research 91) and draws nothing; it COUNTS
 * it -- the net client keeps the rows (seq, request, why) and a count by reason, which the `?devmode` playtest report
 * saves. An older page's switch ends in `default: break` and ignores it. Named `roundRefused`, not the brief's `refused`:
 * that type is the hello's refusal, which every page takes as the end of its connection. The page harness is `netPageConnect.test.ts`'s
 * (copied, not imported).
 */

function page(undone: string[] = [], extra: Partial<NetPageDeps> = {}) {
  const sockets: WebSocketLike[] = [];
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    local: false, undoReload: () => { undone.push('flinch'); }, staleReload: (id) => { undone.push(`reload ${id}`); },
    staleRound: (shot) => { undone.push(`round ${shot}`); }, staleThrow: (kind) => { undone.push(`throw ${kind}`); },
    socket: () => {
      const s = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      sockets.push(s);
      return s;
    },
    ...extra,
  };
  const net = new NetPage(deps, 'ws://localhost:8787/ws', 'MP2', 'Tester', undefined, false, 'classic');
  const server = (ev: unknown): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  sockets.at(-1)!.onopen?.({} as Event);
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false,
  });
  return { net, server };
}

type Refused = { events: { seq: number; request: string; why: string }[]; dropped: number; byReason: Record<string, number> };
const refusedOf = (c: NetClient): Refused | undefined => (c.combatReport() as { refused?: Refused }).refused;

describe("LATER 876: the page told 'roundRefused' gives nothing back, draws nothing, and counts it", () => {
  it("a refused round: no refund (its seq's journal kept), the row (seq, request, why) and the count by reason kept", () => {
    const undone: string[] = [];
    const p = page(undone);
    let seq = 50;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => seq;
    const round = (weapon: unknown, shot: number) => ({ type: 'round', weapon, from: [0, 0, 0], to: [0, 0, -10], hit: false, rounds: 1, shot }) as never;
    p.net.trigger(true);
    p.net.fireEvent(round(HELD_RIFLE, 31));
    seq = 51; p.net.fireEvent(round(HELD_RIFLE, 32));
    expect(() => {
      p.server({ type: 'roundRefused', request: 'fire', seq: 50, why: 'cone: eye' });
      p.server({ type: 'roundRefused', request: 'fire', seq: 51, why: 'reload or empty' });
      p.server({ type: 'roundRefused', request: 'fire', seq: 52, why: 'cone: eye' });
    }).not.toThrow();
    expect(undone).toEqual([]);                                // spent, as now: nothing given back
    // Not the hello's `refused` (`{ type: 'refused', reason }`), which ends the connection: the client stays open.
    expect(p.net.client.state).toBe('open');
    expect(p.net.client.refusal).toBeNull();
    expect(refusedOf(p.net.client)).toEqual({
      events: [{ seq: 50, request: 'fire', why: 'cone: eye' }, { seq: 51, request: 'fire', why: 'reload or empty' }, { seq: 52, request: 'fire', why: 'cone: eye' }],
      dropped: 0, byReason: { 'cone: eye': 2, 'reload or empty': 1 },
    });
    // The journal was not consumed: a `stale` for the same seq (never sent with a `roundRefused` by the room) still refunds once.
    p.server({ type: 'stale', request: 'fire', seq: 50 } as ServerEvent);
    expect(undone).toEqual(['round 31']);
  });

  it('none told: the combat report is what it was (no refused key)', () => {
    const p = page();
    expect(p.net.client.combatReport()).toEqual({ events: [], dropped: 0 });
    expect('refused' in p.net.client.combatReport()).toBe(false);
  });

  it('the rows are bounded by COMBAT_REPORT_RING, the older let go counted; the counts by reason keep every one', () => {
    const p = page();
    for (let i = 0; i < COMBAT_REPORT_RING + 3; i++) p.server({ type: 'roundRefused', request: 'fire', seq: i, why: 'rate' });
    const r = refusedOf(p.net.client)!;
    expect(r.events).toHaveLength(COMBAT_REPORT_RING);
    expect(r.events[0]!.seq).toBe(3);
    expect(r.dropped).toBe(3);
    expect(r.byReason).toEqual({ rate: COMBAT_REPORT_RING + 3 });
  });

  it("an older page's switch: a message type it does not know ends at `default: break` -- nothing thrown, nothing given back", () => {
    const undone: string[] = [];
    const p = page(undone);
    expect(() => p.server({ type: 'notYetKnown', request: 'fire', seq: 50, why: 'x' })).not.toThrow();
    expect(undone).toEqual([]);
  });
});

describe("LATER 876: the playtest report saves the refused rounds (rows and the count by reason); none, the file as before", () => {
  const labels = {
    revision: 'abc1234', map: 'RUN/MP2.ZDB', renderingBackend: 'webgl2', startedAt: '2026-10-02T00:00:00.000Z',
    savedAt: '2026-10-02T00:01:00.000Z', durationSeconds: 60,
  };
  const data = createTracker().report();

  it('with refused rounds kept: a `refused` section (events, dropped, byReason, limit) and its note', () => {
    const refused = { events: [{ seq: 50, request: 'fire' as const, why: 'cone: eye' }], dropped: 2, byReason: { 'cone: eye': 3 } };
    const r = buildReport(labels, data, { events: [], dropped: 0, refused } as never) as unknown as { refused?: unknown; notes: string[]; combat?: unknown };
    expect(r.refused).toEqual({ events: [{ seq: 50, request: 'fire', why: 'cone: eye' }], dropped: 2, byReason: { 'cone: eye': 3 }, limit: COMBAT_REPORT_RING });
    expect(r.combat).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/refused/i);
  });

  it('with none: byte for byte the report without the section', () => {
    const plain = JSON.stringify(buildReport(labels, data, { events: [], dropped: 0 }));
    const empty = { events: [], dropped: 0, refused: { events: [], dropped: 0, byReason: {} } };
    expect(JSON.stringify(buildReport(labels, data, empty as never))).toBe(plain);
  });
});

/**
 * The fresh review's F5 (2026-11-22): the page validates the room's fields as its neighbouring cases do -- a hostile
 * community host can send anything. A `seq` not an integer, or a `why` not a string, drops the event; a `why` is cut to
 * `REFUSED_WHY_MAX_CHARS`; the count by reason holds at most `REFUSED_REASONS_MAX` distinct keys, the rest under 'other'.
 */
describe("LATER 876, F5: a malformed 'roundRefused' is not kept; the reasons are bounded", () => {
  it('a seq not an integer, or a why not a string: dropped (nothing kept)', () => {
    const p = page();
    for (const ev of [
      { seq: 1.5, why: 'rate' }, { seq: '3', why: 'rate' }, { why: 'rate' }, { seq: Number.NaN, why: 'rate' },
      { seq: 4, why: 7 }, { seq: 5 }, { seq: 6, why: { toString: 'x' } },
    ]) expect(() => p.server({ type: 'roundRefused', request: 'fire', ...ev })).not.toThrow();
    expect('refused' in p.net.client.combatReport()).toBe(false);
  });

  it('a long why is cut to REFUSED_WHY_MAX_CHARS', () => {
    const p = page();
    p.server({ type: 'roundRefused', request: 'fire', seq: 9, why: 'x'.repeat(500) });
    const r = refusedOf(p.net.client)!;
    expect(r.events[0]!.why).toBe('x'.repeat(REFUSED_WHY_MAX_CHARS));
    expect(Object.keys(r.byReason)).toEqual(['x'.repeat(REFUSED_WHY_MAX_CHARS)]);
  });

  it("100 distinct whys: at most REFUSED_REASONS_MAX keys and 'other', every one counted", () => {
    const p = page();
    for (let i = 0; i < 100; i++) p.server({ type: 'roundRefused', request: 'fire', seq: i, why: `why ${i}` });
    const r = refusedOf(p.net.client)!;
    expect(Object.keys(r.byReason).length).toBe(REFUSED_REASONS_MAX + 1);
    expect(r.byReason.other).toBe(100 - REFUSED_REASONS_MAX);
    expect(Object.values(r.byReason).reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.events).toHaveLength(100);
  });
});

/**
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game) -- the ledger review's F1: the page
 * collects its own expectation of a round (one `aimFirst` cast and one ring entry) only on a `?devmode` page (the
 * playtest report's own gate, `DEV.tools`, handed as `shotLedger`); without it, firing does nothing more than before.
 */
describe('SHOT-LEDGER, F1: the page collects only with ?devmode (`shotLedger`)', () => {
  const fire = (p: ReturnType<typeof page>) => {
    let seq = 50;
    (p.net.client as unknown as { lastSeq(): number }).lastSeq = () => seq;
    const round = (shot: number) => ({ type: 'round', weapon: HELD_RIFLE, from: [0, 0, 0], to: [0, 0, -10], hit: false, rounds: 1, shot }) as never;
    p.net.trigger(true);
    p.net.fireEvent(round(31));
    seq = 51; p.net.fireEvent(round(32));
  };
  const ring = (c: NetClient): unknown[] => (c as unknown as { pageShots: unknown[] }).pageShots;
  const remoteWith = (aimFirst: ReturnType<typeof vi.fn>) => ({
    setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, aimFirst,
  }) as unknown as RemotePlayers;

  it('devmode off (no `shotLedger`): rounds fired leave the ring empty and no cast is made', () => {
    const aimFirst = vi.fn(() => null);
    const p = page([], { remote: remoteWith(aimFirst) });
    fire(p);
    expect(aimFirst).not.toHaveBeenCalled();
    expect(ring(p.net.client)).toEqual([]);
  });

  it('devmode on (`shotLedger: true`): one cast and one ring entry per round, as before', () => {
    const aimFirst = vi.fn(() => ({ id: 2, bone: 4, part: 0, distance: 9 }));
    const p = page([], { remote: remoteWith(aimFirst), shotLedger: true });
    fire(p);
    expect(aimFirst).toHaveBeenCalledTimes(2);
    expect(ring(p.net.client)).toEqual([
      { seq: 50, body: 2, bone: 4, part: 0, distance: 9 }, { seq: 51, body: 2, bone: 4, part: 0, distance: 9 },
    ]);
  });
});
