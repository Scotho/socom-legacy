import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { Accuracy, fireInterval, perturb, roundsPerPull } from '../../viewer/src/accuracy';
import { Fire } from '../../viewer/src/fire';
import { reloadSeconds } from '../../viewer/src/reloadClip';
import {
  Button, cameraLook, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, ringFor, ShotCone, simClipsFromBytes, TICK_HZ,
  type AimFrame, type ClientEvent, type Command, type ServerEvent, type SimClips, type SimMap,
} from '../../viewer/src/sim';
import { FIRE_ARRIVAL_JITTER_TICKS, FIRE_STALL_CREDIT_TICKS, Room, type Conn } from '../src/room';

/** LATER 336's rework: the most a lock's event may wait over the line's best offset and its end still honour the round. */
const COST = FIRE_STALL_CREDIT_TICKS + FIRE_ARRIVAL_JITTER_TICKS;
/**
 * A case's refusals past the stated cost: each round refused 'reload or empty' at a command-clock slack past the lock of
 * `lateness - COST` ticks or more -- every refusal when the lock's event waited `COST` or less (an honest round's slack
 * is never negative), and above it those outside the stated window (LATER 336's re-review, finding 2: was 0 for any
 * case over `COST`, whatever it refused). The window is widened by a fall of the line's best offset between the lock's
 * lay and the round (`floor`) beyond the lock's slack (`Player.lockSlack`, 21 less the lateness it was laid at): the part
 * not covered is dropped and the lock reads that much later against the round's dating. A lock laid at the clamp (slack
 * 0) is the widest case, not the only one; the term below counts the whole fall, which for a lock with slack leaves the
 * window a little wide -- measured once, jitter 0-80 ms, 450 ms, seed 2: the floor 4 at the lay and 3 at the rounds, a
 * round refused at +6 against a lateness of 30. A rise of the floor (`max(0, ...)`) narrows the real window; the pin
 * leaves it at `lateness - COST` there (LATER 336's delta review, nit 6: tight enough, said rather than modelled).
 */
const pastCost = (s: { lock: { lateness: number; floor: number } | null; post: { out: string; cmdSlack: number; floor: number }[] }): number =>
  s.post.filter((x) => x.out.includes('reload or empty') && x.cmdSlack >= (s.lock?.lateness ?? 0) - COST + Math.max(0, (s.lock?.floor ?? x.floor) - x.floor)).length;
/** The measured refusals (LATER 336's rework, ad059bb03c), kept as an upper bound: a case refusing more fails. */
const within = (bad: Record<string, string>, key: string, refused: number, most: number): void => { if (refused > most) bad[key] = `${refused} refused, measured ${most}`; };

/**
 * LATER 169, folded into LATER 336's rework. What the rework settles and what it leaves: a fall of the line's best offset
 * during the lock (`lagFloor` stepping down) moves the lock with the dating (`Room.keepSchedule`): no round refused. A
 * stall over FIRE_STALL_CREDIT_TICKS + FIRE_ARRIVAL_JITTER_TICKS (24 ticks) on the event that SET the lock is the cost
 * FIRE_STALL_CREDIT_TICKS states -- a lock ends at most 24 ticks before its end on the room's clock as the room learnt of
 * it (H89 D7, the owner's call) -- so the honest round there is refused up to (lateness - 24) ticks past the lock's end:
 * pinned below as that cost (`COST`), never past it. Curing it is a change of the stated cost, for the owner.
 *
 * LATER 169, MEASURED (an offload's measurement; for seat-shots, who owns `room.ts`): does the room's
 * lock check on its own clock -- `fireAt`: `firedAt + FIRE_ARRIVAL_JITTER_TICKS < p.lockClock[w]` -> 'reload or empty'
 * -- refuse an honest page's round at a lock's end (a reload's, a bolt's or a pump's after-shot)?
 *
 * The harness is LATER 105's line model (`roomRifleJitterBloom.test.ts` `burst`: a latency, a seeded jitter, one stall,
 * one ordered socket; copied, not imported) joined to LATER 326's page (`helpers/fireCadence.ts` `burst`: the viewer's own
 * kit `Fire`, its own round naming -- copied, not imported), with what neither had: the kit's reload and after-shot
 * lock, its `reload` / `reloadPress` events named as `net/firearmWire.ts` names them (the last command sent), the
 * clip lengths of the tracked fixture (`RUN/MOTION_P.ZAR`, `RUN/READERC.ZAR`) given to the page's kit and to the room
 * alike, a latency that can fall, and a page hitch (one long page frame while the world's clock runs on).
 *
 * The page never reads the room (no `stale` refund is modelled): what it fires is its own kit's honest gate alone.
 * A round is "honest at the lock's end" when its command's count is at or past the room's own lock on the COMMAND
 * clock (`count >= reloadUntil`): the control cases hold that the page and the room agree there on a steady line.
 *
 * The cases under "RED" assert the honest expectation (no such round refused); each fails where the refusal shows, and
 * prints its table first.
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((w) => w.name === name)!;
const M4A1 = byName('M4A1'), DE = PIN.records['7']!, M40A1 = byName('M40A1'), M87 = byName('M87ELR'), R870 = byName('870');
type V3 = [number, number, number];
type FireEv = Extract<ClientEvent, { type: 'fire' }>;
const TICK_MS = 1000 / TICK_HZ;
const unitV = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
const STILL = { stance: 'stand' as const, rawStance: 'stand' as const, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };

const absent = fixture('RUN/MOTION_P.ZAR') === null || fixture('RUN/READERC.ZAR') === null;
let CLIPS: SimClips | null = null;
const clipsOf = (): SimClips => (CLIPS ??= simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!));

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
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

/** One round's decision as the room took it. */
interface Row {
  /** The page's round (1-based, a shotgun's pull one round), and the page's frame (the world's tick) it left on. */
  round: number; pageTick: number; seq: number;
  out: string;
  /** The command clock: the round's count, the lock's end on it; `cmdSlack` = count - reloadUntil (>= 0: honest). */
  count: number; reloadUntil: number; cmdSlack: number;
  /** The room's clock: the round's date, the lock's end on it; `roomSlack` = firedAt - lockClock (< -3: refused). */
  firedAt: number; lockClock: number; roomSlack: number;
  serverClock: number; ran: number; floor: number;
  roundsBefore: number; roundsAfter: number;
}
/** A lock as the room set it (a reload's at its `reload`; an after-shot's at its round), and the line's state then. */
interface LockSet { kind: 'reload' | 'afterShot'; serverClock: number; ran: number; floor: number; lateness: number; dated: number; reloadUntil: number; lockClock: number }

interface Seat {
  records: [WeaponRecord, WeaponRecord]; cone: ShotCone; mags: { rounds(): number }[];
  reloadUntil: number[]; lockClock: number[]; lockKind: (string | null)[]; ran: number; lagFloor: { cur: number; prev: number };
}
interface Inner { fire: (pp: unknown, ev: FireEv) => void; reload: (pp: unknown, seq: number) => void; eventClock: (pp: unknown) => number; serverClock: number }

/**
 * The page and its line, the room at the other end. The world runs a tick at a time (`world`): the wire's due messages
 * delivered, the clock advanced, the room stepped. A page frame (`frame`) lasts `ticks` of the world (1: 60 fps; more: a
 * hitch -- the world steps on while the page draws nothing, then the page runs its clamped frame, PAR-24's 0.1 s).
 */
function rig(rec: WeaponRecord, line: { latency: number; jitter: number; seed?: number; corner?: boolean; spread?: number }) {
  const clips = clipsOf();
  let now = 0, s = 1;
  const map = flatMap();
  const room = new Room(map, clips, { now: () => now, random: () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, launchCountdownS: 0 }, null, null);
  const clients = new Map<number, Client>();
  for (const id of [1, 2]) { const c = new Client(); clients.set(id, c); room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`); }
  room.step();
  const p = room.player(1)!, q = room.player(2)!;
  const P = p as unknown as Seat;
  P.records = [rec, DE]; P.cone = new ShotCone(rec); P.mags = [ringFor(rec), ringFor(DE)];
  p.sim.walker.place(0, 20, 0); q.sim.walker.place(100, 20, 0);
  const R = room as unknown as Inner;
  const floorOf = (): number => Math.min(P.lagFloor.cur, P.lagFloor.prev);

  // ---- the line (LATER 105's model): a latency, a seeded jitter, one stall, one ordered socket ----
  let r = line.seed ?? 1;
  const rand = (): number => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  let latency = line.latency;
  const wire: { at: number; deliver: () => void }[] = [];
  let lastAt = 0, stallFrom = Infinity, stallTo = -Infinity;
  const put = (deliver: () => void): void => {
    const held = now >= stallFrom - 1e-6 && now < stallTo - 1e-6 ? stallTo : now;
    lastAt = Math.max(lastAt, held + latency + rand() * line.jitter);
    wire.push({ at: lastAt, deliver });
  };
  let worldTick = 0;
  const world = (): void => {
    while (wire.length && wire[0]!.at <= now + 1e-6) wire.shift()!.deliver();
    now += TICK_MS; worldTick++;
    room.step();
  };

  // ---- the room's decisions, observed ----
  const rows: Row[] = [];
  const locks: LockSet[] = [];
  const roundOf = new Map<number, { round: number; pageTick: number }>();
  const origFire = R.fire.bind(room), origReload = R.reload.bind(room);
  const lockNow = (kind: LockSet['kind'], at: { serverClock: number; ran: number; floor: number; dated: number }): void => {
    locks.push({ kind, ...at, lateness: at.serverClock - at.ran - at.floor, reloadUntil: P.reloadUntil[0]!, lockClock: P.lockClock[0]! });
  };
  R.fire = (pp: unknown, ev: FireEv): void => {
    room.takeDrops();
    const f = p.cone.frame(ev.seq);
    const at = { serverClock: R.serverClock, ran: P.ran, floor: floorOf(), dated: R.eventClock(p) };
    const before = { reloadUntil: P.reloadUntil[0]!, lockClock: P.lockClock[0]!, rounds: P.mags[0]!.rounds(), kind: P.lockKind[0] };
    origFire(pp, ev);
    const d = room.takeDrops();
    const who = roundOf.get(ev.seq) ?? { round: -1, pageTick: -1 };
    const count = f?.count ?? NaN;
    rows.push({
      ...who, seq: ev.seq, out: d ? Object.keys(d).join('+') : 'fired',
      count, reloadUntil: before.reloadUntil, cmdSlack: count - before.reloadUntil,
      firedAt: at.dated, lockClock: before.lockClock, roomSlack: at.dated - before.lockClock,
      serverClock: at.serverClock, ran: at.ran, floor: at.floor, roundsBefore: before.rounds, roundsAfter: P.mags[0]!.rounds(),
    });
    if (P.lockKind[0] === 'afterShot' && P.lockClock[0] !== before.lockClock) lockNow('afterShot', at);
  };
  R.reload = (pp: unknown, seq: number): void => {
    const at = { serverClock: R.serverClock, ran: P.ran, floor: floorOf(), dated: R.eventClock(p) };
    const was = P.lockClock[0]!;
    origReload(pp, seq);
    if (P.lockClock[0] !== was) lockNow('reload', at);
  };

  // ---- the page (LATER 326's: the viewer's own kit and naming) ----
  const modes = rec.fireModes.filter((m) => m > 0);
  const mode = modes.reduce((a, m) => (fireInterval(rec.fireWait, m) <= fireInterval(rec.fireWait, a) ? m : a), modes[0]!);
  const interval = fireInterval(rec.fireWait, mode), perPull = roundsPerPull(mode);
  let frameTicks: { seq: number; at: number }[] = [];
  let roundSeqOf: (own?: number) => number = (own) => own ?? 0;
  let base: { eye: V3; look: V3; from: V3 } | null = null;
  const kit = new Fire({
    grid: () => map.grid, aim: () => ({ eye: [0, 30, 0], far: [1000, 30, 0] }),
    tickAim: (at: number) => {
      let pick: { seq: number; at: number } | null = null;
      for (const k of frameTicks) if (k.at <= at + 1e-9) pick = k;
      return pick ? { seq: pick.seq, eye: [0, 30, 0], far: [1000, 30, 0] } : null;
    },
    roundSeq: (own?: number) => (base ? roundSeqOf(own) : null),
    // The clip's length, as `Play.reloadSeconds` answers the kit: the same function and clips the room's lock reads.
    reloadSeconds: (family?: Parameters<typeof reloadSeconds>[4], reloadTime?: number) => reloadSeconds(clips.clips, clips.table, 'stand', false, family, reloadTime),
  } as ConstructorParameters<typeof Fire>[0], rec, undefined, () => 0.5);
  const bloom = new Accuracy(rec);
  let ds = line.spread ?? 1;
  const draw = (): number => { ds = (ds * 16807) % 2147483647; return ds / 2147483647; };
  const corners = [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const;
  let corner: [number, number] = [0, 0], rolled = 0;
  const drawn: [number, number][] = [];
  kit.setGun({
    trigger: () => bloom.trigger(), roundsPerPull: () => perPull, interval: () => interval,
    round: (d) => {
      const c = bloom.cone(0, 1), [kx, ky] = corners[rolled++ % 4]!;
      corner = line.corner ? [c.offsetX + 0.95 * c.radius * kx, c.offsetY + 0.95 * c.radius * ky] : [0, 0];
      // `spread`: a seeded uniform draw in the page's cone's circle (the harness's draw, not the kit's own), at most 0.95 of its radius.
      if (line.spread !== undefined) { const rr = 0.95 * Math.sqrt(draw()), a = 2 * Math.PI * draw(); corner = [c.offsetX + c.radius * rr * Math.cos(a), c.offsetY + c.radius * rr * Math.sin(a)]; }
      drawn.push(corner);
      if (drawn.length > 16) drawn.shift();
      bloom.round(0, 'stand');
      return d;
    },
  });
  let seq = p.sim.seq, look = { yaw: 0, pitch: 0 }, acc = 0;
  const history: Command[] = [];
  type RoundEv = Parameters<Parameters<typeof kit.subscribe>[0]>[0];
  const heldRounds: { e: RoundEv; after: number; c: [number, number] }[] = [];
  const holds = (): boolean => ((history[history.length - 1]?.buttons ?? 0) & Button.Trigger) === 0 || heldRounds.length > 0;
  roundSeqOf = (own?: number): number => (holds() ? Math.max(seq + 1, own ?? 0) : own ?? seq);
  const drawOf = (e: RoundEv): [number, number] => {
    const { pellet, pellets } = e as { pellet?: number; pellets?: number };
    return pellet !== undefined && pellets !== undefined && pellets > 1 ? drawn[drawn.length - pellets + pellet] ?? corner : corner;
  };
  /** The page's rounds, by the world's tick each left on (a shotgun's pull once). */
  const pageRounds: number[] = [];
  const name = (e: RoundEv, at: number, c: [number, number]): void => {
    if (e.type !== 'round' || !base) return;
    if (!roundOf.has(at)) roundOf.set(at, { round: pageRounds.length, pageTick: pageRounds[pageRounds.length - 1] ?? -1 });
    const { eye, look: l0, from } = base;
    const l = line.corner || line.spread !== undefined ? unitV(perturb(l0, { offsetX: c[0], offsetY: c[1], radius: 0 })) : l0;
    const point = [eye[0] + l[0] * 200, eye[1] + l[1] * 200, eye[2] + l[2] * 200];
    const ev = { type: 'fire', seq: at, from, dir: unitV([point[0]! - from[0], point[1]! - from[1], point[2]! - from[2]]), eye, aim: l, weapon: 0 } as const;
    put(() => room.text(1, { ...ev, viewTick: room.tick } as FireEv));
  };
  kit.subscribe((e) => {
    if (e.type === 'round') {
      if (!base) return;
      const pellet = (e as { pellet?: number }).pellet;
      if (pellet === undefined || pellet === 0) pageRounds.push(worldTick);
      if (holds()) { heldRounds.push({ e, after: seq, c: drawOf(e) }); return; }
      name(e, (e as { seq?: number }).seq ?? seq, drawOf(e));
    } else if (e.type === 'reloadPress') {
      const at = seq; put(() => room.text(1, { type: 'reloadPress', seq: at }));   // `firearmWire.fireEvent`: the last command sent
    } else if (e.type === 'reloadStart') {
      const at = seq; put(() => room.text(1, { type: 'reload', seq: at }));
    }
  });
  const cmds = (dt: number, firing: boolean): number => {
    const before = acc;
    acc += dt;
    const n = Math.floor(acc * TICK_HZ + 1e-9);
    acc -= n / TICK_HZ;
    const first = history.length;
    frameTicks = [{ seq, at: -before }];
    for (let k = 0; k < n; k++) {
      history.push({ seq: ++seq, forward: 0, right: 0, ...look, turn: 0, buttons: firing ? Button.Trigger : 0, stance: 0, weapon: 0 });
      frameTicks.push({ seq, at: (k + 1) / TICK_HZ - before });
    }
    if (n > 0) { const batch = history.slice(Math.max(0, first - 2)); put(() => room.binary(1, encodeCommands({ viewTick: room.tick, commands: batch }))); }
    return n;
  };
  let was = false, locked = false, frames = 0;
  /** The world's ticks the page's kit lock (a reload's or an after-shot's) was seen to end on. */
  const lockEnds: number[] = [];
  let reloadTaken: boolean | null = null;
  const frame = (held: boolean, o: { reload?: boolean; ticks?: number } = {}): void => {
    const d = o.ticks ?? 1;
    for (let i = 0; i < d - 1; i++) world();
    if (held && !was) kit.pull();
    if (!held && was) kit.release();
    was = held;
    if (o.reload) reloadTaken = kit.reload();
    const given = Math.min(d / TICK_HZ, 0.1);
    const n = cmds(given, held);
    if (n > 0) for (const h of heldRounds.splice(0)) name(h.e, Math.max(h.after + 1, (h.e as { seq?: number }).seq ?? 0), h.c);
    bloom.update(given, STILL);
    kit.update(given);
    const st = kit.state() as { afterShot?: boolean; magazine: { reloading: boolean } };
    const lk = st.afterShot === true || st.magazine.reloading;
    if (locked && !lk) lockEnds.push(worldTick);
    locked = lk;
    frames++;
    world();
  };
  // 6 s still: the floor settles, the look faces player 2's side, the line's best offset (`lagFloor`) is the line's own.
  for (let i = 0; i < 360; i++) {
    if (i === 1) { const st = p.sim.walker.state; look = faceToward({ feet: [st.x, st.y, st.z], posture: p.sim.walker.posture }, [100, 12, 300]); p.sim.allowSnap(); }
    frame(false);
  }
  { const f = p.cone.frame(p.sim.seq)! as AimFrame; const c = cameraLook(f); base = { eye: c.eye, look: c.look, from: [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]] }; }
  return {
    room, p, P, kit, rows, locks, clients, pageRounds, lockEnds, frame,
    tick: (): number => worldTick, frames: (): number => frames, isLocked: (): boolean => locked, reloadTaken: (): boolean | null => reloadTaken,
    /** The line stalls from now for `ms`: what the page sends meanwhile arrives together at its end (plus the latency). */
    stall: (ms: number): void => { stallFrom = now; stallTo = now + ms; },
    setLatency: (ms: number): void => { latency = ms; },
    pageMag: (): number => kit.state().magazine.rounds,
    stales: (): number => clients.get(1)!.events.filter((e) => e.type === 'stale' && (e as { request?: string }).request === 'fire').length,
  };
}

interface Case {
  /** The lock: a reload pressed after a short burst, or the after-shot lock of the weapon's first round. */
  kind: 'reload' | 'afterShot';
  line?: { latency: number; jitter: number; seed?: number; corner?: boolean; spread?: number };
  /** A stall of the line, `stallMs` long, from `stallOffset` page frames before (negative) or after the lock's page frame. */
  stallMs?: number; stallOffset?: number;
  /** The latency falls to `fallTo` ms, `fallAt` page frames after the lock's frame. */
  fallTo?: number; fallAt?: number;
  /** One long page frame of `hitchTicks` world ticks, `hitchAt` page frames after the lock's frame. */
  hitchTicks?: number; hitchAt?: number;
  /** The trigger pressed again `pressAt` page frames after the lock's frame, held `holdFrames` (default: until `rounds` more rounds left, at most 240). */
  pressAt: number; rounds?: number;
  /** One more press after those rounds (a semi-automatic's next round). */
  again?: boolean;
}

/**
 * A lock, then the trigger: the rounds the page fired after its lock ended, as the room decided them.
 * `lockFrame`: the page frame the lock's event leaves on (a reload: its R press; an after-shot: its round's frame, found
 * by a first run of the same page -- the page never reads the room, so its frames are the same on any line).
 */
function lockThenShoot(rec: WeaponRecord, c: Case, shotFrame?: number): ReturnType<typeof summarize> {
  const line = c.line ?? { latency: 30, jitter: 0 };
  const h = rig(rec, line);
  const start = h.frames();
  let lockFrame: number;
  const at = (rel: number): boolean => h.frames() - lockFrame === rel;
  const extras = (): { ticks?: number } => {
    if (c.stallMs && at(c.stallOffset ?? 0)) h.stall(c.stallMs);
    if (c.fallTo !== undefined && at(c.fallAt ?? 0)) h.setLatency(c.fallTo);
    return c.hitchTicks && at(c.hitchAt ?? 0) ? { ticks: c.hitchTicks } : {};
  };
  let before = 0;
  if (c.kind === 'reload') {
    // A short burst (the trigger held 20 frames), let go, 40 frames, then R.
    for (let i = 0; i < 20; i++) h.frame(true);
    for (let i = 0; i < 40; i++) h.frame(false);
    lockFrame = h.frames();
    before = h.pageRounds.length;
    if (c.stallMs && (c.stallOffset ?? 0) === 0) h.stall(c.stallMs);
    if (c.fallTo !== undefined && (c.fallAt ?? 0) === 0) h.setLatency(c.fallTo);
    h.frame(false, { reload: true });
  } else {
    // The trigger held until the first round leaves (the console's second down read), then let go.
    lockFrame = shotFrame ?? Infinity;
    let guard = 0;
    while (h.pageRounds.length === 0 && guard++ < 30) {
      if (c.stallMs && h.frames() - lockFrame === (c.stallOffset ?? 0)) h.stall(c.stallMs);
      h.frame(true);
    }
    if (shotFrame === undefined) lockFrame = h.frames() - 1;
    before = h.pageRounds.length;
  }
  const want = before + (c.rounds ?? 1);
  // To the press: the trigger up.
  let guard = 0;
  while (h.frames() - lockFrame < c.pressAt && guard++ < 600) { const x = extras(); h.frame(false, x); }
  // The press, held until the rounds asked for have left (a semi-automatic's pull: one).
  guard = 0;
  while (h.pageRounds.length < want && guard++ < 360) { const x = extras(); h.frame(true, x); }
  // `again`: the trigger let go 60 frames (past a bolt's timer, so the pull's count clears), then held until one more round leaves.
  if (c.again) {
    for (let i = 0; i < 60; i++) h.frame(false);
    const more = h.pageRounds.length + 1;
    guard = 0;
    while (h.pageRounds.length < more && guard++ < 360) h.frame(true);
  }
  for (let i = 0; i < 90; i++) h.frame(false);
  return summarize(h, c, start, lockFrame, before);
}

function summarize(h: ReturnType<typeof rig>, c: Case, start: number, lockFrame: number, before: number) {
  // A shotgun's pull: its rays share a command -- one row a round (its first ray's).
  const seen = new Set<number>();
  const post = h.rows.filter((x) => x.round > before && !seen.has(x.round) && (seen.add(x.round), true));
  const lock = h.locks.find((l) => l.kind === c.kind) ?? null;
  const pageLockEnd = h.lockEnds[c.kind === 'reload' ? 0 : 0] ?? -1;
  const refused = post.filter((x) => x.out.includes('reload or empty'));
  return {
    lockFrame: lockFrame - start, shotFrame: lockFrame,
    lock, pageLockEnd,
    post: post.map((x) => ({ round: x.round, out: x.out, cmdSlack: x.cmdSlack, roomSlack: x.roomSlack, afterPageLock: x.pageTick - pageLockEnd, floor: x.floor })),
    refused: refused.length, others: post.filter((x) => x.out !== 'fired' && !x.out.includes('reload or empty')).map((x) => x.out),
    all: h.rows.map((x) => `${x.round}:${x.out}`).join(' '),
    stales: h.stales(), pageMag: h.pageMag(), roomMag: h.P.mags[0]!.rounds(), reloadTaken: h.reloadTaken(),
    lockEnds: h.lockEnds.slice(), pageRounds: h.pageRounds.slice(),
  };
}

const fmt = (s: ReturnType<typeof summarize>): string => {
  const l = s.lock;
  const set = l ? `set: lateness ${l.lateness.toFixed(1)}, dated ${(l.dated - (l.ran + l.floor)).toFixed(1)} past ran+floor` : 'no lock set';
  return `${set}; post ${s.post.map((x) => `[r${x.round} ${x.out} cmd${x.cmdSlack >= 0 ? '+' : ''}${x.cmdSlack} room${x.roomSlack >= 0 ? '+' : ''}${x.roomSlack.toFixed(1)}]`).join(' ')}; stale told ${s.stales}; mags page ${s.pageMag} room ${s.roomMag}`;
};

/** The after-shot round's page frame (the page's own, the same on every line): a first run with no line trouble. */
const shotFrameOf = (rec: WeaponRecord): number => lockThenShoot(rec, { kind: 'afterShot', pressAt: 200 }).shotFrame;
/** The page's after-shot lock, in ticks from its round's frame to the first frame its kit reads unlocked (no press meanwhile). */
const lockLenOf = (rec: WeaponRecord): number => { const s = lockThenShoot(rec, { kind: 'afterShot', pressAt: 280 }); return s.pageLockEnd - s.pageRounds[0]!; };

describe.skipIf(absent)('LATER 169 measured: the harness is honest -- on a steady line no round at a lock\'s end is refused', () => {
  it('M4A1, a reload: the trigger pressed before its end and held through it (the first round on the lock\'s first open frame), 0 / 50 / 80 ms of jitter -- none refused', () => {
    for (const jitter of [0, 50, 80]) for (const seed of [1, 2, 3]) {
      const s = lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 8, line: { latency: 30, jitter, seed } });
      console.log(`169 control reload M4A1 jitter ${jitter} seed ${seed}: reloadTaken ${s.reloadTaken}; page lock end tick ${s.pageLockEnd}; ${fmt(s)}`);
      expect(s.reloadTaken).toBe(true);
      expect(s.lock?.kind).toBe('reload');
      expect(s.post.length).toBe(8);
      expect(s.post.map((x) => x.out)).toEqual(Array(8).fill('fired'));
      expect(Math.min(...s.post.map((x) => x.cmdSlack))).toBeGreaterThanOrEqual(0);   // honest on the command clock
    }
  });

  it('M40A1, M87ELR, 870: the after-shot lock, the trigger held from before its end -- the next round fired, on 0 / 50 / 80 ms of jitter', () => {
    for (const rec of [M40A1, M87, R870]) {
      const shot = shotFrameOf(rec);
      for (const jitter of [0, 50, 80]) {
        const s = lockThenShoot(rec, { kind: 'afterShot', pressAt: rec.reloadDelayAfterShot ? 40 : 8, line: { latency: 30, jitter, seed: 1 } }, shot);
        console.log(`169 control afterShot ${rec.name} jitter ${jitter}: page lock end tick ${s.pageLockEnd} (round 1 at ${s.pageRounds[0]}: ${s.pageLockEnd - s.pageRounds[0]!} ticks); ${fmt(s)}`);
        expect(s.lock?.kind).toBe('afterShot');
        expect(s.post.map((x) => x.out)).toEqual(['fired']);
        expect(s.post[0]!.cmdSlack).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe.skipIf(absent)("LATER 169 measured: an honest round at a lock's end (its command at or past the room's own lock on the command clock) is never refused 'reload or empty' -- but past the stated cost of a stall on the lock's own event (COST)", () => {
  it('RELOAD, a stall of the line holding the reload itself (M4A1; 200-900 ms; the trigger held through the reload\'s end, 8 rounds)', () => {
    const table: string[] = [];
    const bad: Record<string, number | string> = {};
    const measured: Record<number, number> = { 450: 1, 500: 1, 600: 2, 700: 3, 800: 4, 900: 5 };
    for (const stallMs of [200, 300, 350, 400, 450, 500, 600, 700, 800, 900]) {
      const s = lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 8, stallMs });
      table.push(`stall ${stallMs} ms: ${fmt(s)}${s.others.length ? `; OTHER ${s.others.join(',')}` : ''}`);
      expect(Math.min(...s.post.map((x) => x.cmdSlack)), `stall ${stallMs}: honest on the command clock`).toBeGreaterThanOrEqual(0);
      if (pastCost(s)) bad[`${stallMs} ms`] = s.refused;
      within(bad as Record<string, string>, `${stallMs} ms, the count`, s.refused, measured[stallMs] ?? 0);
    }
    console.log(`169 RELOAD x STALL (M4A1)\n${table.join('\n')}`);
    expect(bad, "rounds refused 'reload or empty' by stall length").toEqual({});
  });

  it('RELOAD, the stall\'s place (M4A1, 700 ms): from 36 frames before the reload to 6 after', () => {
    const table: string[] = [];
    const bad: Record<string, number | string> = {};
    const measured: Record<number, number> = { [-12]: 1, [-6]: 2, [-3]: 3, 0: 3, 1: 3 };
    for (const stallOffset of [-36, -30, -24, -18, -12, -6, -3, 0, 1, 2, 6]) {
      // The stall before the R press: staged from the burst's tail (the trigger up), `stallOffset` frames before R.
      const s = stallOffset === 0 ? lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 8, stallMs: 700 }) : reloadWithEarlyStall(700, stallOffset);
      table.push(`stall 700 ms from ${stallOffset}: ${fmt(s)}`);
      if (pastCost(s)) bad[`${stallOffset}`] = s.refused;
      within(bad as Record<string, string>, `${stallOffset}, the count`, s.refused, measured[stallOffset] ?? 0);
    }
    console.log(`169 RELOAD x STALL PLACE (M4A1, 700 ms)\n${table.join('\n')}`);
    expect(bad, "rounds refused 'reload or empty' by the stall's start (frames from the reload)").toEqual({});
  });

  it('RELOAD, the latency falls mid-reload (M4A1; 150 ms falling by 1-8 ticks, 30 frames into the reload; and rising for good, for the record)', () => {
    const table: string[] = [];
    const bad: Record<string, number> = {};
    for (const ticks of [1, 2, 3, 4, 5, 6, 8]) {
      const s = lockThenShoot(M4A1, { kind: 'reload', pressAt: 40, rounds: 8, line: { latency: 150, jitter: 0 }, fallTo: 150 - ticks * TICK_MS, fallAt: 30 });
      table.push(`latency -${ticks} ticks (${(ticks * TICK_MS).toFixed(0)} ms): ${fmt(s)}`);
      expect(Math.min(...s.post.map((x) => x.cmdSlack)), `fall ${ticks}: honest on the command clock`).toBeGreaterThanOrEqual(0);
      if (s.refused) bad[`-${ticks} ticks`] = s.refused;
    }
    // The other way, for the record (not a refusal's cause): the latency RISING for good, at the reload's frame and mid-reload.
    for (const [ms, fallAt] of [[400, 0], [900, 0], [400, 30], [900, 30]] as const) {
      const s = lockThenShoot(M4A1, { kind: 'reload', pressAt: 40, rounds: 8, line: { latency: 150, jitter: 0 }, fallTo: 150 + ms, fallAt });
      table.push(`latency +${ms} ms for good, ${fallAt} frames after R: ${fmt(s)}${s.others.length ? `; OTHER ${s.others.join(',')}` : ''}`);
      if (s.refused) bad[`+${ms} ms at ${fallAt}`] = s.refused;
    }
    console.log(`169 RELOAD x LATENCY FALL (M4A1)\n${table.join('\n')}`);
    expect(bad, "rounds refused 'reload or empty' by the latency's fall").toEqual({});
  });

  it('RELOAD, a page hitch mid-reload (M4A1; one page frame of 100-500 ms, 30 frames into the reload)', () => {
    const table: string[] = [];
    const bad: Record<string, number> = {};
    for (const hitchTicks of [6, 9, 15, 20, 30]) {
      const s = lockThenShoot(M4A1, { kind: 'reload', pressAt: 40, rounds: 8, hitchTicks, hitchAt: 30 });
      table.push(`hitch ${(hitchTicks * TICK_MS).toFixed(0)} ms: ${fmt(s)}${s.others.length ? `; OTHER ${s.others.join(',')}` : ''}`);
      if (s.refused) bad[`${hitchTicks} ticks`] = s.refused;
    }
    console.log(`169 RELOAD x PAGE HITCH (M4A1)\n${table.join('\n')}`);
    expect(bad, "rounds refused 'reload or empty' by the hitch's length").toEqual({});
  });

  for (const rec of [M40A1, M87, R870]) {
    it(`AFTER-SHOT, a stall of the line holding the lock's own round (${rec.name}; 200-900 ms; the trigger held from before the lock's end)`, () => {
      const shot = shotFrameOf(rec);
      const table: string[] = [];
      const bad: Record<string, number | string> = {};
      // Measured: the one round refused from 450 ms (M40A1, M87ELR) or 500 ms (870) on.
      const from = rec === R870 ? 500 : 450;
      for (const stallMs of [200, 300, 350, 400, 450, 500, 600, 700, 800, 900]) {
        const s = lockThenShoot(rec, { kind: 'afterShot', pressAt: rec.reloadDelayAfterShot ? 40 : 8, stallMs }, shot);
        table.push(`stall ${stallMs} ms: ${fmt(s)}${s.others.length ? `; OTHER ${s.others.join(',')}` : ''}`);
        expect(s.post[0]!.cmdSlack, `stall ${stallMs}: honest on the command clock`).toBeGreaterThanOrEqual(0);
        if (pastCost(s)) bad[`${stallMs} ms`] = s.refused;
        within(bad as Record<string, string>, `${stallMs} ms, the count`, s.refused, stallMs >= from ? 1 : 0);
      }
      console.log(`169 AFTER-SHOT x STALL (${rec.name})\n${table.join('\n')}`);
      expect(bad, "rounds refused 'reload or empty' by stall length").toEqual({});
    });

    it(`AFTER-SHOT, the window: after a 900 ms stall on the lock's round, the trigger pressed later and later past the lock's end (${rec.name})`, () => {
      const shot = shotFrameOf(rec);
      const lockLen = lockLenOf(rec);                                   // the page's lock, in ticks from its round
      const table: string[] = [];
      const refusedAt: number[] = [], firedAt: number[] = [], past: number[] = [];
      for (let late = -8; late <= 40; late += 2) {
        const s = lockThenShoot(rec, { kind: 'afterShot', pressAt: lockLen + late, stallMs: 900 }, shot);
        const x = s.post[0]!;
        table.push(`press ${late >= 0 ? '+' : ''}${late}: [${x.out} cmd${x.cmdSlack >= 0 ? '+' : ''}${x.cmdSlack} room${x.roomSlack.toFixed(1)} ]`);
        (x.out.includes('reload or empty') ? refusedAt : x.out === 'fired' ? firedAt : []).push(x.cmdSlack);
        if (x.out.includes('reload or empty') && x.cmdSlack >= (s.lock?.lateness ?? 0) - COST) past.push(x.cmdSlack);
      }
      console.log(`169 AFTER-SHOT WINDOW (${rec.name}, 900 ms stall; the page's lock ${lockLen} ticks)\n${table.join('\n')}\nrefused at cmdSlack ${JSON.stringify(refusedAt)}; fired at ${JSON.stringify(firedAt)}`);
      expect(past, 'the command-clock slacks (ticks past the lock) refused past the lock event\'s lateness less COST').toEqual([]);
    });

    it(`AFTER-SHOT, the latency falls or the page hitches mid-lock (${rec.name})`, () => {
      const shot = shotFrameOf(rec);
      const table: string[] = [];
      const bad: Record<string, number> = {};
      for (const ticks of [2, 3, 4, 5, 6, 8]) {
        const s = lockThenShoot(rec, { kind: 'afterShot', pressAt: rec.reloadDelayAfterShot ? 40 : 8, line: { latency: 150, jitter: 0 }, fallTo: 150 - ticks * TICK_MS, fallAt: rec.reloadDelayAfterShot ? 15 : 3 }, shot);
        table.push(`latency -${ticks} ticks: ${fmt(s)}`);
        if (s.refused) bad[`fall -${ticks}`] = s.refused;
      }
      for (const hitchTicks of [6, 9, 15, 20, 30]) {
        const s = lockThenShoot(rec, { kind: 'afterShot', pressAt: rec.reloadDelayAfterShot ? 60 : 8, hitchTicks, hitchAt: rec.reloadDelayAfterShot ? 15 : 3 }, shot);
        table.push(`hitch ${(hitchTicks * TICK_MS).toFixed(0)} ms: ${fmt(s)}${s.others.length ? `; OTHER ${s.others.join(',')}` : ''}`);
        if (s.refused) bad[`hitch ${hitchTicks}`] = s.refused;
      }
      console.log(`169 AFTER-SHOT x LATENCY FALL / HITCH (${rec.name})\n${table.join('\n')}`);
      expect(bad, "rounds refused 'reload or empty'").toEqual({});
    });
  }

  it("what follows a refused round (M4A1 reload, 900 ms stall, claims at 0.95 of the page's cone corner, 20 rounds): LOCK-END-RELIEF -- the refused rounds told 'stale' and refunded, the rest of the burst fired", () => {
    const control = lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 20, line: { latency: 30, jitter: 0, corner: true } });
    const s = lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 20, stallMs: 900, line: { latency: 30, jitter: 0, corner: true } });
    const tally = (x: typeof s): Record<string, number> => { const t: Record<string, number> = {}; for (const r of x.post) t[r.out] = (t[r.out] ?? 0) + 1; return t; };
    console.log(`169 AFTERMATH control (corner claims, no stall): ${JSON.stringify(tally(control))}; mags page ${control.pageMag} room ${control.roomMag}\n169 AFTERMATH 900 ms stall: ${JSON.stringify(tally(s))}; stale told ${s.stales}; mags page ${s.pageMag} room ${s.roomMag}\n${s.post.map((x) => `r${x.round}:${x.out}`).join(' ')}`);
    expect(tally(control)).toEqual({ fired: 20 });
    // The residual (LATER 336's rework): the stall's lateness is over COST, its refusals the stated cost's.
    expect(s.lock?.lateness ?? 0).toBeGreaterThan(COST);
    expect(pastCost(s)).toBe(0);
    // LOCK-END-RELIEF (Phase 1, the owner's word 2026-11-22; was the pinned cost of LATER 336's re-review, finding 2: 5
    // 'reload or empty' then 15 'cone'): the lock's refusals on the room's clock alone go through `refuseRound` -- told
    // 'stale' (the page refunds them), bloomed -- so the page's cone stays with the room's and the rest of the burst lands.
    // The window is not shortened (Phase 1): the same 5 are refused.
    expect(tally(s), s.post.map((x) => `r${x.round}:${x.out}`).join(' ')).toEqual({ 'fire: reload or empty': 5, fired: 15 });
    expect(s.stales, "each lock-end refusal told 'stale' once").toBe(5);
    // The rig's page never reads the room (no refund modelled, the header): its count plus the rounds told 'stale' -- what
    // the real page's journal refunds (`../../viewer/src/netPage` `case 'stale'`) -- is the room's.
    expect(s.pageMag + s.stales, "the page's magazine with the refunds is the room's").toBe(s.roomMag);
  });

  it("what follows, by where the page's claims fall (M4A1 reload, 500 / 700 / 900 ms stalls, 20 rounds): at the cone's centre, and on a seeded uniform draw in the page's cone (5 seeds)", () => {
    const tally = (x: ReturnType<typeof summarize>): Record<string, number> => { const t: Record<string, number> = {}; for (const r of x.post) t[r.out] = (t[r.out] ?? 0) + 1; return t; };
    const table: string[] = [];
    let lost = 0;
    for (const spread of [1, 2, 3, 4, 5]) {
      const control = lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 20, line: { latency: 30, jitter: 0, spread } });
      table.push(`draw seed ${spread}, no stall: ${JSON.stringify(tally(control))}`);
      expect(tally(control), `control, draw seed ${spread}`).toEqual({ fired: 20 });
    }
    // Measured (LATER 336's rework): 'reload or empty' 1 / 3 / 5 at 500 / 700 / 900 ms, kept as an upper bound; the 'cone'
    // cascade after them (the refusal silent and unbloomed, the page's cone left ahead) pinned as the known cost: none at
    // the centre or at 500 ms, every round after them at 700 and 900 ms on a draw in the cone.
    const most: Record<number, number> = { 500: 1, 700: 3, 900: 5 };
    const cones: string[] = [];
    for (const stallMs of [500, 700, 900]) {
      const centre = lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 20, stallMs });
      table.push(`stall ${stallMs} ms, centre claims: ${JSON.stringify(tally(centre))}; mags page ${centre.pageMag} room ${centre.roomMag}`);
      lost += pastCost(centre);
      if (centre.refused > most[stallMs]!) cones.push(`${stallMs} ms centre: ${centre.refused} refused, measured ${most[stallMs]}`);
      if (tally(centre)['fire: cone: cone']) cones.push(`${stallMs} ms centre: ${tally(centre)['fire: cone: cone']} 'cone', measured 0`);
      if (centre.pageMag + centre.stales !== centre.roomMag) cones.push(`${stallMs} ms centre: mags page ${centre.pageMag} + ${centre.stales} refunded, room ${centre.roomMag}`);
      for (const spread of [1, 2, 3, 4, 5]) {
        const s = lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 20, stallMs, line: { latency: 30, jitter: 0, spread } });
        table.push(`stall ${stallMs} ms, draw seed ${spread}: ${JSON.stringify(tally(s))}; stale told ${s.stales}; mags page ${s.pageMag} room ${s.roomMag}; ${s.post.map((x) => (x.out === 'fired' ? 'F' : x.out.includes('reload') ? 'L' : x.out.includes('cone') ? 'c' : '?')).join('')}`);
        lost += pastCost(s);
        if (s.refused > most[stallMs]!) cones.push(`${stallMs} ms seed ${spread}: ${s.refused} refused, measured ${most[stallMs]}`);
        // LOCK-END-RELIEF: no 'cone' cascade after the refusals (was every round after them at 700 and 900 ms), and the
        // page's magazine the room's after the refunds.
        const cone = tally(s)['fire: cone: cone'] ?? 0;
        if (cone !== 0) cones.push(`${stallMs} ms seed ${spread}: ${cone} 'cone', expected 0`);
        if (s.pageMag + s.stales !== s.roomMag) cones.push(`${stallMs} ms seed ${spread}: mags page ${s.pageMag} + ${s.stales} refunded, room ${s.roomMag}`);
      }
    }
    console.log(`169 AFTERMATH BY CLAIM (M4A1; F fired, L 'reload or empty', c 'cone')\n${table.join('\n')}`);
    // The residual (LATER 336's rework): 'reload or empty' only past COST of lateness; the 'cone' refusals after them
    // follow from the page's cone left behind (the refusal tells nothing), logged above.
    expect(lost, "rounds refused 'reload or empty' past the stated cost, summed over the cases").toBe(0);
    expect(cones, "against the measured refusals and 'cone' cascade").toEqual([]);
  });

  it("the line's own jitter beside the stall (M4A1 reload; stalls 350 / 400 / 450 ms; 50 and 80 ms of jitter; 10 seeds each): where the first refusal falls", () => {
    const table: string[] = [];
    let total = 0;
    // Measured (LATER 336's rework): the rounds refused over the 10 seeds, kept as an upper bound.
    const most: Record<string, number> = { '50/350': 0, '50/400': 10, '50/450': 10, '80/350': 1, '80/400': 10, '80/450': 11 };
    const over: string[] = [];
    for (const jitter of [50, 80]) for (const stallMs of [350, 400, 450]) {
      let cases = 0, rounds = 0;
      const lateness: number[] = [];
      for (let seed = 1; seed <= 10; seed++) {
        const s = lockThenShoot(M4A1, { kind: 'reload', pressAt: 30, rounds: 8, stallMs, line: { latency: 30, jitter, seed } });
        if (s.refused) { cases++; rounds += s.refused; }
        total += pastCost(s);
        lateness.push(s.lock?.lateness ?? NaN);
      }
      table.push(`jitter 0-${jitter} ms, stall ${stallMs} ms: ${cases} of 10 seeds refuse a round (${rounds} rounds); the reload's lateness ${Math.min(...lateness)}..${Math.max(...lateness)} ticks`);
      if (rounds > most[`${jitter}/${stallMs}`]!) over.push(`${jitter}/${stallMs}: ${rounds} refused, measured ${most[`${jitter}/${stallMs}`]}`);
    }
    console.log(`169 RELOAD x STALL x JITTER (M4A1)\n${table.join('\n')}`);
    expect(total, "rounds refused 'reload or empty' past the stated cost").toBe(0);
    expect(over, 'against the measured refusals').toEqual([]);
  });

  it("a bolt after its refused round (M40A1, 700 ms stall on round 1): LOCK-END-RELIEF -- round 2 refused and refunded, round 3 fired", () => {
    const shot = shotFrameOf(M40A1);
    const s = lockThenShoot(M40A1, { kind: 'afterShot', pressAt: 40, stallMs: 700, again: true }, shot);
    console.log(`169 BOLT AFTERMATH (M40A1, 700 ms): ${fmt(s)}; all ${s.all}; page rounds at ticks ${s.pageRounds.join(',')}`);
    expect(s.lock?.lateness ?? 0).toBeGreaterThan(COST);              // the residual: the stated cost's
    expect(s.post[1]?.out).toBe('fired');
    // LOCK-END-RELIEF: round 2 refused on the room's clock alone, told 'stale' once (refunded); round 3 fired.
    expect(s.post[0]?.out, 'round 2').toBe('fire: reload or empty');
    expect(s.stales, "round 2 told 'stale' once").toBe(1);
    expect(s.pageMag + s.stales, "the page's magazine with the refund is the room's").toBe(s.roomMag);
  });

  it('the constants this measurement read', () => {
    expect(FIRE_ARRIVAL_JITTER_TICKS).toBe(3);
    expect(FIRE_STALL_CREDIT_TICKS).toBe(21);
  });
});

/** The reload with a stall staged `offset` page frames from the R press (negative: before it; positive: after). */
function reloadWithEarlyStall(stallMs: number, offset: number): ReturnType<typeof summarize> {
  const h = rig(M4A1, { latency: 30, jitter: 0 });
  const start = h.frames();
  for (let i = 0; i < 20; i++) h.frame(true);
  for (let i = 0; i < 40; i++) { if (offset < 0 && i === 40 + offset) h.stall(stallMs); h.frame(false); }
  const lockFrame = h.frames();
  const before = h.pageRounds.length;
  h.frame(false, { reload: true });
  let guard = 0;
  while (h.frames() - lockFrame < 30 && guard++ < 600) { if (offset > 0 && h.frames() - lockFrame === offset) h.stall(stallMs); h.frame(false); }
  guard = 0;
  while (h.pageRounds.length < before + 8 && guard++ < 360) h.frame(true);
  for (let i = 0; i < 90; i++) h.frame(false);
  return summarize(h, { kind: 'reload', pressAt: 30 }, start, lockFrame, before);
}
