// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh, Scene, Vector3, type MeshBasicMaterial, type Vector2 } from 'three';
import {
  buildGrid, EMPTY_ITEM, HELD_RIFLE, HELD_SIDEARM, materialTable, readKitTable, tracerRound, type Grid, type GridParams, type MotionClip, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import { passingSound } from '@s2u/sound';
import { WeaponPose } from '../src/weaponPose';
import { Accuracy, perturb, RADIUS_FACTOR, tangentPerPixel } from '../src/accuracy';
import { ShotCone, type AimMover } from '../src/net/shotCone';
import { Button, type Command } from '../src/net/protocol';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { Fire, type FireEvent, type FireSource, type FireWeapon, type ReloadEndReason } from '../src/fire';
import { KitRounds } from '../src/firearms';
import { Hud, RangeFinder } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { botDisplayName } from '../src/botPresentation';
import { mountFirearm, type FirearmHands, type MatchFirearmDeps } from '../src/matchFirearm';
import { Play } from '../src/play';
import type { ReloadLifeSpec } from '../src/reloadLock';
import { RemotePlayers } from '../src/remotePlayers';
import type { StillReloadLife } from '../src/stillReloadLife';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import { Zoom } from '../src/zoom';
import { GrenadeThrower } from '../src/grenade';
import { meterPower, meterTint } from '../src/reticle';
import type { PlaySnapshot } from '../src/walk';
import { ScopePulse } from '../src/rumble';
import type { LoadedMap } from '../src/loadMap';

/**
 * ONE-WIRE (web research 222): `./matchFirearm` is the one firearm -- `/testroom` (`./main`) and the front end's match
 * (`./matchMount`) both mount it. `/testroom`'s equipment (the throwables, the launcher, the turret, the R2 inventory) and
 * its sound plug into it (`FirearmHands`, `FirearmSound`); the front end mounts it without them.
 */

afterEach(() => { vi.restoreAllMocks(); });

const hands = (over: Partial<FirearmHands> = {}): FirearmHands => ({
  launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
  putAway: () => {}, spawned: () => {}, trigger: () => false, launched: () => {}, icon: () => null, magazine: () => null,
  mounted: () => false, ...over,
});

function rig(extra: Partial<MatchFirearmDeps> = {}) {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const play = new Play();
  const remote = new RemotePlayers(scene);
  const hud = new Hud();
  const loadouts = new PlayerLoadout();
  const firearm = mountFirearm({
    scene, fly, walk, play, remote, hud, loadouts, view: () => null, map: () => null, body: () => null, net: () => null,
    blocked: () => false, refreshFog: () => {}, ...extra,
  });
  return { scene, fly, walk, play, remote, hud, loadouts, firearm };
}
const sourceOf = (fire: Fire): FireSource => (fire as unknown as { source: FireSource }).source;

describe('the Fire source: one, with every page\'s hooks', () => {
  it('explicit FULL_SLOT/EMPTY_ITEM firearm slots never use the baked fallback for firing or shoulder selection', () => {
    const { firearm, walk } = rig();
    vi.spyOn(walk, 'mode').mockReturnValue('walk');
    vi.spyOn(walk, 'swapGate').mockReturnValue(true);
    firearm.spawnKit('seal', [254, 16, 123, 122, 254]);
    expect(firearm.item()).toBe('pistol');
    expect(sourceOf(firearm.fire).ready?.()).toBe(true);
    firearm.kit.place('rifle');
    expect(sourceOf(firearm.fire).ready?.()).toBe(false);
    expect(firearm.shoulderGate(0)).toBe(false);
    firearm.kit.place('pistol');
    expect(sourceOf(firearm.fire).ready?.()).toBe(true);
    firearm.spawnKit('seal', [81, 254, 194, 122, 254]);
    expect(sourceOf(firearm.fire).ready?.()).toBe(true);
    expect(firearm.shoulderGate(1)).toBe(false);
    firearm.kit.place('pistol');
    expect(sourceOf(firearm.fire).ready?.()).toBe(false);
    firearm.spawnKit('seal', [81, 255, 194, 122, 254]);
    expect(firearm.shoulderGate(1)).toBe(false);
  });

  it('PF-17/18/19 (sprint 28): NoFire refuses the round only, the flinch and Prone cover the reload, the cut ends the lock', () => {
    const { firearm, walk, play } = rig();
    const src = sourceOf(firearm.fire);
    vi.spyOn(walk, 'fireAllowed').mockReturnValue(false);
    expect(src.fireRefused?.()).toBe(true);
    vi.spyOn(walk, 'flinching').mockReturnValue(true);
    expect(src.flinching?.()).toBe(true);
    const cut = vi.spyOn(play, 'takeReloadCut');
    src.reloadCut?.();
    expect(cut).toHaveBeenCalled();
  });
  it('RED: LATER 180 -- the page refuses the trigger\'s round below a fully raised rifle (FUN_005c0ae0 D:L476423-476438)', () => {
    const { firearm, play } = rig();
    const src = sourceOf(firearm.fire);
    const stats = play.weaponStats();
    vi.spyOn(play, 'weaponStats').mockReturnValue({ ...stats, raise: { ...stats.raise, weight: 0.9 } });
    expect(src.raiseRefused?.()).toBe(true);
    vi.spyOn(play, 'weaponStats').mockReturnValue({ ...stats, raise: { ...stats.raise, weight: 1 } });
    expect(src.raiseRefused?.()).toBe(false);
  });
  it('LATER 179\'s review F1: the firearm is the hand\'s item only with nothing else up -- a throwable or the launcher shuts its dry branch (FUN_005c0fd0 D:L476574-476590)', () => {
    const up = { item: false, launcher: false };
    const { firearm } = rig({ hands: hands({ itemUp: () => up.item, launcherUp: () => up.launcher }) });
    const src = sourceOf(firearm.fire);
    expect(src.inHand?.()).toBe(true);
    up.item = true;
    expect(src.inHand?.()).toBe(false);
    up.item = false; up.launcher = true;
    expect(src.inHand?.()).toBe(false);
    up.launcher = false;
    expect(src.inHand?.()).toBe(true);
    expect(sourceOf(rig().firearm.fire).inHand?.()).toBe(true);                  // no hands (the front end): always the firearm
  });
  it('LATER 179\'s review F1: a throwable up, the emptied firearm neither clicks nor reloads; put away, it does', () => {
    let item = false;
    const { firearm, walk } = rig({ hands: hands({ itemUp: () => item }) });
    vi.spyOn(walk, 'fireAim').mockReturnValue({ eye: [0, 20, 0], far: [0, 20, -1000] });
    const fire = firearm.fire;
    fire.takeWeapon(fire.weaponRecord(), [0, fire.weaponRecord().magazine]);
    const types: string[] = [];
    fire.subscribe((e) => { if (e.type === 'dry' || e.type === 'reloadStart') types.push(e.type); });
    item = true;
    fire.pull();
    fire.update(1 / 60); fire.update(1 / 60);
    expect(types).toEqual([]);
    item = false;
    fire.update(1 / 60);
    expect(types).toEqual(['dry', 'reloadStart']);
  });
  it('the look carries the pad\'s pitch push (main.ts\'s; the front end\'s copy had dropped it)', () => {
    const { firearm, walk, fly } = rig();
    vi.spyOn(walk, 'mode').mockReturnValue('walk');
    vi.spyOn(fly, 'pitchPush').mockReturnValue(0.25);
    expect(sourceOf(firearm.fire).look?.()?.pitchPush).toBe(0.25);
  });
  it("AD-1: the aim's cap is the loaded map's camera MID plus the view's extension, read at each cast (FUN_005aa6e0 D:L464106-464109; FUN_001f1470 D:L53202-53255): MP5's 550, 850 in a scope, 550 again out of it; none without a map", () => {
    let map: LoadedMap | null = { camera: { mid: 550, farPlane: 800 } } as unknown as LoadedMap;
    const { firearm } = rig({ map: () => map });
    const src = sourceOf(firearm.fire);
    expect(src.aimCap?.()).toBe(550);
    firearm.zoom.set(5);
    expect(src.aimCap?.()).toBe(850);
    firearm.zoom.set(4);
    expect(src.aimCap?.()).toBe(750);
    firearm.zoom.set(0);
    expect(src.aimCap?.()).toBe(550);
    map = null;
    expect(src.aimCap?.()).toBeNull();
  });
  it('the tracer rule is set (EFFECTS: every fourth round of a tracer weapon; the front end\'s copy had none)', () => {
    const rule = vi.spyOn(Fire.prototype, 'setTracerRule');
    rig();
    expect(rule).toHaveBeenCalledWith(tracerRound);
  });
});

describe('the hands plugin (/testroom\'s equipment)', () => {
  it('the trigger: another owner takes it first (the turret, the launcher, the throwable); else the firearm\'s', () => {
    const pull = vi.spyOn(Fire.prototype, 'pull');
    let taken = true;
    const seen: boolean[] = [];
    const { firearm } = rig({ hands: hands({ trigger: (down) => { seen.push(down); return taken; } }) });
    firearm.trigger(true);
    expect(seen).toEqual([true]);
    expect(pull).not.toHaveBeenCalled();
    taken = false;
    firearm.trigger(true);
    expect(pull).toHaveBeenCalledTimes(1);
  });
  it('no hands (the front end): the firearm\'s trigger at once', () => {
    const pull = vi.spyOn(Fire.prototype, 'pull');
    rig().firearm.trigger(true);
    expect(pull).toHaveBeenCalledTimes(1);
  });
  it('a launcher up: its round\'s icon in the fire-mode cell; the zoom told the launcher is in the hand', () => {
    let up = false;
    const { firearm, hud } = rig({ hands: hands({ launcherUp: () => up, launcherRoundIcon: () => 'firemode_AT4' }) });
    const icon = vi.spyOn(hud, 'setFireModeIcon');
    const hold = vi.spyOn(Zoom.prototype, 'setHold');
    up = true;
    firearm.showFireMode();
    expect(icon).toHaveBeenLastCalledWith('firemode_AT4');
    firearm.switchFireMode();
    expect(hold).toHaveBeenLastCalledWith('launcher');
  });
  it('a throwable up: the fire mode does not step, the zoom is told an item is in the hand', () => {
    const { firearm } = rig({ hands: hands({ itemUp: () => true }) });
    const hold = vi.spyOn(Zoom.prototype, 'setHold');
    const before = firearm.fireMode();
    firearm.switchFireMode();
    expect(firearm.fireMode()).toBe(before);
    expect(hold).toHaveBeenLastCalledWith('item');
  });
  it('a spawn: the equipment told with the kit\'s rounds; the room\'s kit asked as the page says (network)', () => {
    const got: unknown[] = [];
    const { firearm, loadouts } = rig({ network: () => false, hands: hands({ spawned: (r) => got.push(r) }) });
    const spawn = vi.spyOn(loadouts, 'spawn');
    firearm.spawnKit('seal');
    expect(spawn).toHaveBeenCalledWith('seal', { network: false, kit: null, type: null });
    expect(got).toHaveLength(1);
    expect(got[0]).toBeInstanceOf(KitRounds);
  });
  it('the front end\'s spawn takes the room\'s kit (network on by default)', () => {
    const { firearm, loadouts } = rig();
    const spawn = vi.spyOn(loadouts, 'spawn');
    firearm.spawnKit('terrorist', [1, 2], 3);
    expect(spawn).toHaveBeenCalledWith('terrorist', { network: true, kit: [1, 2], type: 3 });
  });
  it('mounted on a turret: the rifle is still -- a held trigger let go, no fire step', () => {
    const update = vi.spyOn(Fire.prototype, 'update');
    const release = vi.spyOn(Fire.prototype, 'release');
    let mounted = true;
    const { firearm } = rig({ hands: hands({ mounted: () => mounted }) });
    vi.spyOn(firearm.fire, 'triggerHeld').mockReturnValue(true);
    firearm.fireFrame(0.016, true);
    expect(update).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
    mounted = false;
    firearm.fireFrame(0.016, true);
    expect(update).toHaveBeenCalledTimes(1);
  });
  // LATER 526's second re-look, R1 (+ R3): the refused take hands the delay back run down by the time the take stood. The turret's
  // take holds the hand at once (`TurretPage.takeOwn`), so `mounted()` is true for the whole wait and `fireFrame` never calls
  // `Fire.update` in it: the wait is advanced by `fireFrame`'s mounted branch (`Fire.mountWait`). Driven through `fireFrame`.
  describe('LATER 526 re-look R1: the wait of a take the room refuses runs through fireFrame, mounted', () => {
    const taken = () => {
      let mounted = false;
      const r = rig({ hands: hands({ mounted: () => mounted }) });
      const fire = r.firearm.fire;
      const rec = { ...fire.weaponRecord(), reloadDelay: 1 };
      fire.takeWeapon(rec, [0, rec.magazine]);
      const starts: number[] = [];
      let t = 0;
      fire.subscribe((e) => { if (e.type === 'reloadStart') starts.push(t); });
      expect(fire.reload()).toBe(true);
      fire.setPressWindow(160);
      r.firearm.fireFrame(0.3, true); t += 0.3;                     // 0.7 s of the delay left
      const c = fire.mountTake();
      expect(c?.kind).toBe('reload');
      mounted = true;                                               // `takeOwn` holds right after `took()`
      const frames = (s: number) => { for (let i = 0; i < Math.round(s * 100); i++) { r.firearm.fireFrame(0.01, true); t += 0.01; } };
      return { r, fire, starts, frames, off: () => { mounted = false; } };
    };
    const untake = (fire: Fire) => (fire as unknown as { mountUntake(): void }).mountUntake();
    it('take, 0.2 s of frames, the refusal: the delay is the original minus 0.2 -- not yet at 0.4 s more, started by 0.6 s', () => {
      const { fire, starts, frames, off } = taken();
      frames(0.2);
      untake(fire);
      off();
      expect(fire.state().magazine.reloading, 'the delay pending').toBe(true);
      frames(0.4);
      expect(starts, '0.7 - 0.2 = 0.5 s left: 0.4 s on, not yet').toEqual([]);
      frames(0.2);
      expect(starts).toHaveLength(1);
    });
    it('a delay that ends during the wait: the reload starts at the next update after the refusal', () => {
      const { fire, starts, frames, off } = taken();
      frames(1);
      untake(fire);
      off();
      expect(starts).toEqual([]);
      frames(0.01);
      expect(starts).toHaveLength(1);
    });
    it('R3: a take the room accepted (the hold released, the rifle updated again) is no longer kept -- a later refusal hands nothing back', () => {
      const { fire, frames, off } = taken();
      frames(0.1);
      off();
      frames(0.1);                                                  // the dismount: `Fire.update` runs, the kept timer is let go
      (fire as unknown as { mountUntake(): void }).mountUntake();
      expect(fire.state().magazine.reloading).toBe(false);
    });
  });
  // LATER 530 (the second re-look of LATER 526's folds, R2): a reload's clip under way at the take. `FUN_005463c0` refuses
  // before its take's steps (D:L412131-412166), so the original's clip was never popped (`FUN_0058c350` D:L447983-447992,
  // in the take block from D:L412188) and played on through the wait. Driven as the page drives it: `fireFrame` with
  // `mounted()` true through the wait, the body's weapon pose stepped each frame before it (`Play.frame` runs before
  // `fireFrame`, `./main`), a still reload clip (`seal_reload`, a synthetic clip under the disc's name and its `motion.rdr`
  // fields as `reloadRun.test.ts` lays them: one-shot, 1.6 s) -- against the same frames with no take (the control).
  describe('LATER 530 (R2): the reload clip under way at a refused take comes back at the phase the wait ran it to', () => {
    const CLIP: MotionClip = { name: 'seal_reload', version: 5, duration: 45 / 30, frameCount: 45, rate: 30, unknown10: -1, unknown14: 1, parts: [] };
    const ENTRY = { looped: false, playback: 1.6, maxVelocity: -1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [], noPitchtwist: true };
    /** The firearm with a weapon pose on the body, a reload's clip 0.4 s under way; `take` taken and refused after `wait` s. */
    const run = (take: boolean, wait = 0.5, knock = false) => {
      let mounted = false;
      const r = rig({ hands: hands({ mounted: () => mounted }) });
      const pose = new WeaponPose(new Map([[CLIP.name, CLIP]]), new Map([[CLIP.name, ENTRY as never]]));
      (r.play as unknown as { weaponPose: WeaponPose }).weaponPose = pose;
      const fire = r.firearm.fire;
      const rec = fire.weaponRecord();
      fire.takeWeapon(rec, [0, rec.magazine]);
      const events: FireEvent[] = [];
      fire.subscribe((e) => events.push(e));
      const frame = (): void => { pose.step(0.01); r.firearm.fireFrame(0.01, true); };
      expect(fire.reload()).toBe(true);
      for (let i = 0; i < 40; i++) frame();                         // the delay out, the clip 0.4 s in
      expect(pose.stats().reload).toBe('seal_reload');
      const seen: { reload: string | null; frame: number }[] = [];
      let done = -1, reloadingAt = false;
      if (take) {
        fire.mountTake();
        mounted = true;                                             // `takeOwn` holds right after `took()`
        expect(pose.stats().reload, "the take's cut").toBeNull();
        for (let i = 0; i < Math.round(wait * 100); i++) {
          // LATER 530's review F1: the blast heard in the wait -- the walk's knock pop (`WalkMode.knock` -> `stackPopped`,
          // its mover not laid in this rig) through `./matchFirearm`'s own `onStackPop` -> `reloadPopped`.
          if (knock && i === 20) (r.walk as unknown as { stackPopped(p: string, n: number): void }).stackPopped('knock', r.walk.ticks());
          frame();
        }
        (fire as unknown as { mountUntake(dead?: boolean): void }).mountUntake();
        reloadingAt = fire.state().magazine.reloading;
        mounted = false;
      } else for (let i = 0; i < Math.round(wait * 100); i++) frame();
      for (let i = 0; i < 200; i++) {
        const s = pose.stats();
        seen.push({ reload: s.reload, frame: s.reloadFrame });
        if (done < 0 && events.some((e) => e.type === 'reloadEnd' && e.completed)) done = i;
        frame();
      }
      return { seen, done, reloadingAt, starts: events.filter((e) => e.type === 'reloadStart').length, resumes: events.filter((e) => e.type === 'reloadResume').length };
    };
    // LATER 530's review F1: a knock heard in the wait. The room's knock ends the clip under way, its lock and its still
    // clip's life at the knock (`room.ts` `layKnock` -> `endStillReload(q, true)`; the original's `FUN_0057e770` ->
    // `FUN_005a5da0` D:L440993, `FUN_0058a4d0` D:L440997) and the fall refuses the take: the refusal lays nothing back.
    it('RED: LATER 530 review F1 -- a knock heard in the wait, then the refusal: no reload clip drawn again on the knocked body, no lock, no resume', () => {
      const refused = run(true, 0.5, true);
      expect(refused.resumes, 'no `reloadResume`').toBe(0);                                                                  // today: 1
      expect(refused.reloadingAt, "the knock ended the clip's lock").toBe(false);                                            // today: true
      expect(refused.seen.every((s) => s.reload === null), 'the reload clip not drawn again').toBe(true);                    // today: 'seal_reload'
      expect(refused.done, 'the knocked reload never completes').toBe(-1);
      expect(refused.starts).toBe(1);
    });
    it('RED: take, 0.5 s of mounted frames, the refusal: the clip back at the phase the control reached, and the reload completes on the same frame', () => {
      const control = run(false), refused = run(true);
      expect(control.done).toBeGreaterThan(0);
      const same = (i: number, what: string): void => {
        expect(refused.seen[i]!.reload, what).toBe(control.seen[i]!.reload);
        expect(refused.seen[i]!.frame, what).toBeCloseTo(control.seen[i]!.frame, 9);       // the clocks summed in another order
      };
      same(0, 'at the refusal: the clip on the body again, at the control\'s key');                                            // today: null against 'seal_reload'
      expect(control.seen[0]!.frame).toBeGreaterThan(20);                                                                     // 0.9 s into 45 keys over 1.6 s
      for (let i = 1; i < control.seen.length; i++) same(i, `frame ${i} after it`);
      expect(control.seen.some((s) => s.reload === null), 'the control\'s clip ends inside the run').toBe(true);
      expect(refused.done, 'the reload completes as the original\'s').toBe(control.done);                                       // today: -1 (never)
      expect([refused.starts, control.starts], 'one reload: the room never ended it').toEqual([1, 1]);
    });
    // LATER 530 (LATER 526's R3 line, the dispatcher's check): a death in the wait. The refusal (death is one of its terms,
    // `FUN_005463c0` D:L412134-412139) hands a reload's delay back onto the dead body's kit, as PAR-19 leaves a delay over a
    // death on foot (`cancelReload('death')` ends only a reload under way: the room keeps its lock); the original's death,
    // `FUN_005a2490`, clears the second channel (`FUN_005a5da0` D:L459781) and pops the stack to its base (`FUN_0058a4d0`
    // D:L459803), the kit's timer untouched. The respawn: the port's `spawnKit` -> `Fire.refill` clears the timer, a clip,
    // the journal and fills every magazine -- the timer's clear is the port's own; the original's respawn,
    // `FUN_00598b90` -> `FUN_00599b60` (D:L455604) -> `FUN_00599f00`, rebuilds the slots and their magazines
    // (D:L455790-455830), and its `+0x820` across a death and a respawn is unread (LATER 530's review F2).
    it('LATER 530 (a pin) -- a death in the wait: the delay handed back onto the dead body\'s kit; the respawn rebuilds the kit whole', () => {
      let mounted = false;
      const r = rig({ network: () => false, hands: hands({ mounted: () => mounted }) });
      const fire = r.firearm.fire;
      const rec = { ...fire.weaponRecord(), reloadDelay: 1 };
      fire.takeWeapon(rec, [0, rec.magazine]);
      expect(fire.reload()).toBe(true);
      fire.setPressWindow(160);
      r.firearm.fireFrame(0.3, true);
      expect(fire.mountTake()?.kind).toBe('reload');
      mounted = true;
      for (let i = 0; i < 10; i++) r.firearm.fireFrame(0.01, true);
      (fire as unknown as { mountUntake(dead?: boolean): void }).mountUntake(true);
      mounted = false;
      expect(fire.state().magazine.reloading, 'the delay on the dead body, as on foot').toBe(true);
      r.firearm.spawnKit('seal');
      const m = fire.state().magazine;
      expect(m.reloading, 'the respawn: no timer').toBe(false);
      expect(m.rounds, 'every magazine full').toBe(m.capacity);
      expect(fire.reloadLocked(150), "no press's window").toBe(false);
    });
  });
  it("TURRET-AMMO (#284): mounted, R is the turret's -- every binding's sink (Fire.reload: the keyboard's R through Fire's own key, the pad's R3 in matchLanes, the touch RELOAD in main.ts and matchMount.ts) hands the press to the hands' reload, the rifle's reload not asked; off the turret, the rifle's", () => {
    let mounted = true;
    const asked: boolean[] = [];
    const { firearm } = rig({ hands: hands({ mounted: () => mounted, reload: () => { asked.push(mounted); return mounted; } }) });
    const before = firearm.fire.state().magazine;
    expect(firearm.fire.reload()).toBe(false);
    expect(asked).toEqual([true]);
    expect(firearm.fire.state().magazine).toEqual(before);
    mounted = false;
    firearm.fire.reload();
    expect(asked).toEqual([true, false]);                           // asked, not taken: the rifle's own gates decide
  });
  it('the HUD: the equipment\'s icon and count over the firearm\'s, the fire-mode row off with an item up', () => {
    const { firearm, hud } = rig({ hands: hands({ itemUp: () => true, icon: () => 'hudw_m67', magazine: () => ({ rounds: 2, capacity: 2, spare: 0, reloading: false }) }) });
    const icon = vi.spyOn(hud, 'setWeaponIcon'), row = vi.spyOn(hud, 'setFireModeRow'), feed = vi.spyOn(hud, 'feed');
    firearm.feedHud(true, { climb: null });
    expect(icon).toHaveBeenCalledWith('hudw_m67');
    expect(row).toHaveBeenCalledWith(false);
    expect(feed.mock.calls[0]![0].magazine).toEqual({ rounds: 2, capacity: 2, spare: 0, reloading: false });
    expect(feed.mock.calls[0]![0]).toHaveProperty('climb', null);
  });
});

describe("PF-34: the room's kit after a pickup (`takeKit`, research 234 s6), on the one firearm", () => {
  const ring = (n: number): number[] => [n, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  it("takeKit sets the kit on the firearm's loadout and its rings: the hand's replaced weapon taken up with the room's exact ring, the other ring set, the records the new kit's, no fill", () => {
    const { firearm, loadouts } = rig();
    const take = vi.spyOn(loadouts, 'take');
    const takeWeapon = vi.spyOn(Fire.prototype, 'takeWeapon');
    const setRing = vi.spyOn(Fire.prototype, 'setRing');
    const refill = vi.spyOn(Fire.prototype, 'refill');
    const kit = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255];
    firearm.takeKit(kit, 0, [ring(0), ring(12)]);
    expect(take).toHaveBeenCalledWith(kit);
    expect(firearm.records()).toEqual(loadouts.records());
    expect(firearm.records()[0].id).toBe(HELD_RIFLE.id);
    expect(takeWeapon).toHaveBeenCalledWith(firearm.records()[0], ring(0));          // the rifle in the hand, its slot replaced
    expect(setRing).toHaveBeenCalledWith(firearm.records()[1], ring(12), undefined, undefined);
    expect(refill).not.toHaveBeenCalled();
    // A walk-over's transfer: no slot, only the filled slots set, nothing taken up.
    takeWeapon.mockClear();
    firearm.takeKit(kit, null, [[30, 0, 0, 0, 0, 0, 0, 0, 0, 0], ring(12)], [[0], []]);
    expect(takeWeapon).not.toHaveBeenCalled();
    expect(setRing).toHaveBeenLastCalledWith(firearm.records()[1], ring(12), undefined, []);
  });
  it("a claim into the slot not in the hand keeps the hand's fire mode as switched (stored with its firearm first, as spawnKit does)", () => {
    const { firearm } = rig();
    const kit = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255];
    firearm.takeKit(kit, 0, [ring(30), ring(12)]);
    const opening = firearm.fireMode();
    firearm.switchFireMode();
    const switched = firearm.fireMode();
    expect(switched).not.toBe(opening);
    firearm.takeKit(kit, 1, [ring(30), ring(12)]);
    expect(firearm.fireMode()).toBe(switched);
  });
});

describe('the frame steps', () => {
  // LATER 403 / 414 (#501): the HUD's stance word shows when the stance is taken -- FUN_00221c40 draws actor+0x374 when
  // FUN_00582500's one-time bit is set (D:L75029-75037, D:L442890-442900; research 87 1.13) -- the walker's bit
  // (`takeStanceTaken`), read once a frame; not the body in use (a crouch run stands it: no word), not the press still
  // pending (no word until taken); mounted too -- the shown actor stays the SEAL (FUN_002956e0's cast finds no CZSealBody
  // in a turret and falls back to its controller's actor, the SEAL's own, D:L139718-139722, D:L412189; LATER 414's review).
  const stanceRig = (mountedNow: () => boolean = () => false) => {
    const r = rig({ hands: hands({ mounted: mountedNow }) });
    const state = { taken: 'crouch' as 'stand' | 'crouch' | 'prone', body: 'crouch' as 'stand' | 'crouch' | 'prone', bit: false };
    vi.spyOn(r.walk, 'posture').mockImplementation(() => state.body);
    vi.spyOn(r.walk, 'stance').mockImplementation(() => state.taken);
    vi.spyOn(r.walk, 'takeStanceTaken').mockImplementation(() => { const b = state.bit; state.bit = false; return b; });
    return { ...r, state };
  };

  it('LATER 403: a crouch run shows no stance word; a Triangle toggle does', () => {
    const { firearm, hud, state } = stanceRig();
    state.bit = true;                                                    // the spawn's word
    firearm.feedHud(true);
    expect(hud.state().model.stance).toBe('crouch');
    hud.step(3);                                                         // the word faded out (gone in 2 s)
    expect(hud.timing().stance).toBe(0);
    state.body = 'stand';                                                // the crouch run: nothing taken
    firearm.feedHud(true);
    expect(hud.state().model.stance).toBe('crouch');
    expect(hud.timing().stance).toBe(0);
    state.taken = 'stand'; state.body = 'stand'; state.bit = true;       // Triangle: the stand taken
    firearm.feedHud(true);
    expect(hud.state().model.stance).toBe('stand');
    expect(hud.timing().stance).toBeGreaterThan(0);
  });

  it('LATER 403: Triangle while the stance is pending shows no word until the stance is taken', () => {
    const { firearm, hud, state } = stanceRig();
    state.bit = true;
    firearm.feedHud(true);
    hud.step(3);
    firearm.feedHud(true);                                               // the press pending: nothing taken
    expect(hud.state().model.stance).toBe('crouch');
    expect(hud.timing().stance).toBe(0);
    state.taken = 'stand'; state.bit = true;                             // the reload over: the stance taken
    firearm.feedHud(true);
    expect(hud.state().model.stance).toBe('stand');
    expect(hud.timing().stance).toBeGreaterThan(0);
  });

  it('LATER 414 (the review): a stance taken while mounted shows its word at the take; none again at the dismount', () => {
    let mounted = true;
    const { firearm, hud, state } = stanceRig(() => mounted);
    firearm.feedHud(true);
    hud.step(3);                                                         // nothing taken yet: no word
    expect(hud.timing().stance).toBe(0);
    state.taken = 'stand'; state.bit = true;                             // taken under the mount
    firearm.feedHud(true);
    expect(hud.state().model.stance).toBe('stand');
    expect(hud.timing().stance).toBeGreaterThan(0);                      // the shown actor is the SEAL: read at the take
    hud.step(3);
    mounted = false;
    firearm.feedHud(true);
    expect(hud.timing().stance).toBe(0);                                 // the bit was cleared at the take: no word now
  });

  it('the zoom marks its tick once a walk tick (sprint 25\'s switch replay; the front end\'s copy had dropped it)', () => {
    const { firearm, walk } = rig();
    const mark = vi.spyOn(Zoom.prototype, 'markTick');
    let ticks = 1;
    vi.spyOn(walk, 'ticks').mockImplementation(() => ticks);
    firearm.gunFrame(0.016, false);
    firearm.gunFrame(0.016, false);
    expect(mark).toHaveBeenCalledTimes(1);
    ticks = 2;
    firearm.gunFrame(0.016, false);
    expect(mark).toHaveBeenCalledTimes(2);
  });
  it('the sound plugin: a remote round\'s report with its effects', () => {
    const fired: string[] = [];
    const { firearm } = rig({ sound: { fireEvent: () => {}, effect: () => {}, goggles: () => {}, roundFired: (e) => fired.push(e.weapon.name) } });
    firearm.roundEffects({ type: 'round', weapon: { name: 'M4A1' }, from: [0, 0, 0], to: [0, 0, -10], hit: false } as never, 0);
    expect(fired).toEqual(['M4A1']);
  });
  it("MAP-10b: a mounted body's round is flashed at the turret's firepoint, not its rifle; the page's own turret round is drawn (the path, the flash on the frame, the report) and sends nothing", () => {
    const fired: string[] = [], heard: string[] = [];
    const frame = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1]);
    const { firearm, remote } = rig({
      sound: { fireEvent: (e) => { if (e.type === 'round') heard.push(e.weapon.name); }, effect: () => {}, goggles: () => {}, roundFired: (e) => fired.push(e.weapon.name) },
      mountedMuzzle: (id) => (id === 7 ? frame : null),
    });
    const rifle = vi.spyOn(remote, 'weaponFrame');
    const onRound = vi.spyOn(firearm.effects, 'onRound');
    firearm.roundEffects({ type: 'round', weapon: { name: 'PKM TURRET' }, from: [7, 8, 9], to: [7, 8, -10], hit: false } as never, 7);
    expect(rifle).not.toHaveBeenCalled();
    const flash = onRound.mock.calls[0]![1] as { node: { elements: number[] }; muzzle: number[] };
    expect([...flash.node.elements]).toEqual([...frame]);
    expect(flash.muzzle).toEqual([0, 0, 0]);
    firearm.roundEffects({ type: 'round', weapon: { name: 'M4A1' }, from: [0, 0, 0], to: [0, 0, -10], hit: false } as never, 3);
    expect(rifle).toHaveBeenCalledWith(3);                          // not mounted: the rifle's frame, as before
    expect(fired).toEqual(['PKM TURRET', 'M4A1']);
    // The own round: drawn through the fire (no hull here: nothing drawn), else its flash on the frame and its report.
    const draw = vi.spyOn(firearm.fire, 'drawRound');
    const record = { ...firearm.record('rifle'), id: 205, name: 'PKM TURRET', maximumRange: 800, piercing: 4.5 };
    firearm.turretRound(record, [7, 8, 9], [0, 0, -1], frame, 4);
    expect(draw).toHaveBeenCalledWith([7, 8, 9], [0, 0, -1], 8000, 4.5, 205, 4);
    expect(heard).toEqual([]);
    draw.mockReturnValue({ to: [7, 8, -20], hit: null, through: [], tracer: false });
    onRound.mockClear();
    firearm.turretRound(record, [7, 8, 9], [0, 0, -1], frame, 5);
    expect(onRound).toHaveBeenCalledTimes(1);
    expect((onRound.mock.calls[0]![0] as { weapon: { id: number }; to: number[] }).weapon.id).toBe(205);
    expect([...(onRound.mock.calls[0]![1] as { node: { elements: number[] } }).node.elements]).toEqual([...frame]);
    expect(heard).toEqual(['PKM TURRET']);
  });
});

describe("PAR-54: a mounted turret's tracer goes as the rifle's does (research 215 s7.6)", () => {
  /** A wall across x at z -30 (x -50..50, y 0..50): the turret's rounds below strike it. */
  const wall = (): Grid => {
    const points = Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]);
    const poly: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    return buildGrid(params, [], [], [poly], [{ modelName: poly.modelName, path: `${poly.path}0`, first: 0, count: 1 }]);
  };
  it("mounted, a burst's tracer is drawn in its round's frame and gone in the next; the last one too, once the firing stops", () => {
    const { firearm, walk } = rig({ hands: hands({ mounted: () => true }) });
    vi.spyOn(walk, 'grid').mockReturnValue(wall());
    const record = { ...firearm.record('rifle'), id: 205, name: 'PKM TURRET', maximumRange: 800, piercing: 0 };
    expect(tracerRound(205, 4)).toBe(true);                         // a turret is a tracer weapon: every fourth round
    // Both pages' frame order: the firearm's frame (`fireFrame`), then the turret's rounds (`turretFrame` -> `turretRound`).
    for (let n = 1; n <= 8; n++) {
      firearm.fireFrame(1 / 60, true);
      firearm.turretRound(record, [5, 20, -2], [0, 0, -1], null, n);
      expect(firearm.fire.tracerVisible(), `round ${n}'s frame`).toBe(tracerRound(205, n));
    }
    firearm.fireFrame(1 / 60, true);                                // the burst has stopped: the next frame
    expect(firearm.fire.tracerVisible()).toBe(false);
    firearm.fireFrame(1 / 60, true);
    expect(firearm.fire.tracerVisible()).toBe(false);
  });
});

const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(ZWEAPON === null)(`PAR-59: the mounted MGL's round on its own page (research 215 s8)${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("MGL FRAG TURRET's round (class 230: no bullet, FUN_003d1e20) is flown on the page as a launcher's round -- the kit table's projectile of 230, from the firepoint at Muzzle_Velocity 270 down the gun's line -- and no firearm line is drawn; PKM TURRET's still draws its line", () => {
    const table = readKitTable(ZWEAPON!);                              // the disc's zweapon.rdr (the fixture)
    const launched: [string, number, number[], number[]][] = [];
    const { firearm, loadouts } = rig({ hands: hands({ mounted: () => true, launched: (r, from, v) => { launched.push([r.name, r.gravity, [...from], [...v]]); } }) });
    vi.spyOn(loadouts, 'tables').mockReturnValue(table);
    const draw = vi.spyOn(Fire.prototype, 'drawRound');
    const dir: [number, number, number] = [0, -Math.sin(Math.PI / 18), -Math.cos(Math.PI / 18)];
    firearm.turretRound(table.turret2Records!.get(230)!, [5, 20, -2], dir, null, 1);
    expect(draw).not.toHaveBeenCalled();
    expect(launched).toHaveLength(1);
    const [name, gravity, from, v] = launched[0]!;
    expect([name, gravity, from]).toEqual(['MGL FRAG TURRET', 39, [5, 20, -2]]);   // Gravity_Acceleration 3.9 x 10
    v.forEach((x, i) => expect(x).toBeCloseTo(dir[i]! * 270, 6));            // Muzzle_Velocity 27 x 10, MV x dir
    firearm.turretRound(table.turretRecords!.get(205)!, [5, 20, -2], [0, 0, -1], null, 1);
    expect(draw).toHaveBeenCalledTimes(1);                                     // the PKM's line, as before
    expect(launched).toHaveLength(1);
  });
});

describe("PAR-56: mounted, the slot in the hand is the turret's (research 215 s8)", () => {
  it("the fire-mode button steps the turret's one mode: the rifle's mode, its round and the zoom hold unchanged at the release", () => {
    let mounted = false;
    const { firearm } = rig({ hands: hands({ mounted: () => mounted, fireMode: () => (mounted ? 3 : null) }) });
    const mode = firearm.fireMode(), round = firearm.fire.roundMode(), hold = firearm.zoom.hold();
    const setRound = vi.spyOn(Fire.prototype, 'setRound'), setHold = vi.spyOn(Zoom.prototype, 'setHold');
    mounted = true;
    firearm.feedHud(true, { climb: null });
    firearm.switchFireMode();
    firearm.switchFireMode();
    expect(firearm.fireMode()).toBe(mode);
    expect(setRound).not.toHaveBeenCalled();
    expect(setHold).not.toHaveBeenCalled();
    mounted = false;                                                // the release: the firearm's row back
    firearm.feedHud(true, { climb: null });
    expect(firearm.fireMode()).toBe(mode);
    expect(firearm.fire.roundMode()).toEqual(round);
    expect(firearm.zoom.hold()).toBe(hold);
  });
  it('a throwable held up at the mount: the fire-mode row is shown (the turret slot taken up, FUN_005463c0)', () => {
    let mounted = true;
    const { firearm, hud } = rig({ hands: hands({ itemUp: () => true, mounted: () => mounted, fireMode: () => (mounted ? 3 : null) }) });
    const row = vi.spyOn(hud, 'setFireModeRow');
    firearm.feedHud(true, { climb: null });
    expect(row).toHaveBeenLastCalledWith(true);
    mounted = false;                                                // released with the throwable still up: no row
    firearm.feedHud(true, { climb: null });
    expect(row).toHaveBeenLastCalledWith(false);
  });
  it("the row by the turret weapon's class (FUN_005bc300 D:L473799-473803): MGL FRAG TURRET's 230 hides it, PKM's and LMG's 205 show it, whatever is held up", () => {
    for (const up of [false, true]) {
      for (const [weapon, shown] of [[230, false], [205, true], [207, true]] as const) {
        const { firearm, hud } = rig({ hands: hands({ itemUp: () => up, mounted: () => true, weapon: () => weapon, fireMode: () => 3 }) });
        const row = vi.spyOn(hud, 'setFireModeRow');
        firearm.feedHud(true, { climb: null });
        expect(row, `${weapon}, a throwable up: ${up}`).toHaveBeenLastCalledWith(shown);
      }
    }
  });
});

/**
 * PAR-79's review F1 (research 251 section 12.3, "PAR-79"; PTW.R3 with roomStillReloadJump.test's "PAR-79"): the page's
 * still clip (`StillReloadLife`, which `WalkMode.jump` asks) is the clip's, not `Fire`'s timer. In the original the kit's
 * timer and the clip are apart: `FUN_0057e1b0` refuses the jump while the clip is on top (D:L440805-440810), and a clip
 * the fall covered (`FUN_005af930` D:L466956-466970, only the top advancing, `FUN_0057a330` D:L438708) and a clipless
 * landing handed back (`FUN_00589aa0` D:L466900-466901 -> `FUN_0028da00` D:L135104-135107) pops on its stood clock --
 * `seal_reload`'s 93rd command, the flight's commands later. `Fire`'s completed `reloadEnd` comes at its own timer
 * (ReloadTime 1.6: the 96th command; the room's `reloadUntil` at + 95): it does not end the life. Every other end does
 * (a cancel, a hand's change, a knock, a flinch, a death, an undo; a swap's start, `Kit` `started`).
 */
describe("PAR-79's review F1: the page's still clip lives to its own end, not Fire's timer (matchFirearm's reloadEnd -> StillReloadLife.end)", () => {
  /** `seal_reload` as the disc has it (45 keys at 1.6; stillReloadLife.test's `STAND`). */
  const STAND: ReloadLifeSpec = { stance: 'stand', family: 'rifle', moving: false, period: 1.6, playback: 1.6, frames: 45, noInterrupt: 0, overlay: 1.2 * (32 / 33) };
  /** `Fire`'s own timer on the commands from the clip's first (0): ReloadTime 1.6 at 60 a second. */
  const FIRE_END = 96;
  const reloadEnd = (completed: boolean, reason: ReloadEndReason): FireEvent =>
    ({ type: 'reloadEnd', weapon: { name: 'M4A1', id: 1, fireAnim: null } as unknown as FireWeapon, completed, reason });
  /**
   * The mounted firearm's own still clip (the one `WalkMode` asks), begun at command 0 and run on commands 1.., the fall
   * over it from `air` to `back - 1` and a clipless landing on `back`; `Fire`'s `end` heard after command `endAt` (and
   * `swapAt`: the kit's swap starts there). The last command it lives on: the last command whose jump the page refuses.
   */
  const lastLiving = (o: { air: number; back: number; endAt?: number; end?: FireEvent; swapAt?: number }): number => {
    const { firearm, walk } = rig();
    const clip = (walk as unknown as { readonly stillClip: StillReloadLife }).stillClip;
    const fire = firearm.fire as unknown as { emit(e: FireEvent): void };
    const host = (firearm.kit as unknown as { readonly host: { started(to: 'rifle' | 'pistol'): void } }).host;
    clip.begin(STAND, 0);
    for (let c = 1; c <= 300; c++) {
      clip.ranWith(c, false, c >= o.air && c < o.back, c === o.back);
      if (c === o.endAt) fire.emit(o.end!);
      if (c === o.swapAt) host.started('pistol');
      if (!clip.lives(c + 1)) return c;
    }
    return -1;
  };

  it("covered from its 20th command and handed back on its 50th, the life outlives Fire's completed end (the 96th) to at + 93 + 30, the room's last refused jump; uncovered it ends on its 93rd, before Fire's", () => {
    const completed = reloadEnd(true, 'complete');
    expect(lastLiving({ air: 20, back: 50, endAt: FIRE_END, end: completed })).toBe(93 + 30);
    expect(lastLiving({ air: 1000, back: 1000, endAt: FIRE_END, end: completed })).toBe(93);
    expect(lastLiving({ air: 1000, back: 1000 })).toBe(93);                         // the same without Fire's end
  });

  it('every other end still ends it on its command, in the flight and after the hand-back; the swap too', () => {
    for (const reason of ['cancelled', 'replaced', 'knock', 'flinch', 'death', 'rejected'] as const) {
      expect(lastLiving({ air: 20, back: 50, endAt: 40, end: reloadEnd(false, reason) }), `${reason} in the air`).toBe(40);
      expect(lastLiving({ air: 20, back: 50, endAt: 60, end: reloadEnd(false, reason) }), `${reason} on the floor`).toBe(60);
    }
    expect(lastLiving({ air: 20, back: 50, swapAt: 100 })).toBe(100);              // past Fire's timer: the swap's start
  });
});

describe('one firearm: both pages mount it, neither makes its own', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it("PAR-54: both pages render after the turret's rounds (a turret round's tracer, lit for its frame, is drawn in it)", () => {
    // `fireFrame` before `turretFrame` is `matchMount.test.ts`'s pin; this one holds the other half: the frame's render
    // after the rounds, or a tracer lit for its frame would be hidden by the next step before it is ever drawn.
    const RENDER: Record<string, string> = { 'main.ts': 'render(scene, fly.camera);', 'matchMount.ts': 'renderer.render(scene, fly.camera);' };
    for (const f of ['main.ts', 'matchMount.ts']) {
      const rounds = src(f).indexOf('acts.turretFrame('), drawn = src(f).indexOf(RENDER[f]!, rounds);
      expect(rounds, f).toBeGreaterThan(0);
      expect(drawn, `${f}: the render after acts.turretFrame`).toBeGreaterThan(rounds);
    }
  });
  it("TURRET-CONE P2: both pages hand the turrets the firearm's turret cone (`acts.turrets.setSpread(() => firearm.turretCone())`), so the page's turret rounds roll on the turret record's cone (research 215 s8.2)", () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/acts\.turrets\.setSpread\(\(\) => firearm\.turretCone\(\)\)/);
    }
  });
  it('main.ts and matchMount.ts call mountFirearm and construct no Fire, Accuracy, Zoom, Kit or Reticle', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/mountFirearm\(\{/);
      expect(src(f), f).not.toMatch(/new (Fire|Accuracy|Zoom|Kit|Reticle|KitRounds)\(/);
    }
  });
});

/**
 * NU-2 (research 320 sections 1-4 and 8.1 G1, G3): the firearm's reticle pass asks the hands for the hand's item and the
 * throw's power each frame -- with a grenade up the set is 4, the throw meter, its fill the thrower's power; with the
 * firearm up again, the firearm's own set. `./matchThrow`'s `hands` gives the two (`matchThrow.test.ts`); here they read
 * a real `GrenadeThrower` the same way.
 */
describe('NU-2: aimReticle draws the hand\'s set and the throw meter', () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };

  it('a grenade up: set 4 and the fill on the thrower\'s power over a throw; the rifle again: its set 1', () => {
    const snap = {
      feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
      landing: null, jumps: 0,
    } as unknown as PlaySnapshot;
    const g = new GrenadeThrower({ grid: () => null, snapshot: () => snap, view: () => 'third' });
    const { firearm, walk } = rig({
      hands: hands({
        itemUp: () => g.equipped(),
        handItem: () => (g.held() === 'M67' ? 121 : null),
        throwPower: () => { const s = g.stats(); return g.equipped() ? meterPower(s.power, s.left) : 0; },
      }),
    });
    vi.spyOn(walk, 'aim').mockReturnValue([0, 0, -1000]);
    firearm.reticle.setBitmaps({
      fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
      sets: { 'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32), 'ret_grenade_01.tif': rgba(64, 64), 'ret_grenade_02.tif': rgba(64, 64) },
    });
    firearm.reticle.setVisible(true);
    const frame = (): number | null => {
      g.update(1 / 60);
      firearm.aimReticle(1 / 60);
      firearm.reticle.render(PS2);
      return firearm.reticle.state().meter?.fill ?? null;
    };
    expect(frame()).toBeNull();                                                  // the rifle: no meter
    expect(firearm.reticle.currentSet()).toBe(1);
    expect(g.select('M67')).toBe(true);
    expect(frame()).toBe(0);                                                     // up, not held: the empty frame
    expect(firearm.reticle.currentSet()).toBe(4);
    g.pull();
    for (let n = 1; n <= 30; n++) expect(frame()).toBeCloseTo(32 * (1 - 0.95 ** n), 9);
    const atRelease = g.stats().power;
    g.release();
    let held = 0;
    for (;;) {                                                                   // held through the clip (D7)
      const f = frame();
      if (g.stats().power === 0) break;
      expect(f).toBeCloseTo(32 * atRelease, 9);
      if (++held > 600) throw new Error('the power never cleared');
    }
    expect(g.stats().phase).not.toBe('throwing');                                // cleared at the clip's end, not before
    for (let i = 0; i < 30; i++) frame();
    expect(firearm.reticle.state().meter?.fill).toBe(0);                         // cleared at the clip's end
    expect(g.select('rifle')).toBe(true);
    frame();
    expect(firearm.reticle.currentSet()).toBe(1);
    expect(firearm.reticle.state().meter).toBeNull();
  });
});

/** A flat floor at y 0 (`swapContinuity.test.ts`'s), for a body that walks and swaps on the page's own mover. */
const FLOOR: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

/**
 * The firearm on a walking body: the page's frame as `main.ts` orders it -- the walk, the gun, the kit, the reticle
 * (`gunFrame`, `kitFrame`, `aimReticle`) -- so a swap runs through the kit (`selectFirearm`) and the walk's own clip.
 */
function walking(extra: Partial<MatchFirearmDeps> = {}) {
  const r = rig(extra);
  r.walk.setGround(FLOOR, [0, 0, 0]);
  r.fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  r.walk.setMode('walk');
  const frame = (dt = 1 / 60): void => {
    r.walk.frame(dt);
    r.firearm.gunFrame(dt, true);
    r.firearm.kitFrame(dt, true);
    r.firearm.aimReticle(dt);
  };
  /** Frames until `done` (at most `max`); the count run. */
  const until = (done: () => boolean, max = 600): number => {
    let n = 0;
    while (!done()) { frame(); if (++n > max) throw new Error('never'); }
    return n;
  };
  /** Down on the floor and still: a second of frames. */
  const settle = (): void => { for (let i = 0; i < 60; i++) frame(); };
  return { ...r, frame, until, settle };
}

/**
 * NU-3a's fold, F1 (the review of db22d91d3; research 321 section 3.2): the kit's tick reads the selected slot `+0x824`
 * (`FUN_005c2670` D:L477280), which the switch writes at the press (`FUN_005c4b10` D:L478842) -- so the new record's bloom
 * runs from the press, both ways, as the room's (`./net/moverSim` at the press, `room.ts` `aim`). The page took it with
 * `m_item`, which a swap to the rifle moves only at the clip's end (`./kit` `finish`): the Mark 23's rest held through the
 * clip and carried into the rifle. Driven here through the kit and the walk's own swap clip, never `setWeapon` directly.
 */
describe('NU-3a F1: the swap\'s record from the press, through the kit', () => {
  const still = { stance: 'stand' as const, velocity: [0, 0, 0] as [number, number, number], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 };

  /** In the pistol at rest, then the rifle taken: the sizes over the clip; the reference run from the press. */
  const pistolToRifle = (w: ReturnType<typeof walking>, pistol: WeaponRecord, rifle: WeaponRecord) => {
    const acc = w.firearm.accuracy;
    w.settle();
    expect(w.firearm.selectFirearm('pistol')).toBe(true);
    w.until(() => !w.firearm.kit.swapping());
    w.settle();
    expect(acc.state().size).toBe(pistol.stances.stand.targetMin);  // at rest on the pistol
    expect(w.firearm.selectFirearm('rifle')).toBe(true);
    const sizes: number[] = [];
    const n = w.until(() => { sizes.push(acc.state().size); return !w.firearm.kit.swapping(); });
    // The original's (and the room's): the rifle's record from the press, closing at its own TargetConstrict.
    const ref = new Accuracy(pistol);
    ref.update(1 / 60, still);
    ref.setWeapon(rifle);
    for (let i = 0; i < n; i++) ref.update(1 / 60, still);
    return { n, sizes, end: acc.state().size, ref: ref.state().size };
  };

  it('the Mark 23 at rest (10) to the M4A1 SD standing: the rifle\'s closing size at the clip\'s end (1), not 10 carried', () => {
    const w = walking();
    const out = pistolToRifle(w, HELD_SIDEARM, HELD_RIFLE);
    expect(out.n).toBeGreaterThan(30);                                // the still swap's clip, over half a second
    expect(out.ref).toBe(1);                                          // (10 - 1) / 50 = 0.18 s into the clip
    expect(out.end).toBe(out.ref);
    expect(out.sizes[15]!).toBeLessThan(10);                           // closing a quarter second in, mid-clip
  });

  const zweapon = fixture('RUN/ZWEAPON.ZAR');
  // N1 of the re-review of 2a2b732bf: `FUN_005be300` reads the selected slot's own mode (`+0x6fc[slot] < 5`,
  // D:L474944-474945; the slot passed at D:L478908), not the hand's.
  it.skipIf(zweapon === null)(`the M16A2-M203 in a round mode, the pistol, then the rifle pressed: set 3 from the press (the slot's mode), not the pistol's 1${zweapon ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    const w = walking({ network: () => true });
    w.loadouts.setMap(readKitTable(zweapon!), null);
    w.firearm.spawnKit('seal', [52, 15, 175, 175, EMPTY_ITEM]);       // the M203 FRAG rounds in the kit
    const ink = (wd: number, h: number) => ({ width: wd, height: h, data: new Uint8ClampedArray(wd * h * 4).fill(255) });
    w.firearm.reticle.setBitmaps({
      fixed: ink(64, 64), floating: ink(32, 32), accuracy: null,
      sets: {
        'ret_rifle_01.tif': ink(64, 64), 'ret_rifle_02.tif': ink(32, 32), 'ret_sidearm_01.tif': ink(32, 32), 'ret_sidearm_02.tif': ink(16, 16),
        'ret_rocket_01.tif': ink(64, 64), 'ret_rocket_02.tif': ink(64, 64),
      },
    });
    w.settle();
    for (let i = 0; i < 6 && w.firearm.fireMode() < 5; i++) w.firearm.switchFireMode();
    expect(w.firearm.fireMode()).toBe(175);                           // the rifle on its M203 FRAG round
    w.frame();
    expect(w.firearm.reticle.currentSet()).toBe(3);
    expect(w.firearm.selectFirearm('pistol')).toBe(true);
    w.until(() => !w.firearm.kit.swapping());
    w.frame();
    expect(w.firearm.reticle.currentSet()).toBe(0);
    expect(w.firearm.selectFirearm('rifle')).toBe(true);
    w.frame();
    expect(w.firearm.kit.swapping()).toBe(true);
    expect(w.firearm.reticle.currentSet()).toBe(3);                   // the slot's round mode from the press, mid-clip
    w.until(() => !w.firearm.kit.swapping());
    w.frame();
    expect(w.firearm.reticle.currentSet()).toBe(3);
  });

  it.skipIf(zweapon === null)(`the DE .50 at rest (32) to the M4A1 off the kit table: 1 at the clip's end, not 32${zweapon ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    const w = walking({ network: () => true });
    const table = readKitTable(zweapon!);
    w.loadouts.setMap(table, null);
    w.firearm.spawnKit('seal', [54, 7, 121, 126, EMPTY_ITEM]);
    const [m4, de] = w.firearm.records();
    expect([m4.name, de.name]).toEqual(['M4A1', 'DE .50']);
    const out = pistolToRifle(w, de, m4);
    expect(de.stances.stand.targetMin).toBe(32);
    expect(out.ref).toBe(1);                                          // (32 - 1) / 50 = 0.62 s, inside the clip
    expect(out.end).toBe(out.ref);
  });

  it.skipIf(zweapon === null)(`a pickup into the selected slot mid-swap (the rifle's, the pistol still in the hand): the new record from the next frame, as the room's at its take${zweapon ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    const w = walking({ network: () => true });
    w.loadouts.setMap(readKitTable(zweapon!), null);
    w.firearm.spawnKit('seal', [62, 15, 121, 126, EMPTY_ITEM]);
    const acc = w.firearm.accuracy;
    w.settle();
    expect(w.firearm.selectFirearm('pistol')).toBe(true);
    w.until(() => !w.firearm.kit.swapping());
    w.settle();
    expect(acc.state().size).toBe(10);                                // the Mark 23 at rest
    expect(w.firearm.selectFirearm('rifle')).toBe(true);
    w.frame();
    expect(w.firearm.item()).toBe('pistol');                          // m_item: the pistol until the clip's end
    // The room's `taken` (`worldDrops.ts` `seat.cone.setWeapon` when the seat's weapon -- the slot -- is the slot taken):
    // the AK-47 into the rifle slot, which the swap selected at its press.
    const ring = (n: number): number[] => [n, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    w.firearm.takeKit([58, 15, 121, 126, EMPTY_ITEM], 0, [ring(30), ring(12)]);
    w.frame();
    const a = acc.state().size;
    w.frame();
    // The AK-47's TargetConstrict 40 a second standing (the M4A1 SD's would be 50): the new record runs.
    expect(a - acc.state().size).toBeCloseTo(40 / 60, 6);
  });

  it('a swap the room undid (PAR-37) gives the bloom back the hand\'s record: the slot is the kit\'s again', () => {
    const w = walking();
    w.settle();
    expect(w.firearm.selectFirearm('pistol')).toBe(true);
    w.until(() => !w.firearm.kit.swapping());
    expect(w.firearm.selectFirearm('rifle')).toBe(true);
    w.frame();
    (w.firearm.kit as unknown as { undo(): void }).undo();           // as `swapProgress`'s `undone` would
    w.frame();
    w.settle();
    expect(w.firearm.kit.item()).toBe('pistol');
    expect(w.firearm.accuracy.state().size).toBe(HELD_SIDEARM.stances.stand.targetMin);   // the Mark 23's rest, not the SD's 1
  });
});

/**
 * NU-3a C3 (research 321 section 3.2, D3): the switch (`FUN_005c4b10`) writes the hand's new item and asks the set again
 * (D:L478907-478912), marking a changed set; the HUD frame takes the mark (`FUN_005be5f0` D:L475036-475047, from
 * `FUN_00216770` D:L70394, D:L70401) and adds 0.5 to the exertion, capped at 1 (`FUN_00578150`). The page's HUD frame is
 * `aimReticle`: when what is in the hand changed and the set with it, the bloom's `reticleSetChanged`. A life's start keeps
 * `reset()` (`spawnKit`). Was, before NU-3a: every swap reset the bloom (`Accuracy.setWeapon`), the exertion to 1.
 */
describe('NU-3a C3: the swap\'s set change at the HUD frame; a spawn at rest', () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const still = { stance: 'stand' as const, velocity: [0, 0, 0] as [number, number, number], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 };

  it('a swap\'s press (set 1 to 0, then 0 to 1) raises +0.5 once, at the press both ways; the hand unchanged none; a grenade up (1 to 4) +0.5', () => {
    let item: number | null = null;
    const w = walking({ hands: hands({ handItem: () => item }) });
    const { firearm } = w;
    const acc = firearm.accuracy;
    w.settle();
    while (acc.state().exertion > 0.2) acc.tick(1, still);            // the SD's decay, standing still
    const low = acc.state().exertion;
    w.frame();
    expect(acc.state().exertion).toBeLessThan(low);                   // no swap: no raise (the decay only)
    const before = acc.state().exertion;
    expect(firearm.selectFirearm('pistol')).toBe(true);
    w.frame();                                                        // the HUD frame after the press takes the mark
    expect(acc.state().exertion).toBeCloseTo(before + 0.5, 2);
    const raised = acc.state().exertion;
    w.frame();
    expect(acc.state().exertion).toBeLessThanOrEqual(raised);         // once: the mark taken
    w.until(() => !firearm.kit.swapping());
    expect(firearm.selectFirearm('rifle')).toBe(true);                // pistol to rifle: m_item moves at the clip's end ...
    w.frame();
    expect(firearm.kit.swapping()).toBe(true);
    expect(acc.state().exertion).toBe(1);                             // ... but the set is the slot's (D:L478908): raised now
    w.until(() => !firearm.kit.swapping());
    while (acc.state().exertion > 0.2) acc.tick(1, still);
    const again = acc.state().exertion;
    item = 121;                                                       // an M67 taken: the switch's item, set 4
    w.frame();
    expect(acc.state().exertion).toBeCloseTo(again + 0.5, 2);
  });

  it('a spawn: the bloom at the new record\'s rest, the knock 0, the exertion 1, whatever the last life left (reset for a life)', () => {
    const { firearm } = rig({ network: () => false });
    const acc = firearm.accuracy;
    acc.trigger();
    acc.round(0, 'stand');
    acc.round(0, 'stand');
    acc.tick(0.1, still);
    expect(acc.state().exertion).toBeLessThan(1);
    expect(acc.state().size).toBeGreaterThan(firearm.fire.weaponRecord().stances.stand.targetMin);
    firearm.spawnKit('seal');
    const r = firearm.fire.weaponRecord().stances.stand;
    expect(acc.state()).toEqual({ size: r.targetMin, target: r.targetMin, offset: [0, 0], sway: [0, 0], burst: 0, exertion: 1 });
  });
});

/**
 * NU-3a C2 (research 321 sections 1 and 2.3): a raised LAW or RPG-7 is the hand's item, and `FUN_005be300` gives the rocket
 * launchers' class (145-150, `FUN_003c5d80` via `FUN_003d1e10`) set 3 -- the launcher's sight -- whatever firearm the kit
 * holds; the 9x view's 7 still first. Was, before NU-3a: the firearm's own set under a raised launcher.
 */
describe('NU-3a: aimReticle under a raised launcher', () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });

  it('the LAW up: set 3 (the sight); put away: the rifle\'s 1 again', () => {
    let up = false;
    const { firearm, walk } = rig({ hands: hands({ launcherUp: () => up }) });
    vi.spyOn(walk, 'aim').mockReturnValue([0, 0, -1000]);
    firearm.reticle.setBitmaps({
      fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
      sets: { 'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32), 'ret_rocket_01.tif': rgba(64, 64), 'ret_rocket_02.tif': rgba(64, 64) },
    });
    firearm.aimReticle(1 / 60);
    expect(firearm.reticle.currentSet()).toBe(1);
    up = true;
    firearm.aimReticle(1 / 60);
    expect(firearm.reticle.currentSet()).toBe(3);
    up = false;
    firearm.aimReticle(1 / 60);
    expect(firearm.reticle.currentSet()).toBe(1);
  });
});

/**
 * NU-5 L1 (research 323 §1.6): the room's `kit` after a launcher claim, through the firearm part's own path --
 * `firearm.takeKit` (`./takeKit`) sees the LAW and its round enter the live kit, rebuilds the kit's round slots with the
 * round's one round (`launcherKitRounds`, `PICKUP_LAUNCHER_ROUNDS_READING`) and hands them to the launcher's part
 * (`FirearmHands.kitTaken`), which `matchThrow.test.ts` "NU-5" carries on to the raise.
 */
describe('NU-5 L1: the firearm part hands a claimed launcher\'s round slots on (FirearmHands.kitTaken)', () => {
  it("takeKit with the LAW in slot 3 and its LAW HEAT in 4 (no firearm slot, no ring written): kitTaken gets round slots holding one LAW HEAT", () => {
    const table = { arsenal: { items: new Map([
      [145, { id: 145, name: 'LAW', cls: 'rocketLauncher', magazine: 1, mags: 1 }],
      [185, { id: 185, name: 'LAW HEAT', cls: 'rocketRound', magazine: 1, mags: 1 }],
    ]) }, records: new Map([[HELD_RIFLE.id, HELD_RIFLE], [HELD_SIDEARM.id, HELD_SIDEARM]]), rounds: new Map() } as never;
    const taken: KitRounds[] = [];
    const { firearm, loadouts } = rig({ hands: hands({ kitTaken: (r) => { taken.push(r); } }) });
    vi.spyOn(loadouts, 'tables').mockReturnValue(table);
    loadouts.take([HELD_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM]);
    const ring = (n: number): number[] => [n, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    firearm.takeKit([HELD_RIFLE.id, HELD_SIDEARM.id, 121, 145, 185], null, [ring(30), ring(12)], [[], []]);
    expect(taken).toHaveLength(1);
    expect(taken[0]!.ring(185)?.total()).toBe(1);
    expect(firearm.heldRounds().find((h) => h.slot === 4)).toEqual({ slot: 4, id: 185, rounds: 1 });
  });
});

/**
 * NU-3b C4 (research 321 section 7.1 C4, D4 and D10; `FUN_00215c10` D:L70094-70219): the HUD frame finds the actor under
 * the reticle -- the nearest living body the eye's pick ray meets before a blocking surface (`FUN_005aa6e0`, the room's
 * capsules: `RemotePlayers.aimBodies`, `crosshairPick`) -- and colours, names and bars it by its side (the room's seats,
 * `teamOf`), its name and clan tag (the page's roster, `NetPage.nameOf`, the score row's `clan`) and how far across the
 * ground it stands. A two-team room: the page a SEAL, body 7 a SEAL, body 9 a Terrorist.
 */
describe('NU-3b C4: aimReticle over a two-team room', () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };

  function room(over: Partial<FirearmHands> = {}, bot = false) {
    let under: { id: number; distance: number } | null = null;
    const at: Record<number, [number, number, number]> = {};
    const remote = {
      aimDistance: () => null, weaponFrame: () => null,
      aimBodies: () => (under ? [under] : []),
      teamOf: (id: number) => (id === 7 ? 'seal' as const : id === 9 ? 'terrorist' as const : null),
      feet: (id: number) => at[id] ?? null,
    };
    // NU-3c: the client's part health per seat (`NetClient.healthOf`) -- the teammate's as the room sent it; the enemy's
    // given here only to show the page draws no enemy's bar whatever it holds (the room never sends one).
    const net = {
      client: { role: 'player', team: 'seal', healthOf: (id: number) => (id === 7 ? 0.5 : id === 9 ? 0.75 : null) },
      nameOf: (id: number) => (id === 7 ? 'BRAVO' : id === 9 ? 'ECHO' : `Player${id}`),
      displayNameOf: (id: number) => botDisplayName(id === 7 ? 'BRAVO' : id === 9 ? 'ECHO' : `Player${id}`, bot && id === 9),
      rows: [{ id: 7, kills: 0, deaths: 0, score: 0, clan: 'NSW' }, { id: 9, kills: 0, deaths: 0, score: 0, clan: 'X' }],
    };
    const r = rig({ remote: remote as unknown as MatchFirearmDeps['remote'], net: () => net as unknown as ReturnType<MatchFirearmDeps['net']>, hands: hands(over) });
    vi.spyOn(r.walk, 'aim').mockReturnValue([0, 0, -1000]);
    vi.spyOn(r.walk, 'fireAim').mockReturnValue({ eye: [0, 60, 0], far: [0, 60, -1000] });
    vi.spyOn(r.walk, 'feet').mockReturnValue([0, 0, 0]);
    r.firearm.reticle.setBitmaps({
      fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
      sets: {
        'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32), 'ret_binocs.tif': rgba(128, 128), 'ret_binocs2.tif': rgba(128, 128),
        'ret_grenade_01.tif': rgba(64, 64), 'ret_grenade_02.tif': rgba(64, 64), 'ret_scope_01.tif': rgba(128, 128), 'ret_scope_02.tif': rgba(128, 128),
      },
    }, rgba(512, 128));
    r.firearm.reticle.setVisible(true);
    const aimAt = (id: number | null, ground = 0): void => {
      under = id === null ? null : { id, distance: ground };
      if (id !== null) at[id] = [0, 0, -ground];
    };
    const frame = () => { r.firearm.aimReticle(1 / 60); r.firearm.reticle.render(PS2); return r.firearm.reticle.state(); };
    return { ...r, aimAt, frame };
  }

  // TEAMMATE NAMES on, the option's default (`TEAMMATE_NAMES_OPTION_READING`; the valve's wiring owed to NU-9 (c)): a
  // teammate's name under the reticle is the blank, his bar beside it.
  it('the target identity path retains the explicit bot display label while keeping normal perception gates', () => {
    const { aimAt, frame } = room({}, true);
    aimAt(9, 200);
    expect(frame().target?.name).toBe('ECHO');
    aimAt(null);
    expect(frame().target).toBeNull();
  });

  it('a teammate at 200 units: green, the blank name (TEAMMATE NAMES on) at (cx + W/2, cy - H/2); at 400 the rest; scoped at 400 green', () => {
    const { aimAt, frame, firearm } = room();
    aimAt(7, 200);
    let s = frame();
    expect(s.colour).toBe('friendly');
    expect(s.target?.name).toBe(' ');
    expect(s.target?.pen).toEqual([336, 208]);                               // the rifle's arm 32 x 32 at the centre
    expect(s.target?.bar?.health).toBe(0.5);                                  // NU-3c: the room's `health`, through the client
    expect(s.target?.bar?.fill).toBe(30);                                     // (int)(x + 60 x 0.5) less x
    aimAt(7, 400);
    s = frame();
    expect([s.colour, s.target]).toEqual(['rest', null]);
    vi.spyOn(firearm.zoom, 'view').mockReturnValue('scope');
    s = frame();
    expect(s.colour).toBe('friendly');
    expect(s.target?.name).toBe(' ');
    expect(s.target?.pen).toEqual([352, 192]);                               // ret_scope_02's 128 halved: W/4, H/4
  });

  it('an enemy at 200: red with his name, the one-character tag dropped (D:L70193-70198); none under the reticle: the rest', () => {
    const { aimAt, frame } = room();
    aimAt(9, 200);
    const s = frame();
    expect(s.colour).toBe('hostile');
    expect(s.target).toEqual({ name: 'ECHO', pen: [336, 208], bar: null });
    aimAt(null);
    expect([frame().colour, frame().target]).toEqual(['rest', null]);
  });

  it('D10: the binoculars with a teammate at 200 under the centre: the mask and the name at ret_binocs2\'s (cx + W/2, cy - H/2), the range 320', () => {
    const { aimAt, frame, firearm } = room();
    vi.spyOn(firearm.zoom, 'binoculars').mockReturnValue(true);
    aimAt(7, 200);
    let s = frame();
    expect(s.mode).toBe('binoculars');
    expect(s.target?.name).toBe(' ');
    expect(s.target?.pen).toEqual([384, 160]);
    aimAt(7, 400);                                                            // not set 5's 500
    s = frame();
    expect(s.target).toBeNull();
  });
});

/**
 * F1 of AD-1's review: the reticle's pick (`aimTarget`, NU-3b C4) is `FUN_005aa6e0`'s own ray, so it reaches as far as the
 * shot's eye ray (`Fire.eyeReach`: the held item's range floored at 600, capped at the map camera's MID plus the view's
 * extension) -- not `ORDER_PICK_REACH_READING`'s 600. A body seen steeply (its ray distance past its ground distance).
 */
describe("AD-1 F1: the reticle's pick reaches as far as the aim's ray", () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
  function steep(mid: number, distance: number) {
    const asked: number[] = [];
    const remote = {
      aimDistance: () => null, weaponFrame: () => null,
      aimBodies: (_eye: unknown, _dir: unknown, reach: number) => { asked.push(reach); return distance < reach ? [{ id: 9, distance }] : []; },
      teamOf: (id: number) => (id === 9 ? 'terrorist' as const : null), feet: (id: number) => (id === 9 ? [0, 0, -200] as [number, number, number] : null),
    };
    const net = { client: { role: 'player', team: 'seal', healthOf: () => null }, nameOf: () => 'ECHO', rows: [] };
    const map = { camera: { mid, farPlane: 2500 } } as unknown as LoadedMap;
    const r = rig({ remote: remote as unknown as MatchFirearmDeps['remote'], net: () => net as unknown as ReturnType<MatchFirearmDeps['net']>, map: () => map, hands: hands() });
    vi.spyOn(r.walk, 'aim').mockReturnValue([0, 0, -1000]);
    vi.spyOn(r.walk, 'fireAim').mockReturnValue({ eye: [0, 60, 0], far: [0, 60, -1000] });
    vi.spyOn(r.walk, 'feet').mockReturnValue([0, 0, 0]);
    r.firearm.reticle.setBitmaps({
      fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
      sets: {
        'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32), 'ret_binocs.tif': rgba(128, 128), 'ret_binocs2.tif': rgba(128, 128),
        'ret_grenade_01.tif': rgba(64, 64), 'ret_grenade_02.tif': rgba(64, 64), 'ret_scope_01.tif': rgba(128, 128), 'ret_scope_02.tif': rgba(128, 128),
      },
    }, rgba(512, 128));
    r.firearm.reticle.setVisible(true);
    r.firearm.aimReticle(1 / 60);
    r.firearm.reticle.render(PS2);
    return { s: r.firearm.reticle.state(), asked };
  }

  it("MP81's MID 2500: an enemy 800 down the ray (200 across the ground) is picked; MP5's 550: one 570 down it is not -- the pick cast as far as the shot's eye ray", () => {
    const far = steep(2500, 800);
    expect(far.asked).toEqual([2500]);
    expect(far.s.colour).toBe('hostile');
    const near = steep(550, 570);
    expect(near.asked).toEqual([550]);
    expect([near.s.colour, near.s.target]).toEqual(['rest', null]);
  });
});

/**
 * AD-2's review F1 (research 84 §19): the reticle's pick (`aimTarget`: `pickSurfaces` then `crosshairPick`) is a copy of
 * `FUN_005aa6e0`'s query, the shot's eye ray's own, so it takes the eye's class: a palm trunk (M62, MP62: `palmtree01/02`,
 * WOOD_THICK, `m_cameratype` 2, skipped by the eye's query with `DAT_0044d758` 1, D:L174855) is not met, and the enemy
 * behind it is named as the shot aims at him; the same face at `m_cameratype` 0 hides him.
 */
describe("AD-2 F1: the reticle's pick takes the eye query's class", () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
  const WOOD_THICK = materialTable().findIndex((m) => m.name === 'WOOD_THICK');
  /** A face across the ray at z -100 (x -50..50, y 0..100) of WOOD_THICK at `cameratype`. */
  const trunk = (cameratype: number): Grid => {
    const points = Float32Array.from([-50, 0, -100, 50, 0, -100, 50, 100, -100, -50, 100, -100]);
    const poly: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/palm', region: 0, ditype: 2, material: WOOD_THICK, ptcount: 4, cameratype, points };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    return buildGrid(params, [], [], [poly], [{ modelName: poly.modelName, path: `${poly.path}0`, first: 0, count: 1 }]);
  };
  function behind(cameratype: number) {
    const remote = {
      aimDistance: () => null, weaponFrame: () => null,
      aimBodies: () => [{ id: 9, distance: 200 }],
      teamOf: (id: number) => (id === 9 ? 'terrorist' as const : null), feet: (id: number) => (id === 9 ? [0, 0, -200] as [number, number, number] : null),
    };
    const net = { client: { role: 'player', team: 'seal', healthOf: () => null }, nameOf: () => 'ECHO', rows: [] };
    const map = { camera: { mid: 2500, farPlane: 2500 } } as unknown as LoadedMap;
    const r = rig({ remote: remote as unknown as MatchFirearmDeps['remote'], net: () => net as unknown as ReturnType<MatchFirearmDeps['net']>, map: () => map, hands: hands() });
    vi.spyOn(r.walk, 'aim').mockReturnValue([0, 0, -1000]);
    vi.spyOn(r.walk, 'fireAim').mockReturnValue({ eye: [0, 60, 0], far: [0, 60, -1000] });
    vi.spyOn(r.walk, 'feet').mockReturnValue([0, 0, 0]);
    vi.spyOn(r.walk, 'grid').mockReturnValue(trunk(cameratype));
    r.firearm.reticle.setBitmaps({
      fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
      sets: {
        'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32), 'ret_binocs.tif': rgba(128, 128), 'ret_binocs2.tif': rgba(128, 128),
        'ret_grenade_01.tif': rgba(64, 64), 'ret_grenade_02.tif': rgba(64, 64), 'ret_scope_01.tif': rgba(128, 128), 'ret_scope_02.tif': rgba(128, 128),
      },
    }, rgba(512, 128));
    r.firearm.reticle.setVisible(true);
    r.firearm.aimReticle(1 / 60);
    r.firearm.reticle.render(PS2);
    return r.firearm.reticle.state();
  }

  it('AD-2 F1: an enemy behind a palm trunk (WOOD_THICK, m_cameratype 2) is named red, as the shot aims past the trunk; behind the same face at m_cameratype 0 the reticle rests', () => {
    expect(WOOD_THICK).toBeGreaterThan(1);
    expect(behind(2).colour).toBe('hostile');
    const plain = behind(0);
    expect([plain.colour, plain.target]).toEqual(['rest', null]);
  });
});

/**
 * NU-3b G4 (research 320 section 8.1 G4, D3 and D6; research 321 section 4.2): with a hand grenade up the reticle is the
 * throw meter (set 4), and `FUN_00215c10`'s target pass runs as under any set (D:L70094-70219): the name at
 * `ret_grenade_02`'s `(cx + W/2, cy - H/2)` about the meter's centre, the colour pass landing on the hidden arms, so the
 * meter's own colours stay (`meterTint`).
 */
describe('NU-3b G4: the name and the bar under the throw meter', () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };

  it('an M67 up, a teammate at 200 under the centre: set 4, the name at (320 + 32, 224 - 32) off the served 64 x 64, the meter unchanged', () => {
    const remote = {
      aimDistance: () => null, weaponFrame: () => null,
      aimBodies: () => [{ id: 7, distance: 200 }], teamOf: () => 'seal' as const, feet: () => [0, 0, -200] as [number, number, number],
    };
    const net = { client: { role: 'player', team: 'seal', healthOf: () => 1 }, nameOf: () => 'BRAVO', rows: [{ id: 7, kills: 0, deaths: 0, score: 0, clan: 'NSW' }] };
    const { firearm, walk } = rig({
      remote: remote as unknown as MatchFirearmDeps['remote'], net: () => net as unknown as ReturnType<MatchFirearmDeps['net']>,
      hands: hands({ itemUp: () => true, handItem: () => 121, throwPower: () => 0 }),
    });
    vi.spyOn(walk, 'aim').mockReturnValue([0, 0, -1000]);
    vi.spyOn(walk, 'fireAim').mockReturnValue({ eye: [0, 60, 0], far: [0, 60, -1000] });
    vi.spyOn(walk, 'feet').mockReturnValue([0, 0, 0]);
    firearm.reticle.setBitmaps({
      fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
      sets: { 'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32), 'ret_grenade_01.tif': rgba(64, 64), 'ret_grenade_02.tif': rgba(64, 64) },
    }, rgba(512, 128));
    firearm.reticle.setVisible(true);
    let scene: Scene | null = null;
    const frame = () => {
      firearm.aimReticle(1 / 60);
      firearm.reticle.render({ ...PS2, render: (s: Scene) => { scene = s; } });
      return firearm.reticle.state();
    };
    const meterColours = (): number[][] => {
      const out: number[][] = [];
      (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.userData.meter) out.push([...(o.material as MeshBasicMaterial).color.toArray(), (o.material as MeshBasicMaterial).opacity]); });
      return out;
    };
    frame();
    const before = meterColours();
    const s = frame();
    expect(firearm.reticle.currentSet()).toBe(4);
    expect(s.colour).toBe('friendly');                                        // on the hidden arms
    expect(s.target?.name).toBe(' ');                                         // TEAMMATE NAMES on: the blank
    expect(s.target?.pen).toEqual([352, 192]);                                // the meter's centre (320, 224) + (32, -32)
    expect(meterColours()).toEqual(before);
    expect(before.length).toBe(4);
    expect(meterColours().map((c) => c.map((v) => Math.round(v * 1e6) / 1e6))).toEqual(
      (['fill', 'fill', 'frame', 'frame'] as const).map((p) => [...meterTint(p).rgb, meterTint(p).opacity].map((v) => Math.round(v * 1e6) / 1e6)));
  });
});

/**
 * NU-3b C5 (research 321 section 7.1 C5): the HUD frame feeds `FUN_00215c10`'s other states -- the blocked muzzle (the
 * pip's offset, `Fire.blockedMuzzle`, against the bloom's unhalved size), nothing left in the hand's mode
 * (`Fire.magazineTotal`, a round mode's ring, an item's count) and a climb's clip on top (`walk.traversal().clip()`).
 */
describe('NU-3b C5: aimReticle greys a blocked muzzle and a climb, blacks an empty weapon', () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const setUp = (over: Partial<FirearmHands> = {}) => {
    const r = rig({ hands: hands(over) });
    vi.spyOn(r.walk, 'aim').mockReturnValue([0, 0, -1000]);
    r.firearm.reticle.setBitmaps({ fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null, sets: { 'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32) } });
    return r;
  };

  it('a crate climb: the grey from the climb\'s first frame to its end, the rest before and after', () => {
    const { firearm, walk } = setUp();
    let clip: string | null = null;
    vi.spyOn(walk, 'traversal').mockReturnValue({ clip: () => (clip ? { clip, phase: 0, reversed: false, stateRefused: false } : null) } as unknown as ReturnType<WalkMode['traversal']>);
    const colour = () => { firearm.aimReticle(1 / 60); return firearm.reticle.state().colour; };
    expect(colour()).toBe('rest');
    clip = 'seal_climbcrate';
    expect(colour()).toBe('climbing');
    expect(colour()).toBe('climbing');
    clip = 'seal_stand2ladder';
    expect(colour()).toBe('climbing');
    clip = null;
    expect(colour()).toBe('rest');
  });

  it('every magazine empty: the black; a round left anywhere: the rest; an item\'s count of none: the black', () => {
    const { firearm } = setUp();
    const total = vi.spyOn(firearm.fire, 'magazineTotal').mockReturnValue(0);
    firearm.aimReticle(1 / 60);
    expect(firearm.reticle.state().colour).toBe('empty');
    total.mockReturnValue(30);
    firearm.aimReticle(1 / 60);
    expect(firearm.reticle.state().colour).toBe('rest');
    const item = setUp({ magazine: () => ({ rounds: 0, capacity: 1, spare: 0, reloading: false }) });
    item.firearm.aimReticle(1 / 60);
    expect(item.firearm.reticle.state().colour).toBe('empty');
  });

  it('a blocked muzzle 40 right of the centre with the size 26: the grey', () => {
    const { firearm, play, fly, walk } = setUp();
    fly.camera.updateMatrixWorld();
    // The aim point on the frame's centre, the blocked point a quarter of the frame to its right (160 PS2 pixels).
    const centre = new Vector3(0, 0, 0.5).unproject(fly.camera), right = new Vector3(0.5, 0, 0.5).unproject(fly.camera);
    vi.spyOn(walk, 'aim').mockReturnValue([centre.x, centre.y, centre.z]);
    vi.spyOn(firearm.accuracy, 'state').mockReturnValue({ ...firearm.accuracy.state(), size: 26 });
    vi.spyOn(play, 'weaponStats').mockReturnValue({ ...play.weaponStats(), raise: { ...play.weaponStats().raise, weight: 1 } });
    const block = vi.spyOn(firearm.fire, 'blockedMuzzle').mockReturnValue([right.x, right.y, right.z]);
    firearm.reticle.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} });
    firearm.aimReticle(1 / 60);
    expect(firearm.reticle.state().pip.offset![0]).toBeGreaterThan(26);
    expect(firearm.reticle.state().colour).toBe('blocked');
    block.mockReturnValue(null);
    firearm.aimReticle(1 / 60);
    expect(firearm.reticle.state().colour).toBe('rest');
  });

  // PB-2b F2 (the review, 2026-10-16): mounted, the rifle rides the occupant's back (TURRET_HELD_WEAPON_READING, research
  // 215 s7.3) and the hand is the turret's (the kit's turret slot, FUN_005bc5d0 D:L412217): the pip of a rifle's blocked
  // muzzle is not drawn, whatever the raise's weight within its 5 s after a shot. Was: the pip from the rifle on the back.
  it('PB-2b F2: mounted on a turret with the raise held, no pip and no blocked grey (the muzzle is not the rifle\'s)', () => {
    const { firearm, play, fly, walk } = setUp({ mounted: () => true });
    fly.camera.updateMatrixWorld();
    const centre = new Vector3(0, 0, 0.5).unproject(fly.camera), right = new Vector3(0.5, 0, 0.5).unproject(fly.camera);
    vi.spyOn(walk, 'aim').mockReturnValue([centre.x, centre.y, centre.z]);
    vi.spyOn(firearm.accuracy, 'state').mockReturnValue({ ...firearm.accuracy.state(), size: 26 });
    vi.spyOn(play, 'weaponStats').mockReturnValue({ ...play.weaponStats(), raise: { ...play.weaponStats().raise, weight: 1 } });
    const block = vi.spyOn(firearm.fire, 'blockedMuzzle').mockReturnValue([right.x, right.y, right.z]);
    firearm.reticle.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} });
    firearm.aimReticle(1 / 60);
    expect(firearm.reticle.state().pip.offset).toBeNull();
    expect(firearm.reticle.state().colour).not.toBe('blocked');
    expect(block).not.toHaveBeenCalled();
  });
});

/**
 * NU-3b's review, F3: both pages hand `mountFirearm` the target's feed (`MatchFirearmDeps.remote`'s `aimBodies`, `teamOf`
 * and `feet`) -- the front end's match its whole `RemotePlayers`, `/testroom` (`./main`) a lent object that names each.
 * Without them `aimReticle` finds no target: no colour, no name, no bar (research 321 C4). A source pin: neither page
 * module can be mounted here.
 */
describe('NU-3b F3: /testroom and the front end both hand mountFirearm the target feed', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('main.ts lends aimBodies, teamOf and feet beside aimDistance and weaponFrame; matchMount.ts the RemotePlayers itself', () => {
    const main = src('main.ts');
    const call = main.slice(main.indexOf('const firearm = mountFirearm({'));
    const line = call.split('\n').find((l) => /^\s*remote: \{/.test(l)) ?? '';
    for (const m of ['aimDistance', 'weaponFrame', 'aimBodies', 'teamOf', 'feet']) {
      expect(line, m).toMatch(new RegExp(`${m}: \\([^)]*\\) => remote\\.${m}\\(`));
    }
    expect(src('matchMount.ts')).toMatch(/scene, fly, walk, play, remote, hud, loadouts/);
  });
});

/**
 * AD-3 (research 321 sections 4.1 and 7.5; the reconciliation's C88): the HUD frame steps the body's perception
 * (`./reticle` `Perception`, `perceptionLook`) for every body the page knows -- the room's seats but its own, its
 * hostages and the body under the reticle -- before `FUN_00215c10`'s target pass reads the mark; and names a hostage by
 * the room's list (`NetPage.hostages`), the round's type and the page's side feeding the ESCORT rule.
 */
describe('AD-3: aimReticle reads the perception\'s mark and the special actors', () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
  const WOOD_THICK = materialTable().findIndex((m) => m.name === 'WOOD_THICK');
  /** A low wall across the view at z -100 (x -50..50, y 0..40): over it the pick's ray at y 60, into it the sight's ray to (0, 15.4, -200). */
  const wall = (): Grid => {
    const points = Float32Array.from([-50, 0, -100, 50, 0, -100, 50, 40, -100, -50, 40, -100]);
    const poly: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: WOOD_THICK, ptcount: 4, cameratype: 0, points };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    return buildGrid(params, [], [], [poly], [{ modelName: poly.modelName, path: `${poly.path}0`, first: 0, count: 1 }]);
  };

  function setUp(o: { team?: 'seal' | 'terrorist'; gameType?: number | null; hostages?: Map<number, { id: number; name: string; alive?: boolean }>; at?: [number, number, number] } = {}) {
    let under: { id: number; distance: number } | null = null;
    let grid: Grid | null = null;
    const remote = {
      aimDistance: () => null, weaponFrame: () => null,
      aimBodies: () => (under ? [under] : []),
      teamOf: (id: number) => (id === 7 ? 'seal' as const : id === 9 ? 'terrorist' as const : null),
      feet: (id: number) => (id === 9 || id === 240 ? o.at ?? [0, 0, -200] as [number, number, number] : null),
    };
    const rows = [{ id: 3, alive: true }, { id: 9, alive: true, clan: '' }];
    const net = {
      client: { id: 3, role: 'player', team: o.team ?? 'seal', healthOf: () => null },
      nameOf: (id: number) => (id === 9 ? 'ECHO' : `Player${id}`),
      rows,
      hostages: () => o.hostages ?? new Map(),
      gameType: () => o.gameType ?? null,
    };
    const r = rig({ remote: remote as unknown as MatchFirearmDeps['remote'], net: () => net as unknown as ReturnType<MatchFirearmDeps['net']>, hands: hands() });
    vi.spyOn(r.walk, 'aim').mockReturnValue([0, 60, -1000]);              // level with the camera: the frame's centre
    vi.spyOn(r.walk, 'fireAim').mockReturnValue({ eye: [0, 60, 0], far: [0, 60, -1000] });
    vi.spyOn(r.walk, 'feet').mockReturnValue([0, 0, 0]);
    vi.spyOn(r.walk, 'grid').mockImplementation(() => grid);
    r.fly.camera.position.set(0, 60, 0);                                    // the camera at the eye, looking down -z
    r.firearm.reticle.setBitmaps({
      fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
      sets: { 'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32) },
    }, rgba(512, 128));
    r.firearm.reticle.setVisible(true);
    const frame = (dt = 1 / 60) => { r.firearm.aimReticle(dt); r.firearm.reticle.render(PS2); return r.firearm.reticle.state(); };
    return { ...r, frame, rows, aimAt: (id: number | null) => { under = id === null ? null : { id, distance: 200 }; }, setGrid: (g: Grid | null) => { grid = g; } };
  }

  it("AD-3's review F1: in a scope the cone takes the zoom's target magnification at once (body +0x204, FUN_005c9520 D:L481801-481806), not the one still easing toward it", () => {
    // The enemy 60 across at 200 out: 74.8 off the camera's axis -- inside the cone at 1.2 (radius 141.5), outside at 4 (35.5).
    const { frame, aimAt, firearm } = setUp({ at: [60, 0, -200] });
    vi.spyOn(firearm.zoom, 'state').mockReturnValue(5);
    vi.spyOn(firearm.zoom, 'target').mockReturnValue(4);
    vi.spyOn(firearm.zoom, 'magnification').mockReturnValue(1.2);
    aimAt(9);
    const s = frame();
    expect([s.colour, s.target]).toEqual(['rest', null]);                 // rejected: out of the scope's cone, slow
  });

  it("#479's re-review: the cone's apex and forward are the game's camera (`WalkMode.gameCamera`), not the drawn one a wide window pushes", () => {
    // The drawn camera looks down -z at the enemy (200 out); the game's camera, turned to +x, has him 90 degrees off its
    // axis -- outside FUN_005c9520's cone. Null (the scope, off the walk): the drawn camera is the game's.
    const turned = setUp();
    vi.spyOn(turned.walk, 'gameCamera').mockReturnValue({ eye: [0, 60, 0], target: [1, 60, 0] });
    turned.aimAt(9);
    expect(turned.frame().colour).toBe('rest');
    const same = setUp();
    vi.spyOn(same.walk, 'gameCamera').mockReturnValue(null);
    same.aimAt(9);
    expect(same.frame().colour).toBe('hostile');
  });

  // The re-check of AD-3's F2 (2026-10-16) flips the fold's pin (was: "the record outlives the enemy's death and the round
  // -- back alive behind the wall, in the cone, he is red until it falls under 1").
  it("AD-3's re-check of F2: the page's own spawn (the observer rebuilt: a round start online, its respawn) empties the records -- the enemy back in the cone behind the wall is the rest", () => {
    const { frame, aimAt, setGrid, firearm } = setUp();
    aimAt(9);
    expect(frame().colour).toBe('hostile');                                // seen: the record at 2
    firearm.spawnKit('seal');                                              // the room's spawn of the page
    setGrid(wall());
    expect(frame(0.5).colour).toBe('rest');                                // out of sight: a fresh record, never seen
  });

  it("AD-3's re-check of F2: only the enemy rebuilt mid-round keeps the page's record of him (FUN_002a0f70's leave cancelled) -- back alive behind the wall, red until it falls under 1", () => {
    const { frame, aimAt, setGrid, rows } = setUp();
    aimAt(9);
    expect(frame().colour).toBe('hostile');
    rows[1]!.alive = false;
    aimAt(null);
    expect(frame(0.5).colour).toBe('rest');                                // dead: the mark cleared, the record kept
    rows[1]!.alive = true;                                                 // his respawn alone
    setGrid(wall());
    aimAt(9);
    expect(frame(0.5).colour).toBe('hostile');                             // 1.5, unseen
    expect(frame(0.5).colour).toBe('hostile');                             // 1.0
    expect(frame(0.5).colour).toBe('rest');                                // 0.5
  });

  it("AD-3's re-check of F2: a seat that leaves takes its record with it (the page's own bookkeeping) -- a joiner on the same id, out of sight, is the rest", () => {
    const { frame, aimAt, setGrid, rows } = setUp();
    aimAt(9);
    expect(frame().colour).toBe('hostile');
    const left = rows.splice(1, 1)[0]!;                                    // the seat leaves the room
    aimAt(null);
    frame(1 / 60);
    rows.push(left);                                                       // a joiner seated on the same id
    setGrid(wall());
    aimAt(9);
    expect(frame(0.5).colour).toBe('rest');
  });

  it('an enemy under the reticle the sight never reached is not named; seen once he is red, and behind the wall he stays red a second (the rate -1 from 2), then the rest', () => {
    expect(WOOD_THICK).toBeGreaterThan(1);
    const { frame, aimAt, setGrid } = setUp();
    setGrid(wall());
    aimAt(9);
    expect([frame().colour, frame().target]).toEqual(['rest', null]);      // picked over the wall, never seen
    setGrid(null);
    expect(frame().colour).toBe('hostile');
    setGrid(wall());
    expect(frame(0.5).colour).toBe('hostile');                             // 1.5
    expect(frame(0.5).colour).toBe('hostile');                             // 1.0: still marked
    const s = frame(0.5);                                                  // 0.5
    expect([s.colour, s.target]).toEqual(['rest', null]);
  });

  it('seen off the reticle first, the enemy is red the frame the reticle reaches him (the passes run for every body the room seats)', () => {
    const { frame, aimAt } = setUp();
    aimAt(null);
    expect(frame().colour).toBe('rest');
    aimAt(9);
    const s = frame(0);                                                     // no time passes: no query this frame
    expect(s.colour).toBe('hostile');
  });

  it('a hostage under the reticle (the room\'s list): green with its record\'s name, no bar while the room sends none; red only in ESCORT for a Terrorist page', () => {
    const hostages = new Map([[240, { id: 240, name: 'Hostage2', alive: true }]]);
    for (const [team, gameType, colour] of [['seal', 4, 'friendly'], ['terrorist', 4, 'friendly'], ['seal', 3, 'friendly'], ['terrorist', 3, 'hostile']] as const) {
      const { frame, aimAt } = setUp({ team, gameType, hostages });
      aimAt(240);
      const s = frame();
      expect([team, gameType, s.colour]).toEqual([team, gameType, colour]);
      expect(s.target).toEqual({ name: 'Hostage2', pen: [336, 208], bar: null });
    }
  });
});

/**
 * OT.R59 (RECONNECT-GHOST; the gameplay seat's condition 4 (a)): a seat resumed on its sidearm -- the room's `resume`
 * through `kitChanged` -> `takeKit`'s `resumed` -- has the kit's firearm set at once, with no swap clip: the commands'
 * weapon (the walk's `resume`), the Fire record, the HUD's weapon box and the hung model all the sidearm's.
 */
describe("OT.R59 (RECONNECT-GHOST, condition 4 (a)): a resume on the sidearm sets the kit's firearm at once", () => {
  it('takeKit with resumed.weapon 1: the kit on the pistol with no swap clip, the Fire record and the HUD box the pistol\'s', () => {
    const { firearm, hud, walk } = rig();
    const ring = (n: number): number[] => [n, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const kit = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255];
    firearm.takeKit(kit, null, [ring(30), ring(12)]);
    expect(firearm.kit.item()).toBe('rifle');
    firearm.feedHud(true);
    const rifleIcon = hud.state().model.weaponIcon;
    firearm.takeKit(kit, null, [ring(30), ring(12)], undefined, { pouch: {}, held: null, weapon: 1 } as never);
    expect(firearm.kit.item()).toBe('pistol');
    expect(firearm.kit.swapping()).toBe(false);                     // no swap clip: a direct set
    expect(walk.swapProgress()).toBeNull();
    expect(firearm.fire.weaponRecord().id).toBe(firearm.records()[1].id);
    firearm.feedHud(true);
    expect(hud.state().model.weaponIcon).not.toBe(rifleIcon);
  });
});

/**
 * TURRET-RETICLE (issue #283; research 215 s8.2, research 321 s2.5): the mount takes the turret's slot up
 * (`FUN_005463c0` D:L412214-412218 -> `FUN_005c4b10`), and the switch asks the set of that slot (D:L478907-478912:
 * `FUN_005be300` on `+0x824`, through `FUN_005c67d0` / `FUN_005c6600`): the turret's record, ids 205, 207 and 230 all in
 * 0xbe-0xfd and none a carrier (`FUN_003c5d80` D:L317277-317301) -- set 0, the sidearm's cross -- whatever was up before
 * (the kept slot `+0xebc` is asked again only at the release, D:L412005). The kit's bloom then runs the turret slot's
 * record (`FUN_005c2670` reads the selected slot), standing (`TURRET_RETICLE_STANCE_READING`).
 */
describe.skipIf(ZWEAPON === null)(`TURRET-RETICLE: mounted, the reticle is the turret slot's (issue #283)${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const ink = (wd: number, h: number) => ({ width: wd, height: h, data: new Uint8ClampedArray(wd * h * 4).fill(255) });
  /** The M4A1-M203 (61) with its M203 FRAG rounds, walking; mounted while `on.mounted`, the turret's id `on.weapon`. */
  const mountedRig = (on: { mounted: boolean; weapon: number | null; item: number | null }) => {
    const w = walking({
      network: () => true,
      hands: hands({
        mounted: () => on.mounted, weapon: () => (on.mounted ? on.weapon : null), fireMode: () => (on.mounted ? 3 : null),
        itemUp: () => on.item !== null, handItem: () => on.item, throwPower: () => (on.item !== null ? 0.5 : 0),
      }),
    });
    const table = readKitTable(ZWEAPON!);
    w.loadouts.setMap(table, null);
    w.firearm.spawnKit('seal', [61, 15, 175, 175, EMPTY_ITEM]);
    w.firearm.reticle.setBitmaps({
      fixed: ink(64, 64), floating: ink(32, 32), accuracy: null,
      sets: {
        'ret_rifle_01.tif': ink(64, 64), 'ret_rifle_02.tif': ink(32, 32), 'ret_sidearm_01.tif': ink(32, 32), 'ret_sidearm_02.tif': ink(16, 16),
        'ret_rocket_01.tif': ink(64, 64), 'ret_rocket_02.tif': ink(64, 64), 'ret_grenade_01.tif': ink(64, 64), 'ret_grenade_02.tif': ink(64, 64),
      },
    });
    w.firearm.reticle.setVisible(true);
    w.settle();
    return { w, table };
  };
  const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };

  it("TURRET-RETICLE: mounted, the set is the turret slot's: 0 on 205/207/230 whatever was up -- the M4A1-M203 in a round mode (was 3), its rifle mode (was 1), an M67 (was 4, the meter); the slot's own again at the release (FUN_005be300 on +0x824, D:L478907-478912)", () => {
    const got: string[] = [];
    for (const weapon of [205, 207, 230]) {
      for (const up of ['round', 'rifle', 'M67'] as const) {
        const on = { mounted: false, weapon, item: null as number | null };
        const { w } = mountedRig(on);
        if (up === 'round') for (let i = 0; i < 6 && w.firearm.fireMode() < 5; i++) w.firearm.switchFireMode();
        if (up === 'M67') on.item = 121;
        w.frame();
        const before = w.firearm.reticle.currentSet();
        expect([weapon, up, before]).toEqual([weapon, up, up === 'round' ? 3 : up === 'rifle' ? 1 : 4]);
        on.mounted = true;                                             // the room's turret event: the slot taken up
        w.frame();
        w.firearm.reticle.render(PS2);
        got.push(`${weapon} with ${up} up: set ${w.firearm.reticle.currentSet()}, meter ${w.firearm.reticle.state().meter ? 'drawn' : 'none'}`);
        on.mounted = false;                                            // the release: the kept slot's own set again
        w.frame();
        expect([weapon, up, w.firearm.reticle.currentSet()], `${weapon} with ${up} up, released`).toEqual([weapon, up, before]);
      }
    }
    expect(got).toEqual([205, 207, 230].flatMap((weapon) => ['round', 'rifle', 'M67'].map((up) => `${weapon} with ${up} up: set 0, meter none`)));
  });

  it("TURRET-RETICLE: mounted, the size is the turret record's bloom -- standing TargetMin PKM 15, LMG 6, MGL 2 (halved in third person) -- not the M4A1-M203's 1.25; the rifle's own record again at the release (FUN_005c2670 on the selected slot; TURRET_RETICLE_STANCE_READING)", () => {
    for (const [weapon, min] of [[205, 15], [207, 6], [230, 2]] as const) {
      const on = { mounted: false, weapon, item: null as number | null };
      const { w, table } = mountedRig(on);
      const rifle = w.firearm.records()[0];
      expect(rifle.stances.stand.targetMin).toBe(1.25);
      expect(w.firearm.accuracy.state().size).toBe(1.25);
      const record = table.turretRecords?.get(weapon) ?? table.turret2Records?.get(weapon);
      expect(record!.stances.stand.targetMin).toBe(min);
      on.mounted = true;
      w.settle();
      expect([weapon, w.firearm.accuracy.state().size]).toEqual([weapon, min]);
      expect([weapon, w.firearm.accuracy.reticle(0).size]).toEqual([weapon, min / 2]);
      on.mounted = false;                                              // released: the rifle's record closes to its own rest
      for (let i = 0; i < 600; i++) w.frame();
      expect([weapon, w.firearm.accuracy.state().size]).toEqual([weapon, 1.25]);
    }
  });

  /**
   * The review's F1 (research 215 s8.2, "The arming grey"): the colour pass greys the arms only when the record of the
   * SELECTED slot -- `FUN_005c3780` (D:L477826-477834: `FUN_005c6600` on `+0x824`, the round's slot for a carrier in a
   * round mode) -- is of class 0x91 (`FUN_003c5ca0`, the rocket launchers 145-150) or 0xb9 (`FUN_003c5c70`, their
   * rockets 185-189), and the aimed point is inside its `ArmingDistance` (`FUN_003d2030`, `+0x68`) (`FUN_00215c10`
   * D:L70222-70258; the classes `FUN_003d1a60` D:L324331-324352). Mounted, that slot is the turret's: PKM TURRET and LMG
   * TURRET class 0xcd, MGL FRAG TURRET 0xe6 -- neither class, so no grey on any turret, whatever the held rifle's round.
   */
  const aimedAt = (metres: number) => vi.spyOn(RangeFinder.prototype, 'measure').mockReturnValue(metres);
  const roundUp = (w: ReturnType<typeof mountedRig>['w']): void => {
    for (let i = 0; i < 6 && w.firearm.fireMode() < 5; i++) w.firearm.switchFireMode();
    expect(w.firearm.fireMode()).toBe(175);                           // the M4A1-M203 on its M203 FRAG round
  };

  it('TURRET-RETICLE (review F1): mounted on the PKM with the M4A1-M203 in a round mode, no arming grey -- the selected slot is the turret\'s, class 0xcd (FUN_005c3780, FUN_00215c10 D:L70222-70258)', () => {
    const on = { mounted: false, weapon: 205, item: null as number | null };
    const { w } = mountedRig(on);
    roundUp(w);
    aimedAt(5);                                                         // 50 units: inside the M203 FRAG round's 100
    on.mounted = true;
    w.frame();
    expect(w.firearm.reticle.state().colour).toBe('rest');
  });

  it('TURRET-RETICLE (review F1): on the MGL FRAG TURRET no arming grey either -- not the held round\'s, and not its own (ArmingDistance 10, but class 0xe6 is neither 0x91 nor 0xb9: FUN_003c5ca0, FUN_003c5c70)', () => {
    const on = { mounted: false, weapon: 230, item: null as number | null };
    const { w, table } = mountedRig(on);
    expect(table.rounds.get(230)?.record.armingDistance).toBeGreaterThan(0);   // its own round has one (research 215 s8.1)
    roundUp(w);
    aimedAt(5);
    on.mounted = true;
    w.frame();
    expect(w.firearm.reticle.state().colour).toBe('rest');
  });

  it("TURRET-RETICLE (the narrow re-read's finding): mounted with the turret's weapon unknown to the page (no `weapon`, or a WEAPON NAME missing from the kit table), still no arming grey from the held round -- the selected slot is the turret's whatever its record", () => {
    const on = { mounted: false, weapon: null as number | null, item: null as number | null };
    const { w } = mountedRig(on);
    roundUp(w);
    aimedAt(5);
    on.mounted = true;
    w.frame();
    expect(w.firearm.reticle.state().colour).toBe('rest');
  });
});

/**
 * TURRET-CONE P1 (research 215 s8.2, "Built (P1)"): every mounted round runs the kit's round step on the selected slot's
 * record -- `FUN_005be9a0` D:L475604 -> `FUN_005c5340` (its record `FUN_005c3740`, D:L479219) -> `FUN_005c3360`
 * (D:L479542) -- and mounted that slot is the turret's: its stance row (`TURRET_RETICLE_STANCE_READING`, 'stand') grows
 * the reticle by `TargetDilateUponFire` x (1 + the burst scalar), clamped to `[TargetMin, TargetMax]`
 * (D:L477797-477805), and clamps the knock to its `ReticuleKnockMax` (D:L477784-477795) -- its own `ReticuleKnock` 0 on
 * all three turrets. The pull's count is zeroed while the trigger is up and at its release (`FUN_005c0ae0`
 * D:L476380-476382, D:L476399-476400, via `FUN_005c0fd0` D:L476569). The disc's 'stand' rows (`zweapon.rdr`): PKM TURRET 205 Dilate 8, 15-35, KnockMax 15; LMG TURRET
 * 207 Dilate 4, 6-30, KnockMax 50; MGL FRAG TURRET 230 Dilate 0, 2-6, KnockMax 70. The roll on that cone is P2's
 * (`turretCone`, `TurretPage.round`; the room's bound `room.ts` TURRET_ROUND_LINE_READING).
 */
describe.skipIf(ZWEAPON === null)(`TURRET-CONE P1: the turret reticle blooms per round${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const line: [number, number, number] = [0, 0, -1];
  /** The M4A1-M203 kit on a walking body, mounted while `on.mounted` on the turret `on.weapon`; the turret takes the trigger. */
  const mounted = (weapon: number) => {
    const on = { mounted: false };
    const w = walking({
      hands: hands({
        mounted: () => on.mounted, weapon: () => (on.mounted ? weapon : null), fireMode: () => (on.mounted ? 3 : null),
        trigger: () => on.mounted,
      }),
    });
    const table = readKitTable(ZWEAPON!);
    w.loadouts.setMap(table, null);
    w.firearm.spawnKit('seal', [61, 15, 175, 175, EMPTY_ITEM]);
    w.settle();
    const record = table.turretRecords?.get(weapon) ?? table.turret2Records!.get(weapon)!;
    vi.spyOn(Fire.prototype, 'drawRound').mockReturnValue(null);       // the drawing is not this test's
    return { w, on, record, acc: w.firearm.accuracy };
  };

  it("TURRET-CONE: a mounted round blooms the turret record's reticle -- PKM 15 -> 23 -> 31 -> 35 (TargetMax), LMG 6 -> 10 -> 14 -> 18, MGL stays 2 (Dilate 0); the pull's count restarts on the turret trigger's edges (FUN_005c3360 D:L477797-477805; D:L476380-476382)", () => {
    const want: Record<number, string> = { 205: '205: 15 23 31 35; pull 3', 207: '207: 6 10 14 18; pull 3', 230: '230: 2 2 2 2; pull 3' };
    const got: string[] = [];
    for (const weapon of [205, 207, 230]) {
      const { w, on, record, acc } = mounted(weapon);
      on.mounted = true;
      w.settle();
      w.firearm.trigger(true);
      const sizes = [acc.state().size];
      for (let i = 1; i <= 3; i++) {
        w.firearm.turretRound(record, [5, 20, -2], line, null, i);
        sizes.push(acc.state().size);
      }
      got.push(`${weapon}: ${sizes.join(' ')}; pull ${acc.rounds()}`);
      expect(got.at(-1)).toBe(want[weapon]);
      w.firearm.trigger(false);                                        // the let-go: kit+0x818 zeroed
      expect([weapon, acc.rounds()]).toEqual([weapon, 0]);
      w.firearm.trigger(true);
      w.firearm.turretRound(record, [5, 20, -2], line, null, 4);
      expect([weapon, acc.rounds()]).toEqual([weapon, 1]);             // counted from the new pull
    }
    expect(got).toEqual(Object.values(want));
  });

  it("TURRET-CONE: a rifle knock carried into the mount is clamped to PKM TURRET's ReticuleKnockMax 15 at its first round; LMG TURRET's 50 leaves it, its ReticuleKnock 0 adding none (FUN_005c3360 D:L477755-477760, D:L477784-477795; SWAP_KNOCK_READING)", () => {
    for (const [weapon, clamped] of [[205, true], [207, false]] as const) {
      const { w, on, record, acc } = mounted(weapon);
      for (let i = 0; i < 20 && acc.state().offset[1] > -30; i++) acc.round(0, 'stand');   // the rifle's climb
      expect(acc.state().offset[1]).toBeLessThan(-30);
      on.mounted = true;
      w.frame();                                                       // the turret's record; the knock carried
      const before = acc.state().offset[1];
      expect(before).toBeLessThan(-29);
      w.firearm.turretRound(record, [5, 20, -2], line, null, 1);
      expect([weapon, acc.state().offset[1]]).toEqual([weapon, clamped ? -15 : before]);
      expect([weapon, Math.abs(acc.state().offset[0])]).toEqual([weapon, 0]);
    }
  });

  it("TURRET-CONE: the mounted cone is the turret record's -- the radius size x ty x 0.707 (PKM at rest 0.0252636, after a round 0.0387376), the offsets 0 at 'stand' once a carried knock has returned and after the round (FUN_005bd100 D:L474254-474271)", () => {
    const { w, on, record, acc } = mounted(205);
    for (let i = 0; i < 6; i++) acc.round(0, 'stand');                // a carried knock to return
    on.mounted = true;
    w.settle();
    w.settle();                                                        // two seconds: 42 px/s returns any of it
    const ty = tangentPerPixel().y;
    const rest = w.firearm.accuracy.cone(w.firearm.zoom.state(), w.firearm.zoom.magnification());
    expect(rest.radius).toBeCloseTo(15 * ty * RADIUS_FACTOR, 12);
    expect(rest.radius).toBeCloseTo(0.0252636, 6);
    expect(Math.hypot(rest.offsetX, rest.offsetY)).toBe(0);
    w.firearm.trigger(true);                                           // the turret's pull: kit+0x818 from 0 (no burst scalar)
    w.firearm.turretRound(record, [5, 20, -2], line, null, 1);
    const after = acc.cone(w.firearm.zoom.state(), w.firearm.zoom.magnification());
    expect(after.radius).toBeCloseTo(23 * ty * RADIUS_FACTOR, 12);
    expect(after.radius).toBeCloseTo(0.0387376, 6);
    expect(Math.hypot(after.offsetX, after.offsetY)).toBe(0);
  });

  // TURRET-CONE's review F2 (research 215 s8.2, "The review's folds"): the original's occupant never reaches view 4 or above
  // -- `FUN_005445b0` holds 1 while `+0xeb8` holds the turret (D:L410791-410806, research 84 Z3), and the mount sets 1 from
  // a head view (`FUN_005463c0` D:L412248-412250, X10) -- so the page sends no Scope mounted. The full mounted zoom (a
  // THERMAL turret's 2, Z2) is LATER 97's row.
  it("TURRET-CONE review F2: mounted, the zoom never reaches view 4 or above -- a view of 4+ at the mount drops to 1, d-pad Up holds 1 (Z3, D:L410791-410806), the cycle drops 1 to 0 and lifts 0 to 1", () => {
    const { w, on } = mounted(205);
    w.firearm.stepZoom('in');
    w.firearm.stepZoom('in');
    w.frame();
    expect(w.firearm.zoom.state(), 'unmounted, the rifle zooms past first person (the control)').toBeGreaterThanOrEqual(4);
    on.mounted = true;
    w.frame();
    expect(w.firearm.zoom.state()).toBe(1);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { seen.push(w.firearm.stepZoom('in')); w.frame(); }
    expect(seen).toEqual([1, 1, 1, 1]);
    expect(w.firearm.stepZoom('cycle')).toBe(0);
    expect(w.firearm.stepZoom('cycle')).toBe(1);
    expect(w.firearm.stepZoom('cycle')).toBe(0);
    expect(w.firearm.stepZoom('in')).toBe(1);
  });

  // TURRET-CONE P2 (research 215 s8.2, "For P2 (the review's F2)"): the cone the page rolls a mounted round on is the
  // turret record's (`FUN_005bd100` D:L474254-474271 at its stance row), read as it stands before the round's bloom: the
  // original rolls it at `+0x74` (D:L475601) before the round's step (D:L475604), so `turretCone()` asked before
  // `turretRound` is the rest cone and asked after it the bloomed one -- the caller (`./matchActions` `sendTurretRound`,
  // `TurretPage.round` first) holds the order.
  it("TURRET-CONE P2: turretCone() is the turret record's cone -- PKM 0.0252636 at rest, 0.0387376 after a round; LMG 0.0101054, MGL 0.0033685 at rest -- asked before the round's bloom (D:L475601 before D:L475604)", () => {
    const ty = tangentPerPixel().y;
    for (const [weapon, min, dilate] of [[205, 15, 8], [207, 6, 4], [230, 2, 0]] as const) {
      const { w, on, record } = mounted(weapon);
      on.mounted = true;
      w.settle();
      w.settle();
      const before = w.firearm.turretCone();
      expect([weapon, before.radius]).toEqual([weapon, expect.closeTo(min * ty * RADIUS_FACTOR, 12)]);
      expect([weapon, Math.hypot(before.offsetX, before.offsetY)]).toEqual([weapon, 0]);
      w.firearm.trigger(true);
      w.firearm.turretRound(record, [5, 20, -2], line, null, 1);
      expect([weapon, w.firearm.turretCone().radius]).toEqual([weapon, expect.closeTo((min + dilate) * ty * RADIUS_FACTOR, 12)]);
    }
    expect(15 * ty * RADIUS_FACTOR).toBeCloseTo(0.0252636, 6);
    expect(6 * ty * RADIUS_FACTOR).toBeCloseTo(0.0101054, 6);
    expect(2 * ty * RADIUS_FACTOR).toBeCloseTo(0.0033685, 6);
  });
});

/**
 * LATER 97 (research 84 X10, X11, Z2, Z3; research 215 s8.2): the mounted zoom on the page -- the mount sets 1, or 2 on a
 * THERMAL turret, from a head view (`FUN_005463c0` D:L412247-412255); d-pad Up 0 -> 1 or 2 and holds (0x544688-0x544784);
 * the release takes 2 to 1 (`FUN_00545ee0` D:L412018-412019); view 2 plays the thermal lens (`FUN_001f0750` D:L52995-53020).
 */
describe.skipIf(ZWEAPON === null)(`LATER 97: the mounted zoom${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const seat = (kit: number[]) => {
    const on = { mounted: false, thermal: false };
    const w = walking({
      hands: hands({
        mounted: () => on.mounted, weapon: () => (on.mounted ? 205 : null), fireMode: () => (on.mounted ? 3 : null),
        trigger: () => on.mounted, thermal: () => on.mounted && on.thermal,
      }),
    });
    w.loadouts.setMap(readKitTable(ZWEAPON!), null);
    w.firearm.spawnKit('seal', kit);
    w.settle();
    return { w, on };
  };
  it('the row: mounted on a plain turret, d-pad Up reaches neither 4 nor 5 -- 1 and held; on a THERMAL one 2 and held (Z2, Z3, Z11)', () => {
    for (const thermal of [false, true]) {
      const { w, on } = seat([54, 7, 121, 126, EMPTY_ITEM]);                      // the M4A1: 0 -> 1 -> 5 on foot
      on.mounted = true;
      on.thermal = thermal;
      w.frame();
      const seen: number[] = [];
      for (let i = 0; i < 4; i++) { seen.push(w.firearm.stepZoom('in')); w.frame(); }
      const top = thermal ? 2 : 1;
      expect([thermal, seen, w.firearm.zoom.view()]).toEqual([thermal, [top, top, top, top], 'first']);
      expect([thermal, w.firearm.stepZoom('out')]).toEqual([thermal, 0]);
      expect([thermal, w.firearm.stepZoom('cycle'), w.firearm.stepZoom('cycle')]).toEqual([thermal, top, 0]);
    }
  });
  // LATER 168 (research 84 X10, O5, O6): at a mount from 5 the knock carried into the scope stays -- the set `FUN_005448a0`
  // (D:L410927-411019) and the mount `FUN_005463c0` never call `FUN_005b9020`; only d-pad Down's 4 or 5 -> 1 does
  // (`FUN_00544400` D:L410660, D:L410682) -- and returns at the turret record's `ReticuleKnockReturn` from that frame
  // (`SWAP_KNOCK_READING`: the swap to the turret slot writes no `kit+0x20/+0x24`). Was a pin of the port's clear
  // (`syncMount` -> `leaveScope`, `[0, 0]` at the mount), flipped here.
  it('X10: the M4A1 scoped (5) at the mount -- 1 on a plain turret, 2 on a THERMAL one; out of the scope view; LATER 168: the knock carried into the scope kept, one frame of the turret record\'s return off it', () => {
    for (const thermal of [false, true]) {
      const { w, on } = seat([54, 7, 121, 126, EMPTY_ITEM]);
      w.firearm.stepZoom('in');                                                     // first person
      for (let i = 0; i < 12; i++) w.firearm.accuracy.round(1, 'stand');           // unscoped rounds: the knock climbs
      w.firearm.stepZoom('in');
      w.frame();
      expect(w.firearm.zoom.state(), 'on foot, the scope (the control)').toBe(5);
      const carried = w.firearm.accuracy.reticle(5).offset[1];
      expect(carried, 'the knock carried into the scope, past one frame of its return (the control)').toBeLessThan(-1);
      on.mounted = true;
      on.thermal = thermal;
      w.frame();
      expect([thermal, w.firearm.zoom.state(), w.firearm.zoom.view()]).toEqual([thermal, thermal ? 2 : 1, 'first']);
      const pkm = w.loadouts.tables()?.turretRecords?.get(205);
      expect(pkm, 'PKM TURRET\'s record in the kit table (the control)').toBeDefined();
      const [x, y] = w.firearm.accuracy.reticle(1).offset;
      expect([thermal, x]).toEqual([thermal, 0]);                                  // no round moves the x
      expect(y, 'the knock kept: not cleared at the mount (RED before: 0)').toBeLessThan(-1);
      expect(y).toBeCloseTo(carried + pkm!.stances.stand.knockReturn / 60, 9);     // 42 px/s, one 1/60 frame
    }
  });
  it('third person at the mount stays 0 on both kinds (D:L412248: `+0x200 != 0` only)', () => {
    for (const thermal of [false, true]) {
      const { w, on } = seat([54, 7, 121, 126, EMPTY_ITEM]);
      on.mounted = true;
      on.thermal = thermal;
      w.frame();
      expect([thermal, w.firearm.zoom.state()]).toEqual([thermal, 0]);
    }
  });
  // LATER 164 (research 321 s2.5): view state 2 under set 0 -- a THERMAL turret's -- draws the scope's tube over the cross
  // (`ChangeReticule` D:L69663-69670); 1 on a plain turret, 0, and the release's 1 do not.
  it('LATER 164: on a THERMAL turret in view 2 the reticle is set 0 with the scope\'s tube; Down to 0, a plain turret\'s 1 and the release\'s 1 draw none', () => {
    const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
    const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
    const tubeAt = (thermal: boolean) => {
      const { w, on } = seat([54, 7, 121, 126, EMPTY_ITEM]);
      vi.spyOn(w.walk, 'aim').mockReturnValue([0, 0, -1000]);                // the reticle's frame runs on an aim
      vi.spyOn(w.walk, 'fireAim').mockReturnValue({ eye: [0, 60, 0], far: [0, 60, -1000] });
      vi.spyOn(w.walk, 'feet').mockReturnValue([0, 0, 0]);
      w.firearm.reticle.setBitmaps({
        fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
        sets: {
          'ret_sidearm_01.tif': rgba(64, 64), 'ret_sidearm_02.tif': rgba(32, 32), 'ret_rifle_01.tif': rgba(64, 64), 'ret_rifle_02.tif': rgba(32, 32),
          'ret_scope_01.tif': rgba(128, 128), 'ret_scope_02.tif': rgba(128, 128),
        },
      });
      w.firearm.reticle.setVisible(true);
      const look = () => { w.frame(); w.firearm.reticle.render(PS2); const s = w.firearm.reticle.state(); return [w.firearm.zoom.state(), s.type, s.mode, s.tube]; };
      return { w, on, look, thermal };
    };
    const t = tubeAt(true);
    t.w.firearm.stepZoom('in');                                               // first person on foot
    t.on.mounted = true;
    t.on.thermal = true;
    expect(t.look()).toEqual([2, 0, 'reticle', true]);                        // the mount from a head view: 2 (X10)
    t.w.firearm.stepZoom('out');
    expect(t.look()).toEqual([0, 0, 'reticle', false]);                       // O3: 2 -> 0
    t.w.firearm.stepZoom('in');
    expect(t.look()).toEqual([2, 0, 'reticle', true]);                        // Z2: 0 -> 2
    t.on.mounted = false;
    expect(t.look()[3]).toBe(false);                                          // X11: the release, 2 -> 1
    const p = tubeAt(false);
    p.w.firearm.stepZoom('in');
    p.on.mounted = true;
    expect(p.look()).toEqual([1, 0, 'reticle', false]);                       // a plain turret: 1, no tube
  });
  it('the M4A1-M203 on its round, mounted on a THERMAL turret: Up holds 2 (the turret slot in its own mode: no round drop, FUN_005bd7e0 D:L474373)', () => {
    const { w, on } = seat([61, 15, 175, 175, EMPTY_ITEM]);
    for (let i = 0; i < 6 && w.firearm.fireMode() < 5; i++) w.firearm.switchFireMode();
    expect(w.firearm.fireMode()).toBe(175);
    on.mounted = true;
    on.thermal = true;
    w.frame();
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) { seen.push(w.firearm.stepZoom('in')); w.frame(); }
    expect(seen).toEqual([2, 2, 2]);
  });
  it('X11: the release takes 2 to 1 (FUN_00545ee0 D:L412018-412019) and leaves 1 and 0; view 2 plays the thermal lens and the release lets it go', () => {
    const { w, on } = seat([54, 7, 121, 126, EMPTY_ITEM]);
    on.mounted = true;
    on.thermal = true;
    w.frame();
    w.firearm.stepZoom('in');
    w.frame();
    expect([w.firearm.zoom.state(), w.firearm.lens()]).toEqual([2, 'to_thermal_lens_fx']);
    on.mounted = false;
    w.frame();
    expect([w.firearm.zoom.state(), w.firearm.lens()]).toEqual([1, null]);
    for (const [thermal, from] of [[false, 1], [false, 0], [true, 0]] as const) {
      const s = seat([54, 7, 121, 126, EMPTY_ITEM]);
      if (from === 1) s.w.firearm.stepZoom('in');
      s.on.mounted = true;
      s.on.thermal = thermal;
      s.w.frame();
      s.on.mounted = false;
      s.w.frame();
      expect([thermal, from, s.w.firearm.zoom.state()]).toEqual([thermal, from, from]);
    }
  });
  // LATER 165 (`FUN_003aa020` D:L300960-300993; `FUN_003374c0` D:L235418-235437): in view 2 the held THERMAL turret's
  // PARTS (turret, gun, firepoint) are not drawn on this page -- their opacity at 0 -- and outside it they are given back
  // (`FUN_00543200` from the run, D:L52887-52891; the release `FUN_00545ee0` D:L412021). Each path once a change.
  it('LATER 165: view 2 cuts the held THERMAL turret\'s parts from the draw; Down to 0, the release and a plain turret\'s 1 give them back or never cut', () => {
    const calls: string[] = [];
    const view = { held: () => null, attachToNode: () => null, setNodeCut: (path: string, cut: boolean) => { calls.push(`${cut ? 'cut' : 'back'} ${path}`); return 1; } };
    const root = 'worldmodel/mp62turret/RMG_turret=RMG_turret';
    const parts = { turret: `${root}/turret`, gun: `${root}/turret/gun`, firepoint: `${root}/turret/gun/firepoint` };
    const map = { turrets: [{ id: 1, root, parts, def: { thermal: true } }, { id: 2, root: 'x', parts: { turret: 'x/t', gun: 'x/g', firepoint: 'x/f' }, def: { thermal: false } }] };
    const on = { mounted: false, id: 1 };
    const w = walking({
      view: () => view as unknown as ReturnType<MatchFirearmDeps['view']>, map: () => map as unknown as LoadedMap,
      hands: hands({
        mounted: () => on.mounted, weapon: () => (on.mounted ? 205 : null), fireMode: () => (on.mounted ? 3 : null),
        trigger: () => on.mounted, thermal: () => on.mounted && on.id === 1, turret: () => (on.mounted ? on.id : null),
      } as Partial<FirearmHands>),
    });
    w.loadouts.setMap(readKitTable(ZWEAPON!), null);
    w.firearm.spawnKit('seal', [54, 7, 121, 126, EMPTY_ITEM]);
    w.settle();
    w.firearm.stepZoom('in');                                                 // first person on foot
    on.mounted = true;
    w.frame();
    const all = (how: string) => [parts.turret, parts.gun, parts.firepoint].map((p) => `${how} ${p}`);
    expect(w.firearm.zoom.state()).toBe(2);
    expect(calls.splice(0)).toEqual(all('cut'));                              // RED before: none
    w.frame();
    expect(calls.splice(0)).toEqual([]);                                      // once a change, not every frame
    w.firearm.stepZoom('out');
    w.frame();
    expect(calls.splice(0)).toEqual(all('back'));                             // O3: 2 -> 0
    w.firearm.stepZoom('in');
    w.frame();
    expect(calls.splice(0)).toEqual(all('cut'));                              // Z2: 0 -> 2
    on.mounted = false;
    w.frame();
    expect(calls.splice(0)).toEqual(all('back'));                             // X11: the release
    on.id = 2;                                                                // a plain turret: 1, nothing cut
    w.firearm.stepZoom('in');
    on.mounted = true;
    w.frame();
    expect([w.firearm.zoom.state(), calls.splice(0)]).toEqual([1, []]);
  });
  // LATER 233 (research 84 X1, O5, O6): a pull's second round in a scope drops the view to 1 by the set alone --
  // `FUN_005c5340` D:L479399-479404 calls `FUN_005448a0(camera, 1)`, no `FUN_005b9020` (whose only callers are d-pad
  // Down's, D:L410660, D:L410682) -- so the knock carried into the scope stays; Down from 5 still clears it (O6).
  it('LATER 233: the M4A1\'s second round at 5 drops to 1 and keeps the knock carried into the scope; d-pad Down from 5 clears it (the control)', () => {
    const setGun = vi.spyOn(Fire.prototype, 'setGun');
    const { w } = seat([54, 7, 121, 126, EMPTY_ITEM]);
    const gun = setGun.mock.calls.map((c) => c[0]).filter((g) => g !== null).at(-1)!;
    const acc = w.firearm.accuracy;
    w.firearm.stepZoom('in');                                                 // first person
    for (let i = 0; i < 12; i++) acc.round(1, 'stand');                       // unscoped rounds: the knock climbs
    w.firearm.stepZoom('in');
    w.frame();
    expect(w.firearm.zoom.state(), 'the scope (the control)').toBe(5);
    const carried = acc.state().offset[1];
    expect(carried, 'the knock carried into the scope (the control)').toBeLessThan(-1);
    acc.trigger();                                                            // a new pull: kit+0x818 from 0
    gun.round([0, 0, -1]);
    expect([w.firearm.zoom.state(), acc.rounds()], 'the first round kicks, no drop').toEqual([5, 1]);
    gun.round([0, 0, -1]);
    expect(w.firearm.zoom.state(), 'the second drops to first person (X1)').toBe(1);
    expect(acc.state().offset[1], 'the knock kept (RED before: 0)').toBe(carried);
    w.firearm.stepZoom('in');
    expect(w.firearm.zoom.state(), 'back in the scope (the control)').toBe(5);
    w.firearm.stepZoom('out');
    expect([w.firearm.zoom.state() < 4, acc.state().offset[1]], 'Down from 5 clears it (O6)').toEqual([true, 0]);
  });

  // LATER 236, 237 (research 84 X10): the controller's ruling (2026-10-21) -- page = room, the room's back-dated mount
  // (LATER 124/96), not page = console. Online the console stays on foot until the host's word (`FUN_00546210`
  // D:L412075-412084 -> `FUN_002c79f0`; the mount `FUN_005463c0` only from `FUN_002c7d00` D:L168019), so its Down after the
  // ask clears the knock; the room takes the mount once the ask's command K has run (`room.ts` `resolveMounts`, sent as
  // `steer.after`), runs the commands above K mounted (Scope stripped, `onTurret`; the turret record's knock return,
  // `FUN_005c2670` D:L477300-477320), and the page follows the room: at the take it re-derives its knock from its own at K.
  // HAZARDS: a page/room parity harness takes the page's own sent commands -- LATER 236's Option A was fitted to a
  // hand-built stream that put the Scope bit and K a command off the pages' real order.
  const still236: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0 };
  /**
   * A page and its room on the page's own sent commands: the walk's net tap (`WalkMode.setNetTap`) runs each command the
   * page builds through the room's `ShotCone` -- on foot to K, mounted from K+1 when the room takes the mount (PKM TURRET's
   * record; `onTurret`'s strip: the trigger, the view from the head and the binoculars pass). A page frame in the pages'
   * order (`matchMount.ts` ~:871-876, `main.ts` ~:1585-1591): the lanes -- the take heard by the last frame's net, the
   * action lane's mount ask (`seq: lastSeq()`, `turretPage.ts` ~:720: K is the previous command), the zoom lane's d-pad
   * Down (`matchLanes.ts` ~:61), `viewLanes` (~:75: the Scope bit of this frame's command) -- then `walk.frame` (the send),
   * `gunFrame`, and `fireFrame`'s held trigger after it. The M4A1's knock: twelve rounds of one pull. Frame numbers `i`
   * count from 1 after the set-up; `view`: the page's at the start (0 third person, 1 first, 5 the scope); `take`: the
   * frame the page hears the take (null: the room never takes it); `press`: a frame whose pull starts in its lanes and
   * whose own commands carry the trigger (`NetPage.trigger` before `walk.frame`, LATER 347; was: set in the net's frame,
   * for the next frame's commands); `roundAt`: a held trigger's round after
   * `gunFrame`; `after`: false for a room that sends no `steer.after`.
   */
  const tap236 = (o: {
    view: 0 | 1 | 5; until: number; ask?: number; take?: number | null; down?: number; press?: number; roundAt?: number; after?: boolean;
    /** The room's `after` past K by this many commands (a backlog: `resolveMounts` takes the ask at `p.sim.seq`, K or later). */
    lag?: number;
    /**
     * A1 (the word): the room reserves the ask at K and runs the commands below M on foot; the page hears its reservation
     * at `take` and takes the turret on the next command it sends, M (`lastSeq() + 1`, `turretPage.ts` `takeOwn`), the
     * room's take before M -- no `mountTaken` (nothing to re-derive).
     */
    word?: boolean;
    each?(seq: number, w: ReturnType<typeof walking>, room: ShotCone, K: number | null): void;
  }) => {
    let seq = 0, K: number | null = null, after: number | null = null, mountedFrom = Infinity;
    const on = { mounted: false };
    const setGun = vi.spyOn(Fire.prototype, 'setGun');
    const w = walking({
      hands: hands({
        mounted: () => on.mounted, weapon: () => (on.mounted ? 205 : null), fireMode: () => (on.mounted ? 3 : null),
        trigger: () => on.mounted, thermal: () => false, commandSeq: () => seq,
        mountTaken: () => (on.mounted && after !== null && o.after !== false && !o.word ? { after, now: seq } : null),
      } as Partial<FirearmHands>),
    });
    w.loadouts.setMap(readKitTable(ZWEAPON!), null);
    w.firearm.spawnKit('seal', [54, 7, 121, 126, EMPTY_ITEM]);
    w.settle();
    const table = w.loadouts.tables()!, m4 = table.records.get(54)!, pkm = table.turretRecords!.get(205)!;
    const acc = w.firearm.accuracy, room = new ShotCone(m4);
    const gun = setGun.mock.calls.map((c) => c[0]).filter((g) => g !== null).at(-1)!;
    const mounted: AimMover = { ...still236, turret: 1, coneStance: 'stand' };
    const sent: { seq: number; scope: boolean }[] = [];
    w.walk.setNetTap((c) => {
      seq++;
      const ridden = seq >= mountedFrom;
      const buttons = ridden ? c.buttons & (Button.Trigger | Button.Aim | Button.Binoculars) : c.buttons;
      sent.push({ seq, scope: (c.buttons & Button.Scope) !== 0 });
      if (o.word && seq === mountedFrom) room.setWeapon(pkm);               // A1: the room's take, before M
      room.tick({ ...c, seq, buttons } as Command, ridden ? mounted : still236, seq);
      if (seq === after && o.take != null && (o.lag ?? 0) > 0) room.setWeapon(pkm);   // the room's take, once `after` has run
    });
    // The set-up: first person, the knock of twelve rounds on the last command, then the scope (two frames to settle).
    if (o.view >= 1) w.firearm.stepZoom('in');
    w.firearm.viewLanes(true); w.frame();
    for (let r = 0; r < 12; r++) { acc.round(1, 'stand'); room.round(seq); }
    if (o.view === 5) { w.firearm.stepZoom('in'); w.firearm.viewLanes(true); w.frame(); w.firearm.viewLanes(true); w.frame(); }
    const seen: { i: number; seq: number; page: number; room: number }[] = [];
    for (let i = 1; i <= o.until; i++) {
      if (o.take != null && i === o.take) on.mounted = true;                // heard by the last frame's net
      if (o.word && o.take != null && i === o.take) mountedFrom = seq + 1;    // A1: the take at M, the next command sent
      if (i === o.ask) {                                                    // the action lane: `seq: lastSeq()`
        K = seq;
        after = K + (o.lag ?? 0);                                           // the room's command at the take (`steer.after`)
        if (o.take != null && !o.word) { mountedFrom = after + 1; if (after === K) room.setWeapon(pkm); }   // K has run: taken now
      }
      if (i === o.down) w.firearm.stepZoom('out');                          // the zoom lane: d-pad Down
      if (i === o.press) gun.trigger(true);                                 // the pull starts (its press's own round left out)
      if (i === o.press) w.walk.setTrigger(true);                           // `net.trigger` before the walk (LATER 347): this frame's commands carry it
      w.firearm.viewLanes(true);                                            // the Scope bit of this frame's command
      w.frame();                                                            // walk.frame (the send: the room's tick), gunFrame, ...
      if (i === o.roundAt) { gun.round([0, 0, -1]); room.round(seq); }      // fireFrame's held trigger, after gunFrame
      seen.push({ i, seq, page: acc.state().offset[1], room: room.state().offset[1] });
      o.each?.(seq, w, room, K);
    }
    return { w, room, seen, sent, K: () => K, m4, pkm };
  };
  /** Each command in `from..to` where page and room differ, as text (empty: one knock throughout). */
  const apart236 = (seen: { seq: number; page: number; room: number }[], from: number, to = Infinity): string[] =>
    seen.filter((x) => x.seq >= from && x.seq <= to && Math.abs(x.page - x.room) > 1e-6)
      .map((x) => `${x.seq}: page ${x.page.toFixed(3)}, room ${x.room.toFixed(3)}`);
  const seqAt = (r: ReturnType<typeof tap236>, i: number): number => r.seen.find((x) => x.i === i)!.seq;

  it('LATER 236 (the review of Option A): the d-pad Down\'s own command carries no Scope -- the lanes set the view before the walk builds it', () => {
    const r = tap236({ view: 5, down: 3, until: 4 });
    const down = seqAt(r, 3);
    expect(r.sent.filter((c) => c.seq >= down - 1).map((c) => [c.seq - down, c.scope])).toEqual([[-1, true], [0, false], [1, false]]);
  });

  it('LATER 236: a Down, then the mount asked 0, 1 or 3 commands after it (K the Down\'s command or later), the take heard 5 frames on -- page = room at the take and on to K+49 (RED before the fix at 0: K\'s ring entry the uncleared knock, the room cleared on K)', () => {
    const got: string[] = [];
    for (const d of [0, 1, 3]) {
      const down = 3, ask = down + 1 + d, take = ask + 5;
      const r = tap236({ view: 5, down, ask, take, until: ask + 49 });
      const K = r.K()!, at = seqAt(r, take);
      expect([d, K - seqAt(r, down)], 'K: the command before the ask\'s frame').toEqual([d, d]);
      expect(r.seen.find((x) => x.seq === at)!.room, `d = ${d}: the room cleared on the Down's own command`).toBe(0);
      const apart = apart236(r.seen, at, K + 49);
      got.push(`d = ${d}: ${apart.length ? apart[0] : 'one knock'}`);
    }
    expect(got).toEqual(['d = 0: one knock', 'd = 1: one knock', 'd = 3: one knock']);
  });

  it('LATER 236: the mount asked before a Down (the ask 2 frames ahead), the take 5 frames after the ask -- page = room at the take and on to K+49', () => {
    const ask = 3, r = tap236({ view: 5, ask, down: ask + 2, take: ask + 5, until: ask + 49 });
    const K = r.K()!, at = seqAt(r, ask + 5);
    expect(r.seen.find((x) => x.seq === at)!.room, 'the room, mounted from K+1, never saw the Down').toBeLessThan(-1);
    expect(apart236(r.seen, at, K + 49)).toEqual([]);
  });

  it('LATER 236: the ask and the Down in one frame (the action lane first: K the command before) -- page = room at the take and on to K+49', () => {
    const f = 3, r = tap236({ view: 5, ask: f, down: f, take: f + 5, until: f + 49 });
    const K = r.K()!, at = seqAt(r, f + 5);
    expect(K, 'K: the previous command').toBe(seqAt(r, f) - 1);
    expect(r.seen.find((x) => x.seq === at)!.room, 'the Down\'s command mounted: the room kept the knock').toBeLessThan(-1);
    expect(apart236(r.seen, at, K + 49)).toEqual([]);
  });

  it('LATER 236: a Down with the ask never taken, and with no ask at all (O6) -- page and room both cleared on the Down\'s own command, page = room throughout', () => {
    for (const ask of [4, undefined]) {
      const r = tap236({ view: 5, down: 3, ask, take: null, until: 12 });
      const down = seqAt(r, 3);
      expect([ask, r.seen.find((x) => x.seq === down)!.room], 'the room cleared on the Down\'s own command').toEqual([ask, 0]);
      expect([ask, apart236(r.seen, 1)]).toEqual([ask, []]);
    }
  });

  it('LATER 237: the take heard N commands after the ask (N = 0, 1, 5, 15), no Down, at every view -- third person, first person, the scope -- page and room at one knock at the take and on to K+49', () => {
    const got: string[] = [];
    for (const view of [0, 1, 5] as const) {
      for (const n of [0, 1, 5, 15]) {
        const ask = 2, take = ask + 1 + n, r = tap236({ view, ask, take, until: ask + 49 });
        const K = r.K()!, at = seqAt(r, take);
        expect(r.seen.find((x) => x.seq === at)!.room, `view ${view}, N = ${n}: the room's knock kept (the control)`).toBeLessThan(-1);
        const apart = apart236(r.seen, at, K + 49);
        got.push(`view ${view}, N = ${n}: ${apart.length ? apart[0] : 'one knock'}`);
      }
    }
    expect(got).toEqual([0, 1, 5].flatMap((v) => [0, 1, 5, 15].map((n) => `view ${v}, N = ${n}: one knock`)));
  });

  it('LATER 236 (A=B): a Down, the ask in the next frame, the take 5 frames on -- the page\'s mounted rounds at -0.9 and +0.9 of its own cone pass the room\'s checkLine on K+17..K+49 (PKM TURRET)', () => {
    const t = tangentPerPixel(), refused: string[] = [];
    const lineOf = (): [number, number, number] => [0, 0, -1];
    const down = 3, ask = 4, checked: number[] = [];
    tap236({
      view: 5, down, ask, take: ask + 5, until: ask + 49,
      each: (s, w, room, K) => {
        if (K === null || s < K + 17 || s > K + 49) return;                 // the mount clip refuses mounted fire (LATER 191)
        checked.push(s);
        const st = w.firearm.accuracy.state();
        const c = { offsetX: st.offset[0] * t.x, offsetY: -st.offset[1] * t.y, radius: st.size * t.y * RADIUS_FACTOR };
        for (const k of [-0.9, 0.9]) {
          const v = room.checkLine(s, perturb(lineOf(), { offsetX: c.offsetX, offsetY: c.offsetY + k * c.radius, radius: 0 }), lineOf);
          if (v !== null) refused.push(`K+${s - K} at ${k}: ${v}`);
        }
      },
    });
    expect(checked.length, 'K+17..K+49 all checked (the control)').toBe(33);
    expect(refused).toEqual([]);
  });

  // LATER 240: a held trigger's round in the frame of a scope Down, on the page's own commands. The Down's command carries
  // no Scope, so the room judges the round unscoped as the page rolls it at view 1; written to assert agreement -- the run
  // says whether 240 was the hand-built stream's artefact (it passes) or a real difference (its failure gives the values).
  it('LATER 240: a d-pad Down and a held trigger\'s round in one frame, no mount asked, on the page\'s own commands -- page and room at one knock from the Down\'s command on', () => {
    const r = tap236({ view: 5, press: 2, down: 3, roundAt: 3, until: 12 });
    const down = seqAt(r, 3);
    expect(r.sent.find((c) => c.seq === down)!.scope, 'the Down\'s command carries no Scope').toBe(false);
    expect(apart236(r.seen, down)).toEqual([]);
  });

  // The review's finding 2: the room sends `after: p.sim.seq` once `p.sim.seq >= ask.seq` (`room.ts` `resolveMounts`), so
  // under a backlog `after` is past K -- the room runs K+1..after on foot. The page's re-derive reads that `after`; written
  // with no expected RED, the run tells.
  it('LATER 236/237 (the review\'s finding 2): the room takes the ask at after = K + 2 (a backlog), a Down on K+1 between the ask and that take -- page = room from the take through after+49', () => {
    const ask = 3, r = tap236({ view: 5, ask, lag: 2, down: ask, take: ask + 6, until: ask + 55 });
    const K = r.K()!, at = seqAt(r, ask + 6), after = K + 2;
    expect(seqAt(r, ask), 'the Down\'s command is K+1').toBe(K + 1);
    expect(apart236(r.seen, at, after + 49)).toEqual([]);
  });

  it('LATER 236 (what is left, for LATER 239 -- NOT PARITY, a pin): a room that sends no `steer.after` -- no re-derive; a Down after K leaves the page cleared and the room\'s knock kept', () => {
    const ask = 3, r = tap236({ view: 5, ask, down: ask + 2, take: ask + 5, until: ask + 8, after: false });
    const last = r.seen[r.seen.length - 1]!;
    expect([last.page, last.room < -1]).toEqual([0, true]);
  });

  // A1 (LATER 239; research 215 s8.6 "A1"): pin (ii) above flipped on the worded path. The room reserves the ask at K and
  // runs the commands below the page's take M on foot, as the original's asker runs them before the host's word
  // (`FUN_0061e6d0` D:L529427-529433 -> `FUN_002c7d00` D:L168019), so a Down in the trip clears both; the page names M and
  // mounts from it, the room takes before it, and nothing is re-derived (`mountTaken` null).
  it('A1: on the word, a Down in the trip (after K, before the take) clears page and room alike; page = room from the take through K+49, with no re-derive', () => {
    const ask = 3, down = ask + 2, take = ask + 5, r = tap236({ view: 5, ask, down, take, until: ask + 49, word: true });
    const K = r.K()!, d = seqAt(r, down), M = seqAt(r, take);
    expect([d > K, M > d], 'the Down inside the trip, before M').toEqual([true, true]);
    expect(r.seen.find((x) => x.seq === d)!.room, "the room ran the Down's command on foot").toBe(0);
    expect(apart236(r.seen, 1)).toEqual([]);
  });

  it('A1: on the word with no Down (the control), page and room at one knock from the take through K+49 at every view', () => {
    const got: string[] = [];
    for (const view of [0, 1, 5] as const) {
      const ask = 2, r = tap236({ view, ask, take: ask + 6, until: ask + 49, word: true });
      const at = seqAt(r, ask + 6);
      expect(r.seen.find((x) => x.seq === at)!.room, `view ${view}: the room's knock kept`).toBeLessThan(-1);
      const apart = apart236(r.seen, 1);
      got.push(`view ${view}: ${apart.length ? apart[0] : 'one knock'}`);
    }
    expect(got).toEqual(['view 0: one knock', 'view 1: one knock', 'view 5: one knock']);
  });
});

/**
 * ARMING-GREY (issue #300; research 94 row 16, research 215 s8.2): the colour pass greys the arms only when the record of
 * the SELECTED slot (`FUN_005c3780` D:L477826-477834: `FUN_005c6600` on `+0x824`, which moves to the round's slot for a
 * carrier, `FUN_003c5d80`, in a mode above 3) is of class 0x91 (`FUN_003c5ca0` D:L317227-317235, the rocket launchers
 * 145-150) or 0xb9 (`FUN_003c5c70` D:L317215-317223, their rockets 185-189), and the aimed point lies inside that record's
 * `ArmingDistance` (`FUN_003d2030` D:L324588-324593, `+0x68`): `FUN_00215c10` D:L70222-70258, the classes `FUN_003d1a60`
 * D:L324331-324352. An M203 or GL round is class 0xab (171-184): never grey, its 10 m notwithstanding. A raised LAW or
 * RPG-7 rides its round mode (spawned on its first round, research 94 s C4.2), so its selected record is its rocket's --
 * LAW HEAT 185, RPG 186, class 0xb9, `ArmingDistance` 10 m (100 units; the launchers' own records have none).
 */
describe.skipIf(ZWEAPON === null)(`ARMING-GREY: the arming grey only for a rocket launcher's selected record (issue #300)${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const aimedAt = (metres: number) => vi.spyOn(RangeFinder.prototype, 'measure').mockReturnValue(metres);
  const armed = (kit: number[], on: { launcher: number | null } = { launcher: null }) => {
    const w = walking({
      hands: hands({ launcherUp: () => on.launcher !== null, launcher: () => on.launcher } as Partial<FirearmHands>),
    });
    const table = readKitTable(ZWEAPON!);
    w.loadouts.setMap(table, null);
    w.firearm.spawnKit('seal', kit);
    w.settle();
    return { w, table };
  };
  const roundMode = (w: ReturnType<typeof armed>['w'], round: number): void => {
    for (let i = 0; i < 6 && w.firearm.fireMode() !== round; i++) w.firearm.switchFireMode();
    expect(w.firearm.fireMode()).toBe(round);
  };

  it('ARMING-GREY: an M4A1-M203 in a round mode does not grey inside its round\'s arming distance (M203 FRAG 175, class 0xab: FUN_003c5ca0 and FUN_003c5c70 both refuse it)', () => {
    const { w, table } = armed([61, 15, 175, 175, EMPTY_ITEM]);
    expect(table.rounds.get(175)?.record.armingDistance).toBe(100);   // it has one: 10 m
    roundMode(w, 175);
    aimedAt(5);                                                        // 50 units: inside it
    w.frame();
    expect(w.firearm.reticle.state().colour).toBe('rest');
  });

  it('ARMING-GREY: nor the M79 on its GL FRAG round (179, class 0xab)', () => {
    const { w, table } = armed([143, 15, 179, 179, EMPTY_ITEM]);
    expect(table.rounds.get(179)?.record.armingDistance).toBe(100);
    roundMode(w, 179);
    aimedAt(5);
    w.frame();
    expect(w.firearm.reticle.state().colour).toBe('rest');
  });

  it('ARMING-GREY: a raised LAW and RPG-7 grey inside their rocket\'s 10 m (LAW HEAT 185, RPG 186: class 0xb9, +0x68 100 units) and not at or past it', () => {
    for (const [launcher, round] of [[145, 185], [146, 186]] as const) {
      const on = { launcher: null as number | null };
      const { w, table } = armed([61, 15, launcher, round, EMPTY_ITEM], on);
      expect([launcher, table.rounds.get(round)?.record.armingDistance]).toEqual([launcher, 100]);
      on.launcher = launcher;
      const colours: string[] = [];
      for (const metres of [5, 9.9, 10, 15]) {
        vi.restoreAllMocks();
        aimedAt(metres);
        w.frame();
        colours.push(`${metres}: ${w.firearm.reticle.state().colour}`);
      }
      expect([launcher, colours]).toEqual([launcher, ['5: range', '9.9: range', '10: rest', '15: rest']]);
      on.launcher = null;                                              // lowered: the rifle's record, no grey
      vi.restoreAllMocks();
      aimedAt(5);
      w.frame();
      expect([launcher, w.firearm.reticle.state().colour]).toEqual([launcher, 'rest']);
    }
  });
});


it('feeds the shared C4 fuse HUD after switching to a firearm, and clears at disposal', () => {
  let fuse: { fill: number } | null = { fill: 0.5 };
  const r = rig({ hands: hands({ c4Fuse: () => fuse, itemUp: () => false }) });
  r.firearm.feedHud(false);
  expect(r.hud.state().model.c4FuseBar).toEqual({ fill: 0.5 });
  fuse = null;
  r.firearm.feedHud(false);
  expect(r.hud.state().model.c4FuseBar).toBeNull();
  fuse = { fill: 1 };
  r.firearm.feedHud(false);
  r.firearm.dispose();
  expect(r.hud.state().model.c4FuseBar).toBeNull();
});

describe('CTL-2: the pad\'s motors (research 302 section 10; RUMBLE_OUTPUT_ADAPTATION)', () => {
  /** A connected pad whose actuator records what it is asked to play. */
  const pad = () => {
    const played: { strong: number; weak: number }[] = [];
    const actuator = {
      playEffect: (_t: string, p: { strongMagnitude: number; weakMagnitude: number }) => { played.push({ strong: p.strongMagnitude, weak: p.weakMagnitude }); return Promise.resolve(); },
      reset: () => Promise.resolve(),
    };
    if (!('getGamepads' in navigator)) Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true, writable: true });
    vi.spyOn(navigator, 'getGamepads').mockReturnValue([{ connected: true, vibrationActuator: actuator } as unknown as Gamepad]);
    return played;
  };

  it('mounting never asks VIBRATION or the menu (both pages declare the START menu after the firearm: a call there is a TDZ error)', () => {
    const asked: number[] = [];
    const tdz = (): never => { asked.push(1); throw new ReferenceError('startMenu is not initialized'); };
    const { firearm } = rig({ vibration: tdz, menuOpen: tdz });
    expect(asked).toEqual([]);
    expect(() => firearm.gunFrame(0.016, false)).toThrow(ReferenceError);   // the menu is asked at the frame, never before
  });

  it('the review\'s F2: the START menu\'s open stops the motors (FUN_00204a40 -> FUN_00592ac0); a death\'s rumble under it plays nothing', () => {
    const played = pad();
    let open = false;
    const { firearm } = rig({ vibration: () => true, menuOpen: () => open });
    firearm.died();
    open = true;                                                      // the menu opens before the death's first frame
    firearm.gunFrame(1 / 30, false);
    expect(played).toEqual([]);
  });

  it('the review\'s F3: the hands\' fire step (a throw, a placing, a rocket) rumbles by the record it is handed', () => {
    const played = pad();
    const { firearm } = rig({ vibration: () => true });
    firearm.shotRumble({ small: Math.fround(0.04), large: { time: Math.fround(0.18), power: 175 } });
    firearm.gunFrame(1 / 30, false);
    expect(played[0]).toEqual({ strong: 175 / 255, weak: 1 });
  });

  it("j5t3o2iU (the review's F1b): the own body hurt and alive (`hurt`) plays FUN_00597b00's motors -- 175 large with the small on, then the small off; VIBRATION OFF nothing", () => {
    const played = pad();
    const { firearm } = rig({ vibration: () => true });
    firearm.hurt();
    for (let i = 0; i < 8; i++) firearm.gunFrame(1 / 30, false);
    expect(played[0]).toEqual({ strong: 175 / 255, weak: 1 });       // 0.04 s: the small motor's two frames
    expect(played).toContainEqual({ strong: 175 / 255, weak: 0 });   // 0.18 s: the large motor on alone after them
    played.length = 0;
    const off = rig({ vibration: () => false }).firearm;
    off.hurt();
    off.gunFrame(1 / 30, false);
    expect(played).toEqual([]);
  });

  it("the review's N1: in a round mode the shot rumbles by the round's record (FUN_005c6600 moves the slot), else by the rifle's", () => {
    const played = pad();
    const { firearm } = rig({ vibration: () => true });
    const grenade = { small: Math.fround(0.04), large: { time: Math.fround(0.18), power: 175 } };
    vi.spyOn(KitRounds.prototype, 'round').mockImplementation((id: number) => (id === 171 ? { record: { rumble: grenade } } as never : null));
    const gun = (firearm.fire as unknown as { gun: { round(d: [number, number, number]): unknown } }).gun;
    const mode = vi.spyOn(firearm.fire, 'roundMode').mockReturnValue({ id: 171, name: 'M203 HE', armingDistance: 0, icon: null });
    gun.round([0, 0, -1]);
    firearm.gunFrame(1 / 30, false);
    expect(played.at(-1)).toEqual({ strong: 175 / 255, weak: 1 });   // the round's, not the rifle's
    for (let i = 0; i < 12; i++) firearm.gunFrame(1 / 30, false);     // its 0.18 s runs out
    mode.mockReturnValue(null);
    const rifle = firearm.record('rifle').rumble!.large!.power;
    expect(rifle).not.toBe(175);
    gun.round([0, 0, -1]);
    firearm.gunFrame(1 / 30, false);
    expect(played.at(-1)).toEqual({ strong: rifle / 255, weak: 1 });   // no round mode: the rifle's own
  });

  it("the review's N3: the scope's pulse does not tick while the START menu is open, and does again once it closes", () => {
    let open = true;
    const { firearm, walk } = rig({ vibration: () => true, menuOpen: () => open });
    vi.spyOn(firearm.zoom, 'state').mockReturnValue(5);                 // a scope
    vi.spyOn(walk, 'snapshot').mockReturnValue({ stance: 'stand', vx: 0, vy: 0, vz: 0, airborne: false } as never);
    const tick = vi.spyOn(ScopePulse.prototype, 'tick');
    for (let i = 0; i < 30; i++) firearm.gunFrame(1 / 30, true);
    expect(tick).not.toHaveBeenCalled();
    open = false;
    firearm.gunFrame(1 / 30, true);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('a frame with no event asks VIBRATION nothing', () => {
    const asked: number[] = [];
    const { firearm } = rig({ vibration: () => { asked.push(1); throw new ReferenceError('startMenu is not initialized'); } });
    expect(asked).toEqual([]);
    expect(() => firearm.gunFrame(0.016, false)).not.toThrow();              // a frame with no event asks nothing
    expect(() => firearm.died()).toThrow(ReferenceError);                    // asked by the setter, at the event
  });

  it('the death (FUN_00547af0): the large motor at 175 and the small one, on the next frame -- VIBRATION on', () => {
    const played = pad();
    const { firearm } = rig({ vibration: () => true });
    firearm.died();
    firearm.gunFrame(1 / 30, false);
    expect(played[0]).toEqual({ strong: 175 / 255, weak: 1 });
  });

  it('a turret round (FUN_005c3360) rumbles by its record\'s Rumble_Modifiers; VIBRATION OFF plays nothing', () => {
    const played = pad();
    const on = rig({ vibration: () => true }).firearm;
    const record = { ...on.record('rifle'), id: 205, name: 'PKM TURRET', maximumRange: 800, piercing: 4.5, rumble: { small: null, large: { time: 0.2, power: 200 } } };
    on.turretRound(record, [7, 8, 9], [0, 0, -1], null, 1);
    on.gunFrame(1 / 30, false);
    expect(played.at(-1)).toEqual({ strong: 200 / 255, weak: 0 });
    played.length = 0;
    const off = rig({ vibration: () => false }).firearm;
    off.died();
    off.turretRound(record, [7, 8, 9], [0, 0, -1], null, 1);
    off.gunFrame(1 / 30, false);
    expect(played).toEqual([]);
  });
});

/**
 * P4 (the online-parity sweep's TB-10 + WK-1; the network's bookkeeping, no original): a round mode's round goes to the
 * room as a throw of the round with its launch's journal id (`Fire.launch`'s `shot`, page-local), so the room's `stale`
 * for it gives the round back on the firearm (`./matchThrow` `staleThrow` -> `Fire.refundRound`). The send's source pin:
 * the subscriber's kit holds no round without the disc's tables, so the launch is not driven here (`fire.test.ts` holds
 * the journal, `matchThrow.test.ts` the refund, `netPageConnect.test.ts` the journal's leg on NetPage).
 */
describe("P4: a round mode's round is sent with its launch's shot", () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it("RED: the launch subscriber's throwEvent passes `e.shot` (today: no shot, so a stale never reaches the firearm's journal)", () => {
    expect(src('matchFirearm.ts')).toMatch(/throwEvent\(round\.record\.name, e\.from, e\.velocity, undefined, undefined, undefined, e\.shot\)/);
  });
});

/**
 * BLOOM-SWAP (research 321 section 3.4; `bloomSwap.test.ts` pins the capture's frames on `Accuracy`): the page's
 * `gunFrame` names the hand's item to the bloom each frame -- a grenade up (`FirearmHands.handItem`) ticks the kit's one
 * size with that item's own `Reticule_Modifiers` (`FUN_005c2670` on the selected slot `+0x824`, D:L477280), its range 0
 * to 0 (D:L477282-477288), so it closes at the grenade's 60 a second to 0; put away, the rifle carries what it left.
 */
describe('BLOOM-SWAP: a grenade up closes the bloom on the page (gunFrame -> Accuracy.setItem)', () => {
  const zweapon = fixture('RUN/ZWEAPON.ZAR');
  it.skipIf(zweapon === null)(`the M4A1 SD bloomed, the Mk141 up: 60 a second to 0; put away, the rifle's 1 standing still${zweapon ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    let up = false;
    const w = walking({ network: () => true, hands: hands({ itemUp: () => up, handItem: () => (up ? 123 : null) }) });
    w.loadouts.setMap(readKitTable(zweapon!), null);
    w.firearm.spawnKit('seal', [62, 15, 123, 126, EMPTY_ITEM]);
    w.settle();
    const acc = w.firearm.accuracy;
    for (let i = 0; i < 4; i++) acc.round(0, 'stand');                // 1 + 4 x 7, clamped to the SD's 26
    w.frame();
    const before = acc.state().size;
    expect(before).toBeCloseTo(26 - 50 / 60, 6);                     // the rifle's own close, 50 a second
    up = true;
    w.frame();
    expect(before - acc.state().size).toBeCloseTo(60 / 60, 6);        // the Mk141's 60 a second, not the rifle's 50
    w.until(() => acc.state().size <= 0, 120);
    w.frame();
    expect(acc.state().size).toBe(0);                                 // its floor 0, under the rifle's TargetMin 1
    up = false;
    w.frame();
    expect(acc.state().size).toBe(1);                                 // the rifle's tick lifts the carried 0 to its 1
  });
});

/**
 * LATER 644 (research 81 "A round passing"; simulation track, reading, pending review): the original takes a
 * projectile's segment (`+0x48` -> `+0x54`) against the body's place (`+0x1c`, the feet) of each controller whose vtable
 * slot +0x44 is `FUN_00598000` -- the player's own `CSealCtrl` among them -- and plays `.BUL_PASSING` at the segment's
 * nearest point when it comes within 20 (`FUN_00598000` D:L454629-454637). A round this console's player fired is
 * flagged (`+4` bit 3 = the shooter is `FUN_002b3580`'s body, `FUN_005c5340` D:L479363-479364) and skipped
 * (D:L454627): the player's own rounds never pass him. No tracer test: a tracerless round passes as a tracer
 * does. The page: another's round (`roundEffects`) against the page's feet, on its whole path -- to `tracerTo`, the
 * round's end past a body (P12b), else `to`; never the page's own (`roundImpact`, `turretRound`). The sound door is a
 * stand-in that plays through the rule itself (`passingSound`, `GameAudio.onRoundPast`'s).
 */
describe('LATER 644: another player\'s round passing the page\'s player plays .BUL_PASSING', () => {
  const passing = () => {
    const played: { sound: string; at: [number, number, number] }[] = [];
    const sound = {
      fireEvent: () => {}, effect: () => {}, goggles: () => {}, roundFired: () => {},
      roundPast: (from: readonly number[], to: readonly number[], actor: readonly number[]) => {
        const hit = passingSound(actor, from, to);
        if (hit) played.push(hit);
      },
    };
    const r = rig({ sound });
    vi.spyOn(r.walk, 'feet').mockReturnValue([0, 0, 0]);
    return { ...r, played };
  };
  const round = (from: [number, number, number], to: [number, number, number], more: object = {}) =>
    ({ type: 'round', weapon: { name: 'M4A1' }, from, to, hit: false, rounds: 0, normal: null, material: null, ...more }) as Extract<FireEvent, { type: 'round' }>;

  it('LATER 644: another player round whose path comes within 20 of the feet plays .BUL_PASSING once, at its nearest point', () => {
    const { firearm, played } = passing();
    firearm.roundEffects(round([-300, 15, 0], [300, 15, 0]), 4);              // over the feet at 15 (eye height 15.4)
    expect(played).toEqual([{ sound: '.BUL_PASSING', at: [0, 15, 0] }]);
  });

  it('LATER 644: a path that stays 20 or more from the feet plays nothing', () => {
    const { firearm, played } = passing();
    firearm.roundEffects(round([-300, 15, 30], [300, 15, 30]), 4);            // sqrt(15^2 + 30^2) = 33.5
    firearm.roundEffects(round([-300, 0, 20], [300, 0, 20]), 4);              // exactly 20: `fStack_4 < 20.0` is false
    expect(played).toEqual([]);
  });

  it('LATER 644: the page\'s own round plays nothing: its impact from the room (`roundImpact`) and its turret round (`turretRound`)', () => {
    const { firearm, played } = passing();
    firearm.roundImpact(round([-300, 15, 0], [300, 15, 0]));
    vi.spyOn(firearm.fire, 'drawRound').mockReturnValue({ to: [300, 15, 0], hit: null, through: [], tracer: false });
    const record = { ...firearm.record('rifle'), id: 205, name: 'PKM TURRET', maximumRange: 800, piercing: 4.5 };
    firearm.turretRound(record, [-300, 15, 0], [1, 0, 0], null, 1);
    expect(played).toEqual([]);
  });

  it('LATER 644: the path runs to tracerTo, the round end past its first body, so a round stopping short of the feet at the body passes them on its way to the wall', () => {
    const { firearm, played } = passing();
    const body: [number, number, number] = [-100, 15, 0], wall: [number, number, number] = [300, 15, 0];
    firearm.roundEffects(round([-300, 15, 0], body), 4);                     // to the body only: 100 from the feet
    expect(played).toEqual([]);
    firearm.roundEffects(round([-300, 15, 0], body, { tracerTo: wall }), 4);   // on to the wall, past the feet
    expect(played).toEqual([{ sound: '.BUL_PASSING', at: [0, 15, 0] }]);
  });

  // The review's F1: `FUN_00308b00` answers 0 at either end of the segment (D:L207298-207316), so nothing plays for feet
  // behind the shooter's muzzle or past the round's end, however close.
  it('LATER 644: feet 10 behind the muzzle, or within 20 past the round end, hear nothing', () => {
    const { firearm, played } = passing();
    firearm.roundEffects(round([5, 15, 0], [300, 15, 0]), 4);                // the muzzle 15.8 from the feet
    firearm.roundEffects(round([-300, 15, 0], [-100, 15, 0], { tracerTo: [-5, 15, 0] }), 4);   // its end 15.8 from them
    expect(played).toEqual([]);
  });

  it('LATER 644: not walking (no feet), nothing', () => {
    const { firearm, walk, played } = passing();
    vi.spyOn(walk, 'feet').mockReturnValue(null);
    firearm.roundEffects(round([-300, 15, 0], [300, 15, 0]), 4);
    expect(played).toEqual([]);
  });
});

describe("SEGMENT-BODY part 4 (fresh review 1's F1): the page's mover casts the weapon line its kit holds", () => {
  // `FUN_0054e8f0` takes the length from the model of the kit's entry the hand byte picks (D:L416869-416870,
  // D:L416892-416902): the kit's two firearm models (`slotModel`) go to the walk at a spawn and at a pickup, and every
  // mover the walk makes (a respawn's) carries them.
  const heldOf = (walk: WalkMode): unknown => (walk as unknown as { walker: { heldModels: unknown } | null }).walker?.heldModels;
  it('spawnKit hands the walk the kit\'s models; a respawn\'s new mover holds them; a pickup\'s kit replaces them', () => {
    const { firearm, walk } = rig();
    firearm.spawnKit('seal', [254, 16, 123, 122, 254]);          // no primary (FULL_SLOT), a sidearm
    walk.setGround(FLOOR, null);
    expect(walk.respawn([0, 0, 0], 0)).toBe(true);
    expect(heldOf(walk)).toEqual({ rifle: null, pistol: 'a_mark23' });
    firearm.spawnKit('seal');                                    // the baked kit: the M4A1 SD and the Mark 23
    expect(heldOf(walk)).toEqual({ rifle: 'm4Acarbine_sd', pistol: 'a_mark23' });
    firearm.takeKit([254, HELD_SIDEARM.id, 121, 255, 255], null, [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [12, 0, 0, 0, 0, 0, 0, 0, 0, 0]]);
    expect(heldOf(walk)).toEqual({ rifle: null, pistol: 'a_mark23' });
  });
});
