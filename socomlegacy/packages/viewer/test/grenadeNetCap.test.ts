import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, M67, type Grid, type GridParams, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower, type GrenadeSource } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';

/**
 * NET-CAP on the page (research 312 §10.4 item 3): the room's refusal predicted where the page gates the use --
 * `GrenadeThrower.startThrow`, the release request, and `startPlacing`, the placing's fire. `FUN_005c0ae0`
 * (D:L476470-476491) answers before `FUN_005be9a0` runs (`FUN_005c0fd0` D:L476569, D:L476637-476638): online, the record
 * in the hand of the four classes is refused while more than five of the page's own projectiles of those classes live
 * (`../src/net/netCap`). Refused: no clip, nothing spent, no message (NET_CAP_REFUSED_USE_PLACEHOLDER: the release as a
 * short tap, the placing not started). Online is the match (`GrenadeSource.online`); without it, offline, no cap.
 */

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);

/** A launched round (class 0xab: the M203 FRAG, 175) as `launchRound` flies it -- one of the page's own. */
const ROUND: ThrowableRecord = { ...M67, id: 175, name: 'M203 FRAG', muzzleVelocity: 75, impact: true, armingDistance: 140 };

function thrower(online: boolean | null) {
  const events: string[] = [];
  const src: GrenadeSource = { grid: (): Grid | null => null, snapshot: () => snap(), view: () => 'third' };
  if (online !== null) (src as GrenadeSource & { online(): boolean }).online = () => online;
  const g = new GrenadeThrower(src);
  g.on('throw', (t) => events.push(`throw ${t.item}`));
  g.on('throwStart', () => events.push('throwStart'));
  g.on('refuse', (r) => events.push(`refuse ${r.text}`));
  /** `n` of the page's own rounds in the air, far off. */
  const own = (n: number): void => { for (let i = 0; i < n; i++) g.launchRound(ROUND, [-900 + i * 10, 300, 900], [0, 1, 0]); };
  /** `n` of another player's grenades in the air (`launchRemote`). */
  const theirs = (n: number): void => { for (let i = 0; i < n; i++) g.launchRemote('M67', [-900 + i * 10, 300, -900], [0, 0, 0], 7); };
  return { g, events, own, theirs };
}

describe('NET-CAP on the page: the release request (`startThrow`)', () => {
  it('online with six of its own live: the M67 let go throws nothing, spends nothing, shows nothing, and stays up', () => {
    const t = thrower(true);
    t.own(6);
    t.g.select('M67');
    const left = t.g.stats().left;
    expect(t.g.throwNow(1)).toBeNull();
    expect(t.events).toEqual([]);
    expect(t.g.stats().left).toBe(left);
    expect(t.g.phase()).toBe('ready');
  });

  it('online with five: thrown', () => {
    const t = thrower(true);
    t.own(5);
    t.g.select('M67');
    expect(t.g.throwNow(1)).not.toBeNull();
    expect(t.events).toEqual(['throwStart', 'throw M67']);
  });

  it('another player\'s never count; offline (no match) there is no cap', () => {
    const others = thrower(true);
    others.theirs(8);
    others.g.select('M67');
    expect(others.g.throwNow(1)).not.toBeNull();
    for (const online of [false, null]) {
      const off = thrower(online);
      off.own(8);
      off.g.select('M67');
      expect([online, off.g.throwNow(1) !== null]).toEqual([online, true]);
    }
  });
});

describe('NET-CAP on the page: the placing\'s fire (`startPlacing`)', () => {
  it('online with six of its own live: the claymore\'s placing does not start, and no message (the cap shows none)', () => {
    const t = thrower(true);
    t.own(6);
    expect(t.g.select('Claymore')).toBe(true);
    t.g.pull();
    expect(t.events).toEqual([]);
    expect(t.g.stats().placing).toBe(false);
    expect(t.g.stats().message).toBeNull();
  });

  it('online with five: the placing starts', () => {
    const t = thrower(true);
    t.own(5);
    t.g.select('Claymore');
    t.g.pull();
    expect(t.events).toEqual(['throwStart']);
    expect(t.g.stats().placing).toBe(true);
  });
});

/**
 * F1 of NET-CAP's review: C4 is planted by the Action button (`FUN_00592d50` D:L452030-452055 -> `FUN_005c0020(..., 0x97)`),
 * which goes straight to `FUN_005be9a0` when `FUN_003d1e20` answers 0 -- as it does for C4's class (D:L475985-475994,
 * D:L324477-324479): `FUN_005c0ae0` is never asked, so the cap never refuses C4 (`plantC4` -> `startPlacing`). On
 * `grenade.test.ts`'s PAR-20 D09 wall in miniature: a C4 target the reticle settles on.
 */
describe('NET-CAP on the page: C4 is never capped (the plant of the Action button)', () => {
  const DI = 'worldmodel/access1=access1/good_parts/di_good';
  const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };
  const grid = (): Grid => {
    const f: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
    };
    const wall: WorldPoly = { ...f, path: DI, ditype: 2, points: Float32Array.from([130, 50, 150, 130, 50, 250, 130, 110, 250, 130, 110, 150]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [f, wall], [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
    ]);
  };

  it('online with six of its own live: C4 is planted (the placing starts)', () => {
    const map = grid();
    const g = new GrenadeThrower({
      grid: () => map, snapshot: () => snap({ yaw: 0 }), view: () => 'third', online: () => true,
      handPoint: () => [102, 62, 192], aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }),
    } as GrenadeSource);
    const starts: string[] = [];
    g.on('throwStart', () => starts.push('throwStart'));
    for (let i = 0; i < 6; i++) g.launchRound(ROUND, [-900 + i * 10, 300, 900], [0, 1, 0]);
    g.setRecords([C4]);
    g.setWorld(() => ({ health: { c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }) as never);
    g.setKit(['M67', 'AN-M8', 'C4']);
    for (let t = 0; t < 0.3 - 1e-9; t += 1 / 60) g.update(1 / 60);   // the reticle settles on the target (0.2 s)
    expect(g.plantC4()).toBe(true);
    expect(starts).toEqual(['throwStart']);
    expect(g.stats().placing).toBe(true);
  });
});
