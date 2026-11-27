// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type TurretPlacement, type WorldPoly } from '@s2u/scene';
import { dismountSlot, mountClipOf, mountHandOf, onTurretSet, TURRET_MOUNT_CLIPS } from '../src/net/emplacement';
import { Walker, type WalkInput } from '../src/mover';
import { TurretPage } from '../src/turretPage';

/**
 * R4P-R2 (the ready queue's "The turret cycle"; AS-02, AS-06, AS-21; simulation track; reading, pending review): r0004's
 * turret cycle on the page's side and the shared mover's.
 *
 * - The mount's clip (L81; r0001 `FUN_005a6fc0` D:L462173-462200, r0004 0x5acbb0 D4:L503241-503262): by the body's hand
 *   class `+0xf79` (1 rifle, 2 pistol, 4 launcher, 3 grenades and charges, 0 other) -- the mount passes it
 *   (D4:L452444), and selecting an item over a firearm never writes it (0x5ac050 D4:L502932-502964 writes only 1 and 2).
 *   The pistol's clip for class 2 (D4:L503258-503260), the rifle's for 1, 3, 4 and 0: a grenade over the pistol mounts
 *   with the PISTOL clip, over the rifle with the rifle's; an item with no firearm under it (class 3 or 0), the rifle's.
 *   Corrected 2026-11-24 by the non-author second read (patches-contrib): the first build read the classes as kit items.
 * - The launcher (QL55-PC2, PROVEN on r0004: a launcher in hand refuses the mount) is the room's `mount: launcher`
 *   refusal (LATER 205), held in `match/test/roomR4pR2TurretCycle.test.ts`; its put-away clip is never reached.
 * - The dismount's slot (L67; r0001 `FUN_00545ee0` D:L412005, r0004 0x54a900 D4:L452157-452169): the secondary (class
 *   4) when the slot kept at the mount was the secondary or no primary exists, else the first primary, else the kept slot.
 * - The turret set (L106; r0004 0x583400 D4:L538271-538273, D4:L481315): no `Jump fall` begins on it or mounted.
 */

/** A flat ground polygon, world space. */
function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, maxZ, maxX, y, maxZ, maxX, y, minZ, minX, y, minZ]),
  };
}
function world(polys: WorldPoly[]): ReturnType<typeof buildGrid> {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
/** The yaw that faces from (x, z) toward (tx, tz): the camera looks down its own -z. */
const facing = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI;

describe('R4P-R2: the mount clip by the hand class +0xf79 (r0004 0x5acbb0, D4:L452444, D4:L503258-503260)', () => {
  it('the firearm under any item decides: a grenade over the pistol mounts with the pistol clip, over the rifle with the rifle clip', () => {
    expect(mountClipOf(mountHandOf(1))).toBe(TURRET_MOUNT_CLIPS.pistol);
    expect(mountClipOf(mountHandOf(0))).toBe(TURRET_MOUNT_CLIPS.rifle);
  });

  it('no firearm in the hand (an item alone, class 3 or 0) mounts with the rifle clip', () => {
    expect(mountClipOf(mountHandOf(null))).toBe(TURRET_MOUNT_CLIPS.rifle);
  });
});

describe('R4P-R2: the dismount draws the primary (r0004 0x54a900, D4:L452157-452169)', () => {
  it('an item kept at the mount gives the first primary; the primary kept gives the primary', () => {
    expect(dismountSlot('item', true, true)).toBe('primary');
    expect(dismountSlot('primary', true, true)).toBe('primary');
  });

  it('the secondary kept gives the secondary; no primary gives the secondary; neither gives the kept slot', () => {
    expect(dismountSlot('secondary', true, true)).toBe('secondary');
    expect(dismountSlot('item', false, true)).toBe('secondary');
    expect(dismountSlot('item', false, false)).toBe('saved');
  });
});

describe('R4P-R2: the turret set (r0004 0x583400; the room and the page alike)', () => {
  it('the set is on from the take through the reversed clip, off before and after', () => {
    expect(onTurretSet(false, false)).toBe(false);
    expect(onTurretSet(true, false)).toBe(true);
    expect(onTurretSet(false, true)).toBe(true);
  });

  /** A body walked off a 42-unit deck, its turret set read from `on`: the action it takes in the air. */
  const walkOff = (on: boolean): { airborne: boolean; inAir: string } => {
    const w = new Walker(world([floor(-200, -200, 200, 200, 0), floor(-100, -100, 30, 100, 42)]));
    expect(w.place(0, 60, 0)).toBe(true);
    w.state.yaw = facing(0, 0, 1, 0);
    w.turretSetOn = () => on;
    let airborne = false, inAir = '';
    for (let i = 0; i < 240; i++) {
      w.tick(FORWARD);
      if (w.airborne) { airborne = true; inAir = w.action?.name ?? ''; break; }
    }
    return { airborne, inAir };
  };

  it('the control: off the set, a walk-off pushes Jump fall (FUN_005af930 -> FUN_0057e130 -> FUN_0057e050)', () => {
    const r = walkOff(false);
    expect(r.airborne, 'the walk-off was reached').toBe(true);
    expect(r.inAir).toBe('fall');
  });

  it('on the set, the same walk-off pushes no Jump fall (CanBeginJumpFall answers 0, D4:L538271-538273)', () => {
    const r = walkOff(true);
    expect(r.airborne, 'the walk-off was reached').toBe(true);
    expect(r.inAir).not.toBe('fall');
  });
});

/** A level placement facing 0 (the page reads only these fields here; `turretPage.test.ts`' PLACE). */
const PLACE = {
  id: 0, name: 'synthetic', origin: [0, 13.5, 0], facing: 0, gunOrigin: [0, 13.5, 0], firepointOrigin: [0, 13.5, -9.7],
  limits: { yaw: [(-70 * Math.PI) / 180, (70 * Math.PI) / 180], pitch: [(-45 * Math.PI) / 180, (45 * Math.PI) / 180] },
  mountRange: 22, mountAngleCos: Math.cos((35 * Math.PI) / 180), parts: { turret: 't', gun: 'g', firepoint: 'f' },
} as unknown as TurretPlacement;

/** A page whose player is 1, its hand `hand`, counting the weapon drawn after a release of its own (`drawn`). */
function page(hand: 0 | 1) {
  let now = 0, drawn = 0;
  const p = new TurretPage({
    turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
    setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
    net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 1 }),
    clips: () => ({
      clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
      table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
    }),
    hand: (id) => (id === 1 ? hand : 0),
    drawn: () => { drawn++; },
    now: () => now,
  });
  return { p, advance: (s: number) => { now += s; }, drawn: () => drawn };
}

describe('R4P-R2: the page mounts by the hand class and draws the weapon after its own release', () => {
  it('a grenade over the pistol: the page plays the pistol clip (the hand the page is handed is mountHandOf of the firearm)', () => {
    const r = page(mountHandOf(1));
    r.p.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    expect(r.p.ownPose()!.clip).toBe('seal_p_stand2turret');
  });

  it('its own release draws the weapon after (FUN_00545ee0 r0004 0x54a900): once, at the release, not at the mount', () => {
    const r = page(0);
    r.p.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    expect(r.p.mounted(), 'the mount was reached').toBe(0);
    expect(r.drawn()).toBe(0);
    r.advance(1);
    r.p.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    expect(r.p.mounted(), 'the release was reached').toBeNull();
    expect(r.drawn()).toBe(1);
  });

  it('another body mounting and leaving draws nothing on this page', () => {
    const r = page(0);
    r.p.event({ type: 'turret', id: 0, occupant: 7, ammo: 750 });
    r.advance(1);
    r.p.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    expect(r.drawn()).toBe(0);
  });
});
