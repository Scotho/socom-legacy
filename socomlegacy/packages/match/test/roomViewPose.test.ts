import { describe, expect, it } from 'vitest';
import { Button, type Command } from '../../viewer/src/sim';
import { clipsFromPack, motionTableFromArchive } from '../../viewer/src/motionTable';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { CROUCH_WALK, hitPoseRoom, PAGE_CLIPS } from './helpers/hitPoseRoom';

/**
 * PV-2p (the player's-view lane, the pose proof for PV-2; product track: a test, no claim about the original): the room
 * stores each seat's relayed `view`, `swayX`, `swayY` (`../src/room.ts`, the command intake beside `p.raised`) and puts
 * them in the body's tail (`Room.body`), which also feeds the hit poser (`Room.hitPose` -> `HitPoser.stepBody`). Nothing the
 * room simulates may read them: `roomViewWire.test.ts` proves it on rooms with no skeletons (no posers); this file proves
 * it with LIVE posers (`./helpers/hitPoseRoom`, the SEAL's skeleton with its motion; the fixture disc's MP2,
 * `MOTION_P.ZAR`, `READERC.ZAR`). Two rooms run the same script, one with both seats' tails forged on every command
 * from the first; every tick both seats' posed boxes, B's aim root and two rounds through the room's rewind are equal
 * value for value, and a round at the end gives both seats the same events. A third room, its B's stick changed (not
 * its tail), must pose differently, so the comparison cannot pass vacuously. Unit-test evidence only.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');

/** B's forged tail: the deepest view, the sway past the wire's i8 range both ways (clamped to +-127 steps of 0.5 px). */
const FORGED_B: Partial<Command> = { view: 12, swayX: 127, swayY: -128 };
/** A's forged tail: a mid view, a sway in range (-80 steps) and one on a half step (40.5 steps, rounded to 41). */
const FORGED_A: Partial<Command> = { view: 5, swayX: -40, swayY: 20.25 };

type Room = ReturnType<typeof hitPoseRoom>;
type Seat = { poser: { pose: { boxes(): unknown } } | null; view: number; swayX: number; swayY: number };
type Rooms = { aimRootOf(p: unknown): number | null; body(p: unknown): { view?: number; swayX?: number; swayY?: number } };

/** One script step: a tick's action. */
type Op = { stick?: number; press?: 'stand' | 'crouch'; jump?: true };
/** stand, crouch, crouch-walk, stand, run, then a crouched standing jump (`jumpAimRoot.test.ts`'s), `walk` B's crouch-walk stick. */
function script(walk: number): Op[] {
  const idle = (n: number): Op[] => Array.from({ length: n }, () => ({}));
  return [
    ...idle(30),
    { press: 'crouch' }, ...idle(40),
    { stick: walk }, ...idle(40),
    { stick: 0 }, { press: 'stand' }, ...idle(30),
    { stick: 1 }, ...idle(40),
    { stick: 0 }, ...idle(30),
    { press: 'crouch' }, ...idle(60),
    { jump: true }, ...idle(45),
  ];
}

describe.skipIf(!MP2 || !PACK || !READERC)(`PV-2p: the relayed view and sway change no pose of the room's${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, PAGE_CLIPS) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const seal = (): SimSkeleton => skeletons.seal[0]!;

  const seat = (t: Room, id: number): Seat => t.room.player(id)! as unknown as Seat;
  const boxes = (t: Room, id: number): unknown => {
    const p = seat(t, id);
    expect(p.poser, `seat ${id}'s poser`).not.toBeNull();             // live posers: the point of this file
    return p.poser!.pose.boxes();
  };
  const aimRoot = (t: Room, id: number): number | null => (t.room as unknown as Rooms).aimRootOf(t.room.player(id)!);
  /** One tick of the script (the jump's tick asserts the jump started, the stance kept). */
  const step = (t: Room, op: Op): void => {
    if (op.stick !== undefined) t.stick(op.stick);
    if (op.press) t.press(op.press);
    else if (op.jump) {
      t.run(1, { buttons: Button.Jump });
      expect(t.room.player(2)!.sim.walker.action?.name).toBe('jump');
      expect(t.room.player(2)!.sim.walker.posture).toBe('crouch');
    } else t.run(1);
  };

  it('forged tails on both seats: every tick both posed boxes, B\'s aim root and the rewind\'s parts are equal; a round\'s events too', () => {
    const plain = hitPoseRoom(seal(), clips, table);
    const forged = hitPoseRoom(seal(), clips, table, { held: { 1: FORGED_A, 2: FORGED_B } });
    // the forged values reach the seat through the room's command intake, under the codec's rules (`viewState`, `qSway`)
    for (const [id, view, swayX, swayY] of [[2, 12, 63.5, -63.5], [1, 5, -40, 20.5]] as const) {
      const p = seat(forged, id), q = seat(plain, id);
      expect([p.view, p.swayX, p.swayY], `forged seat ${id}`).toEqual([view, swayX, swayY]);
      expect([q.view, q.swayX, q.swayY], `plain seat ${id}`).toEqual([0, 0, 0]);
      expect((forged.room as unknown as Rooms).body(forged.room.player(id)!)).toMatchObject({ view, swayX, swayY });  // the poser's input
    }
    const ops = script(CROUCH_WALK);
    let roots = 0;
    for (let tick = -1; tick < ops.length; tick++) {
      if (tick >= 0) { step(plain, ops[tick]!); step(forged, ops[tick]!); }
      const at = `tick ${tick} (${plain.clip()})`;
      expect(forged.clip(), at).toBe(plain.clip());
      expect(boxes(forged, 2), `B's boxes, ${at}`).toEqual(boxes(plain, 2));
      expect(boxes(forged, 1), `A's boxes, ${at}`).toEqual(boxes(plain, 1));
      const root = aimRoot(plain, 2);
      if (root !== null) roots++;
      expect(aimRoot(forged, 2), `B's aim root, ${at}`).toBe(root);
      expect(aimRoot(forged, 1), `A's aim root, ${at}`).toBe(aimRoot(plain, 1));
      expect(forged.part(forged.drawn('head'), 'front'), `head, front, ${at}`).toBe(plain.part(plain.drawn('head'), 'front'));
      expect(forged.part(forged.drawn('spinehi'), 'side'), `chest, side, ${at}`).toBe(plain.part(plain.drawn('spinehi'), 'side'));
      expect(seat(forged, 2).view, at).toBe(12);                         // the tail held all the way
    }
    expect(roots, 'ticks with a posed aim root').toBeGreaterThan(0);
    const before = [plain.events(1).length, plain.events(2).length];
    plain.shoot(plain.drawn('spinehi'));
    forged.shoot(forged.drawn('spinehi'));
    expect(plain.events(1).length + plain.events(2).length, 'the round sent events').toBeGreaterThan(before[0]! + before[1]!);
    expect(forged.events(1), 'A\'s events').toEqual(plain.events(1));
    expect(forged.events(2), 'B\'s events').toEqual(plain.events(2));
    console.log(`PV-2p: ${ops.length + 1} ticks compared, ${roots} with a posed aim root; events A ${plain.events(1).length}, B ${plain.events(2).length}`);
  });

  it('the negative control: B\'s stick changed (not its tail), the posed boxes differ', () => {
    const plain = hitPoseRoom(seal(), clips, table);
    const other = hitPoseRoom(seal(), clips, table);
    const a = script(CROUCH_WALK), b = script(1);                      // B runs where it crouch-walked
    expect(b.length).toBe(a.length);
    let differ = 0, rootsDiffer = 0;
    for (let tick = 0; tick < a.length; tick++) {
      if (a[tick]!.jump) break;                                        // a running body does not jump from a crouch
      step(plain, a[tick]!); step(other, b[tick]!);
      if (JSON.stringify(boxes(other, 2)) !== JSON.stringify(boxes(plain, 2))) differ++;
      if (aimRoot(other, 2) !== aimRoot(plain, 2)) rootsDiffer++;
    }
    console.log(`PV-2p control: B's boxes differed on ${differ} ticks, its aim root on ${rootsDiffer}`);
    expect(differ).toBeGreaterThan(0);
  });
});
