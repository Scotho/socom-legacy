// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { Animator, PLAY_CLIPS } from '../src/animator';
import { FlyCamera } from '../src/camera';
import { SEAL_ANIMS } from '../src/locomotion';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { bodyVariants, recipientBodies } from '../../match/src/room';
import { snapshotOf } from '../src/net/body';
import { NetClient, type WebSocketLike } from '../src/net/client';
import { encodeSnapshot } from '../src/net/codec';
import { ACTION_CODES, BodyFlag, SNAPSHOT_HZ, STANCE_CODES, type BodyState } from '../src/net/protocol';
import { blastKnock, fragmentDamage, PART, TICK_HZ, type Knock, type ServerEvent } from '../src/sim';
import { simSkeletonsFromBytes } from '../src/simMap';
import { packGround, WalkMode } from '../src/walk';

/**
 * LATER 1055 (simulation track; RED first, no fix here): the page's own corpse stands up after a blast death. The room
 * is right (the match's replay, decoded: the body dead and airborne in `fallBackwards` from the tick after the kill,
 * `landBackwards` 22 ticks on, held); the victim's own page drew it upright. The page draws its own corpse from its own
 * predicted mover alone (`walk.ts` `snapshot`: a death pose replaces the mover's play, and a blast death has none --
 * `net/deaths.ts` `deathClip('blast', ..)` is null standing), so whenever the page's mover is not dead in the knock's
 * fall or landing the corpse stands.
 *
 * The original (reading): the blast's knock is laid on a dead actor too -- `FUN_0057e770` D:L441000-441002 takes state 8
 * when the alive bit (`+0xe1`) is clear -- and the landing's end in `FUN_00589aa0` pushes the get-up only while alive
 * (D:L446667, D:L446700), dead it sets state 8 instead (D:L446682-446683, D:L446715-446716): the knocked corpse falls,
 * lands and stays down. The port's mover holds that (`mover.ts` `landBackwards` held at its last key while `dead_`,
 * mover.ts:4373-4375, `Walker.dead` mover.ts:2785-2793; `Walker.knock` mover.ts:4045-4068 lays the knock with no refusal).
 *
 * The page's path, as a live match drives it (`localDeath.test.ts`'s online case, with the page AHEAD of the room as it
 * is on a real link): the room sends `blast` to the victim before it broadcasts `kill` (`room.ts` 9176-9188); the client
 * lays the knock while alive (`net/client.ts` 903-904 -> `WalkMode.knock`), from the room's command `after` -- behind
 * the page's last sent, so the knock is laid there and the commands since run again (`replayKnock` -> `rerunFrom`); then
 * the kill (`net/client.ts` 886-887: `setLocked(true)`, `setDead(true)`), and `netPage.ts` 2223's `setDeathPose(null)`
 * for a kill with no clip.
 *
 * Synthetic (no game data) but case (iii), which reads the disc's fixture clips and skips without them.
 *
 * What a result on the box means:
 * - (i) GREEN: the mover itself falls, lands and holds `landBackwards` dead on this path -- hypothesis (a) (the body
 *   never lands, holding the end of the fall in the air) is not this path's on a flat floor; RED: the mover is the cause.
 * - (ii') expected RED, candidate 1's mechanism: a re-run after the death from a kept state saved before the page heard
 *   the kill (`Walker.restoreState` copies `dead_` wholesale, it is not in `KEPT_SHARED` mover.ts:2150; `rerunFrom`
 *   restores at walk.ts:362) brings the body back alive, and its landing gets up (`getUpBackwards`). GREEN: no re-run
 *   stands it up. The page runs ahead of the room, so every command between the room's kill and the page's hearing of it
 *   was kept alive: any re-run entry that fires after the death from there carries this.
 * - (ii) expected GREEN: the one entry the reading found firing while dead, the refused turret take (`mountUntake`), is
 *   dropped by the kill (`setDeathPose(null)` clears the take); RED on its `replayed` pin means that entry is live.
 * - (iii) GREEN with (i) GREEN: the own body's drawing of the held landing lies down -- hypothesis (b) is not the
 *   animator's; the cause is elsewhere (another path that leaves the mover upright, or the page's body view). RED: (b).
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
/** `knock.test.ts`'s flat floor at y 0. */
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
};
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];

const ME = 3, KILLER = 5;
const FEET: [number, number, number] = [-100, 0, 0];
/**
 * The page runs ahead of the room: the room's command at the blast (`after`, `room.ts` 9181 `q.sim.seq`) is this many
 * behind the page's last sent (about 100 ms at 60 Hz) -- the common case on a real link, the knock laid by a re-run.
 */
const LEAD = 6;

/**
 * The blast's knock as the room computes it (`net/blast.ts` `blastKnock`, `FUN_0057e770` D:L441053-441068): an M67 (its
 * transcribed record, research 94 as `accessBarriers.test.ts` holds it: Explosion_Damage 10, radius 150) at the floor
 * 40 u in front of a standing SEAL facing yaw 0 (-z), the damage at the feet `fragmentDamage` (`net/damage.ts`). The
 * push: about 12.3 u/s back and the rise `f x 50` = 46.2 u/s -- in the air about 0.39 s, 23-24 ticks, as the replay's
 * decode has the room's body landing 22 ticks after the kill (LATER 1055's row). It falls `fallBackwards` (the blast in front).
 */
const M67 = { explosionDamage: 10, explosionRadius: 150 };
const POINT: [number, number, number] = [FEET[0], 0, FEET[2] - 40];
const KNOCK: Knock = blastKnock({ feet: FEET, posture: 'stand', yaw: 0 }, POINT, M67, fragmentDamage(M67.explosionDamage, M67.explosionRadius, 40))!;

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};

/** A socket the test plays the server on (`localDeath.test.ts`'s `fakeSocket`). */
function fakeSocket() {
  const s: WebSocketLike & { server(ev: ServerEvent): void } = {
    binaryType: 'arraybuffer', readyState: 1,
    onopen: null, onclose: null, onmessage: null, onerror: null,
    send: () => undefined, close: () => undefined,
    server(ev: ServerEvent) { s.onmessage?.({ data: JSON.stringify(ev) }); },
  };
  queueMicrotask(() => s.onopen?.({}));
  return s;
}
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

const open: { walk: WalkMode; client: NetClient }[] = [];
afterEach(() => { for (const o of open.splice(0)) { o.client.close(); o.walk.unbindKey(); } });

/** One tick's read of the page's mover. */
interface Seen { name: string; walkDead: boolean; moverDead: boolean; y: number; airborne: boolean; t: number; seconds: number | null }

/**
 * The page (`localDeath.test.ts`'s `walkRig` and online client): a real `WalkMode` on the flat floor, tapped by a real
 * `NetClient` fed the server's events; welcomed, spawned at `FEET` facing yaw 0, `standing` ticks run at rest.
 */
async function page(standing = 30) {
  const fly = new FlyCamera(canvas());
  const walk = new WalkMode(fly);
  walk.setGround(packGround(PARAMS, [FLOOR], OWNERS), [0, 0, 0]);
  fly.setPose({ x: FEET[0], y: 40, z: FEET[2], yaw: 0, pitch: 0 });
  fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
  const socket = fakeSocket();
  const client = new NetClient({ url: 'mem', map: 'MP1', name: 'A', socket: () => socket }, walk);
  open.push({ walk, client });
  await flush();
  socket.server({ type: 'welcome', id: ME, version: 0, map: 'MP1', tick: 0, role: 'player', team: 'seal', queue: 0 } as unknown as ServerEvent);
  socket.server({ type: 'spawn', id: ME, at: [...FEET], yaw: 0, after: 0 });
  const seen: Seen[] = [];
  const read = (): Seen => {
    const s = walk.snapshot()!;
    return { name: s.action?.name ?? 'none', walkDead: walk.isDead(), moverDead: s.dead === true, y: walk.feet()![1], airborne: s.airborne, t: s.action?.t ?? 0, seconds: s.action?.seconds ?? null };
  };
  /** `n` page frames at 60 Hz (one command each), each read after; `each` hears the frame's index. */
  const run = (n: number, each?: (i: number) => void): void => {
    for (let i = 0; i < n; i++) { walk.frame(1 / TICK_HZ); seen.push(read()); each?.(i); }
  };
  run(standing);
  seen.length = 0;
  /** The page's last command sent. */
  const sent = (): number => walk.nextCommand() - 1;
  /**
   * The room's order for an M67 blast death (`room.ts` 9176-9188): `blast` with its knock to the victim, laid after the
   * room's command `after`; the fragments' `hurt`; then `kill` broadcast -- cause 4 (blast), no clip (`deathClip('blast',
   * ..)` standing). Then what `netPage.ts` does for the own kill with no clip: `setDeathPose(null)` (netPage.ts 2223).
   */
  const blastDeath = (after: number): void => {
    socket.server({ type: 'blast', ring: { seconds: 5, volume: 0.35 }, knock: KNOCK, after } as unknown as ServerEvent);
    socket.server({ type: 'hurt', health: [0, 0, 0, 0, 0, 0], from: POINT, part: PART.BODY } as unknown as ServerEvent);
    socket.server({ type: 'kill', killer: KILLER, victim: ME, weapon: 'M67', how: 'weapon', cause: 4, clip: null } as unknown as ServerEvent);
    walk.setDeathPose(null);
  };
  return { walk, client, socket, seen, run, sent, blastDeath, read };
}

/** The run of action names, repeats dropped. */
const names = (seen: Seen[]): string[] => seen.map((s) => s.name).filter((n, i, a) => i === 0 || a[i - 1] !== n);

/**
 * The corpse stays down: dead on the walk and on the mover every tick; `fallBackwards` until it lands, then
 * `landBackwards` held at its last key; never a get-up, never no action (standing); on the floor at the end.
 */
function staysDown(seen: Seen[]): void {
  expect(seen.length).toBeGreaterThan(0);
  seen.forEach((s, i) => {
    expect(s.walkDead, `tick ${i}: the walk dead`).toBe(true);
    expect(s.moverDead, `tick ${i}: the mover dead (state 8)`).toBe(true);
    expect(['fallBackwards', 'landBackwards'], `tick ${i}: ${s.name}`).toContain(s.name);
  });
  expect(names(seen)).toEqual(['fallBackwards', 'landBackwards']);
  const landed = seen.findIndex((s) => s.name === 'landBackwards');
  expect(landed).toBeGreaterThan(0);
  expect(landed).toBeLessThan(60);                                // about 24 ticks in the air (`KNOCK`)
  const last = seen[seen.length - 1]!;
  expect(last.airborne).toBe(false);                              // hypothesis (a): it lands, not held in the air
  expect(last.y).toBeCloseTo(0, 3);                               // on the floor
  expect(last.t).toBeCloseTo(last.seconds!, 6);                   // the landing's last key, held
}

describe('LATER 1055: a knocked, killed own body stays down (synthetic, the page\'s own path)', () => {
  it("(i) the room's order -- the knock replayed from the room's command, then the kill with no clip: fallBackwards, landBackwards held, dead throughout, on the floor", async () => {
    const p = await page();
    expect(KNOCK.fall).toBe('fallBackwards');
    expect(KNOCK.velocity[1]).toBeCloseTo(46.2, 0);
    expect(p.read().name).toBe('none');                           // standing
    p.blastDeath(p.sent() - LEAD);                                // S behind the page: `replayKnock` (walk.ts 1916-1920)
    p.run(300);
    staysDown(p.seen);
  });

  it("(i') the same with the knock heard on the page's own last command (laid as the mover stands, no re-run)", async () => {
    const p = await page();
    p.blastDeath(p.sent());
    p.run(300);
    staysDown(p.seen);
  });

  it("(ii) candidate 1 through a refused turret take (`mountUntake`, matchActions.ts 384-385) heard after the death: the kill's setDeathPose(null) dropped the take, nothing re-runs, the corpse stays down", async () => {
    // The page took its turret at send time before command M (`WalkMode.mountTake(M)`: `takeKept.taps` M - 1); the room's
    // blast came from its command S < M - 1 (the page ahead), so the knock's re-run reaches back before the take and
    // `knockedAfter` (S) leaves M - 1 replayable (`canReplay`, walk.ts 293); then the kill; then the room's refusal of the
    // take (dead: `FUN_005463c0` D:L412134-412139). The re-run it would make from M - 1 (`mountUntake` -> `rerunFrom`)
    // starts from a kept state saved before the page heard the kill -- but by reading, `netPage.ts` 2223's
    // `setDeathPose(null)` at the kill clears `takeKept` (walk.ts 1086-1091, LATER 525), so the refusal finds no take and
    // re-runs nothing (`replayed` empty). Red on `replayed` means that reading is wrong and this entry is reachable.
    const p = await page();
    const m = p.sent() + 1;
    p.walk.mountTake(m);
    p.run(LEAD);
    const s = m - 1 - 4;                                          // the room's command at the blast: before the take's M - 1
    expect(s).toBeLessThan(m - 1);
    p.blastDeath(s);
    p.seen.length = 0;
    p.run(4);                                                     // the refusal heard a few ticks after the kill, still in the air
    const replayed: number[] = [];
    p.walk.mountUntake((after) => { replayed.push(after); p.client.replayed(after); });
    expect(replayed).toEqual([]);                                 // the take dropped at the death: no re-run from M - 1
    p.run(300);
    staysDown(p.seen);
  });

  it("(ii') RED candidate 1, the mechanism alone: any re-run after the death from a command between the knock's S and the page's kill -- the corpse stays down", async () => {
    // `rerunFrom` (walk.ts 352-461) called as the page's re-runs call it (the knock's own options: `relog`, `'redone'`), with
    // nothing laid between, from a command after the knock's S (so `canReplay` allows it) and before the page heard the
    // kill: its kept state (saved alive) is laid back by `Walker.restoreState` (mover.ts 2746-2753), `dead_` with it.
    const p = await page();
    const s = p.sent() - LEAD;
    p.blastDeath(s);
    p.run(4);
    const rerun = (p.walk as unknown as {
      rerunFrom(from: number, between: (w: unknown) => void, stopAfter: number | null, replayed: ((after: number) => void) | undefined,
        told: 'undone' | 'redone', opts?: { held?: boolean; relog?: boolean }): boolean;
    }).rerunFrom.bind(p.walk);
    expect(rerun(s + 2, () => undefined, null, undefined, 'redone', { relog: true })).toBe(true);
    p.run(300);
    staysDown(p.seen);
  });

  it("LATER 1055 (iv): the room's dead, airborne snapshot of the page's own seat with stance stand stands nothing on the page", async () => {
    // The replay's decode (LATER 1055's evidence, `decode1055.out.txt`, the round's five M67 kills): the room's stored body
    // of the victim is dead and airborne from the tick after the kill -- one kill in `fallBackwards`, four in
    // `fallForward` -- and lands 18-29 ticks on in `landBackwards` / `landDeath` (the first kill, built here: serial 3
    // then 4, 0.336 s, then held at its end), and its
    // STANCE field reads `stand` (code 0) throughout. That list is what the room stores (`room.ts` 11147, the recorder) and
    // hands a spectator's connection; a seat's own connection gets it through `recipientBodies` (`room.ts` 11161), which
    // drops the seat's own body (`room.ts` 2526), and `own` null while the seat is dead (`room.ts` 11153-11157: `p.alive`).
    // So the page's own seat's room body never reaches its NetClient: no `reconcile` (`net/client.ts` 735, `own` null),
    // no entry in `bodies()` (`net/client.ts` 1282-1309) for `netPage.ts` 1906's `RemotePlayers.frame` to draw (it draws
    // every listed id, `remotePlayers.ts` 1246-1250, no own-seat filter) or 2228-2231's death camera to read. The page
    // draws its own body from `walk.snapshot()` alone (`walk.ts` 2479-2493, `play.ts` 824). Fed here every room snapshot
    // (`SNAPSHOT_HZ`) from the kill through the landing and 200 ticks beyond, built by the room's own per-recipient pass and
    // the wire's own encoder, through the socket as a real one comes.
    const p = await page();
    p.blastDeath(p.sent() - LEAD);                                // case (i)'s knock and kill
    const KILL_TICK = 37423;                                      // the decode's first kill's room tick (any rising tick serves)
    const LAND_AFTER = 22;                                        // the decode's first kill: `landBackwards` 22 ticks on
    const LAND_SECONDS = 0.336;                                   // the decode's `landBackwards` length
    const code = (name: (typeof ACTION_CODES)[number]): number => ACTION_CODES.indexOf(name) + 1;
    const base = (id: number, feet: [number, number, number]): BodyState => ({
      id, feet, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: BodyFlag.Alive, stance: STANCE_CODES.indexOf('stand'), landing: 0, jumps: 0,
      ground: 0, groundForward: 0, groundRight: 0, groundCls: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
      overlay: 0, overlayT: 0, overlaySeconds: -1, turnRate: 0, trav: 0, travFrame: 0, travRootY: NaN, travBlend: 0, travBlendWeight: 0,
      peek: 0, weapon: 62, slot: 0,
    });
    /** The room's stored body of the page's own seat `k` ticks after the kill, as the decode shows it. */
    const ownRoomBody = (k: number): BodyState => {
      const air = k < LAND_AFTER, f = p.walk.feet()!;
      return {
        ...base(ME, [f[0], f[1], f[2]]),
        flags: air ? BodyFlag.Airborne : 0,                       // dead (no `Alive`), airborne until it lands
        stance: STANCE_CODES.indexOf('stand'),                    // `stand` throughout
        action: code(air ? 'fallBackwards' : 'landBackwards'), actionSerial: air ? 3 : 4,
        actionT: air ? k / TICK_HZ : Math.min(LAND_SECONDS, (k - LAND_AFTER) / TICK_HZ), actionSeconds: air ? -1 : LAND_SECONDS,
      };
    };
    const killer = base(KILLER, [FEET[0], 0, FEET[2] - 400]);
    const step = TICK_HZ / SNAPSHOT_HZ;
    const total = LAND_AFTER + 200 + 60;
    let fed = 0;
    p.seen.length = 0;
    p.run(total, (i) => {
      const k = i + 1;
      if (k % step !== 0) return;
      const mine = ownRoomBody(k);
      expect(snapshotOf(mine).stance).toBe('stand');              // the decode's field, as a remote copy would read it
      expect(snapshotOf(mine).alive).toBe(false);
      const list = [mine, killer];                                // the room's stored list (`room.ts` 11131-11135)
      const bodies = recipientBodies(list, ME, () => 0, bodyVariants(), null);
      expect(bodies.map((b) => b.id)).toEqual([KILLER]);          // the room's pass drops the recipient's own body
      p.socket.onmessage?.({ data: encodeSnapshot({ tick: KILL_TICK + k, own: null, bodies }) });
      fed++;
      const shown = p.client.bodies();
      expect(shown.some((b) => b.id === ME), `tick ${k}: the own seat among the drawn bodies`).toBe(false);
      expect(shown.some((b) => b.id === KILLER), `tick ${k}: the killer's body drawn`).toBe(true);
    });
    expect(fed).toBe(Math.floor(total / step));
    staysDown(p.seen);
    const landed = p.seen.findIndex((s) => s.name === 'landBackwards');
    expect(p.seen.length - landed).toBeGreaterThanOrEqual(200);   // through the landing and 200 ticks beyond
    for (let i = 0; i < p.seen.length; i++) expect(p.seen[i]!.name, `tick ${i}: the page's own drawn body`).not.toBe('none');
  });
});

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const HAVE = !!(MP2 && PACK && READERC);

describe.skipIf(!HAVE)(`LATER 1055: the own body drawn from the held landing lies down${HAVE ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /**
   * (iii) Hypothesis (b): the page's own body is drawn by `Play.bodyFrame` stepping its `Animator` with the walk's
   * snapshot (`play.ts` 813-826: `this.animator.step(dt, mover)`). Here the same animator (the page's, over the disc's
   * clips: `PLAY_CLIPS` from `MOTION_P.ZAR`, the motion table from `READERC.ZAR`, Frostfire's SEAL 1 skeleton as
   * `deathPoses.test.ts` reads them) is stepped each tick with `walk.snapshot()` through case (i)'s death; the skeleton
   * root's height over the feet (`skel_root`'s world y; `ROOT_HEIGHT.stand` 11.48 standing, `deathPoses.test.ts` pins
   * `seal_landbackwards01`'s own last key at about 1) must fall to under half of its standing height once the landing
   * is held, and stay there.
   */
  const fresh = () => {
    const sk = simSkeletonsFromBytes(MP2!, READERC!, PACK!).seal[0]!.skeleton;
    const anim = new Animator(sk, clipsFromPack(PACK!, PLAY_CLIPS), motionTableFromArchive(READERC!));
    expect(anim.motion(SEAL_ANIMS.landBackwards), SEAL_ANIMS.landBackwards).toBeDefined();
    return { sk, anim, root: sk.indexOf('skel_root') };
  };

  it("(iii) the drawn root lies near the floor while landBackwards is held (the room's order, case (i))", async () => {
    const { sk, anim, root } = fresh();
    const p = await page(0);
    const draw = (): number => { anim.step(1 / TICK_HZ, p.walk.snapshot()!); return sk.world[root]![13]!; };
    let standing = 0;
    p.run(60, () => { standing = draw(); });
    expect(standing).toBeGreaterThan(8);                          // the standing root (the measure is sound)
    p.seen.length = 0;
    p.blastDeath(p.sent() - LEAD);
    const heights: number[] = [];
    p.run(300, () => { heights.push(draw()); });
    staysDown(p.seen);
    const held = p.seen.findIndex((s) => s.name === 'landBackwards' && s.t >= s.seconds! - 1e-6);
    expect(held).toBeGreaterThan(0);
    for (let i = held + 10; i < heights.length; i++) expect(heights[i], `tick ${i}: the drawn root`).toBeLessThan(standing / 2);
  });
});
