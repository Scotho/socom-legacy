import { describe, expect, it } from 'vitest';
import type { WeaponRecord } from '@s2u/scene';
import { Button } from '../../viewer/src/sim';
import { clipsFromPack, motionTableFromArchive } from '../../viewer/src/motionTable';
import { actionRoots } from '../../viewer/src/mover';
import { reloadMoving } from '../../viewer/src/reloadClip';
import { Accuracy, airBloomFeed, TICK } from '../../viewer/src/accuracy';
import { simSkeletonsFromBytes } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { hitPoseRoom, PAGE_CLIPS } from './helpers/hitPoseRoom';

/**
 * AS-34 (reading, pending review; the coordinator's decision, 2026-11-24): the room's cone ticks the kit as the page's does,
 * so the standing jump's rise (`STANDING_JUMP_RISE_READING`: the `seal_jump` root's y velocity, `Walker.carriedAir`) reaches
 * the room's aim frame too. Without it the room's bloom stays at TargetMin through the jump while the page's opens toward
 * 29.61^2 / 65 = 13.49 (IQ-158 B13-BLOOM-PC2), and the room would refuse an honest round claimed at the page's cone.
 * The room's walker gets its roots as a production room does (`Room.newSim`: `this.clips.roots`); the helper's room has none,
 * so the test lays the disc's `seal_jump` roots on B's walker.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');

describe.skipIf(!MP2 || !PACK || !READERC)(`AS-34: the room's cone sees the standing jump's rise${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("a standing jump: the room's bloom target follows the page's, tick for tick, to IQ-158's 13.49", () => {
    const skeletons = simSkeletonsFromBytes(MP2!, READERC!, PACK!);
    const clips = clipsFromPack(PACK!, PAGE_CLIPS), table = motionTableFromArchive(READERC!);
    const t = hitPoseRoom(skeletons.seal[0]!, clips, table);
    const b = () => t.room.player(2)!;
    b().sim.walker.actionRoots = actionRoots(clipsFromPack(PACK!, ['seal_jump']));
    t.run(60);
    expect(b().sim.walker.action).toBeNull();
    // The match room's Player carries `records` and `weapon` (room.ts:2282, :2497) outside the type `room.player()`
    // returns here (typecheck only; the same object).
    const seat = b() as unknown as { records: readonly WeaponRecord[]; weapon: 0 | 1 };
    const record = seat.records[seat.weapon]!;                         // the cone's record on foot (`Room` `setWeapon`)
    const page = new Accuracy(record);                                 // the page's kit on the room's record
    const row = record.stances.stand;
    t.run(1, { buttons: Button.Jump });
    expect(b().sim.walker.action?.name).toBe('jump');
    let peakRoom = 0, worst = 0;
    for (let i = 0; i < 40 && b().sim.walker.action?.name === 'jump'; i++) {
      const w = b().sim.walker;
      page.update(TICK, { stance: 'stand', airborne: w.airborne, yawRate: 0, pitchRate: 0, zoomState: 0, ...airBloomFeed(w.state, w.carriedAir) });
      const room = b().cone.state().target;
      peakRoom = Math.max(peakRoom, room);
      worst = Math.max(worst, Math.abs(room - page.state().target));
      t.run(1);
    }
    expect(row.dilateMoveMult).toBe(1);
    expect(peakRoom, 'the room\'s peak target (was TargetMin: no rise)').toBeCloseTo(13.49, 1);
    expect(worst, 'the room\'s target against the page\'s, each tick').toBeLessThan(1e-6);
  });

  it("the rise reaches the cone's bloom only: the aim frame's velocity, the reload's moving pick, stay the mover's", () => {
    // The fresh review's F2: the frame's `velocity` is read by the room's reload pick (`reloadMoving`), the after-shot pick
    // and the pickup's speed gate, which the page takes from the mover (vy 0 on the floor). The rise rides its own field.
    const skeletons = simSkeletonsFromBytes(MP2!, READERC!, PACK!);
    const clips = clipsFromPack(PACK!, PAGE_CLIPS), table = motionTableFromArchive(READERC!);
    const t = hitPoseRoom(skeletons.seal[0]!, clips, table);
    const b = () => t.room.player(2)!;
    b().sim.walker.actionRoots = actionRoots(clipsFromPack(PACK!, ['seal_jump']));
    t.run(60);
    t.run(1, { buttons: Button.Jump });
    let risen = 0, checked = 0;
    for (let i = 0; i < 40 && b().sim.walker.action?.name === 'jump'; i++) {
      const w = b().sim.walker, s = w.state, f = b().cone.frame(b().sim.seq)!;
      if (Math.abs(w.carriedAir.rise) > 5) risen++;
      expect(f.velocity).toEqual([s.vx, s.vy, s.vz]);
      expect(reloadMoving(f.velocity[0], f.velocity[1], f.velocity[2])).toBe(reloadMoving(s.vx, s.vy, s.vz));
      checked++;
      t.run(1);
    }
    expect(checked).toBeGreaterThan(10);
    expect(risen, 'frames of the jump with a real rise').toBeGreaterThan(3);
  });
});
