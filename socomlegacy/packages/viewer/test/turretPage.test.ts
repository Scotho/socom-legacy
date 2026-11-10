// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { ACTION_ICONS, ammoLines } from '../src/hud';
import { loadMap } from '../src/loadMap';
import { under } from '../src/mapMeta';
import type { PerspectiveCamera } from 'three';
import { readFileSync } from 'node:fs';
import type { CollisionOwner, GridParams, TurretPlacement, WorldPoly } from '@s2u/scene';
import {
  clampAim, firepointFrame, gunDelta, gunLine, holdPlace, holdStep, mountRootVelocity, mountShape, muzzleAt, seatTurn, TURRET_CLIPS, TURRET_HELD_WEAPON_READING, TURRET_HOLD_CLIP,
  TURRET_HOLD_OFFSET_READING, TURRET_RELEASE_WAIT_TICKS, type MountShape,
} from '../src/net/emplacement';
import { TURRET_OWN_RELOAD_TELL_ADAPTATION } from '../src/turretPage';
import { groundGrid, packGround, probeLiftOf, TICK, Walker } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import type { Command } from '../src/net/protocol';
import { WalkMode, type WalkCamera } from '../src/walk';
import { Play } from '../src/play';
import type { PlaySnapshot } from '../src/mover';
import { remoteKit } from '../src/remotePlayers';
import { TICK_HZ, type ClientEvent, type ServerEvent } from '../src/net/protocol';
import {
  TURRET_AMMO_HUD_READING, TURRET_HOLD_FACING_READING, TURRET_MOUNT_ASK_WINDOW_READING, TURRET_SOUNDS, TurretPage, turretBox, turretHoldKey, turretMagsBox, turretWeapon, type TurretPageDeps,
} from '../src/turretPage';
import { buildGrid, parseMotionZar, readKitTable } from '@s2u/scene';
import { Zar } from '@s2u/archive';
import { motionTableFromArchive } from '../src/motionTable';
import { shortTurn } from '../src/yaw';
import { MAX_PITCH_RATE, MAX_YAW_RATE } from '../src/look';
import { PlayerCamera } from '../src/playerCamera';
import { simMapFromBytes } from '../src/simMap';
import { perturb, tangentPerPixel, RADIUS_FACTOR, type Cone } from '../src/accuracy';
import { coneCoords } from '../src/net/shotCone';
import { Traversal } from '../src/traversal';

/**
 * MAP-10b on the page (`./turretPage`; research 215 s3-s4): Crossroads' `mp72_turret01` -- the prompt in reach and while
 * mounted, the press sent to the room (never taken here), the room's `turret` event followed (the local lock, the look
 * clamped as the room clamps it, the HUD's ammunition), and the gun's drawn parts -- joined into the page's scene from
 * the GEO libraries (research 215 s3, route (a)) -- turned by the occupant's yaw and pitch through `moveNode`.
 */

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP72 = fixture('RUN/MP72.ZDB'), READERC = fixture('RUN/READERC.ZAR'), ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const READY = MP72 !== null && READERC !== null && ZWEAPON !== null;
type V3 = [number, number, number];

describe.skipIf(!READY)(`Crossroads' turrets on the page (MAP-10b)${READY ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('the mount prompt shows action_mount_turret.tif in reach and action_dismount_turret.tif while mounted; the gun part turns with the occupant\'s yaw and pitch through moveNode', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    const t = map.turrets!.find((x) => x.name === 'mp72_turret01')!;
    // PAR-55: the box's turret icons are decoded with the map's HUD (`arsenalIcons`: the turrets' `IconTextureName`, in HUDW_TXR).
    // PAR-57: and MGL FRAG TURRET's (`Turret_MGL.tif`, the arsenal's `turret2`), in the same HUDW_TXR (research 215 s8).
    expect(Object.keys(map.hud ?? {})).toEqual(expect.arrayContaining(['turret_rmg.tif', 'turret_lmg.tif', 'turret_mgl.tif']));
    // Route (a): the gun's parts are drawn props at the placement's paths (the TURR_GEO prototype, TURR_MDL's chunks).
    const drawn = map.props.flatMap((p) => (p.paths ?? []).filter((path) => under(path, t.parts.gun)));
    expect(drawn.length).toBeGreaterThan(0);
    expect(map.props.filter((p) => (p.paths ?? []).some((path) => under(path, t.parts.gun))).every((p) => p.parts.length > 0)).toBe(true);

    const sent: ClientEvent[] = [], moved: [string, Float32Array][] = [], locks: boolean[] = [];
    let clock = 0;                                                           // LATER 151: seconds, the page's `now`
    let feet: V3 | null = [t.origin[0], 42.5, t.origin[2] + 14.5];
    let look = { yaw: 0, pitch: 0 };
    const bodies = new Map<number, { yaw: number; pitch: number }>();
    const table = readKitTable(ZWEAPON!);                                    // the disc's zweapon.rdr: the turret's record
    const page = new TurretPage({
      turrets: () => map.turrets ?? [],
      weapon: (name) => turretWeapon(table, name),
      feet: () => feet,
      look: () => look,
      setLook: (yaw, pitch) => { look = { yaw, pitch }; },
      setLocked: (on) => locks.push(on),
      bodyLook: (id) => bodies.get(id) ?? null,
      move: (path, delta) => moved.push([path, delta]),
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => 77 }),
      now: () => clock,                                                      // LATER 151: the page's own clock
    });
    const listeners: ((ev: ServerEvent) => void)[] = [];
    page.attach({ on: (l) => { listeners.push(l); return () => undefined; } });
    const tell = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };

    // In reach, facing the gun's way: the mount prompt, action_mount_turret.tif.
    expect(page.target()).toBe(t.id);
    expect(page.prompt()).toBe('turret_mount');
    expect(ACTION_ICONS[page.prompt()!]).toBe('action_mount_turret.tif');
    // Out of reach (or turned away): none.
    feet = [t.origin[0], 42.5, t.origin[2] + 30];
    expect(page.prompt()).toBeNull();
    feet = [t.origin[0], 42.5, t.origin[2] + 14.5];
    look = { yaw: 90, pitch: 0 };
    expect(page.prompt()).toBeNull();
    look = { yaw: 0, pitch: 0 };
    // The press: asked of the room, never taken here.
    expect(page.action()).toBe(true);
    expect(sent).toEqual([{ type: 'mount', seq: 77, turret: t.id, word: true }]);
    expect(page.mounted()).toBeNull();
    // The room's answer: mounted -- the dismount prompt, the walk locked, the look held to the gun's stops.
    tell({ type: 'turret', id: t.id, occupant: 1, ammo: 750 });
    expect(page.mounted()).toBe(t.id);
    expect(locks).toEqual([true]);
    clock += 1.25;                                                           // LATER 151: past the release's wait (1.25 s)
    expect(page.prompt()).toBe('turret_dismount');
    expect(ACTION_ICONS[page.prompt()!]).toBe('action_dismount_turret.tif');
    // PAR-55: the kit's box -- the 750 poured into PKM TURRET's magazines of 250 (FUN_005bc5d0), its icon, AUTO.
    expect(page.hudAmmo()).toEqual({ rounds: 250, capacity: 250, spare: 2 });
    expect([page.hudIcon(), page.hudFireMode()]).toEqual(['turret_rmg.tif', 3]);
    // TURRET-AMMO: the room's magazines once told (`turretMagsBox`); the mount's broadcast carries none, so the pour stands here.
    expect(TURRET_AMMO_HUD_READING).toBe("the room's magazines (mags), the one in the weapon over Ammo_Capacity; without them as the mount pours");
    look = { yaw: 150, pitch: 60 };
    page.frame();
    expect(look).toEqual(clampAim(t, 150, 60));
    expect(look.yaw).toBeCloseTo(110, 3);
    // Its own gun turned by its own (clamped) look: the delta carries the firepoint to the muzzle at that aim.
    const own = moved.filter(([p]) => p === t.parts.gun).at(-1)![1];
    const fp = t.firepointOrigin;
    const at = (m: Float32Array, v: readonly number[]): number[] => [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + m[12 + r]!);
    expect(at(own, fp).map((v) => Number(v.toFixed(2)))).toEqual(muzzleAt(t, look.yaw, look.pitch).map((v) => Number(v.toFixed(2))));
    // The ammunition the room tells the occupant; the press now asks the dismount.
    tell({ type: 'turret', id: t.id, occupant: 1, ammo: 512 });
    expect(page.hudAmmo()).toEqual({ rounds: 12, capacity: 250, spare: 2 });   // 238 spent from the first magazine
    expect(page.action()).toBe(true);
    expect(sent.at(-1)).toEqual({ type: 'dismount', seq: 77, turret: t.id });
    tell({ type: 'turret', id: t.id, occupant: null, ammo: 512 });
    expect(page.mounted()).toBeNull();
    expect(locks).toEqual([true, false]);
    expect(page.hudAmmo()).toBeNull();
    expect([page.hudIcon(), page.hudFireMode()]).toEqual([null, null]);
    // Another's turret: its gun turned by that body's yaw and pitch off the snapshots; its body faces the aim
    // (TURRET_HOLD_FACING_READING).
    expect(TURRET_HOLD_FACING_READING).toBe('the aim');
    bodies.set(7, { yaw: 40, pitch: -20 });
    tell({ type: 'turret', id: t.id, occupant: 7, ammo: 750 });
    expect(page.prompt()).toBeNull();                              // occupied: no mount prompt
    page.frame();
    const theirs = moved.filter(([p]) => p === t.parts.gun).at(-1)![1];
    expect([...theirs]).toEqual([...gunDelta(t, 40, -20)]);
    expect(at(theirs, fp).map((v) => Number(v.toFixed(2)))).toEqual(muzzleAt(t, 40, -20).map((v) => Number(v.toFixed(2))));
    // A late joiner's welcome names the occupied ones.
    const late = new TurretPage({
      turrets: () => map.turrets ?? [], feet: () => null, look: () => null, setLook: () => undefined, setLocked: () => undefined,
      bodyLook: () => null, move: () => undefined, net: () => null,
    });
    late.event({ type: 'welcome', turrets: [{ id: t.id, occupant: 7, ammo: 700 }] } as unknown as ServerEvent);
    expect(late.occupant(t.id)).toBe(7);
  }, 120_000);

  it("every page hears .GRAB_TURRET at the mount and .RELEASE_TURRET at the release, at the body; draws the hand's mount clip, then seal_turret_poses held, then the clip reversed; flashes a mounted round at the firepoint and gives its own rounds the gun's line and a count", async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    const t = map.turrets!.find((x) => x.name === 'mp72_turret01')!;
    const heard: [string, V3 | null][] = [];
    let now = 10, look = { yaw: 20, pitch: 5 };
    const own: V3 = [t.origin[0], 42.5, t.origin[2] + 8.5], theirs: V3 = [1, 2, 3];
    const bodies = new Map<number, { yaw: number; pitch: number }>([[7, { yaw: 40, pitch: -20 }]]);
    const deps: TurretPageDeps = {
      turrets: () => map.turrets ?? [], feet: () => own, look: () => look, setLook: (yaw, pitch) => { look = { yaw, pitch }; },
      setLocked: () => undefined, bodyLook: (id) => bodies.get(id) ?? null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 1 }),
      sound: (name, at) => heard.push([name, at]), bodyFeet: (id) => (id === 7 ? theirs : null), hand: (id) => (id === 7 ? 1 : 0),
      clips: () => ({
        clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
        table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
      }),
      now: () => now,
    };
    const page = new TurretPage(deps);
    const run = 0.3 * (25 / 26) ** 2;                               // oneShotSeconds(0.3, 26)
    expect(TURRET_SOUNDS).toEqual({ mount: '.GRAB_TURRET', release: '.RELEASE_TURRET' });
    // This page's own mount: the sound at its feet; the rifle's clip from key 0, half-way at half the run, then the hold.
    page.event({ type: 'turret', id: t.id, occupant: 1, ammo: 750 });
    expect(heard).toEqual([['.GRAB_TURRET', own]]);
    expect(page.ownPose()).toEqual({ clip: 'seal_stand2turret', frame: 0, loop: false, rootY: null });
    now += run / 2;
    expect(page.ownPose()!.frame).toBeCloseTo(12.5, 6);
    now += run;
    // PB-2 (c): the hold's key is the gun's elevation's (`turretHoldKey`, FUN_00585cd0): its own look 5 up.
    // PB-2b's rework: the hold's rifle on its carry, stowed at the mount's phase 0.5 (`FUN_00588bc0` D:L446318-446343 ->
    // `FUN_005a73c0`; research 215 s7.3). Was (F1): `lead: { clip: 'seal_stand2turret', frame: 25 }`; before it, nothing.
    expect(page.ownPose()).toEqual({ clip: 'seal_turret_poses', frame: turretHoldKey(5), loop: false, rootY: null, mounts: { rifle: 'carry' } });
    // Its rounds: from the firepoint at the clamped look, down the gun's line, the frame for the flash, counted from 1.
    const r1 = page.round()!, r2 = page.round()!;
    expect([r1.count, r2.count]).toEqual([1, 2]);
    expect(r1.from).toEqual(muzzleAt(t, 20, 5));
    expect(r1.dir).toEqual(gunLine(20, 5));
    expect([...r1.frame!]).toEqual([...firepointFrame(t, 20, 5)!]);
    // Emptied (the room's 'empty' refusal, TURRET_RELOAD_READING): no round is drawn for a claim the room drops.
    page.event({ type: 'turret', id: t.id, occupant: 1, ammo: 0 });
    expect(page.round()).toBeNull();
    page.event({ type: 'turret', id: t.id, occupant: 1, ammo: 748 });
    expect(page.round()!.count).toBe(3);
    // The release: the sound at its feet, the rifle's clip reversed over the run, then its own play; the count starts again.
    page.event({ type: 'turret', id: t.id, occupant: null, ammo: 748 });
    expect(heard.at(-1)).toEqual(['.RELEASE_TURRET', own]);
    // PB-2b's rework: the release starts stowed -- the rifle back in the hand only past the reversed phase 0.5
    // (`FUN_005a7520`). Was: no mounts.
    expect(page.ownPose()).toEqual({ clip: 'seal_stand2turret', frame: 25, loop: false, rootY: null, mounts: { rifle: 'carry' } });
    now += run / 2;
    expect(page.ownPose()!.frame).toBeCloseTo(12.5, 6);
    now += run;
    expect(page.ownPose()).toBeNull();
    expect(page.round()).toBeNull();
    // Another's mount: its sound at its drawn feet, its pistol's clip; its round's flash at the firepoint at its aim.
    page.event({ type: 'turret', id: t.id, occupant: 7, ammo: 748 });
    expect(heard.at(-1)).toEqual(['.GRAB_TURRET', theirs]);
    expect(page.turretPose(7)!.clip).toBe('seal_p_stand2turret');
    expect([...page.muzzleOf(7)!]).toEqual([...firepointFrame(t, 40, -20)!]);
    expect(page.muzzleOf(8)).toBeNull();
    // A rounds update to the same occupant is no new mount: silent.
    const count = heard.length;
    page.event({ type: 'turret', id: t.id, occupant: 7, ammo: 700 });
    expect(heard).toHaveLength(count);
    // A late joiner's welcome: the occupant held, no sound, no clip to play.
    const late = new TurretPage({ ...deps, sound: (name, at) => heard.push([name, at]) });
    late.event({ type: 'welcome', turrets: [{ id: t.id, occupant: 7, ammo: 700 }] } as unknown as ServerEvent);
    expect(heard).toHaveLength(count);
    // PB-2b's rework: a welcome's body is past the stow -- from the pistol, the pistol on its holster (`FUN_005a75d0`, at
    // the pistol clip's 0.4). Was (F1): `lead: { clip: 'seal_p_stand2turret', frame: 25 }`; before it, nothing.
    expect(late.turretPose(7)).toEqual({ clip: 'seal_turret_poses', frame: turretHoldKey(-20), loop: false, rootY: null, mounts: { pistol: 'holster' } });
    // Without the clips, no pose: the body's own play.
    const bare = new TurretPage({ ...deps, clips: undefined });
    bare.event({ type: 'turret', id: t.id, occupant: 7, ammo: 700 });
    expect(bare.turretPose(7)).toBeNull();
  }, 120_000);
});

// ---- PB-2: the held weapon and the hands while mounted (issue #81; research 215 s7.3-s7.4), no game data -------------------

/** A level placement facing 0 with Vigilance's limits (+-70, +-45): the page reads only these fields here. */
const PLACE = {
  id: 0, name: 'synthetic', origin: [0, 13.5, 0], facing: 0, gunOrigin: [0, 13.5, 0], firepointOrigin: [0, 13.5, -9.7],
  limits: { yaw: [(-70 * Math.PI) / 180, (70 * Math.PI) / 180], pitch: [(-45 * Math.PI) / 180, (45 * Math.PI) / 180] },
  mountRange: 22, mountAngleCos: Math.cos((35 * Math.PI) / 180), parts: { turret: 't', gun: 'g', firepoint: 'f' },
} as unknown as TurretPlacement;
/** `oneShotSeconds(0.3, 26)`: the mount clip's run. */
const RUN_S = 0.3 * (25 / 26) ** 2;
/**
 * PB-2c: where the mount clip comes off (`FUN_0028c6e0` D:L134283-134308, the driver's end test): after 16 of the room's
 * 60 Hz ticks, key 24.04 -- before `RUN_S`'s key 25 (`mountSteerTicks`).
 */
const END_S = 16 / TICK_HZ;
type Mounts = ReturnType<typeof remoteKit>['mounts'];

/** A page whose player is 1, with another, 7, looking `own` and `other` (yaw, pitch); the turret anim set's clips. */
function seated(own: { yaw: number; pitch: number }, other: { yaw: number; pitch: number }) {
  let now = 0;
  const look = { ...own };
  const page = new TurretPage({
    turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => look, setLook: (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; },
    setLocked: () => undefined, bodyLook: (id) => (id === 7 ? other : null), move: () => undefined,
    net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 1 }),
    clips: () => ({
      clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
      table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
    }),
    now: () => now,
  });
  return { page, look, advance: (s: number) => { now += s; } };
}

/** The mounts a body's play draws after one frame of a snapshot carrying `traversal` (the walk's, or `RemotePlayers`' `r.snap`). */
function drawn(traversal: PlaySnapshot['traversal'], mounts: Mounts): Mounts {
  const play = new Play();
  play.setMounts(mounts);
  const snap = {
    feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, stance: 'stand', airborne: false, ground: { forward: 0, right: 0 },
    turnRate: 0, action: null, traversal,
  } as unknown as PlaySnapshot;
  play.frame(1 / 60, { snapshot: () => snap, view: () => 'third' }, {} as PerspectiveCamera);
  return play.weaponStats().mounts;
}

describe('PB-2: a seated body on either match (the shared TurretPage and Play)', () => {
  it("(a) PB-2b's rework: the mount clip stows the rifle at its phase 0.5 (FUN_00588bc0 -> FUN_005a73c0): in the hand before it, on its carry past it and through the hold -- its own body and another's (TURRET_HELD_WEAPON_READING)", () => {
    const { page, advance } = seated({ yaw: 0, pitch: 0 }, { yaw: 10, pitch: 0 });
    const key = (s: number): number => (s / RUN_S) * 25;                    // the pose's key s into the run
    const at = (k: number): number => (k / 25) * RUN_S;                     // the run's time at key k
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    // Mounting, before the phase 0.5 (key 13 of 26): the rifle in the hand, the clip's own track carrying it.
    expect(page.ownPose()!.clip).toBe('seal_stand2turret');
    advance(at(12.9));
    expect(key(at(12.9)) / 26).toBeLessThan(0.5);
    expect(drawn(page.ownPose(), remoteKit(0).mounts)).toEqual({ rifle: 'hand', pistol: 'holster' });
    // Past it: `FUN_005a73c0` -- the rifle on its carry (spinelo, the "rifle" gear's local).
    advance(at(13.1) - at(12.9));
    expect(drawn(page.ownPose(), remoteKit(0).mounts)).toEqual({ rifle: 'carry', pistol: 'holster' });
    advance(RUN_S);
    // Held: this page's own body (its walk's snapshot) and another's (`RemotePlayers`' snapshot) draw it on its carry.
    expect(page.ownPose()!.clip).toBe(TURRET_HOLD_CLIP);
    expect(drawn(page.ownPose(), { rifle: 'hand', pistol: 'spawn' })).toEqual({ rifle: 'carry', pistol: 'spawn' });
  });

  it("(a2) PB-2b's rework: the release, the mount clip reversed, keeps the rifle on its carry above the phase 0.5 and hands it back past it (FUN_005a7520); the next occupant's hold on its carry", () => {
    const { page, advance } = seated({ yaw: 0, pitch: 0 }, { yaw: 10, pitch: 0 });
    const at = (k: number): number => (k / 25) * RUN_S;                     // the run's time at key k
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    advance(RUN_S + 0.01);
    page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750 });       // released by 1, taken by 7
    // The release (1's body): the clip reversed from its last key -- still stowed above 0.5, the hand's again past it
    // (`FUN_005a7520`).
    expect(page.ownPose()!.frame).toBe(25);
    expect(drawn(page.ownPose(), remoteKit(0).mounts)).toEqual({ rifle: 'carry', pistol: 'holster' });
    advance(RUN_S - at(13.1));                                              // key 13.1 reversed: above 0.5
    expect(drawn(page.ownPose(), remoteKit(0).mounts)).toEqual({ rifle: 'carry', pistol: 'holster' });
    advance(at(13.1) - at(12.9));                                           // key 12.9: past it
    expect(drawn(page.ownPose(), remoteKit(0).mounts)).toEqual({ rifle: 'hand', pistol: 'holster' });
    advance(RUN_S);
    expect(page.turretPose(7)!.clip).toBe(TURRET_HOLD_CLIP);
    expect(drawn(page.turretPose(7), remoteKit(0).mounts)).toEqual({ rifle: 'carry', pistol: 'holster' });
    // Released, its clip run out: no pose, the kit's mounts again.
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    advance(RUN_S + 0.01);
    expect(page.turretPose(7)).toBeNull();
    expect(drawn(page.turretPose(7), remoteKit(0).mounts)).toEqual({ rifle: 'hand', pistol: 'holster' });
  });

  it("(a3) PB-2b's rework: a welcome into a held turret is past the stow -- the rifle on its carry at once", () => {
    const { page: late } = seated({ yaw: 0, pitch: 0 }, { yaw: 10, pitch: 0 });
    late.event({ type: 'welcome', turrets: [{ id: 0, occupant: 7, ammo: 750 }] } as unknown as ServerEvent);
    expect(late.turretPose(7)!.clip).toBe(TURRET_HOLD_CLIP);
    expect(drawn(late.turretPose(7), remoteKit(0).mounts)).toEqual({ rifle: 'carry', pistol: 'holster' });
  });

  it("(a4) PB-2b's rework: from the pistol (Pistol stand -> Turret) the rifle on its carry already, the pistol in the hand until the clip's 0.4, then on its holster (FUN_005a75d0) and through the hold", () => {
    const at = (k: number): number => (k / 25) * RUN_S;
    // From the pistol (`Pistol stand -> Turret`): the rifle on its carry already; the pistol in the hand until the clip's
    // 0.4 (key 10.4), then on its holster (`FUN_005a75d0`: rthigh, the "pistol" gear's local), and through the hold.
    let now = 0;
    const pistol = new TurretPage({
      turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined, setLocked: () => undefined,
      bodyLook: () => ({ yaw: 0, pitch: 0 }), move: () => undefined, net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 1 }),
      hand: () => 1, now: () => now,
      clips: () => ({ clips: [{ name: 'seal_p_stand2turret', frameCount: 26 }, { name: TURRET_HOLD_CLIP, frameCount: 3 }], table: [['seal_p_stand2turret', { playback: 0.3 }]] }),
    });
    pistol.event({ type: 'turret', id: 0, occupant: 7, ammo: 750 });
    expect(pistol.turretPose(7)!.clip).toBe('seal_p_stand2turret');
    now = at(10.3);
    expect(drawn(pistol.turretPose(7), remoteKit(1).mounts)).toEqual({ rifle: 'carry', pistol: 'hand' });
    now = at(10.5);
    expect(drawn(pistol.turretPose(7), remoteKit(1).mounts)).toEqual({ rifle: 'carry', pistol: 'holster' });
    now = RUN_S + 0.01;
    expect(pistol.turretPose(7)!.clip).toBe(TURRET_HOLD_CLIP);
    expect(drawn(pistol.turretPose(7), remoteKit(1).mounts)).toEqual({ rifle: 'carry', pistol: 'holster' });
    expect(TURRET_HELD_WEAPON_READING).toBe('carry');                                   // was 'hand' (PB-2b), 'carry' (PB-2)
    // Both bodies take the pose through one seam on both pages: the walk's snapshot and `RemotePlayers`' (ACT-2 pins the
    // two `setMountPose` lines on `main.ts` and `matchMount.ts`, `matchMount.test.ts`).
    const src = (f: string) => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
    expect(src('walk.ts')).toMatch(/const mount = this\.deathPose \? null : this\.mountPose\?\.\(\) \?\? null;[^\n]*\n\s*if \(mount\) s\.traversal = mount;/);
    expect(src('remotePlayers.ts')).toMatch(/const mount = r\.snap\.alive \? this\.mountPose\?\.\(b\.id\) \?\? null : null;[^\n]*\n\s*if \(mount\) \{ r\.flinch = null; r\.under = null; r\.coverLand = null; \}[\s\S]{0,2000}?\n\s*if \(mount\) r\.snap\.traversal = mount;/);   // LATER 512b: its drop (and the flinch step) between
  });

  it("(c) the hold's key follows the gun's elevation (FUN_00585cd0): key 0 at 45 up, 1 level, 2 at 45 down, linear and held past -- the own body's by its clamped look, another's by its snapshot's pitch", () => {
    const { page, look, advance } = seated({ yaw: 0, pitch: 30 }, { yaw: 0, pitch: -30 });
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    advance(RUN_S + 0.01);
    expect(page.ownPose()!.clip).toBe(TURRET_HOLD_CLIP);
    expect(page.ownPose()!.frame).toBeCloseTo(1 - 30 / 45, 12);
    look.pitch = 80;                                                  // past the gun's 45 stop: the clamped aim's
    expect(page.ownPose()!.frame).toBe(0);
    page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750 });
    advance(RUN_S + 0.01);
    expect(page.turretPose(7)!.frame).toBeCloseTo(1 + 30 / 45, 12);
    const keys: [number, number][] = [[45, 0], [22.5, 0.5], [0, 1], [-22.5, 1.5], [-45, 2], [60, 0], [-60, 2]];
    for (const [pitch, key] of keys) expect(turretHoldKey(pitch), String(pitch)).toBeCloseTo(key, 12);
  });

  it("(d) PB-2c: the own mount onto a gun its last occupant left turned -- the look turns toward that gun's yaw, the facing FUN_005463c0 records off the gun part's matrix at the mount (D:L412268-412297), not the placement's rest -- and is laid on it when the clip comes off, 16 ticks in (FUN_0028c6e0), where the hold starts; the clip drawn short of key 25", () => {
    const tick = 1 / TICK_HZ;
    const { page, look, advance } = seated({ yaw: 50, pitch: 0 }, { yaw: 60, pitch: 0 });
    // 7 holds it at 60 (its snapshot's yaw, the room's clamped aim) and the page draws it there; then 7 lets it go.
    page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750 });
    advance(1); page.frame();
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    advance(1); page.frame();
    // This page's player mounts it: its look turns toward 60 (was toward the rest facing 0).
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    page.frame();
    for (let i = 0; i < 10; i++) { advance(tick); page.frame(); }
    let yaw = 50;
    for (let i = 0; i < 10; i++) yaw = seatTurn(yaw, 60, tick);
    expect(look.yaw).toBeGreaterThan(50);
    expect(look.yaw).toBeCloseTo(yaw, 9);
    // Just before the clip comes off: still the clip, short of key 24.04; then the hold, the look laid on 60.
    advance(END_S - 10 * tick - 1e-6); page.frame();
    expect(page.ownPose()!.clip).toBe('seal_stand2turret');
    expect(page.ownPose()!.frame).toBeLessThan(24.04);
    expect(look.yaw).toBeLessThan(60);
    advance(2e-6); page.frame();
    expect(look.yaw).toBe(60);
    expect(page.ownPose()!.clip).toBe(TURRET_HOLD_CLIP);
  });

  it("(b) F-C: while the own mount clip plays the look turns toward the gun's facing by seatTurn per 1/60 s tick (the room's TICK_HZ) -- the same at frames of 1/30 s and 1/144 s -- and the clip's end lays it on the facing once (FUN_005b3340, FUN_00585cd0)", () => {
    const tick = 1 / TICK_HZ;
    const turned = (ticks: number): number => { let y = 30; for (let i = 0; i < ticks; i++) y = seatTurn(y, PLACE.facing, tick); return y; };
    for (const fps of [30, 144]) {
      const { page, look, advance } = seated({ yaw: 30, pitch: 0 }, { yaw: 0, pitch: 0 });
      let t = 0;
      const step = (): void => { advance(1 / fps); t += 1 / fps; page.frame(); };
      page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
      page.frame();
      expect(look.yaw, `${fps} fps, the mount's frame`).toBe(30);
      while (t + 1 / fps < 10 * tick - 1e-9) step();
      step();                                                          // 1/6 s: ten ticks at either rate
      expect(look.yaw, `${fps} fps, ten ticks`).toBeCloseTo(turned(10), 10);
      while (t + 1 / fps < END_S - 1e-9) step();
      // PB-2c: the clip's last frame before it comes off at 16 ticks (was RUN_S, key 25: 16 ticks turned at either rate).
      const due = Math.floor(t * TICK_HZ + 1e-9);
      expect(due, `${fps} fps, the clip's last frame`).toBe(fps === 30 ? 14 : 15);
      expect(look.yaw, `${fps} fps, the clip's last frame`).toBeCloseTo(turned(due), 10);
      expect(look.yaw).toBeGreaterThan(5);                              // the turn does not close within the clip (s7.1)
      step();                                                          // the clip's end: the hold lays the gun's facing
      expect(look.yaw, `${fps} fps, the clip's end`).toBe(PLACE.facing);
      look.yaw = 12;                                                   // the stick's after it: laid once, not held
      step();
      expect(look.yaw, `${fps} fps, after the clip`).toBe(12);
    }
  });
});

/**
 * PAR-44 (research 215 s7.5): the page's own prediction in the hold -- a real `WalkMode` on a flat synthetic floor (no game
 * data), its tick seam (`setTurretHold`) running `TurretPage.holdTick` after each tick's move and before the command and
 * its predicted feet go to the room (`setNetTap`), paired with the room's step on the same commands (a `MoverSim` applying
 * each, then `holdStep`, as `room.ts`'s command step does past the mount's steer).
 */
describe("PAR-44: the own body's predicted place in the hold (no game data)", () => {
  const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const DEG = Math.PI / 180;
  /** A gun 13.69 over the floor facing -z (Crossroads' turret 1's height), yaw -70..70, pitch -45..45. */
  const t = {
    id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [10, 13.69, 20], facing: 0,
    parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
    gunOrigin: [10, 13.69, 20], firepointOrigin: [10, 13.69, 15], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
    mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: null, ammoInit: 750,
  } as unknown as TurretPlacement;

  it("past its own mount clip the page's mover is placed each tick at place + R(aim yaw)(-3.257, ., 4.282) before the command's feet are sent, as the room's step places its own on the same commands; not while the clip plays (FUN_00585cd0 D:L444603-444625)", () => {
    expect(TURRET_HOLD_OFFSET_READING.map((v) => new Uint32Array(Float32Array.of(v).buffer)[0]!.toString(16))).toEqual(['c05072b0', '0', '40890625']);
    const ground = packGround(PARAMS, [FLOOR], OWNERS);
    const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    const camera: WalkCamera = {
      pose: () => ({ ...pose }) as never, setPose: (p) => { Object.assign(pose, p); }, moveTo: () => undefined, setWalking: () => undefined,
      setPitchLimits: () => undefined, placeView: () => undefined, groundWish: () => ({ forward: 0, right: 0, boost: false }),
    };
    const walk = new WalkMode(camera);
    walk.setGround(ground, [10, 0, 34]);
    const start: [number, number, number] = [10, 0, 34];
    expect(walk.respawn(start, 0)).toBe(true);
    pose.pitch = 0;
    let clock = 0;
    const run = 0.3 * (25 / 26) ** 2;                               // seal_stand2turret's run (oneShotSeconds of 0.3 over 26 keys)
    const page = new TurretPage({
      turrets: () => [t], feet: () => walk.feet(),
      look: () => ({ yaw: pose.yaw, pitch: pose.pitch }), setLook: (yaw, pitch) => { pose.yaw = yaw; pose.pitch = pitch; },
      setLocked: (on) => walk.setLocked(on), bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 0 }),
      clips: () => ({ clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: TURRET_HOLD_CLIP, frameCount: 3 }], table: [['seal_stand2turret', { playback: 0.3 }]] }),
      now: () => clock,
    });
    let held = false;
    walk.setTurretHold((w) => { held = page.holdTick(w); });
    const sent: { cmd: Omit<Command, 'seq'>; feet: [number, number, number]; held: boolean }[] = [];
    walk.setNetTap((cmd, feet) => { sent.push({ cmd: { ...cmd }, feet: [...feet], held }); held = false; });
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    expect(page.mounted()).toBe(0);
    // Frames of one tick: the look turning 2 a frame from 0 to 60 after the clip, then held there.
    const frames = 90;
    for (let i = 0; i < frames; i++) {
      clock += TICK;
      if (clock > run + 0.1) pose.yaw = Math.min(60, pose.yaw + 2);
      walk.frame(TICK);
      page.frame();
    }
    expect(sent).toHaveLength(frames);
    // While the mount clip plays the page places nothing (the room's steer, followed by the reconcile): the feet stand.
    const during = sent.filter((x) => !x.held);
    // PB-2c: the clip comes off 16 ticks in (`FUN_0028c6e0`; was `run`, key 25): the frames at 1 to 15 ticks place nothing.
    expect(during.length).toBe(15);
    expect(Math.floor(run / TICK + 1e-9)).toBe(16);
    for (const d of during) expect(d.feet).toEqual(sent[0]!.feet);
    // After it: each command's feet on the hold's place at its own (gated) yaw, on the floor.
    const holding = sent.filter((x) => x.held);
    expect(holding.length).toBe(frames - during.length);
    // The room's step on the same commands (`room.ts`: the command applied, then `holdStep` past the steer).
    const room = new MoverSim(new Walker(groundGrid(ground)), null);
    room.walker.place(start[0], start[1] + probeLiftOf('stand'), start[2]);
    room.walker.state.yaw = 0;
    sent.forEach((x, k) => {
      room.apply({ seq: k + 1, ...x.cmd });
      if (x.held) holdStep(t, room.walker);
      const r = room.walker.state;
      expect([k, Math.hypot(r.x - x.feet[0], r.z - x.feet[2]) < 1e-9, Math.abs(r.y - x.feet[1]) < 1e-9]).toEqual([k, true, true]);
      if (!x.held) return;
      const at = holdPlace(t, r.yaw);
      expect([k, Math.hypot(x.feet[0] - at[0], x.feet[2] - at[2]) < 1e-9, x.feet[1]]).toEqual([k, true, 0]);
    });
    // It orbits: the last place is the hold's at 60 (the command's yaw on the wire's grid, 360 / 65536), 5.38 from its place at 0.
    const last = sent.at(-1)!.feet, at60 = holdPlace(t, 60), at0 = holdPlace(t, 0);
    expect(Math.hypot(last[0] - at60[0], last[2] - at60[2])).toBeLessThan(1e-3);
    expect(Math.hypot(at60[0] - at0[0], at60[2] - at0[2])).toBeCloseTo(Math.hypot(3.257, 4.282), 3);   // 60 apart: the chord is the radius, 5.38
    // The release: no more holding; the feet stay where the hold put them.
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    clock += TICK; walk.frame(TICK);
    expect(sent.at(-1)!.held).toBe(false);
    expect(sent.at(-1)!.feet).toEqual(last);
  });

  /**
   * T81-2 (issue #81, research 215 s7.8): the hold lays the body on the gun's own frame each frame -- `FUN_00585cd0`
   * (D:L444509-444628) reads the turret's matrix through its vfunc `+0xc`, `turret + 0x2c0`, the gun part's world matrix
   * `FUN_003a7350` copies after the turn it has just made (D:L299409-299412) -- so one aim turns the gun and places the
   * body. On the page a look jumped past the stick's law (`../src/net/lookGate`, `MAX_YAW_RATE`, `MAX_PITCH_RATE`) is let
   * through over ticks: the mover's yaw and pitch lag the look, and the body is held at the mover's. The own gun, its
   * rounds and the hold's key take the aim the hold placed the body at (the room's `gunYaw` and fire, the others' pages'
   * snapshot), never ahead of it. A page whose own body is mounted, past its mount clip, through a `WalkMode` with the gate.
   */
  const heldWalk = (place: TurretPlacement = t, opts: { pitch?: number; settle?: number } = {}) => {
    const ground = packGround(PARAMS, [FLOOR], OWNERS);
    const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    const camera: WalkCamera = {
      pose: () => ({ ...pose }) as never, setPose: (p) => { Object.assign(pose, p); }, moveTo: () => undefined, setWalking: () => undefined,
      setPitchLimits: () => undefined, placeView: () => undefined, groundWish: () => ({ forward: 0, right: 0, boost: false }),
    };
    const walk = new WalkMode(camera);
    walk.setGround(ground, [10, 0, 34]);
    expect(walk.respawn([10, 0, 34], 0)).toBe(true);
    let clock = 0;
    let drawnDelta: Float32Array | null = null;
    const page = new TurretPage({
      turrets: () => [place], feet: () => walk.feet(),
      look: () => ({ yaw: pose.yaw, pitch: pose.pitch }), setLook: (yaw, pitch) => { pose.yaw = yaw; pose.pitch = pitch; },
      setLocked: (on) => walk.setLocked(on), bodyLook: () => null, move: (path, delta) => { if (path === t.parts.gun) drawnDelta = delta; },
      net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 0 }),
      clips: () => ({ clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: TURRET_HOLD_CLIP, frameCount: 3 }], table: [['seal_stand2turret', { playback: 0.3 }]] }),
      now: () => clock,
    });
    walk.setTurretHold((w) => { page.holdTick(w); });
    let taps = 0;
    walk.setNetTap(() => { taps++; });                              // each tick's command, numbered from 1 (`seq`)
    // The room's gate context for the weapon in hand (`lookContextOf`): no scope, and a kick rate of 0 here, so the pitch
    // is held to the stick's law and the stance's return (`lookAllowance`); the page's open context holds no pitch.
    walk.setLookContext(() => ({ scopeScale: 1, kickRate: 0 }));
    // T81-3: the walk's command held to the held turret's limits before its gate, as `matchActions` wires it (the page's
    // `clampLook`: the look as given while nothing is held).
    walk.setTurretAim((yaw, pitch) => page.clampLook(yaw, pitch));
    // The drawn gun's yaw and pitch: the rest line turned by the drawn delta (the gun part's move, `gunDelta`).
    const rest = gunLine(t.facing, 0);
    const gunDrawn = (): { yaw: number; pitch: number } => {
      const d = drawnDelta!, l = [0, 1, 2].map((r) => d[r]! * rest[0] + d[4 + r]! * rest[1] + d[8 + r]! * rest[2]);
      return { yaw: (Math.atan2(-l[0]!, -l[2]!) * 180) / Math.PI, pitch: (Math.asin(l[1]!) * 180) / Math.PI };
    };
    const frame = (): void => { clock += TICK; walk.frame(TICK); page.frame(); };
    if (opts.pitch !== undefined) {                                 // looking there before the mount, the mover gated onto it
      pose.pitch = opts.pitch;
      for (let i = 0; i < 90; i++) frame();
    }
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    for (let i = 0; i < (opts.settle ?? 40); i++) frame();          // past the mount clip (16 ticks), held at the facing
    return { walk, page, pose, gunDrawn, frame, seq: () => taps };
  };
  /** The command's look rides the wire's grid (360 / 65536 degrees, `quantiseCommand`): a look is met within it. */
  const QUANTUM = 360 / 65536;
  /** F2: this page's round leaves from the gun's muzzle down its line at the aim the body holds (`TurretPage.round`). */
  const roundOff = (page: TurretPage, aim: { yaw: number; pitch: number }): string | null => {
    const r = page.round()!, line = gunLine(aim.yaw, aim.pitch), from = muzzleAt(t, aim.yaw, aim.pitch);
    const dir = Math.hypot(r.dir[0] - line[0], r.dir[1] - line[1], r.dir[2] - line[2]), at = Math.hypot(r.from[0] - from[0], r.from[1] - from[1], r.from[2] - from[2]);
    return dir > QUANTUM * DEG || at > 1e-3 ? `round dir ${dir.toFixed(4)} / muzzle ${at.toFixed(3)} off the body's aim` : null;
  };

  it("T81-2: a look jumped 35 degrees past the stick's law -- each frame the own gun is drawn at the yaw the hold placed the body at, the feet on the hold's place at the drawn gun's yaw, its rounds down that gun's line, while the gate turns the mover over ticks (FUN_00585cd0 D:L444509-444628 on the gun's matrix, FUN_003a7350 D:L299409-299412)", () => {
    const { walk, page, pose, gunDrawn, frame } = heldWalk();
    pose.yaw = 35;                                                  // the look jumped (a mouse's flick, the hook's setCamera)
    const lines: string[] = [];
    let lagged = 0;
    for (let i = 0; i < 30; i++) {
      frame();
      const s = walk.snapshot()!, body = s.yaw, feet = walk.feet()!, gun = gunDrawn().yaw, at = holdPlace(t, gun);
      if (Math.abs(shortTurn(body, 35)) > 1) lagged++;
      const off = Math.hypot(feet[0] - at[0], feet[2] - at[2]);
      if (Math.abs(shortTurn(gun, body)) > QUANTUM || off > 1e-3) lines.push(`frame ${i}: body ${body.toFixed(2)}, drawn gun ${gun.toFixed(2)}, feet ${off.toFixed(3)} off the hold's place at the gun's yaw`);
      const round = roundOff(page, { yaw: body, pitch: s.pitch });
      if (round) lines.push(`frame ${i}: ${round}`);
    }
    expect(lagged, 'the gate lets the jump through over ticks').toBeGreaterThan(5);
    expect(lines).toEqual([]);
    // Settled: the body, the gun and the look on 35.
    expect(Math.abs(shortTurn(walk.snapshot()!.yaw, 35))).toBeLessThan(1e-2);
  });

  it("T81-2 (F3): a look pitched 40 up past the stick's law -- each frame the own gun is drawn at the pitch the hold's body holds (the mover's, gated), the hold's key off that pitch (turretHoldKey) and its rounds down that gun's line; the original's gun pitches by the stick at RATES +0x118 (FUN_003a93f0 D:L300565-300566, FUN_003a7490)", () => {
    const { walk, page, pose, gunDrawn, frame } = heldWalk();
    pose.pitch = 40;                                                // the look pitched at once (a mouse's flick, the hook's setCamera)
    const lines: string[] = [];
    let lagged = 0;
    for (let i = 0; i < 40; i++) {
      frame();
      const s = walk.snapshot()!, gun = gunDrawn(), key = page.ownPose()!.frame;
      if (Math.abs(s.pitch - 40) > 1) lagged++;
      if (Math.abs(gun.pitch - s.pitch) > QUANTUM || Math.abs(key - turretHoldKey(s.pitch)) > 1e-3) {
        lines.push(`frame ${i}: body ${s.pitch.toFixed(2)}, drawn gun ${gun.pitch.toFixed(2)}, key ${key.toFixed(3)} (the body's ${turretHoldKey(s.pitch).toFixed(3)})`);
      }
      const round = roundOff(page, { yaw: s.yaw, pitch: s.pitch });
      if (round) lines.push(`frame ${i}: ${round}`);
    }
    expect(lagged, 'the gate lets the pitch through over ticks').toBeGreaterThan(5);
    expect(lines).toEqual([]);
    expect(Math.abs(walk.snapshot()!.pitch - 40)).toBeLessThan(1e-2);
  });

  /**
   * F6 of T81-2's re-read: the own aim is the turret's, held to its limits as the room holds the occupant's (`room.ts`
   * `onTurret`, `clampAim`) and as another page draws it (`aimOf`). The mover's gated aim can stand past a stop for some
   * ticks -- a mount begun looking below the gun's lowest pitch, a look past a yaw stop the walk's ticks read before the
   * page clamps it -- and the gun and its rounds never follow it there.
   */
  const outside = (place: TurretPlacement, aim: { yaw: number; pitch: number }): string | null => {
    const lim = place.limits, rel = shortTurn(place.facing, aim.yaw);
    const y = lim.yaw!, p = lim.pitch!;
    return rel < y[0] / DEG - QUANTUM || rel > y[1] / DEG + QUANTUM || aim.pitch < p[0] / DEG - QUANTUM || aim.pitch > p[1] / DEG + QUANTUM
      ? `yaw ${rel.toFixed(2)}, pitch ${aim.pitch.toFixed(2)}` : null;
  };
  const dirAim = (d: readonly number[]): { yaw: number; pitch: number } => ({ yaw: (Math.atan2(-d[0]!, -d[2]!) * 180) / Math.PI, pitch: (Math.asin(d[1]!) * 180) / Math.PI });

  it("T81-2 (F6): mounted while looking at -70 on a gun held to -25..10 (MP10's MGL turret's pitch) -- each frame from the mount the own gun and its rounds stay within the turret's limits while the gated mover climbs to them (clampAim, as room.ts onTurret and another page's aimOf)", () => {
    const mgl = { ...t, limits: { yaw: t.limits.yaw, pitch: [-25 * DEG, 10 * DEG] } } as TurretPlacement;
    const { walk, page, gunDrawn, frame } = heldWalk(mgl, { pitch: -70, settle: 0 });
    expect(walk.snapshot()!.pitch).toBeLessThan(-60);              // the mover looking low at the mount
    const lines: string[] = [];
    let below = 0;
    for (let i = 0; i < 60; i++) {
      frame();
      if (walk.snapshot()!.pitch < -25 - 1) below++;
      const gun = outside(mgl, gunDrawn()), round = outside(mgl, dirAim(page.round()!.dir));
      if (gun || round) lines.push(`frame ${i}: drawn gun ${gun ?? 'in'}, round ${round ?? 'in'} (the body ${walk.snapshot()!.pitch.toFixed(2)})`);
    }
    expect(below, 'the gated mover below the gun\'s lowest pitch for a while').toBeGreaterThan(16);
    expect(lines).toEqual([]);
  });

  it("T81-2 (F6): a look jumped from the yaw stop (70) to 120 past it -- each frame the own gun and its rounds stay at or inside the stop, though the walk's ticks read the look before the page clamps it (clampAim)", () => {
    const { walk, page, pose, gunDrawn, frame } = heldWalk();
    pose.yaw = 70;
    for (let i = 0; i < 60; i++) frame();                           // at the stop
    expect(Math.abs(shortTurn(walk.snapshot()!.yaw, 70))).toBeLessThan(1e-2);
    const lines: string[] = [];
    let past = 0;
    for (let k = 0; k < 5; k++) {
      pose.yaw = 120;                                               // jumped past the stop (the page clamps it back each frame)
      for (let i = 0; i < 6; i++) {
        frame();
        const s = walk.snapshot()!;
        if (shortTurn(t.facing, s.yaw) > 70 + QUANTUM) past++;
        const body = outside(t, s), gun = outside(t, gunDrawn()), round = outside(t, dirAim(page.round()!.dir));
        if (body || gun || round) lines.push(`jump ${k} frame ${i}: the mover ${body ?? 'in'}, drawn gun ${gun ?? 'in'}, round ${round ?? 'in'}`);
      }
    }
    // T81-3: the mover (the body, the hold's place) never past the stop either -- the walk holds its command to the
    // turret's limits before its gate, as `room.ts` `onTurret` holds the room's (was: past it on 17 of 30 frames).
    expect(lines).toEqual([]);
    expect(past).toBe(0);
  });

  it("T81-3: the room's facing reconciled after a look jumped past the yaw stop -- the walk's replay of the gate (reconcileFacing, LookLog) steps the held looks, so the mover stays at the stop (the replay steps what the walk stepped)", () => {
    const { walk, pose, frame, seq } = heldWalk();
    pose.yaw = 70;
    for (let i = 0; i < 60; i++) frame();                           // at the stop
    const lines: string[] = [];
    for (let k = 0; k < 4; k++) {
      pose.yaw = 120;                                               // jumped past it
      frame(); frame();
      // The room's word on a command two ticks back: its mover at the stop (room.ts onTurret clamps before its gate).
      const ack = seq() - 2, pitch = walk.snapshot()!.pitch;
      expect(walk.reconcileFacing(ack, { yaw: 70, pitch }), `the log holds ${ack}`).not.toBeNull();
      const yaw = walk.snapshot()!.yaw;
      if (shortTurn(t.facing, yaw) > 70 + QUANTUM) lines.push(`jump ${k}: the mover at ${yaw.toFixed(2)} after the replay`);
    }
    expect(lines).toEqual([]);
  });

  /** T81-3: one 60 Hz tick of the stick's full turn (degrees): `MAX_YAW_RATE` (2.236 rad/s), and the pitch's `MAX_PITCH_RATE`. */
  const YAW_TICK = (MAX_YAW_RATE * TICK * 180) / Math.PI, PITCH_TICK = (MAX_PITCH_RATE * TICK * 180) / Math.PI;

  it("T81-3: a pad's stick held into the yaw stop (70) -- the camera turned a tick's full turn before each walk frame, as padFrame and fly.update turn it -- the mover (the body, the hold's place) and the gun never past the stop on any frame (FUN_003a76d0 D:L299504-299529: the turret held at its stop within the turn; room.ts onTurret's clampAim before the gate)", () => {
    const { walk, page, pose, gunDrawn, frame } = heldWalk();
    pose.yaw = 70;
    for (let i = 0; i < 60; i++) frame();                           // at the stop
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      pose.yaw += YAW_TICK;                                         // the stick held left: the camera turned before the walk's frame
      frame();
      const s = walk.snapshot()!, feet = walk.feet()!, at = holdPlace(t, s.yaw);
      const body = outside(t, s), gun = outside(t, gunDrawn());
      if (body || gun || Math.hypot(feet[0] - at[0], feet[2] - at[2]) > 1e-3) lines.push(`frame ${i}: the mover ${body ?? 'in'}, drawn gun ${gun ?? 'in'}`);
    }
    expect(lines).toEqual([]);
    expect(Math.abs(shortTurn(walk.snapshot()!.yaw, 70))).toBeLessThan(QUANTUM + 1e-9);
  });

  it("T81-3: the pitch at its stops (45 up, 45 down) -- a pad held past each and a look flicked past each -- the mover's pitch, the drawn gun's and the hold's key never past the stop (FUN_003a7490, the gun part's stops; room.ts onTurret's clampAim)", () => {
    const { walk, page, pose, gunDrawn, frame } = heldWalk();
    const lines: string[] = [];
    for (const stop of [45, -45]) {
      pose.pitch = stop;
      for (let i = 0; i < 90; i++) frame();                         // at the stop
      for (let i = 0; i < 30; i++) {
        pose.pitch += Math.sign(stop) * PITCH_TICK;                 // the stick held past it
        frame();
        const s = walk.snapshot()!, body = outside(t, s), gun = outside(t, gunDrawn()), key = page.ownPose()!.frame;
        if (body || gun || Math.abs(key - turretHoldKey(stop)) > 1e-3) lines.push(`${stop} pad frame ${i}: the mover ${body ?? 'in'}, drawn gun ${gun ?? 'in'}, key ${key.toFixed(3)}`);
      }
      pose.pitch = stop + Math.sign(stop) * 15;                     // a flick past it (inside the stance's -70..60)
      for (let i = 0; i < 10; i++) {
        frame();
        const s = walk.snapshot()!, body = outside(t, s), gun = outside(t, gunDrawn());
        if (body || gun) lines.push(`${stop} flick frame ${i}: the mover ${body ?? 'in'}, drawn gun ${gun ?? 'in'}`);
      }
    }
    expect(lines).toEqual([]);
  });
});

/**
 * T81-4 (research 215 s7.1, s7.9; reading, pending review): the page steers its own mover through the mount clip as the room
 * steers its (`SeatSteer`, `FUN_005b3340`), the move laid with no collision (`TURRET_STEER_WALLS_READING`: the turret set
 * restores the unresolved move, `FUN_005483d0` D:L413908-413918) -- `TurretPage.holdTick` while the clip plays, the shape
 * through `TurretPageDeps.mountShape`. Was: the page placed nothing until the hold, the room's steer reaching it only
 * through the reconcile (2.96 behind at the clip's end), and the hold's first tick drew a step of 3.07.
 */
const PACK = fixture('RUN/MOTION_P.ZAR');
describe.skipIf(PACK === null || READERC === null)(`T81-4: the page's own mount steer${PACK === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("through the mount clip the page's own mover is steered onto the seat (from 12 behind, 0.215 from the hold's place when the clip comes off, as the room's), and across the hold's start the drawn body steps no more than 0.35 in a frame (FUN_005b3340, then FUN_00585cd0)", () => {
    const DEG = Math.PI / 180;
    const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
    const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
    const t = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [10, 13.69, 20], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [10, 13.69, 20], firepointOrigin: [10, 13.69, 15], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: null, ammoInit: 750,
    } as unknown as TurretPlacement;
    const all = parseMotionZar(Zar.parse(PACK!)), table = motionTableFromArchive(READERC!);
    const ground = packGround(PARAMS, [FLOOR], OWNERS);
    const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    const camera: WalkCamera = {
      pose: () => ({ ...pose }) as never, setPose: (p) => { Object.assign(pose, p); }, moveTo: () => undefined, setWalking: () => undefined,
      setPitchLimits: () => undefined, placeView: () => undefined, groundWish: () => ({ forward: 0, right: 0, boost: false }),
    };
    const walk = new WalkMode(camera);
    walk.setGround(ground, [10, 0, 32]);
    expect(walk.respawn([10, 0, 32], 0)).toBe(true);                // 12 behind the gun, facing its way
    let clock = 0;
    const page = new TurretPage({
      turrets: () => [t], feet: () => walk.feet(),
      look: () => ({ yaw: pose.yaw, pitch: pose.pitch }), setLook: (yaw, pitch) => { pose.yaw = yaw; pose.pitch = pitch; },
      setLocked: (on) => walk.setLocked(on), bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 0 }),
      clips: () => ({ clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: TURRET_HOLD_CLIP, frameCount: 3 }], table: [['seal_stand2turret', { playback: 0.3 }]] }),
      mountShape: (hand) => mountShape(all.filter((c) => TURRET_CLIPS.includes(c.name)), table, hand),
      now: () => clock,
    });
    walk.setTurretHold((w) => { page.holdTick(w); });
    walk.setNetTap(() => undefined);
    for (let i = 0; i < 10; i++) { clock += TICK; walk.frame(TICK); page.frame(); }
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    const hold = holdPlace(t, t.facing);
    let last = walk.drawnFeet()!, holdStart: number | null = null, atClipEnd: number | null = null;
    const steps: number[] = [];
    for (let i = 0; i < 40; i++) {
      const before = page.ownPose()?.clip;
      const feetBefore = walk.feet()!;
      clock += TICK; walk.frame(TICK); page.frame();
      const now = page.ownPose()?.clip, d = walk.drawnFeet()!;
      steps.push(Math.hypot(d[0] - last[0], d[2] - last[2]));
      last = d;
      if (holdStart === null && before !== TURRET_HOLD_CLIP && now === TURRET_HOLD_CLIP) {
        holdStart = i;
        atClipEnd = Math.hypot(feetBefore[0] - hold[0], feetBefore[2] - hold[2]);   // the feet the steer left, before the hold's tick
      }
    }
    expect(holdStart, 'the hold began').not.toBeNull();
    const across = Math.max(steps[holdStart!]!, steps[holdStart! + 1]!, steps[holdStart! + 2]!);
    const got = { atClipEnd: Number(atClipEnd!.toFixed(3)), across: Number(across.toFixed(3)) };
    // The clip's end within 0.25 of the hold's place (the read law's 0.215 at 60 Hz); the drawn step across the hold's start within 0.35.
    console.log(`T81-4 page steer: ${JSON.stringify(got)}`);
    expect(got.atClipEnd <= 0.25 && got.across <= 0.35, `the feet at the clip's end and the drawn step across the hold's start: ${JSON.stringify(got)}`).toBe(true);
  });
});

describe('PAR-55: the weapon box while mounted is the kit\'s, holding the turret\'s weapon (research 215 s8)', () => {
  it("turretBox: the mount pours the turret's rounds into magazines of Ammo_Capacity, the remainder last, the first in the weapon (FUN_005bc5d0 D:L473890-473903); the box is the magazine in the weapon over Ammo_Capacity and the others with rounds (FUN_00237760 D:L85155-85201, FUN_005c49b0)", () => {
    expect(turretBox(750, 750, 250)).toEqual({ rounds: 250, capacity: 250, spare: 2 });
    expect(turretBox(750, 711, 250)).toEqual({ rounds: 211, capacity: 250, spare: 2 });   // the owner's 711: 39 spent
    expect(turretBox(750, 500, 250)).toEqual({ rounds: 250, capacity: 250, spare: 1 });   // the first run out, the next in
    expect(turretBox(750, 1, 250)).toEqual({ rounds: 1, capacity: 250, spare: 0 });
    expect(turretBox(750, 0, 250)).toEqual({ rounds: 0, capacity: 250, spare: 0 });
    expect(turretBox(711, 711, 250)).toEqual({ rounds: 250, capacity: 250, spare: 2 });   // a mount on 711: [250, 250, 211]
    expect(turretBox(711, 300, 250)).toEqual({ rounds: 89, capacity: 250, spare: 1 });    // 411 spent: [0, 89, 211]
    expect(turretBox(100, 100, 250)).toEqual({ rounds: 100, capacity: 250, spare: 0 });   // one part magazine
    expect(turretBox(225, 225, 75)).toEqual({ rounds: 75, capacity: 75, spare: 2 });      // LMG TURRET
    expect(turretBox(500, 600, 250)).toEqual({ rounds: 250, capacity: 250, spare: 2 });   // more than poured: poured anew
  });

  it.skipIf(ZWEAPON === null)("turretWeapon: the disc's turret records through readKitTable -- PKM TURRET 205 Turret_RMG.tif 250 a magazine, LMG TURRET 207 Turret_LMG.tif 75, each AUTO, the first of its modes from 0 (FUN_005c4600)", () => {
    const table = readKitTable(ZWEAPON!);
    expect(turretWeapon(table, 'PKM TURRET')).toEqual({ id: 205, capacity: 250, icon: 'turret_rmg.tif', fireMode: 3, reload: '.M63A_RLD' });
    expect(turretWeapon(table, 'LMG TURRET')).toEqual({ id: 207, capacity: 75, icon: 'turret_lmg.tif', fireMode: 3, reload: '.M63A_RLD' });
    expect(turretWeapon(table, 'M4A1 SD')).toBeNull();                                  // a kit's firearm is no turret's
    expect(turretWeapon(table, null)).toBeNull();
    expect(turretWeapon(null, 'PKM TURRET')).toBeNull();
  });

  it("a seated page's box: the held turret's weapon (TurretPageDeps.weapon by its WEAPON NAME) -- poured at the mount, its icon and its mode; another's seat and none give the firearm's (null)", () => {
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'PKM TURRET', ammoInit: 750,
    } as unknown as TurretPlacement;
    const asked: (string | null)[] = [];
    const page = new TurretPage({
      turrets: () => [place], feet: () => null, look: () => null, setLook: () => {}, setLocked: () => {}, bodyLook: () => null, move: () => {},
      net: () => ({ role: 'player', id: 1, send: () => {}, lastSeq: () => 0 }),
      weapon: (name) => { asked.push(name); return name === 'PKM TURRET' ? { id: 205, capacity: 250, icon: 'turret_rmg.tif', fireMode: 3 } : null; },
    });
    page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750 });                     // another's seat: not this page's box
    expect([page.hudAmmo(), page.hudIcon(), page.hudFireMode()]).toEqual([null, null, null]);
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 711 });                     // this page's, on 711 left
    expect([page.hudAmmo(), page.hudIcon(), page.hudFireMode()]).toEqual([{ rounds: 250, capacity: 250, spare: 2 }, 'turret_rmg.tif', 3]);
    expect(asked.at(-1)).toBe('PKM TURRET');
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 400 });
    expect(page.hudAmmo()).toEqual({ rounds: 189, capacity: 250, spare: 1 });          // [0, 189, 211]
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 400 });
    expect([page.hudAmmo(), page.hudIcon(), page.hudFireMode()]).toEqual([null, null, null]);
  });
});

describe.skipIf(ZWEAPON === null)(`PAR-57: the MGL turret's weapon box (research 215 s8)${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  // The disc's zweapon.rdr through readKitTable: MGL FRAG TURRET 230 (class 230, `turret2`) -- `IconTextureName`
  // Turret_MGL.tif, `Ammo_Capacity` 24, `NumMags` 3, `MaxFireMode` 1 (SINGLE). The box (`FUN_00237760` D:L85155-85247)
  // draws it as it draws the PKM: no gate of its own for class 230 -- the `+0x7c == 11` gate is the Designator's id, the
  // online `cVar3` gate is the classes 4, 31, 51, 81, 91, 101 and 141, and the figures are the plain magazine's
  // (`FUN_005bd7f0` is 0: 230 is no carrier and not class 145, `FUN_003c5d80` D:L317277).
  it("turretWeapon: MGL FRAG TURRET 230 Turret_MGL.tif, 24 a magazine, SINGLE -- the box's; the room's firearm table (turretRecords) keeps class 205's, its round is in rounds (PAR-59)", () => {
    const table = readKitTable(ZWEAPON!);
    expect(turretWeapon(table, 'MGL FRAG TURRET')).toEqual({ id: 230, capacity: 24, icon: 'turret_mgl.tif', fireMode: 1, reload: '.M203_GREN_RLD' });
    expect(table.turretRecords?.has(230)).toBe(false);   // never a firearm line: PAR-59, the room launches its round (`rounds`)
    expect(table.rounds.get(230)?.record).toMatchObject({ name: 'MGL FRAG TURRET', muzzleVelocity: 270, gravity: 39 });
    expect([...(table.turretRecords?.keys() ?? [])].sort((a, b) => a - b)).toEqual([205, 207]);
  });

  it("a seated page's box on an MGL mount: 72 poured into magazines of 24 -- 24/24, 2 MAGS, Turret_MGL.tif; one fired, 23/24", () => {
    const table = readKitTable(ZWEAPON!);
    const DEG = Math.PI / 180;
    const place = {
      id: 0, root: 'worldmodel/mp10_turret_mgl', name: 'mp10_turret_mgl', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-25 * DEG, 10 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'MGL FRAG TURRET', ammoInit: 72,
    } as unknown as TurretPlacement;
    const page = new TurretPage({
      turrets: () => [place], feet: () => null, look: () => null, setLook: () => {}, setLocked: () => {}, bodyLook: () => null, move: () => {},
      net: () => ({ role: 'player', id: 1, send: () => {}, lastSeq: () => 0 }),
      weapon: (name) => turretWeapon(table, name),
    });
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 72 });
    expect([page.hudAmmo(), page.hudIcon(), page.hudFireMode()]).toEqual([{ rounds: 24, capacity: 24, spare: 2 }, 'turret_mgl.tif', 1]);
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 71 });
    expect(page.hudAmmo()).toEqual({ rounds: 23, capacity: 24, spare: 2 });
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 71 });
    expect([page.hudAmmo(), page.hudIcon(), page.hudFireMode()]).toEqual([null, null, null]);
  });
});

/**
 * TURRET-RETICLE (issue #283; research 215 s8.2): where the turret's rounds go against the drawn reticle. Mounted, the
 * kit's fire takes its origin from the turret's vfunc `+0x60` (the firepoint's world place, `turret+0x380`) and then
 * overwrites the direction it converged on the aim point with the turret's vfunc `+0x68` (the gun part's world -z,
 * `turret+0x38c`): `FUN_005be9a0` D:L475525, D:L475600 (the vtable 0x408250's words 0x3a71a0 / 0x3a71d0, the ELF's
 * bytes). So the round runs down the gun's own line, parallel to the reticle's ray (the camera's look, the gun's aim at
 * rest), never onto its point: from the third-person camera over the hold's place (-3.257, ., 4.282) the line passes
 * about 3.26 right of the reticle and 5.1 below it, at every range. A pin of the as-read behaviour at rest (no flick):
 * a change that converged the rounds on the reticle's point would fail it.
 */
describe.skipIf(!READY || fixture('RUN/MOTION_P.ZAR') === null)(`TURRET-RETICLE: the round against the reticle at rest (issue #283)${READY ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("TURRET-RETICLE: at rest the round runs parallel to the reticle's ray, about 3.26 right and 5.1 below it at 20 and 100 units, on Crossroads' two turrets straight and at both yaw stops (FUN_005be9a0 D:L475525, D:L475600: no convergence mounted)", () => {
    const sim = simMapFromBytes(MP72!, 'RUN/MP72.ZDB', { table: readKitTable(ZWEAPON!), readerc: READERC! });
    const hold = parseMotionZar(Zar.parse(fixture('RUN/MOTION_P.ZAR')!)).find((c) => c.name === TURRET_HOLD_CLIP)!;
    const root = hold.parts.find((p) => p.name === 'skel_root')!.translations;
    const sub = (a: readonly number[], b: readonly number[]): number[] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
    const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const lines: string[] = [];
    let checks = 0;
    // The review's F3: the round as this page fires it (`TurretPage.round`, its `from` and `dir`), the turret held through
    // the room's own event, the look the page's -- so a convergence written into the page's fire path fails here.
    let look = { yaw: 0, pitch: 0 };
    const page = new TurretPage({
      turrets: () => sim.turrets ?? [], feet: () => null, look: () => look, setLook: (yaw, pitch) => { look = { yaw, pitch }; },
      setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 0 }),
    });
    expect(sim.turrets!.map((t) => t.name)).toEqual(['mp72_turret02', 'mp72_turret01']);
    for (const t of sim.turrets!) {
      page.event({ type: 'turret', id: t.id, occupant: 1, ammo: 750 });
      expect(page.mounted(), t.name).toBe(t.id);
      for (const yaw of [t.facing, t.facing + (t.limits.yaw![0] * 180) / Math.PI, t.facing + (t.limits.yaw![1] * 180) / Math.PI]) {
        const aim = clampAim(t, yaw, 0);
        const w = new Walker(sim.grid);
        w.place(t.origin[0], t.origin[1] + probeLiftOf('stand'), t.origin[2]);
        w.state.yaw = aim.yaw;
        expect(holdStep(t, w), `${t.name}: a floor at the hold's place`).toBe(true);
        // The walk's camera on the body as the page draws it: the hold clip's root at the level key (`Play` -> `setPosedRoot`).
        const rootY = root.length > 3 ? root[Math.round(turretHoldKey(aim.pitch)) * 3 + 1]! : root[1]!;
        const cam = new PlayerCamera(sim.grid);
        for (let i = 0; i < 600; i++) cam.tick([w.state.x, w.state.y, w.state.z], aim.yaw, aim.pitch, rootY, 1 / 60, true);
        const v = cam.view(1), l = Math.hypot(...sub(v.far, v.eye));
        const fwd = sub(v.far, v.eye).map((x) => x / l), right = [-fwd[2]!, 0, fwd[0]!].map((x) => x / Math.hypot(fwd[0]!, fwd[2]!));
        const up = [right[1]! * fwd[2]! - right[2]! * fwd[1]!, right[2]! * fwd[0]! - right[0]! * fwd[2]!, right[0]! * fwd[1]! - right[1]! * fwd[0]!];
        look = { ...aim };
        const fired = page.round()!;
        const from = fired.from, dir = fired.dir;
        const angle = (Math.acos(Math.min(1, dot(dir, fwd))) * 180) / Math.PI;
        for (const R of [20, 100]) {
          const rel = sub(from.map((x, i) => x + dir[i]! * R), v.eye);
          const x = dot(rel, right), y = dot(rel, up);
          checks++;
          if (!(angle <= 0.01 && x >= 3.2 && x <= 3.35 && -y >= 4.9 && -y <= 5.4)) {   // NaN fails too
            lines.push(`${t.name} aim ${aim.yaw.toFixed(1)} at ${R}: ${angle.toFixed(3)} deg off parallel, ${x.toFixed(2)} right, ${(-y).toFixed(2)} below`);
          }
        }
      }
      page.event({ type: 'turret', id: t.id, occupant: null, ammo: 750 });
    }
    expect(lines).toEqual([]);
    expect(checks, 'two turrets, three aims, two ranges').toBe(12);
  });
});

/**
 * TURRET-AMMO, the page half (issue #284; research 215 s8 "The original's reload", `TURRET_RELOAD_READING`,
 * `TURRET_AMMO_HUD_READING`): the occupant's page follows the room's `mags` (the viewer protocol's `TurretMags`: all ten
 * magazines, zeros in place, the one in the weapon, whether `ReloadDelay` runs). The box is the magazine in the weapon
 * over `Ammo_Capacity` (`FUN_00237760` D:L85155-85247, `FUN_005c3890`), MAG the entries over 0 less one, hidden below 1
 * (`FUN_005c49b0` D:L478758-478772, D:L85191-85203); the trigger is not read while the timer runs (`FUN_005c0fd0`
 * D:L476549-476567); R mounted is the turret's (`FUN_00594cf0` D:L453460-453463); the walk's put-in plays the record's
 * `ReloadSound` at the actor (`FUN_005c2a90` D:L477483-477488). No game data: a synthetic placement.
 */
describe("TURRET-AMMO: the mounted turret's magazines on the occupant's page (#284, research 215 s8)", () => {
  const DEG = Math.PI / 180;
  const ten = (...r: number[]): number[] => [...r, ...new Array<number>(10 - r.length).fill(0)];
  const PKM = { id: 205, capacity: 250, icon: 'turret_rmg.tif', fireMode: 3, reload: '.M63A_RLD' };
  const MGL = { id: 230, capacity: 24, icon: 'turret_mgl.tif', fireMode: 1, reload: '.M203_GREN_RLD' };
  const seat = (weapon: typeof PKM | null = PKM, ammoInit = 750) => {
    const place = {
      id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
      parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
      gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
      mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'PKM TURRET', ammoInit,
    } as unknown as TurretPlacement;
    const sent: ClientEvent[] = [], sounds: [string, V3 | null][] = [];
    let seq = 40;
    const page = new TurretPage({
      turrets: () => [place], feet: () => [1, 2, 3], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => {}, setLocked: () => {}, bodyLook: () => null, move: () => {},
      net: () => ({ role: 'player', id: 1, send: (ev) => { sent.push(ev); }, lastSeq: () => seq }),
      weapon: () => weapon,
      sound: (name, at) => { sounds.push([name, at]); },
    });
    const tell = (ammo: number, mags?: { rounds: number[]; current: number; reloading: boolean }): void => {
      page.event({ type: 'turret', id: 0, occupant: 1, ammo, ...(mags ? { mags } : {}) } as ServerEvent);
    };
    /** The sounds but the mount's and the release's (`TURRET_SOUNDS`). */
    const reloads = (): [string, V3 | null][] => sounds.filter(([n]) => n !== TURRET_SOUNDS.mount && n !== TURRET_SOUNDS.release);
    return { page, sent, reloads, tell, setSeq: (n: number) => { seq = n; } };
  };

  it("turretMagsBox: the magazine in the weapon over Ammo_Capacity, MAG the entries over 0 less one, hidden below 1 -- through the pause after the PKM's first magazine the original's own 0/250 and 1 MAG", () => {
    expect(turretMagsBox({ rounds: ten(0, 250, 250), current: 0, reloading: true }, 250)).toEqual({ rounds: 0, capacity: 250, spare: 1 });
    expect(ammoLines(turretMagsBox({ rounds: ten(0, 250, 250), current: 0, reloading: true }, 250))).toEqual({ rounds: '0/250', mags: '1 MAG' });
    expect(turretMagsBox({ rounds: ten(0, 250, 250), current: 1, reloading: false }, 250)).toEqual({ rounds: 250, capacity: 250, spare: 1 });
    expect(turretMagsBox({ rounds: ten(240, 250, 250), current: 0, reloading: true }, 250)).toEqual({ rounds: 240, capacity: 250, spare: 2 });
    expect(ammoLines(turretMagsBox({ rounds: ten(0, 0, 1), current: 2, reloading: false }, 250))).toEqual({ rounds: '1/250', mags: null });   // hidden below 1
    expect(turretMagsBox({ rounds: ten(), current: 2, reloading: false }, 250)).toEqual({ rounds: 0, capacity: 250, spare: 0 });            // dry
  });

  it("the seated page's box follows the room's mags: the mount's pour before any tell, then the pause's 0/250 and 1 MAG, the landing's 250/250 -- the occupant's rounds tell wins over the page's own pour", () => {
    const { page, tell } = seat();
    tell(750);                                                                     // the mount's broadcast: no mags
    expect(page.hudAmmo()).toEqual({ rounds: 250, capacity: 250, spare: 2 });
    tell(500, { rounds: ten(0, 250, 250), current: 0, reloading: true });          // the 250th round armed the reload
    expect(page.hudAmmo()).toEqual({ rounds: 0, capacity: 250, spare: 1 });
    expect(ammoLines(page.hudAmmo()!)).toEqual({ rounds: '0/250', mags: '1 MAG' });
    tell(500, { rounds: ten(0, 250, 250), current: 1, reloading: false });         // the landing: the walk's next
    expect(page.hudAmmo()).toEqual({ rounds: 250, capacity: 250, spare: 1 });
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 500 });             // the release: the firearm's box
    expect(page.hudAmmo()).toBeNull();
    tell(500);                                                                     // a re-mount: no mags kept from the last hold
    expect(page.hudAmmo()).toEqual({ rounds: 250, capacity: 250, spare: 1 });
    expect(page.reloading()).toBe(false);
  });

  it("LATER 219: no release offered while the turret's own reload runs (action 20 behind the prompt's common gate, `FUN_00593500` D:L452277 -> `FUN_005a7de0` D:L462636 -> `FUN_005a7ab0`; research 215 s8.6) -- no prompt, the press sends nothing and stays the turret's; the landing's tell offers it again (was: offered and sent)", () => {
    const { page, tell, sent, setSeq } = seat();
    // The mount keyed on its command (A1's `after`): the release's wait (LATER 151) counted in commands and run out.
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 16, after: 0 } } as ServerEvent);
    setSeq(TURRET_RELEASE_WAIT_TICKS + 50);
    expect(page.prompt(), 'seated, no reload: offered').toBe('turret_dismount');
    tell(500, { rounds: ten(0, 250, 250), current: 0, reloading: true });          // the reload armed
    expect(page.prompt(), "the turret's ReloadDelay: none").toBeNull();
    sent.length = 0;
    expect(page.action(), 'the press stays the turret\'s').toBe(true);
    expect(sent, 'no dismount sent').toEqual([]);
    tell(500, { rounds: ten(0, 250, 250), current: 1, reloading: false });         // the landing
    expect(page.prompt()).toBe('turret_dismount');
    expect(page.action()).toBe(true);
    expect(sent.map((e) => e.type)).toEqual(['dismount']);
  });

  it("LATER 219's review F2: this page's own R arms the timer at its press, as the original arms `+0x820` locally (`FUN_00594cf0` D:L453460-453463) -- no release offered from the press until the room's tell, which then governs (`TURRET_OWN_RELOAD_TELL_ADAPTATION`); a tell never coming, offered again past its bound", () => {
    const { page, tell, sent, setSeq } = seat();
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 16, after: 0 } } as ServerEvent);
    const at = TURRET_RELEASE_WAIT_TICKS + 50;
    setSeq(at);
    expect(page.prompt()).toBe('turret_dismount');
    expect(page.reload()).toBe(true);
    expect(sent.map((e) => e.type)).toEqual(['reload']);
    expect(page.prompt(), "the page's own R: none before the tell").toBeNull();
    expect(page.reloading()).toBe(true);
    tell(750, { rounds: ten(250, 250, 250), current: 0, reloading: true });       // the room's arm told
    expect(page.prompt()).toBeNull();
    tell(750, { rounds: ten(250, 250, 250), current: 1, reloading: false });      // the landing
    expect(page.prompt(), 'the landing: offered').toBe('turret_dismount');
    page.reload();                                                                 // a second R, the room never telling
    expect(page.prompt()).toBeNull();
    setSeq(at + TURRET_OWN_RELOAD_TELL_ADAPTATION + 1);
    expect(page.prompt(), 'past the bound: offered').toBe('turret_dismount');
  });

  it("an older room (no mags on any tell): today's box stands -- the count poured at the mount into magazines, the next one in at once (turretBox)", () => {
    const { page, tell } = seat();
    tell(750);
    tell(500);
    expect(page.hudAmmo()).toEqual({ rounds: 250, capacity: 250, spare: 1 });
    expect(page.hudAmmo()).toEqual(turretBox(750, 500, 250));
    expect(page.reloading()).toBe(false);
  });

  it("the trigger claims nothing while the reload's ReloadDelay runs (FUN_005c0fd0 D:L476549-476567): reloading() true from the arm's tell to the landing's, no round drawn meanwhile; the page spends its own predicted rounds between tells, never refilling, and the next tell wins", () => {
    const { page, tell } = seat();
    tell(750);
    expect(page.reloading()).toBe(false);
    tell(500, { rounds: ten(0, 250, 250), current: 0, reloading: true });
    expect(page.reloading()).toBe(true);
    expect(page.round()).toBeNull();                                               // nothing leaves in the pause
    tell(500, { rounds: ten(0, 250, 250), current: 1, reloading: false });
    expect(page.reloading()).toBe(false);
    expect(page.round()).not.toBeNull();                                           // the gun fires again at once
    expect(page.hudAmmo()).toEqual({ rounds: 249, capacity: 250, spare: 1 });     // the page's own spend, predicted
    tell(498, { rounds: ten(0, 2, 250), current: 1, reloading: false });           // the room's word
    expect(page.round()).not.toBeNull();
    expect(page.round()).not.toBeNull();
    expect(page.hudAmmo()).toEqual({ rounds: 0, capacity: 250, spare: 0 });       // predicted dry: no local refill
    expect(page.round()).toBeNull();                                               // and nothing drawn past it
    tell(496, { rounds: ten(0, 0, 250), current: 1, reloading: true });
    expect(page.reloading()).toBe(true);
  });

  it("the review's F5: a predicted last round the room refused (rate, or any other drop) is not final -- the room's re-sync tell gives the magazine back and the gun fires again, no R needed", () => {
    const { page, tell } = seat();
    tell(750);
    tell(501, { rounds: ten(1, 250, 250), current: 0, reloading: false });          // one round left in the weapon
    expect(page.round()).not.toBeNull();                                           // the page spends it, predicted
    expect(page.hudAmmo()).toEqual({ rounds: 0, capacity: 250, spare: 1 });
    expect(page.round()).toBeNull();                                               // predicted dry
    tell(501, { rounds: ten(1, 250, 250), current: 0, reloading: false });          // the room dropped it ('rate'): its true mags
    expect(page.reloading()).toBe(false);
    expect(page.hudAmmo()).toEqual({ rounds: 1, capacity: 250, spare: 2 });
    expect(page.round()).not.toBeNull();                                           // the gun is not dead until R
  });

  it("R while mounted is the turret's reload, sent at the press with the page's last command (the room arms from it, FUN_00594cf0 D:L453460-453463); unmounted it takes nothing; the MGL's R reloads it too", () => {
    const { page, sent, tell, setSeq } = seat();
    expect(page.reload()).toBe(false);                                             // not mounted: the rifle's
    expect(sent).toEqual([]);
    tell(750);
    setSeq(57);
    expect(page.reload()).toBe(true);
    expect(sent).toEqual([{ type: 'reload', seq: 57 }]);
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    expect(page.reload()).toBe(false);
    const mgl = seat(MGL, 72);
    mgl.tell(72);
    expect(mgl.page.reload()).toBe(true);
    expect(mgl.sent).toEqual([{ type: 'reload', seq: 40 }]);
  });

  it("the put-in plays the record's ReloadSound at the occupant's body (FUN_005c2a90 D:L477483-477488: the index written, then the sound) -- the landing, reloading true to false with the magazine changed, and a dry pull's put-in at once; nothing at the arm, at a round, on a hold's first tell or at a landing with nothing to put in", () => {
    const { reloads, tell } = seat();
    tell(750);
    tell(749, { rounds: ten(249, 250, 250), current: 0, reloading: false });       // the first tell of the hold
    tell(500, { rounds: ten(0, 250, 250), current: 0, reloading: true });          // the arm
    expect(reloads()).toEqual([]);
    tell(500, { rounds: ten(0, 250, 250), current: 1, reloading: false });         // the landing
    expect(reloads()).toEqual([['.M63A_RLD', [1, 2, 3]]]);
    tell(499, { rounds: ten(0, 249, 250), current: 1, reloading: false });         // a round
    tell(250, { rounds: ten(0, 0, 250), current: 2, reloading: false });           // a dry pull's put-in at once (D:L476616-476622)
    expect(reloads()).toHaveLength(2);
    tell(0, { rounds: ten(), current: 2, reloading: true });
    tell(0, { rounds: ten(), current: 2, reloading: false });                      // the walk found none: nothing written
    expect(reloads()).toHaveLength(2);
    const mgl = seat(MGL, 72);
    mgl.tell(72);
    mgl.tell(48, { rounds: ten(0, 24, 24), current: 0, reloading: true });
    mgl.tell(48, { rounds: ten(0, 24, 24), current: 1, reloading: false });
    expect(mgl.reloads()).toEqual([['.M203_GREN_RLD', [1, 2, 3]]]);
  });
});

/**
 * LATER 96, the page half (LATER 91's review F3; research 215 s7.9; reading, pending review): only this page's own mount is
 * re-timed off the wire's `steer`. Another occupant's mount pose is dated at the event's arrival, as its body is drawn off
 * the snapshots behind the room (`INTERP_DELAY_MS`), whether the broadcast carries `ticks` alone or `ticks` and `after`
 * (was: dated `(ticks + 1) / TICK_HZ` back on every occupant, its pose a tick ahead of its drawn body).
 */
describe("LATER 96 (F3): another occupant's mount pose keeps the event's arrival (no game data)", () => {
  it("a broadcast's `steer` re-dates no other occupant's clip: frame 0 at the arrival, `ticks` alone or with `after`", () => {
    const { page, advance } = seated({ yaw: 0, pitch: 0 }, { yaw: 10, pitch: 0 });
    advance(5);
    page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750, steer: { ticks: 0, after: 40 } });
    expect(page.turretPose(7)!.clip).toBe('seal_stand2turret');
    expect(page.turretPose(7)!.frame, "7's clip from the arrival (`ticks` and `after`)").toBe(0);
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    advance(1);
    page.event({ type: 'turret', id: 0, occupant: 9, ammo: 750, steer: { ticks: 0 } });
    expect(page.turretPose(9)!.frame, "9's clip from the arrival (`ticks` alone)").toBe(0);
    advance(RUN_S / 2);
    expect(page.turretPose(9)!.frame).toBeCloseTo(12.5, 6);
  });
});

/**
 * TURRET-CONE P2, the page's roll (research 215 s8.2; reading, pending review): mounted, `FUN_005be9a0` overwrites the
 * direction it converged with the gun's own line (the turret's vfunc `+0x68`, D:L475600), then the controller's `+0x74`
 * -- `FUN_00592260`, the cone (D:L475601-475602; D:L451531-451577, `./accuracy` `perturb`) -- rolls it, on the turret
 * record's cone (`MatchFirearm.turretCone`, handed in by `TurretPage.setSpread`). So `TurretPage.round`'s `dir` is the gun
 * line plus the cone: a square of half side `radius` about the offsets, each axis `radius x signed u^2` (`u` uniform in
 * [-1, 1)), so about 70.7 per cent of rounds fall inside the inner half on each axis (|u| < sqrt(0.5)). The port
 * normalises the line (the original leaves it unnormalised; s8.2's known deviation). No game data: a synthetic placement.
 */
describe('TURRET-CONE P2: the page rolls the turret round on the turret record\'s cone (research 215 s8.2)', () => {
  const DEG = Math.PI / 180;
  const PLACE = {
    id: 0, root: 'worldmodel/syn_turret', name: 'syn_turret', origin: [0, 0, 0], facing: 0,
    parts: { turret: 'syn/turret', gun: 'syn/turret/gun', firepoint: 'syn/turret/gun/firepoint' },
    gunOrigin: [0, 0, 0], firepointOrigin: [0, 0.5, -5], limits: { yaw: [-70 * DEG, 70 * DEG], pitch: [-45 * DEG, 45 * DEG] },
    mountRange: 22, mountAngleCos: Math.cos(35 * DEG), weapon: 'PKM TURRET', ammoInit: 750,
  } as unknown as TurretPlacement;
  const unitV = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
  const seeded = (s0: number): (() => number) => { let s = s0; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  /** A page seated on the synthetic turret by the room's event, looking at `aim`; `ammo` the room's count. */
  const seated = (aim = { yaw: 30, pitch: -10 }, ammo = 1_000_000) => {
    const page = new TurretPage({
      turrets: () => [PLACE], feet: () => null, look: () => aim, setLook: () => undefined, setLocked: () => undefined,
      bodyLook: () => null, move: () => undefined, net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => 0 }),
    });
    page.event({ type: 'turret', id: 0, occupant: 1, ammo });
    expect(page.mounted()).toBe(0);
    return page;
  };
  /** PKM TURRET's 'stand' row at TargetMax 35 (zweapon.rdr; s8.2's table): the widest honest cone, size x ty x 0.707. */
  const WIDE: Cone = { offsetX: 0, offsetY: 0, radius: 35 * tangentPerPixel().y * RADIUS_FACTOR };

  it("TURRET-CONE P2: with no spread set (and with a zero cone) the round's dir is exactly the gun line -- the TURRET-RETICLE parallel pin's case", () => {
    const page = seated();
    expect(page.round()!.dir).toEqual(gunLine(30, -10));
    page.setSpread(() => ({ offsetX: 0, offsetY: 0, radius: 0 }), seeded(3));
    expect(page.round()!.dir).toEqual(gunLine(30, -10));
    page.setSpread(null);
    expect(page.round()!.dir).toEqual(gunLine(30, -10));
  });

  it('TURRET-CONE P2: the round\'s dir is unit(perturb(gun line, cone, random)) on the seeded random -- the offsets carried, the from and the frame the gun\'s (FUN_00592260 D:L451573-451575)', () => {
    const page = seated();
    const cone: Cone = { offsetX: 0.004, offsetY: -0.003, radius: 0.03 };
    page.setSpread(() => cone, seeded(11));
    const mirror = seeded(11);
    for (let i = 0; i < 20; i++) {
      const r = page.round()!;
      expect(r.dir).toEqual(unitV(perturb(gunLine(30, -10), cone, mirror)));
      expect(r.from).toEqual(muzzleAt(PLACE, 30, -10));
      expect(Math.hypot(...r.dir)).toBeCloseTo(1, 12);
    }
    // The offsets alone (radius 0): the line stands exactly at them in FUN_00592260's axes (`coneCoords`, perturb inverted).
    page.setSpread(() => ({ offsetX: 0.01, offsetY: -0.02, radius: 0 }));
    const at = coneCoords(gunLine(30, -10), page.round()!.dir)!;
    expect(at[0]).toBeCloseTo(0.01, 12);
    expect(at[1]).toBeCloseTo(-0.02, 12);
  });

  it('TURRET-CONE P2: over 20000 rounds every one lies within +-radius on both axes about the gun line, and about 70.7 per cent inside the inner half on each (signed u^2)', () => {
    const page = seated();
    page.setSpread(() => WIDE, seeded(5));
    const R = WIDE.radius;
    let inA = 0, inB = 0, outside = 0, wideA = 0, wideB = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const [a, b] = coneCoords(gunLine(30, -10), page.round()!.dir)!;
      if (Math.abs(a) > R * (1 + 1e-9) || Math.abs(b) > R * (1 + 1e-9)) outside++;
      if (Math.abs(a) < R / 2) inA++;
      if (Math.abs(b) < R / 2) inB++;
      if (Math.abs(a) > 0.9 * R) wideA++;
      if (Math.abs(b) > 0.9 * R) wideB++;
    }
    console.log(`TURRET-CONE P2: PKM at 35 px, radius ${R.toFixed(6)}; inner half ${(inA / N).toFixed(4)} / ${(inB / N).toFixed(4)}; past 0.9 R ${wideA} / ${wideB}`);
    expect(outside).toBe(0);
    expect(Math.abs(inA / N - Math.SQRT1_2)).toBeLessThan(0.015);
    expect(Math.abs(inB / N - Math.SQRT1_2)).toBeLessThan(0.015);
    expect(Math.min(wideA, wideB)).toBeGreaterThan(0);              // the square is reached, not a disc inside it
  });

  it("TURRET-CONE P2: the cone is read once a round, as the round leaves (the review's F2 is the caller's: before the bloom) -- none when nothing leaves (the room's count spent)", () => {
    const page = seated({ yaw: 0, pitch: 0 }, 2);
    let reads = 0;
    page.setSpread(() => { reads++; return WIDE; }, seeded(9));
    expect(page.round()).not.toBeNull();
    expect(reads).toBe(1);
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 0 });     // the room's count spent: no round, no roll
    expect(page.round()).toBeNull();
    expect(reads).toBe(1);
  });
});

/**
 * LATER 104 (research 215 s7.9; reading, pending review): the own release predicted at the press. The room takes a dismount
 * on the first command above its `seq` and refuses it 'mounting' iff that `seq` is below the mount's `after` + 17
 * (`TURRET_RELEASE_SEQ_ADAPTATION`: the page's own count, the 16 steer steps and the hold's command), so this page -- which
 * keys its own clip on the same count (LATER 96) -- knows at the press whether the release will be taken: its own clip off,
 * it lets the hold go at once (the lock, the HUD, the trigger, the hold's place from the next command), plays
 * `.RELEASE_TURRET` and starts the reversed clip there (`FUN_00545ee0` D:L411968-411971, `FUN_005a6eb0` D:L462136-462170,
 * on the press's frame on the original's own console); the room's event then changes nothing of it. Its clip still on,
 * nothing is predicted. A refusal the room tells (the occupant's own `turret` event naming it still) undoes the prediction.
 * No game data: a synthetic placement over a flat floor, the clips' key counts and playbacks alone.
 */
describe("LATER 104: the own release predicted at the press (no game data)", () => {
  const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const AFTER = 40;

  /** Player 1 mounted on `PLACE` by a broadcast keyed on `after` 40, its own clip stepped one command at a time to `to`. */
  function keyed(to: number) {
    let now = 0, seq = AFTER;
    const sent: ClientEvent[] = [], locks: boolean[] = [], heard: string[] = [], moved: string[] = [];
    const look = { yaw: 0, pitch: 0 };
    const page = new TurretPage({
      turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => look, setLook: (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; },
      setLocked: (on) => locks.push(on), bodyLook: (id) => (id === 1 ? { yaw: 30, pitch: 0 } : null), move: (path) => moved.push(path),
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => seq }),
      sound: (name) => heard.push(name),
      clips: () => ({
        clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
        table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
      }),
      now: () => now,
    });
    const w = { state: { x: 0, y: 0, z: 8.5, yaw: 0, vx: 0, vz: 0, pitch: 0 }, grid: groundGrid(packGround(PARAMS, [FLOOR], OWNERS)) };
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: AFTER } });
    /** One tick: the hold for the command it sends, then that command sent. */
    const tick = (): boolean => { const placed = page.holdTick(w); seq++; now += 1 / TICK_HZ; return placed; };
    while (seq < to) tick();
    return { page, w, sent, locks, heard, moved, tick, seq: () => seq, advance: (s: number) => { now += s; } };
  }

  it("past its own clip and the release's wait (the dismount's seq after + 75 or more: LATER 151) the press predicts the release: unlocked, no hold, the HUD the rifle's, .RELEASE_TURRET and the reversed clip from the press; the room's event plays no second sound and restarts nothing", () => {
    const k = keyed(AFTER + 75);                                       // LATER 151: past the release's wait
    expect(k.page.ownPose()?.clip, 'held').toBe(TURRET_HOLD_CLIP);
    expect(k.page.action()).toBe(true);
    expect(k.sent.at(-1)).toEqual({ type: 'dismount', seq: AFTER + 75, turret: 0 });
    expect(k.page.mounted(), 'released at the press').toBeNull();
    expect(k.locks.at(-1), 'the walk unlocked').toBe(false);
    expect(k.page.hudAmmo(), 'the box the firearm\'s').toBeNull();
    expect(k.heard.filter((n) => n === TURRET_SOUNDS.release)).toHaveLength(1);
    expect(k.page.ownPose()).toEqual({ clip: 'seal_stand2turret', frame: 25, loop: false, rootY: null, mounts: { rifle: 'carry' } });
    expect(k.tick(), 'no hold placed from the next command').toBe(false);
    k.advance(RUN_S / 2);
    const mid = k.page.ownPose()!.frame;
    expect(mid).toBeLessThan(25);
    k.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });   // the room's release, a round trip later
    expect(k.heard.filter((n) => n === TURRET_SOUNDS.release), 'no second sound').toHaveLength(1);
    expect(k.page.ownPose()!.frame, 'the reversed clip not restarted').toBe(mid);
    expect(k.locks.filter((on) => !on), 'unlocked once').toHaveLength(1);
  });

  // LATER 151 (research 215 s7.11): rewritten to the release's wait. A press inside the mount clip is inside the wait too,
  // so the page sends nothing and shows no prompt (was: the dismount sent at after + 10, the room refusing it 'mounting').
  // Beside the RED "LATER 151: ... at after + 30 (0.5 s) and after + 74" (the clip off: the press kept, nothing sent, still
  // held), this keeps what that RED does not hold: the press inside the clip, the walk still locked, no release sound.
  it("its own clip still on (a press inside the window): nothing sent, nothing predicted -- inside the release's wait (LATER 151), the page stays held and locked, silent", () => {
    const k = keyed(AFTER + 10);
    expect(k.page.prompt(), 'no dismount prompt inside the wait').toBeNull();
    expect(k.page.action()).toBe(true);
    expect(k.sent.filter((e) => e.type === 'dismount'), 'nothing sent').toHaveLength(0);
    expect(k.page.mounted()).toBe(0);
    expect(k.locks).toEqual([true]);
    expect(k.heard.filter((n) => n === TURRET_SOUNDS.release)).toHaveLength(0);
  });

  it("the review's findings: a second Action within the round trip after a predicted release is kept by the turret -- true, nothing else takes it, no prompt -- and re-sends the same dismount (its seq and turret; no second sound, no clip restart), in case the first never reached the room; once the room's release lands the press is the target's as before", () => {
    const k = keyed(AFTER + 75);                                       // LATER 151: past the release's wait
    expect(k.page.action()).toBe(true);                              // the dismount, predicted
    const sent = k.sent.length, first = k.sent.at(-1), pose = k.page.ownPose();
    expect(k.page.prompt(), 'no prompt while the release is on its way').toBeNull();
    k.advance(0.05);
    const mid = k.page.ownPose()!.frame;
    expect(k.page.action(), 'the press kept by the turret (no door, switch or pickup takes it)').toBe(true);
    expect(k.sent, 'one more dismount, no mount').toHaveLength(sent + 1);
    expect(k.sent.at(-1), 'the same dismount: its seq and its turret').toEqual(first);
    expect(first).toEqual({ type: 'dismount', seq: AFTER + 75, turret: 0 });
    expect(k.heard.filter((n) => n === TURRET_SOUNDS.release), 'no second sound').toHaveLength(1);
    expect(k.page.ownPose()!.frame, 'the reversed clip not restarted').toBe(mid);
    expect(pose!.frame).toBe(25);
    expect(k.page.mounted(), 'the prediction unchanged').toBeNull();
    k.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });   // the room's release
    const target = k.page.target();
    expect(k.page.prompt()).toBe(target !== null ? 'turret_mount' : null);
    expect(k.page.action(), "the target's again").toBe(target !== null);
    if (target !== null) expect(k.sent.at(-1)).toEqual({ type: 'mount', seq: k.seq(), turret: target, word: true });
  });

  it("the freed gun is not turned by this page's own snapshot body while the room's release is on its way (frame skips the predicted turret)", () => {
    const k = keyed(AFTER + 75);
    k.page.frame();
    const before = k.moved.length;
    expect(before, 'the held gun drawn').toBeGreaterThan(0);
    expect(k.page.action()).toBe(true);
    k.page.frame();
    expect(k.moved.length, 'not moved after the press').toBe(before);
  });

  it("a refusal the room tells -- its turret event naming this page still the occupant, `refused: 'mounting'` -- undoes the prediction (a rounds tell does not): held and locked again, the hold placing the body, the reversed clip gone (TURRET_RELEASE_SEQ_ADAPTATION's undo)", () => {
    const k = keyed(AFTER + 75);
    expect(k.page.action()).toBe(true);
    expect(k.page.mounted()).toBeNull();
    k.w.state.x += 3;                                                // walked off a command meanwhile
    // A rounds tell the room sent before it took the dismount names this page still the occupant: no refusal, no undo.
    k.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 749, mags: { rounds: [249, 250, 250], current: 0, reloading: false } } as ServerEvent);
    expect(k.page.mounted(), 'a rounds tell undoes nothing').toBeNull();
    // The room's refusal, told to its occupant (`refused: 'mounting'`, the room's hunk): still the occupant.
    k.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 749, refused: 'mounting' } as ServerEvent);
    expect(k.page.mounted(), 'held again').toBe(0);
    expect(k.locks.at(-1), 'locked again').toBe(true);
    expect(k.page.ownPose()?.clip, 'the hold, not the reversed clip').toBe(TURRET_HOLD_CLIP);
    expect(k.tick(), 'the hold places the body again').toBe(true);
    expect(Math.hypot(k.w.state.x - holdPlace(PLACE, k.w.state.yaw)[0], k.w.state.z - holdPlace(PLACE, k.w.state.yaw)[2])).toBeLessThan(1e-6);
  });
});

/**
 * LATER 109 (research 215 s7.9; reading, pending review): this page's own predicted release plays the reversed clip's travel
 * on its own mover as the room does -- one step on each command it sends above the dismount's `seq` (the room takes the
 * release on the first command above it), the 16 steps of `TURRET_RELEASE_TRAVEL_READING` laid with no collision, the 17th
 * the set's return -- and keeps the walk locked through that 17th (`TURRET_RELEASE_STICK_PLACEHOLDER`: the stick moves
 * nothing until the set returns), unlocked from the 18th. No game data: a synthetic clip leaning 3.4 over 26 keys.
 */
describe("LATER 109: the own release's reversed clip on the page's own mover (no game data)", () => {
  const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const AFTER = 40, KEYS = 26, P = 0.3, E = 25 / 26;
  const SHAPE: MountShape = (() => {
    const root = new Float32Array(KEYS * 3);
    for (let k = 0; k < KEYS; k++) root.set([0.002 * k, 11 - k / 50, -0.8 - (3.4 * k) / 25], k * 3);
    return { clip: 'seal_stand2turret', refPt: [-3.31, -2.526, 7.655], root, keys: KEYS, seconds: P * E * E };
  })();

  function keyed(to: number, shape: MountShape | null = SHAPE) {
    let now = 0, seq = AFTER;
    const sent: ClientEvent[] = [], locks: boolean[] = [];
    const look = { yaw: 0, pitch: 0 };
    const page = new TurretPage({
      turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => look, setLook: (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; },
      setLocked: (on) => locks.push(on), bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => seq }),
      clips: () => ({
        clips: [{ name: 'seal_stand2turret', frameCount: KEYS }, { name: 'seal_p_stand2turret', frameCount: KEYS }, { name: 'seal_turret_poses', frameCount: 3 }],
        table: [['seal_stand2turret', { playback: P }], ['seal_p_stand2turret', { playback: P }], ['seal_turret_poses', { playback: 1 }]],
      }),
      mountShape: () => shape,
      now: () => now,
    });
    const w = { state: { x: 0, y: 0, z: 8.5, yaw: 0, vx: 0, vz: 0, pitch: 0 }, grid: groundGrid(packGround(PARAMS, [FLOOR], OWNERS)) };
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: AFTER } });
    const tick = (): boolean => { const placed = page.holdTick(w); seq++; now += 1 / TICK_HZ; return placed; };
    while (seq < to) tick();
    return { page, w, sent, locks, tick, seq: () => seq };
  }

  it("on each command above the dismount's seq the own mover steps the reversed clip's travel -- minus the root's velocity at the reversed phase, turned by its yaw, with no collision -- 16 of them, nothing on the 17th; the walk locked through the 17th and let go after it", () => {
    const k = keyed(AFTER + 75);
    const hold = holdPlace(PLACE, k.w.state.yaw);
    expect(Math.hypot(k.w.state.x - hold[0], k.w.state.z - hold[2]), "held on the hold's place").toBeLessThan(1e-6);
    expect(k.page.action()).toBe(true);
    const dseq = k.seq();
    expect(k.sent.at(-1)).toEqual({ type: 'dismount', seq: dseq, turret: 0 });
    expect(k.page.mounted(), 'released at the press').toBeNull();
    expect(k.locks.at(-1), 'the walk still locked at the press').toBe(true);
    const yaw = k.w.state.yaw * (Math.PI / 180), c = Math.cos(yaw), s = Math.sin(yaw), dt = 1 / TICK_HZ;
    let x = k.w.state.x, z = k.w.state.z;
    for (let j = 1; j <= 16; j++) {
      k.tick();                                                        // the command dseq + j
      const v = mountRootVelocity(SHAPE, Math.max(0, E - (j * dt) / (P * E)));
      x -= (v[0] * c + v[2] * s) * dt; z -= (-v[0] * s + v[2] * c) * dt;
      expect(Math.hypot(k.w.state.x - x, k.w.state.z - z), `command dseq + ${j}`).toBeLessThan(1e-9);
      expect(k.locks.at(-1), `locked on dseq + ${j}`).toBe(true);
    }
    expect(Math.hypot(k.w.state.x - hold[0], k.w.state.z - hold[2]), 'carried back').toBeGreaterThan(3);
    const end = [k.w.state.x, k.w.state.z];
    k.tick();                                                          // dseq + 17: the set's return
    expect([k.w.state.x, k.w.state.z], 'nothing on the 17th').toEqual(end);
    expect(k.locks.at(-1), 'let go after the 17th').toBe(false);
    expect(k.locks.filter((on) => !on), 'unlocked once').toHaveLength(1);
    k.tick();
    expect([k.w.state.x, k.w.state.z], 'nothing after').toEqual(end);
  });

  it("a told refusal (`refused: 'mounting'`) ends the own travel and its lock with the prediction: held again, the hold placing the body", () => {
    const k = keyed(AFTER + 75);
    expect(k.page.action()).toBe(true);
    k.tick(); k.tick();
    k.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, refused: 'mounting' } as ServerEvent);
    expect(k.page.mounted()).toBe(0);
    expect(k.locks.at(-1)).toBe(true);
    // The review's F5: every place laid on the mover on the tick after the refusal is the hold's -- none of the travel's
    // (with the travel left running, its lay and its step put the body on the travel's path before the hold places it).
    const hold = holdPlace(PLACE, k.w.state.yaw);
    const laid: number[] = [];
    const state = k.w.state, raw = { ...state };
    Object.defineProperty(state, 'x', { get: () => raw.x, set: (v: number) => { raw.x = v; laid.push(v); }, configurable: true });
    expect(k.tick(), 'the hold places the body').toBe(true);
    expect(laid.length, 'the hold laid the body').toBeGreaterThan(0);
    expect(laid.map((x) => Math.abs(x - hold[0]) < 1e-9), 'no travel laid on the tick after the refusal').toEqual(laid.map(() => true));
    expect(Math.hypot(k.w.state.x - hold[0], k.w.state.z - hold[2])).toBeLessThan(1e-6);
  });

  it("the review's F1: the own knock (the room's `blast` with a knock) ends the own travel -- the original's knock pops the clip and zeroes the root's velocity (FUN_0057e770 -> FUN_0058a4d0 D:L440997; D:L438987-438994): no travel laid after it, the walk let go", () => {
    const k = keyed(AFTER + 75);
    expect(k.page.action()).toBe(true);
    for (let j = 0; j < 4; j++) k.tick();
    k.page.event({ type: 'blast', ring: null, knock: { velocity: [60, 40, 0], fall: 'fallBackwards' }, after: k.seq() } as ServerEvent);
    expect(k.locks.at(-1), 'the walk let go at the knock').toBe(false);
    k.w.state.x += 2;                                                // the knock's own move this tick (the walker's)
    const at = [k.w.state.x, k.w.state.z];
    k.tick();
    expect([k.w.state.x, k.w.state.z], 'no travel laid after the knock').toEqual(at);
  });

  it("the review's F3: the own death (the room's `kill` naming this page) ends the own travel: no travel laid after it", () => {
    const k = keyed(AFTER + 75);
    expect(k.page.action()).toBe(true);
    for (let j = 0; j < 4; j++) k.tick();
    k.page.event({ type: 'kill', killer: null, victim: 1, weapon: null, how: 'fall', clip: null } as ServerEvent);
    k.w.state.x += 2;                                                // the corpse's own move this tick
    const at = [k.w.state.x, k.w.state.z];
    k.tick();
    expect([k.w.state.x, k.w.state.z], 'no travel laid after the death').toEqual(at);
  });
});

/**
 * LATER 137 (research 215 s7.10; reading, pending review): the original's online press asks the network library for the
 * turret (`FUN_00546210` D:L412075-412084 -> `FUN_002c79f0` D:L167867-167869) only when the manager's millisecond clock has
 * reached the last ask's + 2000 -- one window for every turret (`DAT_004415d8`), opened by each ask sent, cleared when a
 * turret object is made on the console (`FUN_002c7e60` D:L168044-168051); a refused repeat does nothing.
 */
describe("LATER 137: the online mount's repeat window (TURRET_MOUNT_ASK_WINDOW_READING; FUN_002c79f0 D:L167867-167869)", () => {
  const SPOT = {
    id: 0, name: 'synthetic', origin: [0, 0, 0], facing: 0, gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -9.7],
    limits: { yaw: [(-70 * Math.PI) / 180, (70 * Math.PI) / 180], pitch: [(-45 * Math.PI) / 180, (45 * Math.PI) / 180] },
    mountRange: 22, mountAngleCos: Math.cos((35 * Math.PI) / 180), parts: { turret: 't', gun: 'g', firepoint: 'f' },
  } as unknown as TurretPlacement;
  /** A player's page in reach of `SPOT` and facing its way, on a clock (seconds) the test moves with its command count. */
  const rig = () => {
    let now = 100, seq = 10;
    const sent: ClientEvent[] = [];
    const page = new TurretPage({
      turrets: () => [SPOT], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
      setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => seq }),
      now: () => now,
    });
    const mounts = (): ClientEvent[] => sent.filter((e) => e.type === 'mount');
    return { page, sent, mounts, advance: (s: number) => { now += s; seq += Math.round(s * TICK_HZ); } };
  };

  it('the window is the read 2000 ms of the library clock, in seconds', () => {
    expect(TURRET_MOUNT_ASK_WINDOW_READING).toBe(2);
  });

  it('the first press sends its mount, unchanged', () => {
    const r = rig();
    expect(r.page.target()).toBe(0);
    expect(r.page.action()).toBe(true);
    expect(r.sent).toEqual([{ type: 'mount', seq: 10, turret: 0, word: true }]);
  });

  it("a second press within the window sends nothing -- the press still the turret's (true), the prompt unchanged", () => {
    const r = rig();
    r.page.action();
    r.advance(0.5);
    expect(r.page.action(), 'kept by the turret: no door or switch takes it').toBe(true);
    r.advance(1.49);
    expect(r.page.action()).toBe(true);
    expect(r.mounts(), 'one mount only (was three)').toHaveLength(1);
    expect(r.page.prompt(), 'the mount prompt stays: the gates, not the window, set it').toBe('turret_mount');
  });

  it('a press at the window\'s end or after it sends again (`DAT_004415d8 <=` the clock)', () => {
    const r = rig();
    r.page.action();
    r.advance(2);
    expect(r.page.action()).toBe(true);
    expect(r.mounts()).toHaveLength(2);
    expect(r.mounts()[1]).toEqual({ type: 'mount', seq: 130, turret: 0, word: true });
  });

  it('one window for every ask, opened only by a mount sent, running across the mount and its release: a quick remount is not sent', () => {
    const r = rig();
    r.page.action();                                                           // asked at 100
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });           // the room's mount
    r.advance(1.25);                                                           // steps exact in binary, so 2.0 s is 2.0
    expect(r.page.action()).toBe(true);                                        // the dismount (offered at 1.25 s: LATER 151)
    expect(r.sent.at(-1)?.type).toBe('dismount');
    r.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });        // the room's release
    r.advance(0.5);                                                            // 1.75 s after the ask (LATER 151: was 1.25)
    expect(r.page.mounted()).toBeNull();
    expect(r.page.action()).toBe(true);
    expect(r.mounts(), 'the quick remount not sent').toHaveLength(1);
    r.advance(0.25);                                                           // 2.0 s after the ask
    expect(r.page.action()).toBe(true);
    expect(r.mounts()).toHaveLength(2);
  });

  it('the window cleared at a welcome (the turret objects made again, FUN_002c7e60 D:L168044-168051): the next press sends', () => {
    const r = rig();
    r.page.action();
    r.page.event({ type: 'welcome', map: 'm', turrets: [] } as unknown as ServerEvent);
    r.advance(0.1);
    expect(r.page.action()).toBe(true);
    expect(r.mounts()).toHaveLength(2);
  });
});

/**
 * LATER 151 (research 215 s7.11; reading, pending review): online the release (action 20) is offered only from 1250 ms
 * after the mount (`FUN_005463c0` D:L412209-412213 sets `+0x22c`; `FUN_005a8850` D:L462975-462993 at `FUN_005937c0`
 * D:L452334-452338) -- before then no `action_dismount_turret` prompt, and the press runs no release (`FUN_00592d50`
 * D:L452078-452087). The page judges on the count the room does: 75 commands (1.25 s at 60 Hz) above its own mount's
 * `after`; a mount dated by a clock, 1.25 s from its `at`; a welcome's (held already) at once.
 */
describe('LATER 151: the release offered 1.25 s after the mount (FUN_005a8850 D:L462975-462993; no game data)', () => {
  const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const AFTER = 40;

  /** LATER 104's rig: player 1 mounted on `PLACE` by a broadcast keyed on `after` 40, its own clip stepped to command `to`. */
  const keyed = (to: number) => {
    let now = 0, seq = AFTER;
    const sent: ClientEvent[] = [];
    const look = { yaw: 0, pitch: 0 };
    const page = new TurretPage({
      turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => look, setLook: (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; },
      setLocked: () => undefined, bodyLook: (id) => (id === 1 ? { yaw: 30, pitch: 0 } : null), move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => seq }),
      clips: () => ({
        clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
        table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
      }),
      now: () => now,
    });
    const w = { state: { x: 0, y: 0, z: 8.5, yaw: 0, vx: 0, vz: 0, pitch: 0 }, grid: groundGrid(packGround(PARAMS, [FLOOR], OWNERS)) };
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: AFTER } });
    while (seq < to) { page.holdTick(w); seq++; now += 1 / TICK_HZ; }
    return { page, dismounts: () => sent.filter((e) => e.type === 'dismount') };
  };

  it("at after + 30 (0.5 s) and after + 74: no dismount prompt, and a press sends nothing -- kept by the turret (true), still held", () => {
    for (const k of [30, 74]) {
      const r = keyed(AFTER + k);
      expect(r.page.prompt(), `after + ${k}: no prompt`).toBeNull();
      expect(r.page.action(), `after + ${k}: the press the turret's`).toBe(true);
      expect(r.dismounts(), `after + ${k}: nothing sent`).toHaveLength(0);
      expect(r.page.mounted(), `after + ${k}: still held`).toBe(0);
    }
  });

  it('at after + 75 (1.25 s): the prompt, and the press sends the dismount at its seq, the release predicted (LATER 104)', () => {
    const r = keyed(AFTER + 75);
    expect(r.page.prompt()).toBe('turret_dismount');
    expect(r.page.action()).toBe(true);
    expect(r.dismounts()).toEqual([{ type: 'dismount', seq: AFTER + 75, turret: 0 }]);
    expect(r.page.mounted(), 'predicted').toBeNull();
  });

  it('a mount dated by its arrival (a room that sends no steer): the clock -- nothing at 1.0 s, the prompt and the send at 1.25 s', () => {
    let now = 5, seq = 10;
    const sent: ClientEvent[] = [];
    const page = new TurretPage({
      turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
      setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => seq }),
      now: () => now,
    });
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    now += 1; seq += 60;
    expect(page.prompt()).toBeNull();
    expect(page.action()).toBe(true);
    expect(sent.filter((e) => e.type === 'dismount')).toHaveLength(0);
    now += 0.25; seq += 15;                                                    // 1.25 s: exact in binary
    expect(page.prompt()).toBe('turret_dismount');
    expect(page.action()).toBe(true);
    expect(sent.filter((e) => e.type === 'dismount')).toHaveLength(1);
  });

  /**
   * LATER 151's review F1 (the merge controller's choice (b), page-only): a welcome's own mount carries no `steer` / `after`
   * (a reconnect inside the wait), so its release's wait runs from the welcome's ARRIVAL -- never earlier than the room's
   * `seatOff`, the mount having been taken before the welcome. Its pose stays the hold (no mount clip replayed). The exact
   * fix (the resume carrying the mount's `after`) is LATER 154.
   */
  const welcomed = () => {
    let clock = 10;
    const sent: ClientEvent[] = [];
    const page = new TurretPage({
      turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
      setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => 3 }),
      clips: () => ({
        clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
        table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
      }),
      now: () => clock,
    });
    page.event({ type: 'welcome', map: 'm', turrets: [{ id: 0, occupant: 1, ammo: 750 }] } as unknown as ServerEvent);
    return { page, dismounts: () => sent.filter((e) => e.type === 'dismount'), advance: (s: number) => { clock += s; } };
  };

  it("the review's F1: a resumed mount (the welcome, then the room's resume with no steer) shows no dismount prompt and sends nothing at + 0.5 s after the welcome, and offers at 1.25 s; its pose the hold throughout", () => {
    const w = welcomed();
    w.page.event({ type: 'resume', id: 1, at: [0, 0, 8.5], yaw: 0, posture: 'stand', seq: 100, health: [], armour: [], loadout: [],
      rounds: [[], []], pouch: {}, weapon: 0, held: null, turret: 0 } as unknown as ServerEvent);
    expect(w.page.mounted(), 'held').toBe(0);
    expect(w.page.ownPose()?.clip, 'the hold, no mount clip replayed').toBe(TURRET_HOLD_CLIP);
    w.advance(0.5);
    expect(w.page.prompt(), '+ 0.5 s: no prompt').toBeNull();
    expect(w.page.action(), "+ 0.5 s: the press the turret's").toBe(true);
    expect(w.dismounts(), '+ 0.5 s: nothing sent').toHaveLength(0);
    expect(w.page.mounted(), '+ 0.5 s: still held').toBe(0);
    w.advance(0.75);                                                           // 1.25 s after the welcome: exact in binary
    expect(w.page.prompt()).toBe('turret_dismount');
    expect(w.page.action()).toBe(true);
    expect(w.dismounts()).toHaveLength(1);
  });

  // Rewritten by LATER 151's review F1 (was: "a welcome's mount (held already, its mount long past) offers the release at
  // once" -- a design choice now reversed: a welcome's mount carries no `after`, so the page cannot know the mount is past).
  it("a welcome's mount (held already, no after) waits 1.25 s from the welcome's arrival: no prompt and nothing sent at once or at 1.0 s, the prompt and the send at 1.25 s", () => {
    const w = welcomed();
    expect(w.page.prompt(), 'at once: no prompt').toBeNull();
    expect(w.page.action()).toBe(true);
    expect(w.dismounts(), 'at once: nothing sent').toHaveLength(0);
    w.advance(1);
    expect(w.page.prompt(), '1.0 s: no prompt').toBeNull();
    w.advance(0.25);
    expect(w.page.prompt()).toBe('turret_dismount');
    expect(w.page.action()).toBe(true);
    expect(w.dismounts()).toHaveLength(1);
  });

  /**
   * LATER 154 (research 215 s7.11; reading, pending review): the room's resume carries its window end (`seatOff`, the mount's
   * `after` + 75 in this page's numbering), so a resumed mount's release is offered from that command -- the room's own
   * count -- whatever the clock: neither 1.25 s from the welcome (`waitFrom`, LATER 151's F1) nor from a clock-dated mount.
   */
  const resumedAt = (seatOff: number, steer?: { ticks: number; toward: number }) => {
    let clock = 10, seq = 100;
    const sent: ClientEvent[] = [];
    const page = new TurretPage({
      turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
      setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => seq }),
      clips: () => ({
        clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
        table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
      }),
      now: () => clock,
    });
    page.event({ type: 'welcome', map: 'm', turrets: [{ id: 0, occupant: 1, ammo: 750 }] } as unknown as ServerEvent);
    page.event({ type: 'resume', id: 1, at: [0, 0, 8.5], yaw: 0, posture: 'stand', seq: 100, health: [], armour: [], loadout: [],
      rounds: [[], []], pouch: {}, weapon: 0, held: null, turret: 0, ...(steer ? { steer } : {}), seatOff } as unknown as ServerEvent);
    return {
      page, dismounts: () => sent.filter((e) => e.type === 'dismount'),
      at: (s: number, dt: number) => { seq = s; clock += dt; },
    };
  };

  it("LATER 154: a resume carrying seatOff offers the release at that command, whatever the clock -- nothing at seatOff - 1, the prompt and the send at seatOff 0.1 s after the welcome", () => {
    const r = resumedAt(106);
    r.at(105, 0.05);
    expect(r.page.prompt(), 'seatOff - 1: no prompt').toBeNull();
    expect(r.page.action(), "seatOff - 1: the press the turret's").toBe(true);
    expect(r.dismounts(), 'seatOff - 1: nothing sent').toHaveLength(0);
    r.at(106, 0.05);                                                           // 0.1 s after the welcome
    expect(r.page.prompt(), 'seatOff: the prompt').toBe('turret_dismount');
    expect(r.page.action()).toBe(true);
    expect(r.dismounts()).toEqual([{ type: 'dismount', seq: 106, turret: 0 }]);
  });

  it('LATER 154: past the wait at the resume (seatOff at or below the count): the release offered at once', () => {
    const r = resumedAt(90);
    expect(r.page.prompt()).toBe('turret_dismount');
    expect(r.page.action()).toBe(true);
    expect(r.dismounts()).toEqual([{ type: 'dismount', seq: 100, turret: 0 }]);
  });

  it('LATER 154: a resume mid-steer carrying seatOff keys on it, not on the clock -- nothing at seatOff - 1 two seconds on, offered at seatOff', () => {
    const r = resumedAt(160, { ticks: 6, toward: 20 });
    r.at(159, 2);
    expect(r.page.prompt(), 'seatOff - 1, 2 s on: no prompt').toBeNull();
    expect(r.page.action()).toBe(true);
    expect(r.dismounts(), 'seatOff - 1: nothing sent').toHaveLength(0);
    r.at(160, 1 / 60);
    expect(r.page.prompt(), 'seatOff: the prompt').toBe('turret_dismount');
    expect(r.page.action()).toBe(true);
    expect(r.dismounts()).toEqual([{ type: 'dismount', seq: 160, turret: 0 }]);
  });
});

/**
 * LATER 191 (research 215 s8.2): this page's own mount clip refuses its rounds while it plays -- the clip's bare `NoFire ()`
 * in motion.rdr (`seal_stand2turret`, `seal_p_stand2turret`), judged by the room's own `fireAllowed` over the table
 * (`room.ts` `aim`, LATER 173) -- on `turretPose`'s test of the play: a mount keyed on `after` by its steer's count, else the clock.
 */
describe('LATER 191: the own mount clip refuses the page\'s turret rounds while it plays (no game data)', () => {
  const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const AFTER = 40;
  const page = (o: { noFire?: number | null; clock: { now: number }; seq?: { n: number } }) => new TurretPage({
    turrets: () => [PLACE], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
    setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
    net: () => ({ role: 'player', id: 1, send: () => undefined, lastSeq: () => o.seq?.n ?? 0 }),
    clips: () => ({
      clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
      table: [['seal_stand2turret', { playback: 0.3, noFire: o.noFire ?? null }], ['seal_p_stand2turret', { playback: 0.3, noFire: o.noFire ?? null }], ['seal_turret_poses', { playback: 1 }]],
    }),
    now: () => o.clock.now,
  });

  it('a mount dated by the clock: refused through the clip (its 16 ticks), open after it', () => {
    const clock = { now: 0 }, p = page({ noFire: 1, clock });
    p.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    expect(p.mounted()).toBe(0);
    expect(p.mountFireRefused(), 'at the mount').toBe(true);
    clock.now = 8 / TICK_HZ;
    expect(p.mountFireRefused(), 'mid-clip').toBe(true);
    clock.now = 17 / TICK_HZ;
    expect(p.mountFireRefused(), 'the clip off: the hold').toBe(false);
  });

  it('a clip without NoFire in the table is open (NOFIRE_ABSENT_READING); another body\'s mount refuses nothing here', () => {
    const clock = { now: 0 }, p = page({ noFire: null, clock });
    p.event({ type: 'turret', id: 0, occupant: 1, ammo: 750 });
    expect(p.mountFireRefused()).toBe(false);
    const q = page({ noFire: 1, clock: { now: 0 } });
    q.event({ type: 'turret', id: 0, occupant: 2, ammo: 750 });
    expect(q.mountFireRefused()).toBe(false);
  });

  // The merge controller's call (2026-10-20): a mount keyed on `after` is judged by the command its round names (`lastSeq`),
  // as the room decides -- refused on `after` + 1 through `after` + 16, open from `after` + 17 -- at any round trip.
  it("a keyed mount heard late (a long round trip): judged by the round's command, open past the room's 16, refused inside them", () => {
    const late = { now: 0 }, seqLate = { n: AFTER + 25 }, p = page({ noFire: 1, clock: late, seq: seqLate });
    p.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: AFTER } });
    expect(p.mountFireRefused(), 'after + 25, before any own step: the room fires it').toBe(false);
    const early = { now: 0 }, seqEarly = { n: AFTER + 5 }, q = page({ noFire: 1, clock: early, seq: seqEarly });
    q.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: AFTER } });
    expect(q.mountFireRefused(), 'after + 5: inside the clip').toBe(true);
    seqEarly.n = AFTER + 16;
    expect(q.mountFireRefused(), 'after + 16: the last refused').toBe(true);
    seqEarly.n = AFTER + 17;
    expect(q.mountFireRefused(), 'after + 17: open, before the page has stepped').toBe(false);
  });

  it('a mount keyed on `after`: refused while its own steer plays the clip, open from the command it comes off', () => {
    const clock = { now: 0 }, seq = { n: AFTER }, p = page({ noFire: 1, clock, seq });
    const w = { state: { x: 0, y: 0, z: 8.5, yaw: 0, vx: 0, vz: 0, pitch: 0 }, grid: groundGrid(packGround(PARAMS, [FLOOR], OWNERS)) };
    p.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: AFTER } });
    const tick = (): boolean => { const placed = p.holdTick(w); seq.n++; clock.now += 1 / TICK_HZ; return placed; };
    for (let i = 0; i < 4; i++) tick();
    expect(p.mountFireRefused(), 'four commands in').toBe(true);
    let placed = false;
    for (let i = 0; i < 40 && !placed; i++) placed = tick();
    expect(placed, 'the hold placed: the clip off').toBe(true);
    expect(p.mountFireRefused()).toBe(false);
  });
});

describe("LATER 175: no mount offered under the kit's lock (FUN_00593500 D:L452277 -> FUN_005a7de0 D:L462636; no game data)", () => {
  const SPOT = {
    id: 0, name: 'synthetic', origin: [0, 0, 0], facing: 0, gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -9.7],
    limits: { yaw: [(-70 * Math.PI) / 180, (70 * Math.PI) / 180], pitch: [(-45 * Math.PI) / 180, (45 * Math.PI) / 180] },
    mountRange: 22, mountAngleCos: Math.cos((35 * Math.PI) / 180), parts: { turret: 't', gun: 'g', firepoint: 'f' },
  } as unknown as TurretPlacement;

  it("while a reload's delay or clip or an after-shot holds the kit: no target, no prompt, the press not the turret's and nothing sent; once it ends, offered (was: offered and asked under the lock)", () => {
    let locked = true;
    const sent: ClientEvent[] = [];
    const page = new TurretPage({
      turrets: () => [SPOT], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
      setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => 10 }),
      now: () => 100, kitLocked: () => locked,
    });
    expect(page.target(), 'no target under the lock').toBeNull();
    expect(page.prompt(), 'no mount prompt under the lock').toBeNull();
    expect(page.action(), 'the press left to the walk').toBe(false);
    expect(sent, 'no mount asked').toEqual([]);
    locked = false;
    expect(page.target()).toBe(0);
    expect(page.prompt()).toBe('turret_mount');
    expect(page.action()).toBe(true);
    expect(sent).toEqual([{ type: 'mount', seq: 10, turret: 0, word: true }]);
  });
});

/**
 * P37 (the online-parity sweep's WK-7, class D: the page offered what the room refuses): the room refuses a mount while
 * the asker's traversal move holds the mover (`room.ts` `resolveMounts`, `p.sim.moves?.busy()` -> 'mount: busy', one of
 * MOUNT_GRANT_CHECKS_ADAPTATION's grant checks, research 215 s4); the page asks the same test of its own walk's moves
 * (`Traversal.busy`) before it offers. A synthetic ladder (traversal.test.ts's): on its rungs, no offer; at rest at the
 * same place, the offer. No game data.
 */
describe("P37: no mount offered while the walk's traversal move holds the mover (the room's 'mount: busy'; no game data)", () => {
  const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
  });
  const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
  /** traversal.test.ts's `ladderWorld`: a 40-high wall across x at z 0, a deck behind it, a ladder (appflags 2) on its face. */
  const ladderWorld = (): { grid: ReturnType<typeof buildGrid>; polys: WorldPoly[] } => {
    const polys = [
      floor(-100, 0, 100, 100, 0),
      floor(-100, -100, 100, 0, 40),
      quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
      quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
      quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    ];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
    return { grid: buildGrid(params, [], [], polys, owners), polys };
  };

  it("on a ladder's rungs (Traversal.busy) beside a free turret: no target, no prompt, the press not the turret's, nothing sent; at rest at the same place, offered", () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 20);
    w.state.yaw = 0;                                                 // facing -z, at the ladder
    for (let i = 0; i < 800 && t.state().kind !== 'ladder'; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(t.state().kind, 'on the rungs').toBe('ladder');
    expect(t.busy(), "the room's test: the move holds the mover").toBe(true);
    const feet: V3 = [w.state.x, w.state.y, w.state.z];
    // The turret 8.5 behind the feet along +z, facing the way the climber faces (as LATER 175's synthetic spot).
    const spot = {
      id: 0, name: 'synthetic', origin: [feet[0], feet[1], feet[2] - 8.5], facing: 0, gunOrigin: [0, 0, 0], firepointOrigin: [0, 0, -9.7],
      limits: { yaw: [(-70 * Math.PI) / 180, (70 * Math.PI) / 180], pitch: [(-45 * Math.PI) / 180, (45 * Math.PI) / 180] },
      mountRange: 22, mountAngleCos: Math.cos((35 * Math.PI) / 180), parts: { turret: 't', gun: 'g', firepoint: 'f' },
    } as unknown as TurretPlacement;
    let moves: Traversal = t;
    const sent: ClientEvent[] = [];
    const page = new TurretPage({
      turrets: () => [spot], feet: () => feet, look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
      setLocked: () => undefined, bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => 10 }),
      now: () => 100, moveBusy: () => moves.busy(),
    });
    expect(page.target(), 'no target on the rungs').toBeNull();
    expect(page.prompt(), 'no mount prompt on the rungs').toBeNull();
    expect(page.action(), 'the press left to the walk').toBe(false);
    expect(sent, 'no mount asked').toEqual([]);
    moves = new Traversal(grid, polys);                              // at rest: no move holds the mover, the same feet
    expect(moves.busy()).toBe(false);
    expect(page.target()).toBe(0);
    expect(page.prompt()).toBe('turret_mount');
    expect(page.action()).toBe(true);
    expect(sent).toEqual([{ type: 'mount', seq: 10, turret: 0, word: true }]);
  });
});

/**
 * A1, branch B (LATER 239, 217, 218, 243; research 215 s8.6 "A1"; no game data): the page's half of the mount's round
 * trip. The original's host grants a mount at once and the grant is every console's take (`FUN_0061e6d0`
 * D:L529427-529433 -> each peer `FUN_0061e7f0` D:L529455-529466 -> `FUN_002c7d00` D:L168019 -> `FUN_005463c0`): the
 * asker is on foot until it hears the grant. The room (branch A) reserves a worded ask at its command K and tells every
 * page (`turret`'s `reserved`); this page takes its own reservation on the next command it sends, M = `lastSeq() + 1`,
 * names it to the room (`mountTake`), and mounts from M (`after` = M - 1, LATER 96's catch-up zero). Another seat's
 * reservation shows the turret occupied, its clip, sound and gun drawn only from its take's broadcast.
 */
describe("A1: the mount word on the page -- the take at M, the re-key, another seat's reservation (no game data)", () => {
  const clips = (noFire: number | null = 1) => ({
    clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
    table: [['seal_stand2turret', { playback: 0.3, noFire }], ['seal_p_stand2turret', { playback: 0.3, noFire }], ['seal_turret_poses', { playback: 1 }]] as [string, { playback: number; noFire?: number | null }][],
  });
  /** `PLACE` with a firepoint (`firepointFrame`): another occupant's muzzle is drawn there once taken. */
  const SPOT = { ...PLACE, firepointMatrix: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -9.7, 1]) } as unknown as TurretPlacement;
  /** Player 1's page in reach of `SPOT`, its commands at `seq`, the take's two hooks recorded. */
  const rig = (o: { refused?: boolean; carried?: number | null } = {}) => {
    let now = 0, seq = 40;
    const sent: ClientEvent[] = [], heard: string[] = [], moved: string[] = [], locks: boolean[] = [], took: number[] = [];
    const untook: number[] = [];                                                 // LATER 525: the room's refusal of the take
    const retook: number[] = [];                                                 // LATER 525 (a): the room's take after M
    const bodies = new Map<number, { yaw: number; pitch: number }>([[7, { yaw: 20, pitch: 0 }]]);
    const page = new TurretPage({
      untook: () => { untook.push(seq); },
      retook: (m: number) => { retook.push(m); },
      turrets: () => [SPOT, { ...SPOT, id: 1, origin: [5000, 0, 5000] } as TurretPlacement], feet: () => [0, 0, 8.5], look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
      setLocked: (on) => locks.push(on), bodyLook: (id) => bodies.get(id) ?? null, move: (path) => moved.push(path),
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => seq }),
      sound: (name) => heard.push(name), clips: () => clips(), now: () => now,
      takeRefused: () => o.refused === true,
      took: (m) => { took.push(m); return o.carried ?? null; },
    });
    return {
      page, sent, heard, moved, locks, took, bodies, untook,
      retook,
      seq: () => seq, step: (n = 1) => { seq += n; now += n / TICK_HZ; },
      words: () => sent.filter((e) => e.type === 'mountTake'),
    };
  };

  it('the ask names its take (`word: true`); its own reservation heard, the take is sent at M = lastSeq() + 1 and this page mounts from M: held, locked, .GRAB_TURRET once, `took` once with M, no `mountTaken` to re-derive', () => {
    const r = rig();
    expect(r.page.action()).toBe(true);
    expect(r.sent).toEqual([{ type: 'mount', seq: 40, turret: 0, word: true }]);
    r.step(3);                                                                   // the round trip: three commands on foot
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect(r.words()).toEqual([{ type: 'mountTake', seq: 44, turret: 0 }]);
    expect(r.took).toEqual([44]);
    expect(r.page.mounted()).toBe(0);
    expect(r.locks).toEqual([true]);
    expect(r.heard.filter((n) => n === TURRET_SOUNDS.mount)).toHaveLength(1);
    expect(r.page.mountTaken(), 'a worded mount: nothing to re-derive (LATER 237 kept for an older room)').toBeNull();
    // The room's take (`steer.after` M - 1): nothing drawn or heard again, nothing re-keyed.
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 43 } });
    expect(r.heard.filter((n) => n === TURRET_SOUNDS.mount)).toHaveLength(1);
    expect([r.page.mounted(), r.took.length, r.words().length]).toEqual([0, 1, 1]);
  });

  it("the own clip keyed on M - 1: refused through M .. M + 15 by the round's command, open from M + 16; the release offered from M - 1 + 75", () => {
    const r = rig();
    r.page.action(); r.step(3);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });   // M = 44
    expect(r.page.mountFireRefused(), "a round in this frame names M (claimSeq), the clip's first step").toBe(true);
    r.step(16);                                                                  // lastSeq 59 = after + 16: the last refused
    expect(r.page.mountFireRefused()).toBe(true);
    r.step(1);                                                                   // 60 = after + 17: the hold's
    expect(r.page.mountFireRefused()).toBe(false);
    r.step(43 + 74 - 60);                                                        // lastSeq after + 74
    expect(r.page.prompt(), "inside the release's wait").toBeNull();
    r.step(1);
    expect(r.page.prompt()).toBe('turret_dismount');
  });

  it("in a frame that sends no command after the take, the turret's R and its round name M, never before it (claimSeq)", () => {
    const r = rig();
    r.page.action(); r.step(3);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect(r.page.claimSeq()).toBe(44);
    expect(r.page.reload()).toBe(true);
    expect(r.sent.at(-1)).toEqual({ type: 'reload', seq: 44 });
    r.step(2);
    expect(r.page.claimSeq(), 'from M on, lastSeq').toBe(45);
  });

  it("its own refusal (dead, a knock-down fall): the word still sent, nothing taken here -- no hold, no sound, no `took`; the room's release frees the wire silently", () => {
    const r = rig({ refused: true });
    r.page.action(); r.step(2);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect(r.words()).toEqual([{ type: 'mountTake', seq: 43, turret: 0 }]);
    expect([r.page.mounted(), r.took, r.locks, r.heard]).toEqual([null, [], [], []]);
    expect(r.page.occupant(0)).toBe(1);
    r.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });           // the room's 'mount: fall'
    expect([r.page.occupant(0), r.page.mounted(), r.heard]).toEqual([null, null, []]);
  });

  it("a late take (the room took on another command than M: a word late, a command lost, the bound) is re-keyed on the room's `steer.after`", () => {
    const run = (rekey: boolean) => {
      const r = rig();
      r.page.action(); r.step(3);
      r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });   // M = 44, after 43
      r.step(5);                                                                 // lastSeq 48
      expect(r.page.claimSeq()).toBe(48);
      if (rekey) {
        r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 50 } });
        expect(r.page.claimSeq(), 'the room took before 51: no claim named before it').toBe(51);
      }
      r.step(12);                                                                // lastSeq 60: 43 + 17, 50 + 10
      const at60 = r.page.mountFireRefused();
      r.step(7);                                                                 // 67: 50 + 17
      return { at60, at67: r.page.mountFireRefused(), sounds: r.heard.filter((n) => n === TURRET_SOUNDS.mount).length };
    };
    expect(run(true), 're-keyed on 50: inside the clip at 60, off at 67, one sound').toEqual({ at60: true, at67: false, sounds: 1 });
    expect(run(false), 'the control, keyed on M - 1 = 43: off at 60').toEqual({ at60: false, at67: false, sounds: 1 });
  });

  it("the kit's timer carried at the take (LATER 218) holds the turret's trigger through its end, until the room's first tell", () => {
    const r = rig({ carried: 44 + 30 });
    r.page.action(); r.step(3);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    expect(r.page.reloading()).toBe(true);
    r.step(74 - 43);                                                             // lastSeq 74: a round names 74, the carried end
    expect(r.page.reloading()).toBe(true);
    r.step(1);                                                                   // 75
    expect(r.page.reloading()).toBe(false);
    const s = rig({ carried: 44 + 30 });
    s.page.action(); s.step(3);
    s.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    s.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, mags: { rounds: [250, 250, 250], current: 0, reloading: false } });
    expect(s.page.reloading(), "the room's tell is the word").toBe(false);
  });

  it("another seat's reservation: occupied (no prompt, no target) but nothing drawn or heard -- no clip, no sound, the gun not turned; its take draws and sounds it", () => {
    const r = rig();
    r.page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750, reserved: true });
    expect([r.page.target(), r.page.prompt(), r.page.occupant(0)]).toEqual([null, null, 7]);
    r.page.frame();
    expect([r.heard, r.page.turretPose(7), r.moved, r.page.muzzleOf(7)]).toEqual([[], null, [], null]);
    expect(r.words(), "another's reservation: no word from this page").toEqual([]);
    r.page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750, steer: { ticks: 0, after: 90 } });
    expect(r.heard).toEqual([TURRET_SOUNDS.mount]);
    expect(r.page.turretPose(7)?.clip).toBe('seal_stand2turret');
    r.page.frame();
    expect(r.moved).toEqual(['g']);
    expect(r.page.muzzleOf(7)).not.toBeNull();
  });

  it("another seat's reservation released (its take refused, a death, a leave): nothing drawn or heard at either end", () => {
    const r = rig();
    r.page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750, reserved: true });
    r.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    r.page.frame();
    expect([r.heard, r.page.turretPose(7), r.moved, r.page.occupant(0)]).toEqual([[], null, [], null]);
    expect(r.page.target()).toBe(0);
  });

  it('a welcome naming a reservation: occupied, no pose, nothing heard; its take draws it', () => {
    const r = rig();
    r.page.event({ type: 'welcome', map: 'm', turrets: [{ id: 0, occupant: 7, ammo: 750, reserved: true }] } as unknown as ServerEvent);
    r.page.frame();
    expect([r.page.occupant(0), r.page.turretPose(7), r.heard, r.moved]).toEqual([7, null, [], []]);
    r.page.event({ type: 'turret', id: 0, occupant: 7, ammo: 750, steer: { ticks: 0, after: 90 } });
    expect(r.heard).toEqual([TURRET_SOUNDS.mount]);
    expect(r.page.turretPose(7)).not.toBeNull();
  });

  // The fresh review's fold 2 (the build's deviation 2 from the cleared hunk): a welcome naming this page's own seat as the
  // reserved occupant (a reservation heard late: a reconnect inside the trip) is no take -- nothing drawn, heard or held,
  // and no word sent from a welcome; the room's take (on the bound) draws and holds it then.
  it("a welcome naming this page as the reserved occupant: no clip, no sound, no hold and no lock, no word; the room's take draws and holds it", () => {
    const r = rig();
    r.page.event({ type: 'welcome', map: 'm', turrets: [{ id: 0, occupant: 1, ammo: 750, reserved: true }] } as unknown as ServerEvent);
    r.page.frame();
    expect([r.page.mounted(), r.page.ownPose(), r.page.turretPose(1), r.heard, r.locks, r.moved, r.words(), r.took]).toEqual([null, null, null, [], [], [], [], []]);
    expect([r.page.occupant(0), r.page.target()], 'occupied: no target').toEqual([1, null]);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 160 } });
    expect([r.page.mounted(), r.heard, r.locks]).toEqual([0, [TURRET_SOUNDS.mount], [true]]);
    expect(r.page.ownPose()?.clip).toBe('seal_stand2turret');
  });

  it("an older room (the take with no reservation, taken at the ask): today's path -- held at the broadcast, keyed on its `after`, `mountTaken` for the re-derive, no word sent", () => {
    const r = rig();
    r.page.action(); r.step(3);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 40 } });
    expect([r.page.mounted(), r.words(), r.took]).toEqual([0, [], []]);
    expect(r.page.mountTaken()).toEqual({ after: 40, now: 43 });
    expect(r.page.claimSeq(), 'lastSeq').toBe(43);
  });

  // LATER 525 (research 215 section 8.6, "A1"): the room refuses a worded take on its own terms -- dead, the round over, a
  // knock-down fall on top (`room.ts` `takeMount`, `FUN_005463c0` D:L412134-412139, `FUN_00588030` D:L445700-445713) --
  // and releases the turret, every page told (`FUN_002c7a60(turret, 1)` D:L412167-412186 -> each peer `FUN_00545ee0`).
  // The release's sound and clip run only for a body holding the turret (`FUN_00545ee0` D:L411967: `+0xeb8`, set only at
  // the take's end, D:L412315), so a refused take shows none. The page took at send time; it hears the refusal as the
  // turret freed before the room's take broadcast (occupant this page, no `reserved`) ever came: its take is undone.
  it('RED: LATER 525 -- the room refuses the send-time take (freed before its take is heard): the mount undone, no release clip or sound, the lock let go, `untook` once', () => {
    const r = rig();
    r.page.action(); r.step(3);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });   // M = 44: taken here
    r.step(2);
    r.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });           // the room's 'mount: fall' (or 'not alive')
    expect(r.heard.filter((n) => n === TURRET_SOUNDS.release), 'no release sound').toEqual([]);   // today: one
    expect(r.page.ownPose(), 'no release clip').toBeNull();                                       // today: the reversed clip
    expect(r.page.turretPose(1)).toBeNull();
    expect([r.page.mounted(), r.page.occupant(0), r.locks]).toEqual([null, null, [true, false]]);
    expect(r.untook, 'the walk told once: its flinch restored, M cleared').toEqual([45]);          // today: []
  });

  it('LATER 525 (a pin) -- a granted take (its broadcast heard), then the room releases it (a death, the round): the release drawn and heard as before, no `untook`', () => {
    const r = rig();
    r.page.action(); r.step(3);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 43 } });   // the room's take
    r.step(2);
    r.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    expect(r.heard.filter((n) => n === TURRET_SOUNDS.release)).toHaveLength(1);
    expect(r.page.ownPose()).not.toBeNull();
    expect([r.page.mounted(), r.locks, r.untook]).toEqual([null, [true, false], []]);
  });

  it("LATER 525 (a pin) -- this page's own release pressed after a granted take: a normal release, no `untook`", () => {
    const r = rig();
    r.page.action(); r.step(3);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: 43 } });
    r.step(80);                                                                  // past the release's wait (43 + 75)
    expect(r.page.action()).toBe(true);
    expect(r.sent.at(-1)).toMatchObject({ type: 'dismount', turret: 0 });
    r.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });
    expect(r.heard.filter((n) => n === TURRET_SOUNDS.release)).toHaveLength(1);
    expect([r.page.mounted(), r.untook]).toEqual([null, []]);
  });

  it("LATER 525 (a pin) -- another seat's mount and release on another turret, between the send-time take and its broadcast: this page's mount untouched, no `untook`", () => {
    const r = rig();
    r.page.action(); r.step(3);
    r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });
    r.page.event({ type: 'turret', id: 1, occupant: 7, ammo: 750, steer: { ticks: 0, after: 90 } });
    r.page.event({ type: 'turret', id: 1, occupant: null, ammo: 750 });
    expect([r.page.mounted(), r.locks, r.untook]).toEqual([0, [true], []]);
    r.page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });           // its own refusal still undoes it
    expect([r.page.mounted(), r.untook]).toEqual([null, [43]]);
  });

  // LATER 525 (a): the room's take broadcast naming a later command than this page's M (a late word, the bound: `room.ts`
  // `mountWord`, `resolveMounts`) hands the walk the room's take command (`steer.after` + 1) for its flinch's M.
  it('RED: LATER 525 (a) -- the take broadcast names a later command (after 47, M 44): `retook` once with 48; at M itself, none', () => {
    const run = (after: number): number[] => {
      const r = rig();
      r.page.action(); r.step(3);
      r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, reserved: true });   // M = 44
      r.step(5);
      r.page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after } });
      expect(r.page.mounted(), `${after}`).toBe(0);
      return r.retook;
    };
    expect(run(47), "the room's late take").toEqual([48]);                                // today: []
    expect(run(43), 'the take at M').toEqual([]);
  });
});
