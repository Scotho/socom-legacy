import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type EffectProgram, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { DoorSpec } from '../../viewer/src/doors';
import { MAX_BATCH, Room, type Conn } from '../src/room';

/**
 * DOORS (socomlegacy/docs/research/92-doors.md section 2): the room runs the map's door programs; a door's `ai::ANIMATE`
 * pushes `Open door` on the player who pressed (`FUN_005d2f30` -> `FUN_00588bc0(actor, 63, stance, 0, 0)`), and that
 * push is sent to every console (`FUN_00588bc0`'s own send, its 5th argument 0: D:L446413-446414). Here the room tells
 * every page -- the presser's own included, which plays it on its own body as its flinch is played -- with a `motion`
 * event naming the clip; the room holds no state for it (the push sets no reload-refusing flag). On a synthetic floor
 * with one synthetic door (the room tests' convention), so it runs without the disc.
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const TICK_MS = 1000 / TICK_HZ;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The door's program: Frostfire's `open` in miniature -- the ANIMATE (0.25 s), then the valve set on the context's. */
const DOOR_PROGRAM: EffectProgram = {
  name: 'singleDoor_test', root: 0, flags: 0xa2, nodes: ['NA'],
  sequences: [{
    name: 'seq_0', activation: 1,
    ops: [
      { op: 'aiAnimate', type: 63, prewait: 0, postwait: 0.25, blocking: false, select: 0 },
      { op: 'valve', valve: '', operation: 0x0b, operand: 1, context: true },
    ],
  }],
};

function doorMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  // No hull polygons: the reach is the node's origin (`doorInReach`), set wide enough for any slot.
  const door: DoorSpec = {
    index: 0, node: 'door1', path: 'worldmodel/door1', valve: 'door1', range: 2000, elevation: -1, programs: [DOOR_PROGRAM],
    local: IDENTITY, parent: IDENTITY, owners: [], sweep: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
  };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], doors: [door] };
}

/** The clips the room sizes the window from: `seal_open_door`, `motion.rdr` playback 0.8 and `NoInterrupt` 0.5, 14 keys. */
const CLIPS = {
  table: new Map([['seal_open_door', { playback: 0.8, noInterrupt: 0.5 }]]),
  clips: [{ name: 'seal_open_door', frameCount: 14 }],
} as unknown as ConstructorParameters<typeof Room>[1];

/** The room's live player 1 (not `player()`'s read-only view): its mover and its one-shot window. */
type Live = { sim: { jumps: number; seq: number }; flinchFrom: number; flinchUntil: number; flinchAt: number; flinchAir: number };
const live = (s: ReturnType<typeof setup>): Live => (s.room as unknown as { players: Map<number, Live> }).players.get(1)!;
/** One command of player 1 run, with `extra` on it; its seq. */
const step = (s: ReturnType<typeof setup>, extra: Partial<Command> = {}): number => {
  const c = { ...s.cmd(1), ...extra };
  s.send(1, [c]);
  s.tick();
  return c.seq;
};
/** Player 1 uses the door on its next command. */
const useDoor = (s: ReturnType<typeof setup>): void => {
  const c = s.cmd(1);
  s.send(1, [c]);
  s.room.text(1, { type: 'door', seq: c.seq, door: 0 } as never);
  s.tick();
};
/** Runs until the room has sent player 1's `motion` (the push, a game frame after the use); the event. */
const pushed = (s: ReturnType<typeof setup>): Extract<ServerEvent, { type: 'motion' }> => {
  const c = s.clients.get(1)!;
  for (let k = 0; k < 10 && c.of('motion').length === 0; k++) step(s);
  const m = c.of('motion').at(-1);
  if (!m || m.until === undefined || m.cutFrom === undefined || m.from === undefined) throw new Error('no sized motion event');
  return m;
};
/** Whether a jump pressed on player 1's next command is taken (`jumps` rises); a released command after it. */
const jumpTaken = (s: ReturnType<typeof setup>, p: Live, extra: Partial<Command> = {}): boolean => {
  const before = p.sim.jumps;
  step(s, { ...extra, buttons: Button.Jump });
  step(s, extra);
  return p.sim.jumps > before;
};
/** How many reloads named at `seq` the room drops 'flinch' (the reload's own refusal, `Room.reload`). */
const reloadDrops = (s: ReturnType<typeof setup>, p: Live, seq: number): number => {
  s.room.takeDrops();
  (s.room as unknown as { reload(p: unknown, seq: number): void }).reload(p, seq);
  return s.room.takeDrops()?.['reload: flinch'] ?? 0;
};

function setup(clips: ConstructorParameters<typeof Room>[1] = null) {
  let now = 0;
  let seed = 1;
  const room = new Room(doorMap(), clips, {
    now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0,
  });
  const clients = new Map<number, Client>();
  const join = (id: number): Client => {
    const c = new Client();
    clients.set(id, c);
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `p${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  const seqs = new Map<number, number>();
  const cmd = (id: number): Command => {
    const seq = (seqs.get(id) ?? 0) + 1;
    seqs.set(id, seq);
    const yaw = clients.get(id)?.of('spawn').filter((e) => e.id === id).at(-1)?.yaw ?? 0;
    return { seq, forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
  };
  const send = (id: number, commands: Command[]): void => {
    for (let i = 0; i < commands.length; i += MAX_BATCH) room.binary(id, encodeCommands({ viewTick: room.tick, commands: commands.slice(i, i + MAX_BATCH) }));
  };
  const tick = (): void => { now += TICK_MS; room.step(); };
  return { room, join, cmd, send, tick, clients };
}

describe("a door's Open door push reaches every page as a `motion` event", () => {
  it('the presser (its own body) and the other player both hear { motion, id, clip seal_open_door }, once, after the use', () => {
    const s = setup();
    const c1 = s.join(1), c2 = s.join(2);
    for (let t = 0; t < 10; t++) { s.send(1, [s.cmd(1)]); s.send(2, [s.cmd(2)]); s.tick(); }
    const c = s.cmd(1);
    s.send(1, [c]);
    s.room.text(1, { type: 'door', seq: c.seq, door: 0 } as never);
    expect(c1.of('motion')).toEqual([]);
    for (let t = 0; t < 3; t++) { s.send(1, [s.cmd(1)]); s.send(2, [s.cmd(2)]); s.tick(); }
    expect(c1.of('motion')).toEqual([{ type: 'motion', id: 1, clip: 'seal_open_door' }]);
    expect(c2.of('motion')).toEqual([{ type: 'motion', id: 1, clip: 'seal_open_door' }]);
    for (let t = 0; t < 30; t++) s.tick();
    expect(c1.of('motion')).toHaveLength(1);                     // one push a use
    expect(s.room['doors'].valve(0)).toBe(1);                     // and the valve flipped after the ANIMATE's wait
  });

  it("with the clips: the event carries the clip's window on the presser's commands -- 42 commands (the one-shot end) and the cut from the 23rd (NoInterrupt 0.5)", () => {
    const s = setup(CLIPS);
    const c1 = s.join(1);
    for (let t = 0; t < 10; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const c = s.cmd(1);
    s.send(1, [c]);
    s.room.text(1, { type: 'door', seq: c.seq, door: 0 } as never);
    for (let t = 0; t < 6; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const ev = c1.of('motion');
    expect(ev).toHaveLength(1);
    const m = ev[0]!;
    expect(m).toMatchObject({ type: 'motion', id: 1, clip: 'seal_open_door' });
    expect(m.from).toBeGreaterThanOrEqual(c.seq + 1);              // the push, one game frame after the use
    expect(m.from).toBeLessThanOrEqual(c.seq + 5);
    expect(m.until).toBe(m.from! + 42);                            // ceil(0.8 x (13/14)^2 x 60)
    expect(m.cutFrom).toBe(m.from! + 23);                          // floor(0.5 x 0.8 x 13/14 x 60) + 1
  });

  // The reload's refusal reads the top motion's flag 0x4 (FUN_005b4340 D:L469494-469504): the pushed Open door, which sets
  // none, is the top from the push, so a flinch's refusal still open ends there. The push takes the flinch's slot (the
  // page's one-shot slot, `../../viewer/src/walk` `setFlinchPose`): the jump stays refused under the door clip instead.
  // LATER 363: the flinch is the top again at the door clip's pop (the cases below).
  it("a flinch window still open at the push is replaced by the door clip's: a reload inside it goes through, a jump is still refused", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const c = s.cmd(1);
    p.flinchFrom = c.seq - 5; p.flinchUntil = c.seq + 100; p.flinchAt = c.seq - 5;    // a flinch's window, on the floor
    s.send(1, [c]);
    s.room.text(1, { type: 'door', seq: c.seq, door: 0 } as never);
    s.tick();
    const m = pushed(s);
    expect(p.flinchUntil).toBe(m.until);                           // the door clip's end, not c.seq + 100
    expect(jumpTaken(s, p)).toBe(false);                           // a one-shot on top (asked first: a reload taken below holds the weapon)
    expect(reloadDrops(s, p, m.from! + 1)).toBe(0);                // but the door clip refuses no reload past its push
  });

  // The re-read of #485, N1: the flinch is the top up to the push, so a reload named on a command before it is still the
  // flinch's to refuse (`FUN_005b4340` D:L469494-469504 on the top's flag 0x4); the page undoes it on the flinch's event.
  it("N1: a reload named on the command before the push, inside the flinch's window, is still dropped 'flinch'", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const c = s.cmd(1);
    p.flinchFrom = c.seq - 5; p.flinchUntil = c.seq + 100; p.flinchAt = c.seq - 5;
    s.send(1, [c]);
    s.room.text(1, { type: 'door', seq: c.seq, door: 0 } as never);
    s.tick();
    const m = pushed(s);
    expect(reloadDrops(s, p, m.from! - 1)).toBe(1);                // the flinch was on top there
    expect(reloadDrops(s, p, c.seq - 6)).toBe(0);                  // before the flinch: none (taken: it starts a reload, asked last)
  });

  // LATER 363 (research 92 section 4, "A flinch under the push"): the door push covers the flinch without popping it, and
  // only the top advances; the push's pop -- its clip's end, or the stick's cut -- makes the flinch the top again with
  // its flag 0x4 (`FUN_005b4340` D:L469494-469504 on `FUN_00555170`, D:L419945), for the commands it had left at the
  // push (`flinchLanded`'s count, PAR-71's hand-back).
  const flinchUnderDoor = (s: ReturnType<typeof setup>, length: number): { p: Live; m: Extract<ServerEvent, { type: 'motion' }>; left: number } => {
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const c = s.cmd(1);
    p.flinchFrom = c.seq - 5; p.flinchUntil = c.seq + length; p.flinchAt = c.seq - 5;   // a flinch's window, on the floor
    s.send(1, [c]);
    s.room.text(1, { type: 'door', seq: c.seq, door: 0 } as never);
    s.tick();
    const m = pushed(s);
    return { p, m, left: c.seq + length - m.from! };
  };
  it("RED: LATER 363 -- played through, the door clip's pop hands the flinch back: a reload in the commands it had left is dropped 'flinch', past them taken", () => {
    const s = setup(CLIPS);
    const { p, m, left } = flinchUnderDoor(s, 40);
    expect(left).toBeGreaterThan(5);
    while (p.sim.seq + 1 < m.until! + 2) step(s);
    expect(reloadDrops(s, p, m.until!)).toBe(1);                   // the pop's command: the flinch on top again (today: 0)
    expect(reloadDrops(s, p, m.until! + left - 1)).toBe(1);        // its last command left
    expect(reloadDrops(s, p, m.until! + left)).toBe(0);            // past it: taken (asked last: it starts a reload)
  });
  it("RED: LATER 363 -- the stick's cut of the door clip hands the flinch back from the cut's command", () => {
    const s = setup(CLIPS);
    const { p, m } = flinchUnderDoor(s, 40);
    const fwd = { forward: 1 };
    while (p.sim.seq + 1 <= m.cutFrom!) step(s, fwd);              // the door clip cut at its NoInterrupt (F1's cut)
    step(s); step(s);                                              // the stick let go: the flinch is not cut in turn
    expect(reloadDrops(s, p, m.cutFrom! + 1)).toBe(1);             // the flinch on top again, long before the clip's end (today: 0)
    expect(m.cutFrom! + 1).toBeLessThan(m.until! - 10);
  });

  // LATER 363's review F1: what pops the stack to its base takes the covered flinch with the door clip -- a landing with
  // a clip (`FUN_0058a5e0` D:L466897, `FUN_005af590` D:L466691-466693), a knock (`FUN_0057e770` -> `FUN_0058a4d0`
  // D:L440997), a ladder's mount (`FUN_0057f880` D:L441547-441558): nothing is handed back after it.
  it("RED: LATER 363's review F1 -- a landing with a clip under the covered door clip pops the flinch too: no reload refused after it", () => {
    const s = setup(CLIPS);
    const { p } = flinchUnderDoor(s, 40);
    step(s); step(s);
    const P = p as unknown as { flinchAir: number; sim: { seq: number; walker: object } };
    P.flinchAir = P.sim.seq;                                       // the door clip covered by a fall (walked off a ledge)
    Object.defineProperty(P.sim.walker, 'airborne', { value: false, configurable: true });
    Object.defineProperty(P.sim.walker, 'landing', { value: { clip: 'seal_land_hard' }, configurable: true });
    const R = s.room as unknown as { flinchLanding(p: unknown): void; flinchUncover(p: unknown): void };
    R.flinchLanding(p); R.flinchUncover(p);                        // the landing's command, as `watchCut` asks it
    expect(reloadDrops(s, p, P.sim.seq + 1)).toBe(0);               // today: 1, the flinch handed back
  });
  it("RED: LATER 363's review F1 -- a knock under the door clip pops the flinch with it: none handed back at the door's end", () => {
    const s = setup(CLIPS);
    const { p, m } = flinchUnderDoor(s, 40);
    (s.room as unknown as { layKnock(q: unknown, k: unknown): unknown }).layKnock(p, { velocity: [0, 30, 0], fall: 'fallForward' });
    while (p.sim.seq + 1 < m.until! + 2) step(s);
    expect(reloadDrops(s, p, m.until! + 1)).toBe(0);               // today: 1
  });
  it("RED: LATER 363's review F1 -- a ladder's mount under the door clip pops the flinch with it", () => {
    const s = setup(CLIPS);
    const { p, m } = flinchUnderDoor(s, 40);
    (p as unknown as { sim: { moves: { emit(e: unknown): void } } }).sim.moves.emit({ type: 'ladderMount' });
    while (p.sim.seq + 1 < m.until! + 2) step(s);
    expect(reloadDrops(s, p, m.until! + 1)).toBe(0);               // today: 1
  });

  // LATER 512c (research 92 section 4, "LATER 512c's reading"; PTW.R3 with `../../viewer/src/walk`): `FUN_00552ec0` takes a
  // stance request only under a looped top or a stance transition (D:L418927-418930); the door clip and the flinch are
  // one-shots, so a press under them waits (`actor+0x374`, asked again each frame by `FUN_00552d60`) until both have run.
  type Stanced = { sim: { seq: number; walker: { stance: string; pendingStance: string | null } } };
  it("RED: LATER 512c -- a crouch pressed under the door clip waits through it and the flinch handed back, then is taken", () => {
    const s = setup(CLIPS);
    const { p, m, left } = flinchUnderDoor(s, 40);
    const P = p as unknown as Stanced;
    step(s, { buttons: Button.Stance, stance: 1 });
    expect(P.sim.walker.stance, 'under the door clip').toBe('stand');                    // today: crouch
    expect(P.sim.walker.pendingStance, 'the request kept').toBe('crouch');
    while (P.sim.seq + 1 < m.until! + left) step(s);
    expect(P.sim.walker.stance, "the handed-back flinch's last command").toBe('stand');
    step(s);
    expect(P.sim.walker.stance, 'the base on top: taken').toBe('crouch');
    expect(P.sim.walker.pendingStance).toBe(null);
  });
  it("RED: LATER 512c -- a flinch alone keeps the press to its last command; with no window the press is taken at once", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const P = p as unknown as Stanced;
    step(s, { buttons: Button.Stance, stance: 1 });
    expect(P.sim.walker.stance, 'no window').toBe('crouch');
    step(s, { buttons: Button.Stance, stance: 0 });
    for (let t = 0; t < 40; t++) step(s);                          // the stand's transition run out
    expect(P.sim.walker.stance).toBe('stand');
    const next = P.sim.seq + 1;
    p.flinchFrom = next; p.flinchUntil = next + 30; p.flinchAt = next;   // a flinch's window, on the floor
    step(s, { buttons: Button.Stance, stance: 2 });
    expect(P.sim.walker.stance, 'under the flinch').toBe('stand');                       // today: prone
    while (P.sim.seq + 1 < next + 30) step(s);
    expect(P.sim.walker.stance).toBe('stand');
    step(s);
    expect(P.sim.walker.stance).toBe('prone');
  });
  // The review's F5 (pins; reading): the fall-covered branch, a door clip alone, the cut's command.
  it("LATER 512c review F5 (pin) -- a flinch the fall covers (`flinchAir`) holds no press: a crouch is taken at once", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const P = p as unknown as Stanced;
    const next = P.sim.seq + 1;
    p.flinchFrom = next; p.flinchUntil = next + 30; p.flinchAt = next; p.flinchAir = next;   // covered from its first command
    step(s, { buttons: Button.Stance, stance: 1 });
    expect(P.sim.walker.stance, 'the fall is the top, not the flinch').toBe('crouch');
  });
  it("LATER 512c review F5 (pin) -- a door clip alone, no flinch under it: the press waits through it and is taken at its end", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const P = p as unknown as Stanced;
    useDoor(s);
    const m = pushed(s);
    step(s, { buttons: Button.Stance, stance: 1 });
    expect(P.sim.walker.stance, 'under the door clip').toBe('stand');
    while (P.sim.seq + 1 < m.until!) step(s);
    expect(P.sim.walker.stance, "the door clip's last command").toBe('stand');
    step(s);
    expect(P.sim.walker.stance, 'its end, nothing under it: taken').toBe('crouch');
  });
  // LATER 543 (research 92 section 4, "LATER 543's reading"; reading, pending review): the original's order -- the gate
  // (`FUN_00551ec0`, entity_pre_tick, D:L418609 -> D:L418875) runs before the stick's cut (`FUN_00550ef0`, entity_tick,
  // D:L418180-418203) each frame, so the press is refused on the cut's frame and taken on the next: the order is the
  // original's; the count is the port's mapping, unread (LATER 546).
  it("LATER 512c review F5 (pin) -- the cut's command: the stick cuts the door clip on command cutFrom, which still holds the press; the next takes it", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const P = live(s) as unknown as Stanced;
    useDoor(s);
    const m = pushed(s);
    step(s, { buttons: Button.Stance, stance: 1, forward: 1 });
    while (P.sim.seq + 1 < m.cutFrom!) step(s, { forward: 1 });
    expect(P.sim.walker.stance, 'before the cut').toBe('stand');
    step(s, { forward: 1 });                                       // command cutFrom
    expect(P.sim.seq).toBe(m.cutFrom);
    expect(P.sim.walker.stance, 'the command the window is cut on (the cut is learned after it ran)').toBe('stand');
    step(s, { forward: 1 });
    expect(P.sim.walker.stance, 'the command after the cut').toBe('crouch');
  });

  // The review's F1: OT.R67's prone-pop (the command's stance code 3) is not taken under the flinch's slot either.
  it("RED: LATER 512c review F1 -- the prone-pop command under a flinch leaves the body prone (the room's mover, as the page's)", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const P = p as unknown as Stanced;
    step(s, { buttons: Button.Stance, stance: 2 });
    step(s, { stance: 2 });
    for (let t = 0; t < 150; t++) step(s, { stance: 2 });          // the drop run out, settled prone
    expect(P.sim.walker.stance).toBe('prone');
    const next = P.sim.seq + 1;
    p.flinchFrom = next; p.flinchUntil = next + 30; p.flinchAt = next;
    step(s, { buttons: Button.Stance, stance: 3 });
    expect(P.sim.walker.stance, 'the pop under the flinch').toBe('prone');                            // today: stand
  });

  // LATER 544 (research 92 section 4, "LATER 544's reading"; reading, pending review; PTW.R3 with the page's pin in
  // `../../viewer/test/doorClip.test.ts`): the dive is the press's (`FUN_00594cf0` D:L453387-453389 -> `FUN_0057e540`), and
  // `FUN_00584b00` asks no flinch (D:L443985-444001), so the room's mover dives under the flinch's window too
  // (`MoverSim.stance`: the dive before `Walker.changeStance`). What the dive does to the window is LATER 547.
  it("LATER 544 (pin) -- a prone press while running under a flinch dives at once on the room's mover", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const P = p as unknown as Stanced & { sim: { walker: { state: { vx: number; vz: number } }; moves: { state(): { kind: string } } } };
    for (let t = 0; t < 40; t++) step(s, { forward: 1 });          // up to speed
    const v = P.sim.walker.state;
    expect(v.vx * v.vx + v.vz * v.vz, 'moving at 30 a second or more (D:L443998)').toBeGreaterThanOrEqual(900);
    const next = P.sim.seq + 1;
    p.flinchFrom = next - 2; p.flinchUntil = next + 30; p.flinchAt = next - 2;   // a flinch's window, on the floor
    step(s, { buttons: Button.Stance, stance: 1, forward: 1 });
    expect(P.sim.walker.stance, 'the ordinary crouch waits under the flinch (LATER 512c)').toBe('stand');
    step(s, { buttons: Button.Stance, stance: 2, forward: 1 });
    expect(P.sim.moves.state().kind, 'the dive taken under the flinch').toBe('dive');
    expect(P.sim.walker.stance).toBe('prone');
  });

  // LATER 555 (research 92 section 4, "LATER 551"; reading, pending review; PTW.R3 with the page's REDs in
  // `../../viewer/test/doorClip.test.ts`): the knock pops the flinch on top -- `FUN_0057e770` calls `FUN_0058a4d0(actor, 0)`
  // (D:L440997), which pops while the stack holds more than its base and the top is not Stand, Crouch or Prone (types 1,
  // 0x12, 0x1a: D:L446762-446768); a prone body's pops again (D:L441003-441004) before `Prone cover` (D:L441017-441018).
  // With no fall to cover it, the window ends at the knock: no reload refused 'flinch' after it, and a crouch pending under
  // it waits only for Prone cover's end. Was: the window kept to its end (`layKnock` cleared `flinchUnder` alone).
  it("RED: LATER 555 -- a Prone cover knock inside a flinch window ends it: no 'flinch' refusal after the knock, a pending crouch taken at Prone cover's end", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const P = p as unknown as Stanced & { sim: { walker: { action: { name: string } | null } } };
    step(s, { buttons: Button.Stance, stance: 2 });
    step(s, { stance: 2 });
    for (let t = 0; t < 150; t++) step(s, { stance: 2 });          // the drop run out, settled prone
    expect(P.sim.walker.stance).toBe('prone');
    const next = P.sim.seq + 1;
    p.flinchFrom = next; p.flinchUntil = next + 300; p.flinchAt = next;   // a flinch's window, on the floor
    for (let t = 0; t < 9; t++) step(s, { stance: 2 });
    step(s, { buttons: Button.Stance, stance: 1 });
    expect(P.sim.walker.stance, 'under the flinch').toBe('prone');
    expect(P.sim.walker.pendingStance, 'the request kept').toBe('crouch');
    for (let t = 0; t < 10; t++) step(s, { stance: 1 });
    const after = P.sim.seq;
    (s.room as unknown as { layKnock(q: unknown, k: unknown): unknown }).layKnock(p, { velocity: [0, 0, 0], fall: 'proneCover' });
    expect(P.sim.walker.action?.name, 'Prone cover').toBe('proneCover');
    expect(reloadDrops(s, p, after), "the knock's own command: still the flinch's").toBe(1);
    expect(p.flinchUntil, 'the window ends at the knock').toBe(after + 1);                       // was: next + 300
    expect(reloadDrops(s, p, after + 1), "the next: Prone cover's refusal, not the flinch's").toBe(0);   // was: 1
    let taken = -1, coverEnd = -1;
    for (let t = 0; t < 320 && taken < 0; t++) {
      const seq = step(s, { stance: 1 });
      if (coverEnd < 0 && P.sim.walker.action?.name !== 'proneCover') coverEnd = seq;
      if (P.sim.walker.stance === 'crouch') taken = seq;
    }
    expect(taken, "taken before the window's end").toBeLessThan(next + 300 - 20);               // was: next + 300
    expect(taken, "at Prone cover's end").toBeGreaterThanOrEqual(coverEnd);
    expect(coverEnd).toBeGreaterThan(after);
  });

  // LATER 560 (research 92 section 4, "LATER 560"; reading, pending review; PTW.R3 with the page's REDs in
  // `../../viewer/test/doorClip.test.ts`): a climb's start (and a `Climb over` start) and a ladder's mount pop the stack to
  // its base -- `FUN_00580b70` D:L442186-442214, `FUN_00580a80` D:L442151-442163, `FUN_0057f880` D:L441547-441558 -- the
  // flinch on top with it, and no gate on their path refuses them under a flinch (the reading). Heard inside command C's
  // run, the window ends at C (LATER 560's review F1: the reload's flag 0x4 is asked from the kit's frame `FUN_005c0fd0`
  // in the actor's post-tick, D:L417907, after the driver's pass that pops it, D:L418132 -- research 230, PAR-67 -- as the
  // stick's cut, D:L418174-418190, ends it at its own command): a reload named at C is no longer the flinch's, one named
  // before C still is; a crouch pending under it is refused at C (the stance asked before the driver's pass, the cut laid
  // after the command, `watchCut`) and taken at C + 1. Was: `watchMoves` cleared only the covered flinch (`flinchUnder`),
  // the window kept to its end; then (the first build) ended at C + 1.
  // LATER 560's review F3: MECHANISM PINS, as LATER 551 (b) -- the event is laid on the moves' tick by hand with a crouch
  // pending; a real `startClimb` clears a standing body's pending request (`Traversal.startClimb`, `requestStance(null)`)
  // and the climb's one-shot holds the stance (R313.6 / B3), so "the crouch taken at C + 1" never happens with a real
  // climb. What they hold is the window's end on the command the start or the mount is heard in.
  for (const e of [{ type: 'climbStart', kind: 'med' }, { type: 'climbStart', kind: 'over' }, { type: 'ladderMount', from: 'bottom' }] as const) {
    it(`RED: LATER 560 (a mechanism pin) -- ${e.type === 'ladderMount' ? "a ladder's mount" : `a climb's start (${e.kind})`} inside a flinch window ends it at its command: no 'flinch' refusal from it, a pending crouch taken on the next command`, () => {
      const s = setup(CLIPS);
      s.join(1);
      for (let t = 0; t < 10; t++) step(s);
      const p = live(s);
      const P = p as unknown as Stanced & { sim: { moves: { tick(...a: unknown[]): unknown; emit(x: unknown): void } } };
      const next = P.sim.seq + 1;
      p.flinchFrom = next; p.flinchUntil = next + 300; p.flinchAt = next;   // a flinch's window, on the floor
      for (let t = 0; t < 4; t++) step(s);
      step(s, { buttons: Button.Stance, stance: 1 });
      expect(P.sim.walker.stance, 'under the flinch').toBe('stand');
      expect(P.sim.walker.pendingStance, 'the request kept').toBe('crouch');
      const at = P.sim.seq + 3;
      const m = P.sim.moves, tick = m.tick.bind(m);
      m.tick = (...a: unknown[]) => { const out = tick(...a); if (P.sim.seq === at) m.emit(e); return out; };   // inside command `at`'s run
      let taken = -1;
      for (let t = 0; t < 10 && taken < 0; t++) {
        const seq = step(s, { stance: 1 });
        if (P.sim.walker.stance === 'crouch') taken = seq;
      }
      expect(p.flinchUntil, "the window ends at the start's command").toBe(at);                  // was: next + 300, then at + 1
      expect(reloadDrops(s, p, at - 1), 'the command before: still the flinch').toBe(1);
      expect(reloadDrops(s, p, at), "the start's own command: none (the reload asked after the pop)").toBe(0);   // was: 1
      expect(reloadDrops(s, p, at + 1), 'the next: none').toBe(0);                                // was: 1
      expect(taken, 'the crouch refused at the start, taken on the next command').toBe(at + 1);   // was: none before next + 300
    });
  }

  // LATER 560's review F1 (the shape it names): a ladder mounted inside a flinch's first three commands -- before the
  // stick's cut can pop it (`flinchCutAt`, FLINCH_CUT_DELAY_READING) -- and a reload pressed the frame after the mount's
  // command C, which the page names C (its last command sent) and takes (its own window ended at C, `basePopStep`). The
  // room ends the window at C too, so it drops no reload named C: the mount's pop (`FUN_0057f880` D:L441547-441558) comes
  // in the driver's pass (D:L418132), the reload's flag test after it in the post-tick (`FUN_005c0fd0`, D:L417907).
  it("RED: LATER 560 review F1 -- a ladder mounted on a flinch's second command, a reload named at the mount's command: the room drops none there, as the page takes it", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const P = p as unknown as Stanced & { sim: { moves: { tick(...a: unknown[]): unknown; emit(x: unknown): void } } };
    const next = P.sim.seq + 1;
    p.flinchFrom = next; p.flinchUntil = next + 40; p.flinchAt = next;    // a flinch's window, on the floor
    const at = next + 1;                                                 // inside its first three commands
    const m = P.sim.moves, tick = m.tick.bind(m);
    m.tick = (...a: unknown[]) => { const out = tick(...a); if (P.sim.seq === at) m.emit({ type: 'ladderMount', from: 'bottom' }); return out; };
    step(s);
    step(s);
    expect(P.sim.seq).toBe(at);
    expect(p.flinchUntil, "the window ends at the mount's command").toBe(at);                    // was: at + 1
    expect(reloadDrops(s, p, next), 'the command before the mount: the flinch').toBe(1);
    expect(reloadDrops(s, p, at), "the mount's command: no 'flinch' drop, as the page").toBe(0);   // was: 1
  });

  it("N1: a respawn clears the flinch's kept span with the slot (a reload there is no flinch's)", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    const c = s.cmd(1);
    p.flinchFrom = c.seq - 5; p.flinchUntil = c.seq + 100; p.flinchAt = c.seq - 5;
    s.send(1, [c]);
    s.room.text(1, { type: 'door', seq: c.seq, door: 0 } as never);
    s.tick();
    const m = pushed(s);
    s.room['spawn'](p as never, 'respawn');
    expect(reloadDrops(s, p, m.from! - 1)).toBe(0);
  });

  // Research 230 section 5.2.5 (PAR-78): a one-shot on top refuses the jump (`FUN_00550ef0` D:L418119-418132), the flinch's
  // and the door's alike; the page refuses it on the door clip's window (`../../viewer/src/walk` `jump`, `flinchOnTop`), so
  // the room must too (review of #485, F1).
  it("F1: a jump inside the door clip's window is refused, and taken once the clip has run (the page's flinchOnTop, on the room)", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    useDoor(s);
    const m = pushed(s);
    while (p.sim.seq + 1 < m.from! + 5) step(s);
    expect(jumpTaken(s, p)).toBe(false);                           // under the clip
    while (p.sim.seq + 1 < m.until!) step(s);
    expect(jumpTaken(s, p)).toBe(false);                           // on `until` itself: the pop's own command, refused ([start, until], `flinchOnTop`)
    expect(jumpTaken(s, p)).toBe(true);                            // past it: taken
  });

  it("F1: the stick past 0.1 cuts the door clip from its NoInterrupt on (cutFrom), not before -- the jump after the cut is taken", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    useDoor(s);
    const m = pushed(s);
    const fwd = { forward: 1 };
    while (p.sim.seq + 1 < m.cutFrom! - 2) step(s, fwd);           // the stick held before NoInterrupt: no cut
    expect(jumpTaken(s, p, fwd)).toBe(false);
    while (p.sim.seq + 1 <= m.cutFrom!) step(s, fwd);              // the cut, at cutFrom
    step(s, fwd);
    expect(jumpTaken(s, p, fwd)).toBe(true);                       // long before the clip's own end (m.until)
    expect(p.sim.seq).toBeLessThan(m.until! - 10);
  });

  it('F1: a respawn clears the door clip with the flinch (the jump taken at once)', () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    useDoor(s);
    pushed(s);
    s.room['spawn'](p as never, 'respawn');
    for (let t = 0; t < 3; t++) step(s);
    expect(jumpTaken(s, p)).toBe(true);
  });

  it("a real flinch after the door push takes the slot back: its reload refusal from its own command, not the door's", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    useDoor(s);
    const m = pushed(s);
    step(s); step(s);
    const before = p.sim.seq;                                      // a command inside the door window, before the flinch
    (s.room as unknown as { flinchState(v: unknown, clip: string): boolean }).flinchState(p, 'seal_open_door');
    expect(p.flinchFrom).toBe(p.sim.seq + 1);                      // the flinch's own start: the door's window is not its refusal
    expect(reloadDrops(s, p, p.sim.seq + 1)).toBe(1);              // inside the flinch's window: dropped 'flinch'
    expect(reloadDrops(s, p, before)).toBe(0);                     // before it, inside the door's: not a flinch's (taken last: it starts a reload)
    expect(m.from).toBeLessThan(p.flinchFrom);
  });

  it('a use the room refuses (a dead or unknown player) pushes none', () => {
    const s = setup();
    const c1 = s.join(1);
    for (let t = 0; t < 5; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    const c = s.cmd(1);
    s.send(1, [c]);
    s.room.text(9, { type: 'door', seq: c.seq, door: 0 } as never);
    for (let t = 0; t < 5; t++) { s.send(1, [s.cmd(1)]); s.tick(); }
    expect(c1.of('motion')).toEqual([]);
  });
});
