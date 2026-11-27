import { describe, expect, it } from 'vitest';
import { Skeleton, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { INTERP_DELAY_MS, SNAPSHOT_HZ, type BodyState, type Snapshot } from '../../viewer/src/net/protocol';
import { Animator } from '../../viewer/src/animator';
import { bodyOf, snapshotOf } from '../../viewer/src/net/body';
import { decodeSnapshot, encodeSnapshot } from '../../viewer/src/net/codec';
import { NetClient } from '../../viewer/src/net/client';
import type { HitPoser } from '../../viewer/src/net/hitPose';
import { bodyPointToWorld, placedVolumes, posedBoxes, rayRecords, type BoneBox, type V3 } from '../../viewer/src/net/hitVolumes';
import { clipsFromPack, motionTableFromArchive } from '../../viewer/src/motionTable';
import { simClipsFromBytes, simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import type { Traversal } from '../../viewer/src/traversal';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { Room, type Conn } from '../src/room';
import { solidWalls } from './helpers/solidWalls';
import { EXTRAS, PAGE_CLIPS } from './helpers/hitPoseRoom';

/**
 * WM-CLIMB-RED (R149; LATER 891; written as a RED on agent/wm-climb-red 694daeea2c, cured on agent/bodies-891: the room's
 * `drawnPastOf`, research 217 s3.6d -- the moving climb 0.577 -> 0.150 u; the stall case added by the cure's review, F1).
 * The report: "hit box off or missing while hanging from a climbing object".
 *
 * What it measures: a body climbing a ladder, as the shooter's page draws it at a render moment between two snapshots,
 * against the same body as the room rewinds it to that moment -- the chest bone's box centre (`spinehi`, the bone
 * `./hitPoseRewind.test.ts` names as the chest) in the world on each side, and a level ray aimed from behind the climber
 * at the page's drawn chest: the first bone it records on the page's copy and in the room's rewind.
 *
 * - The page (source inspection, base c890d1d25b): `NetClient.bodies` -> `drawnAt` -> `bodiesAt`
 *   (`../../viewer/src/net/client.ts` :1241-1249, :1282-1307) lerps the feet, yaw and pitch between the two snapshots
 *   around the view tick and takes every other field from the NEWER one -- the traversal pose (`trav`, `travFrame`,
 *   `travRootY`) included. The copy's `Animator` poses a traversal move purely at the snapshot's key and root height
 *   (`../../viewer/src/animator.ts` `traversalStep` :917-947). Here the page is a real `NetClient`'s `bodies(now)` and
 *   `drawnAt` (the instance made with `Object.create(NetClient.prototype)`: its snapshot list fed the room's snapshots
 *   at `SNAPSHOT_HZ`, encoded and decoded as the wire carries them, and its clock (`viewTick`) stubbed to the room's
 *   tick less `INTERP_DELAY_MS` plus half a tick); the drawn copy is the page's `Animator`, headless, on its own
 *   instance of the SEAL's skeleton, stepped once a room tick on that list's body (as `./helpers/hitPoseRoom.ts`'s page).
 * - The room: its own code end to end -- a real `Room` whose seat climbs the ladder through its commands and its own
 *   `Traversal` (the CLIMB offer taken with `Traversal.action`, as `./botLadder.test.ts` does); each tick the room's
 *   `remember` / `hitPose` (`../src/room.ts` :5411-5420, :5432-5440) step the seat's `HitPoser` on the tick's body and
 *   keep the pose; a round's rewind read `pastOf` (the entry at or before the tick, its pose and yaw, the feet alone
 *   lerped toward the next entry) -- since LATER 891's cure `drawnPastOf` (the page's own snapshot pair) -- through `rewoundBodies` (:6373-6404), both called here as the room calls
 *   them (`past`, `rewoundBodies`, private, reached by a cast). The poser is the page's `Animator` on the room's
 *   snapshot (`../../viewer/src/net/hitPose.ts` `HIT_POSE_CLIPS` :53, `HitPoser.step` :232-242).
 * - So, by LATER 891's reading (docs/LATER.md row 891, read from source, not measured), on a moving climb the page
 *   draws the newer snapshot's clip key while the room judges the earlier tick's: the drawn torso can sit off the judged
 *   one. The round meeting the live skeleton as posed is research 217 s3.6 (the citations `../../viewer/src/net/hitPose.ts`'s
 *   header carries); this file reads no decompilation of its own.
 *
 * Evidence kind: unit test, on the committed fixture disc data (`test-fixtures/RUN/MP2.ZDB`, `MOTION_P.ZAR`,
 * `READERC.ZAR`: the SEAL's skeleton, its motion and the sim's clips -- not `SOCOM_DISC`, absent on the authoring host)
 * and a synthetic hull: research 86's ladder (`./botLadder.test.ts`'s `ladderRoom`, `viewer/test/traversal.test.ts`'s:
 * a 40-high wall at z 0, the deck behind at 40, the rungs 6 wide). No capture. Expected (since the cure): the moving climb,
 * the stall (the page holding its newest snapshot) and the still hold all GREEN; before it the moving climb and the stall
 * were RED (0.577 u and 0.660 u).
 * Skipped without the fixtures (said, never a pass).
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const noData = !MP2 || !PACK || !READERC;

/** The test's tolerance on the chest's place (units): the wire's feet step (1/8 a axis) and float32 keys, with room. */
const CHEST_TOLERANCE = 0.25;
/** The page's snapshot stride in room ticks, and its draw delay in room ticks (`SNAPSHOT_HZ`, `INTERP_DELAY_MS`). */
const STRIDE = TICK_HZ / SNAPSHOT_HZ;
const DELAY_TICKS = (INTERP_DELAY_MS / 1000) * TICK_HZ;
/** The render moment's fraction past a whole tick: between ticks, so the room's `pastOf` lerps the feet too. */
const RENDER_FRACTION = 0.5;

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3);
const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
  side, index, position: [x, 0, z], onFloor: true, step: 0, facing: [0, -1], loc: { map: 0, x: 0, z: 0 } });

/** `./botLadder.test.ts`'s ladder hull (research 86): the floor in front at 0, the deck behind at 40, the ladder on the wall. */
function ladderMap(): SimMap {
  const polys = solidWalls([
    floor(-1200, 0, 1200, 1200, 0),
    floor(-1200, -1200, 1200, 0, 40),
    quad([-1200, 0, 0, 1200, 0, 0, 1200, 40, 0, -1200, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ]);
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 400, cellsX: 6, cellsZ: 6, originX: -1200, originZ: -1200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const ground = packGround(params, polys, owners);
  return { stem: 'MP99', name: 'LADDER', ground, grid: groundGrid(ground), spawns: null, notes: [], respawns: [],
    slots: [slot(0, 0, -200, 600), slot(0, 1, -150, 600), slot(1, 0, 200, 600), slot(1, 1, 150, 600)] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}
const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');

/** The page's client as `bodies(now)` reads it: the received snapshots, the command-clock switch, the spawn marks, the clock. */
interface PageClient {
  snaps: { snap: Snapshot; at: number }[];
  cmdDrawn: boolean;
  spawnMarks: Map<number, unknown>;
  viewTick(now?: number): number;
  bodies(now?: number): (BodyState & { spawns?: number })[];
  drawnAt(now: number): { t: number; newer: Snapshot; older: Snapshot | null } | null;
}
/** What the room's rewind reads of a seat at a tick (`Past`, `pastOf`). */
interface PastView { tick: number; feet: V3; yaw: number; alive: boolean; pose?: HitPoser; poseAt?: number }
type RoomReads = {
  past(q: unknown, tick: number): PastView | null;
  rewoundBodies(p: unknown, from: V3, dir: V3, reach: number, at: number): { distance: number; tag?: { id: number; part: number; bone: number } }[];
  feetOrigin: [number, number, number];
};

/** A box's centre in the body frame (x right, y up, z behind, the soles at 0): its eight corners' mean. */
function centre(b: BoneBox): V3 {
  const x = b.box, w = b.w;
  let cx = 0, cy = 0, cz = 0;
  for (let c = 0; c < 8; c++) {
    const p0 = c & 1 ? x[3]! : x[0]!, p1 = c & 2 ? x[4]! : x[1]!, p2 = c & 4 ? x[5]! : x[2]!;
    cx += (p0 * w[0]! + p1 * w[4]! + p2 * w[8]! + w[12]!) / 8;
    cy += (p0 * w[1]! + p1 * w[5]! + p2 * w[9]! + w[13]!) / 8;
    cz += (p0 * w[2]! + p1 * w[6]! + p2 * w[10]! + w[14]!) / 8;
  }
  return [cx, cy, cz];
}

/** One render moment compared: where each side has the chest, and the first bone a ray at the page's chest records on each. */
interface Sample {
  T: number; t: number; older: number | null; newer: number; frameOlder: number | null; frameNewer: number; feetY: number;
  pageChest: V3; roomChest: V3; off: number; pageBone: number | null; roomBone: number | null; roomBones: number[];
}

describe.skipIf(noData)(`WM-CLIMB-RED (R149, LATER 891): a climber's drawn chest against the room's rewound one${noData ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  let loaded: SimSkeleton | null = null;
  const seal = (): SimSkeleton => (loaded ??= simSkeletonsFromBytes(MP2!, READERC!, PACK!).seal[0]!);

  /** A room on the ladder hull, seat 2 the climber; the page (seat 1's) drawing seat 2; `tick(forward)` one room step. */
  function climbRoom() {
    const s = seal();
    let seed = 1;
    const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const room = new Room(ladderMap(), simClipsFromBytes(PACK!, READERC), { now: () => 0, random }, { seal: [s], terrorist: [s] });
    for (const i of [1, 2]) {
      room.hello(i, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${i}`, map: 'MP99', session: tok(i) }, `10.0.0.${i}`);
    }
    room.step();
    room.player(1)!.sim.walker.place(0, 20, 400);
    room.player(2)!.sim.walker.place(0, 20, 20);
    room.player(2)!.sim.allowSnap();
    const reads = room as unknown as RoomReads;
    const page = Object.assign(Object.create(NetClient.prototype) as object, { snaps: [], cmdDrawn: false, spawnMarks: new Map() }) as unknown as PageClient;
    const sk = s.skeleton, skeleton = new Skeleton(sk.model, sk.modelMatrix, sk.parts);
    const anim = new Animator(skeleton, clipsFromPack(PACK!, PAGE_CLIPS), motionTableFromArchive(READERC!), { random: () => 0 });
    let last: { T: number; t: number; drawn: NonNullable<ReturnType<PageClient['drawnAt']>>; body: BodyState } | null = null;
    /** LATER 891's review F1: a STALL -- no snapshot reaches the page; its view tick stops on the newest one it holds. */
    let stalled = false;

    /** After a room step: the snapshot (every `STRIDE` ticks), then the page's frame at its view tick, drawn on its copy. */
    const observe = (): void => {
      const T = room.tick, q = room.player(2)!;
      if (T % STRIDE === 0 && !stalled) {
        const frame = encodeSnapshot({ tick: T, own: null, bodies: [bodyOf(2, q.sim.body(), EXTRAS)] }, reads.feetOrigin);
        page.snaps.push({ snap: decodeSnapshot(frame), at: 0 });
        if (page.snaps.length > 64) page.snaps.shift();
      }
      last = null;
      if (!page.snaps.length) return;
      const newest = page.snaps.at(-1)!.snap.tick;
      const t = stalled ? Math.min(Math.max(0, T - DELAY_TICKS + RENDER_FRACTION), newest) : Math.max(0, T - DELAY_TICKS + RENDER_FRACTION);
      page.viewTick = () => t;
      const drawn = page.drawnAt(0), body = page.bodies(0).find((b) => b.id === 2);
      if (!drawn || !body) return;
      anim.step(1 / TICK_HZ, { ...snapshotOf(body), rootTilt: q.sim.walker.rootTilt.q });
      last = { T, t, drawn, body };
    };
    const tick = (forward: number): void => {
      for (const id of [1, 2]) {
        const p = room.player(id)!;
        const cmd: Command = { seq: p.sim.seq + 1, forward: id === 2 ? forward : 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
        room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      }
      room.step();
      observe();
    };
    const chestBone = sk.part('spinehi').index;

    /** The last page frame against the room's rewind to the same moment (the page's view tick). */
    const compare = (): Sample => {
      const o = last!, q = room.player(2)!;
      const past = reads.past(q, o.t);
      expect(past, `the room holds a past at ${o.t}`).not.toBeNull();
      const roomBoxes = past!.pose && past!.poseAt ? past!.pose.boxesAt(past!.poseAt) : null;
      expect(roomBoxes, `the room's past at ${o.t} is posed (HIT-POSE), not the idle set`).not.toBeNull();
      const pageBoxes = posedBoxes(skeleton);
      const pageBox = pageBoxes.find((b) => b.bone === chestBone), roomBox = roomBoxes!.find((b) => b.bone === chestBone);
      expect(pageBox && roomBox, 'both sides box the chest bone').toBeTruthy();
      const pageChest = bodyPointToWorld({ feet: o.body.feet, yaw: o.body.yaw }, centre(pageBox!));
      const roomChest = bodyPointToWorld({ feet: past!.feet, yaw: past!.yaw }, centre(roomBox!));
      // a level ray from behind the climber at the page's drawn chest (a shooter on the floor behind a climber)
      const r = (o.body.yaw * Math.PI) / 180, fwd: V3 = [-Math.sin(r), 0, -Math.cos(r)];
      const from: V3 = [pageChest[0] - fwd[0] * 40, pageChest[1], pageChest[2] - fwd[2] * 40];
      const pageHits: { t: number; bone: number }[] = [];
      rayRecords(from, fwd, 80, placedVolumes(o.body.feet, o.body.yaw, pageBoxes), (_part, t, bone) => pageHits.push({ t, bone }));
      pageHits.sort((a, b) => a.t - b.t);
      const roomBones = reads.rewoundBodies(room.player(1)!, from, fwd, 80, o.t).filter((h) => h.tag?.id === 2).map((h) => h.tag!.bone);
      return {
        T: o.T, t: o.t, older: o.drawn.older?.tick ?? null, newer: o.drawn.newer.tick,
        frameOlder: o.drawn.older?.bodies.find((b) => b.id === 2)?.travFrame ?? null,
        frameNewer: o.drawn.newer.bodies.find((b) => b.id === 2)!.travFrame, feetY: o.body.feet[1]!,
        pageChest, roomChest, off: Math.hypot(pageChest[0] - roomChest[0], pageChest[1] - roomChest[1], pageChest[2] - roomChest[2]),
        pageBone: pageHits[0]?.bone ?? null, roomBone: roomBones[0] ?? null, roomBones,
      };
    };
    const moves = (): Traversal => room.player(2)!.sim.moves as Traversal;
    return { room, tick, compare, moves, stall: (on: boolean) => { stalled = on; }, last: () => last, name: (n: number | null) => (n === null ? 'none' : sk.parts[n]!.name) };
  }

  /** On the rungs by the CLIMB offer (LC-1: the press), the seat's state 'ladder', its kinds by tick kept from here. */
  function mounted(r: ReturnType<typeof climbRoom>, kinds: Map<number, string>): void {
    const tick = (f: number): void => { r.tick(f); kinds.set(r.room.tick, r.moves().state().kind); };
    for (let i = 0; i < 30; i++) tick(0);
    expect(r.room.player(2)!.alive, 'the climber lives').toBe(true);
    for (let i = 0; i < 400 && r.moves().climbPrompt()?.kind !== 'ladder'; i++) tick(1);
    expect(r.moves().climbPrompt()?.kind, 'the CLIMB offer at the ladder').toBe('ladder');
    r.moves().action();
    tick(1);
    for (let i = 0; i < 400 && r.moves().state().kind !== 'ladder'; i++) tick(1);
    expect(r.moves().state().kind, 'on the rungs').toBe('ladder');
  }
  /** Whether every tick the render moment and its two snapshots span was on the rungs. */
  const onRungs = (kinds: Map<number, string>, s: { t: number; older: number | null; newer: number }): boolean => {
    if (s.older === null) return false;
    for (let k = Math.min(s.older, Math.floor(s.t)); k <= s.newer; k++) if (kinds.get(k) !== 'ladder') return false;
    return true;
  };
  const fmt = (v: V3): string => v.map((x) => x.toFixed(2)).join(',');

  it('moving up the ladder: the page\'s drawn chest is the room\'s rewound chest, and a ray at it records the same bone (LATER 891)', () => {
    const r = climbRoom(), kinds = new Map<number, string>();
    mounted(r, kinds);
    const samples: Sample[] = [];
    for (let i = 0; i < 1200 && r.room.player(2)!.sim.walker.state.y < 25; i++) {
      r.tick(1);
      kinds.set(r.room.tick, r.moves().state().kind);
      const o = r.last();
      if (!o || !o.drawn.older) continue;
      const peek = { t: o.t, older: o.drawn.older.tick, newer: o.drawn.newer.tick };
      if (onRungs(kinds, peek)) samples.push(r.compare());
    }
    // the harness's own checks: the climb happened, the clip advanced between the two snapshots
    expect(samples.length, 'render moments on the rungs').toBeGreaterThanOrEqual(20);
    expect(samples.some((s) => s.frameOlder !== null && s.frameOlder !== s.frameNewer), 'the traversal key advances between snapshots').toBe(true);
    expect(samples.at(-1)!.feetY - samples[0]!.feetY, 'the feet rose').toBeGreaterThan(5);
    const worst = samples.reduce((m, s) => (s.off > m.off ? s : m));
    const mismatched = samples.filter((s) => s.pageBone !== s.roomBone);
    console.log(`WM-CLIMB-RED moving: ${samples.length} moments; worst chest offset ${worst.off.toFixed(3)} u at T ${worst.T} (t ${worst.t}, snaps ${worst.older}/${worst.newer}, keys ${worst.frameOlder}/${worst.frameNewer}): page ${fmt(worst.pageChest)} room ${fmt(worst.roomChest)}; first bone differs at ${mismatched.length}, e.g. ${mismatched.slice(0, 4).map((s) => `T ${s.T} page ${r.name(s.pageBone)} room ${r.name(s.roomBone)}`).join('; ')}`);
    expect(samples.every((s) => s.pageBone !== null), 'the ray at the drawn chest meets the drawn body').toBe(true);
    expect(worst.off, `the drawn chest within ${CHEST_TOLERANCE} u of the judged one`).toBeLessThanOrEqual(CHEST_TOLERANCE);
    expect(mismatched.map((s) => `T ${s.T}: page ${r.name(s.pageBone)} room ${r.name(s.roomBone)}`)).toEqual([]);
  }, 300_000);

  it('a snapshot stall mid-climb: the page holds its newest snapshot whole (shown at its tick); the room judges that snapshot (the review F1)', () => {
    const r = climbRoom(), kinds = new Map<number, string>();
    mounted(r, kinds);
    for (let i = 0; i < 1200 && r.room.player(2)!.sim.walker.state.y < 12; i++) { r.tick(1); kinds.set(r.room.tick, r.moves().state().kind); }
    r.stall(true);                                                                 // the climber climbs on; the page hears nothing
    const samples: Sample[] = [];
    for (let i = 0; i < 24; i++) {
      r.tick(1);
      kinds.set(r.room.tick, r.moves().state().kind);
      const o = r.last();
      if (!o || o.drawn.older || o.t !== o.drawn.newer.tick || kinds.get(o.t) !== 'ladder') continue;
      samples.push(r.compare());
    }
    expect(samples.length, 'held moments on the rungs').toBeGreaterThanOrEqual(5);
    const worst = samples.reduce((m, s) => (s.off > m.off ? s : m));
    console.log(`WM-CLIMB-RED stall: ${samples.length} held moments at ${samples[0]!.t}; worst chest offset ${worst.off.toFixed(3)} u; first bones ${[...new Set(samples.map((s) => `${r.name(s.pageBone)}/${r.name(s.roomBone)}`))].join(', ')}`);
    expect(worst.off, `the held chest within ${CHEST_TOLERANCE} u of the judged one`).toBeLessThanOrEqual(CHEST_TOLERANCE);
    expect(samples.filter((s) => s.pageBone !== s.roomBone).map((s) => `T ${s.T}: page ${r.name(s.pageBone)} room ${r.name(s.roomBone)}`)).toEqual([]);
  }, 300_000);

  it('the present is the room’s own: a moment at the newest entry (a bot’s viewTick) is that entry, on an odd tick too', () => {
    // LATER 891's delta review F1: MatchBots fires with viewTick = the room's tick; `drawnPastOf` falls back to `pastOf`
    // there. Without the guard an odd tick would answer the last SNAPSHOT entry, a tick stale.
    const r = climbRoom(), kinds = new Map<number, string>();
    mounted(r, kinds);
    const reads = r.room as unknown as RoomReads;
    const history = (): { tick: number; feet: number[] }[] => (r.room.player(2) as unknown as { history: { tick: number; feet: number[] }[] }).history;
    let odd = 0;
    for (let i = 0; i < 40; i++) {
      r.tick(1);
      const newest = history().at(-1)!;
      expect(newest.tick, 'the step remembered the room tick').toBe(r.room.tick);
      const past = reads.past(r.room.player(2), r.room.tick)!;
      expect(past.feet, `tick ${r.room.tick}: the present is the newest entry`).toEqual(newest.feet);
      if (r.room.tick % 2 !== 0) odd++;
    }
    expect(odd, 'odd ticks met').toBeGreaterThan(10);
  }, 300_000);

  it('a still hold on the ladder (identical snapshots): the two agree (control, expected green)', () => {
    const r = climbRoom(), kinds = new Map<number, string>();
    mounted(r, kinds);
    for (let i = 0; i < 1200 && r.room.player(2)!.sim.walker.state.y < 15; i++) { r.tick(1); kinds.set(r.room.tick, r.moves().state().kind); }
    for (let i = 0; i < 40; i++) { r.tick(0); kinds.set(r.room.tick, r.moves().state().kind); }
    const samples: Sample[] = [];
    for (let i = 0; i < 30; i++) {
      r.tick(0);
      kinds.set(r.room.tick, r.moves().state().kind);
      const o = r.last();
      if (!o || !o.drawn.older) continue;
      const a = o.drawn.older.bodies.find((b) => b.id === 2), b = o.drawn.newer.bodies.find((x) => x.id === 2);
      const same = !!a && !!b && a.trav === b.trav && a.travFrame === b.travFrame && a.travRootY === b.travRootY
        && a.feet.every((v, k) => v === b.feet[k]) && a.yaw === b.yaw;
      if (same && onRungs(kinds, { t: o.t, older: o.drawn.older.tick, newer: o.drawn.newer.tick })) samples.push(r.compare());
    }
    expect(samples.length, 'still render moments on the rungs between identical snapshots').toBeGreaterThanOrEqual(10);
    const worst = samples.reduce((m, s) => (s.off > m.off ? s : m));
    console.log(`WM-CLIMB-RED still: ${samples.length} moments; worst chest offset ${worst.off.toFixed(3)} u; first bones ${[...new Set(samples.map((s) => `${r.name(s.pageBone)}/${r.name(s.roomBone)}`))].join(', ')}`);
    expect(samples.every((s) => s.pageBone !== null), 'the ray at the drawn chest meets the drawn body').toBe(true);
    expect(worst.off).toBeLessThanOrEqual(CHEST_TOLERANCE);
    expect(samples.filter((s) => s.pageBone !== s.roomBone).map((s) => `T ${s.T}: page ${r.name(s.pageBone)} room ${r.name(s.roomBone)}`)).toEqual([]);
  }, 300_000);
});
