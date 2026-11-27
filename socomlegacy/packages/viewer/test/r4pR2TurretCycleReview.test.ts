// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type TurretPlacement, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, Walker } from '../src/mover';
import { WalkMode } from '../src/walk';
import { mountHandOf, releaseHandOf } from '../src/net/emplacement';
import { TurretPage } from '../src/turretPage';
import type { ServerEvent } from '../src/net/protocol';

/**
 * R4P-R2 review 1 (PASS WITH FINDINGS; reading, pending review), the page's half of two findings:
 *
 * - F1: the release's reversed clip is the slot r0004's release chooses (0x54a900, D4:L452157-452169; `dismountSlot`).
 *   (Second read, 2026-11-24: with no primary r0004 mounts AND releases by the pistol's clip; the release differs from
 *   the mount when it draws the primary over a pistol mount, or the kept item -- class 3, the rifle's clip.) Every page draws a release by the room's word (`releaseHand` on the release's broadcast),
 *   and the occupant's own predicted travel takes the same choice over the same inputs (`TurretPageDeps.releaseHand`,
 *   `releaseHandOf`), so the room's travel, the page's travel and every drawn clip agree.
 * - F3: the page's walker is given the turret set as the room's is (`WalkMode.turretSet` -> `Walker.turretSetOn`),
 *   so no `Jump fall` begins on the page where the room's mover refuses it (r0004 0x583400, D4:L538271-538273).
 */

/** A level placement facing 0 (`turretPage.test.ts`' PLACE). */
const PLACE = {
  id: 0, name: 'synthetic', origin: [0, 13.5, 0], facing: 0, gunOrigin: [0, 13.5, 0], firepointOrigin: [0, 13.5, -9.7],
  limits: { yaw: [(-70 * Math.PI) / 180, (70 * Math.PI) / 180], pitch: [(-45 * Math.PI) / 180, (45 * Math.PI) / 180] },
  mountRange: 22, mountAngleCos: Math.cos((35 * Math.PI) / 180), parts: { turret: 't', gun: 'g', firepoint: 'f' },
} as unknown as TurretPlacement;

/** What this page's own kit holds (`TurretPageDeps.kit`): what a take would keep, and the firearm slots present. */
type Kit = { kept: 'primary' | 'secondary' | 'item'; hasPrimary: boolean; hasSecondary: boolean };

/**
 * A page whose player is 1; the mount's hand `hand` for every body; its own kit read from `kit` (absent: none given).
 * `pressRead`: review 2 F1's old wiring -- the release's hand read from the live kit at the press (`releaseHand`), which
 * the fix no longer asks; given here so the red shows the press's reading losing to the take's.
 */
function page(hand: 0 | 1, kit?: () => Kit, pressRead?: () => 0 | 1, seq: { n: number } = { n: 1 }) {
  let now = 0;
  const sent: unknown[] = [];
  const p = new TurretPage({
    turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
    setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
    net: () => ({ role: 'player', id: 1, send: (e) => { sent.push(e); }, lastSeq: () => seq.n }),
    clips: () => ({
      clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
      table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
    }),
    hand: () => hand,
    ...(kit !== undefined ? { kit } : {}),
    ...(pressRead !== undefined ? { releaseHand: pressRead } : {}),
    // The mount clip's shape for the own travel (`ReleaseTravel`): a still root over the clip's 26 keys, its run.
    mountShape: (h: 0 | 1) => ({ clip: h === 1 ? 'seal_p_stand2turret' : 'seal_stand2turret', refPt: [0, 0, 0] as [number, number, number], root: new Float32Array(78), keys: 26, seconds: 0.3 * (25 / 26) ** 2 }),
    now: () => now,
  } as ConstructorParameters<typeof TurretPage>[0]);
  return { p, sent, advance: (s: number) => { now += s; } };
}

describe('R4P-R2 review F1: every page draws the release by the room choice', () => {
  it('the hand helpers: a secondary-only kit, an item over the pistol -- mounted and released by the pistol clip; the kept item by the rifle clip', () => {
    expect(mountHandOf(1)).toBe(1);
    expect(releaseHandOf('item', false, true)).toBe(1);
    expect(releaseHandOf('item', true, true)).toBe(0);
    expect(releaseHandOf('secondary', true, true)).toBe(1);
    // Neither firearm: the release falls back to the kept item, whose class (3) plays the rifle's clip -- whatever the mount's.
    expect(releaseHandOf('item', false, false)).toBe(0);
  });

  it('the room release word (releaseHand 1): this page and another body both play the pistol reversed clip over a rifle mount', () => {
    const r = page(0);
    r.p.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    expect(r.p.ownPose()!.clip, 'the rifle mount was reached').toBe('seal_stand2turret');
    r.advance(1);
    r.p.event({ type: 'turret', id: 0, occupant: null, ammo: 750, releaseHand: 1 } as unknown as ServerEvent);
    expect(r.p.ownPose()!.clip).toBe('seal_p_stand2turret');
    const o = page(0);
    o.p.event({ type: 'turret', id: 0, occupant: 7, ammo: 750 });
    expect(o.p.turretPose(7)!.clip, 'the rifle mount was reached').toBe('seal_stand2turret');
    o.advance(1);
    o.p.event({ type: 'turret', id: 0, occupant: null, ammo: 750, releaseHand: 1 } as unknown as ServerEvent);
    expect(o.p.turretPose(7)!.clip).toBe('seal_p_stand2turret');
  });

  /** A welcome mount (the page's take of a held turret), then the kit changed on the turret, then the press past the wait. */
  const pressAfter = (r: ReturnType<typeof page>, change: () => void): void => {
    r.p.event({ type: 'welcome', turrets: [{ id: 0, occupant: 1, ammo: 750 }] } as unknown as ServerEvent);
    expect(r.p.mounted(), 'the mount was reached').toBe(0);
    change();
    r.advance(2);
    expect(r.p.action(), 'the dismount press was taken').toBe(true);
    expect(r.sent.some((e) => (e as { type: string }).type === 'dismount'), 'the dismount was sent').toBe(true);
    expect(r.p.mounted(), 'the release was predicted').toBeNull();
  };

  it('the own predicted release, a secondary-only kit with an item over the pistol: the kit kept at the take gives the pistol clip', () => {
    let live: Kit = { kept: 'item', hasPrimary: false, hasSecondary: true };
    const r = page(1, () => live);
    pressAfter(r, () => { live = { kept: 'secondary', hasPrimary: false, hasSecondary: true }; });
    expect(r.p.ownPose()!.clip).toBe('seal_p_stand2turret');
  });

  it('the own predicted release, an item alone (neither firearm): the kept item, the rifle clip whatever the mount clip', () => {
    let live: Kit = { kept: 'item', hasPrimary: false, hasSecondary: false };
    const r = page(1, () => live);
    pressAfter(r, () => { live = { kept: 'item', hasPrimary: false, hasSecondary: false }; });
    expect(r.p.ownPose()!.clip).toBe('seal_stand2turret');
  });

  /*
   * Review 2 F1: mounted with the bare pistol (the take keeps the secondary), a grenade selected on the turret, then the
   * dismount. The room releases by the pistol clip -- it reads what the take kept (`room.ts` `takeMount`: `mountKept`) --
   * so the page's predicted release must too, not the kit at the press (the old `releaseHand` read: the item, the rifle).
   */
  it('the own predicted release, mounted with the bare pistol and a grenade selected on the turret: the pistol clip, as the room, not the press reading', () => {
    let live: Kit = { kept: 'secondary', hasPrimary: true, hasSecondary: true };
    const r = page(1, () => live, () => releaseHandOf(live.kept, live.hasPrimary, live.hasSecondary));
    pressAfter(r, () => { live = { kept: 'item', hasPrimary: true, hasSecondary: true }; });
    expect(r.p.ownPose()!.clip).toBe('seal_p_stand2turret');
  });

  it('the reverse: mounted with a grenade over the pistol (the pistol clip), the grenade put away on the turret: the primary drawn, the rifle clip the take chose', () => {
    let live: Kit = { kept: 'item', hasPrimary: true, hasSecondary: true };
    const r = page(1, () => live, () => releaseHandOf(live.kept, live.hasPrimary, live.hasSecondary));
    pressAfter(r, () => { live = { kept: 'secondary', hasPrimary: true, hasSecondary: true }; });
    expect(r.p.ownPose()!.clip).toBe('seal_stand2turret');
  });

  /*
   * Review 2 F2: `TurretPage.releaseTravelling()` -- what the page's walker is told the turret set by -- is true over the own
   * release's reversed clip and false once it has run (`releaseTick`: the end's command, `ReleaseTravel.ends`).
   */
  it('releaseTravelling() is false while mounted, true from the predicted press over the reversed clip, false once it has run', () => {
    const seq = { n: 1 };
    const r = page(0, undefined, undefined, seq);
    r.p.event({ type: 'welcome', turrets: [{ id: 0, occupant: 1, ammo: 750 }] } as unknown as ServerEvent);
    expect(r.p.mounted(), 'the mount was reached').toBe(0);
    expect(r.p.releaseTravelling()).toBe(false);
    r.advance(2);
    expect(r.p.action(), 'the dismount press was taken').toBe(true);
    expect(r.p.releaseTravelling()).toBe(true);
    const w = new Walker(buildGrid(PARAMS, [], [], POLYS, OWNERS));
    expect(w.place(0, 10, 8.5)).toBe(true);
    seq.n += 2;
    r.p.holdTick(w);
    expect(r.p.releaseTravelling(), 'a step of the travel').toBe(true);
    seq.n += 60;
    r.p.holdTick(w);
    expect(r.p.releaseTravelling(), 'the travel run').toBe(false);
  });
});

// ---- F3: the page's walker told the turret set ------------------------------------------------------------------------

const quad = (pts: number[], path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});
const POLYS: WorldPoly[] = [quad([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200], 'worldmodel/floor')];
const OWNERS: CollisionOwner[] = POLYS.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};
const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

describe('R4P-R2 review F3: the page walker is told the turret set, as the room mover is', () => {
  it('WalkMode.turretSet feeds Walker.turretSetOn: off with none, on and off as it answers', () => {
    const fly = new FlyCamera(canvas());
    const m = new WalkMode(fly, () => undefined);
    made.push(m);
    m.setGround(packGround(PARAMS, POLYS, OWNERS), null);
    expect(m.respawn([0, 0, 0], 0)).toBe(true);
    const w = (m as unknown as { walker: Walker }).walker;
    expect(w.turretSetOn?.(), 'the hook was given').toBe(false);
    let on = true;
    m.turretSet = () => on;
    expect(w.turretSetOn?.()).toBe(true);
    on = false;
    expect(w.turretSetOn?.()).toBe(false);
  });
});
