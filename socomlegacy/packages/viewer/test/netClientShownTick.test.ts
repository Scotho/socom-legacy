import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERP_DELAY_MS, NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { TICK_HZ, type BodyState, type ServerEvent } from '../src/net/protocol';
import { encodeSnapshot } from '../src/net/codec';

/**
 * NCW-17 (the netcode wave's claim-versus-picture instrument, `docs/plans/2026-11-05-netcode-wave.md` section 7; a
 * labelled adaptation, product track): the page's displayed tick (`NetClient.shownTick`) -- the room's tick the drawn
 * remote bodies stand at, by `bodies()`' own choice of snapshots. Bracketed, it is the view tick; in a snapshot gap,
 * where `bodies()` holds the newest snapshot while `viewTick` runs on from its arrival (Benny's §1:
 * `agent/fps-fidelity@4accc1142:socomlegacy/docs/plans/2026-11-04-fps-hitreg-audit.md:399-436`), it is the held
 * snapshot's tick. Unit tests on the client alone: an in-memory socket, a stubbed clock.
 */

const IDLE: NetWalk = { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined };

/** A remote body at `x` along the floor (every other field at rest). */
function body(id: number, x: number): BodyState {
  return {
    id, feet: [x, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 0, stance: 0, landing: 0, jumps: 0, ground: 0,
    groundForward: 0, groundRight: 0, groundCls: -1, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
    overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0,
    travBlendWeight: 0, peek: 0, weapon: 0, slot: 0,
  };
}

/** A client on a socket the test drives, its clock `performance.now` stubbed to `clock.now`. */
function client(): { c: NetClient; snap(tick: number, x: number): void; clock: { now: number } } {
  const clock = { now: 1_000_000 };
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
  const socket: WebSocketLike = {
    binaryType: 'blob', readyState: 1, send: () => undefined, close: () => undefined,
    onopen: null, onclose: null, onmessage: null, onerror: null,
  };
  const c = new NetClient({ url: 'mem', map: 'SYN', name: 'A', socket: () => socket, watch: true }, IDLE);
  socket.onopen?.({});
  socket.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 3, version: 11, map: 'SYN', tick: 0, role: 'spectator', team: null, queue: 0, epoch: 0, env: { revision: 0, epoch: 0, states: [] } } as unknown as ServerEvent) });
  return { c, clock, snap: (tick, x) => { socket.onmessage?.({ data: encodeSnapshot({ tick, own: null, bodies: [body(7, x)] }) }); } };
}

afterEach(() => { vi.restoreAllMocks(); });

/** The page's snapshot period at 30 a second, ms. */
const SNAP_MS = 1000 / 30;
const DELAY_TICKS = (INTERP_DELAY_MS / 1000) * TICK_HZ;

describe('NCW-17: the displayed tick', () => {
  it('is null before a snapshot (nothing drawn)', () => {
    const { c } = client();
    expect(c.bodies()).toEqual([]);
    expect(c.shownTick()).toBeNull();
  });

  it('equals viewTick while two snapshots bracket the view time, and the drawn body is interpolated there', () => {
    const { c, snap, clock } = client();
    // Snapshots every 2 ticks at 30 a second, the body 10 units a tick along x: ticks 50..60.
    for (let tick = 50; tick <= 60; tick += 2) { snap(tick, tick * 10); clock.now += SNAP_MS; }
    clock.now -= SNAP_MS;
    clock.now += 10;                                          // 10 ms after tick 60's arrival: view at 60 - 6 + 0.6
    const view = c.viewTick();
    expect(view).toBeCloseTo(60 - DELAY_TICKS + 0.6, 6);
    expect(c.shownTick()).toBe(view);
    expect(c.bodies()[0]!.feet[0]).toBeCloseTo(view * 10, 3);   // the picture at the view tick
  });

  it("equals the held snapshot's tick through a 500 ms gap while viewTick runs on (24 ticks past the picture at its end)", () => {
    const { c, snap, clock } = client();
    snap(58, 580); clock.now += SNAP_MS;
    snap(60, 600);                                           // the last before the gap (Benny's probe: 58 and 60)
    clock.now += 500;
    const view = c.viewTick();
    expect(view).toBeCloseTo(60 + 30 - DELAY_TICKS, 6);      // 84: the claim ran on
    expect(c.bodies()[0]!.feet[0]).toBe(600);                // the drawn body held at tick 60's place
    expect(c.shownTick()).toBe(60);
    expect(view - c.shownTick()!).toBeCloseTo(24, 6);
    // Each moment of the gap: once the view passes the newest, the held tick 60; between 58 and 60, the view tick itself;
    // before 58 (both snapshots newer than the view), the older held, 58 -- what `bodies()` draws at each.
    for (let ms = 0; ms <= 500; ms += 25) {
      clock.now = 1_000_000 + SNAP_MS + ms;
      const v = c.viewTick(), x = c.bodies()[0]!.feet[0];
      const want = v >= 60 ? 60 : v >= 58 ? v : 58;
      expect(c.shownTick(), `${ms} ms into the gap`).toBe(want);
      expect(x, `${ms} ms: the drawn body at the displayed tick`).toBeCloseTo(want * 10, 3);
    }
  });

  it('is the snapshot\'s own tick when every snapshot in hand is newer than the view tick (the first after a join)', () => {
    const { c, snap } = client();
    snap(40, 400);
    expect(c.viewTick()).toBeCloseTo(40 - DELAY_TICKS, 6);
    expect(c.bodies()[0]!.feet[0]).toBe(400);
    expect(c.shownTick()).toBe(40);
  });
});
