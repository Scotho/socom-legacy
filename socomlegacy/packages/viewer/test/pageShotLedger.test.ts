import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import type { FireEvent, FireWeapon } from '../src/fire';
import { FirearmWire, type FirearmWireClient } from '../src/net/firearmWire';
import { COMBAT_REPORT_RING, NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import type { ClientEvent, CombatReport, ServerEvent } from '../src/net/protocol';
import { RemotePlayers } from '../src/remotePlayers';

/**
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game). Product track: the page's half --
 * per round it sends (its `fire` seq) its own expectation from the cast it already makes on the drawn bodies
 * (`RemotePlayers.aimFirst`), kept by the net client and handed to the playtest report only once the room speaks the
 * ledger (a combat row naming a seq). Nothing sent or drawn changes.
 */

const rifle: FireWeapon = { name: 'rifle', id: 1, range: 900, fireAnim: null, sounds: { close: null, med: null, far: null, reload: null } };
const round = (extra: Partial<Extract<FireEvent, { type: 'round' }>> = {}): Extract<FireEvent, { type: 'round' }> => ({
  type: 'round', weapon: rifle, from: [1, 2, 3], to: [1, 2, -7], hit: false, rounds: 29, shot: 1, ...extra,
});

describe('SHOT-LEDGER (page): the wire hands each sent round to the ledger, the message unchanged', () => {
  it("calls `sentRound` with the round's seq, its line and its reach (the weapon's range, else the round's own length)", () => {
    const sent: ClientEvent[] = [];
    const client: FirearmWireClient = { state: 'open', lastSeq: () => 50, viewTick: (at) => at!, shownTick: () => null, send: (e) => { sent.push(e); } };
    const sentRound = vi.fn();
    const wire = new FirearmWire({ client: () => client, sidearmId: () => 2, now: () => 100, sentRound });
    const plain = new FirearmWire({ client: () => ({ ...client, send: () => undefined }), sidearmId: () => 2, now: () => 100 });
    wire.setTrigger(true); plain.setTrigger(true);
    wire.fireEvent(round());
    plain.fireEvent(round());
    expect(sent).toEqual([{ type: 'fire', seq: 50, from: [1, 2, 3], dir: [0, 0, -1], weapon: 0, viewTick: 100, eye: [1, 2, 3], aim: [0, 0, -1] }]);
    expect(sentRound).toHaveBeenCalledTimes(1);
    expect(sentRound).toHaveBeenCalledWith(50, [1, 2, 3], [0, 0, -1], 900);
    wire.fireEvent(round({ weapon: { ...rifle, range: undefined } }));
    expect(sentRound).toHaveBeenLastCalledWith(50, [1, 2, 3], [0, 0, -1], 10);
  });
});

function walk(): NetWalk {
  return { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined };
}
function fakeSocket(): WebSocketLike & { server(ev: ServerEvent): void } {
  const s = {
    binaryType: 'blob', readyState: 1,
    send() { /* not read */ },
    close() { s.readyState = 3; s.onclose?.({ code: 1000, reason: '' }); },
    onopen: null as WebSocketLike['onopen'], onclose: null as WebSocketLike['onclose'],
    onmessage: null as WebSocketLike['onmessage'], onerror: null as WebSocketLike['onerror'],
    server(ev: ServerEvent) { s.onmessage?.({ data: JSON.stringify(ev) }); },
  };
  return s;
}
const fireRow = (extra: Partial<CombatReport> = {}): ServerEvent => ({
  type: 'combat', eventId: 1, tick: 1, round: 1, map: 'MP2', status: 'miss', request: 'fire', reason: null, weapon: 62,
  attacker: { id: 1, team: 'seal' }, target: null, part: null, hitLocations: null, distance: null, distanceMetres: null,
  healthBefore: null, healthAfter: null, armourBefore: null, armourAfter: null, rawDamage: null, damageApplied: 0,
  killed: false, selfDamage: false, friendlyFire: false, point: [0, 0, 0], direction: [0, 0, -1],
  hitLocation: null, hitLocationNames: [], struckPartHealthChange: null, totalBodyPartHealthChange: null, ...extra,
} as ServerEvent);

describe("SHOT-LEDGER (page): the net client's ring of the page's own rounds", () => {
  it('kept, but not reported until a combat row names a seq; then reported, bounded, a pull once a seq', () => {
    const socket = fakeSocket();
    const c = new NetClient({ url: 'mem', map: 'MP2', name: 'A', socket: () => socket }, walk());
    c.notePageShot({ seq: 7, body: 2, bone: 4, part: 0, distance: 120 });
    c.notePageShot({ seq: 7, body: 2, bone: 5, part: 3, distance: 121 });   // a pull's later ray: the seq kept once
    expect(c.combatReport()).toEqual({ events: [], dropped: 0 });
    socket.server(fireRow());                                               // a row with no seq: an older room
    expect('pageShots' in c.combatReport()).toBe(false);
    socket.server(fireRow({ seq: 7, rewindClass: 'c', missBy: 1 }));
    expect(c.combatReport().pageShots).toEqual({ events: [{ seq: 7, body: 2, bone: 4, part: 0, distance: 120 }], dropped: 0 });
    for (let i = 0; i < COMBAT_REPORT_RING + 3; i++) c.notePageShot({ seq: 100 + i, body: null, bone: null, part: null, distance: null });
    const r = c.combatReport().pageShots!;
    expect(r.events).toHaveLength(COMBAT_REPORT_RING);
    expect(r.dropped).toBe(4);
  });
});

describe('SHOT-LEDGER (page): RemotePlayers.aimFirst -- the nearest record of the cast on the drawn bodies', () => {
  it("names the body, bone and part of the nearest record over every living drawn body; null with none; skips the dead and hidden", () => {
    const rp = new RemotePlayers(new Scene());
    const inner = rp as unknown as { remotes: Map<number, unknown>; aimCast: (r: { id: number }, s: unknown, e: unknown, d: unknown, reach: number, sink: (part: number, t: number, bone: number) => void) => void };
    expect(rp.aimFirst([0, 0, 0], [0, 0, 1], 100)).toBeNull();
    const body = (id: number, alive = true, visible = true) => ({ id, snap: { alive }, view: { group: { visible } } });
    inner.remotes.set(2, body(2)); inner.remotes.set(3, body(3)); inner.remotes.set(4, body(4, false)); inner.remotes.set(5, body(5, true, false));
    const records: Record<number, [number, number, number][]> = { 2: [[3, 50, 9], [0, 55, 1]], 3: [[0, 40, 1], [3, 44, 9]], 4: [[0, 1, 1]], 5: [[0, 2, 1]] };
    inner.aimCast = (r, _s, _e, _d, _reach, sink) => { for (const [part, t, bone] of records[r.id] ?? []) sink(part, t, bone); };
    expect(rp.aimFirst([0, 0, 0], [0, 0, 1], 100)).toEqual({ id: 3, bone: 1, part: 0, distance: 40 });
  });
});
