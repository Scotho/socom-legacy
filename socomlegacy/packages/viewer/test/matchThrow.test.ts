import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { LAUNCH_REPORT_KIT_READING, LAUNCHER_PULL_WAIT_READING, mountThrowables, TAKE_UP_FADE_READING, type MatchThrowDeps } from '../src/matchThrow';
import { RAISE_REFUSAL_FRAMES, RaiseFeed, WeaponRaise, type ItemRaise } from '../src/weaponRaise';
import { GameAudio } from '../src/audio';
import { soundFromDisc } from '../src/soundData';
import { PART_DEPS } from '../src/matchNet';
import { PlayerLoadout } from '../src/loadout';
import { WhiteOut } from '../src/flash';
import { arsenalOf, buildGrid, CLAYMORE_RULES, GAME_FRAME_DT, GameFrameAccumulator, IDENTITY, M67, THROW_ANIMS, partMatrix, readKitTable, sampleClip, Skeleton, type Grid, type GridParams, type KitRound, type KitTable, type Loadout, type MotionClip, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { Animator, blendWeight, quatOfMatrix, slerp, type PoseLayer } from '../src/animator';
import type { MotionEntry } from '../src/motionTable';
import { moverSnapshot, TICK, Walker, type ActionEnd, type HoldClip, type WalkInput } from '../src/walk';
import { ThrowPose } from '../src/throwPose';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { KitRounds } from '../src/firearms';
import { launcherKitRounds } from '../src/net/pickupRules';
import { Hud, MESSAGE_SCALE } from '../src/hud';
import { refusalLine } from '../src/matchMessages';
import { meterPower } from '../src/reticle';

/**
 * MATCH-THROW (web research 222 §8): the throwables, the launcher and the R2 inventory that selects them -- written once
 * in `./matchThrow` and mounted by both pages (`/testroom`'s `./main` and the front end's `./matchMount`), where they
 * were `main.ts`'s module-level wiring. `/testroom`'s own tests are the proof its behaviour is unchanged; these pin the
 * module's shape and each page's calls.
 */

const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');

/** The module on fakes: a scene, a walk with no grid, a play with no body, a firearm that records the calls. */
function rig(extra: Partial<MatchThrowDeps> = {}) {
  const calls: string[] = [];
  const scene = new Scene();
  const thrown: string[] = [];
  const stick: ((from: 0 | 1) => void)[] = [];
  const net = { throwEvent: (kind: string) => { thrown.push(kind); }, client: { bodies: () => [] } };
  const firearm = {
    shotRumble: () => {},                              // CTL-2: the hands' fire step's motors
    fire: { release: () => { calls.push('release'); }, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
    zoom: { state: () => 1 },
    kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
    setZoom: (s: number) => { calls.push(`setZoom(${s})`); },
    showFireMode: () => { calls.push('showFireMode'); },
    item: () => 'rifle', record: () => ({ name: 'M4A1' }), records: () => [{}, {}], icon: () => 'm4.tif',
    selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
  };
  const deps: MatchThrowDeps = {
    scene,
    walk: {
      grid: () => null, snapshot: () => null, view: () => ({}) as never, fireAim: () => null, feet: () => null, drawnFeet: () => null,
      hold: () => {}, mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true, onActionEnd: () => () => {},
      launcherRaised: () => { calls.push('launcherRaised'); }, launcherLowered: (from: number) => { calls.push(`launcherLowered(${from})`); },
      launcherCleared: () => { calls.push('launcherCleared'); },
      onLauncherStickLower: (f: (from: 0 | 1) => void) => { stick.push(f); return () => {}; },   // PAR-83
    } as never,
    fly: { shakeScreen: () => {} },
    play: {
      partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
      setRifleStowed: () => {}, addPoseLayer: () => { calls.push('addPoseLayer'); },
    } as never,
    loadouts: new PlayerLoadout(),
    view: () => null, map: () => null,
    net: () => net as never,
    firearm: () => firearm as never,
    audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as never,
    ...extra,
  };
  const t = mountThrowables(deps);
  return { t, scene, calls, thrown, deps, stick };
}

describe('the throwables part (./matchThrow): the grenades, the launcher and the R2 inventory, one wiring', () => {
  it('keeps duplicate slot identity through the quick-menu count, confirmation and shoulder binding (research 361)', () => {
    const { t, deps } = rig();
    deps.loadouts.take([54, 15, 121, 121, 126]);
    (deps.walk as unknown as { gridOfGround: () => null }).gridOfGround = () => null;
    (deps.walk as unknown as { snapshot: () => unknown }).snapshot = () => ({
      feet: [0, 50, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
    });
    t.grenade.setKit(['M67', 'M67', 'HE']);
    expect(t.takeSlot(3)).toBe(true);
    expect(t.inventoryCurrent()).toBe(3);
    t.inventory.key('KeyI');
    for (let n = 0; n < 60; n++) t.inventory.frame({} as never, {} as never, 1 / 60);
    const count = () => t.inventory.layout().items.filter(i => i.kind === 'text').map(i => i.text);
    expect(count()).toContain('3/3');
    t.inventory.key('PageUp');
    expect(t.inventory.binds().l1).toBe(3);
    t.inventory.key('Enter');
    expect(t.inventoryCurrent()).toBe(3);
    expect(t.grenade.throwNow(1)?.slot).toBe(3);
    t.grenade.update(2);
    expect(t.equipmentMagazine()).toEqual({ rounds: 2, capacity: 3, spare: 0, reloading: false });
    t.takeSlot(2);
    expect(t.equipmentMagazine()?.rounds).toBe(3);
    expect(t.takeSlot(t.inventory.binds().l1)).toBe(true);
    expect(t.inventoryCurrent()).toBe(3);
    expect(t.equipmentMagazine()?.rounds).toBe(2);
    t.inventory.key('KeyI');
    for (let n = 0; n < 60; n++) t.inventory.frame({} as never, {} as never, 1 / 60);
    expect(count()).toContain('2/3');
  });

  it('mounts its objects on the scene and its throw clip over the body once', () => {
    const { t, scene, calls } = rig();
    expect(t.grenade.object.parent).toBe(scene);
    expect(calls.filter((c) => c === 'addPoseLayer')).toHaveLength(1);
  });

  it('the hands: the page\'s other owner (the turret) takes the trigger first; then the launcher, then a throwable', () => {
    const { t } = rig();
    const pull = vi.spyOn(t.grenade, 'pull');
    vi.spyOn(t.grenade, 'equipped').mockReturnValue(true);
    let turret = true;
    const hands = t.hands({ trigger: () => turret, magazine: () => null, mounted: () => false });
    expect(hands.trigger(true)).toBe(true);
    expect(pull).not.toHaveBeenCalled();                                                    // the turret's
    turret = false;
    expect(hands.trigger(true)).toBe(true);
    expect(pull).toHaveBeenCalledTimes(1);                                                  // the throwable's
    expect(t.hands().mounted()).toBe(false);                                                // no page part: not mounted
  });

  it("PAR-55 (research 215 s8): mounted, the box's icon and fire mode are the page's (the turret's HUDW icon, its mode) before an item's; else the item's, and no mode", () => {
    const { t } = rig();
    vi.spyOn(t.grenade, 'icon').mockReturnValue('grenade_frag_icon.tif');
    let held = true;
    const hands = t.hands({ icon: () => (held ? 'turret_rmg.tif' : null), fireMode: () => (held ? 3 : null), mounted: () => held });
    expect([hands.icon(), hands.fireMode?.()]).toEqual(['turret_rmg.tif', 3]);
    held = false;
    expect([hands.icon(), hands.fireMode?.()]).toEqual(['grenade_frag_icon.tif', null]);
    expect(t.hands().fireMode?.()).toBeNull();                                               // no page part: none
  });
  it("PAR-56 (research 215 s8): mounted, the turret weapon's id is the page's (the fire-mode row's class); else none", () => {
    const { t } = rig();
    let held = true;
    const hands = t.hands({ weapon: () => (held ? 230 : null), mounted: () => held });
    expect(hands.weapon?.()).toBe(230);
    held = false;
    expect(hands.weapon?.()).toBeNull();
    expect(t.hands().weapon?.()).toBeNull();                                                 // no page part: none
  });

  it("TURRET-AMMO (#284): R is the page's first (the turret's reload while mounted); none taken without a page part", () => {
    const { t } = rig();
    let held = true;
    const hands = t.hands({ reload: () => held, mounted: () => held });
    expect(hands.reload?.()).toBe(true);
    held = false;
    expect(hands.reload?.()).toBe(false);
    expect(t.hands().reload?.()).toBe(false);                                                // no page part: the rifle's
  });

  it('the throwables\' NetPage hooks: every one PART_DEPS lists, each onto the grenade page', () => {
    const { t } = rig();
    const d = t.netDeps();
    expect(Object.keys(d).sort()).toEqual([...PART_DEPS.throwables, 'roundEndEffects'].sort());   // ROUND_END_EFFECTS_READING: optional, handed with them
    const giveBack = vi.spyOn(t.grenade, 'giveBack'), launch = vi.spyOn(t.grenade, 'launchRemote');
    d.staleThrow?.('M67');
    expect(giveBack).toHaveBeenCalledWith('M67');                                          // LOW-2: the item back
    d.staleThrow?.('M67', 3);
    expect(giveBack).toHaveBeenCalledWith('M67', 3);                                       // MLS-EQ: the exact duplicate
    d.remoteGrenade('M67', [0, 0, 0], [0, 1, 0], 3, 9, undefined);
    expect(launch).toHaveBeenCalledWith('M67', [0, 0, 0], [0, 1, 0], 3, { pid: 9 }, undefined);
    launch.mockImplementation(() => undefined);                                            // the call only: no hull here
    d.remoteGrenade('M67', [0, 0, 0], [0, 1, 0], 3, 10, undefined, 30);                    // LATER 643: the room's age
    expect(launch).toHaveBeenLastCalledWith('M67', [0, 0, 0], [0, 1, 0], 3, { pid: 10 }, 30);
    expect(d.ownProjectiles?.()).toBe(false);
  });

  it("RED: LATER 503 -- a stale throw of a rocket's round gives it back on the launcher by its shot; a throwable still to the pouch", () => {
    const { t } = rig();
    const refund = vi.fn(() => true);
    (t.rocket as unknown as { refund: typeof refund }).refund = refund;
    const giveBack = vi.spyOn(t.grenade, 'giveBack');
    const stale = t.netDeps().staleThrow as (kind: string, slot?: number, shot?: number) => void;
    stale('LAW HEAT', undefined, 4);
    expect(refund).toHaveBeenCalledWith(4);                         // today: giveBack('LAW HEAT'), false
    stale('M67', 2);
    expect(giveBack).toHaveBeenLastCalledWith('M67', 2);
    giveBack.mockRestore();
  });

  // P4 (the online-parity sweep's TB-10 + WK-1; the network's bookkeeping, no original): a carrier's round (class 171-184,
  // a fire mode of the rifle, research 94 §C4.2) is spent from the firearm's journal (`Fire.launch`), so its `stale`
  // gives it back there (`Fire.refundRound`) by its shot -- the rocket's journal ids are another count; a rocket's still
  // back on the launcher, a throwable's to the pouch.
  it("RED: P4 -- a stale throw of a carrier's round gives it back on the firearm by its shot; a rocket's on the launcher, a throwable's to the pouch", () => {
    const loadouts = new PlayerLoadout();
    const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
      ['InternalName', ['M203 FRAG'], 'ID', ['175'], 'Ammo_Capacity', ['6'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]],
      ['InternalName', ['LAW HEAT'], 'ID', ['185'], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]],
    ]] as never);
    vi.spyOn(loadouts, 'tables').mockReturnValue({ arsenal } as unknown as KitTable);
    const { t, deps } = rig({ loadouts });
    const refundRound = vi.fn(() => true), refund = vi.fn(() => true);
    (deps.firearm() as unknown as { fire: { refundRound: typeof refundRound } }).fire.refundRound = refundRound;
    (t.rocket as unknown as { refund: typeof refund }).refund = refund;
    const giveBack = vi.spyOn(t.grenade, 'giveBack');
    const stale = t.netDeps().staleThrow as (kind: string, slot?: number, shot?: number) => void;
    stale('M203 FRAG', undefined, 9);
    expect(refundRound.mock.calls).toEqual([[9]]);                  // today: rocket.refund(9) -- the launcher's journal
    expect(refund).not.toHaveBeenCalled();
    stale('LAW HEAT', undefined, 4);
    expect(refund.mock.calls).toEqual([[4]]);
    stale('M67', 2);
    expect(giveBack).toHaveBeenLastCalledWith('M67', 2);
    expect(refundRound.mock.calls).toEqual([[9]]);
    giveBack.mockRestore();
  });

  it('a throw goes to the room through NetPage.throwEvent', () => {
    const { t, thrown } = rig();
    (t.grenade as unknown as { emit(k: string, i: unknown): void }).emit('throw', { item: 'M67', from: [0, 0, 0], velocity: [0, 0, 1], fireAnim: 'frag_start', sound: '.THROW_OBJECT ' });
    expect(thrown).toEqual(['M67']);
  });

  it("CTL-2 (the review's N2): the own throw hands its record's Rumble_Modifiers to the firearm's fire step; another's release does not", () => {
    const base = rig();
    const rumbles: unknown[] = [];
    const firearm = { ...(base.deps.firearm() as unknown as Record<string, unknown>), shotRumble: (r: unknown) => { rumbles.push(r); } };
    const { t } = rig({ firearm: () => firearm as never });
    const g = t.grenade as unknown as { emit(k: string, i: unknown): void };
    g.emit('throw', { item: 'M67', from: [0, 0, 0], velocity: [0, 0, 1], fireAnim: 'frag_start', sound: '.THROW_OBJECT ' });
    expect(rumbles).toEqual([{ small: Math.fround(0.04), large: { time: Math.fround(0.18), power: 175 } }]);   // the M67's, on the disc
    g.emit('remoteRelease', { item: 'M67', id: 0x79, fireAnim: 'frag_start', from: [1, 2, 3], owner: 7 });
    expect(rumbles).toHaveLength(1);                                   // another's throw: no rumble on this pad
  });

  // j5t3o2iU (the owner's report, 2026-11-02: "a smoke throw vibrates as if hit by a grenade"). The release's fire step
  // runs for every throwable by its own record (`FUN_005c5340` D:L479540-479543 -> `FUN_005c3360` D:L477739-477751, no
  // item test), and every throwable's record on the disc is the M67's 0.04 / 0.18 / 175 (`weaponTable.parity.test.ts`):
  // a smoke's release rumbles as a frag's does -- the original's. Its pop rumbles nothing, and the camera's blast point
  // (`FUN_003c8330` D:L319186-319195) is never set for a smoke (122, 127) or a flash (123): no shake either.
  it("j5t3o2iU: the own smoke's and flash's release rumble by their records, the M67's same pulse -- the original's fire step", () => {
    const base = rig();
    const rumbles: unknown[] = [];
    const firearm = { ...(base.deps.firearm() as unknown as Record<string, unknown>), shotRumble: (r: unknown) => { rumbles.push(r); } };
    const { t } = rig({ firearm: () => firearm as never });
    const g = t.grenade as unknown as { emit(k: string, i: unknown): void };
    const want = { small: Math.fround(0.04), large: { time: Math.fround(0.18), power: 175 } };
    for (const item of ['M67', 'AN-M8', 'Mark141', 'HE']) {
      g.emit('throw', { item, from: [0, 0, 0], velocity: [0, 0, 1], fireAnim: 'frag_start', sound: '.THROW_OBJECT ' });
    }
    expect(rumbles).toEqual([want, want, want, want]);
  });

  it("j5t3o2iU: a smoke's or a flash's pop shakes nothing (CAMERA_BLAST_EXEMPT_ITEMS, FUN_003c8330 D:L319186-319191); a frag's shakes by distance; no pop rumbles", () => {
    const shakes: unknown[] = [];
    const rumbles: unknown[] = [];
    const base = rig();
    const firearm = { ...(base.deps.firearm() as unknown as Record<string, unknown>), shotRumble: (r: unknown) => { rumbles.push(r); }, hurt: () => { rumbles.push('hurt'); } };
    const { t } = rig({ fly: { shakeScreen: (s: unknown) => { shakes.push(s); } }, firearm: () => firearm as never });
    const g = t.grenade as unknown as { emit(k: string, i: unknown): void };
    const pop = (item: string) => ({ pos: [0, 0, 0], radius: 0, anim: 'x', baseAnim: 'x', material: null, distanceToPlayer: 50, damageToPlayer: 0, item, detonation: null, flash: null, byEffects: true });
    g.emit('explode', pop('AN-M8'));
    g.emit('explode', pop('Mark141'));
    expect(shakes).toEqual([]);
    g.emit('explode', pop('M67'));
    g.emit('explode', pop('HE'));
    expect(shakes).toHaveLength(2);                                    // within 100 u: the big preset (research 83)
    expect(rumbles).toEqual([]);                                       // a pop drives no motor (the hurt is the room's)
  });

  it("research 304: the throw's FireAnimName alone (no stand-in); another's accepted release heard at its origin, with the warning hook", () => {
    const cues: [string, unknown][] = [], played: string[] = [], warned: unknown[] = [];
    const { t } = rig({
      audio: { onAnimCallback: (n: string, at: unknown) => { cues.push([n, at]); return null; }, play: (n: string) => { played.push(n); } } as never,
      warning: (r) => { warned.push(r); },
    });
    const g = t.grenade as unknown as { emit(k: string, i: unknown): void };
    g.emit('throw', { item: 'M67', from: [0, 0, 0], velocity: [0, 0, 1], fireAnim: 'frag_start', sound: '.THROW_OBJECT ' });
    // PAR-77 (research 251 s12.7): the rig's view state is 1, first person -- the release's `_zoom` pick, none on the disc.
    expect(cues).toEqual([['frag_start_zoom', [0, 0, 0]]]);
    expect(played).toEqual([]);                                       // the callback missing: silent, no `.THROW_OBJECT` played
    g.emit('remoteRelease', { item: 'M67', id: 0x79, fireAnim: 'frag_start', from: [1, 2, 3], owner: 7 });
    expect(cues.at(-1)).toEqual(['frag_start', [1, 2, 3]]);
    expect(warned).toEqual([{ id: 0x79, owner: 7, from: [1, 2, 3] }]);
  });
  it("both pages hear a teammate's warning through the sound part (research 304)", () => {
    for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).toMatch(/warning: \(r\) => \{ sound\.grenadeWarning\(r\); \},/);
  });

  /**
   * `character.action.windup-selection`, the mount's half (research 251 s4.1, s8): the page's shoulder gate asks the
   * throw only -- `hands.busy` is phase 'throwing' (`FUN_005a8cb0` sees no wind-up) and `takeSlot` refuses only then;
   * during the wind-up (`FUN_00594cf0` D:L453288-453310) another slot is taken and the power zeroed (`FUN_005c4b10`
   * D:L478905-478915 -> `FUN_00592d40` D:L451964), nothing thrown. The real GrenadeThrower under the rig's fakes.
   */
  it('a shoulder press through mountThrowables: in the wind-up the hands are not busy and another slot is taken, the power zeroed and nothing thrown; once thrown, busy and refused', () => {
    const { t, thrown, deps } = rig();
    (deps.walk as unknown as { snapshot: () => unknown }).snapshot = () => ({
      feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
    });
    const throws: string[] = [];
    t.grenade.on('throw', (info) => { throws.push(info.item); });
    t.grenade.setKit(['M67', 'AN-M8', null]);
    const hands = t.hands();
    expect(t.takeSlot(2)).toBe(true);                                                      // slot 2: the kit's first, M67
    expect(t.grenade.held()).toBe('M67');
    const left = t.grenade.stats().leftByItem.M67;
    expect(left).toBeGreaterThan(0);
    expect(hands.trigger(true)).toBe(true);                                                // the pin pulled: the wind-up
    t.grenade.update(0.25);
    expect(t.grenade.phase()).toBe('holding');
    expect(t.grenade.stats().power).toBeGreaterThan(0);
    expect(hands.busy()).toBe(false);
    expect(t.takeSlot(3)).toBe(true);                                                      // AN-M8 taken in the wind-up
    expect(t.grenade.held()).toBe('AN-M8');
    expect(t.grenade.phase()).toBe('ready');
    expect(t.grenade.stats().power).toBe(0);
    for (let k = 0; k < 60; k++) t.grenade.update(1 / 60);
    expect(throws).toEqual([]);
    expect(thrown).toEqual([]);
    expect(t.grenade.stats().leftByItem.M67).toBe(left);                                  // nothing spent
    // The release: the throw under way, the hands busy and the press refused, the slot kept.
    hands.trigger(true);
    t.grenade.update(1);
    hands.trigger(false);
    t.grenade.update(1 / 60);
    expect(t.grenade.phase()).toBe('throwing');
    expect(hands.busy()).toBe(true);
    expect(t.takeSlot(2)).toBe(false);
    expect(t.grenade.held()).toBe('AN-M8');
  });

  it('roundStart: the air and the scorches gone, the wash neutral (the room cleared its own)', () => {
    const { t } = rig();
    const air = vi.spyOn(t.grenade, 'clearAir'), scorches = vi.spyOn(t.grenade, 'clearScorches'), wash = vi.spyOn(t.whiteOut, 'stop');
    t.roundStart();
    expect(air).toHaveBeenCalled();
    expect(scorches).toHaveBeenCalled();
    expect(wash).toHaveBeenCalled();
  });

  it('ROUND_END_EFFECTS_READING (research 283 §9): roundStart stops the effects playing -- the smokes pouring and every particle in the air', () => {
    const { t, deps } = rig();
    let cleared = 0;
    (deps.firearm() as unknown as { effects: unknown }).effects = { clearRound: () => { cleared++; } };
    const smokes = vi.spyOn(t.grenade, 'clearRoundEffects');
    t.roundStart();
    expect(smokes).toHaveBeenCalled();
    expect(cleared).toBe(1);
  });

  it("ROUND_END_EFFECTS_READING (the fold): netDeps().roundEndEffects stops the effects at the engine's read -- not the air, not the scorches", () => {
    const { t, deps } = rig();
    let cleared = 0;
    (deps.firearm() as unknown as { effects: unknown }).effects = { clearRound: () => { cleared++; } };
    const smokes = vi.spyOn(t.grenade, 'clearRoundEffects'), air = vi.spyOn(t.grenade, 'clearAir'), scorches = vi.spyOn(t.grenade, 'clearScorches');
    t.netDeps().roundEndEffects();
    expect(smokes).toHaveBeenCalled();
    expect(cleared).toBe(1);
    expect(air).not.toHaveBeenCalled();
    expect(scorches).not.toHaveBeenCalled();
  });

  it('warm: the throw\'s arc and the scorches handed to the page\'s prepare (research 90 #23)', async () => {
    const { t } = rig();
    const got: unknown[][] = [];
    await t.warm((objects) => { got.push([...objects]); });
    expect(got).toEqual([t.grenade.warmObjects()]);
  });

  it('dispose: off the scene, every listener off, the flash\'s wash stopped, the inventory closed, the map\'s assets gone', () => {
    const { t, scene, thrown } = rig();
    const stop = vi.spyOn(WhiteOut.prototype, 'stop'), setMap = vi.spyOn(t.grenade, 'setMap'), close = vi.spyOn(t.inventory, 'close');
    t.dispose();
    expect(t.grenade.object.parent).toBeNull();
    expect(scene.children).toHaveLength(0);
    expect(stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(setMap).toHaveBeenCalledWith(null, null);
    (t.grenade as unknown as { emit(k: string, i: unknown): void }).emit('throw', { item: 'M67', from: [0, 0, 0], velocity: [0, 0, 1], fireAnim: 'x', sound: 'x' });
    expect(thrown).toEqual([]);                                                            // its listener is gone
  });

  it('PAR-45 (research 283): the grenade\'s effect door hands the effects\' run handle, so clearSmokes stops a joiner\'s stream', () => {
    const { t, deps } = rig();
    const ran: string[] = [];
    let stopped = 0;
    (deps.firearm() as unknown as { effects: unknown }).effects = {
      play: () => false,
      run: (anim: string) => { ran.push(anim); return { name: anim, place: { position: [0, 0, 0] }, alive: () => stopped === 0, finished: false, stop: () => { stopped++; } }; },
    };
    t.netDeps().remoteGrenade('AN-M8', [40, 50, 40], [0, 0, 0], 2, 9, { state: 'detonated', age: 5, fuse: -2, removal: 35, bounces: 1, dud: false });
    expect(ran).toEqual(['smoke_stream']);
    expect(t.grenade.stats().smokes).toEqual([]);                                          // the effects', not the puffs
    t.grenade.clearSmokes();
    expect(stopped).toBe(1);
    t.dispose();
  });
});

describe('both pages mount the one throwables part, with the same calls', () => {
  it('main.ts and matchMount.ts call mountThrowables; neither makes a GrenadeThrower, RocketLauncher, ThrowPose, WhiteOut or InventoryMenu', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/mountThrowables\(\{/);
      expect(src(f), f).not.toMatch(/new (GrenadeThrower|RocketLauncher|ThrowPose|WhiteOut|InventoryMenu)\(/);
    }
  });
  it('each page hands the firearm its hands and NetPage its hooks from the part; both pages add the action part\'s turret first (the front end since ACT-1)', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/hands: throws\.hands\(actionHands\(\(\) => acts\)\),/);   // PAR-55: the action part's hands, one object
    }
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/\.\.\.throws\.netDeps\(\),/);
      expect(src(f), f).not.toMatch(/remoteGrenade: \(|ownProjectiles: \(|staleThrow: \(|tagOwnProjectile: \(|detonateProjectile: \(/);
    }
  });
  it('the frame\'s steps, the map\'s and the teardown in each page', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/throws\.poseFrame\(dt\)/);
      expect(src(f), f).toMatch(/throws\.frame\(dt, frameTime\.real\(\)\)/);   // PAR-34: the timed rules in real time
      expect(src(f), f).toMatch(/throws\.setMap\(built, /);
      expect(src(f), f).toMatch(/throws\.setMarks\(/);
      expect(src(f), f).toMatch(/throws\.warm\(/);
      expect(src(f), f).not.toMatch(/created\.prepare\(grenade\.warmObjects\(\)/);
    }
    expect(src('matchMount.ts')).toMatch(/throws\.dispose\(\)/);
  });
  it('the throwables\' NetPage hooks are written once, in matchThrow.ts', () => {
    const m = src('matchThrow.ts');
    expect(m).toMatch(/remoteGrenade: \([^)]*\) => grenade\.launchRemote\(/);
    expect(m).toMatch(/ownProjectiles: \(\) => grenade\.ownLive\(\),/);
    expect(m).toMatch(/staleThrow: \(kind, slot, shot\) =>/);   // LATER 503: a rocket's shot
    expect(m).toMatch(/tagOwnProjectile: \(kind, from, pid\) => grenade\.tagOwn\(kind, from, pid\),/);
    expect(m).toMatch(/detonateProjectile: \(pid\) => grenade\.detonateRemote\(pid\),/);
  });
  it('the part reads no page markup and never names ./main (OT.R12)', () => {
    const m = src('matchThrow.ts');
    expect(m).not.toMatch(/from '\.\/main'|document\.|getElementById/);
  });
});

/**
 * PAR-36 (c) (audit B's items 3-4, OT.R43): the claymore's refusal posted on the HUD's message line on both pages, through
 * the one shared line (`./matchMessages` `refusalLine`: `FUN_005be9a0` D:L475331, the text 0x65f880 in colour 2 on the
 * main window) -- `/testroom` showed it as the viewer's toast, a placeholder.
 */
describe('PAR-36 (c): both pages post the claymore\'s refusal on the HUD\'s message line (refusalLine)', () => {
  it('the part\'s refuse hook on refusalLine(hud): the thrower\'s refusal is one post on the HUD\'s window, the original\'s text in colour 2', () => {
    const hud = new Hud();
    const post = vi.spyOn(hud, 'postMessage');
    const { t } = rig({ refuse: refusalLine(hud) });
    (t.grenade as unknown as { emit(k: string, i: unknown): void })
      .emit('refuse', { item: 'Claymore', text: CLAYMORE_RULES.maxPlacedMessage, seconds: CLAYMORE_RULES.refuseSeconds });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith([{ text: 'Unable To Deploy: Max Equipment Items Placed (4)', scale: MESSAGE_SCALE, rgb: [0.5, 0.5, 0.75] }]);
    hud.dispose();
  });

  it('main.ts and matchMount.ts hand the part refusalLine(hud), imported from ./matchMessages; no toast, no placeholder left', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/import \{ refusalLine \} from '\.\/matchMessages';/);
      expect(src(f), f).toMatch(/refuse: refusalLine\(hud\),/);
      expect(src(f), f).not.toMatch(/refuse: \(text\) => \{ ui\.toast\(text\); \}/);
    }
    expect(src('main.ts')).not.toMatch(/\[placeholder: the viewer's toast\]/);
    expect(src('matchThrow.ts')).not.toMatch(/its toast, a placeholder/);
  });
});

// PAR-81 (research 230 section 5.2.6; PTW.R3 with roomEquipment.test's "PAR-81"): the launcher's set reaches the walk from
// the same `equip` that sends the room its `throw` (`room.ts` `raiseLauncher` / `lowerLauncher` at that event's seq), and a
// spawn's kit clears it after its own `equip` (the room's spawn holds no launcher).
// LATER 202 (struck: unreachable): the launcher up and the binoculars (view state 4) never hold together, in the original
// or on the page -- `FUN_00216770` drops `+0x200 > 1` to 1 while `FUN_005bd7e0` (the raised launcher's round mode) holds
// (D:L70387-70389), and `FUN_005445b0`'s state-1 gate refuses to step past 1 under it (D:L410792-410794). The page: the
// raise sets the view to 1 (`matchThrow.ts`'s equip) and `Zoom.setHold('launcher')` drops and holds it there
// (`zoom.test.ts`, 'a launcher-round mode and a raised LAW ...').
describe("LATER 202: the launcher's view hold -- a raise from the binoculars drops the view to first person", () => {
  it('raised from view 4, the page sets the zoom to 1', () => {
    const { t, calls, deps } = rig();
    (deps.firearm() as unknown as { zoom: { state: () => number } }).zoom.state = () => 4;   // the binoculars up
    (t.rocket as unknown as { emit(k: 'equip', on: boolean, id: number | null): void }).emit('equip', true, 145);
    expect(calls).toContain('setZoom(1)');
  });
});

describe("PAR-81: the launcher's set on the walk, from the equip the room hears", () => {
  it("a raise tells the walk launcherRaised and the room the launcher; a lower launcherLowered(the firearm) and the room the firearm; a spawn's kit launcherCleared last", () => {
    const { t, calls, thrown } = rig();
    const emit = (on: boolean, id: number | null): void => (t.rocket as unknown as { emit(k: 'equip', on: boolean, id: number | null): void }).emit('equip', on, id);
    emit(true, 145);
    expect(calls.filter((c) => c.startsWith('launcher'))).toEqual(['launcherRaised']);
    expect(thrown).toHaveLength(1);
    emit(false, null);
    expect(calls.filter((c) => c.startsWith('launcher'))).toEqual(['launcherRaised', 'launcherLowered(0)']);
    expect(thrown).toEqual([expect.any(String), 'M4A1']);
    (t.rocket as unknown as { held_: number | null }).held_ = 145;     // a launcher up at the spawn: its kit lowers it, then clears
    t.hands().spawned(new KitRounds(null, new PlayerLoadout().loadout()));
    expect(calls.filter((c) => c.startsWith('launcher')).slice(2)).toEqual(['launcherLowered(0)', 'launcherCleared']);
  });
});

// ARMING-GREY (issue #300; its review F3): the hands lend the raised launcher to the reticle's arming grey
// (`FirearmHands.launcher`, `matchFirearm.ts` `armingRecord`) -- dropped, the LAW's and RPG-7's grey would vanish unseen.
describe("ARMING-GREY: the hands lend the raised launcher (issue #300)", () => {
  it("hands().launcher() is the raised launcher's id while it is up, and null once it is down", () => {
    const { t } = rig();
    expect(t.hands().launcher?.()).toBeNull();
    (t.rocket as unknown as { held_: number | null }).held_ = 145;
    expect(t.hands().launcher?.()).toBe(145);
    (t.rocket as unknown as { held_: number | null }).held_ = null;
    expect(t.hands().launcher?.()).toBeNull();
  });
});

// PAR-83 (research 230 section 5.2.8; PTW.R3 with roomEquipment.test's and walk.test's "PAR-83"): the walk's stick lower
// (`FUN_00550ef0` D:L418263-418278) puts the launcher away here with no `throw` -- the room lowers it from the same command's
// stick -- and holds the firearm's trigger for the moving lower's life on the second channel (`seal_mv_rifle2launcher`
// run back from its end, 1.5 x 34/35 s; `FUN_005a7de0` -> `FUN_005a7980` refuses the round while that node is live,
// D:L462492-462499, D:L462636-462638); the raise tells the walk the firearm it comes from (the raise's clip).
describe("PAR-83: the launcher's stick lower, heard from the walk", () => {
  it("lowers the launcher with no throw to the room and no launcherLowered (the walk's own); the firearm's trigger held for the moving lower, 1457 ms from the rifle", () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      const { t, calls, thrown, stick } = rig();
      expect(stick).toHaveLength(1);
      (t.rocket as unknown as { held_: number | null }).held_ = 145;
      stick[0]!(0);
      expect(t.rocket.up()).toBe(false);
      expect(thrown).toEqual([]);
      expect(calls.filter((c) => c.startsWith('launcher'))).toEqual([]);
      const hands = t.hands();
      expect(hands.trigger(true)).toBe(true);                                // held: the moving lower plays
      now.mockReturnValue(1000 + 1457);
      expect(hands.trigger(true)).toBe(true);
      now.mockReturnValue(1000 + 1458);
      expect(hands.trigger(true)).toBe(false);                               // the firearm's own trigger
    } finally {
      now.mockRestore();
    }
  });

  it('a stick lower with no launcher up does nothing; the raise tells the walk the firearm it comes from', () => {
    const raisedFrom: number[] = [], stick: ((from: 0 | 1) => void)[] = [];
    const base = rig();
    const walk = {
      ...(base.deps.walk as unknown as Record<string, unknown>),
      launcherRaised: (from: number) => { raisedFrom.push(from); },
      onLauncherStickLower: (f: (from: 0 | 1) => void) => { stick.push(f); return () => {}; },
    } as never;
    const firearm = { ...(base.deps.firearm() as unknown as Record<string, unknown>), item: () => 'pistol' };
    const { t, thrown } = rig({ walk, firearm: () => firearm as never });
    expect(stick).toHaveLength(1);
    stick[0]!(1);
    expect(thrown).toEqual([]);
    (t.rocket as unknown as { emit(k: 'equip', on: boolean, id: number | null): void }).emit('equip', true, 145);
    expect(raisedFrom).toEqual([1]);
  });
});

// F1 of PAR-83's review (PTW.R3 with walk.test's and roomEquipment.test's "F1"): a take inside the stick's moving lower
// is refused (`FUN_005a8cb0` -> `FUN_005a7de0` -> `FUN_005a7980` D:L462492-462499) -- the walk's `swapGate` closed on those
// commands, which `matchFirearm.ts`'s `shoulderGate` asks (the rig's firearm asks it here the same way): the launcher's
// slot pressed then sends the room no `throw` and leaves the walk's set off (no `launcherRaised`); the gate open, it does.
describe("F1 of PAR-83's review: a take the walk's gate refuses sends nothing", () => {
  it("the launcher's slot pressed with the walk's swapGate closed: no throw, no launcherRaised, nothing up; open, the LAW's throw and the walk told", () => {
    const HEAT: ThrowableRecord = { ...M67, name: 'LAW HEAT', id: 185, muzzleVelocity: 200, acceleration: 980, armingDistance: 100, impact: true, hasBackblast: true, fuse: 20, removal: 20.1, capacity: 1, icon: 'firemode_at4.tif' };
    const round: KitRound = { record: HEAT, piercing: 0, fireWait: 3, reloadAfterShot: true, reloadDelayAfterShot: 1, icon: HEAT.icon };
    const items = new Map([
      [145, { id: 145, name: 'LAW', cls: 'rocketLauncher', magazine: 1, mags: 1, icon: 'AT4_icon.tif', model: 'AT4' }],
      [185, { id: 185, name: 'LAW HEAT', cls: 'rocketRound', magazine: 1, mags: 1, icon: 'firemode_AT4.tif', model: 'AT4_Heat' }],
    ]);
    const table = { arsenal: { items }, records: new Map(), rounds: new Map([[185, round]]) } as unknown as KitTable;
    const kit = [54, 15, 145, 185, 121] as unknown as Loadout;
    const loadouts = new PlayerLoadout();
    vi.spyOn(loadouts, 'tables').mockReturnValue(table);
    vi.spyOn(loadouts, 'loadout').mockReturnValue(kit);
    let open = false;
    const raised: number[] = [];
    const base = rig();
    const walk = {
      ...(base.deps.walk as unknown as Record<string, unknown>),
      swapGate: () => open,
      launcherRaised: (from: number) => { raised.push(from); },
    };
    const firearm = { ...(base.deps.firearm() as unknown as Record<string, unknown>), shoulderGate: () => walk.swapGate() };
    const { t, thrown } = rig({ loadouts, walk: walk as never, firearm: () => firearm as never });
    t.rocket.setKit(table, kit, new KitRounds(table, kit));
    expect(t.takeSlot(2)).toBe(false);                                     // slot 2: the LAW
    expect(thrown).toEqual([]);
    expect(raised).toEqual([]);
    expect(t.rocket.up()).toBe(false);
    open = true;
    expect(t.takeSlot(2)).toBe(true);
    expect(thrown).toEqual(['LAW']);
    expect(raised).toEqual([0]);
  });
});

/**
 * PAR-46a (research 283 s8): the part hands the thrower the map's hull walking or not (`hullGrid: () =>
 * walk.gridOfGround()`), so a room's throw drawn on a page off the walk -- a spectator, the replay's watcher -- meets
 * the map's walls as the room's flight does (`room.ts` `hullCast()`), not an empty cast.
 */
const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(ZWEAPON === null)(`PAR-59: another page flies the room's MGL FRAG TURRET round (research 215 s8)${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("the spawn's rounds (the kit table's, MGL FRAG TURRET's among them) fly the room's 'grenade' of it: from its launch at its velocity, Timer1 10, falling at its own 39 u/s^2", () => {
    const table = readKitTable(ZWEAPON!);                               // the disc's zweapon.rdr (the fixture)
    const loadouts = new PlayerLoadout();
    vi.spyOn(loadouts, 'tables').mockReturnValue(table);
    const base = rig();
    const walk = { ...(base.deps.walk as unknown as Record<string, unknown>), gridOfGround: () => null } as never;   // no hull: the air alone
    const { t } = rig({ loadouts, walk });
    t.hands().spawned(new KitRounds(table, loadouts.loadout()));        // `setRounds` from the kit table's rounds
    t.netDeps().remoteGrenade('MGL FRAG TURRET', [0, 100, 0], [0, 0, -270], 1, 5, undefined);
    expect(t.grenade.stats().live).toEqual([expect.objectContaining({ pid: 5, state: 'flight', fuse: 10, pos: [0, 100, 0], vel: [0, 0, -270] })]);
    t.grenade.update(0.2);
    const [g] = t.grenade.stats().live;
    expect(g!.age).toBeGreaterThan(0);
    expect(-g!.vel[1]! / g!.age).toBeCloseTo(39, 6);                    // Gravity_Acceleration 3.9 x 10, not the 98 of the rest
    expect(g!.vel[2]).toBe(-270);
  });
});

/** The M203's HE round's item id (`Enable_203HE`, `@s2u/scene` `VALVE_OF_ITEM`; research 94 §C4). */
const M203_HE = 171;
describe.skipIf(ZWEAPON === null)(`LATER 102 (AD-5): the kit table's Piercing reaches the page's scene blast through the part${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("setRecords and setRounds take the table's entries whole: the M67's 4, the HE's 1 (research 91 §5) and the M203 HE's 2 reach blastAt as the room's sceneBlast passes them", () => {
    // The M67's and the HE's equal `BAKED_PIERCING`, so they pass without the table; the M203 HE's 2 (171) is the
    // table's alone (`KitRound.piercing`), so it is red once `matchThrow.ts` hands `setRounds` the records only.
    const table = readKitTable(ZWEAPON!);                               // the disc's zweapon.rdr (the fixture)
    const byName = (name: string) => [...(table.throwables?.values() ?? [])].find((t) => t.record.name === name)!;
    expect(byName('M67').piercing).toBe(4);                              // the disc's ZAMMO `Piercing` (`+0x14`)
    expect(byName('HE').piercing).toBe(1);
    const loadouts = new PlayerLoadout();
    vi.spyOn(loadouts, 'tables').mockReturnValue(table);
    const base = rig();
    const walk = { ...(base.deps.walk as unknown as Record<string, unknown>), gridOfGround: () => null } as never;   // no hull: the air alone
    // The rig's firearm has no effects; the explosion's zAnim asks them (`setEffectPlayer`): none played, the placeholders.
    const firearm = { ...(base.deps.firearm() as unknown as Record<string, unknown>), effects: { run: () => false } } as never;
    const { t } = rig({ loadouts, walk, net: () => null, firearm: () => firearm });   // offline: the page's own blast reaches the scene
    t.hands().spawned(new KitRounds(table, loadouts.loadout()));        // `setRounds`, then `setRecords(throwableRecords(table))`
    const seen: (number | undefined)[] = [];
    t.grenade.setWorld(() => ({ health: {
      c4TargetAt: () => null,
      blastAt: (_at, _rating, _radius, _clear, options) => { seen.push(options?.piercing); return []; },
    } }));
    const m203 = table.rounds.get(M203_HE)!;                           // the M203's HE round (171): its KitRound's own
    expect(m203.piercing).toBe(2);
    const blastOf = (record: ThrowableRecord): (number | undefined)[] => {
      seen.length = 0;
      t.grenade.launchRound(record, [0, 100, 0], [0, 0, 0]);
      for (let i = 0; i < Math.ceil((record.fuse + 0.5) * 60); i++) t.grenade.update(1 / 60);
      t.grenade.clearAir();
      return [...seen];
    };
    expect(blastOf(t.grenade.recordOf('M67')!)).toEqual([4]);
    expect(blastOf(t.grenade.recordOf('HE')!)).toEqual([1]);
    expect(blastOf(m203.record)).toEqual([2]);
  });
});

describe('PAR-46a: the part flies a room\'s throw over the map\'s hull off the walk', () => {
  /** A floor at y 50 and a wall across z = -300, x -2000..2000 (grenade.test.ts's PAR-46 ground). */
  const mapGrid = (): Grid => {
    const poly = (points: number[], i: number): WorldPoly => ({ modelName: 'worldmodel', path: `worldmodel/p${i}`, region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
    const polys = [poly([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000], 0), poly([-2000, 0, -300, 2000, 0, -300, 2000, 400, -300, -2000, 400, -300], 1)];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1 })));
  };

  it("a remoteGrenade through netDeps() on a page whose walk's grid is null bounces off the map's wall", () => {
    const grid = mapGrid();
    const base = rig();
    // The rig's walk, not walking (`grid()` null), holding the map's hull (`gridOfGround()`).
    const walk = { ...(base.deps.walk as unknown as Record<string, unknown>), grid: () => null, gridOfGround: () => grid } as never;
    // The rig's firearm with an effects door: the part plays a bounce's `grenade_hit_<material>` through it.
    const firearm = { ...(base.deps.firearm() as unknown as Record<string, unknown>), effects: { play: () => true } };
    const { t } = rig({ walk, firearm: () => firearm as never });
    const bounces: number[] = [];
    t.grenade.on('bounce', (b) => bounces.push(b.pos[2]));
    t.netDeps().remoteGrenade('M67', [0, 100, -200], [0, 0, -300], 2);
    for (let i = 0; i < 90; i++) t.grenade.update(1 / 60);
    expect(bounces.some((z) => Math.abs(z + 300) < 1e-3)).toBe(true);
    expect(t.grenade.stats().live[0]!.pos[2]).toBeGreaterThan(-300);    // never past the wall
  });
});

/**
 * PAR-85 F1 (research 251 section 12.9, B1/B3; the review of 968035b80): the slot's last throw on the own page. The
 * kit's busy tail ends at the clip's last key (`GrenadeThrower.finishThrow`) and, the slot empty, lets the hand go
 * (`equip(false)`) a couple of frames before the mover's hold comes off on its lagged clock (the 91st command). The
 * throw is still the stack's top then: it stays at 1 to the hold's end and pops with the body's eased cross-fade onto
 * the idle (`seal_stand`'s `BlendTime` 0.5), as every throw does -- not dropped bare when the hand empties. Through the
 * part's own wiring (`mountThrowables`), a real `Walker` and `GrenadeThrower`, synthetic clips on an `Animator`, in the
 * page's order (`./main`'s frame: the ticks, `poseFrame`, the body, then the throws' `frame`).
 */
describe("PAR-85 F1: the slot's last throw on the own page stays on top to its hold's end, then eases onto the idle", () => {
  const Q: [number, number, number, number] = [0, 0, 0, 1];
  const qx = (deg: number): [number, number, number, number] => [Math.sin((deg * Math.PI) / 360), 0, 0, Math.cos((deg * Math.PI) / 360)];
  const keys = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n + 1 }, (_, i) => f(i === n ? 0 : i));
  const clip = (name: string, frames: number, parts: { name: string; t: number[][]; q: number[][] }[]): MotionClip => ({
    name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1,
    parts: parts.map((p, index) => ({
      index, name: p.name, flags: 0x0c | (p.q.length === 1 ? 0x10 : 0) | (p.t.length === 1 ? 0x20 : 0),
      translations: Float32Array.from(p.t.flat()), rotations: Float32Array.from(p.q.flat()),
    })),
  });
  const cycle = (name: string, frames: number, speed: number, legDeg: number): MotionClip => clip(name, frames, [
    { name: 'skel_root', t: keys(frames, (i) => [0.5, 11, 20 - (speed / 30) * i]), q: [Q] },
    { name: 'lthigh', t: [[1, -1, 0]], q: keys(frames, (i) => qx(legDeg * i)) },
  ]);
  const oneShot = (name: string, frames: number): MotionClip => clip(name, frames, [
    { name: 'skel_root', t: [[0.5, 10, 20]], q: [Q] }, { name: 'lthigh', t: [[1, -1, 0]], q: keys(frames, (i) => qx(60 + 2 * i)) },
  ]);
  const entry = (e: Partial<MotionEntry>): MotionEntry => ({
    looped: null, playback: null, maxVelocity: null, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [], ...e,
  });
  const STILL: WalkInput = { forward: 0, right: 0, boost: false };
  const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

  function page(callbacks: { name: string; time: number }[] = []) {
    const clips = [
      clip('seal_stand', 16, [{ name: 'skel_root', t: [[0.5, 11, 20]], q: [Q] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(0)] }]),
      cycle('seal_walk_alert', 16, 32, 2), cycle('seal_jog_alert', 18, 47, 3), cycle('seal_run', 19, 57.7, 4),
      oneShot('seal_throwgrenade', 28), oneShot('seal_tossgrenade', 30),
    ];
    let dead = false;
    const cues: string[] = [];
    const table = new Map<string, MotionEntry>([
      ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 })],
      ['seal_walk_alert', entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 0, transitionB: 4 })],
      ['seal_jog_alert', entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 2, transitionB: 6.15 })],
      ['seal_run', entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 4.01, transitionB: 6.5 })],
      ['seal_throwgrenade', entry({ looped: false, playback: 1.6, maxVelocity: -1, noInterrupt: 0.49, noPitchtwist: true, callbacks })],
      ['seal_tossgrenade', entry({ looped: false, playback: 1.6, maxVelocity: -1, noInterrupt: 0.75, noPitchtwist: true })],
    ]);
    const part = (index: number, name: string, parent: number, t: [number, number, number]) => ({
      index, name, parent, bindLocal: partMatrix(Q, t), bbox: new Float32Array(6), type: 0, flags: 0,
    });
    const sk = new Skeleton('test', IDENTITY, [part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'lthigh', 0, [1, -1, 0])]);
    const anim = new Animator(sk, clips, table);
    const poly: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
    };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
    const w = new Walker(buildGrid(params, [], [], [poly], [{ modelName: poly.modelName, path: poly.path, first: 0, count: 1 }]));
    w.place(0, 0, 300);
    w.state.yaw = 0;
    const snapshot = () => moverSnapshot(w, null, 0, 0);
    const { t } = rig({
      walk: {
        grid: () => null, gridOfGround: () => null, snapshot, view: () => 'third', fireAim: () => null, feet: () => w.tickFeet(),
        drawnFeet: () => null, hold: (clip: string) => w.hold(clip as HoldClip), mode: () => 'walk', isDead: () => dead, fireAllowed: () => true, swapGate: () => true,
        onActionEnd: (f: (e: ActionEnd) => void) => w.onActionEnd(f),
        launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
      } as never,
      play: {
        partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, setRifleStowed: () => {},
        motionSource: () => ({ clips: new Map(clips.map((c) => [c.name, c])), table }),
        addPoseLayer: (layer: PoseLayer) => anim.addPoseLayer(layer),
      } as never,
      audio: { onAnimCallback: (n: string) => { cues.push(n); return null; }, onFire: () => null, play: () => {} } as never,
    });
    t.grenade.setEffectPlayer(null);                                   // the blasts: no effects on the fakes
    const events: string[] = [];
    let n = 0;
    t.grenade.on('equip', (on) => { events.push(`${n} equip ${on}`); });
    t.grenade.on('throwStart', () => { events.push(`${n} throwStart`); });
    w.onActionEnd((e) => { if (e.body?.source === 'hold') events.push(`${n} end ${e.reason}`); });
    const rows: { holding: boolean; playing: boolean; weight: number; play: string; thigh: number[] }[] = [];
    /** One page frame (`./main`): the tick, the throw's clock, the body, then the throws (the release, the busy tail). */
    const frame = (input: WalkInput): void => {
      n++;
      w.tick(input);
      t.poseFrame(TICK);
      anim.step(TICK, snapshot());
      t.frame(TICK);
      const s = t.throwPose.stats();
      rows[n] = { holding: w.holding !== null, playing: t.throwPose.playing(), weight: s.weight, play: anim.stats().play, thigh: quatOfMatrix(sk.local[1]!) };
    };
    return { t, w, frame, events, rows, cues, at: () => n, die: () => { dead = true; } };
  }

  /** Throws the slot empty, the last one at rest or let go of on the run; returns the frames of the last throw's events. */
  function lastThrow(running: boolean) {
    const p = page();
    for (let i = 0; i < 30; i++) p.frame(STILL);
    expect(p.t.grenade.equip(true, 'M67')).toBe(true);
    for (let k = 0; k < 10 && p.t.grenade.stats().equipped; k++) {
      const last = p.t.grenade.stats().leftByItem.M67 === 1;
      const input = running && last ? FORWARD : STILL;
      if (running && last) for (let i = 0; i < 60; i++) p.frame(FORWARD);
      p.t.grenade.pull();
      for (let i = 0; i < 60; i++) p.frame(input);
      p.t.grenade.release();
      const seen = p.events.length;                                   // the stick held to the throw's push
      for (let i = 0; i < 30 && !p.events.slice(seen).some((e) => e.endsWith('throwStart')); i++) p.frame(input);
      for (let i = 0; i < 200; i++) p.frame(STILL);                 // on the run: the stick let go from the push on
    }
    expect(p.t.grenade.stats().equipped).toBe(false);
    const at = (what: string): number => Number(p.events.filter((e) => e.endsWith(what)).at(-1)!.split(' ')[0]);
    return { p, start: at('throwStart'), empty: at('equip false'), end: at('end complete') };
  }

  it("ThrowPose.letGo keeps a throw its hold carries, and stops any other at once; holdOn(false) pops a held throw whose hold left unheard", () => {
    const c = oneShot('seal_throwgrenade', 28);
    const table = new Map<string, MotionEntry>([['seal_throwgrenade', entry({ looped: false, playback: 1.6, maxVelocity: -1, noPitchtwist: true })]]);
    const pose = new ThrowPose(() => ({ clips: new Map([[c.name, c]]), table }));
    const under = { clip: c, frame: 0, phase: 0 };
    expect(pose.start(THROW_ANIMS.standThrow, true)).toBe(true);
    pose.step(TICK);
    pose.letGo();                                                   // the hand emptied under the hold
    expect(pose.playing()).toBe(true);
    pose.holdOn(true);
    expect(pose.playing()).toBe(true);
    pose.holdOn(false);                                             // the hold gone with no end heard (a new mover)
    expect(pose.playing()).toBe(false);
    expect(pose.layer.sample(under)?.crossFade).toBe(0.4);          // popped: the body's cross-fade, not a bare drop
    expect(pose.start(THROW_ANIMS.standThrow, false)).toBe(true);   // no hold carries it: the hand going stops it
    pose.letGo();
    expect(pose.playing()).toBe(false);
    expect(pose.layer.sample(under)).toBeNull();
  });

  for (const running of [false, true]) {
    it(`${running ? 'let go of on the run' : 'at rest'}: the hand empties before the hold's end; the throw stays at 1 to it, then the idle's 0.5 s eased cross-fade`, () => {
      const { p, start, empty, end } = lastThrow(running);
      expect(empty).toBeGreaterThan(start);
      expect(empty).toBeLessThan(end);                                // the case: the slot empties under the hold
      for (let f = start + 1; f < end; f++) {
        expect(p.rows[f]!.holding, `frame ${f} holding (start ${start}, empty ${empty}, end ${end})`).toBe(true);
        expect(p.rows[f]!.playing, `frame ${f} playing (start ${start}, empty ${empty}, end ${end})`).toBe(true);
        expect(p.rows[f]!.weight, `frame ${f} weight (start ${start}, empty ${empty}, end ${end})`).toBe(1);
        expect(p.rows[f]!.play, `frame ${f} play (start ${start}, empty ${empty}, end ${end})`).toBe(running ? 'loco:stand' : 'idle:stand');   // B2: the play kept beneath
      }
      expect(p.rows[end]!.playing).toBe(false);                      // popped with the hold
      const held = p.rows[end - 1]!.thigh, idle = qx(0);
      // At rest the idle kept beneath takes the pop's cross-fade, a frame's tick in; the stick let go, the idle's own
      // play starts on the pop's frame and takes it from there (THROW_RELEASED_STICK_END_READING).
      const lead = running ? 0 : 1;
      for (let j = 0; j < 36; j++) {
        const f = end + j, wIdle = Math.min(1, ((j + lead) * TICK) / 0.5);
        const want = slerp(idle, held, blendWeight(1 - wIdle));      // the held pose weighs E((0.5 - t) / 0.5)
        const got = p.rows[f]!.thigh, sign = got[0]! * want[0] + got[3]! * want[3] < 0 ? -1 : 1;
        expect(p.rows[f]!.play).toBe('idle:stand');
        for (let c = 0; c < 4; c++) expect(got[c]!, `frame ${f} [${c}]`).toBeCloseTo(sign * want[c]!, 6);
      }
    });
  }

  /**
   * LATER 529 (F3 of LATER 526's review; research 215 s8.6 "A1"): the room refused the take this page made at send time --
   * `FUN_005463c0` refuses before any of its take's steps (D:L412131-412166), so the body's stack was never popped
   * (`FUN_0058c350` D:L447983-447988) and the throw's clip played on through the wait. The take's pop ends the hold
   * 'replaced' (`Walker.mountTake`), which pops the pose (`throwPoseEnds`); the refusal's re-run lays the hold back
   * (`WalkMode.mountUntake`, here `restoreState` and the wait's ticks) and the thrower hands the throw back
   * (`GrenadeThrower.mountUntake`): the clip is on the body again, at the phase the wait has run it to.
   */
  it("RED: LATER 529 (F3) -- a throw asked, its hand not yet open, handed back at the take's refusal: its clip on the body again", () => {
    const p = page();
    for (let i = 0; i < 30; i++) p.frame(STILL);
    expect(p.t.grenade.equip(true, 'M67')).toBe(true);
    p.t.grenade.pull();
    for (let i = 0; i < 40; i++) p.frame(STILL);
    p.t.grenade.release();
    for (let i = 0; i < 30 && !p.events.some((e) => e.endsWith('throwStart')); i++) p.frame(STILL);
    p.frame(STILL);
    expect([p.t.grenade.phase(), p.t.throwPose.playing(), p.t.throwPose.stats().clip]).toEqual(['throwing', true, 'seal_throwgrenade']);
    const kept = p.w.saveState(), phase = p.t.throwPose.stats().phase;
    p.t.grenade.mountTake();                                        // `./matchActions` took: the throw first, then the pop
    p.w.mountTake();                                                // the hold off 'replaced': the pose pops
    const WAIT = 6;
    for (let i = 0; i < WAIT; i++) p.frame(STILL);
    expect([p.t.grenade.phase(), p.t.throwPose.playing()], 'the wait: the throw and its clip taken').toEqual(['ready', false]);
    p.w.restoreState(kept);                                         // the refusal's re-run: the body as the room ran it
    for (let i = 0; i < WAIT; i++) p.w.tick(STILL);
    p.t.grenade.mountUntake(false);
    expect(p.w.holding).not.toBeNull();
    p.frame(STILL);
    expect([p.t.grenade.phase(), p.t.throwPose.playing(), p.t.throwPose.stats().clip, p.rows[p.at()]!.weight],
      'the throw handed back with its clip').toEqual(['throwing', true, 'seal_throwgrenade', 1]);   // today: playing false, clip null
    expect(p.t.throwPose.stats().phase, 'the clip ran on through the wait').toBeGreaterThan(phase);
  });

  /**
   * LATER 529's review folds (`agent-mail/evidence/review-later-529.md`): a throw asked, its hand not yet open, taken at the
   * turret's send and refused `wait` frames later -- the page's frame order as above (`page`).
   */
  const asked = (p: ReturnType<typeof page>) => {
    for (let i = 0; i < 30; i++) p.frame(STILL);
    expect(p.t.grenade.equip(true, 'M67')).toBe(true);
    p.t.grenade.pull();
    for (let i = 0; i < 40; i++) p.frame(STILL);
    p.t.grenade.release();
    for (let i = 0; i < 30 && !p.events.some((e) => e.endsWith('throwStart')); i++) p.frame(STILL);
    p.frame(STILL);
  };
  const taken = (p: ReturnType<typeof page>) => {
    asked(p);
    const kept = p.w.saveState();
    p.t.grenade.mountTake();
    p.w.mountTake();
    return kept;
  };
  const refused = (p: ReturnType<typeof page>, kept: ReturnType<Walker['saveState']>, wait: number): void => {
    p.w.restoreState(kept);
    for (let i = 0; i < wait; i++) p.w.tick(STILL);
    p.t.grenade.mountUntake(false);
  };
  /** The throw clip's seconds run when the hand opens: the `throw` event's, on the page's own clock. */
  const elapsedAtLetGo = (p: ReturnType<typeof page>): number[] => {
    const at: number[] = [];
    p.t.grenade.on('throw', () => { at.push(p.t.throwPose.stats().elapsed); });
    return at;
  };

  it("RED: LATER 529 (F1) -- one clock: a wait past the hand's opening, the hand opens at the refusal with the clip at the release phase", () => {
    const base = page();
    const baseAt = elapsedAtLetGo(base);
    asked(base);
    let frames = 0;
    while (baseAt.length === 0 && frames < 200) { base.frame(STILL); frames++; }
    expect(baseAt.length, 'the plain throw let go').toBe(1);
    const p = page();
    const at = elapsedAtLetGo(p);
    const kept = taken(p);
    const WAIT = frames + 6;                                        // past the hand's opening, before the clip's end
    for (let i = 0; i < WAIT; i++) p.frame(STILL);
    refused(p, kept, WAIT);
    let after = 0;
    while (at.length === 0 && after < 200) { p.frame(STILL); after++; }
    expect(at.length, 'the hand opened').toBe(1);
    expect(Math.abs(at[0]! - baseAt[0]!), 'the clip drawn at the release phase (within a tick), not the follow-through').toBeLessThanOrEqual(TICK * 1.001);
    expect(after, 'the hand opened at the refusal (the accepted late hand): the first frame').toBe(1);
    for (let i = 0; i < 4; i++) p.frame(STILL);
    expect(p.t.throwPose.stats().elapsed, 'the clip runs on after the release: the overrun is not lost').toBeGreaterThan(at[0]! + 3 * TICK);
  });

  it("RED: LATER 529 (F1): a wait short of the hand's opening keeps the hand's clock stepped by the wait (left - wait), as the clip", () => {
    const p = page();
    const at = elapsedAtLetGo(p);
    const kept = taken(p);
    for (let i = 0; i < 6; i++) p.frame(STILL);
    refused(p, kept, 6);
    expect(p.t.grenade.diag().pending).toBe(true);
    for (let i = 0; i < 200 && at.length === 0; i++) p.frame(STILL);
    expect(at.length).toBe(1);
    const base = page();
    const baseAt = elapsedAtLetGo(base);
    asked(base);
    for (let i = 0; i < 200 && baseAt.length === 0; i++) base.frame(STILL);
    expect(Math.abs(at[0]! - baseAt[0]!), 'the release phase on the clip, the same as an unrefused throw').toBeLessThanOrEqual(TICK * 1.001);
  });

  it("RED: LATER 529 (F3 of its review) -- a callback the wait crossed (the grunt) is played at the refusal, once", () => {
    const p = page([{ name: 'grunt', time: 0.1 }]);
    const kept = taken(p);
    for (let i = 0; i < 15; i++) p.frame(STILL);
    expect(p.cues, 'the page never heard it through the wait: the clip was popped').toEqual([]);
    refused(p, kept, 15);
    expect(p.cues, 'played at the refusal: the original heard it through the wait').toEqual(['grunt']);
    for (let i = 0; i < 10; i++) p.frame(STILL);
    expect(p.cues, 'once').toEqual(['grunt']);
  });

  it("RED: LATER 529 (F4 of its review) -- a death during the wait: the refusal hands nothing back", () => {
    const p = page();
    const kept = taken(p);
    for (let i = 0; i < 6; i++) p.frame(STILL);
    p.die();
    p.frame(STILL);
    refused(p, kept, 7);
    expect([p.t.grenade.phase(), p.t.grenade.diag().pending, p.t.throwPose.playing()], 'no throw, no clip on the dead body').toEqual(['ready', false, false]);
    for (let i = 0; i < 120; i++) p.frame(STILL);
    expect(p.t.grenade.stats().thrown, 'nothing thrown').toBe(0);
  });

  it("LATER 529 (F6): the clip ends during the wait -- laid back it rests on its last key, held to its hold's end, and the callbacks crossed come back", () => {
    const c = oneShot('seal_throwgrenade', 28);
    const table = new Map<string, MotionEntry>([['seal_throwgrenade', entry({
      looped: false, playback: 1.6, maxVelocity: -1, noPitchtwist: true, callbacks: [{ name: 'grunt', time: 0.1 }, { name: 'late', time: 0.9 }],
    })]]);
    const pose = new ThrowPose(() => ({ clips: new Map([[c.name, c]]), table }));
    expect(pose.start(THROW_ANIMS.standThrow, true)).toBe(true);
    pose.step(TICK);
    pose.keep();
    pose.cut();                                                     // the take's pop: the hold ended 'replaced'
    for (let i = 0; i < 150; i++) pose.step(TICK);                  // the wait: longer than the clip
    expect(pose.playing()).toBe(false);
    const heard = pose.resume(0);
    expect(heard, 'every callback the wait crossed').toEqual(['grunt', 'late']);
    expect(pose.playing()).toBe(true);
    expect(pose.stats().phase).toBeCloseTo(27 / 28, 9);             // `m.end`: the clip rests on its last key
    expect(pose.step(TICK)).toEqual([]);
    expect(pose.playing()).toBe(true);                              // held: its hold's end pops it
  });
});

/**
 * NU-2 (research 320 sections 1, 4 and 8.1): the hands hand the firearm's reticle what is in the hand and the throw's
 * power -- `FUN_005be300` asked with the hand's item (`handItem`), the meter laid at the controller's power or 0 with none
 * left (`throwPower`, `FUN_001f7ff0` D:L56673-56688).
 */
describe('NU-2: the hands give the reticle the hand\'s item and the throw\'s power', () => {
  it('the M67 up: its id 121 and the power as the thrower holds it; the rifle again: none and 0', () => {
    const { t, deps } = rig();
    (deps.walk as unknown as { snapshot: () => unknown }).snapshot = () => ({
      feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
    });
    t.grenade.setKit(['M67', 'AN-M8', null]);
    const hands = t.hands();
    expect(hands.handItem?.()).toBeNull();                                                 // the rifle in the hand
    expect(hands.throwPower?.()).toBe(0);
    expect(t.takeSlot(2)).toBe(true);
    expect(hands.handItem?.()).toBe(121);
    expect(hands.trigger(true)).toBe(true);
    t.grenade.update(0.25);
    const s = t.grenade.stats();
    expect(s.power).toBeGreaterThan(0);
    expect(hands.throwPower?.()).toBe(meterPower(s.power, s.left));
    expect(t.takeSlot(3)).toBe(true);                                                      // the AN-M8: 122
    expect(hands.handItem?.()).toBe(122);
    hands.putAway();
    expect(hands.handItem?.()).toBeNull();
    expect(hands.throwPower?.()).toBe(0);
  });

  it('the Detonator up: 193, the arsenal\'s id (arsenal-items.json), with no table read the same', () => {
    const { t } = rig();
    vi.spyOn(t.grenade, 'held').mockReturnValue('Detonator');
    expect(t.hands().handItem?.()).toBe(193);
  });
});

/**
 * NU-5 L1 (research 323 §1.6; the gameplay controller's close of the gap, 2026-10-14): a rocket launcher claimed reaches
 * the page's launcher. The room's `kit` names the LAW and its LAW HEAT in the live kit (`PlayerLoadout.take`), the
 * firearm part rebuilds the round slots (`launcherKitRounds`, one round) and hands them on (`FirearmHands.kitTaken`,
 * `matchFirearm.test.ts` "NU-5"); this part's `kitTaken` gives the launcher the claimed kit (`RocketLauncher.setKit`), so
 * the LAW's slot raises it (the `throw` to the room, the walk told) with its one round -- with no refill of a pouch.
 */
describe('NU-5 L1: a claimed LAW comes up on the page (FirearmHands.kitTaken)', () => {
  it("after the room's kit gives the LAW in slot 3 and its round in 4, the LAW's slot raises it with its one round; the M67s' count is untouched", () => {
    const HEAT: ThrowableRecord = { ...M67, name: 'LAW HEAT', id: 185, muzzleVelocity: 200, acceleration: 980, armingDistance: 100, impact: true, hasBackblast: true, fuse: 20, removal: 20.1, capacity: 1, icon: 'firemode_at4.tif' };
    const round: KitRound = { record: HEAT, piercing: 0, fireWait: 3, reloadAfterShot: true, reloadDelayAfterShot: 1, icon: HEAT.icon };
    const items = new Map([
      [145, { id: 145, name: 'LAW', cls: 'rocketLauncher', magazine: 1, mags: 1, icon: 'AT4_icon.tif', model: 'AT4' }],
      [185, { id: 185, name: 'LAW HEAT', cls: 'rocketRound', magazine: 1, mags: 1, icon: 'firemode_AT4.tif', model: 'AT4_Heat' }],
      [121, { id: 121, name: 'M67', cls: 'grenade', magazine: 3, mags: 1, icon: 'm67_icon.tif', model: 'm67' }],
    ]);
    const table = { arsenal: { items }, records: new Map(), rounds: new Map([[185, round]]) } as unknown as KitTable;
    const loadouts = new PlayerLoadout();
    vi.spyOn(loadouts, 'tables').mockReturnValue(table);
    loadouts.take([54, 15, 121, 255, 255]);                              // the SEAL's kit before the claim
    const raised: number[] = [];
    const base = rig();
    const walk = { ...(base.deps.walk as unknown as Record<string, unknown>), swapGate: () => true, launcherRaised: (from: number) => { raised.push(from); } };
    const firearm = { ...(base.deps.firearm() as unknown as Record<string, unknown>), shoulderGate: () => true };
    const { t, thrown } = rig({ loadouts, walk: walk as never, firearm: () => firearm as never });
    t.hands().spawned(new KitRounds(table, loadouts.loadout()));
    const m67 = t.grenade.stats().leftByItem;
    // The room's kit after the claim (`takeKit` -> `PlayerLoadout.take`), the round slots as the firearm part rebuilds them.
    loadouts.take([54, 15, 121, 145, 185]);
    const rounds = launcherKitRounds(new KitRounds(table, [54, 15, 121, 255, 255] as unknown as Loadout), table, loadouts.loadout(), 185, 1);
    t.hands().kitTaken?.(rounds);
    expect(t.takeSlot(3)).toBe(true);                                      // slot 3: the claimed LAW
    expect(thrown).toEqual(['LAW']);
    expect(raised).toEqual([0]);
    expect(t.rocket.count()).toBe(1);
    expect(t.grenade.stats().leftByItem).toEqual(m67);                     // nothing refilled
  });
});

/**
 * THROW-INTERRUPT (research 326 §2.4): the part hands the walk's death (`WalkMode.isDead`, the net client's `kill`) to
 * the thrower, so a throw not yet let go when the page's SEAL dies sends no `throw` and spends nothing (the original's
 * power-0 drop at the death is the room's, `FUN_005b8920`); one already let go was sent at its release.
 */
describe('THROW-INTERRUPT through mountThrowables: the page\'s own death before the hand opens', () => {
  const still = { feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 };

  it.each([
    ['alive to the release (the control)', false, ['M67']],
    ['killed 0.2 s into the clip', true, []],
  ] as const)('%s: the throw sent to the room %j', (_name, killed, sent) => {
    const { t, thrown, deps } = rig();
    let dead = false;
    const walk = deps.walk as unknown as { snapshot: () => unknown; isDead: () => boolean; gridOfGround: () => null };
    walk.snapshot = () => still;
    walk.isDead = () => dead;
    walk.gridOfGround = () => null;                               // PAR-46a's hull: none on the fake
    const left = t.grenade.stats().leftByItem.M67!;
    expect(t.grenade.equip(true, 'M67')).toBe(true);
    t.grenade.pull();
    for (let k = 0; k < 30; k++) t.grenade.update(1 / 60);
    t.grenade.release();
    t.grenade.update(1 / 60);
    expect(t.grenade.phase()).toBe('throwing');
    for (let k = 0; k < 12; k++) t.grenade.update(1 / 60);
    if (killed) dead = true;
    for (let k = 0; k < 120; k++) t.grenade.update(1 / 60);
    expect(thrown).toEqual(sent);
    expect(t.grenade.stats().leftByItem.M67).toBe(killed ? left : left - 1);
    if (killed) expect(meterPower(t.grenade.stats().power, t.grenade.stats().left)).toBe(0);   // the throw meter cleared
  });
});

describe('THROW-INTERRUPT through mountThrowables: the release request told to the room, its seq echoed by the throw', () => {
  const still = { feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 };
  /** The part on a net that records `throwStart` (each its own seq) and every throw's kind and `start`. */
  function wired() {
    const asked: string[] = [], sent: { kind: string; start: number | undefined }[] = [];
    let seq = 100;
    const net = {
      throwEvent: (kind: string, _f: unknown, _v: unknown, _c4: unknown, start?: number) => { sent.push({ kind, start }); },
      throwStartEvent: (kind: string) => { asked.push(kind); return ++seq; },
      client: { bodies: () => [] },
    };
    const r = rig({ net: () => net as never });
    let dead = false;
    const walk = r.deps.walk as unknown as { snapshot: () => unknown; isDead: () => boolean; gridOfGround: () => null };
    walk.snapshot = () => still;
    walk.isDead = () => dead;
    walk.gridOfGround = () => null;                               // PAR-46a's hull: none on the fake
    const frames = (n: number): void => { for (let k = 0; k < n; k++) r.t.grenade.update(1 / 60); };
    const throwOne = (): void => { r.t.grenade.pull(); frames(30); r.t.grenade.release(); frames(1); };
    return { ...r, asked, sent, frames, throwOne, kill: () => { dead = true; } };
  }

  it('a hand throwable: one throwStart at the release request; its throw echoes the seq as start; the next throw its own', () => {
    const w = wired();
    expect(w.t.grenade.equip(true, 'M67')).toBe(true);
    w.throwOne();
    expect(w.asked).toEqual(['M67']);
    expect(w.sent).toEqual([]);                                       // not out yet
    w.frames(95);                                                     // out at 0.71 s; the clip's tail over at 1.54 s
    expect(w.sent).toEqual([{ kind: 'M67', start: 101 }]);
    w.throwOne();
    w.frames(50);                                                     // the second out before the first's fuse (3.2 s)
    expect(w.asked).toEqual(['M67', 'M67']);
    expect(w.sent).toEqual([{ kind: 'M67', start: 101 }, { kind: 'M67', start: 102 }]);
  });

  it('a placing tells no throwStart, and its charge goes without a start', () => {
    const w = wired();
    w.t.grenade.select('Claymore');
    w.t.grenade.pull();
    w.frames(150);
    expect(w.asked).toEqual([]);
    expect(w.sent.every((s) => s.start === undefined)).toBe(true);
  });

  it('killed before the hand opens: the throwStart told, no throw sent (the drop is the room\'s)', () => {
    const w = wired();
    expect(w.t.grenade.equip(true, 'M67')).toBe(true);
    w.throwOne();
    w.frames(10);
    w.kill();
    w.frames(120);
    expect(w.asked).toEqual(['M67']);
    expect(w.sent).toEqual([]);                                       // the room makes the drop (`deathDrop`)
  });

  it('P36 (TB-12): a release under the walk\'s NoFire (`WalkMode.fireAllowed` false) tells no throwStart the room would refuse', () => {
    const w = wired();
    let allowed = true;
    (w.deps.walk as unknown as { fireAllowed: () => boolean }).fireAllowed = () => allowed;
    expect(w.t.grenade.equip(true, 'M67')).toBe(true);
    const left = w.t.grenade.stats().leftByItem.M67;
    w.t.grenade.pull();
    w.frames(30);
    w.t.grenade.release();
    allowed = false;                                                  // the room's frame `fire` false: 'nofire'
    w.frames(1);
    expect(w.asked).toEqual([]);                                      // RED before P36: told, and the room refuses it
    w.frames(120);
    expect(w.sent).toEqual([]);
    expect(w.t.grenade.stats().leftByItem.M67).toBe(left);
    allowed = true;                                                   // the clip over: the next release is told
    w.throwOne();
    expect(w.asked).toEqual(['M67']);
  });
});

/**
 * NU-8b (research 326 section 6 B3 and B4, with THROW-INTERRUPT section 2.4; reading, pending review): the part mounted
 * on a real mover and animator, in the page's frame order (the tick, the throw's clock, the body, the throws).
 * - B3 with THROW-INTERRUPT: the placing is the stack's top, popped at its hold's end whatever the reason
 *   (`throwPoseEnds`), and the page's own death cuts it through the thrower's `cut` (`grenade.on('cut')`, kept as it
 *   was). Both reach `ThrowPose.cut`: the death's first, the hold's own end later (the death leaves the mover's hold to
 *   run out). The clip stops once -- one pop, one cross-fade asked of the body -- and the hold's later end asks nothing.
 * - B4 (D7): a throwable or a placing taken up asks the body's snapshot cross-fade over 0.3 s with no play change
 *   (`FUN_005a64c0`'s class-3 and class-0 branch `bVar6`, D:L461889-461895: `FUN_0028e3e0` D:L461917, 0x3e99999a at
 *   D:L461919-461920), from the kit's frame after the driver (`FUN_00551ec0` D:L418611 -> `FUN_005dfc80` ->
 *   `FUN_005c1660` D:L494228 -> D:L476734), so the frame drawn next has run one tick of it, as a push has.
 */
describe('NU-8b: the placings and the take-up through mountThrowables, on a real mover and animator', () => {
  const Q: [number, number, number, number] = [0, 0, 0, 1];
  const qx = (deg: number): [number, number, number, number] => [Math.sin((deg * Math.PI) / 360), 0, 0, Math.cos((deg * Math.PI) / 360)];
  const keys = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n + 1 }, (_, i) => f(i === n ? 0 : i));
  const clip = (name: string, frames: number, parts: { name: string; t: number[][]; q: number[][] }[]): MotionClip => ({
    name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1,
    parts: parts.map((p, index) => ({
      index, name: p.name, flags: 0x0c | (p.q.length === 1 ? 0x10 : 0) | (p.t.length === 1 ? 0x20 : 0),
      translations: Float32Array.from(p.t.flat()), rotations: Float32Array.from(p.q.flat()),
    })),
  });
  const entry = (e: Partial<MotionEntry>): MotionEntry => ({
    looped: null, playback: null, maxVelocity: null, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [], ...e,
  });
  const STILL: WalkInput = { forward: 0, right: 0, boost: false };
  const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
  const cycle = (name: string, frames: number, speed: number, legDeg: number): MotionClip => clip(name, frames, [
    { name: 'skel_root', t: keys(frames, (i) => [0.5, 11, 20 - (speed / 30) * i]), q: [Q] },
    { name: 'lthigh', t: [[1, -1, 0]], q: keys(frames, (i) => qx(legDeg * i)) },
  ]);

  function page() {
    const clips = [
      clip('seal_stand', 16, [{ name: 'skel_root', t: [[0.5, 11, 20]], q: [Q] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(0)] }]),
      cycle('seal_walk_alert', 16, 32, 2), cycle('seal_jog_alert', 18, 47, 3), cycle('seal_run', 19, 57.7, 4),
      clip('seal_place_claymore', 55, [{ name: 'skel_root', t: [[0.5, 8, 20]], q: [Q] }, { name: 'lthigh', t: [[1, -1, 0]], q: keys(55, (i) => qx(30 + i)) }]),
    ];
    const table = new Map<string, MotionEntry>([
      ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 })],
      ['seal_walk_alert', entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 0, transitionB: 4 })],
      ['seal_jog_alert', entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 2, transitionB: 6.15 })],
      ['seal_run', entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 4.01, transitionB: 6.5 })],
      ['seal_place_claymore', entry({ looped: false, playback: 2.7, maxVelocity: -1, noInterrupt: 0.9, noPitchtwist: true })],
    ]);
    const part = (index: number, name: string, parent: number, t: [number, number, number]) => ({
      index, name, parent, bindLocal: partMatrix(Q, t), bbox: new Float32Array(6), type: 0, flags: 0,
    });
    const sk = new Skeleton('test', IDENTITY, [part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'lthigh', 0, [1, -1, 0])]);
    const anim = new Animator(sk, clips, table);
    const poly: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
    };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
    const w = new Walker(buildGrid(params, [], [], [poly], [{ modelName: poly.modelName, path: poly.path, first: 0, count: 1 }]));
    w.place(0, 0, 300);
    w.state.yaw = 0;
    const snapshot = () => moverSnapshot(w, null, 0, 0);
    let dead = false, n = 0;
    const fades: { frame: number; seconds: number; run: number | undefined }[] = [];
    let layers = 0;
    const { t } = rig({
      walk: {
        grid: () => null, gridOfGround: () => null, snapshot, view: () => 'third', fireAim: () => null, feet: () => w.tickFeet(),
        drawnFeet: () => null, hold: (c: string) => w.hold(c as HoldClip), mode: () => 'walk', isDead: () => dead, fireAllowed: () => true, swapGate: () => true,
        onActionEnd: (f: (e: ActionEnd) => void) => w.onActionEnd(f),
        launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
      } as never,
      play: {
        partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, setRifleStowed: () => {},
        motionSource: () => ({ clips: new Map(clips.map((c) => [c.name, c])), table }),
        // every cross-fade the part's layer asks of the body, by frame
        addPoseLayer: (layer: PoseLayer) => {
          layers++;
          anim.addPoseLayer({ sample: (c) => { const o = layer.sample(c); if (o?.crossFade !== undefined) fades.push({ frame: n, seconds: o.crossFade, run: o.crossFadeRun }); return o; } });
        },
      } as never,
    });
    t.grenade.setEffectPlayer(null);
    const cuts: string[] = [], ends: string[] = [];
    t.grenade.on('cut', (e) => { cuts.push(`${n} ${e.reason}`); });
    w.onActionEnd((e) => { if (e.body?.source === 'hold') ends.push(`${n} ${e.reason}`); });
    const frame = (input: WalkInput = STILL): void => { n++; w.tick(input); t.poseFrame(TICK); anim.step(TICK, snapshot()); t.frame(TICK); };
    const run = clips.find((c) => c.name === 'seal_run')!;
    /** The live run's thigh at the animator's phase this frame. */
    const runThigh = (): number[] => sampleClip(run, ((anim.stats().frame / anim.stats().frames) * 19) / 30, { loop: true }).parts.find((p) => p.name === 'lthigh')!.rotation;
    const thigh = (): number[] => quatOfMatrix(sk.local[1]!);
    return { t, w, anim, frame, fades, cuts, ends, runThigh, thigh, layers: () => layers, at: () => n, kill: () => { dead = true; } };
  }
  /** Two turns equal (q and -q the same), to the skeleton's float32 matrices. */
  const sameTurn = (a: readonly number[], b: readonly number[], label: string): void => {
    const sign = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]! < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) expect(a[i]!, `${label} [${i}]`).toBeCloseTo(sign * b[i]!, 6);
  };

  it("B3: killed 0.3 s into a claymore's placing, popped on the death's update with one cross-fade; the hold's own end later asks none", () => {
    const p = page();
    for (let i = 0; i < 30; i++) p.frame();
    p.t.grenade.select('Claymore');
    p.t.grenade.pull();                                                 // the placing's push: its hold, then its clip
    const pushed = p.at();
    expect(p.w.holding?.clip).toBe('seal_place_claymore');
    expect(p.t.throwPose.playing()).toBe(true);
    for (let i = 0; i < 18; i++) p.frame();                             // 0.3 s in, before the 1.3 s set-down
    p.kill();
    const killed = p.at();
    for (let i = 0; i < 200; i++) p.frame();
    expect(p.cuts).toEqual([`${killed + 1} death`]);                   // the thrower's cut, on the update after the death
    expect(p.t.throwPose.playing()).toBe(false);
    expect(p.ends.at(-1)).toMatch(/ complete$/);                       // the hold ran out later, on its own clock
    expect(Number(p.ends.at(-1)!.split(' ')[0])).toBeGreaterThan(killed + 1);
    // one pop: the body's cross-fade on the next frame drawn, none at the hold's own end
    expect(p.fades.filter((f) => f.frame > pushed + 1).map((f) => f.frame)).toEqual([killed + 2]);
  });

  it('B4: an M67 taken up from the run -- the frozen pose eases onto the live run over 0.3 s, E((0.3 - t) / 0.3), a tick run on the first frame drawn; the play unchanged', () => {
    const p = page();
    for (let i = 0; i < 60; i++) p.frame(FORWARD);
    expect(p.anim.stats().play).toBe('loco:stand');
    const frozen = p.thigh();                                           // the pose drawn at the take-up
    const before = p.fades.length;
    expect(p.t.grenade.equip(true, 'M67')).toBe(true);
    for (let k = 1; k <= 24; k++) {
      p.frame(FORWARD);
      const t = k * TICK;
      expect(p.anim.stats().play, `${k} frames on`).toBe('loco:stand');
      sameTurn(p.thigh(), slerp(p.runThigh(), frozen, blendWeight(Math.max(0, (0.3 - t) / 0.3))), `${k} frames on`);
    }
    expect(p.fades.slice(before)).toEqual([{ frame: p.at() - 23, seconds: 0.3, run: TICK }]);   // asked once
    expect(p.layers()).toBe(1);                                         // on the throw's own layer: one layer mounted
  });

  it('B4: a claymore taken up asks it too, and the next throwable; the firearm taken back asks none (the ordinary put-away takes the swap branch, D:L461966-461968)', () => {
    const p = page();
    for (let i = 0; i < 30; i++) p.frame();
    const asked = (): number => p.fades.length;
    let was = asked();
    p.t.grenade.select('Claymore');
    p.frame();
    expect(asked() - was).toBe(1);
    was = asked();
    p.t.grenade.select('rifle');                                         // the put-away: the swap branch, no snapshot (as the original)
    p.frame();
    expect(asked() - was).toBe(0);
    was = asked();
    p.t.grenade.select('M67');
    p.frame();
    expect(asked() - was).toBe(1);
    expect(TAKE_UP_FADE_READING).toBe('a throwable, the claymore or the PMN');
  });

  it('B4 (the review, F1): a throwable taken up with the launcher raised asks no snapshot -- the launcher lowers through its own clip (FUN_005a6b70)', () => {
    const p = page();
    for (let i = 0; i < 30; i++) p.frame();
    (p.t.rocket as unknown as { held_: number | null }).held_ = 145;   // the LAW raised (the hand word 4)
    expect(p.t.rocket.up()).toBe(true);
    const was = p.fades.length;
    expect(p.t.grenade.equip(true, 'M67')).toBe(true);
    p.frame();
    expect(p.t.rocket.up()).toBe(false);                               // lowered: one item in the hand (M7)
    expect(p.fades.length - was).toBe(0);
    p.t.grenade.select('M67');                                         // already up: no second take-up
    p.t.grenade.select('Claymore');                                    // from a throwable now: the snapshot
    p.frame();
    expect(p.fades.length - was).toBe(1);
  });
});

// OT.R59 (RECONNECT-GHOST; the gameplay seat's condition 4 (b), `RECONNECT_HELD_LAUNCHER_ADAPTATION`, server `room.ts`):
// a resumed seat's raised launcher comes back lowered, on the room and the page alike -- the page's at once, as the room
// lowered its own in `handBack`: no throw to the room, no lower clip holding the firearm's trigger.
describe("OT.R59 (condition 4 (b)): a resumed seat's raised launcher comes back lowered", () => {
  it('hands.resumed with held null: the launcher down, no throw to the room, the walk\'s set cleared, the first trigger the firearm\'s', () => {
    const { t, calls, thrown } = rig();
    (t.rocket as unknown as { held_: number | null }).held_ = 145;   // the LAW up at the drop
    const hands = t.hands() as ReturnType<typeof t.hands> & { resumed?(r: { pouch: Record<string, number>; held: number | null }): void };
    hands.resumed!({ pouch: {}, held: null });
    expect(t.rocket.up()).toBe(false);
    expect(thrown).toEqual([]);                                      // the room lowered its own: nothing sent
    expect(calls).toContain('launcherCleared');
    expect(hands.trigger(true)).toBe(false);                         // the firearm's own trigger, at once
  });
});

/**
 * M203-FIRE-SOUND (issue #285, the owner's playtest: the M4A1's M203 launches with no sound; research 94 §C4.5). The
 * release (`FUN_005c5340`) plays the fire sound of the record the launch shows -- the M203 item (141) for the M203 and
 * F2000 rounds and the MGL turret's (D:L479422-479426), else the carrier `FUN_005c67d0` finds in the kit
 * (D:L479676-479708) -- by the camera's distance (`FUN_003d2c50` D:L479449-479450, `GameAudio.onFire`), then launches
 * the round, whose own FireAnimName plays on the projectile (`FUN_003caf60` D:L320608-320613): `m203he_start`, which
 * names no sound on any MP map. Both directions: the shooter's page, and another's, which runs the same release on its
 * copy (research 304 §9); a joiner's catch-up hears nothing.
 */
describe.skipIf(ZWEAPON === null)(`M203-FIRE-SOUND: a launch's report and its round's zAnim, shooter and others (research 94 §C4.5)${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const table = ZWEAPON ? readKitTable(ZWEAPON) : null;
  /** The part on a kit, its audio a recorder of the two asks (or `audio`), the room's others' kits by `remoteKit`. */
  function kitRig(kit: number[], o: { audio?: MatchThrowDeps['audio']; remoteKit?: MatchThrowDeps['remoteKit'] } = {}) {
    const loadouts = new PlayerLoadout();
    vi.spyOn(loadouts, 'tables').mockReturnValue(table);
    vi.spyOn(loadouts, 'loadout').mockReturnValue(kit as unknown as Loadout);
    const asked: [string, string, unknown][] = [];
    const audio = o.audio ?? ({
      onAnimCallback: (n: string, at: unknown) => { asked.push(['anim', n, at]); return null; },
      onFire: (w: string, at: unknown) => { asked.push(['fire', w, at]); return null; },
      play: () => false,
    } as never);
    const base = rig();
    const walk = { ...(base.deps.walk as unknown as Record<string, unknown>), gridOfGround: () => null } as never;
    const { t } = rig({ loadouts, walk, audio, ...(o.remoteKit ? { remoteKit: o.remoteKit } : {}) });
    t.hands().spawned(new KitRounds(table, kit as unknown as Loadout));
    return { t, asked };
  }
  const round = (id: number): ThrowableRecord => table!.rounds.get(id)!.record;
  const rocketLaunch = (t: ReturnType<typeof rig>['t'], launcher: number, id: number): void => {
    (t.rocket as unknown as { emit(k: string, e: unknown): void }).emit('launch', {
      launcher, round: { id, name: round(id).name }, record: round(id), from: [1, 2, 3], dir: [0, 0, -1], velocity: [0, 0, -200], to: [1, 2, -100], rounds: 0,
    });
  };

  it("the shooter's M4A1-M203 HE asks the M203's report at the launch point, then the round's zAnim; its M79 the M79's", () => {
    const m4 = kitRig([61, 5, 171, 175, 173]);
    m4.t.hands().launched(round(171), [1, 2, 3], [0, 0, -270]);
    expect(m4.asked).toEqual([['fire', 'M203', [1, 2, 3]], ['anim', 'm203he_start', [1, 2, 3]]]);
    const m79 = kitRig([143, 5, 176, 178, 179]);
    m79.t.hands().launched(round(176), [1, 2, 3], [0, 0, -400]);
    expect(m79.asked).toEqual([['fire', 'M79', [1, 2, 3]], ['anim', 'm203he_start', [1, 2, 3]]]);
  });

  it("the shooter's LAW asks the LAW's report, the RPG-7 the RPG LAUNCHER's, each before its trail", () => {
    const law = kitRig([54, 5, 145, 254, 121]);
    rocketLaunch(law.t, 145, 185);
    expect(law.asked).toEqual([['fire', 'LAW', [1, 2, 3]], ['anim', 'law_trail', [1, 2, 3]]]);
    const rpg = kitRig([58, 5, 146, 254, 121]);
    rocketLaunch(rpg.t, 146, 186);
    expect(rpg.asked).toEqual([['fire', 'RPG LAUNCHER', [1, 2, 3]], ['anim', 'rpg_trail', [1, 2, 3]]]);
  });

  it("another page: the room's live round asks the owner's report and the round's zAnim; a hydrate asks nothing", () => {
    const kits = new Map<number, number[]>([[7, [143, 5, 176, 178, 179]], [8, [54, 5, 145, 254, 121]]]);
    const { t, asked } = kitRig([62, 5, 121, 122, 123], { remoteKit: (owner) => kits.get(owner) ?? null });
    t.netDeps().remoteGrenade('M203 HE', [1, 2, 3], [0, 0, -270], 9, 11, undefined);     // the M203's: no kit needed
    expect(asked).toEqual([['fire', 'M203', [1, 2, 3]], ['anim', 'm203he_start', [1, 2, 3]]]);
    asked.length = 0;
    t.netDeps().remoteGrenade('GL HE', [4, 5, 6], [0, 0, -400], 7, 12, undefined);
    t.netDeps().remoteGrenade('LAW HEAT', [7, 8, 9], [0, 0, -200], 8, 13, undefined);
    expect(asked).toEqual([['fire', 'M79', [4, 5, 6]], ['anim', 'm203he_start', [4, 5, 6]], ['fire', 'LAW', [7, 8, 9]], ['anim', 'law_trail', [7, 8, 9]]]);
    asked.length = 0;
    t.netDeps().remoteGrenade('M203 HE', [1, 2, 3], [0, 0, -270], 9, 14, { state: 'flight', age: 0.5, fuse: 9.5, removal: 9.6, bounces: 0, dud: false });
    expect(asked).toEqual([]);                                                            // a joiner's catch-up: nothing
  });

  it("LAUNCH_REPORT_KIT_READING: an owner whose kit the page does not know -- the M79's report stays silent, the zAnim heard", () => {
    expect(LAUNCH_REPORT_KIT_READING).toBeNull();
    const { t, asked } = kitRig([62, 5, 121, 122, 123], { remoteKit: () => null });
    t.netDeps().remoteGrenade('GL HE', [4, 5, 6], [0, 0, -400], 7, 12, undefined);
    expect(asked).toEqual([['anim', 'm203he_start', [4, 5, 6]]]);
    const none = kitRig([62, 5, 121, 122, 123]);                                          // no lookup lent at all
    none.t.netDeps().remoteGrenade('GL HE', [4, 5, 6], [0, 0, -400], 7, 12, undefined);
    none.t.netDeps().remoteGrenade('M203 HE', [1, 2, 3], [0, 0, -270], 7, 13, undefined);
    expect(none.asked).toEqual([['anim', 'm203he_start', [4, 5, 6]], ['fire', 'M203', [1, 2, 3]], ['anim', 'm203he_start', [1, 2, 3]]]);
  });

  const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
  const haveSound = existsSync(resolve(fixtures, 'RUN/SOUNDS/BNKSTORE.ZAR')) && existsSync(resolve(fixtures, 'RUN/MP2.ZDB'));
  it.skipIf(!haveSound)("on MP2's own banks: the shooter and another page hear `.M203_GREN` at Close, nothing at Far; m203he_start sounds nothing", async () => {
    let played = 0;
    const out = {
      unlocked: false, state: 'locked',
      unlock(): void { this.unlocked = true; }, setGain: (): void => {}, play: (): void => { played++; }, setReverb: (): void => {}, rampReverb: (): void => {}, loop: () => null,
    };
    const audio = new GameAudio(out as never);
    audio.setData(await soundFromDisc(new FsAssetSource(fixtures), 'RUN/MP2.ZDB', 'MP2'));
    out.unlock();
    audio.setListener([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);                // the camera at the origin
    const { t } = kitRig([61, 5, 171, 175, 173], { audio: audio as never, remoteKit: () => null });
    t.hands().launched(round(171), [0, 0, -2], [0, 0, -270]);                             // 0.2 m off: Close
    expect(audio.stats().byName['.M203_GREN']).toBe(1);
    t.hands().launched(round(171), [0, 0, -100], [0, 0, -270]);                           // 10 m: Med, the M203 names none
    t.hands().launched(round(171), [0, 0, -600], [0, 0, -270]);                           // 60 m: Far, none either
    expect(audio.stats().byName['.M203_GREN']).toBe(1);
    t.netDeps().remoteGrenade('M203 HE', [0, 0, -3], [0, 0, -270], 9, 11, undefined);     // another's, live, Close
    expect(audio.stats().byName['.M203_GREN']).toBe(2);
    t.netDeps().remoteGrenade('M203 HE', [0, 0, -3], [0, 0, -270], 9, 12, { state: 'flight', age: 0.5, fuse: 9.5, removal: 9.6, bounces: 0, dud: false });
    expect(audio.stats().byName['.M203_GREN']).toBe(2);                                   // the catch-up: nothing
    expect(played).toBe(2);                                                               // and nothing else: the zAnim is silent
  }, 60000);
});


it('hands exposes the actual grenade fuse accessor regardless of equipped item', () => {
  const { t } = rig();
  const read = vi.spyOn(t.grenade, 'c4Fuse').mockReturnValue({ fill: 0.5 });
  expect(t.hands().c4Fuse?.()).toEqual({ fill: 0.5 });
  expect(read).toHaveBeenCalledOnce();
  read.mockReturnValue(null);
  expect(t.hands().c4Fuse?.()).toBeNull();
  t.dispose();
});

/**
 * LATER 192 (research 215 s8.5; reading, pending review): the rocket launcher (class 0x91, ids 145-150) is a bullet class
 * (`FUN_003d1e20` D:L324476-324483) with the firearm's raise times (`FUN_003d1d90` in `FUN_005c4b10` D:L478849-478857);
 * its press asks the raise (every class but 'y', D:L453633-453634) and `FUN_005c0ae0` refuses its rocket while the raise
 * reads below 1 (D:L476423-476438; the exemption is class 0xcd's). The page's order (`./main`, `./matchMount`): the press
 * (`hands.trigger`), `Play.frame` (the raise's ask and tick, this part's `setItemRaise` feed), then this part's `frame`
 * (the held pull asked again) -- the rifle's (`raiseRefusal.test.ts`).
 */
/** LATER 199: the walk's `fireAllowed` (the playing motion's NoFire) as the launcher rig reads it; free by default. */
const nofire = { allowed: (): boolean => true };
describe("LATER 192: the launcher's rocket waits for the raise (FUN_005c0ae0 D:L476423-476438)", () => {
  /** The part on a play whose raise is a real `WeaponRaise` fed as `Play.frame` feeds it; a LAW up; each `pull` counted. */
  function launcherRig(raise = new WeaponRaise()) {
    let read: (() => ItemRaise) | null = null;
    const play = {
      partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
      setRifleStowed: () => {}, addPoseLayer: () => {},
      setItemRaise: (r: () => ItemRaise) => { read = r; },
      weaponStats: () => ({ raise: raise.stats() }),
    };
    const { t, deps } = rig({ play: play as never });
    let dead = false;
    (deps.walk as unknown as { isDead: () => boolean }).isDead = () => dead;
    (deps.walk as unknown as { fireAllowed: () => boolean }).fireAllowed = () => nofire.allowed();   // LATER 199
    (t.rocket as unknown as { held_: number | null }).held_ = 145;                     // a LAW up
    const pulls: number[] = [];
    let f = 0;
    vi.spyOn(t.rocket, 'pull').mockImplementation(() => { pulls.push(f); return null; });
    const feed = new RaiseFeed();
    const hands = t.hands();
    /** One page frame: `Play.frame`'s raise (the firearm's trigger up, this part's hand), then this part's `frame`. */
    const frame = (dt: number): void => {
      raise.frame(dt, feed.input({}, false, { trigger: false, aiming: false }, read!()));
      t.frame(dt);
      f++;
    };
    return { t, raise, hands, pulls, frame, kill: () => { dead = true; } };
  }
  /** Pressed before frame 0 and held for `frames` page frames of `dt`: the frames a rocket was asked on. */
  function held(dt: number, frames: number, raise?: WeaponRaise): number[] {
    const r = launcherRig(raise);
    r.hands.trigger(true);
    for (let i = 0; i < frames; i++) r.frame(dt);
    return r.pulls;
  }

  it('RED: from a lowered body (a spawn) the rocket waits for the raise -- at the game frame, two frames after the press', () => {
    expect(held(GAME_FRAME_DT, 10)).toEqual([RAISE_REFUSAL_FRAMES]);                     // today: [0]
  });
  // LATER 185, restated: was "at 60 Hz the port's envelope lets it go five frames after the press", [5] -- the page's
  // step in doubles. The raise steps once a game frame (`RAISE_ENVELOPE_STEP_READING`): the rifle's count
  // (`raiseRefusal.test.ts`), game frames ending on page frames 2, 4 and 6.
  it("RED: at 60 Hz the rocket goes on the page frame where the press's game frame + RAISE_REFUSAL_FRAMES ends (6), the rifle's count", () => {
    expect(held(1 / 60, 20)).toEqual([6]);                                               // today: [5]
  });
  it("RED: the launcher's press raises the body (D:L453633-453634), and the countdown holds it up", () => {
    const r = launcherRig();
    r.hands.trigger(true); r.hands.trigger(false);                                        // a tap shorter than a frame, kept
    // LATER 185, restated: was one page frame -- the raise reads the trigger once a game frame, the press's ending on
    // page frame 2 at 60 Hz (the tap kept till then)
    for (let i = 0; i < 3; i++) r.frame(1 / 60);
    expect(r.raise.stats().state).toBe('up');                                             // today: 'down'
    for (let i = 0; i < 270; i++) r.frame(1 / 60);                                        // 4.5 s
    expect(r.raise.weight()).toBe(1);
  });
  it('RED: let go before the raise reads 1, no rocket (states 0 and 3 return before the test, D:L476381-476416)', () => {
    const r = launcherRig();
    r.hands.trigger(true);
    r.frame(1 / 60); r.frame(1 / 60);
    r.hands.trigger(false);
    for (let i = 0; i < 20; i++) r.frame(1 / 60);
    expect(r.pulls).toEqual([]);                                                          // today: [0]
  });
  it('RED: a slot change lets the waiting pull go (LAUNCHER_PULL_WAIT_READING)', () => {
    const r = launcherRig();
    r.hands.trigger(true);
    r.frame(1 / 60);
    r.t.rocket.lower();                                                                     // the firearm taken up
    (r.t.rocket as unknown as { held_: number | null }).held_ = 145;                       // the launcher again, no press
    for (let i = 0; i < 20; i++) r.frame(1 / 60);
    expect(r.pulls).toEqual([]);                                                          // today: [0]
    expect(LAUNCHER_PULL_WAIT_READING).toBe('the raise only');
  });
  // LATER 199: after the raise, `FUN_005c0ae0` asks the playing motion's NoFire (`FUN_005a7de0(actor, 1, ..)` D:L476442),
  // for the launcher's class as for every bullet class (0x91, LATER 192); the request runs each frame while the trigger
  // is held, so a pull refused under NoFire waits, as one refused by the raise does, and goes on the first frame it lifts.
  it("RED: LATER 199 -- a raised body under the playing motion's NoFire holds the pull; it goes on the frame NoFire lifts", () => {
    const raise = new WeaponRaise();
    for (let i = 0; i < 12; i++) raise.frame(1 / 60, { trigger: true, aiming: false });
    raise.frame(1 / 60, { trigger: false, aiming: false });
    expect(raise.weight()).toBe(1);
    const r = launcherRig(raise);
    let allowed = false;
    nofire.allowed = () => allowed;
    r.hands.trigger(true);
    for (let i = 0; i < 5; i++) r.frame(1 / 60);
    expect(r.pulls).toEqual([]);                                                          // today: [0]
    allowed = true;
    r.frame(1 / 60);
    expect(r.pulls).toEqual([5]);
    nofire.allowed = () => true;
  });

  it('a raised body fires on the press, one rocket a pull', () => {
    const raise = new WeaponRaise();
    for (let i = 0; i < 12; i++) raise.frame(1 / 60, { trigger: true, aiming: false });
    raise.frame(1 / 60, { trigger: false, aiming: false });
    expect(raise.weight()).toBe(1);
    expect(held(1 / 60, 20, raise)).toEqual([0]);
  });
  // LATER 185, restated: was [0] at 60 Hz, the press's page frame. The snap is the raise tick's, run at the press's game
  // frame's end: the press's page frame at the game frame's step, at 60 Hz that one or the next (the rifle's,
  // `raiseRefusal.test.ts`).
  it("a partly lowered body: the press's raise snaps to the hold (D:L494213-494216), the rocket on the press's game frame", () => {
    for (const dt of [GAME_FRAME_DT, 1 / 60]) {
      const raise = new WeaponRaise(), clock = new GameFrameAccumulator();   // the raise's game frames, as the test sees them
      const step = (input: { trigger: boolean; aiming: boolean }): void => { raise.frame(dt, input); clock.advance(dt); };
      for (let i = 0; i < 12; i++) step({ trigger: true, aiming: false });
      for (let t = 0; t < 5.2; t += dt) step({ trigger: false, aiming: false });   // 5 s, then 0.2 s into the lower
      expect(raise.weight(), `${dt}`).toBeGreaterThan(0);
      expect(raise.weight(), `${dt}`).toBeLessThan(1);
      let first = 0;
      while (clock.advance(dt) === 0) first++;                                 // the page frame the press's game frame ends on
      expect(held(dt, 5, raise), `${dt}`).toEqual([first]);
      if (dt === GAME_FRAME_DT) expect(first).toBe(0);
    }
  });
  /**
   * The review's F1: the launcher's held trigger is the raise's only while the launcher is up and the body alive --
   * `RocketLauncher.drop` (OT.R59's resumed seat, `RECONNECT_HELD_LAUNCHER_ADAPTATION`) sends no `equip`, and the dead's
   * controller takes the respawn press alone (`FUN_00592560` D:L451644-451731; the firearm's `beforeNet` lets go).
   */
  it("F1: the launcher dropped with its trigger held (a resumed seat) lets the raise go -- the idle's countdown lowers it", () => {
    const r = launcherRig();
    r.hands.trigger(true);
    for (let i = 0; i < 20; i++) r.frame(1 / 60);
    expect(r.raise.stats().state).toBe('up');
    expect(r.pulls).toEqual([6]);                                                      // LATER 185: was [5], the page's step
    const hands = r.hands as typeof r.hands & { resumed?(s: { pouch: Record<string, number>; held: number | null }): void };
    hands.resumed!({ pouch: {}, held: null });                                             // the room lowered it: no equip
    expect(r.t.rocket.up()).toBe(false);
    for (let i = 0; i < 330; i++) r.frame(1 / 60);                                        // 5.5 s, the trigger never let go
    expect(r.raise.stats().state).toBe('down');                                           // was: 'up'
  });
  it('F1: killed with the trigger held, the launcher asks no raise -- the countdown lowers the body', () => {
    const r = launcherRig();
    r.hands.trigger(true);
    for (let i = 0; i < 20; i++) r.frame(1 / 60);
    expect(r.raise.stats().state).toBe('up');
    r.kill();
    for (let i = 0; i < 330; i++) r.frame(1 / 60);                                        // 5.5 s dead, the trigger held
    expect(r.raise.stats().state).toBe('down');                                           // was: 'up'
    expect(r.pulls).toEqual([6]);                                                      // LATER 185: was [5], the page's step
  });
});

// TRIGGER-SWAP (Craig's report, 2026-11-09): what the hands hand the firearm with a trigger they took and still held -- null
// while they own it (an item up, the launcher up or still coming down), else the kit pull count `kit+0x818` their item
// raised in the hold: 0 under a hand throw, a press while it was pending or after its hand opened (the launch's 1,
// `FUN_005c1970` D:L477023-477025, zeroed by its own kit frame at the edge 0, `FUN_005c0ae0` D:L476380-476382 -- capture
// GR-1, research 326 §7.2; was: 1 for a press while pending), 1 when a rocket left (`FUN_005be9a0` D:L475514-475516), else 0;
// zeroed by a let-go (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400).
describe('TRIGGER-SWAP: the hands hand a held trigger to the firearm (heldPulls)', () => {
  it('null while a throwable is up; 0 after a wind-up put away; 0 after a press while pending (GR-1) or after the hand opened', () => {
    const { t } = rig();
    let up = true, phase: 'ready' | 'throwing' = 'ready';
    vi.spyOn(t.grenade, 'equipped').mockImplementation(() => up);
    vi.spyOn(t.grenade, 'phase').mockImplementation(() => phase as never);
    vi.spyOn(t.grenade, 'pull').mockImplementation(() => {});
    vi.spyOn(t.grenade, 'release').mockImplementation(() => {});
    const hands = t.hands();
    expect(hands.trigger(true)).toBe(true);
    expect(hands.heldPulls?.()).toBeNull();
    up = false;
    expect(hands.heldPulls?.()).toBe(0);
    up = true;
    hands.trigger(false);
    phase = 'throwing';
    hands.trigger(true);                                 // pressed again before the hand opened
    phase = 'ready'; up = false;                         // the last one gone: back to the firearm
    expect(hands.heldPulls?.()).toBe(0);                 // GR-1 (research 326 §7.2), was: 1
    hands.trigger(false);
    expect(hands.heldPulls?.()).toBe(0);
    up = true; phase = 'throwing';                       // GRENADE-RETHROW fold 2: the hand already open
    hands.trigger(true);
    phase = 'ready'; up = false;
    expect(hands.heldPulls?.()).toBe(0);
    hands.trigger(false);
  });
  it('1 after a rocket left in the hold; null while the launcher is up', () => {
    const { t } = rig();
    let up = true;
    vi.spyOn(t.rocket, 'up').mockImplementation(() => up);
    const launch = vi.spyOn(t.rocket, 'pull').mockReturnValue({} as never);
    const hands = t.hands();
    expect(hands.trigger(true)).toBe(true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(hands.heldPulls?.()).toBeNull();
    up = false;
    expect(hands.heldPulls?.()).toBe(1);
    hands.trigger(false);
  });
});

// TRIGGER-SWAP fold (research 211 §10): the slot change leaves the trigger and the kit's count (`FUN_005c4b10`
// D:L478779-478936), so an item taken up over a held firearm trigger suspends it (owed back with its count), never a
// plain let-go; the turret's rounds come with a dismount; and a rocket's FireWait on the kit's timer +0x81c
// (`FUN_005be9a0` D:L475514-475517, refused at `FUN_005c0ae0` D:L476446-476448) is handed to the firearm at the lower.
describe('TRIGGER-SWAP fold: the hands and the slot changes', () => {
  it('a throwable or the launcher up suspends the firearm\'s held trigger (`MatchFirearm.suspendTrigger`)', () => {
    const { t, deps } = rig();
    const suspend = vi.fn();
    (deps.firearm() as unknown as { suspendTrigger: () => void }).suspendTrigger = suspend;
    (t.grenade as unknown as { emit(k: 'equip', on: boolean, item: string | null): void }).emit('equip', true, 'M67');
    expect(suspend).toHaveBeenCalledTimes(1);
    (t.rocket as unknown as { emit(k: 'equip', on: boolean, id: number | null): void }).emit('equip', true, 145);
    expect(suspend).toHaveBeenCalledTimes(2);
  });
  it('heldPulls: the turret\'s count after a dismount (`PageHands.heldPulls`), null while the page owns the trigger', () => {
    const { t } = rig();
    let mounted = true;
    const hands = t.hands({ trigger: () => mounted, mounted: () => mounted, heldPulls: () => (mounted ? null : 3) });
    expect(hands.trigger(true)).toBe(true);
    expect(hands.heldPulls?.()).toBeNull();
    mounted = false;
    expect(hands.heldPulls?.()).toBe(3);
  });
  it('a rocket that left: its FireWait handed to the firearm at the lower (`Fire.holdWait`); a lower with none, nothing', () => {
    const { t, deps } = rig();
    const holdWait = vi.fn();
    (deps.firearm() as unknown as { fire: { holdWait: (s: number) => void } }).fire.holdWait = holdWait;
    const emit = (on: boolean, id: number | null): void => (t.rocket as unknown as { emit(k: 'equip', on: boolean, id: number | null): void }).emit('equip', on, id);
    emit(true, 145);
    emit(false, null);
    expect(holdWait).not.toHaveBeenCalled();
    emit(true, 145);
    vi.spyOn(t.rocket, 'up').mockReturnValue(true);
    vi.spyOn(t.rocket, 'pull').mockReturnValue({ fireWait: 3 } as never);
    t.hands().trigger(true);
    vi.mocked(t.rocket.up).mockReturnValue(false);
    emit(false, null);
    expect(holdWait).toHaveBeenCalledTimes(1);
    expect(holdWait.mock.calls[0]![0]).toBeGreaterThan(2.5);
    expect(holdWait.mock.calls[0]![0]).toBeLessThanOrEqual(3);
  });
});
