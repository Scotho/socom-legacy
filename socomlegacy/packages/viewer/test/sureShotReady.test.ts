// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { buildGrid, GAME_FRAME_DT, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { controllerConfigs } from '../src/controllerConfigs';
import { launcherLowerSeconds } from '../src/equipment';
import type { FireEvent } from '../src/fire';
import { noInput, type Input } from '../src/gamepad';
import { Hud } from '../src/hud';
import { InventoryMenu } from '../src/inventoryMenu';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type FirearmHands } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { WalkMode } from '../src/walk';

/**
 * BUG-SURESHOT-READY (LATER 1354; research 451 §4, "after a launcher lower"): SURE SHOT (X `Fire`, R1 `Inventory`), the
 * launcher lowered back to the rifle, X held from the hand's return -- what the port does, pinned beside what the
 * original was traced doing.
 *
 * The evidence: a trace of the original running, UNSCORED (no harness score; a capture, pending review) --
 * `D:/s2u-records/SURESHOT-LAW-PC3/SURESHOT-LAW-PC3.zip`, sha256
 * 5cb78115c1b858a845915fd5e1d0c93a70534cfde2fa8d146212e60ff9c3f16b (r0004, LAN Vigilance, SEAL M4A1 + AT-4, the rifle on
 * single; `runs/*.csv`, one row a game frame). M0 is the first frame the hand word `actor+0xe04` reads 0; the lower's
 * confirm (R1) is on the pad 1-2 frames before it. A round there is a magazine drop (`+0x7b4`) with the kit's fire step
 * (`kit+1` bit 2 cleared, `FUN_005c0fd0` D:L476620-476641). The cases the record supports:
 *   (i)   X held, no R1 (ctl-xheld-3, -4): ONE round, M0+42 / M0+43; none before.
 *   (iii) R1 at M0+5 .. +30 (r1-5, r1-6, r1-10, r1-20, r1-30: 12 trials): ONE round, M0+41 .. +44; no extra.
 *   (iv)  R1 after the held round (r1-45-1, r1-60-1..3): the held round and ONE more, from R1's first frame down
 *         on the pad word +3 in 3 of 4 (4 of 5 with r1-45-2), +4 in r1-60-2; the port's +3 is pinned (the record's
 *         "tap+4": its tap is logged one frame before the pad shows it).
 *   (v)   R1 with X not held (r1noX-6-1..3): no round.
 * NOT pinned -- case (ii), R1 at M0+1 .. +4: OPEN. The record's "0 rounds, 12/12" is a harness artefact (research 451 §4):
 * no claim either way is made here.
 *
 * The rig: the real `mountFirearm` and its real `Fire`, the real `InventoryMenu` under `Goldeneye` fed as the pages feed it
 * (`triggerFeed` before `frame`, `main.ts` / `matchMount.ts`), one page frame a game frame (`GAME_FRAME_DT`). STAND-INS,
 * named: the hands are `matchThrow.ts`'s two `firearmReadyAt` lines alone (the press taken while the firearm is still
 * coming back up; `heldPulls` null until then -- their text pinned below), on the rig's own clock in place of
 * `performance.now()`, the lower's end at the confirm + `launcherLowerSeconds(0)` (the real one); the inventory's gate
 * (`kitChangeGate`) is closed while the lower plays (`WalkMode.swapGate`) or X is held (`SWAP_HELD_EDGE_READING`); the
 * rifle's raise reads up (it is, 5-7 frames after M0 in the record, long before the lower's end).
 */

afterEach(() => { vi.restoreAllMocks(); controllerConfigs.reset(); });

/** The lower's confirm, in game frames before M0 (the record: the confirm's R1 on the pad at M0-1 or M0-2). */
const CONFIRM_BEFORE_M0 = 2;

const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) };
const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [wall],
  [{ modelName: wall.modelName, path: `${wall.path}0`, first: 0, count: 1 }]);

/**
 * One trial: X held from M0 (or never), R1 down for the one game frame M0 + `r1` (or never); 150 frames past M0, as the
 * record's. Returns each round's frame from M0 and whether each R1 was refused.
 */
function trial(r1: number | null, x = true): { rounds: number[]; refused: boolean[] } {
  controllerConfigs.select('Goldeneye');
  let t = 0, lane: Input = noInput();
  const readyAt = launcherLowerSeconds(0);                       // from the confirm, the rig's clock 0
  const hands: FirearmHands = {
    launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
    putAway: () => {}, spawned: () => {}, launched: () => {}, icon: () => null, magazine: () => null, mounted: () => false,
    trigger: (down) => down && t < readyAt,                      // matchThrow.ts: `if (down && performance.now() < firearmReadyAt) return true;`
    heldPulls: () => (t < readyAt ? null : 0),                   // matchThrow.ts: `... || performance.now() < firearmReadyAt) return null;`
  };
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const play = new Play();
  const firearm = mountFirearm({
    scene, fly, walk, play, remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(), view: () => null, map: () => null,
    body: () => null, net: () => null, blocked: () => false, refreshFog: () => {}, hands,
  });
  vi.spyOn(walk, 'mode').mockReturnValue('walk');
  vi.spyOn(walk, 'fireAllowed').mockReturnValue(true);
  vi.spyOn(walk, 'fireAim').mockReturnValue({ eye: [0, 20, 0], far: [0, 20, -1000] });
  vi.spyOn(walk, 'grid').mockReturnValue(grid);
  const stats = play.weaponStats();
  vi.spyOn(play, 'weaponStats').mockReturnValue({ ...stats, raise: { ...stats.raise, weight: 1 } });
  for (let i = 0; i < 6 && firearm.fireMode() !== 1; i++) firearm.switchFireMode();
  expect(firearm.fireMode(), 'the rifle on single, as the record\'s').toBe(1);
  const record = firearm.fire.weaponRecord();
  firearm.fire.takeWeapon(record, [record.magazine, record.magazine]);
  const menu = new InventoryMenu({
    kit: () => ({ count: 5, current: 0, takeable: (s: number) => s !== 4 }), alive: () => true,
    canChange: () => t >= readyAt && !lane.fire,
    take: () => true, icon: () => null, info: () => null, clock: () => t,
  } as never);
  const rounds: number[] = [], refused: boolean[] = [];
  let g = -CONFIRM_BEFORE_M0;
  firearm.fire.subscribe((e: FireEvent) => { if (e.type === 'round') rounds.push(g); });
  for (; g <= 150; g++) {
    t = (g + CONFIRM_BEFORE_M0) * GAME_FRAME_DT;
    const now: Input = { ...noInput(), fire: x && g >= 0, inventory: r1 !== null && g === r1 };
    const fed = menu.triggerFeed(lane, now, true);               // main.ts / matchMount.ts: on the reach, before `frame`
    if (fed !== null) firearm.trigger(fed);
    if (now.inventory && !lane.inventory) refused.push(!menu.isOpen());
    menu.frame(lane, now, GAME_FRAME_DT);
    if (now.inventory && !lane.inventory) refused[refused.length - 1] = refused[refused.length - 1]! && !menu.isOpen();
    lane = now;
    firearm.fireFrame(GAME_FRAME_DT, true);
  }
  firearm.dispose?.();
  return { rounds, refused };
}

describe('BUG-SURESHOT-READY (LATER 1354): SURE SHOT, the launcher lowered to the rifle with X held (the LAW record, a trace of the original, unscored)', () => {
  it('the stand-in hands are matchThrow.ts\'s two firearmReadyAt lines, and the lower\'s end is M0+41 at the game frame', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchThrow.ts'), 'utf8');
    expect(src).toContain('if (down && performance.now() < firearmReadyAt) return true;');
    expect(src).toContain('|| performance.now() < firearmReadyAt) return null;');
    expect(src).toContain('if (!on) firearmReadyAt = performance.now() + launcherLowerSeconds(from) * 1000;');
    // 1.5 x (34/35)^2 s from the confirm: the first game frame at or past it, less the confirm's two before M0
    expect(Math.ceil(launcherLowerSeconds(0) / GAME_FRAME_DT - 1e-9) - CONFIRM_BEFORE_M0).toBe(41);
  });

  it('(i) X held from M0, no R1: ONE round, at the lower\'s end (M0+41), none before (the record: M0+42, M0+43)', () => {
    expect(trial(null).rounds).toEqual([41]);
  });

  it.each([5, 6, 10, 20, 30])('(iii) a refused R1 at M0+%i, X held: still ONE round at the lower\'s end, no extra (the record: one, M0+41 .. +44)', (r1) => {
    const got = trial(r1);
    expect(got.refused).toEqual([true]);
    expect(got.rounds).toEqual([41]);
  });

  it.each([45, 60])('(iv) a refused R1 at M0+%i, after the held round: ONE extra round, 3 frames after R1\'s first frame down (the record: +3 in 3 of 4, +4 in r1-60-2)', (r1) => {
    const got = trial(r1);
    expect(got.refused).toEqual([true]);
    expect(got.rounds).toEqual([41, r1 + 3]);
  });

  it('(v) R1 with X not held: no round (the record: r1noX-6, 0 of 3)', () => {
    expect(trial(6, false).rounds).toEqual([]);
    expect(trial(60, false).rounds).toEqual([]);
  });
});
