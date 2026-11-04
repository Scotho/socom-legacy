import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { DoorPage, type DoorPageDeps } from '../src/doorPage';
import { GAME_FRAME_DT, segmentHit } from '@s2u/scene';
import { groundGrid, TICK } from '../src/mover';
import type { ClientEvent, Command, DoorWire } from '../src/net/protocol';
import type { Knock } from '../src/net/blast';
import { NetClient, type NetWalk } from '../src/net/client';
import { LoopbackMatch } from '../src/net/loopback';

/**
 * The doors on the page (`./doorPage`): the action button on the door under the reticle -- used here offline, sent to
 * the server in a match (and not at all by a spectator) -- the swing heard and drawn, the server's doors followed.
 */

const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!MP2)(`the doors on the page${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const setUp = (net: ReturnType<DoorPageDeps['net']> = null, press?: () => number) => {
    const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground);
    const sounds: string[] = [], moves: string[] = [];
    const page = new DoorPage({
      grid: () => grid, feet: () => [582.5, 142, 1135], aim: () => ({ eye: [582.5, 157.4, 1135], far: [582.5, 157.4, 135] }),
      sound: (name) => sounds.push(name), move: (path) => moves.push(path), net: () => net,
      ...(press ? { press } : {}),
    } as DoorPageDeps);
    page.setMap(map.doors, map.ground);
    return { page, sounds, moves };
  };

  it('offline, the action on bdoor_4 swings it open: heard, drawn, and the HUD\'s target is gone while it swings', () => {
    const { page, sounds, moves } = setUp();
    expect(page.target()).toBe(0);
    expect(page.action()).toBe(true);
    expect(page.target()).toBeNull();
    for (let k = 0; k < 2 / TICK; k++) page.frame(TICK);
    expect(page.stats().doors[0]).toMatchObject({ node: 'bdoor_4', open: true, busy: false });
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
    expect(new Set(moves)).toEqual(new Set(['worldmodel/bdoor_4']));
  });

  it('a use runs as long as its door\'s own program says (`useSeconds`: the ANIMATE head, 9 game frames, then the 0.7 s swing)', () => {
    const { page } = setUp();
    const seconds = page.stats().doors[0]!.seconds!;
    expect(seconds).toBeCloseTo(9 * GAME_FRAME_DT + 0.7, 6);             // the swing's seconds are the disc's float32
    expect(page.action()).toBe(true);
    for (let k = 0; k < Math.floor((seconds - 0.05) / TICK); k++) page.frame(TICK);
    expect(page.stats().doors[0]!.busy).toBe(true);                       // still swinging short of it
    for (let k = 0; k < Math.ceil(0.1 / TICK); k++) page.frame(TICK);
    expect(page.stats().doors[0]).toMatchObject({ open: true, busy: false });
  });

  // B139's post-merge doors.spec: the headless page runs at 22-27 fps. The door's run is its program's on the page's frame
  // clock at any frame length -- the open and the close each end within two frames of `useSeconds` -- so a real-time
  // overrun is frames the page's clamp (0.1 s, PAR-24) did not count, not a slower door.
  it.each([TICK, 0.04, 0.1])('frames of %s s: the open and the close each end within two frames of the door program run', (dt) => {
    const { page } = setUp();
    const seconds = page.stats().doors[0]!.seconds!;
    const runFor = (): number => { let t = 0; for (let k = 0; k < 1000 && page.stats().doors[0]!.busy; k++) { page.frame(dt); t += dt; } return t; };
    expect(page.use(0)).toBe(true);                                       // the hook's use: the reticle aside
    const open = runFor();
    expect(page.stats().doors[0]).toMatchObject({ open: true, busy: false });
    expect(page.use(0)).toBe(true);
    const shut = runFor();
    expect(page.stats().doors[0]).toMatchObject({ open: false, busy: false });
    for (const ran of [open, shut]) { expect(ran).toBeGreaterThanOrEqual(seconds - 1e-6); expect(ran).toBeLessThanOrEqual(seconds + 2 * dt + 1e-6); }
  });

  // LATER 362: the action button's chased press rides the door event (the room picks the kick from it; the network's
  // bookkeeping), when the page has one.
  it("RED: LATER 362 -- the door event carries the action button's chased press", () => {
    const sent: ClientEvent[] = [];
    const { page } = setUp({ role: 'player', send: (ev) => sent.push(ev), lastSeq: () => 41, doors: () => undefined }, () => 0.7);
    expect(page.action()).toBe(true);
    expect(sent).toEqual([{ type: 'door', seq: 41, door: 0, press: 0.7 }]);   // today: no press
  });

  // P7 (DOOR_PREDICT_ADAPTATION): was "nothing swung here until the snapshots say so" -- the press now runs here at once,
  // and the room's swing, when its snapshot shows it, is that run (the delayed room's cases below).
  it('in a match the action is the server\'s: a door event, predicted here at once; the snapshot\'s swing is that run', () => {
    const sent: ClientEvent[] = [];
    let doors: DoorWire[] | undefined = [{ valve: 0, phase: 255 }, { valve: 0, phase: 255 }, { valve: 0, phase: 255 }];
    const { page, sounds } = setUp({ role: 'player', send: (ev) => sent.push(ev), lastSeq: () => 41, doors: () => doors });
    expect(page.action()).toBe(true);
    expect(sent).toEqual([{ type: 'door', seq: 41, door: 0 }]);
    page.frame(TICK);
    expect(page.stats().doors[0]!.busy).toBe(true);
    for (let k = 0; k < 20; k++) page.frame(TICK);                             // past the head: the valve and the sound
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
    doors = [{ valve: 1, phase: 60 }, { valve: 0, phase: 255 }, { valve: 0, phase: 255 }];   // the server swings it
    page.frame(TICK);
    expect(page.stats().doors[0]!.busy).toBe(true);
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
    doors = [{ valve: 1, phase: 255 }, { valve: 0, phase: 255 }, { valve: 0, phase: 255 }];
    for (let k = 0; k < 2 / TICK; k++) page.frame(TICK);
    expect(page.stats().doors[0]).toMatchObject({ open: true, busy: false });
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);                              // once
  });

  it('a spectator\'s press is not a door\'s; a late joiner sees an open door open, silently', () => {
    const sent: ClientEvent[] = [];
    const { page, sounds } = setUp({ role: 'spectator', send: (ev) => sent.push(ev), lastSeq: () => 1, doors: () => [{ valve: 1, phase: 255 }] });
    expect(page.action()).toBe(false);
    expect(sent).toEqual([]);
    page.frame(TICK);
    expect(page.stats().doors[0]).toMatchObject({ open: true, busy: false });
    expect(sounds).toEqual([]);
  });
});

/**
 * P7 (the online-parity sweep's DMA-2; research 92 sections 6 and 7, DOOR_PREDICT_ADAPTATION): the original runs a door's
 * use on the pressing console (`FUN_00592d50`'s 0x2000 branch -> `FUN_002b44e0`, D:L452002-452022, D:L156787-156865) and
 * only logs it to the net (`FUN_002bb5b0`), so its presser sees the swing at the press. The port's room is the authority,
 * so the page predicts its own press and reconciles with the room's snapshots. Driven here against the room itself
 * (`LoopbackMatch`) with a one-way delay of `DELAY` ms each way (`LoopbackOptions.delayMs`), the page on its own copy of
 * MP2's hull.
 */
describe.skipIf(!MP2)(`P7: the own press predicted against a delayed room${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** One-way, ms: a 1.2 s round trip, longer than a use's run (1.0 s on bdoor_4), unless a case says otherwise. */
  const DELAY = 600;
  const FEET: [number, number, number] = [582.5, 142, 1135];
  const TICK_MS = 1000 / 60;
  const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  /** The walk as the net client drives it: the stick at rest, the feet at bdoor_4. */
  class Walk implements NetWalk {
    tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number]) => void) | null = null;
    feet: [number, number, number] = [...FEET];
    setNetTap(tap: Walk['tap']): void { this.tap = tap; }
    respawn(): boolean { return true; }
    nudge(): void { /* the page's feet stay at the door */ }
    setLocked(): void { /* nothing */ }
    knock(_k: Knock): boolean { return true; }
    tick(): void { this.tap?.({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, this.feet); }
  }

  afterEach(() => { vi.useRealTimers(); });

  /** The room (`reach` false: its body left at its spawn, out of the door's reach) and the page, joined over the delay. */
  async function rig(reach = true, delayMs = DELAY) {
    vi.useFakeTimers();
    const roomMap = simMapFromBytes(MP2!, 'RUN/MP2.ZDB'), pageMap = simMapFromBytes(MP2!, 'RUN/MP2.ZDB');
    const match = new LoopbackMatch(roomMap, null, { auto: false, delayMs });
    const walk = new Walk();
    const client = new NetClient({ url: 'loopback:', map: 'MP2', name: 'Solo', socket: match.socket }, walk);
    const grid = groundGrid(pageMap.ground), roomGrid = groundGrid(roomMap.ground);
    const sounds: string[] = [], clips: number[] = [];
    const page = new DoorPage({
      grid: () => grid, feet: () => walk.feet, aim: () => ({ eye: [582.5, 157.4, 1135], far: [582.5, 157.4, 135] }),
      sound: (name) => sounds.push(name), move: () => undefined,
      net: () => (client.state === 'open' ? client : null),
      pushClip: (type) => clips.push(type),
    });
    page.setMap(pageMap.doors, pageMap.ground);
    /** The doorway of bdoor_4 at chest height, on either side's hull: its leaf's polygons met (`doorWireFollow.test.ts`'s probe). */
    const doorway = (g: typeof grid): boolean => segmentHit(g, [582.5, 152, 1135], [582.5, 152, 1100], (p) => p.path.includes('bdoor_4')) !== null;
    const pageBlocked: boolean[] = [], roomBlocked: boolean[] = [];
    let frames = 0;
    /** One page frame: the walk's command, the delay's clock, the room's tick, the page's doors (as `main.ts` orders them). */
    const frame = async (press?: () => void): Promise<void> => {
      walk.tick();
      press?.();
      vi.advanceTimersByTime(TICK_MS);
      match.step();
      if (reach) { const s = match.room.player(1)?.sim.walker.state; if (s) { s.x = FEET[0]; s.y = FEET[1]; s.z = FEET[2]; } }
      await flush();
      page.frame(TICK);
      pageBlocked[frames] = doorway(grid); roomBlocked[frames] = doorway(roomGrid);
      frames++;
    };
    for (let k = 0; k < 240 && !(client.state === 'open' && client.role === 'player'); k++) await frame();
    for (let k = 0; k < 60; k++) await frame();                         // a round trip of snapshots past the welcome
    expect(client.state).toBe('open');
    expect(client.role).toBe('player');
    return { match, client, page, sounds, clips, frame, pageBlocked, roomBlocked, frames: () => frames, wire: () => client.doors()?.[0] };
  }

  it("the press's frame starts the swing; the leaf leaves the doorway long before the room's snapshot of it comes back", async () => {
    const r = await rig();
    expect(r.page.target()).toBe(0);
    expect(r.pageBlocked.at(-1)).toBe(true);
    let taken = false;
    await r.frame(() => { taken = r.page.action(); });
    expect(taken).toBe(true);
    expect(r.page.stats().doors[0]!.busy).toBe(true);                    // the run started on the press's frame
    expect(r.clips).toEqual([]);                                           // the presser's clip: the room's `motion` (ONLINE's echo)
    // 0.92 s on: past the ANIMATE's head (9 game frames) well into the swing; the room's not heard back (a 1.2 s round trip).
    for (let k = 0; k < 55; k++) await r.frame();
    expect(r.wire()).toMatchObject({ valve: 0, phase: 255 });             // the snapshot still has the door shut, at rest
    expect(r.page.stats().doors[0]).toMatchObject({ open: true, busy: true });
    expect(r.sounds).toEqual(['.DOOR_WOOD_OPEN']);
    expect(r.pageBlocked.at(-1)).toBe(false);                              // the leaf's polygons turned in the page's hull
  });

  // 150 ms: the room's swing heard while this run still runs; 600 ms: after it has ended (the prediction waits at rest).
  it.each([150, 600])('a one-way delay of %i ms: the confirming snapshot swings nothing again -- one run, one sound, page and room open alike', async (delayMs) => {
    const r = await rig(true, delayMs);
    const pressed = r.frames();
    await r.frame(() => { r.page.action(); });
    const busyAt: number[] = [];
    for (let k = 0; k < 4 * 60; k++) { await r.frame(); if (r.page.stats().doors[0]!.busy) busyAt.push(r.frames() - 1); }
    expect(r.wire()).toMatchObject({ valve: 1, phase: 255 });
    expect(r.page.stats().doors[0]).toMatchObject({ open: true, busy: false, valve: 1 });
    expect(r.sounds).toEqual(['.DOOR_WOOD_OPEN']);
    const seconds = r.page.stats().doors[0]!.seconds!;
    // One run from the press: busy on consecutive frames only, ending within two frames of its program's length.
    expect(busyAt[0]).toBe(pressed + 1);
    expect(busyAt.at(-1)! - busyAt[0]!).toBe(busyAt.length - 1);
    expect(busyAt.length * TICK).toBeLessThanOrEqual(seconds + 2 * TICK);
    // DOOR-PIN / DOOR_MOVE_ORDER_READING: the page's leaf stands where the room's stood one up-link delay later -- the
    // room ran the use at the press's command, then its door step after its walker's tick, as the page does.
    // (The command sent in frame t reaches the room in frame t + lag - 1: the delay's clock advances before the room steps.)
    const lag = Math.round(delayMs / TICK_MS);
    expect(r.pageBlocked.slice(pressed).includes(false)).toBe(true);
    const mismatched: number[] = [];
    for (let t = pressed; t + lag + 1 < r.frames(); t++) {
      if (![-1, 0, 1].some((k) => r.roomBlocked[t + lag + k] === r.pageBlocked[t])) mismatched.push(t - pressed);
    }
    expect(mismatched).toEqual([]);
  });

  it('a press the room refuses (its body out of reach: the door at rest with the old valve) is run back, silently', async () => {
    const r = await rig(false);
    let taken = false;
    await r.frame(() => { taken = r.page.action(); });
    expect(taken).toBe(true);
    for (let k = 0; k < 55; k++) await r.frame();
    expect(r.page.stats().doors[0]).toMatchObject({ open: true, busy: true });   // predicted
    expect(r.pageBlocked.at(-1)).toBe(false);
    const heard = [...r.sounds];
    for (let k = 0; k < 3 * 60; k++) await r.frame();
    expect(r.wire()).toMatchObject({ valve: 0, phase: 255 });
    expect(r.page.stats().doors[0]).toMatchObject({ open: false, busy: false, valve: 0 });
    expect(r.pageBlocked.at(-1)).toBe(true);                               // the leaf back across the doorway
    expect(r.sounds).toEqual(heard);                                        // no close heard: run back silently
    expect(r.page.target()).toBe(0);                                        // and offered again
  });

  // P7's review F1: the room sends no own body for a dead seat (`own: null`, so no ack), and refuses a dead presser's
  // door (`Room.useDoor`: `!p.alive`). A press, then the death before the room decides it: the page's door must come back
  // to the room's, not stand open (and skip the room's door) until the next life.
  it("F1: a press, then the presser's death before the room decides it -- the room refuses, the page's door is run back to the room's", async () => {
    const r = await rig();
    let taken = false;
    await r.frame(() => { taken = r.page.action(); });
    expect(taken).toBe(true);
    expect(r.page.stats().doors[0]!.busy).toBe(true);                      // predicted
    expect(r.match.room.devKill(1)).toBe(true);                            // dead in the room; the press still in flight
    for (let k = 0; k < 3 * 60; k++) await r.frame();
    expect(r.client.acked()).toBeNull();                                     // no own body in the snapshot
    expect(r.wire()).toMatchObject({ valve: 0, phase: 255 });
    expect(r.page.stats().doors[0]).toMatchObject({ open: false, busy: false, valve: 0 });
    expect(r.pageBlocked.at(-1)).toBe(r.roomBlocked.at(-1));
  });
});
