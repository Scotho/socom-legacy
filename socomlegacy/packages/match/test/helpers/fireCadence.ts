import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arsenalOf, HELD_SIDEARM, M67, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot, type ThrowableRecord, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import type { SimKits } from '../../../viewer/src/loadout';
import { Accuracy, fireInterval, perturb, roundsPerPull } from '../../../viewer/src/accuracy';
import { Fire } from '../../../viewer/src/fire';
import {
  Button, cameraLook, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, TICK_HZ,
  type AimFrame, type ClientEvent, type Command, type ServerEvent, type SimMap,
} from '../../../viewer/src/sim';
import { Room, type Conn } from '../../src/room';

/**
 * LATER 326 (#455, game 195): a page's held automatic burst at its own frame rate, through the viewer's own kit (`Fire`:
 * its timer and its rounds' `ago`) and its own command naming (`roundSeq`), judged by the room. The kit's timer is the
 * console's -- set at a round, run down a game frame at a time, clamped at 0 (`FUN_005be9a0` D:L475488,
 * `FUN_005c0fd0` D:L476644-476646) -- so a round is the rate rounded up to whole game frames after the last, named at its
 * browser frame's last command as before, and the room (its cycle the rate less a tick) refuses none at a steady rate. Was: the leftover carried at 30 fps, rounds up to
 * a frame early, refused 'rate', the room's cone left behind and the rest refused 'cone'.
 *
 * The flat floor and the seat as `roomRifleJitterBloom.test.ts` stages them (copied, not imported); one ordered socket
 * with no delay -- the commands of a page frame in one batch, its rounds after it -- the room stepping a tick at a time.
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((w) => w.name === name)!;
export const RECORDS = PIN.records;
export const M4A1 = byName('M4A1'), DE = PIN.records['7']!;
type V3 = [number, number, number];
type FireEv = Extract<ClientEvent, { type: 'fire' }>;
const TICK_MS = 1000 / TICK_HZ;
const unitV = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
/** The rate the room's cycle is built from (`room.ts` `fire`: the fastest enabled mode). */
export const fastest = (rec: WeaponRecord): number => Math.min(...rec.fireModes.filter((m) => m > 0).map((m) => fireInterval(rec.fireWait, m)), rec.fireWait);

function flatMap(): SimMap {
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
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  const respawns = [0, 1, 2].flatMap((i) => [slot(0, i, -600, -500 + i * 500), slot(1, i, 600, -500 + i * 500)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns, notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}

interface Seat { records: [WeaponRecord, WeaponRecord]; cone: ShotCone; mags: { rounds(): number }[] }

/**
 * A held burst at `fps` (each frame's length in `frames` when given: a hitch), the page's kit the viewer's `Fire` on
 * `rec` at its fastest mode: the tally of the room's decisions by outcome, and the commands the rounds named.
 */
/** The page standing still (the kit's update input). */
const STILL = { stance: 'stand' as const, rawStance: 'stand' as const, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };

export type Cam = { eye: V3; look: V3; from: V3 };
/**
 * The online parity sweep's AR-7 (P16): called before the room decides the `call`-th round it is sent (`rows`' index), with
 * the event and the seat -- a test may change either so the room alone refuses that round (the page fired it), and
 * returns what puts the seat back once the room has decided.
 */
export type Around = (call: number, ev: FireEv, seat: unknown) => (() => void) | void;
/** The camera the room's frame at a command gives (`cameraLook`), the round's muzzle at the eye's height over the feet. */
const camOf = (f: AimFrame): Cam => { const c = cameraLook(f); return { eye: c.eye, look: c.look, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] }; };

/**
 * `turn`: degrees of yaw a command while the trigger is held (a turning page; its claims from `looks`, the room's own
 * cameras at each command from a first run of the same commands -- the page's camera is the room's for an honest look).
 */
export function burst(rec: WeaponRecord, fps: number, seconds: number, frames?: number[], opts: { turn?: number; looks?: Map<number, Cam>; presses?: number; gap?: number; corner?: boolean; spread?: () => [number, number]; trace?: boolean; pressAtPrevious?: boolean; mash?: boolean; held?: boolean[]; mode?: number; around?: Around } = {}) {
  // LATER 347's trace: per round, the page's cone at the claim's roll, the room's cones over the named command's window, the verdict.
  type Cn = { x: number; y: number; r: number };
  const traced: { seq: number; out: string; burst: number; page: Cn; room: { seq: number; cone: Cn }[] }[] = [];
  const rolledCone = new Map<number, { cone: Cn; burst: number }>();
  let lastRoll: { cone: Cn; burst: number } | null = null;
  let now = 0, s = 1;
  const map = flatMap();
  const room = new Room(map, null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0 }, null, null);
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!, q = room.player(2)!;
  const P = p as unknown as Seat;
  P.records = [{ ...rec, magazine: 1000 } as WeaponRecord, DE]; P.cone = new ShotCone(rec); P.mags = [ringFor({ ...rec, magazine: 1000 } as WeaponRecord), ringFor(DE)];
  p.sim.walker.place(0, 20, 0); q.sim.walker.place(100, 20, 0);
  const R = room as unknown as { fire: (pp: unknown, ev: FireEv) => void };
  const orig = R.fire.bind(room);
  let blooms = 0;
  const round = P.cone.round.bind(P.cone);
  P.cone.round = (seq: number): void => { blooms++; round(seq); };
  const tally: Record<string, number> = {};
  const rows: string[] = [];
  R.fire = (pp: unknown, ev: FireEv): void => {
    room.takeDrops();
    const undo = opts.around?.(rows.length, ev, p);
    orig(pp, ev);
    undo?.();
    const d = room.takeDrops();
    const out = d ? Object.keys(d).join('+') : 'fired';
    tally[out] = (tally[out] ?? 0) + 1;
    rows.push(`${ev.seq}@${room.tick}:${out}`);
    if (opts.trace) {
      const rc = rolledCone.get(ev.seq);
      const room: { seq: number; cone: Cn }[] = [];
      for (let s = ev.seq - 6; s <= ev.seq; s++) { const f = P.cone.frame(s); if (f) room.push({ seq: s, cone: { x: f.cone.offsetX, y: f.cone.offsetY, r: f.cone.radius } }); }
      traced.push({ seq: ev.seq, out, burst: rc?.burst ?? -1, page: rc?.cone ?? { x: NaN, y: NaN, r: NaN }, room });
    }
  };
  // The page: still, facing player 2's side; its kit the viewer's own, the rate the fastest mode's -- or, `mash` (LATER 587),
  // the semi-automatic's (mode 1: `FireWait`, `FUN_005c09f0`), one round a pull, pressed and released every page frame.
  // `mode` (LATER 587's fold): that mode's wait and its pull's rounds (`roundsPerPull`: one, a burst's three, automatic).
  const interval = opts.mode !== undefined ? fireInterval(rec.fireWait, opts.mode) : opts.mash ? fireInterval(rec.fireWait, 1) : fastest(rec);
  const perPull = opts.mode !== undefined ? roundsPerPull(opts.mode) : opts.mash ? 1 : Infinity;
  // LATER 338: the frame's ticks as the walk records them (`WalkMode.tickAim`) -- each command's seq and its time from the
  // frame's start, the previous frame's last command first (its time 0 or before) -- so the kit names each round at the
  // command of its own game frame's boundary.
  let frameTicks: { seq: number; at: number }[] = [];
  let roundSeqOf: (own?: number) => number = (own) => own ?? 0;
  const kit = new Fire({
    grid: () => map.grid, aim: () => ({ eye: [0, 30, 0], far: [1000, 30, 0] }),
    tickAim: (at: number) => {
      let pick: { seq: number; at: number } | null = null;
      for (const k of frameTicks) if (k.at <= at + 1e-9) pick = k;
      return pick ? { seq: pick.seq, eye: [0, 30, 0], far: [1000, 30, 0] } : null;
    },
    roundSeq: (own?: number) => (base ? roundSeqOf(own) : null),          // LATER 587's fold: as `NetPage.roundSeq`
  } as ConstructorParameters<typeof Fire>[0], { ...rec, magazine: 1000 } as WeaponRecord, undefined, () => 0.5);
  // `corner`: the page's own bloom (`Accuracy`, as `matchFirearm`'s gun) and each claim at 0.95 of its cone's corner, the
  // corners turning (the worst honest claim, rolled before the round's bloom: `roomRifleJitterBloom.test.ts`'s) -- so a
  // round the room refuses unbloomed leaves its cone behind the page's and the rest are refused 'cone' (the review's F3).
  const bloom = new Accuracy(rec);
  const corners = [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const;
  let corner: [number, number] = [0, 0], rolled = 0;
  kit.setGun({
    trigger: () => bloom.trigger(), roundsPerPull: () => perPull, interval: () => interval,
    round: (d) => {
      const c = bloom.cone(0, 1), [kx, ky] = corners[rolled++ % 4]!;
      lastRoll = { cone: { x: c.offsetX, y: c.offsetY, r: c.radius }, burst: bloom.rounds() + 1 };
      corner = opts.corner ? [c.offsetX + 0.95 * c.radius * kx, c.offsetY + 0.95 * c.radius * ky] : [0, 0];
      // SEC-F1 (`spread`): the claim at the page's cone centre plus its radius times the factors given (each in [-1, 1]).
      if (opts.spread) { const [sx, sy] = opts.spread(); corner = [c.offsetX + c.radius * sx, c.offsetY + c.radius * sy]; }
      bloom.round(0, 'stand');
      return d;
    },
  });
  let seq = p.sim.seq, look = { yaw: 0, pitch: 0 }, acc = 0;
  let base: Cam | null = null;
  const seen = new Map<number, Cam>();
  let lastSeen = -1;
  const named: number[] = [];
  const history: Command[] = [];
  const pending: FireEv[] = [];
  // LATER 347, as `NetPage.fireEvent` and `flushPressRounds` name a round (LATER 587's review F2: the page's own way): while
  // the last command sent carries no Trigger (the walk's bit is the frame's, `NetPage.trigger`), or a round is already
  // held, the round is held until the page's next commands and named at the first of them -- or at its own game frame's
  // command if that is later (`max(after + 1, seq)`); else at once, at its own game frame's command (LATER 338) or the
  // last sent. `pressAtPrevious`: the page before LATER 347 -- named at once, at the previous frame's command.
  type RoundEv = Parameters<Parameters<typeof kit.subscribe>[0]>[0];
  const heldRounds: { e: RoundEv; after: number }[] = [];
  const holds = (): boolean => !opts.pressAtPrevious && (((history[history.length - 1]?.buttons ?? 0) & Button.Trigger) === 0 || heldRounds.length > 0);
  /** `NetPage.roundSeq` (LATER 587's fold): the command a round fired now is named at -- `own`, its game frame's, if any. */
  roundSeqOf = (own?: number): number => (holds() ? Math.max(seq + 1, own ?? 0) : own ?? seq);
  kit.subscribe((e) => {
    if (e.type !== 'round' || !base) return;
    if (holds()) { heldRounds.push({ e, after: seq }); return; }
    name(e, (e as { seq?: number }).seq ?? seq);
  });
  const name = (e: RoundEv, at: number): void => {
    if (e.type !== 'round' || !base) return;
    if (lastRoll) rolledCone.set(at, lastRoll);
    named.push(at);
    const { eye, look, from } = opts.looks?.get(at) ?? base;
    const l = opts.corner || opts.spread ? unitV(perturb(look, { offsetX: corner[0], offsetY: corner[1], radius: 0 })) : look;
    const point = [eye[0] + l[0] * 200, eye[1] + l[1] * 200, eye[2] + l[2] * 200];
    pending.push({ type: 'fire', seq: at, from, dir: unitV([point[0]! - from[0], point[1]! - from[1], point[2]! - from[2]]), eye, aim: l, weapon: 0, viewTick: room.tick });
  };
  const tick = (firing: boolean): void => {
    if (firing && opts.turn) look = { ...look, yaw: look.yaw + opts.turn };
    const cmd: Command = { seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: firing ? Button.Trigger : 0, stance: 0, weapon: 0 };
    history.push(cmd);
  };
  // 6 s still at the page's own frame rate (a page's commands leave a frame at a time): the floor settles, the look
  // faces player 2, the camera's look read. The room's dating of a round (`eventClock`: its command's count plus the
  // line's best offset, `lagFloor`) is then the steady page's; a page changing its pacing mid-burst is the hitch's case.
  const page = (dt: number, firing: boolean): number => {
    const before = acc;
    acc += dt;
    const n = Math.floor(acc * TICK_HZ + 1e-9);
    acc -= n / TICK_HZ;
    const first = history.length;
    frameTicks = [{ seq, at: -before }];                              // the last command sent, `before` seconds ago
    for (let k = 0; k < n; k++) { tick(firing); frameTicks.push({ seq, at: (k + 1) / TICK_HZ - before }); }
    if (n > 0) room.binary(1, encodeCommands({ viewTick: room.tick, commands: history.slice(Math.max(0, first - 2)) }));
    return n;
  };
  for (let i = 0; i < 6 * fps; i++) {
    if (i === 1) { const st = p.sim.walker.state; look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, [100, 12, 300]); p.sim.allowSnap(); }
    const n = page(1 / fps, false);
    kit.update(1 / fps);                                               // the kit runs every frame before the press (the review's F1)
    for (let k = 0; k < n; k++) { now += TICK_MS; room.step(); }
  }
  base = camOf(p.cone.frame(p.sim.seq)!);
  // The burst: each page frame its commands (one batch), then its kit's rounds, then the room's ticks for that frame.
  const lengths = frames ?? Array(Math.round(seconds * fps)).fill(1 / fps);
  // `presses` bursts of `seconds` each, `gap` seconds apart (the trigger let go, the kit still running): the press lands
  // wherever the kit's game-frame clock stands (the review's F1).
  const run = (dt: number, firing: boolean): void => {
    const given = Math.min(dt, 0.1);                                   // the page's clamp (PAR-24, `matchMount.ts`)
    const n = page(given, firing);
    if (n > 0) for (const h of heldRounds.splice(0)) name(h.e, Math.max(h.after + 1, (h.e as { seq?: number }).seq ?? 0));
    bloom.update(given, STILL);
    kit.update(given);
    for (const ev of pending.splice(0)) room.text(1, ev);
    // LATER 338: every command the room ran, not only each step's last -- a step may run several (the credit kept while
    // none were queued), and a round is now named at any command of its frame.
    for (let k = 0; k < n; k++) {
      now += TICK_MS; room.step();
      for (let q = lastSeen + 1; q <= p.sim.seq; q++) { const f = p.cone.frame(q); if (f) seen.set(q, camOf(f)); }
      lastSeen = Math.max(lastSeen, p.sim.seq);
    }
  };
  // `mash` (LATER 587): a press every page frame, released before the frame's kit runs -- the commands carry the Trigger
  // throughout (a press each frame), so each round after the first is named at once, at the last command sent.
  // `held` (LATER 587's review F2): the trigger as the page's frames hold it -- pressed on a frame held after one let go,
  // released on the first let go -- and the commands' Trigger bit the frame's own (`NetPage.trigger`), so a press's round
  // is held to the first command carrying it, as the page names it. Was `alternate`: the bit set on the released frames
  // too, which never held a press's round back.
  if (opts.mash) for (const dt of lengths) { kit.pull(); kit.release(); run(dt, true); }
  else if (opts.held) {
    let was = false;
    lengths.forEach((dt, i) => { const h = opts.held![i]!; if (h && !was) kit.pull(); if (!h && was) kit.release(); was = h; run(dt, h); });
  }
  else for (let press = 0; press < (opts.presses ?? 1); press++) {
    kit.pull();
    for (const dt of lengths) run(dt, true);
    kit.release();
    if (opts.gap) for (let i = 0; i < Math.round(opts.gap * fps); i++) run(1 / fps, false);
  }
  // A second more of the page's commands, the trigger let go: each round is decided once the command after its own runs.
  for (let i = 0; i < fps; i++) { const n = page(1 / fps, false); for (let k = 0; k < n; k++) { now += TICK_MS; room.step(); } }
  // SEC-F1: the seat's round signals as the room kept them (`Player.signals`), the shot-centring statistic among them.
  const signals = (): { shots: number; centring?: { rounds: number; mean: number; centred10: number } } => (p as unknown as { signals: { shots: number; centring?: { rounds: number; mean: number; centred10: number } } }).signals;
  return { tally, named, cycle: interval * TICK_HZ - 1, rows, blooms: () => blooms, seen, traced, signals };
}

/** A forged burst: a round every `gap` commands at 60 Hz for `seconds`, each inside the cone, decided as it comes. */
export function forger(rec: WeaponRecord, gap: number, seconds: number): { fired: number; sent: number } {
  let now = 0, s = 1;
  const map = flatMap();
  const room = new Room(map, null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0 }, null, null);
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!, q = room.player(2)!;
  const P = p as unknown as Seat;
  P.records = [{ ...rec, magazine: 1000 } as WeaponRecord, DE]; P.cone = new ShotCone(rec); P.mags = [ringFor({ ...rec, magazine: 1000 } as WeaponRecord), ringFor(DE)];
  p.sim.walker.place(0, 20, 0); q.sim.walker.place(100, 20, 0);
  const R = room as unknown as { fire: (pp: unknown, ev: FireEv) => void };
  const orig = R.fire.bind(room);
  let fired = 0, sent = 0;
  R.fire = (pp: unknown, ev: FireEv): void => { room.takeDrops(); orig(pp, ev); if (!room.takeDrops()) fired++; };
  let seq = p.sim.seq, look = { yaw: 0, pitch: 0 };
  const history: Command[] = [];
  let base: { eye: V3; look: V3; from: V3 } | null = null;
  for (let t = 0; t < 360 + seconds * TICK_HZ; t++) {
    if (t === 2) { const st = p.sim.walker.state; look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, [100, 12, 300]); p.sim.allowSnap(); }
    if (t === 356) { const f = p.cone.frame(p.sim.seq)!, c = cameraLook(f); base = { eye: c.eye, look: c.look, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] }; }
    const firing = t >= 360;
    history.push({ seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: firing ? Button.Trigger : 0, stance: 0, weapon: 0 });
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: history.slice(-3) }));
    if (firing && base && (t - 360) % gap === 0) {
      const { eye, look: l, from } = base;
      const point = [eye[0] + l[0] * 200, eye[1] + l[1] * 200, eye[2] + l[2] * 200];
      room.text(1, { type: 'fire', seq, from, dir: unitV([point[0]! - from[0], point[1]! - from[1], point[2]! - from[2]]), eye, aim: l, weapon: 0, viewTick: room.tick });
      sent++;
    }
    now += TICK_MS; room.step();
  }
  for (let k = 0; k < 4; k++) { now += TICK_MS; room.step(); }
  return { fired, sent };
}


/**
 * P3-room (AR-4): a launched round after forged rifle rounds -- the carrier's rifle (`rec`, the M203 FRAG's carrier) and its
 * M203 FRAG in the kit (stand-in round data as central's `room.test.ts` M4 block: 270 u/s, `FireWait` 1, the 0.5 s
 * after-shot lock). Rifle rounds named at the commands `rifleAt` (ticks after the seat settled, each inside the cone);
 * the round thrown by name once the room has run the command `launchAt` (`launchRound` judges at its arrival, `p.ran`).
 * Returns the rifle rounds the room fired and whether it took the round (one off its slot).
 */
export function launchAfter(rec: WeaponRecord, rifleAt: readonly number[], launchAt: number): { rifle: number; launched: boolean } {
  const kit = [rec.id, HELD_SIDEARM.id, 141, 175, 194] as unknown as Loadout;
  const frag: ThrowableRecord = { ...M67, name: 'M203 FRAG', id: 175, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1, explosionRadius: 150 };
  const kits: SimKits = {
    table: {
      arsenal: arsenalOf(['ZAMMO', [], 'ZWEAPON', [
        ['InternalName', ['M203 FRAG'], 'ID', ['175'], 'Ammo_Capacity', ['6'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]],
        // A second record: `parseRdr`'s shape of a one-record list is the record itself (as central's `room.test.ts`).
        ['InternalName', ['M203 HE'], 'ID', ['171'], 'Ammo_Capacity', ['6'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]],
      ]] as never),
      records: new Map([[rec.id, rec], [HELD_SIDEARM.id, HELD_SIDEARM]]),
      rounds: new Map([[175, { record: frag, piercing: 0, fireWait: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5, icon: 'firemode_203_frag.tif' }]]),
    },
    map: { valves: new Map(), selectable: { seal: [], terrorist: [] }, kits: { seal: [{ type: 'S', character: 's', loadout: kit }], terrorist: [{ type: 'T', character: 't', loadout: kit }] } },
  };
  let now = 0, s = 1;
  const room = new Room(flatMap(), null, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0 }, null, kits);
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!, q = room.player(2)!;
  p.sim.walker.place(0, 20, 0); q.sim.walker.place(100, 20, 0);
  const R = room as unknown as { fire: (pp: unknown, ev: FireEv) => void };
  const orig = R.fire.bind(room);
  let rifle = 0;
  R.fire = (pp: unknown, ev: FireEv): void => { room.takeDrops(); orig(pp, ev); if (!room.takeDrops()) rifle++; };
  const ring = (): number => p.rounds.ring(175)?.rounds() ?? -1;
  let seq = p.sim.seq, look = { yaw: 0, pitch: 0 }, launched = false;
  const history: Command[] = [];
  let base: Cam | null = null;
  for (let t = 0; t < 360 + Math.max(launchAt, ...rifleAt) + 4; t++) {
    if (t === 2) { const st = p.sim.walker.state; look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, [100, 12, 300]); p.sim.allowSnap(); }
    if (t === 356) { const f = p.cone.frame(p.sim.seq)!, c = cameraLook(f); base = { eye: c.eye, look: c.look, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] }; }
    history.push({ seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: t >= 360 ? Button.Trigger : 0, stance: 0, weapon: 0 });
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: history.slice(-3) }));
    if (base && rifleAt.includes(t - 360)) {
      const { eye, look: l, from } = base;
      const point = [eye[0] + l[0] * 200, eye[1] + l[1] * 200, eye[2] + l[2] * 200];
      room.text(1, { type: 'fire', seq, from, dir: unitV([point[0]! - from[0], point[1]! - from[1], point[2]! - from[2]]), eye, aim: l, weapon: 0, viewTick: room.tick });
    }
    now += TICK_MS; room.step();
    if (base && t - 360 === launchAt) {
      const st = p.sim.walker.state, from: V3 = [st.x, st.y + EYE_HEIGHT, st.z], l = base.look;
      const before = ring();
      room.text(1, { type: 'throw', seq, kind: 'M203 FRAG', from, velocity: [l[0] * 270, l[1] * 270, l[2] * 270] });
      launched = ring() === before - 1;
    }
  }
  return { rifle, launched };
}
