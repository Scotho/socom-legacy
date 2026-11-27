// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { EMPTY_ITEM, HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { WalkMode } from '../src/walk';

/**
 * R4P-251 (the r0004 parity queue, `docs/atlas/handover/r0004-parity-ready-queue.md`; lead L383; simulation track,
 * reading, pending review): online, a mission's close clears the saved fire modes, and the next mission's spawns take
 * OT.R100's default.
 *
 * - r0004: online (`DAT_0045d481`, D4:L160083-160085) CMission::Close `r0004:0x002acda0` calls r4 `0x5d0920`
 *   (D4:L160084), which resets the 30 saved fire-mode records at `0x66af00` to mode 0 and weapon id 0xff
 *   (D4:L523727-523752). Close's only caller is the mission unload, not a round end. Within a mission the records are
 *   saved at each round's exit and restored online at spawn (FirstFrame D4:L517963-518005).
 * - OT.R100 (`socomlegacy/docs/MISSION.md`; the owner, 2026-11-03): every weapon with full auto comes up on it
 *   (`DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION`, `defaultFireMode`, `../src/accuracy`); the player's L3 switch overrides,
 *   kept per slot across respawns while the weapon is unchanged. It says nothing of a mission's close.
 * - The controller's ruling (seat-controller-q, 2026-11-23): follow the clear -- at a mission's close the saved modes
 *   clear, and the next mission's spawns take OT.R100's default (not r0004's mode 0, which OT.R100 replaces).
 *
 * The port's mission close: the match mount's teardown (`./matchMount` `teardown` -> `firearm.dispose()`), and the next
 * mission is a new mount (`prepareMount` builds a new `PlayerLoadout` and a new `mountFirearm`, whose `fireModes` are
 * made afresh at OT.R100's default). A round's end online is the room's respawn of the page on the same mount
 * (`./matchNet` `respawned` -> `firearm.spawnKit(side, kit, type)`). Without fixture tables the kit's records are the
 * baked pair (`./loadout` `NO_FIREARM_RECORD_PLACEHOLDER`): the M4A1 SD (modes 1-3, full auto) and the Mark 23 (semi only).
 *
 * Scope (review 1, F1): the claim is the GAME path's only -- the front end's match, one mount per game. The exception,
 * put to the controller and not changed here: on /testroom one firearm lives for the page (`./main` `mountFirearm`),
 * and against an unheld dedicated room the game over runs `startRound(matchOver)` on the same pages
 * (`DEDICATED_NEXT_MATCH_ADAPTATION`, `match/src/room.ts`; research 101 B14), so an L3 mode is kept across matches there.
 *
 * What the tests prove (review 1, F2 and F4): (1) holds the L3 choice across a respawn on one mount. (2) and (3) are a
 * regression pin: no fire-mode state lives at module level, and none crosses a fresh mount. They do NOT prove that the
 * port's lifecycle releases the mount at a game's end -- each builds its own new mount, and the `dispose()` calls do not
 * affect their result. No red exists (the port already meets it), so they are not a discriminating proof of the clear.
 * (4) pins only the text of `./matchMount` (a firearm and a loadout made inside `prepareMount`, disposed at `teardown`).
 *
 * The lifecycle chain is held elsewhere (review 1, F3): a game's end releasing the mount, by `./lobbyMatch.test.ts`'s
 * ONL-20b cases -- "ONL-20b: the room's returned view after GAME COMPLETE ends the match -- the same game's lobby, the
 * client open and handed back, the hold kept" and its two "ONL-20b (review)" cases (a socket welcomed again after the
 * last roundOver; a page still loading when the returned view comes). The front end's launch reaching `prepareMount`
 * (`./frontEnd` `l.mount` -> `matchLoader`): no test found that holds it -- `./frontEndMatch.test.ts` holds a launch
 * reaching the match phase, not which mount runs, and `./matchMount.test.ts` calls `prepareMount` and `matchLoader`
 * directly.
 */

afterEach(() => { vi.restoreAllMocks(); });

/** The kit the room names at each spawn: the baked rifle and sidearm, two grenades, an empty slot -- the same weapon each time. */
const KIT = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 126, EMPTY_ITEM] as const;
const AUTO = 3, SEMI = 1;

/** One mission's match mount: a fresh loadout and firearm, as `prepareMount` builds them; online (the network on). */
function mission() {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const loadouts = new PlayerLoadout();
  const firearm = mountFirearm({
    scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts,
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
    network: () => true,
  });
  const spawn = vi.spyOn(loadouts, 'spawn');
  return { firearm, loadouts, spawn };
}

/** The room's spawn of the page (a round start online, `respawned`): asserts it ran and put the rifle in the hand. */
function spawnRound(m: ReturnType<typeof mission>): void {
  const calls = m.spawn.mock.calls.length;
  m.firearm.spawnKit('seal', KIT);
  expect(m.spawn.mock.calls.length, 'the spawn ran').toBe(calls + 1);
  expect(m.spawn).toHaveBeenLastCalledWith('seal', { network: true, kit: KIT, type: null });
  expect(m.firearm.item(), 'the rifle in the hand at the spawn').toBe('rifle');
  expect(m.firearm.fire.weaponRecord().id, 'the rifle is the M4A1 SD').toBe(HELD_RIFLE.id);
}

/** Each slot's mode as the page reads it: the rifle's, then the sidearm's (taken up and put back), the rifle left in the hand. */
function slotModes(m: ReturnType<typeof mission>): { rifle: number; pistol: number; pistolId: number } {
  const rifle = m.firearm.fireMode();
  m.firearm.kit.place('pistol');
  expect(m.firearm.item(), 'the sidearm in the hand to read its mode').toBe('pistol');
  const pistol = m.firearm.fireMode(), pistolId = m.firearm.fire.weaponRecord().id;
  m.firearm.kit.place('rifle');
  expect(m.firearm.item()).toBe('rifle');
  return { rifle, pistol, pistolId };
}

describe('R4P-251: the saved fire modes across rounds and across a mission close (OT.R100, D4:L160083-160085)', () => {
  it('(1) online, an L3 choice away from the default holds into the next round with the same weapon', () => {
    const m = mission();
    spawnRound(m);
    expect(m.firearm.fireMode(), 'the first spawn: OT.R100 full auto').toBe(AUTO);
    expect(m.firearm.switchFireMode(), 'L3 steps AUTO to SEMI').toBe('SEMI');
    expect(m.firearm.fireMode()).toBe(SEMI);
    spawnRound(m);                                                    // the round ends; the next round spawns
    expect(m.firearm.fireMode(), 'the L3 choice kept across the respawn (OT.R100)').toBe(SEMI);
    expect(m.firearm.fireModeName()).toBe('SEMI');
    const modes = slotModes(m);
    expect(modes.rifle).toBe(SEMI);
    expect(modes.pistolId).toBe(HELD_SIDEARM.id);
    expect(modes.pistol, 'the Mark 23: semi only').toBe(SEMI);
  });

  it('(2) the mission closes; the next mission first spawn has every slot at the OT.R100 default', () => {
    const first = mission();
    spawnRound(first);
    first.firearm.switchFireMode();
    expect(first.firearm.fireMode(), 'a mode saved away from the default').toBe(SEMI);
    spawnRound(first);
    expect(first.firearm.fireMode()).toBe(SEMI);
    first.firearm.dispose();                                          // the mission close: the match mount torn down

    const next = mission();
    expect(next.spawn, 'no spawn yet in the new mission').not.toHaveBeenCalled();
    spawnRound(next);                                                 // the new mission first spawn
    const modes = slotModes(next);
    expect(modes.rifle, 'the rifle at OT.R100 full auto').toBe(AUTO);
    expect(next.firearm.fireModeName()).toBe('AUTO');
    expect(modes.pistolId).toBe(HELD_SIDEARM.id);
    expect(modes.pistol, 'the sidearm at its default (no full auto: its only mode)').toBe(SEMI);
  });

  it('(3) the same weapon in the new mission is not carried over: its mode is the default, and L3 steps from there', () => {
    const first = mission();
    spawnRound(first);
    first.firearm.switchFireMode();
    first.firearm.switchFireMode();                                   // AUTO -> SEMI -> BURST
    expect(first.firearm.fireMode(), 'BURST saved in the first mission').toBe(2);
    const weapon = first.firearm.fire.weaponRecord().id;
    first.firearm.dispose();

    const next = mission();
    spawnRound(next);
    expect(next.firearm.fire.weaponRecord().id, 'the same weapon').toBe(weapon);
    expect(next.firearm.fireMode(), 'not carried: the default').toBe(AUTO);
    expect(next.firearm.fireMode()).not.toBe(2);
    expect(next.firearm.switchFireMode(), 'L3 from the default').toBe('SEMI');
    spawnRound(next);
    expect(next.firearm.fireMode(), 'and the new choice holds across its rounds').toBe(SEMI);
  });

  it('the port wiring: one firearm per match mount, disposed at its teardown (the mission close)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf8');
    const prepare = src.indexOf('export function prepareMount(');
    const loader = src.indexOf('export function matchLoader(');
    const made = src.indexOf('mountFirearm({', prepare);
    const loadout = src.indexOf('new PlayerLoadout()', prepare);
    expect(prepare).toBeGreaterThan(-1);
    expect(made, 'mountFirearm built inside prepareMount').toBeGreaterThan(prepare);
    expect(made).toBeLessThan(loader);
    expect(loadout, 'a fresh PlayerLoadout per mount').toBeGreaterThan(prepare);
    expect(loadout).toBeLessThan(loader);
    const teardown = src.indexOf('const teardown = (): void => {', prepare);
    expect(teardown).toBeGreaterThan(-1);
    expect(src.indexOf('firearm.dispose();', teardown), 'the teardown disposes the firearm').toBeGreaterThan(teardown);
    expect(src.indexOf('firearm.dispose();', teardown)).toBeLessThan(loader);
  });
});
