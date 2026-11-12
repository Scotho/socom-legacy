import { describe, expect, it } from 'vitest';
import { arsenalOf, DEFAULT_RIFLE, HELD_SIDEARM, type Loadout, type WeaponRecord } from '@s2u/scene';
import { applyHit, freshHealth, PART } from '../../viewer/src/net/damage';
import { penetrate } from '../../viewer/src/accuracy';
import { clipsFromPack, motionTableFromArchive } from '../../viewer/src/motionTable';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import type { SimKits } from '../../viewer/src/sim';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { hitPoseRoom, PAGE_CLIPS } from './helpers/hitPoseRoom';
import { findRay, testBoxes, testRecords, type TestRay, type TestRecord, type V3 } from './helpers/boneRays';

/**
 * BONE-BOXES (owner ruling OT.R119; research 398 s0, s1, s7, s13; reading, pending review): one bullet across several
 * parts of one body. The original's hit volumes are the bones' boxes, one a bone (`FUN_0058b960` D:L447559-447593,
 * `FUN_0031aec0` D:L218167-218192); a line makes one record for each box it enters from outside, at its entry; the walk
 * takes them nearest first (`FUN_003c9b70` D:L319966-320014, strictly farther than the last, D:L319990), cuts the range at
 * each PERSON record (`FUN_003c8920` D:L319506-319517) and calls the victim's handler for each; the handler's part
 * routine damages a limb and goes on, and remembers the round after a head or trunk hit, so a later record on that body
 * is refused (`FUN_005ab850` D:L464597; `FUN_005abbc0` D:L464741-464757).
 *
 * Every case on real geometry: the SEAL's skeleton off the fixture disc (MP2, `MOTION_P.ZAR`, `READERC.ZAR`), B standing
 * still in the room (`./helpers/hitPoseRoom`), its posed boxes read off the page's own copy of B (A = B, 0 u: HIT-POSE),
 * placed and searched by the test's own transcription (`./helpers/boneRays`). A shot is the room's: A fires at B, and the
 * round's line at the rewind read is the case's ray (the room's own `rewoundBodies` called on it), so the records, the
 * walk, the memory and the damage are the room's. The round: research 398 s7's worked numbers -- D = 40 (2.86 x 14,
 * `quantiseHit`), P = 2, a fresh SEAL ([8, 30, 30, 50, 30, 30], armour [0, 25, 25, 25, 25, 25]): 20 through, 5 off the
 * armour. Unit-test evidence on fixture data; no capture.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const NONE = -1;
/** Research 398 s7's round: D = 40, P = 2. */
const D40: WeaponRecord = { ...DEFAULT_RIFLE, impactDamage: 2.86, damageModifier: 0, piercing: 2 };
const KIT = [D40.id, HELD_SIDEARM.id, 255, 255, 255] as unknown as Loadout;
const KITS: SimKits = {
  table: { arsenal: arsenalOf(['ZAMMO', [], 'ZWEAPON', []] as never), records: new Map([[D40.id, D40], [HELD_SIDEARM.id, HELD_SIDEARM]]), rounds: new Map(), throwables: new Map() },
  map: {
    valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'S', character: 's', loadout: KIT }], terrorist: [{ type: 'T', character: 't', loadout: KIT }] },
  },
} as unknown as SimKits;

type Surface = { distance: number; penetration: number; tag?: { id: number; part: number; bone?: number } };
const name = (p: number): string => (p < 0 ? 'none' : Object.keys(PART).find((k) => PART[k as keyof typeof PART] === p) ?? String(p));
const show = (r: readonly TestRecord[]): string => r.map((x) => `${x.bone}@${x.t.toFixed(2)}`).join(' ');

describe.skipIf(!MP2 || !PACK || !READERC)(`BONE-BOXES: one bullet across several parts of one body (research 398 s7)${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };
  const clips = PACK ? clipsFromPack(PACK, PAGE_CLIPS) : [];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const seal = (): SimSkeleton => skeletons.seal[0]!;

  /** A fresh room, B standing still; B's boxes as the page draws them now; A's round judged along `pick`'s ray. */
  const shot = (pick: (boxes: ReturnType<typeof testBoxes>, feet: V3, yaw: number) => TestRay | null) => {
    const t = hitPoseRoom(seal(), clips, table, { kits: KITS, combatReport: true });
    t.run(20);
    const b = t.room.player(2)!.sim.walker.state, feet: V3 = [b.x, b.y, b.z];
    const boxes = testBoxes(t.pageSkeleton()!, feet, b.yaw);
    const ray = pick(boxes, feet, b.yaw);
    expect(ray, 'a ray of the case on the posed boxes').not.toBeNull();
    // The round's line at the rewind read is the case's ray: the room's own read of the bodies along it.
    const R = t.room as unknown as { rewoundBodies: (p: unknown, from: V3, dir: V3, reach: number, at: number) => Surface[] };
    const own = R.rewoundBodies.bind(t.room);
    const reads: { reach: number; surfaces: Surface[] }[] = [];
    R.rewoundBodies = (p, _from, _dir, reach, at) => { const s = own(p, ray!.o, ray!.d, reach, at); reads.push({ reach, surfaces: s }); return s; };
    t.shoot([100, 12, 0]);
    delete (R as Partial<typeof R>).rewoundBodies;
    expect(reads.length, 'the room took the round and read the bodies').toBeGreaterThan(0);
    const onB = reads[0]!.surfaces.filter((s) => s.tag?.id === 2).sort((x, y) => x.distance - y.distance);
    const applied = t.events(1).filter((e) => e.type === 'combat' && e.status === 'applied' && e.request === 'fire' && e.target?.id === 2)
      .map((e) => (e as { part?: number }).part!);
    // INT.R5 (BONE-BOXES' fold, the review's finding 2): the round's `miss` reports (the combat log, an instrument)
    const misses = t.events(1).filter((e) => e.type === 'combat' && e.status === 'miss' && e.request === 'fire')
      .map((e) => e as { target: { id: number } | null; reason: string | null; distance: number | null });
    const victim = t.room.player(2)!;
    console.log(`BONE-BOXES ${ray!.family}: test records ${show(ray!.records)}; room records ${onB.map((s) => `${name(s.tag!.part)}@${s.distance.toFixed(2)}`).join(' ')}; applied ${applied.map(name).join(', ')}; hp ${victim.health.hp.join(',')} armour ${victim.health.armour.join(',')}`);
    return { ray: ray!, onB, applied, misses, hp: victim.health.hp, armour: victim.health.armour, reach: reads[0]!.reach, boxes, feet, yaw: b.yaw };
  };
  /** The health a fresh SEAL keeps after `parts`, each D = 40 at P = 2 (`applyHit`, the port's armour step). */
  const after = (parts: readonly number[]) => {
    const h = freshHealth();
    for (const p of parts) applyHit(h, p, 40, 2);
    return h;
  };
  const damageParts = (r: readonly TestRecord[]): number[] => r.filter((x) => x.part >= 0).map((x) => x.part);
  /** The range a piercing-0 round keeps past these records (`penetrate`): cut once each (0.97, PERSON). */
  const cutRange = (s: readonly Surface[], reach: number): number => penetrate(s.map((x) => ({ distance: x.distance, penetration: x.penetration })), reach, 0).range;

  it('the boxes: every bone from skel_root down boxed, 25 (the weapon slots and `body` none); spinehi\'s maximum x at most 3.01', () => {
    const sk = seal().skeleton;
    const boxes = testBoxes(sk, [0, 0, 0], 0);
    for (const p of sk.parts) console.log(`BONE-BOXES bbox ${p.index} ${p.name} [${[...p.bbox].map((x) => x.toFixed(4)).join(', ')}]`);
    expect(boxes.map((b) => b.bone)).not.toContain('body');
    expect(boxes).toHaveLength(25);
    expect(boxes.find((b) => b.bone === 'spinehi')!.hi[0]).toBeLessThanOrEqual(Math.fround(3.01));
  }, 120_000);

  it('A. arm, then trunk: RARM then BODY, each D; the body caps the limbs at 18', () => {
    const s = shot((boxes, feet, yaw) => findRay(boxes, feet, yaw, (_r, apps) => apps.join() === [PART.RARM, PART.BODY].join(), ['-1,0,0', '-1,0,-1', '-1,0,1']));
    expect(s.applied).toEqual([PART.RARM, PART.BODY]);
    expect(s.hp).toEqual([8, 10, 18, 30, 18, 18]);
    expect(s.armour).toEqual([0, 20, 25, 20, 25, 25]);
    expect(s.hp).toEqual(after([PART.RARM, PART.BODY]).hp);
    expect(damageParts(s.onB.map((x) => ({ bone: '', part: x.tag!.part, t: x.distance }))).slice(0, 2)).toEqual([PART.RARM, PART.BODY]);
  }, 120_000);

  it('B. trunk, then arm: BODY only, the range still cut at each record', () => {
    const s = shot((boxes, feet, yaw) => findRay(boxes, feet, yaw, (r, apps) => {
      const dmg = damageParts(r);
      return apps.join() === String(PART.BODY) && dmg[0] === PART.BODY && dmg.slice(1).some((p) => p === PART.RARM || p === PART.LARM);
    }, ['1,0,1', '-1,0,1', '1,0,-1', '-1,0,-1']));
    expect(s.applied).toEqual([PART.BODY]);
    expect(s.hp).toEqual(after([PART.BODY]).hp);
    const dmg = s.onB.filter((x) => x.tag!.part >= 0).map((x) => x.tag!.part);
    expect(dmg[0]).toBe(PART.BODY);
    expect(dmg.slice(1).some((p) => p === PART.RARM || p === PART.LARM), 'the arm behind is a record').toBe(true);
    expect(s.onB.length).toBeGreaterThanOrEqual(2);
    expect(cutRange(s.onB, s.reach)).toBeCloseTo(s.reach * 0.97 ** s.onB.length, 6);
  }, 120_000);

  it('C. two bones of one arm, the trunk missed: RARM twice (30 -> 10, then 10 -> 0, armour 16)', () => {
    const s = shot((boxes, feet, yaw) => findRay(boxes, feet, yaw, (r, apps) => {
      const bones = r.filter((x) => x.part >= 0).map((x) => x.bone).sort().join();
      return apps.join() === [PART.RARM, PART.RARM].join() && bones === 'rbicep,rforearm';
    }, ['0,1,0', '0,-1,0', '0,1,-1', '0,1,1', '1,1,0', '-1,1,0']));
    expect(s.applied).toEqual([PART.RARM, PART.RARM]);
    expect(s.hp[PART.RARM]).toBe(0);
    expect(s.armour[PART.RARM]).toBe(16);
    expect(s.hp).toEqual(after([PART.RARM, PART.RARM]).hp);
  }, 120_000);

  it('D. head, then trunk: HEAD only', () => {
    const s = shot((boxes, feet, yaw) => findRay(boxes, feet, yaw, (r, apps) => {
      const dmg = damageParts(r);
      return apps.join() === String(PART.HEAD) && dmg.includes(PART.BODY);
    }, ['0,-1,0', '0,-1,-1', '0,-1,1', '1,-1,0', '-1,-1,0']));
    expect(s.applied).toEqual([PART.HEAD]);
    const dmg = s.onB.filter((x) => x.tag!.part >= 0).map((x) => x.tag!.part);
    expect(dmg[0]).toBe(PART.HEAD);
    expect(dmg).toContain(PART.BODY);
  }, 120_000);

  it('E. both thighs, side on: RLEG then LLEG, in the ray\'s order', () => {
    const s = shot((boxes, feet, yaw) => findRay(boxes, feet, yaw, (r, apps) => {
      const bones = r.filter((x) => x.part >= 0).map((x) => x.bone).join();
      return apps.join() === [PART.RLEG, PART.LLEG].join() && bones === 'rthigh,lthigh';
    }, ['-1,0,0'], 6, 8));
    expect(s.applied).toEqual([PART.RLEG, PART.LLEG]);
    expect(s.hp).toEqual(after([PART.RLEG, PART.LLEG]).hp);
  }, 120_000);

  it('point blank: the muzzle inside a limb\'s box makes no record of it; the trunk behind is hit', () => {
    const s = shot((boxes, feet, yaw) => {
      const bicep = boxes.find((b) => b.bone === 'rbicep')!, spine = boxes.find((b) => b.bone === 'spinehi')!;
      const d0: V3 = [spine.centre[0] - bicep.centre[0], spine.centre[1] - bicep.centre[1], spine.centre[2] - bicep.centre[2]];
      const l = Math.hypot(...d0), d: V3 = [d0[0] / l, d0[1] / l, d0[2] / l];
      const records = testRecords(bicep.centre, d, 200, boxes);
      const back: V3 = [bicep.centre[0] - d[0] * 30, bicep.centre[1] - d[1] * 30, bicep.centre[2] - d[2] * 30];
      expect(testRecords(back, d, 200, boxes).map((r) => r.bone), 'from outside, the line enters the bicep').toContain('rbicep');
      expect(records.map((r) => r.bone)).not.toContain('rbicep');
      return { o: bicep.centre, d, records, apps: damageParts(records).slice(0, 1), family: 'from the rbicep box\'s centre to spinehi\'s' };
    });
    expect(s.onB.map((x) => x.tag!.part)).not.toContain(PART.RARM);
    expect(s.applied[0]).toBe(PART.BODY);
    expect(s.applied).toEqual([PART.BODY]);
  }, 120_000);

  it('a hand only: no damage, but the hand is a record (the range cut)', () => {
    const s = shot((boxes, feet, yaw) => findRay(boxes, feet, yaw, (r) =>
      r.length > 0 && r.every((x) => x.part === NONE) && r.some((x) => x.bone === 'rhand' || x.bone === 'lhand')));
    expect(s.applied).toEqual([]);
    expect(s.onB.length).toBeGreaterThan(0);
    expect(s.onB.every((x) => x.tag!.part === NONE)).toBe(true);
    expect(cutRange(s.onB, s.reach)).toBeCloseTo(s.reach * 0.97 ** s.onB.length, 6);
    expect(s.hp).toEqual(freshHealth().hp);
    // the combat log (INT.R5, a playtest instrument): the round met B and applied nothing -- one `miss` on B, 'no damage',
    // at its first record (it wrote none before the fold: no part routine ran, and the round was not a miss)
    expect(s.misses.map((m) => [m.target?.id ?? null, m.reason])).toEqual([[2, 'no damage']]);
    expect(s.misses[0]!.distance).toBeCloseTo(s.onB[0]!.distance, 6);
  }, 120_000);

  it('a no-damage bone in front of the trunk: it cuts the range, and the trunk is still damaged', () => {
    const s = shot((boxes, feet, yaw) => findRay(boxes, feet, yaw, (r, apps) =>
      r.length > 1 && r[0]!.part === NONE && apps.join() === String(PART.BODY) && damageParts(r)[0] === PART.BODY));
    expect(s.onB[0]!.tag!.part).toBe(NONE);
    expect(s.applied).toEqual([PART.BODY]);
    expect(s.hp).toEqual(after([PART.BODY]).hp);
    expect(s.misses, 'a body that took the round is no miss').toEqual([]);
  }, 120_000);
});
