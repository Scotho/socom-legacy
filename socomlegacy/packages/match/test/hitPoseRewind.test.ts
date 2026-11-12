import { describe, expect, it } from 'vitest';
import { PART } from '../../viewer/src/net/damage';
import { clipsFromPack, motionTableFromArchive } from '../../viewer/src/motionTable';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { CROUCH_WALK, hitPoseRoom, PAGE_CLIPS } from './helpers/hitPoseRoom';

/**
 * HIT-POSE (owner priority; research 217 s3.6; reading, pending review): the room judges a round against the body as it
 * was posed at the round's tick -- the live skeleton the original's round meets (`FUN_005abbc0` D:L464672-464803, its
 * nodes bound in `FUN_00553ea0` D:L419606-419652) -- not its stance's idle key. The page that shot drew the body playing
 * its locomotion (the remote copy's `Animator` on the same `PlaySnapshot` the room builds from its `Walker`,
 * `../../viewer/src/net/body.ts`); this file's "page" is that animator, headless, on its own instance of the SEAL's
 * skeleton, stepped once a room tick on the room's snapshot of the body (the fixture disc's MP2, `MOTION_P.ZAR`,
 * `READERC.ZAR`). Rounds are cast through the room's rewind (`rewoundBodies`, the round's and NCW-1's twin's one read).
 * Before HIT-POSE the room hit a crouch-walker 2.8-3.0 u under his drawn head and a runner 1.6-2.0 u above and 2.4-2.9 u
 * behind his. Unit-test evidence only.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');

describe.skipIf(!MP2 || !PACK || !READERC)(`HIT-POSE: the room's round meets the body as the page drew it${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, PAGE_CLIPS) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const seal = (): SimSkeleton => skeletons.seal[0]!;
  const name = (p: number | null): string => (p === null ? 'MISS' : Object.keys(PART).find((k) => PART[k as keyof typeof PART] === p) ?? String(p));

  it('crouch-walking: a round through the drawn head is HEAD from the front and the side; one at the drawn chest is not HEAD', () => {
    const t = hitPoseRoom(seal(), clips, table);
    t.press('crouch');
    t.run(40);
    t.stick(CROUCH_WALK);
    t.run(40);
    expect(t.clip()).toMatch(/crouch/);
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) {
      t.run(1);
      const head = t.drawn('head'), chest = t.drawn('spinehi');
      seen.push(`${t.clip()} ${name(t.part(head, 'front'))}/${name(t.part(head, 'side'))}/${name(t.part(chest, 'front'))}`);
      expect(t.part(head, 'front'), `head, front, tick ${i}: ${seen.at(-1)}`).toBe(PART.HEAD);
      expect(t.part(head, 'side'), `head, side, tick ${i}: ${seen.at(-1)}`).toBe(PART.HEAD);
      expect(t.part(chest, 'front'), `chest, front, tick ${i}: ${seen.at(-1)}`).not.toBe(PART.HEAD);
    }
    console.log(`HIT-POSE crouch-walk: ${seen.slice(0, 5).join('; ')}`);
  });

  it('running: a round through the drawn head is HEAD from the front and the side', () => {
    const t = hitPoseRoom(seal(), clips, table);
    t.stick(1);
    t.run(40);
    expect(t.clip()).toMatch(/run/);
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) {
      t.run(1);
      const head = t.drawn('head');
      seen.push(`${t.clip()} ${name(t.part(head, 'front'))}/${name(t.part(head, 'side'))}`);
      expect(t.part(head, 'front'), `head, front, tick ${i}: ${seen.at(-1)}`).toBe(PART.HEAD);
      expect(t.part(head, 'side'), `head, side, tick ${i}: ${seen.at(-1)}`).toBe(PART.HEAD);
    }
    console.log(`HIT-POSE run: ${seen.slice(0, 5).join('; ')}`);
  });

  it('the rewind: a round named at a past tick meets that tick\'s pose (crouch-walking then, standing still now), never the present one', () => {
    const t = hitPoseRoom(seal(), clips, table);
    t.press('crouch');
    t.run(40);
    t.stick(CROUCH_WALK);
    t.run(50);
    expect(t.clip()).toMatch(/crouch/);
    const then = t.room.tick, headThen = t.drawn('head');
    t.stick(0);
    t.press('stand');
    t.run(40);
    const now = t.room.tick, headNow = t.drawn('head');
    expect(now - then).toBe(41);
    console.log(`HIT-POSE rewind: head then ${headThen.map((x) => x.toFixed(2)).join(', ')}, now ${headNow.map((x) => x.toFixed(2)).join(', ')}`);
    expect(t.part(headThen, 'front', then)).toBe(PART.HEAD);
    expect(t.part(headThen, 'side', then)).toBe(PART.HEAD);
    expect(t.part(headThen, 'front', now)).not.toBe(PART.HEAD);
    expect(t.part(headNow, 'front', now)).toBe(PART.HEAD);
    expect(t.part(headNow, 'front', then)).not.toBe(PART.HEAD);
  });
});
