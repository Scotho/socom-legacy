// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGrid, GAME_FRAME_DT, type CollisionOwner, type Grid, type GridParams, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { Fire, type FireAim } from '../src/fire';
import { KitTrigger, padStep, type PadState } from '../src/padButton';

/**
 * LATER 1147 (research 443 §1-§2; reading, pending review): the real `Fire`'s trigger rounds land on the same kit steps as
 * the transcribed `KitTrigger` (`../src/padButton`: the pad layer `FUN_002d9ff0` D:L179137-179168, the "held" query
 * `FUN_002c60c0` D:L166671-166686, the kit gate and timer `FUN_005c0ae0` D:L476354-476448 / `FUN_005c09f0`
 * D:L476313-476341 / D:L476643-476647, the count cleared on a read not held D:L476380-476382, D:L476399-476400 with
 * `FUN_00594cf0` D:L453543-453565) for the same
 * sequence of button states, one per step -- in single (1 round a pull), burst (3) and automatic (10000, `FUN_005c0940`
 * D:L476283-476310), the wait FireWait or x 0.8 (`FUN_005c09f0`). Offline, the raise never refused, a magazine that does
 * not run out: the gates `Fire` keeps beside the pad (LATER 180, the reload, the room's mirror) never bind here.
 *
 * The harness (an adaptation of the test): `Fire.update(GAME_FRAME_DT)` is one kit step exactly (its clock carries
 * nothing at whole game frames), the button pressed (`pull`) or let go (`release`) before it.
 */

const GOLDEN = resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json');
const RECORDS = Object.values(JSON.parse(readFileSync(GOLDEN, 'utf8')).records as Record<string, WeaponRecord>);
const byName = (name: string): WeaponRecord => RECORDS.find((r) => r.name === name)!;

const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
function world(): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const polys = [quad([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30])];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** The mode's wait (`FUN_005c09f0`: FireWait, x 0.8 in burst and automatic) and rounds a pull (`FUN_005c0940`). */
const MODES = { single: { limit: 1, scale: 1 }, burst: { limit: 3, scale: 0.8 }, automatic: { limit: 10000, scale: 0.8 } } as const;
type Mode = keyof typeof MODES;

/** The steps the real `Fire` fired a round on, for `down[k]` the button at step k. */
function fireSteps(rec: WeaponRecord, mode: Mode, down: readonly boolean[]): number[] {
  const grid = world(), eye: [number, number, number] = [0, 20, 0];
  const aim = (): FireAim => ({ eye, far: [0, 20, -1000] });
  const fire = new Fire({ grid: () => grid, aim }, { ...rec, magazine: 100000 } as WeaponRecord, undefined, () => 0.5);
  const { limit, scale } = MODES[mode];
  fire.setGun({ trigger: () => {}, roundsPerPull: () => limit, interval: (w) => w * scale, round: (d) => d });
  const out: number[] = [];
  down.forEach((d, k) => {
    if (d) fire.pull(); else fire.release();
    if (fire.update(GAME_FRAME_DT) > 0) out.push(k);
  });
  return out;
}

/** The steps `KitTrigger` fires on for the same button states. */
function kitSteps(rec: WeaponRecord, mode: Mode, down: readonly boolean[]): number[] {
  const { limit, scale } = MODES[mode];
  const kit = new KitTrigger(rec.fireWait * scale, limit);
  let s: PadState = 0;
  const out: number[] = [];
  down.forEach((d, k) => {
    s = padStep(s, d);
    if (kit.step(GAME_FRAME_DT, s)) out.push(k);
  });
  return out;
}

/** Seeded button states: runs of 1-8 steps down and 1-4 up, after 5 up. */
function pattern(seed: number, steps: number): boolean[] {
  let s = seed;
  const r = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const out: boolean[] = Array(5).fill(false);
  while (out.length < steps) {
    const on = 1 + Math.floor(r() * 8), off = 1 + Math.floor(r() * 4);
    for (let i = 0; i < on; i++) out.push(true);
    for (let i = 0; i < off; i++) out.push(false);
  }
  return out.slice(0, steps);
}

describe("LATER 1147: Fire's trigger rounds are KitTrigger's on the same step sequence (research 443)", () => {
  const WEAPONS = ['9mm Sub', 'M4A1', 'AK-47', 'HK5'].map(byName);

  it('the weapons are on the pin', () => {
    expect(WEAPONS.every((w) => w !== undefined && w.fireWait > 0)).toBe(true);
  });

  for (const mode of Object.keys(MODES) as Mode[]) {
    it(`${mode}: the same rounds on the same steps, five seeds of taps and holds, each weapon`, () => {
      const off: string[] = [];
      let rounds = 0;
      for (const rec of WEAPONS) {
        for (const seed of [1, 2, 3, 4, 5]) {
          const down = pattern(seed * 7919 + rec.id, 400);
          const got = fireSteps(rec, mode, down), want = kitSteps(rec, mode, down);
          rounds += want.length;
          if (JSON.stringify(got) !== JSON.stringify(want)) off.push(`${rec.name} seed ${seed}: Fire ${got.slice(0, 12).join(',')} / KitTrigger ${want.slice(0, 12).join(',')}`);
        }
      }
      expect(rounds).toBeGreaterThan(100);
      expect(off).toEqual([]);
    });
  }

  it('a press of one read fires nothing; of two reads, one round on its second (the table, research 443 §1)', () => {
    const rec = byName('9mm Sub');
    expect(fireSteps(rec, 'automatic', [false, false, true, false, false, false])).toEqual([]);
    expect(fireSteps(rec, 'automatic', [false, false, true, true, false, false])).toEqual([3]);
  });

  it("the review F1: a bolt gun's single, let go inside its after-shot lock and pressed again so the first untimed step reads pad 1 -- the count cleared there, the press fires", () => {
    // The M40A1's lock (`./firearms` `afterShotLock`: its ReloadDelayAfterShot 0.5, `FUN_005c5340` D:L479321-479343) holds
    // the kit's +0x820, so its frames run no gate (D:L476549-476563): the release's 3 and 0 reads fall there, unseen. The
    // re-press's first untimed read is pad 1: "held" false, ctrl+0x118 0 or 3 (`FUN_00594cf0` D:L453543-453565), the count
    // cleared (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400) -- so the press fires once the wait is spent.
    const rec = byName('M40A1');
    expect(rec.reloadAfterShot).toBe(true);
    const grid = world(), eye: [number, number, number] = [0, 20, 0];
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }) }, { ...rec, magazine: 1000 } as WeaponRecord, undefined, () => 0.5);
    fire.setGun({ trigger: () => {}, roundsPerPull: () => 1, interval: (w) => w, round: (d) => d });
    fire.pull();
    let rounds = fire.update(GAME_FRAME_DT);
    rounds += fire.update(GAME_FRAME_DT);
    expect(rounds).toBe(1);                                    // the second read
    expect(fire.reloadLocked()).toBe(true);                    // the lock: the next step is timed
    fire.release();
    for (let k = 0; k < 2; k++) {                              // the 3 read and the 0 read, both on timed steps
      expect(fire.reloadLocked()).toBe(true);
      rounds += fire.update(GAME_FRAME_DT);
    }
    let guard = 0;
    while (fire.reloadLocked() && guard++ < 100) rounds += fire.update(GAME_FRAME_DT);
    expect(fire.reloadLocked()).toBe(false);                   // the next step is the first untimed one
    fire.pull();                                               // so it reads pad 1
    for (let k = 0; k < 60; k++) rounds += fire.update(GAME_FRAME_DT);
    expect(rounds).toBe(2);
  });

  it('the review F3: a press held through a mount (or a refill) and let go there, pressed again after it, fires on its second read, not its first', () => {
    // The page runs no kit step while mounted (`./matchFirearm` `fireFrame`), so the pad is not stepped there; the console
    // steps it every update (`FUN_002d9ff0` D:L179137-179168), so a release in the mount reads 3 then 0 and the next press
    // 1 then 2 (round on the 2: `FUN_002c60c0` D:L166671-166686). The page resets the pad with the trigger at the take
    // (`mountTake`) and at a fresh kit (`refill`).
    for (const via of ['mountTake', 'refill'] as const) {
      for (const [limit, held] of [[1, 10], [10000, 3]] as const) {
        const grid = world(), eye: [number, number, number] = [0, 20, 0];
        const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }) }, { ...byName('M4A1'), magazine: 1000 } as WeaponRecord, undefined, () => 0.5);
        fire.setGun({ trigger: () => {}, roundsPerPull: () => limit, interval: () => GAME_FRAME_DT / 2, round: (d) => d });
        fire.pull();
        let rounds = 0;
        for (let k = 0; k < held; k++) rounds += fire.update(GAME_FRAME_DT);
        expect(rounds, `${via} ${limit}`).toBeGreaterThan(0);
        if (via === 'mountTake') fire.mountTake(); else fire.refill();   // the trigger let go there
        fire.pull();                                                      // pressed again after it
        expect(fire.update(GAME_FRAME_DT), `${via} ${limit}: the first read`).toBe(0);
        expect(fire.update(GAME_FRAME_DT), `${via} ${limit}: the second read`).toBe(1);
      }
    }
  });

  it('a release and a re-press inside one game frame are one read: a single does not fire again (the count cleared only on a read not held)', () => {
    const grid = world(), eye: [number, number, number] = [0, 20, 0];
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }) }, { ...byName('M4A1'), magazine: 1000 } as WeaponRecord, undefined, () => 0.5);
    fire.setGun({ trigger: () => {}, roundsPerPull: () => 1, interval: (w) => w, round: (d) => d });
    fire.pull();
    let rounds = 0;
    for (let k = 0; k < 2; k++) rounds += fire.update(GAME_FRAME_DT);
    expect(rounds).toBe(1);                                   // the second read
    for (let k = 0; k < 20; k++) {                            // let go and pressed again between every pair of steps
      fire.release(); fire.pull();
      rounds += fire.update(GAME_FRAME_DT);
    }
    expect(rounds).toBe(1);
  });
});
